/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The heart of the app: how the ledger is read into the kids' numbers.
 * These tests are the guardrail for the "allowances must never look like
 * investment profit" rule and for the bug classes that already bit us once
 * (opening balances counted twice, dates leaking across days).
 *
 * Run: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyKidLedger, cumulativeThrough, investedProfit } from '../src/server/ledger-rules.js';

// --- fixture helpers -------------------------------------------------------
const CHECKING = '4'; // 🍬 pocket money
const SAVINGS = '6'; // 🏦 invest fund
const INVEST = '26'; // 📈 invested principal
const CLEARING_ACCOUNT = '25'; // the market's side of a trade
const ALLOWANCE = '11'; // revenue account
const SHOP = '12'; // expense account

const split = (
  source: string,
  destination: string,
  amount: number,
  options: { date?: string; type?: string; description?: string } = {}
) => ({
  source_id: source,
  destination_id: destination,
  amount,
  date: options.date || '2026-09-01',
  type: options.type || 'transfer',
  description: options.description || '',
});

let journalCounter = 0;
const journal = (...transactions: any[]) => ({
  id: ++journalCounter,
  attributes: { transactions },
});

const kid = (accounts: { id: string; name: string; openingBalance?: number; openingDate?: string }[] = [
  { id: CHECKING, name: 'Natanel' },
  { id: SAVINGS, name: 'Natanel Savings' },
  { id: INVEST, name: 'Natanel Investments' },
]) => ({
  own: accounts,
  fundIds: [SAVINGS, INVEST],
  clearingAccountId: CLEARING_ACCOUNT,
});

const classify = (journals: any[], accountFixture = kid()) => classifyKidLedger(journals, accountFixture);

// --- tests -----------------------------------------------------------------
describe('whole-kid baseline (money in from outside)', () => {
  test('an allowance into the pocket only counts in the whole-kid baseline', () => {
    const result = classify([journal(split(ALLOWANCE, CHECKING, 40))]);
    assert.equal(result.externalDepositsLocal, 40);
    assert.equal(result.investedFromOutsideLocal, 0, 'pocket money is outside the invested world');
  });

  test('an allowance into the invest fund counts in both baselines', () => {
    const result = classify([journal(split(ALLOWANCE, SAVINGS, 2.4))]);
    assert.equal(result.externalDepositsLocal, 2.4);
    assert.equal(result.investedFromOutsideLocal, 2.4);
  });

  test('spending reduces the baseline instead of looking like a loss', () => {
    const result = classify([journal(split(CHECKING, SHOP, 25))]);
    assert.equal(result.externalDepositsLocal, -25);
    assert.equal(result.investedFromOutsideLocal, 0);
  });

  test('moving money between the kid own accounts changes nothing outside', () => {
    const result = classify([journal(split(SAVINGS, INVEST, 100))]);
    assert.equal(result.externalDepositsLocal, 0);
    assert.equal(result.investedFromOutsideLocal, 0);
  });
});

describe('invested-world baseline (chart line)', () => {
  test('pocket money moved into the fund RAISES the baseline (never fake profit)', () => {
    const result = classify([journal(split(CHECKING, SAVINGS, 20))]);
    assert.equal(result.externalDepositsLocal, 0, 'no money entered the kid from outside');
    assert.equal(result.investedFromOutsideLocal, 20, 'but the invested world received 20');
  });

  test('money taken back out of the fund lowers the invested baseline', () => {
    const result = classify([journal(split(INVEST, CHECKING, 15))]);
    assert.equal(result.investedFromOutsideLocal, -15);
  });
});

describe('Bank of Dad flows are the profit/loss itself', () => {
  test('a profit paid by Dad is realized P&L, not a deposit', () => {
    const result = classify([journal(split(CLEARING_ACCOUNT, SAVINGS, 5))]);
    assert.equal(result.realizedPnlLocal, 5);
    assert.equal(result.externalDepositsLocal, 0);
    assert.equal(result.investedFromOutsideLocal, 0);
  });

  test('a loss paid to Dad is negative realized P&L', () => {
    const result = classify([journal(split(INVEST, CLEARING_ACCOUNT, 1.19))]);
    assert.equal(result.realizedPnlLocal, -1.19);
    assert.equal(result.investedFromOutsideLocal, 0);
  });
});

describe('opening balances', () => {
  const withOpenings = kid([
    { id: CHECKING, name: 'Natanel', openingBalance: 43, openingDate: '2025-08-18T01:00:00+03:00' },
    { id: SAVINGS, name: 'Natanel Savings', openingBalance: 30, openingDate: '2025-08-18T01:00:00+03:00' },
    { id: INVEST, name: 'Natanel Investments' },
  ]);

  test('are added once — the synthetic Firefly transaction is ignored', () => {
    const synthetic = journal(split('5', CHECKING, 43, { type: 'opening balance', date: '2025-08-18' }));
    const result = classify([synthetic], withOpenings);
    assert.equal(result.externalDepositsLocal, 73, '43 pocket + 30 fund, not 116');
    assert.equal(result.investedFromOutsideLocal, 30, 'only the fund opening balance is invested money');
  });

  test('appear as dated flows so historical snapshots can be rebuilt', () => {
    const result = classify([], withOpenings);
    assert.equal(result.externalFlows.length, 2);
    assert.deepEqual(result.externalFlows.map((f) => f.date), ['2025-08-18', '2025-08-18']);
  });
});

describe('robustness', () => {
  test('the same journal listed twice is only counted once', () => {
    const duplicated = journal(split(ALLOWANCE, SAVINGS, 50));
    const result = classify([duplicated, duplicated]);
    assert.equal(result.investedFromOutsideLocal, 50);
  });

  test('zero-amount splits are ignored', () => {
    const result = classify([journal(split(ALLOWANCE, SAVINGS, 0))]);
    assert.equal(result.externalDepositsLocal, 0);
  });

  test('cumulativeThrough excludes flows dated after the snapshot day', () => {
    const flows = [
      { date: '2026-09-01', amount: 10, description: 'a' },
      { date: '2026-09-15', amount: 20, description: 'b' },
      { date: '2026-09-30', amount: 99, description: 'c' },
    ];
    assert.equal(cumulativeThrough(flows, '2026-09-20'), 30);
    assert.equal(cumulativeThrough(flows, '2026-09-15'), 30);
    assert.equal(cumulativeThrough(flows, '2026-09-14'), 10);
    assert.equal(cumulativeThrough(flows, '2026-10-31'), 129);
  });
});

describe('the money identity', () => {
  test('profit = invested wealth − baseline = realized P&L + unrealized gains', () => {
    // deposit ₪100 → buy → Dad pays ₪10 profit → a ₪5 loss is paid back to Dad
    const journals = [
      journal(split(ALLOWANCE, SAVINGS, 100, { description: 'allowance' })),
      journal(split(SAVINGS, INVEST, 100, { description: 'buy' })),
      journal(split(CLEARING_ACCOUNT, SAVINGS, 10, { description: 'profit' })),
      journal(split(INVEST, CLEARING_ACCOUNT, 5, { description: 'loss' })),
    ];
    const result = classify(journals);

    assert.equal(result.externalDepositsLocal, 100);
    assert.equal(result.investedFromOutsideLocal, 100);
    assert.equal(result.realizedPnlLocal, 5);

    // The kid holds 105 in the invested world (shares + fund cash)
    assert.equal(investedProfit(105, result.investedFromOutsideLocal), 5);
    assert.equal(investedProfit(105, result.investedFromOutsideLocal), result.realizedPnlLocal);
  });

  test('a whole year of weekly allowances is never reported as profit', () => {
    // 52 allowance payments of ₪2.40 into the fund, nothing invested yet
    const journals = Array.from({ length: 52 }, (_, week) =>
      journal(split(ALLOWANCE, SAVINGS, 2.4, { date: `2026-${week < 9 ? '01' : week < 26 ? '06' : '09'}-01` }))
    );
    const result = classify(journals);
    const fundValue = result.investedFromOutsideLocal; // the fund simply holds the cash
    assert.equal(fundValue, 124.8);
    assert.equal(investedProfit(fundValue, result.investedFromOutsideLocal), 0, 'no profit before investing');
  });
});
