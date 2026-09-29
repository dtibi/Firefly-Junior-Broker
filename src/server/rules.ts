/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure business rules for trades, liquidations and pocket-money transfers.
 * No network, no database — every rule the kids' money obeys lives here so it
 * can be unit-tested and so the SERVER and the LEDGER services can never
 * disagree about the arithmetic (they used to duplicate it).
 */

import { Holding, CurrencyMode } from '../types.js';

/** Minimum order size (buy and transfer) in the kid's local currency. */
export const MIN_ORDER_LOCAL = 10;
/** Smallest tradable fraction of a share. */
export const MIN_SHARE_FRACTION = 0.01;
/** The pocket money a transfer always leaves behind. */
export const KEEP_IN_POCKET_LOCAL = 10;
/** Lock ("promise") windows a kid can choose when moving pocket money to the fund. */
export const ALLOWED_LOCK_DAYS = [30, 90, 365];
export const DEFAULT_LOCK_DAYS = 90;

const round4 = (v: number) => Number(v.toFixed(4));
const round2 = (v: number) => Number(v.toFixed(2));

/**
 * Result of a rule check. NOTE: the project's tsconfig does not enable
 * `strictNullChecks`, so TypeScript cannot narrow a discriminated union here —
 * both fields therefore stay optional and callers must check `ok` first.
 * `error` is filled when `ok === false`, `value` when `ok === true`.
 */
export interface RuleResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// BUY
// ---------------------------------------------------------------------------

export interface BuyValue {
  /** Local amount (₪/$$) actually invested. */
  investLocal: number;
  /** USD amount used to buy shares. */
  investUsd: number;
  /** Shares acquired (4 decimals). */
  shares: number;
  /** Resulting holding row (merged with an existing position when present). */
  holding: Holding;
}

/**
 * Validates and computes a BUY. Mirrors the guardrails enforced by POST /api/trade.
 */
export function planBuy(params: {
  profileName: string;
  ticker: string;
  amountLocal: number;
  priceUsd: number;
  currencyMode: CurrencyMode;
  fxRate: number;
  existingHolding?: Holding | null;
  now?: Date;
}): RuleResult<BuyValue> {
  const { profileName, ticker, amountLocal, priceUsd, currencyMode, fxRate, existingHolding } = params;

  if (!Number.isFinite(amountLocal) || amountLocal < MIN_ORDER_LOCAL) {
    return {
      ok: false,
      error: `Minimum order size is exactly ${MIN_ORDER_LOCAL} currency units! (You tried to buy with ${amountLocal})`,
    };
  }
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return { ok: false, error: 'No live price is available for this stock right now.' };
  }

  const fxFactor = currencyMode === 'PARITY' ? 1.0 : fxRate;
  const investUsd = currencyMode === 'PARITY' ? amountLocal : amountLocal * fxFactor;
  const shares = investUsd / priceUsd;

  if (shares < MIN_SHARE_FRACTION) {
    return {
      ok: false,
      error: `Trade results in a fraction below the ${MIN_SHARE_FRACTION} share boundary (${shares.toFixed(4)} shares). Visual blockade triggered! Try investing a larger amount.`,
    };
  }

  const lastUpdated = (params.now || new Date()).toISOString();
  let holding: Holding;

  if (existingHolding && existingHolding.shares > 0) {
    const totalShares = existingHolding.shares + shares;
    const totalPrincipal = existingHolding.originalPrincipalUsd + investUsd;
    holding = {
      profileName,
      ticker,
      shares: round4(totalShares),
      averagePriceUsd: round2(totalPrincipal / totalShares),
      originalPrincipalUsd: round2(totalPrincipal),
      lastUpdated,
    };
  } else {
    holding = {
      profileName,
      ticker,
      shares: round4(shares),
      averagePriceUsd: round2(priceUsd),
      originalPrincipalUsd: round2(investUsd),
      lastUpdated,
    };
  }

  return { ok: true, value: { investLocal: amountLocal, investUsd: round2(investUsd), shares: round4(shares), holding } };
}

// ---------------------------------------------------------------------------
// SELL / liquidation (the "Bank of Dad" double entry)
// ---------------------------------------------------------------------------

export interface LiquidationValue {
  percentage: number;
  sharesToSell: number;
  /** USD principal of the sold slice (used to shrink the holding row). */
  principalUsd: number;
  /** USD market value of the sold slice. */
  currentUsd: number;
  /** Principal being returned, in the kid's local currency. */
  principalLocal: number;
  /** Market value of the sold slice, in local currency. */
  currentValueLocal: number;
  /** Signed gain/loss in local currency. */
  deltaLocal: number;
  isGain: boolean;
  /** What the investment account pays back to the fund (principal on a gain, value on a loss). */
  fundReturnLocal: number;
}

export function planLiquidation(params: {
  percentage: number;
  holding: Holding;
  priceUsd: number;
  currencyMode: CurrencyMode;
  fxRate: number;
}): RuleResult<LiquidationValue> {
  const { percentage, holding, priceUsd, currencyMode, fxRate } = params;

  if (!Number.isFinite(percentage) || percentage < 1 || percentage > 100) {
    return { ok: false, error: 'Liquidating percentage must be between 1 and 100.' };
  }
  if (!holding || holding.shares <= 0) {
    return { ok: false, error: 'You do not own any shares of this stock.' };
  }

  const sharesToSell = (percentage / 100) * holding.shares;
  const principalUsd = (percentage / 100) * holding.originalPrincipalUsd;
  const currentUsd = sharesToSell * priceUsd;
  const deltaUsd = currentUsd - principalUsd;
  const fxFactor = currencyMode === 'PARITY' ? 1.0 : fxRate; // ILS per USD when REAL
  const toLocal = (usd: number) => (currencyMode === 'PARITY' ? usd : usd / fxFactor);

  const principalLocal = round2(toLocal(principalUsd));
  const currentValueLocal = round2(toLocal(currentUsd));
  const deltaLocal = round2(toLocal(deltaUsd));
  const isGain = deltaLocal >= 0;

  return {
    ok: true,
    value: {
      percentage,
      sharesToSell: round4(sharesToSell),
      principalUsd: round2(principalUsd),
      currentUsd: round2(currentUsd),
      principalLocal,
      currentValueLocal,
      deltaLocal,
      isGain,
      fundReturnLocal: isGain ? principalLocal : currentValueLocal,
    },
  };
}

export interface PlannedTransfer {
  amount: number;
  from: string;
  to: string;
}

export interface LiquidationTransfers {
  principal: PlannedTransfer;
  /** Profit from Dad → fund, or loss from the fund → Dad (omitted when break-even). */
  adjustment?: PlannedTransfer & { kind: 'profit' | 'loss' };
}

/**
 * The three-legged double entry: principal always returns to the fund; the
 * gain comes from the Bank of Dad, the loss goes back to it.
 * Firefly III rejects zero-amount transfers, so a break-even sale has no adjustment.
 */
export function planLiquidationTransfers(
  value: LiquidationValue,
  accounts: { fundAccountId: string; investmentAccountId: string; dadAccountId: string }
): LiquidationTransfers {
  const principal: PlannedTransfer = {
    amount: value.fundReturnLocal,
    from: accounts.investmentAccountId,
    to: accounts.fundAccountId,
  };

  const adjustmentAmount = Number(Math.abs(value.deltaLocal).toFixed(2));
  if (adjustmentAmount <= 0) return { principal };

  return {
    principal,
    adjustment: value.isGain
      ? { amount: adjustmentAmount, from: accounts.dadAccountId, to: accounts.fundAccountId, kind: 'profit' }
      : { amount: adjustmentAmount, from: accounts.investmentAccountId, to: accounts.dadAccountId, kind: 'loss' },
  };
}

// ---------------------------------------------------------------------------
// Pocket money → invest fund
// ---------------------------------------------------------------------------

export interface TransferValue {
  amountLocal: number;
  days: number;
  lockedUntil: string;
}

export function validateTransfer(params: {
  amountLocal: number;
  pocketBalanceLocal: number;
  lockDays?: number;
  now?: Date;
}): RuleResult<TransferValue> {
  const amountLocal = Number(params.amountLocal);
  if (!Number.isFinite(amountLocal) || amountLocal < MIN_ORDER_LOCAL) {
    return {
      ok: false,
      error: `Minimum transfer is ₪/$$ ${MIN_ORDER_LOCAL} — the same as the minimum stock purchase.`,
    };
  }

  const days = ALLOWED_LOCK_DAYS.includes(Number(params.lockDays)) ? Number(params.lockDays) : DEFAULT_LOCK_DAYS;

  const spendable = Number(params.pocketBalanceLocal) - KEEP_IN_POCKET_LOCAL;
  if (amountLocal > spendable) {
    return {
      ok: false,
      error: `Not enough pocket money. You have ₪/$$ ${Number(params.pocketBalanceLocal).toFixed(2)} and we always keep ₪/$$ ${KEEP_IN_POCKET_LOCAL.toFixed(2)} in your pocket.`,
    };
  }

  const now = params.now || new Date();
  const lockedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  return { ok: true, value: { amountLocal: round2(amountLocal), days, lockedUntil } };
}

// ---------------------------------------------------------------------------
// Valuation / snapshots
// ---------------------------------------------------------------------------

export interface PocketSummary {
  pocketLocal: number;
  investFundLocal: number;
  stocksLocal: number;
  investedWorldLocal: number;
  totalMoneyLocal: number;
}

export function summarizePockets(params: {
  pocketLocal: number;
  investFundLocal: number;
  stocksLocal: number;
}): PocketSummary {
  const pocketLocal = round2(params.pocketLocal);
  const investFundLocal = round2(params.investFundLocal);
  const stocksLocal = round2(params.stocksLocal);
  const investedWorldLocal = round2(investFundLocal + stocksLocal);
  return {
    pocketLocal,
    investFundLocal,
    stocksLocal,
    investedWorldLocal,
    totalMoneyLocal: round2(pocketLocal + investedWorldLocal),
  };
}

/** Whole-minute-stable date string used for daily valuation snapshots (LOCAL date). */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
