import { resolve } from 'node:path';
import { openDatabase, runMigrations } from './index.js';

const dataDir = resolve(process.env.DATA_DIR ?? '../../data');
const file = process.env.DATABASE_FILE ?? resolve(dataDir, 'db/snapsell.db');
const handle = openDatabase(file);
runMigrations(handle);
handle.close();
console.log(`Migrated ${file}`);
