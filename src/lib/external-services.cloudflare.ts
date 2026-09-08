/**
 * Cloudflare + D1 + R2 usage checkers
 *
 * Uses CF GraphQL Analytics API:
 *   POST https://api.cloudflare.com/client/v4/graphql
 *     Body: { query: "query { ... }", variables: { ... } }
 *
 * For Workers, D1, R2 specific metrics
 *   https://developers.cloudflare.com/analytics/graphql-api/
 *
 * Authentication: Bearer {apiToken}
 *
 * Token needs: Account > Account Analytics: Read scope
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const CF_ACCOUNT_ID = '59cffdeaadf3809cc3d2039c43f836e0';
const D1_DATABASE_ID = '22ad2e7f-1692-486e-9131-d6c4062012e1';
const R2_BUCKET_NAME = 'examanet-pdf-prod';

export type CFWorkersUsage = {
  source: string;
  requests?: number;
  errors?: number;
  successRate?: number;
  cpuTimeP50?: number;
  cpuTimeP99?: number;
  periodStart?: string;
  periodEnd?: string;
  error?: string;
};

export type D1Usage = {
  source: string;
  sizeMb?: number;
  rowsRead?: number;
  rowsWritten?: number;
  queries?: number;
  storage?: { usedMb: number; unit: string };
  periodStart?: string;
  periodEnd?: string;
  error?: string;
};

export type R2Usage = {
  source: string;
  bucketName?: string;
  objectsCount?: number;
  storage?: { usedGb: number; unit: string };
  classAOps?: number;
  classBOps?: number;
  periodStart?: string;
  periodEnd?: string;
  error?: string;
};

/**
 * Check CF Workers usage for examanet-prod.
 * Returns request count, error count, success rate, CPU time.
 */
export async function checkCFWorkersUsage(
  apiToken: string,
  daysBack = 7,
): Promise<CFWorkersUsage> {
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();
  const until = new Date().toISOString();

  const query = `
    query WorkersAnalytics($accountTag: String!, $since: Time!, $until: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 1000,
            filter: { datetime_geq: $since, datetime_lt: $until, scriptName: "examanet-prod" }
          ) {
            dimensions { datetime }
            sum { requests, errors, subrequests }
            quantiles { cpuTimeP50, cpuTimeP99 }
          }
        }
      }
    }
  `;

  try {
    const r = await fetch(`${CF_API_BASE}/client/v4/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { accountTag: CF_ACCOUNT_ID, since, until },
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      return { source: 'cf-workers', error: `HTTP ${r.status}: ${txt.slice(0, 200)}` };
    }
    const data = await r.json();
    if (data.errors) {
      return { source: 'cf-workers', error: data.errors[0]?.message || 'GraphQL error' };
    }
    const invocations =
      data?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
    let totalRequests = 0;
    let totalErrors = 0;
    let totalSubrequests = 0;
    const cpuP50s: number[] = [];
    const cpuP99s: number[] = [];
    for (const row of invocations) {
      totalRequests += row.sum?.requests || 0;
      totalErrors += row.sum?.errors || 0;
      totalSubrequests += row.sum?.subrequests || 0;
      if (row.quantiles?.cpuTimeP50 != null) cpuP50s.push(row.quantiles.cpuTimeP50);
      if (row.quantiles?.cpuTimeP99 != null) cpuP99s.push(row.quantiles.cpuTimeP99);
    }
    const avgP50 = cpuP50s.length
      ? Math.round(cpuP50s.reduce((a, b) => a + b, 0) / cpuP50s.length)
      : 0;
    const avgP99 = cpuP99s.length
      ? Math.round(cpuP99s.reduce((a, b) => a + b, 0) / cpuP99s.length)
      : 0;
    return {
      source: 'cf-workers',
      requests: totalRequests,
      errors: totalErrors,
      successRate: totalRequests > 0
        ? Math.round(((totalRequests - totalErrors) / totalRequests) * 10000) / 100
        : 100,
      cpuTimeP50: avgP50,
      cpuTimeP99: avgP99,
      periodStart: since,
      periodEnd: until,
    };
  } catch (e: any) {
    return { source: 'cf-workers', error: e?.message || 'Fetch failed' };
  }
}

/**
 * Check D1 usage for examanet-db.
 * Returns DB size, query count, row stats.
 */
export async function checkD1Usage(
  apiToken: string,
  daysBack = 7,
): Promise<D1Usage> {
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();
  const until = new Date().toISOString();

  // D1 storage is reported via REST API
  let sizeMb = 0;
  try {
    const r = await fetch(`${CF_API_BASE}/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (r.ok) {
      const data = await r.json();
      // D1 doesn't return size directly; use the Workers Paid plan metric
      // We can get an estimate from the D1 read/write analytics
      sizeMb = 0; // We'll set this from analytics
    }
  } catch {
    // ignore
  }

  // Get query/read/write analytics via GraphQL
  const query = `
    query D1Analytics($accountTag: String!, $since: Time!, $until: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          d1AnalyticsAdaptive(
            limit: 1000,
            filter: { datetime_geq: $since, datetime_lt: $until, databaseId: "${D1_DATABASE_ID}" }
          ) {
            dimensions { datetime }
            sum { rowsRead, rowsWritten, queryBatchBytesRead, queryBatchBytesWritten }
            quantiles { queryDurationP50, queryDurationP99 }
          }
        }
      }
    }
  `;

  try {
    const r = await fetch(`${CF_API_BASE}/client/v4/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { accountTag: CF_ACCOUNT_ID, since, until },
      }),
    });
    if (!r.ok) {
      return { source: 'd1', error: `HTTP ${r.status}: ${await r.text().then((t) => t.slice(0, 200))}` };
    }
    const data = await r.json();
    if (data.errors) {
      return { source: 'd1', error: data.errors[0]?.message || 'GraphQL error' };
    }
    const rows = data?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptive || [];
    let totalRead = 0;
    let totalWritten = 0;
    for (const row of rows) {
      totalRead += row.sum?.rowsRead || 0;
      totalWritten += row.sum?.rowsWritten || 0;
    }

    // Try to get the actual DB size from the D1 REST API
    if (sizeMb === 0) {
      try {
        const s = await fetch(`${CF_API_BASE}/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/raw`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: "SELECT page_count * page_size AS size_bytes FROM pragma_page_count(), pragma_page_size()" }),
        });
        if (s.ok) {
          const sd = await s.json();
          const bytes = sd?.result?.[0]?.results?.[0]?.size_bytes || 0;
          sizeMb = Math.round(bytes / 1024 / 1024);
        }
      } catch {
        // ignore
      }
    }

    return {
      source: 'd1',
      sizeMb,
      rowsRead: totalRead,
      rowsWritten: totalWritten,
      queries: rows.length,
      storage: { usedMb: sizeMb, unit: 'MB' },
      periodStart: since,
      periodEnd: until,
    };
  } catch (e: any) {
    return { source: 'd1', error: e?.message || 'Fetch failed' };
  }
}

/**
 * Check R2 usage for the PDF bucket.
 * Returns object count, storage size, operation counts.
 */
export async function checkR2Usage(
  apiToken: string,
  daysBack = 7,
): Promise<R2Usage> {
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();
  const until = new Date().toISOString();

  // Get storage size
  let storageGb = 0;
  let objectCount = 0;
  try {
    const r = await fetch(
      `${CF_API_BASE}/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET_NAME}`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    );
    if (r.ok) {
      // R2 doesn't return size by default; need to use lifecycle or list
      // Approximate via the GraphQL metrics below
    }
  } catch {
    // ignore
  }

  // R2 storage + class A/B operations via GraphQL
  const query = `
    query R2Analytics($accountTag: String!, $since: Time!, $until: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2OperationsAdaptive(
            limit: 1000,
            filter: {
              datetime_geq: $since,
              datetime_lt: $until,
              bucketName: "${R2_BUCKET_NAME}"
            }
          ) {
            dimensions { actionType, datetime }
            sum { requests }
          }
          r2StorageAdaptive(
            limit: 100,
            filter: {
              datetime_geq: $since,
              datetime_lt: $until,
              bucketName: "${R2_BUCKET_NAME}"
            }
          ) {
            dimensions { datetime }
            sum { payloadBytes, objectCount }
          }
        }
      }
    }
  `;

  try {
    const r = await fetch(`${CF_API_BASE}/client/v4/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { accountTag: CF_ACCOUNT_ID, since, until },
      }),
    });
    if (!r.ok) {
      return { source: 'r2', error: `HTTP ${r.status}: ${await r.text().then((t) => t.slice(0, 200))}` };
    }
    const data = await r.json();
    if (data.errors) {
      return { source: 'r2', error: data.errors[0]?.message || 'GraphQL error' };
    }
    const acct = data?.data?.viewer?.accounts?.[0] || {};
    const ops = acct.r2OperationsAdaptive || [];
    const storage = acct.r2StorageAdaptive || [];

    let classA = 0;
    let classB = 0;
    for (const row of ops) {
      const action = row.dimensions?.actionType;
      const cnt = row.sum?.requests || 0;
      if (action === 'PutObject' || action === 'PostObject' || action === 'CopyObject' || action === 'CompleteMultipartUpload' || action === 'CreateMultipartUpload' || action === 'UploadPart' || action === 'ListObjects' || action === 'ListBuckets') {
        classA += cnt;
      } else {
        classB += cnt;
      }
    }
    let totalBytes = 0;
    let totalObjs = 0;
    for (const row of storage) {
      totalBytes += row.sum?.payloadBytes || 0;
      totalObjs += row.sum?.objectCount || 0;
    }
    if (totalObjs > 0) objectCount = totalObjs;
    storageGb = Math.round((totalBytes / 1024 / 1024 / 1024) * 100) / 100;

    return {
      source: 'r2',
      bucketName: R2_BUCKET_NAME,
      objectsCount: objectCount,
      storage: { usedGb: storageGb, unit: 'GB' },
      classAOps: classA,
      classBOps: classB,
      periodStart: since,
      periodEnd: until,
    };
  } catch (e: any) {
    return { source: 'r2', error: e?.message || 'Fetch failed' };
  }
}
