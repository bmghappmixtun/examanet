import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth';
// 2026-09-03: Migrated to D1 direct
async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}
import UserMenu from './UserMenu';
import MobileMenu from './MobileMenu';
import SearchModalTrigger from '@/components/search/SearchModalTrigger';
import { ConnexionV2, InscriptionV2 } from './buttons/ButtonV2Aurora';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function Header() {
  const user = await getCurrentUser();
  const t = await getTranslations();
  let unreadNotifications = 0;
  if (user) {
    try {
      const db = await getD1();
      if (db) {
        const r: any = await db.prepare(
          "SELECT COUNT(*) as c FROM Notification WHERE userId = ? AND isRead = 0"
        ).bind(user.id).first();
        unreadNotifications = r?.c || 0;
      }
    } catch (e) {
      // Notification count is optional; header renders fine without it.
    }
  }

  return (
    <header data-default-header className="fixed top-0 start-0 end-0 z-50 bg-white/85 backdrop-blur-xl border-b border-slate-200/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-[62px] lg:h-[73px] gap-4">
          {/* LEFT: Logo */}
          <div className="flex-1 flex justify-start min-w-0">
            <Link
              href="/"
              className="flex items-center group shrink-0"
              aria-label="Examanet - accueil"
            >
              {/* Mobile: icon only — display-sized PNG (98% smaller than original 1024x1024) */}
              <picture className="sm:hidden">
                <source
                  type="image/png"
                  srcset="/icon-transparent-62x62.png 1x, /icon-transparent-124x124.png 2x"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icon-transparent-62x62.png"
                  alt=""
                  width={62}
                  height={62}
                  className="w-[62px] h-[62px] group-hover:scale-105 transition"
                  fetchpriority="high"
                  decoding="async"
                />
              </picture>
              {/* Desktop: full logo (icon + wordmark) — display-sized PNG */}
              <picture className="hidden sm:block">
                <source
                  type="image/png"
                  srcset="/logo-transparent-269x73.png 1x, /logo-transparent-538x146.png 2x"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-transparent-269x73.png"
                  alt="Examanet"
                  width={269}
                  height={73}
                  className="h-[62px] lg:h-[73px] w-auto group-hover:scale-[1.02] transition-transform"
                  fetchpriority="high"
                  decoding="async"
                />
              </picture>
            </Link>
          </div>

          {/* CENTER: Main nav (centered between logo and search) */}
          <nav className="hidden lg:flex items-center gap-7 shrink-0">
            <Link
              href="/ressources"
              className="group relative text-base font-semibold text-slate-700 hover:text-primary-600 transition-colors"
            >
              {t('nav.resources')}
              <span
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-[4px] bg-[#f08f45] rounded-full
                           w-0 group-hover:w-3/4 transition-all duration-500 ease-out"
              />
            </Link>
            <Link
              href="/niveaux"
              className="group relative text-base font-semibold text-slate-700 hover:text-primary-600 transition-colors"
            >
              {t('nav.levels')}
              <span
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-[4px] bg-[#f08f45] rounded-full
                           w-0 group-hover:w-3/4 transition-all duration-500 ease-out"
              />
            </Link>
            <Link
              href="/matieres"
              className="group relative text-base font-semibold text-slate-700 hover:text-primary-600 transition-colors"
            >
              {t('nav.subjects')}
              <span
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-[4px] bg-[#f08f45] rounded-full
                           w-0 group-hover:w-3/4 transition-all duration-500 ease-out"
              />
            </Link>
            <Link
              href="/professeurs"
              className="group relative text-base font-semibold text-slate-700 hover:text-primary-600 transition-colors"
            >
              {t('nav.teachers')}
              <span
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-[4px] bg-[#f08f45] rounded-full
                           w-0 group-hover:w-3/4 transition-all duration-500 ease-out"
              />
            </Link>
          </nav>

          {/* RIGHT: Search + actions */}
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <SearchModalTrigger />
            {user ? (
              <UserMenu user={user} unreadCount={unreadNotifications} />
            ) : (
              <>
                <ConnexionV2 />
                <InscriptionV2 />
              </>
            )}
            <MobileMenu user={user} />
          </div>
        </div>
      </div>
    </header>
  );
}
