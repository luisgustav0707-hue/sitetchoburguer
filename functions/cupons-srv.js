// ═══════════════════════════════════════════════════════════════
// CUPONS — VERSÃO SERVIDOR
// ───────────────────────────────────────────────────────────────
// ⚠️ ESTE ARQUIVO É UMA CÓPIA DE admin/admin.js (CSS_CUPOM,
//    destacaRemocao, cupomCozinha, cupomEntrega).
//    MEXEU NO LAYOUT AQUI? REPLIQUE LÁ — e vice-versa. Se as duas
//    versões divergirem, o cupom que sai pelo app fica diferente do
//    que sai pela aba do navegador, e ninguém descobre por meses.
//
// Por que existe uma cópia: as funções do front montam o HTML com
// `window.location` e terminam com um <script>window.print()</script>.
// No servidor não há `window`, e o app NÃO pode ter esse script —
// quem imprime é o webContents.print() do Electron; deixar o
// window.print() dentro do HTML abriria o diálogo do Chromium e
// mandaria a via duas vezes.
// ═══════════════════════════════════════════════════════════════

// O site é servido em domínio fixo, então a logo do cupom de entrega vira
// URL absoluta (no front ela é relativa a window.location).
const BASE_URL = 'https://tchoburguer.com';

// Mesmo CSS do admin, com DUAS diferenças obrigatórias pra impressão pelo app:
//
//  1) `@page{margin:0}` em vez de 3mm. Com margem, o Chromium encolhe a área
//     útil e o conteúdo transborda pra uma segunda página — que sai como um
//     pedaço de papel em branco depois do corte. A margem vira padding do body.
//  2) `padding-bottom` com um avanço extra de 15mm. A térmica corta rente ao
//     fim da página; sem essa sobra, a última linha do cupom fica presa dentro
//     da impressora, antes da serrilha, e some.
const AVANCO_MM = 15;
const CSS_CUPOM_SRV = `*{margin:0;padding:0}`
  + `@page{margin:0;size:80mm auto}`
  + `body{font-family:Arial,Helvetica,sans-serif;font-size:14px;width:80mm;`
  + `padding:3mm;padding-bottom:calc(3mm + ${AVANCO_MM}mm)}`
  + `.c{text-align:center}.b{font-weight:bold}`
  + `.line{border-top:1px dashed #000;margin:7px 0}`
  + `.row{display:flex;justify-content:space-between;margin:3px 0}`
  + `.big{font-size:18px;font-weight:bold}`
  + `.obs-box{border:2px solid #000;padding:5px 6px;margin:5px 0;font-weight:800;font-size:15px;text-align:center}`
  + `.rem{display:inline-block;border:1.5px solid #000;border-radius:3px;padding:0 4px;font-weight:800}`;

// Realça "sem <ingredientes>" (removidos) no cupom pra cozinha não errar.
function destacaRemocao(item) {
  return String(item).replace(/\bsem\s+([^•)—]+)/gi, (m, p1) => `<span class="rem">⚠ NÃO ${p1.trim().toUpperCase()}</span>`);
}

function enderecoCompleto(p) {
  return [p.endereco, p.bairro, p.cidade].filter(Boolean).join(', ');
}
function mapsUrl(p) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(enderecoCompleto(p));
}
function blocoObs(p) {
  return p.obs
    ? `<div class="line"></div><div class="obs-box">⚠ OBS: ${String(p.obs).toUpperCase()} ⚠</div>`
    : '';
}

function cupomCozinhaSrv(p) {
  const itens = Array.isArray(p.itens) ? p.itens : [];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS_CUPOM_SRV}</style></head><body>
    <div class="c b" style="font-size:16px">— COZINHA —</div>
    <div class="c" style="font-size:13px">TCHO BURGUER</div>
    <div class="line"></div>
    <div class="row"><span class="big">${p.num || '#' + p.id}</span><span>${p.horaStr || ''}</span></div>
    <div class="row"><span class="b">${p.tipo === 'delivery' ? '🛵 DELIVERY' : '🏃 RETIRADA'}</span><span>${p.nome || ''}</span></div>
    <div class="line"></div>
    ${itens.map((i) => `<div style="margin:3px 0">• ${destacaRemocao(i)}</div>`).join('')}
    ${blocoObs(p)}
  </body></html>`;
}

function cupomEntregaSrv(p) {
  const itens = Array.isArray(p.itens) ? p.itens : [];
  const endTxt = enderecoCompleto(p);
  // QR code que abre o Google Maps no endereço do cliente (pro motoboy).
  const qrBloco = (p.tipo === 'delivery' && endTxt) ? `
    <div class="line"></div>
    <div class="c b" style="font-size:12px;margin-bottom:4px">🛵 ROTA — escaneie no Maps</div>
    <div class="c"><img src="https://api.qrserver.com/v1/create-qr-code/?size=170x170&qzone=1&data=${encodeURIComponent(mapsUrl(p))}" alt="QR Google Maps" style="width:160px;height:160px"></div>
    <div class="c" style="font-size:11px">${endTxt}</div>` : '';
  const enderecoBloco = p.tipo === 'delivery' ? `
    <div class="line"></div>
    ${p.endereco ? `<div style="margin:2px 0">End: ${p.endereco}</div>` : ''}
    ${p.bairro ? `<div class="row"><span>Bairro:</span><span>${p.bairro}</span></div>` : ''}
    ${p.cidade ? `<div style="margin:2px 0;font-size:12px">${p.cidade}</div>` : ''}
    <div class="row"><span>Frete:</span><span>R$${p.frete || 0}</span></div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS_CUPOM_SRV}</style></head><body>
    <div class="c"><img src="${BASE_URL}/logo/logo.png" style="max-width:160px;max-height:70px;margin-bottom:4px"></div>
    <div class="c" style="font-size:12px">Qui–Dom 19h–23h | (31) 98309-4152</div>
    <div class="line"></div>
    <div class="row"><span class="big">${p.num || '#' + p.id}</span><span>${p.horaStr || ''}</span></div>
    <div class="row b"><span>${p.tipo === 'delivery' ? '🛵 DELIVERY' : '🏃 RETIRADA'}</span></div>
    <div class="line"></div>
    <div class="row"><span>Cliente:</span><span>${p.nome || ''}</span></div>
    <div class="row"><span>Tel:</span><span>${p.tel || '-'}</span></div>
    ${enderecoBloco}
    <div class="line"></div>
    <div class="row"><span>Pag:</span><span>${p.pag || ''}</span></div>
    <div class="line"></div>
    ${itens.map((i) => `<div style="margin:2px 0">• ${i}</div>`).join('')}
    ${blocoObs(p)}
    <div class="line"></div>
    <div class="row big"><span>TOTAL:</span><span>R$${p.total}</span></div>
    ${qrBloco}
    <div class="c b" style="margin-top:8px">Obrigado! 😋</div>
    <div class="line"></div>
    <div class="c" style="font-size:10px">App de pedidos: PedidoEasy — pedidoeasy.com.br</div>
  </body></html>`;
}

// Cupom de teste do botão "Imprimir cupom de teste" do painel: prova a
// corrente inteira (fila → app → impressora) sem precisar de um pedido real.
function cupomTesteSrv() {
  return cupomCozinhaSrv({
    id: 0, num: '#TESTE', horaStr: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
    tipo: 'retirada', nome: 'TESTE DE IMPRESSÃO',
    itens: ['1x Cupom de teste', 'Se você está lendo isto, o app está funcionando'],
    obs: 'pode jogar fora',
  });
}

module.exports = { cupomCozinhaSrv, cupomEntregaSrv, cupomTesteSrv, CSS_CUPOM_SRV };
