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
  document.querySelectorAll('.nav-tab').forEach((el,i)=>el.classList.toggle('active',['cozinha','pedidos','config','cardapio','marketing'][i]===p));
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  if(p==='cardapio')renderCardapio();
  if(p==='pedidos')renderHistorico();
  if(p==='marketing')renderCupons();
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
  };
  db.collection('config').doc('operacao').set(cfg,{merge:true}).catch(console.error);
  showToast('✅ Configuração salva!','tok-ok');
}
function syncAutoConfig(){
  autoAceitar=document.getElementById('cfg-auto').checked;
  atualizarBotaoAuto();
  salvarConfig();
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
function imprimirPedido(p){
  if(!document.getElementById('cfg-print').checked)return;
  fetch('http://localhost:3333/imprimir',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(p)
  }).then(r=>r.json()).then(d=>{
    if(d.ok)showToast(`🖨️ Pedido #${p.id} impresso!`,'tok-ok');
    else showToast(`⚠️ Erro ao imprimir: ${d.erro}`,'tok-err');
  }).catch(()=>{
    showToast('⚠️ Servidor de impressão offline — abrindo janela','tok-err');
    const win=window.open('','_blank','width=420,height:560');
    if(!win)return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0}body{font-family:'Courier New',monospace;font-size:12px;padding:10px;max-width:280px}.c{text-align:center}.b{font-weight:bold}.line{border-top:1px dashed #000;margin:6px 0}.row{display:flex;justify-content:space-between;margin:2px 0}.big{font-size:15px;font-weight:bold}@media print{@page{margin:3mm;size:80mm auto}}</style></head><body>
    <div class="c b" style="font-size:17px">TCHO BURGUER</div>
    <div class="c" style="font-size:10px">Qui–Dom 19h–23h | (31) 98309-4152</div>
    <div class="line"></div>
    <div class="row"><span class="big">#${p.id}</span><span>${p.horaStr}</span></div>
    <div class="row"><span class="b">${p.tipo==='delivery'?'🛵 DELIVERY':'🏃 RETIRADA'}</span></div>
    <div class="row"><span>Cliente:</span><span>${p.nome}</span></div>
    <div class="row"><span>Tel:</span><span>${p.tel||'-'}</span></div>
    ${p.tipo==='delivery'?`
    <div class="line"></div>
    ${p.endereco?`<div style="margin:2px 0"><span>Endereço: </span><span>${p.endereco}</span></div>`:''}
    ${p.bairro?`<div style="margin:2px 0"><span>Bairro: </span><span>${p.bairro}</span></div>`:''}
    ${p.cidade?`<div style="margin:2px 0"><span>Cidade: </span><span>${p.cidade}</span></div>`:''}
    <div class="row"><span>Frete:</span><span>R$${p.frete||0}</span></div>`:''}
    <div class="line"></div>
    <div class="row"><span>Pag:</span><span>${p.pag}</span></div>
    <div class="line"></div>
    ${p.itens.map(i=>`<div>• ${i}</div>`).join('')}
    ${p.obs?`<div><b>⚠ OBS: ${p.obs}</b></div>`:''}
    <div class="line"></div>
    <div class="row big"><span>TOTAL:</span><span>R$${p.total+(p.frete||0)}</span></div>
    <div class="c b" style="margin-top:8px">Obrigado! 😋</div>
    <script>window.onload=function(){window.print();setTimeout(()=>window.close(),1500)};<\/script>
    </body></html>`);
    win.document.close();
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
  if(novoStatus==='prep')setTimeout(()=>imprimirPedido(p),200);
  atualizarBadgeNovos();
  renderAll();
  renderHistorico();
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
  ...TCHO.extras.filter(e => e.id !== 'cmb').map(e => ({id:e.id, e:e.emoji, n:e.nome, p:e.preco, cat:'e'})),
  ...TCHO.extras.filter(e => e.id === 'cmb').map(e => ({id:e.id, e:e.emoji, n:`Combo (+R$${e.preco})`, p:e.preco, cat:'c'})),
];
const est={};PRODS.forEach(p=>{est[p.id]={ativo:true,modo:'inf',qtd:10};});

function renderEstoqueBadge(id){const e=est[id];if(!e.ativo)return`<span class="sbadge sout">INATIVO</span>`;if(e.modo==='inf')return`<span class="sbadge sinf">∞</span>`;if(e.qtd<=0)return`<span class="sbadge sout">Esgotado</span>`;if(e.qtd<=3)return`<span class="sbadge slow">${e.qtd} restam</span>`;return`<span class="sbadge sok">${e.qtd} un.</span>`;}
function renderLista(cat,containerId){document.getElementById(containerId).innerHTML=PRODS.filter(p=>p.cat===cat).map(p=>{const ev=est[p.id];return`<div class="prod-row" id="prow-${p.id}"><div class="prod-emoji">${p.e}</div><div class="prod-info"><div class="prod-nome">${p.n}</div><div class="prod-preco">R$${p.p}</div></div><label class="toggle-wrap" style="margin-right:8px"><input type="checkbox" ${ev.ativo?'checked':''} onchange="toggleAtivo('${p.id}',this.checked)"><span class="slider"></span></label><div class="prod-stock" id="stock-${p.id}" style="${!ev.ativo?'opacity:.35;pointer-events:none':''}"><div class="stock-toggle"><button class="stock-btn ${ev.modo==='inf'?'active':''}" onclick="setModo('${p.id}','inf')">∞</button><button class="stock-btn ${ev.modo==='qtd'?'active':''}" onclick="setModo('${p.id}','qtd')">Qtd</button></div><div id="inp-${p.id}" style="display:${ev.modo==='qtd'?'block':'none'}"><input class="stock-input" type="number" min="0" max="999" value="${ev.qtd}" onchange="setQtd('${p.id}',this.value)" onclick="event.stopPropagation()"></div>${renderEstoqueBadge(p.id)}</div></div>`;}).join('');}
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

// ── TOAST ──────────────────────────────────────────────────────
let toastT;
function showToast(msg,cls='tok-ok'){const el=document.getElementById('toast');el.textContent=msg;el.className=`toast show ${cls}`;clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),3000);}

// ── INICIALIZAÇÃO ──────────────────────────────────────────────
function iniciarApp(){
  renderAll();

  // Carrega config do Firestore
  db.collection('config').doc('operacao').get().then(doc=>{
    if(!doc.exists) return;
    const cfg=doc.data();
    document.getElementById('cfg-loja').checked=cfg.lojaAberta!==false;
    document.getElementById('cfg-delivery').checked=cfg.deliveryAtivo!==false;
    document.getElementById('cfg-retirada').checked=cfg.retiradaAtiva!==false;
    document.getElementById('cfg-print').checked=cfg.autoImprimir!==false;
    autoAceitar=!!cfg.autoAceitar;
    atualizarBotaoAuto();
    atualizarBadgeLoja();
  }).catch(console.error);

  // Listener em tempo real para pedidos ativos
  db.collection('pedidos')
    .where('status','in',['novo','prep','pronto','entrega'])
    .onSnapshot(snapshot=>{
      snapshot.docChanges().forEach(change=>{
        const data=change.doc.data();
        const p={...data,_id:change.doc.id,hora:data.hora?data.hora.toDate():new Date()};
        if(change.type==='added'){
          if(!pedidos.find(x=>x._id===p._id)){
            pedidos.push(p);totalHoje++;
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
    },err=>{
      console.warn('Firebase não configurado — modo offline');
      setInterval(()=>{
        const salvos=JSON.parse(localStorage.getItem('tcho_pedidos')||'[]');
        salvos.forEach(p=>{
          if(!pedidos.find(x=>x.id===p.id)){
            pedidos.push({...p,_id:'local-'+p.id,hora:new Date(p.hora),status:p.status||'novo',impresso:false});
            totalHoje++;
            showToast(`🔔 Novo pedido #${p.id} — ${p.nome}`,'tok-info');
            atualizarBadgeNovos();
          }
        });
        renderAll();
      },5000);
    });

  // Listener em tempo real para cupons
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
