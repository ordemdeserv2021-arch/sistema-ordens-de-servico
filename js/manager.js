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

    const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const dashboardSections = () => [...document.getElementById('manager-dashboard').children]
        .filter(element => element.id !== 'order-viewer');

    function setViewText(id, value) {
        document.getElementById(id).textContent = value || '—';
    }

    function setViewSignature(id, dataUrl) {
        const image = document.getElementById(id);
        const valid = typeof dataUrl === 'string' && /^data:image\/(png|jpeg);base64,/.test(dataUrl);
        image.classList.toggle('hidden', !valid);
        image.src = valid ? dataUrl : '';
    }

    function showOrder(order, companyName) {
        const data = order.data || {};
        const date = data['input-data'] ? new Date(data['input-data']) : null;
        setViewText('view-company', companyName);
        setViewText('view-numero', order.osNumber);
        setViewText('view-data', date && !Number.isNaN(date.getTime())
            ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
            : '');
        setViewText('view-tipo', data['input-tipo']);
        setViewText('view-status', data['input-status']);
        setViewText('view-local', data['input-local']);
        setViewText('view-solicitante', data['input-solicitante']);
        setViewText('view-titulo', data['input-titulo']);
        setViewText('view-criador', order.createdBy?.name || order.createdBy?.email);
        setViewText('view-equipamentos', data['input-equipamentos']);
        setViewText('view-diagnostico', data['input-diagnostico']);
        setViewText('view-procedimentos', data['input-procedimentos']);

        const budgetContainer = document.getElementById('view-budget-items');
        budgetContainer.replaceChildren();
        let total = 0;
        for (const item of Array.isArray(data.budgetItems) ? data.budgetItems : []) {
            const quantity = Number(item.quantity) || 0;
            const unitPrice = Number(item.unitPrice) || 0;
            total += quantity * unitPrice;
            const line = document.createElement('p');
            line.textContent = `${item.description} — ${quantity} x ${currency.format(unitPrice)}`;
            budgetContainer.append(line);
        }
        document.getElementById('view-budget-total').textContent = currency.format(total);
        setViewSignature('view-sig-tec', data.signatures?.technician);
        setViewSignature('view-sig-cli', data.signatures?.customer);

        const photoContainer = document.getElementById('view-photos');
        photoContainer.replaceChildren();
        const photos = (Array.isArray(data.photos) ? data.photos : [])
            .filter(src => typeof src === 'string' && /^data:image\/(jpeg|png);base64,/.test(src));
        for (const src of photos) {
            const image = document.createElement('img');
            image.src = src;
            image.alt = 'Foto do serviço';
            image.className = 'h-28 w-full rounded object-cover';
            photoContainer.append(image);
        }
        document.getElementById('view-photos-section').classList.toggle('hidden', !photos.length);

        for (const section of dashboardSections()) section.classList.add('hidden');
        document.getElementById('order-viewer').classList.remove('hidden');
        window.scrollTo(0, 0);
    }

    function closeOrderViewer() {
        document.getElementById('order-viewer').classList.add('hidden');
        for (const section of dashboardSections()) section.classList.remove('hidden');
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
        const nextNumber = company.os_next_number;
        document.getElementById('numbering-status').textContent = nextNumber === null || nextNumber === undefined
            ? 'Desativada. Defina o número da próxima O.S. e o sistema numera as seguintes sozinho (+1 a cada ordem nova).'
            : `Ativa. A próxima ordem nova receberá o nº ${nextNumber}. Você ainda pode corrigir o número de uma ordem na lista.`;
        document.getElementById('numbering-start').value = nextNumber ?? '';
        document.getElementById('numbering-disable').classList.toggle('hidden', nextNumber === null || nextNumber === undefined);
        if (!hasAccess) {
            const membersContainer = document.getElementById('company-members');
            membersContainer.textContent = 'O período de acesso terminou. Fale com o administrador do sistema para renovar.';
            document.getElementById('member-count').textContent = '';
            return;
        }

        await loadMembers(company);
    }

    let members = [];
    let companyName = '';

    function makeEl(tag, className = '', text = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    async function loadMembers(company) {
        companyName = company.name;
        const membersContainer = document.getElementById('company-members');
        try {
            ({ members } = await apiRequest('/api/members'));
            renderMembers();
        } catch (error) {
            console.error('Não foi possível carregar os colaboradores:', error);
            membersContainer.textContent = `Não foi possível carregar a equipe: ${error.message}`;
        }
    }

    function renderMembers() {
        const container = document.getElementById('company-members');
        const term = document.getElementById('member-search').value.trim().toLowerCase();
        const visible = members.filter(member =>
            !term || `${member.displayName || ''} ${member.registration || ''} ${member.name} ${member.email}`
                .toLowerCase().includes(term));
        container.replaceChildren();
        document.getElementById('member-count').textContent =
            `${visible.length} de ${members.length} ${members.length === 1 ? 'pessoa' : 'pessoas'}`;
        if (!visible.length) {
            container.textContent = 'Nenhum colaborador encontrado.';
            return;
        }
        for (const member of visible) container.append(buildMemberCard(member));
    }

    function buildMemberCard(member) {
        const card = makeEl('article', 'rounded border border-slate-200');
        const header = makeEl('div', 'flex flex-wrap items-center justify-between gap-3 p-3');
        const info = makeEl('div');
        const title = makeEl('p', 'font-medium');
        const subtitle = makeEl('p', 'text-xs text-slate-600');
        const refreshHeader = () => {
            title.textContent = (member.displayName || member.name || member.email)
                + (member.registration ? ` · Matrícula ${member.registration}` : '');
            subtitle.textContent = `${member.email} · ${member.role === 'manager' ? 'gestor' : 'colaborador'}`;
        };
        refreshHeader();
        info.append(title, subtitle);
        const toggle = makeEl('button', 'btn-secondary', 'Gerenciar');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', 'false');
        const panel = makeEl('div', 'hidden space-y-5 border-t border-slate-200 p-3');
        let loaded = false;
        toggle.addEventListener('click', () => {
            const open = panel.classList.toggle('hidden') === false;
            toggle.textContent = open ? 'Fechar' : 'Gerenciar';
            toggle.setAttribute('aria-expanded', String(open));
            if (open && !loaded) {
                loaded = true;
                buildMemberPanel(member, panel, refreshHeader);
            }
        });
        header.append(info, toggle);
        card.append(header, panel);
        return card;
    }

    function buildMemberPanel(member, panel, refreshHeader) {
        const identitySection = makeEl('section', 'space-y-2');
        identitySection.append(makeEl('h3', 'font-semibold', 'Identificação'));
        const identityForm = makeEl('form', 'flex flex-wrap items-center gap-2');
        const displayNameInput = makeEl('input', 'form-input min-w-40 flex-1');
        displayNameInput.placeholder = 'Nome do colaborador';
        displayNameInput.maxLength = 120;
        displayNameInput.value = member.displayName || '';
        displayNameInput.setAttribute('aria-label', 'Nome do colaborador');
        const registrationInput = makeEl('input', 'form-input w-40');
        registrationInput.placeholder = 'Matrícula';
        registrationInput.maxLength = 40;
        registrationInput.value = member.registration || '';
        registrationInput.setAttribute('aria-label', 'Matrícula');
        const identityButton = makeEl('button', 'btn-primary', 'Salvar');
        identityButton.type = 'submit';
        identityForm.append(displayNameInput, registrationInput, identityButton);
        const identityMessage = makeEl('p', 'min-h-5 text-xs');
        identityMessage.setAttribute('role', 'status');
        identityForm.addEventListener('submit', async event => {
            event.preventDefault();
            identityButton.disabled = true;
            setMessage(identityMessage, 'Salvando…');
            try {
                const saved = await apiRequest('/api/members', {
                    method: 'PATCH',
                    body: {
                        userId: member.id,
                        displayName: displayNameInput.value,
                        registration: registrationInput.value
                    }
                });
                member.displayName = saved.displayName;
                member.registration = saved.registration;
                refreshHeader();
                setMessage(identityMessage, 'Identificação salva.');
            } catch (error) {
                setMessage(identityMessage, error.message || 'Não foi possível salvar.', true);
            } finally {
                identityButton.disabled = false;
            }
        });
        identitySection.append(identityForm, identityMessage);
        panel.append(identitySection);

        const locationsSection = makeEl('section', 'space-y-2');
        locationsSection.append(makeEl('h3', 'font-semibold', 'Locais de preventiva'));
        locationsSection.append(makeEl('p', 'text-xs text-slate-600',
            'Cada local tem a sua numeração (com prefixo opcional). Sem contador no local, vale a numeração geral da empresa.'));
        const locationList = makeEl('div', 'space-y-2');
        const addForm = makeEl('form', 'flex flex-wrap items-center gap-2');
        const nameInput = makeEl('input', 'form-input min-w-40 flex-1');
        nameInput.placeholder = 'Nome do local / cliente';
        nameInput.maxLength = 120;
        nameInput.required = true;
        const prefixInput = makeEl('input', 'form-input w-28');
        prefixInput.placeholder = 'Prefixo';
        prefixInput.maxLength = 10;
        const startInput = makeEl('input', 'form-input w-32');
        startInput.type = 'number';
        startInput.min = '0';
        startInput.placeholder = 'Nº inicial';
        const addButton = makeEl('button', 'btn-primary', 'Adicionar local');
        addButton.type = 'submit';
        addForm.append(nameInput, prefixInput, startInput, addButton);
        const locationMessage = makeEl('p', 'min-h-5 text-xs');
        locationMessage.setAttribute('role', 'status');
        locationsSection.append(locationList, addForm, locationMessage);

        const ordersSection = makeEl('section', 'space-y-2');
        const ordersHeader = makeEl('div', 'flex flex-wrap items-center justify-between gap-2');
        ordersHeader.append(makeEl('h3', 'font-semibold', 'Ordens de serviço'));
        const filter = makeEl('select', 'form-input w-auto');
        filter.setAttribute('aria-label', 'Filtrar ordens por local');
        ordersHeader.append(filter);
        const orderList = makeEl('div', 'space-y-2');
        ordersSection.append(ordersHeader, orderList);
        panel.append(locationsSection, ordersSection);

        async function loadOrders() {
            orderList.textContent = 'Carregando…';
            try {
                const query = new URLSearchParams({ userId: member.id });
                if (filter.value) query.set('locationId', filter.value);
                const { orders } = await apiRequest(`/api/orders?${query}`);
                orderList.replaceChildren();
                if (!orders.length) {
                    orderList.textContent = 'Nenhuma ordem de serviço encontrada.';
                    return;
                }
                for (const order of orders) orderList.append(buildOrderRow(order));
            } catch (error) {
                orderList.textContent = `Não foi possível carregar as ordens: ${error.message}`;
            }
        }

        async function loadLocations() {
            try {
                const { locations } = await apiRequest(`/api/locations?userId=${encodeURIComponent(member.id)}`);
                const selected = filter.value;
                filter.replaceChildren(new Option('Todos os locais', ''));
                locationList.replaceChildren();
                if (!locations.length) locationList.append(makeEl('p', 'text-xs text-slate-500', 'Nenhum local cadastrado.'));
                for (const location of locations) {
                    filter.append(new Option(location.name, location.id));
                    locationList.append(buildLocationRow(location));
                }
                filter.value = locations.some(location => location.id === selected) ? selected : '';
            } catch (error) {
                setMessage(locationMessage, error.message, true);
            }
        }

        function buildLocationRow(location) {
            const form = makeEl('form', 'flex flex-wrap items-center gap-2');
            const name = makeEl('input', 'form-input min-w-40 flex-1');
            name.value = location.name;
            name.maxLength = 120;
            name.required = true;
            name.setAttribute('aria-label', 'Nome do local');
            const prefix = makeEl('input', 'form-input w-28');
            prefix.value = location.prefix || '';
            prefix.maxLength = 10;
            prefix.placeholder = 'Prefixo';
            prefix.setAttribute('aria-label', 'Prefixo');
            const next = makeEl('input', 'form-input w-32');
            next.type = 'number';
            next.min = '0';
            next.value = location.nextNumber ?? '';
            next.placeholder = 'Próximo nº';
            next.setAttribute('aria-label', 'Próximo número');
            const save = makeEl('button', 'btn-secondary', 'Salvar');
            save.type = 'submit';
            const remove = makeEl('button', 'btn-secondary', 'Excluir');
            remove.type = 'button';
            form.append(name, prefix, next, save, remove);
            form.addEventListener('submit', async event => {
                event.preventDefault();
                save.disabled = true;
                try {
                    await apiRequest('/api/locations', {
                        method: 'PATCH',
                        body: { id: location.id, name: name.value, prefix: prefix.value, nextNumber: next.value }
                    });
                    setMessage(locationMessage, 'Local salvo.');
                    await loadLocations();
                } catch (error) {
                    setMessage(locationMessage, error.message, true);
                } finally {
                    save.disabled = false;
                }
            });
            remove.addEventListener('click', async () => {
                if (!confirm(`Excluir o local "${location.name}"? As ordens já criadas continuam com os números atuais.`)) return;
                try {
                    await apiRequest('/api/locations', { method: 'DELETE', body: { id: location.id } });
                    setMessage(locationMessage, 'Local excluído.');
                    await loadLocations();
                    await loadOrders();
                } catch (error) {
                    setMessage(locationMessage, error.message, true);
                }
            });
            return form;
        }

        addForm.addEventListener('submit', async event => {
            event.preventDefault();
            addButton.disabled = true;
            try {
                await apiRequest('/api/locations', {
                    method: 'POST',
                    body: {
                        userId: member.id,
                        name: nameInput.value,
                        prefix: prefixInput.value,
                        nextNumber: startInput.value
                    }
                });
                addForm.reset();
                setMessage(locationMessage, 'Local adicionado.');
                await loadLocations();
            } catch (error) {
                setMessage(locationMessage, error.message, true);
            } finally {
                addButton.disabled = false;
            }
        });
        filter.addEventListener('change', loadOrders);

        void loadLocations();
        void loadOrders();
    }

    function buildOrderRow(order) {
                const row = document.createElement('article');
                row.className = 'flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 p-3';
                const details = document.createElement('div');
                const title = document.createElement('p');
                title.className = 'font-medium';
                title.textContent = `${order.osNumber ? `O.S. ${order.osNumber} — ` : ''}${order.data['input-titulo'] || 'Ordem sem título'}`;
                const summary = document.createElement('p');
                summary.className = 'text-sm text-slate-600';
                summary.textContent = `${order.locationName ? `${order.locationName} · ` : ''}${order.data['input-local'] || 'Sem cliente/local'} · ${order.data['input-solicitante'] || 'Sem solicitante'} · ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.updatedAt))}`;
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

                const openLink = document.createElement('button');
                openLink.type = 'button';
                openLink.className = 'btn-secondary';
                openLink.textContent = 'Ver ordem';
                openLink.addEventListener('click', async () => {
                    openLink.disabled = true;
                    try {
                        const { orders } = await apiRequest(`/api/orders?id=${encodeURIComponent(order.id)}`);
                        if (!orders.length) throw new Error('A ordem não foi encontrada.');
                        showOrder(orders[0], companyName);
                    } catch (error) {
                        setMessage(numberMessage, error.message || 'Não foi possível abrir a ordem.', true);
                    } finally {
                        openLink.disabled = false;
                    }
                });
                const actions = document.createElement('div');
                actions.className = 'flex flex-wrap items-center gap-2';
                actions.append(numberForm, openLink);
                row.append(details, actions);
                return row;
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
    document.getElementById('order-viewer-back').addEventListener('click', closeOrderViewer);
    document.getElementById('member-search').addEventListener('input', renderMembers);
    document.getElementById('order-viewer-print').addEventListener('click', () => window.print());

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

    async function saveNumbering(value) {
        const numberingMessage = document.getElementById('numbering-message');
        setMessage(numberingMessage, 'Salvando…');
        try {
            await apiRequest('/api/company', { method: 'PATCH', body: { osNextNumber: value } });
            await loadCompany();
            setMessage(numberingMessage, value === null ? 'Numeração automática desativada.' : 'Numeração salva.');
        } catch (error) {
            setMessage(numberingMessage, error.message || 'Não foi possível salvar a numeração.', true);
        }
    }

    document.getElementById('numbering-form').addEventListener('submit', event => {
        event.preventDefault();
        void saveNumbering(Number(document.getElementById('numbering-start').value));
    });
    document.getElementById('numbering-disable').addEventListener('click', () => void saveNumbering(null));

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
            await loadMembers({ name: companyName });
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
