// -----------------------------------------------------------------------------
// OPC UA values ↔ Gladys states.
//
// The client gives each value with its built-in type name ("Boolean",
// "Double", "Int64"...). Read: scale and offset apply to numbers, a Boolean is
// 0/1, a string, a localized text or a date becomes a `{ text }`. Write: the
// reverse, checked against the range of the server's integer type, since the
// server would answer BadOutOfRange or silently wrap.
// -----------------------------------------------------------------------------

import { KINDS, NUMERIC_KINDS, publishedUnit } from './kinds.js';

export const INTEGER_RANGES = {
  SByte: [-128, 127],
  Byte: [0, 255],
  Int16: [-32768, 32767],
  UInt16: [0, 65535],
  Int32: [-2147483648, 2147483647],
  UInt32: [0, 4294967295],
  Int64: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  UInt64: [0, Number.MAX_SAFE_INTEGER],
};
const FLOATS = ['Float', 'Double'];
const NUMERIC_TYPES = [...Object.keys(INTEGER_RANGES), ...FLOATS];
const TEXT_TYPES = ['String', 'LocalizedText', 'DateTime', 'Guid', 'QualifiedName'];

export const isNumericType = (type) => NUMERIC_TYPES.includes(type);
export const isTextType = (type) => TEXT_TYPES.includes(type);

/**
 * The kind of a variable once its type is known: the declared one when it
 * fits the type, otherwise what the type says.
 * @returns {{ kind?: string, code?: string }} `code` when the variable cannot be used
 */
export function resolveKind(variable, type, isArray = false) {
  if (isArray) {
    return { code: 'arrayType' };
  }
  const usable = type === 'Boolean' || isNumericType(type) || isTextType(type);
  if (!usable) {
    return { code: 'unsupportedType' };
  }
  const declared = variable.kind;
  if (declared) {
    const definition = KINDS[declared];
    if (definition.text) {
      return { kind: declared };
    }
    if (isTextType(type)) {
      return { code: 'kindOfType' };
    }
    if (type === 'Boolean' && !definition.boolean) {
      return { code: 'kindOfType' };
    }
    return { kind: declared };
  }
  if (type === 'Boolean') {
    return { kind: variable.write ? 'switch' : 'binary' };
  }
  if (isNumericType(type)) {
    return { kind: 'value' };
  }
  return { kind: 'text' };
}

/** A 64-bit integer as node-opcua gives it ([high, low]), or a number. */
function toNumber(value, type) {
  if (Array.isArray(value) && value.length === 2) {
    const bits = (BigInt(value[0] >>> 0) << 32n) | BigInt(value[1] >>> 0);
    return Number(type === 'Int64' ? BigInt.asIntN(64, bits) : bits);
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return Number(value);
}

/** Round away the float noise (a Float 21.3 reads 21.299999237). */
function tidy(number, variable, type) {
  if (variable.precision !== undefined) {
    const factor = 10 ** variable.precision;
    return Math.round(number * factor) / factor;
  }
  return type === 'Float' ? Number(number.toPrecision(7)) : Number(number.toPrecision(12));
}

/**
 * The Gladys state of a value read.
 * @param {object} variable resolved variable (kind, scale, offset, unit...)
 * @param {{ type: string, value: unknown }} read
 * @returns {number | { text: string } | null} null: nothing to publish
 */
export function toState(variable, { type, value }) {
  if (value === null || value === undefined) {
    return null;
  }
  const definition = KINDS[variable.kind];
  if (definition.text) {
    let text;
    if (value instanceof Date) {
      text = Number.isNaN(value.getTime()) ? '' : value.toISOString();
    } else if (typeof value === 'object' && 'text' in value) {
      text = value.text ?? '';
    } else if (typeof value === 'object' && 'name' in value) {
      text = value.name ?? '';
    } else {
      text = String(value);
    }
    text = text.trim().slice(0, 255);
    return text === '' ? null : { text };
  }
  if (type === 'Boolean') {
    return value ? 1 : 0;
  }
  if (!isNumericType(type)) {
    return null;
  }
  const raw = toNumber(value, type);
  if (!Number.isFinite(raw)) {
    return null;
  }
  if (definition.boolean) {
    return raw !== 0 ? 1 : 0;
  }
  const { factor } = publishedUnit(variable.kind, variable.unit ?? definition.units[0]);
  return tidy((raw * (variable.scale ?? 1) + (variable.offset ?? 0)) * factor, variable, type);
}

/** A failed write, with the code of its message (messages.js WRITE_ERRORS). */
export class WriteError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

/**
 * The value to write for a Gladys value (a number, or a text from an action).
 * @returns {{ type: string, value: unknown }}
 */
export function toWrite(variable, input) {
  const { type } = variable;
  if (type === 'String') {
    return { type, value: String(input) };
  }
  if (type === 'LocalizedText' || !(type === 'Boolean' || isNumericType(type))) {
    throw new WriteError('typeNotWritable', { type });
  }
  const text = String(input).trim().replace(',', '.').toLowerCase();
  const words = { true: 1, false: 0, on: 1, off: 0 };
  const number = text in words ? words[text] : Number(text);
  if (text === '' || !Number.isFinite(number)) {
    throw new WriteError('notANumber', { value: String(input) });
  }
  if (type === 'Boolean') {
    if (number !== 0 && number !== 1) {
      throw new WriteError('notBoolean', { value: String(input) });
    }
    return { type, value: number === 1 };
  }
  const definition = KINDS[variable.kind];
  if (definition?.boolean) {
    if (number !== 0 && number !== 1) {
      throw new WriteError('notBoolean', { value: String(input) });
    }
    return { type, value: number };
  }
  if (
    (variable.min !== undefined && number < variable.min) ||
    (variable.max !== undefined && number > variable.max)
  ) {
    throw new WriteError('outOfBounds', { min: variable.min ?? '-∞', max: variable.max ?? '∞' });
  }
  let raw = number;
  if (NUMERIC_KINDS.includes(variable.kind)) {
    const { factor } = publishedUnit(variable.kind, variable.unit ?? definition.units[0]);
    raw = (number / factor - (variable.offset ?? 0)) / (variable.scale ?? 1);
  }
  if (FLOATS.includes(type)) {
    return { type, value: raw };
  }
  // Float noise of the scale (21.5 / 0.1) is fine; a real fraction is refused.
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > 1e-9 * Math.max(1, Math.abs(raw))) {
    throw new WriteError('notInteger', { type, value: String(input) });
  }
  const [min, max] = INTEGER_RANGES[type];
  if (rounded < min || rounded > max) {
    throw new WriteError('outOfRange', { min, max, type });
  }
  return { type, value: rounded };
}
