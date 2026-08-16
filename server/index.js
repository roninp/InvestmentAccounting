/**
 * Backend-прокси для T-Invest API (тариф «Про»).
 *
 * Назначение: предоставить frontend-приложению (index.html) мгновенное обновление
 * цен без задержки через API Т-Банка (https://developer.tbank.ru/invest/intro/intro).
 *
 * T-Invest API работает по протоколу gRPC и требует секретный токен, поэтому
 * браузер не может обращаться к нему напрямую. Данный сервер:
 *   1) хранит токен на своей стороне (server/.env, в .gitignore);
 *   2) ходит в gRPC T-Invest API через официальный SDK @tinkoff/invest-js;
 *   3) отдаёт браузеру простой JSON в том же формате, что и MoexPriceService
 *      из index.html: { prices, lotSizes, errors }.
 *
 * Запуск:
 *   cd server && npm install && npm start
 * Приложение index.html обращается к адресу, заданному константой TBANK_PROXY_URL.
 */

require('dotenv').config();
const express = require('express');
const grpc = require('@grpc/grpc-js');
const { OpenAPIClient } = require('@tinkoff/invest-js');

// ----------------------------------------------------------------------------
// Обход корпоративного TLS-перехвата (только для локальной разработки).
//
// В сетях, где трафик проходит через SSL-inspecting прокси (антивирус / DLP),
// сертификат T-Invest API определяется как "self-signed", и gRPC-соединение
// не устанавливается. Штатный способ решения — добавить корпоративный
// корневой сертификат в доверенные (NODE_EXTRA_CA_CERTS). Если это
// невозможно, можно временно отключить проверку сертификата:
//
//   TINVEST_TLS_INSECURE=1  (в server/.env)
//
// ВНИМАНИЕ: это отключает проверку сертификата для всех gRPC-вызовов и
// делает соединение уязвимым к MITM. Использовать только локально.
// ----------------------------------------------------------------------------
if (process.env.TINVEST_TLS_INSECURE === '1') {
  const originalCreateSsl = grpc.credentials.createSsl.bind(grpc.credentials);
  grpc.credentials.createSsl = (rootCerts, privateKey, certChain, verifyOptions) => {
    const mergedVerifyOptions = {
      ...(verifyOptions || {}),
      rejectUnauthorized: false,
    };
    return originalCreateSsl(rootCerts, privateKey, certChain, mergedVerifyOptions);
  };
  console.warn('TINVEST_TLS_INSECURE=1: проверка TLS-сертификата отключена (только для разработки)');
}

const app = express();

/** Порт, на котором слушает прокси (настраивается через server/.env) */
const PORT = Number(process.env.PORT) || 8787;
/** Персональный токен T-Invest API (см. server/.env) */
const TOKEN = (process.env.TINVEST_TOKEN || '').trim();

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

/** Лениво создаваемый клиент T-Invest API */
let investClient = null;

/**
 * Получить (или создать при первом обращении) клиент T-Invest API.
 * @returns {{ marketData: Object, instruments: Object }}
 * @throws {Error} Если токен не задан в server/.env
 */
function getInvestClient() {
  if (!TOKEN) {
    throw new Error('Не задан TINVEST_TOKEN в server/.env (см. server/.env.example)');
  }
  if (!investClient) {
    investClient = new OpenAPIClient({ token: TOKEN });
  }
  return investClient;
}

/**
 * Преобразование MoneyValue (units + nano) в десятичное число.
 * nano — нанодоли рубля (1e-9); может быть отрицательным.
 * @param {{units: number, nano: number}|null} money - Денежное значение T-Invest
 * @returns {number|null} Десятичная цена или null, если значение отсутствует
 */
function moneyToNumber(money) {
  if (!money) return null;
  const value = Number(money.units) + Number(money.nano) / 1e9;
  return Number.isFinite(value) ? value : null;
}

/**
 * Преобразовать ошибку gRPC/SDK в понятное пользователю сообщение.
 *
 * Ключевые случаи (коды T-Invest API):
 *   - 40003 UNAUTHENTICATED — токен неактуален (истёк или отозван; срок жизни
 *     токена — 3 месяца с последнего использования).
 *   - UNAVAILABLE / No connection — транспортный сбой (например, нужен
 *     TINVEST_TLS_INSECURE=1 при корпоративном SSL-перехвате).
 *
 * @param {Error} err - Ошибка от SDK T-Invest
 * @returns {string} Человекочитаемое описание проблемы
 */
function friendlyError(err) {
  const msg = String((err && err.message) || err);
  if (/UNAUTHENTICATED/.test(msg) || /40003/.test(msg)) {
    return 'Источник цен в реальном времени недоступен';
  }
  if (/UNAVAILABLE/.test(msg) || /No connection/.test(msg)) {
    return 'Источник цен в реальном времени недоступен';
  }
  return msg;
}

/**
 * Универсальный promisify-хелпер: превращает вызов gRPC-метода
 * (с коллбеком) в Promise.
 *
 * SDK @tinkoff/invest-js в этой версии использует callback-стиль:
 *   service.methodName(argument, (err, response) => {...})
 *
 * Метод вызывается через service[methodName](...), чтобы корректно сохранить
 * контекст `this` (внутри SDK часть методов обращается к другим методам через
 * `this`, например getInstrumentByTicker -> this.getInstrumentBy).
 *
 * @template T
 * @param {Object} service - Сервисный объект SDK (например client.instruments)
 * @param {string} methodName - Имя метода (например 'getInstrumentByTicker')
 * @param {Object} argument - Аргумент запроса (proto-сообщение)
 * @returns {Promise<T>} Ответ метода
 */
function callUnary(service, methodName, argument) {
  return new Promise((resolve, reject) => {
    service[methodName](argument, (err, response) => {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Получить цену последней сделки и размер лота по тикеру через T-Invest API.
 *
 * Алгоритм:
 *   1. getInstrumentByTicker({ id: ticker }) — получаем figi, lot.
 *   2. getLastPrices({ instrumentId: [figi] }) — получаем последнюю цену.
 *
 * @param {string} ticker - Тикер инструмента (например 'SBER')
 * @returns {Promise<{price: number|null, lotSize: number|null}>}
 */
async function fetchTicker(ticker) {
  const client = getInvestClient();

  // --- 1) Получение информации об инструменте (figi + лот) ---
  /** @type {{ instrument: { figi: string, lot: number, name: string } }} */
  const instrumentResp = await callUnary(
    client.instruments,
    'getInstrumentByTicker',
    { id: ticker }
  );
  const instrument = instrumentResp.instrument;
  // Размер лота (количество бумаг в одном стандартном лоте)
  const lotSize =
    instrument && Number(instrument.lot) >= 1
      ? Math.floor(Number(instrument.lot))
      : null;

  // --- 2) Получение последней цены по figi ---
  /** @type {{ lastPrices: Array<{ figi: string, price: { units: number, nano: number } }> }} */
  const priceResp = await callUnary(
    client.marketData,
    'getLastPrices',
    { instrumentId: [instrument.figi] }
  );
  const lastPriceItem = Array.isArray(priceResp.lastPrices)
    ? priceResp.lastPrices.find((item) => item && item.price)
    : null;
  const price = lastPriceItem ? moneyToNumber(lastPriceItem.price) : null;

  return { price, lotSize };
}

/**
 * Проверка работоспособности сервера.
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ ok: true, tbankConfigured: Boolean(TOKEN) });
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

  // Обрабатываем тикеры последовательно, чтобы не превысить лимиты API и
  // чтобы частичный сбой одного тикера не ломал остальные
  for (const ticker of tickers) {
    try {
      const { price, lotSize } = await fetchTicker(ticker);
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
  console.log(`T-Invest proxy запущен: http://localhost:${PORT}`);
  console.log(`TINVEST_TOKEN: ${TOKEN ? 'задан ✓' : 'НЕ задан — обновите server/.env'}`);
});
