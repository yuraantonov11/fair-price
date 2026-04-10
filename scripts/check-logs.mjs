import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const srcDir = join(root, 'src');
const allowList = new Set([join(srcDir, 'utils', 'logger.ts')]);

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) continue;
    if (allowList.has(fullPath)) continue;

    const source = readFileSync(fullPath, 'utf8');
    if (/console\.(log|warn|error|info|debug)\(/.test(source)) {
      offenders.push(fullPath.replace(`${root}\\`, ''));
    }
  }
}

walk(srcDir);

if (offenders.length > 0) {
  console.error('[check:logs] Direct console usage found in files:');
  for (const file of offenders) {
    console.error(` - ${file}`);
  }
  process.exit(1);
}

console.log('[check:logs] OK: only centralized logger emits console output.');

