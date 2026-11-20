// -----------------------------------------------------------------------------
// The hub against a fake OPC UA server: discovery, values by subscription,
// rate, cache across restarts, link loss and return, bad statuses, writes,
// quiet logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { captureLogs, createWorld } from './helpers/world.js';
import { OPC_PLC, OPC_PLC_VARIABLES, S7_1500, S7_1500_VARIABLES } from './fixtures/servers.js';

const opcPlc = (config = {}) =>
  createWorld({ nodes: OPC_PLC, config: { variables: OPC_PLC_VARIABLES, ...config } });

test('one device for the server, one feature per variable, the values published on creation', async () => {
  const world = await opcPlc();
  try {
    const { device } = world;
    assert.equal(device.name, 'OPC UA 192.0.2.10');
    assert.equal(device.external_id, 'ext:test-integration:server:192.0.2.10-4840');
    assert.equal(device.should_poll, false);
    assert.deepEqual(
      device.features.map((feature) => [feature.name, feature.category, feature.type]),
      [
        ['Step', 'unknown', 'unknown'],
        ['Slow', 'unknown', 'unknown'],
        ['Alternating', 'input', 'binary'],
        ['RandomSignedInt32', 'unknown', 'unknown'], // its display name
        ['Boiler', 'temperature-sensor', 'decimal'],
      ],
    );
    assert.equal(world.state('Step'), 144);
    assert.equal(world.state('Alternating'), 0);
    assert.equal(world.state('Boiler'), 46.7);
    assert.deepEqual(world.fake.connectionStatus, { connected: true });
    assert.deepEqual(world.fake.transports.at(-1), {
      device_external_id: device.external_id,
      transport: 'local',
    });
  } finally {
    await world.stop();
  }
});

test('nothing is published for a device not added to Gladys yet', async () => {
  const world = await createWorld({
    nodes: OPC_PLC,
    config: { variables: OPC_PLC_VARIABLES },
    createAll: false,
  });
  try {
    world.server.set('ns=3;s=StepUp', 145);
    await world.hub.flush();
    assert.equal(world.fake.states.length, 0);
    await world.createDevices();
    await world.settle();
    assert.equal(world.state('Step'), 145);
  } finally {
    await world.stop();
  }
});

test('a change by subscription is published, an unchanged value is not', async () => {
  const world = await opcPlc();
  try {
    const before = world.fake.states.length;
    world.server.set('ns=3;s=StepUp', 200);
    world.server.set('ns=3;s=StepUp', 201);
    world.server.set('ns=3;s=AlternatingBoolean', false);
    await world.hub.flush();
    assert.equal(world.state('Step'), 201);
    assert.equal(world.fake.states.length, before + 1, 'only the last value, only what changed');
  } finally {
    await world.stop();
  }
});

test('the flush slows down with many variables, to stay under 300 states a minute', async () => {
  const nodes = Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [`ns=2;i=${i + 1}`, { type: 'Double', value: i }]),
  );
  const variables = Object.keys(nodes).join('; ');
  const world = await createWorld({ nodes, config: { variables, interval: '1' } });
  try {
    assert.equal(world.hub.flushPeriodMs(), 25_000); // 100 variables × 4 per minute = 240
    assert.ok((100 * 60_000) / world.hub.flushPeriodMs() <= 300);
  } finally {
    await world.stop();
  }
  const small = await opcPlc({ interval: '5' });
  try {
    assert.equal(small.hub.flushPeriodMs(), 5000);
  } finally {
    await small.stop();
  }
});

test('the Siemens server: every type mapped, texts, energy in kWh, writable controls', async () => {
  const world = await createWorld({
    nodes: S7_1500,
    config: { variables: S7_1500_VARIABLES, allow_write: true },
  });
  try {
    assert.equal(world.state('Flow temperature'), 61.3);
    assert.equal(world.state('Energy'), 12345.678);
    assert.equal(world.feature('Energy').unit, 'kilowatt-hour');
    assert.equal(world.state('Grid power'), -1520);
    assert.equal(world.state('Circulation pump'), 1);
    assert.equal(world.fake.lastState(world.feature('Mode').external_id), 'AUTO');
    const writable = world.device.features.filter((f) => !f.read_only).map((f) => f.name);
    assert.deepEqual(writable, ['Boiler setpoint', 'Circulation pump']);
  } finally {
    await world.stop();
  }
});

test('a variable missing on the server, an array or a structure is left out and reported', async () => {
  const world = await createWorld({
    nodes: S7_1500,
    config: {
      variables:
        'A: ns=3;s="Boiler"."Pump"; B: ns=3;s="Nope"; C: ns=3;s="Plant"."Pressures"; D: ns=3;s="Plant"."Recipe"',
    },
  });
  try {
    assert.deepEqual(
      world.device.features.map((f) => f.name),
      ['A'],
    );
    assert.deepEqual(
      world.hub.problems().map((problem) => problem.en),
      [
        'Entry 2 (B): not found on the server (BadNodeIdUnknown)',
        'Entry 3 (C): an array: not supported',
        'Entry 4 (D): type ExtensionObject not supported (numbers, booleans and texts only)',
      ],
    );
  } finally {
    await world.stop();
  }
});

test('a restart with the server off publishes the same device, from the cache', async () => {
  const store = new MemoryStore();
  const first = await createWorld({
    nodes: OPC_PLC,
    config: { variables: OPC_PLC_VARIABLES },
    store,
  });
  const device = first.device;
  await first.stop();
  const second = await createWorld({
    nodes: OPC_PLC,
    config: { variables: OPC_PLC_VARIABLES },
    store,
    refuse: 'unreachable',
    createAll: false,
  });
  try {
    assert.deepEqual(second.device, device);
    assert.equal(second.fake.connectionStatus.connected, false);
    assert.equal(
      second.fake.connectionStatus.message.fr.startsWith('Le serveur OPC UA ne répond pas'),
      true,
    );
  } finally {
    await second.stop();
  }
});

test('losing and getting back the server fires the triggers once each, and resumes the values', async () => {
  const world = await opcPlc();
  try {
    world.server.drop('unreachable');
    world.server.drop('unreachable');
    await world.settle();
    assert.equal(world.fake.connectionStatus.connected, false);
    assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
    world.server.restore();
    await world.settle();
    assert.deepEqual(
      world.fake.sceneEvents.map((event) => event.key),
      ['server_disconnected', 'server_reconnected'],
    );
    const [lost] = world.fake.sceneEvents;
    assert.equal(lost.data.device, world.device.external_id);
    assert.equal(lost.data.device_name, 'OPC UA 192.0.2.10');
    assert.match(lost.data.error, /^Le serveur OPC UA ne répond pas/);
    assert.equal(world.fake.connectionStatus.connected, true);
    world.server.set('ns=3;s=StepUp', 999);
    await world.hub.flush();
    assert.equal(world.state('Step'), 999);
  } finally {
    await world.stop();
  }
});

test('a refused password is said in the connection status, without trigger', async () => {
  const world = await createWorld({
    nodes: OPC_PLC,
    config: { variables: OPC_PLC_VARIABLES, username: 'user1', password: 'wrong' },
    refuse: 'accessDenied',
  });
  try {
    assert.equal(world.fake.connectionStatus.connected, false);
    assert.match(world.fake.connectionStatus.message.en, /refuses the user name or password/);
    assert.equal(typeof world.fake.connectionStatus.message.de, 'string');
    assert.deepEqual(world.fake.sceneEvents, []);
  } finally {
    await world.stop();
  }
});

test('a bad status fires the trigger once, until the variable is good again', async () => {
  const world = await opcPlc();
  try {
    const bad = { good: false, name: 'BadSensorFailure' };
    world.server.set('ns=3;s=StepUp', null, bad);
    world.server.set('ns=3;s=StepUp', null, bad);
    assert.deepEqual(
      world.fake.sceneEvents.map((event) => event.key),
      ['variable_bad_status'],
    );
    assert.equal(world.fake.sceneEvents[0].data.variable_name, 'Step');
    assert.equal(world.fake.sceneEvents[0].data.status, 'BadSensorFailure');
    assert.deepEqual(world.hub.counts(), { good: 4, total: 5 });
    world.server.set('ns=3;s=StepUp', 3);
    world.server.set('ns=3;s=StepUp', null, bad);
    assert.equal(world.fake.sceneEvents.length, 2);
  } finally {
    await world.stop();
  }
});

test('the dashboard switch writes the variable, only when writing is allowed', async () => {
  const off = await createWorld({ nodes: S7_1500, config: { variables: S7_1500_VARIABLES } });
  try {
    const pump = off.feature('Circulation pump');
    assert.equal(pump.read_only, true);
    const ack = await off.fake.setValue(off.device, pump, 0);
    assert.equal(ack.success, false);
    assert.match(ack.error.fr, /L'écriture est désactivée/);
    assert.deepEqual(off.server.writes, []);
  } finally {
    await off.stop();
  }
  const on = await createWorld({
    nodes: S7_1500,
    config: { variables: S7_1500_VARIABLES, allow_write: true },
  });
  try {
    const ack = await on.fake.setValue(on.device, on.feature('Circulation pump'), 0);
    assert.equal(ack.success, true, JSON.stringify(ack.error));
    assert.deepEqual(on.server.writes, [
      { nodeId: 'ns=3;s="Boiler"."Pump"', type: 'Boolean', value: false },
    ]);
    await on.hub.flush();
    assert.equal(on.state('Circulation pump'), 0);
    const setpoint = await on.fake.setValue(on.device, on.feature('Boiler setpoint'), 48.5);
    assert.equal(setpoint.success, true);
    assert.deepEqual(on.server.writes.at(-1), {
      nodeId: 'ns=3;s="Boiler"."Setpoint"',
      type: 'Float',
      value: 48.5,
    });
  } finally {
    await on.stop();
  }
});

test('a normal cycle writes nothing at the info level', async (t) => {
  const world = await opcPlc();
  try {
    const lines = await captureLogs(t, async () => {
      for (let i = 0; i < 5; i += 1) {
        world.server.set('ns=3;s=StepUp', 300 + i);
        await world.hub.flush();
      }
      await world.fake.widgetGet('server_overview', {
        settings: { device: world.device.external_id },
      });
    });
    assert.deepEqual(lines, []);
  } finally {
    await world.stop();
  }
});

test('no address: the status asks for it, and nothing is discovered', async () => {
  const world = await createWorld({ nodes: OPC_PLC, config: { endpoint_url: '' } });
  try {
    assert.deepEqual(world.fake.discoveredDevices, []);
    assert.match(world.fake.connectionStatus.message.en, /Enter the address/);
    await world.fake.configUpdated({ endpoint_url: 'http://192.0.2.10' });
    assert.match(world.fake.connectionStatus.message.en, /must start with opc.tcp/);
    await world.fake.configUpdated({
      endpoint_url: 'opc.tcp://192.0.2.10:4840',
      variables: OPC_PLC_VARIABLES,
    });
    await world.settle();
    assert.equal(world.fake.discoveredDevices.length, 1);
  } finally {
    await world.stop();
  }
});
