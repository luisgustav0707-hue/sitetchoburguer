// ── LOGIN ──────────────────────────────────────────────────────
const CREDENCIAIS = { usuario:'tcho', senha:'Lgferreir@07' };

function fazerLogin(){
  const u=document.getElementById('login-user').value.trim();
  const p=document.getElementById('login-pass').value;
  if(u===CREDENCIAIS.usuario && p===CREDENCIAIS.senha){
    localStorage.setItem('tcho_admin_logado','true');
    document.getElementById('login-screen').style.display='none';
    document.getElementById('app').classList.add('show');
    iniciarApp();
  } else {
    document.getElementById('login-err').textContent='Usuário ou senha incorretos';
    document.getElementById('login-pass').value='';
  }
}
// Mostra/oculta a senha digitada (botão 👁️ na tela de login)
function toggleSenha(){
  const inp=document.getElementById('login-pass');
  const btn=document.getElementById('btn-ver-senha');
  const mostrar = inp.type==='password';
  inp.type = mostrar ? 'text' : 'password';
  if(btn){ btn.textContent = mostrar ? '🙈' : '👁️'; btn.title = mostrar ? 'Ocultar senha' : 'Mostrar senha'; }
  inp.focus();
}
function logout(){
  // Remove o flag de login e cancela listeners antes de recarregar
  localStorage.removeItem('tcho_admin_logado');
  if(unsubPedidos){ unsubPedidos(); unsubPedidos=null; }
  if(unsubConfig){ unsubConfig(); unsubConfig=null; }
  if(pollingLocalInterval){ clearInterval(pollingLocalInterval); pollingLocalInterval=null; }
  // Recarrega a página: garante estado 100% limpo e código mais novo (volta pro login)
  location.reload();
}
// Auto-login se já estava logado antes.
// IMPORTANTE: iniciarApp() é adiado com setTimeout porque este bloco roda no
// topo do arquivo, antes das variáveis `let pedidos`, `unsubPedidos`, etc.
// (declaradas mais abaixo) existirem. Chamar direto dava
// "Cannot access 'pedidos' before initialization", o listener nunca ligava e o
// painel ficava sem receber pedidos até deslogar/logar de novo manualmente.
if(localStorage.getItem('tcho_admin_logado')==='true'){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').classList.add('show');
  setTimeout(iniciarApp, 0);   // roda só depois do arquivo terminar de carregar
}

// ── NAVEGAÇÃO ──────────────────────────────────────────────────
function showPage(p){
  document.querySelectorAll('.nav-tab').forEach((el,i)=>el.classList.toggle('active',['cozinha','salao','pedidos','config','crm','cardapio','financeiro'][i]===p));
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  if(p==='salao')     renderSalao();
  if(p==='cardapio')  renderCardapio();
  if(p==='pedidos')   carregarLog();
  if(p==='config')    showConfig(cfgAtual);   // Config agora tem menu lateral (Geral + Marketing)
  if(p==='crm')       carregarCRM();
  if(p==='financeiro') carregarFinanceiro();
}

// ── Config com menu lateral: troca o painel visível e carrega o que ele precisa ──
let cfgAtual='operacao';
function showConfig(k){
  cfgAtual=k;
  document.querySelectorAll('#page-config .cfg-side-item').forEach(b=>b.classList.toggle('active',b.dataset.cfg===k));
  document.querySelectorAll('#page-config .cfg-panel').forEach(p=>p.classList.remove('active'));
  // Itens que juntam mais de uma seção num painel só
  const CFG_MERGED={ operacao:['cfg-operacao','cfg-horario'], entrega:['cfg-prazo','cfg-bairros'] };
  if(CFG_MERGED[k]){
    CFG_MERGED[k].forEach(id=>{const el=document.getElementById(id); if(el) el.classList.add('active');});
    if(k==='operacao') carregarHorarios();
    if(k==='entrega'){ renderBairros(); carregarConfigEntrega(); }
  } else {
    const pg=document.getElementById('cfg-'+k)||document.getElementById('inner-'+k);
    if(pg) pg.classList.add('active');
  }
  // Cada painel carrega seus dados só quando aberto
  if(k==='acessos'){ carregarAcessos(); iniciarPresencaAdmin(); }
  if(k==='nfce')        carregarConfigFiscal();
  if(k==='kanban')      carregarKanbanCfg();
}

// ── ACESSOS DO SITE (analytics simples no Firestore) ───────────
let presencaTimer=null;
// Data local de hoje em YYYY-MM-DD. NÃO usar toISOString(): ele dá a data em
// UTC, que à noite no Brasil (UTC-3) já virou o dia seguinte — isso fazia o
// pedido manual cair como "data passada" (ia pro caixa em vez do kanban) e
// bagunçava os filtros de data.
function dataLocalHoje(d=new Date()){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function carregarAcessos(){
  db.collection('stats').doc('visitas').get().then(doc=>{
    const d=doc.exists?doc.data():{};
    const dias=d.dias||{};
    const hojeK=dataLocalHoje();
    const mesK=hojeK.slice(0,7);
    const ini7=new Date(); ini7.setHours(0,0,0,0); ini7.setDate(ini7.getDate()-6);
    let hoje=0,semana=0,mes=0;
    Object.entries(dias).forEach(([k,v])=>{
      v=Number(v)||0;
      if(k===hojeK) hoje+=v;
      const dt=new Date(k+'T12:00:00');
      if(!isNaN(dt)&&dt>=ini7) semana+=v;
      if(k.startsWith(mesK)) mes+=v;
    });
    const set=(id,val)=>{const el=document.getElementById(id); if(el) el.textContent=val;};
    set('ac-hoje',hoje); set('ac-semana',semana); set('ac-mes',mes); set('ac-total',d.total||0);
  }).catch(()=>{});
}
function iniciarPresencaAdmin(){
  if(presencaTimer) return;
  // Leitura periódica em vez de onSnapshot: o onSnapshot relia a coleção
  // inteira a cada heartbeat de cada visitante, o que estourava a cota do
  // Firestore. Aqui lemos uma vez por minuto e só com a aba em primeiro plano.
  const ler=()=>{
    if(document.hidden) return;
    db.collection('presenca').get().then(snap=>{
      const agora=Date.now(); let online=0;
      snap.forEach(doc=>{
        const ls=doc.data().lastSeen&&doc.data().lastSeen.toDate?doc.data().lastSeen.toDate():null;
        const idade=ls?(agora-ls.getTime()):9e9;
        if(idade<120000) online++;                             // ativo nos últimos ~2min (heartbeat de 90s)
        else if(idade>600000) doc.ref.delete().catch(()=>{});  // limpa presença abandonada (>10min)
      });
      const el=document.getElementById('ac-online'); if(el) el.textContent=online;
    }).catch(()=>{});
  };
  ler();
  presencaTimer=setInterval(ler, 60000);
}
function showInner(t){
  document.querySelectorAll('.inner-tab').forEach((el,i)=>el.classList.toggle('active',['cupons','fidelidade','recuperacao'][i]===t));
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
// Agendamento de funcionamento (dias + horários), configurável no Config.
let cfgHorarios=null;
function getHorarios(){
  if(cfgHorarios) return cfgHorarios;
  try{ const s=JSON.parse(localStorage.getItem('tcho_horarios')||'null'); if(s) return s; }catch(e){}
  return horarioPadrao();   // definido em shared/crm.js
}
function lojaAbertaAgora(){ return estaAbertaAgora(getHorarios()); }

function proximoEvento(){
  const nomes=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const h=getHorarios();
  if(lojaAbertaAgora()) return '🟢 Aberta agora';
  if(!h.dias||!h.dias.length) return '🔴 Fechada';
  const agora=new Date(),dia=agora.getDay(),min=agora.getHours()*60+agora.getMinutes();
  let abreMin=null;
  if(h.p1&&h.p1.abre){ const [a,b]=h.p1.abre.split(':').map(Number); abreMin=a*60+(b||0); }
  for(let i=0;i<=7;i++){
    const prox=(dia+i)%7;
    if(!h.dias.includes(prox)) continue;
    if(i===0 && abreMin!=null && min>=abreMin) continue;   // hoje já passou do horário de abrir
    const label = i===0?'hoje' : i===1?'amanhã' : nomes[prox];
    return `🔴 Fechada — abre ${label} às ${(h.p1&&h.p1.abre)||'--'}`;
  }
  return '🔴 Fechada';
}

// ── UI de dias e horários ──
const DIAS_SEMANA=[{d:0,l:'Dom'},{d:1,l:'Seg'},{d:2,l:'Ter'},{d:3,l:'Qua'},{d:4,l:'Qui'},{d:5,l:'Sex'},{d:6,l:'Sáb'}];
let horDiasSel=[];
function renderDiasHorario(){
  const el=document.getElementById('hor-dias'); if(!el) return;
  el.innerHTML=DIAS_SEMANA.map(x=>{
    const on=horDiasSel.includes(x.d);
    return `<button type="button" onclick="toggleDiaHorario(${x.d})" style="padding:6px 11px;border-radius:20px;border:1px solid ${on?'var(--orange)':'#3a3530'};background:${on?'var(--orange)':'var(--card)'};color:${on?'#000':'var(--cream)'};font-size:.72rem;font-weight:700;cursor:pointer">${x.l}</button>`;
  }).join('');
}
function toggleDiaHorario(d){
  horDiasSel = horDiasSel.includes(d) ? horDiasSel.filter(x=>x!==d) : [...horDiasSel,d];
  renderDiasHorario();
}
function toggleDoisPeriodos(){
  const on=document.getElementById('hor-dois')?.checked;
  const w=document.getElementById('hor-p2-wrap'); if(w) w.style.display=on?'flex':'none';
}
function carregarHorarios(){
  const h=getHorarios();
  horDiasSel=Array.isArray(h.dias)?[...h.dias]:[];
  renderDiasHorario();
  const set=(id,v)=>{const e=document.getElementById(id); if(e) e.value=v||'';};
  set('hor-p1-abre',h.p1&&h.p1.abre); set('hor-p1-fecha',h.p1&&h.p1.fecha);
  const dois=document.getElementById('hor-dois'); if(dois) dois.checked=!!h.doisPeriodos;
  set('hor-p2-abre',h.p2&&h.p2.abre); set('hor-p2-fecha',h.p2&&h.p2.fecha);
  toggleDoisPeriodos();
}
function salvarHorarios(){
  if(!horDiasSel.length){ showToast('⚠️ Marque pelo menos um dia','tok-err'); return; }
  const p1={abre:document.getElementById('hor-p1-abre').value,fecha:document.getElementById('hor-p1-fecha').value};
  if(!p1.abre||!p1.fecha){ showToast('⚠️ Defina o horário do período 1','tok-err'); return; }
  const dois=document.getElementById('hor-dois').checked;
  const p2={abre:document.getElementById('hor-p2-abre').value,fecha:document.getElementById('hor-p2-fecha').value};
  if(dois && (!p2.abre||!p2.fecha)){ showToast('⚠️ Defina o horário do período 2','tok-err'); return; }
  const horarios={dias:[...horDiasSel].sort((a,b)=>a-b),p1,doisPeriodos:dois,p2:dois?p2:{abre:'',fecha:''}};
  cfgHorarios=horarios;
  localStorage.setItem('tcho_horarios',JSON.stringify(horarios));
  db.collection('config').doc('operacao').set({horarios},{merge:true}).catch(console.error);
  atualizarStatusAutoHorario();
  showToast('✅ Dias e horários salvos!','tok-ok');
}

function atualizarStatusAutoHorario(){
  const el=document.getElementById('auto-horario-status');
  if(!el)return;
  const auto=document.getElementById('cfg-auto-horario')?.checked;
  const forcar=document.getElementById('cfg-forcar-aberta')?.checked;
  const lojaRow=document.getElementById('cfg-loja-row');
  if(forcar){
    el.style.color='#27ae60';
    el.textContent='⚡ Loja aberta forçadamente — clique novamente para voltar ao automático';
  } else if(auto){
    el.style.color=lojaAbertaAgora()?'#27ae60':'#e74c3c';
    el.textContent=proximoEvento()+' (automático)';
  } else {
    el.style.color='var(--muted)';
    el.textContent='⚙️ Controle manual ativo — use o toggle "Loja aberta" abaixo';
  }
  if(lojaRow) lojaRow.style.opacity=(auto&&!forcar)?'0.4':'1';
}

// Toggle "Loja aberta": ao fechar manualmente, desliga "forçar aberta" pra não conflitar
function onToggleLojaConfig(){
  if(!document.getElementById('cfg-loja').checked){
    const f=document.getElementById('cfg-forcar-aberta');
    if(f) f.checked=false;
  }
  salvarConfig();
}

function salvarConfig(){
  atualizarBadgeLoja();
  atualizarStatusAutoHorario();
  const cfg={
    lojaAberta:document.getElementById('cfg-loja').checked,
    deliveryAtivo:document.getElementById('cfg-delivery').checked,
    retiradaAtiva:document.getElementById('cfg-retirada').checked,
    mesaAtiva:document.getElementById('cfg-mesa')?.checked||false,
    autoAceitar:autoAceitar,
    autoImprimir:document.getElementById('cfg-print').checked,
    prazoMin:parseInt(document.getElementById('cfg-prazo-min').value)||30,
    prazoMax:parseInt(document.getElementById('cfg-prazo-max').value)||45,
    autoHorario:document.getElementById('cfg-auto-horario')?.checked!==false,
    forcarAberta:document.getElementById('cfg-forcar-aberta')?.checked||false,
  };
  db.collection('config').doc('operacao').set(cfg,{merge:true}).catch(console.error);
  aplicarModalidades();
  showToast('✅ Configuração salva!','tok-ok');
}

// Mostra/esconde a aba Salão conforme a modalidade "Mesa" estiver ligada.
function aplicarModalidades(){
  const mesaOn = document.getElementById('cfg-mesa') ? document.getElementById('cfg-mesa').checked : false;
  const tab=document.getElementById('nav-salao'); if(tab) tab.style.display = mesaOn ? '' : 'none';
}
// Placeholder da aba Salão (conteúdo real vem na Fase 2).
function renderSalao(){}

// ── CONFIG FISCAL (NFC-e) ──────────────────────────────────────
// Guarda os dados que o contador fornecer. A emissão em si vem depois
// (backend + gateway fiscal) — ver PLANO-NFCE.md.
const FISC_CAMPOS=['ativo','ambiente','razao','fantasia','cnpj','ie','regime','cnae','logr','num','bairro','cep','municipio','uf','csc','csc-id','serie','proximo','gateway','gw-token','ncm','cfop','csosn','origem'];
function salvarConfigFiscal(){
  const fisc={};
  FISC_CAMPOS.forEach(c=>{
    const el=document.getElementById('fisc-'+c);
    if(!el) return;
    fisc[c] = el.type==='checkbox' ? el.checked : el.value;
  });
  localStorage.setItem('tcho_fiscal', JSON.stringify(fisc));
  db.collection('config').doc('fiscal').set(fisc,{merge:true}).catch(console.error);
  showToast('✅ Dados fiscais salvos!','tok-ok');
}
function preencherConfigFiscal(fisc){
  if(!fisc) return;
  FISC_CAMPOS.forEach(c=>{
    const el=document.getElementById('fisc-'+c);
    if(!el || fisc[c]===undefined) return;
    if(el.type==='checkbox') el.checked=!!fisc[c]; else el.value=fisc[c];
  });
}
function carregarConfigFiscal(){
  // localStorage primeiro (instantâneo), depois Firestore (fonte de verdade)
  try{ preencherConfigFiscal(JSON.parse(localStorage.getItem('tcho_fiscal')||'null')); }catch(e){}
  db.collection('config').doc('fiscal').get().then(doc=>{
    if(doc.exists){ const d=doc.data(); localStorage.setItem('tcho_fiscal',JSON.stringify(d)); preencherConfigFiscal(d); }
  }).catch(()=>{});
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
    [[987, 0, 0.18], [1318, 0.22, 0.18], [987, 0.44, 0.18], [1318, 0.66, 0.28]].forEach(([freq, delay, dur]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.75, ctx.currentTime + delay);
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
let pedidos=[],pedidosFinHoje=[],totalHoje=0,contPed=100,autoAceitar=false,dragId=null,dragSrc=null;
let unsubPedidos=null,unsubConfig=null,pollingLocalInterval=null;
let primeiroSnapshotPedidos=true,reconnectPedidosTimer=null,handlersConexaoRegistrados=false;

function carregarFinalizadosHoje(){
  const ini=new Date();ini.setHours(0,0,0,0);
  const ts=firebase.firestore.Timestamp.fromDate(ini);
  db.collection('pedidos')
    .where('status','in',['finalizado','cancelado'])
    .where('criadoEm','>=',ts)
    .get()
    .then(snap=>{
      snap.forEach(doc=>{
        const d=doc.data();
        const p={...d,_id:doc.id,hora:d.hora?d.hora.toDate():new Date()};
        if(!pedidosFinHoje.find(x=>x._id===p._id)) pedidosFinHoje.push(p);
      });
      totalHoje+=pedidosFinHoje.length;
      renderAll();
    })
    .catch(()=>{});
}
function canDrop(from,to){const c=statusCols();const fi=c.indexOf(from),ti=c.indexOf(to);return fi!==-1&&ti!==-1&&(ti===fi+1||ti===fi-1);}

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

// ── PEDIDO MANUAL (lançado pelo balcão/telefone) ──────────────
let manualPag='pix', manualTipo='delivery';
let manualItens=[];       // [{nome, preco}] — lista que soma sozinha
let manualCustProd=null;  // produto sendo personalizado no painel

function abrirModalManual(){
  manualPag='pix'; manualTipo='delivery';
  manualItens=[];
  cancelarCustManual();
  ['man-nome','man-tel','man-frete','man-obs'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  renderItensManual();
  // Popula o select de bairros (sempre, pra refletir edições) a partir da lista atual
  const sel=document.getElementById('man-bairro');
  if(sel){
    sel.innerHTML=getBairrosAdmin().slice().sort((a,b)=>a.nome.localeCompare(b.nome))
      .map(b=>`<option value="${b.nome}">${b.nome} — R$${b.taxa}</option>`).join('');
  }
  // Data do pedido: começa com hoje
  const dataEl=document.getElementById('man-data');
  if(dataEl){ dataEl.value=dataLocalHoje(); }
  onManualDataChange();
  selManualPag('pix');
  selManualTipo('delivery');
  document.getElementById('modal-manual').style.display='flex';
}
function fecharModalManual(){ document.getElementById('modal-manual').style.display='none'; }

// Avisa quando a data escolhida é de um dia passado (entra como finalizado, no caixa daquele dia)
function onManualDataChange(){
  const av=document.getElementById('man-data-aviso');
  if(!av) return;
  const v=document.getElementById('man-data').value;
  const hoje=dataLocalHoje();
  if(v && v<hoje){
    av.innerHTML='⏪ Data passada: será lançado como <b>finalizado</b> no caixa desse dia (não vai pro kanban nem imprime).';
    av.style.color='#f39c12';
  } else {
    av.textContent='Hoje — segue o fluxo normal (vai pro kanban).';
    av.style.color='var(--muted)';
  }
}

function selManualTipo(tipo){
  manualTipo=tipo;
  document.getElementById('man-tipo-del').classList.toggle('sel',tipo==='delivery');
  document.getElementById('man-tipo-ret').classList.toggle('sel',tipo==='retirada');
  document.getElementById('man-bairro-wrap').style.display=tipo==='delivery'?'block':'none';
  document.getElementById('man-frete-wrap').style.display=tipo==='delivery'?'block':'none';
  if(tipo==='retirada'){ document.getElementById('man-frete').value=0; }
  else { onManualBairro(); }
  recalcManualTotal();
}
function selManualPag(pag){
  manualPag=pag;
  ['pix','dinheiro','cartao'].forEach(k=>document.getElementById('mpag-'+k).classList.toggle('sel',k===pag));
}
function onManualBairro(){
  const nome=document.getElementById('man-bairro').value;
  const b=getBairrosAdmin().find(x=>x.nome===nome);
  if(b) document.getElementById('man-frete').value=b.taxa;
  recalcManualTotal();
}
function subtotalManual(){ return manualItens.reduce((a,it)=>a+(parseFloat(it.preco)||0),0); }
function recalcManualTotal(){
  const subtotal=subtotalManual();
  const frete=manualTipo==='delivery'?(parseFloat(document.getElementById('man-frete').value)||0):0;
  document.getElementById('man-subtotal-disp').textContent='R$'+subtotal;
  document.getElementById('man-total-disp').textContent='R$'+(subtotal+frete);
}

// ── Itens do pedido manual: lista com soma automática (reaproveita listaProdutosEdit) ──
function renderItensManual(){
  const lista=document.getElementById('man-itens-lista');
  lista.innerHTML=manualItens.map((it,i)=>`
    <div style="display:flex;gap:6px;align-items:center">
      <input class="edit-inp" style="flex:1;font-size:.74rem;padding:7px 9px" value="${(it.nome||'').replace(/"/g,'&quot;')}" onchange="updManualNome(${i},this.value)">
      <span style="color:var(--muted);font-size:.7rem">R$</span>
      <input class="edit-inp" type="number" min="0" step="1" style="width:66px;font-size:.74rem;padding:7px 6px" value="${it.preco||0}" oninput="updManualPreco(${i},this.value)">
      <button type="button" onclick="removerItemManual(${i})" title="Remover" style="background:#3a1010;color:#e74c3c;border:none;border-radius:6px;width:30px;height:32px;cursor:pointer;flex:0 0 auto">✕</button>
    </div>`).join('') || '<div style="font-size:.7rem;color:var(--muted)">Nenhum item — escolha um produto abaixo</div>';
  const sel=document.getElementById('man-add-prod');
  if(sel && !sel.options.length){
    sel.innerHTML='<option value="">+ Adicionar produto...</option>'+
      listaProdutosManual().map((p,i)=>`<option value="${i}">${p.nome} — R$${p.preco}</option>`).join('');
  }
  recalcManualTotal();
}

// Lista rica de produtos p/ o pedido manual (mantém cat/id/opcoes, ao contrário
// de listaProdutosEdit que só tem nome/preço) — necessária p/ saber se abre a
// personalização (hambúrguer) ou o seletor de sabor (bebida/combo).
function listaProdutosManual(){
  const base=PRODS.map(p=>({nome:p.n,preco:p.p,cat:p.cat,id:p.id,opcoes:p.opcoes||null}));
  const cust=getProdsCustom().map(p=>({nome:p.n||p.nome,preco:(p.p!==undefined?p.p:p.preco),cat:'x',id:null,opcoes:null}));
  return [...base,...cust];
}

function addItemManual(){
  const sel=document.getElementById('man-add-prod');
  const idx=parseInt(sel.value);
  if(isNaN(idx)) return;
  const prod=listaProdutosManual()[idx];
  if(!prod) return;
  sel.value='';
  // Hambúrguer ou item com sabor → abre personalização (igual ao cliente).
  // Demais (batata, água) → adiciona direto.
  if(prod.cat==='b' || (prod.opcoes && prod.opcoes.length)){
    const ing = prod.cat==='b' ? (TCHO.burguers.find(b=>b.id===prod.id)?.ing || []) : [];
    abrirCustManual(prod, ing);
  } else {
    manualItens.push({nome:prod.nome, preco:prod.preco});
    renderItensManual();
  }
}

// Painel de personalização do item (ponto, sachê, tirar ingrediente, adicionais, sabor)
function abrirCustManual(prod, ing){
  manualCustProd={...prod, ing:ing||[]};
  const el=document.getElementById('man-cust'); if(!el) return;
  const isB = prod.cat==='b';
  const esc=s=>String(s).replace(/"/g,'&quot;');
  let h=`<div style="font-weight:700;color:var(--orange);font-size:.8rem;margin-bottom:8px">${prod.nome} — R$${prod.preco}</div>`;
  if(prod.opcoes && prod.opcoes.length){
    h+=`<label class="edit-lbl">🥤 Sabor</label><select id="mc-opcao" class="edit-inp" style="font-size:.74rem;margin:4px 0 8px">${prod.opcoes.map(o=>`<option>${o}</option>`).join('')}</select>`;
  }
  if(isB){
    h+=`<label class="edit-lbl">🔥 Ponto</label><select id="mc-ponto" class="edit-inp" style="font-size:.74rem;margin:4px 0 8px">${TCHO.pontos.map(p=>`<option>${p.nome}</option>`).join('')}</select>`;
    h+=`<label class="edit-lbl">🥫 Sachê</label><select id="mc-sache" class="edit-inp" style="font-size:.74rem;margin:4px 0 8px">${TCHO.saches.map(s=>`<option>${s.nome}</option>`).join('')}</select>`;
    if((ing||[]).length){
      h+=`<label class="edit-lbl">➖ Tirar ingrediente</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 8px">${ing.map(i=>`<label style="font-size:.72rem;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" class="mc-rem" value="${esc(i)}"> ${i}</label>`).join('')}</div>`;
    }
    const adic=getAdicionaisAdmin();
    if(adic.length){
      h+=`<label class="edit-lbl">➕ Adicionais</label><div style="display:flex;flex-direction:column;gap:4px;margin:4px 0 8px">${adic.map(a=>`<label style="font-size:.72rem;display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" class="mc-adic" value="${esc(a.nome)}" data-preco="${a.preco}" onchange="recalcCustManual()"> ${a.nome} <span style="color:var(--muted)">+R$${a.preco}</span></label>`).join('')}</div>`;
    }
  }
  h+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
      <span style="font-size:.72rem;color:var(--muted)">Item: <b id="mc-preco" style="color:var(--text)">R$${prod.preco}</b></span>
      <div style="display:flex;gap:6px">
        <button type="button" onclick="cancelarCustManual()" style="padding:6px 10px;background:var(--surface);color:var(--muted);border:1px solid #3a3530;border-radius:6px;font-size:.72rem;cursor:pointer">Cancelar</button>
        <button type="button" onclick="confirmarCustManual()" style="padding:6px 12px;background:var(--orange);color:#000;border:none;border-radius:6px;font-weight:700;font-size:.72rem;cursor:pointer">✓ Adicionar item</button>
      </div>
    </div>`;
  el.innerHTML=h; el.style.display='block';
}

function recalcCustManual(){
  if(!manualCustProd) return;
  let preco=manualCustProd.preco;
  document.querySelectorAll('#man-cust .mc-adic:checked').forEach(c=>preco+=parseFloat(c.dataset.preco)||0);
  const el=document.getElementById('mc-preco'); if(el) el.textContent='R$'+preco;
}

function confirmarCustManual(){
  if(!manualCustProd) return;
  const p=manualCustProd;
  let preco=p.preco;
  const det=[];
  const opc=document.getElementById('mc-opcao'); if(opc && opc.value) det.push(opc.value);
  const pt=document.getElementById('mc-ponto'); if(pt && pt.value) det.push(pt.value);
  const sc=document.getElementById('mc-sache'); if(sc && sc.value && sc.value!=='Não quero') det.push('sachê '+sc.value);
  const rem=[...document.querySelectorAll('#man-cust .mc-rem:checked')].map(c=>c.value);
  if(rem.length) det.push('sem '+rem.join(', '));
  const adic=[...document.querySelectorAll('#man-cust .mc-adic:checked')];
  adic.forEach(c=>preco+=parseFloat(c.dataset.preco)||0);
  if(adic.length) det.push(adic.map(c=>'+'+c.value).join(', '));
  const nome=det.length ? `${p.nome} (${det.join(' • ')})` : p.nome;
  manualItens.push({nome, preco});
  cancelarCustManual();
  renderItensManual();
}

function cancelarCustManual(){
  manualCustProd=null;
  const el=document.getElementById('man-cust'); if(el){ el.style.display='none'; el.innerHTML=''; }
}
function removerItemManual(i){ manualItens.splice(i,1); renderItensManual(); }
function updManualNome(i,v){ if(manualItens[i]) manualItens[i].nome=v; }
function updManualPreco(i,v){ if(manualItens[i]){ manualItens[i].preco=parseFloat(v)||0; recalcManualTotal(); } }

async function salvarPedidoManual(){
  const nome=document.getElementById('man-nome').value.trim();
  if(!nome){ showToast('⚠️ Informe o nome do cliente','tok-err'); return; }
  if(!manualItens.length){ showToast('⚠️ Adicione pelo menos um item','tok-err'); return; }
  // Converte a lista em texto (igual aos pedidos do cliente): "Nome — R$preco" ou só o nome se for grátis
  const itens=manualItens
    .filter(it=>(it.nome||'').trim())
    .map(it=>(parseFloat(it.preco)||0)>0 ? `${it.nome.trim()} — R$${parseFloat(it.preco)}` : it.nome.trim());

  const tel=document.getElementById('man-tel').value.trim();
  const obs=document.getElementById('man-obs').value.trim();
  const subtotal=subtotalManual();
  const frete=manualTipo==='delivery'?(parseFloat(document.getElementById('man-frete').value)||0):0;
  const total=subtotal+frete;                              // total inclui o frete (igual aos pedidos do cliente)
  const bairro=manualTipo==='delivery'?document.getElementById('man-bairro').value:'';

  // ── Data do pedido ──
  // Hoje  → status 'novo' com data/hora atual (fluxo normal: kanban + impressão).
  // Passado → status 'finalizado' na data escolhida (registro histórico: entra no
  //           caixa daquele dia, sem ir pro kanban nem imprimir).
  const dataStr=document.getElementById('man-data').value;
  const hojeStr=dataLocalHoje();
  const agora=new Date();
  let dataPedido, statusPedido;
  if(dataStr && dataStr<hojeStr){
    const [y,mo,da]=dataStr.split('-').map(Number);
    dataPedido=new Date(y,mo-1,da,agora.getHours(),agora.getMinutes());  // data escolhida, hora atual
    statusPedido='finalizado';
  } else {
    dataPedido=agora;
    statusPedido='novo';
  }
  const tsPedido=firebase.firestore.Timestamp.fromDate(dataPedido);

  // Número sequencial: usa o mesmo contador dos pedidos do cliente
  let numOrdem;
  try{
    const contRef=db.collection('config').doc('contador');
    numOrdem=await db.runTransaction(async t=>{
      const d=await t.get(contRef);
      const next=(d.exists?d.data().ultimo:0)+1;
      t.set(contRef,{ultimo:next},{merge:true});
      return next;
    });
  }catch(e){ numOrdem=++contPed; }

  const pedido={
    id:numOrdem, num:`#${String(numOrdem).padStart(3,'0')}`,
    tipo:manualTipo, nome, tel, bairro,
    pag:manualPag, frete, total, desconto:0, cupom:'',
    obs, itens, status:statusPedido, origem:'manual',
    hora:tsPedido,
    horaStr:dataPedido.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    impresso:statusPedido==='finalizado',                  // passado não imprime
    criadoEm:tsPedido,
  };

  fecharModalManual();
  const msg = statusPedido==='finalizado'
    ? `✅ Pedido ${pedido.num} lançado em ${dataPedido.toLocaleDateString('pt-BR')} (finalizado)`
    : `✅ Pedido ${pedido.num} adicionado — ${nome}`;
  try{ upsertCliente(pedido); }catch(e){}                   // CRM: cadastra/atualiza o cliente
  try{
    await db.collection('pedidos').add(pedido);            // o listener cuida de render/notificação/impressão (só p/ 'novo')
    showToast(msg,'tok-ok');
  }catch(e){
    const p={...pedido,_id:'man-'+numOrdem,hora:dataPedido};
    if(statusPedido==='novo'){
      pedidos.push(p);totalHoje++;
      atualizarBadgeNovos();
      if(autoAceitar)setTimeout(()=>moverStatus(p._id,'prep',true),600);
      else renderAll();
    }
    showToast(msg,'tok-ok');
  }
}

// ── IMPRESSÃO ──────────────────────────────────────────────────
const CSS_CUPOM = `*{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:10px;max-width:280px}.c{text-align:center}.b{font-weight:bold}.line{border-top:1px dashed #000;margin:7px 0}.row{display:flex;justify-content:space-between;margin:3px 0}.big{font-size:18px;font-weight:bold}.obs-box{border:2px solid #000;padding:5px 6px;margin:5px 0;font-weight:800;font-size:15px;text-align:center}@media print{@page{margin:3mm;size:80mm auto}}`;

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
    <div class="c b" style="font-size:16px">— COZINHA —</div>
    <div class="c" style="font-size:13px">TCHO BURGUER</div>
    <div class="line"></div>
    <div class="row"><span class="big">${p.num||'#'+p.id}</span><span>${p.horaStr||''}</span></div>
    <div class="row"><span class="b">${p.tipo==='delivery'?'🛵 DELIVERY':'🏃 RETIRADA'}</span><span>${p.nome}</span></div>
    <div class="line"></div>
    ${p.itens.map(i=>`<div style="margin:3px 0">• ${i}</div>`).join('')}
    ${obsBloco}
    <script>window.onload=function(){window.print();setTimeout(()=>window.close(),1500)};<\/script>
  </body></html>`;
}

// Monta o endereço completo do cliente em texto
function enderecoCompleto(p){
  return [p.endereco, p.bairro, p.cidade].filter(Boolean).join(', ');
}
// Link do Google Maps com o endereço do cliente
function mapsUrl(p){
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(enderecoCompleto(p));
}

function cupomEntrega(p){
  const logoUrl = new URL('../logo/logo.png', window.location.href).href;
  const obsBloco = p.obs
    ? `<div class="line"></div><div class="obs-box">⚠ OBS: ${p.obs.toUpperCase()} ⚠</div>`
    : '';
  // QR code que abre o Google Maps no endereço do cliente (para o motoboy)
  const endTxt = enderecoCompleto(p);
  const qrBloco = (p.tipo==='delivery' && endTxt) ? `
    <div class="line"></div>
    <div class="c b" style="font-size:12px;margin-bottom:4px">🛵 ROTA — escaneie no Maps</div>
    <div class="c"><img src="https://api.qrserver.com/v1/create-qr-code/?size=170x170&qzone=1&data=${encodeURIComponent(mapsUrl(p))}" alt="QR Google Maps" style="width:160px;height:160px"></div>
    <div class="c" style="font-size:11px">${endTxt}</div>` : '';
  const enderecoBloco = p.tipo==='delivery' ? `
    <div class="line"></div>
    ${p.endereco ? `<div style="margin:2px 0">End: ${p.endereco}</div>` : ''}
    ${p.bairro   ? `<div class="row"><span>Bairro:</span><span>${p.bairro}</span></div>` : ''}
    ${p.cidade   ? `<div style="margin:2px 0;font-size:12px">${p.cidade}</div>` : ''}
    <div class="row"><span>Frete:</span><span>R$${p.frete||0}</span></div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS_CUPOM}</style></head><body>
    <div class="c"><img src="${logoUrl}" style="max-width:160px;max-height:70px;margin-bottom:4px"></div>
    <div class="c" style="font-size:12px">Qui–Dom 19h–23h | (31) 98309-4152</div>
    <div class="line"></div>
    <div class="row"><span class="big">${p.num||'#'+p.id}</span><span>${p.horaStr||''}</span></div>
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
    <div class="row big"><span>TOTAL:</span><span>R$${p.total}</span></div>
    ${qrBloco}
    <div class="c b" style="margin-top:8px">Obrigado! 😋</div>
    <script>window.onload=function(){window.print();setTimeout(()=>window.close(),1500)};<\/script>
  </body></html>`;
}

function imprimirPedido(p){
  if(!document.getElementById('cfg-print').checked)return;
  fetch('http://localhost:3333/imprimir',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({cozinha:cupomCozinha(p), entrega:cupomEntrega(p)})
  }).then(r=>r.json()).then(d=>{
    if(d.ok)showToast(`🖨️ Pedido ${p.num||'#'+p.id} impresso!`,'tok-ok');
    else showToast(`⚠️ Erro ao imprimir: ${d.erro}`,'tok-err');
  }).catch(()=>{
    showToast('🖨️ Abrindo cupons...','tok-info');
    abrirJanelaImpressao(cupomCozinha(p), 380);
    setTimeout(()=>abrirJanelaImpressao(cupomEntrega(p), 420), 600);
  });
  p.impresso=true;
  // Persiste "impresso" no Firestore para não reimprimir após recarregar a página
  if(p._id && !/^(local|man|sim)-/.test(String(p._id)))
    db.collection('pedidos').doc(p._id).update({impresso:true}).catch(()=>{});
  renderAll();
}

// Reimpressão manual do cupom (botão em qualquer etapa). Sempre imprime —
// ignora o "auto-imprimir" — porque é uma ação explícita do operador.
function reimprimirPedido(id){
  const p=acharPedido(id);
  if(!p){ showToast('Pedido não encontrado','tok-err'); return; }
  fetch('http://localhost:3333/imprimir',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({cozinha:cupomCozinha(p), entrega:cupomEntrega(p)})
  }).then(r=>r.json()).then(d=>{
    if(d.ok)showToast(`🖨️ Pedido ${p.num||'#'+p.id} impresso!`,'tok-ok');
    else showToast(`⚠️ Erro ao imprimir: ${d.erro}`,'tok-err');
  }).catch(()=>{
    showToast('🖨️ Abrindo cupons...','tok-info');
    abrirJanelaImpressao(cupomCozinha(p), 380);
    setTimeout(()=>abrirJanelaImpressao(cupomEntrega(p), 420), 600);
  });
}

// ── MOVER STATUS / CANCELAR ────────────────────────────────────
function moverStatus(id,novoStatus,auto=false){
  const p=pedidos.find(x=>x._id===id);if(!p)return;
  const horaStr=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const update={status:novoStatus,horaStr,hora:firebase.firestore.FieldValue.serverTimestamp()};
  if(novoStatus==='finalizado') update.horaFim=horaStr;
  const statusAnterior=p.status;
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
  // Só imprime ao aceitar se ainda NÃO foi impresso (evita 2ª via ao mover pra preparando)
  if(novoStatus==='prep' && statusAnterior==='novo' && !auto && !p.impresso) setTimeout(()=>imprimirPedido(p),200);
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
  db.collection('pedidos').doc(id).update({status:'cancelado'}).catch(console.error);
  pedidos=pedidos.filter(x=>x._id!==id);
  totalHoje=Math.max(0,totalHoje-1);
  renderAll();renderHistorico();
}
function excluirPedido(id){
  const p=acharPedido(id);
  const ref=p?(p.num||('#'+p.id)):'';
  if(!confirm(`Excluir permanentemente o pedido ${ref}?\n\nEssa ação apaga o pedido de vez e não pode ser desfeita.`))return;
  db.collection('pedidos').doc(id).delete().then(()=>showToast('🗑️ Pedido excluído','tok-info')).catch(console.error);
  const eraDeHoje=pedidos.some(x=>x._id===id)||pedidosFinHoje.some(x=>x._id===id);
  if(eraDeHoje) totalHoje=Math.max(0,totalHoje-1);
  pedidos=pedidos.filter(x=>x._id!==id);
  pedidosFinHoje=pedidosFinHoje.filter(x=>x._id!==id);
  logPedidos=logPedidos.filter(x=>x._id!==id);
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

// Horário em que o cliente FEZ o pedido (usa criadoEm, que não muda ao trocar
// de status — ao contrário de hora/horaStr, que são atualizados a cada etapa).
function horaPedido(p){
  let d=null;
  if(p.criadoEm){
    if(typeof p.criadoEm.toDate==='function') d=p.criadoEm.toDate();
    else { const x=new Date(p.criadoEm); if(!isNaN(x)) d=x; }
  }
  if(!d && p.hora) d=(p.hora instanceof Date)?p.hora:new Date(p.hora);
  return (d && !isNaN(d)) ? d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : (p.horaStr||'--:--');
}

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
  else{btns=`<button class="btn-k bk-final" onclick="moverStatus('${fid}','finalizado')">FINALIZAR ✓</button>`;}  // etapa customizada
  const nextLabel={novo:'Em preparo →',prep:'Pronto →',pronto:p.tipo==='delivery'?'Entrega →':'',entrega:''}[p.status];
  const dragHint=nextLabel?`<div class="drag-hint">↔ Arraste para ${nextLabel}</div>`:'';
  return`<div class="card" id="card-${fid}" draggable="true" ondragstart="onDragStart(event,'${fid}','${p.status}')" ondragend="onDragEnd()">
    <div class="card-hdr"><span class="card-num">${p.num||('#'+p.id)}${pb}</span>${tipoEl}</div>
    <div class="card-cli">${p.nome}${p.bairro?` · ${p.bairro}`:''}</div>
    <div class="card-itens">${p.itens.join(' · ')}</div>
    ${p.obs?`<div class="card-obs">⚠ ${p.obs}</div>`:''}
    <div class="card-ftr"><div class="card-total">R$${p.total}</div><div style="display:flex;align-items:center;gap:8px"><span style="font-size:.68rem;color:var(--muted)" title="Horário do pedido">🕐 ${horaPedido(p)}</span><div class="timer ${cls}">⏱ ${tt(m)}</div></div></div>
    <div class="card-btns">${btns}<button class="btn-editar-card" onclick="reimprimirPedido('${fid}')" title="Imprimir cupom">🖨️</button><button class="btn-editar-card" onclick="abrirModalEditar('${fid}')" title="Editar pedido">✏️</button><button class="btn-editar-card" onclick="excluirPedido('${fid}')" title="Excluir pedido" style="color:#e74c3c">🗑️</button></div>
    ${dragHint}
  </div>`;
}

// ── EDITAR PEDIDO ──────────────────────────────────────────────
let editandoPedidoId = null;
let editandoPag = null;

// Acha o pedido em qualquer lista (ativos, finalizados de hoje ou log)
function acharPedido(id){
  return pedidos.find(x=>x._id===id)
      || pedidosFinHoje.find(x=>x._id===id)
      || logPedidos.find(x=>x._id===id)
      || null;
}

let editItens = [];      // [{nome, preco}]
let editDesconto = 0;

function abrirModalEditar(id){
  const p=acharPedido(id);
  if(!p) return;
  editandoPedidoId=id;
  editandoPag=p.pag||'pix';
  editDesconto=p.desconto||0;
  document.getElementById('edit-num').textContent=p.num||'#'+p.id;
  document.getElementById('edit-nome').value=p.nome||'';
  document.getElementById('edit-tel').value=p.tel||'';
  document.getElementById('edit-frete').value=p.frete||0;
  document.getElementById('edit-desconto').value=editDesconto||0;
  document.getElementById('edit-obs').value=p.obs||'';
  // Endereço (entrega)
  document.getElementById('edit-endereco').value=p.endereco||'';
  document.getElementById('edit-bairro').value=p.bairro||'';
  document.getElementById('edit-cidade').value=p.cidade||'';
  document.getElementById('edit-endereco-bloco').style.display = p.tipo==='delivery' ? 'block' : 'none';
  // Itens (parseados pra permitir soma automática)
  editItens=(p.itens||[]).map(parseItemTexto);
  renderItensEdit();
  selEditPag(editandoPag);
  document.getElementById('modal-editar').style.display='flex';
}

// Extrai {nome, preco} de um texto tipo "X-Bacon (ao ponto) — R$30"
function parseItemTexto(s){
  const m=String(s).match(/—\s*R\$\s*([\d.,]+)\s*$/);
  if(m) return {nome:s.slice(0,m.index).trim(), preco:parseFloat(m[1].replace(',','.'))||0};
  return {nome:String(s).trim(), preco:0};
}

// Lista de produtos do cardápio (base + custom) para o seletor
function listaProdutosEdit(){
  const base=PRODS.map(p=>({nome:p.n,preco:p.p}));
  const cust=getProdsCustom().map(p=>({nome:p.n||p.nome,preco:p.p!==undefined?p.p:p.preco}));
  return [...base,...cust];
}

function renderItensEdit(){
  const lista=document.getElementById('edit-itens-lista');
  lista.innerHTML=editItens.map((it,i)=>`
    <div style="display:flex;gap:6px;align-items:center">
      <input class="edit-inp" style="flex:1;font-size:.74rem;padding:7px 9px" value="${(it.nome||'').replace(/"/g,'&quot;')}" onchange="updItemNome(${i},this.value)">
      <span style="color:var(--muted);font-size:.7rem">R$</span>
      <input class="edit-inp" type="number" min="0" step="1" style="width:66px;font-size:.74rem;padding:7px 6px" value="${it.preco||0}" oninput="updItemPreco(${i},this.value)">
      <button type="button" onclick="removerItemEdit(${i})" title="Remover" style="background:#3a1010;color:#e74c3c;border:none;border-radius:6px;width:30px;height:32px;cursor:pointer;flex:0 0 auto">✕</button>
    </div>`).join('') || '<div style="font-size:.7rem;color:var(--muted)">Nenhum item — adicione abaixo</div>';
  const sel=document.getElementById('edit-add-prod');
  if(sel && !sel.options.length){
    sel.innerHTML='<option value="">+ Adicionar produto...</option>'+
      listaProdutosEdit().map((p,i)=>`<option value="${i}">${p.nome} — R$${p.preco}</option>`).join('');
  }
  recalcEditTotal();
}

function addItemEdit(){
  const sel=document.getElementById('edit-add-prod');
  const idx=parseInt(sel.value);
  if(isNaN(idx)) return;
  const prod=listaProdutosEdit()[idx];
  if(!prod) return;
  editItens.push({nome:prod.nome, preco:prod.preco});
  sel.value='';
  renderItensEdit();
}
function removerItemEdit(i){ editItens.splice(i,1); renderItensEdit(); }
function updItemNome(i,v){ if(editItens[i]) editItens[i].nome=v; }
function updItemPreco(i,v){ if(editItens[i]){ editItens[i].preco=parseFloat(v)||0; recalcEditTotal(); } }

function selEditPag(pag){
  editandoPag=pag;
  ['pix','dinheiro','cartao'].forEach(k=>{
    document.getElementById('epag-'+k).classList.toggle('sel',k===pag);
  });
}

function onEditDescontoChange(){
  editDesconto=parseFloat(document.getElementById('edit-desconto').value)||0;
  recalcEditTotal();
}

function recalcEditTotal(){
  const subtotal=editItens.reduce((a,it)=>a+(parseFloat(it.preco)||0),0);
  const frete=parseFloat(document.getElementById('edit-frete').value)||0;
  const total=Math.max(0, subtotal+frete-(editDesconto||0));
  document.getElementById('edit-total').value=total;
}

function fecharModalEditar(){
  document.getElementById('modal-editar').style.display='none';
  editandoPedidoId=null;editandoPag=null;editItens=[];editDesconto=0;
}

function salvarEdicaoPedido(imprimir=false){
  const idPedido=editandoPedidoId;
  const p=acharPedido(idPedido);
  if(!p) return;
  const nome=document.getElementById('edit-nome').value.trim();
  const tel=document.getElementById('edit-tel').value.trim();
  const frete=parseFloat(document.getElementById('edit-frete').value)||0;
  const obs=document.getElementById('edit-obs').value.trim();
  const endereco=document.getElementById('edit-endereco').value.trim();
  const bairro=document.getElementById('edit-bairro').value.trim();
  const cidade=document.getElementById('edit-cidade').value.trim();
  // Itens -> volta pro formato texto "nome — R$preco"
  const itens=editItens.filter(it=>(it.nome||'').trim())
      .map(it=>(it.preco>0?`${it.nome.trim()} — R$${it.preco}`:it.nome.trim()));
  if(!nome){showToast('⚠️ Nome obrigatório','tok-err');return;}
  if(!itens.length){showToast('⚠️ Adicione pelo menos um item','tok-err');return;}
  const desconto=parseFloat(document.getElementById('edit-desconto').value)||0;
  const subtotal=editItens.reduce((a,it)=>a+(parseFloat(it.preco)||0),0);
  const total=Math.max(0, subtotal+frete-desconto);
  const update={nome,tel,pag:editandoPag,frete,desconto,total,obs,itens,endereco,bairro,cidade};
  // Atualiza em todas as listas onde o pedido apareça (ativos, finalizados, log)
  [pedidos,pedidosFinHoje,logPedidos].forEach(arr=>{const it=arr.find(x=>x._id===editandoPedidoId);if(it)Object.assign(it,update);});
  // Persiste no Firestore
  db.collection('pedidos').doc(editandoPedidoId).update(update).catch(console.error);
  fecharModalEditar();
  renderAll();renderHistorico();
  showToast(`✅ Pedido ${p.num||'#'+p.id} atualizado!`,'tok-ok');
  // Imprime o cupom já com as alterações (botão "Salvar + Imprimir")
  if(imprimir) setTimeout(()=>reimprimirPedido(idPedido), 150);
}

// ── CONFIG DO KANBAN: etapas (colunas) editáveis + personalizadas ──────
// Etapas base (não podem ser removidas — só renomeadas/desligadas):
const KB_BASE=[
  {id:'novo',   e:'🔴', t:'Novos'},
  {id:'prep',   e:'🟡', t:'Em preparo'},
  {id:'pronto', e:'🟢', t:'Prontos'},
  {id:'entrega',e:'🔵', t:'Entrega'},
];
const KB_VAZIO={novo:'Aguardando pedidos...',prep:'Nada em preparo',pronto:'Nenhum pronto',entrega:'Nenhuma entrega'};
function getKanbanStages(){
  let s=null; try{ s=JSON.parse(localStorage.getItem('tcho_kanban_stages')||'null'); }catch(e){}
  if(Array.isArray(s)&&s.length){
    const out=s.map(x=>({id:x.id,e:x.e||'⬜',t:x.t||x.id,on:x.on!==false,base:KB_BASE.some(b=>b.id===x.id)}));
    KB_BASE.forEach((b,i)=>{ if(!out.find(x=>x.id===b.id)) out.splice(i,0,{...b,on:true,base:true}); });  // garante as 4 base
    return out;
  }
  return KB_BASE.map(b=>({...b,on:true,base:true}));
}
function saveKanbanStages(arr){
  localStorage.setItem('tcho_kanban_stages',JSON.stringify(arr));
  db.collection('config').doc('operacao').set({kanbanStages:arr},{merge:true}).catch(console.error);
}
function getKanbanCfg(){   // só o toggle de "finalizados de hoje"
  let s=null; try{ s=JSON.parse(localStorage.getItem('tcho_kanban')||'null'); }catch(e){}
  return Object.assign({finalizados:true}, s||{});
}
// Ordem dos status ativos (usado no drag e na query do listener)
function statusCols(){ const a=getKanbanStages().filter(s=>s.on).map(s=>s.id); return a.length?a:['novo','prep','pronto','entrega']; }

// Monta as colunas do kanban a partir das etapas ativas
function renderKanbanCols(){
  const kb=document.getElementById('kanban'); if(!kb) return;
  const stages=getKanbanStages().filter(s=>s.on);
  kb.style.gridTemplateColumns='repeat('+Math.max(1,stages.length)+',1fr)';
  kb.innerHTML=stages.map(s=>`
    <div class="col col-${s.id}" id="col-${s.id}" ondragover="onDragOver(event,'${s.id}')" ondragleave="onDragLeave(event,'${s.id}')" ondrop="onDrop(event,'${s.id}')">
      <div class="col-hdr"><div class="col-title">${s.e} ${s.t}</div><div class="col-cnt" id="cnt-${s.id}">0</div></div>
      <div class="col-body" id="body-${s.id}"><div class="vazio-col">${KB_VAZIO[s.id]||'Vazio'}</div></div>
    </div>`).join('');
}

// ── Painel de config do Kanban (renomear/ligar/adicionar etapas) ──
function renderKbLinhas(){
  const el=document.getElementById('kb-linhas'); if(!el) return;
  const stages=getKanbanStages();
  el.innerHTML=stages.map((s,i)=>`
    <div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #2a2520">
      <input class="edit-inp" style="width:44px;text-align:center;flex-shrink:0" value="${(s.e||'').replace(/"/g,'&quot;')}" onchange="editKbStage(${i},'e',this.value)">
      <input class="edit-inp" style="flex:1;min-width:0" value="${(s.t||'').replace(/"/g,'&quot;')}" onchange="editKbStage(${i},'t',this.value)">
      <label class="toggle-wrap" style="flex-shrink:0"><input type="checkbox" ${s.on!==false?'checked':''} onchange="editKbStage(${i},'on',this.checked)"><span class="slider"></span></label>
      ${s.base?'<span style="width:28px;flex-shrink:0"></span>':`<button type="button" onclick="removerKbStage(${i})" title="Remover etapa" style="background:#3a1010;color:#e74c3c;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;flex-shrink:0">✕</button>`}
    </div>`).join('');
}
function editKbStage(i,campo,val){ const arr=getKanbanStages(); if(!arr[i])return; arr[i][campo]=val; saveKanbanStages(arr); renderKbLinhas(); renderAll(); }
function addColunaKanban(){ const arr=getKanbanStages(); arr.push({id:'kb_'+Date.now(),e:'⬜',t:'Nova etapa',on:true,base:false}); saveKanbanStages(arr); renderKbLinhas(); iniciarListenerPedidos(); renderAll(); showToast('✅ Etapa adicionada','tok-ok'); }
function removerKbStage(i){ const arr=getKanbanStages(); const s=arr[i]; if(!s||s.base)return; if(!confirm(`Remover a etapa "${s.t}"? Pedidos nela não somem, mas a coluna deixa de aparecer.`))return; arr.splice(i,1); saveKanbanStages(arr); renderKbLinhas(); renderAll(); showToast('🗑️ Etapa removida','tok-info'); }
function carregarKanbanCfg(){
  renderKbLinhas();
  const fin=document.getElementById('cfg-kb-finalizados'); if(fin) fin.checked=getKanbanCfg().finalizados!==false;
}
function salvarKanbanCfg(){
  const k={finalizados:document.getElementById('cfg-kb-finalizados')?.checked!==false};
  localStorage.setItem('tcho_kanban',JSON.stringify(k));
  db.collection('config').doc('operacao').set({kanban:k},{merge:true}).catch(console.error);
  renderAll();
  showToast('✅ Kanban atualizado!','tok-ok');
}

function renderAll(){
  renderKanbanCols();
  const stages=getKanbanStages().filter(s=>s.on);
  const cols={}; stages.forEach(s=>cols[s.id]=[]);
  pedidos.forEach(p=>{ if(cols[p.status]) cols[p.status].push(p); });
  stages.forEach(s=>{ const c=document.getElementById('cnt-'+s.id); if(c) c.textContent=(cols[s.id]||[]).length; });
  const setTxt=(id,v)=>{const e=document.getElementById(id); if(e) e.textContent=v;};
  setTxt('sn',(cols.novo||[]).length); setTxt('sp',(cols.prep||[]).length); setTxt('sk',(cols.pronto||[]).length); setTxt('se',(cols.entrega||[]).length); setTxt('st',totalHoje);
  stages.forEach(s=>{ const body=document.getElementById('body-'+s.id); if(body){ const list=cols[s.id]||[]; body.innerHTML=list.length?list.map(renderCard).join(''):`<div class="vazio-col">${KB_VAZIO[s.id]||'Vazio'}</div>`; } });
  renderFinalizadosHoje([...pedidosFinHoje]);
}

function renderFinalizadosHoje(lista){
  const sec=document.getElementById('secao-fin-hoje');
  if(!sec) return;
  if(getKanbanCfg().finalizados===false){ sec.style.display='none'; return; }
  if(!lista.length){sec.style.display='none';return;}
  lista.sort((a,b)=>(b.hora||new Date(0))-(a.hora||new Date(0)));
  document.getElementById('cnt-fin-hoje').textContent=lista.length;
  document.getElementById('body-fin-hoje').innerHTML=lista.map(p=>{
    const cancel=p.status==='cancelado';
    const cor=cancel?'#e74c3c':'#27ae60';
    return`<div style="background:var(--card);border:1px solid ${cancel?'#3a1010':'#0d2010'};border-radius:10px;padding:10px 12px;opacity:${cancel?'.75':'1'}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:.92rem;color:${cor}">${cancel?'❌':'✅'} ${p.num||'#'+p.id}</span>
        <span style="font-size:.62rem;color:var(--muted)">${p.horaFim||p.horaStr||''}</span>
      </div>
      <div style="font-size:.78rem;font-weight:700;margin-bottom:2px">${p.nome}</div>
      ${p.bairro?`<div style="font-size:.66rem;color:var(--muted)">📍 ${p.bairro}</div>`:''}
      <div style="font-size:.67rem;color:var(--muted);margin:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(p.itens||[]).join(' · ')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
        <div style="font-weight:700;color:${cor};font-size:.82rem">R$${p.total||0}</div>
        <div style="display:flex;gap:4px">
          <button class="btn-editar-card" onclick="reimprimirPedido('${p._id}')">🖨️ Cupom</button>
          <button class="btn-editar-card" onclick="abrirModalEditar('${p._id}')">✏️ Editar</button>
          <button class="btn-editar-card" onclick="excluirPedido('${p._id}')" style="color:#e74c3c">🗑️ Excluir</button>
        </div>
      </div>
    </div>`;
  }).join('');
  sec.style.display='block';
}

function atualizarBadgeNovos(){
  const n=pedidos.filter(p=>p.status==='novo').length;
  const badge=document.getElementById('badge-novos');
  badge.style.display=n>0?'inline-flex':'none';
  badge.textContent=n;
}

// ── LOG DE PEDIDOS ─────────────────────────────────────────────
let logPedidos=[];

async function carregarLog(){
  const hoje=dataLocalHoje();
  const iniEl=document.getElementById('log-ini');
  const fimEl=document.getElementById('log-fim');
  if(!iniEl.value)iniEl.value=hoje;
  if(!fimEl.value)fimEl.value=hoje;
  const ini=new Date(iniEl.value+'T00:00:00');
  const fim=new Date(fimEl.value+'T23:59:59');
  document.getElementById('hist-lista').innerHTML='<div style="color:var(--muted);font-size:.78rem;padding:8px 0">Carregando...</div>';
  try{
    const snap=await db.collection('pedidos')
      .where('criadoEm','>=',firebase.firestore.Timestamp.fromDate(ini))
      .where('criadoEm','<', firebase.firestore.Timestamp.fromDate(new Date(fim.getTime()+1000)))
      .get();
    if(snap&&snap.docs&&snap.docs.length>0){
      logPedidos=snap.docs.map(d=>{const data=d.data();return{...data,_id:d.id,hora:data.hora?.toDate?.()||new Date(data.hora||0)};});
    } else {
      logPedidos=[...pedidos];
    }
  }catch(e){
    logPedidos=[...pedidos];
  }
  renderLog();
}

function renderLog(){
  const nome=(document.getElementById('log-nome')?.value||'').toLowerCase().trim();
  const tel=(document.getElementById('log-tel')?.value||'').replace(/\D/g,'');
  const end=(document.getElementById('log-end')?.value||'').toLowerCase().trim();
  let lista=[...logPedidos].sort((a,b)=>new Date(b.hora)-new Date(a.hora));
  if(nome)lista=lista.filter(p=>(p.nome||'').toLowerCase().includes(nome));
  if(tel)lista=lista.filter(p=>(p.tel||'').replace(/\D/g,'').includes(tel));
  if(end)lista=lista.filter(p=>(p.bairro||'').toLowerCase().includes(end)||(p.endereco||'').toLowerCase().includes(end));
  const countEl=document.getElementById('log-count');
  if(countEl)countEl.textContent=lista.length?`${lista.length} pedido${lista.length!==1?'s':''} encontrado${lista.length!==1?'s':''}` :'';
  if(!lista.length){document.getElementById('hist-lista').innerHTML='<div class="empty"><div class="empty-icon">🔍</div><div>Nenhum pedido encontrado</div></div>';return;}
  const statusLabel={novo:'Novo',prep:'Em preparo',pronto:'Pronto',entrega:'Em entrega',finalizado:'Finalizado'};
  const statusCor={novo:'#e74c3c',prep:'#f39c12',pronto:'#27ae60',entrega:'#3498db',finalizado:'var(--muted)'};
  const r=n=>'R$'+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('hist-lista').innerHTML=lista.map(p=>`
    <div class="log-card">
      <div class="log-card-header">
        <div>
          <span class="log-num">${p.num||'#'+p.id}</span>
          <span class="log-badge" style="background:${p.tipo==='delivery'?'#1a0e0e':'#081508'};color:${p.tipo==='delivery'?'#e74c3c':'#27ae60'}">${p.tipo==='delivery'?'🛵 DELIVERY':'🏃 RETIRADA'}</span>
        </div>
        <div style="text-align:right">
          <div style="font-size:.65rem;font-weight:700;color:${statusCor[p.status]||'var(--muted)'}">${statusLabel[p.status]||p.status||'-'}</div>
          <div style="font-size:.65rem;color:var(--muted)">${p.horaStr||''}</div>
        </div>
      </div>
      <div class="log-nome">${p.nome||'-'}</div>
      ${p.tel?`<div class="log-info">📞 ${p.tel}</div>`:''}
      ${p.tipo==='delivery'&&(p.bairro||p.endereco)?`<div class="log-info">📍 ${[p.endereco,p.bairro,p.cidade].filter(Boolean).join(' — ')}</div>`:''}
      <div class="log-sep"></div>
      <div class="log-itens">${(p.itens||[]).map(i=>`<div>• ${i}</div>`).join('')}</div>
      ${p.obs?`<div style="font-size:.7rem;color:#f39c12;margin-top:4px">⚠ ${p.obs}</div>`:''}
      <div class="log-sep"></div>
      <div class="log-footer">
        <div class="log-pag">${p.pag||'-'}${(p.frete||0)>0?` · Frete: ${r(p.frete)}`:''}</div>
        <div class="log-total">${r(p.total||0)}</div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:4px;margin-top:8px">
        <button class="btn-editar-card" onclick="reimprimirPedido('${p._id}')">🖨️ Cupom</button>
        <button class="btn-editar-card" onclick="abrirModalEditar('${p._id}')">✏️ Editar</button>
        <button class="btn-editar-card" onclick="excluirPedido('${p._id}')" style="color:#e74c3c">🗑️ Excluir</button>
      </div>
    </div>`).join('');
}

function renderHistorico(){renderLog();}

// ── CARDÁPIO (estoque) — dados de shared/dados.js via TCHO ─────
const PRODS = [
  ...TCHO.burguers.map(b => ({id:b.id, e:b.emoji, n:b.nome, p:b.preco, cat:'b'})),
  ...TCHO.extras.filter(e => e.id !== 'cmb').map(e => ({id:e.id, e:e.emoji, n:e.nome, p:e.preco, cat:'e', opcoes:e.opcoes})),
  ...TCHO.extras.filter(e => e.id === 'cmb').map(e => ({id:e.id, e:e.emoji, n:`Combo (+R$${e.preco})`, p:e.preco, cat:'c', opcoes:e.opcoes})),
];
(function(){
  const edits=JSON.parse(localStorage.getItem('tcho_prods_edits')||'{}');
  PRODS.forEach(p=>{if(edits[p.id]){if(edits[p.id].nome)p.n=edits[p.id].nome;if(edits[p.id].preco!==undefined)p.p=edits[p.id].preco;}});
})();
const est={};PRODS.forEach(p=>{est[p.id]={ativo:true,modo:'inf',qtd:10};});

// ── HELPERS CUSTOM ─────────────────────────────────────────────
function salvarCardapioFS(chave,dados){db.collection('cardapio').doc(chave).set(dados).catch(console.error);}
function getProdsCustom(){return JSON.parse(localStorage.getItem('tcho_prods_custom')||'[]');}
function saveProdsCustom(arr){localStorage.setItem('tcho_prods_custom',JSON.stringify(arr));salvarCardapioFS('prods_custom',{lista:arr});}
function getCatsCustom(){return JSON.parse(localStorage.getItem('tcho_cats_custom')||'[]');}
function saveCatsCustom(arr){localStorage.setItem('tcho_cats_custom',JSON.stringify(arr));salvarCardapioFS('cats_custom',{lista:arr});}
getProdsCustom().forEach(p=>{if(!est[p.id])est[p.id]={ativo:p.ativo!==false,modo:'inf',qtd:10};});
// Aplica o estoque salvo (localStorage; sincronizado do Firestore no login)
(function(){
  const saved=JSON.parse(localStorage.getItem('tcho_estoque')||'{}');
  Object.keys(saved).forEach(id=>{est[id]={...(est[id]||{ativo:true,modo:'inf',qtd:10}),...saved[id]};});
})();
// Salva o estoque na nuvem (por produto, sem apagar os outros)
function salvarEstoque(id){
  localStorage.setItem('tcho_estoque',JSON.stringify(est));
  const ref=db.collection('cardapio').doc('estoque');
  if(id) ref.set({data:{[id]:est[id]}},{merge:true}).catch(console.error);
  else   ref.set({data:est},{merge:true}).catch(console.error);
}

// ── FOTOS DOS PRODUTOS ─────────────────────────────────────────
function getFotoAdmin(id){
  return JSON.parse(localStorage.getItem('tcho_fotos')||'{}')[id]||null;
}
function salvarFotoData(id,src){
  const fotos=JSON.parse(localStorage.getItem('tcho_fotos')||'{}');
  fotos[id]=src;
  localStorage.setItem('tcho_fotos',JSON.stringify(fotos));
  db.collection('fotos').doc(id).set({src}).catch(console.error);   // reflete no site do cliente
  renderCardapio();
  showToast('📷 Foto salva!','tok-ok');
}
function removerFotoAdmin(id){
  const fotos=JSON.parse(localStorage.getItem('tcho_fotos')||'{}');
  delete fotos[id];
  localStorage.setItem('tcho_fotos',JSON.stringify(fotos));
  db.collection('fotos').doc(id).delete().catch(()=>{});           // remove do site do cliente
  renderCardapio();
  showToast('🗑️ Foto removida','tok-info');
}
// Lê um arquivo de imagem, redimensiona (máx 700px, JPEG) e devolve o dataURL.
function lerFotoRedimensionada(file, cb){
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas');
      const MAX=700; let w=img.width,h=img.height;
      if(w>h){if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}}
      else{if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}}
      canvas.width=w;canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      cb(canvas.toDataURL('image/jpeg',0.82));
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}
function abrirUploadFoto(id){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='image/*';
  inp.onchange=e=>{ const file=e.target.files[0]; if(file) lerFotoRedimensionada(file,src=>salvarFotoData(id,src)); };
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
  salvarCardapioFS('opcoes',{data:saved});
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

// ── EDIÇÃO DE NOME, PREÇO E DESCRIÇÃO ─────────────────────────
function getProdDesc(id){
  const cp=getProdsCustom().find(x=>x.id===id);
  if(cp)return cp.desc||'';
  const edits=JSON.parse(localStorage.getItem('tcho_prods_edits')||'{}');
  if(edits[id]?.desc!==undefined)return edits[id].desc;
  return TCHO.burguers.find(b=>b.id===id)?.desc||TCHO.extras.find(e=>e.id===id)?.desc||'';
}

function editarProd(id){
  let p=PRODS.find(x=>x.id===id);
  if(!p){const cp=getProdsCustom().find(x=>x.id===id);if(cp)p={n:cp.n||cp.nome,p:cp.p!==undefined?cp.p:cp.preco};}
  if(!p)return;
  const row=document.getElementById('prow-'+id);if(!row)return;
  const infoEl=row.querySelector('.prod-info');
  const editBtn=row.querySelector('.btn-edit-prod');
  if(!infoEl)return;
  if(editBtn)editBtn.style.display='none';
  const desc=getProdDesc(id);
  const inp='background:var(--card);border:1px solid var(--orange);border-radius:6px;color:var(--cream);font-size:.78rem;padding:6px 8px;outline:none;width:100%;box-sizing:border-box';
  infoEl.innerHTML=`
    <div class="prod-edit-form">
      <input style="${inp};margin-bottom:5px" id="edit-nome-${id}" value="${p.n.replace(/"/g,'&quot;')}" placeholder="Nome do produto">
      <div class="prod-edit-preco" style="margin-bottom:5px">
        <span>R$</span>
        <input class="prod-edit-input prod-edit-preco" id="edit-preco-${id}" type="number" min="0" step="0.50" value="${p.p}">
      </div>
      <textarea style="${inp};resize:vertical;min-height:52px;margin-bottom:5px;font-family:inherit" id="edit-desc-${id}" placeholder="Descrição (ingredientes, tamanho...)">${desc.replace(/</g,'&lt;')}</textarea>
      <div class="prod-edit-actions">
        <button class="opc-btn" onclick="salvarEditProd('${id}')">✓ Salvar</button>
        <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="renderCardapio()">Cancelar</button>
      </div>
    </div>`;
}

function salvarEditProd(id){
  const nomeEl=document.getElementById('edit-nome-'+id);
  const precoEl=document.getElementById('edit-preco-'+id);
  const descEl=document.getElementById('edit-desc-'+id);
  if(!nomeEl||!precoEl)return;
  const nome=nomeEl.value.trim();
  const preco=parseFloat(precoEl.value);
  const desc=(descEl?.value||'').trim();
  if(!nome){showToast('⚠️ Digite o nome do produto','tok-err');return;}
  if(isNaN(preco)||preco<0){showToast('⚠️ Preço inválido','tok-err');return;}
  if(id.startsWith('cp_')){
    const arr=getProdsCustom(),idx=arr.findIndex(x=>x.id===id);
    if(idx!==-1){arr[idx].n=nome;arr[idx].p=preco;arr[idx].nome=nome;arr[idx].preco=preco;arr[idx].desc=desc;saveProdsCustom(arr);}
  } else {
    const p=PRODS.find(x=>x.id===id);if(!p)return;
    p.n=nome;p.p=preco;
    const edits=JSON.parse(localStorage.getItem('tcho_prods_edits')||'{}');
    edits[id]={nome,preco,desc};localStorage.setItem('tcho_prods_edits',JSON.stringify(edits));salvarCardapioFS('prods_edits',{data:edits});
    // atualiza TCHO em memória para refletir no cliente sem reload
    const tItem=[...TCHO.burguers,...TCHO.extras].find(x=>x.id===id);
    if(tItem){tItem.nome=nome;tItem.preco=preco;tItem.desc=desc;}
  }
  renderCardapio();
  showToast(`✅ "${nome}" salvo!`,'tok-ok');
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

// ── INGREDIENTES DOS HAMBURGUERES ─────────────────────────────
function getIngAdmin(id){
  const saved=JSON.parse(localStorage.getItem('tcho_ing_edits')||'{}');
  if(saved[id])return saved[id];
  const cp=getProdsCustom().find(x=>x.id===id);
  if(cp)return cp.ing||[];
  return TCHO.burguers.find(b=>b.id===id)?.ing||[];
}
function salvarIngredientes(id,arr){
  const saved=JSON.parse(localStorage.getItem('tcho_ing_edits')||'{}');
  saved[id]=arr;localStorage.setItem('tcho_ing_edits',JSON.stringify(saved));
  salvarCardapioFS('ing_edits',{data:saved});
}
function adicionarIngrediente(id){
  const inp=document.getElementById('ing-inp-'+id);
  const val=inp.value.trim();
  if(!val){showToast('Digite o ingrediente','tok-err');return;}
  const arr=getIngAdmin(id);
  if(arr.map(x=>x.toLowerCase()).includes(val.toLowerCase())){showToast('Ingrediente já listado','tok-err');return;}
  arr.push(val);salvarIngredientes(id,arr);inp.value='';renderCardapio();
  showToast(`✅ "${val}" adicionado`,'tok-ok');
}
function removerIngrediente(id,idx){
  const arr=getIngAdmin(id);const nome=arr[idx];
  arr.splice(idx,1);salvarIngredientes(id,arr);renderCardapio();
  showToast(`🗑️ "${nome}" removido`,'tok-info');
}
function renderIngredientes(id){
  const arr=getIngAdmin(id);
  return`<div class="prod-opcoes">
    <div class="opc-titulo">🥗 Ingredientes removíveis (cliente pode retirar):</div>
    <div class="opc-tags">
      ${arr.length
        ?arr.map((o,i)=>`<span class="opc-tag">${o}<button class="opc-rm" onclick="removerIngrediente('${id}',${i})">×</button></span>`).join('')
        :'<span class="opc-empty">Nenhum ingrediente cadastrado</span>'
      }
    </div>
    <div class="opc-add">
      <input class="opc-input" id="ing-inp-${id}" type="text" placeholder="Ex: Queijo cheddar" onkeydown="if(event.key==='Enter')adicionarIngrediente('${id}')">
      <button class="opc-btn" onclick="adicionarIngrediente('${id}')">+ Adicionar</button>
    </div>
  </div>`;
}

function renderLista(cat,containerId){
  const container=document.getElementById(containerId);if(!container)return;
  const stdProds=PRODS.filter(p=>p.cat===cat);
  const custProds=getProdsCustom().filter(p=>p.cat===cat);
  custProds.forEach(cp=>{if(!est[cp.id])est[cp.id]={ativo:cp.ativo!==false,modo:'inf',qtd:10};});
  const catTipo=cat==='b'?'b':cat==='c'?'c':cat.startsWith('cat_')?(getCatsCustom().find(c=>c.id===cat)?.tipo||'e'):'e';

  const rowHTML=(p,isCustom)=>{
    const ev=est[p.id]||{ativo:true,modo:'inf',qtd:10};
    const temOpcoes=catTipo!=='b'&&(p.opcoes?.length>0||getOpcoesAdmin(p.id).length>0);
    const temFoto=!!getFotoAdmin(p.id);
    return`<div class="prod-item" id="prow-${p.id}">
      <div class="prod-row">
        <div class="prod-foto-mini" onclick="toggleFotoPanel('${p.id}')">
          ${temFoto?`<img src="${getFotoAdmin(p.id)}" class="prod-foto-mini-img" alt="">`:`<span class="prod-foto-mini-icon">${isCustom?p.emoji:'📷'}</span>`}
        </div>
        <div class="prod-info" id="prod-info-${p.id}"><div class="prod-nome">${p.n}</div><div class="prod-preco">R$${p.p}</div></div>
        <button class="btn-edit-prod" id="btn-edit-${p.id}" onclick="editarProd('${p.id}')" title="Editar">✏️</button>
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
        ${isCustom?`<button class="btn-del-prod" onclick="removerProdCustom('${p.id}')" title="Remover">🗑️</button>`:''}
      </div>
      ${renderFotoSection(p.id)}
      ${temOpcoes?renderOpcoes(p.id):''}
      ${catTipo==='b'?renderIngredientes(p.id):''}
    </div>`;
  };

  const addSection=addProdCat===cat
    ?renderFormNovoProd(cat)
    :`<button class="btn-add-prod" onclick="abrirFormNovoProd('${cat}')">+ Novo produto</button>`;

  container.innerHTML=stdProds.map(p=>rowHTML(p,false)).join('')+custProds.map(p=>rowHTML(p,true)).join('')+addSection;
}

function renderCustomCats(){
  const cats=getCatsCustom();
  const container=document.getElementById('custom-cats-container');if(!container)return;
  container.innerHTML=cats.map(cat=>`
    <div class="section">
      <div class="sec-title" id="sec-title-${cat.id}">${cat.emoji} ${getCatNome(cat.id)||cat.nome}<button class="btn-edit-cat" onclick="editarCategoria('${cat.id}')" title="Editar">✏️</button><button class="btn-del-cat" onclick="removerCatCustom('${cat.id}')" title="Remover">🗑️</button></div>
      <div id="lista-${cat.id}"></div>
    </div>`).join('');
  cats.forEach(cat=>renderLista(cat.id,'lista-'+cat.id));
}

// ── NOVO PRODUTO ───────────────────────────────────────────────
let addProdCat=null;
let novoProdFoto=null;   // foto (dataURL) escolhida no formulário de novo produto

// HTML interno da área de foto do novo produto (preview + botões)
function nprodFotoInner(){
  return (novoProdFoto
    ? `<img src="${novoProdFoto}" style="width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid #3a3530">`
    : `<div style="width:52px;height:52px;border-radius:8px;border:1px dashed #3a3530;display:flex;align-items:center;justify-content:center;font-size:1.3rem;color:var(--muted)">📷</div>`)
    + `<button type="button" class="opc-btn" onclick="escolherFotoNovoProd()">📁 ${novoProdFoto?'Trocar foto':'Adicionar foto'}</button>`
    + (novoProdFoto?`<button type="button" class="opc-btn" style="background:#3a1010;color:#e74c3c" onclick="removerFotoNovoProd()">Remover</button>`:'');
}
function escolherFotoNovoProd(){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='image/*';
  inp.onchange=e=>{ const file=e.target.files[0]; if(file) lerFotoRedimensionada(file,src=>{ novoProdFoto=src; const a=document.getElementById('nprod-foto-area'); if(a) a.innerHTML=nprodFotoInner(); }); };
  inp.click();
}
function removerFotoNovoProd(){ novoProdFoto=null; const a=document.getElementById('nprod-foto-area'); if(a) a.innerHTML=nprodFotoInner(); }

function getCatTipo(cat){
  if(cat==='b')return'b';if(cat==='c')return'c';
  if(cat.startsWith('cat_'))return getCatsCustom().find(c=>c.id===cat)?.tipo||'e';
  return'e';
}

function renderFormNovoProd(catInicial){
  const inp='background:var(--card);border:1px solid var(--orange);border-radius:6px;color:var(--cream);font-size:.82rem;padding:6px 8px;outline:none';
  const sel='width:100%;background:var(--card);border:1px solid #3a3530;color:var(--cream);border-radius:6px;padding:7px 8px;font-size:.78rem;outline:none;margin-bottom:8px';
  const tipo=getCatTipo(catInicial);
  const temOpc=tipo!=='b';
  const cats=getCatsCustom();
  const catNomesMap=JSON.parse(localStorage.getItem('tcho_cat_nomes')||'{}');
  const catOpts=[
    `<option value="b"${catInicial==='b'?' selected':''}>🍔 Hamburguers</option>`,
    `<option value="e"${catInicial==='e'?' selected':''}>🍟 Extras & Bebidas</option>`,
    `<option value="c"${catInicial==='c'?' selected':''}>🍟🥤 Combo</option>`,
    ...cats.map(c=>`<option value="${c.id}"${catInicial===c.id?' selected':''}>${c.emoji} ${catNomesMap[c.id]||c.nome}</option>`),
    `<option value="nova">➕ Nova categoria...</option>`
  ].join('');
  return`<div class="new-prod-form">
    <div style="font-size:.72rem;font-weight:700;color:var(--orange);letter-spacing:1px;margin-bottom:10px">NOVO PRODUTO</div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <input style="${inp};width:46px;text-align:center;font-size:1.1rem;flex-shrink:0" id="nprod-emoji" value="${tipo==='b'?'🍔':'🍟'}">
      <input style="${inp};flex:1;min-width:0" id="nprod-nome" placeholder="Nome do produto" onkeydown="if(event.key==='Enter')salvarNovoProd()">
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
      <span style="font-size:.72rem;color:var(--muted);flex-shrink:0">R$</span>
      <input style="${inp};width:80px;flex-shrink:0" id="nprod-preco" type="number" min="0" step="0.5" placeholder="Preço">
      <input style="${inp};flex:1;min-width:0" id="nprod-desc" placeholder="Descrição (opcional)">
    </div>
    <div style="margin-bottom:0">
      <div style="font-size:.65rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Categoria</div>
      <select style="${sel}" id="nprod-cat" onchange="onMudaCatProd(this.value)">${catOpts}</select>
    </div>
    <div id="nprod-nova-div" style="display:none;background:#1e1a14;border:1px dashed #3a3530;border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="font-size:.65rem;color:var(--orange);font-weight:700;letter-spacing:1px;margin-bottom:8px">NOVA CATEGORIA</div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input style="${inp};width:46px;text-align:center;font-size:1.1rem;flex-shrink:0" id="nprod-ncat-emoji" value="🍽️">
        <input style="${inp};flex:1;min-width:0" id="nprod-ncat-nome" placeholder="Nome da categoria">
      </div>
      <select style="${sel}" id="nprod-ncat-tipo">
        <option value="e" selected>🍟 Extra / Bebida</option>
        <option value="b">🍔 Hamburguer (ponto e sachê)</option>
      </select>
    </div>
    <div id="nprod-opcoes-div" style="${temOpc?'':'display:none;'}margin-bottom:8px">
      <div style="font-size:.65rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Opções para o cliente escolher</div>
      <input style="${inp};width:100%;box-sizing:border-box" id="nprod-opcoes" placeholder="Separadas por vírgula (ex: Coca-Cola, Guaraná)">
    </div>
    <div style="margin-bottom:10px">
      <div style="font-size:.65rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Foto (aparece no cardápio do cliente)</div>
      <div id="nprod-foto-area" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${nprodFotoInner()}</div>
    </div>
    <div style="display:flex;gap:6px">
      <button class="opc-btn" onclick="salvarNovoProd()">✓ Adicionar</button>
      <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="fecharFormNovoProd()">Cancelar</button>
    </div>
  </div>`;
}

function onMudaCatProd(val){
  const novaDiv=document.getElementById('nprod-nova-div');
  const opcoesDiv=document.getElementById('nprod-opcoes-div');
  if(!novaDiv||!opcoesDiv)return;
  if(val==='nova'){
    novaDiv.style.display='block';
    opcoesDiv.style.display='block';
  } else {
    novaDiv.style.display='none';
    opcoesDiv.style.display=getCatTipo(val)!=='b'?'block':'none';
  }
}

function abrirFormNovoProd(cat){addProdCat=cat;novoProdFoto=null;renderCardapio();setTimeout(()=>document.getElementById('nprod-nome')?.focus(),60);}
function fecharFormNovoProd(){addProdCat=null;novoProdFoto=null;renderCardapio();}

function salvarNovoProd(){
  const emoji=document.getElementById('nprod-emoji')?.value.trim()||'🍔';
  const nome=document.getElementById('nprod-nome')?.value.trim();
  const preco=parseFloat(document.getElementById('nprod-preco')?.value);
  const desc=document.getElementById('nprod-desc')?.value.trim()||'';
  const opcoesStr=document.getElementById('nprod-opcoes')?.value.trim()||'';
  const catSel=document.getElementById('nprod-cat')?.value||addProdCat||'e';
  if(!nome){showToast('⚠️ Digite o nome do produto','tok-err');return;}
  if(isNaN(preco)||preco<0){showToast('⚠️ Preço inválido','tok-err');return;}
  let catFinal=catSel;
  if(catSel==='nova'){
    const ncNome=document.getElementById('nprod-ncat-nome')?.value.trim();
    if(!ncNome){showToast('⚠️ Digite o nome da nova categoria','tok-err');return;}
    const ncEmoji=document.getElementById('nprod-ncat-emoji')?.value.trim()||'🍽️';
    const ncTipo=document.getElementById('nprod-ncat-tipo')?.value||'e';
    catFinal='cat_'+Date.now();
    const cats=getCatsCustom();cats.push({id:catFinal,emoji:ncEmoji,nome:ncNome,tipo:ncTipo});saveCatsCustom(cats);
  }
  const tipo=getCatTipo(catFinal);
  const opcoes=opcoesStr?opcoesStr.split(',').map(s=>s.trim()).filter(Boolean):[];
  const id='cp_'+Date.now();
  const arr=getProdsCustom();
  arr.push({id,cat:catFinal,emoji,n:nome,p:preco,nome,preco,desc,opcoes,tipo,ativo:true});
  saveProdsCustom(arr);
  est[id]={ativo:true,modo:'inf',qtd:10};
  if(novoProdFoto){ salvarFotoData(id,novoProdFoto); novoProdFoto=null; }   // salva a foto do novo produto
  addProdCat=null;renderCardapio();
  showToast(`✅ "${nome}" adicionado!`,'tok-ok');
}

function removerProdCustom(id){
  const arr=getProdsCustom(),p=arr.find(x=>x.id===id);
  if(!p||!confirm(`Remover "${p.n||p.nome}"?`))return;
  saveProdsCustom(arr.filter(x=>x.id!==id));
  delete est[id];renderCardapio();
  showToast(`🗑️ "${p.n||p.nome}" removido`,'tok-info');
}

// ── NOVA CATEGORIA ─────────────────────────────────────────────
let novaCatAberta=false;

function abrirFormNovaCategoria(){novaCatAberta=true;renderCardapio();setTimeout(()=>document.getElementById('nca-nome')?.focus(),60);}
function fecharFormNovaCategoria(){novaCatAberta=false;renderCardapio();}

function salvarNovaCategoria(){
  const emoji=document.getElementById('nca-emoji')?.value.trim()||'🍽️';
  const nome=document.getElementById('nca-nome')?.value.trim();
  const tipo=document.getElementById('nca-tipo')?.value||'e';
  if(!nome){showToast('⚠️ Digite o nome da categoria','tok-err');return;}
  const id='cat_'+Date.now();
  const arr=getCatsCustom();arr.push({id,emoji,nome,tipo});saveCatsCustom(arr);
  novaCatAberta=false;renderCardapio();
  showToast(`✅ Categoria "${nome}" criada!`,'tok-ok');
}

function renderNovaCatArea(){
  const el=document.getElementById('nova-cat-area');if(!el)return;
  const inp='background:var(--card);border:1px solid var(--orange);border-radius:6px;color:var(--cream);font-size:.82rem;padding:6px 8px;outline:none';
  if(novaCatAberta){
    el.innerHTML=`<div class="section"><div class="nova-cat-form">
      <div style="font-size:.72rem;font-weight:700;color:var(--orange);letter-spacing:1px;margin-bottom:12px">NOVA CATEGORIA</div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input style="${inp};width:46px;text-align:center;font-size:1.1rem;flex-shrink:0" id="nca-emoji" value="🍽️" placeholder="🍽️">
        <input style="${inp};flex:1;min-width:0" id="nca-nome" placeholder="Nome da categoria" onkeydown="if(event.key==='Enter')salvarNovaCategoria()">
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:.65rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Tipo de produto</div>
        <select style="width:100%;background:var(--card);border:1px solid #3a3530;color:var(--cream);border-radius:6px;padding:7px 8px;font-size:.78rem;outline:none" id="nca-tipo">
          <option value="e" selected>🍟 Extra / Bebida — botão de quantidade</option>
          <option value="b">🍔 Hamburguer — escolha de ponto e sachê</option>
        </select>
      </div>
      <div style="display:flex;gap:6px">
        <button class="opc-btn" onclick="salvarNovaCategoria()">✓ Criar Categoria</button>
        <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="fecharFormNovaCategoria()">Cancelar</button>
      </div>
    </div></div>`;
    setTimeout(()=>document.getElementById('nca-nome')?.focus(),60);
  } else {
    el.innerHTML=`<div class="section" style="padding:10px 0 4px"><button class="btn-add-cat" onclick="abrirFormNovaCategoria()">+ Nova Categoria</button></div>`;
  }
}

function removerCatCustom(id){
  const cats=getCatsCustom(),cat=cats.find(c=>c.id===id);if(!cat)return;
  const prods=getProdsCustom().filter(p=>p.cat===id);
  if(prods.length&&!confirm(`A categoria "${cat.nome}" tem ${prods.length} produto(s). Remover tudo?`))return;
  saveCatsCustom(cats.filter(c=>c.id!==id));
  saveProdsCustom(getProdsCustom().filter(p=>p.cat!==id));
  renderCustomCats();showToast(`🗑️ Categoria "${cat.nome}" removida`,'tok-info');
}

// ── CATEGORIAS ─────────────────────────────────────────────────
const CAT_DEFAULTS={burguers:'Hamburguers',extras:'Extras & Bebidas',combo:'Combo'};
const CAT_EMOJI={burguers:'🍔',extras:'🍟',combo:'🍟🥤'};

function getCatNome(id){
  const saved=JSON.parse(localStorage.getItem('tcho_cat_nomes')||'{}');
  if(saved[id])return saved[id];
  if(CAT_DEFAULTS[id])return CAT_DEFAULTS[id];
  return getCatsCustom().find(c=>c.id===id)?.nome||'';
}

function renderCatTitles(){
  ['burguers','extras','combo'].forEach(id=>{
    const el=document.getElementById('sec-title-'+id);
    if(!el)return;
    el.innerHTML=`${CAT_EMOJI[id]} ${getCatNome(id)}<button class="btn-edit-cat" onclick="editarCategoria('${id}')" title="Editar nome da categoria">✏️</button>`;
  });
}

function editarCategoria(id){
  const el=document.getElementById('sec-title-'+id);if(!el)return;
  const isCustom=id.startsWith('cat_');
  const emoji=CAT_EMOJI[id]||(getCatsCustom().find(c=>c.id===id)?.emoji||'🍽️');
  el.innerHTML=`<div class="cat-edit-form">
    ${isCustom?`<input class="prod-edit-input" id="cat-emoji-${id}" value="${emoji}" style="width:40px;text-align:center;font-size:1rem">`:`<span>${emoji}</span>`}
    <input class="prod-edit-input" id="cat-inp-${id}" value="${getCatNome(id).replace(/"/g,'&quot;')}" style="width:150px">
    <button class="opc-btn" onclick="salvarCategoria('${id}')">✓ Salvar</button>
    <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="${isCustom?'renderCustomCats()':'renderCatTitles()'}">Cancelar</button>
  </div>`;
  document.getElementById('cat-inp-'+id)?.focus();
}

function salvarCategoria(id){
  const inp=document.getElementById('cat-inp-'+id);if(!inp)return;
  const nome=inp.value.trim();
  if(!nome){showToast('⚠️ Digite o nome da categoria','tok-err');return;}
  const saved=JSON.parse(localStorage.getItem('tcho_cat_nomes')||'{}');
  saved[id]=nome;localStorage.setItem('tcho_cat_nomes',JSON.stringify(saved));salvarCardapioFS('cat_nomes',{data:saved});
  if(id.startsWith('cat_')){
    const emoji=document.getElementById('cat-emoji-'+id)?.value.trim();
    if(emoji){const cats=getCatsCustom(),idx=cats.findIndex(c=>c.id===id);if(idx!==-1){cats[idx].emoji=emoji;saveCatsCustom(cats);}}
    renderCustomCats();
  } else renderCatTitles();
  showToast(`✅ Categoria "${nome}" salva!`,'tok-ok');
}

// ── ACRÉSCIMOS ─────────────────────────────────────────────────
function getAdicionaisAdmin(){
  const saved=localStorage.getItem('tcho_adicionais');
  return saved?JSON.parse(saved):[...TCHO.adicionais];
}
function saveAdicionaisAdmin(arr){localStorage.setItem('tcho_adicionais',JSON.stringify(arr));salvarCardapioFS('adicionais',{lista:arr});}

let editAdicId=null,addAdicAberto=false;

function renderAdicionais(){
  const el=document.getElementById('lista-adicionais');if(!el)return;
  const arr=getAdicionaisAdmin();
  const inp='background:var(--card);border:1px solid var(--orange);border-radius:6px;color:var(--cream);font-size:.78rem;padding:5px 7px;outline:none';
  el.innerHTML=arr.map(a=>{
    if(editAdicId===a.id){
      return`<div class="prod-item"><div style="display:flex;gap:8px;align-items:center;padding:8px 0;flex-wrap:wrap">
        <input style="${inp};flex:1;min-width:120px" id="ae-nome-${a.id}" value="${a.nome.replace(/"/g,'&quot;')}">
        <span style="font-size:.72rem;color:var(--muted);flex-shrink:0">R$</span>
        <input style="${inp};width:70px;flex-shrink:0" id="ae-preco-${a.id}" type="number" min="0" step="0.5" value="${a.preco}">
        <button class="opc-btn" onclick="salvarEditAdic('${a.id}')">✓ Salvar</button>
        <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="cancelarEditAdic()">Cancelar</button>
      </div></div>`;
    }
    return`<div class="prod-item"><div style="display:flex;align-items:center;gap:8px;padding:8px 0">
      <div style="flex:1;min-width:0"><div class="prod-nome">${a.nome}</div></div>
      <div class="prod-preco" style="flex-shrink:0">+R$${a.preco}</div>
      <button class="btn-edit-prod" onclick="iniciarEditAdic('${a.id}')" title="Editar">✏️</button>
      <button class="btn-del-prod" onclick="removerAdic('${a.id}')" title="Remover">🗑️</button>
    </div></div>`;
  }).join('')
  +(addAdicAberto
    ?`<div class="new-prod-form" style="margin-top:6px">
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
          <input style="${inp};flex:1;min-width:140px" id="an-nome" placeholder="Nome do acréscimo" onkeydown="if(event.key==='Enter')salvarNovoAdic()">
          <span style="font-size:.72rem;color:var(--muted);flex-shrink:0">R$</span>
          <input style="${inp};width:70px;flex-shrink:0" id="an-preco" type="number" min="0" step="0.5" placeholder="Preço">
        </div>
        <div style="display:flex;gap:6px">
          <button class="opc-btn" onclick="salvarNovoAdic()">✓ Adicionar</button>
          <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="fecharAddAdic()">Cancelar</button>
        </div>
      </div>`
    :`<button class="btn-add-prod" onclick="abrirAddAdic()">+ Novo acréscimo</button>`
  );
}

function iniciarEditAdic(id){editAdicId=id;addAdicAberto=false;renderAdicionais();setTimeout(()=>document.getElementById('ae-nome-'+id)?.focus(),40);}
function cancelarEditAdic(){editAdicId=null;renderAdicionais();}

function salvarEditAdic(id){
  const nome=document.getElementById('ae-nome-'+id)?.value.trim();
  const preco=parseFloat(document.getElementById('ae-preco-'+id)?.value);
  if(!nome){showToast('⚠️ Digite o nome','tok-err');return;}
  if(isNaN(preco)||preco<0){showToast('⚠️ Preço inválido','tok-err');return;}
  const arr=getAdicionaisAdmin(),idx=arr.findIndex(a=>a.id===id);
  if(idx!==-1){arr[idx].nome=nome;arr[idx].preco=preco;saveAdicionaisAdmin(arr);}
  editAdicId=null;renderAdicionais();showToast(`✅ "${nome}" atualizado!`,'tok-ok');
}

function removerAdic(id){
  const arr=getAdicionaisAdmin(),a=arr.find(x=>x.id===id);
  if(!a||!confirm(`Remover "${a.nome}"?`))return;
  saveAdicionaisAdmin(arr.filter(x=>x.id!==id));
  renderAdicionais();showToast(`🗑️ "${a.nome}" removido`,'tok-info');
}

function abrirAddAdic(){addAdicAberto=true;editAdicId=null;renderAdicionais();setTimeout(()=>document.getElementById('an-nome')?.focus(),40);}
function fecharAddAdic(){addAdicAberto=false;renderAdicionais();}

function salvarNovoAdic(){
  const nome=document.getElementById('an-nome')?.value.trim();
  const preco=parseFloat(document.getElementById('an-preco')?.value);
  if(!nome){showToast('⚠️ Digite o nome do acréscimo','tok-err');return;}
  if(isNaN(preco)||preco<0){showToast('⚠️ Preço inválido','tok-err');return;}
  const arr=getAdicionaisAdmin();
  arr.push({id:'ac_'+Date.now(),nome,preco});
  saveAdicionaisAdmin(arr);
  addAdicAberto=false;renderAdicionais();showToast(`✅ "${nome}" adicionado!`,'tok-ok');
}

// ── BAIRROS E TAXAS DE ENTREGA (gerenciado igual aos acréscimos) ──
function getBairrosAdmin(){
  const saved=localStorage.getItem('tcho_bairros');
  return saved?JSON.parse(saved):[...TCHO.bairros];
}
function saveBairrosAdmin(arr){
  arr.sort((a,b)=>a.nome.localeCompare(b.nome));            // mantém em ordem alfabética
  localStorage.setItem('tcho_bairros',JSON.stringify(arr));
  salvarCardapioFS('bairros',{lista:arr});                  // reflete no site do cliente
}

// ── ENTREGA: sugerir bairros por distância (aditivo — não mexe nos atuais) ──
// Lista de bairros candidatos da região (Norte de BH / Venda Nova / Pampulha).
// Só os que NÃO estão na sua lista e caírem no raio viram sugestão.
const BH_BAIRROS_CANDIDATOS = ['Venda Nova','Céu Azul','Serra Verde','Rio Branco','Mantiqueira','Piratininga','Letícia','Santa Mônica','Jardim Leblon','Copacabana','Minascaixa','Jaqueline','Floramar','Guarani','Jardim Guanabara','Tupi','Aarão Reis','Novo Aarão Reis','Conjunto Paulo VI','Ribeiro de Abreu','São Gabriel','Belmonte','Jardim Vitória','Maria Goretti','Ouro Preto','Castelo','Jaraguá','Braúnas','São Luiz','Liberdade','Santa Amélia','Santa Branca','Planalto','Itapoã','Serrano','Universitário','Confisco','Dona Clara','Indaiá','São Francisco','Heliópolis','Etelvina Carneiro','Vila Clóris','Nova Pampulha','Justinópolis'];

const _geoCache = JSON.parse(localStorage.getItem('tcho_geo')||'{}');
async function geocodeOSM(q){
  const key=q.toLowerCase().trim();
  if(_geoCache[key]) return _geoCache[key];
  try{
    const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,{headers:{'Accept':'application/json'}});
    const d=await r.json();
    if(d && d[0]){ const res={lat:parseFloat(d[0].lat),lng:parseFloat(d[0].lon)}; _geoCache[key]=res; localStorage.setItem('tcho_geo',JSON.stringify(_geoCache)); return res; }
  }catch(e){ console.error('geocode:',e); }
  return null;
}
function haversineKm(a,b){
  const R=6371, toR=x=>x*Math.PI/180;
  const dLat=toR(b.lat-a.lat), dLng=toR(b.lng-a.lng);
  const s=Math.sin(dLat/2)**2 + Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}
const _sleep=ms=>new Promise(r=>setTimeout(r,ms));

function carregarConfigEntrega(){
  let s=null;
  try{ s=JSON.parse(localStorage.getItem('tcho_entrega')||'null'); }catch(e){}
  const set=(id,v)=>{const el=document.getElementById(id); if(el && v!=null && el.value==='') el.value=v;};
  if(s){ set('ent-endereco',s.endereco); set('ent-raio',s.raioKm); set('ent-taxabase',s.taxaBase); set('ent-taxakm',s.taxaKm); }
  db.collection('config').doc('entrega').get().then(d=>{ if(d.exists){ const x=d.data(); localStorage.setItem('tcho_entrega',JSON.stringify(x)); set('ent-endereco',x.endereco); set('ent-raio',x.raioKm); set('ent-taxabase',x.taxaBase); set('ent-taxakm',x.taxaKm);} }).catch(()=>{});
}

async function buscarBairrosNoRaio(){
  const endereco=document.getElementById('ent-endereco').value.trim();
  const raio=parseFloat(document.getElementById('ent-raio').value)||0;
  const base=parseFloat(document.getElementById('ent-taxabase').value)||0;
  const perKm=parseFloat(document.getElementById('ent-taxakm').value)||0;
  const out=document.getElementById('ent-resultado');
  if(!endereco){ showToast('⚠️ Informe o endereço da loja','tok-err'); return; }
  if(raio<=0){ showToast('⚠️ Informe o raio (km)','tok-err'); return; }
  // salva a config de entrega (não mexe nos bairros)
  const cfg={endereco,raioKm:raio,taxaBase:base,taxaKm:perKm};
  localStorage.setItem('tcho_entrega',JSON.stringify(cfg));
  db.collection('config').doc('entrega').set(cfg,{merge:true}).catch(()=>{});

  out.innerHTML='<div style="font-size:.75rem;color:var(--muted)">📍 Localizando seu endereço...</div>';
  const loja=await geocodeOSM(endereco);
  if(!loja){ out.innerHTML='<div style="font-size:.75rem;color:#e74c3c">❌ Não localizei esse endereço. Inclua bairro, cidade e "MG".</div>'; return; }

  const jaAtende=new Set(getBairrosAdmin().map(b=>(b.nome||'').toLowerCase().trim()));
  const candidatos=BH_BAIRROS_CANDIDATOS.filter(n=>!jaAtende.has(n.toLowerCase().trim()));
  const achados=[];
  for(let i=0;i<candidatos.length;i++){
    out.innerHTML=`<div style="font-size:.75rem;color:var(--muted)">🔎 Analisando bairros... ${i+1}/${candidatos.length}</div>`;
    const nb=candidatos[i];
    const q=`${nb}, Belo Horizonte, MG`;
    const jaCache=!!_geoCache[q.toLowerCase().trim()];
    const co=await geocodeOSM(q);
    if(co){
      const dist=haversineKm(loja,co);
      if(dist<=raio) achados.push({nome:nb,dist,taxa:Math.max(0,Math.round(base+perKm*dist))});
    }
    if(!jaCache) await _sleep(1100);   // respeita o limite do OpenStreetMap (só quando não veio do cache)
  }
  achados.sort((a,b)=>a.dist-b.dist);
  if(!achados.length){ out.innerHTML=`<div style="font-size:.75rem;color:var(--muted)">Nenhum bairro novo dentro de ${raio} km (ou já estão todos na sua lista).</div>`; return; }
  out.innerHTML=`<div style="font-size:.72rem;color:var(--muted);margin-bottom:6px">${achados.length} bairro(s) sugerido(s) dentro de ${raio} km:</div>`+achados.map(a=>`
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #2a2520">
      <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:.82rem;color:var(--cream)">${a.nome}</div><div style="font-size:.66rem;color:var(--muted)">${a.dist.toFixed(1)} km · taxa sugerida R$${a.taxa}</div></div>
      <button class="opc-btn" onclick="adicionarBairroSugerido('${a.nome.replace(/'/g,"\\'")}',${a.taxa},this)">➕ Adicionar</button>
    </div>`).join('');
}

function adicionarBairroSugerido(nome,taxa,btn){
  const arr=getBairrosAdmin();
  if(arr.some(b=>(b.nome||'').toLowerCase().trim()===nome.toLowerCase().trim())){ showToast('Esse bairro já está na lista','tok-info'); return; }
  arr.push({nome,taxa});
  saveBairrosAdmin(arr);
  renderBairros();
  showToast(`✅ "${nome}" adicionado (R$${taxa})`,'tok-ok');
  if(btn){ btn.textContent='✓ Adicionado'; btn.disabled=true; btn.style.opacity='.6'; }
}
let editBairroIdx=null, addBairroAberto=false;

function renderBairros(){
  const el=document.getElementById('lista-bairros'); if(!el) return;
  const arr=getBairrosAdmin();
  const inp='background:var(--card);border:1px solid var(--orange);border-radius:6px;color:var(--cream);font-size:.78rem;padding:5px 7px;outline:none';
  el.innerHTML=`<div style="font-size:.7rem;color:var(--muted);margin-bottom:6px">${arr.length} bairro${arr.length!==1?'s':''} atendido${arr.length!==1?'s':''}</div>`
  + arr.map((b,i)=>{
    if(editBairroIdx===i){
      return `<div class="prod-item"><div style="display:flex;gap:8px;align-items:center;padding:8px 0;flex-wrap:wrap">
        <input style="${inp};flex:1;min-width:120px" id="be-nome-${i}" value="${(b.nome||'').replace(/"/g,'&quot;')}">
        <span style="font-size:.72rem;color:var(--muted);flex-shrink:0">R$</span>
        <input style="${inp};width:70px;flex-shrink:0" id="be-taxa-${i}" type="number" min="0" step="0.5" value="${b.taxa}">
        <button class="opc-btn" onclick="salvarEditBairro(${i})">✓ Salvar</button>
        <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="cancelarEditBairro()">Cancelar</button>
      </div></div>`;
    }
    return `<div class="prod-item"><div style="display:flex;align-items:center;gap:8px;padding:8px 0">
      <div style="flex:1;min-width:0"><div class="prod-nome">${b.nome}</div></div>
      <div class="prod-preco" style="flex-shrink:0">R$${b.taxa}</div>
      <button class="btn-edit-prod" onclick="iniciarEditBairro(${i})" title="Editar">✏️</button>
      <button class="btn-del-prod" onclick="removerBairro(${i})" title="Remover">🗑️</button>
    </div></div>`;
  }).join('')
  + (addBairroAberto
    ? `<div class="new-prod-form" style="margin-top:6px">
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
          <input style="${inp};flex:1;min-width:140px" id="bn-nome" placeholder="Nome do bairro" onkeydown="if(event.key==='Enter')salvarNovoBairro()">
          <span style="font-size:.72rem;color:var(--muted);flex-shrink:0">R$</span>
          <input style="${inp};width:70px;flex-shrink:0" id="bn-taxa" type="number" min="0" step="0.5" placeholder="Taxa">
        </div>
        <div style="display:flex;gap:6px">
          <button class="opc-btn" onclick="salvarNovoBairro()">✓ Adicionar</button>
          <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="fecharAddBairro()">Cancelar</button>
        </div>
      </div>`
    : `<button class="btn-add-prod" onclick="abrirAddBairro()">+ Novo bairro</button>`
  );
}
function iniciarEditBairro(i){editBairroIdx=i;addBairroAberto=false;renderBairros();setTimeout(()=>document.getElementById('be-nome-'+i)?.focus(),40);}
function cancelarEditBairro(){editBairroIdx=null;renderBairros();}
function salvarEditBairro(i){
  const nome=document.getElementById('be-nome-'+i)?.value.trim();
  const taxa=parseFloat(document.getElementById('be-taxa-'+i)?.value);
  if(!nome){showToast('⚠️ Digite o nome do bairro','tok-err');return;}
  if(isNaN(taxa)||taxa<0){showToast('⚠️ Taxa inválida','tok-err');return;}
  const arr=getBairrosAdmin();
  if(arr[i]){arr[i].nome=nome;arr[i].taxa=taxa;saveBairrosAdmin(arr);}
  editBairroIdx=null;renderBairros();showToast(`✅ "${nome}" atualizado!`,'tok-ok');
}
function removerBairro(i){
  const arr=getBairrosAdmin(),b=arr[i];
  if(!b||!confirm(`Remover o bairro "${b.nome}"? Ele deixará de ser atendido no site.`))return;
  arr.splice(i,1);saveBairrosAdmin(arr);
  renderBairros();showToast(`🗑️ "${b.nome}" removido`,'tok-info');
}
function abrirAddBairro(){addBairroAberto=true;editBairroIdx=null;renderBairros();setTimeout(()=>document.getElementById('bn-nome')?.focus(),40);}
function fecharAddBairro(){addBairroAberto=false;renderBairros();}
function salvarNovoBairro(){
  const nome=document.getElementById('bn-nome')?.value.trim();
  const taxa=parseFloat(document.getElementById('bn-taxa')?.value);
  if(!nome){showToast('⚠️ Digite o nome do bairro','tok-err');return;}
  if(isNaN(taxa)||taxa<0){showToast('⚠️ Taxa inválida','tok-err');return;}
  const arr=getBairrosAdmin();
  if(arr.some(x=>(x.nome||'').toLowerCase()===nome.toLowerCase())){showToast('⚠️ Esse bairro já existe','tok-err');return;}
  arr.push({nome,taxa});saveBairrosAdmin(arr);
  addBairroAberto=false;renderBairros();showToast(`✅ "${nome}" adicionado!`,'tok-ok');
}

function renderCardapio(){renderLista('b','lista-burguers');renderLista('e','lista-extras');renderLista('c','lista-combo');renderCatTitles();renderCustomCats();renderNovaCatArea();renderAdicionais();}
function toggleAtivo(id,val){
  est[id].ativo=val;
  if(id.startsWith('cp_')){const arr=getProdsCustom(),idx=arr.findIndex(x=>x.id===id);if(idx!==-1){arr[idx].ativo=val;saveProdsCustom(arr);}}
  salvarEstoque(id);
  const p=PRODS.find(x=>x.id===id)||getProdsCustom().find(x=>x.id===id);
  renderCardapio();showToast(`${val?'✅':'🔒'} ${p?.n||p?.nome||id} ${val?'ativo':'inativo'}`,'tok-ok');
}
function setModo(id,modo){est[id].modo=modo;salvarEstoque(id);document.getElementById(`inp-${id}`).style.display=modo==='qtd'?'block':'none';document.querySelectorAll(`#stock-${id} .stock-btn`).forEach(b=>b.classList.toggle('active',b.textContent.trim()===(modo==='inf'?'∞':'Qtd')));const row=document.getElementById(`prow-${id}`);if(row){row.querySelectorAll('.sbadge').forEach(b=>b.remove());document.getElementById(`stock-${id}`).insertAdjacentHTML('beforeend',renderEstoqueBadge(id));}}
function setQtd(id,val){est[id].qtd=Math.max(0,parseInt(val)||0);salvarEstoque(id);const row=document.getElementById(`prow-${id}`);if(row){row.querySelectorAll('.sbadge').forEach(b=>b.remove());document.getElementById(`stock-${id}`).insertAdjacentHTML('beforeend',renderEstoqueBadge(id));}}

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

// ── RECUPERAÇÃO DE CLIENTES ────────────────────────────────────
let clientesInativos=[];

function initRecuperacao(){
  popularCuponsRec();
  atualizarMsgRecuperacao();
}

function popularCuponsRec(){
  const sel=document.getElementById('rec-cupom');if(!sel)return;
  const ativos=cupons.filter(c=>c.ativo&&!isExp(c));
  sel.innerHTML=`<option value="">Sem cupom (mensagem de retorno)</option>`+
    ativos.map(c=>`<option value="${c._id}">${c.codigo} — ${descontoLabel(c)}</option>`).join('');
}

function atualizarMsgRecuperacao(){
  const cupomId=document.getElementById('rec-cupom')?.value;
  const cupom=cupons.find(c=>c._id===cupomId);
  const link='https://tchoburguer.com/cliente/';
  let msg;
  if(cupom){
    const desc=cupom.tipo==='pct'?`${cupom.valor}% de desconto`:
               cupom.tipo==='fixo'?`R$${cupom.valor} de desconto`:
               cupom.tipo==='frete'?'frete grátis':`${cupom.item||'item'} grátis`;
    msg=`Olá {nome}! 👋\n\nSentimos sua falta no Tcho Burguer! 🍔\n\nQue tal voltar com um presente especial?\n\nUse o cupom *${cupom.codigo}* e ganhe *${desc}*!${cupom.descricao?'\n\n📌 '+cupom.descricao:''}\n\nPeça agora: ${link}\n\nTe esperamos! 🧡`;
  }else{
    msg=`Olá {nome}! 👋\n\nSentimos sua falta no Tcho Burguer! 🍔\n\nTemos novidades e continuamos fazendo os melhores burgers artesanais de BH!\n\nPeça agora: ${link}\n\nTe esperamos! 🧡`;
  }
  const el=document.getElementById('rec-msg');if(el)el.value=msg;
}

async function buscarInativos(){
  const dias=parseInt(document.getElementById('rec-dias')?.value)||14;
  const recLista=document.getElementById('rec-lista');
  recLista.innerHTML='<div style="color:var(--muted);font-size:.78rem;padding:10px 0">🔍 Buscando clientes nos últimos 12 meses...</div>';
  let todos=[];
  try{
    const limite=new Date();limite.setMonth(limite.getMonth()-12);
    const snap=await db.collection('pedidos')
      .where('criadoEm','>=',firebase.firestore.Timestamp.fromDate(limite)).get();
    if(snap&&snap.docs&&snap.docs.length>0){
      todos=snap.docs.map(d=>{const dt=d.data();return{...dt,_id:d.id,hora:dt.criadoEm?.toDate?.()||dt.hora?.toDate?.()||new Date()};});
    }
  }catch(e){todos=[...pedidos];}
  if(!todos.length){recLista.innerHTML='<div class="empty"><div class="empty-icon">📭</div><div>Sem dados suficientes</div></div>';return;}
  // Agrupa por telefone
  const mapa={};
  todos.forEach(p=>{
    const tel=(p.tel||'').replace(/\D/g,'');
    if(!tel||tel.length<10)return;
    if(!mapa[tel]){mapa[tel]={nome:p.nome,tel:p.tel,telLimpo:tel,ultimoPedido:p.hora,qtd:0,gasto:0};}
    if(new Date(p.hora)>new Date(mapa[tel].ultimoPedido)){mapa[tel].ultimoPedido=p.hora;mapa[tel].nome=p.nome;}
    mapa[tel].qtd++;mapa[tel].gasto+=(p.total||0);
  });
  const corte=new Date(Date.now()-dias*86400000);
  clientesInativos=Object.values(mapa)
    .filter(c=>new Date(c.ultimoPedido)<corte)
    .sort((a,b)=>new Date(a.ultimoPedido)-new Date(b.ultimoPedido));
  renderInativos();
}

function renderInativos(){
  const lista=clientesInativos;
  const el=document.getElementById('rec-lista');
  if(!lista.length){el.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div>Nenhum cliente inativo nesse período!</div></div>';return;}
  const agora=new Date();
  const msgTpl=document.getElementById('rec-msg')?.value||'';
  const r=n=>'R$'+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2});
  el.innerHTML=`
    <div style="font-size:.75rem;color:var(--muted);margin-bottom:10px;padding:0 2px">
      ${lista.length} cliente${lista.length!==1?'s':''} inativo${lista.length!==1?'s':''}
    </div>
    ${lista.map(c=>{
      const diasInativo=Math.floor((agora-new Date(c.ultimoPedido))/86400000);
      const cor=diasInativo>30?'#e74c3c':'#f39c12';
      const msg=msgTpl.replace(/\{nome\}/g,c.nome||'cliente');
      const waLink=`https://wa.me/55${c.telLimpo}?text=${encodeURIComponent(msg)}`;
      return`<div style="background:var(--card);border:1px solid #2a2520;border-radius:10px;padding:14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-weight:700;font-size:.95rem;color:var(--cream);margin-bottom:4px">${c.nome||'—'}</div>
            <div style="font-size:.82rem;color:var(--orange);font-weight:600">📞 ${c.tel||'—'}</div>
          </div>
          <div style="text-align:center;background:#1a1510;border-radius:8px;padding:6px 10px;flex-shrink:0">
            <div style="font-size:1.1rem;font-weight:700;color:${cor}">${diasInativo}d</div>
            <div style="font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">sem pedir</div>
          </div>
        </div>
        <div style="font-size:.68rem;color:var(--muted);margin-bottom:12px">
          ${c.qtd} pedido${c.qtd!==1?'s':''} realizados · total gasto: ${r(c.gasto)}
        </div>
        <a href="${waLink}" target="_blank"
          style="display:flex;align-items:center;justify-content:center;gap:8px;background:#25d366;color:#000;font-weight:700;font-size:.85rem;padding:11px;border-radius:8px;text-decoration:none;letter-spacing:.5px;width:100%;box-sizing:border-box">
          💬 Disparar mensagem no WhatsApp
        </a>
      </div>`;
    }).join('')}`;
}

// ── CRM / MARKETING (aba própria) ──────────────────────────────
let crmClientes=[];        // cache dos clientes carregados do Firestore
let crmFiltro='todos';

function carregarCRM(){
  showCrm('clientes');
  const el=document.getElementById('crm-clientes-lista');
  if(el) el.innerHTML='<div style="color:var(--muted);font-size:.78rem;padding:10px 0">🔍 Carregando clientes...</div>';
  db.collection('clientes').get().then(snap=>{
    crmClientes=snap.docs.map(d=>({_id:d.id,...d.data()}));
    renderClientesCRM();
    renderDashCRM();
  }).catch(e=>{
    if(el) el.innerHTML='<div class="empty"><div class="empty-icon">⚠️</div><div>Erro ao carregar clientes</div></div>';
    console.error('carregarCRM:',e);
  });
}

// Move os painéis de marketing (Cupons/Fidelidade/Recuperação), que vivem no
// HTML dentro do Config, para dentro do conteúdo do CRM. Feito 1x via JS pra
// não precisar duplicar/recortar formulários grandes.
let _crmMktMovido=false;
function moverMarketingParaCRM(){
  if(_crmMktMovido) return;
  const content=document.getElementById('crm-content'); if(!content) return;
  ['inner-cupons','inner-fidelidade','inner-recuperacao'].forEach(id=>{const el=document.getElementById(id); if(el) content.appendChild(el);});
  _crmMktMovido=true;
}

function showCrm(t){
  moverMarketingParaCRM();
  document.querySelectorAll('#page-crm .cfg-side-item').forEach(b=>b.classList.toggle('active',b.dataset.crm===t));
  document.querySelectorAll('#page-crm .cfg-panel').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('crm-'+t)||document.getElementById('inner-'+t);
  if(pg) pg.classList.add('active');
  if(t==='clientes')    renderClientesCRM();
  if(t==='dashboard')   renderDashCRM();
  if(t==='campanhas')   carregarCampanhas();
  if(t==='cupons')      renderCupons();
  if(t==='recuperacao') initRecuperacao();
}

const CRM_FILTROS=[
  {k:'todos',l:'Todos'},{k:'novos',l:'Novos'},{k:'recorrentes',l:'Recorrentes'},{k:'vip',l:'VIP'},
  {k:'i7',l:'Parados 7d'},{k:'i15',l:'Parados 15d'},{k:'i30',l:'Parados 30d'},
];
function setCrmFiltro(k){ crmFiltro=k; renderClientesCRM(); }

function filtrarClientesCRM(){
  return crmClientes.filter(c=>{
    const cls=classificarCliente(c).label;
    const dias=crmDiasDesde(c.dataUltimaCompra);
    switch(crmFiltro){
      case 'novos':       return cls==='Novo';
      case 'recorrentes': return cls==='Recorrente';
      case 'vip':         return cls==='VIP';
      case 'i7':          return dias!=null && dias>=7;
      case 'i15':         return dias!=null && dias>=15;
      case 'i30':         return dias!=null && dias>=30;
      default:            return true;
    }
  });
}

function renderClientesCRM(){
  const fEl=document.getElementById('crm-filtros');
  if(fEl){
    fEl.innerHTML=CRM_FILTROS.map(f=>{
      const on=crmFiltro===f.k;
      return `<button onclick="setCrmFiltro('${f.k}')" style="padding:6px 11px;border-radius:20px;border:1px solid ${on?'var(--orange)':'#3a3530'};background:${on?'var(--orange)':'var(--card)'};color:${on?'#000':'var(--cream)'};font-size:.72rem;font-weight:700;cursor:pointer">${f.l}</button>`;
    }).join('');
  }
  const el=document.getElementById('crm-clientes-lista');
  if(!el) return;
  if(!crmClientes.length){ el.innerHTML='<div class="empty"><div class="empty-icon">👥</div><div>Nenhum cliente cadastrado ainda</div><div style="font-size:.72rem;color:var(--muted);margin-top:6px">Os clientes aparecem aqui sozinhos conforme os pedidos entram.</div></div>'; return; }
  const lista=filtrarClientesCRM().sort((a,b)=>(b.valorTotalGasto||0)-(a.valorTotalGasto||0));
  if(!lista.length){ el.innerHTML='<div class="empty"><div class="empty-icon">🔍</div><div>Nenhum cliente nesse filtro</div></div>'; return; }
  const r=n=>'R$'+Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  el.innerHTML=`<div style="font-size:.72rem;color:var(--muted);margin-bottom:10px">${lista.length} cliente${lista.length!==1?'s':''}</div>`+lista.map(c=>{
    const cls=classificarCliente(c);
    const dias=crmDiasDesde(c.dataUltimaCompra);
    const tel=crmTelLimpo(c.telefone||c._id);
    const wa=`https://wa.me/55${tel}?text=${encodeURIComponent('Olá '+(c.nome||'cliente')+'! 🍔 Aqui é da Tcho Burguer.')}`;
    return `<div style="background:var(--card);border:1px solid #2a2520;border-radius:10px;padding:13px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:.95rem;color:var(--cream)">${c.nome||'—'}</div>
          <div style="font-size:.8rem;color:var(--orange);font-weight:600">📱 ${c.telefone||c._id}</div>
        </div>
        <span style="flex-shrink:0;font-size:.6rem;font-weight:800;padding:3px 8px;border-radius:20px;background:${cls.cor}22;color:${cls.cor};border:1px solid ${cls.cor}">${cls.label}</span>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:.7rem;color:var(--muted);margin-bottom:10px">
        <span>🛒 <b style="color:var(--cream)">${c.quantidadePedidos||0}</b> pedidos</span>
        <span>💰 <b style="color:var(--cream)">${r(c.valorTotalGasto)}</b></span>
        <span>🎫 ticket <b style="color:var(--cream)">${r(c.ticketMedio)}</b></span>
        <span>🕐 ${dias==null?'—':(dias===0?'hoje':dias+'d atrás')}</span>
      </div>
      <a href="${wa}" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:8px;background:#25d366;color:#000;font-weight:700;font-size:.8rem;padding:9px;border-radius:8px;text-decoration:none;width:100%;box-sizing:border-box">💬 WhatsApp</a>
    </div>`;
  }).join('');
}

function renderDashCRM(){
  const el=document.getElementById('crm-dash-cards');
  if(!el) return;
  const total=crmClientes.length;
  const ativos=crmClientes.filter(c=>{const d=crmDiasDesde(c.dataUltimaCompra);return d!=null&&d<=30;}).length;
  const inativos15=crmClientes.filter(c=>{const d=crmDiasDesde(c.dataUltimaCompra);return d!=null&&d>=15;}).length;
  const cuponsGerados=(typeof cupons!=='undefined')?cupons.length:0;
  const cuponsUsados=(typeof cupons!=='undefined')?cupons.reduce((a,c)=>a+(c.usosFeitos||0),0):0;
  const card=(n,l,cor)=>`<div class="fin-card"><div class="fin-card-n" style="color:${cor||'var(--orange)'}">${n}</div><div class="fin-card-l">${l}</div></div>`;
  el.innerHTML=
    card(total,'Total de clientes')+
    card(ativos,'Ativos (30d)','#27ae60')+
    card(inativos15,'Parados 15d+','#f39c12')+
    card('—','Recuperados','var(--muted)')+
    card(cuponsGerados,'Cupons gerados')+
    card(cuponsUsados,'Cupons usados','#27ae60');
}

// ── CRM Campanhas (Fase 2) ────────────────────────────────────
let campanhas=[];

function abrirFormCampanha(){
  document.getElementById('camp-form').style.display='block';
  ['camp-nome','camp-dias','camp-minped','camp-mingasto','camp-cupompct','camp-cupomval'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('camp-msg').value='Olá {nome}, sentimos sua falta! 🍔\n\nUse o cupom {cupom} e volte a pedir pelo nosso site.';
  document.getElementById('camp-gerarcupom').checked=false;
  toggleCampCupom();
  document.getElementById('camp-resultado').innerHTML='';
  previewCampanha();
}
function fecharFormCampanha(){ const f=document.getElementById('camp-form'); if(f) f.style.display='none'; }
function toggleCampCupom(){
  const on=document.getElementById('camp-gerarcupom').checked;
  document.getElementById('camp-cupom-cfg').style.display=on?'grid':'none';
}

// Filtra os clientes (já carregados no CRM) pela regra da campanha.
function filtrarClientesCampanha(){
  const dias=parseInt(document.getElementById('camp-dias').value)||0;
  const minPed=parseInt(document.getElementById('camp-minped').value)||0;
  const minGasto=parseFloat(document.getElementById('camp-mingasto').value)||0;
  return crmClientes.filter(c=>{
    const d=crmDiasDesde(c.dataUltimaCompra);
    if(dias>0 && !(d!=null && d>=dias)) return false;
    if(minPed>0 && (c.quantidadePedidos||0)<minPed) return false;
    if(minGasto>0 && (c.valorTotalGasto||0)<minGasto) return false;
    return true;
  });
}
function previewCampanha(){
  const el=document.getElementById('camp-preview'); if(!el) return;
  const n=filtrarClientesCampanha().length;
  el.innerHTML=`🎯 <b style="color:var(--cream)">${n}</b> cliente${n!==1?'s':''} nesse filtro`;
}

// Gera um código de cupom individual a partir do nome (sem acento) + % + aleatório.
function gerarCodigoCupom(nome,pct){
  const base=(nome||'CLIENTE').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z]/g,'').toUpperCase().slice(0,6)||'CLIENTE';
  const rnd=Math.random().toString(36).slice(2,5).toUpperCase();
  return `${base}${pct}${rnd}`;
}

async function gerarCampanha(){
  const nome=document.getElementById('camp-nome').value.trim();
  if(!nome){ showToast('⚠️ Dê um nome à campanha','tok-err'); return; }
  const msgTpl=document.getElementById('camp-msg').value.trim();
  if(!msgTpl){ showToast('⚠️ Escreva a mensagem','tok-err'); return; }
  const alvo=filtrarClientesCampanha();
  if(!alvo.length){ showToast('⚠️ Nenhum cliente nesse filtro','tok-err'); return; }
  const gerarCupom=document.getElementById('camp-gerarcupom').checked;
  const pct=parseInt(document.getElementById('camp-cupompct').value)||10;
  const valDias=parseInt(document.getElementById('camp-cupomval').value)||7;
  if(gerarCupom && (pct<1||pct>100)){ showToast('⚠️ Desconto entre 1 e 100%','tok-err'); return; }

  const dias=parseInt(document.getElementById('camp-dias').value)||0;
  const minPed=parseInt(document.getElementById('camp-minped').value)||0;
  const minGasto=parseFloat(document.getElementById('camp-mingasto').value)||0;
  const hojeStr=dataLocalHoje();

  // Salva a campanha
  const campanha={nome,dias,minPedidos:minPed,minGasto,mensagem:msgTpl,gerarCupom,cupomPct:gerarCupom?pct:0,cupomValidadeDias:gerarCupom?valDias:0,totalClientes:alvo.length,criadoEm:hojeStr,ts:Date.now()};
  let campId=null;
  try{ const ref=await db.collection('campanhas').add(campanha); campId=ref.id; }catch(e){ console.error('campanha:',e); }

  const val=dataLocalHoje(new Date(Date.now()+valDias*86400000));

  // Gera cupom + link por cliente
  const linhas=[];
  for(const c of alvo){
    let codigo='';
    if(gerarCupom){
      codigo=gerarCodigoCupom(c.nome,pct);
      const cupom={codigo,tipo:'pct',valor:pct,minimo:0,usosMax:1,usosFeitos:0,validade:val,descricao:`Campanha: ${nome}`,item:'',ativo:true,criadoEm:hojeStr,clienteId:c._id,campanhaId:campId};
      try{ await db.collection('cupons').add(cupom); }catch(e){ console.error('cupom:',e); }
    }
    const msg=msgTpl.replace(/\{nome\}/g,c.nome||'cliente').replace(/\{cupom\}/g,codigo||'');
    const tel=crmTelLimpo(c.telefone||c._id);
    linhas.push({nome:c.nome,tel,codigo,wa:`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`});
  }

  showToast(`🚀 Campanha "${nome}" gerada — ${alvo.length} cliente(s)`,'tok-ok');
  fecharFormCampanha();
  renderResultadoCampanha(nome,linhas,gerarCupom);
  try{ renderCupons(); }catch(e){}
  carregarCampanhas();
}

function renderResultadoCampanha(nome,linhas,comCupom){
  const el=document.getElementById('camp-resultado'); if(!el) return;
  el.innerHTML=`<div style="background:var(--card);border:1px solid #27ae60;border-radius:10px;padding:12px;margin-bottom:12px">
    <div style="font-weight:700;color:#27ae60;margin-bottom:4px">✅ Campanha "${nome}" pronta — ${linhas.length} cliente(s)</div>
    <div style="font-size:.72rem;color:var(--muted)">Clique em "Enviar" pra disparar no WhatsApp${comCupom?' (cada um já com o cupom dele)':''}.</div>
  </div>`+linhas.map(l=>`
    <div style="background:var(--card);border:1px solid #2a2520;border-radius:10px;padding:11px;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div style="min-width:0">
        <div style="font-weight:700;font-size:.85rem;color:var(--cream)">${l.nome||'—'}</div>
        <div style="font-size:.7rem;color:var(--muted)">📱 ${l.tel}${l.codigo?` · 🎟️ <b style="color:var(--orange)">${l.codigo}</b>`:''}</div>
      </div>
      <a href="${l.wa}" target="_blank" style="flex-shrink:0;background:#25d366;color:#000;font-weight:700;font-size:.75rem;padding:8px 12px;border-radius:8px;text-decoration:none">💬 Enviar</a>
    </div>`).join('');
}

function carregarCampanhas(){
  db.collection('campanhas').get().then(snap=>{
    campanhas=snap.docs.map(d=>({_id:d.id,...d.data()})).sort((a,b)=>(b.ts||0)-(a.ts||0));
    renderCampanhas();
  }).catch(e=>console.error('carregarCampanhas:',e));
}
function renderCampanhas(){
  const el=document.getElementById('camp-lista'); if(!el) return;
  if(!campanhas.length){ el.innerHTML=''; return; }
  el.innerHTML=`<div style="font-size:.7rem;color:var(--orange);text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px">Campanhas anteriores</div>`+campanhas.map(c=>`
    <div style="background:var(--surface);border:1px solid #2a2520;border-radius:10px;padding:11px;margin-bottom:7px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="font-weight:700;font-size:.85rem;color:var(--cream)">📣 ${c.nome}</div>
        <div style="font-size:.66rem;color:var(--muted)">${c.criadoEm||''}</div>
      </div>
      <div style="font-size:.68rem;color:var(--muted);margin-top:4px">${c.totalClientes||0} cliente(s)${c.gerarCupom?` · cupom ${c.cupomPct}% (${c.cupomValidadeDias}d)`:''}${c.dias?` · parados ${c.dias}d+`:''}${c.minPedidos?` · ${c.minPedidos}+ pedidos`:''}${c.minGasto?` · gastou R$${c.minGasto}+`:''}</div>
    </div>`).join('');
}

// ── FINANCEIRO ─────────────────────────────────────────────────
let finPeriodo = 'hoje';
let finPedidosList = [];
let despesas = [];            // contas a pagar do período carregado
let finTab = 'receber';       // sub-aba ativa: receber | pagar | fluxo
let despesaFoto = null;       // foto da nota (data URL comprimido) aguardando salvar

// Plano de contas: categorias padrão (editáveis pelo dono, igual aos bairros)
const CATEGORIAS_DESPESA = [
  'Insumos / Mercadoria',
  'Bebidas',
  'Embalagens / Descartáveis',
  'Gás',
  'Água / Luz / Internet',
  'Aluguel',
  'Salários / Funcionários',
  'Marketing / Divulgação',
  'Manutenção / Equipamentos',
  'Taxas / Impostos',
  'Entrega / Motoboy',
  'Outros',
];
function getCategoriasAdmin(){
  const s=localStorage.getItem('tcho_cat_despesa');
  return s?JSON.parse(s):[...CATEGORIAS_DESPESA];
}
function saveCategoriasAdmin(arr){
  localStorage.setItem('tcho_cat_despesa',JSON.stringify(arr));
  salvarCardapioFS('cat_despesa',{lista:arr});   // sincroniza entre dispositivos
  popularCategoriasDespesa(true);                // atualiza o select de lançamento
}
function popularCategoriasDespesa(force){
  const sel=document.getElementById('desp-cat');
  if(!sel) return;
  if(sel.options.length && !force) return;       // popula uma vez (ou força ao editar)
  const atual=sel.value;
  sel.innerHTML=getCategoriasAdmin().map(c=>`<option value="${c}">${c}</option>`).join('');
  if(atual) sel.value=atual;
}

// ── Gerenciar categorias do plano de contas (add/editar/excluir) ──
let editCatIdx=null, addCatAberto=false;
function toggleGerenciarCat(){
  const box=document.getElementById('cat-gerenciar');
  const ch=document.getElementById('cat-chevron');
  if(!box) return;
  const abrir = box.style.display==='none';
  box.style.display = abrir ? 'block' : 'none';
  if(ch) ch.textContent = abrir ? '▲' : '▼';
  if(abrir) renderCategorias();
}
function renderCategorias(){
  const el=document.getElementById('lista-categorias'); if(!el) return;
  const arr=getCategoriasAdmin();
  const inp='background:var(--card);border:1px solid var(--orange);border-radius:6px;color:var(--cream);font-size:.78rem;padding:5px 7px;outline:none';
  el.innerHTML=arr.map((c,i)=>{
    if(editCatIdx===i){
      return `<div class="prod-item"><div style="display:flex;gap:8px;align-items:center;padding:8px 0;flex-wrap:wrap">
        <input style="${inp};flex:1;min-width:140px" id="ce-nome-${i}" value="${(c||'').replace(/"/g,'&quot;')}">
        <button class="opc-btn" onclick="salvarEditCat(${i})">✓ Salvar</button>
        <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="cancelarEditCat()">Cancelar</button>
      </div></div>`;
    }
    return `<div class="prod-item"><div style="display:flex;align-items:center;gap:8px;padding:8px 0">
      <div style="flex:1;min-width:0"><div class="prod-nome">🗂️ ${c}</div></div>
      <button class="btn-edit-prod" onclick="iniciarEditCat(${i})" title="Editar">✏️</button>
      <button class="btn-del-prod" onclick="removerCat(${i})" title="Remover">🗑️</button>
    </div></div>`;
  }).join('')
  + (addCatAberto
    ? `<div class="new-prod-form" style="margin-top:6px">
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
          <input style="${inp};flex:1;min-width:160px" id="cn-nome" placeholder="Nome da categoria" onkeydown="if(event.key==='Enter')salvarNovaCat()">
        </div>
        <div style="display:flex;gap:6px">
          <button class="opc-btn" onclick="salvarNovaCat()">✓ Adicionar</button>
          <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="fecharAddCat()">Cancelar</button>
        </div>
      </div>`
    : `<button class="btn-add-prod" onclick="abrirAddCat()">+ Nova categoria</button>`
  );
}
function iniciarEditCat(i){editCatIdx=i;addCatAberto=false;renderCategorias();setTimeout(()=>document.getElementById('ce-nome-'+i)?.focus(),40);}
function cancelarEditCat(){editCatIdx=null;renderCategorias();}
function salvarEditCat(i){
  const nome=document.getElementById('ce-nome-'+i)?.value.trim();
  if(!nome){showToast('⚠️ Digite o nome da categoria','tok-err');return;}
  const arr=getCategoriasAdmin();
  if(arr.some((c,j)=>j!==i && c.toLowerCase()===nome.toLowerCase())){showToast('⚠️ Categoria já existe','tok-err');return;}
  if(arr[i]!==undefined){arr[i]=nome;saveCategoriasAdmin(arr);}
  editCatIdx=null;renderCategorias();showToast(`✅ Categoria atualizada`,'tok-ok');
}
function removerCat(i){
  const arr=getCategoriasAdmin(),c=arr[i];
  if(c===undefined||!confirm(`Remover a categoria "${c}"?`))return;
  arr.splice(i,1);saveCategoriasAdmin(arr);
  renderCategorias();showToast(`🗑️ "${c}" removida`,'tok-info');
}
function abrirAddCat(){addCatAberto=true;editCatIdx=null;renderCategorias();setTimeout(()=>document.getElementById('cn-nome')?.focus(),40);}
function fecharAddCat(){addCatAberto=false;renderCategorias();}
function salvarNovaCat(){
  const nome=document.getElementById('cn-nome')?.value.trim();
  if(!nome){showToast('⚠️ Digite o nome da categoria','tok-err');return;}
  const arr=getCategoriasAdmin();
  if(arr.some(c=>c.toLowerCase()===nome.toLowerCase())){showToast('⚠️ Categoria já existe','tok-err');return;}
  arr.push(nome);saveCategoriasAdmin(arr);
  addCatAberto=false;renderCategorias();showToast(`✅ "${nome}" adicionada`,'tok-ok');
}

// Lê a foto/nota, redimensiona e comprime no próprio aparelho (evita doc gigante no Firestore)
// ── CÂMERA AO VIVO PARA A FOTO DA NOTA ─────────────────────────
// Abre a câmera traseira dentro do app (getUserMedia) e captura a nota na hora.
let camStreamNota = null;
async function abrirCameraNota(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showToast('Câmera indisponível — escolha o arquivo','tok-info');
    document.getElementById('desp-foto').click(); return;
  }
  let ov = document.getElementById('modal-camera-nota');
  if(!ov){
    ov = document.createElement('div'); ov.id='modal-camera-nota';
    ov.style.cssText='position:fixed;inset:0;background:#000;z-index:700;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px';
    ov.innerHTML=`
      <video id="cam-video" autoplay playsinline muted style="max-width:100%;max-height:74vh;background:#000"></video>
      <div style="color:#fff;font-size:.8rem;opacity:.8">Aponte para a nota e toque em capturar</div>
      <div style="display:flex;gap:16px;align-items:center;justify-content:center;padding-bottom:14px">
        <button onclick="fecharCameraNota()" style="padding:12px 18px;background:#2a2520;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer">✕ Cancelar</button>
        <button onclick="capturarFotoNota()" style="padding:14px 26px;background:linear-gradient(135deg,var(--orange),var(--orange2));color:#000;border:none;border-radius:10px;font-weight:800;font-size:1rem;cursor:pointer">📸 Capturar</button>
      </div>`;
    document.body.appendChild(ov);
  }
  ov.style.display='flex';
  try{
    camStreamNota = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    document.getElementById('cam-video').srcObject = camStreamNota;
  }catch(e){
    fecharCameraNota();
    showToast('Não consegui abrir a câmera — escolha o arquivo','tok-info');
    document.getElementById('desp-foto').click();
  }
}
function capturarFotoNota(){
  const v=document.getElementById('cam-video');
  if(!v || !v.videoWidth){ showToast('Aguarde a câmera carregar…','tok-err'); return; }
  const maxW=1000;
  const escala=Math.min(1, maxW/v.videoWidth);
  const w=Math.round(v.videoWidth*escala), h=Math.round(v.videoHeight*escala);
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  cv.getContext('2d').drawImage(v,0,0,w,h);
  despesaFoto=cv.toDataURL('image/jpeg',0.6);               // ~80-200KB, cabe no doc (<1MB)
  fecharCameraNota();
  mostrarPreviewFoto();
  showToast('📷 Foto da nota capturada','tok-ok');
}
function fecharCameraNota(){
  if(camStreamNota){ camStreamNota.getTracks().forEach(t=>t.stop()); camStreamNota=null; }
  const ov=document.getElementById('modal-camera-nota'); if(ov) ov.style.display='none';
}

function onFotoSelecionada(input){
  const file = input.files && input.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ showToast('⚠️ Selecione uma imagem','tok-err'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1000;                                   // largura máx: legível e leve
      const escala = Math.min(1, maxW/img.width);
      const w = Math.round(img.width*escala), h = Math.round(img.height*escala);
      const cv = document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      despesaFoto = cv.toDataURL('image/jpeg', 0.55);       // ~80-200KB, cabe no doc (<1MB)
      mostrarPreviewFoto();
    };
    img.onerror = () => showToast('⚠️ Não consegui ler a imagem','tok-err');
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function mostrarPreviewFoto(){
  const el = document.getElementById('desp-foto-preview');
  if(!el) return;
  el.innerHTML = despesaFoto ? `
    <div style="position:relative;display:inline-block;margin-top:8px">
      <img src="${despesaFoto}" style="max-width:130px;max-height:130px;border-radius:8px;border:1px solid #3a3530;display:block">
      <button type="button" onclick="removerFotoDespesa()" title="Remover foto" style="position:absolute;top:-8px;right:-8px;background:#e74c3c;color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:.8rem;line-height:1">✕</button>
    </div>` : '';
}
function removerFotoDespesa(){
  despesaFoto = null;
  const inp = document.getElementById('desp-foto'); if(inp) inp.value='';
  mostrarPreviewFoto();
}
// Abre a foto da nota em tela cheia (clica pra fechar)
function abrirFotoNota(id){
  const d = despesas.find(x=>x._id===id);
  if(!d || !d.foto) return;
  let ov = document.getElementById('modal-foto-nota');
  if(!ov){
    ov = document.createElement('div'); ov.id='modal-foto-nota';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px;cursor:zoom-out';
    ov.onclick=()=>{ ov.style.display='none'; };
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<img src="${d.foto}" style="max-width:96vw;max-height:92vh;border-radius:10px">`;
  ov.style.display='flex';
}

// Alterna entre Contas a Receber / Contas a Pagar / Fluxo de Caixa
function setFinTab(tab){
  finTab = tab;
  ['receber','pagar','fluxo'].forEach(t=>{
    const btn=document.getElementById('fintab-'+t);
    const sub=document.getElementById('finsub-'+t);
    if(btn) btn.classList.toggle('active', t===tab);
    if(sub) sub.style.display = t===tab ? 'block' : 'none';
  });
  // garante o input de data preenchido ao abrir "pagar" pela 1ª vez
  if(tab==='pagar'){
    const d=document.getElementById('desp-data');
    if(d && !d.value) d.value=dataLocalHoje();
    popularCategoriasDespesa();
  }
}

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
    if(p.status==='cancelado') return false;          // cancelados não contam no financeiro/frete
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
      }).filter(p=>p.status!=='cancelado');   // cancelados não contam no financeiro/frete
    }
    // Se snap vazio → mantém dados do localStorage
  } catch(e){
    // Erro no Firestore → mantém dados do localStorage
  }

  await carregarDespesas(range);
  renderFinanceiro();
  renderContasPagar();
  renderFluxoCaixa();
}

// ── CONTAS A PAGAR (despesas) ──────────────────────────────────
async function carregarDespesas(range){
  // 1. localStorage primeiro (funciona offline / sem Firebase)
  const todas = JSON.parse(localStorage.getItem('tcho_despesas')||'[]');
  despesas = todas.filter(d=>{
    const h=new Date(d.data);
    return !isNaN(h.getTime()) && h>=range.ini && h<range.fim;
  });
  // 2. Firestore (fonte oficial, sincroniza entre dispositivos)
  try{
    const snap=await db.collection('despesas')
      .where('data','>=', firebase.firestore.Timestamp.fromDate(range.ini))
      .where('data','<',  firebase.firestore.Timestamp.fromDate(range.fim))
      .get();
    if(snap && snap.docs){
      despesas = snap.docs.map(d=>{
        const x=d.data();
        return {_id:d.id, descricao:x.descricao||'', valor:Number(x.valor)||0,
                categoria:x.categoria||'Outros',
                data:x.data?.toDate?.()?.toISOString() || x.data || new Date().toISOString(),
                foto:x.foto||''};
      });
    }
  }catch(e){ /* mantém localStorage */ }
}

async function salvarDespesa(){
  const desc=document.getElementById('desp-desc').value.trim();
  const valor=parseFloat(document.getElementById('desp-valor').value);
  const categoria=document.getElementById('desp-cat')?.value || 'Outros';
  const dataStr=document.getElementById('desp-data').value || dataLocalHoje();
  if(!desc){ showToast('⚠️ Informe a descrição da despesa','tok-err'); return; }
  if(!valor || valor<=0){ showToast('⚠️ Informe um valor maior que zero','tok-err'); return; }
  const dataDate=new Date(dataStr+'T12:00:00');     // meio-dia evita virar o dia por fuso

  const reg={ descricao:desc, valor:valor, categoria:categoria, data:dataDate.toISOString(), foto:despesaFoto||'' };
  // grava no localStorage (sempre)
  const todas=JSON.parse(localStorage.getItem('tcho_despesas')||'[]');

  try{
    const doc={
      descricao:desc, valor:valor, categoria:categoria,
      data:firebase.firestore.Timestamp.fromDate(dataDate),
      criadoEm:firebase.firestore.FieldValue.serverTimestamp(),
    };
    if(despesaFoto) doc.foto=despesaFoto;                   // foto da nota (opcional)
    const ref=await db.collection('despesas').add(doc);
    reg._id=ref.id;
  }catch(e){ reg._id='desp-'+Date.now(); }
  todas.push(reg);
  localStorage.setItem('tcho_despesas', JSON.stringify(todas));

  // limpa o form (mantém a data escolhida para lançar várias seguidas)
  document.getElementById('desp-desc').value='';
  document.getElementById('desp-valor').value='';
  removerFotoDespesa();                                     // limpa foto + preview
  document.getElementById('desp-desc').focus();
  showToast(`✅ Despesa lançada — ${desc}`,'tok-ok');
  carregarFinanceiro();   // recarrega período e re-renderiza tudo
}

async function removerDespesa(id){
  if(!confirm('Excluir esta despesa?')) return;
  try{ if(id && !/^desp-\d+$/.test(id)) await db.collection('despesas').doc(id).delete(); }catch(e){}
  const todas=JSON.parse(localStorage.getItem('tcho_despesas')||'[]').filter(d=>d._id!==id);
  localStorage.setItem('tcho_despesas', JSON.stringify(todas));
  showToast('🗑️ Despesa excluída','tok-info');
  carregarFinanceiro();
}

function renderContasPagar(){
  const r = n => 'R$'+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const el=document.getElementById('desp-lista');
  if(!el) return;
  if(!despesas.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">🧾</div><div>Nenhuma despesa neste período</div></div>';
    return;
  }
  const total=despesas.reduce((a,d)=>a+(Number(d.valor)||0),0);
  const sorted=[...despesas].sort((a,b)=>new Date(b.data)-new Date(a.data));
  const fmtD=s=>{const d=new Date(s);return isNaN(d)?'-':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});};

  // ── Resumo por categoria (plano de contas) ──
  const porCat={};
  despesas.forEach(d=>{const c=d.categoria||'Outros'; porCat[c]=(porCat[c]||0)+(Number(d.valor)||0);});
  const resumoCat=Object.entries(porCat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>{
    const pct=total>0?Math.round(v/total*100):0;
    return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:.74rem;padding:5px 0;border-bottom:1px solid #2a2520">
      <span style="color:var(--cream)">🗂️ ${c} <span style="color:var(--muted);font-size:.66rem">${pct}%</span></span>
      <span style="color:#e74c3c;font-weight:700">${r(v)}</span></div>`;
  }).join('');
  const blocoResumo=`
    <div style="background:var(--card);border:1px solid #3a3530;border-radius:8px;padding:10px 12px;margin-bottom:12px">
      <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-bottom:6px">Por categoria</div>
      ${resumoCat}
    </div>`;

  el.innerHTML=blocoResumo+`
    <table class="fin-table">
      <thead><tr><th>Data</th><th>Descrição</th><th class="fin-val">Valor</th><th></th></tr></thead>
      <tbody>
        ${sorted.map(d=>`<tr>
          <td style="font-size:.72rem;color:var(--muted)">${fmtD(d.data)}</td>
          <td>${(d.descricao||'').replace(/</g,'&lt;')}${d.foto?` <button onclick="abrirFotoNota('${d._id}')" title="Ver nota" style="background:none;border:none;cursor:pointer;font-size:.95rem;padding:0 2px;vertical-align:middle">📷</button>`:''}
            <div style="font-size:.62rem;color:var(--muted)">🗂️ ${d.categoria||'Outros'}</div></td>
          <td class="fin-val" style="color:#e74c3c">${r(d.valor)}</td>
          <td style="width:34px;text-align:center"><button onclick="removerDespesa('${d._id}')" title="Excluir" style="background:#3a1010;color:#e74c3c;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer">✕</button></td>
        </tr>`).join('')}
        <tr class="fin-total-row">
          <td colspan="2"><strong>TOTAL (${despesas.length} despesa${despesas.length!==1?'s':''})</strong></td>
          <td class="fin-val"><strong style="color:#e74c3c">${r(total)}</strong></td>
          <td></td>
        </tr>
      </tbody>
    </table>`;
}

function renderFluxoCaixa(){
  const r = n => 'R$'+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const el=document.getElementById('fluxo-stats');
  if(!el) return;
  const recebido = finPedidosList.reduce((a,p)=>a+(p.total||0),0);
  const pago     = despesas.reduce((a,d)=>a+(Number(d.valor)||0),0);
  const saldo    = recebido - pago;
  const corSaldo = saldo>=0 ? '#27ae60' : '#e74c3c';
  el.innerHTML=`
    <div class="fin-cards">
      <div class="fin-card"><div class="fin-card-n" style="color:#27ae60">${r(recebido)}</div><div class="fin-card-l">🟢 A Receber (${finPedidosList.length})</div></div>
      <div class="fin-card"><div class="fin-card-n" style="color:#e74c3c">${r(pago)}</div><div class="fin-card-l">🔴 A Pagar (${despesas.length})</div></div>
    </div>
    <div class="fin-conf-total" style="margin-top:14px;border-color:${corSaldo}">
      <span>${saldo>=0?'💰 SALDO (lucro)':'⚠️ SALDO (prejuízo)'}</span>
      <span style="color:${corSaldo}">${r(saldo)}</span>
    </div>`;
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

function imprimirDespesas(){
  if(!despesas.length){showToast('Nenhuma despesa para imprimir','tok-err');return;}
  const r = n => 'R$'+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const total = despesas.reduce((a,d)=>a+(Number(d.valor)||0),0);
  const periodoLabel = document.getElementById('fin-periodo-label').textContent;
  const logoUrl = new URL('../logo/logo.png', window.location.href).href;
  const fmtD=s=>{const d=new Date(s);return isNaN(d)?'-':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});};
  const sorted=[...despesas].sort((a,b)=>new Date(a.data)-new Date(b.data));

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS_CUPOM}
    table{width:100%;border-collapse:collapse;margin:4px 0}td,th{font-size:11px;padding:3px 4px}
    th{border-bottom:1px solid #000;font-weight:bold}.r{text-align:right}
    .tot td{border-top:1px solid #000;font-weight:bold;padding-top:5px}
  </style></head><body>
    <div class="c"><img src="${logoUrl}" style="max-width:150px;max-height:65px"></div>
    <div class="c b" style="font-size:14px;margin-top:4px">CONTAS A PAGAR</div>
    <div class="c b" style="font-size:11px">— DESPESAS —</div>
    <div class="c" style="font-size:10px">${periodoLabel.replace('Período: ','')}</div>
    <div class="line"></div>
    <table>
      <thead><tr><th>Data</th><th>Descrição</th><th class="r">Valor</th></tr></thead>
      <tbody>
        ${sorted.map(d=>`<tr>
          <td>${fmtD(d.data)}</td>
          <td>${(d.descricao||'').replace(/</g,'&lt;')}<br><span style="font-size:9px;color:#555">${d.categoria||'Outros'}</span></td>
          <td class="r">${r(d.valor)}</td>
        </tr>`).join('')}
        <tr class="tot">
          <td colspan="2">TOTAL (${despesas.length} despesa${despesas.length!==1?'s':''})</td>
          <td class="r">${r(total)}</td>
        </tr>
      </tbody>
    </table>
    <div class="line"></div>
    <div class="b" style="font-size:11px;margin-bottom:3px">POR CATEGORIA</div>
    ${Object.entries(despesas.reduce((m,d)=>{const c=d.categoria||'Outros';m[c]=(m[c]||0)+(Number(d.valor)||0);return m;},{})).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<div class="row"><span>${c}</span><span>${r(v)}</span></div>`).join('')}
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
// ── Listener de pedidos (reconectável) ─────────────────────────
// Religa sozinho quando o Firestore cai (aba dormiu, wi-fi oscilou, etc).
// Sem isso, o painel ficava "surdo" e só voltava recarregando a página.
function iniciarListenerPedidos(){
  if(unsubPedidos){ unsubPedidos(); unsubPedidos=null; }
  unsubPedidos = db.collection('pedidos')
    .where('status','in',statusCols().slice(0,30))
    .onSnapshot(snapshot=>{
      // conexão OK: cancela reconexão pendente e o polling local de fallback
      if(reconnectPedidosTimer){ clearTimeout(reconnectPedidosTimer); reconnectPedidosTimer=null; }
      if(pollingLocalInterval){ clearInterval(pollingLocalInterval); pollingLocalInterval=null; }
      const ehPrimeiro = primeiroSnapshotPedidos;
      if(ehPrimeiro){
        pedidos = [];
        localStorage.removeItem('tcho_pedidos');
        primeiroSnapshotPedidos = false;
        // Carrega finalizados de hoje separadamente (não bloqueia o listener)
        carregarFinalizadosHoje();
      }
      snapshot.docChanges().forEach(change=>{
        const data=change.doc.data();
        const p={...data,_id:change.doc.id,hora:data.hora?data.hora.toDate():new Date()};
        if(change.type==='added'){
          // Numa reconexão o Firestore reenvia tudo como 'added'; o find evita
          // notificar/imprimir de novo pedidos que já estavam na tela.
          if(!pedidos.find(x=>x._id===p._id)){
            pedidos.push(p);totalHoje++;
            if(!ehPrimeiro){
              tocarNotificacao();
              showToast(`🔔 Novo pedido ${p.num||'#'+p.id} — ${p.nome}`,'tok-info');
              atualizarBadgeNovos();
              imprimirPedido(p);
              if(autoAceitar)setTimeout(()=>moverStatus(p._id,'prep',true),600);
            } else {
              atualizarBadgeNovos();
            }
          }
        } else if(change.type==='modified'){
          const idx=pedidos.findIndex(x=>x._id===p._id);
          if(idx!==-1) pedidos[idx]={...pedidos[idx],...p};
        } else if(change.type==='removed'){
          // Pedido saiu da query (foi finalizado ou cancelado) — move para finalizados
          const idx=pedidos.findIndex(x=>x._id===p._id);
          if(idx!==-1){
            const pfin={...pedidos[idx],...p};
            pedidos.splice(idx,1);
            if(!pedidosFinHoje.find(x=>x._id===pfin._id)) pedidosFinHoje.push(pfin);
          }
        }
      });
      renderAll();renderHistorico();
    },(err)=>{
      console.error('Firestore listener erro:', err.code, err.message);
      const dica={
        'resource-exhausted':'cota do Firestore estourou (plano grátis)',
        'permission-denied':'regras do Firestore bloqueando (test mode expirou?)',
        'unavailable':'sem internet / Firestore fora do ar',
        'failed-precondition':'falta índice no Firestore'
      }[err.code]||'';
      showToast(`⚠️ Erro Firestore: ${err.code||'?'}${dica?' — '+dica:''} — religando…`, 'tok-err');
      agendarReconexaoPedidos();
    });
}
function agendarReconexaoPedidos(){
  if(reconnectPedidosTimer) return;             // já tem uma reconexão a caminho
  reconnectPedidosTimer = setTimeout(()=>{
    reconnectPedidosTimer = null;
    if(localStorage.getItem('tcho_admin_logado')==='true' && typeof db!=='undefined'){
      iniciarListenerPedidos();
    }
  }, 3000);
}
// Religa o listener quando a aba volta ao foco ou a internet volta — assim o
// dono nunca mais precisa recarregar/deslogar pra voltar a receber pedidos.
function registrarHandlersConexao(){
  if(handlersConexaoRegistrados) return;
  handlersConexaoRegistrados = true;
  const reconectar = ()=>{
    if(localStorage.getItem('tcho_admin_logado')==='true' && typeof db!=='undefined'){
      iniciarListenerPedidos();
    }
  };
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') reconectar(); });
  window.addEventListener('online', reconectar);
}

function iniciarApp(){
  renderAll();
  atualizarBotaoSom();
  // Preenche datas padrão com hoje
  const hoje = dataLocalHoje();
  const iniEl = document.getElementById('fin-ini');
  const fimEl = document.getElementById('fin-fim');
  if(iniEl) iniEl.value = hoje;
  if(fimEl) fimEl.value = hoje;
  const logIni = document.getElementById('log-ini');
  const logFim = document.getElementById('log-fim');
  if(logIni) logIni.value = hoje;
  if(logFim) logFim.value = hoje;

  // Carrega config do Firestore
  if(unsubPedidos){ unsubPedidos(); unsubPedidos=null; }
  if(unsubConfig){ unsubConfig(); unsubConfig=null; }
  if(pollingLocalInterval){ clearInterval(pollingLocalInterval); pollingLocalInterval=null; }

  unsubConfig=db.collection('config').doc('operacao').onSnapshot(doc=>{
    if(!doc.exists) return;
    const cfg=doc.data();
    document.getElementById('cfg-loja').checked=cfg.lojaAberta!==false;
    document.getElementById('cfg-delivery').checked=cfg.deliveryAtivo!==false;
    document.getElementById('cfg-retirada').checked=cfg.retiradaAtiva!==false;
    if(document.getElementById('cfg-mesa')) document.getElementById('cfg-mesa').checked=!!cfg.mesaAtiva;
    aplicarModalidades();
    document.getElementById('cfg-print').checked=cfg.autoImprimir!==false;
    if(cfg.prazoMin) document.getElementById('cfg-prazo-min').value=cfg.prazoMin;
    if(cfg.prazoMax) document.getElementById('cfg-prazo-max').value=cfg.prazoMax;
    autoAceitar=!!cfg.autoAceitar;
    if(cfg.horarios){ cfgHorarios=cfg.horarios; localStorage.setItem('tcho_horarios',JSON.stringify(cfg.horarios)); if(document.getElementById('hor-dias')) carregarHorarios(); }
    if(cfg.kanbanStages){ localStorage.setItem('tcho_kanban_stages',JSON.stringify(cfg.kanbanStages)); }
    if(cfg.kanban){ localStorage.setItem('tcho_kanban',JSON.stringify(cfg.kanban)); }
    if(cfg.kanbanStages||cfg.kanban){ renderAll(); if(document.getElementById('kb-linhas')) carregarKanbanCfg(); }
    if(document.getElementById('cfg-auto-horario'))
      document.getElementById('cfg-auto-horario').checked=cfg.autoHorario!==false;
    if(document.getElementById('cfg-forcar-aberta'))
      document.getElementById('cfg-forcar-aberta').checked=!!cfg.forcarAberta;
    atualizarBotaoAuto();
    atualizarBadgeLoja();
    atualizarStatusAutoHorario();
  },()=>{});

  // Carrega as fotos dos produtos (coleção própria — 1 doc por produto)
  db.collection('fotos').get().then(snap=>{
    if(snap.empty) return;
    const fotos={}; snap.forEach(d=>{ if(d.data().src) fotos[d.id]=d.data().src; });
    localStorage.setItem('tcho_fotos',JSON.stringify(fotos));
    renderCardapio();
  }).catch(()=>{});

  // Carrega cardápio do Firestore (sincroniza entre dispositivos)
  db.collection('cardapio').get().then(snapshot=>{
    snapshot.forEach(doc=>{
      const d=doc.data();
      if(doc.id==='prods_edits'  && d.data ) localStorage.setItem('tcho_prods_edits', JSON.stringify(d.data));
      if(doc.id==='prods_custom' && d.lista) localStorage.setItem('tcho_prods_custom',JSON.stringify(d.lista));
      if(doc.id==='cats_custom'  && d.lista) localStorage.setItem('tcho_cats_custom', JSON.stringify(d.lista));
      if(doc.id==='cat_nomes'    && d.data ) localStorage.setItem('tcho_cat_nomes',   JSON.stringify(d.data));
      if(doc.id==='opcoes'       && d.data ) localStorage.setItem('tcho_opcoes',      JSON.stringify(d.data));
      if(doc.id==='ing_edits'    && d.data ) localStorage.setItem('tcho_ing_edits',   JSON.stringify(d.data));
      if(doc.id==='adicionais'   && d.lista) localStorage.setItem('tcho_adicionais',  JSON.stringify(d.lista));
      if(doc.id==='estoque'      && d.data ) localStorage.setItem('tcho_estoque',     JSON.stringify(d.data));
      if(doc.id==='bairros'      && d.lista) localStorage.setItem('tcho_bairros',     JSON.stringify(d.lista));
      if(doc.id==='cat_despesa'  && d.lista) localStorage.setItem('tcho_cat_despesa', JSON.stringify(d.lista));
    });
    // Re-aplica edições aos produtos base em memória
    const edits=JSON.parse(localStorage.getItem('tcho_prods_edits')||'{}');
    PRODS.forEach(p=>{if(edits[p.id]){if(edits[p.id].nome)p.n=edits[p.id].nome;if(edits[p.id].preco!==undefined)p.p=edits[p.id].preco;}});
    // Re-aplica o estoque salvo aos objetos em memória
    const estSalvo=JSON.parse(localStorage.getItem('tcho_estoque')||'{}');
    Object.keys(estSalvo).forEach(id=>{est[id]={...(est[id]||{ativo:true,modo:'inf',qtd:10}),...estSalvo[id]};});
    // Re-renderiza cardápio se a aba estiver ativa
    const tabAtiva=document.querySelector('.nav-tab.active');
    if(tabAtiva&&(tabAtiva.getAttribute('onclick')||'').includes('cardapio')) renderCardapio();
  }).catch(console.error);

  // ── Estoque ao vivo: reflete a baixa automática feita pelos pedidos ──
  db.collection('cardapio').doc('estoque').onSnapshot(doc=>{
    if(!doc.exists) return;
    const data=doc.data().data||{};
    Object.keys(data).forEach(id=>{est[id]={...(est[id]||{ativo:true,modo:'inf',qtd:10}),...data[id]};});
    localStorage.setItem('tcho_estoque',JSON.stringify(est));
    const tab=document.querySelector('.nav-tab.active');
    const noCardapio=tab&&(tab.getAttribute('onclick')||'').includes('cardapio');
    // não re-renderiza enquanto o dono digita uma quantidade (evita perder o foco)
    const editando=document.activeElement&&document.activeElement.classList&&document.activeElement.classList.contains('stock-input');
    if(noCardapio && !editando) renderCardapio();
  },()=>{});

  // Atualiza status do horário automático a cada minuto
  atualizarStatusAutoHorario();
  setInterval(atualizarStatusAutoHorario, 60000);

  // ── Fallback local: polling + BroadcastChannel ───────────────
  // Lê imediatamente pedidos já salvos no localStorage
  lerPedidosLocal();
  // Polling a cada 2s (captura pedidos quando Firebase não está configurado)
  pollingLocalInterval = setInterval(lerPedidosLocal, 2000);
  // BroadcastChannel: recebe pedidos em tempo real entre abas (HTTP)
  try {
    const canal = new BroadcastChannel('tcho_pedidos');
    canal.onmessage = (e) => receberPedidoLocal(e.data);
  } catch(e){}

  // ── Firestore: listener em tempo real (pedidos ativos) ───────
  primeiroSnapshotPedidos = true;
  iniciarListenerPedidos();
  registrarHandlersConexao();

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