/**
 * Backend-прокси для Finam Trade API (тариф «Про»).
 *
 * Назначение: предоставить frontend-приложению (index.html) обновление цен
 * в реальном времени (без задержки) через Finam Trade API
 * (https://api.finam.ru/getting-started/).
 *
 * Finam Trade API требует секретный токен (FINAM_API_SECRET) и на его основе
 * выдаёт короткоживущий JWT-токен (15 минут). Браузер не может обращаться к API
 * напрямую: секрет нельзя хранить на клиенте, а JWT нужно регулярно перевыпускать.
 * Поэтому используется backend-прокси, который:
 *   1) хранит секрет на своей стороне (server/.env, в .gitignore);
 *   2) обменивает секрет на JWT (POST /v1/sessions) и перевыпускает его при протухании;
 *   3) получает котировку в реальном времени (GET /v1/instruments/{symbol}/quotes/latest);
 *   4) отдаёт браузеру простой JSON в том же формате, что и MoexPriceService
 *      из index.html: { prices, lotSizes, errors }.
 *
 * Контракт с frontend НЕ менялся: index.html по-прежнему обращается к адресу,
 * заданному константой TBANK_PROXY_URL (сервер слушает тот же порт 8787),
 * поэтому вся остальная логика приложения работает как раньше.
 *
 * Запуск:
 *   cd server && npm install && npm start
 */

require('dotenv').config();
const express = require('express');

// ----------------------------------------------------------------------------
// Константы / конфигурация
// ----------------------------------------------------------------------------

/** Базовый URL Finam Trade API (REST) */
const FINAM_API_BASE = 'https://api.finam.ru';
/** Секретный токен Finam Trade API (см. server/.env) */
const FINAM_API_SECRET = (process.env.FINAM_API_SECRET || '').trim();
/** Порт, на котором слушает прокси (настраивается через server/.env) */
const PORT = Number(process.env.PORT) || 8787;
/** Таймаут одного HTTP-запроса к Finam API (мс) */
const FINAM_REQUEST_TIMEOUT_MS = 15000;
/** JWT Finam живёт 15 минут; перевыпускаем заранее за 1 минуту до истечения */
const JWT_TTL_MS = 15 * 60 * 1000;
const JWT_REFRESH_BEFORE_MS = 60 * 1000;
/** Срок жизни кэша каталога инструментов и размера лота (мс) */
const CATALOG_TTL_MS = 60 * 60 * 1000;
const LOT_CACHE_TTL_MS = 60 * 60 * 1000;
/** Предохранитель от бесконечной пагинации каталога */
const CATALOG_MAX_PAGES = 500;

// ----------------------------------------------------------------------------
// Обход корпоративного TLS-перехвата (только для локальной разработки).
//
// В сетях, где трафик проходит через SSL-inspecting прокси (антивирус / DLP),
// сертификат api.finam.ru может определяться как самоподписанный, и HTTPS-запросы
// не проходят. Для таких случаев можно временно отключить проверку сертификата,
// задав в server/.env:
//
//   FINAM_TLS_INSECURE=1
//
// ВНИМАНИЕ: это отключает проверку сертификата для всех исходящих HTTPS-запросов
// процесса и делает соединение уязвимым к MITM. Использовать только локально.
// ----------------------------------------------------------------------------
if (process.env.FINAM_TLS_INSECURE === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('FINAM_TLS_INSECURE=1: проверка TLS-сертификата отключена (только для разработки)');
}

const app = express();

// ----------------------------------------------------------------------------
// CORS: разрешаем браузерному приложению (index.html) вызывать этот прокси
// ----------------------------------------------------------------------------
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ----------------------------------------------------------------------------
// Управление JWT-токеном Finam Trade API
// ----------------------------------------------------------------------------

/** Текущий JWT-токен (null — ещё не получен / протух) */
let accessToken = null;
/** Момент (мс) истечения текущего JWT */
let accessTokenExpiresAt = 0;

/**
 * Класс ошибки HTTP-ответа Finam API.
 * @param {number} status - HTTP-статус ответа
 * @param {string} [body] - Тело ответа (обычно JSON с полями code/message)
 */
class HttpError extends Error {
  constructor(status, body) {
    super(`Finam API HTTP ${status}`);
    this.status = status;
    this.body = body || '';
  }
}

/**
 * Получить актуальный JWT-токен, при необходимости перевыпустив его из секрета.
 * @returns {Promise<string>} JWT-токен
 * @throws {Error} Если FINAM_API_SECRET не задан или Finam API недоступен
 */
async function getAccessToken() {
  const now = Date.now();
  if (accessToken && now < accessTokenExpiresAt - JWT_REFRESH_BEFORE_MS) {
    return accessToken;
  }
  if (!FINAM_API_SECRET) {
    throw new Error('Не задан FINAM_API_SECRET в server/.env (см. server/.env.example)');
  }

  const response = await fetch(`${FINAM_API_BASE}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: FINAM_API_SECRET }),
    signal: AbortSignal.timeout(FINAM_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new HttpError(response.status, text);
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data.token !== 'string' || !data.token) {
    throw new Error('Finam API вернул пустой JWT-токен');
  }

  accessToken = data.token;
  accessTokenExpiresAt = Date.now() + JWT_TTL_MS;
  return accessToken;
}

/**
 * Сбросить кэш JWT (вызывается при истечении токена прямо во время запроса).
 */
function resetAccessToken() {
  accessToken = null;
  accessTokenExpiresAt = 0;
}

/**
 * Универсальный запрос к Finam API с авторизацией и автоматическим перевыпуском
 * JWT при истечении (401) — повторяется один раз.
 *
 * @param {string} path - Путь эндпоинта (например '/v1/assets/...')
 * @param {Object} [options] - Параметры fetch (method, body, headers)
 * @returns {Promise<Object>} JSON-ответ
 * @throws {HttpError} Если Finam API ответил ошибкой (кроме однократного ретрая 401)
 */
async function finamRequest(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${FINAM_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(FINAM_REQUEST_TIMEOUT_MS),
  });

  if (response.status === 401) {
    // JWT мог протухнуть между проверкой кэша и самим запросом — перевыпускаем один раз
    resetAccessToken();
    if (!options._retriedAuth) {
      return finamRequest(path, { ...options, _retriedAuth: true });
    }
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new HttpError(response.status, text);
  }
  return response.json().catch(() => ({}));
}

// ----------------------------------------------------------------------------
// Каталог инструментов (для резолва ISIN -> symbol) и размер лота
// ----------------------------------------------------------------------------

/** Кэш: ISIN -> symbol (только российские бумаги Мосбиржи) */
let catalogByIsin = null;
/** Момент обновления каталога (мс) */
let catalogBuiltAt = 0;
/** Promise текущей сборки каталога (single-flight, чтобы не грузить его параллельно) */
let catalogPromise = null;

/**
 * Пройти весь каталог активов Finam и собрать соответствия ISIN -> symbol
 * для активов, торгующихся на Мосбирже (mic = MISX). Это поддерживает ввод
 * ISIN на тарифе «Про»; обычные тикеры резолвятся напрямую как TICKER@MISX.
 *
 * Фильтрация по MISX выполняется на клиенте, т.к. каталог не позволяет
 * ограничить выборку по бирже на стороне сервера. Каталог кэшируется на 1 час.
 *
 * @returns {Promise<Map<string,string>>} Карта ISIN -> symbol
 */
async function buildCatalog() {
  const result = new Map();
  let cursor = null; // null — первый запрос (по документации поле пустое/0)
  let pages = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = new URLSearchParams({ only_active: 'true' });
    if (cursor) params.set('cursor', cursor);
    const data = await finamRequest(`/v1/assets/all?${params.toString()}`);

    for (const asset of data.assets || []) {
      const mic = String(asset.mic || '').toUpperCase();
      // Поддерживаем только российские бумаги Мосбиржи
      if (mic !== 'MISX') continue;
      if (asset.isin && asset.symbol) {
        result.set(String(asset.isin).toUpperCase(), asset.symbol);
      }
    }

    const next = data.next_cursor || null;
    if (!next || next === cursor) break; // пагинация завершена
    cursor = next;
    if (++pages >= CATALOG_MAX_PAGES) break; // предохранитель от бесконечного цикла
  }

  return result;
}

/**
 * Гарантировать готовность каталога инструментов (кэш на 1 час, single-flight).
 * @returns {Promise<void>}
 */
async function ensureCatalog() {
  if (catalogByIsin && Date.now() - catalogBuiltAt < CATALOG_TTL_MS) return;
  if (catalogPromise) { await catalogPromise; return; }
  catalogPromise = (async () => {
    const found = await buildCatalog();
    catalogByIsin = found;
    catalogBuiltAt = Date.now();
  })();
  try {
    await catalogPromise;
  } finally {
    catalogPromise = null;
  }
}

/** Кэш: symbol -> { lotSize, fetchedAt } — размер лота меняется редко */
const lotCache = new Map();

/**
 * Получение размера лота для символа вида TICKER@MISX.
 * Источник 1: Finam GET /v1/assets/{symbol}/params (trade_lot_size приходит строкой).
 * Источник 2 (fallback): MOEX ISS board TQBR — надёжный для MOEX-бумаг.
 * @param {string} symbol - символ вида TICKER@MISX
 * @returns {Promise<number|null>} размер лота (целое > 0) или null при неудаче
 */
async function fetchLotSize(symbol) {
  // 1) Finam Trade API
  try {
    const token = await getAccessToken();
    const url = `${FINAM_API_BASE}/v1/assets/${encodeURIComponent(symbol)}/params`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) {
      const body = await resp.json();
      const finLot = Number(body && body.trade_lot_size);
      if (Number.isFinite(finLot) && finLot > 0) {
        return Math.floor(finLot);
      }
    } else {
      console.warn('Finam lot params failed:', resp.status, await resp.text());
    }
  } catch (err) {
    console.warn('Finam lot request error:', err.message);
  }

  // 2) Fallback: MOEX ISS (тикер без @-суффикса)
  const ticker = symbol.split('@')[0];
  try {
    const url =
      `https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/${encodeURIComponent(ticker)}.json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (resp.ok) {
      const body = await resp.json();
      const rows = body && body.securities && body.securities.data;
      const cols = body && body.securities && body.securities.columns;
      const lotIdx = Array.isArray(cols) ? cols.indexOf('LOTSIZE') : -1;
      const lot = lotIdx >= 0 && Array.isArray(rows) && rows[0] ? Number(rows[0][lotIdx]) : NaN;
      if (Number.isFinite(lot) && lot > 0) return Math.floor(lot);
    }
  } catch (err) {
    console.warn('ISS lot request error:', err.message);
  }

  return null;
}

// ----------------------------------------------------------------------------
// Вспомогательные функции
// ----------------------------------------------------------------------------

/**
 * Проверить, является ли строка ISIN (12 символов: 2 буквы + 9 букв/цифр + 1 цифра).
 * @param {string} value - Строка
 * @returns {boolean}
 */
function isIsin(value) {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value);
}

/**
 * Резолв введённого пользователем значения (тикер или ISIN) в символ Finam
 * вида TICKER@MIC. Для российских бумаг Мосбиржи площадка — MISX.
 *
 * @param {string} input - Тикер или ISIN
 * @returns {Promise<string>} Символ Finam (например 'SBER@MISX')
 * @throws {Error} Если значение пустое или ISIN не найден в каталоге
 */
async function resolveSymbol(input) {
  const value = String(input || '').trim().toUpperCase();
  if (!value) throw new Error('Пустой тикер');
  if (value.includes('@')) return value; // уже полный символ TICKER@MIC

  if (isIsin(value)) {
    await ensureCatalog();
    const symbol = catalogByIsin.get(value);
    if (!symbol) throw new Error(`ISIN "${value}" не найден на Мосбирже (Finam)`);
    return symbol;
  }

  // Обычный тикер: российские бумаги Мосбиржи торгуются на площадке MISX
  return `${value}@MISX`;
}

/**
 * Извлечь цену последней сделки из ответа LastQuote.
 * Поля money-типа приходят объектами вида { value: "123.45" }.
 * @param {Object} data - JSON-ответ GET /v1/instruments/{symbol}/quotes/latest
 * @returns {number|null} Цена или null, если данные отсутствуют/некорректны
 */
function extractPrice(data) {
  const quote = data && data.quote;
  if (!quote) return null;
  const raw = (quote.last && quote.last.value) || (quote.close && quote.close.value);
  if (raw == null) return null;
  const price = Number.parseFloat(raw);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * Получить цену последней сделки и размер лота по введённому значению (тикер/ISIN).
 * @param {string} value - Тикер или ISIN
 * @returns {Promise<{price: number|null, lotSize: number|null}>}
 */
async function fetchTickerData(value) {
  const symbol = await resolveSymbol(value);

  let quoteData;
  let lotSize = null;
  try {
    [quoteData, lotSize] = await Promise.all([
      finamRequest(`/v1/instruments/${encodeURIComponent(symbol)}/quotes/latest`),
      fetchLotSize(symbol),
    ]);
  } catch (err) {
    // 400/404 от LastQuote означают, что инструмент не торгуется на этой площадке
    if (err instanceof HttpError && (err.status === 400 || err.status === 404)) {
      throw new Error(`Актив "${value}" не найден на Мосбирже (Finam)`);
    }
    throw err;
  }

  return { price: extractPrice(quoteData), lotSize };
}

/**
 * Преобразовать ошибку в понятное пользователю сообщение.
 * @param {Error} err - Ошибка
 * @returns {string} Человекочитаемое описание проблемы
 */
function friendlyError(err) {
  const message = String((err && err.message) || err || '');
  const status = err && err.status;
  if (status === 401 || status === 404) {
    return 'Источник цен в реальном времени недоступен';
  }
  if (status === 429) {
    return 'Превышен лимит запросов Finam API (200/мин). Подождите минуту';
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|UNAVAILABLE|UND_ERR/i.test(message)) {
    return 'Источник цен в реальном времени недоступен';
  }
  return message;
}

// ----------------------------------------------------------------------------
// Маршруты HTTP
// ----------------------------------------------------------------------------

/**
 * Проверка работоспособности сервера.
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ ok: true, finamConfigured: Boolean(FINAM_API_SECRET) });
});

/**
 * Получение цен и лотов по списку тикеров.
 * GET /api/prices?tickers=SBER,GAZP,...
 * Ответ: { prices: (number|null)[], lotSizes: (number|null)[], errors: string[] }.
 */
app.get('/api/prices', async (req, res) => {
  const raw = req.query.tickers;
  if (!raw) return res.status(400).json({ error: 'Параметр tickers обязателен' });

  const tickers = String(raw)
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  const prices = [];
  const lotSizes = [];
  const errors = [];

  // Обрабатываем тикеры последовательно, чтобы не превысить лимиты API (200/мин)
  // и чтобы частичный сбой одного тикера не ломал остальные
  for (const ticker of tickers) {
    try {
      const { price, lotSize } = await fetchTickerData(ticker);
      prices.push(price);
      lotSizes.push(lotSize);
      if (price == null) errors.push(`${ticker}: нет цены`);
    } catch (err) {
      console.error(`[prices] Ошибка для ${ticker}:`, err.message);
      prices.push(null);
      lotSizes.push(null);
      errors.push(`${ticker}: ${friendlyError(err)}`);
    }
  }

  res.json({ prices, lotSizes, errors });
});

app.listen(PORT, () => {
  console.log(`Finam proxy запущен: http://localhost:${PORT}`);
  console.log(`FINAM_API_SECRET: ${FINAM_API_SECRET ? 'задан ✓' : 'НЕ задан — обновите server/.env'}`);
});
