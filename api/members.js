import { requireUser, sendError } from './_lib/auth.js';
import { getCompanyAccess, requireManager } from './_lib/tenant.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ message: 'Método não permitido.' });
    }

    try {
        const user = await requireUser(req);
        const company = await getCompanyAccess(user);
        requireManager(company);

        const members = await user.sql`
            select u.id, u.name, u.email, m.role, m.created_at
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
