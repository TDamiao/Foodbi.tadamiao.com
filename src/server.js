import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import cron from 'node-cron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { apiRouter } from './routes/api.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { updateStaleCities } from './services/collectionService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));
app.use(express.static(path.join(root, 'public')));
app.use('/api', apiRouter);
app.use(notFound);
app.use(errorHandler);

if (env.dailyJobCron) {
  cron.schedule(env.dailyJobCron, async () => {
    logger.info('Iniciando job diario de atualizacao leve');
    try {
      const results = await updateStaleCities(env.maxDailyCities);
      logger.info({ count: results.length }, 'Job diario finalizado');
    } catch (error) {
      logger.error({ error }, 'Falha no job diario');
    }
  });
}

app.listen(env.port, () => {
  logger.info({ port: env.port }, 'FoodBI iniciado');
});
