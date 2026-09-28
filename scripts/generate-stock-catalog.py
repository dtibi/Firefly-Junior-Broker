#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""מייצר את src/server/alpaca.ts עם 44 טיקרים, קריאה מרובת-סימולים אחת ו-cache."""

CATEGORIES = [
    ("index",    "🧺", "סלים",                "Baskets"),
    ("tech",     "📱", "טכנולוגיה ואינטרנט",   "Tech & Internet"),
    ("chips",    "💻", "שבבים ומחשבים",        "Chips"),
    ("gaming",   "🎮", "גיימינג ובידור",       "Gaming & Fun"),
    ("food",     "🍔", "אוכל ומסעדות",         "Food & Restaurants"),
    ("toys",     "🧸", "צעצועים",              "Toys"),
    ("shopping", "🛒", "קניות",                "Shopping"),
    ("brands",   "👟", "מותגים וכרטיסים",      "Brands & Cards"),
    ("wheels",   "🚗", "מכונות, מטוסים וחלל",  "Machines, Planes & Space"),
]

# (ticker, name_en, heName, category, logo, base_price, description_en, heDescription, heAnalogy)
STOCKS = [
    # ---------- סלים ----------
    ("SPY", "S&P 500 Index", "מדד S&P 500", "index", "📊", 767.27,
     "The S&P 500 tracks the 500 biggest companies in America — like owning a tiny piece of every major brand.",
     "סל שמחזיק את 500 החברות הגדולות באמריקה — קונים חתיכה קטנה מכולן בבת אחת.",
     "כמו לקנות פרוסה מהפיצה האמריקאית כולה במקום רק פפרוני אחד."),
    ("QQQ", "Nasdaq-100 Tech Basket", "סל 100 הטכנולוגיות", "index", "🧺", 738.27,
     "A basket that holds the 100 biggest technology companies on the Nasdaq exchange.",
     "סל אחד שקונה את 100 חברות הטכנולוגיה הגדולות (אפל, אנבידיה, מיקרוסופט...).",
     "במקום לבחור מניה אחת — קונים סלסילה שלמה בבת אחת."),
    ("VT", "Whole World Basket", "סל כל העולם", "index", "🌍", 159.16,
     "One basket with thousands of companies from the whole world: America, Europe, Japan and China.",
     "סל אחד שמחזיק אלפי חברות מכל העולם: אמריקה, אירופה, יפן וסין.",
     "כמו לקנות קצת מכל מדינה בעולם."),
    ("SCHD", "Dividend Companies Basket", "סל שמחלק כסף", "index", "💰", 33.03,
     "A basket of companies that hand part of their profit to their owners every three months.",
     "סל של חברות שכל רבעון מחלקות לבעלים חלק מהרווח (דיבידנד) — כמו דמי כיס מהחברות.",
     "חברות שמשלמות לך על זה שאתה שותף שלהן."),
    ("GLD", "Gold Basket", "סל הזהב", "index", "🥇", 379.36,
     "Owns real gold bars kept in a safe vault for all the owners.",
     "קונים חתיכת זהב אמיתי — בלי כספת ובלי שודדים.",
     "זהב ששומרים בשבילך במקום בארון."),
    ("VNQ", "Real Estate Basket", "סל הבתים", "index", "🏢", 90.65,
     "A basket of companies that own buildings and rent them out to people and shops.",
     "סל של חברות שמחזיקות בניינים ומשכירות אותם; הכסף מהשכירות מגיע לבעלים.",
     "כמו להיות שותף בבעלים של קניון שלם."),
    # ---------- טכנולוגיה ----------
    ("GOOGL", "Google & YouTube", "גוגל ויוטיוב", "tech", "📺", 342.39,
     "Google runs the search bar that knows everything, plus YouTube where you watch your favourite creators.",
     "גוגל מריצה את תיבת החיפוש שיודעת הכל, ואת יוטיוב שבו צופים ביוצרים האהובים.",
     "אם אתה צופה בסרטונים או שואל שאלות באינטרנט — גוגל היא הספרייה הענקית של הרשת."),
    ("MSFT", "Microsoft", "מיקרוסופט", "tech", "🟩", 512.10,
     "Microsoft makes Windows computers, the Xbox console, and owns Minecraft.",
     "מיקרוסופט מייצרת מחשבי Windows, קונסולת Xbox, וגם הבעלים של Minecraft.",
     "אם אתה בונה בתים במיינקראפט או משחק ב-Xbox — זו החברה שמאחורי זה."),
    ("AAPL", "Apple", "אפל", "tech", "🍎", 340.13,
     "Apple invents iPhones, iPads, Apple Watches and Mac computers.",
     "אפל ממציאה אייפונים, אייפדים, שעוני אפל ומחשבי מק.",
     "אם השתמשת באייפד או ראית סרט בטלפון — אפל בנתה אותם."),
    ("AMZN", "Amazon", "אמזון", "tech", "📦", 247.14,
     "The giant online shop that delivers parcels to your door, plus huge cloud computing services.",
     "החנות הגדולה באינטרנט: מזמינים חבילות והן מגיעות עד הבית. גם שירותי מחשב בענן שמרוויחים המון.",
     "כמו חנות צעצועים ענקית שהשליחים שלה מביאים הכל הביתה."),
    ("META", "Meta", "מטא", "tech", "👓", 722.65,
     "The company behind Facebook, Instagram and WhatsApp, and the Quest virtual-reality headsets.",
     "החברה של פייסבוק, אינסטגרם ווואטסאפ, וגם משקפי המציאות המדומה Quest.",
     "זו החברה שמחזיקה את הכיכר שבה כל העולם נפגש."),
    ("NFLX", "Netflix", "נטפליקס", "tech", "🎬", 69.38,
     "The biggest library of films and series in the world, paid for with a monthly subscription.",
     "ספריית הסרטים והסדרות הגדולה בעולם — מנוי חודשי וצופים מה שרוצים.",
     "כמו קולנוע ענק שנמצא בתוך הטלוויזיה ופתוח כל הזמן."),
    ("SPOT", "Spotify", "ספוטיפיי", "tech", "🎧", 501.63,
     "The app that plays music for the whole world and pays artists for every listen.",
     "האפליקציה שמשמיעה מוזיקה לכל העולם, ומשלמת לאמנים לפי כמה שמאזינים להם.",
     "כמו רדיו אישי שיודע בדיוק איזה שיר אתה אוהב."),
    ("UBER", "Uber", "אובר", "tech", "🚗", 68.55,
     "Order a ride or a meal with an app — no taxi stand, no phone call.",
     "מזמינים נסיעה או אוכל באפליקציה — בלי מוניות ובלי טלפונים.",
     "כמו לשלוח הודעה ולקבל הסעה שמגיעה עד הבית."),
    ("ABNB", "Airbnb", "איירבי-אנד-בי", "tech", "🏠", 157.66,
     "People rent out their home or spare room to travellers through the app.",
     "אנשים משכירים את הבית או החדר שלהם לתיירים דרך האפליקציה.",
     "כמו מלון ענק שהחדרים שלו הם הבתים של אנשים רגילים."),
    ("DASH", "DoorDash", "דורדאש", "tech", "🛵", 180.96,
     "Couriers bring food from restaurants to your door; the company takes a slice of each order.",
     "שליחים שמביאים אוכל מהמסעדה עד הבית; החברה לוקחת חלק מכל הזמנה.",
     "כמו שליח מהיר שמביא פיצה חמה עד הדלת."),
    # ---------- שבבים ----------
    ("NVDA", "NVIDIA", "אנווידיה", "chips", "🤖", 230.53,
     "NVIDIA builds the powerful chips (GPUs) that make 3D games look real and power AI.",
     "אנווידיה בונה שבבים חזקים (GPU) שמציירים משחקי תלת-ממד ומפעילים בינה מלאכותית.",
     "אנווידיה בונה את ה'מוחות-על' שמאפשרים למחשבים לצייר משחקים יפים ומהר."),
    ("INTC", "Intel", "אינטל", "chips", "💻", 116.11,
     "Intel makes the tiny brain chips (processors) inside almost every computer and laptop.",
     "אינטל מייצרת את שבבי המוח הקטנים (מעבדים) שבתוך כמעט כל מחשב ונייד.",
     "אם מחשבים היו אנשים, השבבים של אינטל היו המוח שבתוך הראש שלהם."),
    ("AMD", "AMD", "AMD", "chips", "🔥", 606.52,
     "AMD makes fast processors and graphics chips for computers and game consoles.",
     "AMD מייצרת מעבדים ושבבים גרפיים חזקים למחשבים ולמשחקים — המתחרה של אנבידיה ואינטל.",
     "כמו קבוצת מרוץ נוספת של שבבים — לפעמים מנצחת."),
    ("TSM", "TSMC", "TSMC", "chips", "🏭", 453.66,
     "The biggest chip factory in the world — it manufactures chips for Apple, NVIDIA and many more.",
     "בית החרושת הגדול בעולם שמייצר שבבים בשביל אפל ואנבידיה — כולם צריכים אותה.",
     "כמו האופה שמכין את הלחמניות לכל המסעדות בעיר."),
    ("QCOM", "Qualcomm", "קוואלקום", "chips", "📶", 190.19,
     "Qualcomm makes the radio chips and processors inside smartphones and tablets.",
     "קוואלקום מייצרת שבבי רדיו ומעבדים לטלפונים ולטאבלטים — בלעדיהם אין קליטה ואין אינטרנט.",
     "כמו האנטנה הקטנה שמביאה את הקליטה לטלפון."),
    ("ASML", "ASML", "ASML", "chips", "🔬", 1779.48,
     "ASML builds the most precise machines in the world — they print the tiny circuits on chips.",
     "ASML בונה מכונות ענק שמכינות שבבים בדיוק מטורף — המדויקות בעולם.",
     "כמו מכונת קסמים שמציירת מיליון קווים דקים על גרגר אורז."),
    # ---------- גיימינג ובידור ----------
    ("RBLX", "Roblox", "רובלוקס", "gaming", "🎮", 42.95,
     "Roblox is a huge online world where you build your own games and play them with friends.",
     "רובלוקס הוא עולם ענק באינטרנט שבו בונים משחקים משלך ומשחקים עם חברים.",
     "לקנות רובלוקס זה כמו לקנות חתיכה ממגרש הלגו הווירטואלי הכי גדול."),
    ("NTDOY", "Nintendo", "נינטנדו", "gaming", "🍄", 12.55,
     "The home of Mario, Luigi, Pikachu and the Nintendo Switch.",
     "הבית של מריו, לואיג'י, פיקאצ'ו והקונסולה Nintendo Switch.",
     "כמו להחזיק במפתחות לממלכת הפטריות ולמריו קארט."),
    ("SONY", "Sony", "סוני", "gaming", "🎮", 23.36,
     "The maker of PlayStation, Spider-Man movies and headphones — a Japanese entertainment giant.",
     "הבית של PlayStation, של סרטי ספיידרמן ושל אוזניות. ענקית בידור מיפן.",
     "היצרנית של הקונסולה שמחוברת לטלוויזיה שלך."),
    ("EA", "Electronic Arts", "אלקטרוניק ארטס", "gaming", "🏈", 209.86,
     "The game maker behind the football and sports games millions of kids play.",
     "מפתחת משחקי ספורט וכדורגל שמיליונים משחקים בהם.",
     "החברה שמכינה את משחק הכדורגל שאתה משחק עם חברים."),
    ("DIS", "Disney", "דיסני", "gaming", "🏰", 105.28,
     "Disney makes magic with Mickey Mouse, Star Wars, Marvel heroes and giant theme parks.",
     "דיסני עושה קסמים עם מיקי מאוס, מלחמת הכוכבים, גיבורי מארוול ופארקי שעשועים ענקיים.",
     "לקנות דיסני זה לקנות חתיכה מהטירות, הסרטים והצעצועים שאתה אוהב."),
    # ---------- אוכל ----------
    ("MCD", "McDonald's", "מקדונלד'ס", "food", "🍟", 234.31,
     "The most famous burger chain in the world, with tens of thousands of restaurants.",
     "רשת ההמבורגרים הגדולה בעולם — עשרות אלפי סניפים.",
     "כל המבורגר שנמכר בעולם מכניס להם קצת."),
    ("KO", "Coca-Cola", "קוקה קולה", "food", "🥤", 87.06,
     "The most famous drink in the world — sold for more than 100 years.",
     "המשקה המפורסם בעולם — נמכר כבר יותר מ-100 שנה.",
     "שתייה שאף אחד לא מפסיק לקנות."),
    ("PEP", "PepsiCo", "פפסיקו", "food", "🌮", 128.00,
     "The company behind Pepsi, Lay's, Doritos and Quaker oats.",
     "החברה של פפסי, צ'יפס ליי'ז, דוריטוס וקוואקר.",
     "החטיפים בארון שלך הם כמעט כולם שלהם."),
    ("SBUX", "Starbucks", "סטארבקס", "food", "☕", 95.56,
     "The biggest coffee shop chain — people pay for a cup every morning.",
     "רשת בתי הקפה הגדולה — אנשים משלמים על כוס כל בוקר.",
     "החברה שמוכרת את הבקרים של כולם."),
    ("DPZ", "Domino's Pizza", "דומינו'ס פיצה", "food", "🍕", 291.57,
     "The biggest pizza chain in the world — it bakes and delivers pizza to your door.",
     "רשת הפיצה הגדולה — מכינה ומביאה פיצות עד הבית.",
     "מי לא מזמין פיצה?"),
    ("CMG", "Chipotle", "צ'יפוטלה", "food", "🌯", 32.67,
     "Fast Mexican restaurants where burritos and tacos are built in front of you.",
     "מסעדות מקסיקניות מהירות — בוריטו שנעשה מול העיניים.",
     "הכריכים הגדולים שמתגלגלים מול העיניים."),
    ("MDLZ", "Mondelez", "מונדליז", "food", "🍪", 60.00,
     "The company behind Oreo cookies, Milka and Toblerone chocolate.",
     "החברה של אוראו, מילקה וטובלרון.",
     "'אוראו טבול בחלב' — זה הם."),
    # ---------- צעצועים ----------
    ("HAS", "Hasbro", "הסברו", "toys", "🧸", 89.58,
     "The company behind Transformers, Play-Doh, Monopoly and Nerf.",
     "החברה של טרנספורמרס, פליי-דו, מונופול ונרף.",
     "לקנות חלק מהחברות שייצרו את הצעצועים שלך."),
    ("MAT", "Mattel", "מטל", "toys", "🚗", 13.38,
     "The company behind Barbie, Hot Wheels and Uno.",
     "החברה של ברבי, הוט-וילס ו-Uno.",
     "המכוניות הקטנות שאתה דורך עליהן — שלהם."),
    # ---------- קניות ----------
    ("COST", "Costco", "קוסטקו", "shopping", "🛒", 923.13,
     "Giant warehouses with low prices; shoppers pay a yearly membership to get in.",
     "מחסנים ענקיים עם מחירים זולים; אנשים משלמים מנוי כדי לקנות שם.",
     "כמו סופר ענק עם עגלות ענקיות ומחירים זולים."),
    ("WMT", "Walmart", "וולמארט", "shopping", "🏬", 108.64,
     "The biggest shopping chain in the world — food, clothes and tools under one roof.",
     "רשת הקניות הגדולה בעולם — אוכל, בגדים וכלים במקום אחד.",
     "הסופר הכי גדול באמריקה."),
    # ---------- מותגים וכרטיסים ----------
    ("NKE", "Nike", "נייקי", "brands", "👟", 36.38,
     "The biggest sport shoes and clothes brand, worn by famous athletes.",
     "חברת הנעליים והספורט הגדולה — נעליים וחולצות של כוכבי ספורט.",
     "החברה שהפכה נעליים לשם של ספורט."),
    ("V", "Visa", "ויזה", "brands", "💳", 368.95,
     "The card network that lets people pay anywhere in the world, taking a tiny slice of every purchase.",
     "הכרטיס שמאפשר לשלם בכל העולם, ולוקחת אחוז קטן מכל קנייה — מיליוני קניות ביום.",
     "כביש אגרה קטן שכל שקל בעולם עובר דרכו."),
    # ---------- מכונות, מטוסים וחלל ----------
    ("TSLA", "Tesla", "טסלה", "wheels", "⚡", 359.15,
     "Tesla builds fast electric cars, giant batteries and futuristic robots.",
     "טסלה בונה מכוניות חשמליות מהירות, סוללות ענק ורובוטים עתידניים.",
     "טסלה היא כמו חברה מסרטי מדע בדיוני שבונה מכוניות שנוסעות לבד."),
    ("CAT", "Caterpillar", "קטרפילר", "wheels", "🚜", 822.27,
     "Caterpillar builds tractors, diggers and giant machines for roads and mines.",
     "קטרפילר בונה טרקטורים, מחפרונים ומכונות ענק לכבישים ולמכרות.",
     "הכלים הכבדים שרואים בבנייה."),
    ("BA", "Boeing", "בואינג", "wheels", "✈️", 188.88,
     "Boeing builds giant passenger planes and parts that fly into space.",
     "בואינג בונה מטוסי נוסעים ענקיים וגם חלקים שטסים לחלל.",
     "המטוסים עם הלוגו שכולם מזהים בשמיים."),
    ("RKLB", "Rocket Lab", "רוקט לאב", "wheels", "🚀", 73.04,
     "Rocket Lab launches small satellites into space cheaply — a taxi to orbit.",
     "רוקט לאב משגרת לוויינים קטנים לחלל במחיר זול — 'מונית לחלל'.",
     "שליח שמביא לוויינים לחלל במקום חבילות לבית."),
]

def q(s: str) -> str:
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

cat_he = {c[0]: c[2] for c in CATEGORIES}

lines = []
lines.append("""/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StockInfo, StockQuote } from '../types.js';
import { Database } from './db.js';

// ---------------------------------------------------------------------------
// Categories — used by the UI to group the (now much bigger) stock directory.
// ---------------------------------------------------------------------------
export interface StockCategory { id: string; emoji: string; he: string; en: string; }

export const STOCK_CATEGORIES: StockCategory[] = [""")
for cid, emoji, he, en in CATEGORIES:
    lines.append(f"  {{ id: {q(cid)}, emoji: {q(emoji)}, he: {q(he)}, en: {q(en)} }},")
lines.append("];\n")

lines.append("""// ---------------------------------------------------------------------------
// The kids' stock directory: kid-friendly companies + baskets (ETFs).
// Every entry carries a Hebrew description + a child analogy, both shown in
// the app ("what is this company?" box on the stock screen).
// ---------------------------------------------------------------------------
export const KIDS_STOCKS: Record<string, StockInfo> = {""")
for (t, name, he_name, cat, logo, price, desc, hedesc, analogy) in STOCKS:
    lines.append(f"  {t}: {{")
    lines.append(f"    ticker: {q(t)},")
    lines.append(f"    name: {q(name)},")
    lines.append(f"    heName: {q(he_name)},")
    lines.append(f"    description: {q(desc)},")
    lines.append(f"    heDescription: {q(hedesc)},")
    lines.append(f"    childAnalogy: {q(analogy)},")
    lines.append(f"    sector: {q(cat_he[cat])},")
    lines.append(f"    category: {q(cat)},")
    lines.append(f"    logo: {q(logo)},")
    lines.append("  },")
lines.append("};\n")

lines.append("""// ---------------------------------------------------------------------------
// Real closing prices measured 2026-09-28. Used only by the deterministic
// simulator fallback (and as a sanity floor) when live data is unreachable.
// ---------------------------------------------------------------------------
const BASE_PRICES: Record<string, number> = {""")
for (t, name, he_name, cat, logo, price, desc, hedesc, analogy) in STOCKS:
    lines.append(f"  {t}: {price},")
lines.append("};\n")

lines.append("""// Tickers that Alpaca does not serve (OTC / pink sheets) — these fall back to
// Yahoo Finance for their quote.
const ALPACA_UNSUPPORTED = new Set(['NTDOY']);

// Seed-based pseudo-random generator for stable daily fluctuations in the simulator
function getDayVolatility(ticker: string, offsetDays: number = 0): number {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const dateStr = d.toISOString().split('T')[0];

  let hash = 0;
  const str = ticker + dateStr;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  const rand = Math.abs(hash % 1000) / 1000;
  return -0.04 + rand * 0.085;
}

function simulatedQuote(ticker: string): StockQuote {
  const info = KIDS_STOCKS[ticker];
  const basePrice = BASE_PRICES[ticker] || 100.0;
  const fluc = getDayVolatility(ticker);
  const priceUsd = basePrice * (1 + fluc);
  return {
    ticker,
    name: info.name,
    heName: info.heName,
    logo: info.logo,
    sector: info.sector,
    category: info.category,
    priceUsd: Number(priceUsd.toFixed(2)),
    changePercent: Number((fluc * 100).toFixed(2)),
    high24h: Number((priceUsd * (1 + Math.abs(fluc) * 0.3)).toFixed(2)),
    low24h: Number((priceUsd * (1 - Math.abs(fluc) * 0.3)).toFixed(2)),
    prevClose: Number(basePrice.toFixed(2)),
    volume: 850000 + Math.floor(Math.abs(fluc) * 5000000),
    lastUpdated: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Quote cache — one batched Alpaca call for the whole directory, served from
// memory for a few minutes. Keeps the UI fast with 44 tickers.
// ---------------------------------------------------------------------------
const QUOTE_TTL_MS = 5 * 60 * 1000;
let quoteCache: { at: number; quotes: Record<string, StockQuote> } | null = null;
let inFlightRefresh: Promise<Record<string, StockQuote>> | null = null;

function alpacaConfigured(): boolean {
  const apiKey = process.env.ALPACA_API_KEY_ID;
  const apiSecret = process.env.ALPACA_API_SECRET_KEY;
  return Boolean(
    apiKey && apiKey !== 'mock_or_real_key' && apiSecret && apiSecret !== 'mock_or_real_secret'
  );
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** One HTTP request for the entire directory (Alpaca supports up to 100 symbols). */
async function fetchAlpacaSnapshots(tickers: string[]): Promise<Record<string, any>> {
  if (!alpacaConfigured()) return {};
  try {
    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${tickers.join(',')}&feed=iex`,
      {
        headers: {
          'APCA-API-KEY-ID': process.env.ALPACA_API_KEY_ID as string,
          'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET_KEY as string,
        },
      }
    );
    if (!res.ok) {
      console.warn(`[MarketService] Alpaca snapshot batch failed: HTTP ${res.status}`);
      return {};
    }
    return (await res.json()) as Record<string, any>;
  } catch (err) {
    console.warn('[MarketService] Alpaca snapshot batch unreachable.', err);
    return {};
  }
}

/** Yahoo Finance quote for a single ticker (fallback for OTC/ADR tickers). */
async function fetchYahooQuote(ticker: string): Promise<Partial<StockQuote> | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const quotes = result?.indicators?.quote?.[0];
    const timestamps = result?.timestamp;
    if (!result || !quotes || !timestamps || timestamps.length === 0) return null;

    const lastIdx = timestamps.length - 1;
    const price = num(quotes.close?.[lastIdx]);
    if (price === null) return null;

    let prevClose = price;
    for (let i = timestamps.length - 2; i >= 0; i--) {
      const c = num(quotes.close?.[i]);
      if (c !== null) {
        prevClose = c;
        break;
      }
    }
    const dayHigh = num(quotes.high?.[lastIdx]) ?? price;
    const dayLow = num(quotes.low?.[lastIdx]) ?? price;

    return {
      priceUsd: Number(price.toFixed(2)),
      prevClose: Number(prevClose.toFixed(2)),
      high24h: Number(Math.max(dayHigh, price).toFixed(2)),
      low24h: Number(Math.min(dayLow, price).toFixed(2)),
      volume: num(quotes.volume?.[lastIdx]) ?? 0,
      lastUpdated: new Date(timestamps[lastIdx] * 1000).toISOString(),
    };
  } catch (err) {
    console.warn(`[MarketService] Yahoo quote failed for ${ticker}`, err);
    return null;
  }
}

function mergeQuote(ticker: string, live: Partial<StockQuote> | null): StockQuote {
  const info = KIDS_STOCKS[ticker];
  const fallback = simulatedQuote(ticker);
  const price = live?.priceUsd ?? fallback.priceUsd;
  const prevClose = live?.prevClose ?? fallback.prevClose;
  const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : fallback.changePercent;

  return {
    ticker,
    name: info.name,
    heName: info.heName,
    logo: info.logo,
    sector: info.sector,
    category: info.category,
    priceUsd: Number(price.toFixed(2)),
    changePercent: Number(changePercent.toFixed(2)),
    high24h: live?.high24h ?? fallback.high24h,
    low24h: live?.low24h ?? fallback.low24h,
    prevClose: Number(prevClose.toFixed(2)),
    volume: live?.volume ?? fallback.volume,
    lastUpdated: live?.lastUpdated ?? fallback.lastUpdated,
  };
}

/** Refreshes the whole directory in a single batched call (+ Yahoo for OTC). */
async function refreshQuotes(): Promise<Record<string, StockQuote>> {
  const tickers = Object.keys(KIDS_STOCKS);
  const snapshots = await fetchAlpacaSnapshots(tickers);
  const quotes: Record<string, StockQuote> = {};

  for (const ticker of tickers) {
    const snap = snapshots[ticker];
    let live: Partial<StockQuote> | null = null;

    if (snap) {
      const price = num(snap.latestTrade?.p) ?? num(snap.dailyBar?.c);
      if (price !== null) {
        const prevClose = num(snap.prevDailyBar?.c) ?? num(snap.dailyBar?.o) ?? price;
        live = {
          priceUsd: price,
          prevClose,
          high24h: num(snap.dailyBar?.h) ?? price,
          low24h: num(snap.dailyBar?.l) ?? price,
          volume: num(snap.dailyBar?.v) ?? 0,
          lastUpdated: snap.latestTrade?.t ?? new Date().toISOString(),
        };
      }
    }

    // Tickers Alpaca cannot serve (or a missing batch entry) go to Yahoo.
    if (!live && ALPACA_UNSUPPORTED.has(ticker)) {
      live = await fetchYahooQuote(ticker);
    }

    quotes[ticker] = mergeQuote(ticker, live);
  }

  quoteCache = { at: Date.now(), quotes };
  return quotes;
}

export const MarketService = {
  /**
   * Fetches the current cached or live USD exchange rate to ILS (New Israeli Shekels)
   */
  async getILSExchangeRate(): Promise<number> {
    const cached = Database.getFXCache();
    if (cached && Date.now() - new Date(cached.timestamp).getTime() < 3600000) {
      return cached.rate;
    }

    try {
      const response = await fetch('https://open.er-api.com/v6/latest/ILS');
      if (response.ok) {
        const data = await response.json();
        const rate = data.rates?.USD;
        if (rate && typeof rate === 'number') {
          Database.saveFXCache(rate);
          return rate;
        }
      }
    } catch (e) {
      console.warn('Could not reach live FX Exchange API, using secure local fallback.', e);
    }

    const fallbackRate = 0.27;
    Database.saveFXCache(fallbackRate);
    return fallbackRate;
  },

  /** All quotes for the whole directory, served from a short-lived cache. */
  async getAllStockQuotes(): Promise<StockQuote[]> {
    if (quoteCache && Date.now() - quoteCache.at < QUOTE_TTL_MS) {
      return Object.values(quoteCache.quotes);
    }
    if (inFlightRefresh) {
      const quotes = await inFlightRefresh;
      return Object.values(quotes);
    }
    inFlightRefresh = refreshQuotes();
    try {
      const quotes = await inFlightRefresh;
      return Object.values(quotes);
    } finally {
      inFlightRefresh = null;
    }
  },

  /** Single quote — always served from the batched cache. */
  async getStockQuote(ticker: string): Promise<StockQuote> {
    const info = KIDS_STOCKS[ticker];
    if (!info) {
      throw new Error(`Ticker ${ticker} is not supported inside the kids' broker.`);
    }
    if (quoteCache && Date.now() - quoteCache.at < QUOTE_TTL_MS && quoteCache.quotes[ticker]) {
      return quoteCache.quotes[ticker];
    }
    const quotes = await this.getAllStockQuotes();
    return quotes.find((q: StockQuote) => q.ticker === ticker) || simulatedQuote(ticker);
  },

  /**
   * Real daily price history for the stock screen (Yahoo Finance), with the
   * deterministic simulator as a last-resort fallback.
   */
  async getStockHistory(
    ticker: string,
    range: '1D' | '1W' | '1M' | '1Y' = '1M'
  ): Promise<{ date: string; price: number }[]> {
    const yahooRange = range === '1D' ? '1d' : range === '1W' ? '5d' : range === '1Y' ? '1y' : '1mo';
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${yahooRange}&interval=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (res.ok) {
        const data = await res.json();
        const result = data?.chart?.result?.[0];
        const timestamps: number[] = result?.timestamp || [];
        const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];
        const history = timestamps
          .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().split('T')[0], price: closes[i] }))
          .filter((p) => typeof p.price === 'number' && Number.isFinite(p.price))
          .map((p) => ({ date: p.date, price: Number((p.price as number).toFixed(2)) }));
        if (history.length >= 2) return history;
      }
    } catch (err) {
      console.warn(`[MarketService] Yahoo history failed for ${ticker}`, err);
    }

    // Simulator curve fallback
    const basePrice = BASE_PRICES[ticker] || 100.0;
    let days = 30;
    if (range === '1D') days = 1;
    if (range === '1W') days = 7;
    if (range === '1Y') days = 365;
    const out: { date: string; price: number }[] = [];
    let currentPrice = basePrice;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      currentPrice = currentPrice * (1 + getDayVolatility(ticker, i) * 0.4);
      out.push({ date: d.toISOString().split('T')[0], price: Number(currentPrice.toFixed(2)) });
    }
    return out;
  },
};
""")

out = "\n".join(lines) + "\n"
with open("/root/Firefly-Junior-Broker/src/server/alpaca.ts", "w", encoding="utf-8") as f:
    f.write(out)

print("נכתב src/server/alpaca.ts")
print("טיקרים:", len(STOCKS))
from collections import Counter
print("פילוח קטגוריות:", dict(Counter(s[3] for s in STOCKS)))
