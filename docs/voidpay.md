# VoidPay

Integração baseada nas seções “Receber pix”, “TRANSACTION_CREATED” e “TRANSACTION_PAID” fornecidas em 19/09/2026.

## Configuração

Node.js 22 ou superior. O servidor carrega `.env` na raiz; variáveis do ambiente têm prioridade.

- `VOIDPAY_PUBLIC_KEY`: chave pública.
- `VOIDPAY_PRIVATE_KEY`: chave privada (header `x-secret-key`).
- `PUBLIC_BASE_URL`: domínio HTTPS público desta aplicação, sem caminho. Opcional para gerar a cobrança; necessário para receber automaticamente sua confirmação via callback.
- `GATEWAY_WEBHOOK_TOKEN`: opcional para webhook cadastrado manualmente no painel; deve ser o token real dessa configuração. Não use o token dos exemplos da documentação.

As chaves fornecidas já estão no `.env` local, com permissão 0600, ignorado pelo Git. Configure o domínio real para receber confirmações automáticas. Sem ele, a cobrança real pode ser criada, mas o status local depende de um webhook configurado no painel. O `.env.example` contém apenas nomes de variáveis.

```sh
npm run build
npm start
```

## Criação e confirmação

O servidor envia `POST https://dash.voidpayments.com/api/v1/gateway/pix/receive`, com os headers de autenticação documentados. `amount` recebe o valor final em reais, incluindo frete e descontos. As taxas opcionais são omitidas para não serem somadas novamente. Nenhuma credencial vai para o navegador.

Quando `PUBLIC_BASE_URL` está preenchido, o `callbackUrl` enviado é `PUBLIC_BASE_URL` + `/api/webhooks/voidpay`. Esse endpoint aceita somente `TRANSACTION_PAID`. Para notificações separadas de criação, existe `/api/webhooks/voidpay/created`; `/api/webhooks/voidpay/paid` também aceita somente pagamento.

O token retornado em `webhookToken` é guardado junto da cobrança e validado contra `payload.token`, ou pode ser usado o `GATEWAY_WEBHOOK_TOKEN` configurado. Comparações de token usam hashes e comparação em tempo constante. O receptor não faz chamadas externas. A tela consulta apenas o status local da aplicação.

Uma notificação só aprova um pedido com o mesmo ID de transação da VoidPay, método PIX, status COMPLETED e valores BRL correspondentes ao total do pedido. Notificações repetidas são idempotentes; eventos de criação nunca desfazem um pagamento. A página de confirmação só informa aprovação depois da resposta do servidor.

## Persistência e operação

`data/orders.json`, `data/pix-attempts.json` e `data/voidpay-events.json` precisam permanecer em armazenamento persistente. Escritas usam arquivo temporário, fsync e rename; novos arquivos privados têm permissão 0600. Não sirva a pasta `data` nem `.env` publicamente.

Este armazenamento suporta **um processo Node por diretório de dados**. Para vários processos/instâncias, substitua-o por banco transacional com índices únicos para solicitação e evento/transação.

Cada solicitação usa um identificador persistido antes da chamada ao gateway. Repetir uma solicitação já concluída devolve a mesma cobrança. Após timeout ou resposta ambígua, não há nova cobrança automática: a tentativa fica em verificação. Uma falha antes de persistir o token recebido exige reconciliação operacional com o painel; nunca marque um pedido como pago manualmente sem evidência da operadora.

O receptor persiste somente os dados mínimos do evento, sem token, CPF, e-mail ou endereço no registro de eventos ou logs. Um evento pode chegar antes da gravação do pedido: ele será reaplicado depois. Se ainda não houver token conhecido, a resposta é 503 para permitir reenvio.

A documentação traz `identifier` e `pixInformation.id` como obrigatórios na tabela, mas os omite nos exemplos: o validador tolera essas omissões. Também normaliza os campos de assinatura/itens/rastreamento que aparecem dentro de `transaction` no exemplo de criação.

## Validação

```sh
npm run typecheck
npm run test:payments
```

Os testes usam credenciais falsas, gateway simulado e diretório temporário. Cobrem valor final, idempotência, tokens inválidos, evento inválido, ordem das notificações, divergência de valor e falhas de rede. Testar uma cobrança e o webhook reais requer o domínio público configurado e acessível.

## Página de pagamento

O checkout redireciona para `/pagamento.html?orderId=...`, que carrega o código Pix e o resumo pela API local. Atualizar essa página apenas consulta a cobrança existente: não gera outra. O resumo não expõe CPF, endereço, credenciais nem token de webhook.
