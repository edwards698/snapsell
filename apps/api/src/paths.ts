import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/api */
export const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Repository root (apps/api/../..) */
export const REPO_ROOT = resolve(API_ROOT, '../..');
