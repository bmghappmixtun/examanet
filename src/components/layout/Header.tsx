import { Link } from '@/i18n/navigation';
import Image from 'next/image';
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
    <header className="fixed top-0 start-0 end-0 z-50 bg-white/85 backdrop-blur-xl border-b border-slate-200/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-[62px] lg:h-[73px] gap-4">
          {/* LEFT: Logo */}
          <div className="flex-1 flex justify-start min-w-0">
            <Link
              href="/"
              className="flex items-center group shrink-0"
              aria-label="Examanet - accueil"
            >
              {/* Mobile: icon only */}
              <Image
                src="/icon-transparent.png"
                alt=""
                width={62}
                height={62}
                sizes="62px"
                className="sm:hidden w-[62px] h-[62px] group-hover:scale-105 transition"
                priority
              />
              {/* Desktop: full logo (icon + wordmark) — single SVG master */}
              <Image
                src="/logo-transparent.png"
                alt="Examanet"
                width={269}
                height={73}
                sizes="(min-width: 1024px) 269px, (min-width: 640px) 200px, 0px"
                className="hidden sm:block h-[62px] lg:h-[73px] w-auto group-hover:scale-[1.02] transition-transform"
                priority
              />
            </Link>
          </div>

          {/* CENTER: Main nav (centered between logo and search) */}
          <nav className="hidden lg:flex items-center gap-7 shrink-0">
            <Link
              href="/ressources"
              className="text-sm font-medium text-slate-700 hover:text-primary-600 transition"
            >
              {t('nav.resources')}
            </Link>
            <Link
              href="/niveaux"
              className="text-sm font-medium text-slate-700 hover:text-primary-600 transition"
            >
              {t('nav.levels')}
            </Link>
            <Link
              href="/matieres"
              className="text-sm font-medium text-slate-700 hover:text-primary-600 transition"
            >
              {t('nav.subjects')}
            </Link>
            <Link
              href="/professeurs"
              className="text-sm font-medium text-slate-700 hover:text-primary-600 transition"
            >
              {t('nav.teachers')}
            </Link>
          </nav>

          {/* RIGHT: Search + actions */}
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <SearchModalTrigger />
            {user ? (
              <UserMenu user={user} unreadCount={unreadNotifications} />
            ) : (
              <>
                <Link
                  href="/connexion"
                  className="hidden sm:block text-sm font-semibold text-slate-700 hover:text-primary-600 px-3 py-2 transition"
                >
                  {t('nav.login')}
                </Link>
                <Link href="/inscription" className="btn-primary text-sm">
                  {t('nav.signup')}
                </Link>
              </>
            )}
            <MobileMenu user={user} />
          </div>
        </div>
      </div>
    </header>
  );
}
