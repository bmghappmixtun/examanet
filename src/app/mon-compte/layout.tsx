import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getInitials } from '@/lib/text-utils';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { getCurrentUser } from '@/lib/auth';
import Link from 'next/link';
import { LayoutDashboard, Heart, Settings, Bell } from 'lucide-react';

// Student account pages should never be indexed
export const metadata: Metadata = {
  title: 'Mon compte',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');

  // For teachers/admins, /mon-compte/* pages are also accessible under
  // /enseignant/* with the teacher sidebar. Don't double the sidebar here.
  if (user.role === 'TEACHER' || user.role === 'ADMIN') {
    return <>{children}</>;
  }

  const initials = getInitials(user.firstName, user.lastName);

  const navItems = [
    { href: '/mon-compte', icon: LayoutDashboard, label: 'Tableau de bord', exact: true },
    { href: '/mon-compte/favoris', icon: Heart, label: 'Mes favoris' },
    { href: '/mon-compte/notifications', icon: Bell, label: 'Notifications' },
    { href: '/mon-compte/parametres', icon: Settings, label: 'Paramètres' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <div className="flex-1 pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid lg:grid-cols-[260px_1fr] gap-8">
            {/* Sidebar */}
            <aside>
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden sticky top-24">
                <div className="p-6 bg-gradient-to-br from-primary-500 to-primary-700 text-center">
                  <div className="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center text-white font-extrabold text-2xl mb-2">
                    {initials}
                  </div>
                  <div className="font-bold text-white">
                    {user.firstName} {user.lastName}
                  </div>
                  <div className="text-xs text-primary-100">{user.email}</div>
                  <div className="mt-2 inline-block px-3 py-1 bg-white/20 text-white text-xs font-bold rounded-full">
                    {user.role === 'TEACHER'
                      ? '👨‍🏫 Enseignant'
                      : user.role === 'ADMIN'
                        ? '🛡️ Admin'
                        : '👨‍🎓 Élève'}
                  </div>
                </div>
                <nav className="p-2">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 text-sm font-medium text-slate-700 transition"
                    >
                      <item.icon className="w-4 h-4" /> {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </aside>
            <main>{children}</main>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
