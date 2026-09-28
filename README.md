# 🔥 Firefly Junior Broker

A gamified multi-profile brokerage sandbox that lets kids learn investing by trading **real stocks** with simulated money, backed by a **Firefly III double-entry ledger**. Built for Hebrew-speaking families, with full i18n support.

Parents control the allowance, Firefly III tracks every shekel, and Alpaca provides live market prices — all wrapped in a kid-friendly interface with an AI coach that explains stocks using playground analogies.

## Features

- **Multi-profile** — each kid gets their own broker account with avatar, PIN, and Firefly III spending/savings/investment accounts
- **Real market data** — live stock prices from Alpaca Markets, fetched in ONE batched call for the whole catalogue (5-minute cache) + Yahoo Finance for tickers Alpaca doesn't cover (OTC, e.g. NTDOY)
- **44-ticker directory** — 39 kid-friendly companies + 5 baskets (index/tech/dividend/gold/real-estate ETFs), grouped into 9 categories with search; every stock has a Hebrew explanation and a playground analogy
- **AI Coach** — Gemini-powered tutorials that explain stocks in age-appropriate language (Hebrew or English)
- **Double-entry accounting** — trades execute real Firefly III transfers using the "Bank of Dad" clearance pattern
- **Honest numbers** — the performance chart's baseline is the money that really came in from outside (allowance, work income, pocket-money transfers), computed live from Firefly III. Allowances never show up as investment profit
- **Three pockets per kid** — 🍬 pocket money (spending) / 🏦 invest fund / 📈 invested stocks, with a real profit figure
- **Pocket-money → invest-fund transfer** — with a "promise" lock window (1 month / 3 months / 1 year) and a one-way valve: money leaves the invest fund only by selling stock, and only a grown-up can move it back to the pocket
- **Live balance sync** — all pocket balances read directly from Firefly III, not a local cache
- **i18n / RTL** — full Hebrew translation, automatic language detection, RTL layout support
- **Performance charts** — hand-rolled SVG charts: portfolio value vs money-in-from-outside, plus real 30-day price history per stock
- **PIN security** — 4-digit PINs hashed with SHA-256, required for login, every trade, and every transfer

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

Each child needs three asset accounts in Firefly III:

| Account | Type | Role | Example Name |
|---|---|---|---|
| Spending | Asset | `defaultAsset` | "Natanel" (pocket money) |
| Savings | Asset | `savingAsset` | "Natanel Savings" (the invest fund) |
| Investment | Asset | `savingAsset` | "Natanel Investments" (vested principal) |

Plus one parent clearinghouse account:
| Account | Type | Role | Name |
|---|---|---|---|
| Bank of Dad | Asset | `defaultAsset` | "Bank of Dad: Portfolio Clearing" |

When creating a profile in the app, enter the Firefly III account IDs for that child's spending, savings and investment accounts.

### How the ledger works

**BUY trade:** savings → investment (transfer)
**SELL trade (profit):** investment → savings (principal return) + Bank of Dad → savings (profit reward)
**SELL trade (loss):** investment → savings (current value only) + investment → Bank of Dad (loss adjustment)
**Allowance / work income:** revenue account → savings and/or spending (a Firefly *deposit*)
**Pocket money → invest fund:** spending → savings, logged with a promise/lock window

This teaches kids that money never vanishes — it always moves between accounts in a structured double loop.

### How the numbers add up (the chart baseline)

The performance chart draws two lines: the invested wealth (invest fund + stock market value)
and the money that came in from outside. The baseline is **not** a stored number — it is
recomputed from the Firefly III journal every time:

```
baseline = opening balances
         + every flow INTO the kid's accounts from outside (allowance, work income, gifts,
           pocket-money transfers into the invest fund)
         − every flow OUT (spending, transfers to accounts outside the kid's set)
         [flows with the Bank of Dad account are EXCLUDED — they ARE the trading profit/loss]
```

So `invested profit = invested wealth − baseline`, which equals
`realized profit (routed through Bank of Dad) + unrealized market gains` — verified against the
ledger to the agora. Allowances can never be mistaken for investment returns.

`POST /api/admin/recalc-snapshots` rebuilds the baseline of all historical snapshots from the
real deposit history (safe to re-run after changing account structure).

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

44 tickers: 39 companies + 5 baskets, in 9 categories. Every stock carries a Hebrew
explanation plus a playground analogy, shown in the app's *"What is this company?"* box.

### 🧺 Baskets — סלים

| Ticker | Company | Hebrew | What it is |
|---|---|---|---|
| SPY | S&P 500 Index | מדד S&P 500 | סל שמחזיק את 500 החברות הגדולות באמריקה — קונים חתיכה קטנה מכולן בבת אחת. |
| QQQ | Nasdaq-100 Tech Basket | סל 100 הטכנולוגיות | סל אחד שקונה את 100 חברות הטכנולוגיה הגדולות (אפל, אנבידיה, מיקרוסופט...). |
| VT | Whole World Basket | סל כל העולם | סל אחד שמחזיק אלפי חברות מכל העולם: אמריקה, אירופה, יפן וסין. |
| SCHD | Dividend Companies Basket | סל שמחלק כסף | סל של חברות שכל רבעון מחלקות לבעלים חלק מהרווח (דיבידנד) — כמו דמי כיס מהחברות. |
| GLD | Gold Basket | סל הזהב | קונים חתיכת זהב אמיתי — בלי כספת ובלי שודדים. |
| VNQ | Real Estate Basket | סל הבתים | סל של חברות שמחזיקות בניינים ומשכירות אותם; הכסף מהשכירות מגיע לבעלים. |

### 📱 Tech & Internet — טכנולוגיה ואינטרנט

| Ticker | Company | Hebrew | What it is |
|---|---|---|---|
| GOOGL | Google & YouTube | גוגל ויוטיוב | גוגל מריצה את תיבת החיפוש שיודעת הכל, ואת יוטיוב שבו צופים ביוצרים האהובים. |
| MSFT | Microsoft | מיקרוסופט | מיקרוסופט מייצרת מחשבי Windows, קונסולת Xbox, וגם הבעלים של Minecraft. |
| AAPL | Apple | אפל | אפל ממציאה אייפונים, אייפדים, שעוני אפל ומחשבי מק. |
| AMZN | Amazon | אמזון | החנות הגדולה באינטרנט: מזמינים חבילות והן מגיעות עד הבית. גם שירותי מחשב בענן שמרוויחים המון. |
| META | Meta | מטא | החברה של פייסבוק, אינסטגרם ווואטסאפ, וגם משקפי המציאות המדומה Quest. |
| NFLX | Netflix | נטפליקס | ספריית הסרטים והסדרות הגדולה בעולם — מנוי חודשי וצופים מה שרוצים. |
| SPOT | Spotify | ספוטיפיי | האפליקציה שמשמיעה מוזיקה לכל העולם, ומשלמת לאמנים לפי כמה שמאזינים להם. |
| UBER | Uber | אובר | מזמינים נסיעה או אוכל באפליקציה — בלי מוניות ובלי טלפונים. |
| ABNB | Airbnb | איירבי-אנד-בי | אנשים משכירים את הבית או החדר שלהם לתיירים דרך האפליקציה. |
| DASH | DoorDash | דורדאש | שליחים שמביאים אוכל מהמסעדה עד הבית; החברה לוקחת חלק מכל הזמנה. |

### 💻 Chips — שבבים ומחשבים

| Ticker | Company | Hebrew | What it is |
|---|---|---|---|
| NVDA | NVIDIA | אנווידיה | אנווידיה בונה שבבים חזקים (GPU) שמציירים משחקי תלת-ממד ומפעילים בינה מלאכותית. |
| INTC | Intel | אינטל | אינטל מייצרת את שבבי המוח הקטנים (מעבדים) שבתוך כמעט כל מחשב ונייד. |
| AMD | AMD | AMD | AMD מייצרת מעבדים ושבבים גרפיים חזקים למחשבים ולמשחקים — המתחרה של אנבידיה ואינטל. |
| TSM | TSMC | TSMC | בית החרושת הגדול בעולם שמייצר שבבים בשביל אפל ואנבידיה — כולם צריכים אותה. |
| QCOM | Qualcomm | קוואלקום | קוואלקום מייצרת שבבי רדיו ומעבדים לטלפונים ולטאבלטים — בלעדיהם אין קליטה ואין אינטרנט. |
| ASML | ASML | ASML | ASML בונה מכונות ענק שמכינות שבבים בדיוק מטורף — המדויקות בעולם. |

### 🎮 Gaming & Fun — גיימינג ובידור

| Ticker | Company | Hebrew | What it is |
|---|---|---|---|
| RBLX | Roblox | רובלוקס | רובלוקס הוא עולם ענק באינטרנט שבו בונים משחקים משלך ומשחקים עם חברים. |
| NTDOY | Nintendo | נינטנדו | הבית של מריו, לואיג'י, פיקאצ'ו והקונסולה Nintendo Switch. |
| SONY | Sony | סוני | הבית של PlayStation, של סרטי ספיידרמן ושל אוזניות. ענקית בידור מיפן. |
| EA | Electronic Arts | אלקטרוניק ארטס | מפתחת משחקי ספורט וכדורגל שמיליונים משחקים בהם. |
| DIS | Disney | דיסני | דיסני עושה קסמים עם מיקי מאוס, מלחמת הכוכבים, גיבורי מארוול ופארקי שעשועים ענקיים. |

### 🍔 Food & Restaurants — אוכל ומסעדות

| Ticker | Company | Hebrew | What it is |
|---|---|---|---|
| MCD | McDonald's | מקדונלד'ס | רשת ההמבורגרים הגדולה בעולם — עשרות אלפי סניפים. |
| KO | Coca-Cola | קוקה קולה | המשקה המפורסם בעולם — נמכר כבר יותר מ-100 שנה. |
| PEP | PepsiCo | פפסיקו | החברה של פפסי, צ'יפס ליי'ז, דוריטוס וקוואקר. |
| SBUX | Starbucks | סטארבקס | רשת בתי הקפה הגדולה — אנשים משלמים על כוס כל בוקר. |
| DPZ | Domino's Pizza | דומינו'ס פיצה | רשת הפיצה הגדולה — מכינה ומביאה פיצות עד הבית. |
| CMG | Chipotle | צ'יפוטלה | מסעדות מקסיקניות מהירות — בוריטו שנעשה מול העיניים. |
| MDLZ | Mondelez | מונדליז | החברה של אוראו, מילקה וטובלרון. |

### 🧸 Toys — צעצועים

| Ticker | Company | Hebrew | What it is |
|---|---|---|---|
| HAS | Hasbro | הסברו | החברה של טרנספורמרס, פליי-דו, מונופול ונרף. |
| MAT | Mattel | מטל | החברה של ברבי, הוט-וילס ו-Uno. |

### 🛒 Shopping — קניות

| Ticker | Company | Hebrew | What it is |
|---|---|---|---|
| COST | Costco | קוסטקו | מחסנים ענקיים עם מחירים זולים; אנשים משלמים מנוי כדי לקנות שם. |
| WMT | Walmart | וולמארט | רשת הקניות הגדולה בעולם — אוכל, בגדים וכלים במקום אחד. |

### 👟 Brands & Cards — מותגים וכרטיסים

| Ticker | Company | Hebrew | What it is |
|---|---|---|---|
| NKE | Nike | נייקי | חברת הנעליים והספורט הגדולה — נעליים וחולצות של כוכבי ספורט. |
| V | Visa | ויזה | הכרטיס שמאפשר לשלם בכל העולם, ולוקחת אחוז קטן מכל קנייה — מיליוני קניות ביום. |

### 🚗 Machines, Planes & Space — מכונות, מטוסים וחלל

| Ticker | Company | Hebrew | What it is |
|---|---|---|---|
| TSLA | Tesla | טסלה | טסלה בונה מכוניות חשמליות מהירות, סוללות ענק ורובוטים עתידניים. |
| CAT | Caterpillar | קטרפילר | קטרפילר בונה טרקטורים, מחפרונים ומכונות ענק לכבישים ולמכרות. |
| BA | Boeing | בואינג | בואינג בונה מטוסי נוסעים ענקיים וגם חלקים שטסים לחלל. |
| RKLB | Rocket Lab | רוקט לאב | רוקט לאב משגרת לוויינים קטנים לחלל במחיר זול — 'מונית לחלל'. |

A **basket** (ETF) holds many companies at once — buying one basket is like buying a
slice of a whole shelf instead of a single box.

## Language Support

The app auto-detects Hebrew from browser settings. Click the **HE/EN** button in the nav bar to switch. Hebrew mode enables:
- RTL layout
- Translated UI, trade messages, AI coach, and chart labels
- Hebrew company names in the stock directory

## License

Apache-2.0
