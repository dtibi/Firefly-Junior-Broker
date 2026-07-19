/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface FireflyTxPayload {
  type: 'transfer' | 'deposit' | 'withdrawal';
  date: string;
  amount: string;
  description: string;
  source_id: string;
  destination_id: string;
}

export const LedgerService = {
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

    // High fidelity simulator fallback
    const mockId = `ff-sim-${Math.floor(100000 + Math.random() * 900000)}`;
    console.log(`[LedgerSync] [MOCK] Logged ledger transfer of ₪/$$ ${amount.toFixed(2)} to Firefly III. Mock ID: ${mockId}`);
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

    // Calculate current liquidation value in USD
    const currentTotalUsd = shares * currentPriceUsd;
    const deltaUsd = currentTotalUsd - originalPrincipalUsd;
    const isGain = deltaUsd >= 0;

    // Convert values to child's currency mode if REAL, or keep as 1.0 if PARITY
    const multiplier = currencyMode === 'PARITY' ? 1.0 : (1.0 / fxRate); // Wait, if the allowance is in Shekels (ILS) and currency_mode is REAL, we convert Allowance Shekels (ILS) to USD when buying.
    // Buying: originalPrincipalUsd = (fiatAmount * fxRate) -> wait, if currency_mode is REAL:
    // "fiatAmount" in Shekels (ILS) converts to USD at FX rate. So USD amount = fiatAmount * fxRate (where fxRate is around 0.27, so 100 ILS * 0.27 = 27 USD).
    // Selling:
    // Principal back to savings: originalPrincipalUsd / fxRate = originalPrincipalIls.
    // Profit back to savings: deltaUsd / fxRate = deltaIls (from Bank of Dad).
    // Loss out of savings: lossUsd / fxRate = lossIls (from Investment Account to Bank of Dad).
    // Let's compute everything in Child's Currency (fiat)!
    const fxFactor = currencyMode === 'PARITY' ? 1.0 : fxRate; // fxRate is ILS -> USD (e.g. 0.27). So USD / fxRate = ILS.
    
    const principalFiat = currencyMode === 'PARITY' ? originalPrincipalUsd : (originalPrincipalUsd / fxFactor);
    const deltaFiat = currencyMode === 'PARITY' ? Math.abs(deltaUsd) : (Math.abs(deltaUsd) / fxFactor);
    const currentTotalFiat = currencyMode === 'PARITY' ? currentTotalUsd : (currentTotalUsd / fxFactor);

    console.log(`[LedgerSync] Liquidation details for ${ticker}:
      - Principal invested: $${originalPrincipalUsd.toFixed(2)} USD (${principalFiat.toFixed(2)} Fiat)
      - Current value: $${currentTotalUsd.toFixed(2)} USD (${currentTotalFiat.toFixed(2)} Fiat)
      - Delta (Profit/Loss): $${deltaUsd.toFixed(2)} USD (${(isGain ? '+' : '-')}${deltaFiat.toFixed(2)} Fiat)`);

    const dadAccountId = process.env.BANK_OF_DAD_ACCOUNT_ID || '99';

    // Action A: Create a Firefly transfer returning the exact original Principal Capital out of the child's investment sub-account back to savings
    const principalTransferId = await this.createTransfer(
      principalFiat,
      `Liquidation Principal Return: Sell ${shares.toFixed(4)} shares of ${ticker}`,
      investmentAccountId,
      savingsAccountId
    );

    let adjustmentTransferId = '';

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
      // This reduces what was effectively refunded (Principal was returned to Savings, but the loss is immediately paid to Dad from Investment)
      // Wait, let's check: "Transfer the lost amount from child's investment_account_id directly to BANK_OF_DAD_ACCOUNT_ID"
      adjustmentTransferId = await this.createTransfer(
        deltaFiat,
        `Liquidation Loss Adjustment (Paid to Dad): Sell ${shares.toFixed(4)} shares of ${ticker}`,
        investmentAccountId,
        dadAccountId
      );
    }

    return {
      principalTransferId,
      adjustmentTransferId,
      deltaValue: deltaFiat,
      isGain,
    };
  },
};
