// 2026 modern AuthPage icon — used on /connexion and /inscription pages.
// Sunset gradient (matches the new Inscription button) + abstract open-book
// with sparkles. Glassmorphism + soft glow.
export default function AuthPageIcon({ className = 'w-7 h-7 text-white' }: { className?: string }) {
  return (
    <div className="relative">
      {/* Soft glow halo behind the icon */}
      <div className="absolute inset-0 -m-2 rounded-2xl bg-gradient-to-br from-orange-400/30 via-pink-400/30 to-purple-500/30 blur-xl" />
      {/* Main icon container — sunset gradient like InscriptionV2 */}
      <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-[#f08f45] via-[#ec4899] to-[#a855f7] flex items-center justify-center shadow-[0_8px_24px_-6px_rgba(236,72,153,0.5)]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Abstract open book — modern, geometric */}
          <path d="M2 6.5a1.5 1.5 0 0 1 1.5-1.5h5.5a2 2 0 0 1 2 2v11" />
          <path d="M22 6.5a1.5 1.5 0 0 0-1.5-1.5h-5.5a2 2 0 0 0-2 2v11" />
          <path d="M11 18.5a2 2 0 0 1 2-2h5.5a1.5 1.5 0 0 1 1.5 1.5" opacity="0.7" />
          <path d="M2 18.5a1.5 1.5 0 0 0 1.5 1.5h5.5a2 2 0 0 0 2-2" opacity="0.7" />
          {/* Sparkle accent */}
          <path d="M19 3l.5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5l1.5-.5z" fill="currentColor" stroke="none" />
        </svg>
      </div>
    </div>
  );
}
