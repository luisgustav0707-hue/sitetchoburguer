# Pagamento online — Mercado Pago (Checkout Pro)

O cliente escolhe **"Pagar agora online"** no checkout e paga com **Pix, cartão de
crédito ou débito** na página do Mercado Pago. Pagar na entrega (PIX por chave,
dinheiro, cartão na maquininha) continua igual.

## Como funciona

1. O site grava o pedido em `pagamentos/{id}` com status `aguardando` e manda o
   cliente para o Mercado Pago (`criarPagamentoMP`). **Nada chega no Kanban ainda.**
2. Pagou → o Mercado Pago avisa o `webhookMercadoPago`. Quando o cliente volta
   pro site, ele também chama `verificarPagamentoMP` (caso o aviso atrase).
3. A function **consulta o pagamento na API do Mercado Pago** e, se aprovado com
   o valor certo, cria `pedidos/{id}` com status `novo`. Daí em diante é um
   pedido comum: push, impressão, Kanban, financeiro.
4. O pedido pago aparece com `pag: "Pago online - Pix"` (ou Crédito/Débito), um
   selo verde no card e **"*** PAGO - NÃO COBRAR ***"** no cupom de entrega.

Recusado: o cliente vê "Pagamento não aprovado" e pode tentar de novo ou
escolher pagar na entrega (o carrinho volta). O link vale 30 minutos.

Código: `functions/pagamentos.js` (servidor), `cliente/cliente.js`
(`finalizarPedidoOnline`, `acompanharPagamento`), `firestore.rules`
(`/pagamentos` e a trava em `/pedidos`).

## Ativar (uma vez)

1. **Credencial** — no Mercado Pago: *Seu negócio → Configurações → Gestão e
   administração → Credenciais* (ou developers.mercadopago.com → *Suas
   integrações* → criar aplicação **Checkout Pro**). Copie o **Access Token de
   produção** (começa com `APP_USR-`).
2. **Guardar no Firebase** (no terminal, na pasta do projeto — cole o token
   quando pedir; ele não fica em nenhum arquivo):
   ```
   firebase functions:secrets:set MP_ACCESS_TOKEN
   ```
3. **Publicar o servidor e as regras**:
   ```
   firebase deploy --only functions,firestore:rules
   ```
4. **Ligar no painel**: Configurações → Operação → **💳 Pagamento online**.
5. **Teste real**: faça um pedido barato pagando com Pix, confira se ele chega no
   Kanban como pago e devolva o valor pelo app do Mercado Pago.

Desligar a chave no painel some com a opção do site na hora — o resto continua
funcionando.

## Cuidados

- **Cancelar não devolve o dinheiro.** Ao cancelar/excluir um pedido pago, o
  painel avisa o nº do pagamento; a devolução é feita no app/site do Mercado Pago.
- **O total vem do navegador do cliente**, como em todo pedido do site. A
  function confere que o valor pago é igual ao total do pedido, mas não
  recalcula preços. Pedido com total estranho para os itens → conferir antes de
  produzir.
- Boleto e lotérica estão desligados (demoram dias). Sem parcelamento.
