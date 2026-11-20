# OPC UA for Gladys Assistant

Read and write the variables of an **OPC UA server** from
[Gladys Assistant](https://gladysassistant.com): PLCs (Siemens S7-1200/1500,
Beckhoff TwinCAT, WAGO, B&R, Schneider), gateways (Kepware, Softing, Unified
Automation) or any OPC UA server of your network.

> **Developed without the hardware: feedback welcome.** It was tested against
> the Microsoft [OPC PLC](https://github.com/Azure-Samples/iot-edge-opc-plc)
> simulator in Docker, not against a real PLC.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Features

- One Gladys device for the server, one feature per declared variable:
  numbers with their unit (temperature, power, energy in kWh…), on/off values,
  texts (strings, localized texts, dates).
- Values pushed by an OPC UA **subscription**, nothing polled; only the
  changes reach Gladys, under its 300 values a minute.
- Security **None**, **Sign** and **Sign & Encrypt** (Basic256Sha256,
  Aes128_Sha256_RsaOaep, Aes256_Sha256_RsaPss), anonymous or user name and
  password; the client certificate is created once and kept in `/data`.
- Automatic reconnection; the device is still published, from a cache, when
  the server is off at startup.
- **Browse the server** lists the variables (NodeId, type, access), ready to
  paste; **Check the configuration** lists the mistakes entry by entry.
- **Writing, off by default**: dashboard on/off inputs and setpoints, a
  "Write a value" button and scene action, for the variables declared `write`.
- Scene triggers: server lost, server back, variable in a bad state.
- An **OPC UA server** dashboard widget.

## Requirements

- Gladys Assistant 5.1 or later.
- An OPC UA server reachable over TCP (`opc.tcp://host:port`) from Gladys,
  with a fixed IP address.

## Installation

In Gladys: **Integrations → Install from GitHub**, then the address of this
repository: `https://github.com/guim31/gladys-opcua`. Enter the server
address, save, browse the server, declare the variables, save again and add
the server from the **Discovery** tab.

## How it works

- `src/opcua/client.js` is the only file that uses
  [node-opcua](https://github.com/node-opcua/node-opcua): connection with
  back-off, session, one subscription with one monitored item per variable,
  read, write, browse. The library transfers the subscription after a lost
  channel; a refused session (password, certificate) is retried every minute.
- `src/hub.js` reads each variable's type and access on connection, builds the
  device, and publishes the latest value of each feature at most every
  sampling interval, slower with many variables (100 variables: every 25 s).
- The variable syntax (`Name: NodeId kind write options`, semicolons) is parsed
  by `src/variables.js`; a NodeId keeps its own semicolon and its Siemens
  double quotes.
- External ids: the device is `server:<host>-<port>` (what the user typed),
  each feature a slug of its NodeId with a hash of it.

## Checked, and what was not

Checked for real, in the locked-down container of the Gladys sandbox
(`--read-only --cap-drop ALL --memory 256m`), against `opc-plc`: browse, read,
subscription, writes (accepted, refused, out of range), security None, Sign and
Sign & Encrypt, user name and password (right and wrong), server stopped then
restarted (triggers, values resumed). Memory at rest: about 105 MB.

Not checked: a real PLC (Siemens, Beckhoff…), its certificate handling, `nsu=`
NodeIds, and a real Gladys instance (the fake Gladys of the SDK was used).

## Limitations

- One server per integration; up to 100 variables.
- Scalars only: numbers, booleans, strings, localized texts, dates. No arrays,
  no structures, no methods, no events or alarms.
- The server certificate is trusted on first use.
- No discovery of servers (no broadcast in the sandbox): type the address.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK
(`@gladysassistant/integration-sdk/testing`) and a fake OPC UA server behind
the connection interface (`test/helpers/fakeOpcua.js`), with the address space
read from `opc-plc` (`test/fixtures/servers.js`). `scripts/live-check.mjs`
runs the integration against a real server:

```bash
docker network create gladys-test-opcua
docker run -d --name gladys-test-opcua-srv --network gladys-test-opcua \
  mcr.microsoft.com/iotedge/opc-plc:latest --pn=50000 --autoaccept --ut --ph=gladys-test-opcua-srv
docker run --rm --network gladys-test-opcua -v "$PWD:/app:ro" -v gladys-test-opcua-data:/data \
  -w /app mirror.gcr.io/library/node:24-alpine \
  node scripts/live-check.mjs opc.tcp://gladys-test-opcua-srv:50000 sign
```

See [`CLAUDE.md`](CLAUDE.md) for the project rules. Releases go through
**Actions → Release** (it bumps `package.json`, the manifest `version` and
`docker_image`, and rolls `CHANGELOG.md`). A hand-pushed `vX.Y.Z` tag only
builds the image: bump `version` in `package.json` and in the manifest (with
the `docker_image` tag) and commit it before tagging.

## Credits

- [node-opcua](https://github.com/node-opcua/node-opcua) by Etienne Rossignon
  and contributors (MIT): the OPC UA client.
- [OPC PLC](https://github.com/Azure-Samples/iot-edge-opc-plc) by Microsoft
  (MIT): the test server; its address space is the base of the fixtures.
- The OPC UA logo of the cover is the OPC Foundation's, taken from its
  [UA-CloudLibrary](https://github.com/OPCFoundation/UA-CloudLibrary)
  repository; OPC UA is a registered trademark of the OPC Foundation.
- The architecture and the conformity tests follow
  [gladys-modbus](https://github.com/guim31/gladys-modbus) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

OPC UA is a standard of the OPC Foundation. This project is not affiliated
with, endorsed or sponsored by the OPC Foundation, Siemens, Beckhoff, WAGO,
B&R, Schneider Electric, PTC (Kepware), Softing or Unified Automation; their
names are trademarks of their owners.

## License

Apache-2.0
