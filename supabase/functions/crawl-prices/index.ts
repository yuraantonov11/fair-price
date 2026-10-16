import { createCrawlHandler } from '../_shared/edgeHandler.ts';

Deno.serve(createCrawlHandler({
  url: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  secret: Deno.env.get('CRAWL_TRIGGER_SECRET'),
  onError: error => console.error('[crawl-prices] Crawl failed', {
    store: 'dnipro-m.ua', message: error instanceof Error ? error.message : 'Unknown error',
  }),
}));
