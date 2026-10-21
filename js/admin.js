import { apiRequest, getCurrentSession, handleLogin, initNeonAuth, signOut } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    const authSection = document.getElementById('admin-auth');
    const authMessage = document.getElementById('admin-auth-message');
    const dashboard = document.getElementById('admin-dashboard');
    const logoutButton = document.getElementById('admin-logout');
    const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

    function setMessage(element, text, isError = false) {
        element.textContent = text;
        element.classList.toggle('text-red-700', isError);
        element.classList.toggle('text-green-700', Boolean(text) && !isError);
    }

    function cell(text, className = '') {
        const td = document.createElement('td');
        td.className = `py-2 pr-3 ${className}`.trim();
        td.textContent = text;
        return td;
    }

    function formatDate(value) {
        return value ? dateFormat.format(new Date(value)) : '—';
    }

    function companyStatus(company) {
        const now = Date.now();
        if (company.subscription_status === 'active' && company.paid_until
            && new Date(company.paid_until).getTime() > now) {
            return { label: 'Licença ativa', until: company.paid_until, ok: true };
        }
        if (company.subscription_status === 'trial' && new Date(company.trial_ends_at).getTime() > now) {
            return { label: 'Em teste', until: company.trial_ends_at, ok: true };
        }
        return { label: 'Vencida', until: company.paid_until || company.trial_ends_at, ok: false };
    }

    async function loadAdmin() {
        const { companies, codes } = await apiRequest('/api/admin');
        authSection.classList.add('hidden');
        dashboard.classList.remove('hidden');
        logoutButton.classList.remove('hidden');

        const companiesBody = document.getElementById('companies-body');
        companiesBody.replaceChildren();
        for (const company of companies) {
            const status = companyStatus(company);
            const row = document.createElement('tr');
            row.className = 'border-b border-slate-100';
            row.append(
                cell(company.name, 'font-medium'),
                cell(company.manager_email || '—'),
                cell(status.label, status.ok ? 'text-green-700' : 'text-red-700'),
                cell(formatDate(status.until)),
                cell(String(company.members)),
                cell(String(company.orders))
            );

            const actions = document.createElement('td');
            const form = document.createElement('form');
            form.className = 'flex gap-1';
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '1';
            input.max = '3660';
            input.value = '30';
            input.className = 'form-input w-20';
            input.setAttribute('aria-label', `Dias para ${company.name}`);
            const button = document.createElement('button');
            button.type = 'submit';
            button.className = 'btn-secondary';
            button.textContent = 'Somar';
            form.append(input, button);
            form.addEventListener('submit', async event => {
                event.preventDefault();
                const message = document.getElementById('companies-message');
                if (!confirm(`Somar ${input.value} dias à licença de "${company.name}"?`)) return;
                button.disabled = true;
                try {
                    await apiRequest('/api/admin', {
                        method: 'PATCH',
                        body: { companyId: company.id, days: Number(input.value) }
                    });
                    await loadAdmin();
                    setMessage(document.getElementById('companies-message'), `Licença de "${company.name}" atualizada.`);
                } catch (error) {
                    setMessage(message, error.message, true);
                    button.disabled = false;
                }
            });
            actions.append(form);
            row.append(actions);
            companiesBody.append(row);
        }
        if (!companies.length) {
            companiesBody.append(Object.assign(document.createElement('tr'), {}));
            companiesBody.lastChild.append(cell('Nenhuma empresa cadastrada.'));
        }

        const codesBody = document.getElementById('codes-body');
        codesBody.replaceChildren();
        for (const code of codes) {
            const row = document.createElement('tr');
            row.className = 'border-b border-slate-100';
            row.append(
                cell(formatDate(code.created_at)),
                cell(String(code.days)),
                cell(code.note || '—'),
                cell(code.redeemed_at
                    ? `Usado em ${formatDate(code.redeemed_at)}${code.company_name ? ` por ${code.company_name}` : ''}`
                    : 'Disponível',
                    code.redeemed_at ? 'text-slate-500' : 'text-green-700')
            );
            codesBody.append(row);
        }
    }

    async function tryLoad() {
        try {
            await loadAdmin();
        } catch (error) {
            setMessage(authMessage, error.status === 403
                ? 'Esta conta não tem acesso de administrador.'
                : error.message, true);
            if (error.status === 403) await signOut().catch(() => {});
        }
    }

    if (!initNeonAuth()) {
        setMessage(authMessage, 'Configure o Neon Auth em js/config.js.', true);
        return;
    }

    document.getElementById('admin-auth-form').addEventListener('submit', async event => {
        event.preventDefault();
        setMessage(authMessage, 'Entrando…');
        try {
            await handleLogin(
                document.getElementById('admin-email').value.trim(),
                document.getElementById('admin-password').value
            );
            await tryLoad();
        } catch (error) {
            setMessage(authMessage, error.message || 'Não foi possível entrar.', true);
        }
    });

    logoutButton.addEventListener('click', async () => {
        await signOut().catch(() => {});
        dashboard.classList.add('hidden');
        logoutButton.classList.add('hidden');
        authSection.classList.remove('hidden');
        setMessage(authMessage, '');
    });

    document.getElementById('code-form').addEventListener('submit', async event => {
        event.preventDefault();
        const message = document.getElementById('code-message');
        const result = document.getElementById('code-result');
        setMessage(message, 'Gerando…');
        result.textContent = '';
        try {
            const created = await apiRequest('/api/admin', {
                method: 'POST',
                body: {
                    days: Number(document.getElementById('code-days').value),
                    note: document.getElementById('code-note').value
                }
            });
            result.textContent = created.code;
            setMessage(message, `Código de ${created.days} dias gerado. Copie agora; ele não será exibido de novo.`);
            document.getElementById('code-note').value = '';
            await loadAdmin();
        } catch (error) {
            setMessage(message, error.message, true);
        }
    });

    try {
        const session = await getCurrentSession();
        if (session?.user) await tryLoad();
    } catch (error) {
        console.error('Não foi possível recuperar a sessão:', error);
    }
});
