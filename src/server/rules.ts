/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure business rules for trades and pockets. No network, no database — every
 * rule the kids' money obeys lives here so it can be unit-tested and so the
 * SERVER and the LEDGER services can never disagree about the arithmetic.
 *
 * 2026-10-02 (approved): the pocket↔invest-fund transfer with its promise/lock
 * window was REMOVED. There is no way to move money between the two accounts:
 * money enters the invest account only by buying stock (paid from the pocket or
 * from the fund's cash) and leaves it only by selling a lot — and a sold lot
 * returns the money to the account it came from. See src/server/lots.ts.
 */

import { CurrencyMode, FundingSource } from '../types.js';

/** Minimum order size (buy) in the kid's local currency. */
export const MIN_ORDER_LOCAL = 10;
/** Smallest tradable fraction of a share. */
export const MIN_SHARE_FRACTION = 0.01;

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
  /** Where the money came from — and therefore where a future sale returns it. */
  fundingSource: FundingSource;
  /** Which of the kid's accounts pays: the pocket or the invest fund. */
  sourceAccountRole: 'spending' | 'savings';
}

/**
 * Validates and computes a BUY. Mirrors the guardrails enforced by POST /api/trade.
 * Nothing is merged here any more: every buy becomes its own lot.
 */
export function planBuy(params: {
  ticker: string;
  amountLocal: number;
  priceUsd: number;
  currencyMode: CurrencyMode;
  fxRate: number;
  fundingSource?: FundingSource;
}): RuleResult<BuyValue> {
  const { amountLocal, priceUsd, currencyMode, fxRate } = params;
  const fundingSource: FundingSource = params.fundingSource === 'POCKET' ? 'POCKET' : 'FUND';

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

  return {
    ok: true,
    value: {
      investLocal: round2(amountLocal),
      investUsd: round2(investUsd),
      shares: round4(shares),
      fundingSource,
      sourceAccountRole: fundingSource === 'POCKET' ? 'spending' : 'savings',
    },
  };
}

/**
 * Is there enough money in the account the kid chose to pay from?
 * Money is never moved between the accounts to cover a purchase — he can only
 * spend what is already there, which is the whole point of choosing.
 */
export function validateBuyFunds(params: {
  fundingSource: FundingSource;
  amountLocal: number;
  pocketLocal: number;
  fundLocal: number;
}): RuleResult<{ availableLocal: number; accountNameHe: string }> {
  const isPocket = params.fundingSource === 'POCKET';
  const availableLocal = round2(isPocket ? params.pocketLocal : params.fundLocal);
  const accountNameHe = isPocket ? 'בכיס' : 'בקרן ההשקעות';

  if (!Number.isFinite(params.amountLocal) || params.amountLocal <= 0) {
    return { ok: false, error: 'צריך לבחור סכום כדי לקנות.' };
  }
  if (round2(params.amountLocal) > availableLocal) {
    return {
      ok: false,
      error: `אין מספיק כסף ${accountNameHe}: יש ₪${availableLocal.toFixed(2)} ואתה מנסה לקנות ב-₪${round2(params.amountLocal).toFixed(2)}.`,
    };
  }

  return { ok: true, value: { availableLocal, accountNameHe } };
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
