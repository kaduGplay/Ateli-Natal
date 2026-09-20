import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { CheckoutRequest, CheckoutResponse, Order, OrderStatusResponse } from '../../shared/types.js';
import { isValidCep, isValidCpf, isValidEmail, isValidPhone, onlyDigits } from '../../shared/validation.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { payment, shipping } from '../providers/index.js';
import { readJson, updateJson } from '../storage.js';
import { getSettings, listProducts } from './catalog.js';
import { findCoupon } from './coupons.js';
import { buildOrderItems, computeTotals } from './pricing.js';
import { reconcileVoidPayOrder } from '../webhooks/voidpay.js';

const newOrderId = (): string => `AN${Date.now().toString(36).toUpperCase()}${randomBytes(8).toString('hex').toUpperCase()}`;

function validateCustomer(req: CheckoutRequest): void {
  const { customer, address } = req;
  if (!customer?.name?.trim()) throw new HttpError(400, 'Informe seu nome completo.');
  if (!isValidEmail(customer.email)) throw new HttpError(400, 'E-mail inválido.');
  if (!isValidCpf(customer.document)) throw new HttpError(400, 'O CPF informado é inválido.');
  if (!isValidPhone(customer.phone)) throw new HttpError(400, 'Telefone inválido.');
  if (!isValidCep(address?.cep) || !address.street?.trim() || !address.number?.trim() || !address.neighborhood?.trim() || !address.city?.trim() || !address.state?.trim()) {
    throw new HttpError(400, 'Preencha o endereço de entrega completo.');
  }
}

async function preparePixOrder(req: CheckoutRequest): Promise<Order> {
  validateCustomer(req);

  const [catalog, settings] = await Promise.all([listProducts(), getSettings()]);
  const items = buildOrderItems(req.items, catalog, settings);
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

  const options = await shipping.quote({ cep: onlyDigits(req.address.cep), subtotal });
  const chosen = options.find((o) => o.id === req.shippingOptionId);
  if (!chosen) throw new HttpError(400, 'Selecione uma forma de entrega válida.');

  const uniqueCodes = [...new Set((req.coupons ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean))];
  const coupons = await Promise.all(uniqueCodes.map(findCoupon));

  const totals = computeTotals(items, coupons, chosen.price, settings.pixDiscountPercent);
  const id = newOrderId();
  const expiresAt = new Date(Date.now() + config.pixExpiresMinutes * 60_000);

  const order: Order = {
    id,
    createdAt: new Date().toISOString(),
    status: 'pending',
    customer: { ...req.customer, document: onlyDigits(req.customer.document), phone: onlyDigits(req.customer.phone) },
    address: { ...req.address, cep: onlyDigits(req.address.cep) },
    items,
    coupons,
    shipping: { optionId: chosen.id, name: chosen.name, price: chosen.price, deliveryDays: chosen.deliveryDays },
    totals,
    payment: { method: 'pix', charge: { copyPaste: '', expiresAt: expiresAt.toISOString() }, providerRef: '', provider: 'voidpay' },
  };
  return order;
}

export interface PixAttempt {
  requestId: string;
  fingerprint: string;
  state: 'processing' | 'ready' | 'uncertain' | 'rejected';
  order: Order;
}
const inFlight = new Map<string, { fingerprint: string; promise: Promise<CheckoutResponse> }>();

async function saveOrder(order: Order): Promise<CheckoutResponse> {
  await updateJson<Order[]>('orders', [], orders => orders.some(o => o.id === order.id) ? orders : [...orders, order]);
  await reconcileVoidPayOrder(order.id);
  return { orderId: order.id, totals: order.totals, pix: order.payment.charge };
}

async function createOnce(req: CheckoutRequest, requestId: string, fingerprint: string): Promise<CheckoutResponse> {
  const previous = (await readJson<PixAttempt[]>('pix-attempts', [])).find(a => a.requestId === requestId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new HttpError(409, 'Esta solicitação já foi usada para outro pedido.');
    if (previous.state === 'ready') return saveOrder(previous.order);
    if (previous.state !== 'rejected') throw new HttpError(409, 'A geração deste Pix ainda está em verificação. Aguarde a confirmação antes de gerar outra cobrança.');
  }
  const order = await preparePixOrder(req);
  const attempt: PixAttempt = { requestId, fingerprint, order, state: 'processing' };
  let claimed = false;
  const stored = await updateJson<PixAttempt[]>('pix-attempts', [], attempts => {
    const existing = attempts.find(a => a.requestId === requestId);
    if (existing && existing.fingerprint !== fingerprint) throw new HttpError(409, 'Esta solicitação já foi usada para outro pedido.');
    if (existing && existing.state !== 'rejected') return attempts;
    claimed = true;
    return [...attempts.filter(a => a.requestId !== requestId), attempt];
  });
  if (!claimed) {
    const existing = stored.find(a => a.requestId === requestId)!;
    if (existing.state === 'ready') return saveOrder(existing.order);
    throw new HttpError(409, 'Seu Pix está sendo gerado. Aguarde alguns instantes e tente novamente.');
  }
  try {
    const charge = await payment.createPixCharge({ orderId: order.id, amount: order.totals.payable, customer: order.customer, expiresAt: new Date(order.payment.charge.expiresAt) });
    order.payment = { method: 'pix', provider: charge.provider, providerRef: charge.providerRef,
      webhookToken: charge.webhookToken, charge: { copyPaste: charge.copyPaste, expiresAt: charge.expiresAt ?? order.payment.charge.expiresAt } };
    // Guarda a cobrança antes de expor o QR. Uma repetição recupera este mesmo Pix.
    await updateJson<PixAttempt[]>('pix-attempts', [], attempts => attempts.map(a => a.requestId === requestId ? { ...a, state: 'ready', order } : a));
  } catch (error) {
    const state = error instanceof HttpError && [400, 503].includes(error.status) ? 'rejected' : 'uncertain';
    await updateJson<PixAttempt[]>('pix-attempts', [], attempts => attempts.map(a => a.requestId === requestId ? { ...a, state } : a));
    throw error;
  }
  return saveOrder(order);
}

export function createPixOrder(req: CheckoutRequest): Promise<CheckoutResponse> {
  if (!req || typeof req !== 'object') throw new HttpError(400, 'Pedido inválido.');
  const requestId = req.requestId ?? randomUUID();
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new HttpError(400, 'Identificador de solicitação inválido.');
  const { requestId: _, ...payload } = req;
  const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const running = inFlight.get(requestId);
  if (running) {
    if (running.fingerprint !== fingerprint) throw new HttpError(409, 'Esta solicitação já está sendo processada para outro pedido.');
    return running.promise;
  }
  const promise = createOnce(req, requestId, fingerprint).finally(() => inFlight.delete(requestId));
  inFlight.set(requestId, { fingerprint, promise });
  return promise;
}

export async function getOrder(id: string): Promise<Order | undefined> {
  return (await readJson<Order[]>('orders', [])).find((o) => o.id === id);
}

export function isLegacyTestOrder(order: Order): boolean {
  return order.payment.provider === 'dev' || order.payment.providerRef.startsWith('dev_') || order.payment.charge.copyPaste.startsWith('DEV-PIX-');
}

export async function replaceLegacyPix(id: string): Promise<CheckoutResponse> {
  const order = await getOrder(id);
  if (!order) throw new HttpError(404, 'Pedido não encontrado.');
  if (!isLegacyTestOrder(order)) throw new HttpError(409, 'Este pedido já possui uma cobrança de produção.');
  return createPixOrder({
    requestId: `legacy-pix-${order.id}`,
    customer: order.customer, address: order.address,
    items: order.items.map(({ productId, variant, qty, isBump }) => ({ productId, variant, qty, isBump })),
    shippingOptionId: order.shipping.optionId, coupons: order.coupons.map(c => c.code),
  });
}

export async function resolvePaymentOrder(id: string): Promise<Order> {
  let order = await getOrder(id);
  if (!order) throw new HttpError(404, 'Pedido não encontrado.');
  if (isLegacyTestOrder(order)) {
    const attempt = (await readJson<PixAttempt[]>('pix-attempts', [])).find(a => a.requestId === `legacy-pix-${id}` && a.state === 'ready');
    if (!attempt) throw new HttpError(409, 'Este pedido foi criado pelo gerador antigo de teste. Gere o Pix real para continuar.');
    await saveOrder(attempt.order);
    order = attempt.order;
  }
  await refreshOrderStatus(order.id);
  return (await getOrder(order.id))!;
}

/** Consulta o gateway enquanto o pedido está pendente e persiste a mudança de status. */
export async function refreshOrderStatus(id: string): Promise<OrderStatusResponse> {
  await reconcileVoidPayOrder(id);
  const order = await getOrder(id);
  if (!order) throw new HttpError(404, 'Pedido não encontrado.');

  let status = order.status;
  if (status === 'pending') {
    status = await payment.getPaymentStatus(order.payment.providerRef);
    if (status === 'pending' && Date.now() > new Date(order.payment.charge.expiresAt).getTime()) status = 'expired';
    if (status !== order.status) {
      await updateJson<Order[]>('orders', [], (orders) => orders.map((o) => (o.id === id && o.status === 'pending' ? { ...o, status } : o)));
    }
  }
  const latest = await getOrder(id);
  return { orderId: id, status: latest?.status ?? status, trackingCode: latest?.trackingCode };
}
