import { requireUser, sendError } from './_lib/auth.js';
import { getCompanyAccess } from './_lib/tenant.js';

const MAX_ORDER_BYTES = 1_500_000;

export default async function handler(req, res) {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ message: 'Método não permitido.' });
    }

    try {
        const user = await requireUser(req);
        const company = await getCompanyAccess(user, req.query?.companyId);

        if (req.method === 'GET') {
            const rows = company.role === 'manager'
                ? await user.sql`
                    select o.id, o.data, o.updated_at, u.name as created_by_name,
                        u.email as created_by_email
                    from public.service_orders o
                    left join neon_auth."user" u on u.id::text = o.created_by
                    where o.company_id = ${company.id}
                    order by o.updated_at desc
                `
                : await user.sql`
                    select id, data, updated_at, null as created_by_name, null as created_by_email
                    from public.service_orders
                    where company_id = ${company.id} and created_by = ${user.id}
                    order by updated_at desc
                `;

            return res.status(200).json({
                orders: rows.map(row => ({
                    id: row.id,
                    data: row.data,
                    updatedAt: row.updated_at,
                    createdBy: row.created_by_name || row.created_by_email
                        ? { name: row.created_by_name, email: row.created_by_email }
                        : null
                }))
            });
        }

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        if (typeof body.id !== 'string' || !body.id.trim() || body.id.length > 100
            || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
            return res.status(400).json({ message: 'Os dados da ordem de serviço são inválidos.' });
        }
        if (Buffer.byteLength(JSON.stringify(body.data), 'utf8') > MAX_ORDER_BYTES) {
            return res.status(413).json({ message: 'A ordem excede o limite de tamanho permitido.' });
        }

        if (req.method === 'POST') {
            const rows = await user.sql`
                insert into public.service_orders (company_id, id, created_by, data)
                values (${company.id}, ${body.id}, ${user.id}, ${JSON.stringify(body.data)}::jsonb)
                on conflict (company_id, id) do update
                set data = excluded.data, updated_at = now()
                where service_orders.created_by = ${user.id}
                    or ${company.role === 'manager'}
                returning id, data, updated_at
            `;
            if (!rows.length) {
                return res.status(403).json({ message: 'Você não tem permissão para alterar esta ordem.' });
            }

            return res.status(200).json({
                order: {
                    id: rows[0].id,
                    data: rows[0].data,
                    updatedAt: rows[0].updated_at
                }
            });
        }

        const rows = company.role === 'manager'
            ? await user.sql`
                delete from public.service_orders
                where company_id = ${company.id} and id = ${body.id}
                returning id
            `
            : await user.sql`
                delete from public.service_orders
                where company_id = ${company.id} and id = ${body.id} and created_by = ${user.id}
                returning id
            `;
        if (!rows.length) {
            return res.status(404).json({ message: 'A ordem não foi encontrada ou você não tem permissão para excluí-la.' });
        }

        return res.status(200).json({ deleted: true });
    } catch (error) {
        return sendError(res, error);
    }
}
