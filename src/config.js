// -----------------------------------------------------------------------------
// Integration configuration: one OPC UA server, its security, and the
// variables to watch. DEFAULT_CONFIG mirrors the `default` values of the
// manifest (test/manifest.test.js).
// -----------------------------------------------------------------------------

import { DEFAULT_LANGUAGE, LANGUAGES } from './i18n.js';
import { SECURITY_MODE_KEYS, SECURITY_POLICY_KEYS } from './security.js';

/** Publishing intervals offered, in seconds. */
export const INTERVALS = ['1', '2', '5', '10', '30', '60'];

export const DEFAULT_CONFIG = {
  language: DEFAULT_LANGUAGE,
  security_mode: 'none',
  security_policy: 'basic256sha256',
  interval: '5',
  allow_write: false,
};

/**
 * Merge the user config with the defaults, with the right types.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG };
  for (const [key, value] of Object.entries(raw ?? {})) {
    // An emptied field arrives as null or "": keep the default.
    if (value !== null && value !== undefined && value !== '') {
      config[key] = value;
    }
  }
  if (!LANGUAGES.includes(config.language)) {
    config.language = DEFAULT_LANGUAGE;
  }
  if (!SECURITY_MODE_KEYS.includes(config.security_mode)) {
    config.security_mode = DEFAULT_CONFIG.security_mode;
  }
  if (!SECURITY_POLICY_KEYS.includes(config.security_policy)) {
    config.security_policy = DEFAULT_CONFIG.security_policy;
  }
  config.interval = String(config.interval);
  if (!INTERVALS.includes(config.interval)) {
    config.interval = DEFAULT_CONFIG.interval;
  }
  config.allow_write = config.allow_write === true || config.allow_write === 'true';
  config.endpoint_url = String(config.endpoint_url ?? '').trim();
  config.username = String(config.username ?? '').trim();
  config.password = config.password === undefined ? '' : String(config.password);
  config.variables = String(config.variables ?? '');
  return config;
}

/**
 * Check the endpoint URL and give the stable id of the server: its host and
 * port ("192.168.1.50-4840"), what the user typed, not what the server says.
 * @returns {{ url: string, host: string, port: number, platformId: string } | { error: string }}
 */
export function parseEndpoint(text) {
  if (!text) {
    return { error: 'noEndpoint' };
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'badEndpoint' };
  }
  if (url.protocol !== 'opc.tcp:' || !url.hostname || url.username || url.password) {
    return { error: 'badEndpoint' };
  }
  const port = Number(url.port || 4840);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return {
    url: text,
    host,
    port,
    platformId: `${host}-${port}`.replace(/[^a-z0-9.-]/g, '-'),
  };
}
