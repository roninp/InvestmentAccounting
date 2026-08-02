/**
 * Тест для проверки логики распределения целей поровну
 * Запуск: node test-distribute-targets.js
 */

// Копируем логику из PortfolioCalculator для тестирования
function distributeTargets(assets, emptyTargetIds = new Set()) {
  if (assets.length === 0) return assets;

  // Актив считается нулевым, если его цель равна 0, равна null/undefined
  // (blur очистил поле перед нажатием кнопки) или id в наборе пустых полей
  const isZeroAsset = (a) =>
    a.targetPercent === 0 ||
    a.targetPercent == null ||
    emptyTargetIds.has(a.id);
  const zeroAssets = assets.filter(isZeroAsset);
  const nonzeroAssets = assets.filter(a => !isZeroAsset(a));

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
      if (isZeroAsset(asset)) {
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
function test(name, assets, expected, emptyTargetIds = new Set()) {
  const result = distributeTargets(assets, emptyTargetIds);
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

// Тест 7: Пустое поле "Цель" (emptyTargetIds) — актив считается нулевым,
// остаток (100 - 50) делится между пустыми активами
test(
  'Пустое поле "Цель" (emptyTargetIds)',
  [
    { id: 1, ticker: 'SBER', targetPercent: 50 },
    { id: 2, ticker: 'GAZP', targetPercent: 50 },
    { id: 3, ticker: 'NVTK', targetPercent: 50 }
  ],
  [
    { id: 1, ticker: 'SBER', targetPercent: 50 },
    { id: 2, ticker: 'GAZP', targetPercent: 25.0 },
    { id: 3, ticker: 'NVTK', targetPercent: 25.0 }
  ],
  new Set([2, 3])
);

// Тест 8: targetPercent = null (blur очистил поле перед нажатием кнопки) —
// актив считается нулевым, даже если его id нет в emptyTargetIds.
// Остаток (100 - 50) делится между null-активом и нулевым активом.
test(
  'targetPercent = null (blur очистил поле)',
  [
    { id: 1, ticker: 'SBER', targetPercent: 50 },
    { id: 2, ticker: 'GAZP', targetPercent: null },
    { id: 3, ticker: 'NVTK', targetPercent: 0 }
  ],
  [
    { id: 1, ticker: 'SBER', targetPercent: 50 },
    { id: 2, ticker: 'GAZP', targetPercent: 25.0 },
    { id: 3, ticker: 'NVTK', targetPercent: 25.0 }
  ]
);

// Тест 9: targetPercent = null у одного актива и все остальные нулевые
// (имитация: пользователь очистил одно поле, остальные уже 0)
test(
  'targetPercent = null среди нулевых',
  [
    { id: 1, ticker: 'SBER', targetPercent: 0 },
    { id: 2, ticker: 'GAZP', targetPercent: null }
  ],
  [
    { id: 1, ticker: 'SBER', targetPercent: 50.0 },
    { id: 2, ticker: 'GAZP', targetPercent: 50.0 }
  ]
);

console.log('\n✅ Все тесты завершены');
