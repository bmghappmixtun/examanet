#!/usr/bin/env python3
"""
Analyse les messages next-intl contenant des placeholders ICU et vérifie
que chaque appel `t('clé', valeurs)` fournit bien les variables attendues.

Cause racine observée en prod : FORMATTING_ERROR (next-intl) quand une variable
d'un message ICU n'est pas fournie à l'appel.

Usage : python3 scripts/audit-i18n-placeholders.py
"""
import json
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
MSG = os.path.join(ROOT, "src", "messages", "fr.json")

RE_PLACEHOLDER = re.compile(r"\{([A-Za-z0-9_]+)")
# t('clé', ...)  ou t("clé", ...)  — on capture la suite de l'appel
RE_CALL = re.compile(r"(?<![A-Za-z0-9_])t\(\s*['\"]([A-Za-z0-9_.\-]+)['\"]([^)]*)\)")


def walk(obj, prefix=""):
    out = {}
    for k, v in obj.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(walk(v, key + "."))
        elif isinstance(v, list):
            for i, item in enumerate(v):
                if isinstance(item, dict):
                    out.update(walk(item, f"{key}.{i}."))
                elif isinstance(item, str):
                    out[f"{key}.{i}"] = item
        else:
            out[key] = v
    return out


def main():
    with open(MSG, encoding="utf-8") as fh:
        messages = walk(json.load(fh))

    with_placeholders = {
        k: sorted(set(RE_PLACEHOLDER.findall(v)))
        for k, v in messages.items()
        if isinstance(v, str) and RE_PLACEHOLDER.search(v)
    }

    calls = defaultdict(list)
    for dirpath, _d, names in os.walk(SRC):
        for name in names:
            if not name.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(dirpath, name)
            with open(path, encoding="utf-8") as fh:
                src = fh.read()
            for m in RE_CALL.finditer(src):
                key = m.group(1)
                args = m.group(2).strip()
                line = src[: m.start()].count("\n") + 1
                calls[key].append((os.path.relpath(path, ROOT), line, args))

    print(f"Messages avec placeholders : {len(with_placeholders)}")
    print(f"Clés appelées détectées     : {len(calls)}\n")

    suspects = []
    for key, phs in sorted(with_placeholders.items()):
        # la clé peut être appelée avec ou sans namespace devant
        for called_key, sites in calls.items():
            if called_key != key and not called_key.endswith("." + key):
                continue
            if called_key.endswith("." + key):
                # namespace前方 : on compare le suffixe
                pass
            for path, line, args in sites:
                if not args:
                    suspects.append((called_key, phs, path, line, "aucune valeur passée"))
                else:
                    for ph in phs:
                        if not re.search(rf"\b{re.escape(ph)}\s*:", args):
                            suspects.append((called_key, phs, path, line, f"'{ph}' non fourni"))

    if not suspects:
        print("Aucun appel suspect trouvé (tous les placeholders sont fournis).")
    else:
        print(f"=== {len(suspects)} appel(s) suspect(s) ===")
        seen = set()
        for key, phs, path, line, why in suspects:
            sig = (path, line, key)
            if sig in seen:
                continue
            seen.add(sig)
            print(f"  {key}")
            print(f"      placeholders du message : {phs}")
            print(f"      {path}:{line} → {why}")

    # messages à placeholders jamais appelés (potentiellement morts)
    unused = []
    for key in with_placeholders:
        suffix = key.split(".")[-1]
        called = any(c == key or c.endswith("." + key) or c.endswith("." + suffix) for c in calls)
        if not called:
            unused.append(key)
    print(f"\n=== messages avec placeholders jamais référencés (statique) : {len(unused)} ===")
    for k in unused[:30]:
        print(f"  - {k}")


if __name__ == "__main__":
    main()
