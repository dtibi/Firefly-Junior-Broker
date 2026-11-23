/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The wealth chart's period picker and its single percentage (approved 2026-11-23).
 * The numbers here are the ones the kid sees, so they are pinned by tests: money that came
 * in or out during a period must never turn into a percentage of "return".
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  rangeStart,
  filterByRange,
  rangeIsTruncated,
  rangeSummary,
  percentSeries,
  monthsOfHistory,
} from '../src/wealth-ranges.js';

// The real values read back from /api/portfolio on 23.11.2026 (Natanel, after the history was
// rebuilt from the ledger) — the fixture of record for the numbers the kid sees.
const WEEK = [
  { date: '2026-11-16', price: 409.34, cumulativeDeposits: 417.58 },
  { date: '2026-11-19', price: 398.35, cumulativeDeposits: 417.58 },
  { date: '2026-11-20', price: 346.48, cumulativeDeposits: 380.18 },
  { date: '2026-11-23', price: 367.03, cumulativeDeposits: 382.58 },
];

describe('the range cutoff', () => {
  const last = '2026-11-23';

  test('is measured from the newest snapshot, not from the browser clock', () => {
    assert.equal(rangeStart('WEEK', last), '2026-11-16');
    assert.equal(rangeStart('MONTH', last), '2026-10-24');
    assert.equal(rangeStart('YEAR', last), '2025-11-23');
    assert.equal(rangeStart('TWO_YEARS', last), '2024-11-23');
    assert.equal(rangeStart('THREE_YEARS', last), '2023-11-24');
  });

  test('year-to-date starts on 1 January of the newest snapshot year', () => {
    assert.equal(rangeStart('YTD', last), '2026-01-01');
  });

  test('all time has no cutoff at all', () => {
    assert.equal(rangeStart('ALL', last), '0000-01-01');
  });
});

describe('filtering by range', () => {
  const points = [
    { date: '2026-07-19', price: 154.7, cumulativeDeposits: 154.7 },
    { date: '2026-11-01', price: 201.53, cumulativeDeposits: 214.38 },
    { date: '2026-11-16', price: 407.63, cumulativeDeposits: 417.58 },
    { date: '2026-11-23', price: 367.03, cumulativeDeposits: 382.58 },
  ];

  test('a week keeps only the last seven days', () => {
    assert.deepEqual(filterByRange(points, 'WEEK').map((p) => p.date), ['2026-11-16', '2026-11-23']);
    assert.deepEqual(filterByRange(WEEK, 'WEEK').length, 4);
  });

  test('all time keeps everything', () => {
    assert.equal(filterByRange(points, 'ALL').length, 4);
  });

  test('a range longer than the history is flagged so the screen can say so', () => {
    assert.equal(rangeIsTruncated(points, 'WEEK'), false);
    assert.equal(rangeIsTruncated(points, 'YEAR'), true);
    assert.equal(monthsOfHistory(points), 4);
  });
});

describe('the single percentage of a range', () => {
  test('a week that returned money to the pocket is not a 9% loss', () => {
    // 409.34 -> 367.03 in value (−42.31, which would read as −10.3%), but ₪37.40 of that
    // walked back to the pocket during the week: the portfolio's own result is −₪7.31
    // against the ₪417.58 that was invested at the start of the week.
    const s = rangeSummary(WEEK);
    assert.equal(s.changeLocal, -7.31);
    assert.equal(s.percent, -1.75);
    assert.equal(s.from, '2026-11-16');
    assert.equal(s.to, '2026-11-23');
    assert.equal(s.hasBase, true);
  });

  test('the all-time range measures its own change, not the level at the end', () => {
    const all = [
      { date: '2026-07-19', price: 154.7, cumulativeDeposits: 154.7 }, // the first day: no stocks, no profit
      { date: '2026-11-23', price: 367.03, cumulativeDeposits: 382.58 },
    ];
    const s = rangeSummary(all);
    assert.equal(s.changeLocal, -15.55); // the market's own cumulative result
    assert.equal(s.percent, -10.05); // −15.55 / 154.70 invested at the start
    assert.equal(s.hasBase, true);
  });

  test('a deposit in the middle of the period never reads as profit', () => {
    const withDeposit = [
      { date: '2026-11-01', price: 201.53, cumulativeDeposits: 214.38 },
      { date: '2026-11-02', price: 301.53, cumulativeDeposits: 314.38 }, // ₪100 arrived
      { date: '2026-11-03', price: 306.53, cumulativeDeposits: 314.38 }, // ...and +₪5 of market
    ];
    const s = rangeSummary(withDeposit);
    assert.equal(s.changeLocal, 5);
    assert.equal(s.percent, 2.33); // 5 / 214.38, not anywhere near +50%
  });

  test('a one-point range has nothing to say', () => {
    assert.equal(rangeSummary([WEEK[0]]).hasBase, false);
    assert.equal(rangeSummary([]).changeLocal, 0);
  });
});

describe('the percent series', () => {
  test('starts at zero and ends on the one number the header shows', () => {
    const series = percentSeries(WEEK);
    assert.equal(series[0].percent, 0);
    assert.equal(series[series.length - 1].percent, rangeSummary(WEEK).percent);
    assert.deepEqual(series.map((p) => p.valueLocal), [409.34, 398.35, 346.48, 367.03]);
    assert.equal(series[1].percent, -2.63); // (−19.23 + 8.24) / 417.58
  });

  test('a portfolio that did nothing reports zero, whatever the deposits did', () => {
    const flat = [
      { date: '2026-11-01', price: 100, cumulativeDeposits: 100 },
      { date: '2026-11-02', price: 300, cumulativeDeposits: 300 },
    ];
    assert.deepEqual(percentSeries(flat).map((p) => p.percent), [0, 0]);
    assert.equal(rangeSummary(flat).percent, 0);
  });

  test('an empty series is handled without NaN', () => {
    assert.deepEqual(percentSeries([]), []);
  });
});
