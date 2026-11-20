// -----------------------------------------------------------------------------
// The "Variables" field of the configuration: one entry per OPC UA variable,
// separated by semicolons.
//
//   Name: NodeId [kind] [write] [unit=...] [scale=...] [offset=...]
//         [min=...] [max=...] [precision=...]
//
//   Boiler: ns=3;s=Temperature temperature; Pump: ns=2;i=1002 switch
//
// A NodeId has a semicolon of its own ("ns=3;s=..."): a chunk ending with
// "ns=<n>" is glued back to the next one. A NodeId stops at the first space,
// except inside double quotes, kept as they are (Siemens S7-1500 names its
// variables ns=3;s="DB1"."Temperature"). Without "Name:", the variable takes
// its DisplayName on the server.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { resolveNodeId } from 'node-opcua-nodeid';
import { KINDS, unitOfSymbol } from './kinds.js';

export const MAX_VARIABLES = 100;
const MAX_NAME = 40;
const NUMBER_OPTIONS = ['scale', 'offset', 'min', 'max', 'precision'];
const NODE_ID_START = /^(ns=\d+;)?(i|s|g|b)=/;

/** Split the field into entries, gluing the NodeId semicolons back. */
export function splitEntries(text) {
  const chunks = String(text ?? '').split(';');
  const entries = [];
  for (let i = 0; i < chunks.length; i += 1) {
    let chunk = chunks[i];
    while (/(^|[\s:])ns=\d+\s*$/.test(chunk) && i + 1 < chunks.length) {
      i += 1;
      chunk = `${chunk.trimEnd()};${chunks[i].trimStart()}`;
    }
    if (chunk.trim() !== '') {
      entries.push(chunk.trim());
    }
  }
  return entries;
}

/** Words separated by spaces, a double-quoted part staying in its word. */
export function tokenize(text) {
  const tokens = [];
  let current = '';
  let quoted = false;
  for (const char of text) {
    if (char === '"') {
      quoted = !quoted;
    }
    if (!quoted && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

/** The canonical text of a NodeId ("ns=3;s=X", "i=2258"), or null. */
export function canonicalNodeId(text) {
  if (!NODE_ID_START.test(text)) {
    return null;
  }
  try {
    return resolveNodeId(text).toString();
  } catch {
    return null;
  }
}

/** A stable feature key: readable start, and a hash of the exact NodeId. */
export function featureKey(nodeId) {
  const slug = nodeId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
    .replace(/-$/, '');
  const hash = createHash('sha1').update(nodeId).digest('hex').slice(0, 8);
  return `v-${slug}-${hash}`;
}

/**
 * Parse the field.
 * @param {string} text
 * @returns {{ variables: Array<object>, errors: Array<{ entry: number, name?: string, code: string, params?: object }> }}
 */
export function parseVariables(text) {
  const variables = [];
  const errors = [];
  const seen = new Set();
  splitEntries(text).forEach((raw, index) => {
    const entry = index + 1;
    const fail = (code, params = {}, name = undefined) =>
      errors.push({ entry, name, code, params });

    let name = null;
    let rest = raw;
    const colon = raw.indexOf(': ');
    // "Name:ns=3;s=X" (no space) is a common slip: accept it too.
    const tight = raw.match(/^([^:]+?):((ns=\d+;)?(i|s|g|b)=.*)$/);
    if (colon > 0 && !NODE_ID_START.test(raw)) {
      name = raw.slice(0, colon).trim();
      rest = raw.slice(colon + 2);
    } else if (tight && !NODE_ID_START.test(raw)) {
      name = tight[1].trim();
      rest = tight[2];
    } else if (raw.endsWith(':')) {
      fail('noNodeId', {}, raw.slice(0, -1));
      return;
    }
    const [nodeText, ...options] = tokenize(rest);
    if (!nodeText) {
      fail('noNodeId', {}, name);
      return;
    }
    const nodeId = canonicalNodeId(nodeText);
    if (!nodeId) {
      fail('badNodeId', { nodeId: nodeText }, name);
      return;
    }
    if (seen.has(nodeId)) {
      fail('duplicateNodeId', { nodeId }, name);
      return;
    }

    const variable = { entry, name, nodeId, key: featureKey(nodeId), kind: null, write: false };
    let valid = true;
    for (const option of options) {
      const lower = option.toLowerCase();
      if (KINDS[lower]) {
        variable.kind = lower;
        continue;
      }
      if (lower === 'write') {
        variable.write = true;
        continue;
      }
      const match = option.match(/^([a-z]+)=(.+)$/i);
      if (!match) {
        fail('unknownWord', { word: option }, name);
        valid = false;
        continue;
      }
      const key = match[1].toLowerCase();
      const value = match[2];
      if (key === 'unit') {
        const unit = unitOfSymbol(value);
        if (!unit) {
          fail('unknownUnit', { unit: value }, name);
          valid = false;
        } else {
          variable.unit = unit;
        }
      } else if (NUMBER_OPTIONS.includes(key)) {
        const number = Number(value.replace(',', '.'));
        const integerOnly = key === 'precision';
        if (
          !Number.isFinite(number) ||
          (integerOnly && (!Number.isInteger(number) || number < 0 || number > 6)) ||
          (key === 'scale' && number === 0)
        ) {
          fail('badNumber', { option: key, value }, name);
          valid = false;
        } else {
          variable[key] = number;
        }
      } else {
        fail('unknownWord', { word: option }, name);
        valid = false;
      }
    }
    if (!valid) {
      return;
    }
    const kind = variable.kind && KINDS[variable.kind];
    if (kind?.writable) {
      variable.write = true;
    }
    if (variable.unit && kind && !kind.units.includes(variable.unit)) {
      fail('unitOfKind', { unit: variable.unit, kind: variable.kind }, name);
      return;
    }
    if (variable.min !== undefined && variable.max !== undefined && variable.min >= variable.max) {
      fail('minMax', {}, name);
      return;
    }
    if (variables.length >= MAX_VARIABLES) {
      fail('tooMany', { max: MAX_VARIABLES }, name);
      return;
    }
    if (name !== null) {
      variable.name = name.slice(0, MAX_NAME);
    }
    seen.add(nodeId);
    variables.push(variable);
  });
  return { variables, errors };
}

/** Give each variable a distinct name of 40 characters at most. */
export function uniqueNames(names) {
  const used = new Set();
  return names.map((wanted) => {
    let name = wanted.slice(0, MAX_NAME);
    for (let n = 2; used.has(name); n += 1) {
      const suffix = ` ${n}`;
      name = `${wanted.slice(0, MAX_NAME - suffix.length)}${suffix}`;
    }
    used.add(name);
    return name;
  });
}
