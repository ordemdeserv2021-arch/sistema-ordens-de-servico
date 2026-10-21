export function invalidRequest(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

export async function getCompanyAccess(user, companyId) {
    if (companyId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
        throw invalidRequest('O identificador da empresa é inválido.');
    }

    const memberships = companyId
        ? await user.sql`
            select c.id, c.name, c.subscription_status, c.trial_ends_at, c.paid_until, m.role
            from public.company_members m
            join public.companies c on c.id = m.company_id
            where m.user_id = ${user.id} and c.id = ${companyId}
            limit 1
        `
        : await user.sql`
            select c.id, c.name, c.subscription_status, c.trial_ends_at, c.paid_until, m.role
            from public.company_members m
            join public.companies c on c.id = m.company_id
            where m.user_id = ${user.id}
            limit 2
        `;

    if (!memberships.length) {
        const error = new Error('Sua conta ainda não está vinculada a uma empresa.');
        error.statusCode = 403;
        throw error;
    }
    if (memberships.length > 1) {
        const error = new Error('Selecione a empresa para continuar.');
        error.statusCode = 409;
        throw error;
    }

    const company = memberships[0];
    const trialActive = company.subscription_status === 'trial'
        && new Date(company.trial_ends_at).getTime() > Date.now();
    const paidActive = company.subscription_status === 'active'
        && company.paid_until
        && new Date(company.paid_until).getTime() > Date.now();

    if (!trialActive && !paidActive) {
        const error = new Error('O período de acesso da empresa terminou. Fale com o gestor para regularizar a assinatura.');
        error.statusCode = 402;
        throw error;
    }

    return company;
}

export function requireManager(company) {
    if (company.role !== 'manager') {
        const error = new Error('Somente o gestor da empresa pode realizar esta operação.');
        error.statusCode = 403;
        throw error;
    }
}
