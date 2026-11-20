// -----------------------------------------------------------------------------
// A fake OPC UA server behind the connection interface of src/opcua/client.js
// (on('up'|'down'), start, stop, readVariables, monitor, write, browse): the
// tests drive the hub without node-opcua nor network.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';

/**
 * @param {Record<string, { type, value, writable?, displayName?, isArray?, path?, status? }>} nodes
 */
export function createFakeServer(nodes) {
  const server = {
    nodes: new Map(Object.entries(structuredClone(nodes))),
    connections: [],
    refuse: null, // a down code to answer instead of connecting
    writes: [],
    /** The last connection the hub opened. */
    get connection() {
      return server.connections.at(-1);
    },
    /** A value changes on the server: every subscription is told. */
    set(nodeId, value, status = { good: true, name: 'Good' }) {
      const node = server.nodes.get(nodeId);
      node.value = value;
      for (const connection of server.connections) {
        connection.notify(nodeId, { type: node.type, value, status });
      }
    },
    /** The server goes away. */
    drop(code = 'unreachable') {
      server.refuse = code;
      for (const connection of server.connections) {
        if (connection.isUp) {
          connection.isUp = false;
          connection.emit('down', { code, detail: 'fake' });
        }
      }
    },
    /** The server is back. */
    restore() {
      server.refuse = null;
      for (const connection of server.connections) {
        if (connection.started && !connection.isUp) {
          connection.isUp = true;
          connection.emit('up', {});
        }
      }
    },
    createConnection(options) {
      const connection = new FakeConnection(server, options);
      server.connections.push(connection);
      return connection;
    },
  };
  return server;
}

class FakeConnection extends EventEmitter {
  constructor(server, options) {
    super();
    this.server = server;
    this.options = options;
    this.isUp = false;
    this.started = false;
    this.items = [];
    this.onValue = null;
  }

  start() {
    this.started = true;
    if (this.server.refuse) {
      this.emit('down', { code: this.server.refuse, detail: 'fake' });
    } else {
      this.isUp = true;
      this.emit('up', {});
    }
  }

  async stop() {
    this.started = false;
    this.isUp = false;
    this.items = [];
  }

  #require() {
    if (!this.isUp) {
      const err = new Error('not connected');
      err.code = 'notConnected';
      throw err;
    }
  }

  async readVariables(nodeIds) {
    this.#require();
    return nodeIds.map((nodeId) => {
      const node = this.server.nodes.get(nodeId);
      if (!node) {
        return { nodeId, ok: false, status: 'BadNodeIdUnknown' };
      }
      const valueStatus = node.status ?? { good: true, name: 'Good' };
      return {
        nodeId,
        ok: true,
        status: 'Good',
        type: node.type,
        isArray: node.isArray ?? false,
        writable: node.writable ?? false,
        displayName: node.displayName ?? nodeId.split('=').pop(),
        value: valueStatus.good ? node.value : null,
        valueStatus,
      };
    });
  }

  async monitor(items, onValue) {
    this.items = items;
    this.onValue = onValue;
  }

  notify(nodeId, read) {
    if (this.isUp && this.items.some((item) => item.nodeId === nodeId)) {
      this.onValue?.(nodeId, read);
    }
  }

  async write(nodeId, type, value) {
    this.#require();
    const node = this.server.nodes.get(nodeId);
    if (!node?.writable) {
      return { good: false, name: 'BadUserAccessDenied' };
    }
    this.server.writes.push({ nodeId, type, value });
    this.server.set(nodeId, value);
    return { good: true, name: 'Good' };
  }

  async browse(startNodeId, { maxVariables = 60 } = {}) {
    this.#require();
    const variables = [...this.server.nodes.entries()]
      .filter(([, node]) => node.path)
      .filter(
        ([, node]) =>
          startNodeId === 'ns=0;i=85' || node.path.startsWith(startNodeId.split('=').pop()),
      )
      .map(([nodeId, node]) => ({
        nodeId,
        path: node.path,
        type: node.type,
        writable: node.writable ?? false,
        isArray: node.isArray ?? false,
      }));
    return {
      variables: variables.slice(0, maxVariables),
      truncated: variables.length > maxVariables,
    };
  }
}
