#!/usr/bin/env python3
"""Vérifie (HEAD) si les PDF "orphelines" de R2 existent encore sur Vercel Blob.

2026-11-13 — le store Vercel Blob n'a jamais été supprimé : les objets dont
la copie R2 a disparu lors de l'incident du 22/09/2026 sont TOUJOURS servis
par Vercel sous le même chemin (`teacher-library/<id>/imported/<nom>`).

Sortie : output/orphan-vercel-alive-2026-11-13.csv
"""
import concurrent.futures
import csv
import urllib.request

HOST = "https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/"
CSV_IN = "/workspace/edutunisie/output/orphan-resources-2026-11-12.csv"
CSV_OUT = "/workspace/edutunisie/output/orphan-vercel-alive-2026-11-13.csv"


def head(o):
    url = HOST + o["r2Key"]
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return (o["numericId"], o["r2Key"], r.status, int(r.headers.get("Content-Length") or 0))
    except Exception as e:  # noqa: BLE001
        return (o["numericId"], o["r2Key"], getattr(e, "code", "ERR"), 0)


def main():
    orphans = list(csv.DictReader(open(CSV_IN, encoding="utf-8-sig")))
    print(f"Vérification de {len(orphans)} PDF sur Vercel Blob…", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
        results = list(ex.map(head, orphans))

    alive = [r for r in results if r[2] == 200]
    dead = [r for r in results if r[2] != 200]
    print(f"VIVANTS sur Vercel Blob : {len(alive)}/{len(results)}")
    print(f"introuvables            : {len(dead)}")
    print(f"volume à restaurer      : {sum(r[3] for r in alive)/1024/1024:.1f} Mo")
    for r in dead[:15]:
        print(f"  {r[2]} {r[1][:90]}")

    with open(CSV_OUT, "w", newline="", encoding="utf-8-sig") as g:
        w = csv.writer(g)
        w.writerow(["numericId", "r2Key", "size"])
        for r in alive:
            w.writerow([r[0], r[1], r[3]])
    print(f"\nCSV : {CSV_OUT}")


if __name__ == "__main__":
    main()
