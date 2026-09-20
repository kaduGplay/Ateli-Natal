import { createHash, timingSafeEqual } from 'node:crypto';
import type { Order } from '../../shared/types.js';
import type { PixAttempt } from '../services/orders.js';
import { HttpError } from '../errors.js';
import { readJson, updateJson } from '../storage.js';
import { object, validateVoidPayPayload, type VoidPayEvent, type VoidPayTransaction } from './voidpay-payload.js';

interface Receipt {
  event: VoidPayEvent;
  transactionId: string;
  receivedAt: string;
  transaction: Pick<VoidPayTransaction, 'paymentMethod' | 'status' | 'amount' | 'currency' | 'originalAmount' | 'originalCurrency' | 'payedAt'>;
}

async function authenticate(body: unknown): Promise<void> {
  const payload = object(body);
  const token = payload.token;
  if (typeof token !== 'string' || !token) throw new HttpError(401, 'Webhook não autorizado.');
  const transactionId = object(payload.transaction).id;
  if (typeof transactionId !== 'string' || !transactionId) throw new HttpError(400, 'Transação inválida.');
  const hash = (value: string): Buffer => createHash('sha256').update(value).digest();
  const configured = process.env.GATEWAY_WEBHOOK_TOKEN;
  if (configured && timingSafeEqual(hash(token), hash(configured))) return;
  const orders = await readJson<Order[]>('orders', []);
  let expected = orders.find(o => o.payment.provider === 'voidpay' && o.payment.providerRef === transactionId)?.payment.webhookToken;
  if (!expected) {
    const attempts = await readJson<PixAttempt[]>('pix-attempts', []);
    expected = attempts.find(a => a.order.payment.provider === 'voidpay' && a.order.payment.providerRef === transactionId)?.order.payment.webhookToken;
  }
  expected ??= configured;
  if (!expected) throw new HttpError(503, 'Token do webhook ainda não disponível.');
  if (!timingSafeEqual(createHash('sha256').update(token).digest(), createHash('sha256').update(expected).digest())) {
    throw new HttpError(401, 'Webhook não autorizado.');
  }
}

/** Somente recibos autenticados e persistidos podem alterar um pedido local. Sem chamadas externas. */
export async function reconcileVoidPayOrder(orderId: string): Promise<void> {
  const receipts = await readJson<Receipt[]>('voidpay-events', []);
  if (!receipts.some(r => r.event === 'TRANSACTION_PAID')) return;
  await updateJson<Order[]>('orders', [], orders => orders.map(order => {
    if (order.id !== orderId || order.payment.provider !== 'voidpay' || order.status === 'paid') return order;
    const receipt = receipts.find(r => r.event === 'TRANSACTION_PAID' && r.transactionId === order.payment.providerRef);
    if (!receipt) return order;
    const t = receipt.transaction;
    const cents = (n: number): number => Math.round(n * 100);
    if (t.paymentMethod !== 'PIX' || t.status !== 'COMPLETED' || t.currency !== 'BRL' || t.originalCurrency !== 'BRL'
      || cents(t.amount) !== cents(order.totals.payable) || cents(t.originalAmount) !== cents(order.totals.payable)) {
      console.warn('voidpay_webhook_amount_or_method_mismatch');
      return order;
    }
    // Uma confirmação tardia pode chegar depois do prazo local do QR.
    return { ...order, status: 'paid', paidAt: t.payedAt ?? undefined };
  }));
}

export async function receiveVoidPayWebhook(body: unknown, expectedEvent?: VoidPayEvent): Promise<{ accepted: true }> {
  await authenticate(body);
  const payload = validateVoidPayPayload(body);
  if (expectedEvent && payload.event !== expectedEvent) throw new HttpError(400, 'Evento inválido para este endpoint.');
  const t = payload.transaction;
  const receipt: Receipt = {
    event: payload.event, transactionId: t.id, receivedAt: new Date().toISOString(),
    transaction: { paymentMethod: t.paymentMethod, status: t.status, amount: t.amount, currency: t.currency,
      originalAmount: t.originalAmount, originalCurrency: t.originalCurrency, payedAt: t.payedAt },
  };
  await updateJson<Receipt[]>('voidpay-events', [], receipts => {
    const existing = receipts.find(r => r.event === receipt.event && r.transactionId === receipt.transactionId);
    if (existing) {
      if (JSON.stringify(existing.transaction) !== JSON.stringify(receipt.transaction)) throw new HttpError(409, 'Notificação repetida com dados divergentes.');
      return receipts;
    }
    return [...receipts, receipt];
  });
  // Eventos recebidos antes da gravação do pedido ficam disponíveis para reconciliação posterior.
  const order = (await readJson<Order[]>('orders', [])).find(o => o.payment.provider === 'voidpay' && o.payment.providerRef === t.id);
  if (order) await reconcileVoidPayOrder(order.id);
  console.info('voidpay_webhook_accepted', payload.event);
  return { accepted: true };
}
