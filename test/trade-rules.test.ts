/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trade rules — the arithmetic that moves the kids' money. If one of these
 * fails, the ledger and the portfolio would disagree.
 *
 * 2026-10-02: the old weighted-average planBuy/planLiquidation pair was replaced
 * by lots (see test/lots.test.ts). What stays here is the buy guardrail and the
 * funding-source check, which is what still protects the pocket.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_ORDER_LOCAL, planBuy, validateBuyFunds } from '../src/server/rules.js';

describe('planBuy', () => {
  test('rejects an order below the minimum size', () => {
    const result = planBuy({ ticker: 'SPY', amountLocal: 5, priceUsd: 100, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(result.ok, false);
    assert.match(result.error!, /Minimum order size/);
    assert.equal(MIN_ORDER_LOCAL, 10);
  });

  test('rejects a slice smaller than 0.01 shares', () => {
    const result = planBuy({ ticker: 'SPY', amountLocal: 10, priceUsd: 5000, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(result.ok, false);
    assert.match(result.error!, /fraction below/);
  });

  test('buys shares at parity (₪1 = $1)', () => {
    const result = planBuy({ ticker: 'NKE', amountLocal: 20, priceUsd: 40, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(result.ok, true);
    assert.equal(result.value!.shares, 0.5);
    assert.equal(result.value!.investLocal, 20);
    assert.equal(result.value!.investUsd, 20);
  });

  test('converts the local amount with the FX rate in REAL mode', () => {
    const result = planBuy({ ticker: 'SPY', amountLocal: 50, priceUsd: 100, currencyMode: 'REAL', fxRate: 0.5 });
    assert.equal(result.ok, true);
    assert.equal(result.value!.shares, 0.25, '50 * 0.5 = $25 → 0.25 shares');
    assert.equal(result.value!.investUsd, 25);
  });

  test('defaults the funding source to the invest fund and remembers the pocket when asked', () => {
    const fromFund = planBuy({ ticker: 'SPY', amountLocal: 20, priceUsd: 100, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(fromFund.value!.fundingSource, 'FUND');
    assert.equal(fromFund.value!.sourceAccountRole, 'savings');

    const fromPocket = planBuy({
      ticker: 'SPY',
      amountLocal: 20,
      priceUsd: 100,
      currencyMode: 'PARITY',
      fxRate: 1,
      fundingSource: 'POCKET',
    });
    assert.equal(fromPocket.value!.fundingSource, 'POCKET');
    assert.equal(fromPocket.value!.sourceAccountRole, 'spending', 'the pocket account pays');
  });

  test('rejects a nonsense amount instead of coercing it', () => {
    const result = planBuy({ ticker: 'SPY', amountLocal: Number('abc'), priceUsd: 100, currencyMode: 'PARITY', fxRate: 1 });
    assert.equal(result.ok, false);
  });
});

describe('validateBuyFunds (you can only spend what is already there)', () => {
  test('allows a purchase the chosen account can cover', () => {
    const pocket = validateBuyFunds({ fundingSource: 'POCKET', amountLocal: 100, pocketLocal: 189.09, fundLocal: 61.69 });
    assert.equal(pocket.ok, true);
    assert.equal(pocket.value!.availableLocal, 189.09);

    const fund = validateBuyFunds({ fundingSource: 'FUND', amountLocal: 60, pocketLocal: 189.09, fundLocal: 61.69 });
    assert.equal(fund.ok, true);
    assert.equal(fund.value!.availableLocal, 61.69);
  });

  test('refuses to spend more than the chosen account holds — no money is moved to cover it', () => {
    const tooMuchFromFund = validateBuyFunds({ fundingSource: 'FUND', amountLocal: 70, pocketLocal: 189.09, fundLocal: 61.69 });
    assert.equal(tooMuchFromFund.ok, false);
    assert.match(tooMuchFromFund.error!, /61\.69/);

    const tooMuchFromPocket = validateBuyFunds({ fundingSource: 'POCKET', amountLocal: 200, pocketLocal: 189.09, fundLocal: 5000 });
    assert.equal(tooMuchFromPocket.ok, false, 'the fund cannot cover a pocket purchase');
    assert.match(tooMuchFromPocket.error!, /189\.09/);
  });

  test('allows spending the account down to zero — there is no ₪10 pocket buffer any more', () => {
    const all = validateBuyFunds({ fundingSource: 'POCKET', amountLocal: 189.09, pocketLocal: 189.09, fundLocal: 0 });
    assert.equal(all.ok, true);
  });

  test('rejects a zero or negative amount', () => {
    assert.equal(validateBuyFunds({ fundingSource: 'FUND', amountLocal: 0, pocketLocal: 10, fundLocal: 10 }).ok, false);
    assert.equal(validateBuyFunds({ fundingSource: 'FUND', amountLocal: -5, pocketLocal: 10, fundLocal: 10 }).ok, false);
  });
});
