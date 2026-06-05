# 🍔 Tcho Burguer — Sistema Completo

Dois sites separados que funcionam juntos:

## 📁 Estrutura

```
tcho-burguer/
├── cliente/
│   └── index.html      ← Site do cliente (fazer pedidos)
├── admin/
│   └── index.html      ← Painel admin (cozinha + configurações)
└── shared/
    └── dados.js        ← Dados compartilhados (cardápio, bairros...)
```

---

## 🌐 Site do Cliente (`cliente/index.html`)

Acessado pelos clientes para fazer pedidos. Contém:
- Cardápio completo com personalização de burguers
- Ponto da carne, sachê, retiradas e acréscimos
- Busca de CEP automática com validação de bairro
- Campo de cupom de desconto
- Checkout com entrega ou retirada
- Resumo completo antes de confirmar

---

## ⚙️ Painel Admin (`admin/index.html`)

Acessado pela equipe da loja. Contém:

### Login
- Usuário: `admin`
- Senha: `tcho2025`

### Abas

**🍳 Cozinha**
- Kanban com 4 colunas: Novos → Em preparo → Prontos → Entrega
- Drag & drop para mover pedidos
- Aceite automático com toggle
- Impressão automática via servidor local (port 3333)

**📋 Pedidos**
- Histórico completo de todos os pedidos do dia

**⚙️ Config**
- Loja aberta/fechada
- Delivery / Retirada on/off
- Aceite automático / Impressão automática

**🍔 Cardápio**
- Ativar/desativar produtos
- Controle de estoque (infinito ou quantidade)

**📣 Marketing**
- Criar e gerenciar cupons de desconto
- Tipos: %, valor fixo, frete grátis, item grátis
- Programa de fidelidade (ativar quando quiser)

---

## 🔗 Como os dois se comunicam

Os pedidos feitos no site do cliente são salvos no `localStorage` do navegador.
O admin faz polling a cada 5 segundos e importa os novos pedidos automaticamente.

> Para produção real, substitua o localStorage por uma API/banco de dados real.

---

## 🖨️ Impressão automática

O admin tenta enviar para `http://localhost:3333/imprimir`.
Se o servidor de impressão não estiver rodando, abre a janela de impressão do navegador como fallback.

Veja o arquivo `impressora-tcho-burguer.zip` para instalar o servidor de impressão.

---

## 🚀 Como publicar online

1. **Vercel** (grátis): arraste as pastas para vercel.com
2. **Netlify** (grátis): mesmo processo
3. **GitHub Pages** (grátis): suba para um repositório

Os dois sites podem ser publicados separadamente em subdomínios diferentes:
- `pedidos.tchoburguer.com.br` → pasta cliente/
- `admin.tchoburguer.com.br` → pasta admin/
