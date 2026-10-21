# Configuração do Neon Auth e das ordens

O login usa o Managed Better Auth do Neon. A senha do banco nunca é enviada
para o navegador; somente a URL pública do serviço de autenticação é usada no
cliente.

## Configurar o Neon Auth

1. No console do Neon, abra o projeto e a ramificação usada pela aplicação.
2. Em **Better Auth**, clique em **Enable Auth** e conclua a configuração.
3. Na aba **Configuration**, copie a **Auth Base URL**.
4. Configure a **Auth Base URL** uma única vez como `DEFAULT_NEON_AUTH_URL` em
   `js/config.js` antes de publicar. A URL é pública e não é a senha nem a
   string de conexão do banco. Uma URL já salva no navegador continua sendo
   aceita durante esta transição.
5. Em **Settings → Better Auth**, habilite **Sign-up with Email** e **Verify at
   Sign-up**, escolhendo a confirmação por código. O provedor compartilhado
   envia um código OTP; a aplicação permite solicitá-lo novamente e digitá-lo
   para verificar o e-mail.
6. Para desenvolvimento local, configure `NEON_AUTH_URL` no `.env` com a Auth
   Base URL mostrada no Neon e execute `npm run dev` dentro da pasta
   `ordemdeservi-o`. Abra `http://localhost:3000`, não `127.0.0.1`. Esse servidor
   local atende também as funções de `/api/`; o Live Server não as executa.
   O Neon Auth já permite `localhost` para desenvolvimento; não é necessário
   adicioná-lo em **Console → Auth → Configuration → Domains**. Se o navegador
   integrado do editor bloquear cookies entre sites, abra o endereço no Chrome
   ou Edge. Para produção, autorize o domínio publicado nessa configuração.
7. O gestor cria a conta e a empresa em `gestor.html`, confirma o e-mail e
   inicia o teste de 30 dias. Colaboradores não fazem cadastro aberto: entram
   pelo convite enviado pelo gestor. A tela principal só é liberada após a
   confirmação do e-mail e a validação do vínculo com uma empresa.

O cliente é carregado pelo módulo `@neondatabase/neon-js` via CDN. O navegador
precisa de acesso à internet e o domínio da aplicação deve estar autorizado na
configuração do Neon Auth. Códigos de verificação expiram; solicite um código
novo caso o anterior não funcione. Se o envio falhar, confira no Neon se a
verificação de e-mail está habilitada e se o provedor de e-mail está ativo.

## Banco e API

1. Execute `neon_setup.sql` uma vez no SQL Editor do banco Neon usado pela
   aplicação. Ele cria empresas, vínculos, convites e ordens com RLS habilitada.
   A aplicação acessa esses dados somente pelas funções de servidor em `api/`;
   não habilite acesso público direto às tabelas pela Data API.
2. Na Vercel, defina `DATABASE_URL` como a string de conexão do Neon e
   `NEON_AUTH_URL` como a Auth Base URL mostrada nas configurações do Better
   Auth. Ambas são variáveis apenas do servidor. Nunca coloque a senha do banco
   em `index.html`, `config.js` ou em outro arquivo enviado ao navegador.
   Mantenha arquivos `.env` fora do Git.
3. O projeto deve ser publicado com a pasta `ordemdeservi-o` como diretório
   raiz da aplicação. O `.env` local deve conter `DATABASE_URL` e
   `NEON_AUTH_URL`; ambos são ignorados pelo Git e seus valores não devem ser
   compartilhados.

## Ordens de serviço

O gestor cria a empresa em `gestor.html`; depois da confirmação do e-mail, a
empresa inicia o período de teste de 30 dias. O gestor gera convites de uso
único, válidos por sete dias e vinculados ao e-mail informado. O colaborador
aceita o convite pela página principal.

O formulário mantém cópias locais e sincroniza as ordens com o Neon. O gestor
consulta e altera as ordens da empresa; cada colaborador consulta e altera as
ordens que criou. A API valida o JWT do Neon Auth e verifica o vínculo e o
estado da assinatura em cada operação.

O painel administrativo para confirmação manual de pagamentos, a integração
com o Google Drive e o envio automático de convites ainda não fazem parte desta
etapa. As ordens existentes no armazenamento local só são migradas quando o
usuário entrar numa empresa e o servidor estiver disponível.

O arquivo `supabase_setup.sql` é legado e não deve ser executado no Neon, pois
ele usa as tabelas e as políticas específicas do Supabase.
