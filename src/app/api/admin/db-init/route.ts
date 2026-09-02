import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (token !== process.env.SEED_TOKEN && authHeader !== `Bearer ${process.env.SEED_TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Pushing schema to database...');
    const { stdout, stderr } = await execAsync(
      'npx prisma db push --skip-generate --accept-data-loss',
      {
        cwd: process.cwd(),
        env: { ...process.env },
      },
    );

    return NextResponse.json({
      success: true,
      message: 'Schema pushed successfully!',
      stdout: stdout.slice(-500),
      stderr: stderr.slice(-500),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e.message,
        stdout: e.stdout?.slice(-500),
        stderr: e.stderr?.slice(-500),
      },
      { status: 500 },
    );
  }
}
