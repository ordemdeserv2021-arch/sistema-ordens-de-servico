import { requireUser, sendError } from './_lib/auth.js';
import { getCompanyAccess, requireManager } from './_lib/tenant.js';

const MAX_ORDER_BYTES = 1_500_000;

export default async function handler(req, res) {
    if (!['GET', 'POST', 'DELETE', 'PATCH'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, DELETE, PATCH');
        return res.status(405).json({ message: 'Método não permitido.' });
    }

    try {
        const user = await requireUser(req);
        const company = await getCompanyAccess(user, req.query?.companyId);

        if (req.method === 'GET') {
            const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const filterUser = req.query?.userId ?? null;
            const filterLocation = req.query?.locationId ?? null;
            const orderId = req.query?.id ?? null;
            if ((filterUser && !uuid.test(filterUser)) || (filterLocation && !uuid.test(filterLocation))
                || (orderId && (typeof orderId !== 'string' || orderId.length > 100))) {
                return res.status(400).json({ message: 'Filtro inválido.' });
            }

            // O gestor lista sem fotos/assinaturas (pesadas); o conteúdo completo vem ao abrir uma ordem.
            const rows = company.role === 'manager'
                ? await user.sql`
                    select o.id, case when ${orderId}::text is null then o.data - 'photos' - 'signatures' else o.data end as data,
                        o.updated_at, o.os_number, o.location_id, l.name as location_name,
                        u.name as created_by_name, u.email as created_by_email
                    from public.service_orders o
                    left join neon_auth."user" u on u.id::text = o.created_by
                    left join public.company_locations l on l.id = o.location_id
                    where o.company_id = ${company.id}
                        and (${filterUser}::text is null or o.created_by = ${filterUser})
                        and (${filterLocation}::uuid is null or o.location_id = ${filterLocation}::uuid)
                        and (${orderId}::text is null or o.id = ${orderId})
                    order by o.updated_at desc
                    limit 300
                `
                : await user.sql`
                    select id, data, updated_at, os_number, location_id, null as location_name,
                        null as created_by_name, null as created_by_email
                    from public.service_orders
                    where company_id = ${company.id} and created_by = ${user.id}
                    order by updated_at desc
                `;

            return res.status(200).json({
                orders: rows.map(row => ({
                    id: row.id,
                    data: row.data,
                    updatedAt: row.updated_at,
                    osNumber: row.os_number,
                    locationId: row.location_id,
                    locationName: row.location_name,
                    createdBy: row.created_by_name || row.created_by_email
                        ? { name: row.created_by_name, email: row.created_by_email }
                        : null
                }))
            });
        }

        if (req.method === 'PATCH') {
            requireManager(company);
            const id = req.body?.id;
            const rawNumber = req.body?.osNumber;
            const osNumber = typeof rawNumber === 'string' ? rawNumber.trim() : '';
            if (typeof id !== 'string' || !id || id.length > 100
                || typeof rawNumber !== 'string' || osNumber.length > 30) {
                return res.status(400).json({ message: 'Informe um número de O.S. com até 30 caracteres.' });
            }

            let rows;
            try {
                rows = await user.sql`
                    update public.service_orders
                    set os_number = ${osNumber || null}
                    where company_id = ${company.id} and id = ${id}
                    returning id, os_number
                `;
            } catch (error) {
                if (error?.code === '23505') {
                    return res.status(409).json({ message: 'Já existe outra ordem com esse número.' });
                }
                throw error;
            }
            if (!rows.length) {
                return res.status(404).json({ message: 'A ordem não foi encontrada.' });
            }
            return res.status(200).json({ order: { id: rows[0].id, osNumber: rows[0].os_number } });
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
            const payload = JSON.stringify(body.data);
            let locationId = null;
            if (body.locationId !== undefined && body.locationId !== null && body.locationId !== '') {
                const found = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.locationId)
                    ? await user.sql`
                        select id from public.company_locations
                        where id = ${body.locationId} and company_id = ${company.id}
                            and (user_id = ${user.id} or ${company.role === 'manager'})
                    `
                    : [];
                if (!found.length) {
                    return res.status(400).json({ message: 'O local escolhido não está disponível para você.' });
                }
                locationId = found[0].id;
            }

            let rows;
            for (let attempt = 0; attempt < 5 && !rows; attempt += 1) {
                try {
                    // O número só é reservado quando a ordem é nova. Prioridade: contador do local, depois o da empresa.
                    rows = await user.sql`
                        with is_new as (
                            select not exists (
                                select 1 from public.service_orders
                                where company_id = ${company.id} and id = ${body.id}
                            ) as value
                        ), bump_location as (
                            update public.company_locations
                            set next_number = next_number + 1
                            where id = ${locationId}::uuid and next_number is not null
                                and (select value from is_new)
                            returning case when prefix is null then '' else prefix || '-' end
                                || (next_number - 1)::text as assigned
                        ), bump_company as (
                            update public.companies
                            set os_next_number = os_next_number + 1
                            where id = ${company.id} and os_next_number is not null
                                and (select value from is_new)
                                and not exists (select 1 from bump_location)
                            returning (os_next_number - 1)::text as assigned
                        )
                        insert into public.service_orders (company_id, id, created_by, data, location_id, os_number)
                        values (${company.id}, ${body.id}, ${user.id}, ${payload}::jsonb, ${locationId}::uuid,
                            coalesce((select assigned from bump_location), (select assigned from bump_company)))
                        on conflict (company_id, id) do update
                        set data = excluded.data, updated_at = now()
                        where service_orders.created_by = ${user.id}
                            or ${company.role === 'manager'}
                        returning id, data, updated_at, os_number, location_id
                    `;
                } catch (error) {
                    // Número já usado manualmente: pula para o próximo e tenta de novo.
                    if (error?.code !== '23505') throw error;
                    const skipped = await user.sql`
                        update public.company_locations set next_number = next_number + 1
                        where id = ${locationId}::uuid and next_number is not null
                        returning id
                    `;
                    if (!skipped.length) {
                        await user.sql`
                            update public.companies set os_next_number = os_next_number + 1
                            where id = ${company.id} and os_next_number is not null
                        `;
                    }
                }
            }
            if (!rows) {
                return res.status(409).json({ message: 'Não foi possível reservar o número da O.S. Tente novamente.' });
            }
            if (!rows.length) {
                return res.status(403).json({ message: 'Você não tem permissão para alterar esta ordem.' });
            }

            return res.status(200).json({
                order: {
                    id: rows[0].id,
                    data: rows[0].data,
                    updatedAt: rows[0].updated_at,
                    osNumber: rows[0].os_number,
                    locationId: rows[0].location_id
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
