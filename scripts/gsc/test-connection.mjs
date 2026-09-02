import { webmasters, auth } from '@googleapis/webmasters';

async function main() {
  const a = new auth.GoogleAuth({
    keyFile: '/workspace/.secrets/gsc-key.json',
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  const gsc = webmasters({ version: 'v3', auth: a });

  console.log('=== Sites accessible ===');
  const sites = await gsc.sites.list();
  console.log(JSON.stringify(sites.data, null, 2));

  if (sites.data.siteEntry?.length > 0) {
    const siteUrl = sites.data.siteEntry[0].siteUrl;
    console.log(`\n=== Sitemaps on ${siteUrl} ===`);
    const sitemaps = await gsc.sitemaps.list({ siteUrl });
    console.log(JSON.stringify(sitemaps.data.sitemap || [], null, 2));
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  console.error('Code:', e.code);
  console.error('Status:', e.response?.status);
  if (e.response?.data) console.error('Body:', JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
