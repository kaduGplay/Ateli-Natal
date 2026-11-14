import { validRegisteredVizzionPayWebhook, validVizzionPayCallback, type VizzionPayCallbackAuth } from './vizzionpay-callback.js';
import { queueMetaPurchase } from '../services/meta-conversions.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Order } from '../../shared/types.js';
import type { PixAttempt } from '../services/orders.js';
import { HttpError } from '../errors.js';
import { readJson, updateJson } from '../storage.js';
import { object, validateVizzionPayPayload, type VizzionPayEvent, type VizzionPayTransaction } from './vizzionpay-payload.js';

interface Receipt {
  event: VizzionPayEvent;
  transactionId: string;
  receivedAt: string;
  transaction: Pick<VizzionPayTransaction, 'paymentMethod' | 'status' | 'amount' | 'currency' | 'originalAmount' | 'originalCurrency' | 'payedAt' | 'identifier'>;
}

async function authenticate(body: unknown, auth?: VizzionPayCallbackAuth): Promise<void> {
  const payload = object(body);
  if (validRegisteredVizzionPayWebhook(auth)) return;
  if (validVizzionPayCallback(auth)) {
    const transactionId = object(payload.transaction).id;
    if (typeof transactionId !== 'string' || !transactionId) throw new HttpError(400, 'Transação inválida.');
    const orders = await readJson<Order[]>('orders', []);
    const order = orders.find(o => o.id === auth!.orderId && o.payment.provider === 'vizzionpay');
    const attempts = order ? [] : await readJson<PixAttempt[]>('pix-attempts', []);
    const known = order || attempts.find(a => a.order.id === auth!.orderId && a.order.payment.provider === 'vizzionpay')?.order;
    if (!known || known.payment.providerRef && known.payment.providerRef !== transactionId) throw new HttpError(401, 'Webhook não autorizado.');
    return;
  }
  const token = payload.token;
  if (typeof token !== 'string' || !token) throw new HttpError(401, 'Webhook não autorizado.');
  const transactionId = object(payload.transaction).id;
  if (typeof transactionId !== 'string' || !transactionId) throw new HttpError(400, 'Transação inválida.');
  const hash = (value: string): Buffer => createHash('sha256').update(value).digest();
  const configured = process.env.VIZZIONPAY_WEBHOOK_TOKEN;
  if (configured && timingSafeEqual(hash(token), hash(configured))) return;
  const orders = await readJson<Order[]>('orders', []);
  let expected = orders.find(o => o.payment.provider === 'vizzionpay' && o.payment.providerRef === transactionId)?.payment.webhookToken;
  if (!expected) {
    const attempts = await readJson<PixAttempt[]>('pix-attempts', []);
    expected = attempts.find(a => a.order.payment.provider === 'vizzionpay' && a.order.payment.providerRef === transactionId)?.order.payment.webhookToken;
  }
  expected ??= configured;
  if (!expected) throw new HttpError(503, 'Token do webhook ainda não disponível.');
  if (!timingSafeEqual(createHash('sha256').update(token).digest(), createHash('sha256').update(expected).digest())) {
    throw new HttpError(401, 'Webhook não autorizado.');
  }
}

/** Somente recibos autenticados e persistidos podem alterar um pedido local. Sem chamadas externas. */
export async function reconcileVizzionPayOrder(orderId: string): Promise<void> {
  const receipts = await readJson<Receipt[]>('vizzionpay-events', []);
  if (!receipts.some(r => r.event === 'TRANSACTION_PAID')) return;
  await updateJson<Order[]>('orders', [], orders => orders.map(order => {
    if (order.id !== orderId || order.payment.provider !== 'vizzionpay' || order.status === 'paid') return order;
    const receipt = receipts.find(r => r.event === 'TRANSACTION_PAID' && r.transactionId === order.payment.providerRef);
    if (!receipt) return order;
    const t = receipt.transaction;
    const cents = (n: number): number => Math.round(n * 100);
    if (t.identifier && t.identifier !== order.id) return order;
    if (t.paymentMethod !== 'PIX' || t.status !== 'COMPLETED' || t.currency !== 'BRL' || t.originalCurrency !== 'BRL'
      || cents(t.amount) !== cents(order.totals.payable) || cents(t.originalAmount) !== cents(order.totals.payable)) {
      console.warn('vizzionpay_webhook_amount_or_method_mismatch');
      return order;
    }
    // Uma confirmação tardia pode chegar depois do prazo local do QR.
    return { ...order, status: 'paid', paidAt: t.payedAt || receipt.receivedAt };
  }));
  await queueMetaPurchase(orderId);
}

export async function receiveVizzionPayWebhook(body: unknown, expectedEvent?: VizzionPayEvent, auth?: VizzionPayCallbackAuth): Promise<{ accepted: true; ignored?: boolean }> {
  console.info('vizzionpay_webhook_received');
  try {
    await authenticate(body, auth);
  } catch (error) {
    console.warn('vizzionpay_webhook_rejected', error instanceof HttpError ? error.status : 500);
    throw error;
  }
  if (validRegisteredVizzionPayWebhook(auth) && object(body).event !== 'TRANSACTION_PAID') {
    console.info('vizzionpay_webhook_ignored');
    return { accepted: true, ignored: true };
  }
  let payload;
  try { payload = validateVizzionPayPayload(body); } catch (error) {
    console.warn('vizzionpay_webhook_payload_rejected', error instanceof HttpError ? error.status : 500);
    throw error;
  }
  if (expectedEvent && payload.event !== expectedEvent) throw new HttpError(400, 'Evento inválido para este endpoint.');
  const t = payload.transaction;
  if (validVizzionPayCallback(auth)) {
    if (t.identifier && t.identifier !== auth!.orderId) throw new HttpError(400, 'Pedido divergente.');
    t.identifier = auth!.orderId;
  }
  const savedOrders = await readJson<Order[]>('orders', []);
  const savedAttempts = await readJson<PixAttempt[]>('pix-attempts', []);
  const known = savedOrders.find(o => o.payment.provider === 'vizzionpay' && o.payment.providerRef === t.id)
    || savedAttempts.find(a => a.order.payment.provider === 'vizzionpay' && (a.order.payment.providerRef === t.id || validVizzionPayCallback(auth) && a.order.id === auth!.orderId))?.order;
  if (known && (Math.round(t.amount * 100) !== Math.round(known.totals.payable * 100)
      || Math.round(t.originalAmount * 100) !== Math.round(known.totals.payable * 100)
      || t.currency !== 'BRL' || t.originalCurrency !== 'BRL' || t.identifier && t.identifier !== known.id)) {
    throw new HttpError(400, 'Notificação de pagamento divergente do pedido.');
  }
  const receipt: Receipt = {
    event: payload.event, transactionId: t.id, receivedAt: new Date().toISOString(),
    transaction: { paymentMethod: t.paymentMethod, status: t.status, amount: t.amount, currency: t.currency,
      originalAmount: t.originalAmount, originalCurrency: t.originalCurrency, payedAt: t.payedAt, identifier: t.identifier },
  };
  await updateJson<Receipt[]>('vizzionpay-events', [], receipts => {
    const existing = receipts.find(r => r.event === receipt.event && r.transactionId === receipt.transactionId);
    if (existing) {
      if (JSON.stringify(existing.transaction) !== JSON.stringify(receipt.transaction)) throw new HttpError(409, 'Notificação repetida com dados divergentes.');
      return receipts;
    }
    return [...receipts, receipt];
  });
  // Eventos recebidos antes da gravação do pedido ficam disponíveis para reconciliação posterior.
  const order = (await readJson<Order[]>('orders', [])).find(o => o.payment.provider === 'vizzionpay' && o.payment.providerRef === t.id);
  if (order) await reconcileVizzionPayOrder(order.id);
  console.info('vizzionpay_webhook_accepted', payload.event);
  return { accepted: true };
}
