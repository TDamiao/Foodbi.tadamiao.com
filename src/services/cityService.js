import { query, pool } from '../db/pool.js';
import { env } from '../config/env.js';

export async function findCity(uf, name) {
  const rows = await query(
    'SELECT * FROM cities WHERE uf = :uf AND name = :name LIMIT 1',
    { uf: uf.toUpperCase(), name }
  );
  return rows[0] || null;
}

export async function upsertCity({ uf, name, ibgeCode = null, latitude = null, longitude = null }) {
  await query(
    `INSERT INTO cities (uf, name, ibge_code, latitude, longitude, last_requested_at)
     VALUES (:uf, :name, :ibgeCode, :latitude, :longitude, NOW())
     ON DUPLICATE KEY UPDATE
       ibge_code = COALESCE(VALUES(ibge_code), ibge_code),
       latitude = COALESCE(VALUES(latitude), latitude),
       longitude = COALESCE(VALUES(longitude), longitude),
       last_requested_at = NOW()`,
    { uf: uf.toUpperCase(), name, ibgeCode, latitude, longitude }
  );
  return findCity(uf, name);
}

export function isCityFresh(city) {
  if (!city?.last_update_at) return false;
  const ageMs = Date.now() - new Date(city.last_update_at).getTime();
  return ageMs < env.dataTtlHours * 60 * 60 * 1000;
}

export async function listCities({ uf, category } = {}) {
  const params = { uf: uf || null, category: category || null };
  return query(
    `SELECT
       c.id, c.uf, c.name, c.ibge_code, c.latitude, c.longitude, c.collection_status,
       c.last_update_at, COALESCE(SUM(a.total), 0) AS total
     FROM cities c
     LEFT JOIN city_aggregates a ON a.city_id = c.id AND (:category IS NULL OR a.category = :category)
     WHERE (:uf IS NULL OR c.uf = :uf)
     GROUP BY c.id
     HAVING total > 0 OR c.collection_status IN ('failed','unsupported','running')
     ORDER BY total DESC, c.uf, c.name`,
    params
  );
}

export async function searchCities({ uf, q }) {
  return query(
    `SELECT id, uf, name, ibge_code, latitude, longitude, collection_status, last_update_at
     FROM cities
     WHERE (:uf IS NULL OR uf = :uf)
       AND (:q IS NULL OR name LIKE CONCAT('%', CAST(:q AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci, '%'))
     ORDER BY uf, name
     LIMIT 20`,
    { uf: uf || null, q: q || null }
  );
}

export async function markCityStatus(cityId, status, error = null) {
  await query(
    'UPDATE cities SET collection_status = :status, last_error = :error WHERE id = :cityId',
    { cityId, status, error }
  );
}

export async function rebuildCityAggregates(cityId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM city_aggregates WHERE city_id = :cityId', { cityId });
    await conn.execute(
      `INSERT INTO city_aggregates (city_id, uf, municipality, category, total, last_update_at)
       SELECT c.id, e.uf, e.municipality, e.category, COUNT(*) AS total, NOW()
       FROM establishments e
       JOIN cities c ON c.uf = e.uf AND c.name = e.municipality
       WHERE c.id = :cityId
       GROUP BY c.id, e.uf, e.municipality, e.category`,
      { cityId }
    );
    await conn.execute(
      'UPDATE cities SET collection_status = :status, last_update_at = NOW(), last_error = NULL WHERE id = :cityId',
      { cityId, status: 'fresh' }
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
