// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake OPC UA server, an
// in-memory /data, and the integration wired on top through registerHandlers
// — the very wiring index.js uses.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MemoryStore } from '../../src/store.js';
import { createFakeServer } from './fakeOpcua.js';

// Keep the test output readable (LOG_LEVEL is read on every log call).
// LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

export const ENDPOINT = 'opc.tcp://192.0.2.10:4840';

/**
 * @param {object} options
 * @param {object} options.nodes address space of the fake server
 * @param {object} [options.config] integration config (endpoint added)
 * @param {boolean} [options.connect]
 * @param {boolean} [options.createAll] add the discovered device to Gladys
 * @param {object} [options.store]
 * @param {string|null} [options.refuse] the server answers this down code
 * @param {() => number} [options.now]
 */
export async function createWorld({
  nodes = {},
  config = {},
  connect = true,
  createAll = true,
  store = new MemoryStore(),
  refuse = null,
  now,
} = {}) {
  const server = createFakeServer(nodes);
  server.refuse = refuse;
  const gladys = createFakeGladys({ config: { endpoint_url: ENDPOINT, ...config } });
  const app = registerHandlers(gladys, {
    store,
    createConnection: server.createConnection,
    timers: false,
    now,
  });
  const world = {
    gladys,
    fake: gladys.fake,
    app,
    hub: app.hub,
    server,
    store,
    /** Wait until the link events are handled. */
    async settle() {
      await app.hub.events;
      await app.hub.flushing;
    },
    async createDevices(devices = gladys.fake.discoveredDevices) {
      for (const device of devices) {
        await gladys.fake.deviceCreated(device);
      }
    },
    get device() {
      return gladys.fake.discoveredDevices[0];
    },
    feature(name) {
      const feature = world.device?.features.find((candidate) => candidate.name === name);
      if (!feature) {
        throw new Error(`No feature ${name}`);
      }
      return feature;
    },
    /** The last state published for a feature, by name. */
    state(name) {
      return gladys.fake.lastState(world.feature(name).external_id);
    },
    async stop() {
      await app.stop();
    },
  };
  if (connect) {
    await gladys.connect();
    await world.settle();
    if (createAll) {
      await world.createDevices();
      await world.settle();
    }
  }
  return world;
}

/**
 * Capture the log lines written at `level` and above while `run` runs.
 * @returns {Promise<string[]>}
 */
export async function captureLogs(t, run, level = 'info') {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  try {
    await run();
  } finally {
    process.env.LOG_LEVEL = previous;
    console.log.mock.restore();
    console.error.mock.restore();
  }
  return lines;
}
