import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import companyHandler from './api/company.js';
import adminHandler from './api/admin.js';
import locationsHandler from './api/locations.js';
import itemsHandler from './api/items.js';
import invitationsHandler from './api/invitations.js';
import licenseHandler from './api/license.js';
import membersHandler from './api/members.js';
import ordersHandler from './api/orders.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 3000);
const maxBodyBytes = 2_000_000;
const apiHandlers = new Map([
    ['/api/admin', adminHandler],
    ['/api/company', companyHandler],
    ['/api/invitations', invitationsHandler],
    ['/api/license', licenseHandler],
    ['/api/locations', locationsHandler],
    ['/api/items', itemsHandler],
    ['/api/members', membersHandler],
    ['/api/orders', ordersHandler]
]);

function sendJson(res, statusCode, data) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
}

async function parseBody(req) {
    if (req.method === 'GET' || req.method === 'HEAD') return undefined;
    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().includes('application/json')) {
        const error = new Error('O corpo da solicitação precisa estar em JSON.');
        error.statusCode = 415;
        throw error;
    }

    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBodyBytes) {
            const error = new Error('O corpo da solicitação excede o limite permitido.');
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }
    if (!size) return {};

    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        const error = new Error('O corpo da solicitação contém JSON inválido.');
        error.statusCode = 400;
        throw error;
    }
}

function getPublicFile(pathname) {
    if (pathname === '/') return resolve(root, 'index.html');
    if (!['/index.html', '/gestor.html', '/admin.html'].includes(pathname)
        && !pathname.startsWith('/css/')
        && !pathname.startsWith('/js/')) {
        return null;
    }
    const filePath = resolve(root, `.${pathname}`);
    return filePath.startsWith(`${root}${sep}`) ? filePath : null;
}

function contentTypeFor(pathname) {
    const types = {
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.ico': 'image/x-icon',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
    };
    return types[extname(pathname).toLowerCase()] || 'application/octet-stream';
}

const server = createServer(async (req, res) => {
    let url;
    try {
        url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
        sendJson(res, 400, { message: 'Endereço de solicitação inválido.' });
        return;
    }

    const apiHandler = apiHandlers.get(url.pathname);
    if (apiHandler) {
        try {
            const body = await parseBody(req);
            req.query = Object.fromEntries(url.searchParams);
            req.body = body;
            res.status = statusCode => {
                res.statusCode = statusCode;
                return res;
            };
            res.json = data => {
                sendJson(res, res.statusCode || 200, data);
                return res;
            };
            await apiHandler(req, res);
            if (!res.writableEnded) res.end();
        } catch (error) {
            if (error.statusCode) {
                sendJson(res, error.statusCode, { message: error.message });
            } else {
                console.error('Falha ao processar solicitação local:', error);
                sendJson(res, 500, { message: 'Não foi possível concluir a operação.' });
            }
        }
        return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        sendJson(res, 405, { message: 'Método não permitido.' });
        return;
    }

    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch {
        sendJson(res, 400, { message: 'Endereço de arquivo inválido.' });
        return;
    }
    const filePath = getPublicFile(pathname);
    if (!filePath) {
        sendJson(res, 404, { message: 'Arquivo não encontrado.' });
        return;
    }

    try {
        const contents = await readFile(filePath);
        res.statusCode = 200;
        res.setHeader('Content-Type', contentTypeFor(filePath));
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (req.method === 'HEAD') res.end();
        else res.end(contents);
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR') {
            sendJson(res, 404, { message: 'Arquivo não encontrado.' });
            return;
        }
        console.error('Falha ao servir arquivo local:', error);
        sendJson(res, 500, { message: 'Não foi possível carregar a página.' });
    }
});

server.listen(port, 'localhost', () => {
    console.log(`Desenvolvimento local: http://localhost:${port}`);
    console.log('API e páginas disponíveis localmente; nenhum deploy foi iniciado.');
});
