'use client';
import { Link } from '@/i18n/navigation';
import NextLink from 'next/link';
import { getInitials } from '@/lib/text-utils';
import { useState, useRef, useEffect } from 'react';
import {
  LogOut,
  Settings,
  Heart,
  Upload,
  LayoutDashboard,
  Shield,
  ChevronDown,
  Bell,
} from 'lucide-react';

export default function UserMenu({ user, unreadCount }: { user: any; unreadCount: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = getInitials(user.firstName, user.lastName);
  const isTeacher = user.role === 'TEACHER';
  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 ps-1 pe-2 py-1 min-h-[44px] rounded-full hover:bg-slate-100 transition"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white font-bold text-sm flex items-center justify-center">
          {initials}
        </div>
        <ChevronDown className="w-4 h-4 text-slate-500 hidden sm:block" />
      </button>

      {open && (
        <div className="absolute end-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
          <div className="p-4 border-b border-slate-100 bg-gradient-to-br from-primary-50 to-white">
            <div className="font-bold text-slate-900">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
            <div className="mt-2 inline-block px-2 py-0.5 bg-primary-100 text-primary-700 text-[10px] font-bold rounded">
              {isAdmin ? 'Administrateur' : isTeacher ? 'Enseignant' : 'Élève'}
            </div>
          </div>

          <div className="py-2">
            <NextLink
              href="/mon-compte"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-sm text-slate-700"
            >
              <LayoutDashboard className="w-4 h-4" /> Mon tableau de bord
            </NextLink>
            <NextLink
              href="/mon-compte/favoris"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-sm text-slate-700"
            >
              <Heart className="w-4 h-4" /> Mes favoris
            </NextLink>
            <NextLink
              href="/mon-compte/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-sm text-slate-700 justify-between"
            >
              <span className="flex items-center gap-3">
                <Bell className="w-4 h-4" /> Notifications
              </span>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </NextLink>

            {(isTeacher || isAdmin) && (
              <NextLink
                href="/enseignant"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-sm text-slate-700"
              >
                <Upload className="w-4 h-4" /> Espace enseignant
              </NextLink>
            )}
            {isAdmin && (
              <NextLink
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50 text-sm text-amber-700 font-semibold"
              >
                <Shield className="w-4 h-4" /> Administration
              </NextLink>
            )}

            <NextLink
              href="/mon-compte/parametres"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-sm text-slate-700"
            >
              <Settings className="w-4 h-4" /> Paramètres
            </NextLink>
          </div>

          <div className="border-t border-slate-100 p-2">
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 text-sm text-red-600 rounded-lg"
              >
                <LogOut className="w-4 h-4" /> Se déconnecter
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
