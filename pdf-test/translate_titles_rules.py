#!/usr/bin/env python3
"""
Translate Physique collège titles FR → AR using deterministic regex rules.

Title pattern (typical):
  "Devoir de Contrôle N°1 - Collège pilote - Physique - 8ème - (2019-2020)"

→ "فرض مراقبة عدد 1 - الفيزياء - الثامنة أساسي - (2019-2020)"

NO OpenAI. Pure rule-based mapping.
"""
import re
import sys

# ─────────────────────────────────────────────────────────────────
# MAPPING TABLES
# ─────────────────────────────────────────────────────────────────

# Type mapping (ordered: most specific first)
TYPE_MAPPING = [
    # Devoir Contrôle / Synthèse variants
    (r"Devoir de Contrôle N°?\s*(\d+)",  r"فرض مراقبة عدد \1"),
    (r"Devoir de Synthèse N°?\s*(\d+)",  r"فرض تأليفي عدد \1"),
    (r"Contrôle N°?\s*(\d+)",            r"مراقبة عدد \1"),
    (r"Synthèse N°?\s*(\d+)",            r"تأليفي عدد \1"),
    # Without number
    (r"Devoir de Contrôle",              "فرض مراقبة"),
    (r"Devoir de Synthèse",              "فرض تأليفي"),
    (r"Devoir Surveillé",                "فرض مراقبة"),
    # Other types
    (r"Série d'exercices N°?\s*(\d+)",   r"سلسلة تمارين عدد \1"),
    (r"Série d'exercices",               "سلسلة تمارين"),
    (r"Devoir de maison N°?\s*(\d+)",    r"فرض منزلي عدد \1"),
    (r"Devoir de maison",                "فرض منزلي"),
    # Simple types
    (r"\bCours\b",                       "درس"),
    (r"\bRésumé\b",                      "ملخص"),
    (r"\bExercices?\b",                  "تمارين"),
    (r"\bInterrogation\b",               "استجواب"),
    (r"\bDevoir\b",                      "فرض"),
    (r"\bExamen\b",                      "امتحان"),
    (r"\bÉvaluation\b",                  "تقييم"),
    (r"\bTest\b",                        "اختبار"),
    (r"\bActivité\b",                    "نشاط"),
]

# Class mapping
CLASS_MAPPING = [
    (r"\b7[èe]me\b",  "السابعة أساسي"),
    (r"\b8[èe]me\b",  "الثامنة أساسي"),
    (r"\b9[èe]me\b",  "التاسعة أساسي"),
    (r"\b7[èe]me année\b",  "السابعة أساسي"),
    (r"\b8[èe]me année\b",  "الثامنة أساسي"),
    (r"\b9[èe]me année\b",  "التاسعة أساسي"),
]

# Subject mapping
SUBJECT_MAPPING = [
    (r"\bPhysique\b",                     "الفيزياء"),
    (r"\bMathématiques\b",                "الرياضيات"),
    (r"\bSciences de la vie et de la terre\b", "علوم الحياة والأرض"),
    (r"\bSVT\b",                          "علوم الحياة والأرض"),
    (r"\bFrançais\b",                     "الفرنسية"),
    (r"\bArabe\b",                        "العربية"),
    (r"\bAnglais\b",                      "الإنجليزية"),
    (r"\bInformatique\b",                 "الإعلامية"),
    (r"\bTechnologie\b",                  "التكنولوجيا"),
    (r"\bHistoire[-\s]Géographie\b",     "التاريخ-الجغرافيا"),
    (r"\bHistoire\b",                     "التاريخ"),
    (r"\bGéographie\b",                   "الجغرافيا"),
    (r"\bPhilosophie\b",                  "الفلسفة"),
    (r"\bÉducation islamique\b",          "التربية الإسلامية"),
    (r"\bÉconomie\b",                     "الاقتصاد"),
    (r"\bGestion\b",                      "التسيير"),
    (r"\bSport\b",                        "الرياضة"),
]

# Cleanup: Collège pilote → remove
PILOTE_CLEANUP = [
    (r"\s*-\s*Coll[èe]ge pilote\s*-", " - "),  # "- Collège pilote -" → " - "
    (r"\s+Coll[èe]ge pilote\s+", " "),          # " Collège pilote " → " "
    (r"Coll[èe]ge pilote\s*-?\s*", ""),         # leading "Collège pilote -" → ""
    (r"\s*-\s*$", ""),                          # trailing " -"
    (r"^\s*-\s*", ""),                          # leading " -"
]

# Generic cleanup
GENERIC_CLEANUP = [
    (r"\s+", " "),                              # multiple spaces → 1
    (r"^\s+|\s+$", ""),                         # trim
    (r"\s*-\s*-\s*", " - "),                    # " - - " → " - "
    (r"\s*-\s*$", ""),                          # trailing " -"
    (r"^\s*-\s*", ""),                          # leading " -"
]


def translate_title(fr_title: str) -> str:
    """Apply all mappings to a French title and return the Arabic version."""
    s = fr_title

    # 1. Apply type mapping
    for pattern, repl in TYPE_MAPPING:
        s = re.sub(pattern, repl, s, flags=re.IGNORECASE)

    # 2. Remove Collège pilote
    for pattern, repl in PILOTE_CLEANUP:
        s = re.sub(pattern, repl, s, flags=re.IGNORECASE)

    # 3. Apply class mapping
    for pattern, repl in CLASS_MAPPING:
        s = re.sub(pattern, repl, s, flags=re.IGNORECASE)

    # 4. Apply subject mapping
    for pattern, repl in SUBJECT_MAPPING:
        s = re.sub(pattern, repl, s, flags=re.IGNORECASE)

    # 5. Generic cleanup
    for pattern, repl in GENERIC_CLEANUP:
        s = re.sub(pattern, repl, s)

    return s


# ─────────────────────────────────────────────────────────────────
# DRY-RUN (preview translations)
# ─────────────────────────────────────────────────────────────────

SAMPLES = [
    "Devoir de Contrôle N°1 - Collège pilote - Physique - 8ème - (2019-2020)",
    "Devoir de Synthèse N°2 - Collège pilote - Physique - 7ème - (2022-2023)",
    "Série d'exercices N°1 - Collège pilote - Physique - 7ème - (2013-2014)",
    "Devoir de Contrôle N°1 Collège pilote - Physique - 8ème (2017-2018)",
    "Devoir de Contrôle N°3 - Collège pilote - Physique - 7ème - (2015-2016)",
    "Devoir de Contrôle N°1 - Collège pilote - Physique - 9ème - (2022-2023)",
    "Devoir de Contrôle N°2 - Collège pilote - Physique - 7ème - (2015-2016)",
    "Devoir de Synthèse N°3 - Collège pilote - Physique - 7ème - (2025-2026)",
    "Devoir de Contrôle - Collège pilote - Physique - 8ème - (2018-2019)",
    "Devoir de Synthèse - Collège pilote - Physique - 7ème - (2020-2021)",
    "Cours - Collège pilote - Physique - 9ème - (2019-2020)",
    "Résumé - Collège pilote - Physique - 7ème - (2018-2019)",
]


def main():
    print("=" * 80)
    print("PREVIEW — Title translations FR → AR (rule-based)")
    print("=" * 80)
    for s in SAMPLES:
        ar = translate_title(s)
        print(f"FR: {s}")
        print(f"AR: {ar}")
        print()


if __name__ == "__main__":
    main()
