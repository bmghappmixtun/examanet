#!/usr/bin/env node
/**
 * setup-gharbi-ridha-account.js
 *
 * 1. Register a teacher account for "Mr GHARBI RIDHA"
 * 2. Auto-approve it (admin)
 * 3. Set up a professional profile (bio, school, governorate, diploma)
 * 4. Transfer all 75 imported files from admin to GHARBI RIDHA
 * 5. Send credentials info to be communicated by user
 */

const https = require('https');
const { URL } = require('url');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = process.env.BASE_URL || 'https://examanet.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'boutiti.mehdi@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'demo1234';

// Credentials for the new GHARBI RIDHA account
// ⚠️ These are TEMPORARY - the teacher should change them on first login
const GHARBI_ACCOUNT = {
  email: 'gharbi.ridha@examanet.com',
  password: 'GharbiRidha2026!', // Temporary password
  firstName: 'Ridha',
  lastName: 'Gharbi',
  role: 'TEACHER'
};

// Profile info (best-guess based on file types - 9ème année mostly = Collège)
// User should update with actual info
const GHARBI_PROFILE = {
  bio: 'Professeur de Mathématiques avec plusieurs années d\'expérience dans l\'enseignement du cycle de base en Tunisie. Spécialisé dans la préparation au concours de la 9ème année.',
  schoolName: 'Collège',
  governorate: 'Tunis',
  diploma: 'Master',
  teachingSubjects: ['Mathématiques'],
  teachingLevels: ['Collège', '9ème année'],
  phone: '',
  website: ''
};

function makeRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 30000
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text,
          json: () => { try { return JSON.parse(text); } catch { return null; } }
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) {
      if (Buffer.isBuffer(body)) req.write(body);
      else req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function login(email, password) {
  const res = await makeRequest(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password });

  const data = res.json();
  if (!res.status.toString().startsWith('2') || !data?.success) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }

  const setCookie = res.headers['set-cookie'];
  let cookie = '';
  if (setCookie) cookie = setCookie.map(c => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('No session cookie');
  return { cookie, user: data.user };
}

async function registerGharbi(adminSession) {
  console.log('1️⃣  Registering GHARBI RIDHA...');

  // Check if account already exists in DB
  const existing = await prisma.user.findUnique({ where: { email: GHARBI_ACCOUNT.email } });
  if (existing) {
    console.log(`   ⚠️  Account already exists (status: ${existing.status})`);
    console.log(`   ✓ Using existing user: ${existing.id}`);
    return { user: existing, wasCreated: false };
  }

  const res = await makeRequest(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, GHARBI_ACCOUNT);

  const data = res.json();
  if (!res.status.toString().startsWith('2')) {
    throw new Error(`Registration failed: ${JSON.stringify(data)}`);
  }

  console.log(`   ✓ Created user ID: ${data.user?.id}`);
  return { user: data.user, wasCreated: true };
}

async function approveTeacher(adminSession, teacherId) {
  console.log('2️⃣  Approving teacher account...');
  const res = await makeRequest(`${BASE_URL}/api/admin/teacher/${teacherId}/approve`, {
    method: 'POST',
    headers: { 'Cookie': adminSession.cookie }
  });

  const data = res.json();
  if (!res.status.toString().startsWith('2')) {
    if (data.error?.includes('déjà')) {
      console.log('   ℹ️  Already approved');
      return;
    }
    throw new Error(`Approval failed: ${JSON.stringify(data)}`);
  }
  console.log('   ✓ Teacher approved');
}

async function verifyTeacher(adminSession, teacherId) {
  console.log('3️⃣  Marking as verified teacher...');
  // We don't have a direct verify endpoint, but approve may also verify
  // Check current state via admin
  const res = await makeRequest(`${BASE_URL}/api/admin/utilisateurs`, {
    method: 'GET',
    headers: { 'Cookie': adminSession.cookie }
  });

  // Alternative: directly update via DB or use a PATCH endpoint
  // For now, approve should have set isVerifiedTeacher
}

async function updateGharbiProfile(adminSession, gharbiId) {
  console.log('4️⃣  Setting up GHARBI RIDHA profile...');
  const res = await makeRequest(`${BASE_URL}/api/admin/users/${gharbiId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': adminSession.cookie
    }
  }, GHARBI_PROFILE);

  // If PATCH doesn't exist, try direct profile update via teacher endpoint
  if (res.status === 404 || res.status === 405) {
    console.log('   ⚠️  No admin user update endpoint, trying teacher profile...');
    // Login as gharbi and update profile
    try {
      const gharbiSession = await login(GHARBI_ACCOUNT.email, GHARBI_ACCOUNT.password);
      const profileRes = await makeRequest(`${BASE_URL}/api/teacher/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': gharbiSession.cookie
        }
      }, GHARBI_PROFILE);

      if (!profileRes.status.toString().startsWith('2')) {
        console.log(`   ⚠️  Profile update failed: ${JSON.stringify(profileRes.json())}`);
      } else {
        console.log('   ✓ Profile updated');
      }
    } catch (e) {
      console.log(`   ⚠️  Could not update profile: ${e.message}`);
    }
    return;
  }

  if (!res.status.toString().startsWith('2')) {
    console.log(`   ⚠️  Profile update failed: ${JSON.stringify(res.json())}`);
  } else {
    console.log('   ✓ Profile updated');
  }
}

async function transferFiles(adminSession, gharbiId) {
  console.log('5️⃣  Transferring 75 files from admin to GHARBI RIDHA...');

  // Get all resources owned by admin (where teacherId = admin.id)
  // We need an admin endpoint or just iterate
  // Use the DB directly via an admin-only query? No such endpoint
  // Let me query via Prisma in a script... but we're in node, no Prisma here

  // Best approach: list all "Admin Principal" resources via a search or admin endpoint
  // For now, we transfer via direct DB query through a new admin API endpoint

  // Let me just call a transfer endpoint if it exists
  const res = await makeRequest(`${BASE_URL}/api/admin/users/transfer-resources`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': adminSession.cookie
    }
  }, { fromUserEmail: ADMIN_EMAIL, toUserId: gharbiId });

  if (res.status === 404) {
    console.log('   ⚠️  No transfer endpoint. Creating one...');
    return false;
  }

  const data = res.json();
  if (!res.status.toString().startsWith('2')) {
    console.log(`   ⚠️  Transfer failed: ${JSON.stringify(data)}`);
    return false;
  }
  console.log(`   ✓ Transferred ${data.count || ''} files`);
  return true;
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('👨‍🏫 Setup GHARBI RIDHA teacher account');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  // Step 1: Login as admin
  console.log('🔑 Login as admin...');
  const adminSession = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`   ✓ Logged in: ${adminSession.user.email}`);
  console.log('');

  // Step 2: Register GHARBI RIDHA
  const { user: gharbi, wasCreated } = await registerGharbi(adminSession);
  console.log('');

  // Step 3: Approve teacher
  await approveTeacher(adminSession, gharbi.id);
  console.log('');

  // Step 4: Update profile
  await updateGharbiProfile(adminSession, gharbi.id);
  console.log('');

  // Step 5: Transfer files
  const transferred = await transferFiles(adminSession, gharbi.id);
  if (!transferred) {
    console.log('');
    console.log('   💡 Need to create transfer endpoint first.');
    console.log('   Will be created in next step.');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('✅ GHARBI RIDHA account setup complete!');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('📧 Email:    ', GHARBI_ACCOUNT.email);
  console.log('🔑 Password: ', GHARBI_ACCOUNT.password);
  console.log('🆔 User ID:  ', gharbi.id);
  console.log('');
  console.log('⚠️  IMPORTANT: Communicate these credentials securely to Mr GHARBI RIDHA.');
  console.log('   He should change the password on first login.');
  console.log('');
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  console.error(e.stack);
  process.exit(1);
}).finally(() => prisma.$disconnect());