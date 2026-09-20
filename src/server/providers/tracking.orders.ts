import type { Order, TrackingEvent, TrackingPackage } from '../../shared/types.js';
import { onlyDigits } from '../../shared/validation.js';
import { readJson } from '../storage.js';
import type { TrackingProvider } from './types.js';

const fmt = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function toPackage(order: Order): TrackingPackage {
  const paid = order.status === 'paid';
  const events: TrackingEvent[] = [
    {
      title: 'Pedido recebido',
      description: 'Recebemos o seu pedido.',
      location: 'Ateliê Natal',
      timestamp: fmt(order.createdAt),
      statusType: 'info',
    },
  ];
  if (paid) {
    events.push({
      title: 'Pagamento aprovado',
      description: 'Seu pagamento foi confirmado e o pedido será preparado para envio.',
      location: 'Ateliê Natal',
      timestamp: fmt(order.createdAt),
      statusType: 'success',
    });
  }
  return {
    code: order.trackingCode ?? order.id,
    orderId: order.id,
    status: paid ? 'preparacao' : order.status === 'pending' ? 'aguardando_pagamento' : 'cancelado',
    statusText: paid ? 'Em preparação' : order.status === 'pending' ? 'Aguardando pagamento' : 'Cancelado',
    progressPercent: paid ? 25 : 10,
    estimatedDelivery: `${order.shipping.deliveryDays} dias úteis após a postagem`,
    serviceType: order.shipping.name,
    recipient: { name: order.customer.name, city: order.address.city, state: order.address.state },
    events: events.reverse(),
  };
}

/**
 * Rastreio baseado apenas nos pedidos da própria loja (status real do pedido).
 * Para eventos de transporte, implemente `TrackingProvider` com a API da sua transportadora.
 */
export class OrderTrackingProvider implements TrackingProvider {
  async lookup(query: string): Promise<TrackingPackage[]> {
    const q = query.trim();
    if (!q) return [];
    const digits = onlyDigits(q);
    const orders = await readJson<Order[]>('orders', []);
    return orders
      .filter(
        (o) =>
          o.id.toLowerCase() === q.toLowerCase() ||
          (o.trackingCode ?? '').toLowerCase() === q.toLowerCase() ||
          (digits.length === 11 && onlyDigits(o.customer.document) === digits),
      )
      .map(toPackage);
  }
}
