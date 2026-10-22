import { requireUser, sendError } from './_lib/auth.js';
import { getCompanyAccess, invalidRequest } from './_lib/tenant.js';

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
                where company_id = ${company.id} and user_id = ${user.id}
                order by lower(name)
                limit 500
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
                where company_id = ${company.id} and user_id = ${user.id}
            `;
            if (count[0].total >= 500) throw invalidRequest('Limite de 500 itens salvos atingido.');
            const rows = await user.sql`
                insert into public.saved_items (company_id, user_id, name)
                values (${company.id}, ${user.id}, ${name})
                on conflict (company_id, user_id, lower(name)) do update set name = excluded.name
                returning id, name
            `;
            return res.status(200).json({ item: rows[0] });
        }

        if (typeof body.id !== 'string' || !UUID.test(body.id)) throw invalidRequest('Item inválido.');
        await user.sql`
            delete from public.saved_items
            where id = ${body.id} and company_id = ${company.id} and user_id = ${user.id}
        `;
        return res.status(200).json({ ok: true });
    } catch (error) {
        return sendError(res, error);
    }
}
