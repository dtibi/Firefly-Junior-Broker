# 🔥 Firefly Junior Broker

A gamified multi-profile brokerage sandbox that lets kids learn investing by trading **real stocks** with simulated money, backed by a **Firefly III double-entry ledger**. Built for Hebrew-speaking families, with full i18n support.

Parents control the allowance, Firefly III tracks every shekel, and Alpaca provides live market prices — all wrapped in a kid-friendly interface with an AI coach that explains stocks using playground analogies.

## Features

- **Multi-profile** — each kid gets their own broker account with avatar, PIN, and Firefly III savings/investment accounts
- **Real market data** — live stock prices from Alpaca Markets + daily OHLCV from Yahoo Finance (free tier)
- **AI Coach** — Gemini-powered tutorials that explain stocks in age-appropriate language (Hebrew or English)
- **Double-entry accounting** — trades execute real Firefly III transfers using the "Bank of Dad" clearance pattern
- **Live balance sync** — portfolio cash balance reads directly from Firefly III, not a local cache
- **i18n / RTL** — full Hebrew translation, automatic language detection, RTL layout support
- **SPY index fund** — S&P 500 ETF alongside 8 kid-friendly individual stocks
- **Performance charts** — hand-rolled SVG charts showing portfolio value vs cumulative deposits
- **PIN security** — 4-digit PINs hashed with SHA-256, required for login and every trade

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS 4, motion (Framer Motion) |
| Backend | Express 4, tsx (dev), esbuild (prod) |
| Build | Vite 6 (client), esbuild (server bundle) |
| Market Data | Alpaca Markets API + Yahoo Finance |
| AI | Google Gemini (gemini-3.5-flash) |
| Ledger | Firefly III REST API |
| FX Rates | open.er-api.com (ILS→USD, 1-hour cache) |
| Database | File-based JSON (`data/db.json`) |

## Prerequisites

- **Node.js** 18+
- **Firefly III** — a running instance (self-hosted or cloud). You'll create asset accounts for each child.
- **Alpaca Markets** account — free tier (paper trading) works. The app uses the market data API at `data.alpaca.markets`.
- **Google Gemini** API key — for the AI Coach feature.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/dtibi/Firefly-Junior-Broker.git
cd Firefly-Junior-Broker
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys and Firefly III details (see below)

# 3. Run
npm run dev
# → http://localhost:3000
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Firefly III — your self-hosted instance
FIREFLY_INSTANCE_URL="http://localhost"          # or https://firefly.your-domain.com
FIREFLY_PERSONAL_ACCESS_TOKEN="ey..."            # from Firefly III profile → OAuth

# Bank of Dad — the parent's asset account ID in Firefly III
# This account funds allowances and absorbs losses
BANK_OF_DAD_ACCOUNT_ID="25"

# Alpaca Markets — for live stock prices (paper trading keys work)
ALPACA_API_KEY_ID="PK..."
ALPACA_API_SECRET_KEY="..."

# Google Gemini — for the AI Coach
GEMINI_API_KEY="..."

# Optional
APP_URL="http://localhost:3000"
```

## Firefly III Setup

Each child needs two asset accounts in Firefly III:

| Account | Type | Role | Example Name |
|---|---|---|---|
| Savings | Asset | `savingAsset` | "Natanel Savings" |
| Investment | Asset | `savingAsset` | "Natanel Investments" |

Plus one parent clearinghouse account:
| Account | Type | Role | Name |
|---|---|---|---|
| Bank of Dad | Asset | `defaultAsset` | "Bank of Dad: Portfolio Clearing" |

When creating a profile in the app, enter the Firefly III account IDs for that child's Savings and Investment accounts.

### How the ledger works

**BUY trade:** savings → investment (transfer)
**SELL trade (profit):** investment → savings (principal return) + Bank of Dad → savings (profit reward)
**SELL trade (loss):** investment → savings (current value only) + investment → Bank of Dad (loss adjustment)
**Deposit:** Bank of Dad → savings (weekly allowance)

This teaches kids that money never vanishes — it always moves between accounts in a structured double loop.

## Project Structure

```
├── server.ts              # Express server, all API routes
├── src/
│   ├── main.tsx           # React entry point
│   ├── App.tsx            # Main UI component
│   ├── types.ts           # Shared TypeScript types
│   ├── index.css          # Tailwind + RTL styles
│   ├── components/
│   │   ├── PinPad.tsx     # 4-digit PIN entry modal
│   │   ├── AiCoachModal.tsx  # Gemini AI stock tutorial
│   │   └── PerformanceChart.tsx  # SVG portfolio chart
│   ├── i18n/
│   │   ├── LocaleContext.tsx   # React context provider
│   │   ├── translations.ts    # EN + HE dictionary
│   │   └── useTranslation.ts  # Hook
│   └── server/
│       ├── db.ts          # JSON database
│       ├── alpaca.ts      # Market data service
│       ├── firefly.ts     # Firefly III integration
│       └── ai.ts          # Gemini AI service
├── data/
│   └── db.json            # Runtime database (auto-created, gitignored)
└── CLAUDE.md              # Developer reference
```

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server on :3000
npm run build        # Production build
npm run start        # Run production build
npm run lint         # Type-check (tsc --noEmit)
npm run clean        # Remove dist/ and data/
```

## Stocks Available

| Ticker | Company | Hebrew |
|---|---|---|
| SPY | S&P 500 Index | מדד S&P 500 |
| RBLX | Roblox | רובלוקס |
| DIS | Disney | דיסני |
| AAPL | Apple | אפל |
| TSLA | Tesla | טסלה |
| MSFT | Microsoft | מיקרוסופט |
| NTDOY | Nintendo | נינטנדו |
| GOOGL | Google & YouTube | גוגל ויוטיוב |
| NVDA | NVIDIA | אנווידיה |

## Language Support

The app auto-detects Hebrew from browser settings. Click the **HE/EN** button in the nav bar to switch. Hebrew mode enables:
- RTL layout
- Translated UI, trade messages, AI coach, and chart labels
- Hebrew company names in the stock directory

## License

Apache-2.0
