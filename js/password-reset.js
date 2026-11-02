import { initNeonAuth, requestPasswordReset, resetPassword } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const requestForm = document.getElementById('reset-request-form');
    const passwordForm = document.getElementById('reset-password-form');
    const emailInput = document.getElementById('reset-email');
    const emailLabel = document.getElementById('reset-email-label');
    const message = document.getElementById('reset-message');
    const requestButton = document.getElementById('btn-send-reset-code');
    const resetButton = document.getElementById('btn-reset-password');
    const resendButton = document.getElementById('btn-resend-reset-code');
    let resetEmail = '';

    function setMessage(text, isError = false) {
        message.textContent = text;
        message.classList.toggle('text-red-700', isError);
        message.classList.toggle('text-green-700', Boolean(text) && !isError);
    }

    if (!initNeonAuth()) {
        requestButton.disabled = true;
        setMessage('O acesso ainda não foi configurado. Tente novamente mais tarde.', true);
        return;
    }

    async function sendCode(button) {
        resetEmail = emailInput.value.trim().toLowerCase();
        if (!resetEmail) {
            emailInput.reportValidity();
            return;
        }

        button.disabled = true;
        setMessage('Enviando código…');
        try {
            await requestPasswordReset(resetEmail);
            emailLabel.textContent = `Se houver uma conta para ${resetEmail}, enviaremos um código. Confira também o spam.`;
            requestForm.classList.add('hidden');
            passwordForm.classList.remove('hidden');
            setMessage('Digite o código recebido e escolha uma nova senha.');
        } catch (error) {
            console.error('Não foi possível solicitar a redefinição de senha:', error);
            setMessage(error.message || 'Não foi possível enviar o código. Tente novamente.', true);
        } finally {
            button.disabled = false;
        }
    }

    requestForm.addEventListener('submit', event => {
        event.preventDefault();
        void sendCode(requestButton);
    });

    resendButton.addEventListener('click', () => {
        void sendCode(resendButton);
    });

    passwordForm.addEventListener('submit', async event => {
        event.preventDefault();
        const otp = document.getElementById('reset-otp').value.trim();
        const password = document.getElementById('new-password').value;
        const confirmation = document.getElementById('confirm-password').value;

        if (!/^\d{6}$/.test(otp)) {
            setMessage('Digite o código de 6 dígitos recebido por e-mail.', true);
            return;
        }
        if (password.length < 8) {
            setMessage('A nova senha precisa ter pelo menos 8 caracteres.', true);
            return;
        }
        if (password !== confirmation) {
            setMessage('As senhas não conferem.', true);
            return;
        }

        resetButton.disabled = true;
        setMessage('Redefinindo senha…');
        try {
            await resetPassword(resetEmail, otp, password);
            passwordForm.classList.add('hidden');
            setMessage('Senha redefinida com sucesso. Você já pode voltar ao login.', false);
        } catch (error) {
            console.error('Não foi possível redefinir a senha:', error);
            setMessage(error.message || 'Não foi possível redefinir a senha. Confira o código e tente novamente.', true);
        } finally {
            resetButton.disabled = false;
        }
    });
});
