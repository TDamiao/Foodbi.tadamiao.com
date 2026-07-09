import { logger } from '../utils/logger.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Endpoint nao encontrado.' });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status >= 500) logger.error({ error }, 'Erro interno');
  res.status(status).json({
    error: error.message || 'Erro interno',
    details: error.details || null
  });
}
