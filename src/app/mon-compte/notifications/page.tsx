// @ts-nocheck
import { getCurrentUser } from '@/lib/auth';
import { d1All } from '@/lib/db-d1';
import { Bell, Check } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const notifications = await d1All(
    `SELECT id, userId, type, title, body, link, isRead, createdAt
     FROM Notification
     WHERE userId = ?
     ORDER BY createdAt DESC
     LIMIT 50`,
    user.id,
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold">Notifications 🔔</h1>
        {notifications.some((n: any) => !n.isRead) && (
          <form action="/api/notifications/read-all" method="POST">
            <button className="text-sm text-primary-600 font-semibold hover:underline flex items-center gap-1">
              <Check className="w-4 h-4" /> Tout marquer comme lu
            </button>
          </form>
        )}
      </div>
      {notifications.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
          <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">Aucune notification</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {notifications.map((n: any, i: number) => (
            <div
              key={n.id}
              className={`flex gap-3 p-4 ${i > 0 ? 'border-t border-slate-100' : ''} ${!n.isRead ? 'bg-primary-50/50' : ''}`}
            >
              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.isRead ? 'bg-slate-300' : 'bg-primary-500'}`} />
              <div className="flex-1">
                <div className="font-semibold text-sm">{n.title}</div>
                <div className="text-sm text-slate-600 mt-0.5">{n.body}</div>
                <div className="text-xs text-slate-400 mt-1">{timeAgo(n.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
