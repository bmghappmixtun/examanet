import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const TEACHER_EMAIL = 'fatma.trabelsi@examanet.com';
const TEACHER_PASSWORD = 'demo1234';

const TEST_PDF_PATH = path.join('/tmp', 'e2e-test.pdf');
const TEST_DOCX_PATH = path.join('/tmp', 'e2e-test.docx');

test.beforeAll(() => {
  // Create a tiny valid PDF
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer << /Size 4 /Root 1 0 R >>
startxref
190
%%EOF`;
  fs.writeFileSync(TEST_PDF_PATH, pdf);

  // Create a tiny valid DOCX
  const { execSync } = require('child_process');
  try {
    execSync(`python3 -c "
import zipfile
content_types = '<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>'
rels = '<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>'
doc = '<?xml version=\"1.0\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:body></w:document>'
with zipfile.ZipFile('${TEST_DOCX_PATH}', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', content_types)
    z.writestr('_rels/.rels', rels)
    z.writestr('word/document.xml', doc)
"`);
  } catch (e) {
    console.log('DOCX generation failed:', e);
  }
});

test('teacher uploads PDF, publishes, NO conversion error', async ({ page, request }) => {
  // Login
  const loginRes = await request.post('/api/auth/login', {
    data: { email: TEACHER_EMAIL, password: TEACHER_PASSWORD },
  });
  expect(loginRes.ok()).toBeTruthy();
  const cookies = loginRes.headers()['set-cookie'];
  const cookieHeader = cookies?.split(';')[0];

  // Upload PDF
  const fileBuffer = fs.readFileSync(TEST_PDF_PATH);
  const uploadRes = await request.post('/api/teacher/files/upload', {
    multipart: {
      file: { name: 'e2e-test.pdf', mimeType: 'application/pdf', buffer: fileBuffer },
    },
    headers: { Cookie: cookieHeader || '' },
  });
  const uploadData = await uploadRes.json();
  expect(uploadData.success).toBe(true);
  expect(uploadData.conversionStatus).toBe('SKIPPED');
  // CRITICAL: pdfKey/pdfUrl must be set (not null) for publish to work
  expect(uploadData.pdfKey).toBeTruthy();
  expect(uploadData.pdfUrl).toBeTruthy();

  // Get a class to use
  const subjects = await request.get('/api/catalog/subjects', { headers: { Cookie: cookieHeader || '' } });
  // Just hardcode a class slug from the catalog
  const classSlug = '1ere-secondaire';

  // Publish the PDF
  const publishRes = await request.post('/api/teacher/resources', {
    data: {
      title: `E2E PDF Test ${Date.now()}`,
      description: 'E2E test for PDF no-conversion fix',
      type: 'COURSE',
      subject: 'mathematiques',
      class: classSlug,
      year: '2025-2026',
      libraryFileId: uploadData.libraryFileId,
    },
    headers: { Cookie: cookieHeader || '' },
  });
  const publishData = await publishRes.json();
  // CRITICAL: should NOT contain "Conversion PDF échouée"
  if (publishData.error) {
    expect(publishData.error).not.toContain('Conversion PDF échouée');
  }
  expect(publishData.success).toBe(true);
  expect(publishData.resource.status).toBe('PENDING_APPROVAL');
  expect(publishData.resource.fileKey).toBeTruthy();
  expect(publishData.resource.fileUrl).toBeTruthy();
});
