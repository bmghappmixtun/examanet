const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const { Resend } = require('resend');

(async () => {
  // 1. Find boutiti.mehdi@yandex.com
  const user = await p.user.findUnique({
    where: { email: 'boutiti.mehdi@yandex.com' },
    include: { otpCodes: { where: { consumedAt: null }, orderBy: { createdAt: 'desc' } } }
  });

  if (!user) {
    console.log('❌ User boutiti.mehdi@yandex.com NOT FOUND');
    await p.$disconnect();
    return;
  }

  console.log('User found:');
  console.log('  email:', user.email);
  console.log('  role:', user.role);
  console.log('  status:', user.status);
  console.log('  verified:', user.emailVerifiedAt);
  console.log('  OTPs:', user.otpCodes.length);

  // 2. Generate new OTP (30 min validity)
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const otp = await p.otpCode.create({
    data: {
      userId: user.id,
      code,
      purpose: 'email_verification',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });

  console.log('\n✅ New OTP created:', code, 'expires:', otp.expiresAt);

  // 3. Send via Resend
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    try {
      const result = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Examanet <onboarding@resend.dev>',
        to: [user.email],
        subject: `${code} — Votre code Examanet (nouveau)`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #0EA5E9;">Bonjour ${user.firstName} 👋</h1>
            <p>Voici votre nouveau code de vérification :</p>
            <div style="background: #0EA5E9; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 12px; letter-spacing: 8px; margin: 20px 0;">
              ${code}
            </div>
            <p>Ce code est valide pendant <strong>30 minutes</strong>.</p>
            <p>Si vous n'avez pas créé de compte, ignorez cet email.</p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">— L'équipe Examanet</p>
          </div>
        `
      });
      console.log('✅ Email sent:', result);
    } catch (e) {
      console.error('❌ Email error:', e.message);
    }
  }

  await p.$disconnect();
})();
