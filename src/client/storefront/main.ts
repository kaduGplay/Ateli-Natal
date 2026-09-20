import { api } from '../lib/api';
import { initActions, registerActions } from '../lib/actions';
import { byId, installImageFallback, qsa } from '../lib/dom';
import { showMessage } from '../lib/modal';
import { pixel } from '../lib/pixel';
import { getStoreSettings } from '../lib/format';
import { drawerActions, initDrawer, openDrawer, setDrawerCatalog } from '../cart/drawer';
import { cart } from '../cart/store';
import { toggleFavorite } from './favorites';
import {
  filterByCategory,
  goToSlideAction,
  loadBanners,
  loadCategories,
  loadSettings,
  moveCarousel,
  renderBestSellers,
  renderBumpsShowcase,
  renderProductGrid,
} from './home';
import { addCurrentToCart, calculatePdpShipping, changeQty, initPdpInputs, selectThumb, selectVariation } from './pdp';
import { closeExitIntent, closeWelcomeGift, copyText, initCartRecoveryToast, initExitIntent, initWelcomeGift, openMysteryBox } from './popups';
import { initMarketingToasts } from './marketing-toasts';
import { initRouter } from './router';
import { state, findProduct } from './state';
import { initTracking } from './tracking-view';

registerActions({
  ...drawerActions,
  'menu-open': () => byId('mobileMenu')?.classList.add('active'),
  'menu-close': (el) => {
    byId('mobileMenu')?.classList.remove('active');
    if (el instanceof HTMLAnchorElement && el.hash) window.location.hash = el.hash;
  },
  'gift-open': openMysteryBox,
  'gift-close': closeWelcomeGift,
  'gift-copy': (el) => void copyText(el, byId('welcomeCouponCode')?.textContent?.trim() ?? ''),
  'exit-close': closeExitIntent,
  'exit-cart': () => {
    closeExitIntent();
    openDrawer();
  },
  'copy-text': (el) => void copyText(el, el.dataset.copy ?? ''),
  back: () => window.history.back(),
  'carousel-next': () => moveCarousel(1),
  'carousel-prev': () => moveCarousel(-1),
  'carousel-go': goToSlideAction,
  'filter-category': (el) => filterByCategory(el.dataset.cat ?? 'all'),
  soon: (el) => showMessage(el.dataset.msg ?? 'Em breve.', 'Em breve'),
  'qty-dec': () => changeQty(-1),
  'qty-inc': () => changeQty(1),
  'pdp-shipping-calc': () => void calculatePdpShipping(),
  'pdp-thumb': selectThumb,
  'pdp-variation': selectVariation,
  'fav-toggle': (el) => toggleFavorite(el.dataset.id ?? ''),
  'quick-add': (el) => {
    const product = findProduct(el.dataset.id ?? '');
    if (!product) return;
    cart.add({ productId: product.id, name: product.name, image: product.image, price: product.price });
    openDrawer();
  },
  'sticky-buy': (el) => {
    addCurrentToCart();
    el.innerHTML = '<i class="ph-bold ph-check"></i> Adicionado!';
    setTimeout(() => (el.innerHTML = '<i class="ph-fill ph-shopping-bag"></i> Comprar Agora'), 1500);
  },
});

/** Efeito de brilho que acompanha o ponteiro nos cards (throttle por frame). */
function initGlow(): void {
  let frame = 0;
  document.addEventListener('pointermove', (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      qsa('[data-glow]').forEach((el) => {
        el.style.setProperty('--x', e.clientX.toFixed(2));
        el.style.setProperty('--xp', (e.clientX / window.innerWidth).toFixed(2));
        el.style.setProperty('--y', e.clientY.toFixed(2));
        el.style.setProperty('--yp', (e.clientY / window.innerHeight).toFixed(2));
      });
    });
  });
}

function hideSplash(): void {
  const splash = byId('globalSplash');
  if (!splash) return;
  splash.style.opacity = '0';
  setTimeout(() => (splash.style.display = 'none'), 400);
}

function initStickyHeader(): void {
  const header = byId('mainHeader');
  window.addEventListener('scroll', () => header?.classList.toggle('scrolled', window.scrollY > 40), { passive: true });
}

function initAuthForms(): void {
  const soon = (e: Event): void => {
    e.preventDefault();
    showMessage('A área do cliente estará disponível em breve. Para acompanhar um pedido, use "Rastrear Pedido".', 'Em breve');
  };
  byId('loginForm')?.addEventListener('submit', soon);
  byId('registerForm')?.addEventListener('submit', soon);
}

async function boot(): Promise<void> {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  installImageFallback();
  initActions();
  initDrawer();
  initStickyHeader();
  initGlow();
  initAuthForms();
  initPdpInputs();
  initTracking();
  initWelcomeGift();
  initExitIntent();
  initCartRecoveryToast(openDrawer);

  const minSplash = new Promise<void>((resolve) => setTimeout(resolve, 500));
  const failSafe = setTimeout(hideSplash, 6000);

  try {
    // Configurações primeiro: o formato de parcelas/frete grátis depende delas.
    await loadSettings().catch(() => undefined);
    pixel.init(getStoreSettings().metaPixelId);
    const [products, summaries] = await Promise.all([api.products(), api.reviewSummaries().catch(() => ({}))]);
    state.products = products;
    initMarketingToasts(products);
    state.summaries = summaries;
    setDrawerCatalog(products);
    await Promise.all([loadCategories().catch(() => undefined), loadBanners().catch(() => undefined)]);
    renderBestSellers();
    renderProductGrid('all');
    renderBumpsShowcase();
  } catch {
    showMessage('Não foi possível carregar a loja agora. Tente novamente em instantes.');
  }

  initRouter();
  await minSplash;
  clearTimeout(failSafe);
  hideSplash();
}

void boot();
