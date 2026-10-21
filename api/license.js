import { requireUser, sendError } from './_lib/auth.js';
import { hashLicenseCode, normalizeLicenseCode } from './_lib/license.js';
import { getCompanyAccess, requireManager } from './_lib/tenant.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ message: 'Método não permitido.' });
    }

    try {
        const user = await requireUser(req);
        const company = await getCompanyAccess(user, undefined, { allowExpired: true });
        requireManager(company);

        const code = normalizeLicenseCode(req.body?.code);
        if (code.length < 12 || code.length > 40) {
            return res.status(400).json({ message: 'Informe um código de licença válido.' });
        }

        const rows = await user.sql`
            with redeemed as (
                update public.license_codes
                set redeemed_at = now(), redeemed_company_id = ${company.id}
                where code_hash = ${hashLicenseCode(code)} and redeemed_at is null
                returning days
            )
            update public.companies c
            set subscription_status = 'active',
                paid_until = greatest(coalesce(c.paid_until, now()), c.trial_ends_at, now())
                    + make_interval(days => (select days from redeemed))
            where c.id = ${company.id} and exists (select 1 from redeemed)
            returning c.id, c.name, c.subscription_status, c.trial_started_at,
                c.trial_ends_at, c.paid_until
        `;

        if (!rows.length) {
            return res.status(400).json({ message: 'Código de licença inválido ou já utilizado.' });
        }
        return res.status(200).json({ company: { ...rows[0], role: company.role } });
    } catch (error) {
        return sendError(res, error);
    }
}
