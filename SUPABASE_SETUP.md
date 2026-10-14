# Configuração do Neon Auth

O login usa o Managed Better Auth do Neon. A senha do banco nunca é enviada
para o navegador; somente a URL pública do serviço de autenticação é usada no
cliente.

## Configurar o Neon Auth

1. No console do Neon, abra o projeto e a ramificação usada pela aplicação.
2. Em **Better Auth**, clique em **Enable Auth** e conclua a configuração.
3. Na aba **Configuration**, copie a **Auth Base URL**.
4. Configure a **Auth Base URL** uma única vez como `DEFAULT_NEON_AUTH_URL` em
   `api/js/config.js` antes de publicar. A URL é pública e não é a senha nem a
   string de conexão do banco. Uma URL já salva no navegador continua sendo
   aceita durante esta transição.
5. Em **Settings → Better Auth**, habilite **Sign-up with Email** e **Verify at
   Sign-up**, escolhendo a confirmação por código. O provedor compartilhado
   envia um código OTP; a aplicação permite solicitá-lo novamente e digitá-lo
   para verificar o e-mail.
6. Para testar localmente, acesse o Live Server pelo endereço `localhost`
   (por exemplo, `http://localhost:5500/index.html`), não por `127.0.0.1`.
   Verifique também se o acesso local está habilitado no Neon Auth. Para
   produção, adicione o domínio publicado em **Console → Auth → Configuration
   → Domains**.
7. Cada colaborador pode usar **Criar Conta** com seu próprio e-mail e senha
   (mínimo de 8 caracteres). O cadastro mostra a confirmação para verificar a
   caixa de entrada e o spam. O sistema só libera a tela principal quando o
   Neon Auth informa que o e-mail foi confirmado.

O cliente é carregado pelo módulo `@neondatabase/neon-js` via CDN. O navegador
precisa de acesso à internet e o domínio da aplicação deve estar autorizado na
configuração do Neon Auth. Códigos de verificação expiram; solicite um código
novo caso o anterior não funcione. Se o envio falhar, confira no Neon se a
verificação de e-mail está habilitada e se o provedor de e-mail está ativo.

## Variáveis da Vercel

O frontend desta aplicação é uma página estática, portanto a `DATABASE_URL`
deve permanecer somente nas variáveis da Vercel para as funções em `api/`.
Nunca coloque a senha ou a string de conexão do Neon em `index.html`,
`config.js` ou em qualquer arquivo enviado ao navegador.

## Ordens de serviço

Nesta etapa, o formulário salva rascunhos no armazenamento local do navegador,
separados pelo usuário autenticado. Eles ainda não são sincronizados entre
dispositivos. A numeração da O.S. permanece reservada para configuração pelo
usuário master da empresa.

O endpoint `api/orders.js` permanece temporariamente desativado. Antes de
habilitá-lo, valide a sessão do usuário no backend e restrinja a leitura/escrita
aos dados autorizados. Não envie a `DATABASE_URL` ao frontend.

O arquivo `supabase_setup.sql` é legado e não deve ser executado no Neon, pois
ele usa as tabelas e as políticas específicas do Supabase.
