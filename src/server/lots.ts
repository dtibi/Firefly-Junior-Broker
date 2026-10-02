/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure lot ("מגרש") rules — no network, no database, fully unit-testable.
 *
 * Model (approved 2026-10-02):
 *  - Every BUY opens its own lot. Lots are NEVER merged, so the kid always sees
 *    the ₪10 of Intel he bought in August next to the ₪10 he bought in September.
 *  - A lot remembers where its money came from (`fundingSource`) and that binding
 *    never changes: selling a pocket-funded lot returns the money to the POCKET,
 *    selling a fund-funded lot returns it to the INVEST FUND. Investment money can
 *    therefore never become pocket money, and there is no path between accounts.
 *  - Selling is always whole-lot(s) — the kid ticks the lots he owns — and each
 *    sold lot posts its own principal return + gain/loss adjustment in the ledger,
 *    so every lot stays traceable inside Firefly III.
 *  - Arithmetic mirrors the legacy three-legged liquidation exactly
 *    (gain: principal back + Dad profit → destination; loss: value back + loss
 *    →Dad; break-even: no adjustment leg at all).
 */

import { CurrencyMode, FundingSource, Holding, Lot } from '../types.js';
import { MIN_SHARE_FRACTION, RuleResult } from './rules.js';

const round4 = (v: number) => Number(v.toFixed(4));
const round2 = (v: number) => Number(v.toFixed(2));

// ---------------------------------------------------------------------------
// Opening a lot
// ---------------------------------------------------------------------------

export function newLot(params: {
  profileName: string;
  ticker: string;
  shares: number;
  /** Exact local amount the kid paid — kept as-is, never re-derived from FX. */
  principalLocal: number;
  principalUsd: number;
  priceUsd: number;
  acquiredAt: string;
  fundingSource: FundingSource;
  fireflyTransactionId: string;
  id?: string;
}): Lot {
  const shares = round4(params.shares);
  const principalLocal = round2(params.principalLocal);
  return {
    id: params.id || `lot-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    profileName: params.profileName,
    ticker: params.ticker.toUpperCase(),
    shares,
    originalShares: shares,
    principalLocal,
    originalPrincipalLocal: principalLocal,
    principalUsd: round2(params.principalUsd),
    priceUsdAtBuy: Number(params.priceUsd.toFixed(2)),
    acquiredAt: params.acquiredAt,
    fundingSource: params.fundingSource,
    fireflyTransactionId: params.fireflyTransactionId,
    status: 'OPEN',
  };
}

// ---------------------------------------------------------------------------
// Selling lots
// ---------------------------------------------------------------------------

export interface LotSale {
  lotId: string;
  ticker: string;
  /** Shares sold — a whole lot. */
  shares: number;
  principalUsd: number;
  principalLocal: number;
  currentUsd: number;
  currentValueLocal: number;
  /** Signed: positive = profit, negative = loss. */
  deltaLocal: number;
  isGain: boolean;
  /** What the investment account pays back: principal on a gain, value on a loss. */
  principalReturnLocal: number;
  /** |gain/loss| routed through the Bank of Dad (0 → no adjustment journal). */
  adjustmentLocal: number;
  adjustmentKind: 'none' | 'profit' | 'loss';
  /** Back where the money came from — the lot's own origin. */
  destination: FundingSource;
}

export interface LotSalePlan {
  sales: LotSale[];
  totals: {
    shares: number;
    principalLocal: number;
    currentValueLocal: number;
    deltaLocal: number;
    isGain: boolean;
    principalReturnLocal: number;
    adjustmentLocal: number;
  };
}

function toLocal(usd: number, currencyMode: CurrencyMode, fxRate: number): number {
  return currencyMode === 'PARITY' ? usd : usd / fxRate;
}

/** Prices ONE whole lot for sale. */
export function planLotSale(params: {
  lot: Lot;
  priceUsd: number;
  currencyMode: CurrencyMode;
  fxRate: number;
}): RuleResult<LotSale> {
  const { lot, priceUsd, currencyMode, fxRate } = params;

  if (!lot) return { ok: false, error: 'That lot does not exist.' };
  if (lot.status !== 'OPEN' || lot.shares <= 0) {
    return { ok: false, error: `You already sold this ${lot.ticker} lot.` };
  }
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return { ok: false, error: 'No live price is available for this stock right now.' };
  }
  if (lot.shares < MIN_SHARE_FRACTION) {
    return {
      ok: false,
      error: `This lot is smaller than the ${MIN_SHARE_FRACTION} share floor and cannot be traded.`,
    };
  }

  const shares = round4(lot.shares);
  const principalLocal = round2(lot.principalLocal); // exact — no proportional rounding
  const currentUsd = round2(shares * priceUsd);
  const currentValueLocal = round2(toLocal(currentUsd, currencyMode, fxRate));
  const deltaLocal = round2(currentValueLocal - principalLocal);
  const isGain = deltaLocal >= 0;
  const adjustmentLocal = Number(Math.abs(deltaLocal).toFixed(2));

  return {
    ok: true,
    value: {
      lotId: lot.id,
      ticker: lot.ticker,
      shares,
      principalUsd: round2(lot.principalUsd),
      principalLocal,
      currentUsd,
      currentValueLocal,
      deltaLocal,
      isGain,
      principalReturnLocal: isGain ? principalLocal : currentValueLocal,
      adjustmentLocal,
      adjustmentKind: adjustmentLocal <= 0 ? 'none' : isGain ? 'profit' : 'loss',
      destination: lot.fundingSource,
    },
  };
}

/** Prices a whole selection of lots (all of one ticker, in one profile). */
export function planLotSales(params: {
  lots: Lot[];
  priceUsd: number;
  currencyMode: CurrencyMode;
  fxRate: number;
}): RuleResult<LotSalePlan> {
  const lots = params.lots || [];
  if (lots.length === 0) {
    return { ok: false, error: 'Pick at least one lot to sell — the ones you bought.' };
  }
  const tickers = new Set(lots.map((l) => l.ticker.toUpperCase()));
  if (tickers.size > 1) {
    return { ok: false, error: 'A sale can only contain lots of one stock at a time.' };
  }
  const profiles = new Set(lots.map((l) => l.profileName));
  if (profiles.size > 1) {
    return { ok: false, error: 'A sale can only contain lots of one kid.' };
  }
  const ids = new Set(lots.map((l) => l.id));
  if (ids.size !== lots.length) {
    return { ok: false, error: 'The same lot was picked twice.' };
  }

  const sales: LotSale[] = [];
  for (const lot of lots) {
    const priced = planLotSale({
      lot,
      priceUsd: params.priceUsd,
      currencyMode: params.currencyMode,
      fxRate: params.fxRate,
    });
    if (!priced.ok) return { ok: false, error: priced.error };
    sales.push(priced.value as LotSale);
  }

  const totals = sales.reduce(
    (acc, s) => ({
      shares: round4(acc.shares + s.shares),
      principalLocal: round2(acc.principalLocal + s.principalLocal),
      currentValueLocal: round2(acc.currentValueLocal + s.currentValueLocal),
      deltaLocal: round2(acc.deltaLocal + s.deltaLocal),
      isGain: acc.isGain && s.isGain,
      principalReturnLocal: round2(acc.principalReturnLocal + s.principalReturnLocal),
      adjustmentLocal: round2(acc.adjustmentLocal + s.adjustmentLocal),
    }),
    {
      shares: 0,
      principalLocal: 0,
      currentValueLocal: 0,
      deltaLocal: 0,
      isGain: true,
      principalReturnLocal: 0,
      adjustmentLocal: 0,
    }
  );

  return { ok: true, value: { sales, totals } };
}

/** Closes a lot that was sold in full, recording its realized result. */
export function closeLot(params: { lot: Lot; sale: LotSale; closedAt: string }): Lot {
  return {
    ...params.lot,
    shares: 0,
    principalLocal: 0,
    principalUsd: 0,
    status: 'CLOSED',
    realizedPnlLocal: round2(params.sale.deltaLocal),
    closedAt: params.closedAt,
  };
}

// ---------------------------------------------------------------------------
// Reading lots
// ---------------------------------------------------------------------------

export function openLots(lots: Lot[], profileName: string, ticker?: string): Lot[] {
  return lots
    .filter(
      (l) =>
        l.profileName.toLowerCase() === profileName.toLowerCase() &&
        l.status === 'OPEN' &&
        (!ticker || l.ticker.toUpperCase() === ticker.toUpperCase())
    )
    .sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt));
}

export function closedLots(lots: Lot[], profileName: string, ticker?: string): Lot[] {
  return lots
    .filter(
      (l) =>
        l.profileName.toLowerCase() === profileName.toLowerCase() &&
        l.status === 'CLOSED' &&
        (!ticker || l.ticker.toUpperCase() === ticker.toUpperCase())
    )
    .sort((a, b) => String(b.closedAt || '').localeCompare(String(a.closedAt || '')));
}

/** The aggregate view (one row per ticker) derived from the OPEN lots. */
export function aggregateLots(lots: Lot[], profileName: string): Holding[] {
  const open = lots.filter(
    (l) => l.profileName.toLowerCase() === profileName.toLowerCase() && l.status === 'OPEN' && l.shares > 0
  );
  const byTicker = new Map<string, Lot[]>();
  for (const lot of open) {
    const key = lot.ticker.toUpperCase();
    byTicker.set(key, [...(byTicker.get(key) || []), lot]);
  }

  const holdings: Holding[] = [];
  for (const [ticker, group] of byTicker) {
    const shares = round4(group.reduce((sum, l) => sum + l.shares, 0));
    const principalUsd = round2(group.reduce((sum, l) => sum + l.principalUsd, 0));
    if (shares <= 0) continue;
    holdings.push({
      profileName,
      ticker,
      shares,
      averagePriceUsd: shares > 0 ? round2(principalUsd / shares) : 0,
      originalPrincipalUsd: principalUsd,
      lastUpdated: group.map((l) => l.acquiredAt).sort().slice(-1)[0],
    });
  }
  return holdings.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export interface LotSummary {
  openLots: number;
  closedLots: number;
  openPrincipalLocal: number;
  openPrincipalUsd: number;
  realizedPnlLocal: number;
}

export function summarizeLots(lots: Lot[], profileName: string): LotSummary {
  const mine = lots.filter((l) => l.profileName.toLowerCase() === profileName.toLowerCase());
  const open = mine.filter((l) => l.status === 'OPEN');
  return {
    openLots: open.length,
    closedLots: mine.filter((l) => l.status === 'CLOSED').length,
    openPrincipalLocal: round2(open.reduce((sum, l) => sum + l.principalLocal, 0)),
    openPrincipalUsd: round2(open.reduce((sum, l) => sum + l.principalUsd, 0)),
    realizedPnlLocal: round2(mine.reduce((sum, l) => sum + (l.realizedPnlLocal || 0), 0)),
  };
}
