#!/usr/bin/env python3
"""
Translate Physique collège titles AR → FR using deterministic regex rules.

Title pattern (typical):
  "فرض مراقبة عدد 1 - الفيزياء - الثامنة أساسي - (2019-2020)"

→ "Devoir de Contrôle N°1 - Collège pilote - Physique - 8ème - (2019-2020)"

NO OpenAI. Pure rule-based mapping.
"""
import re
import sys

# ─────────────────────────────────────────────────────────────────
# AR → FR MAPPING TABLES
# ─────────────────────────────────────────────────────────────────

# Type mapping (ordered: most specific first)
TYPE_MAPPING = [
    # Numbered (Arabic-Indic and Western digits)
    # "عدد" (adad - count) AND "رقم" (raqam - number) both = "N°"
    (r"ف\s*ر\s*ض\s*م\s*ر\s*ا\s*ق\s*ب\s*ة\s+(?:ع\s*د\s*د|ر\s*ق\s*م)\s+([\d٠-٩]+)", r"Devoir de Contrôle N°\1"),
    (r"ف\s*ر\s*ض\s*ت\s*أ\s*ل\s*ي\s*ف\s*ي\s+(?:ع\s*د\s*د|ر\s*ق\s*م)\s+([\d٠-٩]+)", r"Devoir de Synthèse N°\1"),
    (r"م\s*ر\s*ا\s*ق\s*ب\s*ة\s+(?:ع\s*د\s*د|ر\s*ق\s*م)\s+([\d٠-٩]+)",      r"Contrôle N°\1"),
    (r"ت\s*أ\s*ل\s*ي\s*ف\s*ي\s+(?:ع\s*د\s*د|ر\s*ق\s*م)\s+([\d٠-٩]+)",      r"Synthèse N°\1"),
    # Without number
    (r"ف\s*ر\s*ض\s*م\s*ر\s*ا\s*ق\s*ب\s*ة",                    "Devoir de Contrôle"),
    (r"ف\s*ر\s*ض\s*ت\s*أ\s*ل\s*ي\s*ف\s*ي",                    "Devoir de Synthèse"),
    (r"م\s*ر\s*ا\s*ق\s*ب\s*ة",                                 "Contrôle"),
    (r"ت\s*أ\s*ل\s*ي\s*ف\s*ي",                                 "Synthèse"),
    # Other types
    (r"س\s*ل\s*س\s*ل\s*ة\s+ت\s*م\s*ا\s*ر\s*ي\s*ن\s+(?:ع\s*د\s*د|ر\s*ق\s*م)\s+([\d٠-٩]+)", r"Série d'exercices N°\1"),
    (r"س\s*ل\s*س\s*ل\s*ة\s+ت\s*م\s*ا\s*ر\s*ي\s*ن",            "Série d'exercices"),
    (r"ف\s*ر\s*ض\s+م\s*ن\s*ز\s*ل\s*ي\s+(?:ع\s*د\s*د|ر\s*ق\s*م)\s+([\d٠-٩]+)", r"Devoir de maison N°\1"),
    (r"ف\s*ر\s*ض\s+م\s*ن\s*ز\s*ل\s*ي",                       "Devoir de maison"),
    # Simple types
    (r"\bد\s*ر\s*س\b",                                         "Cours"),
    (r"\bم\s*ل\s*خ\s*ص\b",                                     "Résumé"),
    (r"\bت\s*م\s*ا\s*ر\s*ي\s*ن\b",                             "Exercices"),
    (r"\bا\s*س\s*ت\s*ج\s*و\s*ا\s*ب\b",                         "Interrogation"),
    (r"\bف\s*ر\s*ض\b",                                         "Devoir"),
    (r"\bا\s*م\s*ت\s*ح\s*ا\s*ن\b",                             "Examen"),
    (r"\bت\s*ق\s*ي\s*ي\s*م\b",                                 "Évaluation"),
    (r"\bا\s*خ\s*ت\s*ب\s*ا\s*ر\b",                             "Test"),
    (r"\bن\s*ش\s*ا\s*ط\b",                                     "Activité"),
    # Convert AR-Indic digits to Western
    (r"([٠-٩])", lambda m: str("٠١٢٣٤٥٦٧٨٩".index(m.group(1)))),
]

# Class mapping
CLASS_MAPPING = [
    (r"\bا\s*ل\s*س\s*ا\s*ب\s*ع\s*ة\s+أ\s*س\s*ا\s*س\s*ي\b",    "7ème"),
    (r"\bا\s*ل\s*ث\s*ا\s*م\s*ن\s*ة\s+أ\s*س\s*ا\s*س\s*ي\b",    "8ème"),
    (r"\bا\s*ل\s*ت\s*ا\s*س\s*ع\s*ة\s+أ\s*س\s*ا\s*س\s*ي\b",    "9ème"),
    # Sometimes "السنة السابعة" or "السابعة"
    (r"\bا\s*ل\s*سنة\s+ا\s*ل\s*س\s*ا\s*ب\s*ع\s*ة\b",          "7ème"),
    (r"\bا\s*ل\s*سنة\s+ا\s*ل\s*ث\s*ا\s*م\s*ن\s*ة\b",          "8ème"),
    (r"\bا\s*ل\s*سنة\s+ا\s*ل\s*ت\s*ا\s*س\s*ع\s*ة\b",          "9ème"),
    (r"\bا\s*ل\s*س\s*ا\s*ب\s*ع\s*ة\b",                         "7ème"),
    (r"\bا\s*ل\s*ث\s*ا\s*م\s*ن\s*ة\b",                         "8ème"),
    (r"\bا\s*ل\s*ت\s*ا\s*س\s*ع\s*ة\b",                         "9ème"),
]

# Subject mapping
SUBJECT_MAPPING = [
    (r"\bا\s*ل\s*ف\s*ي\s*ز\s*ي\s*ا\s*ء\b",                    "Physique"),
    (r"\bا\s*ل\s*ر\s*ي\s*ا\s*ض\s*ي\s*ا\s*ت\b",                "Mathématiques"),
    (r"\bع\s*ل\s*و\s*م\s+ا\s*ل\s*ح\s*ي\s*ا\s*ة\s+و\s*ا\s*ل\s*أ\s*ر\s*ض\b", "Sciences de la vie et de la terre"),
    (r"\bا\s*ل\s*ف\s*ر\s*ن\s*س\s*ي\s*ة\b",                    "Français"),
    (r"\bا\s*ل\s*ع\s*ر\s*ب\s*ي\s*ة\b",                         "Arabe"),
    (r"\bا\s*ل\s*إ\s*ن\s*ج\s*ل\s*ي\s*ز\s*ي\s*ة\b",            "Anglais"),
    (r"\bا\s*ل\s*إ\s*ع\s*ل\s*ا\s*م\s*ي\s*ة\b",                 "Informatique"),
    (r"\bا\s*ل\s*ت\s*ك\s*ن\s*و\s*ل\s*و\s*ج\s*ي\s*ا\b",        "Technologie"),
    (r"\bا\s*ل\s*ت\s*ا\s*ر\s*ي\s*خ\s*-\s*ا\s*ل\s*ج\s*غ\s*ر\s*ا\s*ف\s*ي\s*ا\b", "Histoire-Géographie"),
    (r"\bا\s*ل\s*ت\s*ا\s*ر\s*ي\s*خ\b",                        "Histoire"),
    (r"\bا\s*ل\s*ج\s*غ\s*ر\s*ا\s*ف\s*ي\s*ا\b",                "Géographie"),
    (r"\bا\s*ل\s*ف\s*ل\s*س\s*ف\s*ة\b",                        "Philosophie"),
    (r"\bا\s*ل\s*ت\s*ر\s*ب\s*ي\s*ة\s+ا\s*ل\s*إ\s*س\s*ل\s*ا\s*م\s*ي\s*ة\b", "Éducation islamique"),
    (r"\bا\s*ل\s*ا\s*ق\s*ت\s*ص\s*ا\s*د\b",                    "Économie"),
    (r"\bا\s*ل\s*ت\s*س\s*ي\s*ي\s*ر\b",                        "Gestion"),
    (r"\bا\s*ل\s*ر\s*ي\s*ا\s*ض\s*ة\b",                        "Sport"),
]

# Collège pilote: add (we don't remove, we add)
# No cleanup needed

# Generic cleanup
GENERIC_CLEANUP = [
    (r"\s+", " "),                              # multiple spaces → 1
    (r"^\s+|\s+$", ""),                         # trim
    (r"\s*-\s*-\s*", " - "),                    # " - - " → " - "
    (r"\s*-\s*$", ""),                          # trailing " -"
    (r"^\s*-\s*", ""),                          # leading " -"
]


def _to_western_digit(match):
    """Convert AR-Indic digit to Western digit."""
    ar_digits = "٠١٢٣٤٥٦٧٨٩"
    return str(ar_digits.index(match.group(0)))


def translate_title(ar_title: str, add_pilote: bool = False) -> str:
    """Apply all AR→FR mappings to an Arabic title.
    If add_pilote=True, prefix with "Collège pilote" (use for resources flipping PUBLIC→PILOTE).
    """
    s = ar_title

    # 1. Apply type mapping (most specific first)
    for pattern, repl in TYPE_MAPPING:
        if callable(repl):
            s = re.sub(pattern, repl, s)
        else:
            s = re.sub(pattern, repl, s)

    # 2. Apply class mapping
    for pattern, repl in CLASS_MAPPING:
        s = re.sub(pattern, repl, s)

    # 3. Apply subject mapping
    for pattern, repl in SUBJECT_MAPPING:
        s = re.sub(pattern, repl, s)

    # 4. Generic cleanup
    for pattern, repl in GENERIC_CLEANUP:
        s = re.sub(pattern, repl, s)

    # 5. Add Collège pilote if requested
    if add_pilote and not re.search(r"Collège pilote", s, re.IGNORECASE):
        # Insert after the FIRST segment (which is the type or first dash-separated part).
        # The first segment ends at the first " - ".
        # This handles: "Devoir de Contrôle N°1 - ...", "Cours - ...", "Série d'exercices N°1 - ..."
        m = re.match(r"^([^-]+?)\s*-\s*", s)
        if m:
            first = m.group(1).strip()
            rest = s[m.end():]
            s = f"{first} - Collège pilote - {rest}"
        else:
            # No " - " separator, just prefix
            s = "Collège pilote - " + s

    return s


# ─────────────────────────────────────────────────────────────────
# DRY-RUN (preview translations)
# ─────────────────────────────────────────────────────────────────

SAMPLES = [
    "فرض مراقبة عدد 1 - الفيزياء - التاسعة أساسي - (2019-2020)",
    "فرض تأليفي عدد 2 - الفيزياء - الثامنة أساسي - (2021-2022)",
    "سلسلة تمارين عدد 1 - الفيزياء - السابعة أساسي - (2013-2014)",
    "فرض مراقبة عدد 1 - الفيزياء - الثامنة أساسي - (2017-2018)",
    "فرض تأليفي - الفيزياء - السابعة أساسي - (2020-2021)",
    "درس - الفيزياء - التاسعة أساسي - (2019-2020)",
    "ملخص - الفيزياء - السابعة أساسي - (2018-2019)",
    "فرض تأليفي عدد 3 - الفيزياء - التاسعة أساسي - (2014-2015)",
    "فرض مراقبة عدد ٢ - الفيزياء - السابعة أساسي - (٢٠١٨-٢٠١٩)",  # AR-Indic digits
]


def main():
    print("=" * 80)
    print("PREVIEW — Title translations AR → FR (rule-based)")
    print("=" * 80)
    for s in SAMPLES:
        ar = s
        fr = translate_title(ar, add_pilote=True)
        print(f"AR: {ar}")
        print(f"FR (+pilote): {fr}")
        print()


if __name__ == "__main__":
    main()
