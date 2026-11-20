// -----------------------------------------------------------------------------
// The one place that talks node-opcua. It hides the library behind a small
// connection object, so the rest of the code (and its tests, against a fake
// connection) never sees a secure channel, a session or a subscription.
//
//   const connection = createOpcuaConnection(options)
//   connection.on('up', info) / on('down', { code, detail })
//   connection.start(); connection.stop()
//   connection.readVariables(nodeIds)   type, access, display name, value
//   connection.monitor(items, onValue)  one subscription, rebuilt by the library
//   connection.write(nodeId, type, value)
//   connection.browse(startNodeId, limits)
//
// Life cycle: node-opcua retries the first connection and every lost one by
// itself (connectionStrategy, back-off up to a minute), keeps the session
// alive and transfers the subscription when the channel comes back. What it
// does not retry is a session refused (wrong password, certificate not
// trusted yet): this file closes the client and tries again later, slowly.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { coerceInt64, coerceUInt64 } from 'node-opcua-basic-types';
import { OPCUACertificateManager } from 'node-opcua-certificate-manager';
import { setErrorLogger, setWarningLogger } from 'node-opcua-debug';
import {
  AttributeIds,
  BrowseDirection,
  DataType,
  MessageSecurityMode,
  NodeClass,
  OPCUAClient,
  SecurityPolicy,
  TimestampsToReturn,
  UserTokenType,
} from 'node-opcua-client';

const logger = createLogger({ name: 'opcua-client' });

// node-opcua prints its warnings and errors straight to the console, whole
// messages over dozens of lines (a publish answered after the session closed,
// a keep-alive late). The life cycle this file reports is what the user needs:
// the library's own lines go to debug, one line each, without colors.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const toDebug = (...args) =>
  logger.debug(args.map(String).join(' ').replace(ANSI, '').split('\n')[0].slice(0, 300));
setErrorLogger(toDebug);
setWarningLogger(toDebug);

export const SECURITY_MODES = {
  none: MessageSecurityMode.None,
  sign: MessageSecurityMode.Sign,
  sign_and_encrypt: MessageSecurityMode.SignAndEncrypt,
};
export const SECURITY_POLICIES = {
  basic256sha256: SecurityPolicy.Basic256Sha256,
  aes128_sha256_rsaoaep: SecurityPolicy.Aes128_Sha256_RsaOaep,
  aes256_sha256_rsapss: SecurityPolicy.Aes256_Sha256_RsaPss,
};

// Built-in types of the DataType attribute (namespace 0), for a variable
// whose value is not readable yet.
const BUILT_IN = {
  1: 'Boolean',
  2: 'SByte',
  3: 'Byte',
  4: 'Int16',
  5: 'UInt16',
  6: 'Int32',
  7: 'UInt32',
  8: 'Int64',
  9: 'UInt64',
  10: 'Float',
  11: 'Double',
  12: 'String',
  13: 'DateTime',
  14: 'Guid',
  15: 'ByteString',
  20: 'QualifiedName',
  21: 'LocalizedText',
  26: 'Double', // Number
  27: 'Int64', // Integer
  28: 'UInt64', // UInteger
  29: 'Int32', // Enumeration
};

const SESSION_RETRY_MS = 60_000;
const APPLICATION_URI = 'urn:gladys-opcua:client';

/** Sort a node-opcua error into a code of messages.js. */
export function errorCode(err) {
  const text = `${err?.message ?? err}`;
  if (/BadUserAccessDenied|BadIdentityTokenRejected|BadIdentityTokenInvalid/.test(text)) {
    return 'accessDenied';
  }
  if (/BadSecurityChecksFailed|BadCertificate|BadSecurityPolicyRejected/.test(text)) {
    return 'certificate';
  }
  if (/endpoint|BadSecurityModeRejected|BadTcpEndpointUrlInvalid/i.test(text)) {
    return 'endpoint';
  }
  if (/ENOTFOUND|EAI_AGAIN/.test(text)) {
    return 'unknownHost';
  }
  return 'unreachable';
}

/** The statusCode of node-opcua as { good, name }. */
function status(statusCode) {
  return { good: statusCode?.isGood?.() ?? false, name: statusCode?.name ?? 'Bad' };
}

/**
 * @param {object} options
 * @param {string} options.endpointUrl opc.tcp://host:port[/path]
 * @param {'none'|'sign'|'sign_and_encrypt'} options.securityMode
 * @param {string} options.securityPolicy key of SECURITY_POLICIES
 * @param {string} [options.userName]
 * @param {string} [options.password]
 * @param {string} options.dataDir where the client certificate lives (/data)
 * @param {number} options.publishingInterval ms
 */
export function createOpcuaConnection(options) {
  return new OpcuaConnection(options);
}

class OpcuaConnection extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.client = null;
    this.session = null;
    this.subscription = null;
    this.items = [];
    this.onValue = null;
    this.stopped = false;
    this.up = false;
    this.retryTimer = null;
    this.generation = 0;
  }

  start() {
    this.stopped = false;
    this.#open().catch((err) => this.#down(err));
  }

  async stop() {
    this.stopped = true;
    this.generation += 1;
    clearTimeout(this.retryTimer);
    await this.#close();
  }

  async #certificateManager() {
    const rootFolder = join(this.options.dataDir, 'pki');
    await mkdir(rootFolder, { recursive: true });
    const manager = new OPCUACertificateManager({
      rootFolder,
      // Trust on first use: the server certificate is accepted and kept in
      // pki/trusted. Gladys has no screen to approve it by hand.
      automaticallyAcceptUnknownCertificate: true,
    });
    await manager.initialize();
    return manager;
  }

  async #open() {
    const generation = ++this.generation;
    const { endpointUrl, securityMode, securityPolicy, userName, password } = this.options;
    const secure = securityMode !== 'none';
    const client = OPCUAClient.create({
      applicationName: 'Gladys Assistant OPC UA',
      applicationUri: APPLICATION_URI,
      clientCertificateManager: await this.#certificateManager(),
      securityMode: SECURITY_MODES[securityMode],
      securityPolicy: secure ? SECURITY_POLICIES[securityPolicy] : SecurityPolicy.None,
      // Many PLCs advertise their own host name or another IP in their
      // endpoints: connect to the address the user typed anyway.
      endpointMustExist: false,
      keepSessionAlive: true,
      requestedSessionTimeout: 60_000,
      connectionStrategy: {
        maxRetry: -1,
        initialDelay: 2000,
        maxDelay: 60_000,
        randomisationFactor: 0.2,
      },
    });
    if (generation !== this.generation) {
      return;
    }
    this.client = client;
    client.on('backoff', (retry) => {
      if (retry === 0 || this.up) {
        this.#down(new Error('unreachable'));
      }
    });
    client.on('connection_lost', () => this.#down(new Error('connection lost')));
    client.on('connection_reestablished', () => this.#up());

    await client.connect(endpointUrl);
    if (generation !== this.generation) {
      return;
    }
    const identity = userName
      ? { type: UserTokenType.UserName, userName, password: password ?? '' }
      : { type: UserTokenType.Anonymous };
    try {
      this.session = await client.createSession(identity);
    } catch (err) {
      // A refused session is not retried by node-opcua: start over later.
      await this.#close();
      this.#down(err);
      this.#retryLater(generation);
      return;
    }
    this.session.on('session_closed', () => this.#down(new Error('session closed')));
    // The hub answers 'up' by reading the variables and calling monitor().
    this.#up();
  }

  #retryLater(generation) {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (!this.stopped && generation === this.generation) {
        this.#open().catch((err) => this.#down(err));
      }
    }, SESSION_RETRY_MS);
    this.retryTimer.unref?.();
  }

  async #close() {
    const { client, session, subscription } = this;
    this.client = null;
    this.session = null;
    this.subscription = null;
    this.up = false;
    try {
      // Terminate first: pending publish requests answered after the session
      // closed make node-opcua print whole messages on the console.
      await subscription?.terminate();
    } catch {
      // Gone with the channel.
    }
    try {
      await session?.close();
    } catch {
      // The channel may already be gone.
    }
    try {
      await client?.disconnect();
    } catch {
      // Same.
    }
  }

  #up() {
    if (this.stopped || !this.session) {
      return;
    }
    this.up = true;
    this.emit('up', {
      securityMode: this.options.securityMode,
      securityPolicy: this.options.securityMode === 'none' ? null : this.options.securityPolicy,
    });
  }

  #down(err) {
    if (this.stopped) {
      return;
    }
    this.up = false;
    const code = errorCode(err);
    logger.debug(`OPC UA link down (${code}): ${err?.message ?? err}`);
    this.emit('down', {
      code,
      detail: String(err?.message ?? err)
        .split('\n')[0]
        .slice(0, 200),
    });
  }

  #requireSession() {
    if (!this.session || !this.up) {
      const err = new Error('not connected');
      err.code = 'notConnected';
      throw err;
    }
    return this.session;
  }

  /**
   * Type, access and value of variables.
   * @param {string[]} nodeIds
   * @returns {Promise<Array<{ nodeId, ok, status, type, isArray, writable, displayName, value }>>}
   */
  async readVariables(nodeIds) {
    const session = this.#requireSession();
    const attributes = [
      AttributeIds.NodeClass,
      AttributeIds.Value,
      AttributeIds.DataType,
      AttributeIds.ValueRank,
      AttributeIds.UserAccessLevel,
      AttributeIds.DisplayName,
    ];
    const results = [];
    // Read in batches: some PLCs cap the operations of one request.
    for (let start = 0; start < nodeIds.length; start += 20) {
      const batch = nodeIds.slice(start, start + 20);
      const values = await session.read(
        batch.flatMap((nodeId) => attributes.map((attributeId) => ({ nodeId, attributeId }))),
      );
      batch.forEach((nodeId, index) => {
        const [nodeClass, value, dataType, valueRank, access, displayName] = values.slice(
          index * attributes.length,
          (index + 1) * attributes.length,
        );
        const found = status(nodeClass.statusCode).good;
        const isVariable = found && nodeClass.value.value === NodeClass.Variable;
        const typeId = dataType.value?.value;
        const variantType = value.value?.dataType;
        const type =
          variantType && variantType !== DataType.Null
            ? DataType[variantType]
            : typeId?.namespace === 0
              ? (BUILT_IN[typeId.value] ?? null)
              : null;
        results.push({
          nodeId,
          ok: isVariable,
          status: !found ? status(nodeClass.statusCode).name : isVariable ? 'Good' : 'NotAVariable',
          type,
          isArray: (valueRank.value?.value ?? -1) >= 0 || value.value?.arrayType > 0,
          writable: ((access.value?.value ?? 0) & 0x02) !== 0,
          displayName: displayName.value?.value?.text ?? null,
          value: status(value.statusCode).good ? value.value?.value : null,
          valueStatus: status(value.statusCode),
        });
      });
    }
    return results;
  }

  /**
   * Watch variables: one subscription, one monitored item per variable.
   * Kept across reconnections; called again with a new list, it rebuilds.
   * @param {Array<{ nodeId: string }>} items
   * @param {(nodeId: string, read: { type, value, status }) => void} onValue
   */
  async monitor(items, onValue) {
    this.items = items;
    this.onValue = onValue;
    if (this.session && this.up) {
      await this.#subscribe();
    }
  }

  async #subscribe() {
    const old = this.subscription;
    this.subscription = null;
    try {
      await old?.terminate();
    } catch {
      // Gone with the old session.
    }
    if (this.items.length === 0) {
      return;
    }
    const interval = this.options.publishingInterval;
    const subscription = await this.session.createSubscription2({
      requestedPublishingInterval: interval,
      requestedMaxKeepAliveCount: 10,
      requestedLifetimeCount: 60,
      maxNotificationsPerPublish: 0,
      publishingEnabled: true,
      priority: 1,
    });
    this.subscription = subscription;
    for (const { nodeId } of this.items) {
      const item = await subscription.monitor(
        { nodeId, attributeId: AttributeIds.Value },
        { samplingInterval: interval, queueSize: 1, discardOldest: true },
        TimestampsToReturn.Neither,
      );
      item.on('changed', (dataValue) => {
        this.onValue?.(nodeId, {
          type: DataType[dataValue.value?.dataType] ?? null,
          value: dataValue.value?.value,
          status: status(dataValue.statusCode),
        });
      });
      item.on('err', (message) => {
        this.onValue?.(nodeId, {
          type: null,
          value: null,
          status: { good: false, name: String(message).slice(0, 60) },
        });
      });
    }
  }

  /**
   * Write a value.
   * @returns {Promise<{ good: boolean, name: string }>}
   */
  async write(nodeId, type, value) {
    const session = this.#requireSession();
    let encoded = value;
    if (type === 'Int64') {
      encoded = coerceInt64(value);
    } else if (type === 'UInt64') {
      encoded = coerceUInt64(value);
    }
    const statusCode = await session.write({
      nodeId,
      attributeId: AttributeIds.Value,
      value: { value: { dataType: DataType[type], value: encoded } },
    });
    return status(statusCode);
  }

  /**
   * The variables under a node, flat: depth first, through the hierarchical
   * references, objects and folders crossed, the server's own diagnostics
   * (namespace 0 under Objects/Server) skipped unless asked.
   * @returns {Promise<{ variables: Array<{ nodeId, path, type, writable }>, truncated: boolean }>}
   */
  async browse(startNodeId, { maxDepth = 6, maxVariables = 60, maxNodes = 2000 } = {}) {
    const session = this.#requireSession();
    const found = [];
    const visited = new Set([startNodeId]);
    let truncated = false;
    let browsed = 0;
    const queue = [{ nodeId: startNodeId, path: '', depth: 0 }];
    while (queue.length > 0) {
      const { nodeId, path, depth } = queue.shift();
      browsed += 1;
      if (browsed > maxNodes) {
        truncated = true;
        break;
      }
      const result = await session.browse({
        nodeId,
        browseDirection: BrowseDirection.Forward,
        referenceTypeId: 'HierarchicalReferences',
        includeSubtypes: true,
        nodeClassMask: NodeClass.Object | NodeClass.Variable,
        resultMask: 63,
      });
      for (const reference of result.references ?? []) {
        const childId = reference.nodeId.toString();
        if (visited.has(childId)) {
          continue;
        }
        visited.add(childId);
        const name = reference.displayName?.text || reference.browseName?.name || childId;
        const childPath = path ? `${path}/${name}` : name;
        if (childId === 'ns=0;i=2253' || childId === 'i=2253') {
          continue; // Objects/Server: diagnostics, not process values
        }
        if (reference.nodeClass === NodeClass.Variable) {
          if (found.length >= maxVariables) {
            truncated = true;
            continue;
          }
          found.push({ nodeId: childId, path: childPath });
        }
        if (depth + 1 < maxDepth) {
          queue.push({ nodeId: childId, path: childPath, depth: depth + 1 });
        }
      }
      if (found.length >= maxVariables && truncated) {
        break;
      }
    }
    const details = found.length > 0 ? await this.readVariables(found.map((v) => v.nodeId)) : [];
    return {
      variables: found.map((variable, index) => ({
        ...variable,
        type: details[index]?.type ?? null,
        writable: details[index]?.writable ?? false,
        isArray: details[index]?.isArray ?? false,
      })),
      truncated,
    };
  }
}
