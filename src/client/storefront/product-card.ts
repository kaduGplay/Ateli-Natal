import type { Product } from '../../shared/types';
import { esc } from '../lib/dom';
import { brl, discountPercent, installments } from '../lib/format';
import { isFavorite } from './favorites';
import { state } from './state';

export interface CardOptions {
  index?: number;
  /** Destaque da seção "Mais Vendidos". */
  bestSeller?: boolean;
  /** Mostra o aviso "Restam apenas N!" quando o estoque é baixo. */
  showLowStock?: boolean;
}

function ratingHtml(product: Product): string {
  const summary = state.summaries[product.id];
  if (!summary || summary.count === 0) return '';
  const full = Math.round(summary.average);
  const stars = Array.from({ length: 5 }, (_, i) => `<i class="${i < full ? 'ph-fill' : 'ph'} ph-star"></i>`).join('');
  return `
    <div class="product-rating" style="display:flex;align-items:center;gap:4px;margin-bottom:6px;margin-top:-2px;">
      <div style="display:flex;color:#eab308;font-size:12px;">${stars}</div>
      <span style="font-size:11px;color:#64748b;">${summary.average.toFixed(1)} (${summary.count})</span>
    </div>`;
}

/** Card de produto usado em todas as vitrines (grade, mais vendidos, kits, favoritos, cross-sell). */
export function renderProductCard(product: Product, options: CardOptions = {}): string {
  const { index = 0, bestSeller = false, showLowStock = false } = options;
  const pct = discountPercent(product.price, product.oldPrice);
  const inst = installments(product.price);
  const fav = isFavorite(product.id);
  const lowStock = showLowStock && product.stock > 0 && product.stock <= 5;
  const id = esc(product.id);

  return `
    <article class="product-card fade-in-up${bestSeller ? ' best-seller-card' : ''}" data-glow style="animation-delay:${index * 0.05}s;position:relative;">
      <a href="#produto?id=${encodeURIComponent(product.id)}" class="product-image-link">
        ${pct ? `<div class="badge-discount">-${pct}%</div>` : ''}
        ${bestSeller || product.isBestSeller ? '<div class="badge-best-seller"><i class="ph-fill ph-fire"></i> Mais Vendido</div>' : ''}
        ${lowStock ? `<div style="position:absolute;bottom:8px;left:8px;background:#dc2626;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;z-index:2;letter-spacing:.3px;">Restam apenas ${product.stock}!</div>` : ''}
        <img src="${esc(product.image)}" alt="${esc(product.name)}" class="product-image" loading="lazy">
      </a>
      <div class="product-info">
        <h3 class="product-title"><a href="#produto?id=${encodeURIComponent(product.id)}">${esc(product.name)}</a></h3>
        ${ratingHtml(product)}
        <div class="product-price-box">
          ${product.oldPrice && pct ? `<span class="old-price">${brl(product.oldPrice)}</span>` : ''}
          <span class="current-price">${brl(product.price)}</span>
          <span class="installments">${inst.count > 1 ? `ou ${inst.count}x de ${brl(inst.value)} sem juros` : 'à vista'}</span>
        </div>
        <div class="product-actions" style="display:flex;gap:8px;">
          <a href="#produto?id=${encodeURIComponent(product.id)}" class="btn-buy" style="flex:1;"><i class="ph ph-eye"></i> Detalhes</a>
          <button class="btn-buy fav-btn" data-action="fav-toggle" data-id="${id}" title="Favoritar"
            style="flex:0 0 44px;padding:0;display:flex;align-items:center;justify-content:center;background-color:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;">
            <i class="${fav ? 'ph-fill' : 'ph'} ph-heart" style="font-size:1.25rem;margin:0;color:${fav ? '#e11d48' : '#333'};"></i>
          </button>
          <button class="btn-buy" data-action="quick-add" data-id="${id}" title="Adicionar ao Carrinho"
            style="flex:0 0 44px;padding:0;display:flex;align-items:center;justify-content:center;background-color:#0a3b2c !important;color:#fff !important;border:none;border-radius:8px;cursor:pointer;">
            <i class="ph ph-shopping-cart-simple" style="font-size:1.25rem;margin:0;color:#fff !important;"></i>
          </button>
        </div>
      </div>
    </article>`;
}
