/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StockInfo, StockQuote } from '../types.js';
import { Database } from './db.js';

// ---------------------------------------------------------------------------
// Categories — used by the UI to group the (now much bigger) stock directory.
// ---------------------------------------------------------------------------
export interface StockCategory { id: string; emoji: string; he: string; en: string; }

export const STOCK_CATEGORIES: StockCategory[] = [
  { id: "index", emoji: "🧺", he: "סלים", en: "Baskets" },
  { id: "tech", emoji: "📱", he: "טכנולוגיה ואינטרנט", en: "Tech & Internet" },
  { id: "chips", emoji: "💻", he: "שבבים ומחשבים", en: "Chips" },
  { id: "gaming", emoji: "🎮", he: "גיימינג ובידור", en: "Gaming & Fun" },
  { id: "food", emoji: "🍔", he: "אוכל ומסעדות", en: "Food & Restaurants" },
  { id: "toys", emoji: "🧸", he: "צעצועים", en: "Toys" },
  { id: "shopping", emoji: "🛒", he: "קניות", en: "Shopping" },
  { id: "brands", emoji: "👟", he: "מותגים וכרטיסים", en: "Brands & Cards" },
  { id: "wheels", emoji: "🚗", he: "מכונות, מטוסים וחלל", en: "Machines, Planes & Space" },
];

// ---------------------------------------------------------------------------
// The kids' stock directory: kid-friendly companies + baskets (ETFs).
// Every entry carries a Hebrew description + a child analogy, both shown in
// the app ("what is this company?" box on the stock screen).
// ---------------------------------------------------------------------------
export const KIDS_STOCKS: Record<string, StockInfo> = {
  SPY: {
    ticker: "SPY",
    name: "S&P 500 Index",
    heName: "מדד S&P 500",
    description: "The S&P 500 tracks the 500 biggest companies in America — like owning a tiny piece of every major brand.",
    heDescription: "סל שמחזיק את 500 החברות הגדולות באמריקה — קונים חתיכה קטנה מכולן בבת אחת.",
    childAnalogy: "כמו לקנות פרוסה מהפיצה האמריקאית כולה במקום רק פפרוני אחד.",
    sector: "סלים",
    category: "index",
    logo: "📊",
  },
  QQQ: {
    ticker: "QQQ",
    name: "Nasdaq-100 Tech Basket",
    heName: "סל 100 הטכנולוגיות",
    description: "A basket that holds the 100 biggest technology companies on the Nasdaq exchange.",
    heDescription: "סל אחד שקונה את 100 חברות הטכנולוגיה הגדולות (אפל, אנבידיה, מיקרוסופט...).",
    childAnalogy: "במקום לבחור מניה אחת — קונים סלסילה שלמה בבת אחת.",
    sector: "סלים",
    category: "index",
    logo: "🧺",
  },
  VT: {
    ticker: "VT",
    name: "Whole World Basket",
    heName: "סל כל העולם",
    description: "One basket with thousands of companies from the whole world: America, Europe, Japan and China.",
    heDescription: "סל אחד שמחזיק אלפי חברות מכל העולם: אמריקה, אירופה, יפן וסין.",
    childAnalogy: "כמו לקנות קצת מכל מדינה בעולם.",
    sector: "סלים",
    category: "index",
    logo: "🌍",
  },
  SCHD: {
    ticker: "SCHD",
    name: "Dividend Companies Basket",
    heName: "סל שמחלק כסף",
    description: "A basket of companies that hand part of their profit to their owners every three months.",
    heDescription: "סל של חברות שכל רבעון מחלקות לבעלים חלק מהרווח (דיבידנד) — כמו דמי כיס מהחברות.",
    childAnalogy: "חברות שמשלמות לך על זה שאתה שותף שלהן.",
    sector: "סלים",
    category: "index",
    logo: "💰",
  },
  GLD: {
    ticker: "GLD",
    name: "Gold Basket",
    heName: "סל הזהב",
    description: "Owns real gold bars kept in a safe vault for all the owners.",
    heDescription: "קונים חתיכת זהב אמיתי — בלי כספת ובלי שודדים.",
    childAnalogy: "זהב ששומרים בשבילך במקום בארון.",
    sector: "סלים",
    category: "index",
    logo: "🥇",
  },
  VNQ: {
    ticker: "VNQ",
    name: "Real Estate Basket",
    heName: "סל הבתים",
    description: "A basket of companies that own buildings and rent them out to people and shops.",
    heDescription: "סל של חברות שמחזיקות בניינים ומשכירות אותם; הכסף מהשכירות מגיע לבעלים.",
    childAnalogy: "כמו להיות שותף בבעלים של קניון שלם.",
    sector: "סלים",
    category: "index",
    logo: "🏢",
  },
  VTI: {
    ticker: "VTI",
    name: "Whole US Market Basket",
    heName: "סל כל השוק האמריקאי",
    description: "One basket that owns thousands of American companies — big, medium and small — in a single share.",
    heDescription: "סל אחד שמחזיק אלפי חברות אמריקאיות — גדולות, בינוניות וקטנות — במניה אחת.",
    childAnalogy: "כמו לקנות כרטיס אחד לכל הלונה-פארק במקום לרכבל אחד.",
    sector: "סלים",
    category: "index",
    logo: "🇺🇸",
  },
  SMH: {
    ticker: "SMH",
    name: "The Chips Basket",
    heName: "סל השבבים",
    description: "A basket that owns the biggest chip makers in the world — NVIDIA, TSMC, ASML and their friends.",
    heDescription: "סל שמחזיק את יצרניות השבבים הגדולות בעולם — אנווידיה, TSMC, ASML וחברותיהן.",
    childAnalogy: "במקום לקנות שבב אחד — קונים את כל מפעל השבבים.",
    sector: "סלים",
    category: "index",
    logo: "🔌",
  },
  GOOGL: {
    ticker: "GOOGL",
    name: "Google & YouTube",
    heName: "גוגל ויוטיוב",
    description: "Google runs the search bar that knows everything, plus YouTube where you watch your favourite creators.",
    heDescription: "גוגל מריצה את תיבת החיפוש שיודעת הכל, ואת יוטיוב שבו צופים ביוצרים האהובים.",
    childAnalogy: "אם אתה צופה בסרטונים או שואל שאלות באינטרנט — גוגל היא הספרייה הענקית של הרשת.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "📺",
  },
  MSFT: {
    ticker: "MSFT",
    name: "Microsoft",
    heName: "מיקרוסופט",
    description: "Microsoft makes Windows computers, the Xbox console, and owns Minecraft.",
    heDescription: "מיקרוסופט מייצרת מחשבי Windows, קונסולת Xbox, וגם הבעלים של Minecraft.",
    childAnalogy: "אם אתה בונה בתים במיינקראפט או משחק ב-Xbox — זו החברה שמאחורי זה.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "🟩",
  },
  AAPL: {
    ticker: "AAPL",
    name: "Apple",
    heName: "אפל",
    description: "Apple invents iPhones, iPads, Apple Watches and Mac computers.",
    heDescription: "אפל ממציאה אייפונים, אייפדים, שעוני אפל ומחשבי מק.",
    childAnalogy: "אם השתמשת באייפד או ראית סרט בטלפון — אפל בנתה אותם.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "🍎",
  },
  AMZN: {
    ticker: "AMZN",
    name: "Amazon",
    heName: "אמזון",
    description: "The giant online shop that delivers parcels to your door, plus huge cloud computing services.",
    heDescription: "החנות הגדולה באינטרנט: מזמינים חבילות והן מגיעות עד הבית. גם שירותי מחשב בענן שמרוויחים המון.",
    childAnalogy: "כמו חנות צעצועים ענקית שהשליחים שלה מביאים הכל הביתה.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "📦",
  },
  META: {
    ticker: "META",
    name: "Meta",
    heName: "מטא",
    description: "The company behind Facebook, Instagram and WhatsApp, and the Quest virtual-reality headsets.",
    heDescription: "החברה של פייסבוק, אינסטגרם ווואטסאפ, וגם משקפי המציאות המדומה Quest.",
    childAnalogy: "זו החברה שמחזיקה את הכיכר שבה כל העולם נפגש.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "👓",
  },
  NFLX: {
    ticker: "NFLX",
    name: "Netflix",
    heName: "נטפליקס",
    description: "The biggest library of films and series in the world, paid for with a monthly subscription.",
    heDescription: "ספריית הסרטים והסדרות הגדולה בעולם — מנוי חודשי וצופים מה שרוצים.",
    childAnalogy: "כמו קולנוע ענק שנמצא בתוך הטלוויזיה ופתוח כל הזמן.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "🎬",
  },
  SPOT: {
    ticker: "SPOT",
    name: "Spotify",
    heName: "ספוטיפיי",
    description: "The app that plays music for the whole world and pays artists for every listen.",
    heDescription: "האפליקציה שמשמיעה מוזיקה לכל העולם, ומשלמת לאמנים לפי כמה שמאזינים להם.",
    childAnalogy: "כמו רדיו אישי שיודע בדיוק איזה שיר אתה אוהב.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "🎧",
  },
  UBER: {
    ticker: "UBER",
    name: "Uber",
    heName: "אובר",
    description: "Order a ride or a meal with an app — no taxi stand, no phone call.",
    heDescription: "מזמינים נסיעה או אוכל באפליקציה — בלי מוניות ובלי טלפונים.",
    childAnalogy: "כמו לשלוח הודעה ולקבל הסעה שמגיעה עד הבית.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "🚗",
  },
  ABNB: {
    ticker: "ABNB",
    name: "Airbnb",
    heName: "איירבי-אנד-בי",
    description: "People rent out their home or spare room to travellers through the app.",
    heDescription: "אנשים משכירים את הבית או החדר שלהם לתיירים דרך האפליקציה.",
    childAnalogy: "כמו מלון ענק שהחדרים שלו הם הבתים של אנשים רגילים.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "🏠",
  },
  DASH: {
    ticker: "DASH",
    name: "DoorDash",
    heName: "דורדאש",
    description: "Couriers bring food from restaurants to your door; the company takes a slice of each order.",
    heDescription: "שליחים שמביאים אוכל מהמסעדה עד הבית; החברה לוקחת חלק מכל הזמנה.",
    childAnalogy: "כמו שליח מהיר שמביא פיצה חמה עד הדלת.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "🛵",
  },
  ORCL: {
    ticker: "ORCL",
    name: "Oracle",
    heName: "אורקל",
    description: "Oracle keeps the giant databases where banks, shops and games store their information.",
    heDescription: "אורקל שומרת את מסדי הנתונים הענקיים שבהם בנקים, חנויות ומשחקים מאחסנים את המידע שלהם.",
    childAnalogy: "כמו ארון ענק ומסודר שכל העולם שומר בו את המסמכים שלו.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "🗄️",
  },
  PYPL: {
    ticker: "PYPL",
    name: "PayPal",
    heName: "פייפאל",
    description: "PayPal moves money between people and shops on the internet — no cash, no envelope.",
    heDescription: "פייפאל מעבירה כסף בין אנשים לחנויות באינטרנט — בלי מזומן ובלי מעטפה.",
    childAnalogy: "כמו לשלוח כסף לחבר בלחיצה במקום לתת לו שטר.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "💸",
  },
  SNAP: {
    ticker: "SNAP",
    name: "Snapchat",
    heName: "סנאפצ'ט",
    description: "The camera app that sends photos which disappear, and the glasses that film what you see.",
    heDescription: "האפליקציה ששולחת תמונות שנעלמות אחרי כמה שניות, וגם משקפיים שמצלמים את מה שרואים.",
    childAnalogy: "הודעה עם טיימר: קוראים אותה — והיא נעלמת כמו קסם.",
    sector: "טכנולוגיה ואינטרנט",
    category: "tech",
    logo: "👻",
  },
  NVDA: {
    ticker: "NVDA",
    name: "NVIDIA",
    heName: "אנווידיה",
    description: "NVIDIA builds the powerful chips (GPUs) that make 3D games look real and power AI.",
    heDescription: "אנווידיה בונה שבבים חזקים (GPU) שמציירים משחקי תלת-ממד ומפעילים בינה מלאכותית.",
    childAnalogy: "אנווידיה בונה את ה'מוחות-על' שמאפשרים למחשבים לצייר משחקים יפים ומהר.",
    sector: "שבבים ומחשבים",
    category: "chips",
    logo: "🤖",
  },
  INTC: {
    ticker: "INTC",
    name: "Intel",
    heName: "אינטל",
    description: "Intel makes the tiny brain chips (processors) inside almost every computer and laptop.",
    heDescription: "אינטל מייצרת את שבבי המוח הקטנים (מעבדים) שבתוך כמעט כל מחשב ונייד.",
    childAnalogy: "אם מחשבים היו אנשים, השבבים של אינטל היו המוח שבתוך הראש שלהם.",
    sector: "שבבים ומחשבים",
    category: "chips",
    logo: "💻",
  },
  AMD: {
    ticker: "AMD",
    name: "AMD",
    heName: "AMD (מעבדים)",
    description: "AMD makes fast processors and graphics chips for computers and game consoles.",
    heDescription: "AMD מייצרת מעבדים ושבבים גרפיים חזקים למחשבים ולמשחקים — המתחרה של אנבידיה ואינטל.",
    childAnalogy: "כמו קבוצת מרוץ נוספת של שבבים — לפעמים מנצחת.",
    sector: "שבבים ומחשבים",
    category: "chips",
    logo: "🔥",
  },
  TSM: {
    ticker: "TSM",
    name: "TSMC",
    heName: "TSMC (יצרנית שבבים)",
    description: "The biggest chip factory in the world — it manufactures chips for Apple, NVIDIA and many more.",
    heDescription: "בית החרושת הגדול בעולם שמייצר שבבים בשביל אפל ואנבידיה — כולם צריכים אותה.",
    childAnalogy: "כמו האופה שמכין את הלחמניות לכל המסעדות בעיר.",
    sector: "שבבים ומחשבים",
    category: "chips",
    logo: "🏭",
  },
  QCOM: {
    ticker: "QCOM",
    name: "Qualcomm",
    heName: "קוואלקום",
    description: "Qualcomm makes the radio chips and processors inside smartphones and tablets.",
    heDescription: "קוואלקום מייצרת שבבי רדיו ומעבדים לטלפונים ולטאבלטים — בלעדיהם אין קליטה ואין אינטרנט.",
    childAnalogy: "כמו האנטנה הקטנה שמביאה את הקליטה לטלפון.",
    sector: "שבבים ומחשבים",
    category: "chips",
    logo: "📶",
  },
  ASML: {
    ticker: "ASML",
    name: "ASML",
    heName: "ASML (מכונות לשבבים)",
    description: "ASML builds the most precise machines in the world — they print the tiny circuits on chips.",
    heDescription: "ASML בונה מכונות ענק שמכינות שבבים בדיוק מטורף — המדויקות בעולם.",
    childAnalogy: "כמו מכונת קסמים שמציירת מיליון קווים דקים על גרגר אורז.",
    sector: "שבבים ומחשבים",
    category: "chips",
    logo: "🔬",
  },
  AVGO: {
    ticker: "AVGO",
    name: "Broadcom",
    heName: "ברודקום",
    description: "Broadcom builds the chips and the Wi-Fi parts that connect phones, computers and much of the internet.",
    heDescription: "ברודקום מייצרת שבבים וחלקי Wi-Fi שמחברים טלפונים, מחשבים והרבה מהאינטרנט.",
    childAnalogy: "הצנרת שמעבירה את האינטרנט לכל הבית.",
    sector: "שבבים ומחשבים",
    category: "chips",
    logo: "📡",
  },
  ARM: {
    ticker: "ARM",
    name: "Arm",
    heName: "ARM (שבבים לנייד)",
    description: "Arm designs the tiny low-power chips inside almost every phone and tablet — and is paid for each design it licenses.",
    heDescription: "ארם מתכננת את השבבים הקטנים והחסכניים שבתוך כמעט כל טלפון וטאבלט — ומקבלת תשלום על כל תוכנית שלה.",
    childAnalogy: "המתכננת שמציירת את השרטוטים — ומפעלים אחרים בונים לפיה.",
    sector: "שבבים ומחשבים",
    category: "chips",
    logo: "🔋",
  },
  RBLX: {
    ticker: "RBLX",
    name: "Roblox",
    heName: "רובלוקס",
    description: "Roblox is a huge online world where you build your own games and play them with friends.",
    heDescription: "רובלוקס הוא עולם ענק באינטרנט שבו בונים משחקים משלך ומשחקים עם חברים.",
    childAnalogy: "לקנות רובלוקס זה כמו לקנות חתיכה ממגרש הלגו הווירטואלי הכי גדול.",
    sector: "גיימינג ובידור",
    category: "gaming",
    logo: "🎮",
  },
  NTDOY: {
    ticker: "NTDOY",
    name: "Nintendo",
    heName: "נינטנדו",
    description: "The home of Mario, Luigi, Pikachu and the Nintendo Switch.",
    heDescription: "הבית של מריו, לואיג'י, פיקאצ'ו והקונסולה Nintendo Switch.",
    childAnalogy: "כמו להחזיק במפתחות לממלכת הפטריות ולמריו קארט.",
    sector: "גיימינג ובידור",
    category: "gaming",
    logo: "🍄",
  },
  SONY: {
    ticker: "SONY",
    name: "Sony",
    heName: "סוני",
    description: "The maker of PlayStation, Spider-Man movies and headphones — a Japanese entertainment giant.",
    heDescription: "הבית של PlayStation, של סרטי ספיידרמן ושל אוזניות. ענקית בידור מיפן.",
    childAnalogy: "היצרנית של הקונסולה שמחוברת לטלוויזיה שלך.",
    sector: "גיימינג ובידור",
    category: "gaming",
    logo: "🎮",
  },
  EA: {
    ticker: "EA",
    name: "Electronic Arts",
    heName: "אלקטרוניק ארטס",
    description: "The game maker behind the football and sports games millions of kids play.",
    heDescription: "מפתחת משחקי ספורט וכדורגל שמיליונים משחקים בהם.",
    childAnalogy: "החברה שמכינה את משחק הכדורגל שאתה משחק עם חברים.",
    sector: "גיימינג ובידור",
    category: "gaming",
    logo: "🏈",
  },
  DIS: {
    ticker: "DIS",
    name: "Disney",
    heName: "דיסני",
    description: "Disney makes magic with Mickey Mouse, Star Wars, Marvel heroes and giant theme parks.",
    heDescription: "דיסני עושה קסמים עם מיקי מאוס, מלחמת הכוכבים, גיבורי מארוול ופארקי שעשועים ענקיים.",
    childAnalogy: "לקנות דיסני זה לקנות חתיכה מהטירות, הסרטים והצעצועים שאתה אוהב.",
    sector: "גיימינג ובידור",
    category: "gaming",
    logo: "🏰",
  },
  TTWO: {
    ticker: "TTWO",
    name: "Take-Two (GTA)",
    heName: "טייק-טו (GTA)",
    description: "The studio behind Grand Theft Auto, NBA 2K and big open-world games.",
    heDescription: "האולפן מאחורי GTA, NBA 2K ומשחקי עולם פתוח ענקיים.",
    childAnalogy: "כמו להיות הבעלים של האולפן שבונה את המשחק הגדול.",
    sector: "גיימינג ובידור",
    category: "gaming",
    logo: "🌆",
  },
  MCD: {
    ticker: "MCD",
    name: "McDonald's",
    heName: "מקדונלד'ס",
    description: "The most famous burger chain in the world, with tens of thousands of restaurants.",
    heDescription: "רשת ההמבורגרים הגדולה בעולם — עשרות אלפי סניפים.",
    childAnalogy: "כל המבורגר שנמכר בעולם מכניס להם קצת.",
    sector: "אוכל ומסעדות",
    category: "food",
    logo: "🍟",
  },
  KO: {
    ticker: "KO",
    name: "Coca-Cola",
    heName: "קוקה קולה",
    description: "The most famous drink in the world — sold for more than 100 years.",
    heDescription: "המשקה המפורסם בעולם — נמכר כבר יותר מ-100 שנה.",
    childAnalogy: "שתייה שאף אחד לא מפסיק לקנות.",
    sector: "אוכל ומסעדות",
    category: "food",
    logo: "🥤",
  },
  PEP: {
    ticker: "PEP",
    name: "PepsiCo",
    heName: "פפסיקו",
    description: "The company behind Pepsi, Lay's, Doritos and Quaker oats.",
    heDescription: "החברה של פפסי, צ'יפס ליי'ז, דוריטוס וקוואקר.",
    childAnalogy: "החטיפים בארון שלך הם כמעט כולם שלהם.",
    sector: "אוכל ומסעדות",
    category: "food",
    logo: "🌮",
  },
  SBUX: {
    ticker: "SBUX",
    name: "Starbucks",
    heName: "סטארבקס",
    description: "The biggest coffee shop chain — people pay for a cup every morning.",
    heDescription: "רשת בתי הקפה הגדולה — אנשים משלמים על כוס כל בוקר.",
    childAnalogy: "החברה שמוכרת את הבקרים של כולם.",
    sector: "אוכל ומסעדות",
    category: "food",
    logo: "☕",
  },
  DPZ: {
    ticker: "DPZ",
    name: "Domino's Pizza",
    heName: "דומינו'ס פיצה",
    description: "The biggest pizza chain in the world — it bakes and delivers pizza to your door.",
    heDescription: "רשת הפיצה הגדולה — מכינה ומביאה פיצות עד הבית.",
    childAnalogy: "מי לא מזמין פיצה?",
    sector: "אוכל ומסעדות",
    category: "food",
    logo: "🍕",
  },
  CMG: {
    ticker: "CMG",
    name: "Chipotle",
    heName: "צ'יפוטלה",
    description: "Fast Mexican restaurants where burritos and tacos are built in front of you.",
    heDescription: "מסעדות מקסיקניות מהירות — בוריטו שנעשה מול העיניים.",
    childAnalogy: "הכריכים הגדולים שמתגלגלים מול העיניים.",
    sector: "אוכל ומסעדות",
    category: "food",
    logo: "🌯",
  },
  MDLZ: {
    ticker: "MDLZ",
    name: "Mondelez",
    heName: "מונדליז",
    description: "The company behind Oreo cookies, Milka and Toblerone chocolate.",
    heDescription: "החברה של אוראו, מילקה וטובלרון.",
    childAnalogy: "'אוראו טבול בחלב' — זה הם.",
    sector: "אוכל ומסעדות",
    category: "food",
    logo: "🍪",
  },
  YUM: {
    ticker: "YUM",
    name: "KFC & Pizza Hut",
    heName: "KFC ופיצה האט",
    description: "One company that owns KFC, Pizza Hut and Taco Bell — restaurants in nearly every country.",
    heDescription: "חברה אחת שמחזיקה את KFC, פיצה האט וטאקו בל — מסעדות בכמעט כל מדינה.",
    childAnalogy: "מסעדה אחת עם שלוש קופות: עוף, פיצה וטאקו.",
    sector: "אוכל ומסעדות",
    category: "food",
    logo: "🍗",
  },
  HSY: {
    ticker: "HSY",
    name: "Hershey",
    heName: "הרשי'ס",
    description: "The chocolate company behind Hershey's bars and Kisses — chocolate everyone has tasted.",
    heDescription: "חברת השוקולד מאחורי חטיפי הרשי'ס והקיסים — שוקולד שכולם טעמו.",
    childAnalogy: "השוקולד שהגיע לכיתה לפני כולם.",
    sector: "אוכל ומסעדות",
    category: "food",
    logo: "🍫",
  },
  KDP: {
    ticker: "KDP",
    name: "Dr Pepper & Keurig",
    heName: "ד\"ר פפר וקיוריג",
    description: "Dr Pepper, 7Up and the Keurig machine that makes hot chocolate and coffee at home in one click.",
    heDescription: "ד\"ר פפר, 7Up ומכונת קיוריג שמכינה בבית שוקו וקפה בלחיצה.",
    childAnalogy: "מכונת שתייה אישית שעומדת במטבח שלך.",
    sector: "אוכל ומסעדות",
    category: "food",
    logo: "🥤",
  },
  HAS: {
    ticker: "HAS",
    name: "Hasbro",
    heName: "הסברו",
    description: "The company behind Transformers, Play-Doh, Monopoly and Nerf.",
    heDescription: "החברה של טרנספורמרס, פליי-דו, מונופול ונרף.",
    childAnalogy: "לקנות חלק מהחברות שייצרו את הצעצועים שלך.",
    sector: "צעצועים",
    category: "toys",
    logo: "🧸",
  },
  MAT: {
    ticker: "MAT",
    name: "Mattel",
    heName: "מטל",
    description: "The company behind Barbie, Hot Wheels and Uno.",
    heDescription: "החברה של ברבי, הוט-וילס ו-Uno.",
    childAnalogy: "המכוניות הקטנות שאתה דורך עליהן — שלהם.",
    sector: "צעצועים",
    category: "toys",
    logo: "🚗",
  },
  COST: {
    ticker: "COST",
    name: "Costco",
    heName: "קוסטקו",
    description: "Giant warehouses with low prices; shoppers pay a yearly membership to get in.",
    heDescription: "מחסנים ענקיים עם מחירים זולים; אנשים משלמים מנוי כדי לקנות שם.",
    childAnalogy: "כמו סופר ענק עם עגלות ענקיות ומחירים זולים.",
    sector: "קניות",
    category: "shopping",
    logo: "🛒",
  },
  WMT: {
    ticker: "WMT",
    name: "Walmart",
    heName: "וולמארט",
    description: "The biggest shopping chain in the world — food, clothes and tools under one roof.",
    heDescription: "רשת הקניות הגדולה בעולם — אוכל, בגדים וכלים במקום אחד.",
    childAnalogy: "הסופר הכי גדול באמריקה.",
    sector: "קניות",
    category: "shopping",
    logo: "🏬",
  },
  TGT: {
    ticker: "TGT",
    name: "Target",
    heName: "טארגט",
    description: "The big American shop with the round red logo — clothes, toys and snacks under one roof.",
    heDescription: "החנות האמריקאית הגדולה עם העיגול האדום — בגדים, צעצועים וחטיפים במקום אחד.",
    childAnalogy: "חנות אחת שיש בה כל מה שצריך לבית.",
    sector: "קניות",
    category: "shopping",
    logo: "🎯",
  },
  NKE: {
    ticker: "NKE",
    name: "Nike",
    heName: "נייקי",
    description: "The biggest sport shoes and clothes brand, worn by famous athletes.",
    heDescription: "חברת הנעליים והספורט הגדולה — נעליים וחולצות של כוכבי ספורט.",
    childAnalogy: "החברה שהפכה נעליים לשם של ספורט.",
    sector: "מותגים וכרטיסים",
    category: "brands",
    logo: "👟",
  },
  V: {
    ticker: "V",
    name: "Visa",
    heName: "ויזה",
    description: "The card network that lets people pay anywhere in the world, taking a tiny slice of every purchase.",
    heDescription: "הכרטיס שמאפשר לשלם בכל העולם, ולוקחת אחוז קטן מכל קנייה — מיליוני קניות ביום.",
    childAnalogy: "כביש אגרה קטן שכל שקל בעולם עובר דרכו.",
    sector: "מותגים וכרטיסים",
    category: "brands",
    logo: "💳",
  },
  MA: {
    ticker: "MA",
    name: "Mastercard",
    heName: "מאסטרקארד",
    description: "The card network that lets people pay all over the world, taking a tiny slice of every purchase.",
    heDescription: "רשת הכרטיסים שמאפשרת לשלם בכל העולם וגובה אחוז קטן מכל קנייה.",
    childAnalogy: "כרטיס אחד שפותח דלתות בכל חנות בעולם.",
    sector: "מותגים וכרטיסים",
    category: "brands",
    logo: "💳",
  },
  LULU: {
    ticker: "LULU",
    name: "Lululemon",
    heName: "לולולמון",
    description: "The sportswear company famous for clothes that stretch — yoga, running and the gym.",
    heDescription: "חברת בגדי הספורט המפורסמת בבגדים שנמתחים — יוגה, ריצה וכושר.",
    childAnalogy: "בגדים שנמתחים איתך בכל תנועה.",
    sector: "מותגים וכרטיסים",
    category: "brands",
    logo: "🧘",
  },
  JNJ: {
    ticker: "JNJ",
    name: "Johnson & Johnson",
    heName: "ג'ונסון אנד ג'ונסון",
    description: "The company behind Band-Aid plasters and Tylenol — half of the medicine cabinet at home.",
    heDescription: "החברה שמאחורי פלסטרי בנדייד וטיילונול — חצי מארון התרופות בבית.",
    childAnalogy: "כמו להיות שותף במי שמכין את הפלסטר על הברך.",
    sector: "מותגים וכרטיסים",
    category: "brands",
    logo: "🩹",
  },
  "BRK.B": {
    ticker: "BRK.B",
    name: "Berkshire Hathaway",
    heName: "ברקשייר האת'וויי",
    description: "Warren Buffett's company: it owns Dairy Queen, Duracell batteries, GEICO and a pile of shares.",
    heDescription: "החברה של וורן באפט: היא מחזיקה את דיירי קווין, סוללות דוראסל, ג'ייקו ועוד המון מניות.",
    childAnalogy: "קופסה ענקית שבתוכה עוד עשרות חברות מוכרות.",
    sector: "מותגים וכרטיסים",
    category: "brands",
    logo: "🎩",
  },
  TSLA: {
    ticker: "TSLA",
    name: "Tesla",
    heName: "טסלה",
    description: "Tesla builds fast electric cars, giant batteries and futuristic robots.",
    heDescription: "טסלה בונה מכוניות חשמליות מהירות, סוללות ענק ורובוטים עתידניים.",
    childAnalogy: "טסלה היא כמו חברה מסרטי מדע בדיוני שבונה מכוניות שנוסעות לבד.",
    sector: "מכונות, מטוסים וחלל",
    category: "wheels",
    logo: "⚡",
  },
  CAT: {
    ticker: "CAT",
    name: "Caterpillar",
    heName: "קטרפילר",
    description: "Caterpillar builds tractors, diggers and giant machines for roads and mines.",
    heDescription: "קטרפילר בונה טרקטורים, מחפרונים ומכונות ענק לכבישים ולמכרות.",
    childAnalogy: "הכלים הכבדים שרואים בבנייה.",
    sector: "מכונות, מטוסים וחלל",
    category: "wheels",
    logo: "🚜",
  },
  BA: {
    ticker: "BA",
    name: "Boeing",
    heName: "בואינג",
    description: "Boeing builds giant passenger planes and parts that fly into space.",
    heDescription: "בואינג בונה מטוסי נוסעים ענקיים וגם חלקים שטסים לחלל.",
    childAnalogy: "המטוסים עם הלוגו שכולם מזהים בשמיים.",
    sector: "מכונות, מטוסים וחלל",
    category: "wheels",
    logo: "✈️",
  },
  RKLB: {
    ticker: "RKLB",
    name: "Rocket Lab",
    heName: "רוקט לאב",
    description: "Rocket Lab launches small satellites into space cheaply — a taxi to orbit.",
    heDescription: "רוקט לאב משגרת לוויינים קטנים לחלל במחיר זול — 'מונית לחלל'.",
    childAnalogy: "שליח שמביא לוויינים לחלל במקום חבילות לבית.",
    sector: "מכונות, מטוסים וחלל",
    category: "wheels",
    logo: "🚀",
  },
  F: {
    ticker: "F",
    name: "Ford",
    heName: "פורד",
    description: "One of the oldest car makers — it invented the moving assembly line and still builds pickups.",
    heDescription: "מהיצרניות הוותיקות בעולם — המציאה את פס הייצור ועדיין בונה טנדרים.",
    childAnalogy: "המכונית הראשונה שממש כולם יכלו לקנות.",
    sector: "מכונות, מטוסים וחלל",
    category: "wheels",
    logo: "🛻",
  },
  TM: {
    ticker: "TM",
    name: "Toyota",
    heName: "טויוטה",
    description: "The biggest car maker in the world, famous for the Prius and for cars that last forever.",
    heDescription: "יצרנית הרכב הגדולה בעולם, מפורסמת בפריוס ובמכוניות שנוסעות לנצח.",
    childAnalogy: "המכונית היפנית ששורדת כל דרך.",
    sector: "מכונות, מטוסים וחלל",
    category: "wheels",
    logo: "🚙",
  },
};

// ---------------------------------------------------------------------------
// Real closing prices measured 2026-09-28. Used only by the deterministic
// simulator fallback (and as a sanity floor) when live data is unreachable.
// ---------------------------------------------------------------------------
export const BASE_PRICES: Record<string, number> = {
  SPY: 767.27,
  QQQ: 738.27,
  VT: 159.16,
  SCHD: 33.03,
  GLD: 379.36,
  VNQ: 90.65,
  VTI: 352.51,
  SMH: 444.27,
  GOOGL: 342.39,
  MSFT: 512.1,
  AAPL: 340.13,
  AMZN: 247.14,
  META: 722.65,
  NFLX: 69.38,
  SPOT: 501.63,
  UBER: 68.55,
  ABNB: 157.66,
  DASH: 180.96,
  ORCL: 110.56,
  PYPL: 56.38,
  SNAP: 5.11,
  NVDA: 230.53,
  INTC: 116.11,
  AMD: 606.52,
  TSM: 453.66,
  QCOM: 190.19,
  ASML: 1779.48,
  AVGO: 348.84,
  ARM: 175.07,
  RBLX: 42.95,
  NTDOY: 12.55,
  SONY: 23.36,
  EA: 209.86,
  DIS: 105.28,
  TTWO: 208.77,
  MCD: 234.31,
  KO: 87.06,
  PEP: 128.0,
  SBUX: 95.56,
  DPZ: 291.57,
  CMG: 32.67,
  MDLZ: 60.0,
  YUM: 159.34,
  HSY: 174.1,
  KDP: 34.39,
  HAS: 89.58,
  MAT: 13.38,
  COST: 923.13,
  WMT: 108.64,
  TGT: 167.46,
  NKE: 36.38,
  V: 368.95,
  MA: 626.85,
  LULU: 105.57,
  JNJ: 267.23,
  "BRK.B": 572.21,
  TSLA: 359.15,
  CAT: 822.27,
  BA: 188.88,
  RKLB: 73.04,
  F: 11.23,
  TM: 211.42,
};

// Tickers that Alpaca does not serve (OTC / pink sheets) — these fall back to
// Yahoo Finance for their quote.
export const ALPACA_UNSUPPORTED_TICKERS = new Set(['NTDOY']);

// Yahoo writes some symbols with a dash where the exchange uses a dot
// (Berkshire's BRK.B is BRK-B on Yahoo), so the Yahoo quote/history path asks
// for the right symbol instead of 404-ing into the simulator.
const YAHOO_SYMBOLS: Record<string, string> = { 'BRK.B': 'BRK-B' };
const yahooSymbol = (ticker: string): string => YAHOO_SYMBOLS[ticker] || ticker;

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

export function simulatedQuote(ticker: string): StockQuote {
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
    description: info.description,
    heDescription: info.heDescription,
    childAnalogy: info.childAnalogy,
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
// memory for a few minutes. Keeps the UI fast with the whole catalogue.
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
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol(ticker)}?range=5d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return null;
    return quoteFromYahooChart(await res.json());
  } catch (err) {
    console.warn(`[MarketService] Yahoo quote failed for ${ticker}`, err);
    return null;
  }
}

/**
 * Pure mapping of one Alpaca snapshot entry → quote fields.
 * Returns null when the snapshot carries no usable price.
 */
export function quoteFromAlpacaSnapshot(snap: any): Partial<StockQuote> | null {
  const price = num(snap?.latestTrade?.p) ?? num(snap?.dailyBar?.c);
  if (price === null) return null;
  const prevClose = num(snap?.prevDailyBar?.c) ?? num(snap?.dailyBar?.o) ?? price;
  return {
    priceUsd: price,
    prevClose,
    high24h: num(snap?.dailyBar?.h) ?? price,
    low24h: num(snap?.dailyBar?.l) ?? price,
    volume: num(snap?.dailyBar?.v) ?? 0,
    lastUpdated: snap?.latestTrade?.t ?? new Date().toISOString(),
  };
}

/**
 * Pure mapping of a Yahoo Finance chart response → quote fields (used for
 * tickers Alpaca cannot serve, e.g. OTC ADRs like NTDOY).
 */
export function quoteFromYahooChart(data: any): Partial<StockQuote> | null {
  const result = data?.chart?.result?.[0];
  const quotes = result?.indicators?.quote?.[0];
  const timestamps: number[] = result?.timestamp;
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
}

/** Pure mapping of a Yahoo chart response → daily closes for the price chart. */
export function historyFromYahooChart(data: any): { date: string; price: number }[] {
  const result = data?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];
  return timestamps
    .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().split('T')[0], price: closes[i] }))
    .filter((p) => typeof p.price === 'number' && Number.isFinite(p.price))
    .map((p) => ({ date: p.date, price: Number((p.price as number).toFixed(2)) }));
}

/** Deterministic simulated price curve — the last-resort fallback for charts. */
export function simulatedHistory(
  ticker: string,
  range: '1D' | '1W' | '1M' | '1Y' = '1M'
): { date: string; price: number }[] {
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
}

export function mergeQuote(ticker: string, live: Partial<StockQuote> | null): StockQuote {
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
    description: info.description,
    heDescription: info.heDescription,
    childAnalogy: info.childAnalogy,
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
      live = quoteFromAlpacaSnapshot(snap);
    }

    // Tickers Alpaca cannot serve (or a missing batch entry) go to Yahoo.
    if (!live && ALPACA_UNSUPPORTED_TICKERS.has(ticker)) {
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
        `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol(ticker)}?range=${yahooRange}&interval=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (res.ok) {
        const history = historyFromYahooChart(await res.json());
        if (history.length >= 2) return history;
      }
    } catch (err) {
      console.warn(`[MarketService] Yahoo history failed for ${ticker}`, err);
    }

    return simulatedHistory(ticker, range);
  },
};

