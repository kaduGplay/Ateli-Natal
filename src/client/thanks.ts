import { initAnalytics } from './lib/analytics';
import { pixel } from './lib/pixel';
import { api } from './lib/api';
import { byId } from './lib/dom';
import { getStoreSettings, setStoreSettings } from './lib/format';
import { cart } from './cart/store';

const params = new URLSearchParams(window.location.search);
const orderId = params.get('orderId') ?? params.get('order') ?? '';

async function init(): Promise<void> {
  const settings = await api.settings().catch(() => null);
  if (settings) setStoreSettings(settings);
  initAnalytics(getStoreSettings());

  const summary = orderId ? await api.orderSummary(orderId).catch(() => null) : null;

  const paid = summary?.status === 'paid';
  const heading = byId('paymentHeading');
  const description = byId('paymentDescription');
  if (heading) heading.textContent = paid ? 'Pagamento confirmado!' : summary ? 'Pagamento ainda não confirmado' : 'Não foi possível consultar o pedido';
  if (description) description.textContent = paid ? 'Seu pedido foi recebido. Acompanhe o envio pelo código abaixo.' : 'Consulte o pagamento na tela do Pix ou tente novamente em instantes.';
  const icon = byId('paymentIcon');
  if (icon) icon.className = paid ? 'ph-bold ph-check' : 'ph-bold ph-clock';
  const details = byId('orderDetails');
  if (details) details.hidden = !summary;
  const label = byId('trackingLabel');
  if (label) label.textContent = summary?.trackingCode ? 'Código de rastreio' : 'Número do pedido';
  const code = summary?.trackingCode ?? summary?.orderId ?? null;
  const display = byId('trackCodeDisplay');
  if (display) display.textContent = code ?? 'N/A';

  byId('copyTracking')?.addEventListener('click', () => void copyCode(code));
  document.querySelector<HTMLElement>('[data-action="copy-track"]')?.addEventListener('click', () => void copyCode(code));

  // Purchase só para pedido pago, uma única vez por pedido (evita repetir ao recarregar a página).
  if (summary && summary.status === 'paid') {
    cart.clear();
    try {
      for (const key of ['atelieActivePix', 'ateliePixAttempt', 'atelieCheckoutDraft']) sessionStorage.removeItem(key);
    } catch { /* armazenamento opcional */ }
    const key = `pixelPurchase:${summary.orderId}`;
    let alreadySent = false;
    try {
      alreadySent = localStorage.getItem(key) === '1';
    } catch {
      /* sem storage: dispara mesmo assim; o eventID evita duplicar no lado da Meta */
    }
    if (!alreadySent) {
      const queued = pixel.purchase(
        summary.orderId,
        summary.items.map((i) => ({ id: i.productId, name: i.name, price: i.unitPrice, qty: i.qty })),
        summary.value,
      );
      try {
        if (queued) localStorage.setItem(key, '1');
      } catch {
        /* ignorado */
      }
    }
  }
}

async function copyCode(code: string | null): Promise<void> {
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    /* ignorado */
  }
}

void init();
