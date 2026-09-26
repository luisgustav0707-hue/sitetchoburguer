// Gera os ícones do app de impressão a partir da logo oficial (logo/logo.png).
// Rode com `npm run icones`; os arquivos gerados ficam versionados, então
// normalmente isso não precisa rodar de novo.
//
// Sem dependência nenhuma de propósito (nem pngjs): o PNG é lido e escrito na
// mão aqui. É um script de build que roda uma vez a cada troca de logo —
// instalar biblioteca pra isso só criaria um `npm install` a mais pra alguém
// esquecer de rodar daqui a um ano.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── PNG: leitura ─────────────────────────────────────────────────────
// Só o caso que interessa: 8 bits, RGBA (color type 6), sem entrelace — que é
// o que a logo do Tcho é. Qualquer outra coisa é erro explícito, pra ninguém
// gerar um ícone embaralhado sem perceber.
function lerPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error('não é PNG');
  let o = 8, w = 0, h = 0, partes = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const tipo = buf.toString('ascii', o + 4, o + 8);
    const dados = buf.slice(o + 8, o + 8 + len);
    if (tipo === 'IHDR') {
      w = dados.readUInt32BE(0); h = dados.readUInt32BE(4);
      if (dados[8] !== 8 || dados[9] !== 6 || dados[12] !== 0) {
        throw new Error(`PNG precisa ser 8-bit RGBA sem entrelace (veio bitDepth=${dados[8]} colorType=${dados[9]} interlace=${dados[12]})`);
      }
    } else if (tipo === 'IDAT') partes.push(dados);
    else if (tipo === 'IEND') break;
    o += 12 + len;                                  // len + tipo + dados + crc
  }
  const raw = zlib.inflateSync(Buffer.concat(partes));
  const data = Buffer.alloc(w * h * 4);
  const bpp = 4, stride = w * bpp;
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filtro = raw[p++];
    const linha = raw.slice(p, p + stride); p += stride;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? data[dst + i - bpp] : 0;           // pixel à esquerda
      const b = y > 0 ? data[dst - stride + i] : 0;           // pixel acima
      const c = (i >= bpp && y > 0) ? data[dst - stride + i - bpp] : 0;
      let v = linha[i];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) {                                 // Paeth
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      data[dst + i] = v & 0xFF;
    }
  }
  return { width: w, height: h, data };
}

// ── PNG: escrita ─────────────────────────────────────────────────────
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function escreverPng(t) {
  const { w, h, px } = t;
  const raw = Buffer.alloc(h * (1 + w * 4));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;                                   // sem filtro nesta linha
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw[o++] = px[i]; raw[o++] = px[i + 1]; raw[o++] = px[i + 2]; raw[o++] = px[i + 3];
    }
  }
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGBA
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function tela(w, h) { return { w, h, px: new Uint8ClampedArray(w * h * 4) }; }

// ── Recorte e escala ─────────────────────────────────────────────────
// Caixa que envolve tudo que não é transparente: a logo vem com bastante
// espaço vazio em volta, e a 16px na bandeja esse vazio come metade do ícone.
function recortarOpaco(img) {
  const { width: W, height: H, data } = img;
  const opaco = (x, y) => data[((y * W + x) << 2) + 3] > 40;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!opaco(x, y)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error('logo totalmente transparente');
  return { x0, y0, x1, y1 };
}

// Reamostragem por área (box filter): reduzir 500px→16px com vizinho mais
// próximo deixa a logo serrilhada a ponto de virar sujeira na bandeja.
function desenharEscalado(dst, img, rec, dx, dy, dw, dh) {
  const { width: W, data } = img;
  const sw = rec.x1 - rec.x0 + 1, sh = rec.y1 - rec.y0 + 1;
  for (let y = 0; y < dh; y++) {
    const sy0 = rec.y0 + (y * sh) / dh, sy1 = rec.y0 + ((y + 1) * sh) / dh;
    for (let x = 0; x < dw; x++) {
      const sx0 = rec.x0 + (x * sw) / dw, sx1 = rec.x0 + ((x + 1) * sw) / dw;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = Math.floor(sy0); sy < Math.max(Math.ceil(sy1), Math.floor(sy0) + 1); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.max(Math.ceil(sx1), Math.floor(sx0) + 1); sx++) {
          const i = ((sy * W + sx) << 2);
          const al = data[i + 3] / 255;
          // Cor ponderada pelo alfa: sem isso, o preto transparente das bordas
          // escurece a cor média e a logo ganha um contorno sujo.
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += data[i + 3];
          n++;
        }
      }
      if (!n) continue;
      const am = a / n;
      if (am < 1) continue;
      const peso = (a / 255) || 1;
      const o = ((dy + y) * dst.w + (dx + x)) * 4;
      dst.px[o] = r / peso; dst.px[o + 1] = g / peso; dst.px[o + 2] = b / peso; dst.px[o + 3] = am;
    }
  }
}

// Bolinha de status sobreposta — é o único feedback que o dono da loja tem de
// que o app está conectado, então precisa aparecer tanto em barra de tarefas
// clara quanto escura (daí o anel escuro em volta).
function bolinha(dst, cx, cy, raio, cor) {
  for (let y = Math.floor(cy - raio - 2); y <= Math.ceil(cy + raio + 2); y++) {
    for (let x = Math.floor(cx - raio - 2); x <= Math.ceil(cx + raio + 2); x++) {
      if (x < 0 || y < 0 || x >= dst.w || y >= dst.h) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const dentro = Math.min(1, Math.max(0, raio - d + 0.5));
      const anel = Math.min(1, Math.max(0, raio + 1.6 - d + 0.5));
      if (anel <= 0) continue;
      const o = (y * dst.w + x) * 4;
      const pinta = (c, al) => {
        const na = al + (dst.px[o + 3] / 255) * (1 - al);
        for (let i = 0; i < 3; i++) dst.px[o + i] = (c[i] * al + dst.px[o + i] * (dst.px[o + 3] / 255) * (1 - al)) / na;
        dst.px[o + 3] = na * 255;
      };
      pinta([22, 18, 14], anel);
      if (dentro > 0) pinta(cor, dentro);
    }
  }
}

// ── ICO ──────────────────────────────────────────────────────────────
// A bandeja pede o ícone no tamanho da escala da tela (16px a 100%, 20px a
// 125%, 24px a 150%…). Com um PNG único de 32px o Windows às vezes não
// redimensiona e mostra um quadrado em branco. Um .ico com vários tamanhos,
// cada um desenhado no seu tamanho, resolve — e fica mais nítido do que deixar
// o Windows reduzir.
const TAMANHOS_ICO = [16, 20, 24, 32, 48];

function montarIco(pngsPorTamanho) {
  const n = pngsPorTamanho.length;
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0);      // reservado
  cabecalho.writeUInt16LE(1, 2);      // 1 = ícone
  cabecalho.writeUInt16LE(n, 4);
  const entradas = Buffer.alloc(16 * n);
  let offset = 6 + 16 * n;
  pngsPorTamanho.forEach(({ tamanho, png }, i) => {
    const o = i * 16;
    entradas[o] = tamanho >= 256 ? 0 : tamanho;       // largura
    entradas[o + 1] = tamanho >= 256 ? 0 : tamanho;   // altura
    entradas[o + 2] = 0;                              // cores da paleta
    entradas[o + 3] = 0;                              // reservado
    entradas.writeUInt16LE(1, o + 4);                 // planos
    entradas.writeUInt16LE(32, o + 6);                // bits por pixel
    entradas.writeUInt32LE(png.length, o + 8);
    entradas.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([cabecalho, entradas, ...pngsPorTamanho.map((x) => x.png)]);
}

// ── Geração ──────────────────────────────────────────────────────────
const dir = __dirname;
const logo = lerPng(fs.readFileSync(path.join(dir, '..', '..', 'logo', 'logo.png')));
const rec = recortarOpaco(logo);

// Encaixa a logo na tela quadrada SEM cortar: escala pelo lado que estoura
// primeiro.
function desenharCentralizado(t, N, margem) {
  const util = N - margem * 2;
  const escala = Math.min(util / (rec.x1 - rec.x0 + 1), util / (rec.y1 - rec.y0 + 1));
  const w = Math.max(1, Math.round((rec.x1 - rec.x0 + 1) * escala));
  const h = Math.max(1, Math.round((rec.y1 - rec.y0 + 1) * escala));
  desenharEscalado(t, logo, rec, Math.round((N - w) / 2), Math.round((N - h) / 2), w, h);
}

function iconeBandeja(cor, N = 32) {
  const t = tela(N, N);
  const raio = Math.max(2, Math.round(N * 0.14));
  // A logo ocupa a faixa de cima; a bolinha de status mora no canto de baixo,
  // pra não tapar a marca.
  desenharCentralizado(t, N - Math.round(N * 0.16), Math.max(0, Math.round(N * 0.03)));
  if (cor) bolinha(t, N - raio - 1, N - raio - 1, raio, cor);
  return escreverPng(t);
}
function icoBandeja(cor) {
  return montarIco(TAMANHOS_ICO.map((tamanho) => ({ tamanho, png: iconeBandeja(cor, tamanho) })));
}
function iconeApp() {
  const N = 256, t = tela(N, N);
  desenharCentralizado(t, N, 14);
  return escreverPng(t);
}

const VERDE = [46, 204, 113], CINZA = [149, 165, 166];

// Os ícones da BANDEJA são recurso de runtime e ficam em icones/. Não podem
// morar em build/: o electron-builder trata essa pasta como buildResources
// (recursos do instalador) e não empacota tudo que está lá — foi assim que, no
// PedidoEasy, o .ico sumiu do app e a bandeja apareceu em branco.
const dirIcones = path.join(dir, '..', 'icones');
fs.mkdirSync(dirIcones, { recursive: true });
fs.writeFileSync(path.join(dirIcones, 'icon-conectado.png'), iconeBandeja(VERDE));
fs.writeFileSync(path.join(dirIcones, 'icon-desconectado.png'), iconeBandeja(CINZA));
// É o .ico que a bandeja do Windows usa de verdade; o PNG fica de reserva.
fs.writeFileSync(path.join(dirIcones, 'icon-conectado.ico'), icoBandeja(VERDE));
fs.writeFileSync(path.join(dirIcones, 'icon-desconectado.ico'), icoBandeja(CINZA));

// O ícone do app/instalador continua em build/ — esse SIM é recurso de build.
fs.writeFileSync(path.join(dir, 'icon.png'), iconeApp());
console.log('Bandeja em', dirIcones, '(.ico com', TAMANHOS_ICO.join('/'), 'px)');
console.log('Ícone do app em', path.join(dir, 'icon.png'), '| recorte da logo:', rec);
