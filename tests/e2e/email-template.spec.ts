import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('email templates use production domain, not examanet.preview.app', async () => {
  // Read the email templates source
  const emailTemplates = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/email-templates.ts'),
    'utf-8'
  );

  // Render both templates
  const newTeacher = emailTemplates.match(/export function renderNewTeacherEmail[\s\S]*?return `([\s\S]*?)`;\s*}/)?.[1] || '';
  const newResource = emailTemplates.match(/export function renderNewResourceEmail[\s\S]*?return `([\s\S]*?)`;\s*}/)?.[1] || '';

  // Replace the template literal ${SITE_URL} with the actual production URL
  const SITE_URL = 'https://examanet.com';
  const renderedTeacher = newTeacher.replace(/\$\{SITE_URL\}/g, SITE_URL);
  const renderedResource = newResource.replace(/\$\{SITE_URL\}/g, SITE_URL);

  // Write rendered templates to a file for inspection
  fs.writeFileSync('/tmp/email-teacher-rendered.html', renderedTeacher);
  fs.writeFileSync('/tmp/email-resource-rendered.html', renderedResource);

  console.log('New Teacher email length:', renderedTeacher.length);
  console.log('New Resource email length:', renderedResource.length);

  // Check that emails reference examanet.com, not examanet.preview.app
  expect(renderedTeacher).toContain('examanet.com');
  expect(renderedResource).toContain('examanet.com');
  expect(renderedTeacher).not.toContain('examanet.preview');
  expect(renderedResource).not.toContain('examanet.preview');
  expect(renderedTeacher).toContain('/admin/approbations');
  expect(renderedResource).toContain('/admin/approbations');
});

test('professeurs profile share URL uses SITE_URL', async () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/app/professeurs/[id]/page.tsx'),
    'utf-8'
  );
  // Should not contain hardcoded examanet.preview.app
  expect(src).not.toContain('examanet.preview.app');
  // Should use ${SITE_URL}
  expect(src).toContain('${SITE_URL}');
});