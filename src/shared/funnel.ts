export const FUNNEL_LABELS = {
  visit: 'Visitou página', product_impression: 'Viu produto na vitrine', product_view: 'Abriu detalhes do produto', product_gallery: 'Navegou nas fotos do produto', product_variant: 'Selecionou opção do produto', category_view: 'Selecionou categoria', favorite_add: 'Favoritou produto', favorite_remove: 'Removeu favorito',
  add_to_cart: 'Adicionou produto ao carrinho', cart_open: 'Abriu o carrinho', cart_close: 'Fechou o carrinho', cart_remove: 'Removeu produto do carrinho', cart_quantity: 'Alterou quantidade no carrinho',
  checkout_click: 'Clicou em finalizar compra', checkout_view: 'Abriu checkout', checkout_customer: 'Começou o cadastro', field_focus: 'Entrou no campo', field_completed: 'Preencheu o campo', checkout_address: 'Avançou para entrega',
  validation_error: 'Encontrou erro no formulário', shipping_requested: 'Solicitou cálculo do frete', shipping_success: 'Recebeu opções de frete', shipping_selected: 'Selecionou frete', shipping_error: 'Falha no frete', address_error: 'Falha na consulta do endereço',
  coupon_apply: 'Aplicou cupom', coupon_error: 'Cupom recusado', checkout_payment: 'Chegou ao pagamento', pix_submit: 'Clicou em gerar Pix', pix_generated: 'Pix gerado pelo servidor', pix_error: 'Falha ao gerar Pix', payment_view: 'Abriu a página do Pix', qr_ready: 'QR Code disponível na tela', pix_copy: 'Copiou o código Pix',
  purchase: 'Compra confirmada pelo servidor', page_exit: 'Saiu ou trocou de página', repeated_click: 'Repetiu cliques no mesmo botão', engaged: 'Interagiu com a página',
} as const;
export type FunnelName = keyof typeof FUNNEL_LABELS;
