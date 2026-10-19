// Offline integration fixture for the actual Node CLI. Every unexpected request fails closed.
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (process.env.CRAWL_STORE === 'rozetka.com.ua' && url.includes('dnipro-m.ua')) throw new Error('Unexpected Dnipro-M request in a Rozetka-only crawl');
  if (url.startsWith('https://product-api.rozetka.com.ua/v4/goods/get-main?goodsId=123&')) {
    return Response.json({ success: true, data: { id: 123, title: 'CLI fixture', price: 1234, old_price: 0, sell_status: 'available' } });
  }
  if (url === 'https://dnipro-m.ua/sitemap_uk.xml') return new Response('<urlset><url><loc>https://dnipro-m.ua/tovar/cli/</loc></url></urlset>');
  if (url === 'https://dnipro-m.ua/tovar/cli/') return new Response('<script id="__NEXT_DATA__">{"props":{"pageProps":{"product":{"id":1,"title":"CLI fixture","price":1234}}}}</script>');
  if (!url.startsWith('https://crawler-audit.invalid/rest/v1/')) throw new Error('Unexpected network request in offline CLI test');
  if (url.includes('/rpc/acquire_crawl_lock')) return Response.json('00000000-0000-0000-0000-000000000001');
  if (url.includes('/rpc/release_crawl_lock')) return new Response(null, { status: 204 });
  if (url.includes('/rpc/price_storage_budget')) return Response.json({ bytes: 1000000, discoveryAllowed: process.env.FP_DISCOVERY !== '0', writesAllowed: process.env.FP_WRITES !== '0' });
  if (url.includes('/rpc/record_price')) {
    const body = JSON.parse(String(init?.body));
    if (body.p_source !== 'system' || body.p_price !== 123400) throw new Error('Wrong source or price units');
    return process.env.FP_RPC_FAILURE === '1' ? Response.json({ message: 'Simulated RPC failure' }, { status: 503 }) : new Response(null, { status: 204 });
  }
  if (url.includes('/products') && process.env.CRAWL_STORE === 'rozetka.com.ua') return Response.json([{ url: 'https://rozetka.com.ua/ua/tool/p123/' }]);
  if (url.includes('/community_price_reports') || url.includes('/products')) return Response.json([]);
  throw new Error('Unexpected mock backend endpoint');
};
