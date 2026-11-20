// -----------------------------------------------------------------------------
// The "Variables" field: entries, NodeIds with their own semicolons, Siemens
// quoted names, options and every mistake the user can make.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalNodeId,
  featureKey,
  parseVariables,
  splitEntries,
  tokenize,
  uniqueNames,
} from '../src/variables.js';
import { S7_1500_VARIABLES } from './fixtures/servers.js';

test('entries are split on semicolons, the NodeId semicolon glued back', () => {
  assert.deepEqual(splitEntries('A: ns=3;s=X temperature; B: ns=2;i=1002 switch;; i=2258'), [
    'A: ns=3;s=X temperature',
    'B: ns=2;i=1002 switch',
    'i=2258',
  ]);
  assert.deepEqual(splitEntries('ns=3; s=Spaced'), ['ns=3;s=Spaced']);
  assert.deepEqual(splitEntries(''), []);
});

test('a double-quoted part stays in its word (Siemens S7-1500 names)', () => {
  assert.deepEqual(tokenize('ns=3;s="My DB"."Temp 1" temperature scale=0.1'), [
    'ns=3;s="My DB"."Temp 1"',
    'temperature',
    'scale=0.1',
  ]);
});

test('NodeIds are made canonical, and anything else refused', () => {
  assert.equal(canonicalNodeId('ns=3;s=StepUp'), 'ns=3;s=StepUp');
  assert.equal(canonicalNodeId('i=2258'), 'ns=0;i=2258');
  assert.equal(canonicalNodeId('ns=2;i=1002'), 'ns=2;i=1002');
  assert.equal(canonicalNodeId('ns=3;s="DB1"."Temp"'), 'ns=3;s="DB1"."Temp"');
  assert.equal(canonicalNodeId('Temperature'), null);
  assert.equal(canonicalNodeId('ns=x;s=A'), null);
  assert.equal(canonicalNodeId('ns=2;i=abc'), null);
});

test('feature keys are stable, readable and distinct for close NodeIds', () => {
  assert.equal(featureKey('ns=3;s=StepUp'), featureKey('ns=3;s=StepUp'));
  assert.match(featureKey('ns=3;s=StepUp'), /^v-ns-3-s-stepup-[0-9a-f]{8}$/);
  assert.notEqual(featureKey('ns=3;s="DB1"."Temp"'), featureKey('ns=3;s=DB1.Temp'));
  assert.ok(featureKey(`ns=3;s=${'x'.repeat(300)}`).length <= 45);
});

test('the Siemens example parses entirely', () => {
  const { variables, errors } = parseVariables(S7_1500_VARIABLES);
  assert.deepEqual(errors, []);
  assert.equal(variables.length, 8);
  const pump = variables.find((variable) => variable.name === 'Circulation pump');
  assert.deepEqual(
    { nodeId: pump.nodeId, kind: pump.kind, write: pump.write },
    { nodeId: 'ns=3;s="Boiler"."Pump"', kind: 'switch', write: true },
  );
  const energy = variables.find((variable) => variable.name === 'Energy');
  assert.equal(energy.unit, 'watt-hour');
  const flow = variables.find((variable) => variable.name === 'Flow temperature');
  assert.equal(flow.precision, 1);
  const mode = variables.find((variable) => variable.name === 'Mode');
  assert.deepEqual([mode.kind, mode.write], [null, true]);
});

test('without a name, the variable keeps none (the server display name is used)', () => {
  const { variables } = parseVariables('ns=3;s=StepUp value scale=0,5 offset=-2 min=-10 max=10');
  assert.equal(variables[0].name, null);
  assert.deepEqual(
    [variables[0].scale, variables[0].offset, variables[0].min, variables[0].max],
    [0.5, -2, -10, 10],
  );
});

test('every mistake is reported with its entry', () => {
  const { variables, errors } = parseVariables(
    [
      'A: Temperature',
      'B:',
      'C: ns=3;s=X foo',
      'D: ns=3;s=X',
      'E: ns=3;s=X',
      'F: ns=3;s=Y unit=parsec',
      'G: ns=3;s=Z scale=0',
      'H: ns=3;s=W humidity unit=W',
      'I: ns=3;s=V min=5 max=1',
      'J: ns=3;s=U precision=9',
    ].join('; '),
  );
  assert.deepEqual(
    errors.map((error) => [error.entry, error.code]),
    [
      [1, 'badNodeId'],
      [2, 'noNodeId'],
      [3, 'unknownWord'],
      [5, 'duplicateNodeId'],
      [6, 'unknownUnit'],
      [7, 'badNumber'],
      [8, 'unitOfKind'],
      [9, 'minMax'],
      [10, 'badNumber'],
    ],
  );
  assert.deepEqual(
    variables.map((variable) => variable.name),
    ['D'],
  );
});

test('a hundred variables at most', () => {
  const text = Array.from({ length: 105 }, (_, i) => `ns=2;i=${i + 1}`).join('; ');
  const { variables, errors } = parseVariables(text);
  assert.equal(variables.length, 100);
  assert.deepEqual(new Set(errors.map((error) => error.code)), new Set(['tooMany']));
});

test('names are made distinct and fit 40 characters', () => {
  assert.deepEqual(uniqueNames(['Temp', 'Temp', 'Temp']), ['Temp', 'Temp 2', 'Temp 3']);
  const long = 'x'.repeat(50);
  const [first, second] = uniqueNames([long, long]);
  assert.equal(first.length, 40);
  assert.equal(second.length, 40);
  assert.ok(second.endsWith(' 2'));
});

test('"Name:NodeId" without a space is accepted', () => {
  const { variables, errors } = parseVariables('Pump:ns=3;s=Pump switch; Temp:i=2258');
  assert.deepEqual(errors, []);
  assert.deepEqual(
    variables.map((variable) => [variable.name, variable.nodeId]),
    [
      ['Pump', 'ns=3;s=Pump'],
      ['Temp', 'ns=0;i=2258'],
    ],
  );
});
