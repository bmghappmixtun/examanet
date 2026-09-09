// @ts-nocheck
/**
 * Google Analytics 4 Data API helper.
 *
 * Uses a service account (stored as CF Worker secret GA_SERVICE_ACCOUNT_JSON)
 * to query GA4 visitors per day.
 *
 * Setup:
 * 1. Create a GCP service account in examanet-seo project
 * 2. Grant it "Viewer" role on the GA4 property
 * 3. Download JSON key, store as CF secret: GA_SERVICE_ACCOUNT_JSON
 * 4. Set CF secret: GA4_PROPERTY_ID (numeric, e.g. "123456789")
 * 5. Set CF secret: NEXT_PUBLIC_GA_MEASUREMENT_ID (G-XXXX) for client tracking
 */

import { getSecret } from '@/lib/cf-auth';

export interface VisitorData {
  date: string; // YYYY-MM-DD
  visitors: number; // unique users
}

/**
 * Convert PEM private key to CryptoKey for jose.
 */
function pemToCryptoKey(pem: string): string {
  // Strip the PEM headers and newlines
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
    .trim();
  return b64;
}

/**
 * Get visitors per day for the last N days from GA4.
 * Uses the "totalUsers" metric (unique users).
 */
export async function getVisitors(days: number = 7): Promise<VisitorData[]> {
  const propertyId = await getSecret('GA4_PROPERTY_ID');
  const serviceAccountJson = await getSecret('GA_SERVICE_ACCOUNT_JSON');

  if (!propertyId || !serviceAccountJson) {
    console.warn('[GA] Missing GA4_PROPERTY_ID or GA_SERVICE_ACCOUNT_JSON — returning empty data');
    return [];
  }

  try {
    // Parse service account JSON
    const sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
    if (!sa.client_email || !sa.private_key) {
      throw new Error('Service account JSON missing client_email or private_key');
    }

    // Use jose to sign JWT for service account
    const { SignJWT, importPKCS8 } = await import('jose');
    const privateKey = await importPKCS8(sa.private_key, 'RS256');
    
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(sa.client_email)
      .setSubject(sa.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    // Exchange JWT for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`OAuth token exchange failed: ${tokenRes.status} ${err}`);
    }
    const { access_token } = await tokenRes.json();

    // Calculate date range
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days + 1);
    const startStr = startDate.toISOString().slice(0, 10);

    // Query GA4 Data API
    const apiUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const body = {
      dateRanges: [{ startDate: startStr, endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'totalUsers' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    };

    const reportRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!reportRes.ok) {
      const err = await reportRes.text();
      throw new Error(`GA4 Data API failed: ${reportRes.status} ${err}`);
    }
    const report = await reportRes.json();

    // Parse response: rows[].dimensionValues[0].value = "YYYYMMDD"
    //                 rows[].metricValues[0].value = "123"
    const rows = report.rows || [];
    const result: VisitorData[] = [];
    for (const row of rows) {
      const rawDate = row.dimensionValues?.[0]?.value || ''; // YYYYMMDD
      const visitors = parseInt(row.metricValues?.[0]?.value || '0', 10);
      if (rawDate.length === 8) {
        const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
        result.push({ date, visitors });
      }
    }
    return result;
  } catch (e: any) {
    console.error('[GA] getVisitors failed:', e.message);
    return [];
  }
}

/**
 * Pad visitors data to include all N days (with 0 for missing days).
 */
export function padVisitorsData(
  data: VisitorData[],
  days: number = 7
): VisitorData[] {
  const today = new Date();
  const result: VisitorData[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const found = data.find((v) => v.date === dateStr);
    result.push({ date: dateStr, visitors: found ? found.visitors : 0 });
  }
  return result;
}
