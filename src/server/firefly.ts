/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { classifyKidLedger, cumulativeThrough } from './ledger-rules.js';
import { planLiquidation } from './rules.js';

interface FireflyTxPayload {
  type: 'transfer' | 'deposit' | 'withdrawal';
  date: string;
  amount: string;
  description: string;
  source_id: string;
  destination_id: string;
}

/** A flow of money crossing the kid's account boundary (allowance, work income, spending). */
export interface ExternalFlow {
  date: string;
  amount: number; // positive = money in, negative = money out of the kid's accounts
  description: string;
}

export interface KidFinancials {
  accounts: {
    checking: { id: string; name: string; balance: number } | null;
    savings: { id: string; name: string; balance: number } | null;
    investment: { id: string; name: string; balance: number } | null;
  };
  /** Net money that entered the kid's accounts from outside (whole-kid baseline). */
  externalDepositsLocal: number;
  /** Net money that entered the INVESTED world (invest fund + invested principal).
   *  This is the performance chart's baseline: pocket-money transfers in count
   *  here, so moving money from the pocket into the fund never looks like profit. */
  investedFromOutsideLocal: number;
  /** Trading profit/loss routed through the Bank of Dad clearing account. */
  realizedPnlLocal: number;
  /** Dated external flows — used to rebuild historical snapshots. */
  externalFlows: ExternalFlow[];
  /** Dated flows into/out of the invested world — rebuilds the chart baseline. */
  investedFlows: ExternalFlow[];
  fetchedAt: string;
}

interface FireflyAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  openingBalance: number;
  openingDate: string;
}

// Simple in-memory cache so a page load does not hammer Firefly III
const BREAKDOWN_TTL_MS = 10 * 60 * 1000;
const breakdownCache = new Map<
  string,
  { at: number; data: KidFinancials; flows: ExternalFlow[]; investedFlows: ExternalFlow[] }
>();
let revenueCache: { at: number; ids: Set<string> } | null = null;

function fireflyCreds(): { url: string; token: string } | null {
  const url = process.env.FIREFLY_INSTANCE_URL;
  const token = process.env.FIREFLY_PERSONAL_ACCESS_TOKEN;
  if (!url || !token || url === 'https://your-firefly-domain.local') return null;
  return { url, token };
}

async function fireflyGet(path: string): Promise<any | null> {
  const creds = fireflyCreds();
  if (!creds) return null;
  try {
    const res = await fetch(`${creds.url}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${creds.token}` },
    });
    if (!res.ok) {
      console.warn(`[LedgerSync] GET ${path} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[LedgerSync] GET ${path} failed:`, err);
    return null;
  }
}

export const LedgerService = {
  /**
   * Fetch live account balance from Firefly III
   */
  async getAccountBalance(accountId: string): Promise<number | null> {
    const fireflyUrl = process.env.FIREFLY_INSTANCE_URL;
    const fireflyToken = process.env.FIREFLY_PERSONAL_ACCESS_TOKEN;

    if (!fireflyUrl || !fireflyToken) return null;

    try {
      const res = await fetch(`${fireflyUrl}/api/v1/accounts/${accountId}`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${fireflyToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const balance = parseFloat(data?.data?.attributes?.current_balance || '0');
        return Number(balance.toFixed(2));
      }
    } catch (err) {
      console.error(`[LedgerSync] Failed to fetch balance for account ${accountId}:`, err);
    }

    return null;
  },

  /**
   * Generates a Firefly III compatible transaction on the ledger
   */
  async createTransfer(
    amount: number,
    description: string,
    sourceAccountId: string,
    destinationAccountId: string
  ): Promise<string> {
    const fireflyUrl = process.env.FIREFLY_INSTANCE_URL;
    const fireflyToken = process.env.FIREFLY_PERSONAL_ACCESS_TOKEN;

    if (fireflyUrl && fireflyToken && fireflyUrl !== 'https://your-firefly-domain.local') {
      try {
        const payload = {
          error_if_duplicate_hash: false,
          apply_rules: true,
          fire_webhooks: true,
          group_title: 'Firefly Junior Broker Sync',
          transactions: [
            {
              type: 'transfer',
              date: new Date().toISOString(),
              amount: amount.toFixed(2),
              description: description,
              source_id: sourceAccountId,
              destination_id: destinationAccountId,
            } as FireflyTxPayload,
          ],
        };

        const res = await fetch(`${fireflyUrl}/api/v1/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${fireflyToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          // Extract transaction group ID
          const ffId = data?.data?.id || `ff-${Date.now()}`;
          console.log(`[LedgerSync] Logged transaction to Firefly III. ID: ${ffId}`);
          return ffId;
        } else {
          const errMsg = await res.text();
          console.error(`[LedgerSync] Firefly III returned error status ${res.status}: ${errMsg}`);
        }
      } catch (err) {
        console.error('[LedgerSync] Error connecting to real Firefly III ledger:', err);
      }
    }

    // High fidelity simulator fallback — only used when Firefly is unreachable
    const mockId = `ff-sim-${Math.floor(100000 + Math.random() * 900000)}`;
    if (fireflyUrl && fireflyToken) {
      console.warn(`[LedgerSync] WARNING: Real Firefly III is configured but API call failed. Using MOCK transfer ${mockId}. Ledger WILL be out of sync!`);
    } else {
      console.log(`[LedgerSync] [MOCK] Logged ledger transfer of ₪/$$ ${amount.toFixed(2)} to Firefly III. Mock ID: ${mockId}`);
    }
    return mockId;
  },

  /**
   * Executes double-entry clearance through the parent "Bank of Dad" Clearance Account
   */
  async executeLiquidationDoubleEntry(params: {
    ticker: string;
    shares: number;
    currentPriceUsd: number;
    originalPrincipalUsd: number;
    savingsAccountId: string;
    investmentAccountId: string;
    currencyMode: 'PARITY' | 'REAL';
    fxRate: number;
  }): Promise<{
    principalTransferId: string;
    adjustmentTransferId: string;
    deltaValue: number;
    isGain: boolean;
  }> {
    const {
      ticker,
      shares,
      currentPriceUsd,
      originalPrincipalUsd,
      savingsAccountId,
      investmentAccountId,
      currencyMode,
      fxRate,
    } = params;

    // All the arithmetic lives in src/server/rules.ts (single source of truth,
    // unit-tested) — this method only talks to Firefly III.
    const plan = planLiquidation({
      percentage: 100,
      holding: {
        profileName: '',
        ticker,
        shares,
        averagePriceUsd: shares > 0 ? originalPrincipalUsd / shares : 0,
        originalPrincipalUsd,
        lastUpdated: new Date().toISOString(),
      },
      priceUsd: currentPriceUsd,
      currencyMode,
      fxRate,
    });
    if (!plan.ok) {
      throw new Error(`[LedgerSync] ${plan.error}`);
    }

    const {
      isGain,
      sharesToSell,
      principalLocal: principalFiat,
      currentValueLocal: currentTotalFiat,
      deltaLocal,
      fundReturnLocal: returnAmount,
    } = plan.value;
    const deltaFiat = Math.abs(deltaLocal);

    console.log(`[LedgerSync] Liquidation details for ${ticker}: `
      + `principal ${principalFiat.toFixed(2)} / value ${currentTotalFiat.toFixed(2)} / `
      + `delta ${isGain ? '+' : '-'}${deltaFiat.toFixed(2)} (${sharesToSell} shares)`);

    const dadAccountId = process.env.BANK_OF_DAD_ACCOUNT_ID || '99';

    // Action A: Return sale proceeds from investment account back to savings.
    // For gains: return the original principal (profit comes from Dad in Action B).
    // For losses: return only the current value (the difference is the loss sent to Dad in Action C).
    // This keeps the investment account balance at net zero after both actions.
    const principalTransferId = await this.createTransfer(
      returnAmount,
      `Liquidation Principal Return: Sell ${shares.toFixed(4)} shares of ${ticker}`,
      investmentAccountId,
      savingsAccountId
    );

    let adjustmentTransferId = '';

    // Only create an adjustment transfer if the gain/loss rounds to at least 0.01
    // (Firefly III rejects zero-amount transfers)
    if (Number(deltaFiat.toFixed(2)) > 0) {
      if (isGain) {
        // Action B (If Gain): Transfer profit from Bank of Dad account into the child's savings account
        adjustmentTransferId = await this.createTransfer(
          deltaFiat,
          `Liquidation Investment Profit (Bank of Dad): Sell ${shares.toFixed(4)} shares of ${ticker}`,
          dadAccountId,
          savingsAccountId
        );
      } else {
        // Action C (If Loss): Transfer the lost amount from the child's investment sub-account directly to the Bank of Dad
        adjustmentTransferId = await this.createTransfer(
          deltaFiat,
          `Liquidation Loss Adjustment (Paid to Dad): Sell ${shares.toFixed(4)} shares of ${ticker}`,
          investmentAccountId,
          dadAccountId
        );
      }
    }

    return {
      principalTransferId,
      adjustmentTransferId,
      deltaValue: deltaFiat,
      isGain,
    };
  },

  /** Reads a raw Firefly account (live balance + opening balance). */
  async getAccount(accountId: string): Promise<FireflyAccount | null> {
    const data = await fireflyGet(`/api/v1/accounts/${accountId}`);
    const at = data?.data?.attributes;
    if (!at) return null;
    return {
      id: String(data.data.id),
      name: at.name,
      type: at.type,
      balance: Number(parseFloat(at.current_balance || '0').toFixed(2)),
      openingBalance: at.opening_balance != null ? Number(parseFloat(at.opening_balance).toFixed(2)) : 0,
      openingDate: at.opening_balance_date || at.created_at || '',
    };
  },

  /** All revenue-account ids (money arriving from outside: allowance, work, gifts). */
  async listRevenueAccountIds(): Promise<Set<string>> {
    if (revenueCache && Date.now() - revenueCache.at < 3600000) return revenueCache.ids;
    const data = await fireflyGet('/api/v1/accounts?type=revenue&limit=200');
    const ids = new Set<string>((data?.data || []).map((a: any) => String(a.id)));
    revenueCache = { at: Date.now(), ids };
    return ids;
  },

  /** Every journal that touches one account (paged). */
  async getAccountJournals(accountId: string): Promise<any[]> {
    const out: any[] = [];
    for (let page = 1; page <= 20; page++) {
      const data = await fireflyGet(`/api/v1/accounts/${accountId}/transactions?limit=100&page=${page}`);
      const rows = data?.data || [];
      if (!rows.length) break;
      out.push(...rows);
      if (rows.length < 100) break;
    }
    return out;
  },

  /**
   * The kid's financial breakdown:
   *   - the three pockets (pocket money / invest fund / invested principal)
   *   - the NET money that came in from outside → the performance chart's baseline
   *   - realized trading P&L (routed through the Bank of Dad clearing account)
   *
   * Rule: every flow crossing the boundary of the kid's own accounts is an
   * external deposit or spending event — EXCEPT flows with the Bank of Dad
   * account, which ARE the trading profit/loss and must not count as deposits.
   */
  async getFinancialBreakdown(profile: {
    name: string;
    savingsAccountId: string;
    investmentAccountId: string;
    spendingAccountId?: string;
  }): Promise<KidFinancials | null> {
    const cached = breakdownCache.get(profile.name);
    if (cached && Date.now() - cached.at < BREAKDOWN_TTL_MS) return cached.data;

    const [checking, savings, investment] = await Promise.all([
      profile.spendingAccountId ? this.getAccount(profile.spendingAccountId) : Promise.resolve(null),
      this.getAccount(profile.savingsAccountId),
      this.getAccount(profile.investmentAccountId),
    ]);

    // Firefly unreachable → let the caller fall back to the local cache
    if (!savings && !investment) return null;

    const dadId = process.env.BANK_OF_DAD_ACCOUNT_ID || '25';

    // Gather every journal that touches one of the kid's accounts, then let the
    // pure rules module do the classification (see src/server/ledger-rules.ts).
    const journals: any[] = [];
    for (const account of [checking, savings, investment]) {
      if (!account) continue;
      journals.push(...(await this.getAccountJournals(account.id)));
    }

    const classification = classifyKidLedger(journals, {
      own: [checking, savings, investment]
        .filter(Boolean)
        .map((account) => {
          const acc = account as FireflyAccount;
          return {
            id: acc.id,
            name: acc.name,
            type: acc.type,
            openingBalance: acc.openingBalance,
            openingDate: acc.openingDate,
          };
        }),
      fundIds: [savings?.id, investment?.id].filter(Boolean) as string[],
      dadAccountId: dadId,
    });

    const result: KidFinancials = {
      accounts: {
        checking: checking ? { id: checking.id, name: checking.name, balance: checking.balance } : null,
        savings: savings ? { id: savings.id, name: savings.name, balance: savings.balance } : null,
        investment: investment ? { id: investment.id, name: investment.name, balance: investment.balance } : null,
      },
      externalDepositsLocal: classification.externalDepositsLocal,
      investedFromOutsideLocal: classification.investedFromOutsideLocal,
      realizedPnlLocal: classification.realizedPnlLocal,
      externalFlows: classification.externalFlows,
      investedFlows: classification.investedFlows,
      fetchedAt: new Date().toISOString(),
    };

    breakdownCache.set(profile.name, {
      at: Date.now(),
      data: result,
      flows: result.externalFlows,
      investedFlows: result.investedFlows,
    });
    return result;
  },

  /** Cumulative money invested from outside, up to a date (chart-baseline backfill). */
  async getInvestedBaselineAsOf(profileName: string, date: string): Promise<number | null> {
    const cached = breakdownCache.get(profileName);
    if (!cached) return null;
    return cumulativeThrough(cached.investedFlows, date);
  },

  /** Drops the cached breakdown after any ledger change. */
  invalidateBreakdown(profileName?: string) {
    if (profileName) breakdownCache.delete(profileName);
    else breakdownCache.clear();
  },
};
