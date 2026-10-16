// Applies database/seed.sql directly — separate from the migrations table
// since seed data is dev-only and safe to re-run against a fresh DB, not
// something we want tracked as a permanent migration step.
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const seedPath = path.resolve(process.cwd(), '../database/seed.sql');

async function run() {
  const sql = fs.readFileSync(seedPath, 'utf8');
  await pool.query(sql);
  console.log('seed data applied.');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
