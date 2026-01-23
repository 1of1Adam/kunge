const DEFAULT_FVG_COLOR = '#4c6ef5';
const DEFAULT_STRONG_COLOR = '#e03131';
const DEFAULT_STRONG_PERCENT = 30;
const FVG_COLOR_KEY = 1;
const STRONG_COLOR_KEY = 1;

export function createSDGIndicator(PineJS) {
  return {
    name: 'FVG + 强势K线',
    metainfo: {
      _metainfoVersion: 53,
      id: 'FVGStrong@tv-basicstudies-1',
      description: 'FVG + 强势K线',
      shortDescription: 'FVG+强K',
      is_price_study: true,
      isCustomIndicator: true,
      linkedToSeries: true,
      format: { type: 'inherit' },
      inputs: [
        {
          id: 'strongPercent',
          name: '强势阈值(%)',
          type: 'float',
          defval: DEFAULT_STRONG_PERCENT,
          min: 1,
          max: 100,
        },
      ],
      plots: [
        { id: 'fvg_color', type: 'bar_colorer', palette: 'fvg_palette' },
        { id: 'strong_color', type: 'bar_colorer', palette: 'strong_palette' },
        { id: 'ema20', type: 'line' },
        { id: 'ema7', type: 'line' },
        { id: 'high_line', type: 'line' },
      ],
      styles: {
        ema20: { title: 'EMA20', histogramBase: 0 },
        ema7: { title: 'EMA7', histogramBase: 0 },
        high_line: { title: '最高价', histogramBase: 0 },
      },
      palettes: {
        fvg_palette: {
          colors: [{ name: 'FVG 颜色' }],
          valToIndex: { [FVG_COLOR_KEY]: 0 },
        },
        strong_palette: {
          colors: [{ name: '强势K线颜色' }],
          valToIndex: { [STRONG_COLOR_KEY]: 0 },
        },
      },
      defaults: {
        inputs: {
          strongPercent: DEFAULT_STRONG_PERCENT,
        },
        palettes: {
          fvg_palette: {
            colors: [{ color: DEFAULT_FVG_COLOR }],
          },
          strong_palette: {
            colors: [{ color: DEFAULT_STRONG_COLOR }],
          },
        },
        styles: {
          ema20: {
            linestyle: 0,
            linewidth: 1,
            plottype: 0,
            trackPrice: false,
            transparency: 0,
            visible: true,
            color: '#6c757d',
          },
          ema7: {
            linestyle: 0,
            linewidth: 1,
            plottype: 0,
            trackPrice: false,
            transparency: 0,
            visible: true,
            color: '#000000',
          },
          high_line: {
            linestyle: 0,
            linewidth: 1,
            plottype: 0,
            trackPrice: false,
            transparency: 70,
            visible: true,
            color: '#adb5bd',
          },
        },
      },
    },
    constructor: function () {
      this.main = function (context, inputCallback) {
        this._context = context;
        this._input = inputCallback;

        const highSeries = context.new_var(PineJS.Std.high(context));
        const lowSeries = context.new_var(PineJS.Std.low(context));
        const closeSeries = context.new_var(PineJS.Std.close(context));

        const high1 = highSeries.get(2);
        const low3 = lowSeries.get(0);

        const condReady = PineJS.Std.n(context) >= 2;
        const fvg = condReady && !isNaN(high1) && !isNaN(low3) && high1 < low3;

        const open0 = PineJS.Std.open(context);
        const close0 = PineJS.Std.close(context);
        const high0 = PineJS.Std.high(context);
        const low0 = PineJS.Std.low(context);

        const strongPercent = Number(inputCallback(0));
        const percent = Math.max(1, Math.min(100, Number.isFinite(strongPercent) ? strongPercent : DEFAULT_STRONG_PERCENT)) / 100;

        const isYang = close0 > open0;
        const upperZone = close0 >= high0 - (high0 - low0) * percent;
        const strongYang = isYang && upperZone;

        const fvgColor = fvg ? { value: FVG_COLOR_KEY, offset: -1 } : NaN;
        const strongColor = strongYang ? STRONG_COLOR_KEY : NaN;

        const ema20 = PineJS.Std.ema(closeSeries, 20, context);
        const ema7 = PineJS.Std.ema(closeSeries, 7, context);

        return [fvgColor, strongColor, ema20, ema7, high0];
      };
    },
  };
}
