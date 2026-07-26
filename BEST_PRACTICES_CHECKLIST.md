# ✅ Best Practices Checklist

Полный список лучших практик, применённых в приложении **Portfolio Rebalancer**.
Используйте этот чек-лист при разработке новых фич.

---

## 🏛️ АРХИТЕКТУРА

### Separation of Concerns
- [x] Бизнес-логика отделена от UI
- [x] Компоненты не знают о деталях реализации
- [x] Классы Domain Layer не зависят от React
- [x] Каждый класс отвечает за одно

**Пример:**
```javascript
// ✅ Правильно: отделённые классы
class PortfolioCalculator { /* только расчеты */ }
class PriceService { /* только цены */ }
function AssetRow() { /* только отображение */ }

// ❌ Неправильно: всё в одном компоненте
function ComplexComponent() {
  // расчеты
  // загрузка цен
  // валидация
  // отображение
}
```

### Layered Architecture (трехслойная)
- [x] Domain Layer (бизнес-логика)
- [x] UI Layer (React компоненты)
- [x] State Management (управление состоянием)

```
┌─────────────────────────────┐
│      UI Layer               │  React компоненты
│  AssetRow, PortfolioHeader  │
├─────────────────────────────┤
│   State Management          │  useState, useMemo, useCallback
├─────────────────────────────┤
│    Domain Layer             │  Классы, не зависят от React
│  Calculator, Service        │
└─────────────────────────────┘
```

---

## 🎯 ПРИНЦИПЫ SOLID

### S - Single Responsibility Principle
- [x] Каждый класс отвечает за ОД НО
- [x] При изменении требований меняется ОДИН класс
- [x] Каждый компонент имеет одну задачу

**Чек-лист:**
```javascript
// Вопросы для себя:
// 1. Могу ли я описать класс одним предложением?
// 2. Есть ли в нём two "and" (признак нескольких ответственностей)?
// 3. Если требование изменится, меняется ли только этот класс?

class PortfolioCalculator {
  // ✅ "Отвечает за расчеты портфеля"
  static calculateTotalValue() {}
  static calculatePercentages() {}
  static analyzePortfolio() {}
}

// ❌ Нарушение SRP
class PortfolioService {
  calculatePortfolio() {} // расчет
  saveToDatabase() {}     // сохранение
  sendEmail() {}          // отправка писем
  // Слишком много ответственности!
}
```

### O - Open/Closed Principle
- [x] Открыто для расширения (легко добавлять новые функции)
- [x] Закрыто для модификации (не меняем старый код)
- [x] Используется наследование или композиция

**Пример:**
```javascript
// ✅ Правильно: легко добавить новый метод
class PortfolioCalculator {
  static analyzePortfolio() { /* существует */ }
  static calculateVolatility() { /* новый метод */ }
  // Старый код не трогали!
}

// ❌ Неправильно: меняем существующий код
class PortfolioCalculator {
  static analyzePortfolio() {
    // старый код
    // ЕЩЕ более старый код
    // новый код волатильности
    // если потом нужно ещё что-то - опять меняем!
  }
}
```

### L - Liskov Substitution Principle
- [x] Подклассы могут заменять своих родителей
- [x] Поведение остаётся предсказуемым
- [x] Все реализации имеют одинаковый интерфейс

**Пример:**
```javascript
class PriceService {
  static async fetchPrice(ticker) { }
}

// ✅ Может безопасно заменить PriceService
class MoexPriceService extends PriceService {
  static async fetchPrice(ticker) { /* реальный API */ }
}

// ✅ Может безопасно заменить PriceService
class MockPriceService extends PriceService {
  static async fetchPrice(ticker) { /* симуляция */ }
}

// Везде где используется PriceService, можно использовать любую реализацию
const priceService = process.env.NODE_ENV === 'test' 
  ? MockPriceService 
  : MoexPriceService;

const prices = await priceService.fetchPrices(tickers); // Работает везде!
```

### I - Interface Segregation Principle
- [x] Классы имеют узкие интерфейсы
- [x] Не реализуют то, что им не нужно
- [x] Клиент не зависит от неиспользуемых методов

**Пример:**
```javascript
// ✅ Узкий интерфейс
class PriceService {
  static async fetchPrice(ticker) { }
  static async fetchPrices(tickers) { }
  // Только цены - больше ничего
}

// ❌ Перегруженный интерфейс
class FinanceService {
  async fetchPrice(ticker) { }
  async fetchPrices(tickers) { }
  async fetchDividends(ticker) { }
  async calculateIncome() { }
  async manageTaxes() { }
  async reportToRussianFederalService() { }
  // Слишком много методов для одного класса!
}

// Если нужны дивиденды, создаём отдельный сервис
class DividendService {
  async fetchDividends(ticker) { }
}
```

### D - Dependency Inversion Principle
- [x] Зависим от абстракций, не от конкретизаций
- [x] Классы не создают свои зависимости
- [x] Инъекция зависимостей (если нужна)

**Пример:**
```javascript
// ✅ Правильно: зависит от абстракции
function PortfolioRebalancer() {
  const handleRefreshPrices = async () => {
    // Используем PriceService как "чёрный ящик"
    const prices = await PriceService.fetchPrices(tickers);
    // Не важно, откуда берутся цены - работает одинаково
  };
}

// ❌ Неправильно: тесно связана с конкретной реализацией
class PortfolioRebalancer {
  async handleRefreshPrices() {
    // Напрямую обращаемся к Мосбирже
    const response = await fetch('https://www.moex.com/api/...');
    // Если Мосбиржа поменяет API - ломаем код!
  }
}
```

---

## 🚀 PERFORMANCE OPTIMIZATION

### State Management
- [x] Минимальное состояние (только то, что меняется)
- [x] Derived state вместо дублирования
- [x] Вычисления через useMemo
- [x] Обработчики через useCallback

**Чек-лист:**
```javascript
// ✅ Правильно: минимальное состояние
const [assets, setAssets] = useState([...]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

const analysis = useMemo(() => {
  return PortfolioCalculator.analyzePortfolio(assets);
}, [assets]); // Вычисляется автоматически

// ❌ Неправильно: дублирование
const [assets, setAssets] = useState([...]);
const [analysis, setAnalysis] = useState([...]); // Может рассинхронизироваться!
const [totalValue, setTotalValue] = useState(0); // Тоже дублируется!
```

### useCallback
- [x] Обработчики событий оборачиваются в useCallback
- [x] Зависимости правильно указаны
- [x] Избегаем пересоздания функций

**Пример:**
```javascript
// ✅ Правильно
const handleUpdateAsset = useCallback((updatedAsset) => {
  setAssets(prevAssets => /* обновление */);
}, []); // Нет зависимостей - функция не пересоздаётся

// ❌ Неправильно
const handleUpdateAsset = (updatedAsset) => {
  // Пересоздаётся при каждом рендере!
  setAssets(prevAssets => /* обновление */);
};

// ❌ Неправильно
const handleUpdateAsset = useCallback((updatedAsset) => {
  setAssets([...assets, updatedAsset]); // Использует assets
}, [assets]); // Но зависимостей нет!
```

### Мемоизация
- [x] Используем useMemo для дорогих вычислений
- [x] Не оборачиваем всё подряд
- [x] Измеряем действительно ли помогает

```javascript
// ✅ Правильно: дорогое вычисление
const analysis = useMemo(() => {
  return PortfolioCalculator.analyzePortfolio(assets); // O(n)
}, [assets]);

// ❌ Неправильно: тривиальное вычисление
const reversed = useMemo(() => {
  return assets.slice().reverse(); // Премature optimization
}, [assets]);
```

---

## 🧪 TESTING

### Тестируемость архитектуры
- [x] Бизнес-логика может тестироваться без React
- [x] Классы Domain Layer полностью независимы
- [x] Можно использовать любой фреймворк (Jest, Mocha и т.д.)

**Пример:**
```javascript
// ✅ Правильно: тестируется без React
test('должен вычислить стоимость портфеля', () => {
  const assets = [{ quantity: 10, price: 100 }];
  const total = PortfolioCalculator.calculateTotalValue(assets);
  expect(total).toBe(1000);
});

// ❌ Неправильно: нужно монтировать React компонент
test('должен отобразить стоимость', () => {
  render(<Portfolio assets={assets} />);
  expect(screen.getByText('1000')).toBeInTheDocument();
  // Тестируем UI, а не логику!
});
```

### Покрытие тестами
- [x] Все методы Domain Layer покрыты тестами
- [x] Граничные случаи (edge cases) протестированы
- [x] Обработка ошибок протестирована
- [x] Интеграционные сценарии протестированы

---

## 🛡️ ERROR HANDLING

### Обработка ошибок везде
- [x] Try-catch при загрузке данных
- [x] Валидация данных перед использованием
- [x] Информативные сообщения об ошибках
- [x] Graceful degradation (изящная деградация)

**Пример:**
```javascript
// ✅ Правильно: полная обработка
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

// ❌ Неправильно: ошибки игнорируются
const handleRefreshPrices = async () => {
  const prices = await PriceService.fetchPrices(tickers);
  setAssets(prevAssets => /* может упасть! */);
};
```

### Валидация
- [x] Валидируем входные данные
- [x] Валидируем результаты вычислений
- [x] Валидируем состояние приложения

**Пример:**
```javascript
// ✅ Правильно: валидируем перед сохранением
const handleUpdateAsset = (updatedAsset) => {
  const validation = AssetValidator.validate(updatedAsset);
  
  if (!validation.isValid) {
    setError(validation.errors[0]);
    return; // Не сохраняем
  }
  
  setAssets(/* обновляем */);
};

// ✅ Правильно: валидируем портфель
const validation = AssetValidator.validatePortfolio(assets);
if (!validation.isValid) {
  // Показываем ошибку
}
```

---

## 💻 CODE QUALITY

### Naming Convention
- [x] Имена классов: PascalCase (PortfolioCalculator)
- [x] Имена методов: camelCase (calculateTotalValue)
- [x] Имена переменных: camelCase (totalValue, isLoading)
- [x] Имена функций React: PascalCase (AssetRow)
- [x] Имена boolean: is*, has*, can* (isLoading, hasError)

**Пример:**
```javascript
// ✅ Правильно
class PortfolioCalculator {
  static calculateTotalValue(assets) { }
}

function AssetRow({ asset, onUpdate }) { }
const isLoading = true;
const hasError = false;
const canAddAsset = assets.length < 100;

// ❌ Неправильно
class portfolio_calculator {
  static calculate_total_value(assets) { }
}

function assetRow({ asset, onUpdate }) { }
const loading = true;
const error = false;
const addAsset = assets.length < 100;
```

### DRY - Don't Repeat Yourself
- [x] Нет дублирования логики
- [x] Переиспользуемые функции
- [x] Общие константы вынесены
- [x] Утилиты в отдельных модулях

**Пример:**
```javascript
// ✅ Правильно: логика в одном месте
class PortfolioCalculator {
  static calculateTotalValue(assets) {
    return assets.reduce((sum, a) => sum + (a.quantity * a.price), 0);
  }
}

// Используем везде
const total = PortfolioCalculator.calculateTotalValue(assets);

// ❌ Неправильно: дублирование
function AssetRow() {
  const value = asset.quantity * asset.price;
}

function PortfolioSummary() {
  const values = assets.map(a => a.quantity * a.price);
}

function exportPortfolio() {
  const total = assets.reduce((s, a) => s + (a.quantity * a.price), 0);
}
```

### KISS - Keep It Simple, Stupid
- [x] Код понятен на первый взгляд
- [x] Нет излишней сложности
- [x] Нет "если потом понадобится"
- [x] Простые решения лучше сложных

**Пример:**
```javascript
// ✅ Правильно: просто и понятно
function calculateTax(income) {
  return income * TAX_RATE;
}

// ❌ Неправильно: излишне сложно
function calculateTax(income, ...args) {
  const config = args[0] || {};
  const rate = config.rate || TAX_RATE;
  const minIncome = config.minIncome || 0;
  const maxIncome = config.maxIncome || Infinity;
  
  if (income < minIncome || income > maxIncome) {
    return 0;
  }
  
  // ... ещё 20 строк кода
}
```

### Комментарии
- [x] Комментарии объясняют "почему", не "что"
- [x] Код должен быть самоочевидным
- [x] Плохие комментарии удаляются

**Пример:**
```javascript
// ✅ Правильно: объясняем причину
// Используем Map для кэширования, так как часто запрашиваем одни и те же цены
static priceCache = new Map();

// ✅ Правильно: сложная логика объяснена
// Парсим последнюю строку (индекс -1), текущая цена в индексе 2
const price = rows[rows.length - 1][2];

// ❌ Неправильно: очевидные вещи
const total = 0; // переменная total
total += asset.price; // прибавляем цену

// ❌ Неправильно: неправильные комментарии
const x = 10; // x равно 10 (ну очевидно!)
```

---

## 📦 DEPENDENCY MANAGEMENT

### Минимальные зависимости
- [x] Используем встроенные JS функции (array.reduce, Object.keys)
- [x] Не импортируем библиотеки для простого
- [x] Проверяем действительно ли нужна зависимость

**Зависимости приложения:**
```json
{
  "dependencies": {
    "react": "^18.0.0",
    "lucide-react": "latest"  // только иконки
  },
  "devDependencies": {
    "tailwindcss": "latest"  // утилити классы
  }
}
```

### Версионирование
- [x] Используем semantic versioning (semver)
- [x] Фиксируем мажорные версии
- [x] Обновляем регулярно

```json
{
  "react": "^18.0.0"    // ✅ Минорные обновления разрешены
}
```

---

## 🎨 UI/UX BEST PRACTICES

### Доступность (Accessibility)
- [x] Семантический HTML (table, button, label)
- [x] Правильные ARIA атрибуты (если нужно)
- [x] Клавиатурная навигация
- [x] Достаточный контраст цветов

```html
<!-- ✅ Правильно: семантический -->
<button onClick={handleClick}>Обновить цены</button>
<table>
  <thead>...</thead>
  <tbody>...</tbody>
</table>

<!-- ❌ Неправильно: div вместо button -->
<div onClick={handleClick}>Обновить цены</div>
```

### Responsive Design
- [x] Мобильный фёст (mobile-first approach)
- [x] Работает на всех размерах экранов
- [x] Используем flexbox/grid

```css
/* ✅ Правильно: мобильный первый */
.container {
  padding: 1rem;
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .container {
    grid-template-columns: 1fr 1fr;
  }
}
```

### User Feedback
- [x] Ошибки понятны пользователю
- [x] Успешные действия подтверждаются
- [x] Loading states показаны
- [x] Пустые состояния обработаны

---

## 📊 METRICS & MONITORING

### Отслеживание качества
- [x] Код написан по стандартам
- [x] Тесты пройдены
- [x] Нет консольных ошибок
- [x] Performance приемлем

**Инструменты:**
```bash
# ESLint - проверка кода
npm install --save-dev eslint

# Prettier - форматирование
npm install --save-dev prettier

# Jest - тесты
npm install --save-dev jest

# Lighthouse - performance аудит
npm run build
npx lighthouse http://localhost:3000
```

---

## ✅ PRE-COMMIT CHECKLIST

Перед коммитом убедитесь:

- [ ] Код работает (no console errors)
- [ ] Написаны/обновлены тесты
- [ ] Покрытие тестами >= 80%
- [ ] Код отформатирован (prettier)
- [ ] Нет линт ошибок (eslint)
- [ ] Комментарии объясняют "почему"
- [ ] Нет console.log в production коде
- [ ] Нет commented code
- [ ] Имена переменных понятны
- [ ] Нет дублирования кода
- [ ] Обработка ошибок везде
- [ ] Валидация входных данных
- [ ] Производительность проверена
- [ ] Доступность (accessibility) OK
- [ ] Документация обновлена

---

## 📚 REFERENCE

### Ссылки на стандарты
- **SOLID принципы:** https://en.wikipedia.org/wiki/SOLID
- **Clean Code:** https://www.oreilly.com/library/view/clean-code-a/9780136083238/
- **React Best Practices:** https://react.dev/learn
- **Web Accessibility:** https://www.w3.org/WAI/
- **MDN Web Docs:** https://developer.mozilla.org/

---

**Используйте этот чек-лист как напоминание о best practices! 🚀**
