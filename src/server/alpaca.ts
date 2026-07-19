/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StockInfo, StockQuote } from '../types.js';
import { Database } from './db.js';

// Pre-defined child-friendly stocks
export const KIDS_STOCKS: Record<string, StockInfo> = {
  RBLX: {
    ticker: 'RBLX',
    name: 'Roblox',
    description: 'Roblox is a massive online world where you build your own games and play with friends!',
    childAnalogy: 'Think of owning Roblox as owning a piece of the ultimate virtual Lego playground.',
    sector: 'Gaming & Fun',
    logo: '🎮',
  },
  DIS: {
    ticker: 'DIS',
    name: 'Disney',
    description: 'Disney makes magic with Mickey Mouse, Star Wars, Marvel superheroes, and giant theme parks!',
    childAnalogy: 'Owning Disney means you own a little slice of the castles, movies, and toys you love.',
    sector: 'Entertainment',
    logo: '🏰',
  },
  AAPL: {
    ticker: 'AAPL',
    name: 'Apple',
    description: 'Apple invents cool gadgets like iPhones, iPads, Apple Watches, and Mac computers.',
    childAnalogy: 'If you use an iPad or watch cartoon movies on a phone, Apple is the team of builders behind them!',
    sector: 'Tech Toys',
    logo: '🍎',
  },
  TSLA: {
    ticker: 'TSLA',
    name: 'Tesla',
    description: 'Tesla builds fast electric cars, giant power batteries, and futuristic walking robots!',
    childAnalogy: 'Tesla is like a real-life sci-fi company building cars that can drive themselves.',
    sector: 'Super Cars',
    logo: '⚡',
  },
  MSFT: {
    ticker: 'MSFT',
    name: 'Microsoft',
    description: 'Microsoft makes the Windows computers, the Xbox console, and owns Minecraft!',
    childAnalogy: 'If you love building houses in Minecraft or playing on Xbox, Microsoft is the parent company.',
    sector: 'Computers & Minecraft',
    logo: '🟩',
  },
  NTDOY: {
    ticker: 'NTDOY',
    name: 'Nintendo',
    description: 'Nintendo is the home of Mario, Luigi, Pikachu, Princess Peach, and the Nintendo Switch!',
    childAnalogy: 'Owning Nintendo is like holding the keys to the Mushroom Kingdom and Mario Kart.',
    sector: 'Gaming & Fun',
    logo: '🍄',
  },
  GOOGL: {
    ticker: 'GOOGL',
    name: 'Google & YouTube',
    description: 'Google runs the search bar that knows everything and YouTube, where you watch your favorite creators!',
    childAnalogy: 'If you watch fun videos or ask questions on the web, Google is the giant library of the internet.',
    sector: 'Internet & Videos',
    logo: '📺',
  },
  NVDA: {
    ticker: 'NVDA',
    name: 'NVIDIA',
    description: 'NVIDIA builds high-power computer chips (GPUs) that make 3D video games look super realistic and power AI!',
    childAnalogy: 'NVIDIA builds the "super-brains" that let Xbox, PlayStation, and computers paint beautiful, fast games.',
    sector: 'Robot Brains',
    logo: '🤖',
  },
};

// Simulated base prices for realistic volatility if Alpaca API keys are not supplied
const BASE_PRICES: Record<string, number> = {
  RBLX: 42.5,
  DIS: 112.3,
  AAPL: 224.8,
  TSLA: 258.4,
  MSFT: 415.6,
  NTDOY: 13.8,
  GOOGL: 172.1,
  NVDA: 118.2,
};

// Seed-based pseudo-random generator for stable daily fluctuations
function getDayVolatility(ticker: string, offsetDays: number = 0): number {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const dateStr = d.toISOString().split('T')[0];
  
  // Combine ticker and date into a hash seed
  let hash = 0;
  const str = ticker + dateStr;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  
  // Return value between -0.04 and +0.045
  const rand = Math.abs(hash % 1000) / 1000;
  return -0.04 + rand * 0.085;
}

export const MarketService = {
  /**
   * Fetches the current cached or live USD exchange rate to ILS (New Israeli Shekels)
   */
  async getILSExchangeRate(): Promise<number> {
    const cached = Database.getFXCache();
    // Cache FX rates for 1 hour
    if (cached && Date.now() - new Date(cached.timestamp).getTime() < 3600000) {
      return cached.rate;
    }

    try {
      const response = await fetch('https://open.er-api.com/v6/latest/ILS');
      if (response.ok) {
        const data = await response.json();
        // We want ILS to USD. Data rates typically contain USD under rates.USD.
        // open.er-api gives rate: how much of currency equals 1 ILS.
        // So rates.USD is direct exchange rate from 1 ILS -> USD (e.g. ~0.27).
        const rate = data.rates?.USD;
        if (rate && typeof rate === 'number') {
          Database.saveFXCache(rate);
          return rate;
        }
      }
    } catch (e) {
      console.warn('Could not reach live FX Exchange API, using secure local fallback.', e);
    }

    // Default fallback: ₪1 ILS = ~$0.27 USD (approx 3.70 ILS to 1 USD)
    const fallbackRate = 0.27;
    Database.saveFXCache(fallbackRate);
    return fallbackRate;
  },

  /**
   * Fetches quote for a specific ticker (supports optional real Alpaca integration)
   */
  async getStockQuote(ticker: string): Promise<StockQuote> {
    const info = KIDS_STOCKS[ticker];
    if (!info) {
      throw new Error(`Ticker ${ticker} is not supported inside the kids' broker.`);
    }

    const basePrice = BASE_PRICES[ticker] || 100.0;
    
    // Check if Alpaca API is configured
    const apiKey = process.env.ALPACA_API_KEY_ID;
    const apiSecret = process.env.ALPACA_API_SECRET_KEY;

    if (apiKey && apiKey !== 'mock_or_real_key' && apiSecret && apiSecret !== 'mock_or_real_secret') {
      try {
        // Real Alpaca Market Data Request
        const url = `https://data.alpaca.markets/v2/stocks/${ticker}/quotes/latest`;
        const res = await fetch(url, {
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
        });
        if (res.ok) {
          const data = await res.json();
          // Extract price from quote
          const price = data.quote?.ap || data.quote?.bp || basePrice;
          const changePercent = (getDayVolatility(ticker) * 100);
          
          return {
            ticker,
            name: info.name,
            priceUsd: Number(price.toFixed(2)),
            changePercent: Number(changePercent.toFixed(2)),
            high24h: Number((price * 1.03).toFixed(2)),
            low24h: Number((price * 0.97).toFixed(2)),
            prevClose: Number((price / (1 + changePercent / 100)).toFixed(2)),
            volume: 1250000 + Math.floor(Math.random() * 500000),
            lastUpdated: new Date().toISOString(),
          };
        }
      } catch (err) {
        console.error(`Alpaca query failed for ${ticker}, falling back to dynamic high-fidelity simulator.`, err);
      }
    }

    // High fidelity simulation
    const currentFluc = getDayVolatility(ticker);
    const priceUsd = basePrice * (1 + currentFluc);
    const prevClose = basePrice;
    const changePercent = currentFluc * 100;
    const high = priceUsd * (1 + Math.abs(currentFluc) * 0.3);
    const low = priceUsd * (1 - Math.abs(currentFluc) * 0.3);

    return {
      ticker,
      name: info.name,
      priceUsd: Number(priceUsd.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      high24h: Number(high.toFixed(2)),
      low24h: Number(low.toFixed(2)),
      prevClose: Number(prevClose.toFixed(2)),
      volume: 850000 + Math.floor(Math.abs(currentFluc) * 5000000),
      lastUpdated: new Date().toISOString(),
    };
  },

  /**
   * Fetches quotes for all supported stock tickers
   */
  async getAllStockQuotes(): Promise<StockQuote[]> {
    const promises = Object.keys(KIDS_STOCKS).map((ticker) => this.getStockQuote(ticker));
    return Promise.all(promises);
  },

  /**
   * Generates elegant, steady 30-day historical pricing curve for Plotly/Recharts
   */
  async getStockHistory(ticker: string, range: '1D' | '1W' | '1M' | '1Y' = '1M'): Promise<{ date: string; price: number }[]> {
    const basePrice = BASE_PRICES[ticker] || 100.0;
    let days = 30;
    if (range === '1D') days = 1;
    if (range === '1W') days = 7;
    if (range === '1M') days = 30;
    if (range === '1Y') days = 365;

    const history: { date: string; price: number }[] = [];
    let currentPrice = basePrice;

    // Build curve back in time
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const dailyVolatility = getDayVolatility(ticker, i);
      currentPrice = currentPrice * (1 + dailyVolatility * 0.4); // Scale down daily fluctuation for smooth charts

      history.push({
        date: dateStr,
        price: Number(currentPrice.toFixed(2)),
      });
    }

    return history;
  },
};
