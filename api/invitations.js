import { createHash, randomBytes } from 'node:crypto';
import { requireUser, sendError } from './_lib/auth.js';
import { getCompanyAccess, requireManager } from './_lib/tenant.js';

function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'PUT') {
        res.setHeader('Allow', 'POST, PUT');
        return res.status(405).json({ message: 'Método não permitido.' });
    }

    try {
        const user = await requireUser(req);

        if (req.method === 'POST') {
            const company = await getCompanyAccess(user);
            requireManager(company);

            const email = typeof req.body?.email === 'string'
                ? req.body.email.trim().toLowerCase()
                : '';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
                return res.status(400).json({ message: 'Informe um e-mail válido para o convite.' });
            }

            const existing = await user.sql`
                select 1
                from public.company_members m
                join neon_auth."user" u on u.id::text = m.user_id
                where lower(u.email) = ${email}
                limit 1
            `;
            if (existing.length) {
                return res.status(409).json({ message: 'Esse e-mail já pertence a um membro da empresa.' });
            }

            const token = randomBytes(32).toString('base64url');
            const rows = await user.sql`
                insert into public.company_invitations (company_id, email, token_hash, expires_at)
                values (
                    ${company.id},
                    ${email},
                    ${hashToken(token)},
                    now() + interval '7 days'
                )
                returning id, email, expires_at
            `;
            return res.status(201).json({
                invitation: rows[0],
                token
            });
        }

        const token = typeof req.body?.token === 'string' ? req.body.token : '';
        if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
            return res.status(400).json({ message: 'O link de convite é inválido.' });
        }

        const memberships = await user.sql`
            select 1 from public.company_members where user_id = ${user.id} limit 1
        `;
        if (memberships.length) {
            return res.status(409).json({ message: 'Sua conta já está vinculada a uma empresa.' });
        }

        const rows = await user.sql`
            with invitation as (
                update public.company_invitations
                set accepted_at = now(), accepted_by = ${user.id}
                where token_hash = ${hashToken(token)}
                    and accepted_at is null
                    and expires_at > now()
                    and lower(email) = lower(${user.email})
                    and exists (
                        select 1
                        from public.companies c
                        where c.id = company_invitations.company_id
                            and (
                                (c.subscription_status = 'trial' and c.trial_ends_at > now())
                                or (c.subscription_status = 'active' and c.paid_until > now())
                            )
                    )
                returning company_id
            ), membership as (
                insert into public.company_members (company_id, user_id, role)
                select company_id, ${user.id}, 'collaborator'
                from invitation
                returning company_id
            )
            select c.id, c.name, c.subscription_status, c.trial_ends_at, c.paid_until, 'collaborator' as role
            from membership m
            join public.companies c on c.id = m.company_id
        `;
        if (!rows.length) {
            return res.status(400).json({
                message: 'O convite expirou, já foi utilizado ou não corresponde ao e-mail confirmado nesta conta.'
            });
        }

        return res.status(200).json({ company: rows[0] });
    } catch (error) {
        return sendError(res, error);
    }
}
