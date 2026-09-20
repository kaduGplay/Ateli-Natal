# Ateliê Natal

Loja em TypeScript: vitrine estática, API Express, checkout com frete e Pix via VoidPay.

## Desenvolvimento

```sh
npm ci
cp .env.example .env # apenas na primeira configuração; não sobrescreva seu .env existente
npm run dev
```

Abra http://localhost:3000. Para validar: `npm run verify`.

## Publicar na Vercel

1. Importe `kaduGplay/Ateli-Natal` na Vercel, branch `main`. Use o preset **Other** e Node.js **22.x**. `vercel.json` configura o build, publica `public/` na CDN e encaminha `/api/*` para a função Express em `api/index.ts`. Os scripts do navegador são gerados antes da publicação dos arquivos estáticos.
2. Em **Storage / Marketplace**, conecte um PostgreSQL, por exemplo Neon. Disponibilize a URL de conexão com SSL como `DATABASE_URL` (ou `POSTGRES_URL`). Os dados de pedidos e pagamentos usam esse banco. A tabela é criada automaticamente na primeira operação.
3. Nas variáveis de ambiente de **Production**, configure `VOIDPAY_PUBLIC_KEY` e `VOIDPAY_PRIVATE_KEY` com as chaves da sua conta. Elas estão no `.env` deste computador, que não é publicado.
4. Configure `PUBLIC_BASE_URL` com o endereço HTTPS definitivo, por exemplo `https://sualoja.com`. Se omitido em produção, a aplicação usa `VERCEL_PROJECT_PRODUCTION_URL` quando disponível. O webhook de confirmação será `/api/webhooks/voidpay`.
5. Faça o deploy. Certifique-se de que o webhook de produção não está bloqueado por proteção de acesso da Vercel. Nunca coloque as chaves em variáveis públicas ou em arquivos de `public`.

O catálogo, imagens e avaliações importadas vão com o projeto. Pedidos, tentativas de Pix e tokens de webhook **não vão para o GitHub**. Na Vercel eles são persistidos em PostgreSQL; não se usa `/tmp` como banco. Em desenvolvimento sem banco, o armazenamento continua em arquivos locais.

Sem `DATABASE_URL`, a vitrine funciona, mas o checkout na Vercel não gera cobranças: impede criar Pix sem poder guardar o pedido. Configure banco e credenciais antes de disponibilizar a loja para vendas.

As transações do banco serializam alterações por conjunto de dados. A reserva de solicitação do Pix é atômica entre instâncias, impedindo cobranças duplicadas em requisições simultâneas. Este modelo armazena conjuntos JSONB e atende uma loja pequena; antes de alto volume, migre pedidos e eventos para tabelas com uma linha por registro.

## Atualizações automáticas

Neste computador, a sincronização pode ser executada com `npm run sync`. Ela valida o projeto, exclui arquivos privados via `.gitignore`, verifica segredos, cria um commit e faz push de `main`. Não faz push forçado. Se houver falha de validação, autenticação ou conflito remoto, o envio para e o erro aparece no log.

O agente local `com.atelie-natal.github-sync` executa esse comando a cada minuto enquanto o usuário está conectado. A máquina precisa estar ligada e com internet. Logs locais: `~/Library/Logs/atelie-natal-github-sync.log`. Não edite código sensível fora dos arquivos ignorados.

Ao conectar o repositório na Vercel, cada push em `main` dispara um novo deploy automaticamente. Isso não transfere variáveis de ambiente: configure-as no painel uma vez.

## Pagamentos

Leia [docs/voidpay.md](docs/voidpay.md). O endpoint de pagamento retorna apenas o código Pix e o resumo; chaves, CPF e token de webhook permanecem no servidor. Nenhum teste automatizado realiza pagamentos reais.
