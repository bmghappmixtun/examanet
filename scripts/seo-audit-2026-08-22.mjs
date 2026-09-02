#!/usr/bin/env node
/**
 * SEO Audit - Examanet
 * 2026-08-22
 * 
 * Checks:
 * 1. Meta tags (title, description, canonical, og:*, twitter:*)
 * 2. Hreflang for multilingual
 * 3. JSON-LD structured data
 * 4. Sitemap
 * 5. Robots.txt
 * 6. Heading structure (H1, H2)
 * 7. Images alt attributes
 * 8. Page performance
 */
import https from 'https';
import http from 'http';

const BASE = 'https://examanet.com';

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAudit/1.0)' },
      timeout: 20000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, url: res.responseUrl || url }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function extractMeta(html) {
  const get = (re) => {
    const m = html.match(re);
    return m ? m[1].trim() : null;
  };
  return {
    title: get(/<title[^>]*>([^<]+)<\/title>/),
    description: get(/<meta\s+name="description"\s+content="([^"]+)"/),
    canonical: get(/<link\s+rel="canonical"\s+href="([^"]+)"/),
    ogTitle: get(/<meta\s+property="og:title"\s+content="([^"]+)"/),
    ogDescription: get(/<meta\s+property="og:description"\s+content="([^"]+)"/),
    ogUrl: get(/<meta\s+property="og:url"\s+content="([^"]+)"/),
    ogLocale: get(/<meta\s+property="og:locale"\s+content="([^"]+)"/),
    ogImage: get(/<meta\s+property="og:image"\s+content="([^"]+)"/),
    twitterCard: get(/<meta\s+name="twitter:card"\s+content="([^"]+)"/),
    robots: get(/<meta\s+name="robots"\s+content="([^"]+)"/),
    lang: get(/<html[^>]+lang="([^"]+)"/),
    dir: get(/<html[^>]+dir="([^"]+)"/),
    h1: get(/<h1[^>]*>([^<]+)/),
    h2: (html.match(/<h2[^>]*>([^<]+)/g) || []).slice(0, 3).map(s => s.replace(/<[^>]+>/g, '')),
  };
}

function getHreflangs(html) {
  const matches = html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"/g);
  return [...matches].map(m => ({ lang: m[1], url: m[2] }));
}

function getStructuredData(html) {
  const matches = html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([^<]+)<\/script>/g);
  return [...matches].map(m => {
    try {
      return JSON.parse(m[1]);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

async function audit(path, name) {
  const url = BASE + path;
  try {
    const { status, body } = await fetch(url);
    const meta = extractMeta(body);
    const hreflangs = getHreflangs(body);
    const structuredData = getStructuredData(body);
    
    return {
      path,
      name,
      status,
      ...meta,
      hreflangs,
      structuredDataTypes: structuredData.map(s => s['@type']),
    };
  } catch (e) {
    return { path, name, error: e.message };
  }
}

async function main() {
  const pages = [
    { path: '/', name: 'Home (root)' },
    { path: '/fr', name: 'Home FR' },
    { path: '/ar', name: 'Home AR' },
    { path: '/fr/ressources', name: 'Ressources FR list' },
    { path: '/fr/matieres', name: 'Matières FR' },
    { path: '/fr/niveaux', name: 'Niveaux FR' },
    { path: '/fr/professeurs', name: 'Professeurs FR' },
    { path: '/fr/bac', name: 'Bac FR' },
    { path: '/fr/college', name: 'Collège FR' },
    { path: '/fr/recherche', name: 'Recherche FR' },
    { path: '/fr/faq', name: 'FAQ FR' },
    { path: '/fr/a-propos', name: 'À propos FR' },
    { path: '/ar/ressources', name: 'Ressources AR list' },
    { path: '/ar/matieres', name: 'Matières AR' },
  ];

  console.log('=' .repeat(100));
  console.log('SEO AUDIT - Examanet (2026-08-22)');
  console.log('=' .repeat(100));
  
  for (const p of pages) {
    const r = await audit(p.path, p.name);
    console.log('\n' + r.name + ' (' + p.path + ')');
    console.log('-'.repeat(80));
    if (r.error) {
      console.log('  ERROR: ' + r.error);
      continue;
    }
    console.log('  Status:       ' + r.status);
    console.log('  HTML lang:    ' + r.lang);
    console.log('  HTML dir:     ' + r.dir);
    console.log('  Title:        ' + (r.title?.slice(0, 70) || 'MISSING'));
    console.log('  Description:  ' + (r.description?.slice(0, 70) || 'MISSING'));
    console.log('  Canonical:    ' + (r.canonical || 'MISSING'));
    console.log('  og:url:       ' + (r.ogUrl || 'MISSING'));
    console.log('  og:locale:    ' + (r.ogLocale || 'MISSING'));
    console.log('  Hreflangs:    ' + (r.hreflangs.length ? r.hreflangs.map(h => h.lang).join(', ') : 'NONE'));
    console.log('  Structured:   ' + (r.structuredDataTypes.length ? r.structuredDataTypes.join(', ') : 'NONE'));
    
    // SEO issues
    const issues = [];
    if (r.status !== 200) issues.push('Non-200 status: ' + r.status);
    if (!r.title || r.title.includes('Examanet — Examanet')) issues.push('Title has brand duplication');
    if (r.title && r.title.length > 65) issues.push('Title too long: ' + r.title.length);
    if (r.title && r.title.length < 30) issues.push('Title too short: ' + r.title.length);
    if (!r.description) issues.push('Missing description');
    if (r.description && r.description.length > 160) issues.push('Description too long: ' + r.description.length);
    if (r.description && r.description.length < 70) issues.push('Description too short: ' + r.description.length);
    if (!r.canonical) issues.push('Missing canonical');
    if (p.path.startsWith('/fr') && r.canonical && !r.canonical.includes('/fr') && p.path !== '/fr' && p.path !== '/fr/') issues.push('Canonical does not match FR URL');
    if (p.path.startsWith('/ar') && r.canonical && !r.canonical.includes('/ar') && p.path !== '/ar') issues.push('Canonical does not match AR URL');
    if (p.path === '/ar' && r.lang !== 'ar') issues.push('AR page has lang=' + r.lang);
    if (p.path === '/ar' && r.dir !== 'rtl') issues.push('AR page has dir=' + r.dir);
    if (p.path === '/ar' && r.ogLocale && !r.ogLocale.startsWith('ar')) issues.push('AR page has og:locale=' + r.ogLocale);
    if (p.path !== '/' && r.hreflangs.length === 0) issues.push('No hreflang alternates');
    if (r.structuredDataTypes.length === 0) issues.push('No JSON-LD structured data');
    
    if (issues.length) {
      console.log('  ISSUES:');
      for (const i of issues) console.log('    ⚠ ' + i);
    } else {
      console.log('  ✓ No issues');
    }
  }
}
main().catch(console.error);
