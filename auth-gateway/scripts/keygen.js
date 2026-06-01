/**
 * Generates an RSA-2048 key pair and prints .env-ready lines.
 * Run once: node scripts/keygen.js >> .env
 */
const { generateKeyPairSync } = require('crypto');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

const esc = (pem) => pem.replace(/\n/g, '\\n');

console.log(`JWT_PRIVATE_KEY="${esc(privateKey)}"`);
console.log(`JWT_PUBLIC_KEY="${esc(publicKey)}"`);
