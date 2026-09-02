'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Card to opt out of Vercel Analytics on the current browser.
 * Sets the official `va-disable` cookie (1 year, SameSite=Lax).
 */
export default function OptOutCard() {
  const [optedOut, setOptedOut] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const value = document.cookie
      .split('; ')
      .find((row) => row.startsWith('va-disable='))
      ?.split('=')[1];
    setOptedOut(value === 'true');
    setReady(true);
  }, []);

  function toggle() {
    if (optedOut) {
      // Re-enable: clear cookie
      document.cookie = 'va-disable=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
      setOptedOut(false);
    } else {
      // Opt out: 1 year cookie
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `va-disable=true; expires=${expires}; path=/; SameSite=Lax`;
      setOptedOut(true);
    }
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5">
      <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <EyeOff className="w-4 h-4" />
        Exclure tes propres visites
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        Pour ne pas être compté dans les stats quand tu navigues sur ton propre site (même sur les
        pages publiques), active l'opt-out ci-dessous. Vercel utilise un cookie{' '}
        <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">va-disable</code> officiel pour
        respecter ton choix — il dure 1 an et s'applique à toutes tes visites depuis ce navigateur.
      </p>
      {!ready ? (
        <div className="h-10 bg-slate-100 rounded-xl animate-pulse w-48" />
      ) : (
        <button
          onClick={toggle}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition ${
            optedOut
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {optedOut ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {optedOut
            ? 'Réactiver Analytics sur ce navigateur'
            : 'Désactiver Analytics sur ce navigateur'}
        </button>
      )}
      <p className="text-xs text-slate-400 mt-3">
        Astuce : ouvre aussi un navigateur en navigation privée pour voir le site "comme un
        visiteur".
      </p>
    </div>
  );
}
