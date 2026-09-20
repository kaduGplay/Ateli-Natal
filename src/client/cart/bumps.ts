import type { Product } from '../../shared/types';
import { byId, esc } from '../lib/dom';
import { brl, getStoreSettings } from '../lib/format';
import { cart } from './store';

export const bumpPrice = (product: Product): number =>
  Math.round(product.price * (1 - getStoreSettings().orderBumpDiscountPercent / 100) * 100) / 100;

export function bumpProducts(products: Product[]): Product[] {
  return products.filter((p) => p.active && p.isOrderBump).sort((a, b) => a.orderBumpOrder - b.orderBumpOrder);
}

/** "Oferta especial": produtos complementares com desconto, no carrinho lateral e no checkout. */
export function renderOrderBumps(products: Product[]): void {
  const containers = [byId('cartOrderBumpContainer'), byId('checkoutOrderBumpContainer')].filter(
    (el): el is HTMLElement => el !== null,
  );
  if (containers.length === 0) return;

  const bumps = bumpProducts(products);
  const pct = getStoreSettings().orderBumpDiscountPercent;

  const html = bumps.length
    ? `<div class="cart-bump-carousel">${bumps
        .map((bump) => {
          const added = cart.has(bump.id, true);
          const button = added
            ? `<button class="cart-order-bump-btn bump-added-btn" type="button" data-action="bump-remove" data-id="${esc(bump.id)}"
                 style="background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;cursor:pointer;display:flex;align-items:center;gap:4px;">✓ ADICIONADO</button>`
            : `<button class="cart-order-bump-btn" type="button" data-action="bump-add" data-id="${esc(bump.id)}">+ Add</button>`;
          return `
            <div class="cart-order-bump${added ? ' bump-added' : ''}">
              <img src="${esc(bump.image)}" alt="${esc(bump.name)}">
              <div class="cart-order-bump-info">
                <div class="cart-order-bump-tag"><i class="ph-fill ph-star"></i> Oferta Especial (-${pct}%)</div>
                <div class="cart-order-bump-name">${esc(bump.name)}</div>
                <div class="cart-order-bump-price-box">
                  <span class="cart-order-bump-old-price">${brl(bump.price)}</span>
                  <span class="cart-order-bump-price">${brl(bumpPrice(bump))}</span>
                </div>
              </div>
              ${button}
            </div>`;
        })
        .join('')}</div>`
    : '';

  containers.forEach((el) => {
    el.innerHTML = html;
  });
}

export function addBump(product: Product): void {
  cart.add({ productId: product.id, name: product.name, image: product.image, price: bumpPrice(product), isBump: true });
}
