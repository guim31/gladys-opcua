# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-20

### Added

- Read the variables of an OPC UA server (PLCs, gateways): one Gladys device
  for the server, one feature per declared variable (numbers with their unit,
  on/off values, texts), updated by subscription.
- Security None, Sign and Sign & Encrypt (Basic256Sha256,
  Aes128_Sha256_RsaOaep, Aes256_Sha256_RsaPss), anonymous or user name and
  password, with a client certificate created once and kept in `/data`.
- Automatic reconnection, and a device still published with the server off.
- "Browse the server" lists the variables with their NodeId, type and access;
  "Check the configuration" lists the mistakes entry by entry.
- Writing, off by default: dashboard on/off inputs and setpoints, a "Write a
  value" button and scene action, for the variables declared `write` only.
- Scene triggers: server lost, server back, variable in a bad state.
- "OPC UA server" dashboard widget.
- Documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-opcua/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-opcua/releases/tag/v1.0.0
