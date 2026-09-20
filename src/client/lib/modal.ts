import { esc } from './dom';

/** Substitui o `alert()` nativo por um aviso no estilo da loja. */
export function showMessage(message: string, title = 'Atenção'): void {
  document.getElementById('appMessageModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'appMessageModal';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  overlay.innerHTML = `
    <div style="background:#fff;width:90%;max-width:400px;border-radius:24px;padding:28px 24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.25);">
      <div style="width:64px;height:64px;background:#fef3c7;color:#d97706;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px;margin:0 auto 16px;">
        <i class="ph-fill ph-warning-circle"></i>
      </div>
      <h3 style="font-size:19px;color:#1f2937;margin:0 0 10px;font-weight:800;">${esc(title)}</h3>
      <p style="font-size:14px;color:#4b5563;margin:0 0 24px;line-height:1.5;">${esc(message)}</p>
      <button type="button" data-close style="width:100%;padding:14px;background:linear-gradient(135deg,#0a3b2c,#166534);color:#fff;border:none;border-radius:12px;font-weight:800;font-size:15px;cursor:pointer;">Entendi</button>
    </div>`;
  const close = (): void => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target as Element).closest('[data-close]')) close();
  });
  document.body.appendChild(overlay);
  overlay.querySelector<HTMLButtonElement>('[data-close]')?.focus();
}
