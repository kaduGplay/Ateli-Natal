# Vizzion Pay — Pix

Implementação baseada nas documentações de criação de Pix e TRANSACTION_PAID
fornecidas pelo usuário. Endpoint: https://app.vizzionpay.com.br/api/v1/gateway/pix/receive.

Variáveis exclusivas do servidor:

- `PAYMENT_PROVIDER=vizzionpay`: usa Vizzion Pay para novos pedidos.
- `VIZZIONPAY_PUBLIC_KEY` e `VIZZIONPAY_PRIVATE_KEY`: autenticação por headers.
- `PUBLIC_BASE_URL=https://atelienatal.online`: gera o callback correto.
- `VIZZIONPAY_WEBHOOK_TOKEN`: opcional para cadastro manual no painel.

Webhook: `https://atelienatal.online/api/webhooks/vizzionpay`.
Evento aceito: `TRANSACTION_PAID`.

O callback é enviado na criação e o token retornado pelo gateway fica no registro
privado da cobrança. A notificação precisa coincidir com esse token ou com o token
manual configurado no servidor. Não se utiliza o segredo da API como token de webhook.
Token, evento, valor, moeda, método e identificador da transação são verificados.
O identificador do pedido também é conferido quando informado na notificação.

O valor é enviado em reais, com descontos e frete já calculados pelo servidor.
Não se somam taxas novamente. O QR é renderizado a partir de `pix.code`.
Os dados privados e a reserva atômica de criação permanecem no PostgreSQL.
Em falhas de rede não se repete a cobrança automaticamente: a documentação não
estabelece garantia de idempotência remota. Nenhuma consulta de confirmação do
webhook é enviada ao gateway.

A troca não modifica cobranças já emitidas por outros provedores. Seus webhooks
continuam disponíveis. Recibos Vizzion Pay são separados em `vizzionpay-events` e
não incluem dados pessoais nem tokens.

`npm run verify` usa chaves falsas, fetch simulado e dados temporários. Nenhuma
cobrança real foi criada durante a implementação.

Na Netlify, as credenciais são passadas como segredos de deploy restritos às funções.
Cada novo deploy deve preservar também os segredos dos provedores anteriores para
permitir a confirmação e recuperação dos Pix pendentes já emitidos.

## Confirmação automática por callback assinado

`VIZZIONPAY_CALLBACK_SECRET` é um segredo aleatório privado e persistente no Netlify.
A URL enviada em `callbackUrl` inclui o identificador do pedido e uma assinatura
HMAC-SHA256 específica desse pedido; o segredo e as chaves da API nunca vão na URL.
O receptor confere a assinatura e encontra o pedido ou a reserva de criação antes
de aceitar a notificação. Isso permite autenticar também o callback que chega
antes de a resposta da criação do Pix ter sido persistida. Callbacks antigos
continuam aceitando o token retornado na cobrança ou o token global configurado.

Somente `TRANSACTION_PAID` com `COMPLETED`, Pix e moeda BRL pode confirmar a compra.
O identificador da transação, o pedido e o valor devem coincidir. Campos opcionais
de cliente, oferta, assinatura recorrente e rastreamento não bloqueiam um evento
financeiro válido. Recibos são deduplicados e não guardam tokens ou assinaturas.
O painel considera a data da confirmação para as vendas do período.

## Cadastro manual no painel da operadora

O cadastro manual usa uma URL com `hookKey`, derivada do segredo privado por HMAC
em um contexto separado dos callbacks individuais. Essa URL é uma credencial de
entrega e não deve ser incluída em arquivos públicos, logs ou no repositório.
Eventos de teste autenticados não confirmam pedidos; chamadas sem uma credencial válida são recusadas;
somente notificações financeiras válidas e autenticadas podem confirmar uma venda.
Um teste com ID fictício pode receber 200 sem criar pedido, receita ou conversão.
Recibos autenticados de transações ainda não salvas ficam disponíveis para
reconciliação posterior, cobrindo o intervalo entre a criação e a persistência.
