// @ts-nocheck
import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const env = (ctx as any).env;
    const hyperdrive = env.HYPERDRIVE;
    
    if (!hyperdrive) {
      return NextResponse.json({ error: 'No HYPERDRIVE binding' }, { status: 500 });
    }
    
    return NextResponse.json({
      hasConnectionString: !!hyperdrive.connectionString,
      connectionStringSample: hyperdrive.connectionString 
        ? hyperdrive.connectionString.replace(/:[^:@]+@/, ':***@').substring(0, 100)
        : null,
      keys: Object.keys(hyperdrive),
      host: hyperdrive.host,
      port: hyperdrive.port,
      user: hyperdrive.user,
      database: hyperdrive.database,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
