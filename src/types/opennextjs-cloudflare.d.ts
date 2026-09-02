// Re-export from @opennextjs/cloudflare because the package's subpath exports
// don't resolve properly with moduleResolution: "bundler"
declare module '@opennextjs/cloudflare' {
  export function getCloudflareContext<T = any>(options: { async: true }): Promise<{
    env: any;
    cf: any;
    ctx: any;
  }>;
  export function getCloudflareContext<T = any>(options?: { async: false }): {
    env: any;
    cf: any;
    ctx: any;
  };
  export function defineCloudflareConfig(config?: any): any;
  export function getDeploymentId(): string;
}
