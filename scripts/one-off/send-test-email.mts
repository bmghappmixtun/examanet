/**
 * Send a single test email to verify the current design.
 * Usage: TO_EMAIL=boutiti.mehdi@gmail.com npx tsx --env-file=.env.local scripts/one-off/send-test-email.mts
 */
import { sendOTPEmail } from '../../src/lib/email.ts';

const TO = process.env.TO_EMAIL || 'boutiti.mehdi@gmail.com';
process.env.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

console.log(`📧 Sending OTP test email to: ${TO}\n`);

const r = await sendOTPEmail(TO, '482917', 'Mehdi');

if ((r as any).success) {
  console.log(`✓ Email sent! ID: ${(r as any).id || (r as any).messageId || 'sent'}`);
  console.log(`  → Check ${TO} inbox`);
} else {
  console.log(`✗ Failed: ${(r as any).error || 'unknown'}`);
  process.exit(1);
}
