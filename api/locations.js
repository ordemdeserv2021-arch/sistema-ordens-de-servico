import { requireUser, sendError } from './_lib/auth.js';
import { getCompanyAccess, invalidRequest, requireManager } from './_lib/tenant.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseFields(body, { partial = false } = {}) {
    const fields = {};
    if (!partial || body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (name.length < 1 || name.length > 120) throw invalidRequest('Informe o nome do local (até 120 caracteres).');
        fields.name = name;
    }
    if (!partial || body.prefix !== undefined) {
        const prefix = typeof body.prefix === 'string' ? body.prefix.trim() : '';
        if (prefix && !/^[A-Za-z0-9]{1,10}$/.test(prefix)) {
            throw invalidRequest('O prefixo deve ter até 10 letras ou números, sem espaços.');
        }
        fields.prefix = prefix || null;
    }
    if (!partial || body.nextNumber !== undefined) {
        const raw = body.nextNumber;
        if (raw === null || raw === '' || raw === undefined) {
            fields.nextNumber = null;
        } else {
            const next = Number(raw);
            if (!Number.isSafeInteger(next) || next < 0 || next > 999_999_999) {
                throw invalidRequest('Informe um número inicial inteiro entre 0 e 999999999.');
            }
            fields.nextNumber = next;
        }
    }
    return fields;
}

const mapLocation = row => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    prefix: row.prefix,
    nextNumber: row.next_number === null ? null : Number(row.next_number)
});

export default async function handler(req, res) {
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
        return res.status(405).json({ message: 'Método não permitido.' });
    }

    try {
        const user = await requireUser(req);
        const company = await getCompanyAccess(user);

        if (req.method === 'GET') {
            const requested = req.query?.userId;
            if (requested !== undefined && !UUID.test(requested)) {
                throw invalidRequest('Colaborador inválido.');
            }
            const ownerId = company.role === 'manager' ? requested : user.id;
            const rows = ownerId
                ? await user.sql`
                    select id, user_id, name, prefix, next_number from public.company_locations
                    where company_id = ${company.id} and user_id = ${ownerId}
                    order by lower(name)
                `
                : await user.sql`
                    select id, user_id, name, prefix, next_number from public.company_locations
                    where company_id = ${company.id}
                    order by lower(name)
                    limit 2000
                `;
            return res.status(200).json({ locations: rows.map(mapLocation) });
        }

        requireManager(company);
        const body = req.body && typeof req.body === 'object' ? req.body : {};

        try {
            if (req.method === 'POST') {
                if (typeof body.userId !== 'string' || !UUID.test(body.userId)) {
                    throw invalidRequest('Colaborador inválido.');
                }
                const fields = parseFields(body);
                const rows = await user.sql`
                    insert into public.company_locations (company_id, user_id, name, prefix, next_number)
                    select ${company.id}, m.user_id, ${fields.name}, ${fields.prefix}, ${fields.nextNumber}
                    from public.company_members m
                    where m.company_id = ${company.id} and m.user_id = ${body.userId}
                    returning id, user_id, name, prefix, next_number
                `;
                if (!rows.length) return res.status(404).json({ message: 'Colaborador não encontrado nesta empresa.' });
                return res.status(201).json({ location: mapLocation(rows[0]) });
            }

            if (typeof body.id !== 'string' || !UUID.test(body.id)) {
                throw invalidRequest('Local inválido.');
            }

            if (req.method === 'PATCH') {
                const fields = parseFields(body, { partial: true });
                const rows = await user.sql`
                    update public.company_locations
                    set name = coalesce(${fields.name ?? null}, name),
                        prefix = case when ${body.prefix !== undefined} then ${fields.prefix ?? null} else prefix end,
                        next_number = case when ${body.nextNumber !== undefined}
                            then ${fields.nextNumber ?? null}::bigint else next_number end
                    where id = ${body.id} and company_id = ${company.id}
                    returning id, user_id, name, prefix, next_number
                `;
                if (!rows.length) return res.status(404).json({ message: 'Local não encontrado.' });
                return res.status(200).json({ location: mapLocation(rows[0]) });
            }

            const rows = await user.sql`
                delete from public.company_locations
                where id = ${body.id} and company_id = ${company.id}
                returning id
            `;
            if (!rows.length) return res.status(404).json({ message: 'Local não encontrado.' });
            return res.status(200).json({ deleted: true });
        } catch (error) {
            if (error?.code === '23505') {
                return res.status(409).json({ message: 'Este colaborador já tem um local com esse nome.' });
            }
            throw error;
        }
    } catch (error) {
        return sendError(res, error);
    }
}
