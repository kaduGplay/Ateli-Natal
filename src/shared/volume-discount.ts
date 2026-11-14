import { CURTAIN_PRODUCT_ID } from './meta-pixels.js';
export const CURTAIN_VOLUME_PERCENT = 25;
export function volumeDiscount(items: Array<{ productId: string; qty: number; unitPrice: number; isBump?: boolean }>): number {
  const eligible = items.filter(item => item.productId === CURTAIN_PRODUCT_ID && !item.isBump);
  if (eligible.reduce((sum, item) => sum + item.qty, 0) < 2) return 0;
  return Math.round(eligible.reduce((sum, item) => sum + item.unitPrice * item.qty, 0) * CURTAIN_VOLUME_PERCENT) / 100;
}
