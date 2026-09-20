import QRCode from 'qrcode';
import type { OrderPaymentResponse } from '../shared/types';
import { api, ApiError } from './lib/api';
import { esc, must } from './lib/dom';
import { brl } from './lib/format';

let orderId = new URLSearchParams(location.search).get('orderId');
let order: OrderPaymentResponse;
let polling: number | undefined;
let countdown: number | undefined;
let checking = false;
let finished = false;
const set = (id: string, text: string): void => { must(id).textContent = text; };

function terminal(status: string): void {
  finished = true;
  window.clearTimeout(polling); window.clearInterval(countdown);
  must<HTMLButtonElement>('copyPayment').disabled = true;
  must('qrBox').hidden = true;
  must('expiry').hidden = true;
  must('checkPayment').hidden = true;
  must('newPayment').hidden = false;
  set('statusText', status === 'expired' ? 'Este Pix expirou' : 'Pagamento cancelado');
  set('paymentHelp', 'Volte ao checkout para gerar uma nova cobrança.');
  try { sessionStorage.removeItem('atelieActivePix'); sessionStorage.removeItem('ateliePixAttempt'); } catch { /* cache opcional */ }
}

async function check(): Promise<void> {
  if (!orderId || checking || finished) return;
  checking = true;
  window.clearTimeout(polling);
  must<HTMLButtonElement>('checkPayment').disabled = true;
  try {
    const response = await api.orderStatus(orderId);
    if (response.status === 'paid') {
      finished = true;
      window.location.replace(`/obrigado.html?orderId=${encodeURIComponent(orderId)}`);
      return;
    }
    if (response.status !== 'pending') { terminal(response.status); return; }
    set('statusText', 'Aguardando pagamento');
  } catch { set('statusText', 'Reconectando para verificar o pagamento...'); }
  finally {
    checking = false;
    must<HTMLButtonElement>('checkPayment').disabled = false;
    if (!finished) polling = window.setTimeout(() => void check(), 5000);
  }
}

async function boot(): Promise<void> {
  if (!orderId) { set('pageNotice', 'Pedido não informado. Volte ao checkout para continuar.'); return; }
  try {
    order = await api.orderPayment(orderId);
    if (order.orderId !== orderId) {
      orderId = order.orderId;
      history.replaceState(null, '', `/pagamento.html?orderId=${encodeURIComponent(orderId)}`);
    }
    if (order.status === 'paid') { window.location.replace(`/obrigado.html?orderId=${encodeURIComponent(orderId)}`); return; }
    set('paymentOrderId', order.orderId);
    set('paymentAmount', brl(order.totals.payable));
    set('paymentTotal', brl(order.totals.payable));
    set('paymentSubtotal', brl(order.totals.subtotal));
    set('paymentDiscount', '− ' + brl(order.totals.discount));
    must('couponRow').hidden = order.totals.discount === 0;
    set('paymentShipping', order.totals.shipping === 0 ? 'Grátis' : brl(order.totals.shipping));
    set('paymentPixDiscount', '− ' + brl(order.totals.pixDiscount));
    set('deliveryName', `${order.shipping.name} · ${order.shipping.deliveryDays} dias úteis`);
    must('paymentItems').innerHTML = order.items.map(item => `<div class="item"><div class="item-name">${esc(item.name)}<small>${item.qty} unidade(s)${item.variant ? ' · ' + esc(item.variant) : ''}</small></div><span class="item-price">${esc(brl(item.unitPrice * item.qty))}</span></div>`).join('');
    must<HTMLTextAreaElement>('paymentCode').value = order.pix.copyPaste;
    must('pageNotice').hidden = true;
    must('paymentContent').hidden = false;
    if (order.status !== 'pending') { terminal(order.status); return; }
    const expiresAt = Date.parse(order.pix.expiresAt);
    const tick = (): void => {
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      set('paymentCountdown', `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
      if (seconds === 0) {
        must<HTMLButtonElement>('copyPayment').disabled = true;
        must('qrBox').hidden = true;
        window.clearInterval(countdown);
        void check();
      }
    };
    countdown = window.setInterval(tick, 1000); tick();
    try {
      const image = must<HTMLImageElement>('paymentQr');
      image.src = await QRCode.toDataURL(order.pix.copyPaste, { width: 320, margin: 2, errorCorrectionLevel: 'M' });
      image.hidden = false;
    } catch { must('qrBox').hidden = true; }
    void check();
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      must('pageNotice').innerHTML = `${esc(error.message)} <button class="primary" id="reissuePayment" type="button">Gerar Pix real deste pedido</button>`;
      must('reissuePayment').addEventListener('click', async () => {
        const button = must<HTMLButtonElement>('reissuePayment');
        button.disabled = true; button.textContent = 'Gerando Pix...';
        try {
          const response = await api.reissuePix(orderId!);
          location.replace(`/pagamento.html?orderId=${encodeURIComponent(response.orderId)}`);
        } catch (e) {
          set('pageNotice', e instanceof Error ? e.message : 'Não foi possível gerar o Pix.');
        }
      });
      return;
    }
    must('pageNotice').innerHTML = 'Não foi possível carregar o pagamento deste pedido. <button class="secondary" id="retryPayment" type="button">Tentar novamente</button>';
    must('retryPayment').addEventListener('click', () => { location.reload(); });
  }
}

must('copyPayment').addEventListener('click', async () => {
  const code = must<HTMLTextAreaElement>('paymentCode');
  try { await navigator.clipboard.writeText(code.value); set('copyFeedback', 'Código copiado! Agora cole no aplicativo do seu banco.'); }
  catch { code.focus(); code.select(); set('copyFeedback', 'Selecione e copie o código acima.'); }
});
must('checkPayment').addEventListener('click', () => void check());
document.addEventListener('visibilitychange', () => { if (!document.hidden && order) void check(); });
void boot();
