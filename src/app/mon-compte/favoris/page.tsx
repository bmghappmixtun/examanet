// @ts-nocheck
import { getCurrentUser } from '@/lib/auth';
import { d1All } from '@/lib/db-d1';
import ResourceCard from '@/components/resources/ResourceCard';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const favorites = await d1All(
    `SELECT f.id as favId, f.createdAt as favAt,
            r.id, r.numericId, r.slug, r.title, r.type, r.language,
            r.viewsCount, r.downloadsCount, r.avgRating, r.favoritesCount, r.commentsCount,
            r.createdAt, r.publishedAt, r.trimester, r.year, r.hasCorrection,
            r.subjectId, r.classId, r.sectionId, r.teacherId,
            s.id as sId, s.slug as sSlug, s.nameFr as sNameFr, s.nameAr as sNameAr, s.color as sColor, s.icon as sIcon,
            c.id as cId, c.slug as cSlug, c.nameFr as cNameFr, c.nameAr as cNameAr,
            sec.id as secId, sec.slug as secSlug, sec.nameFr as secNameFr,
            t.id as tId, t.numericId as tNumericId, t.slug as tSlug,
            t.firstName as tFirstName, t.lastName as tLastName,
            t.firstNameAr as tFirstNameAr, t.lastNameAr as tLastNameAr,
            t.avatarUrl as tAvatarUrl
     FROM Favorite f
     INNER JOIN Resource r ON r.id = f.resourceId
     LEFT JOIN Subject s ON r.subjectId = s.id
     LEFT JOIN "Class" c ON r.classId = c.id
     LEFT JOIN Section sec ON r.sectionId = sec.id
     LEFT JOIN User t ON r.teacherId = t.id
     WHERE f.userId = ?
     ORDER BY f.createdAt DESC
     LIMIT 100`,
    user.id,
  );

  // Map to the ResourceCard shape (it expects nested objects)
  const resources = (favorites || []).map((f: any) => ({
    id: f.id,
    numericId: f.numericId,
    slug: f.slug,
    title: f.title,
    type: f.type,
    language: f.language,
    viewsCount: f.viewsCount,
    downloadsCount: f.downloadsCount,
    avgRating: f.avgRating,
    favoritesCount: f.favoritesCount,
    commentsCount: f.commentsCount,
    createdAt: f.createdAt,
    publishedAt: f.publishedAt,
    trimester: f.trimester,
    year: f.year,
    hasCorrection: f.hasCorrection,
    subject: f.sId ? { id: f.sId, slug: f.sSlug, nameFr: f.sNameFr, nameAr: f.sNameAr, color: f.sColor, icon: f.sIcon } : null,
    class: f.cId ? { id: f.cId, slug: f.cSlug, nameFr: f.cNameFr, nameAr: f.cNameAr } : null,
    section: f.secId ? { id: f.secId, slug: f.secSlug, nameFr: f.secNameFr } : null,
    teacher: f.tId ? {
      id: f.tId, numericId: f.tNumericId, slug: f.tSlug,
      firstName: f.tFirstName, lastName: f.tLastName,
      firstNameAr: f.tFirstNameAr, lastNameAr: f.tLastNameAr,
      avatarUrl: f.tAvatarUrl,
    } : null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-6">Mes favoris ❤️</h1>
      {resources.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
          <div className="text-5xl mb-3">💔</div>
          <h3 className="font-bold text-xl mb-2">Aucun favori</h3>
          <p className="text-slate-500 mb-4">
            Ajoutez des ressources à vos favoris pour les retrouver ici
          </p>
          <a href="/ressources" className="btn-primary">
            Explorer les ressources
          </a>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {resources.map((r: any) => (
            <form key={r.id} action={`/api/favorites/${r.id}`} method="POST">
              <input type="hidden" name="_action" value="remove" />
              <ResourceCard resource={r} />
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
