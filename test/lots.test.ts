/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The lot ("מגרש") rules — the behaviour that must never regress:
 *  - one purchase = one lot, never merged
 *  - a lot's money is bound to where it came from (pocket → pocket, fund → fund)
 *  - whole-lot sales, priced per lot with that lot's own principal
 *  - the three-legged ledger legs (principal back + Dad adjustment) per lot
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateLots,
  closeLot,
  closedLots,
  newLot,
  openLots,
  planLotSale,
  planLotSales,
  summarizeLots,
} from '../src/server/lots.js';
import { Lot } from '../src/types.js';

const KID = 'נתנאל';

const makeLot = (over: Partial<Lot> = {}): Lot => ({
  ...newLot({
    profileName: KID,
    ticker: 'INTC',
    shares: 0.2884,
    principalLocal: 32,
    principalUsd: 32,
    priceUsd: 110.96,
    acquiredAt: '2026-09-17T10:00:00.000Z',
    fundingSource: 'FUND',
    fireflyTransactionId: '311',
    id: 'lot-b',
  }),
  ...over,
});

/** The five lots migrated from the pre-lots book on 2026-10-02. */
const legacyBook = (): Lot[] => [
  { ticker: 'SPY', shares: 0.1352, principal: 100, at: '2026-07-23', id: 'lot-spy' },
  { ticker: 'INTC', shares: 0.1552, principal: 14, at: '2026-08-02', id: 'lot-intc-a' },
  { ticker: 'INTC', shares: 0.2884, principal: 32, at: '2026-09-17', id: 'lot-intc-b' },
  { ticker: 'TSLA', shares: 0.0438, principal: 15, at: '2026-08-16', id: 'lot-tsla' },
  { ticker: 'GOOGL', shares: 0.0592, principal: 20, at: '2026-08-31', id: 'lot-googl' },
].map((l) =>
  makeLot({
    id: l.id,
    ticker: l.ticker,
    shares: l.shares,
    principalLocal: l.principal,
    principalUsd: l.principal,
    acquiredAt: `${l.at}T10:00:00.000Z`,
  })
);

describe('lots — opening', () => {
  test('two purchases of the same ticker stay two lots', () => {
    const a = makeLot({ id: 'lot-a', shares: 0.1552, principalLocal: 14, principalUsd: 14, acquiredAt: '2026-08-02T10:00:00.000Z' });
    const b = makeLot({ id: 'lot-b' });
    assert.equal(a.shares, 0.1552);
    assert.equal(b.shares, 0.2884);
    assert.equal(a.principalLocal, 14);
    assert.equal(b.principalLocal, 32);
    assert.equal(a.status, 'OPEN');
  });

  test('a new lot keeps the exact local principal it was bought with', () => {
    const lot = newLot({
      profileName: KID,
      ticker: 'ASML',
      shares: 0.0113,
      principalLocal: 10,
      principalUsd: 10,
      priceUsd: 1771.85,
      acquiredAt: '2026-10-02T10:00:00.000Z',
      fundingSource: 'POCKET',
      fireflyTransactionId: 'ff-test',
      id: 'lot-pocket',
    });
    assert.equal(lot.principalLocal, 10);
    assert.equal(lot.originalPrincipalLocal, 10);
    assert.equal(lot.originalShares, lot.shares);
    assert.equal(lot.fundingSource, 'POCKET');
  });

  test('the aggregate view reproduces the weighted-average row the app shows today', () => {
    const holdings = aggregateLots(legacyBook(), KID);
    assert.equal(holdings.length, 4);
    const intc = holdings.find((h) => h.ticker === 'INTC');
    assert.equal(intc?.shares, 0.4436);
    assert.equal(intc?.originalPrincipalUsd, 46);
    assert.equal(intc?.averagePriceUsd, 103.7); // 46 / 0.4436 — derived, not a stale buy price
    const spy = holdings.find((h) => h.ticker === 'SPY');
    assert.equal(spy?.shares, 0.1352);
    assert.equal(spy?.originalPrincipalUsd, 100);
  });

  test('the migrated book sums to the ledger principal in account 26', () => {
    const summary = summarizeLots(legacyBook(), KID);
    assert.equal(summary.openLots, 5);
    assert.equal(summary.openPrincipalLocal, 181);
    assert.equal(summary.closedLots, 0);
  });

  test('openLots only returns that kid’s open lots, oldest first', () => {
    const lots = [...legacyBook(), makeLot({ id: 'lot-closed', status: 'CLOSED', shares: 0 })];
    const open = openLots(lots, KID, 'INTC');
    assert.deepEqual(open.map((l) => l.id), ['lot-intc-a', 'lot-intc-b']);
    assert.equal(openLots(lots, 'רוני').length, 0);
  });
});

describe('lots — selling one lot (three-legged ledger per lot)', () => {
  test('a gain returns the principal and takes the profit from the Bank of Dad', () => {
    const priced = planLotSale({
      lot: makeLot({ id: 'lot-b', principalLocal: 32, shares: 0.2884 }),
      priceUsd: 120.01,
      currencyMode: 'PARITY',
      fxRate: 0.32515,
    });
    assert.equal(priced.ok, true);
    const sale = priced.value!;
    assert.equal(sale.currentValueLocal, 34.61); // 0.2884 × 120.01
    assert.equal(sale.deltaLocal, 2.61);
    assert.equal(sale.isGain, true);
    assert.equal(sale.principalReturnLocal, 32); // principal goes back, Dad covers the profit
    assert.equal(sale.adjustmentLocal, 2.61);
    assert.equal(sale.adjustmentKind, 'profit');
    assert.equal(sale.principalUsd, 32);
  });

  test('a loss returns only the value and pays the loss to Dad', () => {
    const priced = planLotSale({
      lot: makeLot({ id: 'lot-a', shares: 0.1552, principalLocal: 14, principalUsd: 14 }),
      priceUsd: 80,
      currencyMode: 'PARITY',
      fxRate: 0.32515,
    });
    const sale = priced.value!;
    assert.equal(sale.currentValueLocal, 12.42); // 0.1552 × 80
    assert.equal(sale.deltaLocal, -1.58);
    assert.equal(sale.isGain, false);
    assert.equal(sale.principalReturnLocal, 12.42);
    assert.equal(sale.adjustmentLocal, 1.58);
    assert.equal(sale.adjustmentKind, 'loss');
  });

  test('break-even posts no adjustment leg at all (Firefly rejects zero amounts)', () => {
    const priced = planLotSale({
      lot: makeLot({ shares: 0.1, principalLocal: 10, principalUsd: 10 }),
      priceUsd: 100,
      currencyMode: 'PARITY',
      fxRate: 0.32515,
    });
    const sale = priced.value!;
    assert.equal(sale.deltaLocal, 0);
    assert.equal(sale.adjustmentLocal, 0);
    assert.equal(sale.adjustmentKind, 'none');
    assert.equal(sale.principalReturnLocal, 10);
  });

  test('a pocket-funded lot returns to the POCKET — investment money can never become pocket money', () => {
    const priced = planLotSale({
      lot: makeLot({ fundingSource: 'POCKET', principalLocal: 20, principalUsd: 20, shares: 0.0113 }),
      priceUsd: 1900, // ASML at a profit
      currencyMode: 'PARITY',
      fxRate: 0.32515,
    });
    const sale = priced.value!;
    assert.equal(sale.destination, 'POCKET');
    assert.equal(sale.principalReturnLocal, 20); // his own ₪20 back
    assert.equal(sale.adjustmentKind, 'profit');
    assert.ok(sale.deltaLocal > 0);
  });

  test('each lot is priced with its own principal and its own result', () => {
    const lots = legacyBook().filter((l) => l.ticker === 'INTC'); // ₪14 @ ~90.2 and ₪32 @ ~111
    const priced = planLotSales({ lots, priceUsd: 103.7, currencyMode: 'PARITY', fxRate: 0.32515 });
    assert.equal(priced.ok, true);
    const plan = priced.value!;
    assert.equal(plan.sales.length, 2);
    assert.equal(plan.sales[0].lotId, 'lot-intc-a');
    assert.equal(plan.sales[1].lotId, 'lot-intc-b');
    assert.equal(plan.totals.shares, 0.4436);
    assert.equal(plan.totals.principalLocal, 46);
    // each lot is rounded on its own: 16.09 + 29.91 (not one 46.00 of a merged row)
    assert.equal(plan.sales[0].currentValueLocal, 16.09);
    assert.equal(plan.sales[1].currentValueLocal, 29.91);
    assert.equal(plan.totals.currentValueLocal, 46);
    // one lot gained, the other did not — the pair is not reported as an overall gain
    assert.equal(plan.totals.isGain, false);
  });

  test('a sold lot closes, records its realized result and leaves the aggregate', () => {
    const lot = makeLot({ id: 'lot-b' });
    const priced = planLotSale({ lot, priceUsd: 120.01, currencyMode: 'PARITY', fxRate: 0.32515 });
    const closed = closeLot({ lot, sale: priced.value!, closedAt: '2026-10-02T12:00:00.000Z' });
    assert.equal(closed.status, 'CLOSED');
    assert.equal(closed.shares, 0);
    assert.equal(closed.principalLocal, 0);
    assert.equal(closed.realizedPnlLocal, 2.61);
    assert.equal(closed.closedAt, '2026-10-02T12:00:00.000Z');
    assert.equal(closed.originalShares, 0.2884); // history survives
    assert.equal(aggregateLots([closed], KID).length, 0);
    assert.equal(closedLots([closed], KID, 'INTC').length, 1);
    const summary = summarizeLots([closed], KID);
    assert.equal(summary.openLots, 0);
    assert.equal(summary.closedLots, 1);
    assert.equal(summary.realizedPnlLocal, 2.61);
  });

  test('rejects an empty selection, mixed tickers, a sold lot and dust', () => {
    const empty = planLotSales({ lots: [], priceUsd: 100, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(empty.ok, false);

    const mixed = planLotSales({
      lots: [makeLot({ id: '1' }), makeLot({ id: '2', ticker: 'SPY' })],
      priceUsd: 100,
      currencyMode: 'PARITY',
      fxRate: 1,
    });
    assert.equal(mixed.ok, false);

    const alreadySold = planLotSale({
      lot: makeLot({ status: 'CLOSED', shares: 0 }),
      priceUsd: 100,
      currencyMode: 'PARITY',
      fxRate: 1,
    });
    assert.equal(alreadySold.ok, false);

    const dust = planLotSale({
      lot: makeLot({ shares: 0.0001, principalLocal: 0.03, principalUsd: 0.03 }),
      priceUsd: 200,
      currencyMode: 'PARITY',
      fxRate: 1,
    });
    assert.equal(dust.ok, false);

    const duplicated = planLotSales({
      lots: [makeLot({ id: 'same' }), makeLot({ id: 'same' })],
      priceUsd: 100,
      currencyMode: 'PARITY',
      fxRate: 1,
    });
    assert.equal(duplicated.ok, false);
  });

  test('REAL mode converts to the kid’s local currency on the way back', () => {
    const priced = planLotSale({
      lot: makeLot({ shares: 0.1, principalLocal: 100, principalUsd: 30.77 }),
      priceUsd: 40, // $40 → 4 sh-equivalent dollars... 0.1 × 40 = $4
      currencyMode: 'REAL',
      fxRate: 3.25,
    });
    const sale = priced.value!;
    assert.equal(sale.currentUsd, 4);
    assert.equal(sale.currentValueLocal, 1.23); // 4 / 3.25
    assert.equal(sale.deltaLocal, -98.77);
    assert.equal(sale.adjustmentKind, 'loss');
  });
});
