/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pocket-money → invest-fund transfer rules (option ב: one-way valve + promise).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateTransfer, KEEP_IN_POCKET_LOCAL, DEFAULT_LOCK_DAYS } from '../src/server/rules.js';

const NOW = new Date('2026-09-29T08:00:00.000Z');

describe('validateTransfer', () => {
  test('rejects an amount below the minimum', () => {
    const result = validateTransfer({ amountLocal: 5, pocketBalanceLocal: 100, lockDays: 90, now: NOW });
    assert.equal(result.ok, false);
    assert.match(result.error!, /Minimum transfer/);
  });

  test('always keeps pocket money in the pocket', () => {
    const tooMuch = validateTransfer({ amountLocal: 95, pocketBalanceLocal: 100, lockDays: 90, now: NOW });
    assert.equal(tooMuch.ok, false);
    assert.match(tooMuch.error!, new RegExp(String(KEEP_IN_POCKET_LOCAL)));

    const justRight = validateTransfer({ amountLocal: 90, pocketBalanceLocal: 100, lockDays: 90, now: NOW });
    assert.equal(justRight.ok, true, 'leaving exactly the buffer is allowed');
  });

  test('accepts the promise windows the UI offers', () => {
    for (const days of [30, 90, 365]) {
      const result = validateTransfer({ amountLocal: 20, pocketBalanceLocal: 100, lockDays: days, now: NOW });
      assert.equal(result.ok, true);
      assert.equal(result.value!.days, days);
    }
  });

  test('falls back to the default window for anything else', () => {
    const result = validateTransfer({ amountLocal: 20, pocketBalanceLocal: 100, lockDays: 45, now: NOW });
    assert.equal(result.value!.days, DEFAULT_LOCK_DAYS);
    const missing = validateTransfer({ amountLocal: 20, pocketBalanceLocal: 100, now: NOW });
    assert.equal(missing.value!.days, DEFAULT_LOCK_DAYS);
  });

  test('rounds the amount to agorot and computes the lock end date', () => {
    const result = validateTransfer({ amountLocal: 20.994, pocketBalanceLocal: 100, lockDays: 30, now: NOW });
    assert.equal(result.value!.amountLocal, 20.99);
    assert.equal(result.value!.lockedUntil, '2026-10-29T08:00:00.000Z');
  });

  test('never allows emptying the pocket (edge: balance below the buffer)', () => {
    const result = validateTransfer({ amountLocal: 10, pocketBalanceLocal: 8, lockDays: 90, now: NOW });
    assert.equal(result.ok, false);
  });
});
