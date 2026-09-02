'use client';

import Link from 'next/link';
import { FileQuestion, Home, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations();
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 to-indigo-50">
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full text-center">
          {/* Animated icon */}
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-sky-200 rounded-full blur-2xl opacity-50" />
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-sky-100 to-indigo-100 flex items-center justify-center mx-auto shadow-lg">
              <FileQuestion className="w-12 h-12 text-sky-600" aria-hidden="true" />
            </div>
          </div>

          {/* 404 */}
          <div className="text-7xl sm:text-8xl font-extrabold bg-gradient-to-br from-sky-500 to-indigo-600 bg-clip-text text-transparent mb-3 tracking-tight">
            404
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
            {t('errors.notFound')}
          </h1>

          {/* Message */}
          <p className="text-base sm:text-lg text-slate-600 mb-8 leading-relaxed">
            {t('errors.notFoundDesc')}
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold shadow-md hover:shadow-lg hover:from-primary-600 hover:to-primary-700 transition-all min-h-[44px]"
            >
              <Home className="w-5 h-5" />
              {t('errors.backHome')}
            </Link>

            <Link
              href="/ressources"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all min-h-[44px]"
            >
              <Search className="w-5 h-5" />
              Explorer les ressources
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
