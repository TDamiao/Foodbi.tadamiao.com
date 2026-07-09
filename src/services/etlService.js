import { query } from '../db/pool.js';

export async function startRun({ cityId, uf, city, source }) {
  const result = await query(
    `INSERT INTO etl_runs (city_id, requested_uf, requested_city, source, status, started_at)
     VALUES (:cityId, :uf, :city, :source, 'started', NOW())`,
    { cityId, uf, city, source }
  );
  return result.insertId;
}

export async function finishRun(runId, { status, message = null, errorCode = null, recordsFound = 0, startedAt = Date.now() }) {
  await query(
    `UPDATE etl_runs
     SET status = :status,
         message = :message,
         error_code = :errorCode,
         records_found = :recordsFound,
         duration_ms = :durationMs,
         finished_at = NOW()
     WHERE id = :runId`,
    { runId, status, message, errorCode, recordsFound, durationMs: Date.now() - startedAt }
  );
}

export async function getCityStatus(cityId) {
  const rows = await query(
    `SELECT r.*
     FROM etl_runs r
     WHERE r.city_id = :cityId
     ORDER BY r.started_at DESC
     LIMIT 10`,
    { cityId }
  );
  return rows;
}
