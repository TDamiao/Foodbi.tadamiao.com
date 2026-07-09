import { query } from '../db/pool.js';

export async function listEstablishments({ uf, city, category, page = 1, pageSize = 25, q }) {
  const limit = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const params = { uf, city, category: category || null, q: q || null, limit, offset };

  const rows = await query(
    `SELECT SQL_CALC_FOUND_ROWS *
     FROM establishments
     WHERE uf = :uf
       AND municipality = :city
       AND (:category IS NULL OR category = :category)
       AND (
         :q IS NULL
         OR trade_name LIKE CONCAT('%', CAST(:q AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci, '%')
         OR legal_name LIKE CONCAT('%', CAST(:q AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci, '%')
       )
     ORDER BY COALESCE(trade_name, legal_name), cnpj
     LIMIT :limit OFFSET :offset`,
    params
  );
  const totalRows = await query('SELECT FOUND_ROWS() AS total');
  return { data: rows, page: Number(page) || 1, pageSize: limit, total: totalRows[0]?.total || 0 };
}

export async function cityAggregates({ uf, city }) {
  return query(
    `SELECT category, total, last_update_at
     FROM city_aggregates
     WHERE uf = :uf AND municipality = :city
     ORDER BY total DESC`,
    { uf, city }
  );
}

export async function totals() {
  const rows = await query(
    `SELECT
       (SELECT COUNT(DISTINCT cnpj) FROM establishments) AS establishments,
       (SELECT COUNT(DISTINCT uf)
        FROM cities
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS states,
       (SELECT COUNT(DISTINCT CONCAT(uf, '|', name)) FROM cities) AS cities,
       (SELECT COUNT(DISTINCT category) FROM establishments) AS categories,
       (SELECT MAX(collected_at) FROM establishments) AS last_update_at`
  );
  return rows[0];
}

export async function categoryTotals() {
  return query(
    `SELECT category, SUM(total) AS total, MAX(last_update_at) AS last_update_at
     FROM city_aggregates
     GROUP BY category
     ORDER BY total DESC`
  );
}

export async function mapRollups({ level, uf, category }) {
  const params = { uf: uf || null, category: category || null };

  if (level === 'country') {
    const rows = await query(
      `SELECT
         'BR' AS id,
         'Brasil' AS name,
         NULL AS uf,
         -14.2350 AS latitude,
         -51.9253 AS longitude,
         SUM(total) AS total,
         COUNT(DISTINCT CONCAT(uf, '|', municipality)) AS cities
       FROM city_aggregates
       WHERE (:uf IS NULL OR uf = :uf)
         AND (:category IS NULL OR category = :category)`,
      params
    );
    return rows.filter((row) => Number(row.total) > 0);
  }

  if (level === 'state') {
    return query(
      `SELECT
         a.uf AS id,
         a.uf AS name,
         a.uf,
         SUM(c.latitude * a.total) / SUM(a.total) AS latitude,
         SUM(c.longitude * a.total) / SUM(a.total) AS longitude,
         SUM(a.total) AS total,
         COUNT(DISTINCT a.municipality) AS cities
       FROM city_aggregates a
       JOIN cities c ON c.id = a.city_id
       WHERE c.latitude IS NOT NULL
         AND c.longitude IS NOT NULL
         AND (:uf IS NULL OR a.uf = :uf)
         AND (:category IS NULL OR a.category = :category)
       GROUP BY a.uf
       ORDER BY total DESC`,
      params
    );
  }

  return query(
    `SELECT
       c.id,
       c.name,
       c.uf,
       c.latitude,
       c.longitude,
       SUM(a.total) AS total,
       1 AS cities
     FROM city_aggregates a
     JOIN cities c ON c.id = a.city_id
     WHERE c.latitude IS NOT NULL
       AND c.longitude IS NOT NULL
       AND (:uf IS NULL OR a.uf = :uf)
       AND (:category IS NULL OR a.category = :category)
     GROUP BY c.id
     ORDER BY total DESC`,
    params
  );
}

export async function stateAnalysis(uf) {
  const params = { uf };
  const summaryRows = await query(
    `SELECT
       uf,
       SUM(total) AS establishments,
       COUNT(DISTINCT municipality) AS cities,
       COUNT(DISTINCT category) AS categories,
       MAX(last_update_at) AS last_update_at
     FROM city_aggregates
     WHERE uf = :uf
     GROUP BY uf`,
    params
  );
  const topCities = await ranking(12, uf);
  const categories = await query(
    `SELECT category, SUM(total) AS total
     FROM city_aggregates
     WHERE uf = :uf
     GROUP BY category
     ORDER BY total DESC`,
    params
  );
  return { summary: summaryRows[0] || null, topCities, categories };
}

export async function ranking(limit = 10, uf = null) {
  return query(
    `SELECT uf, municipality AS city, SUM(total) AS total, MAX(last_update_at) AS last_update_at
     FROM city_aggregates
     WHERE (:uf IS NULL OR uf = :uf)
     GROUP BY uf, municipality
     ORDER BY total DESC
     LIMIT :limit`,
    { limit: Math.min(Number(limit) || 10, 50), uf }
  );
}
