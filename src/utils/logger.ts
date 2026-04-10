type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

type LogContext = Record<string, unknown>;

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99,
};

function readEnvVar(name: string): string | undefined {
  // In Node.js / test environments process.env takes highest priority
  // so that vi.stubEnv / direct assignment can override Vite-injected values.
  const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env;
  if (processEnv?.[name]) return processEnv[name];

  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
    if (metaEnv?.[name]) return metaEnv[name];
  } catch {
    // ignore import.meta access outside Vite context
  }

  return undefined;
}

function isDevMode(): boolean {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | boolean> }).env;
    if (typeof metaEnv?.DEV === 'boolean') return metaEnv.DEV;
    if (typeof metaEnv?.MODE === 'string') return metaEnv.MODE !== 'production';
  } catch {
    // ignore import.meta access outside Vite context
  }

  const nodeEnv = readEnvVar('NODE_ENV');
  return nodeEnv !== 'production';
}

function resolveLogLevel(): LogLevel {
  const fromEnv = readEnvVar('VITE_LOG_LEVEL')?.toLowerCase();
  if (fromEnv && fromEnv in LOG_PRIORITY) return fromEnv as LogLevel;
  return isDevMode() ? 'info' : 'warn';
}

function normalizeMeta(meta?: unknown): LogContext | undefined {
  if (meta == null) return undefined;

  if (meta instanceof Error) {
    return { error: { name: meta.name, message: meta.message, stack: meta.stack } };
  }

  if (typeof meta !== 'object') return { value: meta };

  const clone = { ...(meta as Record<string, unknown>) };
  if (clone.error instanceof Error) {
    const err = clone.error;
    clone.error = { name: err.name, message: err.message, stack: err.stack };
  }
  return clone;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_PRIORITY[level] >= LOG_PRIORITY[resolveLogLevel()];
}

function writeLog(level: Exclude<LogLevel, 'silent'>, scope: string, message: string, meta?: unknown) {
  if (!shouldLog(level)) return;

  const payload = normalizeMeta(meta);
  const prefix = `[FairPrice][${scope}][${level.toUpperCase()}]`;

  if (level === 'error') {
    payload ? console.error(prefix, message, payload) : console.error(prefix, message);
    return;
  }

  if (level === 'warn') {
    payload ? console.warn(prefix, message, payload) : console.warn(prefix, message);
    return;
  }

  payload ? console.log(prefix, message, payload) : console.log(prefix, message);
}

export function createLogger(scope: string, baseContext?: LogContext) {
  const withContext = (meta?: unknown) => {
    const normalized = normalizeMeta(meta);
    return { ...(baseContext || {}), ...(normalized || {}) };
  };

  return {
    debug: (message: string, meta?: unknown) => writeLog('debug', scope, message, withContext(meta)),
    info: (message: string, meta?: unknown) => writeLog('info', scope, message, withContext(meta)),
    warn: (message: string, meta?: unknown) => writeLog('warn', scope, message, withContext(meta)),
    error: (message: string, meta?: unknown) => writeLog('error', scope, message, withContext(meta)),
    child: (context: LogContext) => createLogger(scope, { ...(baseContext || {}), ...context }),
  };
}

