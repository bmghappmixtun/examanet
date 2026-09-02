import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import { Facebook, Twitter, Instagram, Youtube, GraduationCap } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import LanguagePicker from './LanguagePicker';

export default async function Footer() {
  const t = await getTranslations();

  // Compute the year once on the server to avoid hydration mismatches
  // when the server timezone differs from the client timezone (e.g., around
  // midnight on New Year's Eve, the server could be 2026 while the client
  // is 2027). Also use 'en-US' locale for a stable 4-digit year format.
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 text-slate-300 pt-16 pb-6 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-8 mb-10">
          {/* Logo + description + socials */}
          <div className="md:col-span-2 lg:col-span-2">
            <Link href="/" className="inline-block mb-4 group" aria-label="Examanet - accueil">
              <Image
                src="/logo-cream-on-dark.png"
                alt="Examanet - Plateforme pédagogique tunisienne"
                width={159}
                height={60}
                className="h-[60px] w-auto opacity-95 group-hover:opacity-100 transition"
                priority={false}
              />
            </Link>
            <p className="text-sm text-slate-400 mb-4 max-w-sm">{t('footer.madeWith')}</p>
            <div className="flex gap-2">
              {[Facebook, Twitter, Instagram, Youtube].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-9 h-9 rounded-full bg-slate-800 hover:bg-primary-600 flex items-center justify-center transition"
                  aria-label="Réseau social"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Column 1: Navigation */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wide">
              {t('footer.navigation')}
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="hover:text-primary-400 transition">
                  {t('nav.home')}
                </Link>
              </li>
              <li>
                <Link href="/ressources" className="hover:text-primary-400 transition">
                  {t('nav.resources')}
                </Link>
              </li>
              <li>
                <Link href="/niveaux" className="hover:text-primary-400 transition">
                  {t('nav.levels')}
                </Link>
              </li>
              <li>
                <Link href="/matieres" className="hover:text-primary-400 transition">
                  {t('nav.subjects')}
                </Link>
              </li>
              <li>
                <Link href="/professeurs" className="hover:text-primary-400 transition">
                  {t('nav.teachers')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Parcours (3 main education pathways) */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wide">
              {t('footer.pillars')}
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/college" className="hover:text-primary-400 transition">
                  {t('nav.college')}
                </Link>
              </li>
              <li>
                <Link href="/concours-9eme-tunisie" className="hover:text-primary-400 transition">
                  {t('nav.concours')}
                </Link>
              </li>
              <li>
                <Link href="/bac" className="hover:text-primary-400 transition">
                  {t('nav.bac')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Ressources (archives + référence) */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wide">
              {t('footer.tools')}
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/programme-officiel" className="hover:text-primary-400 transition">
                  {t('programmeOfficiel.footerLink')}
                </Link>
              </li>
              <li>
                <Link href="/bac/archives" className="hover:text-primary-400 transition">
                  {t('footer.bacSubjects')}
                </Link>
              </li>
              <li>
                <Link
                  href="/concours-9eme-tunisie/sujets-passes"
                  className="hover:text-primary-400 transition"
                >
                  {t('footer.concoursSubjects')}
                </Link>
              </li>
              <li>
                <Link
                  href="/ressources?hasCorrection=1"
                  className="hover:text-primary-400 transition"
                >
                  {t('footer.corrections')}
                </Link>
              </li>
              <li>
                <Link href="/referentiel-national" className="hover:text-primary-400 transition">
                  {t('footer.referentiel')}
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-primary-400 transition">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: À propos (legal + about) */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wide">
              {t('footer.about')}
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/a-propos" className="hover:text-primary-400 transition">
                  {t('nav.about')}
                </Link>
              </li>
              <li>
                <Link href="/enseignants/rejoindre" className="hover:text-primary-400 transition flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{t('footer.joinAsTeacher')}</span>
                </Link>
              </li>
              <li>
                <Link href="/cgu" className="hover:text-primary-400 transition">
                  CGU
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-primary-400 transition">
                  {t('nav.contact')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-xs text-slate-500">
            {t('footer.copyright', { year: String(currentYear) })}
          </p>
          <div className="flex items-center gap-3">
            <LanguagePicker />
            <p className="text-xs text-slate-500">{t('footer.madeWith')}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
