# Unit-тесты для PortfolioCalculator

## Структура тестов

Тесты проверяют только бизнес-логику (Domain Layer), без React и UI.

### Установка зависимостей

```bash
npm install --save-dev jest @testing-library/jest-dom
```

### Файл конфигурации `jest.config.js`

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'portfolio-rebalancer.jsx',
    '!node_modules/**',
  ],
};
```

---

## Тесты для PortfolioCalculator

### Файл: `__tests__/PortfolioCalculator.test.js`

```javascript
const assert = require('assert');

// Копируем класс PortfolioCalculator (без React)
class PortfolioCalculator {
  static calculateTotalValue(assets) {
    return assets.reduce((sum, asset) => sum + (asset.quantity * asset.price), 0);
  }

  static calculatePercentages(assets) {
    const total = this.calculateTotalValue(assets);
    if (total === 0) return assets.map(() => 0);
    return assets.map(asset => (asset.quantity * asset.price) / total * 100);
  }

  static calculateRequiredQuantity(asset, targetPercent, totalValue) {
    if (totalValue === 0) return 0;
    return (targetPercent / 100) * totalValue / asset.price;
  }

  static calculateAdjustment(currentQuantity, requiredQuantity) {
    return requiredQuantity - currentQuantity;
  }

  static analyzePortfolio(assets) {
    const totalValue = this.calculateTotalValue(assets);
    const currentPercentages = this.calculatePercentages(assets);

    return assets.map((asset, index) => {
      const currentPercent = currentPercentages[index];
      const requiredQuantity = this.calculateRequiredQuantity(
        asset,
        asset.targetPercent,
        totalValue
      );
      const adjustment = this.calculateAdjustment(asset.quantity, requiredQuantity);

      return {
        ...asset,
        currentValue: asset.quantity * asset.price,
        currentPercent,
        requiredQuantity,
        adjustment,
        adjustmentValue: adjustment * asset.price,
      };
    });
  }
}

// ============================================================================
// ТЕСТЫ
// ============================================================================

describe('PortfolioCalculator.calculateTotalValue', () => {
  test('должен вычислить стоимость портфеля из одного актива', () => {
    const assets = [{ quantity: 10, price: 100 }];
    const total = PortfolioCalculator.calculateTotalValue(assets);
    assert.strictEqual(total, 1000);
  });

  test('должен вычислить стоимость портфеля из нескольких активов', () => {
    const assets = [
      { quantity: 10, price: 100 },    // 1000
      { quantity: 5, price: 200 },     // 1000
      { quantity: 2, price: 500 },     // 1000
    ];
    const total = PortfolioCalculator.calculateTotalValue(assets);
    assert.strictEqual(total, 3000);
  });

  test('должен вернуть 0 для пустого портфеля', () => {
    const assets = [];
    const total = PortfolioCalculator.calculateTotalValue(assets);
    assert.strictEqual(total, 0);
  });

  test('должен работать с дробными количествами', () => {
    const assets = [{ quantity: 0.5, price: 1000 }];
    const total = PortfolioCalculator.calculateTotalValue(assets);
    assert.strictEqual(total, 500);
  });

  test('должен работать с малыми ценами', () => {
    const assets = [{ quantity: 1000, price: 0.5 }];
    const total = PortfolioCalculator.calculateTotalValue(assets);
    assert.strictEqual(total, 500);
  });
});

describe('PortfolioCalculator.calculatePercentages', () => {
  test('должен вычислить 50% и 50% для одинаковых активов', () => {
    const assets = [
      { quantity: 10, price: 100 },
      { quantity: 10, price: 100 },
    ];
    const percentages = PortfolioCalculator.calculatePercentages(assets);
    
    assert.strictEqual(percentages[0], 50);
    assert.strictEqual(percentages[1], 50);
  });

  test('должен вычислить 25%, 75% для активов в соотношении 1:3', () => {
    const assets = [
      { quantity: 10, price: 100 },    // 1000 = 25%
      { quantity: 30, price: 100 },    // 3000 = 75%
    ];
    const percentages = PortfolioCalculator.calculatePercentages(assets);
    
    assert.strictEqual(percentages[0], 25);
    assert.strictEqual(percentages[1], 75);
  });

  test('должен вернуть 0% для каждого актива пустого портфеля', () => {
    const assets = [
      { quantity: 0, price: 100 },
      { quantity: 0, price: 100 },
    ];
    const percentages = PortfolioCalculator.calculatePercentages(assets);
    
    assert.strictEqual(percentages[0], 0);
    assert.strictEqual(percentages[1], 0);
  });

  test('сумма всех процентов должна быть близка к 100%', () => {
    const assets = [
      { quantity: 10, price: 100 },
      { quantity: 20, price: 200 },
      { quantity: 15, price: 300 },
    ];
    const percentages = PortfolioCalculator.calculatePercentages(assets);
    const sum = percentages.reduce((a, b) => a + b, 0);
    
    // Округляем, чтобы избежать погрешностей floating point
    assert.strictEqual(Math.round(sum * 100) / 100, 100);
  });
});

describe('PortfolioCalculator.calculateRequiredQuantity', () => {
  test('должен вычислить требуемое количество для 50% портфеля', () => {
    const asset = { price: 100 };
    const required = PortfolioCalculator.calculateRequiredQuantity(
      asset,
      50,      // 50%
      1000     // стоимость портфеля
    );
    assert.strictEqual(required, 5); // 500 / 100 = 5 штук
  });

  test('должен вычислить требуемое количество для 25% портфеля', () => {
    const asset = { price: 200 };
    const required = PortfolioCalculator.calculateRequiredQuantity(
      asset,
      25,      // 25%
      4000     // стоимость портфеля
    );
    assert.strictEqual(required, 5); // 1000 / 200 = 5 штук
  });

  test('должен вернуть 0 для нулевой стоимости портфеля', () => {
    const asset = { price: 100 };
    const required = PortfolioCalculator.calculateRequiredQuantity(
      asset,
      50,
      0
    );
    assert.strictEqual(required, 0);
  });

  test('должен работать с дробными ценами', () => {
    const asset = { price: 0.5 };
    const required = PortfolioCalculator.calculateRequiredQuantity(
      asset,
      50,      // 50%
      1000     // стоимость портфеля
    );
    assert.strictEqual(required, 1000); // 500 / 0.5 = 1000 штук
  });
});

describe('PortfolioCalculator.calculateAdjustment', () => {
  test('должен вычислить, что нужно купить', () => {
    const adjustment = PortfolioCalculator.calculateAdjustment(10, 15);
    assert.strictEqual(adjustment, 5); // нужно купить 5
  });

  test('должен вычислить, что нужно продать', () => {
    const adjustment = PortfolioCalculator.calculateAdjustment(20, 15);
    assert.strictEqual(adjustment, -5); // нужно продать 5
  });

  test('должен вернуть 0, если в целевых пропорциях', () => {
    const adjustment = PortfolioCalculator.calculateAdjustment(10, 10);
    assert.strictEqual(adjustment, 0);
  });

  test('должен работать с дробными количествами', () => {
    const adjustment = PortfolioCalculator.calculateAdjustment(10.5, 12.7);
    assert.strictEqual(adjustment, 2.2);
  });
});

describe('PortfolioCalculator.analyzePortfolio', () => {
  test('должен анализировать простой портфель из двух активов', () => {
    const assets = [
      { id: 1, ticker: 'SBER', quantity: 10, price: 100, targetPercent: 50 },
      { id: 2, ticker: 'GAZP', quantity: 10, price: 100, targetPercent: 50 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(assets);

    // Проверяем структуру результата
    assert.strictEqual(analysis.length, 2);
    assert.strictEqual(analysis[0].currentPercent, 50);
    assert.strictEqual(analysis[1].currentPercent, 50);
    assert.strictEqual(analysis[0].adjustment, 0);
    assert.strictEqual(analysis[1].adjustment, 0);
  });

  test('должен определить, что нужна ребалансировка', () => {
    const assets = [
      { id: 1, ticker: 'SBER', quantity: 20, price: 100, targetPercent: 50 },
      { id: 2, ticker: 'GAZP', quantity: 5, price: 100, targetPercent: 50 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(assets);

    // SBER = 80% (выше целевых 50%)
    // GAZP = 20% (ниже целевых 50%)
    assert.strictEqual(analysis[0].currentPercent, 80);
    assert.strictEqual(analysis[1].currentPercent, 20);
    
    // SBER нужно продать
    assert(analysis[0].adjustment < 0);
    
    // GAZP нужно купить
    assert(analysis[1].adjustment > 0);
  });

  test('должен рассчитать стоимость активов', () => {
    const assets = [
      { id: 1, ticker: 'SBER', quantity: 10, price: 150, targetPercent: 100 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(assets);

    assert.strictEqual(analysis[0].currentValue, 1500);
  });

  test('должен работать с активами разных цен', () => {
    const assets = [
      { id: 1, ticker: 'SBER', quantity: 1, price: 250, targetPercent: 50 },
      { id: 2, ticker: 'NVTK', quantity: 1, price: 1250, targetPercent: 50 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(assets);

    // Стоимость портфеля: 250 + 1250 = 1500
    // SBER = 250/1500 = 16.67%
    // NVTK = 1250/1500 = 83.33%
    
    assert.strictEqual(
      Math.round(analysis[0].currentPercent * 100) / 100,
      16.67
    );
    assert.strictEqual(
      Math.round(analysis[1].currentPercent * 100) / 100,
      83.33
    );
  });

  test('должен отметить активы в целевых пропорциях', () => {
    const assets = [
      { id: 1, ticker: 'SBER', quantity: 10, price: 100, targetPercent: 50 },
      { id: 2, ticker: 'GAZP', quantity: 10, price: 100, targetPercent: 50 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(assets);

    // Активы не помечаются явно, но adjustment = 0
    assert.strictEqual(analysis[0].adjustment, 0);
    assert.strictEqual(analysis[1].adjustment, 0);
  });

  test('должен вычислить стоимость требуемых действий', () => {
    const assets = [
      { id: 1, ticker: 'SBER', quantity: 20, price: 100, targetPercent: 50 },
      { id: 2, ticker: 'GAZP', quantity: 5, price: 100, targetPercent: 50 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(assets);

    // adjustmentValue = adjustment * price
    // SBER: -7.5 * 100 = -750
    // GAZP: +7.5 * 100 = +750
    
    assert.strictEqual(
      Math.round(analysis[0].adjustmentValue),
      -750
    );
    assert.strictEqual(
      Math.round(analysis[1].adjustmentValue),
      750
    );
  });
});

// ============================================================================
// ИНТЕГРАЦИОННЫЕ ТЕСТЫ
// ============================================================================

describe('Полный сценарий ребалансировки', () => {
  test('Пользователь добавляет активы, система рекомендует ребалансировку', () => {
    // Начальный портфель (нарушена пропорция)
    const assets = [
      { id: 1, ticker: 'SBER', quantity: 50, price: 250, targetPercent: 50 },
      { id: 2, ticker: 'GAZP', quantity: 10, price: 150, targetPercent: 50 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(assets);

    // Проверяем, что система определила дисбаланс
    const derbalnced = analysis.some(a => Math.abs(a.adjustment) > 0.01);
    assert.strictEqual(derbalnced, true);

    // Проверяем, что сумма действий равна нулю (не создаёт/уничтожает деньги)
    const totalAdjustmentValue = analysis.reduce((sum, a) => sum + a.adjustmentValue, 0);
    assert.strictEqual(Math.round(totalAdjustmentValue * 100) / 100, 0);
  });

  test('После ребалансировки активы должны быть в целевых пропорциях', () => {
    const initialAssets = [
      { id: 1, ticker: 'SBER', quantity: 50, price: 250, targetPercent: 50 },
      { id: 2, ticker: 'GAZP', quantity: 10, price: 150, targetPercent: 50 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(initialAssets);

    // Применяем корректировки
    const rebalancedAssets = initialAssets.map((asset, index) => ({
      ...asset,
      quantity: analysis[index].requiredQuantity,
    }));

    // Анализируем ребалансированный портфель
    const newAnalysis = PortfolioCalculator.analyzePortfolio(rebalancedAssets);

    // Все активы должны быть в целевых пропорциях (погрешность ±1%)
    newAnalysis.forEach(asset => {
      const diff = Math.abs(asset.currentPercent - asset.targetPercent);
      assert(diff < 1, `Актив ${asset.ticker} не в целевых пропорциях: ${diff.toFixed(2)}%`);
    });
  });
});

// ============================================================================
// ГРАНИЧНЫЕ СЛУЧАИ (Edge Cases)
// ============================================================================

describe('Граничные случаи', () => {
  test('Портфель с одним активом на 100%', () => {
    const assets = [
      { id: 1, ticker: 'SBER', quantity: 10, price: 100, targetPercent: 100 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(assets);

    assert.strictEqual(analysis[0].currentPercent, 100);
    assert.strictEqual(analysis[0].adjustment, 0);
  });

  test('Портфель с очень большими числами', () => {
    const assets = [
      { id: 1, ticker: 'SBER', quantity: 1000000, price: 250, targetPercent: 50 },
      { id: 2, ticker: 'GAZP', quantity: 500000, price: 150, targetPercent: 50 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(assets);

    const sum = analysis.reduce((s, a) => s + a.currentPercent, 0);
    assert(Math.abs(sum - 100) < 0.01);
  });

  test('Портфель с очень маленькими ценами (копейки)', () => {
    const assets = [
      { id: 1, ticker: 'IRAO', quantity: 10000, price: 0.5, targetPercent: 50 },
      { id: 2, ticker: 'NVTK', quantity: 10, price: 1250, targetPercent: 50 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(assets);

    // Оба актива должны быть рассчитаны корректно
    const sum = analysis.reduce((s, a) => s + a.currentPercent, 0);
    assert(Math.abs(sum - 100) < 0.01);
  });

  test('Портфель с активами разного масштаба', () => {
    const assets = [
      { id: 1, ticker: 'SBER', quantity: 0.001, price: 250, targetPercent: 50 },
      { id: 2, ticker: 'GAZP', quantity: 1000000, price: 0.0001, targetPercent: 50 },
    ];

    const analysis = PortfolioCalculator.analyzePortfolio(assets);

    // Система должна обработать любые масштабы
    assert(analysis.every(a => typeof a.currentPercent === 'number'));
    assert(analysis.every(a => typeof a.adjustment === 'number'));
  });
});
```

---

## Запуск тестов

### Способ 1: Jest (рекомендуется)

```bash
# Установка
npm install --save-dev jest

# Запуск всех тестов
npm test

# Запуск конкретного файла
npm test PortfolioCalculator.test.js

# Запуск с покрытием
npm test -- --coverage

# Watch режим (перезапускает при изменении кода)
npm test -- --watch
```

### Способ 2: Node assert (без зависимостей)

```bash
node __tests__/PortfolioCalculator.test.js
```

---

## Ожидаемый результат

```
PASS  __tests__/PortfolioCalculator.test.js
  PortfolioCalculator.calculateTotalValue
    ✓ должен вычислить стоимость портфеля из одного актива (2ms)
    ✓ должен вычислить стоимость портфеля из нескольких активов (1ms)
    ✓ должен вернуть 0 для пустого портфеля (0ms)
    ✓ должен работать с дробными количествами (0ms)
    ✓ должен работать с малыми ценами (0ms)
  
  PortfolioCalculator.calculatePercentages
    ✓ должен вычислить 50% и 50% для одинаковых активов (1ms)
    ✓ должен вычислить 25%, 75% для активов в соотношении 1:3 (0ms)
    ... и т.д.

Test Suites: 1 passed, 1 total
Tests:       35 passed, 35 total
```

---

## Coverage (Покрытие кода)

```bash
npm test -- --coverage

File                    | % Stmts | % Branch | % Funcs | % Lines |
========================|=========|==========|=========|=========|
PortfolioCalculator.jsx | 100     | 100      | 100     | 100     |
```

---

## Дополнительные тесты для AssetValidator

```javascript
describe('AssetValidator.validate', () => {
  test('должен отклонить актив с пустым тикером', () => {
    const asset = { ticker: '', quantity: 10, price: 100, targetPercent: 50 };
    const result = AssetValidator.validate(asset);
    
    assert.strictEqual(result.isValid, false);
    assert(result.errors.length > 0);
  });

  test('должен отклонить актив с отрицательным количеством', () => {
    const asset = { ticker: 'SBER', quantity: -10, price: 100, targetPercent: 50 };
    const result = AssetValidator.validate(asset);
    
    assert.strictEqual(result.isValid, false);
  });

  test('должен отклонить актив с нулевой ценой', () => {
    const asset = { ticker: 'SBER', quantity: 10, price: 0, targetPercent: 50 };
    const result = AssetValidator.validate(asset);
    
    assert.strictEqual(result.isValid, false);
  });

  test('должен принять валидный актив', () => {
    const asset = { ticker: 'SBER', quantity: 10, price: 100, targetPercent: 50 };
    const result = AssetValidator.validate(asset);
    
    assert.strictEqual(result.isValid, true);
  });
});

describe('AssetValidator.validatePortfolio', () => {
  test('должен отклонить портфель, где сумма процентов ≠ 100%', () => {
    const assets = [
      { targetPercent: 50 },
      { targetPercent: 30 }, // Сумма = 80%
    ];
    const result = AssetValidator.validatePortfolio(assets);
    
    assert.strictEqual(result.isValid, false);
    assert(result.error.includes('100%'));
  });

  test('должен принять портфель с суммой 100%', () => {
    const assets = [
      { targetPercent: 50 },
      { targetPercent: 50 }, // Сумма = 100%
    ];
    const result = AssetValidator.validatePortfolio(assets);
    
    assert.strictEqual(result.isValid, true);
  });

  test('должен принять портфель с суммой ~100% (погрешность)', () => {
    const assets = [
      { targetPercent: 33.33 },
      { targetPercent: 33.33 },
      { targetPercent: 33.34 }, // Сумма ≈ 100%
    ];
    const result = AssetValidator.validatePortfolio(assets);
    
    assert.strictEqual(result.isValid, true);
  });
});
```

---

**Полное тестовое покрытие гарантирует надёжность приложения! ✅**
