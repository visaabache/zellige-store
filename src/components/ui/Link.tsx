import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * next/link with prefetching off. Prefetching renders every visible link's page on the server in the background:
 * on a product grid that means dozens of renders per visit, which is costly on Cloudflare Workers.
 * Pages still load fast on click, and anonymous page views are served from the page cache.
 */
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}
