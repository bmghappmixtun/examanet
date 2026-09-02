/**
 * Google Search Console API helper.
 * Uses a Service Account JSON key stored securely in /workspace/.secrets/gsc-key.json
 *
 * Scopes used:
 *   - webmasters.readonly  → read search analytics, list sitemaps
 *   - webmasters          → submit sitemaps, etc.
 *
 * NOTE: this codebase uses TWO libraries:
 *   - @googleapis/webmasters (v3) for: Searchanalytics, Sitemaps, Sites
 *   - @googleapis/searchconsole (v1) for: URL Inspection (different API)
 *
 * The user-facing "Google Search Console" exposes both APIs.
 *
 * To grant access: in Google Search Console, add the service account email
 * as an Owner/Full User of the property.
 */

import { webmasters, auth as webmastersAuth } from '@googleapis/webmasters';
import { searchconsole, auth as searchconsoleAuth } from '@googleapis/searchconsole';
import path from 'path';
import fs from 'fs';

const KEY_PATH = path.join(process.cwd(), '.secrets', 'gsc-key.json');
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

let _wClient: ReturnType<typeof webmasters> | null = null;
let _sClient: ReturnType<typeof searchconsole> | null = null;

function makeAuth(scopes: string[]) {
  if (!fs.existsSync(KEY_PATH)) {
    throw new Error(
      `Missing GSC Service Account key at ${KEY_PATH}. ` +
        `Place the JSON key there (and ensure /workspace/.secrets/ is gitignored).`,
    );
  }
  return new webmastersAuth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes,
  });
}

async function getWebmastersClient() {
  if (_wClient) return _wClient;
  const a = makeAuth([
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/webmasters',
  ]);
  _wClient = webmasters({ version: 'v3', auth: a });
  return _wClient;
}

async function getSearchConsoleClient() {
  if (_sClient) return _sClient;
  const a = new searchconsoleAuth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  _sClient = searchconsole({ version: 'v1', auth: a });
  return _sClient;
}

export const SITE_URL_PROPERTY = SITE_URL;

/**
 * Submit a sitemap in Google Search Console.
 */
export async function submitSitemap(sitemapPath: string = 'sitemap.xml') {
  const gsc = await getWebmastersClient();
  const feedpath = `${SITE_URL.replace(/\/$/, '')}/${sitemapPath.replace(/^\//, '')}`;
  const res = await gsc.sitemaps.submit({ siteUrl: SITE_URL, feedpath });
  return res.data;
}

/**
 * List sitemaps currently registered for this property.
 */
export async function listSitemaps() {
  const gsc = await getWebmastersClient();
  const res = await gsc.sitemaps.list({ siteUrl: SITE_URL });
  return res.data.sitemap || [];
}

/**
 * Get search analytics for a date range.
 * Returns rows aggregated by dimensions (default: query).
 */
export type AnalyticsRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function getSearchAnalytics(opts: {
  startDate?: string;
  endDate?: string;
  dimensions?: ('query' | 'page' | 'country' | 'device' | 'searchAppearance')[];
  rowLimit?: number;
}) {
  const gsc = await getWebmastersClient();

  const endDate = opts.endDate || new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const startDate =
    opts.startDate || new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10);

  const res = await gsc.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate,
      endDate,
      dimensions: opts.dimensions || ['query'],
      rowLimit: opts.rowLimit || 100,
    },
  });

  return (res.data.rows || []) as AnalyticsRow[];
}

/**
 * Inspect URL status (indexed? mobile-friendly? rich result?)
 * Uses the separate URL Inspection API (searchconsole v1).
 */
export async function inspectUrl(url: string) {
  const gsc = await getSearchConsoleClient();
  try {
    const res = await gsc.urlInspection.index.inspect({
      requestBody: { siteUrl: SITE_URL, inspectionUrl: url, languageCode: 'fr' },
    });
    return res.data;
  } catch (e: any) {
    if (e?.code === 404) return null;
    throw e;
  }
}

/**
 * List all sites accessible by the service account.
 */
export async function listAccessibleSites() {
  const gsc = await getWebmastersClient();
  const res = await gsc.sites.list();
  return res.data.siteEntry || [];
}

/**
 * Quick health check: returns true if GSC API access works.
 */
export async function verifyGSCConnection(): Promise<boolean> {
  try {
    const gsc = await getWebmastersClient();
    await gsc.sites.list();
    return true;
  } catch (e: any) {
    console.error(`[GSC] Connection error: ${e.message}`);
    return false;
  }
}
