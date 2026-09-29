/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure schema migration for the file-based JSON database. Kept separate from
 * db.ts (which does file I/O on import) so it can be unit-tested with fixtures
 * instead of the live database.
 */

export interface MigrationResult<T> {
  schema: T;
  /** True when something was added/changed and the file should be rewritten. */
  modified: boolean;
}

export function isRoniLike(name: unknown): boolean {
  const value = String(name || '').toLowerCase();
  return name === 'רוני' || value === 'mia' || value === 'roni';
}

/**
 * Brings a legacy DB shape up to date:
 *  - profiles: cumulativeDeposits, spendingAccountId, transfersEnabled
 *  - snapshots: cumulativeDepositsUsd / cumulativeDepositsLocal / totalValueLocal
 *  - top level: transfers (pocket-money moves with lock windows)
 */
export function migrateSchema(parsed: any): MigrationResult<any> {
  if (!parsed || typeof parsed !== 'object') return { schema: parsed, modified: false };
  let modified = false;

  if (Array.isArray(parsed.profiles)) {
    parsed.profiles.forEach((profile: any) => {
      if (profile.cumulativeDeposits === undefined) {
        profile.cumulativeDeposits = isRoniLike(profile.name) ? 1000.0 : 500.0;
        modified = true;
      }
      if (profile.spendingAccountId === undefined) {
        profile.spendingAccountId = isRoniLike(profile.name) ? '7' : '4';
        modified = true;
      }
      if (profile.transfersEnabled === undefined) {
        // The younger profile keeps pocket-money transfers off until a parent
        // switches them on (Roni is 6 and has not learned the invest account yet).
        profile.transfersEnabled = !isRoniLike(profile.name);
        modified = true;
      }
    });
  }

  if (!Array.isArray(parsed.transfers)) {
    parsed.transfers = [];
    modified = true;
  }

  if (Array.isArray(parsed.snapshots)) {
    parsed.snapshots.forEach((snapshot: any) => {
      if (snapshot.cumulativeDepositsUsd === undefined) {
        const parityRate = 1.0; // historical snapshots were all PARITY
        snapshot.cumulativeDepositsUsd = isRoniLike(snapshot.profileName) ? 1000.0 : 500.0;
        snapshot.cumulativeDepositsLocal = snapshot.cumulativeDepositsUsd * parityRate;
        snapshot.totalValueLocal = snapshot.totalValueUsd * parityRate;
        modified = true;
      }
    });
  }

  return { schema: parsed, modified };
}
