/**
 * Mega Menu Data — official Tunisian curriculum structure
 *
 * Source: Ministère de l'Éducation Tunisien (CNP / JORT 2019-063).
 * Slugs MUST match the DB:
 *   - Class slugs: 7eme, 8eme, 9eme, 1ere-secondaire, 2eme-secondaire, 3eme-secondaire, 4eme-secondaire
 *   - 2AS section slugs: sciences, technologies-informatique, eco-services, lettres, sport
 *   - 3AS/4AS section slugs: maths, sciences-experimentales, technique, sciences-informatique, eco-gestion, lettres, sport
 *
 * Filter URL format: /ressources?class=<slug>&section=<slug>
 * (multi-select supported by appending: ?class=a&class=b&section=x&section=y)
 *
 * 2026-09-18: Created for the 5 mega menu proposals preview.
 */

export type MegaMenuSection = {
  slug: string;
  label: { fr: string; ar: string };
  url: string;
  emoji: string;
  /** Optional short description (shown in visual cards variant) */
  desc?: { fr: string; ar: string };
};

export type MegaMenuNiveau = {
  slug: string;
  label: { fr: string; ar: string };
  url: string;
  emoji: string;
  sections: MegaMenuSection[];
};

export type MegaMenuCycle = {
  slug: 'college' | 'lycee';
  label: { fr: string; ar: string };
  emoji: string;
  /** Tailwind color theme */
  theme: 'emerald' | 'violet';
  niveaux: MegaMenuNiveau[];
};

export const MEGA_MENU_DATA: MegaMenuCycle[] = [
  {
    slug: 'college',
    label: { fr: 'Collège', ar: 'الإعدادي' },
    emoji: '🏫',
    theme: 'emerald',
    niveaux: [
      {
        slug: '7eme',
        label: { fr: '7ème année', ar: 'السابعة أساسي' },
        url: '/ressources?class=7eme',
        emoji: '📗',
        sections: [],
      },
      {
        slug: '8eme',
        label: { fr: '8ème année', ar: 'الثامنة أساسي' },
        url: '/ressources?class=8eme',
        emoji: '📘',
        sections: [],
      },
      {
        slug: '9eme',
        label: { fr: '9ème année', ar: 'التاسعة أساسي' },
        url: '/ressources?class=9eme',
        emoji: '📙',
        sections: [],
      },
    ],
  },
  {
    slug: 'lycee',
    label: { fr: 'Lycée', ar: 'الثانوي' },
    emoji: '🎓',
    theme: 'violet',
    niveaux: [
      {
        slug: '1ere-secondaire',
        label: { fr: '1ère année', ar: 'الأولى ثانوي' },
        url: '/ressources?class=1ere-secondaire',
        emoji: '📓',
        // Tronc commun — no sections per official program (réforme 2017)
        sections: [],
      },
      {
        slug: '2eme-secondaire',
        label: { fr: '2ème année', ar: 'الثانية ثانوي' },
        url: '/ressources?class=2eme-secondaire',
        emoji: '📔',
        sections: [
          {
            slug: 'sciences',
            label: { fr: 'Sciences', ar: 'علوم' },
            url: '/ressources?class=2eme-secondaire&section=sciences',
            emoji: '🔬',
            desc: { fr: 'Math, Physique, SVT', ar: 'رياضيات، فيزياء، علوم' },
          },
          {
            slug: 'technologies-informatique',
            label: { fr: 'Tech. Informatique', ar: 'تكنولوجيا الإعلامية' },
            url: '/ressources?class=2eme-secondaire&section=technologies-informatique',
            emoji: '💻',
            desc: { fr: 'Spécialité Informatique', ar: 'تخصص إعلامية' },
          },
          {
            slug: 'eco-services',
            label: { fr: 'Économie & Services', ar: 'اقتصاد وتصرف' },
            url: '/ressources?class=2eme-secondaire&section=eco-services',
            emoji: '📊',
            desc: { fr: 'Gestion, Économie', ar: 'تصرف، اقتصاد' },
          },
          {
            slug: 'lettres',
            label: { fr: 'Lettres', ar: 'آداب' },
            url: '/ressources?class=2eme-secondaire&section=lettres',
            emoji: '📚',
            desc: { fr: 'Langues, Philo', ar: 'لغات، فلسفة' },
          },
          {
            slug: 'sport',
            label: { fr: 'Sport', ar: 'رياضة' },
            url: '/ressources?class=2eme-secondaire&section=sport',
            emoji: '⚽',
            desc: { fr: 'EPS + matières', ar: 'تربية بدنية + مواد' },
          },
        ],
      },
      {
        slug: '3eme-secondaire',
        label: { fr: '3ème année', ar: 'الثالثة ثانوي' },
        url: '/ressources?class=3eme-secondaire',
        emoji: '📒',
        sections: [
          {
            slug: 'maths',
            label: { fr: 'Mathématiques', ar: 'رياضيات' },
            url: '/ressources?class=3eme-secondaire&section=maths',
            emoji: '📐',
            desc: { fr: 'Math (7h/sem)', ar: 'رياضيات (7ح/أسبوع)' },
          },
          {
            slug: 'sciences-experimentales',
            label: { fr: 'Sciences Exp.', ar: 'علوم تجريبية' },
            url: '/ressources?class=3eme-secondaire&section=sciences-experimentales',
            emoji: '🧪',
            desc: { fr: 'Math, Physique, SVT', ar: 'رياضيات، فيزياء، علوم' },
          },
          {
            slug: 'technique',
            label: { fr: 'Sciences Techniques', ar: 'تقني علمي' },
            url: '/ressources?class=3eme-secondaire&section=technique',
            emoji: '⚙️',
            desc: { fr: 'Math, Génie méca/élec', ar: 'رياضيات، هندسة' },
          },
          {
            slug: 'sciences-informatique',
            label: { fr: 'Sc. Informatique', ar: 'علوم إعلامية' },
            url: '/ressources?class=3eme-secondaire&section=sciences-informatique',
            emoji: '💾',
            desc: { fr: 'Algo, Prog, TIC, SE', ar: 'برمجة، خوارزميات' },
          },
          {
            slug: 'eco-gestion',
            label: { fr: 'Éco-Gestion', ar: 'اقتصاد وتصرف' },
            url: '/ressources?class=3eme-secondaire&section=eco-gestion',
            emoji: '💼',
            desc: { fr: 'Économie, Gestion', ar: 'اقتصاد، تصرف' },
          },
          {
            slug: 'lettres',
            label: { fr: 'Lettres', ar: 'آداب' },
            url: '/ressources?class=3eme-secondaire&section=lettres',
            emoji: '📚',
            desc: { fr: 'Philo, Langues', ar: 'فلسفة، لغات' },
          },
          {
            slug: 'sport',
            label: { fr: 'Sport', ar: 'رياضة' },
            url: '/ressources?class=3eme-secondaire&section=sport',
            emoji: '⚽',
            desc: { fr: 'EPS + matières', ar: 'تربية بدنية' },
          },
        ],
      },
      {
        slug: '4eme-secondaire',
        label: { fr: 'Baccalauréat', ar: 'الباكالوريا' },
        url: '/ressources?class=4eme-secondaire',
        emoji: '🎯',
        sections: [
          {
            slug: 'maths',
            label: { fr: 'Bac Mathématiques', ar: 'باك رياضيات' },
            url: '/ressources?class=4eme-secondaire&section=maths',
            emoji: '📐',
            desc: { fr: 'Math (9h/sem)', ar: 'رياضيات (9ح/أسبوع)' },
          },
          {
            slug: 'sciences-experimentales',
            label: { fr: 'Bac Sciences Exp.', ar: 'باك علوم تجريبية' },
            url: '/ressources?class=4eme-secondaire&section=sciences-experimentales',
            emoji: '🧪',
            desc: { fr: 'Math, Physique, SVT', ar: 'رياضيات، فيزياء، علوم' },
          },
          {
            slug: 'technique',
            label: { fr: 'Bac Technique', ar: 'باك تقني' },
            url: '/ressources?class=4eme-secondaire&section=technique',
            emoji: '⚙️',
            desc: { fr: 'Math, Génie', ar: 'رياضيات، هندسة' },
          },
          {
            slug: 'sciences-informatique',
            label: { fr: 'Bac Sciences Info', ar: 'باك علوم إعلامية' },
            url: '/ressources?class=4eme-secondaire&section=sciences-informatique',
            emoji: '💾',
            desc: { fr: 'Algo, BD, TIC', ar: 'برمجة، قواعد بيانات' },
          },
          {
            slug: 'eco-gestion',
            label: { fr: 'Bac Éco-Gestion', ar: 'باك اقتصاد وتصرف' },
            url: '/ressources?class=4eme-secondaire&section=eco-gestion',
            emoji: '💼',
            desc: { fr: 'Économie, Gestion', ar: 'اقتصاد، تصرف' },
          },
          {
            slug: 'lettres',
            label: { fr: 'Bac Lettres', ar: 'باك آداب' },
            url: '/ressources?class=4eme-secondaire&section=lettres',
            emoji: '📚',
            desc: { fr: 'Philo, Histoire', ar: 'فلسفة، تاريخ' },
          },
          {
            slug: 'sport',
            label: { fr: 'Bac Sport', ar: 'باك رياضة' },
            url: '/ressources?class=4eme-secondaire&section=sport',
            emoji: '⚽',
            desc: { fr: 'EPS + matières', ar: 'تربية بدنية' },
          },
        ],
      },
    ],
  },
];

/** All cycle slugs (for navigation purposes) */
export const MEGA_MENU_CYCLES = MEGA_MENU_DATA;

/** Get all "leaf" links (niveaux + sections) for sitemap/SEO use */
export function flattenMegaMenuLinks(): Array<{ url: string; label: string }> {
  const links: Array<{ url: string; label: string }> = [];
  for (const cycle of MEGA_MENU_DATA) {
    for (const niveau of cycle.niveaux) {
      links.push({ url: niveau.url, label: niveau.label.fr });
      for (const section of niveau.sections) {
        links.push({ url: section.url, label: section.label.fr });
      }
    }
  }
  return links;
}
