# Segurança do Firebase — Fase 1 (Auth do admin + Regras do Firestore)

Este documento é o **passo a passo pra ativar** a segurança. O código já está pronto
na branch `seguranca-firebase`. **Nada muda no site no ar até você seguir os passos
abaixo e publicar.**

> ⚠️ Faça na ordem. Os passos 1–3 são no **Firebase Console** (só você tem acesso).
> Se pular a criação da conta, você fica trancado pra fora do admin.

---

## O que mudou no código
- **`firestore.rules`** — regras que trancam o Firestore (antes estava tudo aberto).
- **`firebase.json`** — passou a apontar pras regras.
- **Login do admin** agora usa **Firebase Auth (e-mail + senha)**. A senha **saiu do
  código** (`admin.js` não tem mais `CREDENCIAIS`).
- O login por **PIN de garçom** foi removido da tela (você é o único admin por ora).

---

## Passo 1 — Ativar login por e-mail/senha
1. Firebase Console → projeto **tcho-burguer-app**
2. **Authentication** → **Sign-in method** (Método de login)
3. Ativar **E-mail/senha** → Salvar

## Passo 2 — Criar a sua conta de admin
1. **Authentication** → **Users** → **Add user**
2. Coloque seu **e-mail** e uma **senha forte** → Add user
3. **Copie o UID** que aparece na lista (algo tipo `a1B2c3...`)

## Passo 3 — Marcar seu usuário como admin
1. **Firestore Database** → **Start collection** (ou +)
2. Collection ID: `admins`
3. Document ID: **cole o UID** copiado no passo 2
4. Adicione um campo qualquer, ex.: `nome` (string) = `Admin` → Salvar

> É esse doc `admins/{UID}` que as regras usam pra saber que você é admin.

## Passo 4 — Testar o login novo (ANTES de deployar as regras)
1. Publique a branch OU rode localmente (as regras ainda são as antigas/abertas)
2. Abra o `/admin`, faça login com o **e-mail e senha** do passo 2
3. Confirme que o painel abre e recebe pedidos normalmente

Se não logar, revise os passos 1–2 (provider ativo? usuário criado?).

## Passo 5 — Publicar as regras (passo irreversível-ish)
No terminal, na pasta do projeto:
```
npm install -g firebase-tools     # se ainda não tiver
firebase login
firebase deploy --only firestore:rules
```

## Passo 6 — Conferir tudo funcionando
- [ ] **Cliente**: abre o cardápio, monta e **finaliza um pedido** de teste
- [ ] **Admin**: o pedido de teste **aparece** na Cozinha
- [ ] **Admin**: consegue aceitar/mudar status, ver Pedidos, Financeiro, CRM
- [ ] **Cliente**: o **rastreamento** do pedido atualiza quando você muda o status
- [ ] **Sair** e **entrar** de novo funciona

Se algo quebrar, dá pra **reverter as regras** rápido no Console
(Firestore → Rules → cola a regra antiga de "test mode") enquanto investigamos.

---

## O que ficou protegido
| Coleção | Cliente (sem login) | Admin |
|---|---|---|
| `config`, `cardapio`, `fotos` | **lê** | lê + escreve |
| `config/contador` | incrementa só `ultimo` | tudo |
| `cardapio/estoque` | baixa só `data` | tudo |
| `cupons` | lê + incrementa `usosFeitos` | tudo |
| `pedidos` | **cria** + lê o próprio (por ID) | tudo |
| `clientes` | cria/atualiza + lê 1 por telefone | lê base toda + apaga |
| `stats`, `presenca` | escreve (analytics) | lê |
| `mesas`, `garcons`, `usuarios`, `campanhas`, `despesas` | **nada** | tudo |
| qualquer outra | negado | negado |

## Fase 2 (endurecimento futuro — opcional)
- Mover a agregação do CRM (`clientes`) pra uma **Cloud Function** disparada na
  criação do pedido, e fechar `clientes` 100% (só admin). Some o `get` público.
- Idem para o **número do pedido** e a **baixa de estoque** (Cloud Function),
  fechando `config`/`cardapio` totalmente.
- Se voltar a ter **vários funcionários**: uma conta Auth por pessoa, com papel
  (campo `perfil` no doc `admins/{uid}`) e regras por papel.
