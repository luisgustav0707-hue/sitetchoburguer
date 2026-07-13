# Cloud Functions — CRM / Marketing (Fase 3, scaffold)

Estrutura pronta para as **automações** e para o envio pela **API oficial do
WhatsApp Business**. ⚠️ Nada aqui roda no site atual (GitHub Pages) — são
funções server-side no Firebase (**plano Blaze**, que você já ativou). Só
funcionam depois de fazer o deploy e configurar as credenciais.

## O que tem aqui

| Função | Tipo | O que faz |
|---|---|---|
| `verificarClientesInativos` | Agendada (todo dia 10h) | Identifica clientes sem compra há 15d+. Hoje só registra; preparado para gerar cupom + enviar mensagem. |
| `enviarCampanha` | Callable | Recebe `{destinatarios:[{telefone, mensagem}]}` e envia pela API oficial. |
| `gerarCupomCliente` | Callable | Cria um cupom individual (coleção `cupons`) para um cliente. |
| `services/whatsappService.js` | Módulo | `sendMessage(phone, message)` via Meta Cloud API. Sem credenciais, não envia (retorna `nao-configurado`). |

## Pré-requisitos
- Node 20 e Firebase CLI: `npm i -g firebase-tools`
- Login: `firebase login`
- Projeto já apontado no `.firebaserc` (`tcho-burguer-app`).

## Instalar e testar local
```bash
cd functions
npm install
firebase emulators:start --only functions
```

## Configurar a API do WhatsApp (quando tiver as credenciais da Meta)
Criar um app no **Meta for Developers**, adicionar o produto **WhatsApp**,
pegar o **Token permanente** e o **Phone Number ID**. Depois:

```bash
firebase functions:secrets:set WHATSAPP_TOKEN
firebase functions:secrets:set WHATSAPP_PHONE_ID
# opcional: WHATSAPP_API_VER (padrão v21.0)
```
E declarar os secrets nas funções que enviam (em `index.js`, ex.:
`onCall({ region, secrets:['WHATSAPP_TOKEN','WHATSAPP_PHONE_ID'] }, ...)`).

> Mensagens proativas (fora da janela de 24h) exigem **template aprovado**
> pela Meta — usar `sendTemplate` (a implementar) em vez de `sendMessage`.

## Deploy
```bash
firebase deploy --only functions
```

## Como ligar no admin depois
Hoje o admin dispara campanha por **link wa.me** (clique manual). Quando a API
estiver aprovada, dá para trocar o disparo por uma chamada à função
`enviarCampanha` (via Firebase Functions SDK no front), enviando em massa
automaticamente. O `whatsappService` já está pronto para isso.
