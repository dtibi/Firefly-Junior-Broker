/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { StockQuote, SellReasonCode } from '../types.js';
import { useTranslation } from '../i18n/useTranslation';
import { SELL_REASONS, SELL_REASON_NOTE_MAX } from '../sell-reasons';

/**
 * The trade centre: one buying card and one selling card, shown both in the
 * market tab's stock screen and in the popup the kid opens from a row of his
 * own portfolio table. It never talks to the server itself — every action goes
 * back to App through onRequestBuy / onRequestSell, so the PIN pad, the money
 * rules and the ledger path stay exactly the same in both places.
 */
export interface TradePanelProps {
  /** The stock being traded (the quote the kid picked). */
  stock: StockQuote;
  /** Every lot of the kid; the panel filters the open ones of this ticker. */
  lots: any[];
  /** Cash available to buy with, per account. */
  cash: { POCKET: number; FUND: number };
  /** USD -> the kid's local currency (PARITY: 1:1, REAL: live FX). */
  toLocal: (usd: number) => number;
  /** Locale tag for the dates he reads (day-first). */
  localeTag: string;
  tradeAmountLocal: string;
  setTradeAmountLocal: (v: string) => void;
  budgetSource: 'POCKET' | 'FUND';
  setBudgetSource: (v: 'POCKET' | 'FUND') => void;
  selectedLotIds: string[];
  setSelectedLotIds: (v: string[]) => void;
  sellReasonCode: SellReasonCode | null;
  setSellReasonCode: (c: SellReasonCode) => void;
  sellReasonNote: string;
  setSellReasonNote: (v: string) => void;
  onRequestBuy: () => void;
  onRequestSell: () => void;
  /** Which card the kid came for — it gets a ring, nothing else changes. */
  highlight?: 'BUY' | 'SELL';
}

export default function TradePanel({
  stock,
  lots,
  cash,
  toLocal,
  localeTag,
  tradeAmountLocal,
  setTradeAmountLocal,
  budgetSource,
  setBudgetSource,
  selectedLotIds,
  setSelectedLotIds,
  sellReasonCode,
  setSellReasonCode,
  sellReasonNote,
  setSellReasonNote,
  onRequestBuy,
  onRequestSell,
  highlight,
}: TradePanelProps) {
  const { t } = useTranslation();

  // The lots the kid can sell: only the ones HE bought, only the open ones.
  const openLotsOfTicker = (ticker?: string) =>
    lots.filter((l) => l.status === 'OPEN' && (!ticker || l.ticker === ticker));
  const selectedLots = lots.filter((l) => selectedLotIds.includes(l.id));
  const selectedLotsTotals = selectedLots.reduce(
    (acc, l) => ({
      principal: acc.principal + (l.principalLocal || 0),
      value: acc.value + (l.currentValueUsd || 0),
      gain: acc.gain + (l.gainLossUsd || 0),
    }),
    { principal: 0, value: 0, gain: 0 }
  );
  const money = (usd: number) => `₪${toLocal(usd).toFixed(2)}`;
  const fmtDate = (value: string | number | Date) => new Date(value).toLocaleDateString(localeTag);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100/80">

        {/* Buying Card */}
        <div className={`bg-slate-50/50 border border-slate-200/80 rounded-[24px] p-6 space-y-4 shadow-sm ${highlight === 'BUY' ? 'ring-2 ring-emerald-400 border-emerald-300' : ''}`}>
          <h4 className="font-extrabold text-emerald-700 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Plus className="w-4.5 h-4.5" />
            <span>{t('stocks.investBuy')}</span>
          </h4>
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            {t('stocks.investBuyHint')}
          </p>

          <div className="space-y-4">
            {/* Which account pays? Money never moves between them. */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'POCKET', emoji: '🍬', label: 'מהכיס', available: cash.POCKET },
                { key: 'FUND', emoji: '📈', label: 'מהקרן', available: cash.FUND },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setBudgetSource(opt.key as 'POCKET' | 'FUND')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    budgetSource === opt.key
                      ? 'border-emerald-500 bg-emerald-50/70 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="text-[11px] font-extrabold text-slate-800">
                    {opt.emoji} {opt.label}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                    יש ₪{opt.available.toFixed(2)}
                  </div>
                </button>
              ))}
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-3 font-extrabold text-slate-400 text-sm">₪</span>
              <input
                type="number"
                min={10}
                value={tradeAmountLocal}
                onChange={(e) => setTradeAmountLocal(e.target.value)}
                className="w-full pl-14 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none font-bold bg-white focus:bg-white transition-all shadow-inner"
              />
            </div>

            <div className="flex gap-2">
              {['10', '20', '50', '100'].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setTradeAmountLocal(preset)}
                  className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    tradeAmountLocal === preset
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  ₪{preset}
                </button>
              ))}
            </div>

            <button
              onClick={onRequestBuy}
              disabled={parseFloat(tradeAmountLocal || '0') > cash[budgetSource]}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-50 active:scale-95 cursor-pointer transition-all uppercase tracking-wider"
            >
              {t('stocks.confirmBuy')}
            </button>
            <p className="text-[10px] font-bold text-slate-400 leading-relaxed">
              {budgetSource === 'POCKET'
                ? 'קונה מהכיס — הכסף יוצא מחשבון הכיס.'
                : 'קונה מהקרן — הכסף יוצא מחשבון ההשקעות.'}
              {parseFloat(tradeAmountLocal || '0') > cash[budgetSource] && (
                <span className="text-rose-500"> אין מספיק כסף בחשבון הזה.</span>
              )}
            </p>
          </div>
        </div>

        {/* Selling Card */}
        <div className={`bg-slate-50/50 border border-slate-200/80 rounded-[24px] p-6 space-y-4 shadow-sm ${highlight === 'SELL' ? 'ring-2 ring-rose-400 border-rose-300' : ''}`}>
          <h4 className="font-extrabold text-rose-600 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Minus className="w-4.5 h-4.5" />
            <span>{t('stocks.liquidateSell')}</span>
          </h4>
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            {t('stocks.liquidateSellHint')}
          </p>

          <div className="space-y-4">
            {/* He picks the exact lots HE bought — each shows its own result. */}
            {openLotsOfTicker(stock.ticker).length === 0 ? (
              <p className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200/60 rounded-2xl p-3">
                אין לך עדיין עסקאות של {stock.ticker} למכירה.
              </p>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase text-slate-500">
                    בחר את העסקאות למכירה
                  </span>
                  <button
                    onClick={() => {
                      const ids = openLotsOfTicker(stock.ticker).map((l) => l.id);
                      setSelectedLotIds(selectedLotIds.length === ids.length ? [] : ids);
                    }}
                    className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    {selectedLotIds.length === openLotsOfTicker(stock.ticker).length
                      ? 'נקה בחירה'
                      : 'בחר הכול'}
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {openLotsOfTicker(stock.ticker).map((lot) => {
                    const picked = selectedLotIds.includes(lot.id);
                    const isProfit = (lot.gainLossUsd || 0) >= 0;
                    return (
                      <button
                        key={lot.id}
                        onClick={() =>
                          setSelectedLotIds(
                            picked
                              ? selectedLotIds.filter((id) => id !== lot.id)
                              : [...selectedLotIds, lot.id]
                          )
                        }
                        className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                          picked
                            ? 'border-indigo-500 bg-indigo-50/60'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-[11px] font-extrabold text-slate-800">
                            {picked ? '☑' : '☐'} ₪{lot.principalLocal.toFixed(2)} ·{' '}
                            {fmtDate(lot.acquiredAt)}
                            <span className="text-[9px] font-bold text-slate-400">
                              {' '}
                              {lot.fundingSource === 'POCKET' ? 'מהכיס' : 'מהקרן'}
                            </span>
                          </span>
                          <span
                            className={`text-[11px] font-extrabold ${
                              isProfit ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {isProfit ? '+' : ''}
                            {money(lot.gainLossUsd || 0)} ({lot.gainLossPercent}%)
                          </span>
                        </div>
                        <div className="text-[9px] font-bold text-slate-400 mt-0.5">
                          {lot.shares.toFixed(4)} מניות · שווי עכשיו {money(lot.currentValueUsd)}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedLots.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-3 text-[11px] font-bold text-slate-600 space-y-0.5">
                    <div>
                      נבחרו {selectedLots.length} עסקאות · שילמת ₪
                      {selectedLotsTotals.principal.toFixed(2)}
                    </div>
                    <div>תקבל עכשיו {money(selectedLotsTotals.value)}</div>
                    <div
                      className={
                        selectedLotsTotals.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }
                    >
                      {selectedLotsTotals.gain >= 0 ? 'רווח' : 'הפסד'}{' '}
                      {money(Math.abs(selectedLotsTotals.gain))}{' '}
                      {selectedLots.length === 1
                        ? `במכירת ${selectedLots[0].ticker}`
                        : `במכירת ${selectedLots.length} עסקאות`}{' '}
                      — {selectedLotsTotals.gain >= 0 ? 'מהשוק' : 'נשאר בשוק'}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Why he sells — required before the sale can be
                confirmed (approved 2026-10-31). Text only: it never
                moves money. Shown only when he owns lots of this stock. */}
            {openLotsOfTicker(stock.ticker).length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">
                {t('stocks.sellReasonTitle')}
              </span>
              <div className="space-y-1.5">
                {SELL_REASONS.map((r) => {
                  const picked = sellReasonCode === r.code;
                  return (
                    <button
                      key={r.code}
                      onClick={() => setSellReasonCode(r.code)}
                      className={`w-full text-left p-2.5 rounded-2xl border text-[11px] font-extrabold transition-all cursor-pointer ${
                        picked
                          ? 'border-indigo-500 bg-indigo-50/60 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {picked ? '☑' : '☐'} {r.emoji} {r.labelHe}
                    </button>
                  );
                })}
              </div>
              {sellReasonCode === 'OTHER' && (
                <input
                  value={sellReasonNote}
                  onChange={(e) => setSellReasonNote(e.target.value)}
                  maxLength={SELL_REASON_NOTE_MAX}
                  placeholder={t('stocks.sellReasonNotePlaceholder')}
                  className="w-full p-2.5 rounded-2xl border border-slate-200 text-[11px] font-bold text-slate-700"
                />
              )}
              {!sellReasonCode && (
                <p className="text-[10px] font-bold text-rose-500">{t('stocks.sellReasonRequired')}</p>
              )}
            </div>
            )}

            <button
              onClick={onRequestSell}
              disabled={selectedLots.length === 0 || !sellReasonCode}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-rose-50 active:scale-95 cursor-pointer transition-all uppercase tracking-wider"
            >
              {t('stocks.confirmSell')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
