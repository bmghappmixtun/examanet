#!/usr/bin/env python3
"""Diff précis SSR vs DOM hydraté (structure, body uniquement)."""
import difflib, re, sys

def body_only(html):
    i = html.find('<body')
    j = html.find('</body>')
    return html[i:j] if i > 0 and j > i else html

def skeleton(html):
    clean = re.sub(r'<!--.*?-->', '', body_only(html), flags=re.S)
    clean = re.sub(r'<script.*?</script>', '', clean, flags=re.S)
    clean = re.sub(r'<style.*?</style>', '', clean, flags=re.S)
    out = []
    for m in re.finditer(r'<(/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|\'[^\']*\'|[^>])*?)(/?)>', clean):
        closing, tag, attrs, selfclose = m.group(1), m.group(2).lower(), m.group(3), m.group(4)
        attrs = re.sub(r'\s+', ' ', attrs).strip()
        attrs = re.sub(r'\s(data-reactroot|data-precedence)="[^"]*"', '', attrs)
        out.append(('/' if closing else '') + tag + (' ' + attrs if attrs else '') + ('/' if selfclose else ''))
    return out

a = skeleton(open(sys.argv[1], encoding='utf-8', errors='replace').read())
b = skeleton(open(sys.argv[2], encoding='utf-8', errors='replace').read())
print(f'  SSR body : {len(a)} balises | DOM hydraté : {len(b)} balises')
sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
n = 0
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == 'equal':
        continue
    n += 1
    print(f'\n  ── divergence #{n} ({tag}) ──')
    for x in a[i1:i2][:6]:
        print('    SSR  -', x[:150])
    for x in b[j1:j2][:6]:
        print('    DOM  +', x[:150])
if n == 0:
    print('  ✅ structures IDENTIQUES — aucun patch React (pas de mismatch structurel)')
