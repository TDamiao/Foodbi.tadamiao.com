const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry(fn, options) {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const retryStatusCodes = new Set(options.retryStatusCodes ?? [429, 500, 502, 503, 504]);

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const retryable = !status || retryStatusCodes.has(status);
      if (!retryable || attempt === attempts) break;

      const retryAfter = Number.parseInt(error?.response?.headers?.['retry-after'] ?? '', 10);
      const delay = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : baseDelayMs * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }
  throw lastError;
}
