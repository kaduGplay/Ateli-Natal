/** Tipos compartilhados entre a API (Node) e o front-end. */

export interface ProductVariationOption {
  name: string;
  image?: string;
}

export interface ProductVariationGroup {
  group_name: string;
  options: ProductVariationOption[];
}

export interface Product {
  id: string;
  name: string;
  price: number;
  oldPrice: number | null;
  stock: number;
  active: boolean;
  image: string;
  images: string[];
  category: string;
  order: number;
  /** HTML da descrição (conteúdo do próprio catálogo). */
  description: string;
  specs: string;
  isBestSeller: boolean;
  bestSellerOrder: number;
  isOrderBump: boolean;
  orderBumpOrder: number;
  freeShippingEligible: boolean;
  urgencyCopy: string;
  crossSell: string[];
  variations: ProductVariationGroup[];
  features: string[];
  salesCount: number;
  hasGift: boolean;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  order: number;
  active: boolean;
  avatar: string;
}

export interface Banner {
  id: number;
  name: string;
  imageUrl: string;
  linkUrl: string;
  active: boolean;
  order: number;
}

export interface StoreSettings {
  storeName: string;
  topbarMessage: string;
  allCategoryImage: string;
  instagram: string;
  facebook: string;
  whatsapp: string;
  freeShippingThreshold: number;
  pixDiscountPercent: number;
  orderBumpDiscountPercent: number;
  maxInstallments: number;
  installmentMinValue: number;
}

export type CouponType = 'percent' | 'fixed';

export interface Coupon {
  code: string;
  type: CouponType;
  value: number;
  active: boolean;
}

export interface AppliedCoupon {
  code: string;
  type: CouponType;
  value: number;
}

/** Avaliação de compra local ou importada com a origem preservada. */
export interface Review {
  id: string;
  productId: string;
  orderId?: string;
  source?: string;
  sourceUrl?: string;
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  text: string;
  photo?: string;
  createdAt: string;
}

export interface ReviewSummary {
  count: number;
  average: number;
}

export interface ReviewsResponse {
  summary: ReviewSummary;
  reviews: Review[];
}

export interface ShippingOption {
  id: string;
  name: string;
  price: number;
  deliveryDays: number;
  isPromo: boolean;
}

export interface CartLine {
  /** Chave da linha no carrinho (produto + variação). */
  lineId: string;
  productId: string;
  variant: string;
  name: string;
  image: string;
  /** Preço unitário exibido. O servidor SEMPRE recalcula a partir do catálogo. */
  price: number;
  qty: number;
  isBump: boolean;
}

export interface CustomerInfo {
  name: string;
  email: string;
  document: string;
  phone: string;
}

export interface AddressInfo {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface CheckoutRequest {
  requestId?: string;
  customer: CustomerInfo;
  address: AddressInfo;
  items: Array<Pick<CartLine, 'productId' | 'variant' | 'qty' | 'isBump'>>;
  shippingOptionId: string;
  coupons: string[];
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  /** Total antes do desconto do Pix. */
  total: number;
  pixDiscount: number;
  /** Valor a pagar no Pix. */
  payable: number;
}

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'cancelled';

export interface PixCharge {
  copyPaste: string;
  expiresAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  variant: string;
  unitPrice: number;
  qty: number;
  isBump: boolean;
}

export interface Order {
  id: string;
  createdAt: string;
  status: PaymentStatus;
  paidAt?: string;
  customer: CustomerInfo;
  address: AddressInfo;
  items: OrderItem[];
  coupons: AppliedCoupon[];
  shipping: { optionId: string; name: string; price: number; deliveryDays: number };
  totals: OrderTotals;
  payment: { method: 'pix'; charge: PixCharge; providerRef: string; provider?: 'voidpay' | 'dev'; webhookToken?: string };
  trackingCode?: string;
}

export interface CheckoutResponse {
  orderId: string;
  totals: OrderTotals;
  pix: PixCharge;
}

export interface OrderPaymentResponse extends CheckoutResponse {
  status: PaymentStatus;
  items: Array<Pick<OrderItem, 'name' | 'variant' | 'unitPrice' | 'qty'>>;
  shipping: Pick<Order['shipping'], 'name' | 'deliveryDays'>;
}

export interface OrderStatusResponse {
  orderId: string;
  status: PaymentStatus;
  trackingCode?: string;
}

export interface TrackingEvent {
  title: string;
  description: string;
  location: string;
  timestamp: string;
  statusType: 'success' | 'error' | 'warning' | 'info';
}

export interface TrackingPackage {
  code: string;
  orderId: string;
  status: string;
  statusText: string;
  progressPercent: number;
  estimatedDelivery: string;
  serviceType: string;
  recipient: { name: string; city: string; state: string };
  events: TrackingEvent[];
}

export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiFail {
  ok: false;
  message: string;
}
export type ApiResponse<T> = ApiOk<T> | ApiFail;
