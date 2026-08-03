import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { TrendingUp, Plus, Trash2, RefreshCw, Calculator, CheckCircle, Clock, Scale } from 'lucide-react';

// ============================================================================
// DOMAIN LAYER - Бизнес-логика, независимая от UI
// ============================================================================

/**
 * Сервис расчета портфеля — S из SOLID (Single Responsibility)
 * Отвечает только за математику портфеля, не зависит от React
 */
class PortfolioCalculator {
  /**
   * Округление денежной суммы строго вниз до сотых долей.
   * Согласно правилам ребалансировки: все денежные значения округляются вниз.
   * @param {number} value - Исходное значение
   * @returns {number} Округлённое значение (2 знака после запятой)
   */
  static floorMoney(value) {
    return Math.floor(value * 100) / 100;
  }

  /**
   * Округление количества активов строго вниз до целого числа.
   * Согласно правилам ребалансировки: количество активов округляется вниз.
   * @param {number} value - Исходное значение
   * @returns {number} Округлённое значение (целое число)
   */
  static floorQuantity(value) {
    return Math.floor(value);
  }

  /**
   * Расчет суммы портфеля
   * @param {Array} assets - Массив активов
   * @returns {number} Сумма quantity * price по всем активам
   */
  static calculateTotalValue(assets) {
    return assets.reduce((sum, asset) => sum + (asset.quantity * asset.price), 0);
  }

  /**
   * Расчет процента портфеля для каждого актива
   * @param {Array} assets - Массив активов
   * @returns {number[]} Процент каждого актива от общей стоимости
   */
  static calculatePercentages(assets) {
    const total = this.calculateTotalValue(assets);
    if (total === 0) return assets.map(() => 0);
    return assets.map(asset => (asset.quantity * asset.price) / total * 100);
  }

  /**
   * Расчет требуемого количества активов для достижения целевого процента.
   * Количество округляется строго вниз до целого числа.
   * @param {Object} asset - Данные актива
   * @param {number} targetPercent - Целевой процент
   * @param {number} totalValue - Общая стоимость портфеля для расчёта
   * @returns {number} Требуемое количество единиц актива (целое, округлённое вниз)
   */
  static calculateRequiredQuantity(asset, targetPercent, totalValue) {
    if (totalValue === 0 || asset.price === 0) return 0;
    const raw = (targetPercent / 100) * totalValue / asset.price;
    return this.floorQuantity(raw);
  }

  /**
   * Расчет необходимых операций (сколько купить/продать)
   * @param {number} currentQuantity - Текущее количество
   * @param {number} requiredQuantity - Требуемое количество
   * @returns {number} Разница (положительная — докупить, отрицательная — продать)
   */
  static calculateAdjustment(currentQuantity, requiredQuantity) {
    return requiredQuantity - currentQuantity;
  }

  /**
   * Распределение целевых процентов между активами.
   * Если все targetPercent равны 0 — делит 100% поровну между всеми.
   * Если есть ненулевые и нулевые — оставшуюся долю (100 - сумма_ненулевых)
   * распределяет поровну между нулевыми. Если все ненулевые — ничего не меняет.
   * Актив считается нулевым, если его targetPercent === 0 ИЛИ его id находится
   * в наборе emptyTargetIds (поле "Цель" пустое, фокус ещё не потерян).
   * @param {Array} assets - Массив активов
   * @param {Set<number>} [emptyTargetIds] - Набор id активов с пустым полем "Цель"
   * @returns {Array} Новый массив с заполненными targetPercent
   */
  static distributeTargets(assets, emptyTargetIds = new Set()) {
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
          const allocated = (assets.length - 1) * parseFloat(equalPercent.toFixed(1));
          return { ...asset, targetPercent: parseFloat((100 - allocated).toFixed(1)) };
        }
        return { ...asset, targetPercent: parseFloat(equalPercent.toFixed(1)) };
      });
    }

    // Случай 2: есть и нулевые, и ненулевые
    if (zeroAssets.length > 0 && nonzeroAssets.length > 0) {
      const sumNonZero = nonzeroAssets.reduce((sum, a) => sum + a.targetPercent, 0);
      const remaining = 100 - sumNonZero;

      // Если остатка нет или он отрицательный (сумма >= 100%), 
      // перераспределяем поровну между ВСЕМИ активами
      if (remaining <= 0) {
        const equalPercent = 100 / assets.length;
        return assets.map((asset, index) => {
          if (index === assets.length - 1) {
            const allocated = (assets.length - 1) * parseFloat(equalPercent.toFixed(1));
            return { ...asset, targetPercent: parseFloat((100 - allocated).toFixed(1)) };
          }
          return { ...asset, targetPercent: parseFloat(equalPercent.toFixed(1)) };
        });
      }

      const equalPart = remaining / zeroAssets.length;
      let zeroIndex = 0;
      return assets.map(asset => {
        if (isZeroAsset(asset)) {
          if (zeroIndex === zeroAssets.length - 1) {
            const allocated = (zeroAssets.length - 1) * parseFloat(equalPart.toFixed(1));
            return { ...asset, targetPercent: parseFloat((remaining - allocated).toFixed(1)) };
          }
          zeroIndex++;
          return { ...asset, targetPercent: parseFloat(equalPart.toFixed(1)) };
        }
        return asset;
      });
    }

    // Случай 3: все ненулевые — ничего не делаем
    return assets;
  }

  /**
   * Полный анализ портфеля с учётом эффективной стоимости и лимита бюджета.
   * Активы, которые нужно докупить, ограничены доступным бюджетом.
   * Сумма покупок не может превышать availableBudget.
   *
   * @param {Array} assets - Массив активов
   * @param {number} effectiveTotalValue - Эффективная стоимость портфеля (портфель + добавка)
   * @param {number} [availableBudget] - Доступный бюджет на докупку (если не указан — без ограничения)
   * @returns {{ analysis: Array, cashSpent: number }} Объект с массивом анализа и суммой потраченных денег
   */
  static analyzePortfolio(assets, effectiveTotalValue = 0, availableBudget) {
    const currentPercentages = this.calculatePercentages(assets);
    const totalPortfolioValue = this.calculateTotalValue(assets);
    const effectiveValue = effectiveTotalValue > 0 ? effectiveTotalValue : totalPortfolioValue;

    // Предварительный расчёт без ограничений
    const rawAnalysis = assets.map((asset, index) => ({
      asset,
      currentPercent: currentPercentages[index],
      requiredQuantity: this.calculateRequiredQuantity(asset, asset.targetPercent, effectiveValue),
    }));

    // Выручка от продажи активов (adjustment < 0) — добавляется к бюджету
    // докупки, чтобы деньги от продаж использовались для покупки активов,
    // отстающих от целевой доли.
    const salesTotal = rawAnalysis.reduce((sum, { asset, requiredQuantity }) => {
      const adjustment = this.calculateAdjustment(asset.quantity, requiredQuantity);
      return adjustment < 0 ? sum + Math.abs(adjustment) * asset.price : sum;
    }, 0);

    // Бюджет докупки = доступные деньги + выручка от продаж.
    // cashSpent — нетто-эффект на остаток: покупки минус выручка от продаж.
    let budget = availableBudget != null ? availableBudget + salesTotal : Infinity;
    let cashSpent = 0;

    const analysis = rawAnalysis.map(({ asset, currentPercent, requiredQuantity }) => {
      const adjustment = this.calculateAdjustment(asset.quantity, requiredQuantity);
      let finalAdjustment = adjustment;
      let finalRequiredQuantity = requiredQuantity;

      // Если нужно докупить и бюджет ограничен
      if (adjustment > 0 && availableBudget != null) {
        const desiredCost = adjustment * asset.price;
        if (desiredCost > budget) {
          // Ограничиваем покупку оставшимся бюджетом
          const affordableQuantity = this.floorQuantity(budget / asset.price);
          finalAdjustment = affordableQuantity;
          finalRequiredQuantity = asset.quantity + affordableQuantity;
          const spent = this.floorMoney(affordableQuantity * asset.price);
          budget -= spent;
          cashSpent += spent;
        } else {
          const spent = this.floorMoney(desiredCost);
          budget -= spent;
          cashSpent += spent;
        }
      }

      return {
        ...asset,
        currentValue: asset.quantity * asset.price,
        currentPercent,
        requiredQuantity: finalRequiredQuantity,
        adjustment: finalAdjustment,
        adjustmentValue: this.floorMoney(finalAdjustment * asset.price),
        isOverweight: currentPercent > asset.targetPercent,
        isUnderweight: currentPercent < asset.targetPercent,
      };
    });

    // Возвращаем нетто-эффект: потраченные на покупки деньги за вычетом
    // выручки от продаж (если продажи больше покупок — значение отрицательное,
    // остаток на счету увеличивается).
    return { analysis, cashSpent: this.floorMoney(cashSpent - salesTotal) };
  }
}

/**
 * Сервис получения цен — I из SOLID (Interface Segregation)
 * Легко заменить на реальный API
 */
class PriceService {
  /**
   * Симуляция получения цены из Мосбиржи
   * @param {string} ticker - Тикер актива
   * @returns {Promise<number>} Цена актива
   */
  static async fetchPrice(ticker) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const prices = {
      'SBER': 245.50, 'GAZP': 145.20, 'NVTK': 1234.50,
      'POLY': 96.80, 'TATN': 89.40, 'MGNT': 3245.00,
      'MOEX': 156.75, 'IRAO': 0.5130,
    };
    if (prices[ticker.toUpperCase()]) {
      const noise = (Math.random() - 0.5) * prices[ticker.toUpperCase()] * 0.02;
      return prices[ticker.toUpperCase()] + noise;
    }
    throw new Error(`Актив ${ticker} не найден на Мосбирже`);
  }

  /**
   * Получить цены для нескольких активов параллельно
   * @param {string[]} tickers - Массив тикеров
   * @returns {Promise<number[]>} Массив цен
   */
  static async fetchPrices(tickers) {
    return Promise.all(tickers.map(ticker => this.fetchPrice(ticker)));
  }
}

/**
 * Валидатор активов — D из SOLID (Dependency Inversion)
 */
class AssetValidator {
  /**
   * Валидация одного актива
   * @param {Object} asset - Данные актива
   * @returns {{ isValid: boolean, errors: string[] }}
   */
  static validate(asset) {
    const errors = [];
    // Пустой тикер допустим на этапе ввода — блокировка снята
    if (asset.quantity < 0) errors.push('Количество не может быть отрицательным');
    if (asset.price <= 0) errors.push('Цена должна быть положительной');
    if (asset.targetPercent < 0 || asset.targetPercent > 100) errors.push('Целевой процент должен быть от 0 до 100');
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Валидация портфеля в целом (сумма процентов должна быть 100%)
   * @param {Array} assets - Массив активов
   * @returns {{ isValid: boolean, error?: string, shouldShow?: boolean }}
   */
  static validatePortfolio(assets) {
    const hasAnyTarget = assets.some(a => a.targetPercent > 0);
    if (!hasAnyTarget) return { isValid: true, shouldShow: false };

    const totalPercent = assets.reduce((sum, a) => sum + a.targetPercent, 0);
    if (Math.abs(totalPercent - 100) > 0.5) {
      return {
        isValid: false,
        shouldShow: true,
        error: `Сумма целевых процентов должна быть 100%, сейчас ${totalPercent.toFixed(2)}%`,
      };
    }
    return { isValid: true, shouldShow: true };
  }
}

// ============================================================================
// PERSISTENCE LAYER — Сохранение портфеля на стороне клиента
// ============================================================================

/**
 * Сервис сохранения портфеля — отвечает за чтение/запись в localStorage
 * и экспорт/импорт JSON-файлов.
 */
class PortfolioStorage {
  /** @type {string} Ключ для localStorage */
  static STORAGE_KEY = 'portfolioRebalancerData';

  /** @type {number} Версия формата данных (для будущей миграции) */
  static DATA_VERSION = 1;

  /**
   * Сохранить данные портфеля в localStorage.
   * @param {Object} data
   * @param {Array} data.assets - Массив активов
   * @param {number} data.nextId - Следующий id
   * @param {number|null} data.additionalInvestment - Добавочная сумма
   */
  static save(data) {
    try {
      const payload = {
        version: this.DATA_VERSION,
        savedAt: new Date().toISOString(),
        assets: data.assets,
        nextId: data.nextId,
        additionalInvestment: data.additionalInvestment,
        cashBalance: data.cashBalance ?? 0,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('[PortfolioStorage] Ошибка сохранения:', err.message);
    }
  }

  /**
   * Загрузить данные портфеля из localStorage.
   * Возвращает null, если данных нет, они повреждены или невалидны.
   * @returns {Object|null} Данные портфеля или null
   */
  static load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!this.validate(data)) return null;
      return {
        assets: data.assets,
        nextId: data.nextId,
        additionalInvestment: data.additionalInvestment ?? null,
        cashBalance: data.cashBalance ?? 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Удалить сохранённые данные из localStorage.
   */
  static clear() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {
      // Игнорируем ошибки очистки
    }
  }

  /**
   * Скачать данные портфеля как JSON-файл.
   * @param {Object} data - Данные для экспорта
   */
  static exportToFile(data) {
    try {
      const payload = {
        version: this.DATA_VERSION,
        exportedAt: new Date().toISOString(),
        assets: data.assets,
        nextId: data.nextId,
        additionalInvestment: data.additionalInvestment,
        cashBalance: data.cashBalance ?? 0,
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio_${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[PortfolioStorage] Ошибка экспорта:', err.message);
      throw err;
    }
  }

  /**
   * Прочитать и проверить JSON-файл импорта.
   * Возвращает данные или выбрасывает ошибку при невалидном формате.
   * @param {File} file - Файл из <input type="file">
   * @returns {Promise<Object>} Данные портфеля
   * @throws {Error} При ошибке чтения или невалидной структуре
   */
  static async importFromFile(file) {
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Ошибка чтения файла'));
      reader.readAsText(file);
    });

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Файл не является корректным JSON');
    }

    if (!this.validate(data)) {
      throw new Error('Неверный формат файла: отсутствуют обязательные поля или повреждена структура');
    }

    return {
      assets: data.assets,
      nextId: data.nextId,
      additionalInvestment: data.additionalInvestment ?? null,
      cashBalance: data.cashBalance ?? 0,
    };
  }

  /**
   * Проверить структуру загруженных данных.
   * @param {Object} data - Распарсенные данные
   * @returns {boolean} true — данные валидны
   */
  static validate(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.assets)) return false;
    return data.assets.every(a =>
      typeof a.id === 'number' &&
      typeof a.ticker === 'string' &&
      typeof a.quantity === 'number' &&
      typeof a.price === 'number' &&
      typeof a.targetPercent === 'number'
    );
  }
}

// ============================================================================
// UI LAYER - React компоненты
// ============================================================================

/**
 * Интеллектуальное числовое поле ввода.
 * Хранит сырое строковое значение во время редактирования — позволяет
 * полностью стереть содержимое поля, не блокируясь на NaN/0.
 * При потере фокуса парсит строку в число и убирает ведущие нули.
 *
 * @param {Object} props
 * @param {number} props.value - Текущее числовое значение
 * @param {Function} props.onChange - Колбэк с новым числовым значением (number)
 * @param {boolean} [props.isInteger] - Если true — допускает только целые числа
 * @param {Function} [props.onEmptyChange] - Колбэк, сообщающий о пустоте поля (true — поле пустое)
 * @param {Object} props.inputProps - Остальные атрибуты для <input>
 */
function NumericInput({ value, onChange, isInteger = false, onEmptyChange, ...inputProps }) {
  const [rawValue, setRawValue] = useState(String(value));

  // Актуальный колбэк onEmptyChange через ref — исключает лишние срабатывания
  // эффекта при каждом ререндере родителя (инлайн-стрелка в AssetRow создаётся заново).
  const onEmptyChangeRef = useRef(onEmptyChange);
  onEmptyChangeRef.current = onEmptyChange;

  // Синхронизация при изменении value извне (например, после распределения целей).
  // Зависим ТОЛЬКО от value: изменение onEmptyChange не должно перезаписывать
  // введённое пользователем значение (иначе стёртое число вернётся обратно).
  useEffect(() => {
    setRawValue(String(value));
    // Поле заполнено извне ненулевым значением — сообщаем родителю,
    // что актив больше не пустой (id удаляется из набора emptyTargetIds)
    if (value != null && value !== 0) {
      if (onEmptyChangeRef.current) onEmptyChangeRef.current(false);
    }
  }, [value]);

  /**
   * Обработка ввода: разрешает только числа (целые или с плавающей точкой)
   */
  const handleChange = (e) => {
    const v = e.target.value;
    if (isInteger) {
      // Только целые числа или пустая строка
      if (v === '' || /^\d+$/.test(v)) {
        setRawValue(v);
        // Сообщаем родителю о пустоте поля (для кнопки распределения целей)
        if (onEmptyChange) onEmptyChange(v === '');
      }
    } else {
      // Числа с плавающей точкой или пустая строка
      if (v === '' || /^\d+\.?\d*$/.test(v) || /^\d*\.?\d+$/.test(v)) {
        setRawValue(v);
        // Сообщаем родителю о пустоте поля (для кнопки распределения целей)
        if (onEmptyChange) onEmptyChange(v === '');
      }
    }
  };

  /**
   * При потере фокуса — парсим число, вызываем onChange,
   * убираем ведущие нули (показываем clean-представление)
   */
  const handleBlur = () => {
    const trimmed = rawValue.trim();
    if (trimmed === '') {
      onChange(0);
      setRawValue('0');
      // Не вызываем onEmptyChange(false), чтобы id актива остался в наборе
      // пустых полей — иначе при нажатии кнопки ⚖️ (blur срабатывает раньше click)
      // актив потеряет статус «нулевого» и распределение не выполнится.
      return;
    }
    const parsed = isInteger ? parseInt(trimmed, 10) : parseFloat(trimmed);
    const num = isNaN(parsed) ? 0 : parsed;
    onChange(num);
    setRawValue(String(num));
    // После потери фокуса поле всегда непустое (показывает число)
    if (onEmptyChange) onEmptyChange(false);
  };

  return (
    <input
      type="text"
      inputMode={isInteger ? 'numeric' : 'decimal'}
      value={rawValue}
      onChange={handleChange}
      onBlur={handleBlur}
      {...inputProps}
    />
  );
}

/**
 * Компонент строки актива.
 * Поля ввода (тикер, кол-во, цена, цель %) показываются ВСЕГДА.
 * Вычисляемые колонки (сумма, текущий %, требуется, купить/продать) — только после расчёта.
 *
 * @param {Object} props
 * @param {Object} props.asset - Данные актива
 * @param {Object|null} props.analysis - Результат анализа (null пока расчёт не сделан)
 * @param {Function} props.onUpdate - Колбэк обновления
 * @param {Function} props.onRemove - Колбэк удаления
 * @param {Function} props.onDistributeEqually - Колбэк распределения целей поровну
 * @param {Function} props.onTargetEmptyChange - Колбэк, сообщающий о пустоте поля "Цель" (id, isEmpty)
 * @param {boolean} props.isLoading - Флаг загрузки
 * @param {boolean} props.isLastAsset - Флаг единственного актива
 * @param {boolean} props.animate - Флаг анимации появления
 */
function AssetRow({ asset, analysis, onUpdate, onRemove, onDistributeEqually, onTargetEmptyChange, isLoading, isLastAsset, animate }) {
  const getAdjustmentColor = (adj) => {
    if (adj > 0.1) return 'text-green-600 bg-green-50';
    if (adj < -0.1) return 'text-red-600 bg-red-50';
    return 'text-gray-600';
  };

  const getPercentageColor = (current, target) => {
    if (Math.abs(current - target) < 1) return 'bg-emerald-100 text-emerald-900';
    if (current > target) return 'bg-amber-100 text-amber-900';
    return 'bg-blue-100 text-blue-900';
  };

  return (
    <tr className={`border-b border-slate-200 hover:bg-slate-50 transition-colors ${animate ? 'animate-fade-in' : ''}`}>
      {/* Тикер — всегда видно */}
      <td className="px-4 py-3 font-medium text-slate-900">
        <input
          type="text"
          value={asset.ticker}
          onChange={(e) => onUpdate({ ...asset, ticker: e.target.value.toUpperCase() })}
          className="w-32 px-2 py-1 border border-slate-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength="12"
          placeholder="ТИКЕР/ISIN"
        />
      </td>
      {/* Количество — всегда видно */}
      <td className="px-4 py-3">
        <NumericInput
          value={asset.quantity}
          onChange={(val) => onUpdate({ ...asset, quantity: val })}
          isInteger
          className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0"
        />
      </td>
      {/* Цена — всегда видно */}
      <td className="px-4 py-3 text-right font-mono">
        <NumericInput
          value={asset.price}
          onChange={(val) => onUpdate({ ...asset, price: val })}
          disabled={isLoading}
          className="w-24 ml-auto px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
          placeholder="0.00"
        />
      </td>
      {/* Сумма — вычисляемое поле */}
      <td className="px-4 py-3 text-right font-mono text-slate-900 font-medium">
        {analysis ? `${analysis.currentValue.toFixed(2)} ₽` : '—'}
      </td>
      {/* Цель % — всегда видно */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <NumericInput
            value={asset.targetPercent}
            onChange={(val) => onUpdate({ ...asset, targetPercent: val })}
            onEmptyChange={(isEmpty) => onTargetEmptyChange(asset.id, isEmpty)}
            className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0"
          />
          <button
            onClick={onDistributeEqually}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Распределить поровну между ненулевыми активами"
          >
            <Scale size={16} />
          </button>
        </div>
      </td>
      {/* Текущий % — вычисляемое поле */}
      <td className="px-4 py-3 text-center">
        {analysis ? (
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getPercentageColor(analysis.currentPercent, asset.targetPercent)}`}>
            {analysis.currentPercent.toFixed(1)}%
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      {/* Требуется — вычисляемое поле */}
      <td className="px-4 py-3 text-right font-mono text-sm">
        {analysis ? (
          <div className="text-slate-600">{Math.round(analysis.requiredQuantity)}</div>
        ) : (
          <div className="text-slate-400">—</div>
        )}
      </td>
      {/* Купить/Продать — вычисляемое поле */}
      <td className={`px-4 py-3 text-right font-mono font-medium ${analysis ? getAdjustmentColor(analysis.adjustment) : ''}`}>
        {analysis ? (
          <>
            <div>{analysis.adjustment > 0 ? '+' : ''}{Math.round(analysis.adjustment)}</div>
            <div className="text-xs mt-1">{analysis.adjustmentValue > 0 ? '+' : ''}{analysis.adjustmentValue.toFixed(2)} ₽</div>
          </>
        ) : (
          <div className="text-slate-400">—</div>
        )}
      </td>
      {/* Удалить — всегда видно */}
      <td className="px-4 py-3 text-center">
        <button
          onClick={() => onRemove(asset.id)}
          disabled={asset.id <= 2}
          className="p-1 text-slate-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Минимум 2 актива"
        >
          <Trash2 size={18} />
        </button>
      </td>
    </tr>
  );
}

/**
 * Заголовок таблицы — статический компонент.
 */
function PortfolioHeader() {
  return (
    <thead className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
      <tr>
        <th className="px-4 py-3 text-left text-sm font-semibold">Актив</th>
        <th className="px-4 py-3 text-left text-sm font-semibold">Кол-во</th>
        <th className="px-4 py-3 text-right text-sm font-semibold">Цена</th>
        <th className="px-4 py-3 text-right text-sm font-semibold">Сумма</th>
        <th className="px-4 py-3 text-left text-sm font-semibold">Цель %</th>
        <th className="px-4 py-3 text-center text-sm font-semibold">Текущий %</th>
        <th className="px-4 py-3 text-right text-sm font-semibold">Требуется</th>
        <th className="px-4 py-3 text-right text-sm font-semibold">Купить/Продать</th>
        <th className="px-4 py-3 text-center text-sm font-semibold">Удалить</th>
      </tr>
    </thead>
  );
}

/**
 * Сводка портфеля.
 */
function PortfolioSummary({ analysis, cashBalance, additionalCash, onAdditionalCashChange, onAddCash }) {
  const totalValue = PortfolioCalculator.calculateTotalValue(analysis);
  const totalAdjustmentValue = analysis.reduce((sum, a) => sum + Math.abs(a.adjustmentValue), 0);

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {/* Карточка «Деньги» — остаток свободных средств и поле добавления */}
      <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
        <div className="text-sm text-amber-600 font-medium mb-1">Деньги</div>
        <div className="text-2xl font-bold text-amber-900 mb-3">
          {cashBalance > 0 ? `${PortfolioCalculator.floorMoney(cashBalance).toFixed(2)} ₽` : ''}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={additionalCash === 0 ? '' : String(additionalCash)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^\d+\.?\d*$/.test(v) || /^\d*\.?\d+$/.test(v)) {
                onAdditionalCashChange(v === '' ? 0 : parseFloat(v));
              }
            }}
            className="w-28 px-2 py-1 border border-amber-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="Сумма"
          />
          <button
            onClick={onAddCash}
            disabled={additionalCash <= 0}
            className="px-3 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            ➕ Добавить
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
        <div className="text-sm text-blue-600 font-medium mb-1">Стоимость портфеля</div>
        <div className="text-2xl font-bold text-blue-900">{totalValue.toFixed(2)} ₽</div>
      </div>
      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
        <div className="text-sm text-purple-600 font-medium mb-1">Требуется ребалансировки</div>
        <div className="text-2xl font-bold text-purple-900">{totalAdjustmentValue.toFixed(2)} ₽</div>
      </div>
    </div>
  );
}

/**
 * Страница пользовательских настроек.
 * Настройки пока неактивные — визуальные заглушки без реализации логики.
 */
function SettingsPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Настройки</h2>
        <p className="text-slate-500 text-sm mb-6">Пользовательские настройки приложения</p>

        {/* Выключатель «Использовать группы» — заглушка */}
        <div className="flex items-center justify-between py-4 border-b border-slate-200">
          <div>
            <div className="font-medium text-slate-800">Использовать группы</div>
            <div className="text-sm text-slate-500">Группировка активов по категориям</div>
          </div>
          <button
            type="button"
            disabled
            className="relative w-12 h-6 rounded-full bg-slate-300 transition-colors cursor-not-allowed"
            aria-label="Использовать группы (неактивно)"
          >
            <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow" />
          </button>
        </div>

        {/* Процент брокера за покупку активов — заглушка */}
        <div className="flex items-center justify-between py-4 border-b border-slate-200">
          <div>
            <div className="font-medium text-slate-800">Процент брокера за покупку активов</div>
            <div className="text-sm text-slate-500">Комиссия при покупке, %</div>
          </div>
          <input
            type="text"
            inputMode="decimal"
            disabled
            placeholder=""
            className="w-28 px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
        </div>

        {/* Процент брокера за продажу активов — заглушка */}
        <div className="flex items-center justify-between py-4 border-b border-slate-200">
          <div>
            <div className="font-medium text-slate-800">Процент брокера за продажу активов</div>
            <div className="text-sm text-slate-500">Комиссия при продаже, %</div>
          </div>
          <input
            type="text"
            inputMode="decimal"
            disabled
            placeholder=""
            className="w-28 px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
        </div>

        <div className="mt-4 p-4 bg-slate-100 rounded-lg text-slate-600 text-sm">
          ⚙️ Настройки пока неактивны и будут реализованы позже.
        </div>
      </div>
    </div>
  );
}

/**
 * Главное приложение — Orchestrator.
 */
export default function PortfolioRebalancer() {
  // ========================================================================
  // STATE
  // ========================================================================

  const savedData = useMemo(() => PortfolioStorage.load(), []);
  const [assets, setAssets] = useState(() => savedData?.assets || [
    { id: 1, ticker: 'SBER', quantity: 10, price: 245.50, targetPercent: 50 },
    { id: 2, ticker: 'GAZP', quantity: 20, price: 145.20, targetPercent: 50 },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nextId, setNextId] = useState(() => savedData?.nextId ?? 3);

  /** Остаток свободных денежных средств */
  const [cashBalance, setCashBalance] = useState(() => savedData?.cashBalance ?? 0);
  /** Вводимая пользователем добавляемая сумма (пока не добавлена в cashBalance) */
  const [additionalCash, setAdditionalCash] = useState(0);
  
  /** Автосохранение портфеля в localStorage при любом изменении данных */
  useEffect(() => {
    PortfolioStorage.save({ assets, nextId, additionalInvestment: null, cashBalance });
  }, [assets, nextId, cashBalance]);

  /** Скрытая ref для импорта файла */
  const fileInputRef = useRef(null);

  /** Обработчик экспорта */
  const handleExport = useCallback(() => {
    try {
      PortfolioStorage.exportToFile({ assets, nextId, additionalInvestment: null, cashBalance });
    } catch (err) {
      setError(err.message);
    }
  }, [assets, nextId, cashBalance]);

  /** Обработчик импорта */
  const handleImport = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await PortfolioStorage.importFromFile(file);
      setAssets(data.assets);
      setNextId(data.nextId);
      if (data.cashBalance != null) setCashBalance(data.cashBalance);
      setAdditionalCash(0);
      resetCalculation();
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [resetCalculation]);

  /** Обработчик сброса — очистка localStorage и состояния */
  const handleReset = useCallback(() => {
    PortfolioStorage.clear();
    setAssets([]);
    setNextId(1);
    setCashBalance(0);
    setAdditionalCash(0);
    setCalculatedTotalValue(0);
    setIsCalculated(false);
    setEmptyTargetIds(new Set());
    setError(null);
  }, []);

  // Управление расчётом
  const [isCalculated, setIsCalculated] = useState(false);
  const [calculatedTotalValue, setCalculatedTotalValue] = useState(0);
  /** Результат анализа после нажатия «Рассчитать» (с учётом бюджета) */
  const [calculatedAnalysis, setCalculatedAnalysis] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [highlightCards, setHighlightCards] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);

  // Набор id активов, у которых поле "Цель" пустое (для кнопки распределения целей)
  const [emptyTargetIds, setEmptyTargetIds] = useState(() => new Set());

  /** Активная страница: 'portfolio' (портфель) или 'settings' (настройки) */
  const [activePage, setActivePage] = useState('portfolio');

  // ========================================================================
  // DERIVED
  // ========================================================================

  const analysis = useMemo(() => {
    if (!isCalculated) return [];
    // Используем сохранённый результат последнего нажатия «Рассчитать»
    // (с учётом бюджета), чтобы данные не менялись при каждом ререндере
    return calculatedAnalysis ?? [];
  }, [isCalculated, calculatedAnalysis]);

  const portfolioValidation = useMemo(() => AssetValidator.validatePortfolio(assets), [assets]);

  // ========================================================================
  // HELPERS
  // ========================================================================

  const resetCalculation = useCallback(() => { setIsCalculated(false); }, []);

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const handleUpdateAsset = useCallback((updatedAsset) => {
    const validation = AssetValidator.validate(updatedAsset);
    if (!validation.isValid) { setError(validation.errors[0]); return; }
    setAssets(prevAssets => {
      const oldAsset = prevAssets.find(a => a.id === updatedAsset.id);
      const updated = prevAssets.map(a => a.id === updatedAsset.id ? updatedAsset : a);
      // Сбрасываем расчёт при изменении тикера или целевого процента
      if (oldAsset && (oldAsset.ticker !== updatedAsset.ticker || oldAsset.targetPercent !== updatedAsset.targetPercent)) {
        setTimeout(() => resetCalculation(), 0);
      }
      return updated;
    });
    setError(null);
  }, [resetCalculation]);

  const handleAddAsset = useCallback(() => {
    setNextId(prev => prev + 1);
    setAssets(prevAssets => [...prevAssets, { id: nextId, ticker: '', quantity: 0, price: 0, targetPercent: 0 }]);
    setError(null);
    resetCalculation();
  }, [nextId, resetCalculation]);

  const handleRemoveAsset = useCallback((id) => {
    if (assets.length <= 2) return;
    setAssets(prevAssets => prevAssets.filter(a => a.id !== id));
    resetCalculation();
  }, [assets.length, resetCalculation]);

  const handleRefreshPrices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tickers = assets.map(a => a.ticker).filter(t => t);
      if (tickers.length === 0) { setError('Добавьте тикеры активов'); setLoading(false); return; }
      const prices = await PriceService.fetchPrices(tickers);
      setAssets(prevAssets => prevAssets.map((asset, index) => ({
        ...asset,
        price: prices[index] || asset.price,
      })));
      resetCalculation();
    } catch (err) {
      setError(`Ошибка получения цен: ${err.message}`);
    } finally { setLoading(false); }
  }, [assets, resetCalculation]);

  /** Добавить денежные средства из поля ввода к cashBalance */
  const handleAddCash = useCallback(() => {
    if (additionalCash > 0) {
      setCashBalance(prev => PortfolioCalculator.floorMoney(prev + additionalCash));
      setAdditionalCash(0);
    }
  }, [additionalCash]);

  const handleCalculate = useCallback(() => {
    setIsCalculating(true);
    const totalPortfolio = PortfolioCalculator.calculateTotalValue(assets);
    // Эффективная стоимость = портфель + деньги + добавляемая сумма
    const effectiveTotalValue = totalPortfolio + cashBalance + additionalCash;
    // Доступный бюджет: имеющиеся деньги + добавляемая сумма
    const budget = cashBalance + additionalCash;

    setTimeout(() => {
      setCalculatedTotalValue(effectiveTotalValue);
      // Выполняем анализ с ограничением бюджета
      const { analysis: calculatedAnalysis, cashSpent } = PortfolioCalculator.analyzePortfolio(
        assets,
        effectiveTotalValue,
        budget
      );
      // Списываем потраченные деньги: обнуляем additionalCash (она учтена),
      // вычитаем потраченное из cashBalance
      setCashBalance(prev => {
        const totalAvailable = prev + additionalCash;
        return PortfolioCalculator.floorMoney(totalAvailable - cashSpent);
      });
      setAdditionalCash(0);
      // Обновлённый calculatedAnalysis сохраним через отдельный стейт
      setCalculatedAnalysis(calculatedAnalysis);
      setIsCalculated(true);
      setIsCalculating(false);
      setAnimationKey(prev => prev + 1);
      setHighlightCards(true);
      setTimeout(() => setHighlightCards(false), 800);
    }, 400);
  }, [assets, cashBalance, additionalCash]);

  /**
   * Обработчик пустоты поля "Цель" для конкретного актива.
   * Добавляет/удаляет id актива в наборе emptyTargetIds.
   * @param {number} id - Идентификатор актива
   * @param {boolean} isEmpty - true, если поле "Цель" пустое
   */
  const handleTargetEmptyChange = useCallback((id, isEmpty) => {
    setEmptyTargetIds(prev => {
      const next = new Set(prev);
      if (isEmpty) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  /**
   * Распределить целевые проценты поровну между активами.
   * Использует готовую бизнес-логику из PortfolioCalculator.
   * Учитывает активы с пустым полем "Цель" (emptyTargetIds).
   */
  const handleDistributeEqually = useCallback(() => {
    setAssets(prevAssets => PortfolioCalculator.distributeTargets(prevAssets, emptyTargetIds));
  }, [emptyTargetIds]);

  // ========================================================================
  // RENDER
  // ========================================================================

  const canCalculate = assets.length > 0 && !isCalculating;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp size={32} />
            <h1 className="text-3xl font-bold">Ребалансировка портфеля</h1>
          </div>
          <p className="text-slate-400">Управление активами Мосбиржи с автоматическим расчетом ребалансировки</p>

          {/* Меню навигации */}
          <nav className="mt-4 flex gap-2">
            <button
              onClick={() => setActivePage('portfolio')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activePage === 'portfolio'
                  ? 'bg-white text-slate-900'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              Портфель
            </button>
            <button
              onClick={() => setActivePage('settings')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activePage === 'settings'
                  ? 'bg-white text-slate-900'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              Настройки
            </button>
          </nav>
        </div>
      </div>

      {activePage === 'settings' ? (
        <SettingsPage />
      ) : (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <PortfolioSummary
          analysis={analysis}
          cashBalance={cashBalance}
          additionalCash={additionalCash}
          onAdditionalCashChange={setAdditionalCash}
          onAddCash={handleAddCash}
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            ⚠️ {error}
          </div>
        )}

        {assets.length > 0 ? (
          <>
            <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
              <table className="w-full">
                <PortfolioHeader />
                <tbody key={animationKey}>
                  {assets.map((asset, index) => (
                    <AssetRow
                      key={asset.id}
                      asset={asset}
                      analysis={analysis.find(a => a.id === asset.id)}
                      onUpdate={handleUpdateAsset}
                      onRemove={handleRemoveAsset}
                      onDistributeEqually={handleDistributeEqually}
                      onTargetEmptyChange={handleTargetEmptyChange}
                      isLoading={loading}
                      isLastAsset={assets.length <= 2}
                      animate={isCalculated}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {portfolioValidation.shouldShow && !portfolioValidation.isValid && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                ⚠️ {portfolioValidation.error}
              </div>
            )}

            {!isCalculated && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
                💡 Нажмите <strong>«Рассчитать»</strong> для выполнения расчёта ребалансировки.
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-md border border-slate-200 p-8 text-center">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Портфель пуст</h3>
            <p className="text-slate-500 mb-4">Добавьте активы для расчёта ребалансировки</p>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleCalculate}
            disabled={!canCalculate}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium
              transition-all duration-300
              ${isCalculating
                ? 'bg-blue-500 text-white animate-pulse-glow cursor-wait'
                : isCalculated
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-200'
                  : canCalculate
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-400 text-white cursor-not-allowed'
              }
            `}
          >
            {isCalculating ? (
              <Clock size={18} className="animate-spin" />
            ) : isCalculated ? (
              <CheckCircle size={18} />
            ) : (
              <Calculator size={18} />
            )}
            {isCalculating ? 'Расчёт...' : isCalculated ? 'Рассчитано' : 'Рассчитать'}
          </button>

          <button
            onClick={handleRefreshPrices}
            disabled={loading || assets.filter(a => a.ticker).length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            <RefreshCw size={18} />
            {loading ? 'Загрузка...' : 'Обновить цены'}
          </button>

          <button
            onClick={handleAddAsset}
            disabled={assets.length >= 100}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            <Plus size={18} />
            Добавить актив ({assets.length}/100)
          </button>
        </div>

        {/* Панель сохранения / экспорта / импорта */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleExport}
            disabled={assets.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            💾 Сохранить в файл
          </button>
          <label className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium cursor-pointer">
            📂 Загрузить из файла
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <button
            onClick={handleReset}
            disabled={assets.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            🗑️ Сбросить всё
          </button>
        </div>

        <div className="mt-8 p-4 bg-slate-100 rounded-lg text-slate-700 text-sm">
          <p className="font-medium mb-2">💡 Как использовать:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>Введите тикер актива и нажмите "Обновить цены" для загрузки текущих котировок</li>
            <li>Установите целевой процент для каждого актива (сумма должна быть 100%)</li>
            <li>Нажмите <strong>«Рассчитать»</strong> для выполнения расчёта ребалансировки</li>
            <li>Колонка "Купить/Продать" показывает необходимые действия для ребалансировки</li>
            <li>Зелёный цвет — актив в целевых пропорциях, жёлтый — избыточный, синий — недостаточный</li>
          </ul>
        </div>
      </div>
      )}
    </div>
  );
}
