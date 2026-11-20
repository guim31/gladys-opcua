// -----------------------------------------------------------------------------
// The hub: one OPC UA server, its variables, and what Gladys sees of them.
//
// - On connection it reads each variable's type and access, publishes the
//   device (one Gladys device for the server, one feature per variable), and
//   subscribes to the variables. Types are cached under /data so a restart
//   with the PLC off still publishes the same device.
// - Values arrive by subscription and are kept as the latest per variable; a
//   flush publishes the changed ones, no faster than the 300 states a minute
//   Gladys accepts (with many fast variables, the flush slows down).
// - Writes go through the declared variables only, and only when the user
//   turned writing on.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, parseEndpoint } from './config.js';
import { pick } from './i18n.js';
import { createIssueLog } from './issues.js';
import { KINDS, publishedUnit } from './kinds.js';
import { STATUS, variableError } from './messages.js';
import { WriteError, resolveKind, toState, toWrite } from './values.js';
import { parseVariables, uniqueNames } from './variables.js';

const logger = createLogger({ name: 'opcua-hub' });

export const TRIGGERS = {
  DISCONNECTED: 'server_disconnected',
  RECONNECTED: 'server_reconnected',
  BAD_STATUS: 'variable_bad_status',
};

// Gladys accepts 300 states a minute per integration: keep a margin.
const STATES_PER_MINUTE = 240;
// Re-send unchanged values: the dashboard says "no recent value" after 48 h.
const HEARTBEAT_MS = 6 * 3600 * 1000;
const HEARTBEAT_CHECK_MS = 3600 * 1000;

export class OpcuaHub {
  /**
   * @param {object} options
   * @param {object} options.gladys
   * @param {object} options.store
   * @param {(options: object) => object} options.createConnection
   * @param {string} [options.dataDir]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] run the heartbeat timer
   * @param {() => void} [options.onChange] the widget has something new to show
   */
  constructor({
    gladys,
    store,
    createConnection,
    dataDir = '/data',
    now = Date.now,
    timers = true,
    onChange = () => {},
  }) {
    this.gladys = gladys;
    this.store = store;
    this.createConnection = createConnection;
    this.dataDir = dataDir;
    this.now = now;
    this.timers = timers;
    this.onChange = onChange;
    this.config = normalizeConfig({});
    this.connection = null;
    this.endpoint = null;
    this.ids = null;
    this.variables = [];
    this.configErrors = [];
    this.latest = new Map();
    this.status = { connected: null, code: null, lastValueAt: null };
    this.issues = createIssueLog(logger);
    this.flushTimer = null;
    this.lastFlushAt = 0;
    this.flushing = Promise.resolve();
    this.heartbeatTimer = null;
    this.events = Promise.resolve();
  }

  // --- Configuration and connection ----------------------------------------

  async configure(config) {
    await this.#stopConnection();
    this.config = config;
    this.latest.clear();
    this.status = { connected: null, code: null, lastValueAt: null };
    const { variables, errors } = parseVariables(config.variables);
    this.configErrors = errors;
    this.variables = variables;
    this.byNode = new Map(variables.map((variable) => [variable.nodeId, variable]));

    const endpoint = parseEndpoint(config.endpoint_url);
    if (endpoint.error) {
      this.endpoint = null;
      this.ids = null;
      this.status.code = endpoint.error;
      await this.gladys.publishDiscoveredDevices([]);
      await this.#setConnectionStatus(false, STATUS[endpoint.error]);
      return;
    }
    this.endpoint = endpoint;
    this.ids = this.gladys.externalIds('server', endpoint.platformId);
    const cache = (await this.store.get(endpoint.platformId)) ?? {};
    for (const variable of variables) {
      if (cache[variable.nodeId]) {
        this.#resolve(variable, cache[variable.nodeId]);
      }
    }
    await this.publishDevice();

    this.connection = this.createConnection({
      endpointUrl: endpoint.url,
      securityMode: config.security_mode,
      securityPolicy: config.security_policy,
      userName: config.username || undefined,
      password: config.password || undefined,
      dataDir: this.dataDir,
      publishingInterval: Number(config.interval) * 1000,
    });
    const connection = this.connection;
    // Link events run one after the other: a loss during the reading of
    // the variables is handled once that reading is over.
    connection.on('up', () => this.#queue(connection, () => this.#onUp()));
    connection.on('down', (event) => this.#queue(connection, () => this.#onDown(event)));
    connection.start();
    this.#startHeartbeat();
  }

  #queue(connection, handler) {
    this.events = this.events.then(async () => {
      if (connection !== this.connection) {
        return;
      }
      try {
        await handler();
      } catch (err) {
        // Most often the link dropped while reading: its 'down' follows.
        logger.debug(`Handling the OPC UA link failed: ${err.message}`);
        await this.#onDown({ code: 'unreachable' }).catch(() => {});
      }
    });
    return this.events;
  }

  async #stopConnection() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    const connection = this.connection;
    this.connection = null;
    await connection?.stop();
  }

  async stop() {
    await this.#stopConnection();
    await this.events;
    await this.flushing;
  }

  /** Type, kind and access of a variable, from the server (or its cache). */
  #resolve(variable, info) {
    delete variable.problem;
    variable.type = info.type;
    variable.serverWritable = info.writable;
    variable.displayName = info.displayName;
    const { kind, code } = resolveKind(variable, info.type, info.isArray);
    if (code) {
      variable.resolved = false;
      variable.problem = { code, params: { type: info.type, kind: variable.kind } };
      return;
    }
    variable.resolvedKind = kind;
    variable.resolved = true;
    if (variable.write && !info.writable) {
      variable.problem = { code: 'notWritable', params: {} };
    }
  }

  async #onUp() {
    const results = await this.connection.readVariables(this.variables.map((v) => v.nodeId));
    const cache = {};
    for (const [index, variable] of this.variables.entries()) {
      const result = results[index];
      if (!result.ok) {
        variable.resolved = false;
        variable.problem = { code: 'notFound', params: { status: result.status } };
        continue;
      }
      const info = {
        type: result.type,
        isArray: result.isArray,
        writable: result.writable,
        displayName: result.displayName,
      };
      cache[variable.nodeId] = info;
      this.#resolve(variable, info);
    }
    await this.store.set(this.endpoint.platformId, cache);
    await this.publishDevice();

    const watched = this.variables.filter((variable) => variable.resolved);
    await this.connection.monitor(
      watched.map(({ nodeId }) => ({ nodeId })),
      (nodeId, read) => this.#onValue(nodeId, read),
    );
    // The values read with the types: no wait for the first notification.
    for (const [index, variable] of this.variables.entries()) {
      if (variable.resolved && results[index].valueStatus) {
        this.#onValue(variable.nodeId, {
          type: results[index].type,
          value: results[index].value,
          status: results[index].valueStatus,
        });
      }
    }

    const wasDown = this.status.connected === false;
    this.status.connected = true;
    this.status.code = null;
    this.issues.ok(
      'link',
      `OPC UA server ${this.endpoint.host}:${this.endpoint.port} connected again`,
    );
    if (!wasDown) {
      logger.info(
        `Connected to the OPC UA server ${this.endpoint.host}:${this.endpoint.port} (${watched.length} variables)`,
      );
    }
    await this.#setConnectionStatus(true);
    await this.#publishTransport('local');
    if (wasDown) {
      this.#fireTrigger(TRIGGERS.RECONNECTED, {});
    }
    this.onChange();
  }

  async #onDown({ code }) {
    const wasUp = this.status.connected === true;
    if (this.status.connected === false && this.status.code === code) {
      return;
    }
    this.status.connected = false;
    this.status.code = code;
    this.issues.fail(
      'link',
      `OPC UA server ${this.endpoint.host}:${this.endpoint.port} unavailable (${code})`,
    );
    await this.#setConnectionStatus(false, STATUS[code] ?? STATUS.unreachable);
    await this.#publishTransport('unreachable');
    if (wasUp) {
      this.#fireTrigger(TRIGGERS.DISCONNECTED, {
        error: pick(STATUS[code] ?? STATUS.unreachable, this.config.language),
      });
    }
    this.onChange();
  }

  async #setConnectionStatus(connected, message) {
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.debug(`setConnectionStatus failed: ${err.message}`);
    }
  }

  async #publishTransport(transport) {
    if (!this.#createdDevice()) {
      return;
    }
    try {
      await this.gladys.publishTransports([{ external_id: this.ids.device, transport }]);
    } catch (err) {
      logger.debug(`publishTransports failed: ${err.message}`);
    }
  }

  #fireTrigger(key, data) {
    if (!this.ids) {
      return;
    }
    const payload = { device: this.ids.device, device_name: this.deviceName(), ...data };
    this.gladys.publishSceneEvent(key, payload).catch((err) => {
      logger.debug(`Scene event ${key} refused: ${err.message}`);
    });
  }

  // --- Device ----------------------------------------------------------------

  /** The name of the device: the one given in Gladys, else "OPC UA <host>". */
  deviceName() {
    return this.#createdDevice()?.name ?? `OPC UA ${this.endpoint?.host ?? ''}`.trim();
  }

  #createdDevice() {
    return (
      this.ids &&
      (this.gladys.devices ?? []).find((device) => device.external_id === this.ids.device)
    );
  }

  /** The variables published as features, with their final names. */
  features() {
    const resolved = this.variables.filter((variable) => variable.resolved);
    const names = uniqueNames(resolved.map((v) => v.name ?? v.displayName ?? v.nodeId));
    return resolved.map((variable, index) => {
      const kind = KINDS[variable.resolvedKind];
      const { unit } = publishedUnit(variable.resolvedKind, variable.unit ?? kind.units[0]);
      const writable = Boolean(
        kind.writable && variable.write && variable.serverWritable && this.config.allow_write,
      );
      return {
        variable,
        feature: {
          name: names[index],
          external_id: this.ids.feature(variable.key),
          category: kind.category,
          type: kind.type,
          ...(unit ? { unit } : {}),
          min: variable.min ?? kind.min,
          max: variable.max ?? kind.max,
          read_only: !writable,
          has_feedback: true,
          keep_history: !kind.text,
        },
      };
    });
  }

  buildDevice() {
    if (!this.ids) {
      return null;
    }
    const features = this.features().map(({ feature }) => feature);
    if (features.length === 0) {
      return null;
    }
    return {
      name: `OPC UA ${this.endpoint.host}`,
      external_id: this.ids.device,
      model: 'OPC UA',
      should_poll: false,
      features,
    };
  }

  async publishDevice() {
    const device = this.buildDevice();
    await this.gladys.publishDiscoveredDevices(device ? [device] : []);
  }

  async rescan() {
    await this.publishDevice();
  }

  /** A device was added in Gladys: its features exist now, send every value. */
  async onDeviceCreated(device) {
    if (this.ids && device?.external_id === this.ids.device) {
      this.gladys.forgetPublishedStates(this.ids.device);
      await this.flush();
      await this.#publishTransport(this.status.connected ? 'local' : 'unreachable');
    }
  }

  // --- Values ------------------------------------------------------------------

  #onValue(nodeId, read) {
    const variable = this.byNode.get(nodeId);
    if (!variable?.resolved) {
      return;
    }
    if (!read.status.good) {
      if (variable.good !== false) {
        variable.good = false;
        logger.debug(`${variable.nodeId}: ${read.status.name}`);
        if (variable.badReported !== true) {
          variable.badReported = true;
          this.#fireTrigger(TRIGGERS.BAD_STATUS, {
            variable_name: this.#nameOf(variable),
            status: read.status.name,
          });
        }
      }
      return;
    }
    variable.good = true;
    variable.badReported = false;
    const state = toState(
      { ...variable, kind: variable.resolvedKind },
      { type: read.type ?? variable.type, value: read.value },
    );
    if (state === null) {
      return;
    }
    this.latest.set(variable.key, state);
    this.status.lastValueAt = this.now();
    this.#scheduleFlush();
  }

  #nameOf(variable) {
    return (
      this.features().find((entry) => entry.variable === variable)?.feature.name ?? variable.nodeId
    );
  }

  /** Time between two flushes: the publishing interval, or slower with many variables. */
  flushPeriodMs() {
    const count = Math.max(1, this.variables.filter((v) => v.resolved).length);
    return Math.max(
      Number(this.config.interval) * 1000,
      Math.ceil((count * 60_000) / STATES_PER_MINUTE),
    );
  }

  #scheduleFlush() {
    if (this.flushTimer || !this.connection) {
      return;
    }
    const wait = Math.max(0, this.lastFlushAt + this.flushPeriodMs() - this.now());
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch(() => {});
    }, wait);
    this.flushTimer.unref?.();
  }

  /** Publish the latest values of the features Gladys has; resolves once sent. */
  flush() {
    this.flushing = this.flushing.then(() => this.#flushNow());
    return this.flushing;
  }

  async #flushNow() {
    this.lastFlushAt = this.now();
    const created = this.#createdDevice();
    if (!created) {
      return;
    }
    const known = new Set((created.features ?? []).map((feature) => feature.external_id));
    const states = [];
    for (const [key, state] of this.latest) {
      const externalId = this.ids.feature(key);
      if (known.size > 0 && !known.has(externalId)) {
        continue;
      }
      states.push(
        typeof state === 'object'
          ? { device_feature_external_id: externalId, text: state.text }
          : { device_feature_external_id: externalId, state },
      );
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      this.issues.ok('publish', 'Gladys accepts the values again');
    } catch (err) {
      this.issues.fail('publish', `Gladys refused the values: ${err.message}`);
    }
  }

  #startHeartbeat() {
    if (!this.timers) {
      return;
    }
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => this.flush().catch(() => {}), HEARTBEAT_CHECK_MS);
    this.heartbeatTimer.unref?.();
  }

  // --- Writes ----------------------------------------------------------------

  /** A declared variable by feature name, configured name or NodeId. */
  findVariable(text) {
    const wanted = String(text ?? '').trim();
    const lower = wanted.toLowerCase();
    const entry = this.features().find(
      ({ variable, feature }) =>
        feature.name.toLowerCase() === lower ||
        variable.name?.toLowerCase() === lower ||
        variable.nodeId === wanted,
    );
    return (
      entry?.variable ??
      this.variables.find(
        (variable) => variable.nodeId === wanted || variable.name?.toLowerCase() === lower,
      )
    );
  }

  /** The variable of a feature external id. */
  variableOfFeature(externalId) {
    return this.variables.find(
      (variable) => this.ids && this.ids.feature(variable.key) === externalId,
    );
  }

  /**
   * Write a value to a declared variable. Throws a WriteError.
   * @returns {Promise<{ variable: object, value: unknown }>}
   */
  async write(variable, input) {
    if (!variable) {
      throw new WriteError('unknownVariable', { name: '?' });
    }
    const name = this.#nameOf(variable);
    if (!this.config.allow_write) {
      throw new WriteError('writeDisabled');
    }
    if (!variable.write) {
      throw new WriteError('notDeclaredWritable', { name });
    }
    if (!variable.resolved) {
      throw new WriteError('notResolved', { name });
    }
    if (!this.connection || this.status.connected !== true) {
      throw new WriteError('notConnected');
    }
    const { type, value } = toWrite({ ...variable, kind: variable.resolvedKind }, input);
    let result;
    try {
      result = await this.connection.write(variable.nodeId, type, value);
    } catch (err) {
      if (err.code === 'notConnected') {
        throw new WriteError('notConnected');
      }
      throw new WriteError('failed', { detail: String(err.message).slice(0, 120) });
    }
    if (!result.good) {
      throw new WriteError('refused', { status: result.name });
    }
    logger.info(`Wrote ${JSON.stringify(value)} to ${name} (${variable.nodeId})`);
    return { variable, name, value };
  }

  // --- Reports ---------------------------------------------------------------

  /** Every problem of the configuration, as multi-language texts. */
  problems() {
    return [
      ...this.configErrors.map((error) => variableError(error)),
      ...this.variables
        .filter((variable) => variable.problem)
        .map((variable) =>
          variableError({ entry: variable.entry, name: variable.name, ...variable.problem }),
        ),
    ];
  }

  /** The current connection message, or null when connected. */
  statusMessage() {
    if (this.status.connected === true) {
      return null;
    }
    return this.status.code ? (STATUS[this.status.code] ?? STATUS.unreachable) : null;
  }

  /** The number of variables in a good state, and the total watched. */
  counts() {
    const watched = this.variables.filter((variable) => variable.resolved);
    return {
      good: watched.filter((variable) => variable.good === true).length,
      total: watched.length,
    };
  }
}
