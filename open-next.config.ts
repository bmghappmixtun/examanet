import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import kvNextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  tagCache: kvNextTagCache,
  // PERF 2026-09-02: Enable CF edge cache interception (Step 6)
  // When enabled, the Worker respects Cache-Control: s-maxage headers and
  // serves cached HTML from the edge instead of running the Worker on every request.
  // Combined with next.config.js headers() rules for public pages, this gives
  // 5-10x speedup on cached pages.
  enableCacheInterception: true,
});
