import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const pool = new Pool({ connectionString: config.databaseUrl });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getExecutedMigrations(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ filename: string }>(
    'SELECT filename FROM _migrations ORDER BY id ASC'
  );
  return result.rows.map((r) => r.filename);
}

async function runMigrations(): Promise<void> {
  await ensureMigrationsTable(pool);
  const executed = await getExecutedMigrations(pool);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f.includes('_up'))
    .sort();

  for (const file of files) {
    if (executed.includes(file)) continue;

    console.log(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✓ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✗ ${file}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('All migrations complete.');
}

async function rollbackMigration(): Promise<void> {
  await ensureMigrationsTable(pool);
  const executed = await getExecutedMigrations(pool);
  if (executed.length === 0) {
    console.log('No migrations to rollback.');
    return;
  }

  const last = executed[executed.length - 1]!;
  const downFile = last.replace('_up.sql', '_down.sql');
  const downPath = path.join(MIGRATIONS_DIR, downFile);

  if (!fs.existsSync(downPath)) {
    throw new Error(`Down migration not found: ${downFile}`);
  }

  console.log(`Rolling back: ${last}`);
  const sql = fs.readFileSync(downPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('DELETE FROM _migrations WHERE filename = $1', [last]);
    await client.query('COMMIT');
    console.log(`✓ Rolled back ${last}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function resetDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    for (const row of result.rows) {
      await client.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
    }
    await client.query('COMMIT');
    console.log('Database reset complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const command = process.argv[2];

async function main() {
  try {
    if (command === 'rollback') {
      await rollbackMigration();
    } else if (command === 'reset') {
      await resetDatabase();
    } else {
      await runMigrations();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
