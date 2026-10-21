import { createHash } from 'node:crypto';

export function normalizeLicenseCode(value) {
    return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

export function hashLicenseCode(code) {
    return createHash('sha256').update(normalizeLicenseCode(code)).digest('hex');
}
