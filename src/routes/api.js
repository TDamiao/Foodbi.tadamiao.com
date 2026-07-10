import { Router } from 'express';
import { FOOD_CNAES } from '../config/cnaes.js';
import { HttpError } from '../utils/httpError.js';
import { listSources } from '../services/sources/index.js';
import { listCities, searchCities, findCity } from '../services/cityService.js';
import { requestCityCollection } from '../services/collectionService.js';
import { getCityStatus } from '../services/etlService.js';
import { categoryTotals, cityAggregates, cityNationalRank, listEstablishments, mapRollups, ranking, stateAnalysis, totals } from '../services/establishmentService.js';

export const apiRouter = Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

apiRouter.get('/health', (req, res) => {
  res.json({ ok: true, name: 'FoodBI' });
});

apiRouter.get('/sources', asyncRoute(async (req, res) => {
  res.json(await listSources());
}));

apiRouter.get('/cnaes', (req, res) => {
  res.json(FOOD_CNAES);
});

apiRouter.get('/totals', asyncRoute(async (req, res) => {
  res.json(await totals());
}));

apiRouter.get('/categories/totals', asyncRoute(async (req, res) => {
  res.json(await categoryTotals());
}));

apiRouter.get('/map/rollups', asyncRoute(async (req, res) => {
  const level = ['country', 'state', 'city'].includes(req.query.level) ? req.query.level : 'city';
  res.json(await mapRollups({ level, uf: req.query.uf, category: req.query.category }));
}));

apiRouter.get('/cities', asyncRoute(async (req, res) => {
  res.json(await listCities({ uf: req.query.uf, category: req.query.category }));
}));

apiRouter.get('/cities/search', asyncRoute(async (req, res) => {
  res.json(await searchCities({ uf: req.query.uf, q: req.query.q }));
}));

apiRouter.post('/cities/collect', asyncRoute(async (req, res) => {
  const { uf, city, force, source } = req.body || {};
  if (!uf || !city) throw new HttpError(400, 'Informe uf e city.');
  const result = await requestCityCollection({ uf, city, force: Boolean(force), sourceKey: source });
  res.status(result.status === 'updated' ? 201 : 200).json(result);
}));

apiRouter.get('/cities/:uf/:city/status', asyncRoute(async (req, res) => {
  const city = await findCity(req.params.uf, req.params.city);
  if (!city) throw new HttpError(404, 'Cidade nao encontrada no banco.');
  res.json({ city, runs: await getCityStatus(city.id) });
}));

apiRouter.get('/cities/:uf/:city/aggregates', asyncRoute(async (req, res) => {
  res.json(await cityAggregates({ uf: req.params.uf.toUpperCase(), city: req.params.city }));
}));

apiRouter.get('/cities/:uf/:city/rank', asyncRoute(async (req, res) => {
  const rank = await cityNationalRank({ uf: req.params.uf.toUpperCase(), city: req.params.city });
  if (!rank) throw new HttpError(404, 'Cidade sem ranking nacional.');
  res.json(rank);
}));

apiRouter.get('/cities/:uf/:city/categories', asyncRoute(async (req, res) => {
  res.json(await cityAggregates({ uf: req.params.uf.toUpperCase(), city: req.params.city }));
}));

apiRouter.get('/cities/:uf/:city/establishments', asyncRoute(async (req, res) => {
  res.json(await listEstablishments({
    uf: req.params.uf.toUpperCase(),
    city: req.params.city,
    category: req.query.category,
    page: req.query.page,
    pageSize: req.query.pageSize,
    q: req.query.q
  }));
}));

apiRouter.get('/establishments/search', asyncRoute(async (req, res) => {
  const { uf, city, q, page, pageSize } = req.query;
  if (!uf || !city) throw new HttpError(400, 'Informe uf e city.');
  res.json(await listEstablishments({ uf: uf.toUpperCase(), city, q, page, pageSize }));
}));

apiRouter.get('/ranking/cities', asyncRoute(async (req, res) => {
  res.json(await ranking(req.query.limit, req.query.uf || null));
}));

apiRouter.get('/states/:uf/analysis', asyncRoute(async (req, res) => {
  const uf = req.params.uf.toUpperCase();
  const data = await stateAnalysis(uf);
  if (!data.summary) throw new HttpError(404, 'Estado nao encontrado na base.');
  res.json(data);
}));

apiRouter.get('/last-update', asyncRoute(async (req, res) => {
  const data = await totals();
  res.json({ lastUpdateAt: data.last_update_at });
}));
