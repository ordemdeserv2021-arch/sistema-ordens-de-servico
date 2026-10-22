import { requireUser, sendError } from './_lib/auth.js';
import { getCompanyAccess, invalidRequest, requireManager } from './_lib/tenant.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ message: 'Método não permitido.' });
    }

    try {
        const user = await requireUser(req);
        const company = await getCompanyAccess(user);
        const body = req.body && typeof req.body === 'object' ? req.body : {};

        if (req.method === 'GET') {
            const rows = await user.sql`
                select id, name from public.saved_items
                where company_id = ${company.id}
                order by lower(name)
                limit 2000
            `;
            return res.status(200).json({ items: rows });
        }

        if (req.method === 'POST') {
            const name = typeof body.name === 'string'
                ? body.name.trim().toLocaleUpperCase('pt-BR')
                : '';
            if (name.length < 1 || name.length > 160) {
                throw invalidRequest('Informe a descrição do item (até 160 caracteres).');
            }
            const count = await user.sql`
                select count(*)::int as total from public.saved_items
                where company_id = ${company.id}
            `;
            if (count[0].total >= 2000) throw invalidRequest('Limite de 2000 itens salvos atingido.');
            const rows = await user.sql`
                insert into public.saved_items (company_id, user_id, name)
                values (${company.id}, ${user.id}, ${name})
                on conflict (company_id, lower(name)) do update set name = public.saved_items.name
                returning id, name
            `;
            return res.status(200).json({ item: rows[0] });
        }

        requireManager(company);
        if (typeof body.id !== 'string' || !UUID.test(body.id)) throw invalidRequest('Item inválido.');
        await user.sql`
            delete from public.saved_items
            where id = ${body.id} and company_id = ${company.id}
        `;
        return res.status(200).json({ ok: true });
    } catch (error) {
        return sendError(res, error);
    }
}
