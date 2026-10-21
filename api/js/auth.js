import { createAuthClient } from 'https://esm.sh/@neondatabase/neon-js@latest/auth';
import { BetterAuthVanillaAdapter } from 'https://esm.sh/@neondatabase/neon-js@latest/auth/vanilla/adapters';

let authClient = null;

function initNeonAuth(url = AppConfig.getNeonAuthUrl()) {
    if (!url) return false;

    try {
        authClient = createAuthClient(url, {
            adapter: BetterAuthVanillaAdapter({
                fetchOptions: { credentials: 'include' }
            })
        });
        return true;
    } catch (error) {
        console.error('Não foi possível inicializar o Neon Auth:', error);
        return false;
    }
}

function getAuthClient() {
    if (!authClient && !initNeonAuth()) {
        throw new Error('O acesso ainda não foi configurado pelo administrador.');
    }

    return authClient;
}

async function handleLogin(email, password) {
    const result = await getAuthClient().signIn.email({ email, password });
    if (result.error) {
        console.error('Erro no login:', result.error);
        throw result.error;
    }

    return result.data;
}

async function handleSignup(email, password, name = email.split('@')[0] || 'Usuário') {
    const result = await getAuthClient().signUp.email({
        name,
        email,
        password
    });
    if (result.error) {
        console.error('Erro ao criar conta:', result.error);
        throw result.error;
    }

    return result.data;
}

async function sendEmailVerificationCode(email) {
    const result = await getAuthClient().emailOtp.sendVerificationOtp({
        email,
        type: 'email-verification'
    });
    if (result.error) {
        console.error('Erro ao enviar código de verificação:', result.error);
        throw result.error;
    }

    return result.data;
}

async function verifyEmailCode(email, otp) {
    const result = await getAuthClient().emailOtp.verifyEmail({ email, otp });
    if (result.error) {
        console.error('Erro ao confirmar o e-mail:', result.error);
        throw result.error;
    }

    return result.data;
}

async function getCurrentSession() {
    const result = await getAuthClient().getSession();
    if (result.error) {
        console.error('Erro ao recuperar a sessão do Neon Auth:', result.error);
        throw result.error;
    }

    return result.data;
}

async function getAccessToken() {
    const result = await getAuthClient().token();
    if (result.error) {
        console.error('Erro ao recuperar o token do Neon Auth:', result.error);
        throw result.error;
    }

    if (result.data?.token) return result.data.token;

    let headerToken = '';
    const sessionResult = await getAuthClient().getSession({
        fetchOptions: {
            onSuccess: context => {
                headerToken = context.response.headers.get('set-auth-jwt') || '';
            }
        }
    });
    const session = sessionResult.data;
    const token = headerToken || session?.session?.access_token;
    if (token) return token;

    const manual = { status: null, keys: null, error: null };
    const attempts = [{}, session?.session?.token ? { Authorization: `Bearer ${session.session.token}` } : null];
    for (const extraHeaders of attempts) {
        if (!extraHeaders) continue;
        try {
            const response = await fetch(`${AppConfig.getNeonAuthUrl()}/token`, {
                credentials: 'include',
                headers: extraHeaders
            });
            manual.status = response.status;
            const body = await response.json().catch(() => null);
            manual.keys = body ? Object.keys(body) : null;
            const jwt = body?.token || response.headers.get('set-auth-jwt');
            if (response.ok && jwt) return jwt;
        } catch (error) {
            manual.error = error.message;
        }
    }

    console.error('Não foi possível obter o token da API.', manual);
    throw new Error('Não foi possível validar seu acesso. Entre novamente.');
}

async function apiRequest(path, options = {}) {
    const token = await getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');

    const response = await fetch(path, {
        ...options,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('A API do sistema não está disponível. Use o endereço publicado ou inicie `vercel dev` na pasta do projeto.');
    }
    const result = await response.json();
    if (!response.ok) {
        const error = new Error(result.message || 'A solicitação não foi concluída.');
        error.status = response.status;
        throw error;
    }
    return result;
}

async function handleLogout() {
    if (authClient) {
        try {
            await signOut();
        } catch (error) {
            alert('Erro ao sair: ' + error.message);
            return;
        }
    }
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
}

async function signOut() {
    if (!authClient) return;
    const result = await authClient.signOut();
    if (result.error) {
        console.error('Erro ao sair:', result.error);
        throw result.error;
    }
}

export {
    getCurrentSession,
    getAccessToken,
    apiRequest,
    handleLogin,
    handleLogout,
    handleSignup,
    initNeonAuth,
    signOut,
    sendEmailVerificationCode,
    verifyEmailCode
};
