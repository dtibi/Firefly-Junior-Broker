# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Firefly Junior Broker is a gamified, full-stack multi-profile brokerage sandbox for kids. It lets children learn investing by trading real stocks with simulated money backed by a Firefly III double-entry ledger. The app was scaffolded from Google AI Studio.

**Tech stack:** React 19, TypeScript, Vite 6, Express 4, Tailwind CSS 4, motion (Framer Motion fork), esbuild (production bundling), tsx (dev server).

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server (tsx server.ts) on port 3000
npm run build            # Production build: vite build + esbuild bundle server to dist/server.cjs
npm run start            # Run production server (node dist/server.cjs)
npm run lint             # Type-check only (tsc --noEmit)
npm run clean            # Remove dist/ and data/ directories
```

## Architecture

### Server entry (`server.ts`)
Express server on port 3000. In dev, it mounts Vite as middleware for HMR; in production, it serves static files from `dist/`. All API routes are defined inline (no router modules).

**API routes:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/profiles` | List all child profiles |
| POST | `/api/profiles` | Create a new child profile |
| POST | `/api/profiles/login` | Verify PIN and log in |
| PUT | `/api/profiles/:name` | Update profile settings |
| DELETE | `/api/profiles/:name` | Delete profile + all related data |
| GET | `/api/portfolio/:name` | Full portfolio: holdings, cash, history, snapshots |
| GET | `/api/stocks` | All stock quotes (from Alpaca or simulator) |
| GET | `/api/stocks/:ticker/history` | Historical pricing for a stock |
| GET | `/api/stocks/:ticker/ai-guide` | Age-aware AI coach explanation |
| POST | `/api/trade` | Execute BUY/SELL (PIN-authenticated) |
| POST | `/api/profiles/:name/deposit` | Parent allowance deposit |
| POST | `/api/cron/snapshots` | Force daily valuation snapshot |

### Backend services (`src/server/`)

- **`db.ts`** — File-based JSON database (`data/db.json`). Stores profiles, holdings, transactions, cash balances, portfolio snapshots, and FX rate cache. SHA-256 hashes PINs. Self-initializes with two demo profiles (Leo, PARITY mode; Mia, REAL mode) and sample holdings/transactions/snapshots. Includes migration logic for adding new fields to existing DB files.

- **`alpaca.ts`** (`MarketService`) — Stock market data. Defines 8 kid-friendly stocks (RBLX, DIS, AAPL, TSLA, MSFT, NTDOY, GOOGL, NVDA) with child-friendly descriptions. When real Alpaca API keys are configured, fetches live quotes from `data.alpaca.markets`; otherwise uses a deterministic seed-based simulator keyed on ticker+date for stable pseudo-random pricing. Fetches ILS→USD FX rates from `open.er-api.com` with 1-hour caching.

- **`firefly.ts`** (`LedgerService`) — Firefly III double-entry accounting integration. `createTransfer()` posts transactions to Firefly III API (falls back to mock IDs). `executeLiquidationDoubleEntry()` implements the "Bank of Dad" clearance pattern: returns principal from investment→savings, routes profit from Dad→savings, or routes loss from investment→Dad.

- **`ai.ts`** (`AIService`) — Gemini-powered age-aware stock tutorials. Calls `gemini-3.5-flash` with a system prompt tailored to the child's age. Falls back to pre-packaged tutorials for RBLX, DIS, AAPL at age brackets 8 and 13, then to a generic template.

### Frontend (`src/`)

- **`main.tsx`** — React 19 StrictMode entry point.
- **`types.ts`** — Shared TypeScript types used by both server and client (Profile, Holding, Transaction, PortfolioSnapshot, StockQuote, TradeRequest, etc.).
- **`index.css`** — Imports Inter + JetBrains Mono fonts and Tailwind CSS 4 with theme configuration.
- **`App.tsx`** — Monolithic main component (~1400 lines) handling all UI state:
  - **Profile Selection view:** Grid of kid profiles with avatars, age, currency mode badges. "New Broker" card opens an inline creation form.
  - **Dashboard (Vault) tab:** Wealth summary card, linked Firefly account display, PerformanceChart of portfolio value vs cumulative deposits, active holdings table with gain/loss.
  - **Invest Market tab:** Stock directory sidebar + detail pane with live price, AI Coach button, buy/sell trade panels with preset amounts and PIN confirmation.
  - **Ledger History tab:** Educational double-entry explainer banner + chronological transaction list with Firefly III transaction IDs.
  - **Settings tab:** Currency mode toggle, execution mode toggle, parent deposit form, PIN change, profile deletion.
  - **15-minute inactivity auto-logout** via `mousemove`/`keypress`/`click`/`touchstart` listeners.

- **`components/PinPad.tsx`** — Modal overlay with 4-digit PIN entry grid. Auto-submits on 4th digit. Accepts an async `onVerify` callback. Shows error state and retry.
- **`components/AiCoachModal.tsx`** — Modal that fetches AI-generated stock tutorial from `/api/stocks/:ticker/ai-guide`, displays it with paragraph splitting, and offers "Read Aloud" via Web Speech API.
- **`components/PerformanceChart.tsx`** — Hand-rolled SVG line chart (no charting library). Supports dual-line mode (portfolio value + cumulative deposits baseline) for portfolio views, and single-line mode for stock price views. Interactive hover tooltips. Color-themed via prop (`emerald`/`indigo`/`amber`).

### Key domain concepts

- **Currency modes:** `PARITY` (₪1 = $1, for young kids) vs `REAL` (live ILS→USD FX conversion via `open.er-api.com`).
- **Execution modes:** `INSTANT` (trades execute immediately) vs `MARKET_BOUND` (reserved for future market-hours gating).
- **Double-entry liquidation:** When a child sells stock, three things happen: (A) principal returns investment→savings, (B) if profit, Dad→savings, (C) if loss, investment→Dad. This teaches real accounting.
- **PIN security:** 4-digit PINs hashed with SHA-256. Required for login and every trade. No session tokens — PIN is sent with each trade request.

### Configuration

Environment variables (see `.env.example`):
- `GEMINI_API_KEY` — Google Gemini API key for AI coach
- `FIREFLY_INSTANCE_URL` + `FIREFLY_PERSONAL_ACCESS_TOKEN` — Firefly III self-hosted instance
- `BANK_OF_DAD_ACCOUNT_ID` — Firefly asset account ID for the parent allowance pool
- `ALPACA_API_KEY_ID` + `ALPACA_API_SECRET_KEY` — Alpaca Markets API for live stock quotes
- `APP_URL` — Deployment URL (injected by AI Studio)
- `DISABLE_HMR` — Set by AI Studio to disable Vite HMR/file watching

The DB file at `data/db.json` is gitignored. It auto-initializes on first run with demo data.
