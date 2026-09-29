/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trade + transfer rules — the arithmetic that moves the kids' money.
 * If one of these fails, the ledger and the portfolio would disagree.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planBuy, planLiquidation, planLiquidationTransfers } from '../src/server/rules.js';
import type { Holding } from '../src/types.js';

const holding = (overrides: Partial<Holding> = {}): Holding => ({
  profileName: 'נתנאל',
  ticker: 'SPY',
  shares: 0.3,
  averagePriceUsd: 100,
  originalPrincipalUsd: 30,
  lastUpdated: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

describe('planBuy', () => {
  test('rejects an order below the minimum size', () => {
    const result = planBuy({ profileName: 'נתנאל', ticker: 'SPY', amountLocal: 5, priceUsd: 100, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(result.ok, false);
    assert.match(result.error!, /Minimum order size/);
  });

  test('rejects a slice smaller than 0.01 shares', () => {
    const result = planBuy({ profileName: 'נתנאל', ticker: 'SPY', amountLocal: 10, priceUsd: 5000, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(result.ok, false);
    assert.match(result.error!, /fraction below/);
  });

  test('buys shares at parity (₪1 = $1)', () => {
    const result = planBuy({ profileName: 'נתנאל', ticker: 'NKE', amountLocal: 20, priceUsd: 40, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(result.ok, true);
    assert.equal(result.value!.shares, 0.5);
    assert.equal(result.value!.holding.shares, 0.5);
    assert.equal(result.value!.holding.originalPrincipalUsd, 20);
    assert.equal(result.value!.holding.averagePriceUsd, 40);
  });

  test('merges into an existing position with a weighted average price', () => {
    const result = planBuy({
      profileName: 'נתנאל',
      ticker: 'SPY',
      amountLocal: 20,
      priceUsd: 100,
      currencyMode: 'PARITY',
      fxRate: 1,
      existingHolding: holding(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.value!.holding.shares, 0.5, '0.3 + 0.2');
    assert.equal(result.value!.holding.originalPrincipalUsd, 50, '30 + 20');
    assert.equal(result.value!.holding.averagePriceUsd, 100);
  });

  test('converts the local amount with the FX rate in REAL mode', () => {
    const result = planBuy({ profileName: 'Ron', ticker: 'SPY', amountLocal: 50, priceUsd: 100, currencyMode: 'REAL', fxRate: 0.5 });
    assert.equal(result.ok, true);
    assert.equal(result.value!.shares, 0.25, '50 * 0.5 = $25 → 0.25 shares');
    assert.equal(result.value!.holding.originalPrincipalUsd, 25);
  });
});

describe('planLiquidation', () => {
  test('rejects a percentage outside 1-100', () => {
    assert.equal(planLiquidation({ percentage: 0, holding: holding(), priceUsd: 100, currencyMode: 'PARITY', fxRate: 1 }).ok, false);
    assert.equal(planLiquidation({ percentage: 150, holding: holding(), priceUsd: 100, currencyMode: 'PARITY', fxRate: 1 }).ok, false);
  });

  test('a break-even sale returns exactly the principal', () => {
    const result = planLiquidation({ percentage: 100, holding: holding(), priceUsd: 100, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(result.ok, true);
    assert.equal(result.value!.sharesToSell, 0.3);
    assert.equal(result.value!.deltaLocal, 0);
    assert.equal(result.value!.isGain, true);
    assert.equal(result.value!.fundReturnLocal, 30);
  });

  test('a winning sale returns the principal; the profit comes from Dad', () => {
    const result = planLiquidation({ percentage: 100, holding: holding(), priceUsd: 110, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(result.value!.currentValueLocal, 33);
    assert.equal(result.value!.deltaLocal, 3);
    assert.equal(result.value!.isGain, true);
    assert.equal(result.value!.fundReturnLocal, 30, 'principal only');
  });

  test('a losing sale returns only the current value; the loss goes to Dad', () => {
    const result = planLiquidation({ percentage: 100, holding: holding(), priceUsd: 90, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(result.value!.currentValueLocal, 27);
    assert.equal(result.value!.deltaLocal, -3);
    assert.equal(result.value!.isGain, false);
    assert.equal(result.value!.fundReturnLocal, 27);
  });

  test('a partial liquidation sells the same slice of shares and principal', () => {
    const result = planLiquidation({ percentage: 50, holding: holding(), priceUsd: 120, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(result.value!.sharesToSell, 0.15);
    assert.equal(result.value!.principalUsd, 15);
    assert.equal(result.value!.currentUsd, 18);
    assert.equal(result.value!.deltaLocal, 3);
  });

  test('REAL mode converts USD to the kid currency', () => {
    const result = planLiquidation({ percentage: 100, holding: holding(), priceUsd: 100, currencyMode: 'REAL', fxRate: 0.5 });
    assert.equal(result.value!.principalLocal, 60, '30 USD / 0.5 = 60 ILS');
    assert.equal(result.value!.currentValueLocal, 60);
  });
});

describe('planLiquidationTransfers (the three-legged double entry)', () => {
  const accounts = { fundAccountId: '6', investmentAccountId: '26', dadAccountId: '25' };

  test('a gain: principal investment→fund, profit Dad→fund', () => {
    const value = planLiquidation({ percentage: 100, holding: holding(), priceUsd: 110, currencyMode: 'PARITY', fxRate: 1 }).value!;
    const transfers = planLiquidationTransfers(value, accounts);
    assert.deepEqual(transfers.principal, { amount: 30, from: '26', to: '6' });
    assert.deepEqual(transfers.adjustment, { amount: 3, from: '25', to: '6', kind: 'profit' });
  });

  test('a loss: value investment→fund, loss investment→Dad', () => {
    const value = planLiquidation({ percentage: 100, holding: holding(), priceUsd: 90, currencyMode: 'PARITY', fxRate: 1 }).value!;
    const transfers = planLiquidationTransfers(value, accounts);
    assert.deepEqual(transfers.principal, { amount: 27, from: '26', to: '6' });
    assert.deepEqual(transfers.adjustment, { amount: 3, from: '26', to: '25', kind: 'loss' });
  });

  test('a break-even sale creates no adjustment (Firefly rejects zero amounts)', () => {
    const value = planLiquidation({ percentage: 100, holding: holding(), priceUsd: 100, currencyMode: 'PARITY', fxRate: 1 }).value!;
    const transfers = planLiquidationTransfers(value, accounts);
    assert.equal(transfers.adjustment, undefined);
  });

  test('a sub-agora gain is ignored rather than sent to Firefly', () => {
    const value = planLiquidation({ percentage: 100, holding: holding(), priceUsd: 100.001, currencyMode: 'PARITY', fxRate: 1 }).value!;
    const transfers = planLiquidationTransfers(value, accounts);
    assert.equal(transfers.adjustment, undefined);
  });
});
