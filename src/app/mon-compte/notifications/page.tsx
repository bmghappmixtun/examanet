// @ts-nocheck
import { getCurrentUser } from '@/lib/auth';
import { d1All } from '@/lib/db-d1';
import NotificationsList from '@/components/notifications/NotificationsList';

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

  return <NotificationsList initialNotifications={notifications as any} />;
}
