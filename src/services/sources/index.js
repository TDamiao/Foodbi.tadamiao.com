import { query } from '../../db/pool.js';
import { CnpjWsSource } from './cnpjWsSource.js';
import { BaseCnpjSource } from './baseSource.js';

const mapSourceRow = (row) => ({
  sourceKey: row.source_key,
  name: row.name,
  baseUrl: row.base_url,
  supportsCitySearch: Boolean(row.supports_city_search),
  supportsUfSearch: Boolean(row.supports_uf_search),
  supportsCnaeFilter: Boolean(row.supports_cnae_filter),
  supportsPagination: Boolean(row.supports_pagination),
  isEnabled: Boolean(row.is_enabled),
  knownLimit: row.known_limit,
  status: row.status,
  notes: row.notes
});

export async function getSource(sourceKey) {
  const rows = await query('SELECT * FROM data_sources WHERE source_key = :sourceKey AND is_enabled = 1', { sourceKey });
  const metadata = rows[0] ? mapSourceRow(rows[0]) : null;
  if (!metadata) return null;
  if (metadata.sourceKey === 'cnpjws') return new CnpjWsSource(metadata);
  return new BaseCnpjSource(metadata);
}

export async function listSources() {
  const rows = await query('SELECT * FROM data_sources ORDER BY source_key');
  return rows.map(mapSourceRow);
}
