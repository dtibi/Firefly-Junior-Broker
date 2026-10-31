/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Why a kid sold — the reason he picks before every sale.
 *
 * The reason is TEXT ONLY: it never changes an amount, a journal leg or a
 * destination. It is stored on the trade record and on the closed lot, and the
 * main sale journal in Firefly carries it in its description, so the ledger and
 * the app tell the same story.
 */

import { SellReasonCode } from './types.js';

export interface SellReasonOption {
  code: SellReasonCode;
  emoji: string;
  labelHe: string;
}

/** The buttons the kid chooses from — one is required before a sale is confirmed. */
export const SELL_REASONS: SellReasonOption[] = [
  { code: 'COMPANY_CHANGED', emoji: '🏭', labelHe: 'החברה עשתה משהו רע / כבר לא אוהב אותה' },
  { code: 'NEED_MONEY', emoji: '🛒', labelHe: 'אני צריך את הכסף לדבר אחר' },
  { code: 'AFRAID_OF_DROP', emoji: '😨', labelHe: 'המחיר ירד ואני מפחד שיירד עוד' },
  { code: 'SWITCHING', emoji: '🔄', labelHe: 'אני מחליף למניה אחרת שאני מאמין בה יותר' },
  { code: 'OTHER', emoji: '✏️', labelHe: 'משהו אחר' },
];

/** Free text is allowed (and shown) only with "משהו אחר". */
export const SELL_REASON_NOTE_MAX = 40;

const BY_CODE: Record<string, SellReasonOption> = Object.fromEntries(
  SELL_REASONS.map((r) => [r.code, r])
);

export function isSellReasonCode(value: unknown): value is SellReasonCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BY_CODE, value);
}

/** The one Hebrew sentence the kid (and the ledger) sees for a sale reason. */
export function sellReasonHe(code?: string | null, note?: string | null): string | null {
  if (!isSellReasonCode(code)) return null;
  const base = BY_CODE[code].labelHe;
  const clean = typeof note === 'string' ? note.trim().slice(0, SELL_REASON_NOTE_MAX) : '';
  return clean && code === 'OTHER' ? `${base}: ${clean}` : base;
}

/** Emoji + label, for the screens that list a sale. */
export function sellReasonLabelHe(code?: string | null, note?: string | null): string | null {
  if (!isSellReasonCode(code)) return null;
  const text = sellReasonHe(code, note);
  return text ? `${BY_CODE[code].emoji} ${text}` : null;
}
