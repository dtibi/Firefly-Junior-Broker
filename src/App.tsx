/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Coins,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  User,
  Users,
  ShieldAlert,
  ArrowLeft,
  History,
  Sparkles,
  Plus,
  Minus,
  LogOut,
  DollarSign,
  Activity,
  Info,
  X,
  ChevronRight,
  Trash2,
  Lock,
  PlusCircle,
  HelpCircle,
  CheckCircle2,
  Briefcase,
  Languages,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Profile, Holding, Transaction, StockQuote, PortfolioSnapshot } from './types.js';
import PinPad from './components/PinPad.tsx';
import AiCoachModal from './components/AiCoachModal.tsx';
import PerformanceChart from './components/PerformanceChart.tsx';
import { useTranslation } from './i18n/useTranslation';

export default function App() {
  const { t, locale, setLocale, dir } = useTranslation();

  // Profiles state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  
  // Active Profile details cached from the backend
  const [summary, setSummary] = useState<any>(null);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  
  // Stocks list state
  const [stocks, setStocks] = useState<StockQuote[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockQuote | null>(null);
  
  // UI Sub-modals & loaders
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stocks' | 'ledger' | 'settings'>('dashboard');
  const [showPinPad, setShowPinPad] = useState<'login' | 'trade_buy' | 'trade_sell' | null>(null);
  const [targetProfileToLogin, setTargetProfileToLogin] = useState<Profile | null>(null);
  const [showAiModal, setShowAiModal] = useState<string | null>(null); // stock ticker
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  // New Profile Creation form state
  const [showCreateProfile, setShowCreateProfile] = useState<boolean>(false);
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [newProfileBirthYear, setNewProfileBirthYear] = useState<number>(2016);
  const [newProfilePin, setNewProfilePin] = useState<string>('');
  const [newProfileCurrency, setNewProfileCurrency] = useState<'PARITY' | 'REAL'>('PARITY');
  const [newProfileExecution, setNewProfileExecution] = useState<'INSTANT' | 'MARKET_BOUND'>('INSTANT');
  const [newProfileSavingsId, setNewProfileSavingsId] = useState<string>('101');
  const [newProfileInvestmentId, setNewProfileInvestmentId] = useState<string>('201');
  const [newProfileAvatar, setNewProfileAvatar] = useState<string>('🦊');

  // Parent deposit and Trade inputs
  const [depositAmount, setDepositAmount] = useState<string>('5');
  const [tradeAmountLocal, setTradeAmountLocal] = useState<string>('10');
  const [sellPercentage, setSellPercentage] = useState<number>(100);

  // Inactivity session timer (15 minutes)
  const lastActivityRef = useRef<number>(Date.now());
  const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 mins

  // Load basic profiles and stock catalog
  useEffect(() => {
    fetchProfiles();
    fetchStocks();
  }, []);

  // Monitor user activity to trigger inactivity lock
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keypress', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    const interval = setInterval(() => {
      if (selectedProfile && Date.now() - lastActivityRef.current > INACTIVITY_TIMEOUT) {
        handleLogout();
        alert('Session closed due to 15 minutes of inactivity. Please sign back in with your PIN!');
      }
    }, 10000); // Check every 10s

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearInterval(interval);
    };
  }, [selectedProfile]);

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/profiles');
      const data = await res.json();
      if (data.success) {
        setProfiles(data.profiles);
      }
    } catch (e) {
      console.error('Error fetching profiles:', e);
    }
  };

  const fetchStocks = async () => {
    try {
      const res = await fetch('/api/stocks');
      const data = await res.json();
      if (data.success) {
        setStocks(data.stocks);
      }
    } catch (e) {
      console.error('Error fetching stock catalog:', e);
    }
  };

  const fetchActiveProfileData = async (profileName: string) => {
    try {
      setIsRefreshing(true);
      const res = await fetch(`/api/portfolio/${encodeURIComponent(profileName)}`);
      const data = await res.json();
      if (data.success) {
        setSummary(data.summary);
        setHoldings(data.holdings);
        setHistory(data.transactions);
        setSnapshots(data.snapshots);
      }
    } catch (e) {
      console.error('Error fetching profile portfolio data:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleProfileLoginClick = (profile: Profile) => {
    setTargetProfileToLogin(profile);
    setShowPinPad('login');
  };

  const handlePinPadVerify = async (pin: string): Promise<boolean> => {
    if (showPinPad === 'login' && targetProfileToLogin) {
      try {
        const res = await fetch('/api/profiles/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: targetProfileToLogin.name, pin }),
        });
        const data = await res.json();
        if (data.success) {
          setSelectedProfile(data.profile);
          fetchActiveProfileData(data.profile.name);
          setShowPinPad(null);
          setTargetProfileToLogin(null);
          lastActivityRef.current = Date.now();
          return true;
        }
      } catch (e) {
        console.error(e);
      }
      return false;
    }

    if (showPinPad === 'trade_buy' && selectedProfile && selectedStock) {
      try {
        const res = await fetch('/api/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileName: selectedProfile.name,
            pin,
            ticker: selectedStock.ticker,
            type: 'BUY',
            amount: parseFloat(tradeAmountLocal),
          }),
        });
        const data = await res.json();
        if (data.success) {
          setSuccessText(data.message);
          setErrorText(null);
          setShowPinPad(null);
          // Refresh catalog & child dashboard
          fetchStocks();
          fetchActiveProfileData(selectedProfile.name);
          // Update selected stock price quote
          const updatedQuote = data.transaction ? { ...selectedStock, priceUsd: data.transaction.priceUsd } : selectedStock;
          setSelectedStock(updatedQuote);
          return true;
        } else {
          setErrorText(data.error);
        }
      } catch (e: any) {
        setErrorText('Could not contact the trade execution ledger.');
      }
      return false;
    }

    if (showPinPad === 'trade_sell' && selectedProfile && selectedStock) {
      try {
        const res = await fetch('/api/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileName: selectedProfile.name,
            pin,
            ticker: selectedStock.ticker,
            type: 'SELL',
            amount: sellPercentage,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setSuccessText(data.message);
          setErrorText(null);
          setShowPinPad(null);
          // Refresh catalog & child dashboard
          fetchStocks();
          fetchActiveProfileData(selectedProfile.name);
          return true;
        } else {
          setErrorText(data.error);
        }
      } catch (e: any) {
        setErrorText('Could not contact the trade execution ledger.');
      }
      return false;
    }

    return false;
  };

  const handleLogout = () => {
    setSelectedProfile(null);
    setSummary(null);
    setHoldings([]);
    setHistory([]);
    setSnapshots([]);
    setSelectedStock(null);
    setActiveTab('dashboard');
    setErrorText(null);
    setSuccessText(null);
  };

  const handleCreateProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName || !newProfilePin || newProfilePin.length !== 4) {
      alert('Profile name and a 4-digit security PIN are required!');
      return;
    }

    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProfileName,
          birthYear: newProfileBirthYear,
          pin: newProfilePin,
          currencyMode: newProfileCurrency,
          executionMode: newProfileExecution,
          savingsAccountId: newProfileSavingsId,
          investmentAccountId: newProfileInvestmentId,
          avatar: newProfileAvatar,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewProfileName('');
        setNewProfilePin('');
        setShowCreateProfile(false);
        fetchProfiles();
        alert(`Profile for ${data.profile.name} created successfully! Log in with PIN ${newProfilePin}.`);
      } else {
        alert(`Failed to create profile: ${data.error}`);
      }
    } catch (err) {
      alert('Could not connect to the creation server.');
    }
  };

  const handleDeleteProfile = async (name: string) => {
    if (!confirm(`Are you absolutely sure you want to delete ${name}'s profile? All ledger histories on this simulation will be removed!`)) return;
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchProfiles();
        handleLogout();
        alert('Profile deleted.');
      }
    } catch (e) {
      alert('Could not complete deletion.');
    }
  };

  const handleParentDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) return;
    const amountNum = parseFloat(depositAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a valid positive deposit amount!');
      return;
    }

    try {
      const res = await fetch(`/api/profiles/${selectedProfile.name}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setDepositAmount('5');
        fetchActiveProfileData(selectedProfile.name);
      } else {
        alert(data.error || 'Failed to deposit.');
      }
    } catch (err: any) {
      alert('Error connecting to the server: ' + err.message);
    }
  };

  // Helper: derived age of active profile
  const profileAge = selectedProfile ? (new Date().getFullYear() - selectedProfile.birthYear) : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col pb-12">
      {/* Top Navigation Bar in Sleek Interface theme */}
      <nav className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <div>
            <span className="text-lg font-extrabold tracking-tight text-slate-800 uppercase">Firefly Junior</span>
            <span className="hidden sm:inline text-[10px] text-slate-400 font-bold tracking-widest uppercase ml-2 border-l pl-2 border-slate-200" dir="ltr">{t('nav.brokeragePanel')}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Language Switcher */}
          <button
            onClick={() => setLocale(locale === 'en' ? 'he' : 'en')}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-extrabold rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 transition-all cursor-pointer"
            title={locale === 'en' ? 'עברית' : 'English'}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{locale === 'en' ? 'HE' : 'EN'}</span>
          </button>

          {selectedProfile ? (
            <div className="flex items-center gap-6">
              {/* Wallet Balance Capsule */}
              <div className="hidden md:flex bg-slate-50 rounded-full px-4 py-1.5 items-center gap-2 border border-slate-200 shadow-inner">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {selectedProfile.currencyMode === 'PARITY' ? t('nav.bankOfDad') : t('nav.liveFxSync')}
                </span>
                <span className="text-sm font-extrabold text-slate-800">
                  {summary ? `${t('common.ils')}${summary.cashLocal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${t('common.ils')}0.00`}
                </span>
              </div>

              {/* Profile User block */}
              <div className="flex items-center gap-3 border-l pl-6 border-slate-200">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{t('nav.brokerProfile')}</p>
                  <p className="text-sm font-extrabold text-slate-800">{selectedProfile.name} ({t('dashboard.goodDay')} {profileAge})</p>
                </div>
                <div className="w-10 h-10 bg-indigo-100 rounded-full border-2 border-indigo-200 flex items-center justify-center text-xl overflow-hidden shadow-sm">
                  {selectedProfile.avatar}
                </div>
                <button
                  onClick={handleLogout}
                  className="text-rose-500 hover:text-rose-600 font-extrabold text-xs ml-2 tracking-wider hover:underline transition-all cursor-pointer"
                >
                  {t('nav.logout')}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 font-extrabold bg-slate-100 px-3 py-1 rounded-full border border-slate-200 tracking-wider">
              {t('nav.securedGateway')}
            </div>
          )}
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
        <AnimatePresence mode="wait">
          
          {/* PROFILE SELECTION VIEW */}
          {!selectedProfile && (
            <motion.div
              key="profile-selection"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-8 py-6"
            >
              <div className="text-center max-w-xl mx-auto space-y-4">
                <span className="px-3 py-1.5 bg-orange-50 text-orange-600 font-extrabold text-[10px] rounded-full uppercase tracking-wider border border-orange-100 shadow-sm shadow-orange-50/50">
                  {t('profileSelection.sandboxBadge')}
                </span>
                <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">{t('profileSelection.whoIsTrading')}</h2>
                <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-md mx-auto">
                  {t('profileSelection.subtitle')}
                </p>
              </div>

              {/* Grid of Profiles */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 justify-center max-w-3xl mx-auto">
                {profiles.map((p) => {
                  const age = new Date().getFullYear() - p.birthYear;
                  return (
                    <motion.div
                      key={p.id}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleProfileLoginClick(p)}
                      className="cursor-pointer bg-white rounded-[32px] p-6 border border-slate-200/80 hover:border-orange-400 shadow-sm hover:shadow-xl hover:shadow-slate-100 flex flex-col items-center text-center transition-all duration-300 relative overflow-hidden"
                    >
                      <div className="absolute top-2 right-2 bg-slate-50 text-slate-500 text-[9px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
                        {p.currencyMode}
                      </div>
                      <div className="w-20 h-20 bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-2xl flex items-center justify-center text-5xl mb-4 border border-orange-100 shadow-inner">
                        {p.avatar}
                      </div>
                      <h3 className="text-lg font-extrabold text-slate-800">{p.name}</h3>
                      <p className="text-xs font-semibold text-slate-400 mt-1">{age} {t('profileSelection.yearsOld')}</p>
                      
                      <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/80 transition-all">
                        <Lock className="w-3 h-3 text-slate-400" />
                        <span>{t('profileSelection.enterPin')}</span>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Add Profile Card */}
                {!showCreateProfile && (
                  <motion.div
                    whileHover={{ scale: 1.03 }}
                    onClick={() => setShowCreateProfile(true)}
                    className="cursor-pointer bg-slate-50 border border-dashed border-slate-300 hover:border-orange-400/60 hover:bg-white rounded-[32px] p-6 flex flex-col items-center justify-center text-center min-h-[220px] shadow-sm hover:shadow-lg hover:shadow-slate-100 transition-all group"
                  >
                    <PlusCircle className="w-12 h-12 text-slate-400 mb-2 group-hover:text-orange-500 transition-colors" />
                    <h3 className="text-base font-bold text-slate-600 group-hover:text-slate-800 transition-colors">{t('profileSelection.newBroker')}</h3>
                    <p className="text-xs font-semibold text-slate-400 mt-1">{t('profileSelection.newBrokerDesc')}</p>
                  </motion.div>
                )}
              </div>

              {/* CREATE PROFILE DRAWER/CARD */}
              {showCreateProfile && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="max-w-2xl mx-auto bg-white rounded-[32px] p-8 shadow-xl border border-slate-200"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                      <Users className="w-6 h-6 text-orange-500" />
                      <span>{t('createProfile.title')}</span>
                    </h3>
                    <button
                      onClick={() => setShowCreateProfile(false)}
                      className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateProfileSubmit} className="space-y-4 text-sm font-medium">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">{t('createProfile.childName')}</label>
                        <input
                          type="text"
                          required
                          value={newProfileName}
                          onChange={(e) => setNewProfileName(e.target.value)}
                          placeholder={t('createProfile.childName')}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-semibold bg-slate-50/50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">{t('createProfile.birthYear')}</label>
                        <input
                          type="number"
                          required
                          min={2005}
                          max={new Date().getFullYear()}
                          value={newProfileBirthYear}
                          onChange={(e) => setNewProfileBirthYear(parseInt(e.target.value))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-semibold bg-slate-50/50 focus:bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">{t('createProfile.pinLabel')}</label>
                        <input
                          type="text"
                          required
                          maxLength={4}
                          pattern="[0-9]{4}"
                          value={newProfilePin}
                          onChange={(e) => setNewProfilePin(e.target.value)}
                          placeholder="e.g. 1234"
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none transition-all font-mono font-extrabold tracking-widest text-center bg-slate-50/50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">{t('createProfile.avatarLabel')}</label>
                        <div className="flex gap-2 text-2xl bg-slate-50 p-2 rounded-xl border border-slate-200 justify-around">
                          {['🦊', '🐼', '🐯', '🦁', '🦉', '🐨', '🦄'].map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => setNewProfileAvatar(emoji)}
                              className={`rounded-lg p-1.5 transition-all cursor-pointer ${newProfileAvatar === emoji ? 'bg-orange-50 scale-110 border border-orange-200' : 'hover:scale-105'}`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/60 p-4 rounded-2xl border border-slate-200/60">
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">{t('createProfile.currencyModeLabel')}</label>
                        <select
                          value={newProfileCurrency}
                          onChange={(e) => setNewProfileCurrency(e.target.value as any)}
                          className="w-full bg-white px-3 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer outline-none focus:border-indigo-500 transition-all"
                        >
                          <option value="PARITY">{t('createProfile.parityOption')}</option>
                          <option value="REAL">{t('createProfile.realOption')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">{t('createProfile.executionModeLabel')}</label>
                        <select
                          value={newProfileExecution}
                          onChange={(e) => setNewProfileExecution(e.target.value as any)}
                          className="w-full bg-white px-3 py-2 rounded-xl border border-slate-200 font-semibold cursor-pointer outline-none focus:border-indigo-500 transition-all"
                        >
                          <option value="INSTANT">{t('createProfile.instantOption')}</option>
                          <option value="MARKET_BOUND">{t('createProfile.marketBoundOption')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">{t('createProfile.savingsAccountId')}</label>
                        <input
                          type="text"
                          required
                          value={newProfileSavingsId}
                          onChange={(e) => setNewProfileSavingsId(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none font-semibold bg-slate-50/50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">{t('createProfile.investmentAccountId')}</label>
                        <input
                          type="text"
                          required
                          value={newProfileInvestmentId}
                          onChange={(e) => setNewProfileInvestmentId(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none font-semibold bg-slate-50/50 focus:bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setShowCreateProfile(false)}
                        className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold cursor-pointer transition-all"
                      >
                        {t('createProfile.cancel')}
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl shadow-md active:scale-95 cursor-pointer transition-all"
                      >
                        {t('createProfile.submit')}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ACTIVE BROKER DASHBOARD VIEW */}
          {selectedProfile && summary && (
            <motion.div
              key="broker-dashboard"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Profile Welcome Banner */}
              <div className="bg-white rounded-[32px] p-8 border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-50 to-indigo-100/60 rounded-2xl flex items-center justify-center text-4xl border border-indigo-100 shadow-sm">
                    {selectedProfile.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-extrabold text-slate-900">{t('dashboard.goodDay')}, {selectedProfile.name}!</h2>
                      <span className="bg-emerald-50 text-emerald-700 font-bold text-[10px] px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1.5 shadow-sm">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                        <span>{t('dashboard.brokerActive')}</span>
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 mt-1">
                      {t('dashboard.ledgerSyncing')} #{selectedProfile.savingsAccountId}.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      fetchActiveProfileData(selectedProfile.name);
                      fetchStocks();
                    }}
                    disabled={isRefreshing}
                    className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 shadow-sm transition-all flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
                  >
                    <Activity className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{t('dashboard.refreshLedger')}</span>
                  </button>
                  
                  {/* Nightly Snapshot Force Trigger (Educational Trigger) */}
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/cron/snapshots', { method: 'POST' });
                        const d = await res.json();
                        if (d.success) {
                          alert('Nightly ledger snapshot recorded successfully!');
                          fetchActiveProfileData(selectedProfile.name);
                        }
                      } catch (e) {
                        alert('Could not record snapshot.');
                      }
                    }}
                    className="p-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-indigo-700 shadow-sm transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                  >
                    <Coins className="w-4 h-4" />
                    <span>{t('dashboard.forceDailySnapshot')}</span>
                  </button>
                </div>
              </div>

              {/* Navigation Tabs - Sleek Theme */}
              <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 max-w-lg">
                {[
                  { id: 'dashboard', label: t('dashboard.myVault'), icon: PiggyBank },
                  { id: 'stocks', label: t('dashboard.investMarket'), icon: Coins },
                  { id: 'ledger', label: t('dashboard.ledgerHistory'), icon: History },
                  { id: 'settings', label: t('dashboard.settings'), icon: User },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === tab.id
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/30 font-extrabold'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* TAB VIEWS */}
              <AnimatePresence mode="wait">
                
                {/* 1. VAULT / DASHBOARD TAB */}
                {activeTab === 'dashboard' && (
                  <motion.div
                    key="tab-dashboard"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                  >
                    {/* Left Column: Wealth Summary Cards */}
                    <div className="lg:col-span-1 space-y-4">
                      {/* Wealth Card - High Craftsman violet styling */}
                      <div className="bg-indigo-600 text-white rounded-[32px] p-8 shadow-xl shadow-indigo-100 border border-indigo-500/25 relative overflow-hidden">
                        <div className="absolute top-2 right-4 text-white opacity-10 text-8xl font-black select-none pointer-events-none">
                          ₪
                        </div>
                        <h4 className="text-[10px] font-bold text-indigo-200 tracking-widest uppercase">{t('dashboard.combinedWealth')}</h4>
                        <div className="text-4xl font-extrabold mt-2 tracking-tight">
                          {selectedProfile.currencyMode === 'PARITY' ? '₪' : '₪'}
                          {summary.totalWealthLocal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {selectedProfile.currencyMode === 'REAL' && (
                          <p className="text-[10px] text-indigo-200 font-extrabold uppercase mt-2">
                            {t('dashboard.equivalentTo')} ${summary.totalWealthUsd.toFixed(2)} USD (at ₪1 ILS = ${summary.fxRate.toFixed(2)} USD)
                          </p>
                        )}
                        
                        <div className="border-t border-indigo-400/30 mt-6 pt-4 grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] text-indigo-200 font-bold uppercase tracking-wider">{t('dashboard.liquidCash')}</span>
                            <p className="text-lg font-extrabold text-white mt-0.5">
                              {t('common.ils')}{summary.cashLocal.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] text-indigo-200 font-bold uppercase tracking-wider">{t('dashboard.investedStocks')}</span>
                            <p className="text-lg font-extrabold text-white mt-0.5">
                              {t('common.ils')}{summary.stockValueLocal.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Cash Vault Sync detail - Sleek Card */}
                      <div className="bg-white rounded-[28px] p-6 border border-slate-200 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">{t('dashboard.ledgerAccounts')}</h4>
                          <span className="bg-emerald-50 text-emerald-700 font-bold text-[10px] px-2.5 py-1 rounded-full border border-emerald-100 shadow-sm">
                            {t('dashboard.synced')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                          {t('dashboard.syncedDesc')}
                        </p>
                        <div className="bg-slate-50 p-4 rounded-2xl space-y-2 border border-slate-200/60 text-xs">
                          <div className="flex justify-between font-bold text-slate-500">
                            <span>{t('dashboard.piggyBank')}</span>
                            <span className="text-slate-800 font-extrabold font-mono text-[11px]">#{selectedProfile.savingsAccountId}</span>
                          </div>
                          <div className="flex justify-between font-bold text-slate-500">
                            <span>{t('dashboard.brokerStorage')}</span>
                            <span className="text-slate-800 font-extrabold font-mono text-[11px]">#{selectedProfile.investmentAccountId}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Historical Performance Chart & Active Holdings */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* Performance Curve */}
                      <div className="bg-white rounded-[32px] p-8 border border-slate-200/80 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                          <div>
                            <h3 className="text-xl font-extrabold text-slate-900">{t('dashboard.myWealthPerformance')}</h3>
                            <p className="text-xs text-slate-500 font-semibold mt-0.5">{t('dashboard.dailyAppraisal')}</p>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full border border-indigo-100 shadow-sm">
                            {t('dashboard.dayGrowth')}
                          </span>
                        </div>
                        <PerformanceChart
                          data={snapshots.map((s) => {
                            const isParity = selectedProfile.currencyMode === 'PARITY';
                            const rate = summary?.fxRate ?? 3.75;
                            const priceVal = isParity ? s.totalValueUsd : (s.totalValueLocal ?? (s.totalValueUsd * rate));
                            const depositsVal = isParity ? (s.cumulativeDepositsUsd ?? 500) : (s.cumulativeDepositsLocal ?? ((s.cumulativeDepositsUsd ?? 1000) * rate));
                            return {
                              date: s.date,
                              price: priceVal,
                              cumulativeDeposits: depositsVal,
                            };
                          })}
                          color="indigo"
                          currencySymbol="₪"
                        />
                      </div>

                      {/* Active Positions Table */}
                      <div className="bg-white rounded-[32px] p-8 border border-slate-200/80 shadow-sm">
                        <h3 className="text-xl font-extrabold text-slate-900 mb-6">{t('dashboard.myInvestmentPortfolio')}</h3>
                        {holdings.length === 0 ? (
                          <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-2 animate-pulse" />
                            <p className="text-sm font-bold text-slate-500">You don't own any stocks yet!</p>
                            <p className="text-xs font-semibold text-slate-400 mt-1">Head over to the Invest Market to make your first trade.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm font-semibold">
                              <thead>
                                <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-bold tracking-wider uppercase">
                                  <th className="py-3 px-2">{t('dashboard.stock')}</th>
                                  <th className="py-3 px-2">{t('dashboard.sharesOwned')}</th>
                                  <th className="py-3 px-2">{t('dashboard.averageCost')}</th>
                                  <th className="py-3 px-2">{t('dashboard.currentValue')}</th>
                                  <th className="py-3 px-2">{t('dashboard.gainLoss')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {holdings.map((h) => {
                                  const isProfit = h.gainLossUsd >= 0;
                                  return (
                                    <tr key={h.ticker} className="border-b border-slate-100/60 hover:bg-slate-50/40">
                                      <td className="py-4 px-2 flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-lg shadow-sm border border-slate-200/40">
                                          {(stocks.find(s => s.ticker === h.ticker)?.logo) || '⭐'}
                                        </div>
                                        <div>
                                          <p className="font-extrabold text-slate-800">{h.ticker}</p>
                                          <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wide">{t('dashboard.lastBought')} {new Date(h.lastUpdated).toLocaleDateString()}</p>
                                        </div>
                                      </td>
                                      <td className="py-4 px-2 font-extrabold text-slate-700">
                                        {h.shares.toFixed(4)}
                                      </td>
                                      <td className="py-4 px-2 font-semibold text-slate-500">
                                        ${h.averagePriceUsd.toFixed(2)}
                                      </td>
                                      <td className="py-4 px-2 font-extrabold text-indigo-600">
                                        ₪{(h.currentValueUsd / (selectedProfile.currencyMode === 'PARITY' ? 1.0 : summary.fxRate)).toFixed(2)}
                                        <p className="text-[9px] text-slate-400 font-bold mt-0.5">(${h.currentValueUsd.toFixed(2)})</p>
                                      </td>
                                      <td className="py-4 px-2">
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                                          isProfit
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm shadow-emerald-50/40'
                                            : 'bg-rose-50 text-rose-700 border-rose-100 shadow-sm shadow-rose-50/40'
                                        }`}>
                                          {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                          <span>{isProfit ? '+' : ''}{h.gainLossPercent.toFixed(2)}%</span>
                                        </span>
                                        <p className={`text-[10px] font-bold mt-1 pl-2 ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                                          {isProfit ? '+' : ''}₪{(h.gainLossUsd / (selectedProfile.currencyMode === 'PARITY' ? 1.0 : summary.fxRate)).toFixed(2)}
                                        </p>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 2. INVEST / MARKET CATALOG TAB */}
                {activeTab === 'stocks' && (
                  <motion.div
                    key="tab-stocks"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                  >
                    {/* Left Column: Stocks Directory */}
                    <div className="lg:col-span-1 bg-white rounded-[32px] p-8 border border-slate-200/80 shadow-sm h-fit space-y-6">
                      <div>
                        <h3 className="text-xl font-extrabold text-slate-900">{t('stocks.marketplace')}</h3>
                        <p className="text-xs text-slate-500 font-semibold mt-0.5">{t('stocks.marketplaceDesc')}</p>
                      </div>

                      <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                        {stocks.map((s) => {
                          const isUp = s.changePercent >= 0;
                          return (
                            <motion.div
                              key={s.ticker}
                              onClick={() => setSelectedStock(s)}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className={`p-4 rounded-2xl border cursor-pointer transition-all flex justify-between items-center ${
                                selectedStock?.ticker === s.ticker
                                  ? 'border-indigo-500 bg-indigo-50/60 shadow-sm shadow-indigo-100/30'
                                  : 'border-slate-100 hover:border-slate-200 bg-slate-50/30'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-2xl shadow-sm border border-slate-100">
                                  {s.logo || '⭐'}
                                </div>
                                <div>
                                  <h4 className="font-extrabold text-slate-800 text-base">{s.ticker}</h4>
                                  <p className="text-xs font-semibold text-slate-400">{locale === 'he' && s.heName ? s.heName : s.name}</p>
                                </div>
                              </div>

                              <div className="text-right">
                                <p className="font-extrabold text-slate-800">
                                  ₪{(s.priceUsd / (selectedProfile.currencyMode === 'PARITY' ? 1.0 : summary.fxRate)).toFixed(2)}
                                </p>
                                <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${isUp ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                                  {isUp ? '+' : ''}{s.changePercent.toFixed(2)}%
                                </span>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right Column: Stock Details & Trade Action */}
                    <div className="lg:col-span-2 space-y-6">
                      {selectedStock ? (
                        <div className="bg-white rounded-[32px] p-8 border border-slate-200/80 shadow-sm space-y-6">
                          
                          {/* Stock Quote Header */}
                          <div className="flex justify-between items-start border-b border-slate-100/80 pb-4">
                            <div className="flex items-center gap-4">
                              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-4xl shadow-sm border border-slate-200/60">
                                {selectedStock.logo || '⭐'}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="text-2xl font-extrabold text-slate-900">{locale === 'he' && selectedStock.heName ? selectedStock.heName : selectedStock.name}</h3>
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-extrabold text-xs rounded-full uppercase border border-slate-200/60">
                                    {selectedStock.ticker}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 font-semibold mt-1">{t('stocks.liveAppraisal')}</p>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-3xl font-extrabold text-slate-900">
                                ₪{(selectedStock.priceUsd / (selectedProfile.currencyMode === 'PARITY' ? 1.0 : summary.fxRate)).toFixed(2)}
                              </div>
                              <p className="text-xs text-slate-400 font-bold uppercase mt-1">(${selectedStock.priceUsd.toFixed(2)} USD)</p>
                            </div>
                          </div>

                          {/* AI TUTOR WIDGET BUTTON - Sleek Styling */}
                          <div className="bg-emerald-50/50 border border-emerald-100 rounded-[24px] p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden shadow-sm">
                            <div className="absolute top-0 right-0 p-3 bg-emerald-500/10 text-emerald-500 font-bold text-7xl select-none pointer-events-none opacity-40">
                              🧚‍♀️
                            </div>
                            <div className="z-10">
                              <h4 className="font-extrabold text-emerald-900 text-sm flex items-center gap-1.5">
                                <Sparkles className="w-5 h-5 text-emerald-500 animate-pulse" />
                                <span>{t('stocks.learnAbout')} {selectedStock.ticker} {t('stocks.withCoach')}</span>
                              </h4>
                              <p className="text-xs font-semibold text-emerald-700 mt-1 max-w-md leading-relaxed">
                                {t('stocks.coachDesc')}
                              </p>
                            </div>
                            <button
                              onClick={() => setShowAiModal(selectedStock.ticker)}
                              className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 z-10"
                            >
                              <Sparkles className="w-4 h-4" />
                              <span>{t('stocks.askCoach')}</span>
                            </button>
                          </div>

                          {/* Historical Stock Price Chart */}
                          <div className="space-y-3">
                            <h4 className="font-extrabold text-slate-700 text-xs uppercase tracking-wider">{t('stocks.dayValuationChart')}</h4>
                            <PerformanceChart
                              data={Array.from({ length: 30 }).map((_, idx) => {
                                const d = new Date();
                                d.setDate(d.getDate() - (29 - idx));
                                return {
                                  date: d.toISOString().split('T')[0],
                                  price: selectedStock.priceUsd * (1 + (Math.sin(idx / 3) * 0.08)),
                                };
                              })}
                              color="emerald"
                            />
                          </div>

                          {/* BUY & SELL TRADE CENTER */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100/80">
                            
                            {/* Buying Card */}
                            <div className="bg-slate-50/50 border border-slate-200/80 rounded-[24px] p-6 space-y-4 shadow-sm">
                              <h4 className="font-extrabold text-emerald-700 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                <Plus className="w-4.5 h-4.5" />
                                <span>{t('stocks.investBuy')}</span>
                              </h4>
                              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                                {t('stocks.investBuyHint')}
                              </p>

                              <div className="space-y-4">
                                <div className="relative">
                                  <span className="absolute left-3.5 top-3 font-extrabold text-slate-400 text-sm">₪/$$</span>
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
                                  onClick={() => setShowPinPad('trade_buy')}
                                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-50 active:scale-95 cursor-pointer transition-all uppercase tracking-wider"
                                >
                                  {t('stocks.confirmBuy')}
                                </button>
                              </div>
                            </div>

                            {/* Selling Card */}
                            <div className="bg-slate-50/50 border border-slate-200/80 rounded-[24px] p-6 space-y-4 shadow-sm">
                              <h4 className="font-extrabold text-rose-600 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                <Minus className="w-4.5 h-4.5" />
                                <span>{t('stocks.liquidateSell')}</span>
                              </h4>
                              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                                {t('stocks.liquidateSellHint')}
                              </p>

                              <div className="space-y-4">
                                <div className="flex gap-2">
                                  {[25, 50, 100].map((pct) => (
                                    <button
                                      key={pct}
                                      onClick={() => setSellPercentage(pct)}
                                      className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                        sellPercentage === pct
                                          ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-100'
                                          : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                                      }`}
                                    >
                                      {pct}% {pct === 100 ? t('stocks.all') : ''}
                                    </button>
                                  ))}
                                </div>

                                <button
                                  onClick={() => setShowPinPad('trade_sell')}
                                  className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-rose-50 active:scale-95 cursor-pointer transition-all uppercase tracking-wider"
                                >
                                  {t('stocks.confirmSell')}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* General Error/Success feedback area */}
                          <div className="h-6 mt-2">
                            <AnimatePresence>
                              {errorText && (
                                <motion.p
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="text-xs font-bold text-red-500 text-center"
                                >
                                  ⚠️ {errorText}
                                </motion.p>
                              )}
                              {successText && (
                                <motion.p
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="text-xs font-bold text-emerald-500 text-center"
                                >
                                  ✅ {successText}
                                </motion.p>
                              )}
                            </AnimatePresence>
                          </div>

                        </div>
                      ) : (
                        <div className="bg-white rounded-[32px] p-12 border border-slate-200/80 shadow-sm text-center">
                          <Coins className="w-16 h-16 text-slate-300 mx-auto mb-4 animate-pulse" />
                          <h3 className="text-xl font-extrabold text-slate-800">{t('stocks.selectInvestment')}</h3>
                          <p className="text-xs font-semibold text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                            {t('stocks.selectInvestmentHint')}
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* 3. SECURED DOUBLE ENTRY LEDGER TAB */}
                {activeTab === 'ledger' && (
                  <motion.div
                    key="tab-ledger"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    {/* Educational Double Entry explainer banner - Sleek Style */}
                    <div className="bg-indigo-600 text-white rounded-[32px] p-8 border border-indigo-500/25 shadow-xl relative overflow-hidden">
                      <div className="absolute top-2 right-4 text-white opacity-10 text-8xl font-black select-none pointer-events-none">
                        🎓
                      </div>
                      <h3 className="text-xl font-extrabold">{t('ledger.learnDoubleEntry')}</h3>
                      <p className="text-xs font-semibold text-indigo-100 max-w-2xl mt-1.5 leading-relaxed">
                        {t('ledger.doubleEntryDesc')}
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        <div className="bg-white/10 p-5 rounded-2xl border border-white/10 backdrop-blur-sm shadow-sm">
                          <span className="text-[9px] text-amber-200 font-bold uppercase bg-amber-500/30 px-2 py-0.5 rounded-md">{t('ledger.actionA')}</span>
                          <p className="text-xs font-semibold mt-2.5 text-indigo-50 leading-relaxed">
                            {t('ledger.actionADesc')}
                          </p>
                        </div>
                        <div className="bg-white/10 p-5 rounded-2xl border border-white/10 backdrop-blur-sm shadow-sm">
                          <span className="text-[9px] text-emerald-200 font-bold uppercase bg-emerald-500/30 px-2 py-0.5 rounded-md">{t('ledger.actionB')}</span>
                          <p className="text-xs font-semibold mt-2.5 text-indigo-50 leading-relaxed">
                            {t('ledger.actionBDesc')}
                          </p>
                        </div>
                        <div className="bg-white/10 p-5 rounded-2xl border border-white/10 backdrop-blur-sm shadow-sm">
                          <span className="text-[9px] text-rose-200 font-bold uppercase bg-rose-500/30 px-2 py-0.5 rounded-md">{t('ledger.actionC')}</span>
                          <p className="text-xs font-semibold mt-2.5 text-indigo-50 leading-relaxed">
                            {t('ledger.actionCDesc')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Ledger Event History List */}
                    <div className="bg-white rounded-[32px] p-8 border border-slate-200/80 shadow-sm">
                      <h3 className="text-xl font-extrabold text-slate-900 mb-6">{t('ledger.fireflyLedgerEvents')} ({history.length})</h3>
                      {history.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                          <History className="w-12 h-12 text-slate-300 mx-auto mb-2 animate-pulse" />
                          <p className="text-sm font-bold">No ledger events recorded on this system.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {history.map((tx) => {
                            const isBuy = tx.type === 'BUY';
                            return (
                              <div
                                key={tx.id}
                                className={`p-5 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all ${
                                  isBuy ? 'border-emerald-100 bg-emerald-50/15' : 'border-slate-100 bg-slate-50/40'
                                }`}
                              >
                                <div className="flex items-center gap-4">
                                  <span className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border shadow-sm ${
                                    isBuy ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'
                                  }`}>
                                    {isBuy ? 'BUY' : 'SELL'}
                                  </span>
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-extrabold text-slate-800 text-base">
                                        {isBuy ? t('ledger.bought') : t('ledger.sold')} {tx.shares.toFixed(4)} {t('ledger.shares')} {tx.ticker}
                                      </span>
                                      <span className={`text-[9px] font-bold uppercase px-2.5 py-1 rounded-full border ${
                                        isBuy ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                                      }`}>
                                        {isBuy ? t('ledger.directTransfer') : t('ledger.doubleEntryCleared')}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-500 font-semibold mt-1">
                                      {t('ledger.price')} ${tx.priceUsd.toFixed(2)} USD | {t('ledger.fxConversion')} {selectedProfile.currencyMode === 'PARITY' ? '₪1=1' : `₪1=$${tx.fxRate.toFixed(2)}`}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-bold mt-1.5 uppercase">
                                      {t('ledger.fireflyHash')} <span className="font-mono text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{tx.fireflyTransactionId}</span>
                                    </p>
                                  </div>
                                </div>

                                <div className="text-right">
                                  <div className={`text-lg font-extrabold ${isBuy ? 'text-slate-800' : 'text-emerald-700'}`}>
                                    {isBuy ? '-' : '+'}₪{tx.fiatAmount.toFixed(2)}
                                  </div>
                                  <p className="text-[10px] text-slate-400 font-bold mt-1">
                                    {new Date(tx.timestamp).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* 4. SETTINGS / PARENTS MODERATION TAB */}
                {activeTab === 'settings' && (
                  <motion.div
                    key="tab-settings"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                  >
                    {/* General Settings */}
                    <div className="bg-white rounded-[32px] p-8 border border-slate-200/80 shadow-sm space-y-6">
                      <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-1.5">
                        <Users className="w-5 h-5 text-indigo-500" />
                        <span>{t('settings.profileModeration')}</span>
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                        {t('settings.moderationDesc')}
                      </p>

                      <div className="space-y-4 pt-2 text-xs">
                        <div className="flex justify-between items-center bg-slate-50 border border-slate-200/40 p-4 rounded-2xl">
                          <div>
                            <span className="font-extrabold text-slate-800">{t('settings.ledgerCurrencyMode')}</span>
                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">{t('settings.currencyModeDesc')}</p>
                          </div>
                          <button
                            onClick={async () => {
                              const nextMode = selectedProfile.currencyMode === 'PARITY' ? 'REAL' : 'PARITY';
                              const res = await fetch(`/api/profiles/${selectedProfile.name}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ currencyMode: nextMode }),
                              });
                              const d = await res.json();
                              if (d.success) {
                                setSelectedProfile(d.profile);
                                fetchActiveProfileData(selectedProfile.name);
                              }
                            }}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-extrabold text-[11px] shadow-sm cursor-pointer transition-all uppercase tracking-wider"
                          >
                            {selectedProfile.currencyMode}
                          </button>
                        </div>

                        <div className="flex justify-between items-center bg-slate-50 border border-slate-200/40 p-4 rounded-2xl">
                          <div>
                            <span className="font-extrabold text-slate-800">{t('settings.executionModeSetting')}</span>
                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">{t('settings.executionModeDesc')}</p>
                          </div>
                          <button
                            onClick={async () => {
                              const nextMode = selectedProfile.executionMode === 'INSTANT' ? 'MARKET_BOUND' : 'INSTANT';
                              const res = await fetch(`/api/profiles/${selectedProfile.name}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ executionMode: nextMode }),
                              });
                              const d = await res.json();
                              if (d.success) {
                                setSelectedProfile(d.profile);
                                fetchActiveProfileData(selectedProfile.name);
                              }
                            }}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-extrabold text-[11px] shadow-sm cursor-pointer transition-all uppercase tracking-wider"
                          >
                            {selectedProfile.executionMode}
                          </button>
                        </div>

                        {/* Parent Deposit / Allowance Section */}
                        <form onSubmit={handleParentDeposit} className="bg-indigo-50/40 border border-indigo-100/50 p-4 rounded-2xl space-y-3">
                          <div>
                            <span className="font-extrabold text-indigo-950 text-xs flex items-center gap-1.5">
                              <Coins className="w-4.5 h-4.5 text-indigo-500" />
                              <span>{t('settings.parentDeposit')}</span>
                            </span>
                            <p className="text-[10px] text-indigo-600/80 font-bold mt-0.5">{t('settings.depositDesc')}</p>
                          </div>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-indigo-500">₪</span>
                              <input
                                type="number"
                                required
                                min={1}
                                step={0.5}
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 text-xs font-extrabold bg-white border border-indigo-200 rounded-xl outline-none focus:border-indigo-500 transition-all text-slate-800"
                              />
                            </div>
                            <button
                              type="submit"
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[10px] shadow-md hover:shadow-indigo-100 transition-all uppercase tracking-wider cursor-pointer"
                            >
                              {t('settings.depositButton')}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>

                    {/* Dangerous Parent Actions */}
                    <div className="bg-white rounded-[32px] p-8 border border-slate-200/80 shadow-sm space-y-6">
                      <h3 className="text-xl font-extrabold text-rose-600 flex items-center gap-1.5">
                        <ShieldAlert className="w-5 h-5" />
                        <span>{t('settings.securityReset')}</span>
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                        {t('settings.securityDesc')}
                      </p>

                      <div className="pt-4 space-y-4">
                        <button
                          onClick={() => {
                            const newPin = prompt('Enter a new 4-digit security PIN:');
                            if (!newPin || newPin.length !== 4 || isNaN(Number(newPin))) {
                              alert('Invalid PIN! Pin must be exactly 4 digits.');
                              return;
                            }
                            fetch(`/api/profiles/${selectedProfile.name}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ pin: newPin }),
                            }).then(() => alert('Security PIN changed successfully!'));
                          }}
                          className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
                        >
                          {t('settings.changePin')}
                        </button>

                        <button
                          onClick={() => handleDeleteProfile(selectedProfile.name)}
                          className="w-full py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl border border-rose-200 shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wider"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>{t('settings.deleteProfile')}</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>

            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Floating PIN Keypad security lock Overlay */}
      <AnimatePresence>
        {showPinPad && (
          <PinPad
            title={
              showPinPad === 'login'
                ? `${t('pinPad.loginTitle')} ${targetProfileToLogin?.name || 'Vault'}`
                : showPinPad === 'trade_buy'
                ? t('pinPad.buyTitle')
                : t('pinPad.sellTitle')
            }
            subtitle={
              showPinPad === 'login'
                ? t('pinPad.enterPin')
                : `${t('pinPad.authorizing')} ${selectedStock?.ticker}`
            }
            onVerify={handlePinPadVerify}
            onCancel={() => {
              setShowPinPad(null);
              setTargetProfileToLogin(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Floating AI Coach Modal */}
      <AnimatePresence>
        {showAiModal && selectedStock && selectedProfile && (
          <AiCoachModal
            ticker={showAiModal}
            stockName={selectedStock.name}
            profileName={selectedProfile.name}
            onClose={() => setShowAiModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
