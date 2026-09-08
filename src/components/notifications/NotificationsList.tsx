// @ts-nocheck
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, X, Trash2 } from 'lucide-react';
import { timeAgo } from '@/lib/utils';
import toast from 'react-hot-toast';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: number;
  createdAt: number;
};

export default function NotificationsList({
  initialNotifications,
  readAllPath = '/api/notifications/read-all',
}: {
  initialNotifications: Notification[];
  readAllPath?: string;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteOne(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Erreur suppression');
        return;
      }
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success('Notification supprimée');
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error('Erreur réseau');
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteRead() {
    if (!confirm('Supprimer toutes les notifications lues ?')) return;
    try {
      const res = await fetch('/api/notifications/read', { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Erreur suppression');
        return;
      }
      const data = await res.json();
      setNotifications((prev) => prev.filter((n) => !n.isRead));
      toast.success(`${data.deleted} notification(s) supprimée(s)`);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error('Erreur réseau');
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const readCount = notifications.length - unreadCount;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          Notifications
          {unreadCount > 0 && (
            <span className="text-sm bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-semibold">
              {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <form action={readAllPath} method="POST">
              <button
                type="submit"
                className="text-sm text-primary-600 font-semibold hover:underline flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-primary-50"
              >
                <Check className="w-4 h-4" /> Tout marquer comme lu
              </button>
            </form>
          )}
          {readCount > 0 && (
            <button
              type="button"
              onClick={deleteRead}
              disabled={pending}
              className="text-sm text-red-600 font-semibold hover:underline flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
              title="Supprimer toutes les notifications lues"
            >
              <Trash2 className="w-4 h-4" /> Supprimer les lues ({readCount})
            </button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
          <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">Aucune notification</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {notifications.map((n, i) => (
            <div
              key={n.id}
              className={`group flex gap-3 p-4 hover:bg-slate-50 transition ${
                i > 0 ? 'border-t border-slate-100' : ''
              } ${!n.isRead ? 'bg-primary-50/50' : ''}`}
            >
              <div
                className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                  n.isRead ? 'bg-slate-300' : 'bg-primary-500'
                }`}
              />
              {n.link ? (
                <a
                  href={n.link}
                  className="flex-1 cursor-pointer"
                  onClick={() => {
                    if (!n.isRead) {
                      fetch(`/api/notifications/${n.id}`, { method: 'PATCH' }).catch(() => {});
                    }
                  }}
                >
                  <div className="font-semibold text-sm">{n.title}</div>
                  <div className="text-sm text-slate-600 mt-0.5">{n.body}</div>
                  <div className="text-xs text-slate-400 mt-1">{timeAgo(n.createdAt)}</div>
                </a>
              ) : (
                <div className="flex-1">
                  <div className="font-semibold text-sm">{n.title}</div>
                  <div className="text-sm text-slate-600 mt-0.5">{n.body}</div>
                  <div className="text-xs text-slate-400 mt-1">{timeAgo(n.createdAt)}</div>
                </div>
              )}
              <button
                type="button"
                onClick={() => deleteOne(n.id)}
                disabled={deletingId === n.id || pending}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg p-1.5 transition disabled:opacity-30"
                title="Supprimer cette notification"
                aria-label="Supprimer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {notifications.length >= 50 && (
        <p className="text-xs text-slate-500 mt-3 text-center">
          Affichage des 50 notifications les plus récentes. Les anciennes sont
          automatiquement supprimées après 90 jours.
        </p>
      )}
    </div>
  );
}
