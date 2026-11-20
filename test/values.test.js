// -----------------------------------------------------------------------------
// OPC UA values to Gladys states, and back for the writes.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WriteError, resolveKind, toState, toWrite } from '../src/values.js';

const v = (kind, extra = {}) => ({ kind, ...extra });

test('the kind follows the type when none is declared', () => {
  assert.deepEqual(resolveKind({ kind: null }, 'Boolean'), { kind: 'binary' });
  assert.deepEqual(resolveKind({ kind: null, write: true }, 'Boolean'), { kind: 'switch' });
  assert.deepEqual(resolveKind({ kind: null }, 'Double'), { kind: 'value' });
  assert.deepEqual(resolveKind({ kind: null }, 'String'), { kind: 'text' });
  assert.deepEqual(resolveKind({ kind: null }, 'DateTime'), { kind: 'text' });
  assert.deepEqual(resolveKind({ kind: null }, 'Float', true), { code: 'arrayType' });
  assert.deepEqual(resolveKind({ kind: null }, 'ExtensionObject'), { code: 'unsupportedType' });
  assert.deepEqual(resolveKind({ kind: null }, null), { code: 'unsupportedType' });
});

test('a declared kind must fit the type', () => {
  assert.deepEqual(resolveKind({ kind: 'temperature' }, 'Float'), { kind: 'temperature' });
  assert.deepEqual(resolveKind({ kind: 'binary' }, 'Int16'), { kind: 'binary' });
  assert.deepEqual(resolveKind({ kind: 'text' }, 'Double'), { kind: 'text' });
  assert.deepEqual(resolveKind({ kind: 'temperature' }, 'String'), { code: 'kindOfType' });
  assert.deepEqual(resolveKind({ kind: 'temperature' }, 'Boolean'), { code: 'kindOfType' });
});

test('numbers: scale, offset, float noise, 64-bit integers, energy in kWh', () => {
  assert.equal(toState(v('temperature'), { type: 'Float', value: 61.29999923706055 }), 61.3);
  assert.equal(
    toState(v('value', { scale: 0.1, offset: -5 }), { type: 'Int16', value: 235 }),
    18.5,
  );
  assert.equal(toState(v('value', { precision: 0 }), { type: 'Double', value: 2.6 }), 3);
  assert.equal(toState(v('value'), { type: 'UInt64', value: [1, 5] }), 4294967301);
  assert.equal(toState(v('value'), { type: 'Int64', value: [0xffffffff, 0xfffffffe] }), -2);
  assert.equal(
    toState(v('energy', { unit: 'watt-hour' }), { type: 'UInt64', value: [0, 12345678] }),
    12345.678,
  );
  assert.equal(toState(v('value'), { type: 'Double', value: Number.NaN }), null);
  assert.equal(toState(v('value'), { type: 'Double', value: null }), null);
});

test('booleans are 0/1, and an integer read as on/off', () => {
  assert.equal(toState(v('binary'), { type: 'Boolean', value: true }), 1);
  assert.equal(toState(v('switch'), { type: 'Boolean', value: false }), 0);
  assert.equal(toState(v('binary'), { type: 'UInt16', value: 4 }), 1);
  assert.equal(toState(v('value'), { type: 'Boolean', value: true }), 1);
});

test('texts: strings, localized texts, dates; never empty', () => {
  assert.deepEqual(toState(v('text'), { type: 'String', value: ' AUTO ' }), { text: 'AUTO' });
  assert.deepEqual(
    toState(v('text'), { type: 'LocalizedText', value: { text: 'Running', locale: 'en' } }),
    {
      text: 'Running',
    },
  );
  assert.deepEqual(
    toState(v('text'), { type: 'DateTime', value: new Date('2026-11-19T06:00:00Z') }),
    {
      text: '2026-11-19T06:00:00.000Z',
    },
  );
  assert.equal(toState(v('text'), { type: 'String', value: '' }), null);
  assert.equal(toState(v('text'), { type: 'String', value: 'x'.repeat(300) }).text.length, 255);
});

const write = (variable, input) => toWrite({ kind: 'value', ...variable }, input);

test('writes: numbers back through scale and offset, rounded and checked for integers', () => {
  assert.deepEqual(write({ type: 'Int16', scale: 0.1 }, 21.5), { type: 'Int16', value: 215 });
  assert.deepEqual(write({ type: 'Float' }, '19,5'), { type: 'Float', value: 19.5 });
  assert.deepEqual(write({ type: 'UInt32' }, '42'), { type: 'UInt32', value: 42 });
  assert.deepEqual(write({ type: 'Double', kind: 'energy', unit: 'watt-hour' }, 2), {
    type: 'Double',
    value: 2000,
  });
  assert.throws(
    () => write({ type: 'UInt32' }, -3),
    (err) => err instanceof WriteError && err.code === 'outOfRange',
  );
  assert.throws(() => write({ type: 'SByte' }, 200), { code: 'outOfRange' });
  assert.throws(() => write({ type: 'Int16' }, 'abc'), { code: 'notANumber' });
  assert.throws(() => write({ type: 'Int16' }, ''), { code: 'notANumber' });
});

test('writes: booleans from 0/1, true/false, on/off', () => {
  assert.deepEqual(write({ type: 'Boolean', kind: 'switch' }, 1), { type: 'Boolean', value: true });
  assert.deepEqual(write({ type: 'Boolean', kind: 'switch' }, 'off'), {
    type: 'Boolean',
    value: false,
  });
  assert.deepEqual(write({ type: 'Byte', kind: 'switch' }, 'true'), { type: 'Byte', value: 1 });
  assert.throws(() => write({ type: 'Boolean', kind: 'switch' }, 2), { code: 'notBoolean' });
});

test('writes: strings as they are, other types refused', () => {
  assert.deepEqual(write({ type: 'String', kind: 'text' }, 'MANUAL'), {
    type: 'String',
    value: 'MANUAL',
  });
  assert.throws(() => write({ type: 'DateTime', kind: 'text' }, 'x'), { code: 'typeNotWritable' });
  assert.throws(() => write({ type: 'LocalizedText', kind: 'text' }, 'x'), {
    code: 'typeNotWritable',
  });
});
