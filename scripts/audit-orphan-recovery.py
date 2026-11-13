#!/usr/bin/env python3
"""Cherche les PDF « orphelins » (clé absente du bucket R2) sous une autre clé.

2026-11-13 — l'hypothèse « les 574 = les .doc/.docx supprimés (bouton prof) »
ne colle pas avec les données : seules 3 des 574 ressources ont
`TeacherFile.isOriginalLost = 1` (le vrai lot "original prof perdu" = 1 941
ressources). Les 574 sont des PDF PUBLICS absents du bucket PDF.

Avant de conclure "perdu définitif", on cherche si ces objets existent sous
une autre clé (préfixe différent, casing, suffixe) → sinon ils sont
récupérables et le 404 peut disparaître.
"""
import csv
import json
import os
import urllib.parse
import time
import urllib.request
from collections import defaultdict

ACCOUNT = "59cffdeaadf3809cc3d2039c43f836e0"
BUCKET = "examanet-pdf-prod"
TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
CSV_PATH = "/workspace/edutunisie/output/orphan-resources-2026-11-12.csv"
OUT_PATH = "/workspace/edutunisie/output/orphan-recovery-candidates-2026-11-13.csv"


def list_r2_keys():
    keys = []
    cursor = None
    page = 0
    while True:
        url = (
            f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}"
            f"/r2/buckets/{BUCKET}/objects?per_page=1000"
        )
        if cursor:
            url += "&cursor=" + urllib.parse.quote(cursor)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.load(r)
        res = data.get("result") or []
        if isinstance(res, dict):
            res = res.get("objects", [])
        keys.extend(o["key"] for o in res)
        page += 1
        info = data.get("result_info") or {}
        cursor = info.get("cursor")
        print(f"  page {page}: {len(res)} (total {len(keys)})", flush=True)
        if not cursor:
            break
    return keys


def main():
    print(f"R2 : listage de {BUCKET}…", flush=True)
    r2_keys = list_r2_keys()
    r2_set = set(r2_keys)
    print(f"R2 : {len(r2_keys)} objets\n")

    by_basename = defaultdict(list)
    by_suffix = defaultdict(list)
    by_lower = defaultdict(list)
    for k in r2_keys:
        by_basename[k.rsplit("/", 1)[-1]].append(k)
        by_lower[k.lower()].append(k)
        parts = k.split("/", 1)
        if len(parts) == 2:
            by_suffix[parts[1]].append(k)

    orphans = []
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            orphans.append(row)
    print(f"Orphelines : {len(orphans)}\n")

    stats = {"exact": 0, "basename": 0, "suffix": 0, "lower": 0, "perdu": 0}
    candidates = []
    for row in orphans:
        key = row["r2Key"]
        base = key.rsplit("/", 1)[-1]
        suffix = key.split("/", 1)[1] if "/" in key else key
        found = []
        kind = "perdu"
        if key in r2_set:
            stats["exact"] += 1
            found, kind = [key], "exact"
        else:
            hits = by_basename.get(base, [])
            if hits:
                stats["basename"] += 1
                found, kind = hits, "basename"
            else:
                hits = by_suffix.get(suffix, [])
                if hits:
                    stats["suffix"] += 1
                    found, kind = hits, "suffix"
                else:
                    hits = by_lower.get(key.lower(), [])
                    if hits:
                        stats["lower"] += 1
                        found, kind = hits, "lower"
                    else:
                        stats["perdu"] += 1
        candidates.append(
            {
                "numericId": row["numericId"],
                "title": row["title"],
                "classSlug": row.get("classSlug", ""),
                "subjectSlug": row.get("subjectSlug", ""),
                "missingKey": key,
                "recoveredAs": " | ".join(found[:3]),
                "matchType": kind,
            }
        )

    print("=== Résultat de la recherche de clé de remplacement ===")
    for k, v in stats.items():
        print(f"  {k:9s} : {v}")
    print(f"  récupérables: {stats['basename'] + stats['suffix'] + stats['lower']}")

    with open(OUT_PATH, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(
            ["numericId", "title", "classSlug", "subjectSlug", "missingKey", "recoveredAs", "matchType"]
        )
        for c in candidates:
            w.writerow([c[k] for k in
                        ("numericId", "title", "classSlug", "subjectSlug", "missingKey", "recoveredAs", "matchType")])
    print(f"\nCSV : {OUT_PATH}")


if __name__ == "__main__":
    main()
