#!/usr/bin/env -S npx tsx
/**
 * Add teacher email to TeacherFile.notes for all JotForm-imported files
 * Allows filtering by email (e.g. SELECT WHERE notes LIKE '%email:X%')
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const teacher = await prisma.user.findUnique({
    where: { id: 'cmqj8v8c90002hqfuq6knpy3k' },
    select: { email: true, firstName: true, lastName: true }
  });
  if (!teacher) { console.error('Teacher not found'); process.exit(1); }
  const email = teacher.email;
  console.log(`Teacher: ${teacher.firstName} ${teacher.lastName} (${email})`);

  const tfs = await prisma.teacherFile.findMany({
    where: { teacherId: 'cmqj8v8c90002hqfuq6knpy3k', notes: { contains: 'JotForm' } },
    select: { id: true, notes: true }
  });
  console.log(`Imported TeacherFiles: ${tfs.length}`);

  let updated = 0;
  for (const tf of tfs) {
    if (tf.notes?.includes(`email:${email}`)) continue;
    const newNotes = `${tf.notes} | email:${email}`;
    await prisma.teacherFile.update({ where: { id: tf.id }, data: { notes: newNotes } });
    updated++;
  }
  console.log(`Updated: ${updated}`);

  const withEmail = await prisma.teacherFile.count({
    where: { teacherId: 'cmqj8v8c90002hqfuq6knpy3k', notes: { contains: `email:${email}` } }
  });
  console.log(`TeacherFiles with email in notes: ${withEmail}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
