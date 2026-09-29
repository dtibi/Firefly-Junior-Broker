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
 *  - Flows with the Bank of Dad account are the trading P&L — never a deposit.
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
    /** The Bank of Dad clearing account id (trading P&L). */
    dadAccountId: string;
  }
): FlowClassification {
  const ownIds = new Set(options.own.map((a) => String(a.id)));
  const fundIds = new Set(options.fundIds.map(String));
  const dadId = String(options.dadAccountId);

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

      // Bank-of-Dad flows ARE the profit/loss: never part of a baseline.
      if (src === dadId || dst === dadId) {
        if (dst === dadId) realizedPnlLocal -= amount;
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
