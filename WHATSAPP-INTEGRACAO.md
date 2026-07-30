# Integração oficial do WhatsApp (Meta Cloud API) — runbook

Envia mensagens pro cliente **sozinho** (zero-toque) quando o pedido muda de
etapa — ex.: ao arrastar pra **Entrega**, o cliente recebe *"saiu para entrega"*.
Usa a **API oficial do WhatsApp Business (Meta Cloud API)** — não é WhatsApp Web
nem gambiarra. Código pronto na branch `zap-zap`. **Nada vai ao ar até você
configurar as credenciais e deployar** (passos abaixo).

> ⚠️ Diferente do botão 💬 (semi-automático, grátis), este é o **automático**.
> A Meta cobra por mensagem (categoria "utilidade" é baratinha, com cota grátis).

## O que já está pronto no código (branch `zap-zap`)
- `functions/services/whatsappService.js` → `sendTemplate()` e `sendMessage()` (Graph API).
- `functions/index.js` → função **`whatsappStatusPedido`** (dispara em `pedidos/{id}` quando o `status` muda) + `enviarCampanha` com os secrets.
- Admin → **Marketing → Mensagens → 🤖 Envio automático**: liga a automação e mapeia etapa → template.
- `firestore.rules` → coleção `whatsapp_logs` (auditoria dos envios).

---

## Passo 1 — Conta e app na Meta
1. **business.facebook.com** → crie/entre no seu **Meta Business**.
2. **developers.facebook.com** → **Meus Apps** → **Criar app** → tipo **Empresa (Business)**.
3. No app, adicione o produto **WhatsApp**.
4. Anote o **Phone Number ID** e o **WhatsApp Business Account (WABA) ID** (aparecem em WhatsApp → API Setup).
5. Registre/valide o **número** que vai enviar (número da loja, dedicado à API).

## Passo 2 — Token permanente (System User)
O token temporário expira em 24h — precisamos de um **permanente**:
1. Business Settings → **Usuários → Usuários do sistema** → criar um System User (Admin).
2. **Gerar token** para o seu app, com as permissões:
   `whatsapp_business_messaging` e `whatsapp_business_management`.
3. Guarde o token (é o **WHATSAPP_TOKEN**). ⚠️ Segredo — nunca no chat/código.

## Passo 3 — Criar e aprovar os TEMPLATES
Mensagem proativa (fora da janela de 24h) **exige template aprovado**.
1. **WhatsApp Manager → Modelos de mensagem → Criar modelo**.
2. Categoria **Utilidade** (mais barata; marketing custa mais e tem regra).
3. Idioma **Português (BR)** → código `pt_BR`.
4. Exemplo (nome: `pedido_saiu_entrega`), corpo:
   `Olá {{1}}! 🛵 Seu pedido {{2}} saiu para entrega e já está a caminho. Bom apetite!`
   → aqui são **2 variáveis**: {{1}}=nome, {{2}}=número do pedido.
5. Envie pra aprovação (costuma sair em minutos/horas).
6. Repita pros outros avisos que quiser (pronto, recebido, etc.). **Anote o nome
   exato, o idioma e a ordem das variáveis** de cada um.

## Passo 4 — Configurar os secrets no Firebase
No terminal, na pasta do projeto:
```
firebase functions:secrets:set WHATSAPP_TOKEN      # cola o token do passo 2
firebase functions:secrets:set WHATSAPP_PHONE_ID   # cola o Phone Number ID do passo 1
```
(opcional) versão da Graph API — padrão v21.0, atual v25.0:
```
firebase functions:secrets:set WHATSAPP_API_VER    # ex.: v25.0
```

## Passo 5 — Deploy
```
firebase deploy --only functions:whatsappStatusPedido,firestore:rules
```

## Passo 6 — Ligar e mapear no admin
No admin → **Marketing → 💬 Mensagens → 🤖 Envio automático**:
1. Ligue **"Ativar envio automático"**.
2. Pra cada etapa que deve avisar (ex.: **Entrega**): marque, ponha o **nome
   exato do template aprovado** (`pedido_saiu_entrega`), o idioma (`pt_BR`) e as
   **variáveis na ordem** do template (ex.: `nome, num`).
3. **Salvar automação**.

> Variáveis disponíveis: `nome` `num` `total` `tipo` `bairro` `endereco` `loja`.
> A ordem tem que bater com o template: se o corpo usa {{1}}=nome e {{2}}=número,
> ponha `nome, num`.

## Passo 7 — Testar
1. Faça um pedido de teste com um **telefone seu** (que tenha WhatsApp).
2. Mova o pedido pra a etapa configurada (ex.: Entrega).
3. Você deve **receber a mensagem** no WhatsApp desse número.
4. Depuração: `firebase functions:log --only whatsappStatusPedido` e a coleção
   `whatsapp_logs` no Firestore (mostra `enviado`/`motivo` de cada tentativa).

## Como funciona por dentro
- `whatsappStatusPedido` dispara quando o `status` do pedido muda.
- Lê `config/operacao.whatsAuto` (o que você salvou no admin).
- Se a etapa tiver template configurado e a automação estiver ligada, chama
  `sendTemplate(tel, template, lang, [params])` → Graph API → cliente recebe.
- Se a API não estiver configurada (sem secrets), **não faz nada** (seguro).

## Custos e limites (resumo)
- Categoria **Utilidade**: barata, com **cota grátis mensal** de conversas.
- **Marketing**: mais cara e com regras de opt-in — evite pra status de pedido.
- Templates precisam de **aprovação** e seguir as políticas da Meta.

## Reverter / desligar
- Desligue no admin (toggle "Ativar envio automático") — para na hora.
- Ou remova a função: `firebase functions:delete whatsappStatusPedido`.
