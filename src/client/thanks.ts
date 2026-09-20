import { api } from './lib/api';
import { cart } from './cart/store';
import { must } from './lib/dom';

const orderId = new URLSearchParams(location.search).get('orderId');
let trackingCode = '';
let confirmed = false;

async function refresh(): Promise<void> {
  if (!orderId) {
    must('paymentHeading').textContent = 'Pedido não informado';
    must('paymentDescription').textContent = 'Abra a confirmação a partir do seu checkout.';
    return;
  }
  try {
    const order = await api.orderStatus(orderId);
    if (order.status === 'paid') {
      must('paymentHeading').textContent = 'Pagamento Confirmado!';
      must('paymentDescription').textContent = 'Sua compra foi aprovada com sucesso. Seu pedido será preparado para envio.';
      must('paymentIcon').className = 'ph-bold ph-check';
      trackingCode = order.trackingCode ?? '';
      must('trackCodeDisplay').textContent = trackingCode || order.orderId;
      must('trackingLabel').textContent = trackingCode ? 'Código de Rastreio' : 'Número do Pedido';
      must('copyTracking').textContent = trackingCode ? 'Copiar Código' : 'Copiar Número';
      must('orderDetails').hidden = false;
      if (!confirmed) {
        confirmed = true;
        cart.clear();
        try { sessionStorage.removeItem('atelieCheckoutDraft'); sessionStorage.removeItem('atelieActivePix'); } catch { /* armazenamento opcional */ }
      }
      return;
    }
    must('paymentHeading').textContent = order.status === 'pending' ? 'Aguardando pagamento' : order.status === 'expired' ? 'Pix expirado' : 'Pagamento cancelado';
    must('paymentDescription').textContent = order.status === 'pending' ? 'A confirmação aparecerá aqui assim que o pagamento for aprovado.' : 'Volte ao checkout para gerar uma nova cobrança.';
    if (order.status !== 'pending') return;
  } catch {
    must('paymentHeading').textContent = 'Consultando pagamento';
    must('paymentDescription').textContent = 'Não foi possível consultar agora. Tentaremos novamente em instantes.';
  }
  window.setTimeout(() => void refresh(), 5000);
}

must('copyTracking').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(trackingCode || orderId || ''); must('copyTracking').textContent = 'Copiado!'; }
  catch { must('copyTracking').textContent = 'Selecione e copie o código acima'; }
});
void refresh();
