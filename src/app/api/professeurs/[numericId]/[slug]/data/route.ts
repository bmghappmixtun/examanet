// @ts-nocheck
// 2026-08-28: D1-direct API for /fr/professeurs/[numericId]/[slug]
// Bypasses prisma-compat race condition on CF Workers.

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

function num(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return Number(v) || 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ numericId: string; slug: string }> }
) {
  const { numericId: numericIdStr, slug } = await params;
  const numericId = parseInt(numericIdStr, 10);

  if (!numericIdStr || numericIdStr === 'undefined' || Number.isNaN(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;

    // Safe helpers
    async function safeFirst(sql: string, params: any[] = []): Promise<any> {
      try {
        return await db.prepare(sql).bind(...params).first();
      } catch (e: any) {
        console.error('[teacher detail] first failed:', e?.message?.substring(0, 150));
        return null;
      }
    }
    async function safeAll(sql: string, params: any[] = []): Promise<any[]> {
      try {
        const r = await db.prepare(sql).bind(...params).all();
        return r.results || [];
      } catch (e: any) {
        console.error('[teacher detail] query failed:', e?.message?.substring(0, 150));
        return [];
      }
    }

    // ----- 1. Teacher by numericId -----
    const teacher = await safeFirst(
      `SELECT id, numericId, slug, firstName, lastName, firstNameAr, lastNameAr,
        avatarUrl, bio, schoolName, governorate, phone, website, diploma,
        isVerifiedTeacher, approvedAt, uploadsCount, followersCount, createdAt, email
      FROM User WHERE numericId = ? AND role = 'TEACHER' LIMIT 1`,
      [numericId]
    );

    if (!teacher) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const teacherId = teacher.id;

    // ----- 2. Parallel: stats, resources, teaching subjects/classes -----
    const [resourcesRes, teachingSubjects, teachingClasses, followersCount] = await Promise.all([
      safeAll(
        `SELECT
          r.id, r.numericId, r.slug, r.title, r.description, r.summary, r.type, r.status,
          r.fileKey, r.fileUrl, r.fileSize, r.pageCount,
          r.tags, r.language, r.schoolType, r.hasCorrection,
          r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount,
          r.commentsCount, r.favoritesCount, r.publishedAt, r.createdAt, r.updatedAt,
          s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.nameAr as s_nameAr, s.color as s_color, s.icon as s_icon,
          cl.id as cl_id, cl.slug as cl_slug, cl.nameFr as cl_nameFr, cl.nameAr as cl_nameAr,
          sec.id as sec_id, sec.slug as sec_slug, sec.nameFr as sec_nameFr, sec.nameAr as sec_nameAr
        FROM Resource r
        LEFT JOIN Subject s ON r.subjectId = s.id
        LEFT JOIN [Class] cl ON r.classId = cl.id
        LEFT JOIN Section sec ON r.sectionId = sec.id
        WHERE r.teacherId = ? AND r.status = 'PUBLISHED'
        ORDER BY r.createdAt DESC LIMIT 50`,
        [teacherId]
      ),
      safeAll(
        `SELECT DISTINCT s.slug, s.nameFr, s.nameAr, s.color, s.icon
        FROM Subject s
        INNER JOIN Resource r ON r.subjectId = s.id
        WHERE r.teacherId = ? AND r.status = 'PUBLISHED'
        ORDER BY s.nameFr ASC`,
        [teacherId]
      ),
      safeAll(
        `SELECT DISTINCT cl.slug, cl.nameFr, cl.nameAr
        FROM [Class] cl
        INNER JOIN Resource r ON r.classId = cl.id
        WHERE r.teacherId = ? AND r.status = 'PUBLISHED'
        ORDER BY cl.[order] ASC`,
        [teacherId]
      ),
      safeFirst(
        `SELECT COUNT(*) as c FROM Follow WHERE followingId = ?`,
        [teacherId]
      ),
    ]);

    // Resources count (for total display)
    const resourceCount = resourcesRes.length;
    const totalFavorites = resourcesRes.reduce((acc: number, r: any) => acc + num(r.favoritesCount), 0);

    // Enrich resources with nested subject/class/section objects (flat fields get nested)
    const resources = resourcesRes.map((r: any) => ({
      id: r.id,
      numericId: r.numericId,
      slug: r.slug,
      title: r.title,
      description: r.description,
      summary: r.summary,
      type: r.type,
      status: r.status,
      fileKey: r.fileKey,
      fileUrl: r.fileUrl,
      fileSize: r.fileSize,
      pageCount: r.pageCount,
      tags: r.tags,
      language: r.language,
      schoolType: r.schoolType,
      hasCorrection: r.hasCorrection,
      viewsCount: num(r.viewsCount),
      downloadsCount: num(r.downloadsCount),
      avgRating: Number(r.avgRating) || 0,
      ratingsCount: num(r.ratingsCount),
      commentsCount: num(r.commentsCount),
      favoritesCount: num(r.favoritesCount),
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      subject: r.s_id ? {
        id: r.s_id,
        slug: r.s_slug,
        nameFr: r.s_nameFr,
        nameAr: r.s_nameAr,
        color: r.s_color,
        icon: r.s_icon,
      } : null,
      class: r.cl_id ? {
        id: r.cl_id,
        slug: r.cl_slug,
        nameFr: r.cl_nameFr,
        nameAr: r.cl_nameAr,
      } : null,
      section: r.sec_id ? {
        id: r.sec_id,
        slug: r.sec_slug,
        nameFr: r.sec_nameFr,
        nameAr: r.sec_nameAr,
      } : null,
    }));

    return NextResponse.json({
      teacher: {
        id: teacher.id,
        numericId: teacher.numericId,
        slug: teacher.slug,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        firstNameAr: teacher.firstNameAr,
        lastNameAr: teacher.lastNameAr,
        avatarUrl: teacher.avatarUrl,
        bio: teacher.bio,
        schoolName: teacher.schoolName,
        governorate: teacher.governorate,
        phone: teacher.phone,
        website: teacher.website,
        diploma: teacher.diploma,
        isVerifiedTeacher: !!teacher.isVerifiedTeacher,
        approvedAt: teacher.approvedAt,
        uploadsCount: num(teacher.uploadsCount),
        followersCount: num(teacher.followersCount) || num(followersCount?.c),
        createdAt: teacher.createdAt,
        // Don't expose email in public API
      },
      resources,
      resourceCount,
      totalFavorites,
      teachingSubjects: teachingSubjects.map((s: any) => ({
        slug: s.slug, nameFr: s.nameFr, nameAr: s.nameAr, color: s.color, icon: s.icon,
      })),
      teachingClasses: teachingClasses.map((c: any) => ({
        slug: c.slug, nameFr: c.nameFr, nameAr: c.nameAr,
      })),
      // Slug for SEO consistency check
      requestedSlug: slug,
    });
  } catch (e: any) {
    console.error('[teacher detail] top-level error:', e?.message);
    return NextResponse.json({ error: 'server_error', message: e?.message?.substring(0, 200) }, { status: 500 });
  }
}
