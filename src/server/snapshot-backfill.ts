/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * snapshot-backfill.ts — rebuilding the daily valuation ("ביצועי ההון שלי") from the ledger.
 *
 * Why this exists: the daily snapshot writer can only value **today**. When nobody writes for a
 * while (the nightly trigger lives outside this container), the chart keeps a hole — the August
 * 2026 gap ran 13.08 → 17.09 with no points at all, while the ledger went on recording allowances
 * and trades. Everything here is pure: the caller feeds it the ledger's balances, the lots held,
 * that day's closes and the deposits baseline, and gets the snapshot row back.
 *
 * The rule that keeps it honest (validated against the snapshots written after the 20.10 fix):
 *   value(day) = the invest fund's cash on that day  +  Σ(open shares × that day's close)
 *   a lot closed ON a day is already sold for that day's snapshot (the writer values what is open
 *   when it runs, so a sale at noon is not in the 23:50 row).
 */

export interface LotLike {
  ticker: string;
  shares?: number;
  originalShares?: number;
  acquiredAt?: string;
  closedAt?: string | null;
  status?: string;
}

export interface PositionSlice {
  ticker: string;
  shares: number;
}

export interface ReconstructInput {
  date: string;
  /** Invest fund (Firefly savings) balance at the end of that day. */
  cashLocal: number;
  /** Pocket (checking) balance at the end of that day. */
  pocketLocal: number;
  positions: PositionSlice[];
  /** ticker -> the last close on or before `date`. A missing ticker is counted as 0 and reported. */
  closes: Record<string, number | undefined>;
  /** Money that entered the invested world up to that day (the chart's baseline). */
  depositsLocal: number;
}

export interface ReconstructedSnapshot {
  date: string;
  totalValueUsd: number;
  totalValueLocal: number;
  cashUsd: number;
  stockValueUsd: number;
  cumulativeDepositsUsd: number;
  cumulativeDepositsLocal: number;
  investFundLocal: number;
  spendingLocal: number;
  unpricedTickers: string[];
}

const round2 = (v: number) => Number(v.toFixed(2));
const day = (value?: string | null) => (value ? String(value).slice(0, 10) : '');

/** The days between two dates that have no snapshot yet (from inclusive, until exclusive). */
export function missingDays(storedDates: string[], from: string, until: string): string[] {
  const have = new Set(storedDates.map(day));
  const out: string[] = [];
  const start = new Date(`${day(from)}T00:00:00Z`);
  const end = new Date(`${day(until)}T00:00:00Z`);
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (!have.has(iso)) out.push(iso);
  }
  return out;
}

/** What was held on a given day: bought on or before it, not yet sold on it. */
export function positionsOn(lots: LotLike[], date: string): PositionSlice[] {
  const day0 = day(date);
  const held: Record<string, number> = {};
  for (const lot of lots) {
    const acquired = day(lot.acquiredAt);
    if (!acquired || acquired > day0) continue;
    const closed = day(lot.closedAt);
    if (closed && closed <= day0) continue; // sold on that day or earlier → not in that day's row
    const shares = Number(lot.shares || 0) > 0 ? Number(lot.shares) : Number(lot.originalShares || 0);
    if (shares > 0) held[lot.ticker] = Number(((held[lot.ticker] || 0) + shares).toFixed(6));
  }
  return Object.keys(held)
    .sort()
    .map((ticker) => ({ ticker, shares: held[ticker] }));
}

/** The last close on or before `date` (weekends and holidays reuse the previous trading day). */
export function closeOn(history: { date: string; price: number }[], date: string): number | null {
  const day0 = day(date);
  let bestDate = '';
  let best: number | null = null;
  for (const point of history) {
    const d = day(point.date);
    if (d <= day0 && d > bestDate && Number.isFinite(point.price)) {
      bestDate = d;
      best = point.price;
    }
  }
  return best;
}

/** Replays one Firefly account's journals into its balance on a given day. */
export function accountBalanceOn(
  journals: any[],
  accountId: string,
  date: string
): number {
  const day0 = day(date);
  let balance = 0;
  for (const journal of journals || []) {
    const splits: any[] = journal?.attributes?.transactions || [];
    for (const split of splits) {
      const touchesSource = String(split.source_id) === String(accountId);
      const touchesDestination = String(split.destination_id) === String(accountId);
      if (!touchesSource && !touchesDestination) continue;
      const when = day(split.date);
      if (!when || when > day0) continue;
      const amount = Number(split.amount || 0);
      balance += touchesDestination ? amount : -amount;
    }
  }
  return round2(balance);
}

/** Builds one snapshot row from the ledger facts of that day. */
export function reconstructSnapshot(input: ReconstructInput): ReconstructedSnapshot {
  let stock = 0;
  const unpriced: string[] = [];
  for (const position of input.positions) {
    const close = input.closes[position.ticker];
    if (typeof close !== 'number' || !Number.isFinite(close)) {
      unpriced.push(position.ticker);
      continue;
    }
    stock += position.shares * close;
  }
  const cash = round2(input.cashLocal);
  const value = round2(cash + stock);
  const deposits = round2(input.depositsLocal);
  return {
    date: day(input.date),
    totalValueUsd: value,
    totalValueLocal: value,
    cashUsd: cash,
    stockValueUsd: round2(stock),
    cumulativeDepositsUsd: deposits,
    cumulativeDepositsLocal: deposits,
    investFundLocal: cash,
    spendingLocal: round2(input.pocketLocal),
    unpricedTickers: unpriced,
  };
}
