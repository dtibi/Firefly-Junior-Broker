/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure ledger rules — the "honest money" accounting of the Junior Broker,
 * with no network and no database access so it can be unit-tested directly.
 *
 * Model: every kid has three pockets — 🍬 pocket money (checking), 🏦 invest
 * fund (savings) and 📈 invested principal (investment). Two baselines are
 * derived from the Firefly III journal:
 *
 *   externalDepositsLocal     — money in/out of the WHOLE kid (pocket included)
 *   investedFromOutsideLocal  — money in/out of the INVESTED WORLD (fund+principal);
 *                               a pocket → fund transfer counts here, so moving your
 *                               own money into the fund never looks like profit
 *
 * Rules:
 *  - Flows with the market clearing account are the trading P&L — never a deposit.
 *  - Firefly mirrors opening balances as synthetic "opening balance" transactions;
 *    they are skipped here and added exactly once from the account record.
 *  - Internal moves (own account → own account) never change a whole-kid baseline,
 *    but a move that crosses the fund boundary does change the invested baseline.
 */

export interface LedgerSplit {
  type?: string;
  source_id?: string | number | null;
  destination_id?: string | number | null;
  amount?: string | number | null;
  date?: string;
  description?: string;
}

export interface LedgerJournal {
  id?: string | number;
  attributes?: { transactions?: LedgerSplit[] };
}

export interface LedgerAccount {
  id: string;
  name: string;
  type?: string;
  /** Opening balance as recorded in Firefly (0/undefined when there is none). */
  openingBalance?: number;
  /** ISO date of the opening balance. */
  openingDate?: string;
}

export interface Flow {
  date: string;
  /** Positive = money in, negative = money out. */
  amount: number;
  description: string;
}

export interface FlowClassification {
  externalDepositsLocal: number;
  investedFromOutsideLocal: number;
  realizedPnlLocal: number;
  externalFlows: Flow[];
  investedFlows: Flow[];
}

const round2 = (value: number) => Number(value.toFixed(2));

/**
 * Classifies every split of every journal that touches the kid's accounts.
 */
export function classifyKidLedger(
  journals: LedgerJournal[],
  options: {
    /** The kid's own accounts (pocket + fund + invested principal). */
    own: LedgerAccount[];
    /** Ids that belong to the INVESTED world (invest fund + invested principal). */
    fundIds: string[];
    /** The market clearing account id (trading P&L). */
    clearingAccountId: string;
  }
): FlowClassification {
  const ownIds = new Set(options.own.map((a) => String(a.id)));
  const fundIds = new Set(options.fundIds.map(String));
  const clearingId = String(options.clearingAccountId);

  let externalDepositsLocal = 0;
  let investedFromOutsideLocal = 0;
  let realizedPnlLocal = 0;
  const externalFlows: Flow[] = [];
  const investedFlows: Flow[] = [];

  // Opening balances are counted exactly once (Firefly also emits them as a
  // synthetic transaction, which the loop below skips).
  for (const account of options.own) {
    const opening = Number(account.openingBalance || 0);
    if (!opening) continue;
    const date = String(account.openingDate || '').slice(0, 10);
    const description = `יתרת פתיחה — ${account.name}`;
    externalDepositsLocal += opening;
    externalFlows.push({ date, amount: opening, description });
    if (fundIds.has(String(account.id))) {
      investedFromOutsideLocal += opening;
      investedFlows.push({ date, amount: opening, description });
    }
  }

  const seenJournals = new Set<string>();
  for (const journal of journals) {
    const journalId = String(journal.id ?? '');
    if (journalId) {
      if (seenJournals.has(journalId)) continue; // the same journal can show up per account
      seenJournals.add(journalId);
    }

    for (const split of journal.attributes?.transactions || []) {
      if (split.type === 'opening balance') continue;

      const src = String(split.source_id ?? '');
      const dst = String(split.destination_id ?? '');
      const amount = Number(split.amount || 0);
      if (!amount) continue;

      // Clearing flows ARE the profit/loss: never part of a baseline.
      if (src === clearingId || dst === clearingId) {
        if (dst === clearingId) realizedPnlLocal -= amount;
        else realizedPnlLocal += amount;
        continue;
      }

      const date = String(split.date || '').slice(0, 10);
      const description = split.description || '';
      const srcOwn = ownIds.has(src);
      const dstOwn = ownIds.has(dst);

      // 1) Whole-kid boundary: allowance in, spending out, family transfers.
      if (srcOwn !== dstOwn) {
        const delta = dstOwn ? amount : -amount;
        externalDepositsLocal += delta;
        externalFlows.push({ date, amount: delta, description });
      }

      // 2) Invested-world boundary: the pocket counts as "outside" the fund.
      const srcFund = fundIds.has(src);
      const dstFund = fundIds.has(dst);
      if (srcFund !== dstFund) {
        const delta = dstFund ? amount : -amount;
        investedFromOutsideLocal += delta;
        investedFlows.push({ date, amount: delta, description });
      }
    }
  }

  return {
    externalDepositsLocal: round2(externalDepositsLocal),
    investedFromOutsideLocal: round2(investedFromOutsideLocal),
    realizedPnlLocal: round2(realizedPnlLocal),
    externalFlows: externalFlows.sort((a, b) => a.date.localeCompare(b.date)),
    investedFlows: investedFlows.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Cumulative baseline up to and including `date` (ISO yyyy-mm-dd).
 * Used to rebuild historical snapshots — flows dated AFTER the date are excluded,
 * which is what keeps a late-night correction from leaking into yesterday's chart.
 */
export function cumulativeThrough(flows: Flow[], date: string): number {
  const sum = flows
    .filter((flow) => String(flow.date).slice(0, 10) <= date)
    .reduce((total, flow) => total + flow.amount, 0);
  return round2(sum);
}

/** The gap between what the kid owns and what came in — i.e. the real profit. */
export function investedProfit(investedWealthLocal: number, baselineLocal: number): number {
  return round2(investedWealthLocal - baselineLocal);
}

// ---------------------------------------------------------------------------
// Bank statement ("החשבון שלי")
// ---------------------------------------------------------------------------

/** The two accounts the kid sees: the pocket and the investing account. */
export type StatementSection = 'POCKET' | 'INVEST';

export type StatementKind =
  | 'OPENING'
  | 'ALLOWANCE'
  | 'SAVING'
  | 'DEPOSIT'
  | 'SPENDING'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'BUY'
  | 'SELL'
  | 'PROFIT'
  | 'LOSS'
  | 'CORRECTION';

/** Everything the kid reads on the statement is in Hebrew. */
export const STATEMENT_LABELS_HE: Record<StatementKind, string> = {
  OPENING: 'יתרת פתיחה',
  ALLOWANCE: 'דמי כיס',
  SAVING: 'חיסכון אוטומטי',
  DEPOSIT: 'הפקדה',
  SPENDING: 'הוצאה',
  TRANSFER_IN: 'כסף שנכנס',
  TRANSFER_OUT: 'כסף שיצא',
  BUY: 'קניית מניה',
  SELL: 'מכירת מניה',
  PROFIT: 'רווח במכירת מניה',
  LOSS: 'הפסד במכירת מניה',
  CORRECTION: 'תיקון',
};

export interface StatementRow {
  journalId: string;
  date: string;
  kind: StatementKind;
  labelHe: string;
  description: string;
  section: StatementSection;
  /** The money that moved in this action (cash out to buy stock, cash in from a sale). */
  amountLocal: number;
  /** Effect on that account's total (cash + stock at cost) — a purchase swaps, so 0. */
  balanceDeltaLocal: number;
  /** Cash moved, signed from that account's point of view. */
  cashLocal: number;
  /** A short explanation the UI shows under the row when the two numbers differ. */
  noteHe?: string;
  shares?: number;
  ticker?: string;
  /** Filled by withRunningBalances(). */
  balanceLocal?: number;
}

export interface StatementInput {
  pocketId: string;
  fundId: string;
  investmentId: string;
  clearingAccountId: string;
  /** id → {name, type} for every account in the instance. */
  accountsById: Record<string, { name?: string; type?: string }>;
  /** Opening balances, so the statement can start where the ledger starts. */
  openingByAccount?: Record<string, number>;
}

function kinderLabel(kind: StatementKind, description: string): string {
  const base = STATEMENT_LABELS_HE[kind];
  if (kind === 'PROFIT' || kind === 'LOSS') {
    // Name the stock the result came from: the kid gains or loses on the trade.
    const ticker = tickerFromDescription(description);
    return ticker ? `${base.replace('מניה', ticker)}` : base;
  }
  if (!description) return base;
  // Trade rows written before 2026-10-02 carry English descriptions from Firefly
  // ("Stock Purchase: Buy 0.1352 shares of SPY"). The kid reads Hebrew, so those
  // are suppressed here; the server re-labels them from the local trade record
  // with a Hebrew sentence instead.
  const hasHebrew = /[\u0590-\u05FF]/.test(description);
  if (!hasHebrew && (kind === 'BUY' || kind === 'SELL')) return base;
  return `${base} — ${description}`;
}

/** "רווח במכירת TSLA: +₪0.30 מהשוק" / "... Sell 0.0146 shares of TSLA" → TSLA */
export function tickerFromDescription(description: string): string | null {
  const hebrew = description.match(/מכירת\s+([A-Z][A-Z.]{0,6})/);
  if (hebrew) return hebrew[1];
  const english = description.match(/shares of ([A-Z][A-Z.]{0,6})/);
  if (english) return english[1];
  return null;
}

/**
 * Turns raw Firefly splits into statement rows, in Hebrew, grouped into the two
 * accounts the kid understands:
 *   POCKET = his pocket-money account, INVEST = the invest fund + the stocks.
 * Stock moves inside the invest account never change its total (cash becomes
 * stock at cost), which is exactly how a bank statement shows a purchase.
 */
export function classifyStatement(journals: LedgerJournal[], input: StatementInput): StatementRow[] {
  const sectionOf = (id: string): StatementSection | null => {
    if (id === input.pocketId) return 'POCKET';
    if (id === input.fundId || id === input.investmentId) return 'INVEST';
    return null;
  };
  const clearingId = String(input.clearingAccountId);

  const rows: StatementRow[] = [];

  // Opening balances first — one row per account that has one.
  for (const [accountId, opening] of Object.entries(input.openingByAccount || {})) {
    const section = sectionOf(String(accountId));
    if (!section || !opening) continue;
    rows.push({
      journalId: '',
      date: '',
      kind: 'OPENING',
      labelHe: STATEMENT_LABELS_HE.OPENING,
      description: input.accountsById[String(accountId)]?.name || '',
      section,
      amountLocal: round2(opening),
      balanceDeltaLocal: round2(opening),
      cashLocal: round2(opening),
    });
  }

  const seen = new Set<string>();
  for (const journal of journals) {
    const journalId = String(journal.id ?? '');
    for (const split of journal.attributes?.transactions || []) {
      if (split.type === 'opening balance') continue;
      const amount = Number(split.amount || 0);
      if (!amount) continue;

      const src = String(split.source_id ?? '');
      const dst = String(split.destination_id ?? '');
      const sig = `${journalId}|${src}|${dst}|${amount}|${split.date}|${split.description || ''}`;
      if (seen.has(sig)) continue; // the same split comes back once per touched account
      seen.add(sig);

      const date = String(split.date || '').slice(0, 10);
      const description = split.description || '';
      const srcSection = sectionOf(src);
      const dstSection = sectionOf(dst);
      const base = { journalId, date, description };

      // The clearing account settles a SALE's result; the kid is the one who made
      // or lost the money on the market, so the row carries the stock's name.
      if (src === clearingId && dstSection) {
        rows.push({
          ...base,
          kind: 'PROFIT',
          labelHe: kinderLabel('PROFIT', description),
          section: dstSection,
          amountLocal: round2(amount),
          balanceDeltaLocal: round2(amount),
          cashLocal: round2(amount),
        });
        continue;
      }
      if (dst === clearingId && srcSection) {
        rows.push({
          ...base,
          kind: 'LOSS',
          labelHe: kinderLabel('LOSS', description),
          section: srcSection,
          amountLocal: round2(-amount),
          balanceDeltaLocal: round2(-amount),
          cashLocal: round2(-amount),
        });
        continue;
      }

      const counterparty = input.accountsById[src === input.pocketId || srcSection ? dst : src] || {};
      const isCorrection = /תיקון/.test(description);

      // ---- inside the kid's own accounts ----
      if (srcSection && dstSection) {
        if (srcSection === dstSection) {
          // Cash ↔ stock inside the investing account. The money that moved is the
          // purchase (or the sale), so that is what the row shows — but the account's
          // TOTAL does not change: the cash simply became stock (or back).
          if (src === input.fundId && dst === input.investmentId) {
            rows.push({
              ...base,
              kind: 'BUY',
              labelHe: kinderLabel('BUY', description),
              section: 'INVEST',
              amountLocal: round2(-amount),
              balanceDeltaLocal: 0,
              cashLocal: round2(-amount),
              noteHe: 'החלפת מזומן במניות — שווי החשבון לא משתנה',
            });
            continue;
          }
          if (src === input.investmentId && dst === input.fundId) {
            rows.push({
              ...base,
              kind: 'SELL',
              labelHe: kinderLabel('SELL', description),
              section: 'INVEST',
              amountLocal: round2(amount),
              balanceDeltaLocal: 0,
              cashLocal: round2(amount),
              noteHe: 'המניות הפכו למזומן — שווי החשבון משתנה רק לפי הרווח או ההפסד',
            });
            continue;
          }
          // fund ↔ investment account (legacy savings moves) — no total change.
          continue;
        }

        // Money crossing between the two accounts the kid sees: a pocket-funded
        // purchase, a sale whose money goes back to the pocket, or a legacy move.
        const outKind: StatementKind = isCorrection
          ? 'CORRECTION'
          : src === input.pocketId && dst === input.investmentId
            ? 'BUY'
            : src === input.investmentId && dst === input.pocketId
              ? 'SELL'
              : 'TRANSFER_OUT';
        const inKind: StatementKind = isCorrection
          ? 'CORRECTION'
          : outKind === 'BUY' || outKind === 'SELL'
            ? outKind
            : 'TRANSFER_IN';
        rows.push({ ...base, kind: outKind, labelHe: kinderLabel(outKind, description), section: srcSection, amountLocal: round2(-amount), balanceDeltaLocal: round2(-amount), cashLocal: round2(-amount) });
        rows.push({ ...base, kind: inKind, labelHe: kinderLabel(inKind, description), section: dstSection, amountLocal: round2(amount), balanceDeltaLocal: round2(amount), cashLocal: round2(amount) });
        continue;
      }

      // ---- crossing the kid's boundary (allowance, spending, family) ----
      const ownSection = srcSection || dstSection;
      if (!ownSection) continue;
      const moneyIn = Boolean(dstSection);

      if (!moneyIn && counterparty.type === 'expense') {
        rows.push({ ...base, kind: 'SPENDING', labelHe: kinderLabel('SPENDING', description), section: ownSection, amountLocal: round2(-amount), balanceDeltaLocal: round2(-amount), cashLocal: round2(-amount) });
        continue;
      }
      if (moneyIn && counterparty.type === 'revenue') {
        // The description decides: weekly pocket money, the automatic saving, or
        // a one-off deposit (work, gifts). The counterparty account name is not
        // used — the recurring allowance account feeds both pockets.
        const kind: StatementKind = /דמי כיס/.test(description)
          ? 'ALLOWANCE'
          : /חיסכון/.test(description)
            ? 'SAVING'
            : 'DEPOSIT';
        rows.push({ ...base, kind, labelHe: kinderLabel(kind, description), section: ownSection, amountLocal: round2(amount), balanceDeltaLocal: round2(amount), cashLocal: round2(amount) });
        continue;
      }

      const kind: StatementKind = moneyIn ? 'TRANSFER_IN' : 'TRANSFER_OUT';
      rows.push({
        ...base,
        kind,
        labelHe: kinderLabel(kind, description),
        section: ownSection,
        amountLocal: moneyIn ? round2(amount) : round2(-amount),
        balanceDeltaLocal: moneyIn ? round2(amount) : round2(-amount),
        cashLocal: moneyIn ? round2(amount) : round2(-amount),
      });
    }
  }

  return rows;
}

/**
 * Sorts the rows (opening first, then by date) and adds the running balance of
 * each account, so the statement reads like a bank statement.
 */
export function withRunningBalances(rows: StatementRow[]): StatementRow[] {
  const ordered = rows.slice().sort((a, b) => {
    const byDate = String(a.date).localeCompare(String(b.date));
    if (byDate !== 0) return byDate;
    const aOpen = a.kind === 'OPENING' ? 0 : 1;
    const bOpen = b.kind === 'OPENING' ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return Number(a.journalId || 0) - Number(b.journalId || 0);
  });

  const balances: Record<StatementSection, number> = { POCKET: 0, INVEST: 0 };
  return ordered.map((row) => {
    // The balance follows the account TOTAL (a purchase swaps cash for stock and
    // therefore does not change it), while the row shows the money that moved.
    balances[row.section] = round2(balances[row.section] + row.balanceDeltaLocal);
    return { ...row, balanceLocal: balances[row.section] };
  });
}

/** Monthly in/out summary + the balance each month ended on, per account. */
export function monthlyStatement(rows: StatementRow[]): {
  section: StatementSection;
  month: string;
  inLocal: number;
  outLocal: number;
  endBalanceLocal: number;
}[] {
  const buckets = new Map<string, { inLocal: number; outLocal: number; endBalanceLocal: number }>();
  const out: { section: StatementSection; month: string; inLocal: number; outLocal: number; endBalanceLocal: number }[] = [];

  for (const section of ['POCKET', 'INVEST'] as StatementSection[]) {
    buckets.clear();
    const sectionRows = rows.filter((r) => r.section === section);
    // Opening balances carry no date: they belong to the month the account starts in.
    const firstMonth = sectionRows
      .map((r) => String(r.date).slice(0, 7))
      .filter(Boolean)
      .sort()[0];

    for (const row of sectionRows) {
      const month = String(row.date).slice(0, 7) || firstMonth;
      if (!month) continue;
      const bucket = buckets.get(month) || { inLocal: 0, outLocal: 0, endBalanceLocal: 0 };
      // "In / out" is real money entering or leaving the account, so it always adds
      // up to the balance change: a purchase inside the investing account is a swap,
      // not money out.
      const delta = row.balanceDeltaLocal ?? row.amountLocal;
      if (delta >= 0) bucket.inLocal = round2(bucket.inLocal + delta);
      else bucket.outLocal = round2(bucket.outLocal + delta);
      bucket.endBalanceLocal = round2(row.balanceLocal ?? bucket.endBalanceLocal);
      buckets.set(month, bucket);
    }
    for (const [month, bucket] of [...buckets.entries()].sort()) {
      out.push({ section, month, ...bucket });
    }
  }
  return out;
}
