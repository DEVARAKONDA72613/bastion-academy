import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Neon (and most managed Postgres) requires SSL. rejectUnauthorized: false
  // is fine here because Neon's connection string already pins the host via
  // sslmode=require — this just avoids Node's default strict CA-chain check
  // tripping on Neon's certificate setup. Skip this entirely for local Postgres.
  ssl: process.env.DATABASE_URL?.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : undefined,
});

// Every query goes through here so we have one place to add
// query logging / slow-query warnings later without touching call sites.
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

// For multi-statement operations that must succeed or fail together
// (e.g. download quota check + insert — see downloads module).
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
