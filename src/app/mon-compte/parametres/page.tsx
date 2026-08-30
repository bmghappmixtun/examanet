// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { d1First } from '@/lib/db-d1';
import SettingsClient from '@/components/settings/SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');

  const account = await d1First(
    `SELECT id, email, role, status, firstName, lastName, avatarUrl, bio,
            schoolName, governorate, diploma, teachingSubjects, teachingLevels,
            phone, website, schoolLevel, classLevel, isVerifiedTeacher
     FROM User WHERE id = ?`,
    user.id,
  );
  if (!account) redirect('/connexion');

  // Convert teachingSubjects / teachingLevels to array if they're JSON strings
  const parseArray = (v: any): string[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { return JSON.parse(v); } catch { return []; }
  };

  const accountForClient = {
    ...account,
    teachingSubjects: parseArray(account.teachingSubjects),
    teachingLevels: parseArray(account.teachingLevels),
  };

  return <SettingsClient account={accountForClient as any} />;
}
