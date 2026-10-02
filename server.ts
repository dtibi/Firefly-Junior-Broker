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
import {
  planBuy,
  validateBuyFunds,
  summarizePockets,
  localDateString,
  MIN_ORDER_LOCAL,
} from './src/server/rules.js';
import {
  aggregateLots,
  closeLot,
  newLot,
  openLots,
  planLotSales,
  summarizeLots,
} from './src/server/lots.js';
import {
  classifyStatement,
  monthlyStatement,
  withRunningBalances,
  STATEMENT_LABELS_HE,
} from './src/server/ledger-rules.js';
import { AIService } from './src/server/ai.js';
import { FundingSource, TradeRequest, TradeResponse } from './src/types.js';

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

      // Lots are the source of truth once a profile has any: the aggregate row
      // the dashboard shows is derived from them and lots are never merged.
      const storedLots = Database.getLots(profileName);
      const hasLots = storedLots.length > 0;
      const holdings = hasLots ? aggregateLots(storedLots, profileName) : Database.getHoldings(profileName);
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
            // The money invested in a position is its principal — not
            // shares × a rounded average price (that drift is what lots removed).
            const originalValueUsd = h.originalPrincipalUsd;
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

      // ---- The three pockets (see src/server/rules.ts) -----------------------
      const pockets = summarizePockets({
        pocketLocal: financials?.accounts.checking?.balance ?? 0,
        investFundLocal: rawCashBalance,
        stocksLocal: totalStockValueUsd / fxFactor,
      });
      const { pocketLocal, investFundLocal, stocksLocal, investedWorldLocal, totalMoneyLocal } = pockets;

      // ---- Baselines: money that came in from OUTSIDE ------------------------
      // Allowance / work income / pocket-money transfers raise the baseline, so
      // they are never reported as investment profit. Clearing-account flows are the
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

      // Every lot with its own live result — the kid sells specific lots, so the
      // UI must be able to show each one's profit/loss on its own.
      const lotsWithValue = await Promise.all(
        storedLots.map(async (lot) => {
          try {
            const quote = await MarketService.getStockQuote(lot.ticker);
            const currentValueUsd = Number((lot.shares * quote.priceUsd).toFixed(2));
            const gainLossUsd = Number((currentValueUsd - lot.principalUsd).toFixed(2));
            return {
              ...lot,
              currentPriceUsd: quote.priceUsd,
              currentValueUsd,
              gainLossUsd,
              gainLossPercent: lot.principalUsd > 0 ? Number(((gainLossUsd / lot.principalUsd) * 100).toFixed(2)) : 0,
            };
          } catch (e) {
            return { ...lot, currentPriceUsd: lot.priceUsdAtBuy, currentValueUsd: lot.principalUsd, gainLossUsd: 0, gainLossPercent: 0 };
          }
        })
      );
      const lotSummary = summarizeLots(storedLots, profileName);

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
        lots: lotsWithValue,
        lotSummary,
        // The kid sees TWO accounts: the pocket and the investing account
        // (its liquid balance = the fund's cash + the stocks at their live value).
        accounts: {
          pocket: {
            labelHe: 'חשבון כיס',
            accountId: profile.spendingAccountId ?? null,
            balanceLocal: pocketLocal,
          },
          invest: {
            labelHe: 'חשבון השקעות',
            fundAccountId: profile.savingsAccountId,
            investmentAccountId: profile.investmentAccountId,
            cashLocal: investFundLocal,
            stocksLocal,
            totalLocal: investedWorldLocal,
          },
        },
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
      const lotIds = (req.body as any).lotIds;

      // Basic parameter validations. A BUY needs an amount; a SELL needs either an
      // explicit lot selection or an amount (no selection = all lots of that stock).
      const hasAmount = amount !== undefined && amount !== null;
      // A SELL with an empty lotIds array means "all of his lots of that stock".
      const sellIsSellable = Array.isArray(lotIds) || hasAmount;
      if (!profileName || !pin || !ticker || !type || (type === 'SELL' ? !sellIsSellable : !hasAmount)) {
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

      // BUY Transaction Engine — one purchase = one lot, paid from the pocket or
      // from the invest fund (the kid chooses; money never moves between them).
      if (type === 'BUY') {
        const investFiat = Number(amount);
        const fundingSource: FundingSource = (req.body as any).fundingSource === 'POCKET' ? 'POCKET' : 'FUND';

        // 1. All guardrails + arithmetic live in src/server/rules.ts
        const buyPlan = planBuy({
          ticker,
          amountLocal: investFiat,
          priceUsd: quote.priceUsd,
          currencyMode: profile.currencyMode,
          fxRate,
          fundingSource,
        });
        if (!buyPlan.ok) {
          return res.status(400).json({ success: false, error: buyPlan.error });
        }
        const { shares: sharesToAcquire, investUsd } = buyPlan.value;

        // 2. Which account pays — and is the money already there? (The app never
        //    moves money between the accounts to cover a purchase.)
        const sourceAccountId =
          buyPlan.value.sourceAccountRole === 'spending' ? profile.spendingAccountId : profile.savingsAccountId;
        if (!sourceAccountId) {
          return res.status(400).json({ success: false, error: 'לפרופיל הזה אין חשבון מתאים לקנייה.' });
        }
        const financials = await LedgerService.getFinancialBreakdown(profile);
        const pocketLocal = financials?.accounts.checking?.balance ?? 0;
        const fundLocal =
          financials?.accounts.savings?.balance ??
          (await LedgerService.getAccountBalance(profile.savingsAccountId)) ??
          Database.getCashBalance(profileName);
        const funds = validateBuyFunds({ fundingSource, amountLocal: investFiat, pocketLocal, fundLocal });
        if (!funds.ok) {
          return res.status(400).json({ success: false, error: funds.error });
        }

        // 3. Ledger: the chosen account → the investments account.
        const ffTxId = await LedgerService.createTransfer(
          investFiat,
          `קניית ${sharesToAcquire.toFixed(4)} מניות ${ticker} (${quote.name}) ב-₪${investFiat.toFixed(2)} — `
            + `${fundingSource === 'POCKET' ? 'מהכיס' : 'מקרן ההשקעות'} — ${profileName}`,
          sourceAccountId,
          profile.investmentAccountId
        );

        // 4. The purchase becomes its own lot — lots are never merged.
        const lot = Database.saveLot(
          newLot({
            profileName,
            ticker,
            shares: sharesToAcquire,
            principalLocal: investFiat,
            principalUsd: investUsd,
            priceUsd: quote.priceUsd,
            acquiredAt: new Date().toISOString(),
            fundingSource,
            fireflyTransactionId: ffTxId,
          })
        );

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
        Database.updateCashBalance(profileName, fundLocal - (fundingSource === 'FUND' ? investFiat : 0));
        LedgerService.invalidateBreakdown(profileName);

        const fromHe = fundingSource === 'POCKET' ? 'מהכיס 🍬' : 'מקרן ההשקעות 📈';
        return res.json({
          success: true,
          message:
            `כל הכבוד! קנית ${sharesToAcquire.toFixed(4)} מניות ${ticker} ב-₪${investFiat.toFixed(2)} ${fromHe}. `
            + `זו עסקה נפרדת משלך — תראה בדיוק איך היא מרוויחה. 🧩`,
          transaction: tx,
          lot,
        });
      }

      // SELL Transaction Engine — the kid picks the lots HE bought; every sold lot
      // returns its money to the account it came from (pocket or invest fund).
      if (type === 'SELL') {
        const requestedIds: string[] = Array.isArray((req.body as any).lotIds)
          ? (req.body as any).lotIds.map((v: any) => String(v))
          : [];

        const open = openLots(Database.getLots(profileName), profileName, ticker);
        if (open.length === 0) {
          return res.status(400).json({ success: false, error: `אין לך מניות של ${ticker} למכירה.` });
        }
        const unknown = requestedIds.filter((id) => !open.some((l) => l.id === id));
        if (unknown.length) {
          return res.status(400).json({ success: false, error: 'אחד המגרשים שבחרת כבר לא זמין — רענן את הדף ונסה שוב.' });
        }
        // No explicit selection = sell everything he owns of this stock.
        const selected = requestedIds.length ? open.filter((l) => requestedIds.includes(l.id)) : open;

        // All arithmetic + validation lives in src/server/lots.ts
        const salePlan = planLotSales({
          lots: selected,
          priceUsd: quote.priceUsd,
          currencyMode: profile.currencyMode,
          fxRate,
        });
        if (!salePlan.ok) {
          return res.status(400).json({ success: false, error: salePlan.error });
        }
        const { sales, totals } = salePlan.value;

        // One journal pair per lot (approved): the principal goes back to the
        // account that lot came from, and only the gain/loss crosses the clearing account.
        const journalIds: string[] = [];
        for (const sale of sales) {
          const lot = selected.find((l) => l.id === sale.lotId) as (typeof selected)[number];
          const posted = await LedgerService.postLotSale({
            sale,
            kidName: profileName,
            acquiredAt: lot.acquiredAt,
            fundAccountId: profile.savingsAccountId,
            pocketAccountId: profile.spendingAccountId || '',
            investmentAccountId: profile.investmentAccountId,
          });
          journalIds.push(posted.principalTransferId);
          if (posted.adjustmentTransferId) journalIds.push(posted.adjustmentTransferId);

          Database.saveLot(closeLot({ lot, sale, closedAt: new Date().toISOString() }));
        }

        // Keep local cache in sync with Firefly III for fallback resilience
        const sellBalance = await LedgerService.getAccountBalance(profile.savingsAccountId);
        if (sellBalance !== null) {
          Database.updateCashBalance(profileName, sellBalance);
        }
        LedgerService.invalidateBreakdown(profileName);

        // Log transaction
        const tx = Database.logTransaction({
          profileName,
          ticker,
          type: 'SELL',
          shares: Number(totals.shares.toFixed(4)),
          priceUsd: quote.priceUsd,
          fxRate: fxFactor,
          fiatAmount: Number(totals.currentValueLocal.toFixed(2)),
          fireflyTransactionId: journalIds[0] || '',
        });

        const destinations = new Set(sales.map((s) => s.destination));
        const backHe =
          destinations.size === 1
            ? (sales[0].destination === 'POCKET' ? 'לכיס שלך 🍬' : 'לחשבון ההשקעות 📈')
            : 'לחשבונות שמהם הן נקנו';
        const resultHe =
          totals.deltaLocal > 0
            ? `הרווחת ₪${totals.deltaLocal.toFixed(2)} — השוק שילם לך את הרווח 🎁`
            : totals.deltaLocal < 0
              ? `הפסדת ₪${Math.abs(totals.deltaLocal).toFixed(2)} — הכסף נשאר בשוק 😢`
              : 'יצאת בדיוק באותו סכום — בלי רווח ובלי הפסד 📊';

        return res.json({
          success: true,
          message:
            `מכרת ${sales.length === 1 ? 'עסקה אחת' : `${sales.length} עסקאות`} של ${ticker} תמורת `
            + `₪${totals.currentValueLocal.toFixed(2)}; הכסף חזר ${backHe}. ${resultHe}`,
          transaction: tx,
          sales,
          journalIds,
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
      // Local date (not UTC): the nightly cron runs at 23:50 local, and a UTC
      // stamp would file "tonight" under tomorrow/yesterday depending on the zone.
      const dateStr = localDateString();
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

  // 12. Bank statement ("החשבון שלי") — every movement in the kid's two accounts,
  //     in Hebrew, with a running balance. Read-only.
  //     NOTE (approved 2026-10-02): the pocket→fund transfer and the
  //     withdraw-to-pocket lesson were REMOVED. Money cannot move between the
  //     accounts; it enters the invest account by buying (from the pocket or the
  //     fund) and leaves it by selling a lot, back to where it came from.
  app.get('/api/ledger/:profileName/statement', async (req, res) => {
    try {
      const profile = Database.getProfile(req.params.profileName);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found.' });
      if (!profile.spendingAccountId) {
        return res.status(400).json({ success: false, error: 'לפרופיל הזה אין חשבון כיס מקושר.' });
      }

      const [pocket, fund, investments, accountsById] = await Promise.all([
        LedgerService.getAccount(profile.spendingAccountId),
        LedgerService.getAccount(profile.savingsAccountId),
        LedgerService.getAccount(profile.investmentAccountId),
        LedgerService.listAccounts(),
      ]);
      if (!pocket || !fund || !investments) {
        return res.status(503).json({ success: false, error: 'הספר של Firefly לא זמין כרגע — נסו שוב בעוד רגע.' });
      }

      const journals: any[] = [];
      for (const account of [pocket, fund, investments]) {
        journals.push(...(await LedgerService.getAccountJournals(account.id)));
      }

      const rows = withRunningBalances(
        classifyStatement(journals, {
          pocketId: pocket.id,
          fundId: fund.id,
          investmentId: investments.id,
          clearingAccountId: process.env.MARKET_CLEARING_ACCOUNT_ID
            || process.env.BANK_OF_DAD_ACCOUNT_ID   // legacy name
            || '25',
          accountsById,
          openingByAccount: {
            [pocket.id]: pocket.openingBalance,
            [fund.id]: fund.openingBalance,
            [investments.id]: investments.openingBalance,
          },
        })
      );

      // Built-in check: the statement must end exactly where Firefly says the
      // accounts stand. When it does not, the page shows a warning instead of numbers.
      const lastOf = (section: 'POCKET' | 'INVEST') =>
        [...rows].reverse().find((r) => r.section === section)?.balanceLocal ?? 0;
      const finalPocket = lastOf('POCKET');
      const finalInvest = lastOf('INVEST');
      const expectedInvest = Number((fund.balance + investments.balance).toFixed(2));

      // Legacy trade rows were written in English inside Firefly. Re-label them in
      // Hebrew from the app's own trade record, so the kid reads his own language.
      const txByJournal = new Map(
        Database.getTransactions(profile.name).map((tx) => [String(tx.fireflyTransactionId), tx])
      );
      const movements = rows.map((row) => {
        const tx = txByJournal.get(String(row.journalId));
        if (tx && (row.kind === 'BUY' || row.kind === 'SELL')) {
          const amount = Number(tx.fiatAmount).toFixed(2);
          const investLabel =
            row.kind === 'BUY'
              ? `${STATEMENT_LABELS_HE.BUY} — קנית ${tx.shares} מניות ${tx.ticker} ב-₪${amount}`
              : `${STATEMENT_LABELS_HE.SELL} — מכרת ${tx.shares} מניות ${tx.ticker} ב-₪${amount}`;
          // The pocket account never holds stock: its side of the movement is money
          // going to / coming back from the investing account, and it reads that way.
          const pocketLabel =
            row.kind === 'BUY'
              ? `כסף שעבר לחשבון ההשקעות — ₪${amount} לקניית ${tx.ticker}`
              : `כסף שחזר מחשבון ההשקעות — ₪${amount} ממכירת ${tx.ticker}`;
          return {
            ...row,
            labelHe: row.section === 'POCKET' ? pocketLabel : investLabel,
            ticker: tx.ticker,
            shares: tx.shares,
          };
        }
        return row;
      });

      res.json({
        success: true,
        profile: profile.name,
        accounts: [
          {
            key: 'POCKET',
            labelHe: 'חשבון כיס',
            accountId: pocket.id,
            balanceLocal: pocket.balance,
            statementFinalLocal: finalPocket,
          },
          {
            key: 'INVEST',
            labelHe: 'חשבון השקעות',
            accountId: `${fund.id}+${investments.id}`,
            cashLocal: fund.balance,
            stocksLocal: investments.balance,
            balanceLocal: expectedInvest,
            statementFinalLocal: finalInvest,
          },
        ],
        movements,
        monthly: monthlyStatement(rows),
        reconciled:
          Math.abs(finalPocket - pocket.balance) < 0.02 && Math.abs(finalInvest - expectedInvest) < 0.02,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
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
