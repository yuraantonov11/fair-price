import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/utils/logger';

describe('logger', () => {
  afterEach(() => {
    delete process.env.VITE_LOG_LEVEL;
    vi.restoreAllMocks();
  });

  it('respects configured log level', () => {
    process.env.VITE_LOG_LEVEL = 'warn';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const logger = createLogger('test-scope', { runtime: 'unit' });
    logger.info('this should be filtered');
    logger.warn('this should be visible');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('normalizes Error objects into structured payload', () => {
    process.env.VITE_LOG_LEVEL = 'debug';

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createLogger('test-scope');

    logger.error('failure', new Error('boom'));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const call = errorSpy.mock.calls[0];
    expect(call[0]).toContain('[FairPrice][test-scope][ERROR]');
    expect(call[2]).toHaveProperty('error.message', 'boom');
  });
});

