/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CurrencyMode = 'PARITY' | 'REAL';
export type ExecutionMode = 'INSTANT' | 'MARKET_BOUND';

export interface Profile {
  id: string;
  name: string;
  birthYear: number;
  pinHash: string;
  currencyMode: CurrencyMode;
  executionMode: ExecutionMode;
  savingsAccountId: string;
  investmentAccountId: string;
  /** Firefly account the kid spends from (pocket money). */
  spendingAccountId?: string;
  /** Whether the kid may move money from the spending account into the invest fund. */
  transfersEnabled?: boolean;
  avatar: string; // Emoji or theme color
  cumulativeDeposits?: number; // local/fiat cumulative deposits
}

/** A pocket-money → invest-fund transfer, optionally locked for a while. */
export interface TransferRecord {
  id: string;
  profileName: string;
  amountLocal: number;
  lockDays: number;
  lockedUntil: string;
  createdAt: string;
  fireflyTransactionId: string;
}

export interface Holding {
  profileName: string;
  ticker: string;
  shares: number;
  averagePriceUsd: number;
  originalPrincipalUsd: number;
  lastUpdated: string;
}

export interface Transaction {
  id: string;
  profileName: string;
  ticker: string;
  type: 'BUY' | 'SELL';
  shares: number;
  priceUsd: number;
  fxRate: number;
  fiatAmount: number; // in child's profile currency
  fireflyTransactionId: string;
  timestamp: string;
}

export interface PortfolioSnapshot {
  date: string;
  profileName: string;
  totalValueUsd: number;
  cashUsd: number;
  stockValueUsd: number;
  cumulativeDepositsUsd?: number;
  cumulativeDepositsLocal?: number;
  totalValueLocal?: number;
  /** Pocket money (spending account) balance in local currency at snapshot time. */
  spendingLocal?: number;
  /** Invest-fund (savings account) balance in local currency. */
  investFundLocal?: number;
}

export interface StockInfo {
  ticker: string;
  name: string;
  heName?: string;
  description: string;
  heDescription?: string;
  childAnalogy: string;
  sector: string;
  category?: string;
  logo: string;
}

export interface StockQuote {
  ticker: string;
  name: string;
  heName?: string;
  logo?: string;
  sector?: string;
  category?: string;
  /** Plain-language explanation of what the company does (EN / HE). */
  description?: string;
  heDescription?: string;
  childAnalogy?: string;
  priceUsd: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  prevClose: number;
  volume: number;
  lastUpdated: string;
}

export interface TradeRequest {
  profileName: string;
  pin: string;
  ticker: string;
  type: 'BUY' | 'SELL';
  amount: number; // Amount of currency to invest (BUY) or shares/percentage to liquidate (SELL)
}

export interface TradeResponse {
  success: boolean;
  message: string;
  transaction?: Transaction;
  error?: string;
}

export interface FXRateCache {
  rate: number;
  timestamp: string;
}
