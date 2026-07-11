# Plano técnico — Emissão de NFC-e (Tcho Burguer)

Documento para levar ao **contador**. Objetivo: emitir NFC-e (Nota Fiscal de
Consumidor Eletrônica) automaticamente a cada pedido, direto do painel admin.

---

## 1. Perguntas para o contador (decisivas — responder antes de tudo)

1. **A empresa PODE emitir NFC-e?**
   - Qual o **regime**? (MEI / Simples Nacional / Regime Normal)
   - ⚠️ Se for **MEI**, em geral **não emite NFC-e**. Precisamos saber se é o caso
     ou se há Inscrição Estadual que permita.
2. **Tem Inscrição Estadual (IE) ativa em MG?** NFC-e exige IE de contribuinte de ICMS.
3. **A empresa está credenciada como emissora de NFC-e na SEFAZ-MG?**
   Se não, o contador precisa fazer o credenciamento.
4. **Regime tributário para o cálculo do imposto:** Simples Nacional (usa **CSOSN**)
   ou Normal (usa **CST**)? Isso muda o preenchimento fiscal.
5. **Obrigatoriedade:** a loja é obrigada a emitir a cada venda, ou emite só quando
   o cliente pede? (define se emissão é automática ou opcional por pedido)

## 2. Itens que preciso receber (do contador / SEFAZ) para configurar

| Item | Onde consegue | Para quê |
|---|---|---|
| **Certificado Digital A1** (.pfx + senha) | Certificadora (e-CNPJ) | Assinar a nota |
| **CSC** (Código de Segurança do Contribuinte) | Portal SEFAZ-MG | Gerar o QR Code |
| **CSC ID / Token** | Portal SEFAZ-MG | Gerar o QR Code |
| **Inscrição Estadual** | Contador | Dados do emitente |
| **Regime tributário** | Contador | Definir CSOSN/CST |
| **Série e numeração inicial da NFC-e** | Contador/SEFAZ | Sequência das notas |
| **Dados fiscais por produto** | Contador | NCM, CFOP, CSOSN/CST, origem |

### Dados fiscais por produto (o contador informa)
Para cada item do cardápio (hambúrgueres, bebidas, porções):
- **NCM** (código do produto — provavelmente o mesmo para lanches; bebidas têm outro)
- **CFOP** (ex.: `5102` venda de mercadoria; confirmar com contador)
- **CSOSN** (Simples) ou **CST** (Normal) — situação tributária
- **Origem** da mercadoria (0 = nacional, na maioria)
- **Alíquotas** se houver (ICMS/PIS/COFINS conforme regime)

## 3. Como será a arquitetura técnica (resumo não-técnico para o contador)

- O site hoje é um painel web. Ele **não pode** falar direto com a SEFAZ nem guardar
  o certificado (questão de segurança).
- Vamos usar um **intermediador fiscal (gateway)** — empresa especializada que
  recebe os dados da venda, assina com o certificado e envia à SEFAZ, devolvendo a
  **nota autorizada + cupom (DANFE) com QR Code** para impressão.
- Opções de gateway (a escolher): **PlugNotas, Focus NFe, NFe.io, WebmaniaBR**
  (ou um ERP como Bling/Tiny que já emite). O contador pode ter preferência.
- O certificado e as chaves ficam guardados com segurança **no gateway / servidor**,
  nunca no navegador.

## 4. Fluxo de emissão (como vai funcionar no dia a dia)

1. Pedido é finalizado no painel (kanban) ou lançado manualmente.
2. O sistema monta os dados fiscais do pedido (itens, valores, cliente, pagamento).
3. Envia ao **gateway**, que assina e transmite à **SEFAZ-MG**.
4. SEFAZ **autoriza** (ou rejeita, com o motivo).
5. Sistema recebe a **NFC-e autorizada** + **DANFE (PDF/QR Code)**.
6. Imprime o cupom fiscal junto com o pedido (usa a impressora que já existe).
7. Guarda a **chave de acesso** e o XML no histórico do pedido.

## 5. Etapas de implementação (do meu lado, depois da parte fiscal pronta)

- **Fase 0 (feita):** tela de configuração fiscal no admin (aba Config → "NFC-e")
  para guardar CNPJ, IE, regime, CSC, série, gateway e dados fiscais padrão.
- **Fase 1:** backend seguro para a emissão (usar o servidor de impressão que já
  existe — `server.js` — ou uma função na nuvem). Guarda certificado/API do gateway.
- **Fase 2:** integração com o gateway escolhido (enviar pedido → receber nota).
- **Fase 3:** mapear NCM/CFOP/CSOSN por produto no admin.
- **Fase 4:** botão "Emitir NFC-e" no pedido + impressão do DANFE + registro da chave.
- **Fase 5:** testes em ambiente de **Homologação** da SEFAZ, depois virar **Produção**.

## 6. Custos a considerar (confirmar valores)

- **Certificado digital A1:** ~R$ 120–250/ano.
- **Gateway fiscal:** mensalidade ou por nota emitida (varia por fornecedor).
- **Honorários** do contador para credenciamento/configuração.

---

**Resumo:** a parte de código é viável e já comecei a preparar (tela de config).
O que trava é a **parte fiscal** — regime, IE, credenciamento, certificado e CSC.
Com o retorno do contador sobre os itens da seção 1 e 2, seguimos para a integração.
