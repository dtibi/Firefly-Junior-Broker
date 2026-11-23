/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * wealth-ranges.ts — the period picker and the ONE percentage the chart may show.
 *
 * Approved 2026-11-23, in the user's own words: "שינוי באחוזים בתיק רק מה שקשור לתזוזות בהשקעות…
 * אם כסף נמשך אז הוא נעל את הרווח/הפסד של אותה טרנזקציה, אבל אחרים עדיין חיים לפי שווי שלהם היום
 * בהשוואה למה שהיה בתווח. לא להראות 2 אחוזים, רק מספר אחד שמשקף את השינוי בתיק בתווח הזמן."
 *
 * In numbers, for a range [first … last]:
 *   changeLocal = (value_last − deposits_last) − (value_first − deposits_first)
 *   percent     = changeLocal / deposits_first × 100
 * Money in or out of the investing world is therefore invisible to the percentage: a sold lot
 * locks its own result, the lots still held are marked at today's value, and a deposit never
 * reads as a gain. Everything here is pure so the arithmetic is unit-tested, not eyeballed.
 */

export type WealthRange = 'WEEK' | 'MONTH' | 'YEAR' | 'YTD' | 'TWO_YEARS' | 'THREE_YEARS' | 'ALL';

export interface WealthPoint {
  date: string;
  price: number;
  cumulativeDeposits?: number;
}

const DAYS: Record<Exclude<WealthRange, 'YTD' | 'ALL'>, number> = {
  WEEK: 7,
  MONTH: 30,
  YEAR: 365,
  TWO_YEARS: 730,
  THREE_YEARS: 1095,
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The first day a range covers, measured from the newest snapshot (never from the browser clock). */
export function rangeStart(range: WealthRange, lastDate: string): string {
  const last = new Date(`${lastDate.slice(0, 10)}T00:00:00Z`);
  if (range === 'ALL') return '0000-01-01';
  if (range === 'YTD') return `${last.getUTCFullYear()}-01-01`;
  const from = new Date(last);
  from.setUTCDate(from.getUTCDate() - DAYS[range]);
  return iso(from);
}

export function filterByRange<T extends WealthPoint>(points: T[], range: WealthRange): T[] {
  if (!points.length) return [];
  const lastDate = points[points.length - 1].date;
  const from = rangeStart(range, lastDate);
  return points.filter((p) => p.date >= from);
}

/** True when the history does not reach back to the start of the requested range. */
export function rangeIsTruncated(points: WealthPoint[], range: WealthRange): boolean {
  if (!points.length || range === 'ALL') return false;
  const lastDate = points[points.length - 1].date;
  return points[0].date > rangeStart(range, lastDate);
}

export interface RangeSummary {
  from: string;
  to: string;
  /** The profit/loss the range added, in local currency (money in/out excluded). */
  changeLocal: number;
  /** ...as a percentage of the money that was in the investing world at the range start. */
  percent: number;
  /** Are the stocks' results in this number only, or do we not know (no deposits base)? */
  hasBase: boolean;
}

/** The single percentage of a range: what the portfolio did with the stocks it held. */
export function rangeSummary(points: WealthPoint[]): RangeSummary {
  const empty: RangeSummary = { from: '', to: '', changeLocal: 0, percent: 0, hasBase: false };
  if (points.length < 2) return empty;

  const first = points[0];
  const last = points[points.length - 1];
  const profit = (p: WealthPoint) => p.price - (p.cumulativeDeposits ?? p.price);
  const deposits = first.cumulativeDeposits ?? 0;

  const changeLocal = Number((profit(last) - profit(first)).toFixed(2));
  const base = Number(deposits.toFixed(2));
  const percent = base > 0 ? Number(((changeLocal / base) * 100).toFixed(2)) : 0;
  return {
    from: first.date,
    to: last.date,
    changeLocal,
    percent,
    hasBase: base > 0,
  };
}

/**
 * The same series in percent mode: 0% at the range's first day, ending on the single number.
 * No deposits are involved anywhere — that is the whole point of the approved model.
 */
export function percentSeries(points: WealthPoint[]): { date: string; percent: number; valueLocal: number }[] {
  if (!points.length) return [];
  const profit = (p: WealthPoint) => p.price - (p.cumulativeDeposits ?? p.price);
  const base = points[0].cumulativeDeposits ?? 0;
  const zero = profit(points[0]);
  return points.map((p) => ({
    date: p.date,
    percent: base > 0 ? Number((((profit(p) - zero) / base) * 100).toFixed(2)) : 0,
    valueLocal: p.price,
  }));
}

/** "4 חודשים" — the honest note when a range is longer than the recorded history. */
export function monthsOfHistory(points: WealthPoint[]): number {
  if (points.length < 2) return 0;
  const first = new Date(`${points[0].date}T00:00:00Z`);
  const last = new Date(`${points[points.length - 1].date}T00:00:00Z`);
  return Math.max(1, Math.round((last.getTime() - first.getTime()) / (30 * 24 * 3600 * 1000)));
}
