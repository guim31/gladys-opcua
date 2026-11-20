// -----------------------------------------------------------------------------
// Small persistence under /data (the only writable path of the container):
// the type and access each variable had on the server, so that a restart
// while the PLC is off still publishes the device with the right features.
// Losing the file is harmless: the next connection rebuilds it. No secret is
// stored here (the client certificate lives in /data/pki).
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { createIssueLog } from './issues.js';

const logger = createLogger({ name: 'opcua-store' });
const FILE_NAME = 'opcua-variables.json';

export class Store {
  constructor(directory = process.env.OPCUA_DATA_DIR || '/data') {
    this.directory = directory;
    this.path = join(directory, FILE_NAME);
    this.data = null;
    this.writing = Promise.resolve();
    // A read-only or full /data fails every write: logged once.
    this.issues = createIssueLog(logger);
  }

  async load() {
    if (this.data) {
      return this.data;
    }
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      this.data = data && typeof data === 'object' ? data : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cannot read ${this.path}: ${err.message}`);
      }
      this.data = {};
    }
    return this.data;
  }

  async get(key) {
    return (await this.load())[key];
  }

  /** Store a value; writes are chained and atomic (temporary file + rename). */
  async set(key, value) {
    const data = await this.load();
    data[key] = value;
    this.writing = this.writing.then(async () => {
      try {
        await mkdir(this.directory, { recursive: true });
        const temporary = `${this.path}.tmp`;
        await writeFile(temporary, JSON.stringify(this.data));
        await rename(temporary, this.path);
        this.issues.ok('write', `${this.path} written again`);
      } catch (err) {
        this.issues.fail('write', `Cannot write ${this.path}: ${err.message}`);
      }
    });
    return this.writing;
  }

  /** Resolves once every write requested so far is on disk. */
  flush() {
    return this.writing;
  }
}

/** A store kept in memory (tests). */
export class MemoryStore {
  constructor(data = {}) {
    this.data = data;
  }

  async get(key) {
    return this.data[key];
  }

  async set(key, value) {
    this.data[key] = value;
  }

  async flush() {}
}
