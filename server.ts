/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import * as path from 'path';
import { createServer as createViteServer } from 'vite';
import { Database } from './src/server/db.js';
import { MarketService, STOCK_CATEGORIES } from './src/server/alpaca.js';
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
      const profiles = Database.getProfiles().map(({ pinHash, ...p }) => ({
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
        spendingAccountId: req.body.spendingAccountId,
        transfersEnabled: req.body.transfersEnabled,
        avatar: avatar || '⭐',
      });

      const { pinHash, ...safeProfile } = newProfile;
      res.json({ success: true, profile: safeProfile });
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
        const { pinHash, ...safeProfile } = Database.getProfile(name)!;
        const currentYear = new Date().getFullYear();
        res.json({
          success: true,
          profile: {
            ...safeProfile,
            age: currentYear - safeProfile.birthYear,
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
        const { pinHash, ...safeProfile } = updated;
        res.json({ success: true, profile: safeProfile });
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

      // Live financial breakdown from Firefly III: the three pockets
      // (pocket money / invest fund / invested principal) + the real
      // "money in from outside" baseline that the performance chart needs.
      const financials = await LedgerService.getFinancialBreakdown(profile);

      // Fetch live balance from Firefly III savings account (fall back to local cache)
      const liveBalance = financials?.accounts.savings?.balance ?? await LedgerService.getAccountBalance(profile.savingsAccountId);
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
      const portfolioTotalUsd = cashValueUsd + totalStockValueUsd; // invested world: fund + stocks
      const portfolioTotalLocal = profile.currencyMode === 'PARITY' ? portfolioTotalUsd : (portfolioTotalUsd / fxFactor);

      // ---- The three pockets -------------------------------------------------
      const pocketLocal = Number((financials?.accounts.checking?.balance ?? 0).toFixed(2));
      const investFundLocal = Number(rawCashBalance.toFixed(2));
      const stocksLocal = Number((totalStockValueUsd / fxFactor).toFixed(2));
      const investedWorldLocal = Number((investFundLocal + stocksLocal).toFixed(2));
      const totalMoneyLocal = Number((pocketLocal + investedWorldLocal).toFixed(2));

      // ---- Baselines: money that came in from OUTSIDE ------------------------
      // Allowance / work income / pocket-money transfers raise the baseline, so
      // they are never reported as investment profit. Bank-of-Dad flows are the
      // trading profit/loss itself and are excluded from the baseline.
      const investedFromOutsideLocal = Number(
        (financials?.investedFromOutsideLocal ?? profile.cumulativeDeposits ?? 0).toFixed(2)
      );
      const totalExternalLocal = Number(
        (financials?.externalDepositsLocal ?? profile.cumulativeDeposits ?? 0).toFixed(2)
      );
      const realizedPnlLocal = Number((financials?.realizedPnlLocal ?? 0).toFixed(2));
      const investedProfitLocal = Number((investedWorldLocal - investedFromOutsideLocal).toFixed(2));
      const totalProfitLocal = Number((totalMoneyLocal - totalExternalLocal).toFixed(2));

      const transactions = Database.getTransactions(profileName);
      const snapshots = Database.getSnapshots(profileName);
      const transfers = Database.getTransfers(profileName);
      const nowMs = Date.now();
      const lockedLocal = Number(
        transfers
          .filter((t) => new Date(t.lockedUntil).getTime() > nowMs)
          .reduce((sum, t) => sum + t.amountLocal, 0)
          .toFixed(2)
      );

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
          // pocket breakdown
          pocketLocal,
          investFundLocal,
          stocksLocal,
          investedWorldLocal,
          totalMoneyLocal,
          // money in from outside vs. real profit
          investedFromOutsideLocal,
          totalExternalLocal,
          realizedPnlLocal,
          investedProfitLocal,
          totalProfitLocal,
          fireflyAccounts: {
            spending: profile.spendingAccountId ?? null,
            savings: profile.savingsAccountId,
            investment: profile.investmentAccountId,
          },
        },
        holdings: activeHoldings,
        transactions,
        snapshots,
        transfers,
        lockedLocal,
        transfersEnabled: profile.transfersEnabled === true,
        financialsFetchedAt: financials?.fetchedAt ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. Get stock catalog with live prices
  app.get('/api/stocks', async (req, res) => {
    try {
      const quotes = await MarketService.getAllStockQuotes();
      res.json({ success: true, stocks: quotes, categories: STOCK_CATEGORIES });
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
        LedgerService.invalidateBreakdown(profileName);

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
        LedgerService.invalidateBreakdown(profileName);

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

  // 10b. Allowance deposits are managed directly in Firefly III.
  // The app reads live balances from Firefly, so any deposit made there is instantly reflected.

  // 11. Force Valuation snapshots worker (Nightly / Daily schedule trigger)
  app.post('/api/cron/snapshots', async (req, res) => {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const profiles = Database.getProfiles();
      const fxRate = await MarketService.getILSExchangeRate();

      for (const p of profiles) {
        const financials = await LedgerService.getFinancialBreakdown(p);
        const cashLocal = financials?.accounts.savings?.balance ?? Database.getCashBalance(p.name);
        const pocketLocal = financials?.accounts.checking?.balance ?? 0;
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

        // The baseline is the money that really came in from outside (allowance,
        // work income, pocket-money transfers) — never trading profit.
        const cumulativeDepositsLocal = financials?.investedFromOutsideLocal ?? (p.cumulativeDeposits || 0);
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
          spendingLocal: Number(pocketLocal.toFixed(2)),
          investFundLocal: Number(cashLocal.toFixed(2)),
        });
      }

      res.json({ success: true, message: `Valuation snapshots successfully recorded for ${profiles.length} profiles for date ${dateStr}.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 12. Pocket money → invest fund transfer (kid-initiated, PIN-protected)
  app.post('/api/profiles/:name/transfer', async (req, res) => {
    try {
      const { name } = req.params;
      const { pin, amount, lockDays } = req.body as { pin?: string; amount?: number; lockDays?: number };

      const profile = Database.getProfile(name);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found.' });
      if (profile.transfersEnabled !== true) {
        return res.status(403).json({
          success: false,
          error: 'Moving pocket money into the invest fund is not open for this profile yet.',
        });
      }
      if (!profile.spendingAccountId) {
        return res.status(400).json({ success: false, error: 'No pocket-money account is linked to this profile.' });
      }
      if (!pin || !Database.verifyPin(profile.name, pin)) {
        return res.status(401).json({ success: false, error: 'Incorrect 4-digit PIN! Authorization failed.' });
      }

      const amountLocal = Number(amount);
      if (!Number.isFinite(amountLocal) || amountLocal < 10) {
        return res.status(400).json({
          success: false,
          error: 'Minimum transfer is ₪/$$ 10 — the same as the minimum stock purchase.',
        });
      }
      const days = [30, 90, 365].includes(Number(lockDays)) ? Number(lockDays) : 90;

      const financials = await LedgerService.getFinancialBreakdown(profile);
      const pocketBalance = financials?.accounts.checking?.balance ?? 0;
      const keepInPocket = 10; // never empty the pocket completely
      if (amountLocal > pocketBalance - keepInPocket) {
        return res.status(400).json({
          success: false,
          error: `Not enough pocket money. You have ₪/$$ ${pocketBalance.toFixed(2)} and we always keep ₪/$$ ${keepInPocket.toFixed(2)} in your pocket.`,
        });
      }

      const ffId = await LedgerService.createTransfer(
        amountLocal,
        `Pocket money → invest fund (promised to keep ${days} days)`,
        profile.spendingAccountId,
        profile.savingsAccountId
      );

      const transfer = Database.addTransfer({
        profileName: profile.name,
        amountLocal: Number(amountLocal.toFixed(2)),
        lockDays: days,
        lockedUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        fireflyTransactionId: ffId,
      });

      LedgerService.invalidateBreakdown(profile.name);

      return res.json({
        success: true,
        message: `Awesome! You moved ₪/$$ ${amountLocal.toFixed(2)} from your pocket into your invest fund — and you promised not to touch it for ${days} days. 💪`,
        transfer,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13. The one-way valve: money leaves the invest fund only by SELLING stock,
  //     and only a grown-up can move it back to the pocket. Kids get the lesson
  //     (and the countdown of the promise they made) instead of a withdrawal.
  app.post('/api/profiles/:name/withdraw-to-pocket', (req, res) => {
    const profile = Database.getProfile(req.params.name);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found.' });

    const locked = Database.getTransfers(profile.name).filter(
      (t) => new Date(t.lockedUntil).getTime() > Date.now()
    );
    const lockedTotal = locked.reduce((sum, t) => sum + t.amountLocal, 0);
    const daysLeft = locked.length
      ? Math.ceil((new Date(locked[0].lockedUntil).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : 0;

    const error = locked.length
      ? `Not yet! ₪/$$ ${lockedTotal.toFixed(2)} of your money is locked for another ${daysLeft} days — that is the promise you made. Money that waits works for you. 🌱`
      : 'Invested money stays invested — that is the whole trick! If you really need money, ask a grown-up: only they can move money out of the invest fund. 🏦';

    return res.status(403).json({ success: false, error });
  });

  // 14. Maintenance: rebuild the chart baseline of every historical snapshot
  //     from the real Firefly III deposit history (one-off, safe to re-run).
  app.post('/api/admin/recalc-snapshots', async (req, res) => {
    try {
      const fxRate = await MarketService.getILSExchangeRate();
      const report: any[] = [];

      for (const p of Database.getProfiles()) {
        const financials = await LedgerService.getFinancialBreakdown(p);
        if (!financials) {
          report.push({ profile: p.name, updated: 0, error: 'Firefly breakdown unavailable' });
          continue;
        }

        let updated = 0;
        for (const snapshot of Database.getSnapshots(p.name)) {
          const baseline = await LedgerService.getInvestedBaselineAsOf(p.name, snapshot.date);
          if (baseline === null) continue;
          Database.addSnapshot({
            ...snapshot,
            cumulativeDepositsLocal: baseline,
            cumulativeDepositsUsd: p.currencyMode === 'PARITY' ? baseline : Number((baseline * fxRate).toFixed(2)),
          });
          updated += 1;
        }

        report.push({
          profile: p.name,
          updated,
          baselineToday: financials.investedFromOutsideLocal,
        });
      }

      res.json({ success: true, report });
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
    // Serve public assets (PWA manifest, icons)
    const publicPath = path.join(process.cwd(), 'public');
    app.use(express.static(publicPath));
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
