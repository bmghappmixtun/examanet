// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { sendContactEmail } from '@/lib/email';

function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

const VALID_SUBJECTS = ['question', 'bug', 'teacher', 'partnership', 'copyright', 'other'];

export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message } = await req.json();

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Nom, email et message sont requis' }, { status: 400 });
    }
    if (typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Nom invalide' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json(
        { error: 'Message trop long (max 2000 caractères)' },
        { status: 400 },
      );
    }

    const subjectValue = subject && VALID_SUBJECTS.includes(subject) ? subject : 'other';

    const db = await getD1();
    await db
      .prepare(
        `INSERT INTO ContactMessage (id, name, email, subject, message, status, createdAt)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      )
      .bind(
        genId(),
        name.trim(),
        email.toLowerCase().trim(),
        subjectValue,
        message.trim(),
        Date.now(),
      )
      .run();

    // Send email notification to admin (won't fail if no RESEND_API_KEY - logs only)
    await sendContactEmail({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      subject: subjectValue,
      message: message.trim(),
    }).catch((e) => console.error('Contact email error:', e));

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Contact form error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
