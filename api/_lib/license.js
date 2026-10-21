import { createHash, randomBytes } from 'node:crypto';

export function normalizeLicenseCode(value) {
    return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

export function hashLicenseCode(code) {
    return createHash('sha256').update(normalizeLicenseCode(code)).digest('hex');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateLicenseCode() {
    const raw = Array.from(randomBytes(16), byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
    return raw.match(/.{4}/g).join('-');
}
