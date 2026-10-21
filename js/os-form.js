import { setupSignatureCanvas } from './canvas.js';
import { apiRequest } from './auth.js';

const fieldIds = [
    'input-data',
    'input-tipo',
    'input-status',
    'input-local',
    'input-solicitante',
    'input-titulo',
    'input-equipamentos',
    'input-diagnostico',
    'input-procedimentos'
];

const currency = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});

export function initServiceOrderForm(userId, companyId, requestedOrderId = '') {
    const form = document.getElementById('service-order-form');
    if (!form || form.dataset.initialized === 'true') return;
    form.dataset.initialized = 'true';

    const storageKey = `service-orders-drafts:${encodeURIComponent(userId || 'local')}`;
    const historyList = document.getElementById('history-list');
    const historySearch = document.getElementById('history-search');
    const budgetItemsContainer = document.getElementById('budget-items');
    const message = document.getElementById('form-message');
    let orders = [];
    let activeOrderId = null;
    let storageAvailable = true;
    const syncedOrderIds = new Set();

    function setMessage(text, isError = false) {
        message.textContent = text;
        message.classList.toggle('text-red-700', isError);
        message.classList.toggle('text-green-700', Boolean(text) && !isError);
    }

    function readOrders() {
        try {
            const saved = localStorage.getItem(storageKey);
            const parsed = saved ? JSON.parse(saved) : [];
            if (!Array.isArray(parsed) || parsed.some(order =>
                !order || typeof order.id !== 'string' || !order.data || typeof order.data !== 'object'
            )) {
                throw new Error('O histórico salvo não está no formato esperado.');
            }
            return parsed;
        } catch (error) {
            storageAvailable = false;
            console.error('Não foi possível carregar os rascunhos deste aparelho:', error);
            setMessage('Não foi possível ler o histórico local. Os dados não serão sobrescritos.', true);
            return [];
        }
    }

    function persistOrders() {
        if (!storageAvailable) {
            setMessage('O histórico local está indisponível; não foi possível salvar o rascunho.', true);
            return false;
        }

        try {
            localStorage.setItem(storageKey, JSON.stringify(orders));
            return true;
        } catch (error) {
            console.error('Não foi possível salvar o rascunho neste aparelho:', error);
            setMessage('Falha ao salvar neste aparelho. Verifique o espaço disponível no navegador.', true);
            return false;
        }
    }

    function readFormData() {
        const data = {};
        for (const id of fieldIds) data[id] = document.getElementById(id).value.trim();
        data.budgetItems = [...budgetItemsContainer.querySelectorAll('.budget-row')].map(row => ({
            description: row.querySelector('[data-budget-description]').value.trim(),
            quantity: Number(row.querySelector('[data-budget-quantity]').value) || 0,
            unitPrice: Number(row.querySelector('[data-budget-price]').value) || 0
        })).filter(item => item.description);
        data.signatures = {
            technician: getSignatureData('canvas-tec'),
            customer: getSignatureData('canvas-cli')
        };
        data.photos = [...photos];
        return data;
    }

    const MAX_PHOTOS = 6;
    const PHOTO_MAX_SIDE = 1000;
    let photos = [];

    function resizePhoto(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => {
                URL.revokeObjectURL(url);
                const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(image.width, image.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(image.width * scale);
                canvas.height = Math.round(image.height * scale);
                canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.65));
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Não foi possível ler a imagem.'));
            };
            image.src = url;
        });
    }

    function renderPhotoList() {
        const list = document.getElementById('photo-list');
        list.replaceChildren();
        photos.forEach((src, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'relative';
            const image = document.createElement('img');
            image.src = src;
            image.alt = `Foto ${index + 1} do serviço`;
            image.className = 'h-20 w-full rounded object-cover';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'absolute right-1 top-1 rounded bg-white/90 px-1.5 text-xs font-bold text-red-700 shadow';
            remove.textContent = '✕';
            remove.setAttribute('aria-label', `Remover foto ${index + 1}`);
            remove.addEventListener('click', () => {
                photos = photos.filter((_, photoIndex) => photoIndex !== index);
                renderPhotoList();
                updatePreview();
            });
            wrapper.append(image, remove);
            list.append(wrapper);
        });
    }

    function setPhotos(list) {
        photos = Array.isArray(list)
            ? list.filter(src => typeof src === 'string' && src.startsWith('data:image/')).slice(0, MAX_PHOTOS)
            : [];
        renderPhotoList();
    }

    async function addPhotos(files) {
        const room = MAX_PHOTOS - photos.length;
        if (room <= 0) {
            setMessage(`Limite de ${MAX_PHOTOS} fotos por ordem.`, true);
            return;
        }
        try {
            for (const file of [...files].slice(0, room)) {
                if (file.type.startsWith('image/')) photos.push(await resizePhoto(file));
            }
            if (files.length > room) setMessage(`Só cabem ${MAX_PHOTOS} fotos por ordem; as extras foram ignoradas.`, true);
        } catch (error) {
            setMessage(error.message, true);
        }
        renderPhotoList();
        updatePreview();
    }

    function buildWhatsAppText() {
        const data = readFormData();
        const number = document.getElementById('input-os-num').value;
        const lines = [`*Ordem de Serviço* ${number === OS_NUMBER_PLACEHOLDER ? '' : `nº ${number}`}`.trim()];
        const add = (label, value) => { if (value) lines.push(`*${label}:* ${value}`); };
        add('Data', formatDate(data['input-data']));
        add('Tipo', data['input-tipo']);
        add('Status', data['input-status']);
        add('Cliente/local', data['input-local']);
        add('Solicitante', data['input-solicitante']);
        add('Serviço', data['input-titulo']);
        add('Equipamentos', data['input-equipamentos']);
        add('Diagnóstico', data['input-diagnostico']);
        add('Procedimentos', data['input-procedimentos']);
        if (data.budgetItems.length) add('Total', currency.format(getBudgetTotal(data.budgetItems)));
        return lines.join('\n');
    }

    async function shareToWhatsApp() {
        const text = buildWhatsAppText();
        const files = await Promise.all(photos.map(async (src, index) => {
            const blob = await (await fetch(src)).blob();
            return new File([blob], `foto-${index + 1}.jpg`, { type: 'image/jpeg' });
        }));
        if (files.length && navigator.canShare?.({ files })) {
            try {
                await navigator.share({ text, files });
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;
            }
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        if (files.length) setMessage('As fotos não podem ser anexadas automaticamente neste aparelho; anexe-as no WhatsApp.');
    }

    function getSignatureData(canvasId) {
        const canvas = document.getElementById(canvasId);
        return canvas.dataset.hasInk === 'true' ? canvas.toDataURL() : '';
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? value
            : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
    }

    function getBudgetTotal(items) {
        return items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
    }

    function updatePreview() {
        const data = readFormData();
        const previewValues = {
            'prev-data': formatDate(data['input-data']),
            'prev-tipo': data['input-tipo'] || '—',
            'prev-status': data['input-status'] || '—',
            'prev-local': data['input-local'] || '—',
            'prev-solicitante': data['input-solicitante'] || '—',
            'prev-titulo': data['input-titulo'] || '—',
            'prev-equipamentos': data['input-equipamentos'] || '—',
            'prev-diagnostico': data['input-diagnostico'] || '—',
            'prev-procedimentos': data['input-procedimentos'] || '—'
        };

        for (const [id, value] of Object.entries(previewValues)) {
            document.getElementById(id).textContent = value;
        }

        const previewBudget = document.getElementById('prev-budget-items');
        previewBudget.replaceChildren();
        for (const item of data.budgetItems) {
            const line = document.createElement('p');
            line.textContent = `${item.description} — ${item.quantity} x ${currency.format(item.unitPrice)}`;
            previewBudget.append(line);
        }

        const total = currency.format(getBudgetTotal(data.budgetItems));
        document.getElementById('budget-total').textContent = total;
        document.getElementById('prev-budget-total').textContent = total;
        updateSignaturePreview('canvas-tec', 'prev-sig-tec');
        updateSignaturePreview('canvas-cli', 'prev-sig-cli');

        const previewPhotos = document.getElementById('prev-photos');
        previewPhotos.replaceChildren();
        for (const src of data.photos) {
            const image = document.createElement('img');
            image.src = src;
            image.alt = 'Foto do serviço';
            image.className = 'h-28 w-full rounded object-cover';
            previewPhotos.append(image);
        }
        document.getElementById('prev-photos-section').classList.toggle('hidden', !data.photos.length);
    }

    function updateSignaturePreview(canvasId, imageId) {
        const canvas = document.getElementById(canvasId);
        const image = document.getElementById(imageId);
        const hasInk = canvas.dataset.hasInk === 'true';
        image.classList.toggle('hidden', !hasInk);
        image.src = hasInk ? canvas.toDataURL() : '';
    }

    function updateHistory() {
        const search = historySearch.value.trim().toLocaleLowerCase('pt-BR');
        const matches = orders.filter(order => {
            const data = order.data;
            const searchable = [
                data['input-local'],
                data['input-solicitante'],
                data['input-titulo'],
                data['input-procedimentos']
            ].join(' ').toLocaleLowerCase('pt-BR');
            return searchable.includes(search);
        });

        historyList.replaceChildren();
        if (!matches.length) {
            const empty = document.createElement('p');
            empty.className = 'rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500';
            empty.textContent = search ? 'Nenhuma ordem encontrada.' : 'Ainda não há ordens salvas.';
            historyList.append(empty);
            return;
        }

        for (const order of matches) {
            const card = document.createElement('article');
            card.className = 'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm';
            const details = document.createElement('div');
            const title = document.createElement('h3');
            title.className = 'font-semibold text-slate-800';
            title.textContent = order.data['input-titulo'] || 'Ordem sem título';
            const summary = document.createElement('p');
            summary.className = 'mt-1 text-sm text-slate-500';
            summary.textContent = `${order.data['input-local'] || 'Sem cliente/local'} · ${formatDate(order.data['input-data'])}`;
            details.append(title, summary);

            const actions = document.createElement('div');
            actions.className = 'flex gap-2';
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'btn-secondary';
            editButton.textContent = 'Abrir';
            editButton.addEventListener('click', () => loadOrder(order.id));
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn-secondary text-red-700';
            deleteButton.textContent = 'Excluir';
            deleteButton.addEventListener('click', () => deleteOrder(order.id));
            actions.append(editButton, deleteButton);
            card.append(details, actions);
            historyList.append(card);
        }
    }

    function addBudgetItem(item = {}) {
        const row = document.createElement('div');
        row.className = 'budget-row';

        const description = document.createElement('input');
        description.type = 'text';
        description.className = 'form-input';
        description.placeholder = 'Descrição do material/serviço';
        description.setAttribute('aria-label', 'Descrição do item');
        description.dataset.budgetDescription = '';
        description.value = item.description || '';

        const quantity = document.createElement('input');
        quantity.type = 'number';
        quantity.className = 'form-input';
        quantity.min = '0';
        quantity.step = '1';
        quantity.value = String(item.quantity ?? 1);
        quantity.setAttribute('aria-label', 'Quantidade');
        quantity.dataset.budgetQuantity = '';

        const price = document.createElement('input');
        price.type = 'number';
        price.className = 'form-input';
        price.min = '0';
        price.step = '0.01';
        price.placeholder = '0,00';
        price.value = item.unitPrice ? String(item.unitPrice) : '';
        price.setAttribute('aria-label', 'Valor unitário');
        price.dataset.budgetPrice = '';

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700';
        removeButton.setAttribute('aria-label', 'Remover item');
        removeButton.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
        removeButton.addEventListener('click', () => {
            row.remove();
            updatePreview();
        });

        for (const input of [description, quantity, price]) {
            input.addEventListener('input', updatePreview);
        }

        row.append(description, quantity, price, removeButton);
        budgetItemsContainer.append(row);
        updatePreview();
    }

    async function syncOrder(order) {
        try {
            const result = await apiRequest('/api/orders', {
                method: 'POST',
                body: { id: order.id, data: order.data }
            });
            syncedOrderIds.add(order.id);
            const assigned = result?.order?.osNumber;
            if (assigned && assigned !== order.osNumber) {
                order.osNumber = assigned;
                orders = orders.map(item => item.id === order.id ? { ...item, osNumber: assigned } : item);
                persistOrders();
                updateHistory();
                if (activeOrderId === order.id) showOsNumber(assigned);
            }
            return true;
        } catch (error) {
            console.error('A ordem foi salva localmente, mas não sincronizou com o Neon:', error);
            setMessage(`Rascunho salvo neste aparelho, mas não foi sincronizado: ${error.message}`, true);
            return false;
        }
    }

    async function loadRemoteOrders() {
        try {
            const result = await apiRequest(`/api/orders?companyId=${encodeURIComponent(companyId)}`);
            const remoteOrders = result.orders;
            if (!Array.isArray(remoteOrders)) {
                throw new Error('O servidor retornou um histórico inválido.');
            }

            const merged = new Map(remoteOrders.map(order => [order.id, order]));
            for (const order of orders) {
                const remote = merged.get(order.id);
                if (!remote || new Date(order.updatedAt).getTime() > new Date(remote.updatedAt).getTime()) {
                    merged.set(order.id, { ...order, osNumber: remote?.osNumber ?? order.osNumber });
                }
            }
            orders = [...merged.values()].sort((left, right) =>
                new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
            );
            for (const order of remoteOrders) syncedOrderIds.add(order.id);
            if (!persistOrders()) return;
            updateHistory();

            const remoteById = new Map(remoteOrders.map(order => [order.id, order]));
            let allLocalChangesSynced = true;
            for (const order of orders) {
                const remote = remoteById.get(order.id);
                if (!remote || new Date(order.updatedAt).getTime() > new Date(remote.updatedAt).getTime()) {
                    if (!await syncOrder(order)) allLocalChangesSynced = false;
                }
            }
            if (requestedOrderId) loadOrder(requestedOrderId);
            if (allLocalChangesSynced) {
                setMessage('Ordens sincronizadas com a empresa.');
            }
        } catch (error) {
            console.error('Não foi possível sincronizar as ordens com o Neon:', error);
            setMessage(`As ordens remotas não foram carregadas; os rascunhos locais foram preservados. ${error.message}`, true);
        }
    }

    async function refreshOsNumbers() {
        if (!companyId || document.hidden) return;
        try {
            const result = await apiRequest(`/api/orders?companyId=${encodeURIComponent(companyId)}`);
            if (!Array.isArray(result.orders)) return;
            const numbers = new Map(result.orders.map(order => [order.id, order.osNumber]));
            let changed = false;
            orders = orders.map(order => {
                const osNumber = numbers.get(order.id);
                if (osNumber && osNumber !== order.osNumber) {
                    changed = true;
                    return { ...order, osNumber };
                }
                return order;
            });
            if (!changed) return;
            persistOrders();
            updateHistory();
            const active = orders.find(order => order.id === activeOrderId);
            if (active) showOsNumber(active.osNumber);
        } catch (error) {
            console.error('Não foi possível atualizar os números das O.S.:', error);
        }
    }

    async function saveOrder(event) {
        event.preventDefault();
        const previousOrders = orders;
        const existingIndex = orders.findIndex(order => order.id === activeOrderId);
        const order = {
            id: activeOrderId || (typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
            data: readFormData(),
            osNumber: orders[existingIndex]?.osNumber,
            updatedAt: new Date().toISOString()
        };

        orders = [...orders];
        if (existingIndex >= 0) orders[existingIndex] = order;
        else orders.unshift(order);

        if (!persistOrders()) {
            orders = previousOrders;
            return;
        }
        activeOrderId = order.id;
        updateHistory();
        if (await syncOrder(order)) {
            setMessage('Ordem salva e sincronizada com a empresa.');
        }
    }

    function loadOrder(orderId) {
        const order = orders.find(item => item.id === orderId);
        if (!order) {
            setMessage('Esse rascunho não foi encontrado no histórico local.', true);
            return;
        }

        activeOrderId = order.id;
        for (const id of fieldIds) document.getElementById(id).value = order.data[id] || '';
        budgetItemsContainer.replaceChildren();
        for (const item of order.data.budgetItems || []) addBudgetItem(item);
        restoreSignature('canvas-tec', order.data.signatures?.technician);
        restoreSignature('canvas-cli', order.data.signatures?.customer);
        setPhotos(order.data.photos);
        updatePreview();
        showOsNumber(order.osNumber);
        document.querySelector('[data-tab="tab-nova-os"]').click();
        setMessage('Rascunho carregado. Ao salvar, as alterações substituirão esta cópia local.');
    }

    function restoreSignature(canvasId, dataUrl) {
        const canvas = document.getElementById(canvasId);
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        canvas.dataset.hasInk = 'false';
        if (!dataUrl) return;

        const image = new Image();
        image.onload = () => {
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            canvas.dataset.hasInk = 'true';
            updatePreview();
        };
        image.onerror = () => setMessage('Não foi possível carregar uma assinatura salva.', true);
        image.src = dataUrl;
    }

    async function deleteOrder(orderId) {
        if (!window.confirm('Excluir esta ordem de serviço da empresa?')) return;
        const previousOrders = orders;
        orders = orders.filter(order => order.id !== orderId);
        if (!persistOrders()) {
            orders = previousOrders;
            return;
        }

        if (syncedOrderIds.has(orderId)) {
            try {
                await apiRequest('/api/orders', {
                    method: 'DELETE',
                    body: { id: orderId }
                });
                syncedOrderIds.delete(orderId);
            } catch (error) {
                if (error.status === 404) {
                    syncedOrderIds.delete(orderId);
                } else {
                    orders = previousOrders;
                    persistOrders();
                    console.error('Não foi possível excluir a ordem sincronizada:', error);
                    setMessage(`A ordem não foi excluída da empresa: ${error.message}`, true);
                    return;
                }
            }
        }
        if (activeOrderId === orderId) activeOrderId = null;
        updateHistory();
        setMessage('Ordem excluída da empresa e deste aparelho.');
    }

    const OS_NUMBER_PLACEHOLDER = 'Atribuído pelo usuário master';

    function showOsNumber(osNumber) {
        const text = osNumber || OS_NUMBER_PLACEHOLDER;
        document.getElementById('input-os-num').value = text;
        document.getElementById('prev-os-num').textContent = text;
    }

    function resetForm() {
        form.reset();
        activeOrderId = null;
        showOsNumber(null);
        document.getElementById('input-data').value = getCurrentDateTime();
        budgetItemsContainer.replaceChildren();
        setPhotos([]);
        for (const canvasId of ['canvas-tec', 'canvas-cli']) {
            const canvas = document.getElementById(canvasId);
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            canvas.dataset.hasInk = 'false';
            canvas.dispatchEvent(new CustomEvent('signaturechange'));
        }
        updatePreview();
        setMessage('Formulário limpo. A numeração da O.S. será definida pelo usuário master.');
    }

    function getCurrentDateTime() {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 16);
    }

    setupSignatureCanvas('canvas-tec', 'btn-clear-tec');
    setupSignatureCanvas('canvas-cli', 'btn-clear-cli');
    for (const canvasId of ['canvas-tec', 'canvas-cli']) {
        document.getElementById(canvasId).addEventListener('signaturechange', updatePreview);
    }
    for (const id of fieldIds) {
        document.getElementById(id).addEventListener('input', updatePreview);
        document.getElementById(id).addEventListener('change', updatePreview);
    }

    form.addEventListener('submit', saveOrder);
    document.getElementById('btn-add-budget-item').addEventListener('click', () => addBudgetItem());
    document.getElementById('btn-reset-os').addEventListener('click', resetForm);
    document.getElementById('btn-print-os').addEventListener('click', () => {
        updatePreview();
        window.print();
    });
    historySearch.addEventListener('input', updateHistory);

    document.getElementById('input-data').value = getCurrentDateTime();
    orders = readOrders();
    updateHistory();
    updatePreview();
    void loadRemoteOrders();
    document.getElementById('input-photos').addEventListener('change', event => {
        void addPhotos(event.target.files).then(() => { event.target.value = ''; });
    });
    document.getElementById('btn-whatsapp-os').addEventListener('click', () => void shareToWhatsApp());
    document.addEventListener('visibilitychange', refreshOsNumbers);
    setInterval(refreshOsNumbers, 30000);
}
