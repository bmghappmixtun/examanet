import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const results: any = {};
  
  // Test 1: Resolve Neon hostname
  try {
    const neonRes = await fetch('https://ep-morning-salad-asfgyfxf.c-4.eu-central-1.aws.neon.tech/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'SELECT 1' }),
      signal: AbortSignal.timeout(10000),
    });
    results.neon = { status: neonRes.status, ok: neonRes.ok };
    results.neonText = (await neonRes.text()).slice(0, 200);
  } catch (e: any) {
    results.neon = { error: e.message };
  }
  
  // Test 2: Resolve another hostname (google)
  try {
    const googleRes = await fetch('https://www.google.com', { signal: AbortSignal.timeout(10000) });
    results.google = { status: googleRes.status, ok: googleRes.ok };
  } catch (e: any) {
    results.google = { error: e.message };
  }
  
  return NextResponse.json(results);
}
