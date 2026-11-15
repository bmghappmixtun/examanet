#!/usr/bin/env python3
"""
Audit next-intl : vérifie que chaque message ICU contenant des placeholders
reçoit bien les variables attendues à l'appel.

Cause racine observée en prod (2026-11-14) : FORMATTING_ERROR next-intl
lorsqu'une variable d'un message n'est pas fournie — les pages utilisaient
`{strong}` / `{count}` comme marqueurs HTML remplacés manuellement.

Matching namespace-agnostique : un appel `t('clé')` dans un fichier
`useTranslations('ns')` cible le message `ns.clé` ; un appel sans namespace
cible la racine. On apparie donc par SUFFIXE.

Usage : python3 scripts/audit-i18n-placeholders.py
"""
import json
import os
import re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
MSG_DIR = os.path.join(ROOT, "src", "messages")

RE_PLACEHOLDER = re.compile(r"\{([A-Za-z0-9_]+)")
RE_CALL = re.compile(r"(?<![A-Za-z0-9_])t\(\s*['\"]([A-Za-z0-9_.\-]+)['\"]([^)]*)\)")
RE_NS = re.compile(r"(?:useTranslations|getTranslations)\(\s*['\"]([A-Za-z0-9_.-]+)['\"]")
RE_QUOTED = re.compile(r"'[^']*'")


def walk(obj, prefix=""):
    """Aplatit un objet de messages ; prefix est le chemin déjà parcouru."""
    out = {}
    for k, v in obj.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(walk(v, key))
        elif isinstance(v, list):
            for i, item in enumerate(v):
                if isinstance(item, dict):
                    out.update(walk(item, f"{key}.{i}"))
                elif isinstance(item, str):
                    out[f"{key}.{i}"] = item
        else:
            out[key] = v
    return out


def quoted_spans(message):
    """Positions (début, fin) des zones entre apostrophes (littéraux ICU)."""
    return [(m.start(), m.end()) for m in RE_QUOTED.finditer(message)]


def is_literal_placeholder(message, name):
    """Vrai si le placeholder est dans une zone quotée (= marqueur littéral)."""
    for m in RE_PLACEHOLDER.finditer(message):
        if m.group(1) != name:
            continue
        for start, end in quoted_spans(message):
            if start <= m.start() < end:
                return True
    return False


def main():
    locales = sorted(f[:-5] for f in os.listdir(MSG_DIR) if f.endswith(".json"))
    messages = {}
    for loc in locales:
        with open(os.path.join(MSG_DIR, f"{loc}.json"), encoding="utf-8") as fh:
            messages[loc] = walk(json.load(fh))

    # appels statiques : (clé, args, fichier, ligne, namespaces du fichier)
    calls = []
    for dirpath, _d, names in os.walk(SRC):
        for name in names:
            if not name.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(dirpath, name)
            src = open(path, encoding="utf-8").read()
            namespaces = sorted(set(RE_NS.findall(src)))
            for m in RE_CALL.finditer(src):
                calls.append(
                    (
                        m.group(1),
                        m.group(2).strip(),
                        os.path.relpath(path, ROOT),
                        src[: m.start()].count("\n") + 1,
                        namespaces,
                    )
                )

    suspects = defaultdict(list)
    unresolved = defaultdict(list)
    checked = set()

    for loc in locales:
        flat = messages[loc]
        for _key, args, path, line, namespaces in calls:
            # résolution namespace-aware : ns.clé d'abord, puis la racine
            target = None
            for ns in namespaces:
                cand = f"{ns}.{_key}"
                if cand in flat and isinstance(flat[cand], str):
                    target = cand
                    break
            if target is None and _key in flat and isinstance(flat[_key], str):
                target = _key
            if target is None:
                unresolved[loc].append((_key, path, line, namespaces))
                continue

            value = flat[target]
            if not RE_PLACEHOLDER.search(value):
                continue
            checked.add(f"{loc}:{target}")
            placeholders = sorted(set(RE_PLACEHOLDER.findall(value)))
            missing = [
                ph
                for ph in placeholders
                if not re.search(rf"\b{re.escape(ph)}\s*:", args)
                and not is_literal_placeholder(value, ph)
            ]
            if missing:
                suspects[f"{loc}:{target}"].append((missing, path, line, args))

    print(f"Appels analysés           : {len(calls)}")
    print(f"Messages vérifiés          : {len(checked)}")
    print()
    if not suspects:
        print("✅ Aucun appel suspect : chaque placeholder est fourni ou échappé.")
    else:
        print(f"=== {len(suspects)} message(s) avec placeholder non fourni ===")
        for key in sorted(suspects):
            loc, mkey = key.split(":", 1)
            value = messages[loc][mkey]
            print(f"  {key}")
            print(f"      message : {value[:120]}")
            for missing, path, line, args in suspects[key][:4]:
                print(f"      manquant {missing} → {path}:{line}  args={args[:60]}")
    if unresolved:
        print(f"\n⚠️  {sum(len(v) for v in unresolved.values())} appel(s) dont la clé n'a pas été résolue")
        for loc in unresolved:
            for key, path, line, namespaces in unresolved[loc][:8]:
                print(f"      [{loc}] t('{key}')  {path}:{line}  ns={namespaces}")


if __name__ == "__main__":
    main()
