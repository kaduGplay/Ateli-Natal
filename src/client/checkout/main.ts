import type { AppliedCoupon, Product, ShippingOption } from '../../shared/types';
import { isValidCep, isValidCpf, isValidEmail, isValidPhone, onlyDigits } from '../../shared/validation';
import { api } from '../lib/api';
import { initActions, registerActions } from '../lib/actions';
import { esc, installImageFallback, must, qsa } from '../lib/dom';
import { brl, getStoreSettings, setStoreSettings } from '../lib/format';
import { maskCep, maskCpf, maskPhone } from '../lib/masks';
import { showMessage } from '../lib/modal';
import { cart } from '../cart/store';
import { addBump, bumpPrice, renderOrderBumps } from '../cart/bumps';
import { startPix } from './pix';
import { initEmailSuggestions } from './email-suggestions';

let products: Product[] = [];
let coupons: AppliedCoupon[] = [];
let options: ShippingOption[] = [];
let selected: ShippingOption | undefined;
let quoteVersion = 0;
let addressVersion = 0;
let invalidCep = false;
let loadingShipping = false;
let loadingAddress = false;
let ready = false;
let submittingPix = false;
let addressAbort: AbortController | undefined;
const round = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const input = (id: string): HTMLInputElement => must<HTMLInputElement>(id);
const value = (id: string): string => input(id).value.trim();
const text = (id: string, value: string): void => { must(id).textContent = value; };
const display = (id: string, show: boolean, mode = 'block'): void => { must(id).style.display = show ? mode : 'none'; };

function updateTotals(): void {
  const subtotal = round(cart.total());
  const discount = round(Math.min(subtotal, coupons.reduce((sum, c) => sum + (c.type === 'percent' ? subtotal * c.value / 100 : c.value), 0)));
  const total = round(subtotal - discount + (selected?.price ?? 0));
  const payable = round(total * (1 - getStoreSettings().pixDiscountPercent / 100));
  text('chkSidebarSub', brl(subtotal));
  text('chkSidebarFreight', selected ? selected.price === 0 ? 'Grátis' : brl(selected.price) : 'Calcular');
  text('chkSidebarTotal', brl(total));
  text('chkSummaryTotalPreview', brl(total));
  must('btnPixLabel').innerHTML = `CONCLUIR PEDIDO COM PIX POR <span id="chkTotalBtn">${esc(brl(payable))}</span> (${getStoreSettings().pixDiscountPercent}% OFF)`;
  display('chkSidebarDiscountLine', discount > 0);
  must('chkSidebarDiscountLine').innerHTML = `<div class="line" style="color:#15803d"><span>Desconto dos cupons</span><strong>− ${esc(brl(discount))}</strong></div>`;
  must('appliedCouponsList').innerHTML = coupons.map(c => `<span class="checkout-coupon">${esc(c.code)} <button type="button" data-action="coupon-remove" data-code="${esc(c.code)}" aria-label="Remover cupom ${esc(c.code)}">×</button></span>`).join('');
  updateContinue();
}

function updateContinue(): void {
  const blocked = !ready || !cart.count() || loadingShipping || loadingAddress || invalidCep || !selected;
  must<HTMLButtonElement>('btnShippingContinue').disabled = blocked;
  must<HTMLButtonElement>('btnFinalizarPix').disabled = blocked || submittingPix;
}

function renderCart(): void {
  must('chkSidebarItems').innerHTML = cart.lines().map(line => `<div class="chk-item"><img src="${esc(line.image)}" alt="${esc(line.name)}"><div class="chk-item-info"><h4>${esc(line.name)}</h4><small>${line.qty} unidade(s) ${esc(line.variant)}</small><p>${esc(brl(line.price * line.qty))}</p></div></div>`).join('') || '<p>Seu carrinho está vazio. <a href="/">Voltar à loja</a></p>';
  renderOrderBumps(products);
  updateTotals();
}

function deliveryRange(days: number): string {
  const add = (n: number): Date => {
    const date = new Date();
    while (n > 0) { date.setDate(date.getDate() + 1); if (![0, 6].includes(date.getDay())) n--; }
    return date;
  };
  const fmt = (date: Date): string => date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `Chega entre ${fmt(add(Math.max(1, days - 1)))} e ${fmt(add(days))}`;
}

function renderShipping(): void {
  const firstFree = options.find(o => o.price === 0);
  display('checkoutFreeShippingBanner', Boolean(firstFree), 'flex');
  must('chkShippingOptionsList').innerHTML = options.map((option, index) => {
    const checked = option.id === selected?.id;
    const badge = index === 0 ? '<span class="shipping-badge">★ Mais Escolhido</span>' : '';
    const promo = option.price === 0 ? '<span class="shipping-badge">GRÁTIS!</span>' : option.isPromo ? '<span class="shipping-badge shipping-promo">-30%</span>' : '';
    const price = option.price === 0 ? 'Grátis' : brl(option.price);
    return `<label class="shipping-option ${checked ? 'selected' : ''}"><div class="shipping-description"><div><input type="radio" name="shippingOpt" value="${esc(option.id)}" ${checked ? 'checked' : ''}><strong>${esc(option.name)}</strong>${badge}${promo}</div><div class="shipping-date">${esc(deliveryRange(option.deliveryDays))}</div></div><div class="shipping-price">${option.isPromo && option.price > 0 ? `<small>${esc(brl(round(option.price / .7)))}</small>` : ''}<strong>${esc(price)}</strong></div></label>`;
  }).join('');
}

function shippingError(message: string): void {
  must('chkShippingOptionsList').innerHTML = `<p role="alert" style="color:#b91c1c">${esc(message)}</p><button type="button" class="btn-primary" data-action="shipping-retry">Tentar novamente</button>`;
}

async function quoteShipping(): Promise<void> {
  const cep = onlyDigits(value('chkCep'));
  if (!ready || !isValidCep(cep) || invalidCep) return;
  const version = ++quoteVersion;
  const previous = selected?.id;
  selected = undefined;
  options = [];
  loadingShipping = true;
  display('chkShippingOptionsBox', true);
  display('checkoutFreeShippingBanner', false);
  must('chkShippingOptionsList').innerHTML = '<div class="shipping-loading" role="status"><i class="ph ph-circle-notch"></i> Calculando opções de frete...</div>';
  updateTotals();
  try {
    // Consulta e animação em paralelo: no mínimo 3 segundos, sem somar atraso à API.
    const [result] = await Promise.all([
      api.shippingQuote(cep, round(cart.total())),
      new Promise<void>(resolve => window.setTimeout(resolve, 3000)),
    ]);
    if (version !== quoteVersion) return;
    options = result;
    selected = options.find(o => o.id === previous) ?? options[0];
    if (!options.length) shippingError('Não encontramos frete para este CEP.');
    else renderShipping();
  } catch (error) {
    if (version !== quoteVersion) return;
    shippingError(error instanceof Error ? error.message : 'Não foi possível calcular o frete.');
  } finally {
    if (version === quoteVersion) { loadingShipping = false; updateTotals(); }
  }
}

async function lookupCep(clearAddress = true): Promise<void> {
  const cep = onlyDigits(value('chkCep'));
  const version = ++addressVersion;
  ++quoteVersion;
  addressAbort?.abort();
  selected = undefined;
  options = [];
  invalidCep = false;
  loadingShipping = false;
  loadingAddress = false;
  display('cepOk', false);
  display('cepSpinner', false);
  display('checkoutFreeShippingBanner', false);
  display('chkShippingOptionsBox', false);
  text('cepMessage', '');
  if (clearAddress) ['chkStreet', 'chkNeighborhood', 'chkCity', 'chkState'].forEach(id => input(id).value = '');
  updateTotals();
  if (!isValidCep(cep)) return;
  loadingAddress = true;
  display('cepSpinner', true, 'inline');
  void quoteShipping();
  addressAbort = new AbortController();
  const controller = addressAbort;
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal });
    if (!response.ok) throw new Error('CEP indisponível');
    const data = await response.json() as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (version !== addressVersion) return;
    if (data.erro) {
      invalidCep = true;
      ++quoteVersion;
      selected = undefined;
      options = [];
      loadingShipping = false;
      display('checkoutFreeShippingBanner', false);
      display('chkShippingOptionsBox', false);
      text('cepMessage', 'CEP não encontrado. Confira os números e tente novamente.');
      return;
    }
    for (const [id, val] of Object.entries({ chkStreet: data.logradouro, chkNeighborhood: data.bairro, chkCity: data.localidade, chkState: data.uf })) {
      if (clearAddress || !value(id)) input(id).value = val ?? '';
    }
    display('cepOk', true, 'inline');
    if (document.activeElement === input('chkCep')) input('chkNumber').focus();
  } catch {
    if (version !== addressVersion) return;
    text('cepMessage', 'Não foi possível preencher o endereço automaticamente. Preencha os campos abaixo; o frete é calculado separadamente.');
  } finally {
    window.clearTimeout(timeout);
    if (version === addressVersion) {
      loadingAddress = false;
      display('cepSpinner', false);
      saveDraft();
      updateTotals();
    }
  }
}

function validField(id: string, valid: boolean, message: string): boolean {
  const field = input(id);
  field.setCustomValidity(valid ? '' : message);
  if (!valid) { field.reportValidity(); field.focus(); }
  return valid;
}
function validateCustomer(): boolean {
  return validField('chkName', value('chkName').split(/\s+/).length >= 2, 'Informe seu nome completo.')
    && validField('chkEmail', isValidEmail(value('chkEmail')), 'Informe um e-mail válido.')
    && validField('chkDoc', isValidCpf(value('chkDoc')), 'Informe um CPF válido.')
    && validField('chkPhone', isValidPhone(value('chkPhone')), 'Informe um telefone com DDD.');
}
function validateAddress(): boolean {
  if (!validField('chkCep', isValidCep(value('chkCep')) && !invalidCep, 'Informe um CEP válido.')) return false;
  for (const id of ['chkStreet', 'chkNumber', 'chkNeighborhood', 'chkCity']) {
    if (!validField(id, Boolean(value(id)), 'Preencha este campo.')) return false;
  }
  if (!validField('chkState', /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(value('chkState')), 'Informe uma UF válida.')) return false;
  if (!selected || loadingShipping || loadingAddress) { showMessage('Aguarde o cálculo e selecione uma forma de entrega.'); return false; }
  return true;
}
function goToStep(step: number): void {
  if (!ready) return;
  if (!cart.count()) { showMessage('Seu carrinho está vazio. Adicione um produto para continuar.'); return; }
  if (step > 1 && !validateCustomer()) return;
  if (step === 3 && !validateAddress()) return;
  for (const n of [1, 2, 3]) {
    must(`step-${n}`).classList.toggle('active', n === step);
    must(`step-${n}`).querySelector<HTMLElement>('.step-body')!.style.display = n === step ? 'block' : 'none';
  }
  qsa('.progress-step').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === step);
    el.classList.toggle('completed', i + 1 < step);
  });
  if (step === 2 && !selected && !loadingAddress && isValidCep(value('chkCep'))) void lookupCep(false);
  if (step === 3) must('reviewAddressText').innerHTML = `${esc(value('chkStreet'))}, ${esc(value('chkNumber'))} ${esc(value('chkComp'))}<br>${esc(value('chkNeighborhood'))} — ${esc(value('chkCity'))}, ${esc(value('chkState'))}<br>CEP: ${esc(value('chkCep'))}<br>${esc(selected?.name)} · ${esc(selected?.price === 0 ? 'Grátis' : brl(selected?.price ?? 0))}`;
  saveDraft();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function applyCoupon(): Promise<void> {
  const button = must<HTMLButtonElement>('btnApplyCoupon');
  button.disabled = true;
  try {
    const coupon = await api.validateCoupon(value('chkCouponCode'));
    if (coupons.some(c => c.code === coupon.code)) throw new Error('Este cupom já foi aplicado.');
    coupons.push(coupon);
    text('couponMessage', 'Cupom aplicado!');
    input('chkCouponCode').value = '';
    updateTotals();
  } catch (e) { text('couponMessage', e instanceof Error ? e.message : 'Não foi possível aplicar o cupom.'); }
  finally { display('couponMessage', true); button.disabled = false; }
}

const fields = ['chkName', 'chkEmail', 'chkDoc', 'chkPhone', 'chkCep', 'chkStreet', 'chkNumber', 'chkComp', 'chkNeighborhood', 'chkCity', 'chkState'];
function saveDraft(): void {
  const draft = JSON.stringify(Object.fromEntries(fields.map(id => [id, value(id)])));
  try { localStorage.setItem('atelieCheckoutDraft', draft); } catch { /* Armazenamento persistente indisponível. */ }
  try { sessionStorage.setItem('atelieCheckoutDraft', draft); } catch { /* Checkout continua sem armazenamento. */ }
}

async function submitPix(): Promise<void> {
  if (submittingPix || !validateCustomer() || !validateAddress()) return;
  submittingPix = true;
  const button = must<HTMLButtonElement>('btnFinalizarPix');
  button.disabled = true;
  try {
    await startPix({
      customer: { name: value('chkName'), email: value('chkEmail'), document: onlyDigits(value('chkDoc')), phone: onlyDigits(value('chkPhone')) },
      address: { cep: onlyDigits(value('chkCep')), street: value('chkStreet'), number: value('chkNumber'), complement: value('chkComp'), neighborhood: value('chkNeighborhood'), city: value('chkCity'), state: value('chkState') },
      items: cart.lines().map(({ productId, variant, qty, isBump }) => ({ productId, variant, qty, isBump })),
      shippingOptionId: selected!.id,
      coupons: coupons.map(c => c.code),
    });
  } catch (e) { showMessage(e instanceof Error ? e.message : 'Pagamento temporariamente indisponível.'); }
  finally { submittingPix = false; updateContinue(); }
}

registerActions({
  step: el => goToStep(Number(el.dataset.step)),
  'summary-toggle': el => {
    const open = must('chkSummaryContent').style.display === 'none';
    display('chkSummaryContent', open);
    el.setAttribute('aria-expanded', String(open));
    must('chkSummaryIcon').style.transform = open ? 'rotate(180deg)' : '';
  },
  'shipping-retry': () => void lookupCep(false),
  'coupon-apply': () => void applyCoupon(),
  'coupon-remove': el => { coupons = coupons.filter(c => c.code !== el.dataset.code); updateTotals(); },
  'bump-add': el => { const product = products.find(p => p.id === el.dataset.id); if (product) addBump(product); },
  'bump-remove': el => cart.removeBump(el.dataset.id ?? ''),
  'pay-method': el => {
    const pix = el.dataset.method === 'pix';
    display('paymentContentPix', pix);
    display('paymentContentCard', !pix);
    for (const [id, active] of [['tabPayPix', pix], ['tabPayCard', !pix]] as const) {
      must(id).classList.toggle('active', active);
      must(id).style.borderColor = active ? '#0a3b2c' : '#e2e8f0';
      must(id).style.background = active ? '#f0fdf4' : '#fff';
    }
  },
  'pix-submit': () => void submitPix(),
});

async function boot(): Promise<void> {
  initActions();
  installImageFallback();
  const countdownEnd = Date.now() + 15 * 60_000;
  const countdown = window.setInterval(() => {
    const seconds = Math.max(0, Math.ceil((countdownEnd - Date.now()) / 1000));
    text('globalTimer', `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    if (seconds === 0) window.clearInterval(countdown);
  }, 1000);
  must<HTMLButtonElement>('btnStep1Submit').disabled = true;
  updateContinue();
  try {
    let saved: string | null = null;
    try { saved = localStorage.getItem('atelieCheckoutDraft'); } catch { /* Usa a sessão quando disponível. */ }
    if (!saved) { try { saved = sessionStorage.getItem('atelieCheckoutDraft'); } catch { /* Sem dados salvos. */ } }
    const draft = JSON.parse(saved ?? '{}') as Record<string, unknown>;
    for (const id of fields) if (typeof draft[id] === 'string') input(id).value = draft[id];
  } catch { /* Dados locais inválidos não impedem o checkout. */ }
  fields.forEach(id => {
    for (const event of ['input', 'change']) input(id).addEventListener(event, () => { input(id).setCustomValidity(''); saveDraft(); });
  });
  window.addEventListener('pagehide', saveDraft);
  initEmailSuggestions(input('chkEmail'));
  saveDraft();
  for (const [id, mask] of [['chkDoc', maskCpf], ['chkPhone', maskPhone]] as const) input(id).addEventListener('input', () => { input(id).value = mask(value(id)); saveDraft(); });
  input('chkState').addEventListener('input', () => { input('chkState').value = value('chkState').toUpperCase().slice(0, 2); saveDraft(); });
  input('chkCep').addEventListener('input', () => { input('chkCep').value = maskCep(value('chkCep')); void lookupCep(); saveDraft(); });
  must('formCheckoutStep1').addEventListener('submit', e => { e.preventDefault(); goToStep(2); });
  input('chkCouponCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); void applyCoupon(); } });
  must('chkShippingOptionsList').addEventListener('change', e => {
    const radio = e.target as HTMLInputElement;
    if (radio.name !== 'shippingOpt') return;
    selected = options.find(o => o.id === radio.value);
    renderShipping(); updateTotals();
  });
  try {
    const [catalog, settings] = await Promise.all([api.products(), api.settings()]);
    products = catalog;
    setStoreSettings(settings);
    for (const line of [...cart.lines()]) {
      const p = products.find(p => p.id === line.productId && p.active && p.stock > 0);
      if (!p) cart.remove(line.lineId);
      else { line.price = line.isBump ? bumpPrice(p) : p.price; cart.setQty(line.lineId, Math.min(line.qty, p.stock)); }
    }
    ready = true;
    must<HTMLButtonElement>('btnStep1Submit').disabled = cart.count() === 0;
    renderCart();
    if (!cart.count()) display('chkSummaryContent', true);
    cart.onChange(() => { renderCart(); if (isValidCep(value('chkCep'))) void quoteShipping(); });
    if (isValidCep(value('chkCep'))) void lookupCep(false);
  } catch { showMessage('Não foi possível carregar o checkout. Atualize a página para tentar novamente.'); }
}
void boot();
