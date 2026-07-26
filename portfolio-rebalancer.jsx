import React, { useState, useCallback, useMemo } from 'react';
import { TrendingUp, Plus, Trash2, RefreshCw } from 'lucide-react';

// ============================================================================
// DOMAIN LAYER - Бизнес-логика, независимая от UI
// ============================================================================

/**
 * Сервис расчета портфеля - S из SOLID (Single Responsibility)
 * Отвечает только за математику портфеля, не зависит от React
 */
class PortfolioCalculator {
  /**
   * Расчет суммы портфеля
   */
  static calculateTotalValue(assets) {
    return assets.reduce((sum, asset) => sum + (asset.quantity * asset.price), 0);
  }

  /**
   * Расчет процента портфеля для каждого актива
   */
  static calculatePercentages(assets) {
    const total = this.calculateTotalValue(assets);
    if (total === 0) return assets.map(() => 0);
    return assets.map(asset => (asset.quantity * asset.price) / total * 100);
  }

  /**
   * Расчет требуемого количества активов для достижения целевого процента
   */
  static calculateRequiredQuantity(asset, targetPercent, totalValue) {
    if (totalValue === 0) return 0;
    return (targetPercent / 100) * totalValue / asset.price;
  }

  /**
   * Расчет необходимых операций (сколько купить/продать)
   */
  static calculateAdjustment(currentQuantity, requiredQuantity) {
    return requiredQuantity - currentQuantity;
  }

  /**
   * Полный анализ портфеля
   */
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
        isOverweight: currentPercent > asset.targetPercent,
        isUnderweight: currentPercent < asset.targetPercent,
      };
    });
  }
}

/**
 * Сервис получения цен - I из SOLID (Interface Segregation)
 * Легко заменить на реальный API
 */
class PriceService {
  /**
   * Симуляция получения цены из Мосбиржи
   * В реальном приложении: fetch к https://www.moex.com/api/...
   */
  static async fetchPrice(ticker) {
    // Симуляция задержки API
    await new Promise(resolve => setTimeout(resolve, 300));

    // Симуляция данных Мосбиржи
    const prices = {
      'SBER': 245.50,
      'GAZP': 145.20,
      'NVTK': 1234.50,
      'POLY': 96.80,
      'TATN': 89.40,
      'MGNT': 3245.00,
      'MOEX': 156.75,
      'IRAO': 0.5130,
    };

    if (prices[ticker.toUpperCase()]) {
      // Небольшой случайный шум для реалистичности
      const noise = (Math.random() - 0.5) * prices[ticker.toUpperCase()] * 0.02;
      return prices[ticker.toUpperCase()] + noise;
    }

    throw new Error(`Актив ${ticker} не найден на Мосбирже`);
  }

  /**
   * Получить цены для нескольких активов параллельно
   */
  static async fetchPrices(tickers) {
    return Promise.all(tickers.map(ticker => this.fetchPrice(ticker)));
  }
}

/**
 * Валидатор активов - D из SOLID (Dependency Inversion)
 */
class AssetValidator {
  static validate(asset) {
    const errors = [];

    if (!asset.ticker || asset.ticker.trim() === '') {
      errors.push('Тикер не может быть пустым');
    }

    if (asset.quantity < 0) {
      errors.push('Количество не может быть отрицательным');
    }

    if (asset.price <= 0) {
      errors.push('Цена должна быть положительной');
    }

    if (asset.targetPercent < 0 || asset.targetPercent > 100) {
      errors.push('Целевой процент должен быть от 0 до 100');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static validatePortfolio(assets) {
    const totalPercent = assets.reduce((sum, a) => sum + a.targetPercent, 0);
    if (Math.abs(totalPercent - 100) > 0.01) {
      return {
        isValid: false,
        error: `Сумма целевых процентов должна быть 100%, сейчас ${totalPercent.toFixed(2)}%`,
      };
    }

    return { isValid: true };
  }
}

// ============================================================================
// UI LAYER - React компоненты
// ============================================================================

/**
 * Компонент строки актива - S из SOLID
 * Отвечает только за отображение одного актива
 */
function AssetRow({ asset, analysis, onUpdate, onRemove, isLoading }) {
  const handleQuantityChange = (e) => {
    onUpdate({ ...asset, quantity: parseInt(e.target.value, 10) || 0 });
  };

  const handlePriceChange = (e) => {
    onUpdate({ ...asset, price: parseFloat(e.target.value) || 0 });
  };

  const handleTargetPercentChange = (e) => {
    onUpdate({ ...asset, targetPercent: parseFloat(e.target.value) || 0 });
  };

  const getAdjustmentColor = (adjustment) => {
    if (adjustment > 0.1) return 'text-green-600 bg-green-50';
    if (adjustment < -0.1) return 'text-red-600 bg-red-50';
    return 'text-gray-600';
  };

  const getPercentageColor = (current, target) => {
    if (Math.abs(current - target) < 1) return 'bg-emerald-100 text-emerald-900';
    if (current > target) return 'bg-amber-100 text-amber-900';
    return 'bg-blue-100 text-blue-900';
  };

  if (!analysis) {
    return null;
  }

  return (
    <tr className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 font-medium text-slate-900">
        <input
          type="text"
          value={asset.ticker}
          onChange={(e) => onUpdate({ ...asset, ticker: e.target.value.toUpperCase() })}
          className="w-24 px-2 py-1 border border-slate-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength="6"
        />
      </td>

      <td className="px-4 py-3">
        <input
          type="number"
          value={asset.quantity}
          onChange={handleQuantityChange}
          className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
          step="1"
        />
      </td>

      <td className="px-4 py-3 text-right font-mono">
        <span className="text-slate-900">{analysis.currentValue.toFixed(2)} ₽</span>
        <input
          type="number"
          value={asset.price}
          onChange={handlePriceChange}
          disabled={isLoading}
          className="block w-24 ml-auto px-2 py-1 mt-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
          step="0.01"
        />
      </td>

      <td className="px-4 py-3">
        <input
          type="number"
          value={asset.targetPercent}
          onChange={handleTargetPercentChange}
          className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
          min="0"
          max="100"
          step="0.1"
        />
      </td>

      <td className="px-4 py-3 text-center">
        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getPercentageColor(analysis.currentPercent, asset.targetPercent)}`}>
          {analysis.currentPercent.toFixed(1)}%
        </span>
      </td>

      <td className="px-4 py-3 text-right font-mono text-sm">
        <div className="text-slate-600">{Math.round(analysis.requiredQuantity)}</div>
      </td>

      <td className={`px-4 py-3 text-right font-mono font-medium ${getAdjustmentColor(analysis.adjustment)}`}>
        <div>{analysis.adjustment > 0 ? '+' : ''}{Math.round(analysis.adjustment)}</div>
        <div className="text-xs mt-1">{analysis.adjustmentValue > 0 ? '+' : ''}{analysis.adjustmentValue.toFixed(2)} ₽</div>
      </td>

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
 * Заголовок таблицы - S из SOLID
 */
function PortfolioHeader() {
  return (
    <thead className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
      <tr>
        <th className="px-4 py-3 text-left text-sm font-semibold">Актив</th>
        <th className="px-4 py-3 text-left text-sm font-semibold">Кол-во</th>
        <th className="px-4 py-3 text-right text-sm font-semibold">Цена</th>
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
 * Сводка портфеля - S из SOLID
 */
function PortfolioSummary({ analysis }) {
  const totalValue = PortfolioCalculator.calculateTotalValue(analysis);
  const totalAdjustmentValue = analysis.reduce((sum, a) => sum + Math.abs(a.adjustmentValue), 0);

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
        <div className="text-sm text-blue-600 font-medium mb-1">Стоимость портфеля</div>
        <div className="text-2xl font-bold text-blue-900">{totalValue.toFixed(2)} ₽</div>
      </div>

      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
        <div className="text-sm text-purple-600 font-medium mb-1">Требуется ребалансировки</div>
        <div className="text-2xl font-bold text-purple-900">{totalAdjustmentValue.toFixed(2)} ₽</div>
      </div>

      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
        <div className="text-sm text-emerald-600 font-medium mb-1">В целевых пропорциях</div>
        <div className="text-2xl font-bold text-emerald-900">
          {analysis.filter(a => Math.abs(a.currentPercent - a.targetPercent) < 1).length}/{analysis.length}
        </div>
      </div>
    </div>
  );
}

/**
 * Главное приложение - Orchestrator
 */
export default function PortfolioRebalancer() {
  // ========================================================================
  // STATE MANAGEMENT - Минимальное необходимое состояние (DRY)
  // ========================================================================

  const [assets, setAssets] = useState([
    { id: 1, ticker: 'SBER', quantity: 10, price: 245.50, targetPercent: 50 },
    { id: 2, ticker: 'GAZP', quantity: 20, price: 145.20, targetPercent: 50 },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nextId, setNextId] = useState(3);

  // ========================================================================
  // DERIVED STATE - Вычисляемые значения (не дублируем состояние)
  // ========================================================================

  const analysis = useMemo(() => {
    return PortfolioCalculator.analyzePortfolio(assets);
  }, [assets]);

  const portfolioValidation = useMemo(() => {
    return AssetValidator.validatePortfolio(assets);
  }, [assets]);

  // ========================================================================
  // HANDLERS - Обработчики событий (используем useCallback для оптимизации)
  // ========================================================================

  const handleUpdateAsset = useCallback((updatedAsset) => {
    const validation = AssetValidator.validate(updatedAsset);
    if (!validation.isValid) {
      setError(validation.errors[0]);
      return;
    }

    setAssets(prevAssets =>
      prevAssets.map(a => a.id === updatedAsset.id ? updatedAsset : a)
    );
    setError(null);
  }, []);

  const handleAddAsset = useCallback(() => {
    const newAsset = {
      id: nextId,
      ticker: '',
      quantity: 0,
      price: 0,
      targetPercent: 0,
    };

    setAssets(prevAssets => [...prevAssets, newAsset]);
    setNextId(prev => prev + 1);
    setError(null);
  }, [nextId]);

  const handleRemoveAsset = useCallback((id) => {
    if (assets.length <= 2) return;
    setAssets(prevAssets => prevAssets.filter(a => a.id !== id));
  }, [assets.length]);

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

      const prices = await PriceService.fetchPrices(tickers);

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

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp size={32} />
            <h1 className="text-3xl font-bold">Ребалансировка портфеля</h1>
          </div>
          <p className="text-slate-400">Управление активами Мосбиржи с автоматическим расчетом ребалансировки</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Summary Cards */}
        <PortfolioSummary analysis={analysis} />

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Portfolio Table */}
        <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
          <table className="w-full">
            <PortfolioHeader />
            <tbody>
              {assets.map(asset => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  analysis={analysis.find(a => a.id === asset.id)}
                  onUpdate={handleUpdateAsset}
                  onRemove={handleRemoveAsset}
                  isLoading={loading}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Portfolio Validation */}
        {!portfolioValidation.isValid && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            ⚠️ {portfolioValidation.error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
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

        {/* Help Text */}
        <div className="mt-8 p-4 bg-slate-100 rounded-lg text-slate-700 text-sm">
          <p className="font-medium mb-2">💡 Как использовать:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>Введите тикер актива и нажмите "Обновить цены" для загрузки текущих котировок</li>
            <li>Установите целевой процент для каждого актива (сумма должна быть 100%)</li>
            <li>Колонка "Купить/Продать" показывает необходимые действия для ребалансировки</li>
            <li>Зелёный цвет - актив в целевых пропорциях, жёлтый - избыточный, синий - недостаточный</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
