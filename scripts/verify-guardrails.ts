/**
 * Guardrail verification for the money-moving endpoint (/api/trade).
 *
 * Sends deliberately INVALID requests and asserts the server answers with the
 * message produced by the unit-tested rules in src/server/rules.ts.
 *
 * SAFETY RULE — learned the hard way: a "clearly invalid" ₪10 SPY order turned
 * out to be a legal 0.0131-share trade and really executed. So every request is
 * first pushed through the SAME pure rules the server uses, with the SAME live
 * price, and this script REFUSES to send it unless those rules prove it cannot
 * execute. Never add a check without that proof.
 *
 * The 4-digit PIN is matched in memory from the stored hash and never printed.
 * Run: npm run verify:guardrails   (server must be running)
 */
import { Database } from '../src/server/db.js';
import { planBuy, validateBuyFunds } from '../src/server/rules.js';
import type { Holding } from '../src/types.js';

const BASE = process.env.APP_URL || 'http://localhost:3000';
const PROFILE = 'נתנאל';

function findPin(): string {
  for (let i = 0; i < 10000; i++) {
    const candidate = String(i).padStart(4, '0');
    if (Database.verifyPin(PROFILE, candidate)) return candidate;
  }
  throw new Error('no PIN matched for ' + PROFILE);
}

async function get(path: string): Promise<any> {
  const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
  return res.json();
}

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

interface Check {
  label: string;
  /** Proof from the shared rules that the server must reject this request. */
  proof: { ok: boolean; error?: string };
  run: (pin: string) => Promise<{ status: number; json: any }>;
  expect: RegExp;
}

async function main() {
  const pin = findPin();
  console.log('PIN matched in memory (never printed): yes');
  console.log('server:', BASE);

  // Live data, so the pre-flight proof uses exactly what the server will use.
  const stocks = await get('/api/stocks');
  const price = (ticker: string): number =>
    stocks?.stocks?.find((s: any) => s.ticker === ticker)?.priceUsd ?? Infinity;
  const portfolio = await get('/api/portfolio/' + encodeURIComponent(PROFILE));
  const holdings: Holding[] = portfolio?.holdings ?? [];
  const pocketLocal: number = portfolio?.summary?.pocketLocal ?? 0;
  const fxRate: number = portfolio?.summary?.fxRate ?? 0.33;
  const currencyMode = portfolio?.summary?.currencyMode ?? 'PARITY';

  const firstHolding =
    holdings.find((h) => h.ticker === 'SPY') ??
    holdings[0] ?? { profileName: PROFILE, ticker: 'SPY', shares: 1, averagePriceUsd: 100,
      originalPrincipalUsd: 100, lastUpdated: '' };

  // The lots the kid actually owns — used to probe the sell-selection guardrail.
  const openLots: any[] = (portfolio?.lots ?? []).filter((l: any) => l.status === 'OPEN');
  const sellTicker: string = openLots[0]?.ticker ?? firstHolding.ticker;
  console.log(`lots: ${openLots.length} open (sell probe: ${sellTicker})`);

  console.log(`live data: SPY $${price('SPY')} · pocket ₪${pocketLocal} · ${holdings.length} holdings`);

  // A sub-0.01 share slice only exists for a ticker expensive enough that even
  // the minimum order (₪10) buys less than 0.01 shares → price > $1000.
  const expensive = (stocks?.stocks ?? []).find((s: any) => s.priceUsd > 1000);
  console.log(expensive
    ? `sub-0.01 probe ticker: ${expensive.ticker} @ $${expensive.priceUsd}`
    : 'sub-0.01 probe: no ticker above $1000 today — check skipped');

  const checks: Check[] = [
    {
      label: 'BUY below the minimum order size',
      proof: planBuy({ ticker: 'NKE', amountLocal: 5, priceUsd: price('NKE'), currencyMode, fxRate }),
      run: (p) => post('/api/trade', { profileName: PROFILE, pin: p, ticker: 'NKE', type: 'BUY', amount: 5 }),
      expect: /Minimum order size/,
    },
    ...(expensive ? [{
      label: `BUY that would be a sub-0.01 share slice (${expensive.ticker})`,
      proof: planBuy({ ticker: expensive.ticker, amountLocal: 10,
        priceUsd: expensive.priceUsd, currencyMode, fxRate }),
      run: (p: string) => post('/api/trade', { profileName: PROFILE, pin: p, ticker: expensive.ticker,
        type: 'BUY', amount: 10 }),
      expect: /fraction below/,
    }] : []),
    {
      label: 'BUY paid from the pocket for more than the pocket holds (the app must never move money to cover it)',
      proof: validateBuyFunds({
        fundingSource: 'POCKET',
        amountLocal: pocketLocal + 1000,
        pocketLocal,
        fundLocal: 0,
      }),
      run: (p) => post('/api/trade', { profileName: PROFILE, pin: p, ticker: 'NKE', type: 'BUY',
        amount: pocketLocal + 1000, fundingSource: 'POCKET' }),
      expect: /אין מספיק כסף/,
    },
    {
      label: 'SELL a lot that does not exist',
      proof: { ok: false, error: 'no open lot carries that id' },
      run: (p) => post('/api/trade', { profileName: PROFILE, pin: p, ticker: sellTicker, type: 'SELL',
        lotIds: ['lot-does-not-exist'] }),
      expect: /כבר לא זמין|אין לך מניות/,
    },
    {
      label: 'trade with a wrong PIN',
      proof: { ok: false, error: 'the PIN does not match the stored hash' },
      run: (p) => post('/api/trade', { profileName: PROFILE, pin: p === '0000' ? '1111' : '0000',
        ticker: 'NKE', type: 'BUY', amount: 20 }),
      expect: /Incorrect 4-digit PIN/,
    },
  ];

  let failures = 0;
  for (const check of checks) {
    if (check.proof.ok) {
      failures++;
      console.log(`FAIL  ${check.label} → REFUSED TO SEND: the rules say this request would be legal (${check.proof.error ?? 'ok'})`);
      continue;
    }
    const { status, json } = await check.run(pin);
    const message = json?.error ?? JSON.stringify(json);
    const rejected = status === 400 || status === 401 || status === 403;
    const matches = check.expect.test(String(message));
    if (!rejected || !matches) failures++;
    console.log(
      `${rejected && matches ? 'PASS' : 'FAIL'}  ${check.label} → ${status} ${JSON.stringify(message).slice(0, 110)}`
    );
  }

  console.log(failures === 0 ? 'ALL GUARDRAILS IN PLACE' : `${failures} GUARDRAIL CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('verification crashed:', err);
  process.exit(2);
});
