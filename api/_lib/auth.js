import { createRemoteJWKSet, jwtVerify } from 'jose';
import { neon } from '@neondatabase/serverless';

let remoteJwks;

function getDatabase() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL não está configurada no servidor.');
    }

    return neon(process.env.DATABASE_URL);
}

function getJwks() {
    const authUrl = process.env.NEON_AUTH_URL;
    if (!authUrl) {
        throw new Error('NEON_AUTH_URL não está configurada no servidor.');
    }

    if (!remoteJwks) {
        remoteJwks = createRemoteJWKSet(
            new URL(`${authUrl.replace(/\/+$/, '')}/.well-known/jwks.json`)
        );
    }

    return remoteJwks;
}

export async function requireUser(req) {
    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        const error = new Error('Entre novamente para continuar.');
        error.statusCode = 401;
        throw error;
    }

    const jwks = getJwks();
    let payload;
    try {
        ({ payload } = await jwtVerify(match[1], jwks, {
            requiredClaims: ['exp', 'sub', 'role']
        }));
    } catch (cause) {
        if (cause instanceof TypeError || cause.code === 'ERR_JWKS_TIMEOUT') {
            const error = new Error('O serviço de autenticação está temporariamente indisponível.');
            error.statusCode = 503;
            error.cause = cause;
            throw error;
        }
        const error = new Error('Sua sessão expirou. Entre novamente.');
        error.statusCode = 401;
        error.cause = cause;
        throw error;
    }

    if (typeof payload.sub !== 'string' || !payload.sub) {
        const error = new Error('A sessão não contém um usuário válido.');
        error.statusCode = 401;
        throw error;
    }
    if (payload.role !== 'authenticated') {
        const error = new Error('A sessão não tem permissão para acessar o sistema.');
        error.statusCode = 403;
        throw error;
    }

    const sql = getDatabase();
    const users = await sql`
        select id, email
        from neon_auth."user"
        where id = ${payload.sub} and "emailVerified" = true
        limit 1
    `;

    if (!users.length) {
        const error = new Error('Confirme seu e-mail antes de acessar o sistema.');
        error.statusCode = 403;
        throw error;
    }

    return { id: users[0].id, email: users[0].email, sql };
}

export function sendError(res, error) {
    if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    if (error.code === '23505') {
        return res.status(409).json({
            message: 'Esta conta já está vinculada a uma empresa ou o convite já foi utilizado.'
        });
    }

    console.error('Erro na API:', error);
    return res.status(500).json({
        message: 'Não foi possível concluir a operação. Tente novamente mais tarde.'
    });
}
