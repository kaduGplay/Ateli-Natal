import { pixel } from './lib/pixel';
import { api } from './lib/api';
import { byId } from './lib/dom';
import { getStoreSettings, setStoreSettings, whatsappLink } from './lib/format';

const params = new URLSearchParams(window.location.search);
const orderId = params.get('order') ?? '';
const trackingParam = params.get('tracking');

async function init(): Promise<void> {
  const settings = await api.settings().catch(() => null);
  if (settings) setStoreSettings(settings);
  pixel.init(getStoreSettings().metaPixelId);

  const summary = orderId ? await api.orderSummary(orderId).catch(() => null) : null;

  const code = trackingParam ?? summary?.trackingCode ?? summary?.orderId ?? null;
  const display = byId('trackCodeDisplay');
  if (display) display.textContent = code ?? 'N/A';

  const wpp = byId<HTMLAnchorElement>('btnWppProofSuccess');
  if (wpp && getStoreSettings().whatsapp) {
    wpp.href = whatsappLink('Olá! Acabei de realizar o pagamento e gostaria de enviar o comprovante.');
  }

  byId('trackBtnCopy')?.addEventListener('click', () => void copyCode(code));
  document.querySelector<HTMLElement>('[data-action="copy-track"]')?.addEventListener('click', () => void copyCode(code));

  // Purchase só para pedido pago, uma única vez por pedido (evita repetir ao recarregar a página).
  if (summary && summary.status === 'paid') {
    const key = `pixelPurchase:${summary.orderId}`;
    let alreadySent = false;
    try {
      alreadySent = localStorage.getItem(key) === '1';
    } catch {
      /* sem storage: dispara mesmo assim; o eventID evita duplicar no lado da Meta */
    }
    if (!alreadySent) {
      pixel.purchase(
        summary.orderId,
        summary.items.map((i) => ({ id: i.productId, name: i.name, price: i.unitPrice, qty: i.qty })),
        summary.value,
      );
      try {
        localStorage.setItem(key, '1');
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
