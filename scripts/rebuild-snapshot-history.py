#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Deep repair of the daily-snapshot history ("ביצועי ההון שלי") from the ledger.

Two modes:

  python3 scripts/rebuild-snapshot-history.py                 # PLAN — needs the app running
  python3 scripts/rebuild-snapshot-history.py --apply         # APPLY — container must be STOPPED

Why it exists: the app's own catch-up (catchUpMissingSnapshots in server.ts) rebuilds days from
the lots + the ledger, which covers every day since the lots model started (02.10.2026). Days
BEFORE that — where the app's old code valued the chart from the legacy holdings table and was
provably wrong (13.08.2026: the stored stock value 101.09 was smaller than SPY alone, 0.1352 x
777.88 = 105.17) — need the ledger itself: the share-bearing journals of the investments account
street-walked day by day. That is what this script does.

Method (validated: the backwards walk ends on EXACTLY the live holdings, and the rebuilt modern
days match the post-20.10 snapshots within a few agorot):
    value(day) = invest-fund cash (#6/#9) on that day + Σ(open shares × that day's close)
    positions  = the ledger's buys/sells (shares are stated in the description; a sale booked as
                 "מכירת TICKER: ₪X חזרו..." is matched to the lot it names by ticker + purchase
                 date + principal)
    deposits   = kept exactly as measured (the baseline never depended on the stock valuation);
                 the 35-day gap is filled by the ledger's allowance/deposit legs
    cash/stock for a closed lot on its own closing day: already sold (the writer values what is
    open when it runs at 23:50)

Inputs (all read-only): Firefly per-account daily balances + the investments account's journals
(`docker exec firefly-broker node ... > ff-daily.json`, see the file header of ff-daily.js), the
trade log/lots in data/db.json, and daily closes from /api/stocks/<ticker>/history?range=1Y.
"""
import json, re, shutil, sys, urllib.parse, urllib.request
from datetime import date, timedelta

BASE = 'http://localhost:3000'
SCRATCH = '/root/.hermes/cache/scratch'
DB = '/root/Firefly-Junior-Broker/data/db.json'
WRITE = '--write' in sys.argv

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=90) as r:
        return json.load(r)

ff = json.load(open(SCRATCH + '/ff-daily.json', encoding='utf-8'))
db = json.load(open(DB, encoding='utf-8'))

KIDS = {'נתנאל': {'fund': '6', 'pocket': '4', 'invest': '26'},
        'רוני':  {'fund': '9', 'pocket': '7', 'invest': '27'}}
START, LAST = '2026-07-19', '2026-11-22'   # 23.11 stays as the app wrote it today

BUY_RE = re.compile(r'קניית ([\d.]+) מניות ([A-Z.]+)')
SELL_RE = re.compile(r'מכירת ([\d.]+) מניות ([A-Z.]+)')
SELL_MONEY_RE = re.compile(r'מכירת ([A-Z.]+):')
LOT_REF_RE = re.compile(r'מגרש מ-(\d{4}-\d{2}-\d{2})')
NOT_A_SALE_RE = re.compile(r'(הפסד|רווח) במכירת')

_closes = {}
def closes(ticker):
    if ticker not in _closes:
        try:
            h = get('/api/stocks/%s/history?range=1Y' % urllib.parse.quote(ticker))['history']
            _closes[ticker] = {p['date']: p['price'] for p in h}
        except Exception:
            _closes[ticker] = {}
    return _closes[ticker]

def close_on(ticker, day):
    hist = closes(ticker)
    best = None
    for d in hist:
        if d <= day and (best is None or d > best):
            best = d
    return hist[best] if best else None

def bal_on(acc_id, day):
    daily = ff['accounts'][acc_id]['daily']
    best = None
    for d in daily:
        if d <= day and (best is None or d > best):
            best = d
    return daily[best] if best else 0.0

def share_events(kid, acc_id):
    """The ledger's share-bearing journals, in date order, with the shares each one moves."""
    lots = [l for l in db['lots'] if l['profileName'] == kid]
    evts = []
    for e in ff['accounts'][acc_id]['events']:
        m = BUY_RE.search(e['desc'])
        if m:
            evts.append((e['date'], m.group(2), +float(m.group(1)), e['desc']))
            continue
        m = SELL_RE.search(e['desc'])
        if m:
            evts.append((e['date'], m.group(2), -float(m.group(1)), e['desc']))
            continue
        if NOT_A_SALE_RE.search(e['desc']):
            continue                     # a profit/loss leg moves money, not shares
        m = SELL_MONEY_RE.search(e['desc'])
        if m:
            tk = m.group(1)
            ref = LOT_REF_RE.search(e['desc'])
            cand = [l for l in lots if l['ticker'] == tk and l.get('closedAt') and
                    str(l['closedAt'])[:10] == e['date']]
            if ref:
                cand = [l for l in cand if str(l.get('acquiredAt'))[:10] == ref.group(1)]
            by_amount = [l for l in cand
                         if abs(float(l.get('originalPrincipalLocal') or l.get('principalLocal') or -1)
                                - float(e['amount'])) < 0.005]
            chosen = None
            if len(by_amount) == 1:
                chosen = by_amount[0]
            elif len(cand) == 1:
                chosen = cand[0]
            if chosen:
                n = (chosen.get('originalShares') or 0) or (chosen.get('shares') or 0)
                evts.append((e['date'], tk, -float(n), e['desc']))
            else:
                evts.append((e['date'], tk, None, e['desc']))   # unresolved → reported
    evts.sort(key=lambda x: x[0])
    return evts

def shares_series(kid, acc_id):
    """day -> {ticker: shares}, walking the ledger events day by day."""
    evts = share_events(kid, acc_id)
    unresolved = [e for e in evts if e[2] is None]
    held = {}
    series = {}
    by_day = {}
    for d, tk, n, desc in evts:
        by_day.setdefault(d, []).append((tk, n, desc))
    for d in sorted(by_day):
        for tk, n, desc in by_day[d]:
            if n is None:
                continue
            held[tk] = round(held.get(tk, 0) + n, 6)
        series[d] = {k: v for k, v in held.items() if v > 0}
    return series, unresolved

def shares_on(series, day):
    best = None
    for d in series:
        if d <= day and (best is None or d > best):
            best = d
    return series[best] if best else {}

report = {}
proposal = {}
for kid, acc in KIDS.items():
    q = urllib.parse.quote(kid)
    pf = get('/api/portfolio/' + q)
    existing = {s['date']: s for s in pf['snapshots']}
    live_holdings = {h['ticker']: round(h['shares'], 6) for h in pf['holdings']}
    series, unresolved = shares_series(kid, acc['invest'])

    # cross-check 1: the walk must end on exactly the live holdings
    reconstructed_today = shares_on(series, '2026-11-23')
    EPS = 1e-3
    ok_today = all(abs(reconstructed_today.get(t, 0) - n) < EPS for t, n in live_holdings.items()) and \
               all(abs(live_holdings.get(t, 0) - n) < EPS for t, n in reconstructed_today.items())
    drift = {t: round(reconstructed_today.get(t, 0) - live_holdings.get(t, 0), 6)
             for t in set(reconstructed_today) | set(live_holdings)
             if abs(reconstructed_today.get(t, 0) - live_holdings.get(t, 0)) > 1e-6}

    ext = {}
    st = get('/api/ledger/' + q + '/statement')
    for m in st['movements']:
        if m.get('section') == 'INVEST' and m.get('kind') in ('ALLOWANCE', 'DEPOSIT', 'SAVING'):
            ext[m['date']] = ext.get(m['date'], 0) + (m.get('balanceDeltaLocal') or 0)

    rows, diffs, jumps = [], [], []
    d = date.fromisoformat(START)
    end = date.fromisoformat(LAST)
    while d <= end:
        day = d.isoformat()
        held = shares_on(series, day)
        stock, prices = 0.0, {}
        for tk, n in held.items():
            c = close_on(tk, day)
            if c is None:
                print('  !! no close for', tk, 'on', day)
                continue
            prices[tk] = round(c, 2)
            stock += n * c
        fund = bal_on(acc['fund'], day)
        pocket = bal_on(acc['pocket'], day)
        if day in existing:
            deposits = existing[day]['cumulativeDepositsLocal']
        else:
            prior = max([k for k in existing if k < day], default=None)
            base = existing[prior]['cumulativeDepositsLocal'] if prior else 0.0
            deposits = round(base + sum(v for k2, v in ext.items() if prior and prior < k2 <= day), 2)
        rows.append({'date': day, 'cash': round(fund, 2), 'pocket': round(pocket, 2), 'stock': round(stock, 2),
                     'value': round(fund + stock, 2), 'deposits': deposits, 'shares': held, 'prices': prices})
        d += timedelta(days=1)

    for i, r in enumerate(rows):
        e = existing.get(r['date'])
        if not e:
            diffs.append(('NEW', r['date'], None, r['value'], None))
        else:
            dv = round(r['value'] - e['totalValueLocal'], 2)
            if abs(dv) > 0.05:
                diffs.append(('DIFF', r['date'], e['totalValueLocal'], r['value'], dv))
        if i:
            a, b = rows[i - 1]['value'], r['value']
            if a > 0 and abs(b - a) / a > 0.12:
                jumps.append((r['date'], a, b, round((b - a) / a * 100, 2)))

    report[kid] = {
        'walk_ends_on_live_holdings': ok_today,
        'drift_vs_live': drift,
        'reconstructed_today': reconstructed_today,
        'live_holdings': live_holdings,
        'unresolved_sale_rows': [(u[0], u[1], u[3][:50]) for u in unresolved],
        'new_rows': len([x for x in diffs if x[0] == 'NEW']),
        'changed_rows': len([x for x in diffs if x[0] == 'DIFF']),
        'max_abs_change': max([abs(x[4]) for x in diffs if x[0] == 'DIFF'] or [0]),
        'diffs': diffs,
        'jumps': jumps,
        'last_row': rows[-1],
    }
    proposal[kid] = rows

with open(SCRATCH + '/snapshot-rebuild-proposal.json', 'w', encoding='utf-8') as f:
    json.dump(proposal, f, ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- write step
if WRITE:
    import datetime as _dt
    stamp = _dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = '/root/backups/db.json.bak-snapshots-%s' % stamp
    shutil.copy(DB, backup)
    db = json.load(open(DB, encoding='utf-8'))
    ex_snaps = {(s['profileName'], s['date']): s for s in db['snapshots']}
    before_after = []
    added, updated = 0, 0
    for kid, rows in proposal.items():
        for r in rows:
            key = (kid, r['date'])
            row = ex_snaps.get(key, {})
            new_row = dict(row)
            new_row.update({
                'date': r['date'],
                'profileName': kid,
                'totalValueUsd': r['value'],
                'totalValueLocal': r['value'],
                'cashUsd': r['cash'],
                'stockValueUsd': r['stock'],
                'cumulativeDepositsUsd': r['deposits'],
                'cumulativeDepositsLocal': r['deposits'],
                'investFundLocal': r['cash'],
                'spendingLocal': r['pocket'],
            })
            if key not in ex_snaps:
                db['snapshots'].append(new_row)
                added += 1
            else:
                if abs(float(row.get('totalValueLocal') or 0) - r['value']) > 0.001:
                    before_after.append({'kid': kid, 'date': r['date'],
                                         'oldValue': row.get('totalValueLocal'), 'newValue': r['value'],
                                         'oldCash': row.get('cashUsd'), 'newCash': r['cash'],
                                         'oldStock': row.get('stockValueUsd'), 'newStock': r['stock']})
                    updated += 1
                db['snapshots'][db['snapshots'].index(row)] = new_row
    db['snapshots'].sort(key=lambda s: (s['profileName'], s['date']))
    with open(DB, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    out = '/root/backups/snapshots-rebuild-%s.json' % stamp
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'backup': backup, 'added': added, 'updated': updated,
                   'rowsAfter': len(db['snapshots']), 'changedRows': before_after}, f,
                  ensure_ascii=False, indent=1)
    print('WRITTEN: backup=%s | added=%d | updated=%d | export=%s | snapshots now=%d' % (
        backup, added, updated, out, len(db['snapshots'])))

for kid, r in report.items():
    print('=' * 72)
    print(kid)
    print('  הליכה אחורה מגיעה בדיוק להחזקות החיות:', r['walk_ends_on_live_holdings'], '| סטייה:', r['drift_vs_live'])
    print('  משוחזר היום:', r['reconstructed_today'])
    print('  החזקות חיות:', r['live_holdings'])
    if r['unresolved_sale_rows']:
        print('  שורות מכירה בלי מספר מניות:', r['unresolved_sale_rows'])
    print('  שורות חדשות: %d | שורות ששונו: %d | מקסימום שינוי: %.2f' % (
        r['new_rows'], r['changed_rows'], r['max_abs_change']))
    print('  קפיצות מעל 12%% בין ימים (אמורות להתאים להפקדות/מכירות אמיתיות):')
    for j in r['jumps']:
        print('     ', j)
    print('  כל השינויים (תאריך, מדוד, משוחזר, Δ):')
    for x in r['diffs']:
        print('     ', x)
    lr = r['last_row']
    print('  שורה אחרונה (%s): מזומן %.2f + מניות %.2f = %.2f | הפקדות %.2f' % (
        lr['date'], lr['cash'], lr['stock'], lr['value'], lr['deposits']))
print('\nWRITE mode:', WRITE)


# ---------------------------------------------------------------------------------------------
# APPLY mode: run this block (scripts/apply-snapshot-rebuild.py, shipped alongside) after the
# plan run saved its proposal, with the container STOPPED:
#   docker stop firefly-broker
#   python3 scripts/apply-snapshot-rebuild.py
#   docker start firefly-broker
# It copies data/db.json to /root/backups/ first and exports every changed row to
# /root/backups/snapshots-rebuild-<stamp>.json, so the rollback is a file copy.
# ---------------------------------------------------------------------------------------------
