import type { Product } from '../../shared/types';
import { api, ApiError } from '../lib/api';
import { byId, esc, qs, qsa } from '../lib/dom';
import { brl, getStoreSettings } from '../lib/format';
import { addBump, renderOrderBumps } from './bumps';
import { cart } from './store';
import { maskCep } from '../lib/masks';
import { onlyDigits } from '../../shared/validation';

let catalog: Product[] = [];

export function setDrawerCatalog(products: Product[]): void {
  catalog = products;
  renderOrderBumps(catalog);
}

export function openDrawer(): void {
  byId('cartDrawerOverlay')?.classList.add('active');
  byId('cartDrawer')?.classList.add('open');
}

export function closeDrawer(): void {
  byId('cartDrawerOverlay')?.classList.remove('active');
  byId('cartDrawer')?.classList.remove('open');
}

export function toggleDrawer(): void {
  if (byId('cartDrawer')?.classList.contains('open')) closeDrawer();
  else openDrawer();
}

function renderBadges(): void {
  const count = cart.count();
  qsa('.cart-badge, .nav-item.cart-nav .badge').forEach((badge) => {
    badge.textContent = String(count);
    badge.classList.add('bump');
    setTimeout(() => badge.classList.remove('bump'), 300);
  });
}

function renderFreeShippingBar(total: number): void {
  const container = byId('freeShippingProgressContainer');
  const text = byId('freeShippingText');
  const bar = byId('freeShippingBar');
  const promo = byId('freeShippingPromoText');
  const icon = byId('promoIcon');
  if (!container || !text || !bar || !promo) return;

  if (cart.lines().length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  const target = getStoreSettings().freeShippingThreshold;
  const missing = target - total;
  const reached = missing <= 0;
  text.innerHTML = reached
    ? '<strong style="color: #059669;">Você ganhou Frete Grátis!</strong>'
    : `Faltam <strong style="color: #059669;">${brl(missing)}</strong> para Frete Grátis!`;
  text.style.color = reached ? '#059669' : '#334155';
  bar.style.width = `${Math.min(100, (total / target) * 100)}%`;
  bar.style.background = reached ? '#059669' : 'linear-gradient(90deg, #34d399, #059669)';
  promo.textContent = reached ? 'Seu pedido será enviado com Envio Expresso!' : 'Aproveite o nosso Envio Expresso Especial!';
  promo.style.color = reached ? '#059669' : '#64748b';
  if (icon) {
    icon.style.color = reached ? '#059669' : '#64748b';
    icon.className = reached ? 'ph-fill ph-check-circle' : 'ph-fill ph-clock';
  }
  container.style.background = reached ? '#f0fdf4' : '#ffffff';
  container.style.borderBottom = `1px solid ${reached ? '#bbf7d0' : '#e2e8f0'}`;
}

export function renderDrawer(): void {
  const body = byId('cartDrawerItems');
  if (!body) return;

  const lines = cart.lines();
  const total = cart.total();
  const qty = cart.count();

  const count = byId('cartDrawerCount');
  if (count) count.textContent = qty === 1 ? '1 item' : `${qty} itens`;
  const totalEl = byId('cartDrawerTotal');
  if (totalEl) totalEl.textContent = brl(total);
  const subtotalEl = byId('cartDrawerSubtotal');
  if (subtotalEl) subtotalEl.textContent = brl(total);

  renderFreeShippingBar(total);
  renderOrderBumps(catalog);

  if (lines.length === 0) {
    body.innerHTML = `
      <div class="cart-empty-state">
        <i class="ph ph-shopping-cart"></i>
        <p>Seu carrinho está vazio</p>
        <small>Explore nossa loja e adicione produtos incríveis!</small>
      </div>`;
    return;
  }

  body.innerHTML = lines
    .map(
      (line) => `
      <div class="drawer-item">
        <img src="${esc(line.image)}" alt="${esc(line.name)}">
        <div class="drawer-item-info">
          <div class="drawer-item-header">
            <div class="drawer-item-title">${esc(line.name)}${line.variant ? ` <small>(${esc(line.variant)})</small>` : ''}</div>
            <button class="drawer-item-remove" data-action="cart-remove" data-line="${esc(line.lineId)}" title="Remover"><i class="ph ph-trash"></i></button>
          </div>
          <div class="drawer-item-controls">
            <div class="drawer-item-qty">
              <button data-action="cart-qty" data-line="${esc(line.lineId)}" data-delta="-1"><i class="ph ph-minus"></i></button>
              <input type="number" value="${line.qty}" readonly>
              <button data-action="cart-qty" data-line="${esc(line.lineId)}" data-delta="1"><i class="ph ph-plus"></i></button>
            </div>
            <div class="drawer-item-price">${brl(line.price * line.qty)}</div>
          </div>
        </div>
      </div>`,
    )
    .join('');
}

async function calculateShipping(): Promise<void> {
  const input = byId<HTMLInputElement>('cartCepInput');
  const result = byId('cartShippingResult');
  const button = qs<HTMLButtonElement>('.cart-cep-btn');
  if (!input || !result) return;

  const cep = onlyDigits(input.value);
  if (cep.length !== 8) {
    result.innerHTML = '<span style="color:#ef4444; font-size: 13px;">Digite um CEP válido com 8 números.</span>';
    return;
  }
  if (button) button.disabled = true;
  result.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#0a3b2c;font-weight:500;padding:6px 0;"><i class="ph ph-spinner"></i> Buscando opções de frete...</div>';

  try {
    const total = cart.total();
    const options = await api.shippingQuote(cep, total);
    const threshold = getStoreSettings().freeShippingThreshold;
    const missing = threshold - total;
    const banner =
      missing > 0
        ? `<div style="background:#f8fafc;border:1px dashed #cbd5e1;padding:10px;border-radius:8px;text-align:center;"><span style="color:#475569;font-size:13px;">Faltam <strong>${brl(missing)}</strong> para você ganhar <strong style="color:#15803d;">FRETE GRÁTIS</strong></span></div>`
        : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:10px;border-radius:8px;text-align:center;"><span style="color:#15803d;font-weight:700;font-size:14px;"><i class="ph-fill ph-truck"></i> PARABÉNS! VOCÊ GANHOU FRETE GRÁTIS!</span></div>`;
    const rows = options
      .map(
        (o) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;">
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span style="font-size:14px;font-weight:600;color:#1e293b;">${esc(o.name)}</span>
            <span style="font-size:12px;color:#64748b;">Chega em ${o.deliveryDays} dias úteis</span>
          </div>
          <div style="font-size:15px;font-weight:700;color:#1e293b;">${o.price === 0 ? '<span style="color:#15803d;">Grátis</span>' : brl(o.price)}</div>
        </div>`,
      )
      .join('');
    result.innerHTML = `<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">${banner}${rows}</div>`;
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Erro ao buscar frete.';
    result.innerHTML = `<span style="color:#ef4444;font-size:13px;">${esc(message)}</span>`;
  } finally {
    if (button) button.disabled = false;
  }
}

/** Liga o carrinho lateral: renderização reativa ao estado e máscara do CEP. */
export function initDrawer(): void {
  cart.onChange(() => {
    renderBadges();
    renderDrawer();
  });
  renderBadges();
  renderDrawer();

  const cep = byId<HTMLInputElement>('cartCepInput');
  cep?.addEventListener('input', () => {
    cep.value = maskCep(cep.value);
  });
  cep?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void calculateShipping();
  });
}

export const drawerActions = {
  'cart-toggle': (): void => toggleDrawer(),
  'cart-close': (): void => closeDrawer(),
  'cart-shipping-toggle': (): void => {
    const wrapper = byId('cartShippingFormWrapper');
    if (!wrapper) return;
    const open = wrapper.style.display === 'none';
    wrapper.style.display = open ? 'block' : 'none';
    wrapper.classList.toggle('active', open);
  },
  'cart-shipping-calc': (): void => void calculateShipping(),
  'cart-remove': (el: HTMLElement): void => cart.remove(el.dataset.line ?? ''),
  'cart-qty': (el: HTMLElement): void => {
    const line = cart.lines().find((l) => l.lineId === el.dataset.line);
    if (line) cart.setQty(line.lineId, line.qty + Number(el.dataset.delta ?? 0));
  },
  'bump-add': (el: HTMLElement): void => {
    const product = catalog.find((p) => p.id === el.dataset.id);
    if (product) addBump(product);
  },
  'bump-remove': (el: HTMLElement): void => cart.removeBump(el.dataset.id ?? ''),
  'go-checkout': (): void => {
    if (cart.lines().length > 0) window.location.href = `/checkout.html${window.location.search}`;
    else void import('../lib/modal').then((m) => m.showMessage('Adicione produtos ao carrinho!'));
  },
};
