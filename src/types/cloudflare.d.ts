// Augment Cloudflare Workers env to include our custom bindings
// 2026-09-02: Removed HYPERDRIVE binding (Phase 8 Prisma+Hyperdrive → D1 migration)
declare module '@opennextjs/cloudflare' {
  interface CloudflareEnv {
    DATABASE_URL?: string;
  }
}
