import type { CheckoutRequest, CheckoutResponse } from '../../shared/types';
import { api } from '../lib/api';

let active: CheckoutResponse | undefined;
let fingerprint = '';
const CACHE = 'atelieActivePix';

function showPix(result: CheckoutResponse): void {
  window.location.assign(`/pagamento.html?orderId=${encodeURIComponent(result.orderId)}`);
}

export async function startPix(payload: CheckoutRequest): Promise<void> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const nextFingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (!active) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE) ?? 'null');
      if (cached?.response?.orderId && cached?.fingerprint) { active = cached.response; fingerprint = cached.fingerprint; }
    } catch { /* cache inválido é ignorado */ }
  }
  if (active?.pix.copyPaste.startsWith('DEV-PIX-')) {
    active = undefined;
    try { sessionStorage.removeItem(CACHE); sessionStorage.removeItem('ateliePixAttempt'); } catch { /* cache opcional */ }
  }
  if (active && fingerprint === nextFingerprint && Date.parse(active.pix.expiresAt) > Date.now()) {
    await showPix(active);
    return;
  }
  if (active && Date.parse(active.pix.expiresAt) <= Date.now()) {
    // Consulte antes de gerar outro Pix: o pagamento pode ter chegado no fim do prazo.
    const status = await api.orderStatus(active.orderId);
    if (status.status === 'paid') {
      window.location.assign(`/obrigado.html?orderId=${encodeURIComponent(active.orderId)}`);
      return;
    }
    if (status.status === 'pending') { await showPix(active); return; }
    active = undefined;
    try { sessionStorage.removeItem(CACHE); sessionStorage.removeItem('ateliePixAttempt'); } catch { /* sem armazenamento */ }
  }
  let requestId = crypto.randomUUID();
  try {
    const attempt = JSON.parse(sessionStorage.getItem('ateliePixAttempt') ?? 'null');
    if (attempt?.fingerprint === nextFingerprint && typeof attempt.requestId === 'string') requestId = attempt.requestId;
    else sessionStorage.setItem('ateliePixAttempt', JSON.stringify({ fingerprint: nextFingerprint, requestId }));
  } catch { /* Sem armazenamento, o identificador continua válido nesta requisição. */ }
  const response = await api.checkoutPix({ ...payload, requestId });
  active = response;
  fingerprint = nextFingerprint;
  try { sessionStorage.setItem(CACHE, JSON.stringify({ response, fingerprint })); } catch { /* cache opcional */ }
  await showPix(response);
}
