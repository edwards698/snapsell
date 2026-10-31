// Runs in a worker thread with its own SQLite connection (see inventory.test.ts).
import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '@snapsell/db';
import { reserveOrder } from '../../src/catalog/inventory-ops.js';

const { file, orderIds } = workerData as { file: string; orderIds: string[] };
const handle = openDatabase(file);
const results = orderIds.map((id) => reserveOrder(handle.db, id).ok);
handle.close();
parentPort!.postMessage(results);
