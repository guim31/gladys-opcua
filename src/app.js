// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys) and returns the pieces, so index.js stays a few lines and the tests
// drive the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  ACTION_KEYS,
  ActionFailure,
  SCENE_ACTION_KEYS,
  browse,
  checkConfig,
  writeValue,
} from './actions.js';
import { normalizeConfig } from './config.js';
import { OpcuaHub } from './hub.js';
import { STATUS, writeError } from './messages.js';
import { Store } from './store.js';
import { WriteError } from './values.js';
import { WIDGET_KEY, overviewContent } from './widgets.js';

const logger = createLogger({ name: 'opcua-app' });

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, createConnection, dataDir, timers, now
 */
export function registerHandlers(gladys, options = {}) {
  const refreshWidget = () => gladys.requestWidgetRefresh(WIDGET_KEY);
  const hub = new OpcuaHub({
    gladys,
    store: options.store ?? new Store(),
    createConnection: options.createConnection ?? defaultConnection,
    dataDir: options.dataDir ?? process.env.OPCUA_DATA_DIR ?? '/data',
    now: options.now,
    timers: options.timers ?? true,
    onChange: refreshWidget,
  });

  // Resolved once the first configuration is applied: a command arriving
  // during startup waits for it instead of finding no variable.
  let lastConfig = null;
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      // A reconnection to Gladys keeps the OPC UA link, unless the
      // configuration changed meanwhile.
      const config = normalizeConfig(await gladys.getConfig());
      const text = JSON.stringify(config);
      if (text !== lastConfig) {
        lastConfig = text;
        await hub.configure(config);
      }
      refreshWidget();
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, STATUS.initFailed).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onConfigUpdated(
    whenReady(async (newConfig) => {
      logger.info('Configuration updated');
      const config = normalizeConfig(newConfig);
      lastConfig = JSON.stringify(config);
      await hub.configure(config);
      refreshWidget();
    }),
  );

  gladys.onScanRequest(whenReady(() => hub.rescan()));

  gladys.onSetValue(
    whenReady(async (device, feature, value) => {
      try {
        await hub.write(hub.variableOfFeature(feature.external_id), value);
      } catch (err) {
        if (err instanceof WriteError) {
          throw new ActionFailure(writeError(err.code, err.params));
        }
        throw err;
      }
    }),
  );

  gladys.onDeviceCreated(
    whenReady(async (device) => {
      await hub.onDeviceCreated(device);
      refreshWidget();
    }),
  );
  gladys.onDeviceUpdated(whenReady(async () => refreshWidget()));
  gladys.onDeviceDeleted(whenReady(async () => refreshWidget()));

  gladys.onAction(
    ACTION_KEYS.BROWSE,
    whenReady((fields) => browse(hub, fields)),
  );
  gladys.onAction(
    ACTION_KEYS.CHECK_CONFIG,
    whenReady(() => checkConfig(hub)),
  );
  gladys.onAction(
    ACTION_KEYS.WRITE_VALUE,
    whenReady((fields) => writeValue(hub, fields)),
  );
  gladys.onSceneAction(
    SCENE_ACTION_KEYS.WRITE_VALUE,
    whenReady(async (fields) => {
      await writeValue(hub, fields);
      return undefined;
    }),
  );

  gladys.onWidgetGet(
    WIDGET_KEY,
    whenReady(async (request) => overviewContent(hub, request)),
  );

  return {
    hub,
    ready,
    async stop() {
      await hub.stop();
      await hub.store.flush?.();
    },
  };
}

// node-opcua is loaded only when a real connection is needed: the tests and
// the manifest checks never pay its ~60 MB.
async function loadClient() {
  return import('./opcua/client.js');
}

function defaultConnection(options) {
  return lazyConnection(options);
}

/** A connection whose node-opcua module is imported on start(). */
function lazyConnection(options) {
  const listeners = [];
  let real = null;
  const pending = loadClient().then(({ createOpcuaConnection }) => {
    real = createOpcuaConnection(options);
    for (const [event, listener] of listeners) {
      real.on(event, listener);
    }
    return real;
  });
  return {
    on(event, listener) {
      listeners.push([event, listener]);
      real?.on(event, listener);
    },
    start() {
      pending
        .then((connection) => connection.start())
        .catch((err) => logger.error('Cannot load node-opcua', err));
    },
    async stop() {
      const connection = await pending.catch(() => null);
      await connection?.stop();
    },
    readVariables: async (...args) => (await pending).readVariables(...args),
    monitor: async (...args) => (await pending).monitor(...args),
    write: async (...args) => (await pending).write(...args),
    browse: async (...args) => (await pending).browse(...args),
  };
}
