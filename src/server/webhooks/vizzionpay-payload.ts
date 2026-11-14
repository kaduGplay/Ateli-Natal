import { HttpError } from '../errors.js';

export type VizzionPayEvent = 'TRANSACTION_PAID';
export interface VizzionPayAddress {
  country: string; zipCode: string; state: string; city: string; neighborhood: string;
  street: string; number: string; complement?: string | null;
}
export interface VizzionPayClient {
  id: string; name: string; email: string; phone: string; cpf: string | null; cnpj: string | null;
  address: VizzionPayAddress | null;
}
export interface VizzionPaySubscription {
  id: string; identifier: string; cycle: number; startAt: string;
  intervalType: 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS'; intervalCount: number;
  status: 'ACTIVE' | 'INACTIVE' | 'CANCELED';
}
export interface VizzionPayItem {
  id: string; price: number; product: { id: string; name: string; externalId: string };
}
export interface VizzionPayTrackProps {
  utm_id?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string;
  utm_content?: string; utm_term?: string; fbc?: string; fbp?: string; ip?: string;
  country?: string; user_agent?: string; zip_code?: string; city?: string; state?: string;
  isUpsell?: boolean;
}
export interface VizzionPayTransaction {
  id: string;
  /** Ausente nos exemplos oficiais, apesar de listado como obrigatório na tabela. */
  identifier?: string;
  status: 'COMPLETED' | 'FAILED' | 'PENDING' | 'REFUNDED' | 'CHARGED_BACK';
  paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO' | 'CRYPTO';
  originalAmount: number; amount: number; commissionAmount?: number;
  originalCurrency: string; currency: string; exchangeRate: number; installments: number;
  createdAt: string; payedAt: string | null;
  pixInformation?: { id?: string; qrCode: string; endToEndId: string | null } | null;
  pixMetadata?: { payerName?: string; payerDocument?: string; payerBankName?: string; payerBankAccount?: string; payerBankBranch?: string; receiverName?: string; receiverDocument?: string; receiverBankName?: string; receiverBankAccount?: string; receiverBankBranch?: string };
  boletoInformation?: { transactionId: string; id: string; barcode: string; digitableLine: string;
    pdfUrl: string; instructions: string; createdAt: string; updatedAt: string } | null;
}
export interface VizzionPayPayload {
  event: VizzionPayEvent; token: string; offerCode: string; checkoutUrl: string; client: VizzionPayClient;
  transaction: VizzionPayTransaction; subscription: VizzionPaySubscription | null;
  orderItems: VizzionPayItem[]; trackProps: VizzionPayTrackProps;
}

function fail(): never { throw new HttpError(400, 'Payload de webhook inválido.'); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function string(value: unknown, nonempty = false): void {
  if (typeof value !== 'string' || (nonempty && !value.trim())) fail();
}
function number(value: unknown, integer = false): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) fail();
}
function date(value: unknown): void {
  string(value, true);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value as string) || !Number.isFinite(Date.parse(value as string))) fail();
}
function strings(value: Record<string, unknown>, keys: string[]): void { keys.forEach(k => string(value[k])); }
function nullableString(value: unknown): void { if (value !== null) string(value); }
function enumeration(value: unknown, allowed: readonly string[]): void { if (!allowed.includes(value as string)) fail(); }

/** Valida o evento TRANSACTION_PAID documentado pela Vizzion Pay. */
export function validateVizzionPayPayload(raw: unknown): VizzionPayPayload {
  const p = object(raw);
  enumeration(p.event, ['TRANSACTION_PAID']);
  strings(p, ['token', 'offerCode', 'checkoutUrl']);
  const client = object(p.client);
  strings(client, ['id', 'name', 'email', 'phone']);
  nullableString(client.cpf); nullableString(client.cnpj);
  if (client.address !== null) {
    const address = object(client.address);
    strings(address, ['country', 'zipCode', 'state', 'city', 'neighborhood', 'street', 'number']);
    if (address.complement !== undefined) nullableString(address.complement);
  }
  const t = object(p.transaction);
  string(t.id, true);
  if (t.identifier !== undefined) string(t.identifier);
  enumeration(t.status, ['COMPLETED', 'FAILED', 'PENDING', 'REFUNDED', 'CHARGED_BACK']);
  enumeration(t.paymentMethod, ['CREDIT_CARD', 'PIX', 'BOLETO', 'CRYPTO']);
  for (const k of ['originalAmount', 'amount', 'exchangeRate']) number(t[k]);
  if (t.commissionAmount !== undefined) number(t.commissionAmount);
  number(t.installments, true);
  strings(t, ['originalCurrency', 'currency']);
  date(t.createdAt);
  if (t.payedAt !== null) date(t.payedAt);
  if (p.event === 'TRANSACTION_PAID' && (t.status !== 'COMPLETED' || !t.payedAt)) fail();
  if (t.pixInformation != null) {
    const pix = object(t.pixInformation);
    if (pix.id !== undefined) string(pix.id);
    string(pix.qrCode); nullableString(pix.endToEndId);
  }
  if (t.pixMetadata !== undefined) {
    const metadata = object(t.pixMetadata);
    for (const key of ['payerName', 'payerDocument', 'payerBankName', 'payerBankAccount', 'payerBankBranch', 'receiverName', 'receiverDocument', 'receiverBankName', 'receiverBankAccount', 'receiverBankBranch']) {
      if (metadata[key] !== undefined) string(metadata[key]);
    }
  }
  if (t.boletoInformation != null) {
    const boleto = object(t.boletoInformation);
    strings(boleto, ['transactionId', 'id', 'barcode', 'digitableLine', 'pdfUrl', 'instructions']);
    date(boleto.createdAt); date(boleto.updatedAt);
  }
  const subscription = p.subscription !== undefined ? p.subscription : t.subscription;
  if (subscription !== null) {
    const sub = object(subscription);
    strings(sub, ['id', 'identifier']); date(sub.startAt);
    number(sub.cycle, true); number(sub.intervalCount, true);
    enumeration(sub.intervalType, ['DAYS', 'WEEKS', 'MONTHS', 'YEARS']);
    enumeration(sub.status, ['ACTIVE', 'INACTIVE', 'CANCELED']);
  }
  const items = p.orderItems !== undefined ? p.orderItems : t.orderItems;
  if (!Array.isArray(items)) fail();
  for (const item of items) {
    const i = object(item); string(i.id); number(i.price);
    strings(object(i.product), ['id', 'name', 'externalId']);
  }
  const track = object(p.trackProps !== undefined ? p.trackProps : t.trackProps);
  for (const key of ['utm_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbc', 'fbp', 'ip', 'country', 'user_agent', 'zip_code', 'city', 'state']) {
    if (track[key] !== undefined) string(track[key]);
  }
  if (track.isUpsell !== undefined && typeof track.isUpsell !== 'boolean') fail();
  return { ...p, subscription, orderItems: items, trackProps: track } as unknown as VizzionPayPayload;
}
