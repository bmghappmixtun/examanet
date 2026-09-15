import Image from 'next/image';

// 2026 AuthPage icon — uses the official "user + graduation cap" logo.
// Wrapped in a soft sunset glow halo for visual cohesion with the
// InscriptionV2 button gradient.
export default function AuthPageIcon() {
  return (
    <div className="relative inline-block">
      {/* Soft glow halo behind the icon */}
      <div className="absolute inset-0 -m-3 rounded-3xl bg-gradient-to-br from-orange-400/30 via-pink-400/30 to-purple-500/30 blur-2xl" />
      {/* Logo — transparent PNG */}
      <Image
        src="/auth-icon.png"
        alt="Examanet"
        width={64}
        height={64}
        className="relative w-16 h-16 drop-shadow-[0_8px_16px_rgba(240,143,69,0.25)]"
        priority
      />
    </div>
  );
}
