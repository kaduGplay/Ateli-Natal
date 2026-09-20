import type { AppliedCoupon, CheckoutRequest, OrderItem, OrderTotals, Product, StoreSettings } from '../../shared/types.js';
import { HttpError } from '../errors.js';

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Monta os itens do pedido usando SOMENTE preços/estoque do catálogo.
 * O que o navegador envia (preço, nome) nunca é confiado.
 */
export function buildOrderItems(
  requested: CheckoutRequest['items'],
  catalog: Product[],
  settings: StoreSettings,
): OrderItem[] {
  if (!Array.isArray(requested) || requested.length === 0) throw new HttpError(400, 'Carrinho vazio.');

  return requested.map((line) => {
    const product = catalog.find((p) => p.id === line.productId);
    if (!product) throw new HttpError(400, `Produto não encontrado: ${line.productId}`);

    const qty = Math.floor(Number(line.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) throw new HttpError(400, `Quantidade inválida para ${product.name}.`);
    if (product.stock < qty) throw new HttpError(409, `Estoque insuficiente para ${product.name}.`);
    if (line.isBump && !product.isOrderBump) throw new HttpError(400, `${product.name} não é uma oferta especial.`);

    const unitPrice = line.isBump ? round2(product.price * (1 - settings.orderBumpDiscountPercent / 100)) : product.price;
    return { productId: product.id, name: product.name, variant: String(line.variant ?? ''), unitPrice, qty, isBump: Boolean(line.isBump) };
  });
}

export function couponDiscount(coupons: AppliedCoupon[], subtotal: number): number {
  const total = coupons.reduce((sum, c) => sum + (c.type === 'percent' ? subtotal * (c.value / 100) : c.value), 0);
  return round2(Math.min(total, subtotal));
}

export function computeTotals(items: OrderItem[], coupons: AppliedCoupon[], shipping: number, pixPercent: number): OrderTotals {
  const subtotal = round2(items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0));
  const discount = couponDiscount(coupons, subtotal);
  const total = round2(subtotal - discount + shipping);
  const payable = round2(total * (1 - pixPercent / 100));
  return { subtotal, discount, shipping, total, pixDiscount: round2(total - payable), payable };
}
