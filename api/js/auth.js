import { createAuthClient } from 'https://esm.sh/@neondatabase/neon-js@latest/auth';

let authClient = null;

function initNeonAuth(url = AppConfig.getNeonAuthUrl()) {
    if (!url) return false;

    try {
        authClient = createAuthClient(url);
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

async function handleSignup(email, password) {
    const result = await getAuthClient().signUp.email({
        name: email.split('@')[0] || 'Usuário',
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

async function handleLogout() {
    if (authClient) {
        const result = await authClient.signOut();
        if (result.error) {
            alert('Erro ao sair: ' + result.error.message);
            return;
        }
    }
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
}

export {
    getCurrentSession,
    handleLogin,
    handleLogout,
    handleSignup,
    initNeonAuth,
    sendEmailVerificationCode,
    verifyEmailCode
};
