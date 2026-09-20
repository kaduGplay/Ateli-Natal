/**
 * Pixel da Meta (Facebook) com eventos padrão de e-commerce.
 * Se `metaPixelId` estiver vazio nas configurações, todas as funções viram no-op.
 */
type FbqArgs = [string, ...unknown[]];
interface Fbq {
  (...args: FbqArgs): void;
  callMethod?: (...args: FbqArgs) => void;
  queue: FbqArgs[];
  loaded: boolean;
  version: string;
  push: Fbq;
}
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export interface PixelItem {
  id: string;
  name?: string;
  price: number;
  qty: number;
}

const CURRENCY = 'BRL';
let ready = false;
let firstPageViewSent = false;

function loadFbevents(): void {
  if (window.fbq) return;
  const fbq = function (...args: FbqArgs): void {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
}

function track(event: string, params?: Record<string, unknown>, eventId?: string): void {
  if (!ready || !window.fbq) return;
  if (eventId) window.fbq('track', event, params ?? {}, { eventID: eventId });
  else window.fbq('track', event, params ?? {});
}

const contents = (items: PixelItem[]): Array<{ id: string; quantity: number; item_price: number }> =>
  items.map((i) => ({ id: i.id, quantity: i.qty, item_price: i.price }));
const sum = (items: PixelItem[]): number => Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
const ids = (items: PixelItem[]): string[] => items.map((i) => i.id);

export const pixel = {
  /** Carrega o pixel e dispara o primeiro PageView. */
  init(pixelId: string): void {
    if (!pixelId || ready) return;
    loadFbevents();
    window.fbq?.('init', pixelId);
    ready = true;
    firstPageViewSent = true;
    track('PageView');
  },

  /** PageView em navegações internas (a vitrine é uma SPA por hash). */
  pageView(): void {
    if (!firstPageViewSent) {
      firstPageViewSent = true;
      return;
    }
    track('PageView');
  },

  viewContent(item: PixelItem, category?: string): void {
    track('ViewContent', {
      content_type: 'product',
      content_ids: [item.id],
      content_name: item.name,
      content_category: category,
      value: item.price,
      currency: CURRENCY,
    });
  },

  viewCategory(slug: string): void {
    if (ready) window.fbq?.('trackCustom', 'ViewCategory', { content_category: slug });
  },

  addToCart(item: PixelItem): void {
    track('AddToCart', {
      content_type: 'product',
      content_ids: [item.id],
      content_name: item.name,
      contents: contents([item]),
      value: sum([item]),
      currency: CURRENCY,
    });
  },

  addToWishlist(item: PixelItem): void {
    track('AddToWishlist', { content_type: 'product', content_ids: [item.id], content_name: item.name, value: item.price, currency: CURRENCY });
  },

  initiateCheckout(items: PixelItem[]): void {
    track('InitiateCheckout', {
      content_type: 'product',
      content_ids: ids(items),
      contents: contents(items),
      num_items: items.reduce((n, i) => n + i.qty, 0),
      value: sum(items),
      currency: CURRENCY,
    });
  },

  addPaymentInfo(items: PixelItem[], value: number): void {
    track('AddPaymentInfo', { content_type: 'product', content_ids: ids(items), contents: contents(items), value, currency: CURRENCY });
  },

  /** `orderId` vira eventID para deduplicar com a API de Conversões no futuro. */
  purchase(orderId: string, items: PixelItem[], value: number): void {
    track(
      'Purchase',
      {
        content_type: 'product',
        content_ids: ids(items),
        contents: contents(items),
        num_items: items.reduce((n, i) => n + i.qty, 0),
        value,
        currency: CURRENCY,
      },
      orderId,
    );
  },
};
