// @ts-nocheck
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getInitials } from '@/lib/text-utils';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import FloatingUploadButton from '@/components/layout/FloatingUploadButton';
import { getCurrentUser, isTeacherProfileComplete } from '@/lib/auth';
import Link from 'next/link';
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  User,
  Bell,
  Shield,
  ChevronRight,
  BookOpen,
  Settings,
  Heart,
  Plus,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';

// Teacher dashboard pages should never be indexed
export const metadata: Metadata = {
  title: 'Espace enseignant',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

function num(v: any): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') redirect('/');

  // 2026-09-11: Force profile completion for teachers
  // Admins can always access (they need to manage teachers)
  // Skip check for the /profil/completer page itself to avoid redirect loop
  if (
    user.role === 'TEACHER' &&
    !isTeacherProfileComplete(user)
  ) {
    redirect('/profil/completer?welcome=1&from=incomplete');
  }

  const db = await getD1();

  // Check teacher status (D1)
  // Note: User table has no verificationFilesCount/verificationFilesReceivedAt
  // in D1 (these were never migrated from Prisma schema).
  const teacherStatus = await db
    .prepare(
      `SELECT status FROM User WHERE id = ?`,
    )
    .bind(user.id)
    .first()
    .catch(() => null);
  // For ADMIN, always allow upload. For TEACHER, require ACTIVE status.
  const canUpload = user.role === 'ADMIN' || teacherStatus?.status === 'ACTIVE';

  // Sidebar counts (D1)
  const [
    myResourcesR,
    publishedResourcesR,
    pendingApprovalR,
    pendingEditsR,
    rejectedEditsR,
    unreadNotifsR,
    libraryCountR,
    favoritesCountR,
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM Resource WHERE teacherId = ?').bind(user.id).first().catch(() => ({ c: 0 })),
    db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND status = 'PUBLISHED'").bind(user.id).first().catch(() => ({ c: 0 })),
    db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND status = 'PENDING_APPROVAL'").bind(user.id).first().catch(() => ({ c: 0 })),
    db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND editStatus = 'PENDING_EDIT_APPROVAL'").bind(user.id).first().catch(() => ({ c: 0 })),
    db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND editStatus = 'EDIT_REJECTED'").bind(user.id).first().catch(() => ({ c: 0 })),
    db.prepare("SELECT COUNT(*) as c FROM Notification WHERE userId = ? AND isRead = 0").bind(user.id).first().catch(() => ({ c: 0 })),
    db.prepare('SELECT COUNT(*) as c FROM TeacherFile WHERE teacherId = ?').bind(user.id).first().catch(() => ({ c: 0 })),
    db.prepare('SELECT COUNT(*) as c FROM Favorite WHERE userId = ?').bind(user.id).first().catch(() => ({ c: 0 })),
  ]);

  const myResources = num(myResourcesR?.c);
  const publishedResources = num(publishedResourcesR?.c);
  const pendingApproval = num(pendingApprovalR?.c);
  const pendingEdits = num(pendingEditsR?.c);
  const rejectedEdits = num(rejectedEditsR?.c);
  const unreadNotifs = num(unreadNotifsR?.c);
  const libraryCount = num(libraryCountR?.c);
  const favoritesCount = num(favoritesCountR?.c);

  const initials = getInitials(user.firstName, user.lastName);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <div className="flex-1 pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid lg:grid-cols-[280px_1fr] gap-6">
            <aside className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto space-y-2">
              <Link
                href="/enseignant/profil"
                className="block bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-4 text-white shadow-md hover:shadow-lg transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center font-extrabold text-xl flex-shrink-0 relative">
                    {initials}
                    {/* 2026-09-11: Verified teacher badge */}
                    {user.isVerifiedTeacher && (
                      <span
                        className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center ring-2 ring-amber-600"
                        title="Enseignant Vérifié"
                      >
                        <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate flex items-center gap-1.5">
                      {user.firstName} {user.lastName}
                      {user.isVerifiedTeacher && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-500/20 text-green-50 text-[10px] font-bold rounded-full"
                          title={`Vérifié le ${user.verifiedAt ? new Date(user.verifiedAt).toLocaleDateString('fr-FR') : ''}`}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={3} />
                          Vérifié
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-amber-100 truncate">
                      {user.schoolName || 'Enseignant'}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition" />
                </div>
                {pendingApproval + pendingEdits + rejectedEdits + unreadNotifs > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/20 text-xs text-amber-100">
                    {pendingApproval + pendingEdits + unreadNotifs} action{pendingApproval + pendingEdits + unreadNotifs > 1 ? 's' : ''} en attente
                  </div>
                )}
              </Link>

              <div className="bg-white rounded-2xl border border-slate-100 p-2 shadow-sm">
                <div className="px-3 pt-2 pb-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Navigation</div>
                <div className="space-y-0.5">
                  {[
                    { href: '/enseignant', icon: LayoutDashboard, label: 'Dashboard' },
                    { href: '/enseignant/ressources', icon: FileText, label: 'Mes ressources', badge: myResources },
                    { href: '/enseignant/ajouter', icon: Plus, label: 'Nouvelle ressource' },
                    { href: '/enseignant/bibliotheque', icon: BookOpen, label: 'Bibliothèque', badge: libraryCount },
                    { href: '/enseignant/favoris', icon: Heart, label: 'Favoris', badge: favoritesCount },
                    { href: '/enseignant/analytics', icon: BarChart3, label: 'Analytics' },
                    { href: '/enseignant/notifications', icon: Bell, label: 'Notifications', badge: unreadNotifs },
                    { href: '/enseignant/profil', icon: User, label: 'Profil' },
                    { href: '/enseignant/commentaires', icon: MessageSquare, label: 'Mes commentaires & avis' },
                    { href: '/enseignant/parametres', icon: Settings, label: 'Paramètres' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-amber-50 hover:text-amber-700 transition"
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="px-1.5 py-0.5 text-amber-700 bg-amber-100 text-[10px] font-bold rounded-full">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {!canUpload && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                  <strong>Upload bloqué</strong> · Votre compte doit être validé pour publier.
                </div>
              )}
            </aside>

            <main>{children}</main>
          </div>
        </div>
      </div>
      <Footer />
      {canUpload && <FloatingUploadButton />}
    </div>
  );
}
