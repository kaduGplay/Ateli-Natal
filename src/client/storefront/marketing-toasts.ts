import type { Product } from '../../shared/types';
import { esc } from '../lib/dom';

// Mensagens de marketing estáticas, como na vitrine de referência.
const buyers = [
  { name: 'Elaine', city: 'São Paulo' },
  { name: 'Luciana M.', city: 'Rio de Janeiro' },
  { name: 'Fernanda S.', city: 'Belo Horizonte' },
  { name: 'Mariana T.', city: 'Curitiba' },
  { name: 'Juliana P.', city: 'Porto Alegre' },
  { name: 'Marcos A.', city: 'Salvador' },
  { name: 'Camila R.', city: 'Florianópolis' },
  { name: 'Vanessa F.', city: 'Fortaleza' },
];

export function initMarketingToasts(products: Product[]): void {
  const available = products.filter((p) => p.active && p.stock > 0);
  if (!available.length || document.getElementById('marketingToast')) return;

  const style = document.createElement('style');
  style.textContent = `
    #marketingToast { position:fixed; bottom:24px; left:20px; z-index:900;
      width:min(350px,calc(100vw - 32px)); box-sizing:border-box; padding:12px 32px 12px 12px;
      display:flex; align-items:center; gap:12px; background:#fff; border:1px solid #e2e8f0;
      border-radius:16px; box-shadow:0 8px 30px #0002; font-family:Inter,sans-serif;
      opacity:0; visibility:hidden; transform:translateX(-115%); transition:transform .35s,opacity .35s,visibility .35s; }
    #marketingToast.show { opacity:1; visibility:visible; transform:translateX(0); }
    #marketingToast img { width:48px; height:48px; object-fit:cover; border-radius:10px; flex-shrink:0; }
    #marketingToast .marketing-copy { min-width:0; }
    #marketingToast strong { font-size:13px; color:#1e293b; }
    #marketingToast .marketing-city { font-size:11px; color:#64748b; margin:2px 0; }
    #marketingToast .marketing-product { font-size:12px; color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #marketingToast button { position:absolute; right:4px; top:4px; width:28px; height:28px; border:0; background:transparent; color:#64748b; cursor:pointer; font-size:20px; }
    @media(max-width:768px) { #marketingToast { bottom:calc(150px + env(safe-area-inset-bottom)); left:16px; } }
    @media(prefers-reduced-motion:reduce) { #marketingToast { transition:none; } }
  `;
  document.head.appendChild(style);
  const toast = document.createElement('aside');
  toast.id = 'marketingToast';
  toast.setAttribute('aria-label', 'Aviso de compradores');
  document.body.appendChild(toast);

  let index = 0;
  let hideTimer: number | undefined;
  const hide = (): void => {
    window.clearTimeout(hideTimer);
    toast.classList.remove('show');
  };
  toast.addEventListener('click', (event) => {
    if ((event.target as Element).closest('button')) hide();
  });
  document.addEventListener('visibilitychange', hide);
  window.addEventListener('hashchange', hide);

  const showNext = (): void => {
    if (document.hidden || !['', '#home', '#produto'].includes(location.hash.split('?')[0] ?? '')) return;
    if (document.querySelector('.cart-drawer.open, .cart-drawer.active')) return;
    for (const id of ['welcomeGiftModal', 'exitIntentModal']) {
      const modal = document.getElementById(id);
      if (modal && getComputedStyle(modal).display !== 'none') return;
    }
    const buyer = buyers[index % buyers.length]!;
    const product = available[index % available.length]!;
    index++;
    toast.innerHTML = `<img src="${esc(product.image)}" alt="">
      <div class="marketing-copy"><strong>${esc(buyer.name)} está comprando</strong>
      <div class="marketing-city">${esc(buyer.city)}</div>
      <div class="marketing-product">${esc(product.name)}</div></div>
      <button type="button" aria-label="Fechar aviso">&times;</button>`;
    toast.classList.add('show');
    hideTimer = window.setTimeout(hide, 5000);
  };
  window.setTimeout(() => {
    showNext();
    window.setInterval(showNext, 25000);
  }, 8000);
}
