import { byId, qs, qsa } from '../lib/dom';
import { openDrawer } from '../cart/drawer';
import { renderFavorites } from './favorites';
import { hideStickyCta, resetProductView, showProduct } from './pdp';

/** Rotas por hash (#home, #produto?id=..., #rastreio, #favoritos, #login). */
const VIEWS: Record<string, string> = {
  '#home': 'home-view',
  '#produto': 'produto-view',
  '#login': 'login-view',
  '#rastreio': 'rastreio-view',
  '#favoritos': 'favoritos-view',
};

function navigate(): void {
  const hash = window.location.hash || '#home';
  const [path = '#home', query = ''] = hash.split('?');

  if (path === '#carrinho') {
    openDrawer();
    window.location.hash = '#home';
    return;
  }
  const route = path in VIEWS ? path : '#home';

  if (route === '#produto') {
    const id = new URLSearchParams(query).get('id');
    if (!id) {
      window.location.hash = '#home';
      return;
    }
    resetProductView();
    showProduct(id);
  } else {
    hideStickyCta();
  }
  if (route === '#favoritos') renderFavorites();

  for (const [key, viewId] of Object.entries(VIEWS)) {
    const view = byId(viewId);
    if (!view) continue;
    view.style.display = key === route ? 'block' : 'none';
    view.classList.toggle('active-view', key === route);
  }

  const headerTop = qs('.header-top');
  if (headerTop) headerTop.style.display = route === '#produto' ? 'none' : '';

  qsa('.bottom-nav .nav-item').forEach((item) => {
    const href = item.getAttribute('href');
    item.classList.toggle('active', href === route || (route === '#home' && (href === '/' || href === '#' || href === '#home')));
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function initRouter(): void {
  window.addEventListener('hashchange', navigate);
  navigate();
}
