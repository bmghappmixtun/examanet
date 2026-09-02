import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Teacher resource upload', () => {
  test('Upload with FormData (multipart) works', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login as teacher
      const loginRes = await context.post(`${BASE}/api/auth/login`, {
        data: { email: 'ahmed.benali@examanet.com', password: 'demo1234' }
      });
      expect(loginRes.ok()).toBeTruthy();

      // Use multipart/form-data (this is what the form sends)
      const res = await context.post(`${BASE}/api/teacher/resources`, {
        multipart: {
          title: 'Test upload FormData',
          description: 'Test description',
          type: 'COURSE',
          subject: 'mathematiques',
          class: '4eme-secondaire',
          year: '2023-2024'
        }
      });
      const data = await res.json();
      expect(res.status()).toBe(200);
      expect(data.success).toBe(true);
      expect(data.resource.title).toBe('Test upload FormData');
      console.log('✓ FormData upload works:', data.resource.slug);
    } finally {
      await context.dispose();
    }
  });

  test('Upload with JSON body works (fallback)', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: BASE });
    try {
      const loginRes = await context.post(`${BASE}/api/auth/login`, {
        data: { email: 'ahmed.benali@examanet.com', password: 'demo1234' }
      });
      expect(loginRes.ok()).toBeTruthy();

      const res = await context.post(`${BASE}/api/teacher/resources`, {
        headers: { 'Content-Type': 'application/json' },
        data: {
          title: 'Test upload JSON',
          description: 'Test JSON',
          type: 'COURSE',
          subject: 'mathematiques',
          class: '4eme-secondaire',
          year: '2023-2024'
        }
      });
      const data = await res.json();
      expect(res.status()).toBe(200);
      expect(data.success).toBe(true);
      console.log('✓ JSON upload works:', data.resource.slug);
    } finally {
      await context.dispose();
    }
  });

  test('Upload with PDF file attached', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: BASE });
    try {
      const loginRes = await context.post(`${BASE}/api/auth/login`, {
        data: { email: 'ahmed.benali@examanet.com', password: 'demo1234' }
      });
      expect(loginRes.ok()).toBeTruthy();

      // Create a small dummy PDF buffer
      const dummyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<<\n/Size 1\n/Root 1 0 R\n>>\nstartxref\n0\n%%EOF');

      const res = await context.post(`${BASE}/api/teacher/resources`, {
        multipart: {
          title: 'Upload with PDF',
          type: 'COURSE',
          subject: 'mathematiques',
          class: '4eme-secondaire',
          year: '2023-2024',
          file: {
            name: 'test.pdf',
            mimeType: 'application/pdf',
            buffer: dummyPdf
          }
        }
      });
      const data = await res.json();
      expect(res.status()).toBe(200);
      expect(data.success).toBe(true);
      expect(data.resource.fileSize).toBeGreaterThan(0);
      console.log('✓ PDF upload works:', data.resource.slug, 'size:', data.resource.fileSize);
    } finally {
      await context.dispose();
    }
  });

  test('Student cannot upload (role check)', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: BASE });
    try {
      const loginRes = await context.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });
      expect(loginRes.ok()).toBeTruthy();

      const res = await context.post(`${BASE}/api/teacher/resources`, {
        multipart: {
          title: 'Hack',
          type: 'COURSE',
          subject: 'mathematiques',
          class: '4eme-secondaire'
        }
      });
      expect(res.status()).toBe(403);
      console.log('✓ Student blocked from upload');
    } finally {
      await context.dispose();
    }
  });
});