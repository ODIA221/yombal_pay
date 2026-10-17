import crypto from 'node:crypto';

export const newId = (prefix, bytes = 9) =>
  `${prefix}_${crypto.randomBytes(bytes).toString('base64url').replace(/[-_]/g, '').slice(0, bytes + 4)}`;

export const nowIso = () => new Date().toISOString();
