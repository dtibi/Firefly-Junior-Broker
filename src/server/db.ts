/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Profile, Holding, Transaction, PortfolioSnapshot } from '../types.js';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

interface Schema {
  profiles: Profile[];
  holdings: Holding[];
  transactions: Transaction[];
  snapshots: PortfolioSnapshot[];
  cashBalances: Record<string, number>; // profileName -> virtual/savings cache cash in USD
  fxCache: {
    rate: number;
    timestamp: string;
  } | null;
}

// Ensure database directory and file exist
function initDb(): Schema {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // Helper to hash 4-digit PINs securely on the backend
  const hashPin = (pin: string): string => {
    return crypto.createHash('sha256').update(pin).digest('hex');
  };

  const defaultSchema: Schema = {
    profiles: [
      {
        id: '1',
        name: 'נתנאל',
        birthYear: 2018, // 8 years old in 2026
        pinHash: hashPin('1234'), // default PIN
        currencyMode: 'PARITY', // ₪1 = $1 market power
        executionMode: 'INSTANT',
        savingsAccountId: '6',
        investmentAccountId: '26',
        avatar: '🦊',
        cumulativeDeposits: 500.0,
      },
      {
        id: '2',
        name: 'רוני',
        birthYear: 2020, // 6 years old in 2026
        pinHash: hashPin('5678'), // default PIN
        currencyMode: 'PARITY',
        executionMode: 'INSTANT',
        savingsAccountId: '9',
        investmentAccountId: '27',
        avatar: '🐼',
        cumulativeDeposits: 500.0,
      },
    ],
    holdings: [
      {
        profileName: 'נתנאל',
        ticker: 'AAPL',
        shares: 0.5,
        averagePriceUsd: 180,
        originalPrincipalUsd: 90,
        lastUpdated: new Date().toISOString(),
      },
      {
        profileName: 'נתנאל',
        ticker: 'DIS',
        shares: 1.2,
        averagePriceUsd: 100,
        originalPrincipalUsd: 120,
        lastUpdated: new Date().toISOString(),
      },
      {
        profileName: 'רוני',
        ticker: 'RBLX',
        shares: 5.5,
        averagePriceUsd: 40,
        originalPrincipalUsd: 220,
        lastUpdated: new Date().toISOString(),
      },
    ],
    transactions: [
      {
        id: 'tx-001',
        profileName: 'נתנאל',
        ticker: 'AAPL',
        type: 'BUY',
        shares: 0.5,
        priceUsd: 180,
        fxRate: 1.0,
        fiatAmount: 90,
        fireflyTransactionId: 'ff-9001',
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'tx-002',
        profileName: 'נתנאל',
        ticker: 'DIS',
        type: 'BUY',
        shares: 1.2,
        priceUsd: 100,
        fxRate: 1.0,
        fiatAmount: 120,
        fireflyTransactionId: 'ff-9002',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'tx-003',
        profileName: 'רוני',
        ticker: 'RBLX',
        type: 'BUY',
        shares: 5.5,
        priceUsd: 40,
        fxRate: 1.0, // PARITY mode
        fiatAmount: 220,
        fireflyTransactionId: 'ff-9003',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    snapshots: [
      // נתנאל's Snapshots
      { date: '2026-07-14', profileName: 'נתנאל', totalValueUsd: 500, cashUsd: 300, stockValueUsd: 200, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 500 },
      { date: '2026-07-15', profileName: 'נתנאל', totalValueUsd: 510, cashUsd: 300, stockValueUsd: 210, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 510 },
      { date: '2026-07-16', profileName: 'נתנאל', totalValueUsd: 505, cashUsd: 300, stockValueUsd: 205, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 505 },
      { date: '2026-07-17', profileName: 'נתנאל', totalValueUsd: 495, cashUsd: 290, stockValueUsd: 205, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 495 },
      { date: '2026-07-18', profileName: 'נתנאל', totalValueUsd: 502, cashUsd: 290, stockValueUsd: 212, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 502 },
      { date: '2026-07-19', profileName: 'נתנאל', totalValueUsd: 500, cashUsd: 290, stockValueUsd: 210, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 500 },

      // רוני's Snapshots
      { date: '2026-07-14', profileName: 'רוני', totalValueUsd: 500, cashUsd: 280, stockValueUsd: 220, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 500 },
      { date: '2026-07-15', profileName: 'רוני', totalValueUsd: 510, cashUsd: 280, stockValueUsd: 230, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 510 },
      { date: '2026-07-16', profileName: 'רוני', totalValueUsd: 500, cashUsd: 270, stockValueUsd: 230, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 500 },
      { date: '2026-07-17', profileName: 'רוני', totalValueUsd: 490, cashUsd: 270, stockValueUsd: 220, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 490 },
      { date: '2026-07-18', profileName: 'רוני', totalValueUsd: 505, cashUsd: 275, stockValueUsd: 230, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 505 },
      { date: '2026-07-19', profileName: 'רוני', totalValueUsd: 500, cashUsd: 275, stockValueUsd: 225, cumulativeDepositsUsd: 500, cumulativeDepositsLocal: 500, totalValueLocal: 500 },
    ],
    cashBalances: {
      'נתנאל': 290.0, // Virtual liquid capital in savings (ILS)
      'רוני': 275.0,
    },
    fxCache: null,
  };

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultSchema, null, 2), 'utf-8');
    return defaultSchema;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    let modified = false;

    // Migrate profiles to have cumulativeDeposits property
    if (parsed.profiles) {
      parsed.profiles.forEach((p: any) => {
        if (p.cumulativeDeposits === undefined) {
          const isRoniLike = p.name === 'רוני' || p.name.toLowerCase() === 'mia' || p.name.toLowerCase() === 'roni';
          p.cumulativeDeposits = isRoniLike ? 1000.0 : 500.0;
          modified = true;
        }
      });
    }

    // Migrate snapshots to have cumulativeDeposits properties
    if (parsed.snapshots) {
      parsed.snapshots.forEach((s: any) => {
        if (s.cumulativeDepositsUsd === undefined) {
          const isRoniLike = s.profileName === 'רוני' || s.profileName.toLowerCase() === 'mia' || s.profileName.toLowerCase() === 'roni';
          const rate = isRoniLike ? 1.0 : 1.0;
          s.cumulativeDepositsUsd = isRoniLike ? 1000.0 : 500.0;
          s.cumulativeDepositsLocal = s.cumulativeDepositsUsd * rate;
          s.totalValueLocal = s.totalValueUsd * rate;
          modified = true;
        }
      });
    }

    if (modified) {
      fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
    }

    return parsed;
  } catch (err) {
    console.error('Error reading DB, resetting to defaults:', err);
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultSchema, null, 2), 'utf-8');
    return defaultSchema;
  }
}

let dbCache: Schema = initDb();

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf-8');
}

export const Database = {
  // Profiles
  getProfiles(): Profile[] {
    return dbCache.profiles;
  },

  getProfile(name: string): Profile | undefined {
    return dbCache.profiles.find((p) => p.name.toLowerCase() === name.toLowerCase());
  },

  createProfile(profile: Omit<Profile, 'id' | 'pinHash'> & { pin: string }): Profile {
    const id = (dbCache.profiles.length + 1).toString();
    const pinHash = crypto.createHash('sha256').update(profile.pin).digest('hex');

    const newProfile: Profile = {
      id,
      name: profile.name,
      birthYear: profile.birthYear,
      pinHash,
      currencyMode: profile.currencyMode,
      executionMode: profile.executionMode,
      savingsAccountId: profile.savingsAccountId,
      investmentAccountId: profile.investmentAccountId,
      avatar: profile.avatar || '⭐',
      cumulativeDeposits: 500.0, // standard initial capital count
    };

    dbCache.profiles.push(newProfile);
    dbCache.cashBalances[profile.name] = 500.0; // Start with standard virtual 500 capital
    saveDb();
    return newProfile;
  },

  updateProfile(name: string, updates: Partial<Omit<Profile, 'pinHash'>> & { pin?: string }): Profile | null {
    const profile = dbCache.profiles.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!profile) return null;

    if (updates.name) {
      // Re-map cash balance key
      const oldCash = dbCache.cashBalances[profile.name] || 500.0;
      delete dbCache.cashBalances[profile.name];
      dbCache.cashBalances[updates.name] = oldCash;

      // Re-map holdings
      dbCache.holdings.forEach((h) => {
        if (h.profileName.toLowerCase() === profile.name.toLowerCase()) {
          h.profileName = updates.name!;
        }
      });

      // Re-map snapshots
      dbCache.snapshots.forEach((s) => {
        if (s.profileName.toLowerCase() === profile.name.toLowerCase()) {
          s.profileName = updates.name!;
        }
      });

      // Re-map transactions
      dbCache.transactions.forEach((t) => {
        if (t.profileName.toLowerCase() === profile.name.toLowerCase()) {
          t.profileName = updates.name!;
        }
      });
    }

    if (updates.birthYear !== undefined) profile.birthYear = updates.birthYear;
    if (updates.currencyMode) profile.currencyMode = updates.currencyMode;
    if (updates.executionMode) profile.executionMode = updates.executionMode;
    if (updates.savingsAccountId) profile.savingsAccountId = updates.savingsAccountId;
    if (updates.investmentAccountId) profile.investmentAccountId = updates.investmentAccountId;
    if (updates.avatar) profile.avatar = updates.avatar;
    if (updates.name) profile.name = updates.name;
    if (updates.cumulativeDeposits !== undefined) profile.cumulativeDeposits = updates.cumulativeDeposits;

    if (updates.pin) {
      profile.pinHash = crypto.createHash('sha256').update(updates.pin).digest('hex');
    }

    saveDb();
    return profile;
  },

  verifyPin(name: string, pin: string): boolean {
    const profile = this.getProfile(name);
    if (!profile) return false;
    const incomingHash = crypto.createHash('sha256').update(pin).digest('hex');
    return profile.pinHash === incomingHash;
  },

  deleteProfile(name: string): boolean {
    const initialLen = dbCache.profiles.length;
    dbCache.profiles = dbCache.profiles.filter((p) => p.name.toLowerCase() !== name.toLowerCase());
    dbCache.holdings = dbCache.holdings.filter((h) => h.profileName.toLowerCase() !== name.toLowerCase());
    dbCache.transactions = dbCache.transactions.filter((t) => t.profileName.toLowerCase() !== name.toLowerCase());
    dbCache.snapshots = dbCache.snapshots.filter((s) => s.profileName.toLowerCase() !== name.toLowerCase());
    delete dbCache.cashBalances[name];
    saveDb();
    return dbCache.profiles.length < initialLen;
  },

  // Cash Balance Synced/Virtual State
  getCashBalance(profileName: string): number {
    // Case-insensitive lookup to match getProfile behavior
    const key = Object.keys(dbCache.cashBalances).find(
      (k) => k.toLowerCase() === profileName.toLowerCase()
    );
    if (key) return dbCache.cashBalances[key];
    // Lazy-init fallback
    dbCache.cashBalances[profileName] = 500.0;
    saveDb();
    return 500.0;
  },

  updateCashBalance(profileName: string, newBalance: number) {
    dbCache.cashBalances[profileName] = Number(newBalance.toFixed(2));
    saveDb();
  },

  // Holdings
  getHoldings(profileName: string): Holding[] {
    return dbCache.holdings.filter((h) => h.profileName.toLowerCase() === profileName.toLowerCase());
  },

  saveHolding(holding: Holding) {
    const index = dbCache.holdings.findIndex(
      (h) => h.profileName.toLowerCase() === holding.profileName.toLowerCase() && h.ticker.toUpperCase() === holding.ticker.toUpperCase()
    );

    if (index >= 0) {
      if (holding.shares <= 0.0001) {
        dbCache.holdings.splice(index, 1);
      } else {
        dbCache.holdings[index] = holding;
      }
    } else if (holding.shares > 0.0001) {
      dbCache.holdings.push(holding);
    }
    saveDb();
  },

  // Transactions
  getTransactions(profileName: string): Transaction[] {
    return dbCache.transactions
      .filter((t) => t.profileName.toLowerCase() === profileName.toLowerCase())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  logTransaction(tx: Omit<Transaction, 'id' | 'timestamp'>): Transaction {
    const newTx: Transaction = {
      ...tx,
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
    };
    dbCache.transactions.push(newTx);
    saveDb();
    return newTx;
  },

  // Snapshots
  getSnapshots(profileName: string): PortfolioSnapshot[] {
    return dbCache.snapshots
      .filter((s) => s.profileName.toLowerCase() === profileName.toLowerCase())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  },

  addSnapshot(snapshot: PortfolioSnapshot) {
    // Check if snapshot for this profile and date already exists, overwrite if so
    const index = dbCache.snapshots.findIndex(
      (s) => s.profileName.toLowerCase() === snapshot.profileName.toLowerCase() && s.date === snapshot.date
    );

    if (index >= 0) {
      dbCache.snapshots[index] = snapshot;
    } else {
      dbCache.snapshots.push(snapshot);
    }
    saveDb();
  },

  // FX Cache
  getFXCache(): { rate: number; timestamp: string } | null {
    return dbCache.fxCache;
  },

  saveFXCache(rate: number) {
    dbCache.fxCache = {
      rate,
      timestamp: new Date().toISOString(),
    };
    saveDb();
  },
};
