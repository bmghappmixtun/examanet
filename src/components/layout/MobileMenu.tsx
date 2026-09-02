'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@/i18n/navigation';
import NextLink from 'next/link';
import { Menu, X, LogIn, UserPlus } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';

export default function MobileMenu({ user }: { user: any }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isTeacher = user?.role === 'TEACHER';
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const menuContent = open ? (
    <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true">
      <div
        role="presentation"
        className="absolute inset-0 bg-slate-900/50"
        onClick={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      />
      <div className="absolute end-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 flex-shrink-0">
          <span className="font-extrabold text-lg">{t('nav.menu')}</span>
          <button
            onClick={() => setOpen(false)}
            className="p-2 hover:bg-slate-100 rounded-lg"
            aria-label={t('nav.closeMenu')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {user ? (
          <div className="p-4 bg-gradient-to-br from-primary-50 to-white flex-shrink-0">
            <div className="font-bold">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 gap-2 border-b border-slate-100 flex-shrink-0">
            <NextLink
              href="/connexion"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50 transition"
            >
              <LogIn className="w-4 h-4" /> {t('nav.login')}
            </NextLink>
            <NextLink
              href="/inscription"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 transition"
            >
              <UserPlus className="w-4 h-4" /> {t('nav.signup')}
            </NextLink>
          </div>
        )}

        <nav className="p-2 flex-1">
          <Link
            href="/ressources"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 hover:bg-slate-50 rounded-lg font-medium"
          >
            📚 {t('nav.resources')}
          </Link>
          <Link
            href="/college"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 hover:bg-slate-50 rounded-lg font-medium"
          >
            🏫 {t('nav.college')}
          </Link>
          <Link
            href="/concours-9eme-tunisie"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 hover:bg-amber-50 rounded-lg font-medium bg-amber-50/50 border-r-4 border-amber-400"
          >
            🎯 {t('nav.concours')}
          </Link>
          <Link
            href="/niveaux"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 hover:bg-slate-50 rounded-lg font-medium"
          >
            📊 {t('nav.levels')}
          </Link>
          <Link
            href="/matieres"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 hover:bg-slate-50 rounded-lg font-medium"
          >
            📖 {t('nav.subjects')}
          </Link>
          <Link
            href="/professeurs"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 hover:bg-slate-50 rounded-lg font-medium"
          >
            👨‍🏫 {t('nav.teachers')}
          </Link>
          <Link
            href="/faq"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 hover:bg-slate-50 rounded-lg font-medium"
          >
            ❓ FAQ
          </Link>

          {user && (
            <>
              <div className="border-t border-slate-100 my-2"></div>
              <NextLink
                href="/mon-compte"
                onClick={() => setOpen(false)}
                className="block px-4 py-3 hover:bg-slate-50 rounded-lg font-medium"
              >
                {t('nav.myAccount')}
              </NextLink>
              <NextLink
                href="/mon-compte/favoris"
                onClick={() => setOpen(false)}
                className="block px-4 py-3 hover:bg-slate-50 rounded-lg font-medium"
              >
                {t('nav.favorites')}
              </NextLink>
              {(isTeacher || isAdmin) && (
                <NextLink
                  href="/enseignant"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-amber-50 text-amber-700 rounded-lg font-medium"
                >
                  {t('nav.teacherSpace')}
                </NextLink>
              )}
              {isAdmin && (
                <NextLink
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-red-50 text-red-600 rounded-lg font-medium"
                >
                  {t('nav.adminPanel')}
                </NextLink>
              )}
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 rounded-lg font-medium"
                >
                  {t('nav.logout')}
                </button>
              </form>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100 text-xs text-slate-500 flex-shrink-0">
          <Link href="/a-propos" onClick={() => setOpen(false)} className="hover:text-slate-700">
            {t('nav.about')}
          </Link>
          <span className="mx-2">·</span>
          <Link href="/contact" onClick={() => setOpen(false)} className="hover:text-slate-700">
            {t('nav.contact')}
          </Link>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden p-2 min-h-[44px] min-w-[44px] text-slate-700 hover:bg-slate-100 rounded-lg"
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Render modal at document.body level via portal to escape any ancestor
          containing block (e.g., parent's backdrop-filter, transform, etc.) */}
      {mounted && menuContent && createPortal(menuContent, document.body)}
    </>
  );
}
