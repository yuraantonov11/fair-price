import http from 'node:http';
let failure = null;
let empty = false;
let saveFails = false;
let historyCalls = 0;
let delayFirst = false;
let completedFirst = false;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:38765');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (url.pathname === '/control') {
    failure = url.searchParams.get('failure'); empty = url.searchParams.get('empty') === '1';
    saveFails = url.searchParams.get('saveFails') === '1'; historyCalls = 0;
    delayFirst = url.searchParams.get('delayFirst') === '1'; completedFirst = false;
    res.end('{}'); return;
  }
  if (url.pathname === '/health') { res.end('{}'); return; }
  if (url.pathname === '/stats') { res.end(JSON.stringify({ historyCalls, completedFirst })); return; }
  if (url.pathname === '/rest/v1/rpc/record_price') {
    if (saveFails) { res.writeHead(503).end(JSON.stringify({ message: 'Simulated save failure' })); return; }
    res.end('null'); return;
  }
  if (url.pathname === '/rest/v1/price_observations') {
    historyCalls++;
    if (failure) {
      const code = failure === 'schema' ? '42703' : failure === 'access' ? '42501' : '';
      res.writeHead(failure === 'schema' ? 400 : failure === 'access' ? 403 : 503);
      res.end(JSON.stringify({ code, message: failure === 'schema' ? 'column source does not exist' : 'Simulated unavailable backend' })); return;
    }
    if (delayFirst && url.searchParams.get('products.url')?.includes('/first/')) {
      await new Promise(resolve => setTimeout(resolve, 1200)); completedFirst = true;
    }
    const price = url.searchParams.get('products.url')?.includes('second') ? 777700 : url.searchParams.get('products.url')?.includes('rozetka') ? 1499900 : 199800;
    res.end(JSON.stringify(empty ? [] : [5, 3, 1].map(days => ({ price, regular_price: null, promo_name: null,
      observed_at: new Date(Date.now() - days * 86400000).toISOString(), source: 'system' })))); return;
  }
  res.writeHead(404).end('{}');
});
server.listen(38765, '127.0.0.1');
