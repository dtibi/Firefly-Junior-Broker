/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Schema migration: an old data/db.json must keep working after a release that
 * adds fields (that is how the two kids got their spending account + transfer
 * flag without losing history).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { migrateSchema, isRoniLike } from '../src/server/migrate.js';

const legacyDb = () => ({
  profiles: [
    { id: '1', name: 'נתנאל', birthYear: 2018 },
    { id: '2', name: 'רוני', birthYear: 2020 },
  ],
  holdings: [],
  transactions: [],
  snapshots: [
    { date: '2026-07-19', profileName: 'נתנאל', totalValueUsd: 100, cashUsd: 100, stockValueUsd: 0 },
    { date: '2026-07-19', profileName: 'רוני', totalValueUsd: 80, cashUsd: 80, stockValueUsd: 0 },
  ],
  cashBalances: { 'נתנאל': 0, 'רוני': 0 },
  fxCache: null,
});

describe('migrateSchema', () => {
  test('adds the new profile fields with kid-appropriate defaults', () => {
    const { schema, modified } = migrateSchema(legacyDb());
    assert.equal(modified, true);

    const [natanel, roni] = schema.profiles;
    assert.equal(natanel.spendingAccountId, '4');
    assert.equal(natanel.transfersEnabled, true, 'the older kid may move pocket money to the fund');
    assert.equal(natanel.cumulativeDeposits, 500);

    assert.equal(roni.spendingAccountId, '7');
    assert.equal(roni.transfersEnabled, false, 'the younger kid starts with the feature off');
  });

  test('adds the transfers store and snapshot baselines', () => {
    const { schema } = migrateSchema(legacyDb());
    assert.deepEqual(schema.transfers, []);
    for (const snapshot of schema.snapshots) {
      assert.equal(typeof snapshot.cumulativeDepositsUsd, 'number');
      assert.equal(typeof snapshot.cumulativeDepositsLocal, 'number');
      assert.equal(typeof snapshot.totalValueLocal, 'number');
    }
  });

  test('is idempotent — a second run reports no changes', () => {
    const first = migrateSchema(legacyDb());
    const second = migrateSchema(JSON.parse(JSON.stringify(first.schema)));
    assert.equal(second.modified, false);
    assert.deepEqual(second.schema.profiles[0].spendingAccountId, '4');
  });

  test('never overwrites values that are already there', () => {
    const { schema, modified } = migrateSchema({
      profiles: [{ id: '9', name: 'Dana', spendingAccountId: '42', transfersEnabled: false, cumulativeDeposits: 7 }],
      transfers: [{ id: 'tr-1' }],
      snapshots: [{ date: '2026-01-01', profileName: 'Dana', totalValueUsd: 1, cumulativeDepositsUsd: 1 }],
    });
    assert.equal(modified, false);
    assert.equal(schema.profiles[0].spendingAccountId, '42');
    assert.equal(schema.profiles[0].transfersEnabled, false);
    assert.equal(schema.profiles[0].cumulativeDeposits, 7);
    assert.equal(schema.transfers.length, 1);
  });

  test('survives junk input instead of throwing', () => {
    assert.equal(migrateSchema(null).modified, false);
    assert.equal(migrateSchema({ profiles: 'nope' }).modified, true, 'only the missing arrays are added');
  });

  test('recognises the demo profile names too', () => {
    assert.equal(isRoniLike('Mia'), true);
    assert.equal(isRoniLike('רוני'), true);
    assert.equal(isRoniLike('נתנאל'), false);
  });
});
