import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';
import { FOOD_CNAES } from '../src/config/cnaes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function runSqlFile(file) {
  const sql = await fs.readFile(file, 'utf8');
  const statements = sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function main() {
  await runSqlFile(path.join(root, 'src/db/migrations/001_initial_schema.sql'));
  await runSqlFile(path.join(root, 'src/db/seeds/001_seed_sources.sql'));

  for (const item of FOOD_CNAES) {
    await pool.execute(
      `INSERT INTO cnae_categories (cnae, category, description)
       VALUES (:code, :category, :description)
       ON DUPLICATE KEY UPDATE category = VALUES(category), description = VALUES(description)`,
      item
    );
  }

  console.log('Database schema and seed data are ready.');
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
