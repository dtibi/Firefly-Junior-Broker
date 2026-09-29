/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The stock catalogue + market-data mapping. These tests keep the 44-ticker
 * directory honest (every stock must explain itself to a child, in Hebrew) and
 * pin down the parsing of Alpaca/Yahoo payloads so a provider change cannot
 * silently blank the prices.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIDS_STOCKS,
  STOCK_CATEGORIES,
  ALPACA_UNSUPPORTED_TICKERS,
  BASE_PRICES,
  simulatedQuote,
  mergeQuote,
  quoteFromAlpacaSnapshot,
  quoteFromYahooChart,
  historyFromYahooChart,
  simulatedHistory,
} from '../src/server/alpaca.js';

const tickers = Object.keys(KIDS_STOCKS);

describe('the kids stock directory', () => {
  test('has the expected size and no duplicates', () => {
    assert.equal(tickers.length, 44);
    assert.equal(new Set(tickers).size, tickers.length);
  });

  test('every stock explains itself to a child, in Hebrew and in English', () => {
    for (const ticker of tickers) {
      const stock = KIDS_STOCKS[ticker];
      assert.equal(stock.ticker, ticker);
      for (const field of ['name', 'heName', 'description', 'heDescription', 'childAnalogy', 'category'] as const) {
        assert.ok(
          stock[field] && String(stock[field]).trim().length > 2,
          `${ticker} is missing ${field}`
        );
      }
      assert.ok(stock.logo && stock.logo.length > 0, `${ticker} is missing a logo emoji`);
      assert.equal(stock.name, stock.name.trim());
    }
  });

  test('Hebrew descriptions actually contain Hebrew letters', () => {
    const hebrew = /[\u0590-\u05FF]/;
    for (const ticker of tickers) {
      assert.match(KIDS_STOCKS[ticker].heDescription!, hebrew, `${ticker}.heDescription is not Hebrew`);
      assert.match(KIDS_STOCKS[ticker].heName!, hebrew, `${ticker}.heName is not Hebrew`);
    }
  });

  test('every stock belongs to an existing category', () => {
    const ids = new Set(STOCK_CATEGORIES.map((category) => category.id));
    assert.equal(ids.size, STOCK_CATEGORIES.length, 'category ids must be unique');
    for (const ticker of tickers) {
      assert.ok(ids.has(KIDS_STOCKS[ticker].category!), `${ticker} has an unknown category`);
    }
    for (const category of STOCK_CATEGORIES) {
      assert.ok(category.emoji && category.he && category.en, `category ${category.id} is incomplete`);
    }
  });

  test('every stock has a positive base price for the simulator fallback', () => {
    for (const ticker of tickers) {
      const price = BASE_PRICES[ticker];
      assert.equal(typeof price, 'number', `${ticker} has no base price`);
      assert.ok(price > 0, `${ticker} base price must be positive`);
    }
    assert.deepEqual(
      Object.keys(BASE_PRICES).sort(),
      tickers.slice().sort(),
      'base prices and the catalogue must cover exactly the same tickers'
    );
  });

  test('the tickers Alpaca cannot serve are declared', () => {
    assert.ok(ALPACA_UNSUPPORTED_TICKERS.has('NTDOY'), 'NTDOY is OTC and needs the Yahoo fallback');
  });

  test('the five baskets are present', () => {
    for (const basket of ['SPY', 'QQQ', 'VT', 'SCHD', 'GLD', 'VNQ']) {
      assert.ok(KIDS_STOCKS[basket], `${basket} basket is missing`);
      assert.equal(KIDS_STOCKS[basket].category, 'index');
    }
  });
});

describe('the quote simulator', () => {
  test('is deterministic for a ticker (stable within the day)', () => {
    const first = simulatedQuote('SPY');
    const second = simulatedQuote('SPY');
    assert.equal(first.priceUsd, second.priceUsd);
  });

  test('stays near the base price and fills every field', () => {
    for (const ticker of tickers) {
      const quote = simulatedQuote(ticker);
      const base = BASE_PRICES[ticker];
      assert.ok(Math.abs(quote.priceUsd / base - 1) < 0.06, `${ticker} simulated price drifted too far`);
      assert.ok(quote.high24h >= quote.priceUsd);
      assert.ok(quote.low24h <= quote.priceUsd);
      assert.equal(quote.ticker, ticker);
      assert.ok(quote.name && quote.logo);
    }
  });
});

describe('Alpaca snapshot parsing', () => {
  test('maps a live snapshot into a quote', () => {
    const mapped = quoteFromAlpacaSnapshot({
      latestTrade: { p: 190.5, t: '2026-09-29T13:30:00Z' },
      dailyBar: { o: 189, h: 192, l: 188, c: 190.5, v: 1234 },
      prevDailyBar: { c: 187.25 },
    });
    assert.equal(mapped!.priceUsd, 190.5);
    assert.equal(mapped!.prevClose, 187.25);
    assert.equal(mapped!.high24h, 192);
    assert.equal(mapped!.low24h, 188);
    assert.equal(mapped!.volume, 1234);
    assert.equal(mapped!.lastUpdated, '2026-09-29T13:30:00Z');
  });

  test('falls back to the daily close when there is no trade yet (pre-market)', () => {
    const mapped = quoteFromAlpacaSnapshot({ dailyBar: { o: 100, c: 105, h: 106, l: 99 } });
    assert.equal(mapped!.priceUsd, 105);
    assert.equal(mapped!.prevClose, 100, 'the open is the best guess for the previous close');
  });

  test('returns null when the snapshot has no usable price', () => {
    assert.equal(quoteFromAlpacaSnapshot({}), null);
    assert.equal(quoteFromAlpacaSnapshot({ latestTrade: { p: null } }), null);
    assert.equal(quoteFromAlpacaSnapshot(undefined), null);
  });
});

describe('Yahoo fallback parsing', () => {
  const yahoo = {
    chart: {
      result: [
        {
          timestamp: [1758600000, 1758686400],
          indicators: { quote: [{ close: [12.1, 12.55], high: [12.2, 12.7], low: [11.9, 12.3], volume: [100, 250] }] },
        },
      ],
    },
  };

  test('maps the last close of a Yahoo chart into a quote', () => {
    const mapped = quoteFromYahooChart(yahoo);
    assert.equal(mapped!.priceUsd, 12.55);
    assert.equal(mapped!.prevClose, 12.1);
    assert.equal(mapped!.volume, 250);
    assert.ok(mapped!.lastUpdated.startsWith('2025-'));
  });

  test('returns null for an empty or broken payload', () => {
    assert.equal(quoteFromYahooChart({}), null);
    assert.equal(quoteFromYahooChart({ chart: { result: [{ timestamp: [], indicators: { quote: [{}] } }] } }), null);
    assert.equal(quoteFromYahooChart({ chart: { result: [{ timestamp: [1], indicators: { quote: [{ close: [null] }] } }] } }), null);
  });

  test('history drops empty days and keeps the date format the chart expects', () => {
    const history = historyFromYahooChart({
      chart: {
        result: [
          {
            timestamp: [1758600000, 1758686400, 1758772800],
            indicators: { quote: [{ close: [10, null, 11] }] },
          },
        ],
      },
    });
    assert.equal(history.length, 2);
    assert.equal(history[0].price, 10);
    assert.equal(history[1].price, 11);
    assert.match(history[0].date, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('the simulated history respects the requested range', () => {
    assert.equal(simulatedHistory('SPY', '1D').length, 1);
    assert.equal(simulatedHistory('SPY', '1W').length, 7);
    assert.equal(simulatedHistory('SPY', '1M').length, 30);
    assert.equal(simulatedHistory('SPY', '1Y').length, 365);
  });
});

describe('merging live data with the catalogue', () => {
  test('a live price wins; the simulator only fills the gaps', () => {
    const quote = mergeQuote('NKE', { priceUsd: 40, prevClose: 38 });
    assert.equal(quote.priceUsd, 40);
    assert.equal(quote.changePercent, 5.26);
    assert.equal(quote.name, KIDS_STOCKS.NKE.name);
    assert.equal(quote.category, 'brands');
  });

  test('no live data still produces a complete quote', () => {
    const quote = mergeQuote('NKE', null);
    assert.ok(quote.priceUsd > 0);
    assert.ok(Number.isFinite(quote.changePercent));
    assert.equal(quote.ticker, 'NKE');
    assert.equal(quote.heName, KIDS_STOCKS.NKE.heName);
  });
});
