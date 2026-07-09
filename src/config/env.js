import dotenv from 'dotenv';

dotenv.config();

const intFromEnv = (key, fallback) => {
  const value = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: intFromEnv('PORT', 3000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: intFromEnv('DB_PORT', 3306),
    database: process.env.DB_NAME || 'foodbi_map',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  },
  dataTtlHours: intFromEnv('DATA_TTL_HOURS', 168),
  defaultSource: process.env.DEFAULT_SOURCE || 'cnpjws',
  externalTimeoutMs: intFromEnv('EXTERNAL_TIMEOUT_MS', 12000),
  retryAttempts: intFromEnv('RETRY_ATTEMPTS', 3),
  retryBaseDelayMs: intFromEnv('RETRY_BASE_DELAY_MS', 1000),
  dailyJobCron: process.env.DAILY_JOB_CRON || '0 3 * * *',
  maxDailyCities: intFromEnv('MAX_DAILY_CITIES', 10)
};
