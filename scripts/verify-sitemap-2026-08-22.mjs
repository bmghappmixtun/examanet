#!/usr/bin/env node
/**
 * Verify sitemap output structure (don't run actual DB query)
 * 
 * Simulates the withAlternates helper from sitemap.ts
 */
const baseUrl = 'https://examanet.com';

const withAlternates = (path, priority, cf) => {
  const canonicalPath = path
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/(fr|ar)(\/|$)/, '/')
    .replace(/\/$/, '') || '/';
  const frUrl = `${baseUrl}/fr${canonicalPath === '/' ? '' : canonicalPath}`;
  const arUrl = `${baseUrl}/ar${canonicalPath === '/' ? '' : canonicalPath}`;
  return {
    url: frUrl,
    alternates: {
      languages: {
        'fr-TN': frUrl,
        'ar-TN': arUrl,
        'x-default': frUrl,
      },
    },
    priority,
    changeFrequency: cf,
  };
};

const sample = [
  withAlternates('/', 1.0, 'daily'),
  withAlternates('/a-propos', 0.5, 'monthly'),
  withAlternates('/matieres/mathematiques', 0.7, 'weekly'),
  withAlternates('/ressources/15362/devoir-francais', 0.8, 'daily'),
];

console.log('Sample sitemap entries:');
console.log(JSON.stringify(sample, null, 2));
