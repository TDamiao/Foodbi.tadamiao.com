import { env } from '../config/env.js';
import { FOOD_CNAES } from '../config/cnaes.js';
import { getSource } from './sources/index.js';
import { upsertCity, findCity, isCityFresh, markCityStatus, rebuildCityAggregates } from './cityService.js';
import { startRun, finishRun } from './etlService.js';
import { UnsupportedRegionalSearchError } from './sources/baseSource.js';

export async function requestCityCollection({ uf, city, force = false, sourceKey = env.defaultSource }) {
  const startedAt = Date.now();
  const normalized = { uf: uf.toUpperCase(), city: city.trim() };
  const cityRow = await upsertCity({ uf: normalized.uf, name: normalized.city });

  if (!force && isCityFresh(cityRow)) {
    const runId = await startRun({ cityId: cityRow.id, uf: normalized.uf, city: normalized.city, source: sourceKey });
    await finishRun(runId, {
      status: 'skipped',
      message: 'Dados recentes encontrados no cache MySQL.',
      startedAt
    });
    return { status: 'cache_hit', city: await findCity(normalized.uf, normalized.city) };
  }

  const source = await getSource(sourceKey);
  const runId = await startRun({ cityId: cityRow.id, uf: normalized.uf, city: normalized.city, source: sourceKey });
  await markCityStatus(cityRow.id, 'running');

  try {
    if (!source) {
      throw new UnsupportedRegionalSearchError(sourceKey);
    }
    if (!source.supportsRegionalSearch()) {
      throw new UnsupportedRegionalSearchError(source.key);
    }

    const records = await source.fetchByCity({
      uf: normalized.uf,
      city: normalized.city,
      cnaes: FOOD_CNAES.map((item) => item.code)
    });

    await rebuildCityAggregates(cityRow.id);
    await finishRun(runId, {
      status: 'success',
      recordsFound: records.length,
      message: 'Coleta regional concluida.',
      startedAt
    });
    return { status: 'updated', recordsFound: records.length, city: await findCity(normalized.uf, normalized.city) };
  } catch (error) {
    const unsupported = error instanceof UnsupportedRegionalSearchError || error.code === 'UNSUPPORTED_REGIONAL_SEARCH';
    const status = unsupported ? 'unsupported' : (error?.response?.status === 429 ? 'rate_limited' : 'failed');
    await markCityStatus(cityRow.id, unsupported ? 'unsupported' : 'failed', error.message);
    await finishRun(runId, {
      status,
      message: unsupported
        ? 'Fonte atual nao permite busca por cidade/UF/CNAE com paginacao. Nenhuma varredura por CNPJ foi executada.'
        : error.message,
      errorCode: error.code || String(error?.response?.status || 'ERROR'),
      startedAt
    });
    return {
      status,
      city: await findCity(normalized.uf, normalized.city),
      message: unsupported
        ? 'A fonte publica configurada nao permite coleta regional por cidade/CNAE. O projeto esta pronto para plugar uma fonte com filtros regionais.'
        : 'Falha ao consultar a fonte externa. Tente novamente mais tarde.'
    };
  }
}

export async function updateStaleCities(limit) {
  const { query } = await import('../db/pool.js');
  const cities = await query(
    `SELECT *
     FROM cities
     WHERE collection_status IN ('fresh','stale','failed')
       AND (last_update_at IS NULL OR last_update_at < DATE_SUB(NOW(), INTERVAL :ttl HOUR))
     ORDER BY COALESCE(last_update_at, '1970-01-01') ASC
     LIMIT :limit`,
    { ttl: env.dataTtlHours, limit }
  );

  const results = [];
  for (const item of cities) {
    results.push(await requestCityCollection({ uf: item.uf, city: item.name, force: true }));
  }
  return results;
}
