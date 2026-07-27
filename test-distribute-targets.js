/**
 * Тест для проверки логики распределения целей поровну
 * Запуск: node test-distribute-targets.js
 */

// Копируем логику из PortfolioCalculator для тестирования
function distributeTargets(assets) {
  if (assets.length === 0) return assets;

  const zeroAssets = assets.filter(a => a.targetPercent === 0);
  const nonzeroAssets = assets.filter(a => a.targetPercent > 0);

  // Случай 1: все нулевые — поделить 100% поровну
  if (zeroAssets.length === assets.length) {
    const equalPercent = 100 / assets.length;
    return assets.map((asset, index) => {
      if (index === assets.length - 1) {
        const allocated = (assets.length - 1) * parseFloat(equalPercent.toFixed(2));
        return { ...asset, targetPercent: parseFloat((100 - allocated).toFixed(2)) };
      }
      return { ...asset, targetPercent: parseFloat(equalPercent.toFixed(2)) };
    });
  }

  // Случай 2: есть и нулевые, и ненулевые
  if (zeroAssets.length > 0 && nonzeroAssets.length > 0) {
    const sumNonZero = nonzeroAssets.reduce((sum, a) => sum + a.targetPercent, 0);
    const remaining = 100 - sumNonZero;

    // Если остатка нет или он отрицательный — перераспределяем поровну между ВСЕМИ
    if (remaining <= 0) {
      const equalPercent = 100 / assets.length;
      return assets.map((asset, index) => {
        if (index === assets.length - 1) {
          const allocated = (assets.length - 1) * parseFloat(equalPercent.toFixed(2));
          return { ...asset, targetPercent: parseFloat((100 - allocated).toFixed(2)) };
        }
        return { ...asset, targetPercent: parseFloat(equalPercent.toFixed(2)) };
      });
    }

    const equalPart = remaining / zeroAssets.length;
    let zeroIndex = 0;
    return assets.map(asset => {
      if (asset.targetPercent === 0) {
        if (zeroIndex === zeroAssets.length - 1) {
          const allocated = (zeroAssets.length - 1) * parseFloat(equalPart.toFixed(2));
          return { ...asset, targetPercent: parseFloat((remaining - allocated).toFixed(2)) };
        }
        zeroIndex++;
        return { ...asset, targetPercent: parseFloat(equalPart.toFixed(2)) };
      }
      return asset;
    });
  }

  // Случай 3: все ненулевые — ничего не делаем
  return assets;
}

// Тесты
function test(name, assets, expected) {
  const result = distributeTargets(assets);
  const resultPercents = result.map(a => a.targetPercent);
  const expectedPercents = expected.map(a => a.targetPercent);

  const passed = JSON.stringify(resultPercents) === JSON.stringify(expectedPercents);
  console.log(`${passed ? '✅' : '❌'} ${name}`);
  if (!passed) {
    console.log(`  Ожидалось: ${expectedPercents.join(', ')}%`);
    console.log(`  Получено:  ${resultPercents.join(', ')}%`);
  }
}

console.log('🧪 Тестирование логики распределения целей поровну\n');

// Тест 1: Все нулевые (2 актива)
test(
  'Все нулевые (2 актива)',
  [
    { id: 1, ticker: 'SBER', targetPercent: 0 },
    { id: 2, ticker: 'GAZP', targetPercent: 0 }
  ],
  [
    { id: 1, ticker: 'SBER', targetPercent: 50.0 },
    { id: 2, ticker: 'GAZP', targetPercent: 50.0 }
  ]
);

// Тест 2: Все нулевые (3 актива)
test(
  'Все нулевые (3 актива)',
  [
    { id: 1, ticker: 'SBER', targetPercent: 0 },
    { id: 2, ticker: 'GAZP', targetPercent: 0 },
    { id: 3, ticker: 'NVTK', targetPercent: 0 }
  ],
  [
    { id: 1, ticker: 'SBER', targetPercent: 33.33 },
    { id: 2, ticker: 'GAZP', targetPercent: 33.33 },
    { id: 3, ticker: 'NVTK', targetPercent: 33.34 }
  ]
);

// Тест 3: Есть ненулевые и нулевые
test(
  'Есть ненулевые и нулевые (SBER 50%, остальные 0)',
  [
    { id: 1, ticker: 'SBER', targetPercent: 50 },
    { id: 2, ticker: 'GAZP', targetPercent: 0 },
    { id: 3, ticker: 'NVTK', targetPercent: 0 }
  ],
  [
    { id: 1, ticker: 'SBER', targetPercent: 50 },
    { id: 2, ticker: 'GAZP', targetPercent: 25.0 },
    { id: 3, ticker: 'NVTK', targetPercent: 25.0 }
  ]
);

// Тест 4: Все ненулевые — ничего не меняется
test(
  'Все ненулевые (без изменений)',
  [
    { id: 1, ticker: 'SBER', targetPercent: 60 },
    { id: 2, ticker: 'GAZP', targetPercent: 40 }
  ],
  [
    { id: 1, ticker: 'SBER', targetPercent: 60 },
    { id: 2, ticker: 'GAZP', targetPercent: 40 }
  ]
);

// Тест 5: Сумма >= 100% — перераспределение между всеми
test(
  'Сумма >= 100% (перераспределение)',
  [
    { id: 1, ticker: 'SBER', targetPercent: 60 },
    { id: 2, ticker: 'GAZP', targetPercent: 50 },
    { id: 3, ticker: 'NVTK', targetPercent: 0 }
  ],
  [
    { id: 1, ticker: 'SBER', targetPercent: 33.33 },
    { id: 2, ticker: 'GAZP', targetPercent: 33.33 },
    { id: 3, ticker: 'NVTK', targetPercent: 33.34 }
  ]
);

// Тест 6: Один нулевой актив
test(
  'Один нулевой актив',
  [
    { id: 1, ticker: 'SBER', targetPercent: 70 },
    { id: 2, ticker: 'GAZP', targetPercent: 0 }
  ],
  [
    { id: 1, ticker: 'SBER', targetPercent: 70 },
    { id: 2, ticker: 'GAZP', targetPercent: 30.0 }
  ]
);

console.log('\n✅ Все тесты завершены');