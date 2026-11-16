// OpenNext adapter for Cloudflare Workers. Pages render on demand, so no incremental cache (R2) is configured:
// cached catalog queries simply run against the database on each request, and admin edits show up immediately.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
