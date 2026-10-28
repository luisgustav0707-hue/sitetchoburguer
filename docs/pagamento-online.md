# Pagamento online — Mercado Pago

No checkout aparecem duas opções de "Pagar agora":

- **⚡ Pix na hora** (Checkout Transparente) — o QR code e o Pix copia e cola
  aparecem na própria tela do site. Pagou, o pedido vai pra cozinha sozinho,
  sem comprovante no WhatsApp.
- **💳 Cartão online** (Checkout Pro) — o cliente paga crédito ou débito na
  página do Mercado Pago (dados de cartão nunca passam pelo nosso site).

Pagar na entrega (PIX por chave, dinheiro, cartão na maquininha) continua igual.

## Como funciona

1. O site grava o pedido em `pagamentos/{id}` com status `aguardando`.
   **Nada chega no Kanban ainda.**
   - Pix: `criarPixMP` gera o Pix (vale 30 min) e grava o QR code no próprio
     `pagamentos/{id}`; o site mostra e fica acompanhando. Venceu → botão
     "Gerar novo Pix" (até 5 por pedido).
   - Cartão: `criarPagamentoMP` gera o link e o cliente vai pro Mercado Pago.
2. Pagou → o Mercado Pago avisa o `webhookMercadoPago`. O site também chama
   `verificarPagamentoMP` de tempos em tempos (caso o aviso atrase).
3. A function **consulta o pagamento na API do Mercado Pago** e, se aprovado com
   o valor certo, cria `pedidos/{id}` com status `novo`. Daí em diante é um
   pedido comum: push, impressão, Kanban, financeiro.
4. O pedido pago aparece com `pag: "Pago online - Pix"` (ou Crédito/Débito), um
   selo verde no card e **"*** PAGO - NÃO COBRAR ***"** no cupom de entrega.

Recusado: o cliente vê "Pagamento não aprovado" e pode tentar de novo ou
escolher pagar na entrega (o carrinho volta). O link vale 30 minutos.

Desistiu ("pagar na entrega"): `cancelarPagamentoMP` confere antes se já não
foi pago (se foi, o pedido segue normal) e marca o pendente como `cancelado`,
cancelando o Pix no Mercado Pago. Se mesmo assim um pagamento entrar depois,
ele **não vira pedido** (o cliente já fez outro) — fica como
`pago-apos-cancelar` e aparece no log das functions; devolva pelo Mercado Pago.

Código: `functions/pagamentos.js` (servidor), `cliente/cliente.js`
(`finalizarPedidoOnline`, `acompanharPagamento`, `mostrarTelaPix`), `firestore.rules`
(`/pagamentos` e a trava em `/pedidos`).

## Ativar (uma vez)

1. **Credencial** — no Mercado Pago: *Seu negócio → Configurações → Gestão e
   administração → Credenciais* (ou developers.mercadopago.com → *Suas
   integrações* → criar aplicação). Copie o **Access Token de produção**
   (começa com `APP_USR-`). O mesmo token serve pro Pix e pro cartão.
   **Pix pela API exige uma chave Pix cadastrada na conta do Mercado Pago**
   (app do Mercado Pago → Pix → Minhas chaves). Sem ela o Pix não é gerado.
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
5. **Teste real**: faça um pedido barato com **Pix na hora** e outro com
   **Cartão online**, confira se chegam no Kanban como pagos e devolva os
   valores pelo app do Mercado Pago.

Desligar a chave no painel some com a opção do site na hora — o resto continua
funcionando.

## Cuidados

- **Cancelar não devolve o dinheiro.** Ao cancelar/excluir um pedido pago, o
  painel avisa o nº do pagamento; a devolução é feita no app/site do Mercado Pago.
- **O total vem do navegador do cliente**, como em todo pedido do site. A
  function confere que o valor pago é igual ao total do pedido, mas não
  recalcula preços. Pedido com total estranho para os itens → conferir antes de
  produzir.
- Boleto e lotérica estão desligados (demoram dias). Sem parcelamento. No
  cartão online o Pix fica de fora (ele é feito na tela do site).
- O Mercado Pago exige e-mail do pagador no Pix; como o site não pede e-mail,
  vai `pedido.<id>@tchoburguer.com`.
