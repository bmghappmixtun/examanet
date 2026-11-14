#!/usr/bin/env python3
"""Lit les métriques KV `metric:*` écrites par worker-cron.js et affiche la
distribution des durées par endpoint (c'est la source des alertes email
« Examanet Performance Alerts »).

Usage : python3 scripts/read-kv-metrics.py [namespace_id]
"""
import base64
import collections
import json
import os
import re
import urllib.parse
import urllib.request

ACCOUNT = "59cffdeaadf3809cc3d2039c43f836e0"
NS = os.environ.get("KV_NS", "b06e8c86184c45b690594f5fd7aa524f")
TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
BASE = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/storage/kv/namespaces/{NS}"

entries = []
cursor = None
while True:
    url = f"{BASE}/keys?limit=1000"
    if cursor:
        url += "&cursor=" + urllib.parse.quote(cursor)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    res = data.get("result") or []
    if not isinstance(res, list):
        break
    for item in res:
        name = item.get("name", "")
        if not name.startswith("metric:"):
            continue
        vreq = urllib.request.Request(
            f"{BASE}/values/{urllib.parse.quote(name, safe='')}",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        try:
            with urllib.request.urlopen(vreq, timeout=60) as vr:
                raw = vr.read().decode("utf-8", "replace")
            entries.append(json.loads(raw))
        except Exception:
            continue
    cursor = (data.get("result_info") or {}).get("cursor")
    if not cursor:
        break

print(f"Métriques KV lues : {len(entries)}\n")
by_path = collections.defaultdict(list)
for e in entries:
    by_path[e.get("path", "?")].append((e.get("durationMs", 0), e.get("statusCode", 0), e.get("ts", 0)))

for path, vals in sorted(by_path.items(), key=lambda kv: -len(kv[1])):
    dur = sorted(v[0] for v in vals)
    codes = collections.Counter(v[1] for v in vals)
    p50 = dur[len(dur) // 2]
    p95 = dur[min(len(dur) - 1, int(len(dur) * 0.95))]
    ts = sorted(v[2] for v in vals)
    print(
        f"{path:34s} n={len(dur):3d}  min={dur[0]:5d} p50={p50:5d} p95={p95:5d} max={dur[-1]:5d} ms"
        f"  codes={dict(codes)}"
    )
    if len(vals) <= 12:
        print(f"    brut : {sorted(dur)}")
    print(f"    fenêtre : {ts[0]} → {ts[-1]}")
