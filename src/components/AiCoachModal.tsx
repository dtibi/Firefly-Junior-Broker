/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Sparkles, X, Volume2, BookOpen, Star, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../i18n/useTranslation';

interface AiCoachModalProps {
  ticker: string;
  stockName: string;
  profileName: string;
  onClose: () => void;
}

export default function AiCoachModal({
  ticker,
  stockName,
  profileName,
  onClose,
}: AiCoachModalProps) {
  const { t, locale } = useTranslation();
  const [guideText, setGuideText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchGuide() {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch(`/api/stocks/${ticker}/ai-guide?profileName=${encodeURIComponent(profileName)}&locale=${locale}`);
        const data = await res.json();
        if (data.success) {
          setGuideText(data.guide);
        } else {
          setError(data.error || 'Coach Firefly is currently resting in her fairy forest. Try again in a minute!');
        }
      } catch (err: any) {
        setError('Could not connect to the fairy forest server!');
      } finally {
        setIsLoading(false);
      }
    }

    fetchGuide();
  }, [ticker, profileName]);

  // Read tutorial text aloud with client-side SpeechSynthesis if available
  const handleSpeak = () => {
    if ('speechSynthesis' in window && guideText) {
      window.speechSynthesis.cancel();
      // Strip emojis for cleaner speech
      const cleanText = guideText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.2; // Cheerful high pitch
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 30 }}
        className="w-full max-w-lg overflow-hidden rounded-3xl bg-slate-50 p-6 shadow-2xl border-4 border-emerald-400 relative"
      >
        {/* Playful Floating Sparkles */}
        <div className="absolute top-2 left-6 text-yellow-400 opacity-60 animate-bounce">
          <Star className="w-5 h-5 fill-current" />
        </div>
        <div className="absolute bottom-10 right-4 text-emerald-400 opacity-50 animate-pulse">
          <Sparkles className="w-6 h-6 fill-current" />
        </div>

        {/* Modal Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 rounded-full text-emerald-600 animate-pulse">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">{t('aiCoach.learnWith')} 🧚‍♀️</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t('aiCoach.activeGuide')} {stockName} ({ticker})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Coach Character Avatar Area */}
        <div className="flex items-center gap-4 bg-emerald-50 rounded-2xl p-4 border border-emerald-200 mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center text-4xl shadow-md border-2 border-white select-none animate-bounce">
            🧚‍♀️
          </div>
          <div className="flex-1">
            <h4 className="font-extrabold text-emerald-800 text-sm">{t('aiCoach.letsPlay')}</h4>
            <p className="text-xs text-emerald-600 leading-tight mt-1 font-semibold">
              {t('aiCoach.translating')} {profileName}!
            </p>
          </div>
        </div>

        {/* Content Box */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-inner min-h-[180px] max-h-[300px] overflow-y-auto mb-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-4">
              <div className="flex gap-2 justify-center">
                <span className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                <span className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                <span className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">
                {t('aiCoach.consulting')}
              </p>
            </div>
          ) : error ? (
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-500 mx-auto mb-3">
                <HelpCircle className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-600">{error}</p>
            </div>
          ) : (
            <div className="text-slate-700 text-sm font-medium leading-relaxed space-y-4">
              {guideText.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          {'speechSynthesis' in window && !isLoading && !error ? (
            <button
              onClick={handleSpeak}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <Volume2 className="w-4 h-4 animate-pulse" />
              <span>{t('aiCoach.readAloud')}</span>
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer border-b-4 border-emerald-600 active:scale-95"
          >
            {t('aiCoach.iUnderstand')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
