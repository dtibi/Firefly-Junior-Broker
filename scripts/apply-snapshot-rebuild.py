#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Applies the proposal written by scripts/rebuild-snapshot-history.py (container STOPPED).

Backs data/db.json up first and exports every changed row, so the rollback is a file copy.
"""
import json, shutil, sys, datetime

DB = '/root/Firefly-Junior-Broker/data/db.json'
PROP = '/root/.hermes/cache/scratch/snapshot-rebuild-proposal.json'
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')

proposal = json.load(open(PROP, encoding='utf-8'))
backup = '/root/backups/db.json.bak-snapshots-%s' % stamp
shutil.copy(DB, backup)

db = json.load(open(DB, encoding='utf-8'))
index = {(s['profileName'], s['date']): i for i, s in enumerate(db['snapshots'])}
before_after, added, updated = [], 0, 0

for kid, rows in proposal.items():
    for r in rows:
        key = (kid, r['date'])
        fields = {
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
        }
        if key in index:
            old = db['snapshots'][index[key]]
            if abs(float(old.get('totalValueLocal') or 0) - r['value']) > 0.001:
                before_after.append({'kid': kid, 'date': r['date'],
                                     'oldValue': old.get('totalValueLocal'), 'newValue': r['value'],
                                     'oldCash': old.get('cashUsd'), 'newCash': r['cash'],
                                     'oldStock': old.get('stockValueUsd'), 'newStock': r['stock']})
                updated += 1
            merged = dict(old)
            merged.update(fields)
            db['snapshots'][index[key]] = merged
        else:
            db['snapshots'].append(fields)
            added += 1

db['snapshots'].sort(key=lambda s: (s['profileName'], s['date']))
with open(DB, 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

out = '/root/backups/snapshots-rebuild-%s.json' % stamp
with open(out, 'w', encoding='utf-8') as f:
    json.dump({'backup': backup, 'added': added, 'updated': updated,
               'snapshotsNow': len(db['snapshots']), 'changedRows': before_after}, f,
              ensure_ascii=False, indent=1)

print('backup   :', backup)
print('added    :', added)
print('updated  :', updated)
print('export   :', out)
print('snapshots:', len(db['snapshots']))
print('biggest changes:')
for c in sorted(before_after, key=lambda x: -abs(x['newValue'] - x['oldValue']))[:8]:
    print('   ', c)
