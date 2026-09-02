'use client';
import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useLocale } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import NextLink from 'next/link';

/**
 * Language Picker (Etsy-style footer dropdown)
 *
 * Shows a small globe icon + current language + chevron in the footer.
 * When clicked, opens a dropdown with both languages listed.
 *
 * Smart behavior:
 * - On /fr/* or /ar/* pages: switch to the other locale, keep same page
 * - On non-localized pages (/connexion, /admin, etc):
 *   - Use plain next/link, no locale prefix (since the page is the same in both languages)
 */

const NON_LOCALIZED_PREFIXES = [
  '/connexion', '/inscription', '/mot-de-passe-oublie',
  '/admin', '/enseignant', '/mon-compte', '/messages',
  '/en-attente', '/verifier', '/invitation', '/api', '/_next',
];

function isNonLocalized(path: string): boolean {
  return NON_LOCALIZED_PREFIXES.some(prefix => path.startsWith(prefix));
}

const LANGUAGES = [
  { code: 'fr', label: 'Français', short: 'FR', flag: '🇫🇷' },
  { code: 'ar', label: 'العربية',  short: 'AR', flag: '🇹🇳' },
] as const;

export default function LanguagePicker() {
  const locale = useLocale() as 'fr' | 'ar';
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find(l => l.code === locale) || LANGUAGES[0];
  const nonLocalized = isNonLocalized(pathname);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg transition"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Globe className="w-4 h-4" />
        <span className="font-bold">{current.short}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full mb-2 end-0 min-w-[160px] bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50"
        >
          {LANGUAGES.map(lang => {
            const isCurrent = lang.code === locale;
            const className = `w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-700 transition ${
              isCurrent ? 'text-primary-400 font-semibold' : 'text-slate-200'
            }`;
            const content = (
              <>
                <span className="text-lg">{lang.flag}</span>
                <span className="flex-1 text-start">{lang.label}</span>
                {isCurrent && <Check className="w-4 h-4" />}
              </>
            );
            if (nonLocalized) {
              return (
                <NextLink
                  key={lang.code}
                  href={pathname}
                  role="menuitem"
                  className={className}
                  onClick={() => setOpen(false)}
                >
                  {content}
                </NextLink>
              );
            }
            return (
              <Link
                key={lang.code}
                href={pathname}
                locale={lang.code}
                role="menuitem"
                className={className}
                onClick={() => setOpen(false)}
              >
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
