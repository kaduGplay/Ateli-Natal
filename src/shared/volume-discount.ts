import { CURTAIN_PRODUCT_ID } from './meta-pixels.js';
export const CURTAIN_VOLUME_PERCENT = 25;
export const BALCONY_PIXEL_PRODUCT_ID = 'SKU-VARANDA-PIXEL';
export const BALCONY_PIXEL_TWO_UNIT_PRICE = 99.9;
export const BALCONY_PIXEL_PROMO_UNIT_PRICE = BALCONY_PIXEL_TWO_UNIT_PRICE / 2;

export interface VolumeOffer {
  label: string;
  total: number;
  savings: number;
}

export function volumeOffer(items: Array<{ productId: string; qty: number; unitPrice: number; isBump?: boolean }>): VolumeOffer | undefined {
  const eligible = items.filter(item => !item.isBump && item.productId === BALCONY_PIXEL_PRODUCT_ID);
  const qty = eligible.reduce((sum, item) => sum + item.qty, 0);
  if (qty < 2) return undefined;
  const subtotal = eligible.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const total = Math.round(qty * BALCONY_PIXEL_PROMO_UNIT_PRICE * 100) / 100;
  return {
    label: qty === 2 ? 'Leve 2 por R$ 99,90' : `${qty} unidades por ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}`,
    total,
    savings: Math.max(0, Math.round((subtotal - total) * 100) / 100),
  };
}

export function volumeDiscount(items: Array<{ productId: string; qty: number; unitPrice: number; isBump?: boolean }>): number {
  const eligible = items.filter(item => item.productId === CURTAIN_PRODUCT_ID && !item.isBump);
  const curtainDiscount = eligible.reduce((sum, item) => sum + item.qty, 0) < 2
    ? 0
    : Math.round(eligible.reduce((sum, item) => sum + item.unitPrice * item.qty, 0) * CURTAIN_VOLUME_PERCENT) / 100;
  return curtainDiscount + (volumeOffer(items)?.savings ?? 0);
}
