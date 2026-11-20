// -----------------------------------------------------------------------------
// Runs the integration against a real OPC UA server, with the SDK's fake
// Gladys: connection, discovery, values by subscription, browse, check, writes.
// Made for the Microsoft OPC PLC simulator (its default nodes); never run by
// `npm test` (tests never touch the network).
//
//   node scripts/live-check.mjs <endpoint> [none|sign|sign_and_encrypt] [user] [password]
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';

const [endpoint, mode = 'none', username = '', password = ''] = process.argv.slice(2);
if (!endpoint) {
  console.error(
    'Usage: node scripts/live-check.mjs <opc.tcp://host:port> [mode] [user] [password]',
  );
  process.exit(2);
}
const gladys = createFakeGladys({
  config: {
    endpoint_url: endpoint,
    security_mode: mode,
    username,
    password,
    interval: '1',
    allow_write: true,
    language: 'en',
    variables:
      'Step: ns=3;s=StepUp write; Slow: ns=3;s=SlowUInt1 write; Alternating: ns=3;s=AlternatingBoolean; ' +
      'Missing: ns=3;s=Nope; ns=3;s=RandomSignedInt32',
  },
});
const app = registerHandlers(gladys, {
  dataDir: process.env.OPCUA_DATA_DIR ?? '/data',
  timers: false,
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (ack) => JSON.stringify(ack.success ? ack.data?.message?.en : ack.error?.en);

await gladys.connect();
for (let i = 0; i < 40 && app.hub.status.connected === null; i += 1) {
  await wait(500);
}
await app.hub.events;
console.log('link:', app.hub.status.connected, app.hub.status.code ?? '');
const [device] = gladys.fake.discoveredDevices;
if (device) {
  await gladys.fake.deviceCreated(device);
  await wait(3000);
  for (const feature of device.features) {
    console.log(
      `${feature.name} (${feature.category}/${feature.type}):`,
      gladys.fake.lastState(feature.external_id),
    );
  }
  console.log(
    'browse:',
    text(await gladys.fake.action('browse', { node: 'ns=3;s=Telemetry' })).slice(0, 300),
  );
  console.log('check:', text(await gladys.fake.action('check_config', {})));
  console.log(
    'write Slow=42:',
    text(await gladys.fake.action('write_value', { variable: 'Slow', value: '42' })),
  );
  console.log(
    'write Slow=-3:',
    text(await gladys.fake.action('write_value', { variable: 'Slow', value: '-3' })),
  );
}
console.log('rss MB:', process.memoryUsage().rss >> 20);
await app.stop();
