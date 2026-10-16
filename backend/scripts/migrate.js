// Minimal migration runner — no extra dependency needed for a project this size.
// Migrations live in ../database/migrations/*.sql, applied in filename order,
// tracked in a schema_migrations table so re-running is safe (idempotent).
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MIGRATIONS_DIR = path.resolve(process.cwd(), '../database/migrations');

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await pool.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename)
  );

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip (already applied): ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`applying: ${file}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`failed: ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('migrations up to date.');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
