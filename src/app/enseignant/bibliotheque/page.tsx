// @ts-nocheck
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import TeacherLibraryClient from '@/components/teacher/TeacherLibraryClient';

export const metadata: Metadata = {
  title: 'Ma bibliothèque — Examanet',
  description: 'Vos fichiers originaux (.docx, .pdf) sauvegardés pour réutilisation future',
};

export const dynamic = 'force-dynamic';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export default async function TeacherLibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    redirect('/');
  }

  const db = await getD1();
  const [classesR, subjectsR] = await Promise.all([
    db.prepare('SELECT id, nameFr, nameAr, slug FROM "Class" ORDER BY "order" ASC').all().catch(() => ({ results: [] })),
    db.prepare('SELECT id, nameFr, nameAr, slug, color, icon FROM Subject ORDER BY nameFr ASC').all().catch(() => ({ results: [] })),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          📚 Ma bibliothèque
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Tous vos fichiers originaux (Word, PDF) sont sauvegardés ici. Vous pouvez les télécharger
          à tout moment et les réutiliser pour publier de nouvelles ressources.
        </p>
      </div>
      <TeacherLibraryClient classes={classesR?.results || []} subjects={subjectsR?.results || []} />
    </div>
  );
}
