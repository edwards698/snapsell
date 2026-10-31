import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export * as schema from './schema.js';
export * from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;
/** A transaction handle; functions that accept `DbLike` work inside or outside a transaction. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbLike = Db | Tx;

export interface DatabaseHandle {
  db: Db;
  sqlite: Database.Database;
  close(): void;
}

export const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

/**
 * Open the SQLite database with the pragmas from BUILD_PLAN D14.
 * Pass ':memory:' for an in-memory database in tests.
 */
export function openDatabase(file: string): DatabaseHandle {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, close: () => sqlite.close() };
}

export function runMigrations(handle: DatabaseHandle) {
  migrate(handle.db, { migrationsFolder: MIGRATIONS_DIR });
}

const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** 20-character, URL-safe, lowercase random ID (100 bits of entropy). */
export function newId(): string {
  const bytes = randomBytes(20);
  let id = '';
  for (const byte of bytes) id += ID_ALPHABET[byte & 31];
  return id;
}
