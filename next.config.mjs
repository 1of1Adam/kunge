import { createMDX } from 'fumadocs-mdx/next';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const withMDX = createMDX();
const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  turbopack: {
    root,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.brookstradingcourse.com',
      },
    ],
  },
  // 使用 rewrite 而非 redirect，避免额外的网络往返
  async rewrites() {
    return [
      {
        source: '/tradingview',
        destination: '/tradingview/index.html',
      },
      {
        source: '/tradingview/',
        destination: '/tradingview/index.html',
      },
    ];
  },
  async redirects() {
    return [
      {
        source:
          '/docs/al-brooks-trends/12-Chapter_2__Trend_Bars,_Doji_Bars,_and_Climaxes',
        destination:
          '/docs/al-brooks-trends/12-Chapter_2__Trend_Bars_Doji_Bars_and_Climaxes',
        permanent: true,
      },
      {
        source:
          '/docs/al-brooks-trends/13-Chapter_3__Breakouts,_Trading_Ranges,_Tests,_and_Reversals',
        destination:
          '/docs/al-brooks-trends/13-Chapter_3__Breakouts_Trading_Ranges_Tests_and_Reversals',
        permanent: true,
      },
      {
        source:
          '/docs/al-brooks-trends/14-Chapter_4__Bar_Basics__Signal_Bars,_Entry_Bars,_Setups,_and_Candle_Patterns',
        destination:
          '/docs/al-brooks-trends/14-Chapter_4__Bar_Basics__Signal_Bars_Entry_Bars_Setups_and_Candle_Patterns',
        permanent: true,
      },
    ];
  },
};

export default withMDX(config);
