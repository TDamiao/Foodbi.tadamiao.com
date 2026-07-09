import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

export const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  timezone: 'Z'
});

export async function query(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}
