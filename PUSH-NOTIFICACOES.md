# Notificações Push de novos pedidos (admin) — runbook

Recebe *"🔔 Novo pedido #123 — João"* no celular **mesmo com o app fechado**.
Código pronto na branch `push-notificacoes`. **Nada foi publicado ainda** — o
admin/cliente no ar continuam intactos até seguirmos os passos abaixo.

> ⚠️ Fazer num **horário seguro** (loja fechada), não durante o movimento.

## O que já está no código (branch)
- `admin/manifest.json` + metas iOS → admin instalável como app (PWA).
- `admin/firebase-messaging-sw.js` → service worker que recebe o push (não faz cache).
- `admin/push.js` + botão **📱 Ativar push** no admin.
- `functions/index.js` → função `notificarNovoPedido` (dispara em `pedidos/{id}` novo).
- `firestore.rules` → coleção `push_tokens` (só admin).

---

## Passo 1 — Console: ativar Cloud Messaging + chave VAPID
1. Firebase Console → **Configurações do projeto** (engrenagem) → aba **Cloud Messaging**.
2. Em **"Certificados push da Web"** → **Gerar par de chaves**.
3. Copie a chave (começa com `B...`, longa).

## Passo 2 — Colar a chave no código
Em `admin/push.js`, troque:
```js
const VAPID_KEY = 'COLE_AQUI_A_CHAVE_VAPID';
```
pela chave do passo 1. (Eu faço isso quando você me mandar a chave.)

## Passo 3 — Deploy (regras + função)
No terminal, na pasta do projeto:
```
firebase deploy --only firestore:rules,functions
```
> Functions exige plano **Blaze** (você já tem). A função `notificarNovoPedido`
> é 100% adicional — se falhar, o pedido continua normal.

## Passo 4 — Publicar o admin (site)
Merge da branch `push-notificacoes` na `main` e push (GitHub Pages publica).

## Passo 5 — No seu iPhone (importante!)
1. Abra **tchoburguer.com/admin** **no Safari** (não em app de atalho antigo).
2. Toque em **Compartilhar** (□↑) → **"Adicionar à Tela de Início"**.
3. Abra o admin **pelo ícone novo** (modo app / tela cheia).
4. Faça login → toque em **📱 Ativar push** → **Permitir** notificações.
5. Aparece "✅ Notificações ativadas".

> iOS exige: iOS **16.4+**, e o push **só** funciona com o app **instalado** assim.
> Um atalho comum do Safari não recebe push.

## Passo 6 — Testar
- Faça um pedido de teste no cliente (ou force a loja aberta, peça, e feche).
- Bloqueie a tela do iPhone / feche o app.
- Deve chegar a notificação **🔔 Novo pedido**.

## Reverter / desligar
- Tirar o botão de push é só reverter o merge.
- A função pode ser removida: `firebase functions:delete notificarNovoPedido`.
- Regras seguem válidas (a coleção `push_tokens` fica inofensiva).

## Custo
- **FCM (push): grátis.**
- **Cloud Functions:** no Blaze, alguns centavos/mês nesse volume (bem abaixo da cota grátis).
