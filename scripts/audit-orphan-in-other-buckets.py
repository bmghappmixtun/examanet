#!/usr/bin/env python3
"""Cherche les 574 PDF orphelins dans les AUTRES buckets R2 du compte.

2026-11-13 — le bucket de sauvegarde off-site du projet est `examanet-architecture`
(même compte). Si les objets du bucket PDF y sont répliqués, les 574 PDF sont
récupérables.
"""
import csv
import json
import os
import urllib.parse
import urllib.request

ACCOUNT = "59cffdeaadf3809cc3d2039c43f836e0"
TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
CSV_PATH = "/workspace/edutunisie/output/orphan-resources-2026-11-12.csv"
BUCKETS = [
    "examanet-architecture",
    "examanet-cache",
    "examanet-poc-cache",
    "examanet-text-prod",
    "primaireprivee-pdfs",
]


def list_keys(bucket):
    keys = []
    cursor = None
    while True:
        url = (
            f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}"
            f"/r2/buckets/{bucket}/objects?per_page=1000"
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
        cursor = (data.get("result_info") or {}).get("cursor")
        if not cursor:
            break
    return keys


missing = set()
with open(CSV_PATH, encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        missing.add(row["r2Key"])
basenames = {k.rsplit("/", 1)[-1] for k in missing}
print(f"Clés manquantes à retrouver : {len(missing)}\n")

for bucket in BUCKETS:
    try:
        keys = list_keys(bucket)
    except Exception as e:  # noqa: BLE001
        print(f"- {bucket}: erreur {e}")
        continue
    kset = set(keys)
    exact = missing & kset
    base = {k for k in keys if k.rsplit("/", 1)[-1] in basenames}
    print(f"- {bucket}: {len(keys)} objets | correspondance exacte : {len(exact)} | même nom de fichier : {len(base)}")
    if exact:
        out = f"/workspace/edutunisie/output/orphan-recovered-{bucket}.csv"
        with open(CSV_PATH, encoding="utf-8-sig") as f, open(out, "w", newline="", encoding="utf-8-sig") as g:
            r = csv.DictReader(f)
            w = csv.writer(g)
            w.writerow(["numericId", "title", "classSlug", "subjectSlug", "r2Key", "bucket"])
            for row in r:
                if row["r2Key"] in exact:
                    w.writerow([row["numericId"], row["title"], row.get("classSlug", ""),
                                row.get("subjectSlug", ""), row["r2Key"], bucket])
        print(f"  → récupérables : {len(exact)} (liste : {out})")
    if base:
        print(f"  → noms de fichier présents mais chemin différent : {len(base)}")
