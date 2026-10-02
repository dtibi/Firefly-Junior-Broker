/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The bank statement ("החשבון שלי"): raw Firefly splits → Hebrew rows in the two
 * accounts the kid understands (POCKET / INVEST), with a running balance.
 * Journal fixtures mirror the real instance (Hebrew descriptions, ids as strings).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStatement,
  monthlyStatement,
  withRunningBalances,
  STATEMENT_LABELS_HE,
} from '../src/server/ledger-rules.js';

const POCKET = '4';
const FUND = '6';
const INVEST = '26';
const DAD = '25';

const accountsById = {
  '4': { name: 'Natanel', type: 'asset' },
  '6': { name: 'Natanel Savings', type: 'asset' },
  '26': { name: 'Natanel Investments', type: 'asset' },
  '25': { name: 'Bank of Dad: Portfolio Clearing', type: 'asset' },
  '11': { name: 'דמי כיס', type: 'revenue' },
  '28': { name: 'עבודת דוכן עוגיות ולימונדה', type: 'revenue' },
  '12': { name: 'אוכל וממתקים', type: 'expense' },
  '7': { name: 'Roni', type: 'asset' },
};

const journal = (id: string, date: string, src: string, dst: string, amount: number, description = '') => ({
  id,
  attributes: { transactions: [{ date: `${date}T08:00:00+03:00`, source_id: src, destination_id: dst, amount: String(amount), description, type: 'transfer' }] },
});

const input = (openingByAccount = {}) => ({
  pocketId: POCKET,
  fundId: FUND,
  investmentId: INVEST,
  dadAccountId: DAD,
  accountsById,
  openingByAccount,
});

describe('classifyStatement — Hebrew, two accounts', () => {
  test('allowance, spending and saving are labelled for a kid', () => {
    const rows = classifyStatement(
      [
        journal('5', '2025-08-23', '11', POCKET, 4.9, 'דמי כיס'),
        journal('10', '2025-08-23', '11', FUND, 2.1, 'חיסכון אישי'),
        journal('40', '2025-10-12', POCKET, '12', 16.4, 'ממתקים'),
      ],
      input()
    );

    const allowance = rows.find((r) => r.kind === 'ALLOWANCE')!;
    assert.equal(allowance.section, 'POCKET');
    assert.equal(allowance.amountLocal, 4.9);
    assert.equal(allowance.labelHe, 'דמי כיס — דמי כיס');
    assert.equal(STATEMENT_LABELS_HE.ALLOWANCE, 'דמי כיס');

    const spending = rows.find((r) => r.kind === 'SPENDING')!;
    assert.equal(spending.section, 'POCKET');
    assert.equal(spending.amountLocal, -16.4);
    assert.match(spending.labelHe, /הוצאה/);

    const saving = rows.find((r) => r.kind === 'SAVING')!;
    assert.equal(saving.section, 'INVEST', 'the automatic saving goes to the investing account');
    assert.equal(saving.amountLocal, 2.1);
    assert.equal(STATEMENT_LABELS_HE.SAVING, 'חיסכון אוטומטי');
  });

  test('a purchase inside the invest account shows the money that moved, not +0.00', () => {
    const rows = classifyStatement([journal('311', '2026-09-17', FUND, INVEST, 32, 'קניית 0.2884 מניות INTC')], input());
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'BUY');
    assert.equal(rows[0].section, 'INVEST');
    assert.equal(rows[0].amountLocal, -32, 'the row shows the cash that went into the purchase');
    assert.equal(rows[0].balanceDeltaLocal, 0, 'the account total itself is unchanged by a purchase');
    assert.equal(rows[0].cashLocal, -32);
    assert.match(rows[0].noteHe || '', /שווי החשבון לא משתנה/);
  });

  test('selling back into the fund shows the cash coming back and leaves the total unchanged', () => {
    const rows = classifyStatement([journal('341', '2026-10-02', INVEST, FUND, 10, 'מכירת MDLZ')], input());
    assert.equal(rows[0].kind, 'SELL');
    assert.equal(rows[0].amountLocal, 10);
    assert.equal(rows[0].balanceDeltaLocal, 0);
    assert.equal(rows[0].cashLocal, 10);
  });

  test('the running balance follows the account total, so a purchase leaves it flat', () => {
    const rows = classifyStatement(
      [
        journal('op', '2026-09-01', null, INVEST, 100, 'יתרת פתיחה'),
        journal('buy', '2026-09-02', FUND, INVEST, 40, 'קניית 0.1 מניות SPY'),
      ],
      input()
    );
    const balanced = withRunningBalances(rows);
    assert.equal(balanced[0].balanceLocal, 100);
    assert.equal(balanced[1].amountLocal, -40);
    assert.equal(balanced[1].balanceLocal, 100, 'buying stock does not change the account value');
  });

  test('a pocket-funded purchase moves money from the pocket into the investing account', () => {
    const rows = classifyStatement(
      [journal('900', '2026-10-05', POCKET, INVEST, 20, 'קניית 0.0113 מניות ASML — מהכיס')],
      input()
    );
    assert.equal(rows.length, 2);
    const pocketRow = rows.find((r) => r.section === 'POCKET')!;
    const investRow = rows.find((r) => r.section === 'INVEST')!;
    assert.equal(pocketRow.kind, 'BUY');
    assert.equal(pocketRow.amountLocal, -20);
    assert.equal(investRow.kind, 'BUY');
    assert.equal(investRow.amountLocal, 20);
  });

  test('a pocket-funded sale returns the money to the pocket — and never the other way round', () => {
    const rows = classifyStatement([journal('901', '2026-10-06', INVEST, POCKET, 24, 'מכירת ASML')], input());
    const pocketRow = rows.find((r) => r.section === 'POCKET')!;
    const investRow = rows.find((r) => r.section === 'INVEST')!;
    assert.equal(pocketRow.kind, 'SELL');
    assert.equal(pocketRow.amountLocal, 24);
    assert.equal(investRow.kind, 'SELL');
    assert.equal(investRow.amountLocal, -24);
  });

  test('Bank-of-Dad flows are profit and loss, never deposits', () => {
    const rows = classifyStatement(
      [
        journal('330', '2026-09-30', DAD, FUND, 4.93, 'רווח'),
        journal('331', '2026-09-30', INVEST, DAD, 0.07, 'הפסד'),
      ],
      input()
    );
    assert.equal(rows.find((r) => r.kind === 'PROFIT')!.amountLocal, 4.93);
    assert.equal(rows.find((r) => r.kind === 'LOSS')!.amountLocal, -0.07);
  });

  test('a profit or loss row is named after the stock that was sold, never "Dad"', () => {
    const rows = classifyStatement(
      [
        journal('p', '2026-08-25', DAD, INVEST, 0.3, 'רווח מהבנק של אבא על מכירת TSLA'),
        journal('l', '2026-08-24', INVEST, DAD, 1.19, 'הפסד על מכירת RBLX — הועבר לבנק של אבא'),
      ],
      input()
    );
    assert.equal(rows.find((r) => r.kind === 'PROFIT')!.labelHe, 'רווח במכירת TSLA');
    assert.equal(rows.find((r) => r.kind === 'LOSS')!.labelHe, 'הפסד במכירת RBLX');
  });

  test('translating a profit row written in the old English form still names the stock', () => {
    const rows = classifyStatement(
      [journal('p2', '2026-08-25', DAD, INVEST, 0.3, 'Liquidation Investment Profit (Bank of Dad): Sell 0.0584 shares of TSLA')],
      input()
    );
    assert.equal(rows[0].labelHe, 'רווח במכירת TSLA');
  });

  test('the ₪19.01 balance correction is labelled as a correction, not as a purchase', () => {
    const rows = classifyStatement(
      [journal('322', '2026-09-29', POCKET, INVEST, 19.01, 'תיקון איזון: השבת קרן השקעה שהועברה בטעות לחשבון הבזבוזים')],
      input()
    );
    assert.equal(rows[0].kind, 'CORRECTION');
    assert.equal(rows[0].amountLocal, -19.01);
    assert.equal(rows[1].kind, 'CORRECTION');
    assert.equal(rows[1].amountLocal, 19.01);
  });

  test('a work-income deposit is a DEPOSIT, and an outside transfer is a TRANSFER_IN', () => {
    const rows = classifyStatement(
      [
        journal('320', '2026-09-28', '28', FUND, 61, 'הכנסה מעבודת דוכן עוגיות ולימונדה — נתנאל'),
        journal('146', '2026-03-11', '7', POCKET, 2, 'Loan repayment (cash)'),
      ],
      input()
    );
    assert.equal(rows.find((r) => r.kind === 'DEPOSIT')!.amountLocal, 61);
    const transfer = rows.find((r) => r.kind === 'TRANSFER_IN')!;
    assert.equal(transfer.amountLocal, 2, 'money from his sister counts as coming in');
  });

  test('fires every split exactly once, even though each account lists it', () => {
    const dupe = journal('257', '2026-07-23', FUND, INVEST, 100, 'קניית 0.1352 מניות SPY');
    const rows = classifyStatement([dupe, dupe], input());
    assert.equal(rows.length, 1, 'the same split must not be counted twice');
  });

  test('ignores Firefly’s synthetic opening-balance split and uses the account record instead', () => {
    const rows = classifyStatement(
      [{ id: '1', attributes: { transactions: [{ date: '2025-08-18T00:00:00+03:00', type: 'opening balance', source_id: '5', destination_id: POCKET, amount: '43.00', description: 'opening' }] } }],
      input({ [POCKET]: 43 })
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'OPENING');
    assert.equal(rows[0].amountLocal, 43);
  });
});

describe('withRunningBalances', () => {
  test('runs each account from its opening balance, opening rows first', () => {
    const rows = withRunningBalances(
      classifyStatement(
        [
          journal('5', '2025-08-23', '11', POCKET, 4.9, 'דמי כיס'),
          journal('40', '2025-10-12', POCKET, '12', 16.4, 'ממתקים'),
          journal('320', '2026-09-28', '28', FUND, 61, 'עבודת דוכן'),
        ],
        input({ [POCKET]: 43 })
      )
    );

    const pocket = rows.filter((r) => r.section === 'POCKET');
    assert.equal(pocket[0].kind, 'OPENING');
    assert.equal(pocket[0].balanceLocal, 43);
    assert.equal(pocket[1].balanceLocal, 47.9, '43 + 4.90');
    assert.equal(pocket[2].balanceLocal, 31.5, '47.90 − 16.40');

    const invest = rows.filter((r) => r.section === 'INVEST');
    assert.equal(invest[invest.length - 1].balanceLocal, 61);
  });

  test('dates sort chronologically and the final balance is the sum of the movements', () => {
    const rows = withRunningBalances(
      classifyStatement(
        [
          journal('9', '2026-01-10', '11', POCKET, 4.9, 'דמי כיס'),
          journal('5', '2025-08-23', '11', POCKET, 4.9, 'דמי כיס'),
        ],
        input({ [POCKET]: 43 })
      )
    );
    assert.deepEqual(rows.map((r) => r.date), ['', '2025-08-23', '2026-01-10']);
    assert.equal(rows[2].balanceLocal, 52.8);
  });
});

describe('monthlyStatement', () => {
  test('sums in/out per account per month and keeps the closing balance', () => {
    const rows = withRunningBalances(
      classifyStatement(
        [
          journal('5', '2025-08-23', '11', POCKET, 4.9, 'דמי כיס'),
          journal('40', '2025-10-12', POCKET, '12', 16.4, 'ממתקים'),
        ],
        input({ [POCKET]: 43 })
      )
    );
    const monthly = monthlyStatement(rows);
    const august = monthly.find((m) => m.section === 'POCKET' && m.month === '2025-08')!;
    assert.equal(august.inLocal, 47.9, 'the opening balance counts as money in');
    assert.equal(august.endBalanceLocal, 47.9);
    const october = monthly.find((m) => m.section === 'POCKET' && m.month === '2025-10')!;
    assert.equal(october.outLocal, -16.4);
    assert.equal(october.endBalanceLocal, 31.5);
    assert.equal(monthly.filter((m) => m.section === 'INVEST').length, 0);
  });
});
