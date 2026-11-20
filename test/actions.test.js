// -----------------------------------------------------------------------------
// The actions of the Configuration screen and the scene action: a real
// success shows in green (resolved), every failure in red (thrown, with the
// four languages).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';
import { OPC_PLC, OPC_PLC_VARIABLES, S7_1500, S7_1500_VARIABLES } from './fixtures/servers.js';

const failed = (ack) => {
  assert.equal(ack.success, false, JSON.stringify(ack.data));
  for (const lang of ['en', 'fr', 'de', 'es']) {
    assert.equal(typeof ack.error[lang], 'string', `error.${lang}`);
  }
  return ack.error;
};
const succeeded = (ack) => {
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  return ack.data.message;
};

test('browse lists the variables ready to copy', async () => {
  const world = await createWorld({ nodes: OPC_PLC });
  try {
    const message = succeeded(await world.fake.action('browse', {}));
    assert.match(message.en, /^6 variable\(s\), as Name: NodeId \(type, access\):/);
    assert.match(message.en, /\nStepUp: ns=3;s=StepUp \(UInt32, read\/write\)/);
    assert.match(
      message.fr,
      /AlternatingBoolean: ns=3;s=AlternatingBoolean \(Boolean, lecture seule\)/,
    );
  } finally {
    await world.stop();
  }
});

test('browse fails in red on a wrong start node, or a server not connected', async () => {
  const world = await createWorld({ nodes: OPC_PLC });
  try {
    assert.match(
      failed(await world.fake.action('browse', { node: 'Telemetry' })).fr,
      /n'est pas un NodeId/,
    );
    assert.match(
      failed(await world.fake.action('browse', { node: 'ns=9;s=Empty' })).en,
      /No variable found/,
    );
    world.server.drop();
    await world.settle();
    assert.match(
      failed(await world.fake.action('browse', {})).fr,
      /^Le serveur OPC UA n'est pas connecté/,
    );
  } finally {
    await world.stop();
  }
});

test('check_config: green when everything is right, red with the mistakes', async () => {
  const good = await createWorld({ nodes: OPC_PLC, config: { variables: OPC_PLC_VARIABLES } });
  try {
    const message = succeeded(await good.fake.action('check_config', {}));
    assert.match(
      message.fr,
      /Connecté \(sans sécurité\) : 5 variable\(s\) suivie\(s\) sur 5\.\nAucune erreur/,
    );
  } finally {
    await good.stop();
  }
  const bad = await createWorld({
    nodes: OPC_PLC,
    config: { variables: `${OPC_PLC_VARIABLES}; X: ns=3;s=Nope; Y: foo` },
  });
  try {
    const error = failed(await bad.fake.action('check_config', {}));
    assert.match(error.en, /Entry 7 \(Y\): "foo" is not a NodeId/);
    assert.match(error.en, /Entry 6 \(X\): not found on the server/);
  } finally {
    await bad.stop();
  }
  const empty = await createWorld({ nodes: OPC_PLC, config: { variables: '' } });
  try {
    assert.match(
      failed(await empty.fake.action('check_config', {})).en,
      /No variable declared yet/,
    );
  } finally {
    await empty.stop();
  }
  const down = await createWorld({
    nodes: OPC_PLC,
    config: { variables: OPC_PLC_VARIABLES },
    refuse: 'certificate',
  });
  try {
    assert.match(
      failed(await down.fake.action('check_config', {})).en,
      /refuses the Gladys certificate/,
    );
  } finally {
    await down.stop();
  }
});

test('write_value: green on a real write, red on every refusal', async () => {
  const world = await createWorld({
    nodes: S7_1500,
    config: { variables: S7_1500_VARIABLES, allow_write: true },
  });
  try {
    const message = succeeded(
      await world.fake.action('write_value', { variable: 'boiler setpoint', value: '52,5' }),
    );
    assert.equal(message.fr, 'Boiler setpoint : 52.5 écrit.');
    assert.deepEqual(world.server.writes.at(-1), {
      nodeId: 'ns=3;s="Boiler"."Setpoint"',
      type: 'Float',
      value: 52.5,
    });
    succeeded(
      await world.fake.action('write_value', {
        variable: 'ns=3;s="Plant"."Mode"',
        value: 'MANUAL',
      }),
    );
    assert.deepEqual(world.server.writes.at(-1), {
      nodeId: 'ns=3;s="Plant"."Mode"',
      type: 'String',
      value: 'MANUAL',
    });

    assert.match(
      failed(await world.fake.action('write_value', { variable: 'Nope', value: '1' })).en,
      /No declared variable/,
    );
    assert.match(
      failed(await world.fake.action('write_value', { variable: 'Boiler alarm', value: '1' })).fr,
      /n'est pas déclarée « write »/,
    );
    assert.match(
      failed(await world.fake.action('write_value', { variable: 'Circulation pump', value: '7' }))
        .en,
      /expected 0 or 1/,
    );
    assert.match(
      failed(await world.fake.action('write_value', { variable: 'Mode', value: '' })).en,
      /Give the value/,
    );
    world.server.drop();
    await world.settle();
    assert.match(
      failed(await world.fake.action('write_value', { variable: 'Mode', value: 'X' })).en,
      /not connected/,
    );
  } finally {
    await world.stop();
  }
});

test('write_value: refused by the server, or writing off', async () => {
  const nodes = {
    ...S7_1500,
    'ns=3;s="Boiler"."Alarm"': { type: 'Boolean', value: false, writable: false },
  };
  const world = await createWorld({
    nodes,
    config: { variables: 'Alarm: ns=3;s="Boiler"."Alarm" write', allow_write: true },
  });
  try {
    assert.equal(
      world.hub.problems()[0].en,
      'Entry 1 (Alarm): declared "write", but read-only on the server',
    );
    assert.match(
      failed(await world.fake.action('write_value', { variable: 'Alarm', value: '1' })).en,
      /refused the write \(BadUserAccessDenied\)/,
    );
  } finally {
    await world.stop();
  }
  const off = await createWorld({ nodes: S7_1500, config: { variables: S7_1500_VARIABLES } });
  try {
    assert.match(
      failed(await off.fake.action('write_value', { variable: 'Mode', value: 'X' })).en,
      /Writing is off/,
    );
  } finally {
    await off.stop();
  }
});

test('the scene action writes, and fails the action (not the scene) on a refusal', async () => {
  const world = await createWorld({
    nodes: S7_1500,
    config: { variables: S7_1500_VARIABLES, allow_write: true },
  });
  try {
    const ok = await world.fake.sceneAction('write_value', {
      variable: 'Circulation pump',
      value: 'on',
    });
    assert.equal(ok.success, true, JSON.stringify(ok.error));
    assert.deepEqual(world.server.writes.at(-1).value, true);
    const ko = await world.fake.sceneAction('write_value', { variable: 'Energy', value: '1' });
    assert.equal(ko.success, false);
    assert.match(ko.error.fr, /n'est pas déclarée « write »/);
  } finally {
    await world.stop();
  }
});
