// 2026 AuthPage icon — uses the official "user + graduation cap" logo.
// Wrapped in a soft sunset glow halo for visual cohesion with the
// InscriptionV2 button gradient.
// 2026-09-15: Switched to <picture> with lossless WebP (734KB → 4KB) + PNG fallback
export default function AuthPageIcon() {
  return (
    <div className="relative inline-block">
      {/* Soft glow halo behind the icon */}
      <div className="absolute inset-0 -m-3 rounded-3xl bg-gradient-to-br from-orange-400/30 via-pink-400/30 to-purple-500/30 blur-2xl" />
      {/* Logo — WebP with PNG fallback (lossless, identical pixels) */}
      <picture>
        <source
          type="image/webp"
          srcSet="/auth-icon-64x64.webp 1x, /auth-icon-128x128.webp 2x"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/auth-icon.png"
          alt="Examanet"
          width={64}
          height={64}
          className="relative w-16 h-16 drop-shadow-[0_8px_16px_rgba(240,143,69,0.25)]"
          fetchPriority="high"
          decoding="async"
        />
      </picture>
    </div>
  );
}
