#!/usr/bin/env python3
"""
Audit statique des clés de traduction next-intl.

Compare les clés utilisées dans le code (`t('...')`, `t("...")`, `useTranslations('ns')`)
avec le contenu de src/messages/fr.json et src/messages/ar.json.

Sortie : les clés absentes (par locale) + les namespaces non déclarés.

Usage : python3 scripts/audit-i18n-keys.py [chemin_src]
"""
import json
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "src")
MSG_DIR = os.path.join(ROOT, "src", "messages")

# useTranslations('ns') / getTranslations('ns')
RE_NS = re.compile(r"(?:useTranslations|getTranslations)\(\s*['\"]([A-Za-z0-9_.-]+)['\"]")
# t('key') / t("key")  (et .t(...)
RE_KEY = re.compile(r"(?<![A-Za-z0-9_])t\(\s*['\"]([A-Za-z0-9_.\-]+)['\"]")
# t.rich('key') / t.has('key')
RE_KEY2 = re.compile(r"(?<![A-Za-z0-9_])t\.(?:rich|has|raw|markup)\(\s*['\"]([A-Za-z0-9_.\-]+)['\"]")


def flatten(obj, prefix=""):
    out = {}
    for k, v in obj.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(flatten(v, key + "."))
        else:
            out[key] = v
    return out


def main():
    locales = sorted(f[:-5] for f in os.listdir(MSG_DIR) if f.endswith(".json"))
    messages = {}
    for loc in locales:
        with open(os.path.join(MSG_DIR, f"{loc}.json"), encoding="utf-8") as fh:
            messages[loc] = flatten(json.load(fh))

    # 1) les namespaces déclarés par useTranslations('ns')
    ns_by_file = defaultdict(set)
    key_by_file = defaultdict(set)
    files = []
    for dirpath, _dirs, names in os.walk(SRC):
        for name in names:
            if not name.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, encoding="utf-8") as fh:
                    src = fh.read()
            except Exception:
                continue
            files.append(path)
            for ns in RE_NS.findall(src):
                ns_by_file[path].add(ns)
            for key in RE_KEY.findall(src) + RE_KEY2.findall(src):
                key_by_file[path].add(key)

    # 2) clés par namespace : si le fichier utilise useTranslations('x'), ses t()
    #    sont dans le namespace x ; sinon namespace implicite (celui du layout)
    missing = defaultdict(lambda: defaultdict(list))
    unknown_ns = defaultdict(set)
    used_ns = set()

    for path in files:
        rel = os.path.relpath(path, ROOT)
        namespaces = ns_by_file.get(path, set())
        used_ns |= namespaces
        for loc in locales:
            flat = messages.get(loc, {})
            if not namespaces:
                # namespace implicite = racine des messages (le layout définit
                # le namespace par défaut via getMessages()/getTranslations())
                for key in key_by_file.get(path, set()):
                    if key not in flat:
                        missing[loc][f"(racine) {key}"].append(rel)
                continue
            for key in key_by_file.get(path, set()):
                # la clé peut venir de n'importe quel namespace du fichier :
                # on ne la signale que si elle est absente de TOUS
                if not any(f"{ns}.{key}" in flat for ns in namespaces):
                    missing[loc][key].append(rel + f" (ns: {','.join(sorted(namespaces))})")

    # 3) namespaces déclarés dans le code mais absents des messages
    for loc in locales:
        with open(os.path.join(MSG_DIR, f"{loc}.json"), encoding="utf-8") as fh:
            top = set(json.load(fh).keys())
        for ns in sorted(used_ns):
            if ns not in top:
                unknown_ns[loc].add(ns)

    print(f"Locales analysées : {', '.join(locales)}")
    print(f"Fichiers scannés   : {len(files)}")
    print(f"Namespaces utilisés : {len(used_ns)}")
    print()
    for loc in locales:
        miss = missing.get(loc, {})
        print(f"=== {loc} : {len(miss)} clé(s) manquante(s) ===")
        for full, files_ in sorted(miss.items()):
            print(f"  - {full}   ({len(files_)} fichier(s))")
            for f in files_[:4]:
                print(f"      {f}")
        if unknown_ns.get(loc):
            print(f"  ! namespaces absents des messages : {sorted(unknown_ns[loc])}")
        print()

    # 4) clés présentes dans fr mais absentes dans ar (désynchronisation)
    if "fr" in messages and "ar" in messages:
        only_fr = sorted(set(messages["fr"]) - set(messages["ar"]))
        only_ar = sorted(set(messages["ar"]) - set(messages["fr"]))
        print(f"=== synchronisation fr/ar ===")
        print(f"  dans fr mais pas ar : {len(only_fr)}")
        for k in only_fr[:25]:
            print(f"    - {k}")
        print(f"  dans ar mais pas fr : {len(only_ar)}")
        for k in only_ar[:25]:
            print(f"    - {k}")


if __name__ == "__main__":
    main()
