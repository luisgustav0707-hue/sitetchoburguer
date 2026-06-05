// ── DADOS (lidos de shared/dados.js via window.TCHO) ───────────
const BURGUERS    = TCHO.burguers;

// Fotos dos hambúrgueres — nome do arquivo deve ser igual ao nome do hambúrguer
const FOTOS = {
  'xb':   '../hamburgueres/X-Burguer.jpg',
  'xs':   '../hamburgueres/X-Salada.jpg',
  'xba':  '../hamburgueres/X-Bacon.jpg',
  'xp':   '../hamburgueres/X-Picles%20Burguer.jpg',
  'xt':   '../hamburgueres/X-Tropical.jpg',
  'xbd':  '../hamburgueres/X-Bacon%20Duplo.jpg',
  'xrj':  '../hamburgueres/X-Romeu%20%26%20Julieta.jpg',
  'xrjd': '../hamburgueres/X-Romeu%20%26%20Julieta%20Duplo.jpg',
  'xbt':  '../hamburgueres/X-Bacon%20Triplo.jpg',
};
const EXTRAS      = TCHO.extras.filter(e => e.id !== 'cmb');
const COMBO       = TCHO.extras.filter(e => e.id === 'cmb');
const ADICIONAIS  = TCHO.adicionais;
const PONTOS      = TCHO.pontos;
const SACHES      = TCHO.saches;
const BAIRROS_TAXA = TCHO.bairros;

// Cupons locais de fallback — em produção carregados do Firestore via admin
const CUPONS_ATIVOS = [
  {codigo:'TCHO10',     tipo:'pct',  valor:10, minimo:30, descricao:'10% de desconto acima de R$30!'},
  {codigo:'FRETEGRATIS',tipo:'frete',valor:0,  minimo:50, descricao:'Frete grátis acima de R$50'},
  {codigo:'BEMVINDO',   tipo:'fixo', valor:5,  minimo:0,  descricao:'R$5 de desconto no primeiro pedido!'},
];

// ── STATE ──────────────────────────────────────────────────────
let cartBurguers={},cartExtras={},tipoPedido=null,pagamento=null,freteAtual=0,bairroAtendido=false;
let cupomAtual=null,descontoAtual=0;
let orderCounter=Math.floor(Math.random()*100)+1;
let modalId=null,pontoAtual=null,sacheAtual=null,removidosAtual=[],adicionaisAtual={};

// ── LOJA ABERTA/FECHADA + CONFIG ──────────────────────────────
let prazoEntrega = { min: 30, max: 45 };

function atualizarPrazoBadge(){
  const el = document.getElementById('prazo-texto');
  if(el) el.textContent = `${prazoEntrega.min}–${prazoEntrega.max} min`;
}

function verificarLoja(){
  db.collection('config').doc('operacao').onSnapshot(doc => {
    const data = doc.exists ? doc.data() : {};
    const lojaAberta = data.lojaAberta !== false;
    document.getElementById('loja-fechada').classList.toggle('show', !lojaAberta);
    if(data.prazoMin) prazoEntrega.min = data.prazoMin;
    if(data.prazoMax) prazoEntrega.max = data.prazoMax;
    atualizarPrazoBadge();
  }, () => {
    const lojaAberta = localStorage.getItem('tcho_loja_aberta') !== 'false';
    if(!lojaAberta) document.getElementById('loja-fechada').classList.add('show');
  });
}

// ── RENDER CARDÁPIO ────────────────────────────────────────────
function renderBurguers(){
  document.getElementById('menu-burguers').innerHTML=BURGUERS.map(b=>{
    const insts=cartBurguers[b.id]||[],qty=insts.length;
    const resumo=insts.map((inst,i)=>{
      const pts=[inst.ponto?`${inst.ponto.emoji} ${inst.ponto.nome}`:'',inst.sache?`🧴 ${inst.sache.nome}`:'',inst.removidos.length?'sem '+inst.removidos.join(', '):'',inst.adicionais.length?'+ '+inst.adicionais.map(a=>a.nome).join(', '):''].filter(Boolean).join(' • ');
      return`<div class="cart-item-resumo"><span>#${i+1} ${pts||'padrão'}</span><span class="rm" onclick="remInst('${b.id}',${i})">✕</span></div>`;
    }).join('');
    const foto = FOTOS[b.id];
    return`<div class="menu-item ${qty>0?'has-items':''}" id="mi-${b.id}">
      ${foto
        ? `<div class="item-foto"><img src="${foto}" alt="${b.nome}" loading="lazy"></div>`
        : `<div class="item-emoji">${b.emoji}</div>`
      }
      <div class="item-body">
        <div class="item-name">${b.nome}${b.tag?`<span class="tag">${b.tag}</span>`:''}</div>
        <div class="item-desc">${b.desc}</div>
        <div class="item-price">R$${b.preco}</div>
        ${qty>0?`<div class="cart-itens-list">${resumo}</div>`:''}
      </div>
      <div class="item-controls">
        <button class="qty-btn" onclick="abrirModal('${b.id}')">+</button>
        <div class="qty-display">${qty}</div>
        <button class="qty-btn ${qty===0?'dim':''}" onclick="${qty>0?`remUlt('${b.id}')`:'void(0)'}">−</button>
      </div>
    </div>`;
  }).join('');
}

function renderExtras(){
  const render=(arr,id)=>{document.getElementById(id).innerHTML=arr.map(e=>{const q=cartExtras[e.id]||0;return`<div class="extra-item ${q>0?'has-items':''}"><div class="extra-emoji">${e.emoji}</div><div class="extra-body"><div class="extra-name">${e.nome}</div>${e.desc?`<div class="extra-sub">${e.desc}</div>`:''}<div class="extra-price">R$${e.preco}</div></div><div class="extra-controls"><button class="eq-btn ${q===0?'dim':''}" onclick="${q>0?`chgExtra('${e.id}',-1)`:'void(0)'}">−</button><div class="eq-disp">${q}</div><button class="eq-btn" onclick="chgExtra('${e.id}',1)">+</button></div></div>`;}).join('');};
  render(EXTRAS,'menu-extras');
  render(COMBO,'menu-combo');
}

function chgExtra(id,d){cartExtras[id]=Math.max(0,(cartExtras[id]||0)+d);renderExtras();updateFloat();}

// ── MODAL PERSONALIZAÇÃO ───────────────────────────────────────
function abrirModal(id){
  const b=BURGUERS.find(x=>x.id===id);
  modalId=id;pontoAtual=null;sacheAtual=null;removidosAtual=[];adicionaisAtual={};
  document.getElementById('modal-box').innerHTML=`
    <div class="modal-header"><div><div class="modal-title">${b.emoji} ${b.nome}</div><div class="modal-price">R$${b.preco}</div></div><button class="modal-close" onclick="fecharModal()">✕</button></div>
    <div class="modal-body">
      <div class="person-section"><div class="person-label">🥩 Ponto da carne <span class="req">* obrigatório</span></div>
        <div class="ponto-options">${PONTOS.map(p=>`<div class="ponto-btn" id="pnt-${p.id}" onclick="selPonto('${p.id}')"><span class="p-icon">${p.emoji}</span><span class="p-name">${p.nome}</span></div>`).join('')}</div>
        <div id="err-ponto" class="err-msg">⚠ Selecione o ponto da carne</div></div>
      <div class="modal-sep"></div>
      <div class="person-section"><div class="person-label">🧴 Sachê <span class="req">* obrigatório</span></div>
        <div class="sache-options">${SACHES.map(s=>`<div class="sache-btn" id="sch-${s.id}" onclick="selSache('${s.id}')"><span class="s-icon">${s.emoji}</span><span class="s-name">${s.nome}</span><span class="s-badge">grátis</span></div>`).join('')}</div>
        <div id="err-sache" class="err-msg">⚠ Selecione sua preferência de sachê</div></div>
      <div class="modal-sep"></div>
      <div class="person-section"><div class="person-label">➖ Retirar ingredientes <span class="opt-lbl">(opcional)</span></div>
        <div class="ing-grid">${b.ing.map(i=>`<div class="ing-btn" id="ing-${i.replace(/[\s&]/g,'_')}" onclick="togIng('${i}')">${i}</div>`).join('')}</div></div>
      <div class="modal-sep"></div>
      <div class="person-section"><div class="person-label">➕ Acréscimos <span class="opt-lbl">(opcional)</span></div>
        <div class="adic-grid">${ADICIONAIS.map(a=>`<div class="adic-item" id="adi-${a.id}" onclick="togAdic('${a.id}',${a.preco},'${a.nome}')"><span class="adic-name">${a.nome}</span><span class="adic-price">+R$${a.preco}</span></div>`).join('')}</div></div>
    </div>
    <div class="modal-footer"><div id="adic-total" style="font-size:.76rem;color:var(--muted)"></div><button class="btn-primary" style="margin:0;max-width:200px;padding:10px" onclick="confirmarModal()">✓ ADICIONAR</button></div>`;
  document.getElementById('modal-overlay').style.display='flex';
  document.body.style.overflow='hidden';
}

function selPonto(id){pontoAtual=PONTOS.find(p=>p.id===id);document.querySelectorAll('.ponto-btn').forEach(e=>e.classList.remove('sel'));document.getElementById('pnt-'+id).classList.add('sel');document.getElementById('err-ponto').style.display='none';}
function selSache(id){sacheAtual=SACHES.find(s=>s.id===id);document.querySelectorAll('.sache-btn').forEach(e=>e.classList.remove('sel'));document.getElementById('sch-'+id).classList.add('sel');document.getElementById('err-sache').style.display='none';}
function togIng(ing){const idx=removidosAtual.indexOf(ing);if(idx>-1)removidosAtual.splice(idx,1);else removidosAtual.push(ing);document.getElementById('ing-'+ing.replace(/[\s&]/g,'_')).classList.toggle('removido',removidosAtual.includes(ing));}
function togAdic(id,preco,nome){if(adicionaisAtual[id])delete adicionaisAtual[id];else adicionaisAtual[id]={preco,nome};document.getElementById('adi-'+id).classList.toggle('sel',!!adicionaisAtual[id]);const t=Object.values(adicionaisAtual).reduce((a,x)=>a+x.preco,0);document.getElementById('adic-total').textContent=t>0?`Acréscimos: +R$${t}`:'';}

function confirmarModal(){
  let ok=true;
  if(!pontoAtual){document.getElementById('err-ponto').style.display='block';ok=false;}
  if(!sacheAtual){document.getElementById('err-sache').style.display='block';ok=false;}
  if(!ok)return;
  const precoExtra=Object.values(adicionaisAtual).reduce((a,x)=>a+x.preco,0);
  if(!cartBurguers[modalId])cartBurguers[modalId]=[];
  cartBurguers[modalId].push({ponto:pontoAtual,sache:sacheAtual,removidos:[...removidosAtual],adicionais:Object.values(adicionaisAtual),precoExtra});
  fecharModal();renderBurguers();updateFloat();
}

function fecharModal(){document.getElementById('modal-overlay').style.display='none';document.body.style.overflow='';}
function remInst(id,idx){cartBurguers[id].splice(idx,1);if(!cartBurguers[id].length)delete cartBurguers[id];renderBurguers();updateFloat();}
function remUlt(id){if(!cartBurguers[id]||!cartBurguers[id].length)return;cartBurguers[id].pop();if(!cartBurguers[id].length)delete cartBurguers[id];renderBurguers();updateFloat();}

// ── CARRINHO ───────────────────────────────────────────────────
function getSubtotal(){let t=0;Object.entries(cartBurguers).forEach(([id,insts])=>{const b=BURGUERS.find(x=>x.id===id);if(b)insts.forEach(i=>t+=b.preco+i.precoExtra);});[...EXTRAS,...COMBO].forEach(e=>{if(cartExtras[e.id])t+=e.preco*cartExtras[e.id];});return t;}

function getTotal(){
  let sub=getSubtotal(),frete=tipoPedido==='delivery'?freteAtual:0,desc=0;
  if(cupomAtual){
    if(cupomAtual.tipo==='pct')desc=Math.round(sub*cupomAtual.valor/100);
    else if(cupomAtual.tipo==='fixo')desc=cupomAtual.valor;
    else if(cupomAtual.tipo==='frete')frete=0;
  }
  descontoAtual=desc;
  return sub+frete-desc;
}

function getCount(){return Object.values(cartBurguers).reduce((a,arr)=>a+arr.length,0)+Object.values(cartExtras).reduce((a,b)=>a+b,0);}
function updateFloat(){const c=getCount();document.getElementById('cartCount').textContent=c;document.getElementById('cartTotal').textContent=`R$${getSubtotal()}`;document.getElementById('cartFloat').classList.toggle('visible',c>0&&document.getElementById('sc1').classList.contains('active'));}

// ── CUPOM ──────────────────────────────────────────────────────
function aplicarCupom(){
  const code=document.getElementById('f-cupom').value.trim().toUpperCase();
  const msg=document.getElementById('cupom-msg');
  if(!code){msg.style.color='#e74c3c';msg.textContent='Digite o código do cupom';return;}
  const cupom=CUPONS_ATIVOS.find(c=>c.codigo===code);
  if(!cupom){msg.style.color='#e74c3c';msg.textContent='❌ Cupom inválido ou expirado';return;}
  const sub=getSubtotal();
  if(cupom.minimo>0&&sub<cupom.minimo){msg.style.color='#e74c3c';msg.textContent=`❌ Pedido mínimo de R$${cupom.minimo} para este cupom`;return;}
  cupomAtual=cupom;
  document.getElementById('cupom-tag').textContent=cupom.codigo;
  document.getElementById('cupom-desc-text').textContent=cupom.descricao;
  document.getElementById('cupom-aplicado').classList.add('show');
  document.getElementById('f-cupom').value='';
  msg.style.color='#27ae60';msg.textContent='✅ Cupom aplicado com sucesso!';
}
function removerCupom(){cupomAtual=null;descontoAtual=0;document.getElementById('cupom-aplicado').classList.remove('show');document.getElementById('cupom-msg').textContent='';}

// ── TIPO DE PEDIDO E PAGAMENTO ─────────────────────────────────
function selectTipo(t){
  tipoPedido=t;
  document.getElementById('t-ret').classList.toggle('selected',t==='retirada');
  document.getElementById('t-del').classList.toggle('selected',t==='delivery');
  document.getElementById('form-delivery').style.display=t==='delivery'?'block':'none';
  document.getElementById('err-tipo').style.display='none';
  if(t==='retirada'){bairroAtendido=true;freteAtual=0;}else bairroAtendido=false;
}
function selectPag(p){
  pagamento=p;
  ['pix','din','car'].forEach(x=>document.getElementById('p-'+x).classList.toggle('selected',x===p.substring(0,3)));
  document.getElementById('pix-info').classList.toggle('visible',p==='pix');
  document.getElementById('troco-box').style.display=p==='dinheiro'?'block':'none';
  document.getElementById('err-pag').style.display='none';
}

// ── CEP ────────────────────────────────────────────────────────
function mascaraCep(inp){let v=inp.value.replace(/\D/g,'');if(v.length>5)v=v.slice(0,5)+'-'+v.slice(5,8);inp.value=v;if(v.replace('-','').length===8)buscarCep();}
function mascaraTel(inp){let v=inp.value.replace(/\D/g,'');if(v.length<=2)v=v.replace(/^(\d{0,2})/,'($1');else if(v.length<=7)v=v.replace(/^(\d{2})(\d{0,5})/,'($1) $2');else v=v.replace(/^(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3');inp.value=v;}

async function buscarCep(){
  const cep=document.getElementById('f-cep').value.replace(/\D/g,'');
  if(cep.length!==8)return;
  const msg=document.getElementById('cep-msg');
  msg.className='cep-msg load';msg.textContent='🔍 Buscando endereço...';
  document.getElementById('f-cep').className='loading';
  document.getElementById('aviso-bairro').classList.remove('show');
  document.getElementById('campos-endereco').style.display='none';
  bairroAtendido=false;
  try{
    const r=await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d=await r.json();
    if(d.erro){msg.className='cep-msg err';msg.textContent='❌ CEP não encontrado.';document.getElementById('f-cep').className='';return;}
    const bv=d.bairro||'';
    const enc=BAIRROS_TAXA.find(b=>b.nome.toLowerCase().trim()===bv.toLowerCase().trim()||bv.toLowerCase().includes(b.nome.toLowerCase())||b.nome.toLowerCase().includes(bv.toLowerCase()));
    if(!enc){
      msg.className='cep-msg err';msg.textContent=`❌ Bairro "${bv}" não atendido para delivery.`;
      document.getElementById('f-cep').className='';
      document.getElementById('bairro-nao-atendido').textContent=bv||'encontrado';
      document.getElementById('aviso-bairro').classList.add('show');
      bairroAtendido=false;freteAtual=0;
      renderListaBairros();
    }else{
      msg.className='cep-msg ok';msg.textContent=`✅ Entregamos em ${enc.nome}!`;
      document.getElementById('f-cep').className='ok';
      document.getElementById('aviso-bairro').classList.remove('show');
      document.getElementById('bairros-lista').classList.remove('show');
      document.getElementById('f-rua').value=d.logradouro||'';
      document.getElementById('f-bairro').value=enc.nome;
      document.getElementById('f-cidade').value=`${d.localidade} / ${d.uf}`;
      document.getElementById('campos-endereco').style.display='block';
      document.getElementById('bairro-nome-ok').textContent=enc.nome;
      document.getElementById('frete-val').textContent=`R$${enc.taxa}`;
      freteAtual=enc.taxa;bairroAtendido=true;
      document.getElementById('f-num').focus();
    }
  }catch(e){msg.className='cep-msg err';msg.textContent='❌ Erro ao buscar CEP.';document.getElementById('f-cep').className='';}
}

function renderListaBairros(){const s=[...BAIRROS_TAXA].sort((a,b)=>a.nome.localeCompare(b.nome));document.getElementById('bairros-grid').innerHTML=s.map(b=>`<div class="bairro-chip"><span>${b.nome}</span><span class="bairro-taxa">R$${b.taxa}</span></div>`).join('');}
function toggleListaBairros(){const el=document.getElementById('bairros-lista');if(!el.classList.contains('show')){renderListaBairros();el.classList.add('show');}else el.classList.remove('show');}

// ── NAVEGAÇÃO ENTRE TELAS ──────────────────────────────────────
function goStep(n){
  if(n>1&&getCount()===0){alert('Adicione pelo menos um item!');return;}
  [1,2,3,4].forEach(i=>document.getElementById('sc'+i).classList.toggle('active',i===n));
  ['s1','s2','s3'].forEach((id,i)=>{document.getElementById(id).classList.toggle('active',i+1===n);document.getElementById(id).classList.toggle('done',i+1<n);});
  document.getElementById('cartFloat').classList.toggle('visible',n===1&&getCount()>0);
  window.scrollTo(0,0);
}

function irResumo(){
  if(!document.getElementById('f-nome').value.trim()){alert('Digite seu nome!');return;}
  if(document.getElementById('f-tel').value.replace(/\D/g,'').length<10){alert('Digite seu telefone!');return;}
  if(!tipoPedido){document.getElementById('err-tipo').style.display='block';window.scrollTo(0,200);return;}
  if(tipoPedido==='delivery'){
    if(!bairroAtendido){document.getElementById('aviso-bairro').classList.add('show');alert('Não entregamos nesse bairro. Escolha retirada ou informe um CEP atendido.');return;}
    if(!document.getElementById('f-num').value.trim()){alert('Digite o número do endereço!');return;}
  }
  if(!pagamento){document.getElementById('err-pag').style.display='block';return;}
  renderResumo();goStep(3);
}

// ── RESUMO DO PEDIDO ───────────────────────────────────────────
function renderResumo(){
  let html='';
  Object.entries(cartBurguers).forEach(([id,insts])=>{
    const b=BURGUERS.find(x=>x.id===id);if(!b)return;
    insts.forEach(inst=>{
      html+=`<div class="resumo-linha"><span>${b.emoji} ${b.nome}</span><span>R$${b.preco+inst.precoExtra}</span></div>`;
      const det=[inst.ponto?`🥩 ${inst.ponto.emoji} ${inst.ponto.nome}`:'',inst.sache?`🧴 ${inst.sache.emoji} ${inst.sache.nome}`:'',inst.removidos.length?`➖ sem ${inst.removidos.join(', ')}`:'',inst.adicionais.length?`➕ ${inst.adicionais.map(a=>a.nome).join(', ')}`:''].filter(Boolean);
      if(det.length)html+=`<div class="resumo-sub">${det.join(' • ')}</div>`;
    });
  });
  [...EXTRAS,...COMBO].forEach(e=>{if((cartExtras[e.id]||0)>0)html+=`<div class="resumo-linha"><span>${e.emoji} ${e.nome} x${cartExtras[e.id]}</span><span>R$${e.preco*cartExtras[e.id]}</span></div>`;});
  html+=`<div class="divider"></div>`;
  const nome=document.getElementById('f-nome').value,tel=document.getElementById('f-tel').value;
  html+=`<div class="resumo-linha"><span>👤 ${nome}</span><span>📞 ${tel}</span></div>`;
  const sub=getSubtotal(),frete=tipoPedido==='delivery'?freteAtual:0;
  if(tipoPedido==='delivery'){
    const rua=document.getElementById('f-rua').value,num=document.getElementById('f-num').value,comp=document.getElementById('f-comp').value,bairro=document.getElementById('f-bairro').value,cidade=document.getElementById('f-cidade').value;
    html+=`<div class="resumo-linha"><span>🛵 Delivery — ${bairro}</span><span>+R$${frete}</span></div>`;
    if(rua) html+=`<div class="resumo-sub">📍 ${rua}, ${num}${comp?', '+comp:''} — ${bairro} — ${cidade}</div>`;
  }else{html+=`<div class="resumo-linha"><span>🏃 Retirada no local</span><span>Grátis</span></div>`;}
  const pLabel={pix:'PIX',dinheiro:'Dinheiro',cartao:'Cartão na entrega'};
  html+=`<div class="resumo-linha"><span>💳 ${pLabel[pagamento]}</span></div>`;
  getTotal();
  let freteReal=frete;
  if(cupomAtual&&cupomAtual.tipo==='frete')freteReal=0;
  if(cupomAtual){
    if(descontoAtual>0)html+=`<div class="desconto-linha"><span>🎟️ Cupom ${cupomAtual.codigo}</span><span>−R$${descontoAtual}</span></div>`;
    else if(cupomAtual.tipo==='frete')html+=`<div class="desconto-linha"><span>🎟️ Frete grátis (${cupomAtual.codigo})</span><span>−R$${frete}</span></div>`;
  }
  const obs=document.getElementById('f-obs').value;
  if(obs)html+=`<div class="resumo-linha" style="flex-direction:column;gap:2px"><span style="color:var(--muted);font-size:.7rem">📝 OBS</span><span style="font-size:.78rem">${obs}</span></div>`;
  const total=sub+freteReal-descontoAtual;
  document.getElementById('resumo-content').innerHTML=html+`<div class="resumo-total"><span>TOTAL</span><span>R$${Math.max(0,total)}</span></div>`;
}

// ── FINALIZAR PEDIDO (salva no Firestore) ──────────────────────
async function finalizarPedido(){
  let numOrdem;
  try {
    const contRef = db.collection('config').doc('contador');
    numOrdem = await db.runTransaction(async t => {
      const d = await t.get(contRef);
      const next = (d.exists ? d.data().ultimo : 0) + 1;
      t.set(contRef, {ultimo: next}, {merge: true});
      return next;
    });
  } catch(e) {
    numOrdem = Math.floor(Math.random()*900)+100;
  }

  const num=String(numOrdem).padStart(3,'0');
  document.getElementById('order-num').textContent=`#${num}`;
  document.getElementById('success-msg').textContent=tipoPedido==='delivery'
    ?'Pedido recebido! Em breve nosso entregador sairá. 🛵'
    :'Pedido em preparo! Venha retirar em breve. 🍔';

  const pedido={
    id:numOrdem, num:`#${num}`,
    nome:document.getElementById('f-nome').value,
    tel:document.getElementById('f-tel').value,
    tipo:tipoPedido,
    bairro:tipoPedido==='delivery'?document.getElementById('f-bairro').value:'',
    endereco:tipoPedido==='delivery'?`${document.getElementById('f-rua').value}, ${document.getElementById('f-num').value}${document.getElementById('f-comp').value?', '+document.getElementById('f-comp').value:''}`:'' ,
    cidade:tipoPedido==='delivery'?document.getElementById('f-cidade').value:'',
    pag:pagamento,
    frete:tipoPedido==='delivery'?freteAtual:0,
    desconto:descontoAtual,
    cupom:cupomAtual?.codigo||'',
    obs:document.getElementById('f-obs').value,
    itens:montarItensTexto(),
    total:Math.max(0,getTotal()),
    status:'novo',
    hora:firebase.firestore.FieldValue.serverTimestamp(),
    horaStr:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    impresso:false,
    criadoEm:firebase.firestore.FieldValue.serverTimestamp(),
  };

  // Salva sempre no localStorage (permite admin local sem Firebase)
  const pedidoLocal = {...pedido, hora: new Date().toISOString()};
  const listaPedidos = JSON.parse(localStorage.getItem('tcho_pedidos')||'[]');
  if(!listaPedidos.find(s=>s.id===pedidoLocal.id)){
    listaPedidos.push(pedidoLocal);
    localStorage.setItem('tcho_pedidos', JSON.stringify(listaPedidos));
  }
  // Notifica admin instantaneamente via BroadcastChannel (quando em HTTP)
  try { new BroadcastChannel('tcho_pedidos').postMessage(pedidoLocal); } catch(e){}
  // Também envia ao Firestore quando configurado
  db.collection('pedidos').add(pedido).catch(()=>{});

  [1,2,3].forEach(i=>document.getElementById('sc'+i).classList.remove('active'));
  document.getElementById('sc4').classList.add('active');
  document.getElementById('cartFloat').classList.remove('visible');
  window.scrollTo(0,0);
}

function montarItensTexto(){
  const lista=[];
  Object.entries(cartBurguers).forEach(([id,insts])=>{
    const b=BURGUERS.find(x=>x.id===id);if(!b)return;
    insts.forEach((inst,i)=>{
      const det=[inst.ponto?inst.ponto.nome:'',inst.sache&&inst.sache.id!=='sn'?'sachê '+inst.sache.nome:'',inst.removidos.length?'sem '+inst.removidos.join(', '):'',inst.adicionais.length?inst.adicionais.map(a=>'+'+a.nome).join(', '):''].filter(Boolean).join(' • ');
      lista.push(`${b.nome}${det?' ('+det+')':''} — R$${b.preco+inst.precoExtra}`);
    });
  });
  [...EXTRAS,...COMBO].forEach(e=>{if((cartExtras[e.id]||0)>0)lista.push(`${e.nome} x${cartExtras[e.id]} — R$${e.preco*cartExtras[e.id]}`);});
  return lista;
}

function novoPedido(){
  cartBurguers={};cartExtras={};tipoPedido=null;pagamento=null;freteAtual=0;bairroAtendido=false;cupomAtual=null;descontoAtual=0;
  renderBurguers();renderExtras();goStep(1);
}

// ── INICIALIZAÇÃO ──────────────────────────────────────────────
verificarLoja();
renderBurguers();
renderExtras();
