import assert from 'node:assert/strict';
import test from 'node:test';
import { getCompanyAccess, requireManager } from './tenant.js';

const companyId = 'a728885b-d8e4-4dab-8760-4257e19d7142';

function createUser(company) {
    return {
        id: 'user-1',
        sql: async () => company ? [company] : []
    };
}

function createCompany(overrides = {}) {
    return {
        id: companyId,
        name: 'Empresa de teste',
        subscription_status: 'trial',
        trial_ends_at: new Date(Date.now() + 60_000),
        paid_until: null,
        role: 'manager',
        ...overrides
    };
}

test('allows a company member during an active trial', async () => {
    const company = await getCompanyAccess(createUser(createCompany()), companyId);
    assert.equal(company.id, companyId);
});

test('rejects access after the trial expires', async () => {
    await assert.rejects(
        getCompanyAccess(createUser(createCompany({
            trial_ends_at: new Date(Date.now() - 60_000)
        })), companyId),
        error => error.statusCode === 402
    );
});

test('allows an active paid subscription only through its paid-through date', async () => {
    const company = createCompany({
        subscription_status: 'active',
        paid_until: new Date(Date.now() + 60_000)
    });
    assert.equal((await getCompanyAccess(createUser(company), companyId)).id, companyId);

    await assert.rejects(
        getCompanyAccess(createUser({ ...company, paid_until: new Date(Date.now() - 60_000) }), companyId),
        error => error.statusCode === 402
    );
});

test('rejects users without a company membership', async () => {
    await assert.rejects(
        getCompanyAccess(createUser(null), companyId),
        error => error.statusCode === 403
    );
});

test('only managers can use manager-only operations', () => {
    assert.doesNotThrow(() => requireManager(createCompany()));
    assert.throws(
        () => requireManager(createCompany({ role: 'collaborator' })),
        error => error.statusCode === 403
    );
});

test('rejects malformed company identifiers', async () => {
    await assert.rejects(
        getCompanyAccess(createUser(createCompany()), 'not-a-uuid'),
        error => error.statusCode === 400
    );
});
