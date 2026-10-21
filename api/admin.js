import { requireUser, sendError } from './_lib/auth.js';
import { generateLicenseCode, hashLicenseCode } from './_lib/license.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireAdmin(user) {
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!adminEmail || String(user.email || '').toLowerCase() !== adminEmail) {
        const error = new Error('Acesso restrito ao administrador do sistema.');
        error.statusCode = 403;
        throw error;
    }
}

function validDays(value) {
    const days = Number(value);
    return Number.isInteger(days) && days >= 1 && days <= 3660 ? days : null;
}

export default async function handler(req, res) {
    if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, PATCH');
        return res.status(405).json({ message: 'Método não permitido.' });
    }

    try {
        const user = await requireUser(req);
        requireAdmin(user);

        if (req.method === 'GET') {
            const companies = await user.sql`
                select c.id, c.name, c.subscription_status, c.trial_ends_at, c.paid_until, c.created_at,
                    (select u.email from public.company_members m
                        join neon_auth."user" u on u.id::text = m.user_id
                        where m.company_id = c.id and m.role = 'manager' limit 1) as manager_email,
                    (select count(*)::int from public.company_members m where m.company_id = c.id) as members,
                    (select count(*)::int from public.service_orders o where o.company_id = c.id) as orders
                from public.companies c
                order by c.created_at desc
                limit 500
            `;
            const codes = await user.sql`
                select l.id, l.days, l.note, l.created_at, l.redeemed_at, c.name as company_name
                from public.license_codes l
                left join public.companies c on c.id = l.redeemed_company_id
                order by l.created_at desc
                limit 100
            `;
            return res.status(200).json({ companies, codes });
        }

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const days = validDays(body.days);
        if (!days) {
            return res.status(400).json({ message: 'Informe uma quantidade de dias entre 1 e 3660.' });
        }

        if (req.method === 'POST') {
            const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
            const code = generateLicenseCode();
            await user.sql`
                insert into public.license_codes (code_hash, days, note)
                values (${hashLicenseCode(code)}, ${days}, ${note || null})
            `;
            return res.status(201).json({ code, days, note: note || null });
        }

        if (typeof body.companyId !== 'string' || !UUID.test(body.companyId)) {
            return res.status(400).json({ message: 'Empresa inválida.' });
        }
        const rows = await user.sql`
            update public.companies
            set subscription_status = 'active',
                paid_until = greatest(coalesce(paid_until, now()), trial_ends_at, now())
                    + make_interval(days => ${days})
            where id = ${body.companyId}
            returning id, paid_until
        `;
        if (!rows.length) return res.status(404).json({ message: 'Empresa não encontrada.' });
        return res.status(200).json({ company: rows[0] });
    } catch (error) {
        return sendError(res, error);
    }
}
