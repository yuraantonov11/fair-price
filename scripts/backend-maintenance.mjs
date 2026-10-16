import { setTimeout as delay } from 'node:timers/promises';

// Management credentials stay inside the runner. Never log API response bodies.
const action = process.env.BACKEND_ACTION ?? 'inspect';
const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const expectedRef = 'mdqcjgxpvvknpehuqrhl';
if (!['inspect', 'restore'].includes(action)) throw new Error('Unsupported backend action');
if (ref !== expectedRef) throw new Error('Project ref differs from the approved existing project');
if (!token) throw new Error('Missing SUPABASE_ACCESS_TOKEN');

async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    // Status is sufficient to diagnose missing access without exposing credentials
    // or an untrusted response containing private project configuration.
    throw new Error(`Management API ${method} ${path || '/project'} returned HTTP ${response.status}`);
  }
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}

let project = await api('');
console.log(`Approved project status: ${project.status}`);
if (action === 'restore' && project.status === 'INACTIVE') {
  await api('/restore', 'POST');
  console.log('Resume requested for the existing paused project (no backup rollback).');
  project = await api('');
}
if (action === 'restore') {
  for (let poll = 0; project.status !== 'ACTIVE_HEALTHY' && poll < 30; poll++) {
    if (!['INACTIVE', 'COMING_UP', 'RESTORING', 'RESTARTING', 'ACTIVE_UNHEALTHY'].includes(project.status)) {
      throw new Error(`Cannot safely resume project in status ${project.status}`);
    }
    await delay(30_000);
    project = await api('');
    console.log(`Resume progress: ${project.status}`);
  }
  if (project.status !== 'ACTIVE_HEALTHY') throw new Error('Project did not become healthy within 15 minutes');
}
if (project.status === 'ACTIVE_HEALTHY') {
  const migrations = await api('/database/migrations');
  console.log('Applied migration versions:', JSON.stringify(migrations.map(({ version, name }) => ({ version, name }))));
  const metadata = await api('/database/query/read-only', 'POST', {
    query: `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN
      ('products', 'price_history', 'price_observations', 'community_price_reports', 'crawl_leases')
      ORDER BY table_name, ordinal_position`,
  });
  console.log('Runtime schema columns:', JSON.stringify(metadata));
} else {
  console.log('Database inspection skipped until project is healthy.');
}
