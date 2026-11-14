import { FUNNEL_LABELS, type FunnelName } from '../../shared/funnel.js';
import { readJson, updateJson } from '../storage.js';
import { databaseUrl, getDatabase } from '../database.js';
import { HttpError } from '../errors.js';
import type { Order } from '../../shared/types.js';
import { listProducts } from '../services/catalog.js';

export const names = Object.keys(FUNNEL_LABELS) as FunnelName[];
export type EventName = FunnelName;
export interface Event { id: string; name: EventName; at: string; path: string; product?: string; code?: string; field?: string; duration?: number; quantity?: number; value?: number }
export interface Session { id: string; visitor: string; device: string; source: string; campaign: string; started: string; last: string; events: Event[] }
const uuid = /^[a-f0-9-]{36}$/i;
export const sessionId = (id: unknown): id is string => typeof id === 'string' && uuid.test(id);
const clean = (value: unknown, fallback = ''): string => typeof value === 'string' && !/[@<>\r\n]/.test(value) ? value.slice(0, 80) : fallback;
const localKey = 'analytics-local';
export async function ingest(raw: unknown, server = false): Promise<void> {
  const p = raw as { session?: unknown; visitor?: unknown; device?: unknown; source?: unknown; campaign?: unknown; events?: unknown };
  if (!p || !sessionId(p.session) || !sessionId(p.visitor) || !Array.isArray(p.events) || !p.events.length || p.events.length > 25) throw new HttpError(400, 'Eventos inválidos.');
  const now = new Date().toISOString();
  const events: Event[] = p.events.map((value: unknown) => {
    const e = value as Record<string, unknown>;
    if (!e || !sessionId(e.id) || !names.includes(e.name as EventName) || !server && ['pix_generated', 'pix_error', 'purchase'].includes(String(e.name))) throw new HttpError(400, 'Evento inválido.');
    const time = typeof e.at === 'string' ? Date.parse(e.at) : NaN;
    return { id: e.id, name: e.name as EventName, at: Number.isFinite(time) && Math.abs(Date.now() - time) < 86400000 ? new Date(time).toISOString() : now,
      path: clean(typeof e.path === 'string' ? e.path.split('?')[0] : '').slice(0, 60), product: clean(e.product),
      code: ['invalid_field', 'shipping_failed', 'address_lookup_failed', 'gateway_configuration', 'pix_failed', 'repeated_action'].includes(String(e.code)) ? String(e.code) : '',
      field: typeof e.field === 'string' && /^[a-z][a-zA-Z-]{1,39}$/.test(e.field) ? e.field : '',
      ...(typeof e.quantity === 'number' && Number.isInteger(e.quantity) && e.quantity > 0 && e.quantity <= 999 ? { quantity: e.quantity } : {}),
      ...(typeof e.value === 'number' && Number.isFinite(e.value) && e.value >= 0 && e.value <= 1000000 ? { value: Math.round(e.value * 100) / 100 } : {}),
      ...(typeof e.duration === 'number' && e.duration >= 0 && e.duration <= 120000 ? { duration: Math.round(e.duration) } : {}) };
  });
  const initial: Session = { id: p.session, visitor: p.visitor, device: ['mobile', 'desktop', 'tablet'].includes(String(p.device)) ? String(p.device) : 'unknown',
    source: clean(p.source, 'Direto') || 'Direto', campaign: clean(p.campaign), started: now, last: now, events: [] };
  const merge = (old: Session): Session => { const combined = [...old.events, ...events.filter(e => !old.events.some(o => o.id === e.id))]; return { ...old, ...(!server ? { visitor: initial.visitor, device: initial.device, source: initial.source, campaign: initial.campaign } : {}), last: now, events: combined.length > 400 ? [...combined.slice(0, 80), ...combined.slice(-320)] : combined }; };
  if (databaseUrl()) {
    await updateJson<Session>(`analytics:session:${now.slice(0, 10)}:${p.session}`, initial, merge);
  } else {
    await updateJson<Session[]>(localKey, [], rows => {
      const old = rows.find(s => s.id === p.session);
      return [...rows.filter(s => s.id !== p.session), merge(old || initial)];
    });
  }
  await updateJson<{ started: string }>('analytics:meta', { started: now }, value => value);
}
export async function serverEvent(id: unknown, name: EventName, code = '', duration?: number): Promise<void> {
  if (!sessionId(id)) return;
  const { randomUUID } = await import('node:crypto');
  try { await ingest({ session: id, visitor: id, device: 'unknown', source: 'Direto', events: [{ id: randomUUID(), name, at: new Date().toISOString(), path: '/checkout.html', code, duration }] }, true); }
  catch { console.warn('funnel_server_event_unavailable'); }
}

export const stages = [ ['visit', 'Visitou a loja'], ['product_impression', 'Viu produto na vitrine'], ['product_view', 'Abriu detalhes do produto'], ['add_to_cart', 'Adicionou produto ao carrinho'], ['cart_open', 'Abriu o carrinho'], ['checkout_click', 'Clicou em finalizar compra'], ['checkout_view', 'Abriu checkout'], ['checkout_customer', 'Começou o cadastro'], ['checkout_address', 'Avançou para entrega'], ['checkout_payment', 'Chegou ao pagamento'], ['pix_submit', 'Clicou em gerar Pix'], ['pix_generated', 'Pix gerado pelo servidor'], ['payment_view', 'Abriu a página do Pix'], ['pix_copy', 'Copiou código Pix'], ['purchase', 'Compra confirmada'] ] as const;
export function summarize(rows: Session[], orders: Order[], from: number, to: number, now = Date.now()) {
  const sessions = new Map<string, Session>();
  for (const row of rows) {
    const events = row.events.filter(e => Date.parse(e.at) >= from && Date.parse(e.at) < to);
    if (!events.length) continue;
    const old = sessions.get(row.id);
    sessions.set(row.id, old ? { ...old, last: row.last > old.last ? row.last : old.last, events: [...old.events, ...events] } : { ...row, events });
  }
  const validOrders = orders.filter(o => Date.parse(o.createdAt) >= from && Date.parse(o.createdAt) < to);
  const generated = validOrders.filter(o => Boolean(o.payment.providerRef && o.payment.charge.copyPaste));
  const paid = validOrders.filter(o => o.status === 'paid');
  const has = (s: Session, name: string): boolean => name === 'purchase' ? paid.some(o => o.analyticsSessionId === s.id) : name === 'pix_generated' ? generated.some(o => o.analyticsSessionId === s.id) || s.events.some(e => e.name === name) : s.events.some(e => e.name === name);
  const all = [...sessions.values()];
  const funnel = stages.map(([key, label]) => ({ key, label, count: all.filter(s => has(s, key)).length }));
  const mature = all.filter(s => Date.parse(s.last) < now - 30 * 60000);
  const losses = stages.slice(0, -1).map(([key, label], i) => {
    const next = stages[i + 1]; const entered = mature.filter(s => has(s, key));
    const progressed = entered.filter(s => stages.slice(i + 1).some(([stage]) => has(s, stage))).length;
    return { from: key, label, to: next[1], entered: entered.length, lost: entered.length - progressed, rate: entered.length ? Math.round((entered.length - progressed) / entered.length * 1000) / 10 : 0 };
  }).filter(x => x.entered >= 3).sort((a, b) => b.lost - a.lost || b.rate - a.rate);
  const group = (key: 'device' | 'source') => [...new Set(all.map(s => s[key]))].map(label => {
    const list = all.filter(s => s[key] === label); const ids = new Set(list.map(s => s.id));
    return { label, sessions: list.length, checkout: list.filter(s => has(s, 'checkout_view')).length, pix: list.filter(s => has(s, 'pix_generated')).length, paid: paid.filter(o => ids.has(o.analyticsSessionId || '')).length };
  }).sort((a, b) => b.sessions - a.sessions).slice(0, 12);
  const errors = new Map<string, { code: string; field: string; count: number; sessions: Set<string> }>();
  const products = new Map<string, { id: string; impressions: Set<string>; views: Set<string>; carts: Set<string>; viewEvents: number; addEvents: number; units: number; removals: number }>();
  for (const s of all) for (const e of s.events) {
    if (['validation_error', 'shipping_error', 'address_error', 'pix_error', 'coupon_error', 'repeated_click'].includes(e.name)) {
      const key = `${e.name}:${e.code}:${e.field}`; const item = errors.get(key) || { code: e.code || e.name, field: e.field || e.name, count: 0, sessions: new Set<string>() };
      item.count++; item.sessions.add(s.id); errors.set(key, item);
    }
    if (e.product && ['product_impression', 'product_view', 'add_to_cart', 'cart_remove'].includes(e.name)) {
      const p = products.get(e.product) || { id: e.product, impressions: new Set<string>(), views: new Set<string>(), carts: new Set<string>(), viewEvents: 0, addEvents: 0, units: 0, removals: 0 };
      if (e.name === 'product_impression') p.impressions.add(s.id);
      if (e.name === 'product_view') { p.views.add(s.id); p.viewEvents++; }
      if (e.name === 'add_to_cart') { p.carts.add(s.id); p.addEvents++; p.units += e.quantity || 1; }
      if (e.name === 'cart_remove') p.removals++;
      products.set(e.product, p);
    }
  }
  const latency = (name: string) => { const values = all.flatMap(s => s.events.filter(e => e.name === name && e.duration != null).map(e => e.duration!)).sort((a, b) => a - b); return { samples: values.length, median: values.length ? values[Math.floor((values.length - 1) * .5)] : 0, p90: values.length ? values[Math.floor((values.length - 1) * .9)] : 0 }; };
  const days = new Map<string, { day: string; sessions: Set<string>; checkout: Set<string> }>();
  for (const s of all) for (const e of s.events) { const day = new Date(e.at).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); const d = days.get(day) || { day, sessions: new Set<string>(), checkout: new Set<string>() }; d.sessions.add(s.id); if (e.name === 'checkout_view') d.checkout.add(s.id); days.set(day, d); }
  const actions = names.filter(name => !['engaged', 'page_exit', 'purchase'].includes(name)).map(name => ({ name, label: FUNNEL_LABELS[name], count: all.reduce((n, s) => n + s.events.filter(e => e.name === name).length, 0), sessions: all.filter(s => has(s, name)).length }));
  actions.push({ name: 'purchase', label: FUNNEL_LABELS.purchase, count: paid.filter(o => all.some(s => s.id === o.analyticsSessionId)).length, sessions: all.filter(s => has(s, 'purchase')).length });
  return { actions, totals: { productImpressions: all.reduce((n, s) => n + s.events.filter(e => e.name === 'product_impression').length, 0), productViews: all.reduce((n, s) => n + s.events.filter(e => e.name === 'product_view').length, 0), cartAdds: all.reduce((n, s) => n + s.events.filter(e => e.name === 'add_to_cart').length, 0), checkouts: all.filter(s => has(s, 'checkout_view')).length, sessions: all.length, visitors: new Set(all.map(s => s.visitor)).size, active: all.filter(s => Date.parse(s.last) > now - 5 * 60000).length, pageViews: all.reduce((n, s) => n + s.events.filter(e => e.name === 'visit').length, 0), pix: generated.length, paid: paid.length, revenue: Math.round(paid.reduce((n, o) => n + o.totals.payable, 0) * 100) / 100, pending: validOrders.filter(o => o.status === 'pending').length, unattributed: validOrders.filter(o => !o.analyticsSessionId).length },
    funnel, losses, devices: group('device'), sources: group('source'),
    errors: [...errors.values()].map(e => ({ ...e, sessions: e.sessions.size })).sort((a, b) => b.count - a.count).slice(0, 20),
    products: [...products.values()].map(p => ({ id: p.id, impressions: p.impressions.size, views: p.views.size, carts: p.carts.size, viewEvents: p.viewEvents, addEvents: p.addEvents, units: p.units, removals: p.removals, paid: paid.filter(o => o.items?.some(i => i.productId === p.id && !i.isGift)).length })).sort((a, b) => b.views - a.views || b.impressions - a.impressions).slice(0, 30),
    latency: { shipping: latency('shipping_success'), pix: latency('pix_generated') },
    timeline: [...days.values()].map(d => ({ day: d.day, sessions: d.sessions.size, checkout: d.checkout.size })).sort((a, b) => a.day.localeCompare(b.day)),
    journeys: all.sort((a, b) => b.last.localeCompare(a.last)).slice(0, 30).map(s => ({ id: s.id.slice(-6), device: s.device, source: s.source, campaign: s.campaign, last: s.last, stages: stages.filter(([key]) => has(s, key)).map(([key]) => key), events: [...s.events.filter(e => e.name !== 'engaged'), ...paid.filter(o => o.analyticsSessionId === s.id).map((o): Event => ({ id: 'server-' + o.id, name: 'purchase' as EventName, at: o.paidAt || o.createdAt, path: '/obrigado.html', value: o.totals.payable }))].sort((a, b) => a.at.localeCompare(b.at)).slice(-120), totalActions: s.events.filter(e => e.name !== 'engaged').length, errors: s.events.filter(e => e.name.endsWith('error')).length, ongoing: Date.parse(s.last) > now - 30 * 60000 })) };
}
export async function report(days: number, device: string, source: string) {
  const now = new Date(); const day = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const to = Date.parse(day + 'T00:00:00-03:00') + 86400000;
  const campaignStart = Date.parse(process.env.ADMIN_ANALYTICS_START_AT || '');
  const from = Math.max(to - days * 86400000, Number.isFinite(campaignStart) ? campaignStart : 0);
  let rows: Session[];
  if (databaseUrl()) { const db = await getDatabase(); const r = await db.query("SELECT data FROM storefront_documents WHERE name LIKE 'analytics:session:%' AND updated_at >= $1 ORDER BY updated_at DESC LIMIT 20001", [new Date(from)]); rows = r.rows.map(r => r.data); }
  else rows = await readJson<Session[]>(localKey, []);
  const limited = rows.length > 20000; rows = rows.slice(0, 20000).filter(s => (device === 'all' || s.device === device) && (source === 'all' || s.source === source));
  let orders = await readJson<Order[]>('orders', []);
  if (device !== 'all' || source !== 'all') { const ids = new Set(rows.map(s => s.id)); orders = orders.filter(o => ids.has(o.analyticsSessionId || '')); }
  const data = summarize(rows, orders, from, to);
  const catalog = await listProducts(); data.products.forEach(p => Object.assign(p, { name: catalog.find(c => c.id === p.id)?.name || p.id }));
  data.journeys.forEach(j => j.events.forEach(e => { if (e.product) Object.assign(e, { productName: catalog.find(p => p.id === e.product)?.name || e.product }); }));
  const started = await readJson('analytics:meta', { started: '' });
  return { ...data, collectionStarted: Number.isFinite(campaignStart) ? new Date(campaignStart).toISOString() : started.started, limited, from: new Date(from).toISOString(), to: new Date(to).toISOString(), generatedAt: now.toISOString() };
}
