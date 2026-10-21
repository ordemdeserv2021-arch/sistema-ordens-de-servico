import assert from 'node:assert/strict';
import test from 'node:test';
import { hashLicenseCode, normalizeLicenseCode } from './license.js';

test('normaliza o código de licença ignorando hifens, espaços e minúsculas', () => {
    assert.equal(normalizeLicenseCode(' abcd-2345 efgh-6789 '), 'ABCD2345EFGH6789');
    assert.equal(normalizeLicenseCode(undefined), '');
});

test('o hash é igual para formatações diferentes do mesmo código', () => {
    assert.equal(hashLicenseCode('ABCD-2345-EFGH-6789'), hashLicenseCode('abcd2345efgh6789'));
    assert.notEqual(hashLicenseCode('ABCD-2345-EFGH-6789'), hashLicenseCode('ABCD-2345-EFGH-6780'));
});
