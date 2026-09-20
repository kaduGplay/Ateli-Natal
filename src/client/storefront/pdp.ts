import type { Product, ProductVariationGroup, ProductVariationOption } from '../../shared/types';
import { api, ApiError } from '../lib/api';
import { byId, esc, must, qs, qsa } from '../lib/dom';
import { brl, discountPercent, getStoreSettings, installments } from '../lib/format';
import { maskCep } from '../lib/masks';
import { onlyDigits } from '../../shared/validation';
import { openDrawer } from '../cart/drawer';
import { cart } from '../cart/store';
import { renderProductCard } from './product-card';
import { loadReviews } from './reviews';
import { findProduct, state } from './state';

const isVideo = (url: string): boolean => /\.(mp4|webm|ogg)$/i.test(url);
const setText = (selector: string, text: string): void => {
  const el = qs(selector, must('produto-view'));
  if (el) el.textContent = text;
};
const setHtml = (selector: string, html: string): void => {
  const el = qs(selector, must('produto-view'));
  if (el) el.innerHTML = html;
};

let current: Product | undefined;
/** Opção escolhida em cada grupo de variação (índice do grupo → opção). */
let selection: Record<number, ProductVariationOption> = {};

function showMedia(url: string): void {
  const img = must<HTMLImageElement>('pdpMainImg');
  const video = must<HTMLVideoElement>('pdpMainVid');
  if (isVideo(url)) {
    img.style.display = 'none';
    video.style.display = 'block';
    video.src = url;
  } else {
    video.pause();
    video.style.display = 'none';
    img.style.display = 'block';
    img.src = url;
  }
}

function renderGallery(product: Product): void {
  const media = product.images.length ? product.images : product.image ? [product.image] : [];
  const thumbs = must('pdpThumbnails');
  if (media.length === 0) {
    must<HTMLImageElement>('pdpMainImg').src = '';
    thumbs.style.display = 'none';
    return;
  }
  showMedia(media[0]!);
  if (media.length < 2) {
    thumbs.style.display = 'none';
    thumbs.innerHTML = '';
    return;
  }
  thumbs.style.display = 'flex';
  thumbs.innerHTML = media
    .map(
      (url, i) => `
      <div class="thumb${i === 0 ? ' active' : ''}" style="position:relative;" data-action="pdp-thumb" data-url="${esc(url)}">
        ${isVideo(url) ? `<video src="${esc(url)}" muted loop playsinline style="width:100%;height:100%;object-fit:cover;pointer-events:none;"></video>` : `<img src="${esc(url)}" alt="Miniatura ${i + 1}">`}
      </div>`,
    )
    .join('');
}

export function selectThumb(el: HTMLElement): void {
  showMedia(el.dataset.url ?? '');
  qsa('#pdpThumbnails .thumb').forEach((t) => t.classList.remove('active'));
  el.classList.add('active');
}

function renderSpecs(specs: string): void {
  const el = byId('pdpFichaTecnicaContent');
  if (!el) return;
  if (!specs) {
    el.innerHTML = '<p>Ficha técnica não disponível.</p>';
  } else if (specs.includes('|')) {
    const rows = specs
      .trim()
      .split('\n')
      .filter((line) => !line.includes('---'))
      .map((line, idx) => {
        const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
        if (cells.length < 2) return '';
        return idx === 0
          ? `<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;">${esc(cells[0])}</th><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;">${esc(cells[1])}</th></tr>`
          : `<tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#475569;"><strong>${esc(cells[0])}</strong></td><td style="padding:8px;border-bottom:1px solid #f1f5f9;">${esc(cells[1])}</td></tr>`;
      })
      .join('');
    el.innerHTML = `<table class="ficha-table" style="width:100%;border-collapse:collapse;margin-top:10px;">${rows}</table>`;
  } else {
    el.innerHTML = `<p>${esc(specs).replace(/\n/g, '<br>')}</p>`;
  }
}

function renderVariations(groups: ProductVariationGroup[]): void {
  const section = must('pdpVariationsSection');
  selection = {};
  if (groups.length === 0) {
    section.style.display = 'none';
    section.innerHTML = '';
    return;
  }
  section.style.display = 'flex';
  section.innerHTML = groups
    .map((group, g) => {
      const first = group.options[0];
      if (first) selection[g] = first;
      const pills = group.options
        .map((opt, o) => {
          const img = opt.image || current?.image || '';
          return `
          <button type="button" class="variation-pill variation-pill-g${g}${o === 0 ? ' active' : ''}" data-action="pdp-variation" data-group="${g}" data-option="${o}"
            style="padding:4px 14px 4px 4px;border-radius:30px;border:1px solid ${o === 0 ? '#d97706' : '#cbd5e1'};background:${o === 0 ? '#fef3c7' : '#fff'};color:${o === 0 ? '#b45309' : '#475569'};font-weight:${o === 0 ? 600 : 400};font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
            ${img ? `<img src="${esc(img)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid #e2e8f0;flex-shrink:0;" alt="">` : ''}
            <span style="padding-right:4px;">${esc(opt.name)}</span>
          </button>`;
        })
        .join('');
      return `<div><div style="font-size:14px;font-weight:500;margin-bottom:8px;color:#334155;">${esc(group.group_name)}: <span id="pdpGroupName_${g}" style="font-weight:400;color:#475569;">${esc(first?.name ?? '')}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap;">${pills}</div></div>`;
    })
    .join('');
  const firstImage = selection[0]?.image;
  if (firstImage) must<HTMLImageElement>('pdpMainImg').src = firstImage;
}

export function selectVariation(el: HTMLElement): void {
  const g = Number(el.dataset.group);
  const option = current?.variations[g]?.options[Number(el.dataset.option)];
  if (!option) return;
  selection[g] = option;
  byId(`pdpGroupName_${g}`)!.textContent = option.name;
  qsa<HTMLElement>(`.variation-pill-g${g}`).forEach((pill) => {
    const on = pill === el;
    pill.style.borderColor = on ? '#d97706' : '#cbd5e1';
    pill.style.color = on ? '#b45309' : '#475569';
    pill.style.backgroundColor = on ? '#fef3c7' : '#fff';
    pill.style.fontWeight = on ? '600' : '400';
  });
  if (option.image) must<HTMLImageElement>('pdpMainImg').src = option.image;
}

function selectedVariant(): { label: string; image: string } {
  const parts: string[] = [];
  let image = '';
  Object.keys(selection)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((g) => {
      const opt = selection[g];
      if (!opt) return;
      parts.push(`${current?.variations[g]?.group_name}: ${opt.name}`);
      if (!image && opt.image) image = opt.image;
    });
  return { label: parts.join(' | '), image };
}

export function addCurrentToCart(): void {
  if (!current) return;
  const variant = selectedVariant();
  const qty = Math.max(1, parseInt(must<HTMLInputElement>('pdpQty').value, 10) || 1);
  cart.add({
    productId: current.id,
    name: current.name,
    image: variant.image || current.image,
    price: current.price,
    variant: variant.label,
    qty,
  });
  openDrawer();
}

export function changeQty(delta: number): void {
  const input = must<HTMLInputElement>('pdpQty');
  input.value = String(Math.max(1, (parseInt(input.value, 10) || 1) + delta));
}

function renderCrossSell(product: Product): void {
  const section = byId('pdpCrossSellSection');
  const grid = byId('pdpCrossSellGrid');
  if (!section || !grid) return;
  const chosen = product.crossSell.length
    ? state.products.filter((p) => product.crossSell.includes(p.id))
    : state.products
        .filter((p) => p.id !== product.id && p.isBestSeller)
        .sort((a, b) => a.bestSellerOrder - b.bestSellerOrder)
        .slice(0, 4);
  section.style.display = chosen.length ? 'block' : 'none';
  grid.innerHTML = chosen.map((p, i) => renderProductCard(p, { index: i })).join('');
}

function renderPricing(product: Product): void {
  const pct = discountPercent(product.price, product.oldPrice);
  const old = qs('#produto-view .old-price');
  if (old) {
    old.style.display = pct ? 'block' : 'none';
    old.textContent = pct && product.oldPrice ? brl(product.oldPrice) : '';
  }
  setText('.current-price', brl(product.price));
  const inst = installments(product.price);
  setHtml('.installments', inst.count > 1 ? `em até <strong>${inst.count}x de ${brl(inst.value)} sem juros</strong> no cartão` : 'à vista');
  const pixPct = getStoreSettings().pixDiscountPercent;
  setHtml('.pix-price', `ou <strong>${brl(product.price * (1 - pixPct / 100))}</strong> via Pix (${pixPct}% OFF)`);
}

function renderProduct(product: Product): void {
  current = product;
  setText('.pdp-title', product.name);
  setText('.pdp-sku', `SKU: ${product.id}`);
  const crumb = byId('pdpBreadcrumbName');
  if (crumb) crumb.textContent = product.name;

  renderGallery(product);
  renderPricing(product);

  const sales = must('pdpSalesCount');
  sales.style.display = product.salesCount > 0 ? 'block' : 'none';
  sales.textContent = `${product.salesCount} VENDIDOS`;

  const features = must('pdpFeaturesList');
  features.innerHTML = product.features
    .map(
      (f) => `<li style="display:flex;gap:8px;font-size:13px;color:#334155;align-items:center;"><i class="ph-fill ph-check-circle" style="color:#16a34a;font-size:18px;"></i><span>${esc(f)}</span></li>`,
    )
    .join('');
  features.style.display = product.features.length ? 'flex' : 'none';

  must('pdpBrindeCard').style.display = product.hasGift ? 'flex' : 'none';
  renderVariations(product.variations);

  const urgency = must('pdpUrgencyCopy');
  urgency.style.display = product.urgencyCopy ? 'flex' : 'none';
  urgency.innerHTML = product.urgencyCopy ? `<i class="ph ph-clock"></i> ${esc(product.urgencyCopy)}` : '';

  const shippingBanner = must('pdpFreeShippingBanner');
  const threshold = getStoreSettings().freeShippingThreshold;
  if (product.freeShippingEligible) {
    shippingBanner.innerHTML = '<i class="ph ph-truck"></i> Parabéns! Este item tem frete grátis.';
    shippingBanner.style.display = 'flex';
  } else if (product.price < threshold) {
    shippingBanner.innerHTML = '<i class="ph ph-truck"></i> Monte o kit e leve frete grátis!';
    shippingBanner.style.display = 'flex';
  } else {
    shippingBanner.style.display = 'none';
  }

  renderSpecs(product.specs);
  must('pdpDescriptionContent').innerHTML = product.description || '<p>Sem descrição disponível.</p>';
  must<HTMLInputElement>('pdpQty').value = '1';
  renderCrossSell(product);
  initStickyCta(product);
  void loadReviews(product.id);
}

/** Abre a página do produto. Chamada pelo roteador depois de o catálogo estar carregado. */
export function showProduct(id: string): void {
  const product = findProduct(id);
  if (!product) {
    setText('.pdp-title', 'Produto não encontrado');
    setText('.pdp-sku', 'SKU: inválido');
    return;
  }
  renderProduct(product);
}

export function resetProductView(): void {
  setText('.pdp-title', 'Carregando...');
  setText('.pdp-sku', 'SKU: ...');
  const shipping = byId('pdpShippingResult');
  if (shipping) shipping.innerHTML = '';
}

// ── Frete na página do produto ───────────────────────────────────────
export async function calculatePdpShipping(): Promise<void> {
  const cep = onlyDigits(must<HTMLInputElement>('pdpCep').value);
  const result = must('pdpShippingResult');
  const button = must<HTMLButtonElement>('btnCalcPdp');
  const error = (icon: string, msg: string): string => `<div class="pdp-shipping-error"><i class="ph ph-${icon}"></i> ${esc(msg)}</div>`;

  if (cep.length !== 8) {
    result.innerHTML = error('warning-circle', 'Digite um CEP válido com 8 números.');
    return;
  }
  button.innerHTML = '<i class="ph ph-circle-notch"></i> Calculando...';
  button.disabled = true;
  result.innerHTML = '';
  try {
    const options = await api.shippingQuote(cep, current?.price ?? 0);
    if (options.length === 0) {
      result.innerHTML = error('map-pin-line', 'Não encontramos frete disponível para este CEP.');
      return;
    }
    const cheapest = options.reduce((a, b) => (b.price < a.price ? b : a));
    result.innerHTML = `<div class="pdp-shipping-results">${options
      .map(
        (o) => `
        <div class="pdp-shipping-option${o === cheapest ? ' best' : ''}">
          <div class="pdp-shipping-option-left">
            <i class="ph ph-${o.price === 0 ? 'gift' : 'package'}"></i>
            <div><div class="pdp-shipping-name">${esc(o.name)}</div><div class="pdp-shipping-days"><i class="ph ph-clock"></i> ${o.deliveryDays} dias úteis</div></div>
          </div>
          <div class="pdp-shipping-price ${o.price === 0 ? 'free' : ''}">${o.price === 0 ? 'GRÁTIS' : brl(o.price)}</div>
          ${o === cheapest ? '<div class="pdp-shipping-badge">Mais barato</div>' : ''}
        </div>`,
      )
      .join('')}</div>`;
  } catch (err) {
    result.innerHTML = error('wifi-slash', err instanceof ApiError ? err.message : 'Erro ao calcular. Tente novamente.');
  } finally {
    button.innerHTML = '<i class="ph ph-magnifying-glass"></i> Calcular';
    button.disabled = false;
  }
}

export function initPdpInputs(): void {
  const cep = must<HTMLInputElement>('pdpCep');
  cep.addEventListener('input', () => (cep.value = maskCep(cep.value)));
  cep.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void calculatePdpShipping();
  });
  must('pdpBtnAddCart').addEventListener('click', (e) => {
    e.preventDefault();
    addCurrentToCart();
  });
}

// ── CTA fixo no mobile ───────────────────────────────────────────────
let stickyScroll: (() => void) | undefined;

function initStickyCta(product: Product): void {
  let el = byId('pdpStickyCta');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pdpStickyCta';
    el.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;background:rgba(255,255,255,.95);backdrop-filter:blur(10px);border-top:1px solid #e2e8f0;padding:12px 16px;z-index:999;display:flex;align-items:center;gap:16px;box-shadow:0 -10px 25px rgba(0,0,0,.05);transform:translateY(100%);transition:transform .4s cubic-bezier(.16,1,.3,1);font-family:Inter,sans-serif;';
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div style="flex:1;min-width:0;">
      <div style="font-size:11px;color:#64748b;font-weight:500;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Preço</div>
      <div style="font-size:18px;font-weight:800;color:#1e293b;line-height:1;">${brl(product.price)}</div>
    </div>
    <button type="button" data-action="sticky-buy" style="flex-shrink:0;background:#0a3b2c;color:#fff;border:none;border-radius:10px;padding:12px 20px;font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:8px;">
      <i class="ph-fill ph-shopping-bag" style="font-size:18px;"></i> Comprar Agora
    </button>`;
  const target = el;
  if (stickyScroll) window.removeEventListener('scroll', stickyScroll);
  stickyScroll = () => {
    target.style.transform = window.innerWidth < 768 && window.scrollY > 200 ? 'translateY(0)' : 'translateY(100%)';
  };
  window.addEventListener('scroll', stickyScroll, { passive: true });
}

export function hideStickyCta(): void {
  const el = byId('pdpStickyCta');
  if (el) el.style.transform = 'translateY(100%)';
  if (stickyScroll) window.removeEventListener('scroll', stickyScroll);
  stickyScroll = undefined;
}
