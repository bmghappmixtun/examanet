// @ts-nocheck
/**
 * NextAuth configuration.
 *
 * 2026-09-09: Added OAuth providers (Google, Facebook, Apple).
 * Each provider is conditional — it only activates if its CLIENT_ID is set
 * in the environment. This allows graceful degradation:
 * - Magic Link works always (no setup)
 * - OAuth providers activate when credentials are added
 */
import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import AppleProvider from 'next-auth/providers/apple';
import { notifyAdminsNewStudent } from '@/lib/admin-notify';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

// Build provider list dynamically based on env vars
const providers: any[] = [];

// 1. Credentials (always on)
providers.push(
  CredentialsProvider({
    name: 'Email',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      const db = await getD1();
      if (!db) return null;
      const user: any = await db.prepare(
        "SELECT id, email, newId,  avatarUrl, passwordHash, status, role FROM User WHERE email = ?"
      ).bind(credentials.email).first();
      if (!user || !user.passwordHash) return null;
      const bcrypt = await import('bcryptjs');
      const valid = await bcrypt.compare(credentials.password, user.passwordHash);
      if (!valid) return null;
      if (user.status !== 'ACTIVE' && user.status !== 'PENDING_FILE_VERIFICATION') return null;
      return {
        id: user.id,
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        image: user.avatarUrl || undefined,
      };
    },
  }),
);

// 2. Google (activates if env vars present)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
  );
}

// 3. Facebook (activates if env vars present)
if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  providers.push(
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    }),
  );
}

// 4. Apple (activates if env vars present)
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_SECRET) {
  providers.push(
    AppleProvider({
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_SECRET,
    }),
  );
}

export const authOptions: AuthOptions = {
  providers,
  pages: {
    signIn: '/connexion',
    error: '/connexion',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    /**
     * Called on sign-in. We use this to:
     * 1. Create or link the OAuth account to a D1 user
     * 2. Auto-create STUDENT account if email is new
     * 3. Trigger admin notifications for new signups
     */
    async signIn({ user, account, profile, email }) {
      if (!user?.email || !account) return true;

      // Only handle OAuth providers (not Credentials)
      if (account.type !== 'oauth') return true;

      const db = await getD1();
      if (!db) return false;

      const userEmail = user.email.toLowerCase();
      const oauthProvider = account.provider; // 'google', 'facebook', 'apple'
      const oauthId = account.providerAccountId;

      try {
        // Look up existing user by email
        const existing: any = await db.prepare(
          'SELECT id, email, role, status, oauthProvider, oauthId FROM User WHERE email = ? LIMIT 1'
        ).bind(userEmail).first();

        if (existing) {
          // Link OAuth to existing user
          await db.prepare(
            'UPDATE User SET oauthProvider = COALESCE(oauthProvider, ?), oauthId = COALESCE(oauthId, ?), emailVerifiedAt = COALESCE(emailVerifiedAt, ?) WHERE id = ?'
          ).bind(
            oauthProvider,
            oauthId,
            Date.now(),
            existing.id,
          ).run();
          return true;
        }

        // Auto-create as STUDENT (new OAuth user)
        const newId = crypto.randomUUID().replace(/-/g, '').slice(0, 25);
        const now = Date.now();
        const firstName = (profile as any)?.given_name || (user.name?.split(' ')[0] ?? '');
        const lastName = (profile as any)?.family_name || (user.name?.split(' ').slice(1).join(' ') ?? '');
        const avatarUrl = (user as any).image || null;

        await db.prepare(
          `INSERT INTO User (
            id, email, role, status, emailVerifiedAt,
            newId,  avatarUrl,
            oauthProvider, oauthId,
            createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          newId,
          userEmail,
          'STUDENT',
          'ACTIVE',
          now,
          newId,
          
          avatarUrl,
          oauthProvider,
          oauthId,
          now,
          now,
        ).run();

        // Fire-and-forget admin notification for new OAuth student signup
        notifyAdminsNewStudent(newId).catch((e) =>
          console.error('[oauth] notifyAdminsNewStudent failed:', e)
        );

        return true;
      } catch (e) {
        console.error('[oauth signIn callback] error:', e);
        return false;
      }
    },
    async jwt({ token, user, account }) {
      // First sign-in (account is set)
      if (user?.email && account) {
        const db = await getD1();
        if (db) {
          const dbUser: any = await db.prepare(
            "SELECT id, role FROM User WHERE email = ?"
          ).bind(user.email).first();
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.provider = account.provider;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
