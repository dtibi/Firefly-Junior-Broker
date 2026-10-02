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
npm test                 # Unit tests (node:test via tsx) — no server/network needed
npm run verify:guardrails # Live guardrail checks against a running server
npm run clean            # Remove dist/ and data/ directories
```

### Testing

Money math lives in **pure, I/O-free modules** so it can be tested without Firefly III, the
network or a running server. Change a rule → change/extend the test in the same commit.

| Module | Tests | What must never regress |
|--------|-------|-------------------------|
| `src/server/ledger-rules.ts` | `test/ledger-rules.test.ts`, `test/statement-rules.test.ts` | Allowances are never reported as profit; opening balances counted once; Bank-of-Dad flows are the P&L, not deposits; `profit = invested wealth − baseline = realized + unrealized`; `cumulativeThrough()` boundaries; the statement classifies every split once, in Hebrew, and its running balance lands on the live Firefly balance |
| `src/server/lots.ts` | `test/lots.test.ts` | One purchase = one lot, never merged; a lot's funding source binds it for life (pocket-funded → pocket, fund-funded → fund); whole-lot sales priced with each lot's own principal; gain/loss/break-even legs per lot; dust and empty selections rejected |
| `src/server/rules.ts` | `test/trade-rules.test.ts` | Minimum order ₪10, 0.01-share slice floor, `validateBuyFunds` never lets a purchase exceed the chosen account (nothing is moved between accounts to cover it) |
| `src/server/migrate.ts` | `test/migrations.test.ts` | Old `data/db.json` shapes keep working; migrations are idempotent and never overwrite existing values; the `lots` array is added but never seeded by the migrator |
| `src/server/alpaca.ts` | `test/stock-catalog.test.ts` | All 44 tickers have a Hebrew name + description and a valid category; Alpaca/Yahoo payload parsing; simulator determinism |

Two rules for the live checker `scripts/verify-guardrails.ts`:

1. **Never send a request to `/api/trade` without a pre-flight proof.** The script pushes each candidate request through the same rules the server uses, with the same live price, and refuses to send it unless those rules say it cannot execute. Reason: a ₪10 SPY order looked obviously invalid but is a legal 0.0131-share trade — it executed for real and had to be rolled back (Firefly journal + `data/db.json` holding/transaction/cash).
2. The PIN is matched in memory from the stored hash inside the script and never printed.

**tsconfig gotcha:** the project does **not** enable `strict`/`strictNullChecks`, so TypeScript cannot narrow discriminated unions (`if (!result.ok)` does not narrow). `RuleResult<T>` in `rules.ts` therefore uses optional `value`/`error` fields and callers must check `ok` first.

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
| POST | `/api/trade` | Execute BUY (with `fundingSource: 'POCKET' \| 'FUND'`) / SELL (with `lotIds: []`, PIN-authenticated) |
| GET | `/api/ledger/:name/statement` | The bank statement: every movement of the two accounts in Hebrew, with a running balance, a monthly summary and a reconciliation flag |
| POST | `/api/cron/snapshots` | Force daily valuation snapshot |
| POST | `/api/admin/recalc-snapshots` | Rebuild the chart baseline of historical snapshots from Firefly III |

### Backend services (`src/server/`)

- **`db.ts`** — File-based JSON database (`data/db.json`). Stores profiles (including `spendingAccountId` and `transfersEnabled`), holdings, transactions, pocket-money `transfers` (with lock windows), cash balances, portfolio snapshots, and FX rate cache. SHA-256 hashes PINs. Self-initializes with two demo profiles (Leo, PARITY mode; Mia, REAL mode) and sample holdings/transactions/snapshots. Delegates the upgrade of legacy file shapes to `migrate.ts`.

- **`migrate.ts`** — Pure `migrateSchema(parsed)` → `{ schema, modified }`. Adds missing profile fields (`cumulativeDeposits`, `spendingAccountId`, `transfersEnabled`), the `transfers` store and the snapshot baseline fields. Idempotent, never overwrites values that exist, and unit-tested with fixtures instead of the live file.

- **`ledger-rules.ts`** — Pure ledger classification (`classifyKidLedger`, `cumulativeThrough`, `investedProfit`), no network/DB. `firefly.ts` feeds it Firefly journals and gets back the two baselines, the realized P&L and the dated flow lists. This is the single place where the accounting rules live, so they can be unit-tested.

- **`rules.ts`** — Pure trade rules and the guardrail constants: `MIN_ORDER_LOCAL`, `MIN_SHARE_FRACTION`; `planBuy()` (funding-source aware, no merging), `validateBuyFunds()`, `summarizePockets()`, `localDateString()`. `server.ts` calls these instead of doing arithmetic inline.

- **`lots.ts`** — Pure lot ("מגרש") rules: `newLot()`, `planLotSale()`, `planLotSales()`, `closeLot()`, `aggregateLots()`, `openLots()`, `summarizeLots()`. One purchase = one lot, never merged; whole-lot sales are priced with each lot's own principal; a lot's `fundingSource` decides where the sale's money returns. The aggregate `Holding` row the dashboard shows is derived from the open lots.

- **`scripts/seed-legacy-lots.py`** — The audited one-off that turned the five surviving weighted-average positions into lots (₪181.00 = Firefly account 26). Refuses to run while the container is up or when the numbers do not reconcile; supports `--apply` (default is a dry run).

- **`alpaca.ts`** (`MarketService`) — Stock market data for a 44-ticker kid-friendly catalogue (39 companies + 5 baskets) defined in `KIDS_STOCKS`, grouped into 9 categories (`STOCK_CATEGORIES`) and documented with Hebrew descriptions (`heDescription`) + playground analogies (`childAnalogy`). Quotes come from **one batched Alpaca call** for the whole catalogue (`/v2/stocks/snapshots?symbols=...`), cached in memory for 5 minutes; tickers Alpaca cannot serve (OTC, e.g. NTDOY) fall back to Yahoo Finance, and a deterministic seed-based simulator keyed on ticker+date is the last resort. `getStockHistory()` returns real daily closes from Yahoo with a simulator curve as fallback. Fetches ILS→USD FX rates from `open.er-api.com` with 1-hour caching. (Alpha Vantage was removed from the code path — it was limited to 25 requests/day and practically never reached.)

- **`firefly.ts`** (`LedgerService`) — Firefly III double-entry accounting integration. `createTransfer()` posts transactions to Firefly III API (falls back to mock IDs). `postLotSale()` posts the legs of ONE sold lot: the principal returns to the account that lot came from (pocket-funded → pocket, fund-funded → fund), a gain comes from the Bank of Dad, a loss goes to it, and a break-even sale posts no adjustment leg. `getFinancialBreakdown(profile)` reads the three pockets (spending/savings/investment) and computes the **net money that came in from outside** — the performance chart's baseline — plus the realized trading P&L routed through the Bank of Dad. Rule: every flow crossing the boundary of the kid's own accounts counts as an external deposit/spending event, EXCEPT flows with the Bank of Dad account (those ARE the profit/loss) and Firefly's synthetic "opening balance" transactions (added explicitly). Results are cached for 10 minutes; call `invalidateBreakdown()` after any ledger change. `getInvestedBaselineAsOf(profile, date)` powers the historical snapshot rebuild. `listAccounts()` + `getAccountJournals()` feed the statement endpoint.

- **`ai.ts`** (`AIService`) — Gemini-powered age-aware stock tutorials. Calls `gemini-3.5-flash` with a system prompt tailored to the child's age. Falls back to pre-packaged tutorials for RBLX, DIS, AAPL at age brackets 8 and 13, then to a generic template.

### Frontend (`src/`)

- **`main.tsx`** — React 19 StrictMode entry point.
- **`types.ts`** — Shared TypeScript types used by both server and client (Profile, Holding, Transaction, PortfolioSnapshot, StockQuote, TradeRequest, etc.).
- **`index.css`** — Imports Inter + JetBrains Mono fonts and Tailwind CSS 4 with theme configuration.
- **`App.tsx`** — Monolithic main component (~1400 lines) handling all UI state:
  - **Profile Selection view:** Grid of kid profiles with avatars, age, currency mode badges. "New Broker" card opens an inline creation form.
  - **Dashboard (Vault) tab:** wealth summary card with the two accounts (🍬 pocket / 📈 investing = cash + stocks) plus "money in from outside" vs "real profit"; a pockets card listing both account balances and the open-lot count (no transfer button exists any more); linked Firefly account display; PerformanceChart of invested wealth vs money-in-from-outside; active holdings table with gain/loss.
  - **Invest Market tab:** stock directory sidebar with category chips + free-text search (44 tickers) + detail pane with live price, a "What is this company?" explanation box (Hebrew description + playground analogy), AI Coach button, real 30-day price chart, a **buy panel that asks which account pays** (🍬 pocket / 📈 invest fund) and a **sell panel that lists the lots he owns** (checkbox per lot with its own P/L, a "select all" toggle and a running total) with PIN confirmation.
  - **My Account tab ("החשבון שלי"):** the bank statement — the two accounts (pocket + investing) with their balances, every movement in Hebrew with a running balance, a monthly in/out summary, a 3-months/all toggle, a reconciliation warning when the statement does not land on the live Firefly balance, and the lots list (open lots with live P/L, closed lots with their realized result).
  - **Ledger History tab:** Educational double-entry explainer banner + chronological trade list with Firefly III transaction IDs.
  - **Settings tab:** Currency mode toggle, execution mode toggle, parent deposit form, PIN change, profile deletion.
  - **15-minute inactivity auto-logout** via `mousemove`/`keypress`/`click`/`touchstart` listeners.

- **`components/PinPad.tsx`** — Modal overlay with 4-digit PIN entry grid. Auto-submits on 4th digit. Accepts an async `onVerify` callback. Shows error state and retry.
- **`components/AiCoachModal.tsx`** — Modal that fetches AI-generated stock tutorial from `/api/stocks/:ticker/ai-guide`, displays it with paragraph splitting, and offers "Read Aloud" via Web Speech API.
- **`components/PerformanceChart.tsx`** — Hand-rolled SVG line chart (no charting library). Supports dual-line mode (portfolio value + cumulative deposits baseline) for portfolio views, and single-line mode for stock price views. Interactive hover tooltips. Color-themed via prop (`emerald`/`indigo`/`amber`).

### Key domain concepts

- **Currency modes:** `PARITY` (₪1 = $1, for young kids) vs `REAL` (live ILS→USD FX conversion via `open.er-api.com`).
- **Execution modes:** `INSTANT` (trades execute immediately) vs `MARKET_BOUND` (reserved for future market-hours gating).
- **Double-entry liquidation:** When a child sells stock, three things happen: (A) principal returns investment→savings, (B) if profit, Dad→savings, (C) if loss, investment→Dad. This teaches real accounting.
- **Two accounts, no transfers:** the kid sees 🍬 his pocket account and 📈 his investing account (its liquid balance = the fund's cash + the stocks at their live value). There is **no way to move money between them** — not from the UI, not from the API. Money enters the investing account by buying stock (paid from the pocket or from the fund's cash) and leaves it by selling a lot.
- **Lots ("מגרשים"):** every purchase is its own lot, never merged, and the lot's funding source binds its money for life: a pocket-funded lot returns principal **and** profit to the pocket when sold, a fund-funded lot returns them to the fund. Investment money can never become pocket money.
- **Three-legged liquidation per lot:** on a sale the principal (or the current value, on a loss) leaves the investments account back to where the lot came from, the gain comes from the Bank of Dad, and the loss goes to it; a break-even sale posts no adjustment.
- **Honest baseline:** the chart's "money in from outside" line is computed live from the Firefly journal (allowance, work income, spending out — Bank-of-Dad flows excluded as they *are* the P&L). `invested profit = invested wealth − baseline = realized (from Bank of Dad) + unrealized market gains`, verified to the agora. Allowances can never look like investment returns.
- **Statement reconciliation:** `GET /api/ledger/:name/statement` rebuilds both accounts from the journal and must end on the live Firefly balance; when it does not, the page shows a warning instead of numbers. Every claim in the statement is traceable to a journal id.
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
