import { requireUser, sendError } from './_lib/auth.js';
import { getCompanyAccess, requireManager } from './_lib/tenant.js';

function cleanText(value, max) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return false;
    const text = value.trim();
    if (!text) return null;
    return text.length <= max ? text : false;
}

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'PATCH') {
        res.setHeader('Allow', 'GET, PATCH');
        return res.status(405).json({ message: 'Método não permitido.' });
    }

    try {
        const user = await requireUser(req);
        const company = await getCompanyAccess(user);
        requireManager(company);

        if (req.method === 'PATCH') {
            const body = req.body || {};
            const userId = typeof body.userId === 'string' ? body.userId : '';
            const displayName = cleanText(body.displayName, 120);
            const registration = cleanText(body.registration, 40);
            if (!userId || displayName === false || registration === false) {
                return res.status(400).json({ message: 'Nome (até 120) ou matrícula (até 40) inválidos.' });
            }
            const updated = await user.sql`
                update public.company_members
                set display_name = ${displayName}, registration = ${registration}
                where company_id = ${company.id} and user_id = ${userId}
                returning user_id
            `;
            if (!updated.length) return res.status(404).json({ message: 'Colaborador não encontrado.' });
            return res.status(200).json({ displayName, registration });
        }

        const members = await user.sql`
            select u.id, u.name, u.email, m.role, m.created_at,
                   m.display_name as "displayName", m.registration
            from public.company_members m
            join neon_auth."user" u on u.id::text = m.user_id
            where m.company_id = ${company.id}
            order by m.created_at asc
        `;
        return res.status(200).json({ members });
    } catch (error) {
        return sendError(res, error);
    }
}
