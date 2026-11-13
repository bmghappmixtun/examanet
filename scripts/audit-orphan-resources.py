#!/usr/bin/env python3
"""Compte les ressources PUBLISHED dont l'objet R2 est absent (orphelines).

Compare l'ensemble des cles R2 du bucket `examanet-pdf-prod` avec les
`Resource.fileKey` / `fileUrl` des ressources PUBLISHED en D1.
"""
import json
import os
import subprocess
import urllib.parse
import urllib.request

ACCOUNT = "59cffdeaadf3809cc3d2039c43f836e0"
BUCKET = "examanet-pdf-prod"
DB_ID = "22ad2e7f-1692-486e-9131-d6c4062012e1"
TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
# Sortie horodatée (l'audit est rejouable : ne pas écraser l'historique)
OUT_CSV = "/workspace/edutunisie/output/orphan-resources-%s.csv" % __import__("datetime").datetime.now().strftime("%Y-%m-%d")

# --- 1. Toutes les cles R2 ----------------------------------------------------
r2_keys = set()
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
    for o in res:
        r2_keys.add(o["key"])
    page += 1
    info = data.get("result_info") or {}
    cursor = info.get("cursor")
    print(f"  page {page}: {len(res)} objets (total {len(r2_keys)})", flush=True)
    if not cursor:
        break

print(f"\nR2 : {len(r2_keys)} objets dans {BUCKET}")

# --- 2. Toutes les ressources PUBLISHED -------------------------------------
out = subprocess.run(
    [
        "npx", "wrangler", "d1", "execute", DB_ID, "--remote", "--json",
        "--command",
        "SELECT r.numericId, r.title, r.fileKey, r.fileUrl, "
        "COALESCE(c.slug,'') AS classSlug, COALESCE(s.slug,'') AS subjectSlug "
        "FROM Resource r "
        "LEFT JOIN Class c ON c.id = r.classId "
        "LEFT JOIN Subject s ON s.id = r.subjectId "
        "WHERE r.status='PUBLISHED'",
    ],
    capture_output=True, text=True, timeout=600,
)
parsed = json.loads(out.stdout)
rows = parsed[0]["results"] if isinstance(parsed, list) else parsed["results"]
print(f"D1 : {len(rows)} ressources PUBLISHED\n")

missing = []
for r in rows:
    key = r.get("fileKey")
    if not key and r.get("fileUrl"):
        if r["fileUrl"].startswith("/api/file/"):
            key = urllib.parse.unquote(r["fileUrl"][len("/api/file/"):])
    if not key:
        missing.append((r["numericId"], r["title"], "NO_KEY", r.get("classSlug", ""), r.get("subjectSlug", "")))
        continue
    if key not in r2_keys:
        missing.append((r["numericId"], r["title"], key, r.get("classSlug", ""), r.get("subjectSlug", "")))

print(f"=== {len(missing)} ressources sans objet R2 ({len(missing)/max(len(rows),1)*100:.2f} %) ===")
by_prefix = {}
by_class = {}
by_subject = {}
for _, _, key, cls, subj in missing:
    p = key.split("/")[0] if key else "NO_KEY"
    by_prefix[p] = by_prefix.get(p, 0) + 1
    by_class[cls or "—"] = by_class.get(cls or "—", 0) + 1
    by_subject[subj or "—"] = by_subject.get(subj or "—", 0) + 1
print("Par préfixe :", by_prefix)
print("Par classe  :", dict(sorted(by_class.items(), key=lambda kv: -kv[1])))
print("Par matière :", dict(sorted(by_subject.items(), key=lambda kv: -kv[1])))

# CSV réel (RFC 4180, séparateur virgule, BOM UTF-8 pour Excel + arabe)
import csv

with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
    w.writerow(["numericId", "title", "classSlug", "subjectSlug", "r2Key"])
    for nid, title, key, cls, subj in missing:
        w.writerow([nid, (title or "").replace("\t", " "), cls, subj, key])
print("CSV :", OUT_CSV)

for m in missing[:10]:
    print("  -", m[0], "|", (m[1] or "")[:60], "|", m[2][:90])
