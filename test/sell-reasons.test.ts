/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The sale-reason buttons (approved 2026-10-31). The rule these tests protect is
 * narrow on purpose: the reason is TEXT. It never changes an amount, a journal
 * leg, a destination or a balance — it only records why the kid sold.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SELL_REASONS,
  SELL_REASON_NOTE_MAX,
  isSellReasonCode,
  sellReasonHe,
  sellReasonLabelHe,
} from '../src/sell-reasons.js';

describe('sell reasons — one button is required, and it is text only', () => {
  test('exactly the five approved buttons, and nothing else counts as a reason', () => {
    assert.deepEqual(
      SELL_REASONS.map((r) => r.code),
      ['COMPANY_CHANGED', 'NEED_MONEY', 'AFRAID_OF_DROP', 'SWITCHING', 'OTHER']
    );
    assert.equal(isSellReasonCode('AFRAID_OF_DROP'), true);
    assert.equal(isSellReasonCode('afraid_of_drop'), false, 'codes are exact');
    assert.equal(isSellReasonCode(''), false, 'a sale cannot go through with no reason');
    assert.equal(isSellReasonCode(undefined), false);
    assert.equal(isSellReasonCode('BANK_OF_DAD'), false, 'retired vocabulary is not a reason');
    assert.equal(isSellReasonCode(42), false);
  });

  test('the Hebrew sentence the kid and the ledger see', () => {
    assert.equal(sellReasonHe('AFRAID_OF_DROP'), 'המחיר ירד ואני מפחד שיירד עוד');
    assert.equal(
      sellReasonHe('AFRAID_OF_DROP', 'טקסט שלא שייך לכאן'),
      'המחיר ירד ואני מפחד שיירד עוד',
      'free text belongs only to "משהו אחר"'
    );
    assert.equal(sellReasonHe('OTHER', '  כי רציתי משהו אחר  '), 'משהו אחר: כי רציתי משהו אחר');
    assert.equal(sellReasonHe('OTHER', '   '), 'משהו אחר');
    assert.equal(sellReasonHe(undefined), null);
    assert.equal(sellReasonHe('nope', 'x'), null);
  });

  test('free text is trimmed to the cap, and the label carries the emoji', () => {
    const long = 'א'.repeat(SELL_REASON_NOTE_MAX + 20);
    const text = sellReasonHe('OTHER', long)!;
    assert.equal(text, `משהו אחר: ${'א'.repeat(SELL_REASON_NOTE_MAX)}`);

    const label = sellReasonLabelHe('NEED_MONEY');
    assert.equal(label, '🛒 אני צריך את הכסף לדבר אחר');
    assert.equal(sellReasonLabelHe('nope'), null);
    assert.equal(sellReasonLabelHe(undefined), null);
  });
});
