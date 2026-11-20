// -----------------------------------------------------------------------------
// The security choices of the configuration form (client.js maps them to
// node-opcua). Kept apart so the configuration does not load node-opcua.
// -----------------------------------------------------------------------------

export const SECURITY_MODE_KEYS = ['none', 'sign', 'sign_and_encrypt'];
export const SECURITY_POLICY_KEYS = [
  'basic256sha256',
  'aes128_sha256_rsaoaep',
  'aes256_sha256_rsapss',
];
