// ── LOGIN ──────────────────────────────────────────────────────
const CREDENCIAIS = { usuario:'admin', senha:'tcho2025' };

function fazerLogin(){
  const u=document.getElementById('login-user').value.trim();
  const p=document.getElementById('login-pass').value;
  if(u===CREDENCIAIS.usuario && p===CREDENCIAIS.senha){
    document.getElementById('login-screen').style.display='none';
    document.getElementById('app').classList.add('show');
    iniciarApp();
  } else {
    document.getElementById('login-err').textContent='Usuário ou senha incorretos';
    document.getElementById('login-pass').value='';
  }
}
function logout(){
  document.getElementById('app').classList.remove('show');
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('login-pass').value='';
  document.getElementById('login-err').textContent='';
}

// ── NAVEGAÇÃO ──────────────────────────────────────────────────
function showPage(p){
  document.querySelectorAll('.nav-tab').forEach((el,i)=>el.classList.toggle('active',['cozinha','pedidos','config','cardapio','marketing','financeiro'][i]===p));
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  if(p==='cardapio')  renderCardapio();
  if(p==='pedidos')   renderHistorico();
  if(p==='marketing') renderCupons();
  if(p==='financeiro') carregarFinanceiro();
}
function showInner(t){
  document.querySelectorAll('.inner-tab').forEach((el,i)=>el.classList.toggle('active',['cupons','fidelidade'][i]===t));
  document.querySelectorAll('.inner-page').forEach(el=>el.classList.remove('active'));
  document.getElementById('inner-'+t).classList.add('active');
}

// ── LOJA ABERTA/FECHADA ────────────────────────────────────────
function toggleLoja(){
  const aberta=document.getElementById('cfg-loja').checked;
  document.getElementById('cfg-loja').checked=!aberta;
  atualizarBadgeLoja();
  salvarConfig();
}
function atualizarBadgeLoja(){
  const aberta=document.getElementById('cfg-loja').checked;
  const badge=document.getElementById('loja-badge');
  badge.textContent=aberta?'🟢 ABERTA':'🔴 FECHADA';
  badge.className='loja-badge '+(aberta?'aberta':'fechada');
}

// ── CONFIGS ────────────────────────────────────────────────────
function salvarConfig(){
  atualizarBadgeLoja();
  const cfg={
    lojaAberta:document.getElementById('cfg-loja').checked,
    deliveryAtivo:document.getElementById('cfg-delivery').checked,
    retiradaAtiva:document.getElementById('cfg-retirada').checked,
    autoAceitar:autoAceitar,
    autoImprimir:document.getElementById('cfg-print').checked,
    prazoMin:parseInt(document.getElementById('cfg-prazo-min').value)||30,
    prazoMax:parseInt(document.getElementById('cfg-prazo-max').value)||45,
  };
  db.collection('config').doc('operacao').set(cfg,{merge:true}).catch(console.error);
  showToast('✅ Configuração salva!','tok-ok');
}
function syncAutoConfig(){
  autoAceitar=document.getElementById('cfg-auto').checked;
  atualizarBotaoAuto();
  salvarConfig();
}

// ── NOTIFICAÇÃO SONORA ─────────────────────────────────────────
let somAtivo = localStorage.getItem('tcho_som') !== 'false';

function tocarNotificacao(){
  if(!somAtivo) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[880, 0, 0.15], [1046, 0.22, 0.2]].forEach(([freq, delay, dur]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.35, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + dur);
    });
  } catch(e) {}
}

function toggleSom(){
  somAtivo = !somAtivo;
  localStorage.setItem('tcho_som', somAtivo);
  atualizarBotaoSom();
  if(somAtivo) tocarNotificacao(); // preview ao ativar
}

function atualizarBotaoSom(){
  const btn = document.getElementById('btn-som');
  if(!btn) return;
  document.getElementById('som-icone').textContent = somAtivo ? '🔔' : '🔕';
  document.getElementById('som-txt').textContent   = somAtivo ? 'Ativado' : 'Desativado';
  btn.style.borderColor = somAtivo ? '#27ae60' : '#3a3530';
  btn.style.color       = somAtivo ? '#27ae60' : 'var(--muted)';
}

// ── KANBAN & PEDIDOS ───────────────────────────────────────────
let pedidos=[],totalHoje=0,contPed=100,autoAceitar=false,dragId=null,dragSrc=null;
const STATUS_COLS=['novo','prep','pronto','entrega'];
function canDrop(from,to){const fi=STATUS_COLS.indexOf(from),ti=STATUS_COLS.indexOf(to);return ti===fi+1||ti===fi-1;}

function toggleAutoAceitar(){
  autoAceitar=!autoAceitar;
  document.getElementById('cfg-auto').checked=autoAceitar;
  atualizarBotaoAuto();
  document.getElementById('auto-banner').classList.toggle('show',autoAceitar);
  salvarConfig();
  renderAll();
}
function atualizarBotaoAuto(){
  const btn=document.getElementById('btn-auto');
  const tog=document.getElementById('mini-tog');
  const ball=document.getElementById('mini-ball');
  const txt=document.getElementById('auto-txt');
  if(autoAceitar){btn.style.borderColor='#f39c12';btn.style.color='#f39c12';tog.style.background='#f39c12';ball.style.transform='translateX(16px)';ball.style.background='#000';txt.textContent='Ativado';}
  else{btn.style.borderColor='#3a3530';btn.style.color='var(--muted)';tog.style.background='#2a2520';ball.style.transform='translateX(0)';ball.style.background='var(--muted)';txt.textContent='Desativado';}
  document.getElementById('auto-banner').classList.toggle('show',autoAceitar);
}

// ── SIMULAÇÃO DE PEDIDO (para testes) ─────────────────────────
const NOMES=['João','Maria','Pedro','Ana','Carlos','Lucas','Fernanda','Rafael','Beatriz','Guilherme'];
const BAIRROS_SIMULACAO=['Copacabana','Floramar','Heliópolis','Jardim Europa','Lagoa','Planalto','Tupi','Venda Nova'];
const MOCK=[['X-Burguer (🥩 Ao ponto • 🍅 Ketchup)'],['X-Bacon (🔥 Bem passado • 🤍 Maionese)','Refrigerante Lata'],['X-Picles (🩸 Mal passado)','Porção de Batata'],['X-Tropical (🥩 Ao ponto)'],['X-Bacon Duplo (🔥 Bem passado)','Suco Lata'],['X-Romeu & Julieta (🥩 Ao ponto • + Queijo)']];

async function simularPedido(){
  const num=++contPed,tipo=Math.random()>.35?'delivery':'retirada';
  const itens=MOCK[Math.floor(Math.random()*MOCK.length)];
  const nome=NOMES[Math.floor(Math.random()*NOMES.length)];
  const bairro=tipo==='delivery'?BAIRROS_SIMULACAO[Math.floor(Math.random()*BAIRROS_SIMULACAO.length)]:'';
  const pag=['PIX','Dinheiro','Cartão'][Math.floor(Math.random()*3)];
  const total=Math.floor(Math.random()*70)+25,frete=tipo==='delivery'?[4,5,6,7,8][Math.floor(Math.random()*5)]:0;
  const obs=Math.random()>.72?'Sem cebola':'';
  const pedido={id:num,num:`#${String(num).padStart(3,'0')}`,tipo,nome,bairro,pag,total,frete,obs,itens,status:'novo',
    hora:firebase.firestore.FieldValue.serverTimestamp(),
    horaStr:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),impresso:false};
  try{
    await db.collection('pedidos').add(pedido);
    showToast(`🔔 Novo pedido #${num} — ${nome}`,'tok-info');
  }catch(e){
    const p={...pedido,_id:'sim-'+num,hora:new Date()};
    pedidos.push(p);totalHoje++;
    showToast(`🔔 Novo pedido #${num} — ${nome}`,'tok-info');
    atualizarBadgeNovos();
    if(autoAceitar)setTimeout(()=>moverStatus(p._id,'prep',true),600);
    else renderAll();
  }
}

// ── IMPRESSÃO ──────────────────────────────────────────────────
const CSS_CUPOM = `*{margin:0;padding:0}body{font-family:'Courier New',monospace;font-size:12px;padding:10px;max-width:280px}.c{text-align:center}.b{font-weight:bold}.line{border-top:1px dashed #000;margin:6px 0}.row{display:flex;justify-content:space-between;margin:2px 0}.big{font-size:15px;font-weight:bold}.obs-box{border:2px solid #000;padding:4px 6px;margin:4px 0;font-weight:800;font-size:13px;text-align:center}@media print{@page{margin:3mm;size:80mm auto}}`;

function abrirJanelaImpressao(html, largura=420){
  const win = window.open('','_blank',`width=${largura},height=560`);
  if(!win) return;
  win.document.write(html);
  win.document.close();
}

function cupomCozinha(p){
  const obsBloco = p.obs
    ? `<div class="line"></div><div class="obs-box">⚠ OBS: ${p.obs.toUpperCase()} ⚠</div>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS_CUPOM}</style></head><body>
    <div class="c b" style="font-size:14px">— COZINHA —</div>
    <div class="c" style="font-size:10px">TCHO BURGUER</div>
    <div class="line"></div>
    <div class="row"><span class="big">${p.num||'#'+p.id}</span><span>${p.horaStr}</span></div>
    <div class="row"><span class="b">${p.tipo==='delivery'?'🛵 DELIVERY':'🏃 RETIRADA'}</span><span>${p.nome}</span></div>
    <div class="line"></div>
    ${p.itens.map(i=>`<div style="margin:3px 0">• ${i}</div>`).join('')}
    ${obsBloco}
    <script>window.onload=function(){window.print();setTimeout(()=>window.close(),1500)};<\/script>
  </body></html>`;
}

function cupomEntrega(p){
  const logoUrl = new URL('../logo/logo.png', window.location.href).href;
  const obsBloco = p.obs
    ? `<div class="line"></div><div class="obs-box">⚠ OBS: ${p.obs.toUpperCase()} ⚠</div>`
    : '';
  const enderecoBloco = p.tipo==='delivery' ? `
    <div class="line"></div>
    ${p.endereco ? `<div style="margin:2px 0">End: ${p.endereco}</div>` : ''}
    ${p.bairro   ? `<div class="row"><span>Bairro:</span><span>${p.bairro}</span></div>` : ''}
    ${p.cidade   ? `<div style="margin:2px 0;font-size:10px">${p.cidade}</div>` : ''}
    <div class="row"><span>Frete:</span><span>R$${p.frete||0}</span></div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS_CUPOM}</style></head><body>
    <div class="c"><img src="${logoUrl}" style="max-width:160px;max-height:70px;margin-bottom:4px"></div>
    <div class="c" style="font-size:10px">Qui–Dom 19h–23h | (31) 98309-4152</div>
    <div class="line"></div>
    <div class="row"><span class="big">${p.num||'#'+p.id}</span><span>${p.horaStr}</span></div>
    <div class="row b"><span>${p.tipo==='delivery'?'🛵 DELIVERY':'🏃 RETIRADA'}</span></div>
    <div class="line"></div>
    <div class="row"><span>Cliente:</span><span>${p.nome}</span></div>
    <div class="row"><span>Tel:</span><span>${p.tel||'-'}</span></div>
    ${enderecoBloco}
    <div class="line"></div>
    <div class="row"><span>Pag:</span><span>${p.pag}</span></div>
    <div class="line"></div>
    ${p.itens.map(i=>`<div style="margin:2px 0">• ${i}</div>`).join('')}
    ${obsBloco}
    <div class="line"></div>
    <div class="row big"><span>TOTAL:</span><span>R$${p.total+(p.frete||0)}</span></div>
    <div class="c b" style="margin-top:8px">Obrigado! 😋</div>
    <script>window.onload=function(){window.print();setTimeout(()=>window.close(),1500)};<\/script>
  </body></html>`;
}

function imprimirPedido(p){
  if(!document.getElementById('cfg-print').checked)return;
  fetch('http://localhost:3333/imprimir',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(p)
  }).then(r=>r.json()).then(d=>{
    if(d.ok)showToast(`🖨️ Pedido ${p.num||'#'+p.id} impresso!`,'tok-ok');
    else showToast(`⚠️ Erro ao imprimir: ${d.erro}`,'tok-err');
  }).catch(()=>{
    showToast('🖨️ Abrindo cupons...','tok-info');
    abrirJanelaImpressao(cupomCozinha(p), 380);
    setTimeout(()=>abrirJanelaImpressao(cupomEntrega(p), 420), 600);
  });
  p.impresso=true;renderAll();
}

// ── MOVER STATUS / CANCELAR ────────────────────────────────────
function moverStatus(id,novoStatus,auto=false){
  const p=pedidos.find(x=>x._id===id);if(!p)return;
  const horaStr=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const update={status:novoStatus,horaStr,hora:firebase.firestore.FieldValue.serverTimestamp()};
  if(novoStatus==='finalizado') update.horaFim=horaStr;
  p.status=novoStatus;p.hora=new Date();p.horaStr=horaStr;
  if(novoStatus==='finalizado') p.horaFim=horaStr;
  db.collection('pedidos').doc(id).update(update).catch(console.error);
  // Sincroniza status no localStorage (financeiro lê daqui)
  try{
    const ls=JSON.parse(localStorage.getItem('tcho_pedidos')||'[]');
    // Busca pelo id numérico ou pela string do num (#001)
    const idx=ls.findIndex(x=>x.id==p.id || x.num===p.num);
    if(idx!==-1){
      ls[idx].status=novoStatus;
      ls[idx].horaStr=horaStr;
      if(novoStatus==='finalizado') ls[idx].horaFim=horaStr;
      localStorage.setItem('tcho_pedidos',JSON.stringify(ls));
    }
  }catch(e){}
  if(novoStatus==='prep') setTimeout(()=>imprimirPedido(p),200);
  if(novoStatus==='finalizado') setTimeout(()=>mostrarCardFinalizado({...p}),200);
  atualizarBadgeNovos();
  renderAll();
  renderHistorico();
}

// ── CARD DE PEDIDO FINALIZADO ──────────────────────────────────
function mostrarCardFinalizado(p){
  const r=n=>'R$'+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const icone={pix:'📱',dinheiro:'💵',cartao:'💳',pix:'📱'};
  const pagIcon=icone[(p.pag||'').toLowerCase()]||'💳';
  document.getElementById('card-fin-box').innerHTML=`
    <div style="text-align:center;margin-bottom:14px">
      <div style="font-size:2.8rem;line-height:1">✅</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.6rem;color:#27ae60;letter-spacing:3px;margin-top:4px">PEDIDO FINALIZADO</div>
      <div style="font-size:.72rem;color:var(--muted);margin-top:2px">Registrado no financeiro</div>
    </div>
    <div style="background:var(--card);border-radius:10px;padding:13px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;color:var(--orange)">${p.num||'#'+p.id}</span>
        <span style="font-size:.65rem;font-weight:700;padding:3px 8px;border-radius:4px;background:${p.tipo==='delivery'?'#1a0e0e':'#081508'};color:${p.tipo==='delivery'?'#e74c3c':'#27ae60'}">${p.tipo==='delivery'?'🛵 DELIVERY':'🏃 RETIRADA'}</span>
      </div>
      <div style="font-size:.88rem;font-weight:700">${p.nome}</div>
      ${p.bairro?`<div style="font-size:.72rem;color:var(--muted)">📍 ${p.bairro}</div>`:''}
      <div style="height:1px;background:#2a2520;margin:8px 0"></div>
      ${p.itens.map(i=>`<div style="font-size:.72rem;color:var(--muted);padding:2px 0">• ${i}</div>`).join('')}
      ${p.obs?`<div style="font-size:.7rem;color:#000;background:#f39c12;padding:4px 8px;border-radius:4px;font-weight:800;margin-top:6px">⚠ ${p.obs}</div>`:''}
      <div style="height:1px;background:#2a2520;margin:8px 0"></div>
      <div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted);margin-bottom:4px">
        <span>${pagIcon} ${p.pag||'-'}</span>
        ${(p.frete||0)>0?`<span>🛵 Frete: ${r(p.frete)}</span>`:''}
      </div>
      <div style="display:flex;justify-content:space-between;font-family:'Bebas Neue',sans-serif;font-size:1.4rem;color:var(--orange)">
        <span>TOTAL</span><span>${r((p.total||0))}</span>
      </div>
    </div>
    <button onclick="fecharCardFinalizado()" style="width:100%;padding:11px;background:linear-gradient(135deg,#27ae60,#1e8449);color:#fff;border:none;border-radius:8px;font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:2px;cursor:pointer">FECHAR</button>`;
  document.getElementById('modal-finalizado').style.display='flex';
}

function fecharCardFinalizado(){
  document.getElementById('modal-finalizado').style.display='none';
}
function cancelar(id){
  const p=pedidos.find(x=>x._id===id);
  if(!p||!confirm(`Cancelar pedido ${p.num||('#'+p.id)}?`))return;
  db.collection('pedidos').doc(id).delete().catch(console.error);
  pedidos=pedidos.filter(x=>x._id!==id);
  totalHoje=Math.max(0,totalHoje-1);
  renderAll();renderHistorico();
}

// ── DRAG & DROP ────────────────────────────────────────────────
function onDragStart(event,id,status){dragId=id;dragSrc=status;event.dataTransfer.effectAllowed='move';setTimeout(()=>{const el=document.getElementById(`card-${id}`);if(el)el.classList.add('dragging');},0);}
function onDragEnd(){document.querySelectorAll('.card').forEach(el=>el.classList.remove('dragging'));document.querySelectorAll('.col').forEach(el=>el.classList.remove('drag-over'));dragId=null;dragSrc=null;}
function onDragOver(event,status){event.preventDefault();if(!dragId||!canDrop(dragSrc,status)){event.dataTransfer.dropEffect='none';return;}event.dataTransfer.dropEffect='move';document.getElementById('col-'+status).classList.add('drag-over');}
function onDragLeave(event,status){const col=document.getElementById('col-'+status);if(!col.contains(event.relatedTarget))col.classList.remove('drag-over');}
function onDrop(event,toStatus){event.preventDefault();document.getElementById('col-'+toStatus).classList.remove('drag-over');if(!dragId||!canDrop(dragSrc,toStatus))return;moverStatus(dragId,toStatus);}

// ── RENDER CARDS ───────────────────────────────────────────────
function getMin(h){return Math.floor((new Date()-h)/60000);}
function tc(m,s){if(s==='novo')return m<3?'tok':m<6?'twarn':'tlate';if(s==='prep')return m<15?'tok':m<25?'twarn':'tlate';if(s==='entrega')return m<30?'tok':m<50?'twarn':'tlate';return'tok';}
function tt(m){if(m<1)return'agora';if(m>=60)return Math.floor(m/60)+'h'+(m%60?String(m%60).padStart(2,'0')+'min':'');return m+'min';}

function renderCard(p){
  const m=getMin(p.hora),cls=tc(m,p.status);
  const tipoEl=p.tipo==='delivery'?`<span class="card-tipo td">🛵 DEL</span>`:`<span class="card-tipo tr">🏃 RET</span>`;
  const pb=p.impresso?`<span class="badge-print">🖨</span>`:'';
  const fid=p._id;
  let btns='';
  if(p.status==='novo'){btns=autoAceitar?`<span style="font-size:.6rem;color:#f39c12">⚡ aceite automático</span>`:`<button class="btn-k bk-aceitar" onclick="moverStatus('${fid}','prep')">✓ ACEITAR + 🖨️</button><button class="btn-k bk-cancel" onclick="cancelar('${fid}')">×</button>`;}
  else if(p.status==='prep'){btns=`<button class="btn-k bk-pronto" onclick="moverStatus('${fid}','pronto')">PRONTO ✓</button>`;}
  else if(p.status==='pronto'){btns=p.tipo==='delivery'?`<button class="btn-k bk-entrega" onclick="moverStatus('${fid}','entrega')">SAIU 🛵</button>`:`<button class="btn-k bk-final" onclick="moverStatus('${fid}','finalizado')">RETIRADO ✓</button>`;}
  else if(p.status==='entrega'){btns=`<button class="btn-k bk-final" onclick="moverStatus('${fid}','finalizado')">ENTREGUE ✓</button>`;}
  const nextLabel={novo:'Em preparo →',prep:'Pronto →',pronto:p.tipo==='delivery'?'Entrega →':'',entrega:''}[p.status];
  const dragHint=nextLabel?`<div class="drag-hint">↔ Arraste para ${nextLabel}</div>`:'';
  return`<div class="card" id="card-${fid}" draggable="true" ondragstart="onDragStart(event,'${fid}','${p.status}')" ondragend="onDragEnd()">
    <div class="card-hdr"><span class="card-num">${p.num||('#'+p.id)}${pb}</span>${tipoEl}</div>
    <div class="card-cli">${p.nome}${p.bairro?` · ${p.bairro}`:''}</div>
    <div class="card-itens">${p.itens.join(' · ')}</div>
    ${p.obs?`<div class="card-obs">⚠ ${p.obs}</div>`:''}
    <div class="card-ftr"><div class="card-total">R$${p.total+(p.frete||0)}</div><div class="timer ${cls}">⏱ ${tt(m)}</div></div>
    <div class="card-btns">${btns}</div>
    ${dragHint}
  </div>`;
}

function renderAll(){
  const cols={novo:[],prep:[],pronto:[],entrega:[]};
  pedidos.filter(p=>p.status!=='finalizado').forEach(p=>{if(cols[p.status])cols[p.status].push(p);});
  ['novo','prep','pronto','entrega'].forEach(s=>{
    document.getElementById('cnt-'+s).textContent=cols[s].length;
  });
  document.getElementById('sn').textContent=cols.novo.length;
  document.getElementById('sp').textContent=cols.prep.length;
  document.getElementById('sk').textContent=cols.pronto.length;
  document.getElementById('se').textContent=cols.entrega.length;
  document.getElementById('st').textContent=totalHoje;
  const vazio={novo:'Aguardando pedidos...',prep:'Nada em preparo',pronto:'Nenhum pronto',entrega:'Nenhuma entrega'};
  Object.entries(cols).forEach(([s,list])=>{document.getElementById('body-'+s).innerHTML=list.length?list.map(renderCard).join(''):`<div class="vazio-col">${vazio[s]}</div>`;});
}

function atualizarBadgeNovos(){
  const n=pedidos.filter(p=>p.status==='novo').length;
  const badge=document.getElementById('badge-novos');
  badge.style.display=n>0?'inline-flex':'none';
  badge.textContent=n;
}

// ── HISTÓRICO ──────────────────────────────────────────────────
function renderHistorico(){
  const todos=[...pedidos].sort((a,b)=>b.id-a.id);
  if(!todos.length){document.getElementById('hist-lista').innerHTML=`<div class="empty"><div class="empty-icon">📋</div><div>Nenhum pedido ainda</div></div>`;return;}
  const statusLabel={novo:'Novo',prep:'Em preparo',pronto:'Pronto',entrega:'Em entrega',finalizado:'Finalizado'};
  const statusClass={novo:'hs-novo',prep:'hs-prep',pronto:'hs-pronto',entrega:'hs-entrega',finalizado:'hs-finalizado'};
  document.getElementById('hist-lista').innerHTML=todos.map(p=>`
    <div class="hist-row">
      <div><div class="hist-num">#${p.id}</div><div style="font-size:.7rem;color:var(--muted)">${p.nome}${p.bairro?' · '+p.bairro:''}</div></div>
      <div style="font-size:.72rem;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.itens[0]}${p.itens.length>1?' +'+(p.itens.length-1)+' item(s)':''}</div>
      <div style="text-align:right"><div class="hist-status ${statusClass[p.status]||'hs-finalizado'}">${statusLabel[p.status]||p.status}</div><div style="font-size:.68rem;color:var(--muted);margin-top:3px">R$${p.total+(p.frete||0)} · ${p.horaStr}</div></div>
    </div>`).join('');
}

// ── CARDÁPIO (estoque) — dados de shared/dados.js via TCHO ─────
const PRODS = [
  ...TCHO.burguers.map(b => ({id:b.id, e:b.emoji, n:b.nome, p:b.preco, cat:'b'})),
  ...TCHO.extras.filter(e => e.id !== 'cmb').map(e => ({id:e.id, e:e.emoji, n:e.nome, p:e.preco, cat:'e', opcoes:e.opcoes})),
  ...TCHO.extras.filter(e => e.id === 'cmb').map(e => ({id:e.id, e:e.emoji, n:`Combo (+R$${e.preco})`, p:e.preco, cat:'c'})),
];
const est={};PRODS.forEach(p=>{est[p.id]={ativo:true,modo:'inf',qtd:10};});

// ── FOTOS DOS PRODUTOS ─────────────────────────────────────────
function getFotoAdmin(id){
  return JSON.parse(localStorage.getItem('tcho_fotos')||'{}')[id]||null;
}
function salvarFotoData(id,src){
  const fotos=JSON.parse(localStorage.getItem('tcho_fotos')||'{}');
  fotos[id]=src;
  localStorage.setItem('tcho_fotos',JSON.stringify(fotos));
  renderCardapio();
  showToast('📷 Foto salva!','tok-ok');
}
function removerFotoAdmin(id){
  const fotos=JSON.parse(localStorage.getItem('tcho_fotos')||'{}');
  delete fotos[id];
  localStorage.setItem('tcho_fotos',JSON.stringify(fotos));
  renderCardapio();
  showToast('🗑️ Foto removida','tok-info');
}
function abrirUploadFoto(id){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='image/*';
  inp.onchange=e=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement('canvas');
        const MAX=700;
        let w=img.width,h=img.height;
        if(w>h){if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}}
        else{if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}}
        canvas.width=w;canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        salvarFotoData(id,canvas.toDataURL('image/jpeg',0.82));
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}
function salvarFotoUrl(id){
  const url=(document.getElementById('foto-url-'+id)||{}).value?.trim();
  if(!url){showToast('Cole uma URL válida','tok-err');return;}
  salvarFotoData(id,url);
}
function toggleFotoPanel(id){
  const el=document.getElementById('foto-panel-'+id);
  if(!el)return;
  const aberto=el.style.display!=='none';
  el.style.display=aberto?'none':'block';
  const btn=document.getElementById('foto-toggle-'+id);
  if(btn)btn.classList.toggle('active',!aberto);
}

function renderFotoSection(id){
  const foto=getFotoAdmin(id);
  return`<div class="prod-foto" id="foto-panel-${id}" style="display:none">
    <div class="foto-titulo">📷 Foto do produto no cardápio</div>
    <div class="foto-body">
      <div class="foto-preview">
        ${foto
          ? `<img class="foto-thumb" src="${foto}" alt="foto do produto">`
          : `<div class="foto-placeholder">Sem foto</div>`
        }
        ${foto?`<button class="foto-rm-btn" onclick="removerFotoAdmin('${id}')">🗑️ Remover</button>`:''}
      </div>
      <div class="foto-inputs">
        <button class="foto-upload-btn" onclick="abrirUploadFoto('${id}')">📁 Fazer upload</button>
        <div class="foto-url-row">
          <input class="opc-input" id="foto-url-${id}" type="text" placeholder="ou cole uma URL da imagem aqui">
          <button class="opc-btn" onclick="salvarFotoUrl('${id}')">Salvar URL</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ── OPÇÕES DE EXTRAS (sabores de bebidas etc.) ─────────────────
function getOpcoesAdmin(id){
  const saved=JSON.parse(localStorage.getItem('tcho_opcoes')||'{}');
  const prod=PRODS.find(p=>p.id===id);
  return saved[id]!==undefined ? saved[id] : (prod?.opcoes||[]);
}
function salvarOpcoes(id,arr){
  const saved=JSON.parse(localStorage.getItem('tcho_opcoes')||'{}');
  saved[id]=arr;
  localStorage.setItem('tcho_opcoes',JSON.stringify(saved));
}
function adicionarOpcao(id){
  const inp=document.getElementById(`opc-inp-${id}`);
  const val=inp.value.trim();
  if(!val){showToast('Digite o nome da opção','tok-err');return;}
  const arr=getOpcoesAdmin(id);
  if(arr.map(x=>x.toLowerCase()).includes(val.toLowerCase())){showToast('Opção já cadastrada','tok-err');return;}
  arr.push(val);
  salvarOpcoes(id,arr);
  inp.value='';
  renderCardapio();
  showToast(`✅ "${val}" adicionado`,'tok-ok');
}
function removerOpcao(id,idx){
  const arr=getOpcoesAdmin(id);
  const nome=arr[idx];
  arr.splice(idx,1);
  salvarOpcoes(id,arr);
  renderCardapio();
  showToast(`🗑️ "${nome}" removido`,'tok-info');
}

function renderEstoqueBadge(id){const e=est[id];if(!e.ativo)return`<span class="sbadge sout">INATIVO</span>`;if(e.modo==='inf')return`<span class="sbadge sinf">∞</span>`;if(e.qtd<=0)return`<span class="sbadge sout">Esgotado</span>`;if(e.qtd<=3)return`<span class="sbadge slow">${e.qtd} restam</span>`;return`<span class="sbadge sok">${e.qtd} un.</span>`;}

function renderOpcoes(id){
  const arr=getOpcoesAdmin(id);
  return`<div class="prod-opcoes">
    <div class="opc-titulo">🧃 Opções disponíveis para o cliente escolher:</div>
    <div class="opc-tags">
      ${arr.length
        ? arr.map((o,i)=>`<span class="opc-tag">${o}<button class="opc-rm" onclick="removerOpcao('${id}',${i})">×</button></span>`).join('')
        : '<span class="opc-empty">Nenhuma opção cadastrada</span>'
      }
    </div>
    <div class="opc-add">
      <input class="opc-input" id="opc-inp-${id}" type="text" placeholder="Ex: Coca-Cola" onkeydown="if(event.key==='Enter')adicionarOpcao('${id}')">
      <button class="opc-btn" onclick="adicionarOpcao('${id}')">+ Adicionar</button>
    </div>
  </div>`;
}

function renderLista(cat,containerId){
  document.getElementById(containerId).innerHTML=PRODS.filter(p=>p.cat===cat).map(p=>{
    const ev=est[p.id];
    const temOpcoes=cat==='e'&&(p.opcoes||getOpcoesAdmin(p.id).length>0);
    const temFoto=!!getFotoAdmin(p.id);
    return`<div class="prod-item" id="prow-${p.id}">
      <div class="prod-row">
        <div class="prod-foto-mini" onclick="toggleFotoPanel('${p.id}')">
          ${temFoto
            ? `<img src="${getFotoAdmin(p.id)}" class="prod-foto-mini-img" alt="">`
            : `<span class="prod-foto-mini-icon">📷</span>`
          }
        </div>
        <div class="prod-info"><div class="prod-nome">${p.n}</div><div class="prod-preco">R$${p.p}</div></div>
        <label class="toggle-wrap" style="margin-right:8px"><input type="checkbox" ${ev.ativo?'checked':''} onchange="toggleAtivo('${p.id}',this.checked)"><span class="slider"></span></label>
        <div class="prod-stock" id="stock-${p.id}" style="${!ev.ativo?'opacity:.35;pointer-events:none':''}">
          <div class="stock-toggle">
            <button class="stock-btn ${ev.modo==='inf'?'active':''}" onclick="setModo('${p.id}','inf')">∞</button>
            <button class="stock-btn ${ev.modo==='qtd'?'active':''}" onclick="setModo('${p.id}','qtd')">Qtd</button>
          </div>
          <div id="inp-${p.id}" style="display:${ev.modo==='qtd'?'block':'none'}">
            <input class="stock-input" type="number" min="0" max="999" value="${ev.qtd}" onchange="setQtd('${p.id}',this.value)" onclick="event.stopPropagation()">
          </div>
          ${renderEstoqueBadge(p.id)}
        </div>
      </div>
      ${renderFotoSection(p.id)}
      ${temOpcoes?renderOpcoes(p.id):''}
    </div>`;
  }).join('');
}

function renderCardapio(){renderLista('b','lista-burguers');renderLista('e','lista-extras');renderLista('c','lista-combo');}
function toggleAtivo(id,val){est[id].ativo=val;renderCardapio();showToast(`${val?'✅':'🔒'} ${PRODS.find(p=>p.id===id)?.n} ${val?'ativo':'inativo'}`,'tok-ok');}
function setModo(id,modo){est[id].modo=modo;document.getElementById(`inp-${id}`).style.display=modo==='qtd'?'block':'none';document.querySelectorAll(`#stock-${id} .stock-btn`).forEach(b=>b.classList.toggle('active',b.textContent.trim()===(modo==='inf'?'∞':'Qtd')));const row=document.getElementById(`prow-${id}`);if(row){row.querySelectorAll('.sbadge').forEach(b=>b.remove());document.getElementById(`stock-${id}`).insertAdjacentHTML('beforeend',renderEstoqueBadge(id));}}
function setQtd(id,val){est[id].qtd=Math.max(0,parseInt(val)||0);const row=document.getElementById(`prow-${id}`);if(row){row.querySelectorAll('.sbadge').forEach(b=>b.remove());document.getElementById(`stock-${id}`).insertAdjacentHTML('beforeend',renderEstoqueBadge(id));}}

// ── CUPONS ─────────────────────────────────────────────────────
let cupons=[],editandoId=null;
const TIPOS_LABEL={pct:'% Desconto',fixo:'Valor fixo',frete:'Frete grátis',item:'Item grátis'};

function gerarCodigo(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='TCHO';for(let i=0;i<4;i++)code+=c[Math.floor(Math.random()*c.length)];document.getElementById('c-codigo').value=code;}
function atualizarPreview(){
  const tipo=document.getElementById('c-tipo').value,valor=document.getElementById('c-valor').value;
  document.getElementById('c-valor-row').style.display=tipo==='item'?'none':'grid';
  document.getElementById('c-item-row').style.display=tipo==='item'?'block':'none';
  const prev=document.getElementById('c-preview');
  if(tipo==='pct')prev.innerHTML=valor?`O cliente recebe <strong>${valor}%</strong> de desconto`:'Informe o valor';
  else if(tipo==='fixo')prev.innerHTML=valor?`O cliente recebe <strong>R$${valor}</strong> de desconto`:'Informe o valor';
  else if(tipo==='frete')prev.innerHTML=`O cliente recebe <strong>frete grátis</strong>`;
  else if(tipo==='item'){const item=document.getElementById('c-item').value;prev.innerHTML=`O cliente recebe <strong>${item}</strong> de graça`;}
}
function abrirFormCupom(id=null){
  editandoId=id;document.getElementById('form-titulo').textContent=id?'Editar cupom':'Novo cupom';
  if(id){const c=cupons.find(x=>x._id===id);if(!c)return;document.getElementById('c-codigo').value=c.codigo;document.getElementById('c-tipo').value=c.tipo;document.getElementById('c-valor').value=c.valor||'';document.getElementById('c-minimo').value=c.minimo||'';document.getElementById('c-usos').value=c.usosMax||'';document.getElementById('c-validade').value=c.validade||'';document.getElementById('c-desc').value=c.descricao||'';if(c.tipo==='item')document.getElementById('c-item').value=c.item||'';}
  else{document.getElementById('c-codigo').value='';document.getElementById('c-tipo').value='pct';document.getElementById('c-valor').value='';document.getElementById('c-minimo').value='';document.getElementById('c-usos').value='';document.getElementById('c-validade').value='';document.getElementById('c-desc').value='';gerarCodigo();}
  atualizarPreview();document.getElementById('form-cupom').classList.add('open');document.getElementById('form-cupom').scrollIntoView({behavior:'smooth'});
}
function fecharFormCupom(){document.getElementById('form-cupom').classList.remove('open');editandoId=null;}
function salvarCupom(){
  const codigo=document.getElementById('c-codigo').value.trim().toUpperCase();
  if(!codigo){showToast('⚠️ Digite o código do cupom','tok-err');return;}
  const tipo=document.getElementById('c-tipo').value,valor=parseFloat(document.getElementById('c-valor').value)||0;
  if(tipo!=='frete'&&tipo!=='item'&&!valor){showToast('⚠️ Informe o valor do desconto','tok-err');return;}
  const existe=cupons.find(c=>c.codigo===codigo&&c._id!==editandoId);
  if(existe){showToast('⚠️ Esse código já existe!','tok-err');return;}
  const prev=editandoId?cupons.find(c=>c._id===editandoId):null;
  const cupom={codigo,tipo,valor,minimo:parseFloat(document.getElementById('c-minimo').value)||0,usosMax:parseInt(document.getElementById('c-usos').value)||0,usosFeitos:prev?prev.usosFeitos:0,validade:document.getElementById('c-validade').value||null,descricao:document.getElementById('c-desc').value||'',item:document.getElementById('c-item').value,ativo:true,criadoEm:prev?prev.criadoEm:new Date().toLocaleDateString('pt-BR')};
  if(editandoId){
    db.collection('cupons').doc(editandoId).set(cupom,{merge:true}).then(()=>{showToast('✅ Cupom atualizado!','tok-ok');fecharFormCupom();}).catch(e=>{showToast('❌ Erro ao salvar','tok-err');console.error(e);});
  } else {
    db.collection('cupons').add(cupom).then(()=>{showToast('🎟️ Cupom criado!','tok-ok');fecharFormCupom();}).catch(e=>{showToast('❌ Erro ao salvar','tok-err');console.error(e);});
  }
}
function toggleCupom(id){const c=cupons.find(x=>x._id===id);if(!c)return;const novoAtivo=!c.ativo;db.collection('cupons').doc(id).update({ativo:novoAtivo}).then(()=>showToast(novoAtivo?'✅ Cupom ativado!':'🔒 Cupom desativado',novoAtivo?'tok-ok':'tok-info')).catch(console.error);}
function deletarCupom(id){const c=cupons.find(x=>x._id===id);if(!c||!confirm(`Excluir cupom "${c.codigo}"?`))return;db.collection('cupons').doc(id).delete().then(()=>showToast('🗑️ Cupom excluído','tok-info')).catch(console.error);}
function copiarCodigo(codigo){navigator.clipboard?.writeText(codigo).then(()=>showToast(`📋 "${codigo}" copiado!`,'tok-ok')).catch(()=>showToast(`Código: ${codigo}`,'tok-info'));}
function isExp(c){return c.validade&&new Date(c.validade)<new Date();}
function descontoLabel(c){if(c.tipo==='pct')return`${c.valor}% OFF`;if(c.tipo==='fixo')return`R$${c.valor} OFF`;if(c.tipo==='frete')return'FRETE GRÁTIS';if(c.tipo==='item')return`${c.item} GRÁTIS`;return'';}

function renderCupons(){
  const ativos=cupons.filter(c=>c.ativo&&!isExp(c)).length,totalUsos=cupons.reduce((a,c)=>a+c.usosFeitos,0),totalEcon=cupons.reduce((a,c)=>c.tipo==='fixo'?a+c.valor*c.usosFeitos:a,0);
  document.getElementById('mkt-ativos').textContent=ativos;document.getElementById('mkt-usos').textContent=totalUsos;document.getElementById('mkt-econ').textContent=`R$${totalEcon}`;
  if(!cupons.length){document.getElementById('lista-cupons').innerHTML=`<div class="empty"><div class="empty-icon">🎟️</div><div>Nenhum cupom criado ainda</div></div>`;return;}
  document.getElementById('lista-cupons').innerHTML=cupons.map(c=>{
    const exp=isExp(c),sc=exp?'':c.ativo?'ativo':'';
    return`<div class="cupom-card ${sc}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div><div class="cupom-codigo">${c.codigo}</div><div class="cupom-badges">${exp?`<span class="badge badge-exp">EXPIRADO</span>`:c.ativo?`<span class="badge badge-ativo">ATIVO</span>`:`<span class="badge badge-inativo">INATIVO</span>`}<span class="badge badge-tipo">${TIPOS_LABEL[c.tipo]}</span></div></div>
        <div style="text-align:right"><div style="font-family:'Courier New',monospace;font-size:1.2rem;font-weight:700;color:var(--orange)">${descontoLabel(c)}</div>${c.minimo>0?`<div style="font-size:.62rem;color:var(--muted)">mín. R$${c.minimo}</div>`:''}</div>
      </div>
      ${c.descricao?`<div style="font-size:.75rem;color:var(--cream);margin-bottom:5px">💬 "${c.descricao}"</div>`:''}
      <div class="cupom-info"><div class="cupom-info-item">📅 <strong>${c.criadoEm}</strong></div>${c.validade?`<div class="cupom-info-item">⏰ até <strong>${new Date(c.validade+'T12:00:00').toLocaleDateString('pt-BR')}</strong></div>`:'<div class="cupom-info-item">⏰ <strong>Sem validade</strong></div>'}<div class="cupom-info-item">👥 <strong>${c.usosFeitos}${c.usosMax>0?'/'+c.usosMax:''} usos</strong></div></div>
      ${c.usosMax>0?`<div style="background:#2a2520;border-radius:10px;height:4px;overflow:hidden;margin-top:6px"><div style="height:100%;background:var(--orange);border-radius:10px;width:${Math.min(100,(c.usosFeitos/c.usosMax)*100)}%"></div></div>`:''}
      <div class="cupom-acoes">
        <button class="btn-sm bsm-copy" onclick="copiarCodigo('${c.codigo}')">📋 Copiar</button>
        <button class="btn-sm bsm-toggle" onclick="toggleCupom('${c._id}')">${c.ativo?'🔒 Desativar':'✅ Ativar'}</button>
        <button class="btn-sm bsm-edit" onclick="abrirFormCupom('${c._id}')">✏️ Editar</button>
        <button class="btn-sm bsm-del" onclick="deletarCupom('${c._id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

// ── FIDELIDADE ─────────────────────────────────────────────────
function onFlagFidelidade(){
  const on=document.getElementById('flag-fid').checked;
  const status=document.getElementById('fid-status');
  document.getElementById('fid-config').style.display=on?'block':'none';
  if(on){status.className='fid-status fid-on';status.innerHTML='<span>✅</span><span>Programa ativo — visível para os clientes</span>';}
  else{status.className='fid-status fid-off';status.innerHTML='<span>🔒</span><span>Programa desativado — não visível para clientes</span>';}
}

// ── FINANCEIRO ─────────────────────────────────────────────────
let finPeriodo = 'hoje';
let finPedidosList = [];

function filtrarPeriodo(tipo){
  finPeriodo = tipo;
  ['hoje','semana','mes'].forEach(t => {
    const el = document.getElementById('fin-btn-'+t);
    if(el) el.classList.toggle('active', t === tipo);
  });
  if(tipo !== 'custom') carregarFinanceiro();
  else carregarFinanceiro();
}

function getFinRange(){
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const amanha = new Date(hoje.getTime() + 86400000);
  if(finPeriodo==='hoje')   return {ini:hoje, fim:amanha};
  if(finPeriodo==='semana') return {ini:new Date(hoje.getTime()-6*86400000), fim:amanha};
  if(finPeriodo==='mes')    return {ini:new Date(hoje.getFullYear(),hoje.getMonth(),1), fim:amanha};
  if(finPeriodo==='custom'){
    const vi=document.getElementById('fin-ini').value;
    const vf=document.getElementById('fin-fim').value;
    return {
      ini: vi?new Date(vi):hoje,
      fim: vf?new Date(vf+'T23:59:59'):amanha
    };
  }
  return {ini:hoje, fim:amanha};
}

function labelPeriodo(range){
  const fmt={day:'2-digit',month:'2-digit',year:'numeric'};
  const di=range.ini.toLocaleDateString('pt-BR',fmt);
  const df=new Date(range.fim.getTime()-1).toLocaleDateString('pt-BR',fmt);
  return di===df?`Período: ${di}`:`Período: ${di} até ${df}`;
}

async function carregarFinanceiro(){
  const range = getFinRange();
  document.getElementById('fin-periodo-label').textContent = labelPeriodo(range);
  document.getElementById('fin-stats').innerHTML = '<div style="color:var(--muted);font-size:.78rem;padding:8px 0">Carregando...</div>';

  // 1. Sempre carrega localStorage primeiro — fonte confiável sem Firebase
  const todos = JSON.parse(localStorage.getItem('tcho_pedidos')||'[]');
  finPedidosList = todos.filter(p=>{
    const h = new Date(p.hora);
    return !isNaN(h.getTime()) && h >= range.ini && h < range.fim;
  }).map(p=>({...p, hora: new Date(p.hora)}));

  // 2. Se Firebase configurado e retornar dados reais, usa Firestore
  try {
    const snap = await db.collection('pedidos')
      .where('criadoEm','>=', firebase.firestore.Timestamp.fromDate(range.ini))
      .where('criadoEm','<',  firebase.firestore.Timestamp.fromDate(range.fim))
      .get();
    if(snap && snap.docs && snap.docs.length > 0){
      finPedidosList = snap.docs.map(d=>{
        const data=d.data();
        return {...data, _id:d.id, hora:data.hora?.toDate?.() || new Date(data.hora||0)};
      });
    }
    // Se snap vazio → mantém dados do localStorage
  } catch(e){
    // Erro no Firestore → mantém dados do localStorage
  }

  renderFinanceiro();
}

function renderFinanceiro(){
  const ps = finPedidosList;
  const r  = n => 'R$'+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

  if(!ps.length){
    const vazio='<div class="empty"><div class="empty-icon">📊</div><div>Nenhum pedido neste período</div></div>';
    document.getElementById('fin-stats').innerHTML  = vazio;
    document.getElementById('fin-fretes').innerHTML = '';
    document.getElementById('fin-lista').innerHTML  = '';
    return;
  }

  // ── Totais ──
  const totalFaturado = ps.reduce((a,p)=>a+(p.total||0),0);
  const totalFrete    = ps.reduce((a,p)=>a+(p.frete||0),0);
  const totalDesconto = ps.reduce((a,p)=>a+(p.desconto||0),0);
  const totalLiquido  = totalFaturado - totalFrete;
  const nDelivery     = ps.filter(p=>p.tipo==='delivery').length;
  const nRetirada     = ps.filter(p=>p.tipo==='retirada').length;

  // ── Por forma de pagamento ──
  const pagMap={};
  ps.forEach(p=>{
    const k=p.pag||'Outro';
    if(!pagMap[k]) pagMap[k]={total:0,count:0};
    pagMap[k].total+=(p.total||0);
    pagMap[k].count++;
  });

  // ── Ícones por forma de pagamento ──
  const pagIcones={pix:'📱',dinheiro:'💵',cartão:'💳',cartao:'💳',outro:'🪙'};
  const pagIcon=k=>pagIcones[(k||'').toLowerCase()]||'💳';

  // ── Conferência de Caixa ──
  const confItems=Object.entries(pagMap).sort((a,b)=>b[1].total-a[1].total).map(([pag,d])=>`
    <div class="fin-conf-item">
      <div class="fin-conf-icone">${pagIcon(pag)}</div>
      <div class="fin-conf-label">${pag}</div>
      <div class="fin-conf-val">${r(d.total)}</div>
      <div class="fin-conf-cnt">${d.count} pedido${d.count!==1?'s':''}</div>
    </div>`).join('');

  // ── Render Resumo ──
  document.getElementById('fin-stats').innerHTML=`
    <div class="fin-conferencia">
      <div class="fin-conf-titulo">📊 Conferência de Caixa</div>
      <div class="fin-conf-grid">${confItems}</div>
      <div class="fin-conf-total">
        <span>TOTAL (${ps.length} pedido${ps.length!==1?'s':''})</span>
        <span>${r(totalFaturado)}</span>
      </div>
    </div>
    <div class="fin-cards" style="margin-top:14px">
      <div class="fin-card"><div class="fin-card-n" style="color:#27ae60">${r(totalLiquido)}</div><div class="fin-card-l">Líquido s/frete</div></div>
      <div class="fin-card"><div class="fin-card-n" style="color:#3498db">${r(totalFrete)}</div><div class="fin-card-l">Total Fretes</div></div>
      ${totalDesconto>0?`<div class="fin-card"><div class="fin-card-n" style="color:#e74c3c">-${r(totalDesconto)}</div><div class="fin-card-l">Descontos</div></div>`:''}
      <div class="fin-card"><div class="fin-card-n" style="color:var(--muted)">${nDelivery}</div><div class="fin-card-l">🛵 Delivery</div></div>
      <div class="fin-card"><div class="fin-card-n" style="color:var(--muted)">${nRetirada}</div><div class="fin-card-l">🏃 Retirada</div></div>
    </div>`;

  // ── Render Taxas Motoboy ──
  const entregas = ps.filter(p=>p.tipo==='delivery'&&(p.frete||0)>0)
                     .sort((a,b)=>new Date(a.hora)-new Date(b.hora));
  if(!entregas.length){
    document.getElementById('fin-fretes').innerHTML='<div style="color:var(--muted);font-size:.78rem">Nenhuma entrega neste período</div>';
  } else {
    document.getElementById('fin-fretes').innerHTML=`
      <div class="fin-moto-header">
        <span>${entregas.length} entrega${entregas.length!==1?'s':''}</span>
        <span style="color:var(--orange);font-weight:700">Total: ${r(totalFrete)}</span>
      </div>
      <table class="fin-table">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Bairro</th><th>Hora</th><th class="fin-val">Taxa</th></tr></thead>
        <tbody>
          ${entregas.map(p=>`<tr>
            <td class="fin-num">${p.num||'#'+p.id}</td>
            <td>${p.nome}</td>
            <td>${p.bairro||'-'}</td>
            <td>${p.horaStr||'-'}</td>
            <td class="fin-val">${r(p.frete||0)}</td>
          </tr>`).join('')}
          <tr class="fin-total-row">
            <td colspan="4"><strong>TOTAL (${entregas.length} entrega${entregas.length!==1?'s':''})</strong></td>
            <td class="fin-val"><strong>${r(totalFrete)}</strong></td>
          </tr>
        </tbody>
      </table>`;
  }

  // ── Render Lista de Pedidos ──
  const statusLabel={novo:'Novo',prep:'Preparo',pronto:'Pronto',entrega:'Entrega',finalizado:'Finalizado'};
  const statusCor={novo:'#e74c3c',prep:'#f39c12',pronto:'#27ae60',entrega:'#3498db',finalizado:'var(--muted)'};
  const sorted=[...ps].sort((a,b)=>new Date(b.hora)-new Date(a.hora));
  document.getElementById('fin-lista').innerHTML=`
    <table class="fin-table">
      <thead><tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Pagamento</th><th>Status</th><th>Hora</th><th class="fin-val">Total</th></tr></thead>
      <tbody>
        ${sorted.map(p=>`<tr>
          <td class="fin-num">${p.num||'#'+p.id}</td>
          <td>${p.nome}</td>
          <td>${p.tipo==='delivery'?'🛵':'🏃'}</td>
          <td>${p.pag||'-'}</td>
          <td style="color:${statusCor[p.status]||'var(--muted)'};font-weight:700;font-size:.68rem">${statusLabel[p.status]||p.status||'-'}</td>
          <td style="font-size:.7rem;color:var(--muted)">${p.horaStr||'-'}</td>
          <td class="fin-val">${r(p.total||0)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── IMPRESSÃO FINANCEIRO ───────────────────────────────────────
function imprimirVendas(){
  const ps = finPedidosList;
  if(!ps.length){showToast('Nenhum dado para imprimir','tok-err');return;}
  const r  = n => 'R$'+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const pagIcones={pix:'📱',dinheiro:'💵',cartão:'💳',cartao:'💳',outro:'🪙'};
  const totalFaturado = ps.reduce((a,p)=>a+(p.total||0),0);
  const totalFrete    = ps.reduce((a,p)=>a+(p.frete||0),0);
  const totalDesconto = ps.reduce((a,p)=>a+(p.desconto||0),0);
  const totalLiquido  = totalFaturado - totalFrete;
  const pagMap={};
  ps.forEach(p=>{const k=p.pag||'Outro';if(!pagMap[k])pagMap[k]={total:0,count:0};pagMap[k].total+=(p.total||0);pagMap[k].count++;});
  const periodoLabel = document.getElementById('fin-periodo-label').textContent;
  const logoUrl = new URL('../logo/logo.png', window.location.href).href;

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS_CUPOM}
    table{width:100%;border-collapse:collapse;margin:4px 0}td,th{font-size:11px;padding:2px 4px}
    th{border-bottom:1px solid #000;font-weight:bold}.r{text-align:right}
  </style></head><body>
    <div class="c"><img src="${logoUrl}" style="max-width:150px;max-height:65px"></div>
    <div class="c b" style="font-size:14px;margin-top:4px">RESUMO DE VENDAS</div>
    <div class="c" style="font-size:10px">${periodoLabel.replace('Período: ','')}</div>
    <div class="line"></div>
    <div class="row"><span>Pedidos:</span><span>${ps.length}</span></div>
    <div class="row"><span>Delivery:</span><span>${ps.filter(p=>p.tipo==='delivery').length}</span></div>
    <div class="row"><span>Retirada:</span><span>${ps.filter(p=>p.tipo==='retirada').length}</span></div>
    <div class="line"></div>
    <div class="row"><span>Total faturado:</span><span>${r(totalFaturado)}</span></div>
    <div class="row"><span>Fretes cobrados:</span><span>${r(totalFrete)}</span></div>
    ${totalDesconto>0?`<div class="row"><span>Descontos:</span><span>-${r(totalDesconto)}</span></div>`:''}
    <div class="row b" style="font-size:13px;padding:3px 0"><span>LÍQUIDO (s/frete):</span><span>${r(totalLiquido)}</span></div>
    <div class="line"></div>
    <div class="b" style="margin-bottom:3px;font-size:11px">CONFERÊNCIA DE CAIXA</div>
    ${Object.entries(pagMap).sort((a,b)=>b[1].total-a[1].total).map(([k,v])=>`
      <div class="row b"><span>${pagIcones[(k||'').toLowerCase()]||'💳'} ${k}:</span><span>${r(v.total)}</span></div>
      <div class="row" style="margin-left:10px;font-size:10px"><span>${v.count} pedido${v.count!==1?'s':''}</span></div>`).join('')}
    <div class="line"></div>
    <div class="c" style="font-size:9px;margin-top:4px">Impresso em ${new Date().toLocaleString('pt-BR')}</div>
    <script>window.onload=function(){window.print();setTimeout(()=>window.close(),1500)};<\/script>
  </body></html>`;
  abrirJanelaImpressao(html, 400);
}

function imprimirMotoboy(){
  const entregas = finPedidosList.filter(p=>p.tipo==='delivery'&&(p.frete||0)>0)
                                  .sort((a,b)=>new Date(a.hora)-new Date(b.hora));
  if(!entregas.length){showToast('Nenhuma entrega para imprimir','tok-err');return;}
  const r = n => 'R$'+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const totalFrete = entregas.reduce((a,p)=>a+(p.frete||0),0);
  const periodoLabel = document.getElementById('fin-periodo-label').textContent;
  const logoUrl = new URL('../logo/logo.png', window.location.href).href;

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS_CUPOM}
    table{width:100%;border-collapse:collapse;margin:4px 0}td,th{font-size:11px;padding:3px 4px}
    th{border-bottom:1px solid #000;font-weight:bold}.r{text-align:right}
    .tot td{border-top:1px solid #000;font-weight:bold;padding-top:5px}
  </style></head><body>
    <div class="c"><img src="${logoUrl}" style="max-width:150px;max-height:65px"></div>
    <div class="c b" style="font-size:14px;margin-top:4px">TAXAS DE ENTREGA</div>
    <div class="c b" style="font-size:11px">— MOTOBOY —</div>
    <div class="c" style="font-size:10px">${periodoLabel.replace('Período: ','')}</div>
    <div class="line"></div>
    <table>
      <thead><tr><th>Pedido</th><th>Bairro</th><th>Hora</th><th class="r">Taxa</th></tr></thead>
      <tbody>
        ${entregas.map(p=>`<tr>
          <td><b>${p.num||'#'+p.id}</b></td>
          <td>${p.bairro||'-'}</td>
          <td>${p.horaStr||'-'}</td>
          <td class="r">${r(p.frete||0)}</td>
        </tr>`).join('')}
        <tr class="tot">
          <td colspan="3">TOTAL (${entregas.length} entrega${entregas.length!==1?'s':''})</td>
          <td class="r">${r(totalFrete)}</td>
        </tr>
      </tbody>
    </table>
    <div class="line"></div>
    <div class="c" style="font-size:9px;margin-top:4px">Impresso em ${new Date().toLocaleString('pt-BR')}</div>
    <script>window.onload=function(){window.print();setTimeout(()=>window.close(),1500)};<\/script>
  </body></html>`;
  abrirJanelaImpressao(html, 400);
}

// ── TOAST ──────────────────────────────────────────────────────
let toastT;
function showToast(msg,cls='tok-ok'){const el=document.getElementById('toast');el.textContent=msg;el.className=`toast show ${cls}`;clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),3000);}

// ── FALLBACK LOCAL (localStorage + BroadcastChannel) ──────────
function receberPedidoLocal(p){
  if(pedidos.find(x=>x.id===p.id)) return;
  pedidos.push({...p, _id:'local-'+p.id, hora:new Date(p.hora), status:p.status||'novo', impresso:false});
  totalHoje++;
  tocarNotificacao();
  showToast(`🔔 Novo pedido ${p.num||'#'+p.id} — ${p.nome}`,'tok-info');
  atualizarBadgeNovos();
  if(autoAceitar) setTimeout(()=>moverStatus('local-'+p.id,'prep',true),600);
  renderAll();
  renderHistorico();
}

function lerPedidosLocal(){
  const salvos=JSON.parse(localStorage.getItem('tcho_pedidos')||'[]');
  salvos.forEach(p=>receberPedidoLocal(p));
}

// ── INICIALIZAÇÃO ──────────────────────────────────────────────
function iniciarApp(){
  renderAll();
  atualizarBotaoSom();
  // Preenche datas padrão do filtro personalizado com hoje
  const hoje = new Date().toISOString().split('T')[0];
  const iniEl = document.getElementById('fin-ini');
  const fimEl = document.getElementById('fin-fim');
  if(iniEl) iniEl.value = hoje;
  if(fimEl) fimEl.value = hoje;

  // Carrega config do Firestore
  db.collection('config').doc('operacao').get().then(doc=>{
    if(!doc.exists) return;
    const cfg=doc.data();
    document.getElementById('cfg-loja').checked=cfg.lojaAberta!==false;
    document.getElementById('cfg-delivery').checked=cfg.deliveryAtivo!==false;
    document.getElementById('cfg-retirada').checked=cfg.retiradaAtiva!==false;
    document.getElementById('cfg-print').checked=cfg.autoImprimir!==false;
    if(cfg.prazoMin) document.getElementById('cfg-prazo-min').value=cfg.prazoMin;
    if(cfg.prazoMax) document.getElementById('cfg-prazo-max').value=cfg.prazoMax;
    autoAceitar=!!cfg.autoAceitar;
    atualizarBotaoAuto();
    atualizarBadgeLoja();
  }).catch(console.error);

  // ── Fallback local: polling + BroadcastChannel ───────────────
  // Lê imediatamente pedidos já salvos no localStorage
  lerPedidosLocal();
  // Polling a cada 2s (captura pedidos quando Firebase não está configurado)
  let pollingLocal = setInterval(lerPedidosLocal, 2000);
  // BroadcastChannel: recebe pedidos em tempo real entre abas (HTTP)
  try {
    const canal = new BroadcastChannel('tcho_pedidos');
    canal.onmessage = (e) => receberPedidoLocal(e.data);
  } catch(e){}

  // ── Firestore: listener em tempo real (quando configurado) ────
  db.collection('pedidos')
    .where('status','in',['novo','prep','pronto','entrega'])
    .onSnapshot(snapshot=>{
      clearInterval(pollingLocal); // Firebase funcionando → para o polling local
      snapshot.docChanges().forEach(change=>{
        const data=change.doc.data();
        const p={...data,_id:change.doc.id,hora:data.hora?data.hora.toDate():new Date()};
        if(change.type==='added'){
          if(!pedidos.find(x=>x._id===p._id)){
            pedidos.push(p);totalHoje++;
            tocarNotificacao();
            showToast(`🔔 Novo pedido ${p.num||'#'+p.id} — ${p.nome}`,'tok-info');
            atualizarBadgeNovos();
            if(autoAceitar)setTimeout(()=>moverStatus(p._id,'prep',true),600);
          }
        } else if(change.type==='modified'){
          const idx=pedidos.findIndex(x=>x._id===p._id);
          if(idx!==-1) pedidos[idx]={...pedidos[idx],...p};
        } else if(change.type==='removed'){
          pedidos=pedidos.filter(x=>x._id!==p._id);
        }
      });
      renderAll();renderHistorico();
    },()=>{ /* Firebase não configurado — polling local já está rodando */ });

  // Listener cupons (Firestore)
  db.collection('cupons').onSnapshot(snapshot=>{
    snapshot.docChanges().forEach(change=>{
      const data=change.doc.data();
      const c={...data,_id:change.doc.id};
      if(change.type==='added') cupons.push(c);
      else if(change.type==='modified'){const idx=cupons.findIndex(x=>x._id===c._id);if(idx!==-1)cupons[idx]=c;}
      else if(change.type==='removed') cupons=cupons.filter(x=>x._id!==c._id);
    });
    renderCupons();
  },console.error);

  setInterval(renderAll,30000);
}
