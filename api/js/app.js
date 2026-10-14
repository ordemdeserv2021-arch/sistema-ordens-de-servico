import {
    getCurrentSession,
    handleLogin,
    handleLogout,
    handleSignup,
    initNeonAuth,
    sendEmailVerificationCode,
    verifyEmailCode
} from './auth.js';
import { initServiceOrderForm } from './os-form.js';

document.addEventListener('DOMContentLoaded', async () => {
    const authForm = document.getElementById('neon-auth-form');
    const authMessage = document.getElementById('auth-message');
    const loginButton = document.getElementById('btn-login');
    const signupButton = document.getElementById('btn-signup');
    const verifyButton = document.getElementById('btn-verify-email');
    const resendButton = document.getElementById('btn-resend-code');
    const verificationInput = document.getElementById('email-otp');
    let pendingVerificationEmail = '';
    const authReady = initNeonAuth();

    function setAuthMessage(text, isError = false) {
        authMessage.textContent = text;
        authMessage.classList.toggle('text-red-700', isError);
        authMessage.classList.toggle('text-green-700', Boolean(text) && !isError);
    }

    if (!authReady) {
        loginButton.disabled = true;
        signupButton.disabled = true;
        setAuthMessage('O acesso ainda não foi configurado pelo administrador. Tente novamente mais tarde.', true);
    }

    const showApp = (session) => {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        const userId = session?.user?.id || session?.session?.userId || session?.user?.email || session?.email || 'local';
        initServiceOrderForm(userId);
    };
    const getCredentials = () => ({
        email: document.getElementById('user-email').value.trim(),
        password: document.getElementById('user-pass').value
    });
    const getAuthUser = (data) => data?.user || data?.session?.user;
    const setVerificationMode = (email) => {
        pendingVerificationEmail = email;
        document.getElementById('verification-email-label').textContent = `Informe o código enviado para ${email}.`;
        document.getElementById('auth-credentials').classList.add('hidden');
        document.getElementById('auth-actions').classList.add('hidden');
        document.getElementById('email-verification').classList.remove('hidden');
        verificationInput.value = '';
    };
    const setAuthMode = () => {
        pendingVerificationEmail = '';
        document.getElementById('email-verification').classList.add('hidden');
        document.getElementById('auth-credentials').classList.remove('hidden');
        document.getElementById('auth-actions').classList.remove('hidden');
        verificationInput.value = '';
    };
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(button => button.classList.remove('active-tab'));
            btn.classList.add('active-tab');
            document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
            const target = document.getElementById(btn.getAttribute('data-tab'));
            if (target) target.classList.remove('hidden');
        });
    });

    authForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!authReady) return;

        const { email, password } = getCredentials();
        const action = event.submitter?.dataset.authAction;
        const button = action === 'signup' ? signupButton : loginButton;

        if (action === 'signup' && password.length < 8) {
            setAuthMessage('A senha precisa ter pelo menos 8 caracteres.', true);
            return;
        }

        button.disabled = true;
        setAuthMessage(action === 'signup' ? 'Criando sua conta…' : 'Verificando seu acesso…');

        try {
            const result = action === 'signup'
                ? await handleSignup(email, password)
                : await handleLogin(email, password);

            if (action === 'signup') {
                if (!getAuthUser(result)) {
                    throw new Error('O serviço não confirmou a criação da conta.');
                }
                setVerificationMode(email);
                await sendEmailVerificationCode(email);
                setAuthMessage('Enviamos um código de confirmação. Verifique a caixa de entrada e o spam.');
            } else if (getAuthUser(result)?.emailVerified === true) {
                setAuthMessage('');
                showApp(result);
            } else if (getAuthUser(result)?.emailVerified === false) {
                setVerificationMode(email);
                await sendEmailVerificationCode(email);
                setAuthMessage('Esta conta ainda não confirmou o e-mail. Enviamos um código; confira a caixa de entrada e o spam.');
            } else {
                throw new Error('O serviço de autenticação retornou uma resposta inesperada.');
            }
        } catch (error) {
            console.error('Falha na autenticação:', error);
            const errorMessage = error?.message || '';
            if (action === 'signup' && /user already exists/i.test(errorMessage)) {
                setAuthMessage('Essa conta já existe. Use Entrar para solicitar um novo código de confirmação, se o e-mail ainda não foi verificado.', true);
            } else {
                setAuthMessage(errorMessage || 'Não foi possível concluir a autenticação. Tente novamente.', true);
            }
        } finally {
            button.disabled = false;
        }
    });

    verifyButton.addEventListener('click', async () => {
        const otp = verificationInput.value.trim();
        if (!pendingVerificationEmail || !/^\d{6}$/.test(otp)) {
            setAuthMessage('Digite o código de 6 dígitos enviado para seu e-mail.', true);
            return;
        }

        verifyButton.disabled = true;
        setAuthMessage('Confirmando seu e-mail…');
        try {
            await verifyEmailCode(pendingVerificationEmail, otp);
            const session = await getCurrentSession();
            if (session?.session && session?.user?.emailVerified === true) {
                setAuthMessage('');
                showApp(session);
            } else {
                setAuthMode();
                setAuthMessage('E-mail confirmado. Agora entre com seu e-mail e senha.');
            }
        } catch (error) {
            console.error('Falha ao confirmar o e-mail:', error);
            setAuthMessage(error?.message || 'Não foi possível confirmar o código. Confira o código e tente novamente.', true);
        } finally {
            verifyButton.disabled = false;
        }
    });

    resendButton.addEventListener('click', async () => {
        if (!pendingVerificationEmail) return;

        resendButton.disabled = true;
        setAuthMessage('Enviando código…');
        try {
            await sendEmailVerificationCode(pendingVerificationEmail);
            setAuthMessage('Novo código enviado. Confira a caixa de entrada e o spam.');
        } catch (error) {
            console.error('Falha ao reenviar o código:', error);
            setAuthMessage(error?.message || 'Não foi possível enviar o código. Tente novamente mais tarde.', true);
        } finally {
            resendButton.disabled = false;
        }
    });

    document.getElementById('btn-back-to-auth').addEventListener('click', setAuthMode);

    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

    try {
        const session = await getCurrentSession();
        if (session?.session && session?.user?.emailVerified === true) {
            showApp(session);
        } else if (session?.session && session?.user?.emailVerified === false) {
            setVerificationMode(session.user.email);
            setAuthMessage('Sua conta ainda não confirmou o e-mail. Clique em “Enviar código” para receber um código de confirmação.', true);
        }
    } catch (error) {
        console.error('Falha ao verificar a sessão:', error);
        setAuthMessage(error?.message || 'Não foi possível verificar sua sessão.', true);
    }
});
