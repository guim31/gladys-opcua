// -----------------------------------------------------------------------------
// The "OPC UA server" widget: valid for the core, tiles bound to features
// that exist, link health in the status rows.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createWorld } from './helpers/world.js';
import { OPC_PLC, OPC_PLC_VARIABLES } from './fixtures/servers.js';

test('the widget shows the values and the link, within the core budget', async () => {
  const world = await createWorld({ nodes: OPC_PLC, config: { variables: OPC_PLC_VARIABLES } });
  try {
    const ack = await world.fake.widgetGet('server_overview', {
      settings: { device: world.device.external_id },
      language: 'fr',
    });
    assert.equal(ack.success, true, JSON.stringify(ack.error));
    const { content } = ack.data;
    validateWidgetContent(content);
    assert.ok(content.components.length <= 8);
    const ids = new Set(world.device.features.map((feature) => feature.external_id));
    const tiles = content.components.filter((component) => component.type === 'value');
    assert.equal(tiles.length, 5);
    for (const tile of tiles) {
      assert.ok(ids.has(tile.device_feature), tile.device_feature);
    }
    const status = content.components.at(-1);
    assert.deepEqual(
      status.items.map((item) => item.value),
      ['Connecté', 'Aucune', '5/5', status.items[3].value],
    );
    assert.match(status.items[3].value, /^\d{2}:\d{2}:\d{2}$/);

    world.server.drop();
    await world.settle();
    const down = await world.fake.widgetGet('server_overview', {
      settings: { device: world.device.external_id },
      language: 'en',
    });
    assert.equal(down.data.content.components.at(-1).items[0].value, 'Disconnected');
    assert.ok(world.fake.widgetRefreshes.length > 0);
  } finally {
    await world.stop();
  }
});

test('without a server chosen, or a server no longer configured, the widget says it', async () => {
  const world = await createWorld({ nodes: OPC_PLC, config: { variables: OPC_PLC_VARIABLES } });
  try {
    const none = await world.fake.widgetGet('server_overview', { settings: {}, language: 'de' });
    validateWidgetContent(none.data.content);
    assert.match(none.data.content.components[0].text.de, /Wähle den OPC-UA-Server/);
    const gone = await world.fake.widgetGet('server_overview', {
      settings: { device: 'ext:test-integration:server:x' },
    });
    assert.match(gone.data.content.components[0].text.en, /no longer/);
  } finally {
    await world.stop();
  }
});
