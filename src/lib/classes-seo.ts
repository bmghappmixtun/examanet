/**
 * SEO landing-page data for class × section combinations.
 *
 * 2026-10-22 — the mega menu only links to `/fr/ressources?class=X&section=Y`.
 * Google consolidates crawl parameters, so every one of those 25 URLs collapses
 * onto `/ressources` and NOTHING gets indexed for queries like
 * "devoir 3ème sciences" or "sujets bac 4ème sciences expérimentales".
 *
 * This module derives the real page tree from MEGA_MENU_DATA (single source of
 * truth, already curated by the Ministère de l'Éducation) and produces:
 *   - the URL map  /classes/[classe]  +  /classes/[classe]/[section]
 *   - unique titles / descriptions / intros (no thin-content cannibalisation)
 *   - FAQ entries per combination for FAQPage JSON-LD
 *
 * Rules followed:
 *   - every page has a UNIQUE title, description and intro paragraph
 *   - no `toLocaleString()` without a pinned locale (Leçon #101)
 *   - static content only — NO getCloudflareContext in generateMetadata (Leçon #93)
 */

import { MEGA_MENU_DATA, type MegaMenuNiveau, type MegaMenuSection } from './mega-menu-data';

export type SeoLocale = 'fr' | 'ar';

export type ClassEntry = {
  slug: string;
  cycle: 'college' | 'lycee';
  cycleLabel: { fr: string; ar: string };
  label: { fr: string; ar: string };
  /** Short form used in titles: "3ème année", "7ème année", … */
  shortLabel: { fr: string; ar: string };
  sections: SectionEntry[];
};

export type SectionEntry = {
  slug: string;
  label: { fr: string; ar: string };
};

export type ClassPageEntry = ClassEntry & {
  path: string;
  title: { fr: string; ar: string };
  description: { fr: string; ar: string };
  intro: { fr: string; ar: string };
};

export type SectionPageEntry = {
  path: string;
  classSlug: string;
  sectionSlug: string;
  classLabel: { fr: string; ar: string };
  sectionLabel: { fr: string; ar: string };
  cycleLabel: { fr: string; ar: string };
  title: { fr: string; ar: string };
  description: { fr: string; ar: string };
  intro: { fr: string; ar: string };
  faq: { q: { fr: string; ar: string }; a: { fr: string; ar: string } }[];
};

/**
 * Short form used in <title>.
 *
 * The mega-menu labels are already short and correct ("3ème année", "7ème
 * année") — an earlier version tried to shorten them with a regex, but JS `\w`
 * does not match `è`, so "3ème année" became "3èmee année". Just reuse the
 * label verbatim.
 */
function shortLabelFor(n: MegaMenuNiveau): { fr: string; ar: string } {
  return { fr: n.label.fr, ar: n.label.ar };
}

function toSectionEntry(s: MegaMenuSection): SectionEntry {
  return { slug: s.slug, label: s.label };
}

/** All 7 classes, flattened out of MEGA_MENU_DATA, in curriculum order. */
export function getAllClasses(): ClassEntry[] {
  const out: ClassEntry[] = [];
  for (const cycle of MEGA_MENU_DATA) {
    for (const n of cycle.niveaux) {
      out.push({
        slug: n.slug,
        cycle: cycle.slug,
        cycleLabel: cycle.label,
        label: n.label,
        shortLabel: shortLabelFor(n),
        sections: n.sections.map(toSectionEntry),
      });
    }
  }
  return out;
}

export function getClassBySlug(slug: string): ClassEntry | undefined {
  return getAllClasses().find((c) => c.slug === slug);
}

/** Build the full page tree — used by generateStaticParams AND the sitemap. */
export function getClassPages(): ClassPageEntry[] {
  return getAllClasses().map((c) => {
    const path = `/classes/${c.slug}`;
    const isCollege = c.cycle === 'college';
    return {
      ...c,
      path,
      title: {
        fr: `${c.label.fr} — cours, devoirs et corrigés gratuits | Examanet`,
        ar: `${c.label.ar} — دروس، فروض وإصلاحات مجانية | إكسامانت`,
      },
      description: {
        fr: isCollege
          ? `Tous les cours, devoirs, séries et exercices corrigés de ${c.label.fr} en Tunisie, en maths, physique, SVT, français et arabe. 100% gratuit, sans inscription.`
          : `Ressources scolaires tunisiennes pour ${c.label.fr} : cours, devoirs, séries d'exercices et corrigés. Maths, sciences, lettres, informatique. 100% gratuit.`,
        ar: isCollege
          ? `جميع الدروس والفوض والسلاسل والتمارين مع الإصلاحات لـ${c.label.ar} في تونس. مجاني 100%.`
          : `موارد دراسية تونسية لـ${c.label.ar}: دروس، فروض، سلاسل تمارين وإصلاحات. مجانية 100%.`,
      },
      intro: {
        fr: c.sections.length
          ? `Retrouvez ici tout le programme de ${c.label.fr} : ${c.sections.length} filières, cours rédigés par des professeurs tunisiens, devoirs surveillés, séries d'exercices et corrigés détaillés. Tous les documents sont en PDF et téléchargeables gratuitement.`
          : `Retrouvez ici tout le programme de ${c.label.fr} : cours rédigés par des professeurs tunisiens, devoirs surveillés, séries d'exercices et corrigés détaillés. Tous les documents sont en PDF et téléchargeables gratuitement.`,
        ar: c.sections.length
          ? `تجد هنا كامل برنامج ${c.label.ar}: ${c.sections.length} مسالك، دروس من إعداد أساتذة تونسيين، فروض مراقبة، سلاسل تمارين وإصلاحات مفصلة. كل الوثائق PDF والتحميل مجاني.`
          : `تجد هنا كامل برنامج ${c.label.ar}: دروس من إعداد أساتذة تونسيين، فروض مراقبة، سلاسل تمارين وإصلاحات مفصلة. كل الوثائق PDF والتحميل مجاني.`,
      },
    };
  });
}

export function getSectionPages(): SectionPageEntry[] {
  const out: SectionPageEntry[] = [];
  for (const c of getClassPages()) {
    for (const s of c.sections) {
      const path = `/classes/${c.slug}/${s.slug}`;
      const isBac = c.slug === '4eme-secondaire';
      // The 4ème-secondaire filière labels already start with "Bac"
      // ("Bac Mathématiques"), so strip it before re-prefixing in titles —
      // otherwise we emit "Bac Bac Sport".
      const frSubject = s.label.fr.replace(/^Bac\s+/i, '');
      const arSubject = s.label.ar;
      out.push({
        path,
        classSlug: c.slug,
        sectionSlug: s.slug,
        classLabel: c.label,
        sectionLabel: s.label,
        cycleLabel: c.cycleLabel,
        title: {
          fr: isBac
            ? `Bac ${frSubject} — 4ème année : sujets, corrigés et cours | Examanet`
            : `${c.shortLabel.fr} — ${frSubject} : cours, devoirs et corrigés | Examanet`,
          ar: `باك ${s.label.ar} — ${c.shortLabel.ar} : مواضيع وإصلاحات ودروس | إكسامانت`,
        },
        description: {
          fr: isBac
            ? `Sujets de baccalauréat ${frSubject} pour la 4ème année en Tunisie, avec corrigés détaillés. Cours et exercices pdf gratuits.`
            : `Cours, devoirs et exercices corrigés de ${frSubject} en ${c.shortLabel.fr}. Fichiers pdf gratuits pour les élèves tunisiens.`,
          ar: `دروس وفروض وتمارين مع الإصلاحات في مادة ${arSubject} لـ${c.shortLabel.ar}. ملفات pdf مجانية للتلاميذ التونسيين.`,
        },
        intro: {
          fr: `Les ressources de la filière ${frSubject} en ${c.shortLabel.fr} : cours complets, devoirs surveillés, séries d'exercices et corrigés, tous en PDF gratuit. Les profs qui ont déposé leurs documents sur Examanet sont crédités automatiquement sur chaque ressource.`,
          ar: `موارد مادة ${arSubject} في ${c.shortLabel.ar}: دروس كاملة، فروض مراقبة، سلاسل تمارين وإصلاحات، كلها PDF مجانية.`,
        },
        faq: [
          {
            q: {
              fr: `Y a-t-il des ressources gratuites en ${frSubject} pour ${c.shortLabel.fr} ?`,
              ar: `هل هناك موارد مجانية في ${s.label.ar} لـ${c.shortLabel.ar}؟`,
            },
            a: {
              fr: `Oui. Toutes les ressources en ${frSubject} pour ${c.shortLabel.fr} sur Examanet sont gratuites : cours, devoirs, séries d'exercices et corrigés, en format PDF. Aucune inscription n'est nécessaire pour les télécharger.`,
              ar: `نعم. جميع موارد ${s.label.ar} لـ${c.shortLabel.ar} على إكسامانت مجانية: دروس، فروض، سلاسل تمارين وإصلاحات، بصيغة PDF. لا حاجة لأي تسجيل للتحميل.`,
            },
          },
          {
            q: {
              fr: 'Les documents sont-ils conformes au programme officiel tunisien ?',
              ar: 'هل الوثائق مطابقة للبرنامج الرسمي التونسي؟',
            },
            a: {
              fr: `Oui, les ressources de cette page suivent le programme officiel tunisien en vigueur pour le cycle ${c.cycleLabel.fr.toLowerCase()}, publié par le Ministère de l'Éducation.`,
              ar: `نعم، موارد هذه الصفحة تتبع البرنامج الرسمي التونسي الجاري للطور ${c.cycleLabel.ar}.`,
            },
          },
          {
            q: {
              fr: 'Les cours sont-ils en français et en arabe ?',
              ar: 'هل الدروس متوفرة بالفرنسية والعربية؟',
            },
            a: {
              fr: "Chaque ressource est publiée avec son titre et son descriptif dans les deux langues. Le site est entièrement bilingue français / arabe.",
              ar: 'كل مورد منشور بعنوان ووصف باللغتين. الموقع ثنائي اللغة بالكامل: الفرنسية والعربية.',
            },
          },
        ],
      });
    }
  }
  return out;
}

export type SitemapPath = {
  path: string;
  priority: number;
  changeFrequency: 'daily' | 'weekly' | 'monthly';
};

/** All sitemap paths for this page tree (locale-less; the sitemap adds /fr + /ar). */
export function getAllClassPaths(): SitemapPath[] {
  const classPages: SitemapPath[] = getClassPages().map((c) => ({
    path: c.path,
    priority: 0.8,
    changeFrequency: 'weekly',
  }));
  const sectionPages: SitemapPath[] = getSectionPages().map((s) => ({
    path: s.path,
    priority: 0.75,
    changeFrequency: 'daily',
  }));
  return [...classPages, ...sectionPages];
}