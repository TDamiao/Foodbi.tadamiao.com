import { env } from '../src/config/env.js';
import { updateStaleCities } from '../src/services/collectionService.js';
import { pool } from '../src/db/pool.js';

try {
  const results = await updateStaleCities(env.maxDailyCities);
  console.log(JSON.stringify({ updated: results.length, results }, null, 2));
} finally {
  await pool.end();
}
