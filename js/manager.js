import {
    apiRequest,
    getCurrentSession,
    handleLogin,
    handleSignup,
    initNeonAuth,
    sendEmailVerificationCode,
    signOut,
    verifyEmailCode
} from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    const authScreen = document.getElementById('manager-auth-screen');
    const authForm = document.getElementById('manager-auth-form');
    const authMessage = document.getElementById('manager-auth-message');
    const signupFields = document.getElementById('manager-signup-fields');
    const verification = document.getElementById('manager-verification');
    const verificationMessage = document.getElementById('manager-verification-message');
    const dashboard = document.getElementById('manager-dashboard');
    const companySetup = document.getElementById('company-setup');
    const companySetupMessage = document.getElementById('company-setup-message');
    const inviteMessage = document.getElementById('invite-message');
    let verificationEmail = '';

    function setMessage(element, text, isError = false) {
        element.textContent = text;
        element.classList.toggle('text-red-700', isError);
        element.classList.toggle('text-green-700', Boolean(text) && !isError);
    }

    function showVerification(email) {
        verificationEmail = email;
        document.getElementById('manager-verification-label').textContent =
            `Informe o código enviado para ${email}.`;
        authForm.classList.add('hidden');
        verification.classList.remove('hidden');
    }

    async function loadCompany() {
        const { company } = await apiRequest('/api/company');
        if (!company) {
            authScreen.classList.add('hidden');
            document.getElementById('setup-company-name').value =
                sessionStorage.getItem('manager-company-name') || '';
            companySetup.classList.remove('hidden');
            return;
        }

        if (company.role !== 'manager') {
            setMessage(authMessage, 'Esta conta é de colaborador. Acesse a página dos colaboradores para continuar.', true);
            return;
        }

        authScreen.classList.add('hidden');
        dashboard.classList.remove('hidden');
        document.getElementById('dashboard-company-name').textContent = company.name;
        const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });
        const hasAccess = (company.subscription_status === 'trial'
                && new Date(company.trial_ends_at).getTime() > Date.now())
            || (company.subscription_status === 'active' && company.paid_until
                && new Date(company.paid_until).getTime() > Date.now());
        const licenseStatus = document.getElementById('license-status');
        if (company.subscription_status === 'active' && company.paid_until && hasAccess) {
            licenseStatus.textContent = `Licença ativa até ${dateFormat.format(new Date(company.paid_until))}. Um novo código soma dias ao prazo atual.`;
        } else if (hasAccess) {
            licenseStatus.textContent = `Período de teste até ${dateFormat.format(new Date(company.trial_ends_at))}. Ao ativar uma licença, os dias restantes do teste são mantidos.`;
        } else {
            licenseStatus.textContent = 'O acesso da empresa terminou. Informe um código de licença para reativar o sistema.';
        }
        document.getElementById('dashboard-subscription').textContent = hasAccess
            ? (company.subscription_status === 'active'
                ? `Licença ativa até ${dateFormat.format(new Date(company.paid_until))}.`
                : `Período de teste até ${dateFormat.format(new Date(company.trial_ends_at))}.`)
            : 'Acesso encerrado.';

        document.getElementById('invite-panel').classList.toggle('hidden', !hasAccess);
        if (!hasAccess) {
            const membersContainer = document.getElementById('company-members');
            membersContainer.textContent = 'O período de acesso terminou. Fale com o administrador do sistema para renovar.';
            document.getElementById('company-orders').textContent =
                'A consulta das ordens está suspensa até a regularização do acesso.';
            return;
        }

        const membersContainer = document.getElementById('company-members');
        try {
            const { members } = await apiRequest('/api/members');
            membersContainer.replaceChildren();
            for (const member of members) {
                const row = document.createElement('p');
                row.className = 'rounded border border-slate-200 p-3';
                row.textContent = `${member.name} — ${member.email} (${member.role === 'manager' ? 'gestor' : 'colaborador'})`;
                membersContainer.append(row);
            }
        } catch (error) {
            console.error('Não foi possível carregar os colaboradores:', error);
            membersContainer.textContent = `Não foi possível carregar a equipe: ${error.message}`;
        }

        const ordersContainer = document.getElementById('company-orders');
        try {
            const { orders } = await apiRequest(`/api/orders?companyId=${encodeURIComponent(company.id)}`);
            ordersContainer.replaceChildren();
            if (!orders.length) {
                ordersContainer.textContent = 'Ainda não há ordens de serviço cadastradas.';
                return;
            }
            for (const order of orders) {
                const row = document.createElement('article');
                row.className = 'flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 p-3';
                const details = document.createElement('div');
                const title = document.createElement('p');
                title.className = 'font-medium';
                title.textContent = `${order.osNumber ? `O.S. ${order.osNumber} — ` : ''}${order.data['input-titulo'] || 'Ordem sem título'}`;
                const summary = document.createElement('p');
                summary.className = 'text-sm text-slate-600';
                summary.textContent = `${order.data['input-local'] || 'Sem cliente/local'} · ${order.data['input-solicitante'] || 'Sem solicitante'} · ${order.createdBy?.name || order.createdBy?.email || 'Colaborador'} · ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.updatedAt))}`;
                details.append(title, summary);

                const numberForm = document.createElement('form');
                numberForm.className = 'flex items-center gap-2';
                const numberInput = document.createElement('input');
                numberInput.className = 'form-input w-32';
                numberInput.maxLength = 30;
                numberInput.placeholder = 'Nº da O.S.';
                numberInput.value = order.osNumber || '';
                numberInput.setAttribute('aria-label', 'Número da O.S.');
                const numberButton = document.createElement('button');
                numberButton.type = 'submit';
                numberButton.className = 'btn-secondary';
                numberButton.textContent = 'Salvar nº';
                const numberMessage = document.createElement('span');
                numberMessage.className = 'text-xs';
                numberMessage.setAttribute('role', 'status');
                numberForm.append(numberInput, numberButton, numberMessage);
                numberForm.addEventListener('submit', async event => {
                    event.preventDefault();
                    numberButton.disabled = true;
                    try {
                        const result = await apiRequest('/api/orders', {
                            method: 'PATCH',
                            body: { id: order.id, osNumber: numberInput.value }
                        });
                        order.osNumber = result.order.osNumber;
                        title.textContent = `${order.osNumber ? `O.S. ${order.osNumber} — ` : ''}${order.data['input-titulo'] || 'Ordem sem título'}`;
                        setMessage(numberMessage, 'Salvo.');
                    } catch (error) {
                        setMessage(numberMessage, error.message || 'Não foi possível salvar.', true);
                    } finally {
                        numberButton.disabled = false;
                    }
                });

                const openLink = document.createElement('a');
                openLink.className = 'btn-secondary';
                openLink.href = `index.html?order=${encodeURIComponent(order.id)}`;
                openLink.textContent = 'Abrir / editar';
                const actions = document.createElement('div');
                actions.className = 'flex flex-wrap items-center gap-2';
                actions.append(numberForm, openLink);
                row.append(details, actions);
                ordersContainer.append(row);
            }
        } catch (error) {
            console.error('Não foi possível carregar as ordens da empresa:', error);
            ordersContainer.textContent = `Não foi possível carregar as ordens: ${error.message}`;
        }
    }

    async function createCompany() {
        const name = document.getElementById('setup-company-name').value.trim();
        if (name.length < 2 || name.length > 160) {
            setMessage(companySetupMessage, 'Informe um nome de empresa entre 2 e 160 caracteres.', true);
            return;
        }
        try {
            await apiRequest('/api/company', { method: 'POST', body: { name } });
            setMessage(companySetupMessage, '');
            sessionStorage.removeItem('manager-company-name');
            companySetup.classList.add('hidden');
            await loadCompany();
            setMessage(inviteMessage, 'Empresa criada. O período de teste de 30 dias começou.');
        } catch (error) {
            setMessage(companySetupMessage, error.message, true);
        }
    }

    if (!initNeonAuth()) {
        setMessage(authMessage, 'O acesso ainda não foi configurado. Contate o administrador do sistema.', true);
        document.getElementById('manager-login').disabled = true;
        document.getElementById('manager-signup').disabled = true;
        return;
    }

    document.getElementById('manager-signup').addEventListener('click', () => {
        signupFields.classList.remove('hidden');
    });

    authForm.addEventListener('submit', async event => {
        event.preventDefault();
        const action = event.submitter?.dataset.authAction;
        const email = document.getElementById('manager-email').value.trim();
        const password = document.getElementById('manager-password').value;
        const signup = action === 'signup';
        const name = document.getElementById('manager-name').value.trim();
        const companyName = document.getElementById('company-name').value.trim();

        if (signup && (!name || name.length > 160 || companyName.length < 2 || companyName.length > 160)) {
            setMessage(authMessage, 'Informe seu nome e um nome de empresa válido.', true);
            return;
        }
        if (signup && password.length < 8) {
            setMessage(authMessage, 'A senha precisa ter pelo menos 8 caracteres.', true);
            return;
        }

        const buttons = authForm.querySelectorAll('button[type="submit"]');
        buttons.forEach(button => { button.disabled = true; });
        setMessage(authMessage, signup ? 'Criando sua conta…' : 'Verificando seu acesso…');
        try {
            const result = signup
                ? await handleSignup(email, password, name)
                : await handleLogin(email, password);

            if (signup) {
                sessionStorage.setItem('manager-company-name', companyName);
                document.getElementById('setup-company-name').value = companyName;
                if (result.user?.emailVerified === true) {
                    await createCompany();
                } else {
                    showVerification(email);
                    await sendEmailVerificationCode(email);
                    setMessage(verificationMessage, 'Enviamos um código de confirmação para seu e-mail.');
                }
            } else if (result.user?.emailVerified === true) {
                await loadCompany();
            } else {
                showVerification(email);
                await sendEmailVerificationCode(email);
                setMessage(verificationMessage, 'Esta conta ainda não confirmou o e-mail. Enviamos um código.');
            }
        } catch (error) {
            console.error('Falha no acesso do gestor:', error);
            const message = signup && /user already exists/i.test(error?.message || '')
                ? 'Este e-mail já tem uma conta no Neon Auth configurado. Se a conta for sua, use Entrar. Se você nunca a criou, confira se o e-mail está correto e se o Neon Auth está apontando para o projeto esperado.'
                : error.message || 'Não foi possível concluir o acesso.';
            setMessage(authMessage, message, true);
        } finally {
            buttons.forEach(button => { button.disabled = false; });
        }
    });

    document.getElementById('manager-verify').addEventListener('click', async () => {
        const otp = document.getElementById('manager-otp').value.trim();
        if (!verificationEmail || !/^\d{6}$/.test(otp)) {
            setMessage(verificationMessage, 'Digite o código de 6 dígitos enviado para seu e-mail.', true);
            return;
        }
        try {
            await verifyEmailCode(verificationEmail, otp);
            const session = await getCurrentSession();
            if (session?.user?.emailVerified !== true || !session?.session) {
                verification.classList.add('hidden');
                authForm.classList.remove('hidden');
                setMessage(authMessage, 'E-mail confirmado. Entre com seu e-mail e senha para continuar.');
                return;
            }
            const companyName = sessionStorage.getItem('manager-company-name');
            if (companyName) {
                document.getElementById('setup-company-name').value = companyName;
            }
            verification.classList.add('hidden');
            companySetup.classList.remove('hidden');
            await createCompany();
        } catch (error) {
            setMessage(verificationMessage, error.message || 'Não foi possível confirmar o e-mail.', true);
        }
    });

    document.getElementById('manager-resend').addEventListener('click', async () => {
        try {
            await sendEmailVerificationCode(verificationEmail);
            setMessage(verificationMessage, 'Novo código enviado. Confira sua caixa de entrada e o spam.');
        } catch (error) {
            setMessage(verificationMessage, error.message || 'Não foi possível enviar o código.', true);
        }
    });

    document.getElementById('create-company').addEventListener('click', createCompany);

    document.getElementById('license-form').addEventListener('submit', async event => {
        event.preventDefault();
        const licenseMessage = document.getElementById('license-message');
        const submitButton = event.currentTarget.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        setMessage(licenseMessage, 'Validando o código…');
        try {
            await apiRequest('/api/license', {
                method: 'POST',
                body: { code: document.getElementById('license-code').value }
            });
            document.getElementById('license-code').value = '';
            await loadCompany();
            setMessage(licenseMessage, 'Licença ativada com sucesso.');
        } catch (error) {
            setMessage(licenseMessage, error.message || 'Não foi possível ativar a licença.', true);
        } finally {
            submitButton.disabled = false;
        }
    });

    document.getElementById('invite-form').addEventListener('submit', async event => {
        event.preventDefault();
        const email = document.getElementById('invite-email').value.trim();
        const submitButton = event.currentTarget.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        setMessage(inviteMessage, 'Gerando convite…');
        try {
            const result = await apiRequest('/api/invitations', {
                method: 'POST',
                body: { email }
            });
            const link = new URL('index.html', window.location.href);
            link.searchParams.set('invite', result.token);
            document.getElementById('invite-link').value = link.href;
            document.getElementById('invite-result').classList.remove('hidden');
            document.getElementById('invite-email').value = '';
            setMessage(inviteMessage, `Convite válido até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(result.invitation.expires_at))}.`);
            const { members } = await apiRequest('/api/members');
            const membersContainer = document.getElementById('company-members');
            membersContainer.replaceChildren();
            for (const member of members) {
                const row = document.createElement('p');
                row.className = 'rounded border border-slate-200 p-3';
                row.textContent = `${member.name} — ${member.email} (${member.role === 'manager' ? 'gestor' : 'colaborador'})`;
                membersContainer.append(row);
            }
        } catch (error) {
            setMessage(inviteMessage, error.message || 'Não foi possível gerar o convite.', true);
        } finally {
            submitButton.disabled = false;
        }
    });

    document.getElementById('copy-invite').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(document.getElementById('invite-link').value);
            setMessage(inviteMessage, 'Link copiado. Envie-o somente ao colaborador convidado.');
        } catch (error) {
            console.error('Não foi possível copiar o convite:', error);
            setMessage(inviteMessage, 'Não foi possível copiar automaticamente. Selecione e copie o link manualmente.', true);
        }
    });

    document.getElementById('manager-logout').addEventListener('click', async () => {
        try {
            await signOut();
            window.location.reload();
        } catch (error) {
            setMessage(inviteMessage, error.message || 'Não foi possível sair da conta.', true);
        }
    });

    try {
        const session = await getCurrentSession();
        if (session?.session && session?.user?.emailVerified === true) {
            await loadCompany();
        }
    } catch (error) {
        console.error('Não foi possível carregar a sessão do gestor:', error);
        setMessage(authMessage, error.message || 'Não foi possível verificar a sessão.', true);
    }
});
