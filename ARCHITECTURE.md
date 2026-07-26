# Веб-сервис управления портфелем: Архитектура и Best Practices

## 📋 Содержание
1. [Архитектурные решения](#архитектурные-решения)
2. [Принципы SOLID](#принципы-solid)
3. [Другие best practices](#другие-best-practices)
4. [Структура кода](#структура-кода)
5. [Как расширять приложение](#как-расширять-приложение)

---

## 🏗️ Архитектурные решения

### Трёхслойная архитектура

Приложение разделено на три логических слоя:

#### 1. **Domain Layer (Слой бизнес-логики)**
Содержит классы, которые НЕ зависят от React и UI:
- `PortfolioCalculator` - расчеты портфеля
- `PriceService` - получение цен
- `AssetValidator` - валидация данных

**Преимущества:**
- Логика может тестироваться без React
- Легко переиспользовать в других проектах (CLI, backend, мобильное приложение)
- Не зависит от изменений UI фреймворка

```javascript
// Бизнес-логика полностью отделена от UI
const analysis = PortfolioCalculator.analyzePortfolio(assets);
const prices = await PriceService.fetchPrices(['SBER', 'GAZP']);
```

#### 2. **UI Layer (Слой компонентов)**
React компоненты отвечают только за отображение:
- `AssetRow` - строка таблицы
- `PortfolioHeader` - заголовок таблицы
- `PortfolioSummary` - карточки сводки
- `PortfolioRebalancer` - главный компонент-оркестратор

**Принцип:** Каждый компонент делает одно и хорошо.

#### 3. **State Management (Управление состоянием)**
Минимальное, достаточное состояние:
- Только `assets` хранятся в состоянии
- Все остальное вычисляется через `useMemo` (derived state)
- Нет дублирования данных

```javascript
// ❌ Плохо: дублирование состояния
const [assets, setAssets] = useState([...]);
const [analysis, setAnalysis] = useState([...]);  // Это зависит от assets!

// ✅ Хорошо: вычисляем через useMemo
const analysis = useMemo(() => {
  return PortfolioCalculator.analyzePortfolio(assets);
}, [assets]);
```

---

## 🎯 Принципы SOLID

### S - Single Responsibility Principle ✅

Каждый класс/компонент отвечает за одно:

```javascript
// ✅ ПРАВИЛЬНО: отдельные классы для разных ответственностей
class PortfolioCalculator {
  // Только расчеты портфеля
}

class PriceService {
  // Только получение цен
}

class AssetValidator {
  // Только валидация
}

// ✅ ПРАВИЛЬНО: компоненты с одной задачей
function AssetRow({ asset, analysis, onUpdate, onRemove }) {
  // Только отображение одной строки актива
}

function PortfolioSummary({ analysis }) {
  // Только отображение сводки
}
```

### O - Open/Closed Principle ✅

Открыто для расширения, закрыто для модификации:

```javascript
// ✅ Легко добавить новый калькулятор метрик
class PortfolioCalculator {
  static analyzePortfolio(assets) { /*...*/ }
  
  // Новый метод - не трогали старый!
  static calculateVolatility(assets) { /*...*/ }
  
  // Новый метод - не трогали старый!
  static calculateSharpeRatio(assets) { /*...*/ }
}

// ✅ Легко добавить новый источник цен
class PriceService {
  static async fetchPrice(ticker) { /*...*/ }
}

class MoexPriceService extends PriceService {
  // Переопределяем для реального API MOEX
}

class SimulatedPriceService extends PriceService {
  // Симуляция для тестов
}
```

### L - Liskov Substitution Principle ✅

Подклассы могут заменять своих родителей:

```javascript
// ✅ Любой PriceService может использоваться везде
const priceService = process.env.NODE_ENV === 'test' 
  ? new SimulatedPriceService()
  : new MoexPriceService();

// Код работает с обоими одинаково
const prices = await priceService.fetchPrices(tickers);
```

### I - Interface Segregation Principle ✅

Классы имеют узкие интерфейсы, не перегруженные:

```javascript
// ✅ PriceService имеет узкий интерфейс
class PriceService {
  static async fetchPrice(ticker) { }      // Одна цена
  static async fetchPrices(tickers) { }    // Несколько цен
  // Не добавляем сюда историю, объемы, открытие/закрытие и т.д.
}

// ✅ Валидатор отвечает только за валидацию
class AssetValidator {
  static validate(asset) { }
  static validatePortfolio(assets) { }
  // Не добавляем сюда сохранение, отправку в БД и т.д.
}
```

### D - Dependency Inversion Principle ✅

Зависим от абстракций, не от конкретных реализаций:

```javascript
// ✅ Компонент не знает, откуда берутся цены
function PortfolioRebalancer() {
  const handleRefreshPrices = async () => {
    // Используем PriceService как абстракцию
    const prices = await PriceService.fetchPrices(tickers);
    // Не важно, откуда: MOEX, Yahoo, симуляция - все одинаково
  };
}
```

---

## 📚 Другие Best Practices

### 1. DRY - Don't Repeat Yourself

**Проблема:** Одна и та же логика в разных местах.

```javascript
// ❌ Плохо
function AssetRow() {
  const currentValue = asset.quantity * asset.price;
  const currentPercent = (currentValue / total) * 100;
}

function PortfolioSummary() {
  const currentValue = asset.quantity * asset.price;
  const currentPercent = (currentValue / total) * 100;
}

// ✅ Хорошо: логика в PortfolioCalculator, использует везде
const analysis = PortfolioCalculator.analyzePortfolio(assets);
```

### 2. Derived State вместо дублирования

```javascript
// ❌ Плохо: хранят analysis отдельно
const [assets, setAssets] = useState([...]);
const [analysis, setAnalysis] = useState([...]); // Может рассинхронизироваться!

// ✅ Хорошо: analysis вычисляется из assets
const [assets, setAssets] = useState([...]);
const analysis = useMemo(() => {
  return PortfolioCalculator.analyzePortfolio(assets);
}, [assets]); // Всегда синхронизирована
```

### 3. useCallback для оптимизации

```javascript
// Обработчики оборачиваются в useCallback
const handleUpdateAsset = useCallback((updatedAsset) => {
  // Функция не пересоздается, если зависимости не изменились
  setAssets(prevAssets =>
    prevAssets.map(a => a.id === updatedAsset.id ? updatedAsset : a)
  );
}, []);
```

### 4. Error Handling

```javascript
// Попытка → Ошибка → Уведомление пользователя
const handleRefreshPrices = async () => {
  setLoading(true);
  setError(null);

  try {
    const prices = await PriceService.fetchPrices(tickers);
    setAssets(prevAssets => /* обновляем */);
  } catch (err) {
    setError(`Ошибка: ${err.message}`); // Информируем пользователя
  } finally {
    setLoading(false);
  }
};
```

### 5. Валидация данных

```javascript
// Валидируем перед сохранением
const handleUpdateAsset = (updatedAsset) => {
  const validation = AssetValidator.validate(updatedAsset);
  
  if (!validation.isValid) {
    setError(validation.errors[0]);
    return; // Не сохраняем невалидные данные
  }
  
  setAssets(prevAssets => 
    prevAssets.map(a => a.id === updatedAsset.id ? updatedAsset : a)
  );
};
```

### 6. Минимальное состояние

Хранятся в `useState` только значения, которые действительно изменяются:
- `assets` - может быть добавлен/удален/обновлен актив
- `loading` - состояние загрузки цен
- `error` - сообщение об ошибке
- `nextId` - для генерации ID новых активов

Всё остальное вычисляется через `useMemo`.

### 7. Семантический HTML и Tailwind CSS

```html
<!-- ✅ Правильно: семантические элементы -->
<table>
  <thead>...</thead>
  <tbody>...</tbody>
</table>

<!-- ✅ Tailwind утилити-классы: легко читать, изменять -->
<div className="grid grid-cols-3 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
```

---

## 📂 Структура кода

```
portfolio-rebalancer.jsx
│
├── DOMAIN LAYER (Бизнес-логика)
│   ├── PortfolioCalculator (расчеты)
│   ├── PriceService (получение цен)
│   └── AssetValidator (валидация)
│
└── UI LAYER (React компоненты)
    ├── AssetRow (строка таблицы)
    ├── PortfolioHeader (заголовок)
    ├── PortfolioSummary (сводка)
    └── PortfolioRebalancer (главный компонент)
```

---

## 🚀 Как расширять приложение

### Добавить новый расчет (например, волатильность)

```javascript
// 1. Добавляем в PortfolioCalculator
class PortfolioCalculator {
  static analyzePortfolio(assets) { /*...*/ }
  
  // Новый метод - не трогали старый (Open/Closed)
  static calculateVolatility(assets, historical) {
    // реализация
    return volatility;
  }
}

// 2. Используем в UI
const analysis = useMemo(() => {
  const portfolio = PortfolioCalculator.analyzePortfolio(assets);
  const volatility = PortfolioCalculator.calculateVolatility(assets, history);
  return { portfolio, volatility };
}, [assets, history]);
```

### Подключить реальный API Мосбиржи

```javascript
// 1. Создаем новый класс (Liskov - может заменить старый)
class MoexPriceService extends PriceService {
  static async fetchPrice(ticker) {
    const response = await fetch(
      `https://www.moex.com/api/v1/turnovers.json?securities=${ticker}`
    );
    const data = await response.json();
    return data.turnovers[0].price; // Парсим реальные данные
  }
}

// 2. Обновляем handleRefreshPrices
const handleRefreshPrices = async () => {
  const prices = await MoexPriceService.fetchPrices(tickers); // Просто заменяем
  // Остальной код не меняется!
};
```

### Добавить новый компонент (например, график портфеля)

```javascript
// 1. Создаем компонент с одной ответственностью
function PortfolioChart({ analysis }) {
  // Отображает графики (pie chart, line chart и т.д.)
  return <canvas ref={chartRef} />;
}

// 2. Используем в главном компоненте
function PortfolioRebalancer() {
  return (
    <>
      <PortfolioSummary analysis={analysis} />
      <PortfolioChart analysis={analysis} /> {/* Новый компонент */}
      <table>{/* таблица */}</table>
    </>
  );
}
```

### Добавить тестирование

```javascript
// tests/PortfolioCalculator.test.js
describe('PortfolioCalculator', () => {
  test('вычисляет стоимость портфеля', () => {
    const assets = [
      { quantity: 10, price: 100 },
      { quantity: 5, price: 200 },
    ];
    
    const total = PortfolioCalculator.calculateTotalValue(assets);
    expect(total).toBe(2000); // 10*100 + 5*200
  });

  test('вычисляет процент портфеля', () => {
    const assets = [
      { quantity: 10, price: 100 },
      { quantity: 10, price: 100 },
    ];
    
    const percentages = PortfolioCalculator.calculatePercentages(assets);
    expect(percentages).toEqual([50, 50]);
  });
});
```

---

## 💡 Ключевые преимущества архитектуры

| Преимущество | Как достигается |
|---|---|
| **Тестируемость** | Бизнес-логика отделена от React |
| **Переиспользуемость** | Классы Domain Layer не зависят от UI |
| **Поддерживаемость** | Каждый класс отвечает за одно (SRP) |
| **Расширяемость** | Легко добавлять новые функции (OCP) |
| **Отсутствие багов** | Валидация и обработка ошибок везде |
| **Производительность** | useMemo и useCallback оптимизируют рендер |
| **Понятность кода** | Чистая структура, понятные имена |

---

## 🎨 Дизайн

### Финансовый стиль
- **Цветовая палитра:** Серый фон (профессионализм) + цветные акценты
- **Типография:** Моноширинный шрифт для чисел (точность)
- **Градиенты:** От синего к фиолетовому (динамика, рост)
- **Статус aktiva:** 🟢 Зелёный (в целевых), 🟡 Жёлтый (избыточный), 🔵 Синий (недостаточный)

### UX принципы
- Всё на одной странице (не отвлекает)
- Реал-тайм расчеты (без "Применить")
- Визуальные подсказки (цвета, иконки)
- Информативные сообщения об ошибках

---

## 📞 Использование

```bash
# Вставить компонент в ваше React приложение
import PortfolioRebalancer from './portfolio-rebalancer';

export default function App() {
  return <PortfolioRebalancer />;
}
```

```html
<!-- Или использовать с CDN для быстрого тестирования -->
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<div id="root"></div>
<script src="portfolio-rebalancer.jsx"></script>
```

---

**Готово к production! 🚀**
