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

/** Valida os campos financeiros necessários; metadados de checkout não são obrigatórios. */
export function validateVizzionPayPayload(raw: unknown): VizzionPayPayload {
  const p = object(raw);
  enumeration(p.event, ['TRANSACTION_PAID']);
  if (p.token !== undefined) string(p.token, true);
  const t = object(p.transaction);
  string(t.id, true);
  if (t.identifier !== undefined) string(t.identifier, true);
  enumeration(t.status, ['COMPLETED']);
  enumeration(t.paymentMethod, ['PIX']);
  number(t.amount);
  if ((t.amount as number) <= 0) fail();
  enumeration(t.currency, ['BRL']);
  if (t.originalAmount !== undefined) number(t.originalAmount);
  if (t.originalCurrency !== undefined) enumeration(t.originalCurrency, ['BRL']);
  if (t.createdAt !== undefined) date(t.createdAt);
  if (t.payedAt != null) date(t.payedAt);
  return { event: p.event, token: p.token,
    transaction: { id: t.id, identifier: t.identifier, status: t.status, paymentMethod: t.paymentMethod,
      amount: t.amount, currency: t.currency, originalAmount: t.originalAmount ?? t.amount,
      originalCurrency: t.originalCurrency ?? t.currency, payedAt: t.payedAt ?? null,
      createdAt: t.createdAt },
  } as unknown as VizzionPayPayload;
}
