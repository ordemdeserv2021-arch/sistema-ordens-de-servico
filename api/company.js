import { requireUser, sendError } from './_lib/auth.js';
import { getCompanyAccess, requireManager } from './_lib/tenant.js';

export default async function handler(req, res) {
    if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, PATCH');
        return res.status(405).json({ message: 'Método não permitido.' });
    }

    try {
        const user = await requireUser(req);

        if (req.method === 'PATCH') {
            const company = await getCompanyAccess(user, req.query?.companyId, { allowExpired: true });
            requireManager(company);
            const raw = req.body?.osNextNumber;
            const next = raw === null ? null : Number(raw);
            if (next !== null && (!Number.isSafeInteger(next) || next < 0 || next > 999_999_999)) {
                return res.status(400).json({ message: 'Informe um número inicial inteiro entre 0 e 999999999.' });
            }
            await user.sql`
                update public.companies set os_next_number = ${next} where id = ${company.id}
            `;
            return res.status(200).json({ osNextNumber: next });
        }

        if (req.method === 'GET') {
            const rows = await user.sql`
                select c.id, c.name, c.subscription_status, c.trial_started_at,
                    c.trial_ends_at, c.paid_until, c.os_next_number, m.role
                from public.company_members m
                join public.companies c on c.id = m.company_id
                where m.user_id = ${user.id}
                limit 2
            `;
            if (rows.length > 1) {
                return res.status(409).json({ message: 'Sua conta está vinculada a mais de uma empresa. Contate o suporte.' });
            }
            if (!rows.length) return res.status(200).json({ company: null });
            return res.status(200).json({ company: rows[0] });
        }

        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (name.length < 2 || name.length > 160) {
            return res.status(400).json({ message: 'Informe o nome da empresa (de 2 a 160 caracteres).' });
        }

        const existing = await user.sql`
            select 1 from public.company_members where user_id = ${user.id} limit 1
        `;
        if (existing.length) {
            return res.status(409).json({ message: 'Sua conta já está vinculada a uma empresa.' });
        }

        const rows = await user.sql`
            with new_company as (
                insert into public.companies (name, owner_user_id)
                values (${name}, ${user.id})
                returning id, name, subscription_status, trial_started_at, trial_ends_at, paid_until
            ), new_membership as (
                insert into public.company_members (company_id, user_id, role)
                select id, ${user.id}, 'manager' from new_company
                returning company_id, role
            )
            select c.id, c.name, c.subscription_status, c.trial_started_at,
                c.trial_ends_at, c.paid_until, m.role
            from new_company c
            join new_membership m on m.company_id = c.id
        `;

        if (!rows.length) {
            return res.status(409).json({ message: 'Não foi possível criar a empresa para esta conta.' });
        }
        return res.status(201).json({ company: rows[0] });
    } catch (error) {
        return sendError(res, error);
    }
}
