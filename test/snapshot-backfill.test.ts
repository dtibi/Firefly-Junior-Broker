/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The snapshot backfill rules. These keep the chart's history honest: a rebuilt day is
 * cash + shares × that day's close, a lot sold on a day is not in that day's row, and a
 * day the rules cannot value is reported instead of being invented.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  missingDays,
  positionsOn,
  closeOn,
  accountBalanceOn,
  reconstructSnapshot,
} from '../src/server/snapshot-backfill.js';

describe('missing snapshot days', () => {
  test('lists exactly the days with no snapshot', () => {
    assert.deepEqual(
      missingDays(['2026-08-13', '2026-08-16'], '2026-08-13', '2026-08-18'),
      ['2026-08-14', '2026-08-15', '2026-08-17']
    );
  });

  test('a continuous series has nothing to fill', () => {
    assert.deepEqual(missingDays(['2026-08-14', '2026-08-15'], '2026-08-14', '2026-08-16'), []);
  });

  test('never reaches past `until` (today is written by the daily writer, not by the backfill)', () => {
    assert.deepEqual(missingDays([], '2026-08-13', '2026-08-13'), []);
  });
});

describe('the positions held on a day', () => {
  const lots = [
    { ticker: 'SPY', shares: 0.5, acquiredAt: '2026-08-01T10:00:00Z', closedAt: null },
    { ticker: 'INTC', shares: 0, originalShares: 0.4, acquiredAt: '2026-08-03T10:00:00Z', closedAt: '2026-08-20T12:00:00Z' },
    { ticker: 'TSLA', shares: 0.25, acquiredAt: '2026-08-25T10:00:00Z', closedAt: null },
  ];

  test('a purchase counts from its own day', () => {
    assert.deepEqual(positionsOn(lots, '2026-08-01'), [{ ticker: 'SPY', shares: 0.5 }]);
  });

  test('a lot sold on a day is already sold for that day\u2019s row', () => {
    assert.deepEqual(positionsOn(lots, '2026-08-20').map((p) => p.ticker), ['SPY']);
  });

  test('a closed lot is counted at its original size on the days before the sale', () => {
    assert.deepEqual(positionsOn(lots, '2026-08-19'), [
      { ticker: 'INTC', shares: 0.4 },
      { ticker: 'SPY', shares: 0.5 },
    ]);
  });

  test('several lots of one ticker add up', () => {
    const two = [
      { ticker: 'INTC', shares: 0.2, acquiredAt: '2026-08-01' },
      { ticker: 'INTC', shares: 0.3, acquiredAt: '2026-08-01' },
    ];
    assert.deepEqual(positionsOn(two, '2026-08-02'), [{ ticker: 'INTC', shares: 0.5 }]);
  });
});

describe('closes and ledger balances', () => {
  test('the last close on or before the day wins (weekends reuse Friday)', () => {
    const history = [
      { date: '2026-08-13', price: 10 },
      { date: '2026-08-14', price: 11 },
      { date: '2026-08-17', price: 13 },
    ];
    assert.equal(closeOn(history, '2026-08-15'), 11);
    assert.equal(closeOn(history, '2026-08-17'), 13);
    assert.equal(closeOn(history, '2026-08-12'), null);
  });

  test('an account balance is replayed from its journals', () => {
    const journals = [
      { attributes: { transactions: [{ date: '2026-08-10T10:00:00Z', amount: '100', source_id: '9', destination_id: '6' }] } },
      { attributes: { transactions: [{ date: '2026-08-12T10:00:00Z', amount: '30', source_id: '6', destination_id: '26' }] } },
      { attributes: { transactions: [{ date: '2026-08-20T10:00:00Z', amount: '5', source_id: '6', destination_id: '26' }] } },
    ];
    assert.equal(accountBalanceOn(journals, '6', '2026-08-10'), 100);
    assert.equal(accountBalanceOn(journals, '6', '2026-08-15'), 70);
    assert.equal(accountBalanceOn(journals, '6', '2026-08-31'), 65);
  });
});

describe('reconstructing one day', () => {
  test('cash + shares × close, with the deposits baseline passed through untouched', () => {
    const row = reconstructSnapshot({
      date: '2026-08-13',
      cashLocal: 52.99,
      pocketLocal: 155.5,
      depositsLocal: 161.9,
      positions: [
        { ticker: 'SPY', shares: 0.1352 },
        { ticker: 'INTC', shares: 0.1552 },
      ],
      closes: { SPY: 777.88, INTC: 104.56 },
    });
    assert.equal(row.stockValueUsd, 121.4);
    assert.equal(row.totalValueLocal, 174.39);
    assert.equal(row.cashUsd, 52.99);
    assert.equal(row.cumulativeDepositsLocal, 161.9);
    assert.equal(row.investFundLocal, 52.99);
    assert.equal(row.spendingLocal, 155.5);
    assert.deepEqual(row.unpricedTickers, []);
  });

  test('a ticker with no close is reported, never silently valued', () => {
    const row = reconstructSnapshot({
      date: '2026-08-13',
      cashLocal: 10,
      pocketLocal: 0,
      depositsLocal: 10,
      positions: [{ ticker: 'BRK.B', shares: 1 }],
      closes: {},
    });
    assert.deepEqual(row.unpricedTickers, ['BRK.B']);
    assert.equal(row.totalValueLocal, 10);
  });
});
