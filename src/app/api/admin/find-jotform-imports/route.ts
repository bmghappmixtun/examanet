import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const maxDuration = 30;

const prisma = new PrismaClient();

const safeNum = (v: any) => typeof v === 'bigint' ? Number(v) : v;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Method 1: Check TeacherFile.notes for "JotForm"
    const viaNotes = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM "TeacherFile" tf
      WHERE tf.notes LIKE '%JotForm%' OR tf.notes LIKE '%jotform%'
    `;

    // Method 2: Check Resource.description for "Importé depuis JotForm"
    const viaDesc = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM "Resource"
      WHERE description LIKE '%JotForm%' OR description LIKE '%jotform%'
    `;

    // Method 3: Check Resource.originalFileKey contains "jotform"
    const viaKey = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM "Resource"
      WHERE "originalFileKey" LIKE '%jotform%'
    `;

    // Method 4: Check if there's a data file for bulk migration
    const tfBulkMarkers = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*) FILTER (WHERE "fileKey" LIKE '%jotform%') as jotform_key,
        COUNT(*) FILTER (WHERE notes LIKE '%JotForm%') as jotform_notes,
        COUNT(*) FILTER (WHERE "originalFileName" LIKE 'jotform%') as jotform_name,
        COUNT(*) as total
      FROM "TeacherFile"
    `;

    // Method 5: Check Jotform-related fields in originalSubmissionId (but as text patterns)
    const viaJotformId = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM "Resource"
      WHERE "originalSubmissionId" ~ '^[0-9]{15,20}$'
    `;

    // Sample of TeacherFile with JotForm in notes
    const sampleJotform = await prisma.$queryRaw<any[]>`
      SELECT tf.id, tf."fileName", tf.notes, tf."createdAt"
      FROM "TeacherFile" tf
      WHERE tf.notes LIKE '%JotForm%' OR tf.notes LIKE '%jotform%'
      ORDER BY tf."createdAt" DESC
      LIMIT 5
    `;

    // Sample of Resource with description containing "JotForm"
    const sampleJotformRes = await prisma.$queryRaw<any[]>`
      SELECT r."numericId", r.title, r.description, r."originalFileName", r."createdAt"
      FROM "Resource" r
      WHERE r.description LIKE '%JotForm%' OR r.description LIKE '%jotform%'
      ORDER BY r."createdAt" DESC
      LIMIT 5
    `;

    return NextResponse.json({
      teacher_file_jotform_notes: safeNum(viaNotes[0]?.count),
      resource_jotform_description: safeNum(viaDesc[0]?.count),
      resource_jotform_key: safeNum(viaKey[0]?.count),
      teacher_file_markers: {
        jotform_key: safeNum(tfBulkMarkers[0]?.jotform_key),
        jotform_notes: safeNum(tfBulkMarkers[0]?.jotform_notes),
        jotform_name: safeNum(tfBulkMarkers[0]?.jotform_name),
        total: safeNum(tfBulkMarkers[0]?.total),
      },
      long_id_pattern: safeNum(viaJotformId[0]?.count),
      sample_teacherfile: sampleJotform,
      sample_resource: sampleJotformRes,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
