import { byId, qs } from '../lib/dom';
import { brl } from '../lib/format';
import { cart } from '../cart/store';
import { esc } from '../lib/dom';

// ── Presente de boas-vindas (cupom) ──────────────────────────────────
export function initWelcomeGift(): void {
  const visits = Number(localStorage.getItem('siteAccessCount') ?? '0');
  if (!sessionStorage.getItem('accessCounted')) {
    localStorage.setItem('siteAccessCount', String(visits + 1));
    sessionStorage.setItem('accessCounted', '1');
  }
  if (visits + 1 > 2 || sessionStorage.getItem('welcomeGiftShown')) return;
  setTimeout(() => {
    const modal = byId('welcomeGiftModal');
    if (modal) modal.style.display = 'flex';
  }, 1500);
}

export function closeWelcomeGift(): void {
  const modal = byId('welcomeGiftModal');
  if (!modal) return;
  modal.style.display = 'none';
  sessionStorage.setItem('welcomeGiftShown', '1');
}

function confetti(): void {
  const box = qs('.welcome-gift-content');
  if (!box) return;
  const piece = document.createElement('div');
  const emojis = ['🎉', '✨', '🎈', '🎊'];
  piece.textContent = emojis[Math.floor(Math.random() * emojis.length)] ?? '🎉';
  piece.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:100%;font-size:${Math.random() * 15 + 10}px;z-index:100;pointer-events:none;transition:all 1.5s cubic-bezier(.1,.8,.3,1);`;
  box.appendChild(piece);
  setTimeout(() => {
    piece.style.top = `${Math.random() * 40 + 10}%`;
    piece.style.transform = `rotate(${Math.random() * 360}deg) scale(1.5)`;
    piece.style.opacity = '0';
  }, 10);
  setTimeout(() => piece.remove(), 1500);
}

export function openMysteryBox(): void {
  byId('welcomeGiftStep1')?.classList.remove('active');
  byId('welcomeGiftStep2')?.classList.add('active');
  for (let i = 0; i < 20; i++) confetti();
}

export async function copyText(button: HTMLElement, text: string): Promise<void> {
  const original = button.innerHTML;
  try {
    await navigator.clipboard.writeText(text);
    button.innerHTML = '✓ Copiado!';
  } catch {
    button.innerHTML = 'Copie manualmente';
  }
  setTimeout(() => (button.innerHTML = original), 2000);
}

// ── Exit intent ──────────────────────────────────────────────────────
export function initExitIntent(): void {
  const modal = byId('exitIntentModal');
  if (!modal || sessionStorage.getItem('exitIntentShown')) return;
  let done = false;
  const trigger = (): void => {
    if (done) return;
    done = true;
    sessionStorage.setItem('exitIntentShown', '1');
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('ei-visible'));
  };
  document.addEventListener('mouseleave', (e) => {
    if (e.clientY < 20) trigger();
  });
  let idle: number | undefined;
  const reset = (): void => {
    window.clearTimeout(idle);
    idle = window.setTimeout(trigger, 45_000);
  };
  (['touchstart', 'touchmove', 'scroll'] as const).forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
  reset();
}

export function closeExitIntent(): void {
  const modal = byId('exitIntentModal');
  if (!modal) return;
  modal.classList.remove('ei-visible');
  setTimeout(() => (modal.style.display = 'none'), 300);
}

// ── Lembrete de carrinho ─────────────────────────────────────────────
export function initCartRecoveryToast(onOpenCart: () => void): void {
  if (sessionStorage.getItem('cartRecoveryShown')) return;
  setTimeout(() => {
    const lines = cart.lines();
    if (lines.length === 0) return;
    sessionStorage.setItem('cartRecoveryShown', '1');

    const toast = document.createElement('div');
    toast.style.cssText =
      'position:fixed;bottom:80px;right:16px;z-index:99991;background:#fff;border-radius:16px;box-shadow:0 10px 40px -10px rgba(0,0,0,.2);padding:20px;width:calc(100% - 32px);max-width:340px;border:1px solid #e2e8f0;font-family:Inter,sans-serif;transform:translateX(150%);transition:transform .5s cubic-bezier(.34,1.56,.64,1);';
    toast.innerHTML = `
      <button type="button" data-close aria-label="Fechar" style="position:absolute;top:12px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">&times;</button>
      <div style="font-weight:700;font-size:15px;color:#1e293b;margin-bottom:4px;">Seu carrinho te espera!</div>
      <div style="font-size:13px;color:#64748b;margin-bottom:14px;line-height:1.4;">Você tem ${cart.count()} ${cart.count() === 1 ? 'item' : 'itens'} no valor de <strong style="color:#1e293b;">${esc(brl(cart.total()))}</strong> aguardando.</div>
      <button type="button" data-open style="width:100%;padding:12px;background:#0a3b2c;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">Finalizar Compra</button>`;
    toast.addEventListener('click', (e) => {
      const t = e.target as Element;
      if (t.closest('[data-open]')) onOpenCart();
      if (t.closest('[data-open],[data-close]')) toast.remove();
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => (toast.style.transform = 'translateX(0)')));
    setTimeout(() => {
      toast.style.transform = 'translateX(130%)';
      setTimeout(() => toast.remove(), 400);
    }, 8000);
  }, 3000);
}
