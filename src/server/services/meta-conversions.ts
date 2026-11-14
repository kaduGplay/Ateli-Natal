import { CURTAIN_PRODUCT_ID, CURTAIN_PIXEL_ID, CURTAIN_PIXEL_START_AT } from '../../shared/meta-pixels.js';
import { createHash, randomUUID } from 'node:crypto';
import type { Order } from '../../shared/types.js';
import { readJson, updateJson } from '../storage.js';
import { getSettings } from './catalog.js';

interface MetaEvent {
  event_name: 'Purchase'; event_time: number; event_id: string; action_source: 'website';
  event_source_url: string; user_data: Record<string, string | string[]>;
  custom_data: { currency: 'BRL'; value: number; content_type: 'product'; content_ids: string[];
    contents: Array<{ id: string; quantity: number; item_price: number }>; num_items: number; order_id: string };
}
interface Job { key: string; pixelId: string; event: MetaEvent; state: 'pending' | 'sending' | 'sent';
  attempts: number; nextAttempt: number; lease?: string; leaseUntil?: number; sentAt?: string }
const DOCUMENT = 'meta-conversions';
const hash = (value: string): string => createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
const enabled = (): boolean => Boolean(process.env.META_CONVERSIONS_ACCESS_TOKEN || process.env.META_CORTINA_ACCESS_TOKEN);
const tokenFor = (pixelId: string): string | undefined => pixelId === CURTAIN_PIXEL_ID ? process.env.META_CORTINA_ACCESS_TOKEN : process.env.META_CONVERSIONS_ACCESS_TOKEN;
const startedAt = (): number => Date.parse(process.env.META_CONVERSIONS_START_AT || new Date().toISOString());

export function buildMetaPurchase(order: Order): MetaEvent {
  const email = order.customer.email.trim().toLowerCase();
  let phone = order.customer.phone.replace(/\D/g, '');
  if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
  const user: Record<string, string | string[]> = { em: [hash(email)], ph: [hash(phone)], external_id: [hash(email)], country: [hash('br')] };
  const context = order.meta;
  if (context?.clientIp) user.client_ip_address = context.clientIp;
  if (context?.userAgent) user.client_user_agent = context.userAgent;
  if (context?.fbp) user.fbp = context.fbp;
  if (context?.fbc) user.fbc = context.fbc;
  const base = process.env.PUBLIC_BASE_URL || 'https://atelienatal.online';
  return { event_name: 'Purchase', event_time: Math.floor(Date.parse(order.paidAt || order.createdAt) / 1000), event_id: order.id,
    action_source: 'website', event_source_url: new URL('/obrigado.html', base).toString(), user_data: user,
    custom_data: { currency: 'BRL', value: order.totals.payable, content_type: 'product',
      content_ids: order.items.map(item => item.productId), contents: order.items.map(item => ({ id: item.productId, quantity: item.qty, item_price: item.unitPrice })),
      num_items: order.items.reduce((sum, item) => sum + item.qty, 0), order_id: order.id } };
}

export async function queueMetaPurchase(orderId: string): Promise<void> {
  if (!enabled()) return;
  const order = (await readJson<Order[]>('orders', [])).find(o => o.id === orderId);
  if (!order || order.status !== 'paid') return;
  const paidAt = Date.parse(order.paidAt || order.createdAt);
  const targets: string[] = [];
  const defaultPixelId = (await getSettings()).metaPixelId;
  if (process.env.META_CONVERSIONS_ACCESS_TOKEN && /^\d+$/.test(defaultPixelId) && paidAt >= startedAt()) targets.push(defaultPixelId);
  const curtainStart = Date.parse(process.env.META_CORTINA_START_AT || CURTAIN_PIXEL_START_AT);
  if (process.env.META_CORTINA_ACCESS_TOKEN && paidAt >= curtainStart && order.items.some(item => item.productId === CURTAIN_PRODUCT_ID)) targets.push(CURTAIN_PIXEL_ID);
  for (const pixelId of new Set(targets)) {
    const key = `${pixelId}:Purchase:${order.id}`;
    await updateJson<Job[]>(DOCUMENT, [], jobs => jobs.some(job => job.key === key) ? jobs : [...jobs, {
      key, pixelId, event: buildMetaPurchase(order), state: 'pending', attempts: 0, nextAttempt: Date.now(),
    }]);
  }
}

/** Atomic leases protect against overlapping function instances; event_id protects remote retries. */
export async function flushMetaConversions(limit = 20): Promise<{ sent: number; pending: number }> {
  if (!enabled()) return { sent: 0, pending: 0 };
  const lease = randomUUID(); const now = Date.now(); let claimed: Job[] = [];
  await updateJson<Job[]>(DOCUMENT, [], jobs => jobs.map(job => {
    if (!tokenFor(job.pixelId) || claimed.length >= limit || job.state === 'sent' || job.nextAttempt > now || job.state === 'sending' && (job.leaseUntil || 0) > now) return job;
    const next: Job = { ...job, state: 'sending', lease, leaseUntil: now + 60000, attempts: job.attempts + 1 };
    claimed.push(next); return next;
  }));
  let sent = 0;
  for (const pixelId of new Set(claimed.map(job => job.pixelId))) {
    const token = tokenFor(pixelId);
    const batch = claimed.filter(job => job.pixelId === pixelId); let accepted = false;
    try {
      const response = await fetch(`https://graph.facebook.com/v25.0/${pixelId}/events`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: batch.map(job => job.event) }),
      });
      const body = await response.json().catch(() => null) as { events_received?: number } | null;
      accepted = response.ok && body?.events_received === batch.length;
      if (!accepted) console.warn('meta_conversion_delivery_failed', response.status);
    } catch { console.warn('meta_conversion_delivery_unavailable'); }
    const keys = new Set(batch.map(job => job.key));
    await updateJson<Job[]>(DOCUMENT, [], jobs => jobs.map(job => {
      if (job.lease !== lease || !keys.has(job.key)) return job;
      if (accepted) { sent++; return { ...job, state: 'sent', sentAt: new Date().toISOString(), lease: undefined, leaseUntil: undefined }; }
      return { ...job, state: 'pending', lease: undefined, leaseUntil: undefined, nextAttempt: Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)) };
    }));
  }
  return { sent, pending: claimed.length - sent };
}

/** Also repairs the small crash window between saving a paid order and queueing its event. */
export async function processMetaConversions(): Promise<{ sent: number; pending: number }> {
  if (!enabled()) return { sent: 0, pending: 0 };
  const orders = await readJson<Order[]>('orders', []);
  for (const order of orders) if (order.status === 'paid') await queueMetaPurchase(order.id);
  return flushMetaConversions();
}
