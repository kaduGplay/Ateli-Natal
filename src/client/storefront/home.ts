import { api } from '../lib/api';
import { byId, qs, qsa } from '../lib/dom';
import { getStoreSettings, setStoreSettings, whatsappLink } from '../lib/format';
import { esc } from '../lib/dom';
import { bumpProducts } from '../cart/bumps';
import { renderProductCard } from './product-card';
import { state } from './state';

// ── Banners ──────────────────────────────────────────────────────────
let slideIndex = 0;
let timer: number | undefined;

function goToSlide(index: number): void {
  const track = byId('bannerTrack');
  const dots = qsa('.dot');
  if (!track) return;
  slideIndex = index;
  track.scrollTo({ left: track.clientWidth * index, behavior: 'smooth' });
  dots.forEach((d, i) => d.classList.toggle('active', i === index));
  startCarousel(dots.length);
}

export function moveCarousel(direction: number): void {
  const total = qsa('.dot').length;
  if (total === 0) return;
  goToSlide((slideIndex + direction + total) % total);
}

function startCarousel(total: number): void {
  window.clearInterval(timer);
  if (total > 1) timer = window.setInterval(() => moveCarousel(1), 5000);
}

export async function loadBanners(): Promise<void> {
  const banners = await api.banners();
  const track = byId('bannerTrack');
  const dots = byId('bannerDots');
  if (!track || !dots || banners.length === 0) return;

  track.innerHTML = banners
    .map((b) => {
      const img = `<img src="${esc(b.imageUrl)}" alt="${esc(b.name || 'Banner')}">`;
      return `<div class="banner-slide">${b.linkUrl ? `<a href="${esc(b.linkUrl)}">${img}</a>` : img}</div>`;
    })
    .join('');
  dots.innerHTML = banners.map((_, i) => `<div class="dot${i === 0 ? ' active' : ''}" data-action="carousel-go" data-index="${i}"></div>`).join('');

  const multiple = banners.length > 1;
  qsa<HTMLElement>('.carousel-btn').forEach((b) => (b.style.display = multiple ? 'flex' : 'none'));
  dots.style.display = multiple ? '' : 'none';
  if (!multiple) return;

  startCarousel(banners.length);
  track.addEventListener(
    'scroll',
    () => {
      if (track.clientWidth === 0) return;
      const index = Math.round(track.scrollLeft / track.clientWidth);
      if (index !== slideIndex && index >= 0 && index < banners.length) {
        slideIndex = index;
        qsa('.dot').forEach((d, i) => d.classList.toggle('active', i === index));
        startCarousel(banners.length);
      }
    },
    { passive: true },
  );
}

export const goToSlideAction = (el: HTMLElement): void => goToSlide(Number(el.dataset.index ?? 0));

// ── Configurações globais ────────────────────────────────────────────
export async function loadSettings(): Promise<void> {
  const settings = await api.settings();
  setStoreSettings(settings);

  const topbar = qs('.top-bar-content p');
  if (topbar && settings.topbarMessage) topbar.innerHTML = settings.topbarMessage;
  const setLink = (label: string, href: string): void => {
    const a = qs<HTMLAnchorElement>(`.footer-socials a[aria-label="${label}"]`);
    if (a && href) {
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
    }
  };
  setLink('Instagram', settings.instagram);
  setLink('Facebook', settings.facebook);

  if (settings.whatsapp) {
    const base = whatsappLink('').split('?')[0] ?? '';
    setLink('WhatsApp', base);
  }
}

// ── Categorias e vitrines ────────────────────────────────────────────
export async function loadCategories(): Promise<void> {
  state.categories = await api.categories();
  const list = byId('categoryStoriesList');
  if (!list) return;
  const allImage = getStoreSettings().allCategoryImage || '/uploads/logo.jpg';
  const story = (cat: string, name: string, img: string, active = false): string => `
    <div class="story-item${active ? ' active' : ''}" data-cat="${esc(cat)}" data-action="filter-category">
      <div class="story-avatar"><div class="story-ring"><img src="${esc(img)}" alt="${esc(name)}"></div></div>
      <span class="story-name">${esc(name)}</span>
    </div>`;
  list.innerHTML = story('all', 'Todos', allImage, true) + state.categories.map((c) => story(c.slug, c.name, c.avatar)).join('');
}

export function filterByCategory(slug: string): void {
  qsa('#categoryStoriesList .story-item').forEach((item) => item.classList.toggle('active', item.dataset.cat === slug));
  renderProductGrid(slug);
}

export function renderProductGrid(category = 'all'): void {
  const grid = byId('mainProductGrid');
  if (!grid) return;
  const products = state.products.filter((p) => category === 'all' || p.category.toLowerCase() === category.toLowerCase());
  grid.innerHTML = products.length
    ? products.map((p, i) => renderProductCard(p, { index: i, showLowStock: true })).join('')
    : '<div style="grid-column:1/-1;text-align:center;padding:48px;color:#64748b;"><i class="ph ph-package" style="font-size:48px;display:block;margin-bottom:12px;"></i>Nenhum produto nesta categoria.</div>';
}

export function renderBestSellers(): void {
  const section = byId('bestSellersSection');
  const grid = byId('bestSellersGrid');
  if (!section || !grid) return;
  const best = state.products.filter((p) => p.isBestSeller).sort((a, b) => a.bestSellerOrder - b.bestSellerOrder);
  section.style.display = best.length ? '' : 'none';
  grid.innerHTML = best.map((p, i) => renderProductCard(p, { index: i, bestSeller: true })).join('');
}

/** "Complete o Natal": kits/complementos (ofertas especiais), com fallback para os itens mais baratos. */
export function renderBumpsShowcase(): void {
  const section = byId('bumpsSection');
  const grid = byId('bumpsProductGrid');
  if (!grid) return;
  let items = bumpProducts(state.products);
  if (items.length === 0) items = state.products.filter((p) => p.price < 60);
  items = items.slice(0, 4);
  if (section) section.style.display = items.length ? '' : 'none';
  grid.innerHTML = items.map((p, i) => renderProductCard(p, { index: i })).join('');
}
