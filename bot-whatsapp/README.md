# Atendente automático de WhatsApp — Tcho Burguer

Responde os clientes no WhatsApp da loja, por texto ou áudio. Ele monta o pedido conversando e mostra o resumo com os preços do cardápio. Quando o cliente responde **SIM**, grava o pedido no Firestore. O pedido aparece na **Cozinha do admin** e sai na **impressora automática** igual a um pedido do site.

Ele roda no PC da loja, junto com o `servidor-impressao/`.

## Como funciona

| Etapa | Quem faz |
|---|---|
| Entender o cliente (texto e áudio) | Gemini (`gemini-3.5-flash-lite`; se estiver sobrecarregado ou demorar mais de 30s, troca sozinho para `gemini-3.5-flash` e `gemini-3.8-flash`), com saída em JSON |
| Saber o que tem e quanto custa | `cardapio.js`: Firestore em tempo real (`cardapio/*`, `config/operacao`), mesmas regras do site |
| Conferir itens, estoque, sabores, frete e total | `pedido.js`: usa o `montarDoCarrinho()` de `functions/conferencia.js`, o mesmo que confere o pagamento online |
| Gravar o pedido, dar baixa no estoque e atualizar o CRM | `pedido.js`: mesmo formato de `finalizarPedido()` em `cliente/cliente.js`, mais `origem: 'whatsapp'` |
| Fluxo da conversa (resumo, "sim", pausas) | `atendente.js` |
| Histórico e estado de cada cliente | `conversas.js` (em memória, expira em 2h) |
| Conexão com o WhatsApp | `index.js` (`whatsapp-web.js`) |
| Avisar o cliente quando o pedido muda no Kanban | `avisos.js` |

A IA **nunca** define preço nem total: ela só diz o que o cliente escolheu. O bot recalcula tudo com o cardápio do Firestore. Na hora do "sim", ele confere o estoque de novo antes de gravar.

**Regras do atendimento:**
- **Fora do horário** (ou com a loja fechada no admin), o bot avisa o horário e não aceita pedido.
- **Pix e cartão online** não são cobrados pelo bot. Com o pagamento online ligado no admin, ele manda o link do site. Com ele desligado, aceita Pix por chave e manda a chave depois de gravar o pedido.
- **Atendimento humano.** O bot fica **30 minutos em silêncio** naquela conversa e marca o chat como não lido quando:
  - o cliente pede um atendente;
  - a IA não entende 2 vezes seguidas;
  - alguém da loja responde à mão pelo celular ou pelo WhatsApp Web.
- Grupos, status e mensagens antigas (que chegam quando ele reconecta) são ignorados.
- **Cupom de desconto** não existe pelo bot. Quem quiser usar cupom faz o pedido pelo site.
- **Avisos de status.** Quando o pedido muda de etapa no Kanban, o bot manda uma mensagem no WhatsApp do cliente:
  - **aceito:** saiu de "Novos";
  - **pronto:** chegou em "Prontos" (só retirada);
  - **saiu para entrega:** chegou em "Entrega" (só delivery);
  - **cancelado:** cancelado no painel, em qualquer etapa. Depois desse aviso o bot fica 30 minutos quieto na conversa e marca como não lida, para a loja explicar o motivo.
  Vale para pedidos do site, do balcão e do WhatsApp; mesa não recebe. Cada aviso sai uma vez só por pedido (marca em `pedidos/{id}.avisosWa`). Mudança (ou cancelamento, por `canceladoEm`) com mais de 30 minutos (bot desligado) não gera aviso atrasado. Textos e liga/desliga: painel → Configurações → WhatsApp → Avisos automáticos.

## Instalação (uma vez, no PC da loja)

1. **Node.js 20 ou mais novo**: https://nodejs.org (versão LTS).
2. **Chave do Gemini**: entre em https://aistudio.google.com, clique em **Get API key** e crie uma chave.
   Nesta pasta, copie o `.env.example` para um arquivo chamado `.env` e preencha:
   ```
   GEMINI_API_KEY=sua-chave-aqui
   ```
3. **Service account do Firebase**: no console do Firebase (projeto `tcho-burguer-app`), vá em
   **Configurações do projeto → Contas de serviço → Gerar nova chave privada**.
   Salve o arquivo baixado **nesta pasta** com o nome `serviceAccount.json`.
4. Dê dois cliques no **`INICIAR.bat`**. Na primeira vez ele instala as dependências, o que demora alguns minutos porque baixa um Chromium.
5. Vai aparecer um **QR Code** na janela. No celular da loja, abra **WhatsApp → Aparelhos conectados → Conectar aparelho** e escaneie.
   A sessão fica salva em `.wwebjs_auth/`, então das próximas vezes não pede QR.

Pelo terminal dá no mesmo:
```
cd bot-whatsapp
npm install
npm start
```

> ⚠️ **Segurança.** O `serviceAccount.json` dá acesso **total** ao banco (pedidos, clientes, configurações), e o `.env` tem a chave do Gemini. Os dois já estão no `.gitignore`. Nunca mande esses arquivos por WhatsApp nem os suba no GitHub. Se vazarem, gere chaves novas e apague as antigas no console.

## Testes

**Teste local (não toca em nada de verdade):**
```
npm test
```
Roda o fluxo inteiro (montar o pedido, resumo, "sim", gravação, baixa de estoque e CRM) com WhatsApp, Gemini e Firestore de mentira, em memória.

**Teste com um pedido real:**
1. Com o bot rodando e o "✅ Atendente no ar!" na janela, mande uma mensagem **de outro celular** para o WhatsApp da loja, dentro do horário de funcionamento. Fora do horário, use "forçar aberta" no admin.
2. Peça um lanche e responda o que ele perguntar. Confira o resumo e responda **SIM**.
3. O pedido aparece na Cozinha do admin com o número `#...` e sai na impressora. Depois do teste, cancele o pedido no admin.
   A baixa no estoque e a contagem do cliente no CRM ficam feitas.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| `Falta o arquivo serviceAccount.json` / `Falta a GEMINI_API_KEY` | Refaça os passos 2 e 3 da instalação |
| `Falha no login do WhatsApp` | Feche o bot, apague a pasta `.wwebjs_auth` e inicie de novo para escanear outro QR |
| Fica em "O WhatsApp Web não respondeu a tempo" e o QR Code não aparece | O WhatsApp mudou o WhatsApp Web e a biblioteca `whatsapp-web.js` ainda não acompanhou (aconteceu em 23/11/2026). O `INICIAR.bat` procura atualização a cada reinício: deixe aberto, e quando sair a correção oficial o QR aparece sozinho |
| Não acha o navegador | O bot usa o Chrome ou o Edge instalados. Para usar outro, coloque `CHROME_PATH=` com o caminho do .exe no `.env` |
| Cliente recebe "deu um probleminha aqui" | O Gemini não respondeu, por limite de uso ou instabilidade. O plano grátis tem limite de pedidos por minuto; em dia cheio, considere ativar o faturamento no AI Studio |
| O bot não responde alguém | A conversa pode estar pausada (30 min) por atendimento humano, ou a loja está fechada. Os motivos aparecem na janela |

## Observações

- O `whatsapp-web.js` **não é oficial**: ele automatiza o WhatsApp Web, o que vai contra os termos do WhatsApp, e o número pode ser bloqueado. O bot espera um pouco e mostra "digitando..." antes de responder para reduzir esse risco. Se o número da loja for o canal principal de pedidos, considere usar um número separado.
- No plano **grátis** do Gemini, o Google pode usar o conteúdo enviado (mensagens e áudios dos clientes, nome e endereço) para melhorar os produtos dele. Com o faturamento ativado, isso não acontece.
- Reiniciar o bot apaga as conversas em andamento e as pausas, porque ficam em memória.
- O cardápio base vem do `shared/dados.js` publicado no site; se o site não responder, ele usa a cópia deste repositório. Mudou alguma regra do cardápio no `cliente/cliente.js` ou no `functions/conferencia.js`? Replique em `cardapio.js` e `pedido.js`.
