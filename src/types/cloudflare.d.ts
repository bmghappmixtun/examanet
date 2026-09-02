// Augment Cloudflare Workers env to include our custom bindings
// This is needed for TypeScript to recognize HYPERDRIVE from getCloudflareContext()
// We declare it manually because OpenNext doesn't include Hyperdrive in their CloudflareEnv type
declare module '@opennextjs/cloudflare' {
  interface CloudflareEnv {
    HYPERDRIVE?: {
      connectionString: string;
      host: string;
      user: string;
      password: string;
      database: string;
    };
    DATABASE_URL?: string;
  }
}
