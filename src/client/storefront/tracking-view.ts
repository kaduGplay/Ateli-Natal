import type { TrackingPackage } from '../../shared/types';
import { api, ApiError } from '../lib/api';
import { byId, esc } from '../lib/dom';

const STATUS_STYLE: Record<string, { color: string; icon: string }> = {
  aguardando_pagamento: { color: '#f59e0b', icon: 'ph-fill ph-clock' },
  preparacao: { color: '#f59e0b', icon: 'ph-fill ph-package' },
  postado: { color: '#3b82f6', icon: 'ph-fill ph-factory' },
  em_transito: { color: '#8b5cf6', icon: 'ph-fill ph-truck' },
  saiu_entrega: { color: '#0ea5e9', icon: 'ph-fill ph-motorcycle' },
  entregue: { color: '#16a34a', icon: 'ph-fill ph-check-circle' },
  cancelado: { color: '#dc2626', icon: 'ph-fill ph-x-circle' },
};

const EVENT_COLORS = {
  success: { fg: '#16a34a', bg: '#dcfce7', icon: 'ph-check' },
  error: { fg: '#dc2626', bg: '#fee2e2', icon: 'ph-x' },
  warning: { fg: '#f59e0b', bg: '#fef9c3', icon: 'ph-warning' },
  info: { fg: '#8b5cf6', bg: '#f3f4f6', icon: 'ph-clock' },
} as const;

const card = (inner: string): string =>
  `<div style="text-align:center;padding:40px 20px;background:#fff;border-radius:20px;border:1px solid #e2e8f0;box-shadow:0 4px 20px rgba(0,0,0,.06);">${inner}</div>`;

function renderPackage(pkg: TrackingPackage): string {
  const style = STATUS_STYLE[pkg.status] ?? { color: '#64748b', icon: 'ph-fill ph-package' };
  const events = pkg.events
    .map((ev, i) => {
      const c = EVENT_COLORS[ev.statusType];
      return `
      <div style="display:flex;gap:12px;margin-bottom:${i < pkg.events.length - 1 ? 16 : 0}px;position:relative;">
        ${i < pkg.events.length - 1 ? '<div style="position:absolute;left:15px;top:24px;bottom:-16px;width:2px;background:#e2e8f0;"></div>' : ''}
        <div style="width:32px;height:32px;border-radius:50%;background:${c.bg};color:${c.fg};display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:1;"><i class="ph ${c.icon}"></i></div>
        <div style="flex:1;padding-top:4px;">
          <div style="font-weight:700;color:#0f172a;font-size:14px;">${esc(ev.title)}</div>
          <div style="font-size:13px;color:#475569;margin:2px 0 4px;line-height:1.4;">${esc(ev.description)}</div>
          <div style="font-size:11px;color:#94a3b8;font-weight:600;"><i class="ph ph-map-pin"></i> ${esc(ev.location)} &nbsp;&bull;&nbsp; <i class="ph ph-clock"></i> ${esc(ev.timestamp)}</div>
        </div>
      </div>`;
    })
    .join('');

  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;margin-bottom:20px;box-shadow:0 4px 20px rgba(0,0,0,.06);">
      <div style="background:linear-gradient(135deg,#0a3b2c,#155c2f);padding:24px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#86efac;font-weight:700;margin-bottom:6px;">Código / Pedido</div>
          <div style="font-size:22px;font-weight:900;letter-spacing:1px;">${esc(pkg.code)}</div>
        </div>
        <div style="background:rgba(255,255,255,.1);padding:6px 14px;border-radius:8px;font-weight:600;font-size:12px;text-transform:uppercase;display:flex;align-items:center;gap:8px;">
          <i class="${style.icon}" style="color:${style.color};"></i> ${esc(pkg.statusText)}
        </div>
      </div>
      <div style="padding:20px 24px;">
        <div style="background:#f1f5f9;border-radius:10px;height:8px;overflow:hidden;margin-bottom:20px;">
          <div style="height:100%;width:${Math.min(100, pkg.progressPercent)}%;background:linear-gradient(90deg,#34d399,#059669);border-radius:10px;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px;">
          <div style="background:#f8fafc;border-radius:12px;padding:14px;border:1px solid #f1f5f9;">
            <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:4px;">Destinatário</div>
            <div style="font-weight:700;color:#0f172a;font-size:14px;">${esc(pkg.recipient.name)}</div>
            <div style="font-size:12px;color:#64748b;">${esc(pkg.recipient.city)} / ${esc(pkg.recipient.state)}</div>
          </div>
          <div style="background:#f8fafc;border-radius:12px;padding:14px;border:1px solid #f1f5f9;">
            <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:4px;">Entrega</div>
            <div style="font-weight:700;color:#0f172a;font-size:14px;">${esc(pkg.estimatedDelivery)}</div>
            <div style="font-size:12px;color:#64748b;">${esc(pkg.serviceType)}</div>
          </div>
        </div>
        <div style="border-top:1px solid #f1f5f9;padding-top:16px;">${events || '<div style="color:#94a3b8;font-size:13px;">Nenhum evento registrado ainda.</div>'}</div>
      </div>
    </div>`;
}

export async function submitTracking(): Promise<void> {
  const input = byId<HTMLInputElement>('trackingCodeInput');
  const result = byId('trackingResult');
  const button = byId<HTMLButtonElement>('trackBtn');
  if (!input || !result) return;

  const query = input.value.trim();
  if (!query) return;

  if (button) button.disabled = true;
  result.style.display = 'block';
  result.classList.add('active');
  result.innerHTML = card('<h4 style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 6px;">Consultando pedido...</h4>');

  try {
    const packages = await api.tracking(query);
    result.innerHTML = packages.length
      ? packages.map(renderPackage).join('')
      : card('<div style="font-size:52px;margin-bottom:16px;">📦</div><h3 style="color:#0f172a;margin:0 0 8px;font-size:18px;">Nada encontrado</h3><p style="color:#64748b;margin:0;font-size:14px;">Nenhum pedido encontrado para o código, número do pedido ou CPF informado.</p>');
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    result.innerHTML = card(`<span style="color:#ef4444;">${esc(err instanceof ApiError ? err.message : 'Erro de conexão. Tente novamente.')}</span>`);
  } finally {
    if (button) button.disabled = false;
  }
}

export function initTracking(): void {
  byId<HTMLFormElement>('trackForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    void submitTracking();
  });

  const code = new URLSearchParams(window.location.search).get('tracking');
  const input = byId<HTMLInputElement>('trackingCodeInput');
  if (code && input) {
    input.value = code;
    window.location.hash = '#rastreio';
    void submitTracking();
  }
}
