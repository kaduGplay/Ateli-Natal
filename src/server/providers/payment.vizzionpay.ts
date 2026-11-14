import { signVizzionPayCallback } from '../webhooks/vizzionpay-callback.js';
import type { PaymentStatus } from '../../shared/types.js';
import { onlyDigits } from '../../shared/validation.js';
import { HttpError } from '../errors.js';
import type { PaymentProvider, PixChargeInput, PixChargeResult } from './types.js';

export class VizzionPayPaymentProvider implements PaymentProvider {
  async createPixCharge(input: PixChargeInput): Promise<PixChargeResult> {
    const publicKey = process.env.VIZZIONPAY_PUBLIC_KEY;
    const secretKey = process.env.VIZZIONPAY_PRIVATE_KEY;
    const base = process.env.PUBLIC_BASE_URL || (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
    if (!publicKey || !secretKey) throw new HttpError(503, 'Pagamento Pix não configurado.');
    if (!base) throw new HttpError(503, 'Endereço do webhook Pix ainda não configurado.');
    let callbackUrl: URL | undefined;
    if (base) try {
      callbackUrl = new URL('/api/webhooks/vizzionpay', base);
      signVizzionPayCallback(callbackUrl, input.orderId);
      if (callbackUrl.protocol !== 'https:' || callbackUrl.username || callbackUrl.password) throw new Error();
    } catch { throw new HttpError(503, 'Pagamento Pix em configuração. Tente novamente mais tarde.'); }
    if (!Number.isFinite(input.amount) || input.amount < 0.01) throw new HttpError(400, 'O valor do Pix deve ser de pelo menos R$ 0,01.');

    let response: Response;
    try {
      response = await fetch('https://app.vizzionpay.com.br/api/v1/gateway/pix/receive', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', 'x-public-key': publicKey, 'x-secret-key': secretKey },
        body: JSON.stringify({
          identifier: input.orderId,
          // Valor FINAL em reais, já com frete, cupons e desconto Pix. Não somar taxas novamente.
          amount: input.amount,
          client: { name: input.customer.name.trim(), email: input.customer.email.trim(),
            phone: onlyDigits(input.customer.phone), document: onlyDigits(input.customer.document) },
          metadata: { provider: 'AtelieNatal', orderId: input.orderId },
          ...(callbackUrl ? { callbackUrl: callbackUrl.toString() } : {}),
        }),
      });
    } catch { throw new HttpError(502, 'Não foi possível confirmar a geração do Pix. Aguarde antes de tentar novamente.'); }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      console.warn('vizzionpay_charge_rejected', response.status);
      if (response.status === 401 || response.status === 403) {
        throw new HttpError(503, 'O Pix está em configuração: a operadora recusou a autorização da loja. Entre em contato com o atendimento.');
      }
      throw new HttpError(502, response.status === 400 || response.status === 422
        ? 'A operadora não aceitou os dados do pagamento. Confira os dados informados.'
        : 'A operadora de pagamento está indisponível. Tente novamente mais tarde.');
    }
    if (!body || typeof body !== 'object') throw new HttpError(502, 'Resposta inválida da operadora de pagamento.');
    const data = body as { transactionId?: unknown; status?: unknown; transactionStatus?: unknown;
      webhookToken?: unknown; pix?: { code?: unknown; expiresAt?: unknown } };
    if (!['OK', 'PENDING'].includes(String(data.status)) || ['FAILED', 'REFUNDED', 'CHARGED_BACK', 'EXPIRED'].includes(String(data.transactionStatus))) {
      throw new HttpError(502, 'A operadora não conseguiu gerar o Pix. Confira os dados e tente novamente.');
    }
    if (typeof data.transactionId !== 'string' || !data.transactionId || typeof data.pix?.code !== 'string' || !data.pix.code) {
      throw new HttpError(502, 'A operadora não retornou um código Pix válido.');
    }
    const expiresAt = typeof data.pix.expiresAt === 'string' ? data.pix.expiresAt : input.expiresAt.toISOString();
    if (!Number.isFinite(Date.parse(expiresAt))) throw new HttpError(502, 'A operadora retornou um prazo de Pix inválido.');
    if (!(typeof data.webhookToken === 'string' && data.webhookToken) && !process.env.VIZZIONPAY_WEBHOOK_TOKEN && !process.env.VIZZIONPAY_CALLBACK_SECRET) throw new HttpError(502, 'Token de confirmação do Pix indisponível. Aguarde antes de tentar novamente.');
    return { provider: 'vizzionpay', providerRef: data.transactionId, copyPaste: data.pix.code, expiresAt,
      webhookToken: typeof data.webhookToken === 'string' && data.webhookToken ? data.webhookToken : undefined };
  }

  async getPaymentStatus(): Promise<PaymentStatus> {
    // Confirmação recebida pelo webhook autenticado; não cria chamadas de consulta não documentadas.
    return 'pending';
  }
}
