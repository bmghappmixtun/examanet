// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First } from '@/lib/db-d1';
import SettingsClient from '@/components/settings/SettingsClient';

export const dynamic = 'force-dynamic';

function safeStringifyArray(v: any): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'string') {
    // already a string (might be JSON or comma-separated)
    return v;
  }
  try { return JSON.stringify(v); } catch { return null; }
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');

  // Account data
  const account = await d1First(
    `SELECT id, email, role, status, firstName, lastName, avatarUrl, bio,
            schoolName, governorate, diploma,
            teachingSubjects, teachingLevels,
            phone, website, schoolLevel, classLevel, isVerifiedTeacher,
            createdAt, lastLoginAt, emailVerifiedAt
     FROM User WHERE id = ?`,
    user.id,
  );
  if (!account) redirect('/connexion');

  // Options (subjects, classes with level, levels)
  const [subjectsR, classesR, levelsR] = await Promise.all([
    d1All('SELECT slug, nameFr, nameAr FROM Subject ORDER BY nameFr ASC'),
    d1All(
      `SELECT c.slug, c.nameFr, c.nameAr,
              l.nameFr AS levelNameFr
       FROM "Class" c
       LEFT JOIN "Level" l ON c.levelId = l.id
       ORDER BY l."order" ASC, c."order" ASC`,
    ),
    d1All('SELECT slug, nameFr FROM "Level" ORDER BY "order" ASC'),
  ]);

  // Normalize teachingSubjects/teachingLevels to JSON strings
  const accountForClient = {
    ...account,
    teachingSubjects: safeStringifyArray(account.teachingSubjects),
    teachingLevels: safeStringifyArray(account.teachingLevels),
    // Default values for fields not in D1
    preferredLang: 'fr',
    themePref: 'light',
    notifyEmail: true,
    notifyInApp: true,
  };

  return (
    <SettingsClient
      account={accountForClient as any}
      options={{
        subjects: subjectsR || [],
        classes: (classesR || []).map((c: any) => ({
          slug: c.slug, nameFr: c.nameFr, nameAr: c.nameAr,
          level: { nameFr: c.levelNameFr || '' },
        })),
        levels: (levelsR || []).map((l: any) => ({ slug: l.slug, nameFr: l.nameFr })),
      }}
    />
  );
}
