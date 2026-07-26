# Интеграция с реальным API Мосбиржи

## 📡 API Мосбиржи

Мосбиржа предоставляет открытый API для получения котировок. Документация: https://www.moex.com/api/

### Доступные эндпоинты

#### 1. Получить текущую цену актива

```
GET https://www.moex.com/api/v1/securities/[TICKER]/marketdata
```

**Пример:**
```bash
curl "https://www.moex.com/api/v1/securities/SBER/marketdata"
```

**Ответ:**
```json
{
  "marketdata": {
    "data": [
      [
        "2024-01-15",
        123.45,    // цена открытия
        123.60,    // цена на момент времени
        123.70,    // максимальная цена
        123.20,    // минимальная цена
        ...
      ]
    ]
  }
}
```

#### 2. Получить информацию о нескольких активах

```
GET https://www.moex.com/api/v1/securities?q=SBER,GAZP,NVTK
```

---

## 🔧 Реальная реализация PriceService

Замените симуляцию на реальное получение цен:

```javascript
/**
 * Реальный сервис для получения цен из API Мосбиржи
 */
class MoexPriceService {
  static MOEX_API_URL = 'https://www.moex.com/api/v1';
  static CACHE_DURATION = 60000; // 1 минута
  
  static priceCache = new Map();
  
  /**
   * Получить текущую цену актива
   */
  static async fetchPrice(ticker) {
    // Проверяем кэш
    const cached = this.priceCache.get(ticker);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.price;
    }

    try {
      const response = await fetch(
        `${this.MOEX_API_URL}/securities/${ticker.toUpperCase()}/marketdata`,
        { timeout: 5000 } // Таймаут 5 сек
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Парсим ответ Мосбиржи
      const rows = data.marketdata?.data;
      if (!rows || rows.length === 0) {
        throw new Error('Нет данных по активу');
      }

      // Последняя строка - текущие данные
      // Индекс 1 - цена открытия, индекс 2 - текущая цена
      const price = rows[rows.length - 1][2];

      if (!price || price <= 0) {
        throw new Error('Некорректная цена');
      }

      // Кэшируем результат
      this.priceCache.set(ticker, {
        price,
        timestamp: Date.now(),
      });

      return price;
    } catch (error) {
      throw new Error(
        `Не удалось получить цену ${ticker}: ${error.message}`
      );
    }
  }

  /**
   * Получить цены для нескольких активов параллельно
   */
  static async fetchPrices(tickers) {
    const promises = tickers.map(ticker => 
      this.fetchPrice(ticker).catch(error => {
        console.error(`Ошибка для ${ticker}:`, error);
        return null;
      })
    );

    const prices = await Promise.allSettled(promises);

    return prices.map((result, index) => {
      if (result.status === 'fulfilled' && result.value !== null) {
        return result.value;
      }
      throw new Error(`Ошибка получения цены ${tickers[index]}`);
    });
  }

  /**
   * Очистить кэш
   */
  static clearCache() {
    this.priceCache.clear();
  }
}
```

---

## 🔄 Обновленный главный компонент

```javascript
// Замените использование PriceService на MoexPriceService
function PortfolioRebalancer() {
  // ... остальной код ...

  const handleRefreshPrices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const tickers = assets.map(a => a.ticker).filter(t => t);
      
      if (tickers.length === 0) {
        setError('Добавьте тикеры активов');
        setLoading(false);
        return;
      }

      // Используем реальный API Мосбиржи вместо симуляции
      const prices = await MoexPriceService.fetchPrices(tickers);

      setAssets(prevAssets =>
        prevAssets.map((asset, index) => ({
          ...asset,
          price: prices[index] || asset.price,
        }))
      );
    } catch (err) {
      setError(`Ошибка получения цен: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [assets]);

  // ... остальной код ...
}
```

---

## 📊 Получение исторических данных

Для расчета волатильности и других метрик нужны исторические данные:

```javascript
/**
 * Получить исторические цены
 */
class MoexHistoryService {
  static async fetchHistory(ticker, from, to) {
    // Параметры:
    // from: '2024-01-01'
    // to: '2024-01-15'
    
    const response = await fetch(
      `https://www.moex.com/api/v1/securities/${ticker}/candles?` +
      `from=${from}&till=${to}&interval=1` // interval: 1=день, 10=минуты и т.д.
    );

    const data = await response.json();
    
    // Данные структуры: [дата, открытие, максимум, минимум, закрытие, объем]
    return data.candles.data.map(row => ({
      date: row[0],
      open: row[1],
      high: row[2],
      low: row[3],
      close: row[4],
      volume: row[5],
    }));
  }
}
```

---

## 🧪 Тестирование с мок-сервером

Для разработки без зависимости от API:

```javascript
/**
 * Мок-сервис для тестирования
 */
class MockPriceService {
  static async fetchPrice(ticker) {
    // Возвращаем фиксированные цены для тестов
    const prices = {
      'SBER': 245.50,
      'GAZP': 145.20,
      'NVTK': 1234.50,
      'POLY': 96.80,
    };

    if (!prices[ticker]) {
      throw new Error(`Неизвестный тикер: ${ticker}`);
    }

    return prices[ticker];
  }

  static async fetchPrices(tickers) {
    return Promise.all(tickers.map(t => this.fetchPrice(t)));
  }
}

// В коде используем через переменную окружения
const PriceServiceClass = 
  process.env.NODE_ENV === 'test' ? MockPriceService : MoexPriceService;

const handleRefreshPrices = async () => {
  const prices = await PriceServiceClass.fetchPrices(tickers);
  // ...
};
```

---

## ✨ Расширенные функции

### 1. Автоматическое обновление цен

```javascript
function PortfolioRebalancer() {
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    if (!autoRefresh) return;

    // Обновляем цены каждые 30 секунд
    const interval = setInterval(() => {
      handleRefreshPrices();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, handleRefreshPrices]);

  return (
    <>
      {/* ... */}
      <label>
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(e) => setAutoRefresh(e.target.checked)}
        />
        Обновлять цены автоматически каждые 30 сек
      </label>
    </>
  );
}
```

### 2. История цен и волатильность

```javascript
class PortfolioAnalytics {
  /**
   * Вычислить волатильность (стандартное отклонение доходности)
   */
  static calculateVolatility(historicalPrices) {
    const returns = [];
    for (let i = 1; i < historicalPrices.length; i++) {
      const ret = (historicalPrices[i] - historicalPrices[i-1]) / historicalPrices[i-1];
      returns.push(ret);
    }

    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => 
      sum + Math.pow(ret - avg, 2), 0
    ) / returns.length;

    return Math.sqrt(variance);
  }

  /**
   * Вычислить коэффициент Шарпа
   * (доход сверх безрисковой ставки / волатильность)
   */
  static calculateSharpeRatio(portfolioReturns, riskFreeRate = 0.05) {
    const avgReturn = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
    const volatility = this.calculateVolatility(portfolioReturns);
    
    return (avgReturn - riskFreeRate) / volatility;
  }

  /**
   * Максимальная просадка (Maximum Drawdown)
   */
  static calculateMaxDrawdown(historicalValues) {
    let maxValue = historicalValues[0];
    let maxDrawdown = 0;

    for (const value of historicalValues) {
      if (value > maxValue) {
        maxValue = value;
      }
      const drawdown = (maxValue - value) / maxValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }
}
```

### 3. Экспорт и импорт портфеля

```javascript
function PortfolioRebalancer() {
  const handleExport = () => {
    const data = {
      assets,
      exportDate: new Date().toISOString(),
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `portfolio-${Date.now()}.json`;
    link.click();
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        setAssets(data.assets);
        setError(null);
      } catch (err) {
        setError(`Ошибка импорта: ${err.message}`);
      }
    };

    reader.readAsText(file);
  };

  return (
    <>
      {/* ... */}
      <button onClick={handleExport}>
        📥 Экспортировать портфель
      </button>
      
      <input
        type="file"
        accept=".json"
        onChange={handleImport}
      />
    </>
  );
}
```

### 4. Сохранение в LocalStorage

```javascript
function PortfolioRebalancer() {
  // Загружаем портфель при инициализации
  const [assets, setAssets] = useState(() => {
    try {
      const saved = localStorage.getItem('portfolio-assets');
      return saved ? JSON.parse(saved) : initialAssets;
    } catch {
      return initialAssets;
    }
  });

  // Сохраняем при изменении
  useEffect(() => {
    try {
      localStorage.setItem('portfolio-assets', JSON.stringify(assets));
    } catch (err) {
      console.error('Ошибка сохранения:', err);
    }
  }, [assets]);

  // ... остальной код ...
}
```

---

## 🔐 Обработка ошибок API

```javascript
class MoexPriceService {
  static async fetchPrice(ticker) {
    try {
      const response = await fetch(
        `${this.MOEX_API_URL}/securities/${ticker}/marketdata`,
        { 
          signal: AbortSignal.timeout(5000) // Таймаут 5 сек
        }
      );

      // Обрабатываем разные статус-коды
      if (response.status === 404) {
        throw new Error(`Актив "${ticker}" не найден на Мосбирже`);
      }

      if (response.status === 429) {
        throw new Error('Слишком много запросов. Подождите минуту');
      }

      if (response.status >= 500) {
        throw new Error('Сервис Мосбиржи недоступен. Попробуйте позже');
      }

      if (!response.ok) {
        throw new Error(`Ошибка API: ${response.status}`);
      }

      const data = await response.json();
      // ... парсим данные ...

    } catch (error) {
      // Улучшенная обработка ошибок
      if (error.name === 'AbortError') {
        throw new Error(`Таймаут при получении ${ticker}`);
      }
      
      if (error instanceof TypeError) {
        throw new Error(`Сетевая ошибка. Проверьте интернет-соединение`);
      }

      throw error;
    }
  }
}
```

---

## 📈 Список поддерживаемых активов Мосбиржи

Основные голубые фишки:

```
SBER    - Сбербанк
GAZP    - Газпром
NVTK    - НОВАТЭК
TATN    - Татнефть
MGNT    - Магнит
LKOH    - ЛУКОЙЛ
VTBR    - ВТБ
IRAO    - Интер РАО
CMIC    - СМИ
POLYP   - Полипласт
ROSN    - Роснефть
SBERP   - Сбербанк привилегированный
```

Полный список: https://www.moex.com/api/v1/securities

---

## 🎯 Тестирование API интеграции

```javascript
// Используем fetch с реальным API
async function testMoexApi() {
  try {
    // Тест 1: Получить одну цену
    const price = await MoexPriceService.fetchPrice('SBER');
    console.log('Цена SBER:', price);
    
    // Тест 2: Получить несколько цен
    const prices = await MoexPriceService.fetchPrices(['SBER', 'GAZP', 'NVTK']);
    console.log('Цены:', prices);
    
    // Тест 3: История
    const history = await MoexHistoryService.fetchHistory(
      'SBER',
      '2024-01-01',
      '2024-01-15'
    );
    console.log('История:', history);

  } catch (error) {
    console.error('Ошибка:', error);
  }
}

// Запустить тесты
testMoexApi();
```

---

## 📝 Примечания

1. **Rate Limiting:** Мосбиржа может ограничивать количество запросов. Используйте кэширование.
2. **Таймзоны:** Сервер Мосбиржи использует UTC. Учитывайте это при обработке дат.
3. **Выходные:** В выходные нет торговли. API вернёт данные последнего торгового дня.
4. **CORS:** Если вызываете из браузера, убедитесь, что CORS включён или используйте CORS proxy.

---

**Готово к production с реальными данными! 🚀**
