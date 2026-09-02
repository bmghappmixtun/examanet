// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import ILovePDFApi from '@ilovepdf/ilovepdf-nodejs';
// @ts-ignore
import ILovePDFFile from '@ilovepdf/ilovepdf-nodejs/ILovePDFFile';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/provider-keys';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export const runtime = 'nodejs';

async function checkAuth(req: NextRequest) {
  const seedToken = req.headers.get('x-seed-token');
  if (seedToken && seedToken === process.env.SEED_TOKEN) {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    return admin;
  }
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') return null;
  return user;
}

async function getIloveConfig() {
  const dbProvider = await prisma.apiProvider.findUnique({ where: { provider: 'iloveapi' } });
  if (dbProvider && dbProvider.enabled && dbProvider.secretKey) {
    return {
      publicKey: dbProvider.publicKey || '',
      secretKey: decryptSecret(dbProvider.secretKey),
    };
  }
  return {
    publicKey: process.env.I_LOVE_API_PUBLIC_KEY || '',
    secretKey: process.env.I_LOVE_API_SECRET_KEY || '',
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await checkAuth(req);
    if (!auth) return NextResponse.json({ error: 'Admin requis' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const langs = (formData.get('langs') as string) || 'fra,eng';
    
    if (!file) return NextResponse.json({ error: 'file requis' }, { status: 400 });

    const config = await getIloveConfig();
    if (!config.publicKey || !config.secretKey) {
      return NextResponse.json({ error: 'iLovePDF non configuré' }, { status: 500 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const api = new ILovePDFApi(config.publicKey, config.secretKey);
    const task = api.newTask('pdfocr');
    
    await task.start();
    const pdffile = ILovePDFFile.fromArray(buffer, file.name || 'input.pdf');
    await task.addFile(pdffile);
    await task.process({ ocr_languages: langs.split(',') });
    const data = await task.download();
    const result = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    // Log usage
    try {
      const provider = await prisma.apiProvider.findUnique({ where: { provider: 'iloveapi' } });
      if (provider) {
        const now = new Date();
        await prisma.apiProviderUsage.create({
          data: {
            providerId: provider.id,
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            fileSize: buffer.length,
            success: true,
          } as any,
        });
      }
    } catch {}

    return new NextResponse(new Uint8Array(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(result.length),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'erreur' }, { status: 500 });
  }
}
