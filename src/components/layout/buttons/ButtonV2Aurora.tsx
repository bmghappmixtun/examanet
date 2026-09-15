'use client';
// V2: "Aurora Border" — Animated conic gradient ring + Sunset gradient inner fill.
// Stripe/Linear/Vercel 2026 style. Inner fill: orange → pink → purple (sunset).
import { Link } from '@/i18n/navigation';

export function ConnexionV2() {
  return (
    <div className="relative group p-[2px] rounded-full overflow-hidden hidden sm:block">
      <div
        className="absolute inset-0 rounded-full opacity-70 group-hover:opacity-100 transition-opacity"
        style={{
          background: 'conic-gradient(from var(--angle, 0deg), #f08f45, #0EA5E9, #A855F7, #EC4899, #f08f45)',
          animation: 'spin 4s linear infinite',
        }}
      />
      <Link
        href="/connexion"
        className="relative block px-4 py-2 text-sm font-medium text-slate-900 bg-white rounded-full
                   group-hover:bg-slate-50 transition-colors"
      >
        Connexion
      </Link>
      <style>{`
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes spin {
          to { --angle: 360deg; }
        }
      `}</style>
    </div>
  );
}

export function InscriptionV2() {
  return (
    <div className="relative group p-[2px] rounded-full overflow-hidden">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'conic-gradient(from var(--angle, 0deg), #f08f45, #0EA5E9, #A855F7, #EC4899, #f08f45)',
          animation: 'spin 4s linear infinite',
        }}
      />
      <Link
        href="/inscription"
        className="relative block px-5 py-2 text-sm font-semibold text-white rounded-full transition-all duration-300
                   group-hover:scale-[1.02]
                   bg-gradient-to-r from-[#f08f45] via-[#ec4899] to-[#a855f7]
                   bg-[length:200%_100%] group-hover:bg-[position:100%_0]
                   shadow-[0_4px_12px_-2px_rgba(236,72,153,0.4)]"
      >
        Inscription
      </Link>
      <style>{`
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes spin {
          to { --angle: 360deg; }
        }
      `}</style>
    </div>
  );
}
