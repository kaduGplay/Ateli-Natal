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
