// @ts-nocheck
/**
 * NextAuth configuration.
 *
 * 2026-09-02: Migrated from Prisma+Hyperdrive to D1 direct.
 * We use JWT sessions (no DB session), so no PrismaAdapter needed.
 * OAuth providers (Google/Facebook/Apple) are configured but disabled
 * because they require PrismaAdapter for account linking — for now, only
 * CredentialsProvider (email/password) is active on D1.
 */
import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export const authOptions: AuthOptions = {
  providers: [
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
          "SELECT id, email, firstName, lastName, avatarUrl, passwordHash, status, role FROM User WHERE email = ?"
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
  ],
  pages: {
    signIn: '/connexion',
    error: '/connexion',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        const db = await getD1();
        if (db) {
          const dbUser: any = await db.prepare(
            "SELECT id, role FROM User WHERE email = ?"
          ).bind(user.email).first();
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
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
