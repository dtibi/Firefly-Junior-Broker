/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import * as path from 'path';
import { createServer as createViteServer } from 'vite';
import { Database } from './src/server/db.js';
import { MarketService } from './src/server/alpaca.js';
import { LedgerService } from './src/server/firefly.js';
import { AIService } from './src/server/ai.js';
import { TradeRequest, TradeResponse } from './src/types.js';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  
  // 1. Get all child profiles
  app.get('/api/profiles', (req, res) => {
    try {
      const currentYear = new Date().getFullYear();
      const profiles = Database.getProfiles().map((p) => ({
        ...p,
        age: currentYear - p.birthYear,
      }));
      res.json({ success: true, profiles });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Create child profile
  app.post('/api/profiles', (req, res) => {
    try {
      const { name, birthYear, pin, currencyMode, executionMode, savingsAccountId, investmentAccountId, avatar } = req.body;
      if (!name || !birthYear || !pin || !savingsAccountId || !investmentAccountId) {
        return res.status(400).json({ success: false, error: 'Missing required profile fields.' });
      }
      const existing = Database.getProfile(name);
      if (existing) {
        return res.status(400).json({ success: false, error: 'A profile with this name already exists!' });
      }

      const newProfile = Database.createProfile({
        name,
        birthYear: Number(birthYear),
        pin,
        currencyMode: currencyMode || 'PARITY',
        executionMode: executionMode || 'INSTANT',
        savingsAccountId,
        investmentAccountId,
        avatar: avatar || '⭐',
      });

      res.json({ success: true, profile: newProfile });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Child profile login verification
  app.post('/api/profiles/login', (req, res) => {
    try {
      const { name, pin } = req.body;
      if (!name || !pin) {
        return res.status(400).json({ success: false, error: 'Name and PIN are required.' });
      }
      const success = Database.verifyPin(name, pin);
      if (success) {
        const p = Database.getProfile(name)!;
        const currentYear = new Date().getFullYear();
        res.json({
          success: true,
          profile: {
            ...p,
            age: currentYear - p.birthYear,
          },
        });
      } else {
        res.status(401).json({ success: false, error: 'Incorrect 4-digit security PIN!' });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Update child profile
  app.put('/api/profiles/:name', (req, res) => {
    try {
      const { name } = req.params;
      const updated = Database.updateProfile(name, req.body);
      if (updated) {
        res.json({ success: true, profile: updated });
      } else {
        res.status(404).json({ success: false, error: 'Profile not found.' });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Delete child profile
  app.delete('/api/profiles/:name', (req, res) => {
    try {
      const { name } = req.params;
      const success = Database.deleteProfile(name);
      if (success) {
        res.json({ success: true, message: `Profile for ${name} has been removed.` });
      } else {
        res.status(404).json({ success: false, error: 'Profile not found.' });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. Get child portfolio data (Holdings, cash, history, snapshots)
  app.get('/api/portfolio/:profileName', async (req, res) => {
    try {
      const { profileName } = req.params;
      const profile = Database.getProfile(profileName);
      if (!profile) {
        return res.status(404).json({ success: false, error: 'Profile not found.' });
      }

      const holdings = Database.getHoldings(profileName);
      const fxRate = await MarketService.getILSExchangeRate();

      // Fetch live balance from Firefly III savings account (fall back to local cache)
      const liveBalance = await LedgerService.getAccountBalance(profile.savingsAccountId);
      const rawCashBalance = liveBalance ?? Database.getCashBalance(profileName);

      // Fetch active pricing for all holdings
      let totalStockValueUsd = 0;
      const activeHoldings = await Promise.all(
        holdings.map(async (h) => {
          try {
            const quote = await MarketService.getStockQuote(h.ticker);
            const currentValueUsd = h.shares * quote.priceUsd;
            totalStockValueUsd += currentValueUsd;
            const originalValueUsd = h.shares * h.averagePriceUsd;
            const gainLossPercent = ((currentValueUsd - originalValueUsd) / (originalValueUsd || 1)) * 100;

            return {
              ...h,
              currentPriceUsd: quote.priceUsd,
              currentValueUsd: Number(currentValueUsd.toFixed(2)),
              gainLossUsd: Number((currentValueUsd - originalValueUsd).toFixed(2)),
              gainLossPercent: Number(gainLossPercent.toFixed(2)),
              logo: quote.logo || '⭐',
            };
          } catch (e) {
            return {
              ...h,
              currentPriceUsd: h.averagePriceUsd,
              currentValueUsd: h.shares * h.averagePriceUsd,
              gainLossUsd: 0,
              gainLossPercent: 0,
              logo: '⭐',
            };
          }
        })
      );

      // Live Firefly III balance (rawCashBalance) is in local ILS currency.
      // Compute USD-equivalent and total wealth based on currency mode.
      const fxFactor = profile.currencyMode === 'PARITY' ? 1.0 : fxRate;
      const cashValueUsd = profile.currencyMode === 'PARITY' ? rawCashBalance : (rawCashBalance * fxFactor);
      const portfolioTotalUsd = cashValueUsd + totalStockValueUsd;
      const portfolioTotalLocal = profile.currencyMode === 'PARITY' ? portfolioTotalUsd : (portfolioTotalUsd / fxFactor);

      const transactions = Database.getTransactions(profileName);
      const snapshots = Database.getSnapshots(profileName);

      res.json({
        success: true,
        summary: {
          currencyMode: profile.currencyMode,
          executionMode: profile.executionMode,
          fxRate,
          cashLocal: Number(rawCashBalance.toFixed(2)),
          cashUsd: Number(cashValueUsd.toFixed(2)),
          stockValueUsd: Number(totalStockValueUsd.toFixed(2)),
          stockValueLocal: Number((totalStockValueUsd / fxFactor).toFixed(2)),
          totalWealthUsd: Number(portfolioTotalUsd.toFixed(2)),
          totalWealthLocal: Number(portfolioTotalLocal.toFixed(2)),
        },
        holdings: activeHoldings,
        transactions,
        snapshots,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. Get stock catalog with live prices
  app.get('/api/stocks', async (req, res) => {
    try {
      const quotes = await MarketService.getAllStockQuotes();
      res.json({ success: true, stocks: quotes });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8. Get stock details history
  app.get('/api/stocks/:ticker/history', async (req, res) => {
    try {
      const { ticker } = req.params;
      const { range } = req.query;
      const data = await MarketService.getStockHistory(ticker, (range as any) || '1M');
      res.json({ success: true, history: data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 9. Age-Aware AI Coach Explanation
  app.get('/api/stocks/:ticker/ai-guide', async (req, res) => {
    try {
      const { ticker } = req.params;
      const { profileName } = req.query;

      if (!profileName) {
        return res.status(400).json({ success: false, error: 'profileName is required' });
      }

      const profile = Database.getProfile(profileName as string);
      if (!profile) {
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }

      const currentYear = new Date().getFullYear();
      const age = currentYear - profile.birthYear;

      const locale = Array.isArray(req.query.locale) ? (req.query.locale[0] as string) : (req.query.locale as string || 'en');

      const guide = await AIService.getAgeAwareStockTutorial(profile.name, age, ticker, locale);
      res.json({ success: true, guide });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 10. Execute Trade (Buy/Sell)
  app.post('/api/trade', async (req, res) => {
    try {
      const { profileName, pin, ticker, type, amount } = req.body as TradeRequest;

      // Basic parameter validations
      if (!profileName || !pin || !ticker || !type || amount === undefined) {
        return res.status(400).json({ success: false, error: 'Missing core trade execution parameters.' });
      }

      const profile = Database.getProfile(profileName);
      if (!profile) {
        return res.status(404).json({ success: false, error: 'Profile not found.' });
      }

      // PIN Authorization Security
      const pinCorrect = Database.verifyPin(profileName, pin);
      if (!pinCorrect) {
        return res.status(401).json({ success: false, error: 'Incorrect 4-digit PIN! Authorization failed.' });
      }

      const quote = await MarketService.getStockQuote(ticker);
      const fxRate = await MarketService.getILSExchangeRate();
      const fxFactor = profile.currencyMode === 'PARITY' ? 1.0 : fxRate;

      // BUY Transaction Engine
      if (type === 'BUY') {
        const investFiat = amount;

        // 1. Guardrail: Minimum Order Size
        if (investFiat < 10.0) {
          return res.status(400).json({
            success: false,
            error: `Minimum order size is exactly 10 currency units! (You tried to buy with ${investFiat})`,
          });
        }

        // Check cash balance from live Firefly III (fall back to local cache)
        const liveBalance = await LedgerService.getAccountBalance(profile.savingsAccountId);
        const currentCashLocal = liveBalance ?? Database.getCashBalance(profileName);
        if (currentCashLocal < investFiat) {
          return res.status(400).json({
            success: false,
            error: `Insufficient savings capital! You have ₪/$$ ${currentCashLocal.toFixed(2)} available.`,
          });
        }

        // Compute shares to acquire
        const investUsd = profile.currencyMode === 'PARITY' ? investFiat : (investFiat * fxFactor);
        const sharesToAcquire = investUsd / quote.priceUsd;

        // 2. Guardrail: Minimum Slice Resolution
        if (sharesToAcquire < 0.01) {
          return res.status(400).json({
            success: false,
            error: `Trade results in a fraction below the 0.01 share boundary (${sharesToAcquire.toFixed(4)} shares). Visual blockade triggered! Try investing a larger amount.`,
          });
        }

        // Ledger Transfer: savings to investments
        const ffTxId = await LedgerService.createTransfer(
          investFiat,
          `Stock Purchase: Buy ${sharesToAcquire.toFixed(4)} shares of ${ticker} (${quote.name})`,
          profile.savingsAccountId,
          profile.investmentAccountId
        );

        // Update local holdings
        const holdings = Database.getHoldings(profileName);
        const currentHolding = holdings.find((h) => h.ticker.toUpperCase() === ticker.toUpperCase());

        let newHolding;
        if (currentHolding) {
          const totalShares = currentHolding.shares + sharesToAcquire;
          const totalPrincipal = currentHolding.originalPrincipalUsd + investUsd;
          const avgPrice = totalPrincipal / totalShares;
          newHolding = {
            profileName,
            ticker,
            shares: Number(totalShares.toFixed(4)),
            averagePriceUsd: Number(avgPrice.toFixed(2)),
            originalPrincipalUsd: Number(totalPrincipal.toFixed(2)),
            lastUpdated: new Date().toISOString(),
          };
        } else {
          newHolding = {
            profileName,
            ticker,
            shares: Number(sharesToAcquire.toFixed(4)),
            averagePriceUsd: quote.priceUsd,
            originalPrincipalUsd: Number(investUsd.toFixed(2)),
            lastUpdated: new Date().toISOString(),
          };
        }

        Database.saveHolding(newHolding);

        // Log transaction
        const tx = Database.logTransaction({
          profileName,
          ticker,
          type: 'BUY',
          shares: Number(sharesToAcquire.toFixed(4)),
          priceUsd: quote.priceUsd,
          fxRate: fxFactor,
          fiatAmount: investFiat,
          fireflyTransactionId: ffTxId,
        });

        // Keep local cache in sync with Firefly III for fallback resilience
        Database.updateCashBalance(profileName, currentCashLocal - investFiat);

        return res.json({
          success: true,
          message: `Yay! You successfully purchased ${sharesToAcquire.toFixed(4)} shares of ${ticker}!`,
          transaction: tx,
        });
      }

      // SELL Transaction Engine
      if (type === 'SELL') {
        const holdings = Database.getHoldings(profileName);
        const currentHolding = holdings.find((h) => h.ticker.toUpperCase() === ticker.toUpperCase());

        if (!currentHolding || currentHolding.shares <= 0.0) {
          return res.status(400).json({ success: false, error: `You don't own any shares of ${ticker} to sell!` });
        }

        // Amount represents either percentage (0-100) or shares to sell
        // We will default to liquidating ALL shares (100%) for child simplicity, or supporting custom percentages
        const pctToLiquidate = amount; // e.g. 100 means full liquidation
        if (pctToLiquidate < 1 || pctToLiquidate > 100) {
          return res.status(400).json({ success: false, error: 'Liquidating percentage must be between 1 and 100.' });
        }

        const sharesToSell = (pctToLiquidate / 100) * currentHolding.shares;
        const originalPrincipalUsd = (pctToLiquidate / 100) * currentHolding.originalPrincipalUsd;

        // Execute Double-Entry Ledger through Dad's clearance
        const clearance = await LedgerService.executeLiquidationDoubleEntry({
          ticker,
          shares: sharesToSell,
          currentPriceUsd: quote.priceUsd,
          originalPrincipalUsd: originalPrincipalUsd,
          savingsAccountId: profile.savingsAccountId,
          investmentAccountId: profile.investmentAccountId,
          currencyMode: profile.currencyMode,
          fxRate: fxFactor,
        });

        // Keep local cache in sync with Firefly III for fallback resilience
        const sellBalance = await LedgerService.getAccountBalance(profile.savingsAccountId);
        if (sellBalance !== null) {
          Database.updateCashBalance(profileName, sellBalance);
        }

        const totalLiquidationUsd = sharesToSell * quote.priceUsd;
        const totalLiquidationLocal = profile.currencyMode === 'PARITY' ? totalLiquidationUsd : (totalLiquidationUsd / fxFactor);

        // Update holding
        currentHolding.shares = Number((currentHolding.shares - sharesToSell).toFixed(4));
        currentHolding.originalPrincipalUsd = Number((currentHolding.originalPrincipalUsd - originalPrincipalUsd).toFixed(2));
        currentHolding.lastUpdated = new Date().toISOString();
        Database.saveHolding(currentHolding);

        // Log transaction
        const tx = Database.logTransaction({
          profileName,
          ticker,
          type: 'SELL',
          shares: Number(sharesToSell.toFixed(4)),
          priceUsd: quote.priceUsd,
          fxRate: fxFactor,
          fiatAmount: Number(totalLiquidationLocal.toFixed(2)),
          fireflyTransactionId: clearance.principalTransferId,
        });

        const deltaRounded = Number(clearance.deltaValue.toFixed(2));
        const gainMsg = deltaRounded > 0
          ? clearance.isGain
            ? `You earned ₪/$$ ${clearance.deltaValue.toFixed(2)} in profit from the Bank of Dad! 🎁`
            : `Your losses of ₪/$$ ${clearance.deltaValue.toFixed(2)} were adjusted through Dad's clearance.`
          : `You broke even — no profit or loss on this trade! Principal returned to savings. 📊`;

        return res.json({
          success: true,
          message: `Awesome! You sold ${sharesToSell.toFixed(4)} shares of ${ticker} for a total return of ₪/$$ ${totalLiquidationLocal.toFixed(2)}! ${gainMsg}`,
          transaction: tx,
        });
      }

      res.status(400).json({ success: false, error: 'Invalid trade type. Must be BUY or SELL.' });
    } catch (err: any) {
      console.error('[TradeEngine] Critical Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 10b. Parent Allowance / Capital Deposit
  app.post('/api/profiles/:name/deposit', async (req, res) => {
    try {
      const { name } = req.params;
      const { amount } = req.body; // in child's local currency (fiat)

      if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ success: false, error: 'Deposit amount must be a positive number!' });
      }

      const profile = Database.getProfile(name);
      if (!profile) {
        return res.status(404).json({ success: false, error: 'Profile not found.' });
      }

      // Create real Firefly III deposit: Bank of Dad → child's savings account
      const dadAccountId = process.env.BANK_OF_DAD_ACCOUNT_ID || '99';
      const depositId = await LedgerService.createTransfer(
        Number(amount),
        `Weekly allowance deposit for ${name}`,
        dadAccountId,
        profile.savingsAccountId
      );

      // Read live balance from Firefly after the deposit cleared
      const newCashLocal = await LedgerService.getAccountBalance(profile.savingsAccountId);

      // Keep local cache in sync with Firefly for fallback resilience
      if (newCashLocal !== null) {
        Database.updateCashBalance(name, newCashLocal);
      }

      // Increment cumulative deposits (app-level concept, tracked locally)
      const currentCumulative = profile.cumulativeDeposits || 500.0;
      const newCumulative = currentCumulative + Number(amount);
      const updatedProfile = Database.updateProfile(name, {
        cumulativeDeposits: newCumulative,
      });

      // Log transaction with real Firefly III ID
      Database.logTransaction({
        profileName: name,
        ticker: 'CASH_DEP',
        type: 'BUY',
        shares: 0.0,
        priceUsd: 1.0,
        fxRate: 1.0,
        fiatAmount: Number(amount),
        fireflyTransactionId: depositId,
      });

      // Immediately write/update snapshot for today so charts refresh instantly
      try {
        const dateStr = new Date().toISOString().split('T')[0];
        const holdings = Database.getHoldings(name);
        const fxRate = await MarketService.getILSExchangeRate();

        let totalStockValueUsd = 0;
        for (const h of holdings) {
          try {
            const q = await MarketService.getStockQuote(h.ticker);
            totalStockValueUsd += h.shares * q.priceUsd;
          } catch (e) {
            totalStockValueUsd += h.shares * h.averagePriceUsd;
          }
        }

        const liveBalance = newCashLocal ?? Database.getCashBalance(name);
        const fxFactor = profile.currencyMode === 'PARITY' ? 1.0 : fxRate;
        const cashUsd = profile.currencyMode === 'PARITY' ? liveBalance : (liveBalance * fxFactor);
        const totalValueUsd = cashUsd + totalStockValueUsd;

        const cumulativeDepositsUsd = profile.currencyMode === 'PARITY' ? newCumulative : (newCumulative * fxFactor);

        Database.addSnapshot({
          date: dateStr,
          profileName: name,
          totalValueUsd: Number(totalValueUsd.toFixed(2)),
          cashUsd: Number(cashUsd.toFixed(2)),
          stockValueUsd: Number(totalStockValueUsd.toFixed(2)),
          cumulativeDepositsUsd: Number(cumulativeDepositsUsd.toFixed(2)),
          cumulativeDepositsLocal: Number(newCumulative.toFixed(2)),
          totalValueLocal: profile.currencyMode === 'PARITY' ? Number(totalValueUsd.toFixed(2)) : Number((totalValueUsd / fxFactor).toFixed(2)),
        });
      } catch (errSnap) {
        console.error('Error writing immediate snapshot during deposit:', errSnap);
      }

      res.json({
        success: true,
        message: `Success! Deposited ₪/$$ ${amount} weekly allowance into ${name}'s piggy bank clearance!`,
        profile: updatedProfile,
        cashLocal: newCashLocal ?? Database.getCashBalance(name),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 11. Force Valuation snapshots worker (Nightly / Daily schedule trigger)
  app.post('/api/cron/snapshots', async (req, res) => {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const profiles = Database.getProfiles();
      const fxRate = await MarketService.getILSExchangeRate();

      for (const p of profiles) {
        const liveBalance = await LedgerService.getAccountBalance(p.savingsAccountId);
        const cashLocal = liveBalance ?? Database.getCashBalance(p.name);
        const holdings = Database.getHoldings(p.name);

        let totalStockValueUsd = 0;
        for (const h of holdings) {
          try {
            const q = await MarketService.getStockQuote(h.ticker);
            totalStockValueUsd += h.shares * q.priceUsd;
          } catch (e) {
            totalStockValueUsd += h.shares * h.averagePriceUsd;
          }
        }

        const fxFactor = p.currencyMode === 'PARITY' ? 1.0 : fxRate;
        const cashUsd = p.currencyMode === 'PARITY' ? cashLocal : (cashLocal * fxFactor);
        const totalValueUsd = cashUsd + totalStockValueUsd;
        
        const cumulativeDepositsLocal = p.cumulativeDeposits || 500.0;
        const cumulativeDepositsUsd = p.currencyMode === 'PARITY' ? cumulativeDepositsLocal : (cumulativeDepositsLocal * fxFactor);

        Database.addSnapshot({
          date: dateStr,
          profileName: p.name,
          totalValueUsd: Number(totalValueUsd.toFixed(2)),
          cashUsd: Number(cashUsd.toFixed(2)),
          stockValueUsd: Number(totalStockValueUsd.toFixed(2)),
          cumulativeDepositsUsd: Number(cumulativeDepositsUsd.toFixed(2)),
          cumulativeDepositsLocal: Number(cumulativeDepositsLocal.toFixed(2)),
          totalValueLocal: p.currencyMode === 'PARITY' ? Number(totalValueUsd.toFixed(2)) : Number((totalValueUsd / fxFactor).toFixed(2)),
        });
      }

      res.json({ success: true, message: `Valuation snapshots successfully recorded for ${profiles.length} profiles for date ${dateStr}.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Serve static assets and SPA pages (Vite setup)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
