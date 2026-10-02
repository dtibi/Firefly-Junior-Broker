#!/usr/bin/env python3
"""Seed the pre-lots book into lots (one-off, approved 2026-10-02).

The five lots below are the surviving positions of the legacy weighted-average
book, reconstructed from the app's own transaction log and reconciled against
Firefly III account 26 (₪181.00). All five were bought from the invest fund
(journals 257 / 277 / 291 / 302 / 311 are all `savings → investments`).

Closed history (DIS, MSFT, NTDOY, RBLX) is deliberately NOT invented: those
realized results stay in the Firefly journal and the statement. The 0.0001-share
AAPL dust lot (₪0.03) was voided in the cleanup, which is what makes the lots
sum to account 26 to the agora.

Refuses to write unless the container is stopped (the app keeps the DB in memory
and would overwrite the file) and unless every lot matches the live holding.

Usage:  docker stop firefly-broker && python3 scripts/seed-legacy-lots.py --apply && docker start firefly-broker
"""
import argparse
import json
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(REPO, "data", "db.json")

KID = "נתנאל"

# ticker, shares, principal local (= USD under PARITY), acquired date, buy journal
LEGACY_LOTS = [
    ("SPY", 0.1352, 100.00, "2026-07-23", "257"),
    ("INTC", 0.1552, 14.00, "2026-08-02", "277"),
    ("INTC", 0.2884, 32.00, "2026-09-17", "311"),
    ("TSLA", 0.0438, 15.00, "2026-08-16", "291"),
    ("GOOGL", 0.0592, 20.00, "2026-08-31", "302"),
]


def container_running() -> bool:
    try:
        out = subprocess.run(
            ["docker", "ps", "--filter", "name=firefly-broker", "--format", "{{.Names}}"],
            capture_output=True, text=True, timeout=20,
        )
        return "firefly-broker" in out.stdout
    except Exception:
        return False


def build_lots(index: int) -> list:
    lots = []
    for i, (ticker, shares, principal, acquired, journal) in enumerate(LEGACY_LOTS):
        lots.append({
            "id": f"lot-legacy-{ticker.lower()}-{acquired.replace('-', '')}"
                  + (f"-{i}" if any(l[0] == ticker for l in LEGACY_LOTS[:i]) else ""),
            "profileName": KID,
            "ticker": ticker,
            "shares": shares,
            "originalShares": shares,
            "principalLocal": principal,
            "originalPrincipalLocal": principal,
            "principalUsd": principal,  # PARITY: ₪1 = $1
            "priceUsdAtBuy": round(principal / shares, 2),
            "acquiredAt": f"{acquired}T12:00:00.000Z",
            "fundingSource": "FUND",
            "fireflyTransactionId": journal,
            "status": "OPEN",
        })
    return lots


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write to data/db.json (default: dry run)")
    args = ap.parse_args()

    db = json.load(open(DB))
    holdings = {h["ticker"]: h for h in db["holdings"] if h["profileName"] == KID}
    lots = build_lots(0)

    # 1. Every seeded lot must match a live holding.
    problems = []
    for lot in lots:
        held = holdings.get(lot["ticker"])
        if not held:
            problems.append(f"{lot['id']}: no live holding for {lot['ticker']}")
            continue
    for ticker, held in holdings.items():
        seeded = [l for l in lots if l["ticker"] == ticker]
        seeded_shares = round(sum(l["shares"] for l in seeded), 4)
        seeded_principal = round(sum(l["principalLocal"] for l in seeded), 2)
        if abs(seeded_shares - held["shares"]) > 0.0001 or abs(seeded_principal - held["originalPrincipalUsd"]) > 0.01:
            problems.append(
                f"{ticker}: seeded {seeded_shares} sh / ₪{seeded_principal} "
                f"!= holding {held['shares']} sh / ₪{held['originalPrincipalUsd']}"
            )

    total = round(sum(l["principalLocal"] for l in lots), 2)
    if abs(total - 181.00) > 0.001:
        problems.append(f"total principal {total} != Firefly account 26 (181.00)")

    print(f"lots to seed: {len(lots)}  total principal ₪{total}")
    for lot in lots:
        print(f"  {lot['id']:34s} {lot['ticker']:6s} {lot['shares']:.4f} sh  ₪{lot['principalLocal']:7.2f}  {lot['acquiredAt'][:10]}  ff={lot['fireflyTransactionId']}")

    if problems:
        print("\nREFUSING TO SEED:")
        for p in problems:
            print("  - " + p)
        return 1

    if not args.apply:
        print("\ndry run OK — nothing written (pass --apply to write)")
        return 0

    if container_running():
        print("\nREFUSING: firefly-broker is running — stop it first (the DB is cached in memory).")
        return 1
    if len(db.get("lots") or []) > 0:
        print(f"\nREFUSING: {len(db['lots'])} lots already exist — nothing to do.")
        return 1

    db["lots"] = lots
    json.dump(db, open(DB, "w"), ensure_ascii=False, indent=2)
    print(f"\nseeded {len(lots)} lots into {DB}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
