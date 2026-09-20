# Instruções deste projeto

- O usuário autorizou publicar atualizações em `kaduGplay/Ateli-Natal`, branch `main`, após validar as alterações. Use `npm run sync` ao concluir mudanças; não force pushes nem sobrescreva alterações remotas.
- Nunca versione `.env`, credenciais, pedidos, tentativas de pagamento ou tokens de webhook. Execute `node scripts/check-staged-secrets.mjs` antes de publicar arquivos staged.
- A sincronização local também roda por LaunchAgent. Não ative outro watcher duplicado. Para mudanças longas, crie `.git/atelie-sync.lock` antes de editar e remova-o após concluir, evitando envio de trabalho parcial. Não remova um lock criado por outro processo em execução.
- Na Vercel, dados mutáveis usam PostgreSQL; não use filesystem ou `/tmp` para guardar pedidos. Mantenha a reserva de criação de Pix atômica entre instâncias.
- `npm run verify` valida TypeScript, build e testes de pagamento. Use credenciais falsas e dados temporários nos testes; nunca efetue pagamentos reais em testes automáticos.
