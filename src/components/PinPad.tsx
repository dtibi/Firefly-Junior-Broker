/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, X, Delete } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../i18n/useTranslation';

interface PinPadProps {
  title?: string;
  subtitle?: string;
  onVerify: (pin: string) => Promise<boolean>;
  onCancel: () => void;
  error?: string;
}

export default function PinPad({
  title = 'Enter Security PIN',
  subtitle = 'Type your 4-digit secret code',
  onVerify,
  onCancel,
  error: initialError,
}: PinPadProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(initialError || null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const handleNumberClick = async (num: string) => {
    if (pin.length >= 4 || isVerifying) return;
    setError(null);
    const newPin = pin + num;
    setPin(newPin);

    if (newPin.length === 4) {
      setIsVerifying(true);
      const ok = await onVerify(newPin);
      setIsVerifying(false);
      if (!ok) {
        setError('Incorrect PIN! Try again.');
        setPin('');
      }
    }
  };

  const handleBackspace = () => {
    if (isVerifying) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (isVerifying) return;
    setError(null);
    setPin('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl border-4 border-amber-300"
      >
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2 text-amber-500 font-bold text-lg">
            <Lock className="w-5 h-5 text-amber-400" />
            <span>{t('pinPad.security')}</span>
          </div>
          <button
            onClick={onCancel}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="text-center mt-2 mb-6">
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">{title}</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">{subtitle}</p>
        </div>

        {/* PIN Bubble Display */}
        <div className="flex justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map((index) => (
            <motion.div
              key={index}
              animate={pin.length > index ? { scale: [1, 1.2, 1] } : {}}
              className={`w-6 h-6 rounded-full border-2 transition-all duration-150 ${
                pin.length > index
                  ? 'bg-amber-400 border-amber-500 shadow-md'
                  : 'bg-slate-50 border-slate-300'
              }`}
            />
          ))}
        </div>

        {/* Error Messages */}
        <div className="h-6 mb-4 text-center">
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-xs font-bold text-red-500"
              >
                ⚠️ {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Playful Numerical Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              className="h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 active:scale-95 text-xl font-extrabold text-slate-700 shadow-sm transition-all flex items-center justify-center cursor-pointer"
              disabled={isVerifying}
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleClear}
            className="h-16 rounded-2xl bg-red-50 hover:bg-red-100 text-xs font-black text-red-600 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            disabled={isVerifying}
          >
            {t('pinPad.clear')}
          </button>
          <button
            onClick={() => handleNumberClick('0')}
            className="h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 active:scale-95 text-xl font-extrabold text-slate-700 shadow-sm transition-all flex items-center justify-center cursor-pointer"
            disabled={isVerifying}
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="h-16 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            disabled={isVerifying}
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center">
          <p className="text-[10px] text-slate-400 font-semibold tracking-wide">
            {t('pinPad.protectedBy')}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
