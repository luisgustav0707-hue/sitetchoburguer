// ── LOGIN (Firebase Auth) ──────────────────────────────────────
// A autenticação agora é feita pelo Firebase Auth (e-mail/senha). A senha NÃO
// fica mais no código. Só é admin quem está logado E tem o doc /admins/{uid}
// no Firestore (as regras exigem isso). Ver firestore.rules.

// Perfis e quais abas cada um enxerga.
const PERFIL_ABAS={
  admin:   ['cozinha','salao','pedidos','config','crm','cardapio','financeiro'],
  gerente: ['cozinha','salao','pedidos','crm','cardapio','financeiro'],
  caixa:   ['cozinha','salao','pedidos','financeiro'],
  garcom:  ['salao'],
};
const PERFIL_LABEL={admin:'Admin',gerente:'Gerente',caixa:'Caixa',garcom:'Garçom'};
function perfilLabel(p){ return PERFIL_LABEL[p]||p||''; }
function getUsuariosLS(){ try{ return JSON.parse(localStorage.getItem('tcho_usuarios')||'[]'); }catch(e){ return []; } }
function getGarconsLS(){ try{ return JSON.parse(localStorage.getItem('tcho_garcons')||'[]'); }catch(e){ return []; } }
function perfilAtual(){ try{ return (JSON.parse(localStorage.getItem('tcho_sessao')||'null')||{}).perfil||'admin'; }catch(e){ return 'admin'; } }

let _appIniciado=false;
// Mostra o painel. Só chamado depois do Firebase confirmar o login (onAuthStateChanged).
function entrarApp(perfil,nome){
  localStorage.setItem('tcho_sessao',JSON.stringify({perfil,nome}));
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').classList.add('show');
  if(!_appIniciado){ _appIniciado=true; iniciarApp(); }
}
function mostrarLogin(){
  document.getElementById('app').classList.remove('show');
  const ls=document.getElementById('login-screen'); if(ls) ls.style.display='';
}
function fazerLogin(){
  const email=document.getElementById('login-user').value.trim();
  const senha=document.getElementById('login-pass').value;
  const err=document.getElementById('login-err');
  const btn=document.getElementById('login-btn');
  if(!email || !senha){ err.textContent='Preencha e-mail e senha'; return; }
  err.textContent='Entrando...'; if(btn) btn.disabled=true;
  // Persistência de SESSÃO: a sessão vive só enquanto o navegador está aberto.
  // Fechou o navegador → precisa logar de novo (mais seguro que ficar logado).
  firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION)
    .then(()=> firebase.auth().signInWithEmailAndPassword(email,senha))
    .then(()=>{ err.textContent=''; })   // onAuthStateChanged cuida de abrir o painel
    .catch(e=>{
      console.error('Login:', e.code);
      const cred = ['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email'].includes(e.code);
      err.textContent = cred ? 'E-mail ou senha incorretos'
                       : (e.code==='auth/too-many-requests' ? 'Muitas tentativas. Aguarde um pouco.'
                       : 'Erro ao entrar. Tente de novo.');
      document.getElementById('login-pass').value='';
    })
    .finally(()=>{ if(btn) btn.disabled=false; });
}

// Mostra só as abas permitidas ao perfil logado (+ Salão só com modalidade Mesa).
function aplicarAcesso(){
  const perfil=perfilAtual();
  const abas=PERFIL_ABAS[perfil]||PERFIL_ABAS.admin;
  const mesaOn=document.getElementById('cfg-mesa')?document.getElementById('cfg-mesa').checked:false;
  const ordem=['cozinha','salao','pedidos','config','crm','cardapio','financeiro'];
  document.querySelectorAll('.nav-tab').forEach((el,i)=>{
    const nome=ordem[i];
    let mostra=abas.includes(nome);
    if(nome==='salao') mostra=mostra&&mesaOn;
    el.style.display=mostra?'':'none';
  });
  const caixaTab=document.querySelector('#page-salao .sal-tab[data-sal="caixa"]');
  if(caixaTab) caixaTab.style.display = perfil==='garcom' ? 'none' : '';
  const badge=document.getElementById('user-badge');
  if(badge){ const s=(()=>{try{return JSON.parse(localStorage.getItem('tcho_sessao')||'null');}catch(e){return null;}})(); badge.textContent = s ? `${s.nome} · ${perfilLabel(perfil)}` : ''; }
  const ativa=document.querySelector('.nav-tab.active');
  if(ativa && ativa.style.display==='none'){
    const primeira=abas.find(a=>a!=='salao'||mesaOn) || (mesaOn?'salao':abas[0]);
    if(primeira) showPage(primeira);
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
  // Cancela listeners antes de sair
  localStorage.removeItem('tcho_sessao');
  if(unsubPedidos){ unsubPedidos(); unsubPedidos=null; }
  if(unsubConfig){ unsubConfig(); unsubConfig=null; }
  if(pollingLocalInterval){ clearInterval(pollingLocalInterval); pollingLocalInterval=null; }
  // Desloga do Firebase e recarrega (estado 100% limpo, volta pro login)
  firebase.auth().signOut().catch(()=>{}).then(()=>location.reload());
}

// Bootstrap: o Firebase decide se já há sessão válida. onAuthStateChanged é
// assíncrono, então roda depois do arquivo terminar de carregar — as variáveis
// (`pedidos`, `unsubPedidos`, ...) já existem quando iniciarApp() é chamado.
firebase.auth().onAuthStateChanged(function(user){
  if(user){ entrarApp('admin','Administrador'); }
  else { mostrarLogin(); }
});
try{ aplicarMarca(); }catch(e){}   // nome/logo/cores personalizados (white label) já no login

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
  if(k==='usuarios')    carregarUsuarios();
  if(k==='marca')       carregarMarca();
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
    set('ac-hoje',hoje); set('ac-semana',semana); set('ac-mes',mes); set('ac-total',d.total||0); set('ac-hoje-coz',hoje);
  }).catch(()=>{});
}
function iniciarPresencaAdmin(){
  if(presencaTimer) return;
  // Leitura periódica em vez de onSnapshot: o onSnapshot relia a coleção
  // inteira a cada heartbeat de cada visitante, o que estourava a cota do
  // Firestore. Aqui lemos uma vez por minuto e só com a aba em primeiro plano.
  const ler=()=>{
    if(document.hidden) return;
    carregarAcessos();   // mantém o "hoje" do indicador da Cozinha atualizado
    db.collection('presenca').get().then(snap=>{
      const agora=Date.now(); let online=0;
      snap.forEach(doc=>{
        const ls=doc.data().lastSeen&&doc.data().lastSeen.toDate?doc.data().lastSeen.toDate():null;
        const idade=ls?(agora-ls.getTime()):9e9;
        if(idade<120000) online++;                             // ativo nos últimos ~2min (heartbeat de 90s)
        else if(idade>600000) doc.ref.delete().catch(()=>{});  // limpa presença abandonada (>10min)
      });
      ['ac-online','ac-online-coz'].forEach(id=>{const el=document.getElementById(id); if(el) el.textContent=online;});
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

// Aba Salão depende da modalidade "Mesa" — e o resto das abas do perfil logado.
function aplicarModalidades(){ aplicarAcesso(); }

// ── USUÁRIOS (Config → Usuários; só admin enxerga o Config) ──
let usuarios=[], editUsuarioId=null;
function carregarUsuarios(){
  db.collection('usuarios').get().then(snap=>{
    usuarios=snap.docs.map(d=>({_id:d.id,...d.data()})).sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
    localStorage.setItem('tcho_usuarios',JSON.stringify(usuarios));   // cache p/ login por senha
    renderUsuarios();
  }).catch(()=>{ usuarios=getUsuariosLS(); renderUsuarios(); });
}
function renderUsuarios(){
  const el=document.getElementById('lista-usuarios'); if(!el) return;
  if(!usuarios.length){ el.innerHTML='<div class="empty"><div class="empty-icon">👤</div><div>Nenhum usuário criado</div><div style="font-size:.72rem;color:var(--muted);margin-top:6px">O admin mestre (login fixo) sempre funciona. Garçons entram pelo PIN (cadastro na aba Salão).</div></div>'; return; }
  el.innerHTML=usuarios.map(u=>`
    <div style="background:var(--card);border:1px solid #2a2520;border-radius:10px;padding:11px;margin-bottom:8px;display:flex;align-items:center;gap:10px;opacity:${u.ativo===false?'.5':'1'}">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.9rem;color:var(--cream)">${u.nome||'—'} <span style="font-size:.58rem;color:var(--orange);border:1px solid var(--orange);border-radius:10px;padding:1px 7px;margin-left:4px">${perfilLabel(u.perfil)}</span></div>
        <div style="font-size:.68rem;color:var(--muted)">login: ${u.login||'—'}${u.ativo===false?' · inativo':''}</div>
      </div>
      <button class="btn-editar-card" onclick="toggleUsuarioAtivo('${u._id}')" title="${u.ativo===false?'Ativar':'Inativar'}">${u.ativo===false?'✅':'🔒'}</button>
      <button class="btn-editar-card" onclick="abrirFormUsuario('${u._id}')" title="Editar">✏️</button>
      <button class="btn-editar-card" onclick="excluirUsuario('${u._id}')" title="Excluir" style="color:#e74c3c">🗑️</button>
    </div>`).join('');
}
function abrirFormUsuario(id){
  editUsuarioId=id||null;
  const u=id?(usuarios.find(x=>x._id===id)||{}):{};
  const inp='width:100%;box-sizing:border-box;background:var(--card);border:1px solid #3a3530;color:var(--cream);border-radius:6px;padding:7px 9px;font-size:.8rem;outline:none';
  const el=document.getElementById('usuario-form');
  el.innerHTML=`<div class="new-prod-form" style="margin-bottom:12px">
    <div style="font-size:.72rem;font-weight:700;color:var(--orange);letter-spacing:1px;margin-bottom:10px">${id?'EDITAR USUÁRIO':'NOVO USUÁRIO'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label class="edit-lbl">Nome</label><input id="us-nome" style="${inp}" value="${(u.nome||'').replace(/"/g,'&quot;')}"></div>
      <div><label class="edit-lbl">Perfil</label><select id="us-perfil" style="${inp}">${['gerente','caixa','admin'].map(p=>`<option value="${p}" ${(u.perfil||'caixa')===p?'selected':''}>${perfilLabel(p)}</option>`).join('')}</select></div>
      <div><label class="edit-lbl">Login</label><input id="us-login" style="${inp}" value="${(u.login||'').replace(/"/g,'&quot;')}"></div>
      <div><label class="edit-lbl">Senha</label><input id="us-senha" style="${inp}" value="${(u.senha||'').replace(/"/g,'&quot;')}"></div>
    </div>
    <div style="display:flex;gap:6px;margin-top:10px">
      <button class="opc-btn" onclick="salvarUsuario()">✓ Salvar</button>
      <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="fecharFormUsuario()">Cancelar</button>
    </div>
  </div>`;
  el.style.display='block';
}
function fecharFormUsuario(){ const el=document.getElementById('usuario-form'); if(el){el.style.display='none';el.innerHTML='';} editUsuarioId=null; }
function salvarUsuario(){
  const nome=document.getElementById('us-nome').value.trim();
  const login=document.getElementById('us-login').value.trim();
  const senha=document.getElementById('us-senha').value;
  const perfil=document.getElementById('us-perfil').value;
  if(!nome||!login||!senha){ showToast('⚠️ Preencha nome, login e senha','tok-err'); return; }
  const dados={nome,login,senha,perfil,ativo:true};
  if(editUsuarioId){ const prev=usuarios.find(x=>x._id===editUsuarioId); dados.ativo=prev?prev.ativo!==false:true; db.collection('usuarios').doc(editUsuarioId).set(dados,{merge:true}).then(()=>{showToast('✅ Usuário atualizado','tok-ok');carregarUsuarios();}).catch(console.error); }
  else { dados.criadoEm=new Date().toISOString(); db.collection('usuarios').add(dados).then(()=>{showToast('✅ Usuário criado','tok-ok');carregarUsuarios();}).catch(console.error); }
  fecharFormUsuario();
}
function toggleUsuarioAtivo(id){ const u=usuarios.find(x=>x._id===id); if(!u)return; db.collection('usuarios').doc(id).update({ativo:u.ativo===false}).then(()=>carregarUsuarios()).catch(console.error); }
function excluirUsuario(id){ const u=usuarios.find(x=>x._id===id); if(!u||!confirm(`Excluir o usuário "${u.nome}"?`))return; db.collection('usuarios').doc(id).delete().then(()=>{showToast('🗑️ Usuário excluído','tok-info');carregarUsuarios();}).catch(console.error); }

// ── MARCA / WHITE LABEL (nome, logo, cores) ──
let _marcaLogoTmp=null;
const MARCA_DEFAULT={corPrimaria:'#f5820a',corSecundaria:'#ff6b00'};
function getMarca(){ try{ return JSON.parse(localStorage.getItem('tcho_marca')||'null'); }catch(e){ return null; } }
function aplicarMarca(m){
  m=m||getMarca(); if(!m) return;
  if(m.corPrimaria)   document.documentElement.style.setProperty('--orange',  m.corPrimaria);
  if(m.corSecundaria) document.documentElement.style.setProperty('--orange2', m.corSecundaria);
  if(m.nome){ document.querySelectorAll('.marca-nome,.login-title').forEach(e=>e.textContent=m.nome); }
  if(m.logo){ document.querySelectorAll('img[data-logo]').forEach(e=>e.src=m.logo); }
}
function marcaLogoInner(){
  const src=_marcaLogoTmp;
  return (src?`<img src="${src}" style="height:44px;width:auto;object-fit:contain;background:#0d0a07;border-radius:6px;padding:2px">`:`<div style="width:60px;height:44px;border:1px dashed #3a3530;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--muted)">🖼️</div>`)
    +`<button type="button" class="opc-btn" onclick="escolherLogoMarca()">📁 ${src?'Trocar':'Logo'}</button>`
    +(src?`<button type="button" class="opc-btn" style="background:#3a1010;color:#e74c3c" onclick="removerLogoMarca()">Remover</button>`:'');
}
function escolherLogoMarca(){ const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.onchange=e=>{const f=e.target.files[0]; if(f) lerFotoRedimensionada(f,src=>{_marcaLogoTmp=src; const a=document.getElementById('marca-logo-area'); if(a)a.innerHTML=marcaLogoInner();});}; inp.click(); }
function removerLogoMarca(){ _marcaLogoTmp=null; const a=document.getElementById('marca-logo-area'); if(a)a.innerHTML=marcaLogoInner(); }
function carregarMarca(){
  const m=getMarca()||{};
  const nEl=document.getElementById('marca-nome-inp'); if(nEl) nEl.value=m.nome||'';
  const c1=document.getElementById('marca-cor1'); if(c1) c1.value=m.corPrimaria||MARCA_DEFAULT.corPrimaria;
  const c2=document.getElementById('marca-cor2'); if(c2) c2.value=m.corSecundaria||MARCA_DEFAULT.corSecundaria;
  _marcaLogoTmp=m.logo||null;
  const a=document.getElementById('marca-logo-area'); if(a) a.innerHTML=marcaLogoInner();
}
function salvarMarca(){
  const m={
    nome:document.getElementById('marca-nome-inp').value.trim(),
    logo:_marcaLogoTmp||'',
    corPrimaria:document.getElementById('marca-cor1').value||MARCA_DEFAULT.corPrimaria,
    corSecundaria:document.getElementById('marca-cor2').value||MARCA_DEFAULT.corSecundaria,
  };
  localStorage.setItem('tcho_marca',JSON.stringify(m));
  db.collection('config').doc('marca').set(m,{merge:true}).catch(console.error);
  aplicarMarca(m);
  showToast('✅ Marca atualizada','tok-ok');
}

// ── SEED de dados de demonstração (só popula se estiver vazio) ──
async function seedDemo(){
  let temDados=false;
  try{
    const [mS,gS,uS]=await Promise.all([db.collection('mesas').limit(1).get(),db.collection('garcons').limit(1).get(),db.collection('usuarios').limit(1).get()]);
    temDados=!mS.empty||!gS.empty||!uS.empty;
  }catch(e){}
  if(temDados && !confirm('Já existem dados cadastrados. Adicionar os dados de demonstração mesmo assim?')) return;
  const ts=()=>new Date().toISOString();
  const amb=['Salão interno','Varanda','Área externa'], caps=[2,4,4,6];
  const b=db.batch();
  for(let i=1;i<=10;i++) b.set(db.collection('mesas').doc(),{numero:String(i).padStart(2,'0'),capacidade:caps[i%4],ambiente:amb[i%3],status:'livre',ativo:true,criadoEm:ts()});
  [{nome:'João',pin:'1111'},{nome:'Maria',pin:'2222'},{nome:'Carlos',pin:'3333'}].forEach(g=>b.set(db.collection('garcons').doc(),{nome:g.nome,pin:g.pin,foto:'',ativo:true,criadoEm:ts()}));
  [{nome:'Gerente Demo',login:'gerente',senha:'123',perfil:'gerente'},{nome:'Caixa Demo',login:'caixa',senha:'123',perfil:'caixa'}].forEach(u=>b.set(db.collection('usuarios').doc(),{...u,ativo:true,criadoEm:ts()}));
  try{ await b.commit(); showToast('🌱 Dados de demonstração criados!','tok-ok'); }
  catch(e){ console.error(e); showToast('❌ Erro ao criar demo','tok-err'); return; }
  carregarGarcons(); carregarUsuarios();
  if(document.getElementById('mapa-mesas')) renderSalao();
}
// ══════════════════ SALÃO — mesas e garçons (Fase 2) ══════════════════
let mesas=[], garcons=[], unsubMesas=null, editMesaId=null, editGarcomId=null, _garcomFotoTmp=null;
let salAtual='mesas', comandaMesaId=null, rodadaItens=[];
function comandaTotal(m){ return ((m&&m.sessao&&m.sessao.itens)||[]).reduce((a,it)=>a+((it.preco||0)*(it.qtd||1)),0); }
const MESA_STATUS={
  livre:      {l:'Livre',                c:'#27ae60'},
  ocupada:    {l:'Ocupada',              c:'#e67e22'},
  aguardando: {l:'Aguardando pagamento', c:'#f1c40f'},
  reservada:  {l:'Reservada',            c:'#3498db'},
};

function renderSalao(){
  showSalao(salAtual);
  iniciarMesasListener();
  carregarGarcons();
}
function showSalao(t){
  salAtual=t;
  document.querySelectorAll('#page-salao .sal-tab').forEach(b=>{
    const on=b.dataset.sal===t;
    b.classList.toggle('active',on);
    b.style.borderColor=on?'var(--orange)':'#3a3530';
    b.style.color=on?'var(--orange)':'var(--cream)';
  });
  ['mesas','caixa','garcons'].forEach(k=>{const el=document.getElementById('sal-'+k); if(el) el.style.display=(k===t?'block':'none');});
  if(t==='caixa') renderCaixa();
}

// ── MESAS (mapa ao vivo) ──
function iniciarMesasListener(){
  if(unsubMesas) return;
  unsubMesas=db.collection('mesas').onSnapshot(snap=>{
    mesas=snap.docs.map(d=>({_id:d.id,...d.data()})).sort((a,b)=>String(a.numero||'').localeCompare(String(b.numero||''),'pt',{numeric:true}));
    renderMapaMesas();
    const cx=document.getElementById('sal-caixa'); if(cx && cx.style.display!=='none') renderCaixa();
    const modal=document.getElementById('modal-salao');
    if(comandaMesaId && modal && modal.style.display==='flex') renderComanda();
  },()=>{});
}
function renderMapaMesas(){
  const leg=document.getElementById('mesa-legenda');
  if(leg) leg.innerHTML=Object.values(MESA_STATUS).map(s=>`<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:11px;height:11px;border-radius:3px;background:${s.c}"></span>${s.l}</span>`).join('');
  const el=document.getElementById('mapa-mesas'); if(!el) return;
  const ativas=mesas.filter(m=>m.ativo!==false);
  if(!ativas.length){ el.innerHTML='<div class="empty"><div class="empty-icon">🪑</div><div>Nenhuma mesa cadastrada</div></div>'; return; }
  const r=n=>'R$'+Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  el.innerHTML=ativas.map(m=>{
    const st=MESA_STATUS[m.status]||MESA_STATUS.livre;
    const emUso=m.status==='ocupada'||m.status==='aguardando';
    const acao=m.status==='livre'
      ? `<button onclick="abrirMesa('${m._id}')" style="width:100%;margin-top:8px;padding:7px;background:var(--orange);color:#000;border:none;border-radius:7px;font-weight:700;font-size:.72rem;cursor:pointer">Abrir mesa</button>`
      : `<button onclick="abrirComanda('${m._id}')" style="width:100%;margin-top:8px;padding:7px;background:${st.c};color:#000;border:none;border-radius:7px;font-weight:700;font-size:.72rem;cursor:pointer">Ver comanda</button>`;
    return `<div style="background:var(--card);border:1px solid ${st.c};border-radius:10px;overflow:hidden">
      <div style="background:${st.c}22;border-bottom:1px solid ${st.c};padding:6px 9px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:1.25rem;color:${st.c};line-height:1">${m.numero||'?'}</span>
        <span style="font-size:.54rem;font-weight:800;color:${st.c};text-transform:uppercase;text-align:right">${st.l}</span>
      </div>
      <div style="padding:8px 9px">
        <div style="font-size:.68rem;color:var(--muted)">👥 ${m.capacidade||'-'} lugares</div>
        ${m.ambiente?`<div style="font-size:.66rem;color:var(--muted)">📍 ${m.ambiente}</div>`:''}
        ${emUso&&m.sessao?`<div style="font-size:.66rem;color:var(--muted);margin-top:3px">🧑‍🍳 ${m.sessao.garcomNome||'—'}</div><div style="font-size:.82rem;font-weight:700;color:${st.c}">${r(comandaTotal(m))}</div>`:''}
        ${acao}
        <div style="display:flex;gap:4px;margin-top:6px">
          <button class="btn-editar-card" onclick="abrirFormMesa('${m._id}')" title="Editar cadastro">✏️</button>
          <button class="btn-editar-card" onclick="excluirMesa('${m._id}')" title="Excluir" style="color:#e74c3c">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function abrirFormMesa(id){
  editMesaId=id||null;
  const m=id?(mesas.find(x=>x._id===id)||{}):{};
  const inp='width:100%;box-sizing:border-box;background:var(--card);border:1px solid #3a3530;color:var(--cream);border-radius:6px;padding:7px 9px;font-size:.8rem;outline:none';
  const el=document.getElementById('mesa-form');
  el.innerHTML=`<div class="new-prod-form" style="margin-bottom:12px">
    <div style="font-size:.72rem;font-weight:700;color:var(--orange);letter-spacing:1px;margin-bottom:10px">${id?'EDITAR MESA':'NOVA MESA'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label class="edit-lbl">Número / nome</label><input id="mesa-num" style="${inp}" value="${String(m.numero||'').replace(/"/g,'&quot;')}" placeholder="Ex.: 01, Varanda 1"></div>
      <div><label class="edit-lbl">Capacidade</label><input id="mesa-cap" type="number" min="1" style="${inp}" value="${m.capacidade||''}" placeholder="Lugares"></div>
      <div><label class="edit-lbl">Ambiente (opcional)</label><input id="mesa-amb" style="${inp}" value="${(m.ambiente||'').replace(/"/g,'&quot;')}" placeholder="Salão, Varanda..."></div>
      <div><label class="edit-lbl">Status</label><select id="mesa-status" style="${inp}">${Object.entries(MESA_STATUS).map(([k,v])=>`<option value="${k}" ${(m.status||'livre')===k?'selected':''}>${v.l}</option>`).join('')}</select></div>
    </div>
    <div style="display:flex;gap:6px;margin-top:10px">
      <button class="opc-btn" onclick="salvarMesa()">✓ Salvar</button>
      <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="fecharFormMesa()">Cancelar</button>
    </div>
  </div>`;
  el.style.display='block';
}
function fecharFormMesa(){ const el=document.getElementById('mesa-form'); if(el){el.style.display='none';el.innerHTML='';} editMesaId=null; }
function salvarMesa(){
  const numero=document.getElementById('mesa-num').value.trim();
  if(!numero){ showToast('⚠️ Informe o número/nome da mesa','tok-err'); return; }
  const dados={
    numero,
    capacidade:parseInt(document.getElementById('mesa-cap').value)||0,
    ambiente:document.getElementById('mesa-amb').value.trim(),
    status:document.getElementById('mesa-status').value||'livre',
    ativo:true,
  };
  if(editMesaId) db.collection('mesas').doc(editMesaId).set(dados,{merge:true}).then(()=>showToast('✅ Mesa atualizada','tok-ok')).catch(console.error);
  else { dados.criadoEm=new Date().toISOString(); db.collection('mesas').add(dados).then(()=>showToast('✅ Mesa criada','tok-ok')).catch(console.error); }
  fecharFormMesa();
}
function excluirMesa(id){ const m=mesas.find(x=>x._id===id); if(!m||!confirm(`Excluir a mesa "${m.numero}"?`))return; db.collection('mesas').doc(id).delete().then(()=>showToast('🗑️ Mesa excluída','tok-info')).catch(console.error); }

// ── GARÇONS ──
function carregarGarcons(){
  db.collection('garcons').get().then(snap=>{
    garcons=snap.docs.map(d=>({_id:d.id,...d.data()})).sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
    localStorage.setItem('tcho_garcons',JSON.stringify(garcons));   // cache p/ login por PIN
    renderGarcons();
  }).catch(()=>{});
}
function renderGarcons(){
  const el=document.getElementById('lista-garcons'); if(!el) return;
  if(!garcons.length){ el.innerHTML='<div class="empty"><div class="empty-icon">🧑‍🍳</div><div>Nenhum garçom cadastrado</div></div>'; return; }
  el.innerHTML=garcons.map(g=>`
    <div style="background:var(--card);border:1px solid #2a2520;border-radius:10px;padding:11px;margin-bottom:8px;display:flex;align-items:center;gap:10px;opacity:${g.ativo===false?'.5':'1'}">
      ${g.foto?`<img src="${g.foto}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0">`:`<div style="width:42px;height:42px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">🧑‍🍳</div>`}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.9rem;color:var(--cream)">${g.nome||'—'}</div>
        <div style="font-size:.68rem;color:var(--muted)">PIN: ${g.pin?'••••':'—'}${g.ativo===false?' · inativo':''}</div>
      </div>
      <button class="btn-editar-card" onclick="toggleGarcomAtivo('${g._id}')" title="${g.ativo===false?'Ativar':'Inativar'}">${g.ativo===false?'✅':'🔒'}</button>
      <button class="btn-editar-card" onclick="abrirFormGarcom('${g._id}')" title="Editar">✏️</button>
      <button class="btn-editar-card" onclick="excluirGarcom('${g._id}')" title="Excluir" style="color:#e74c3c">🗑️</button>
    </div>`).join('');
}
function garcomFotoInner(foto){
  return (foto
    ? `<img src="${foto}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">`
    : `<div style="width:48px;height:48px;border-radius:50%;border:1px dashed #3a3530;display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--muted)">📷</div>`)
    + `<button type="button" class="opc-btn" onclick="escolherFotoGarcom()">📁 ${foto?'Trocar':'Foto'}</button>`
    + (foto?`<button type="button" class="opc-btn" style="background:#3a1010;color:#e74c3c" onclick="removerFotoGarcom()">Remover</button>`:'');
}
function escolherFotoGarcom(){ const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.onchange=e=>{const f=e.target.files[0]; if(f) lerFotoRedimensionada(f,src=>{_garcomFotoTmp=src; const a=document.getElementById('garcom-foto-area'); if(a)a.innerHTML=garcomFotoInner(src);});}; inp.click(); }
function removerFotoGarcom(){ _garcomFotoTmp=null; const a=document.getElementById('garcom-foto-area'); if(a)a.innerHTML=garcomFotoInner(null); }
function abrirFormGarcom(id){
  editGarcomId=id||null;
  const g=id?(garcons.find(x=>x._id===id)||{}):{};
  _garcomFotoTmp=g.foto||null;
  const inp='width:100%;box-sizing:border-box;background:var(--card);border:1px solid #3a3530;color:var(--cream);border-radius:6px;padding:7px 9px;font-size:.8rem;outline:none';
  const el=document.getElementById('garcom-form');
  el.innerHTML=`<div class="new-prod-form" style="margin-bottom:12px">
    <div style="font-size:.72rem;font-weight:700;color:var(--orange);letter-spacing:1px;margin-bottom:10px">${id?'EDITAR GARÇOM':'NOVO GARÇOM'}</div>
    <div id="garcom-foto-area" style="display:flex;align-items:center;gap:8px;margin-bottom:10px">${garcomFotoInner(g.foto)}</div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px">
      <div><label class="edit-lbl">Nome</label><input id="garcom-nome" style="${inp}" value="${(g.nome||'').replace(/"/g,'&quot;')}" placeholder="Nome do garçom"></div>
      <div><label class="edit-lbl">PIN (4 dígitos)</label><input id="garcom-pin" type="text" inputmode="numeric" maxlength="4" style="${inp}" value="${g.pin||''}" placeholder="1234"></div>
    </div>
    <div style="display:flex;gap:6px;margin-top:10px">
      <button class="opc-btn" onclick="salvarGarcom()">✓ Salvar</button>
      <button class="opc-btn" style="background:#2a2520;color:var(--muted)" onclick="fecharFormGarcom()">Cancelar</button>
    </div>
  </div>`;
  el.style.display='block';
}
function fecharFormGarcom(){ const el=document.getElementById('garcom-form'); if(el){el.style.display='none';el.innerHTML='';} editGarcomId=null; _garcomFotoTmp=null; }
function salvarGarcom(){
  const nome=document.getElementById('garcom-nome').value.trim();
  const pin=(document.getElementById('garcom-pin').value||'').replace(/\D/g,'');
  if(!nome){ showToast('⚠️ Informe o nome','tok-err'); return; }
  if(pin && pin.length!==4){ showToast('⚠️ O PIN deve ter 4 dígitos','tok-err'); return; }
  const dados={nome,pin,foto:_garcomFotoTmp||'',ativo:true};
  if(editGarcomId){ const prev=garcons.find(x=>x._id===editGarcomId); dados.ativo=prev?prev.ativo!==false:true; db.collection('garcons').doc(editGarcomId).set(dados,{merge:true}).then(()=>{showToast('✅ Garçom atualizado','tok-ok');carregarGarcons();}).catch(console.error); }
  else { dados.criadoEm=new Date().toISOString(); db.collection('garcons').add(dados).then(()=>{showToast('✅ Garçom cadastrado','tok-ok');carregarGarcons();}).catch(console.error); }
  fecharFormGarcom();
}
function toggleGarcomAtivo(id){ const g=garcons.find(x=>x._id===id); if(!g)return; db.collection('garcons').doc(id).update({ativo:g.ativo===false}).then(()=>carregarGarcons()).catch(console.error); }
function excluirGarcom(id){ const g=garcons.find(x=>x._id===id); if(!g||!confirm(`Excluir o garçom "${g.nome}"?`))return; db.collection('garcons').doc(id).delete().then(()=>{showToast('🗑️ Garçom excluído','tok-info');carregarGarcons();}).catch(console.error); }

// ── ABRIR MESA + COMANDA (Fase 3) ──
function fecharModalSalao(){ const el=document.getElementById('modal-salao'); if(el) el.style.display='none'; comandaMesaId=null; rodadaItens=[]; }
function abrirMesa(id){
  const m=mesas.find(x=>x._id===id); if(!m) return;
  const ativos=garcons.filter(g=>g.ativo!==false);
  const box=document.getElementById('modal-salao-box'); if(!box) return;
  box.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;color:var(--orange);letter-spacing:2px">🍽️ ABRIR MESA ${m.numero}</div>
      <button onclick="fecharModalSalao()" style="background:none;border:none;color:var(--muted);font-size:1.4rem;cursor:pointer">✕</button>
    </div>
    <label class="edit-lbl">Garçom responsável</label>
    <select id="am-garcom" class="edit-inp" style="width:100%;box-sizing:border-box;margin-bottom:10px">${ativos.length?ativos.map(g=>`<option value="${g._id}">${g.nome}</option>`).join(''):'<option value="">— cadastre um garçom antes —</option>'}</select>
    <label class="edit-lbl">Número de pessoas</label>
    <input id="am-pessoas" class="edit-inp" type="number" min="1" value="${m.capacidade||2}" style="width:100%;box-sizing:border-box;margin-bottom:16px">
    <button onclick="confirmarAbrirMesa('${id}')" style="width:100%;padding:11px;background:linear-gradient(135deg,var(--orange),var(--orange2));color:#000;border:none;border-radius:8px;font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:2px;cursor:pointer">ABRIR MESA</button>`;
  document.getElementById('modal-salao').style.display='flex';
}
function confirmarAbrirMesa(id){
  const m=mesas.find(x=>x._id===id); if(!m) return;
  const gid=document.getElementById('am-garcom').value;
  const g=garcons.find(x=>x._id===gid);
  const pessoas=parseInt(document.getElementById('am-pessoas').value)||1;
  const sessao={id:Date.now(),garcom:gid,garcomNome:g?g.nome:'',pessoas,abertaEm:new Date().toISOString(),itens:[]};
  db.collection('mesas').doc(id).set({status:'ocupada',sessao},{merge:true}).catch(console.error);
  m.status='ocupada'; m.sessao=sessao;
  showToast(`🍽️ Mesa ${m.numero} aberta`,'tok-ok');
  abrirComanda(id);
}
function abrirComanda(id){ comandaMesaId=id; rodadaItens=[]; renderComanda(); document.getElementById('modal-salao').style.display='flex'; }
function renderComanda(){
  const m=mesas.find(x=>x._id===comandaMesaId); if(!m){ fecharModalSalao(); return; }
  const box=document.getElementById('modal-salao-box'); if(!box) return;
  const r=n=>'R$'+Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const sess=m.sessao||{itens:[]};
  const prods=listaProdutosManual();
  const totalRodada=rodadaItens.reduce((a,it)=>a+it.preco*it.qtd,0);
  box.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;color:var(--orange);letter-spacing:2px">🍽️ MESA ${m.numero}</div>
      <button onclick="fecharModalSalao()" style="background:none;border:none;color:var(--muted);font-size:1.4rem;cursor:pointer">✕</button>
    </div>
    <div style="font-size:.7rem;color:var(--muted);margin-bottom:12px">🧑‍🍳 ${sess.garcomNome||'—'} · 👥 ${sess.pessoas||'-'} pessoas</div>
    <div style="font-size:.68rem;color:var(--orange);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Comanda (já na cozinha)</div>
    <div style="max-height:150px;overflow-y:auto;margin-bottom:8px">
      ${(sess.itens||[]).length?sess.itens.map(it=>`<div style="display:flex;justify-content:space-between;font-size:.76rem;padding:3px 0;border-bottom:1px solid #2a2520"><span>${it.qtd>1?it.qtd+'x ':''}${it.nome}${it.obs?` <span style="color:var(--muted)">(${it.obs})</span>`:''}</span><span>${r((it.preco||0)*(it.qtd||1))}</span></div>`).join(''):'<div style="font-size:.72rem;color:var(--muted)">Nada enviado ainda</div>'}
    </div>
    <div style="display:flex;justify-content:space-between;font-weight:700;color:var(--orange);margin-bottom:16px"><span>Total parcial</span><span>${r(comandaTotal(m))}</span></div>
    <div style="font-size:.68rem;color:var(--orange);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Nova rodada</div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <select id="cmd-prod" class="edit-inp" style="flex:1;min-width:0;font-size:.74rem">${prods.map((p,i)=>`<option value="${i}">${p.nome} — R$${p.preco}</option>`).join('')}</select>
      <input id="cmd-qtd" class="edit-inp" type="number" min="1" value="1" style="width:52px">
    </div>
    <input id="cmd-obs" class="edit-inp" placeholder="Observação (ex.: sem cebola, ao ponto)" style="width:100%;box-sizing:border-box;font-size:.74rem;margin-bottom:8px">
    <button onclick="addRodadaItem()" style="width:100%;padding:8px;background:var(--card);color:var(--orange);border:1px solid var(--orange);border-radius:8px;font-weight:700;cursor:pointer;margin-bottom:10px">+ Adicionar à rodada</button>
    ${rodadaItens.length?`<div style="background:var(--card);border-radius:8px;padding:8px;margin-bottom:10px">${rodadaItens.map((it,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;font-size:.74rem;padding:2px 0"><span>${it.qtd>1?it.qtd+'x ':''}${it.nome}${it.obs?` (${it.obs})`:''}</span><span style="display:flex;gap:8px;align-items:center">${r(it.preco*it.qtd)} <button onclick="removerRodadaItem(${i})" style="background:none;border:none;color:#e74c3c;cursor:pointer">✕</button></span></div>`).join('')}<div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #2a2520;margin-top:4px;padding-top:4px"><span>Rodada</span><span>${r(totalRodada)}</span></div></div>
    <button onclick="enviarRodada()" style="width:100%;padding:11px;background:linear-gradient(135deg,#27ae60,#1e8449);color:#fff;border:none;border-radius:8px;font-family:'Bebas Neue',sans-serif;font-size:1.05rem;letter-spacing:1px;cursor:pointer">🍳 ENVIAR RODADA PRA COZINHA</button>`:''}`;
}
function addRodadaItem(){
  const idx=parseInt(document.getElementById('cmd-prod').value);
  const prod=listaProdutosManual()[idx]; if(!prod) return;
  const qtd=parseInt(document.getElementById('cmd-qtd').value)||1;
  const obs=(document.getElementById('cmd-obs').value||'').trim();
  rodadaItens.push({nome:prod.nome,preco:prod.preco,qtd,obs,id:prod.id});
  renderComanda();
}
function removerRodadaItem(i){ rodadaItens.splice(i,1); renderComanda(); }
async function enviarRodada(){
  const m=mesas.find(x=>x._id===comandaMesaId);
  if(!m||!rodadaItens.length){ showToast('⚠️ Adicione itens à rodada','tok-err'); return; }
  let numOrdem;
  try{ const ref=db.collection('config').doc('contador'); numOrdem=await db.runTransaction(async t=>{const d=await t.get(ref);const n=(d.exists?d.data().ultimo:0)+1;t.set(ref,{ultimo:n},{merge:true});return n;}); }
  catch(e){ numOrdem=Math.floor(Math.random()*900)+100; }
  const num='#'+String(numOrdem).padStart(3,'0');
  const itensTxt=rodadaItens.map(it=>`${it.qtd>1?it.qtd+'x ':''}${it.nome}${it.obs?` (${it.obs})`:''} — R$${it.preco*it.qtd}`);
  const total=rodadaItens.reduce((a,it)=>a+it.preco*it.qtd,0);
  const pedido={
    id:numOrdem, num, tipo:'mesa', mesaId:m._id, mesaNumero:m.numero, sessaoId:m.sessao?m.sessao.id:null,
    nome:`Mesa ${m.numero}`, tel:'', garcom:m.sessao?m.sessao.garcomNome:'',
    pag:'', frete:0, desconto:0, cupom:'', obs:'', itens:itensTxt, total,
    status:'novo', origem:'mesa-rodada', contabil:false,   // rodada é só p/ cozinha; o caixa conta a venda
    hora:firebase.firestore.FieldValue.serverTimestamp(),
    horaStr:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    impresso:false, criadoEm:firebase.firestore.FieldValue.serverTimestamp(),
  };
  db.collection('pedidos').add(pedido).catch(console.error);   // cai no MESMO Kanban + imprime (listener existente)
  // Baixa de estoque da rodada (só modo Qtd). O fechamento do caixa NÃO desconta,
  // pra não contar em dobro — os itens já foram descontados aqui, na rodada.
  const consumoRodada={};
  rodadaItens.forEach(it=>{ if(it.id) consumoRodada[it.id]=(consumoRodada[it.id]||0)+(it.qtd||1); });
  baixarEstoquePorConsumo(consumoRodada);
  const novaItens=[...((m.sessao&&m.sessao.itens)||[]), ...rodadaItens];
  db.collection('mesas').doc(m._id).set({sessao:{...(m.sessao||{}),itens:novaItens}},{merge:true}).catch(console.error);
  if(m.sessao) m.sessao.itens=novaItens;
  rodadaItens=[];
  showToast(`🍳 Rodada da mesa ${m.numero} enviada pra cozinha`,'tok-ok');
  renderComanda();
}

// ── CAIXA — fechamento de conta (Fase 4) ──
let caixaMesaId=null, cupomCaixa=null, fcForma='pix', _fcCalc={};
const _rBRL=n=>'R$'+Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});

function renderCaixa(){
  const el=document.getElementById('lista-caixa'); if(!el) return;
  const abertas=mesas.filter(m=>m.status==='ocupada'||m.status==='aguardando');
  if(!abertas.length){ el.innerHTML='<div class="empty"><div class="empty-icon">💵</div><div>Nenhuma mesa aberta</div></div>'; return; }
  el.innerHTML=abertas.map(m=>{
    const st=MESA_STATUS[m.status]||MESA_STATUS.ocupada;
    return `<div style="background:var(--card);border:1px solid ${st.c};border-radius:10px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div style="min-width:0">
        <div style="font-weight:700;font-size:.95rem;color:var(--cream)">🍽️ Mesa ${m.numero}</div>
        <div style="font-size:.68rem;color:var(--muted)">🧑‍🍳 ${(m.sessao&&m.sessao.garcomNome)||'—'} · 👥 ${(m.sessao&&m.sessao.pessoas)||'-'} · ${st.l}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;color:${st.c};line-height:1">${_rBRL(comandaTotal(m))}</div>
        <button onclick="abrirFechamento('${m._id}')" style="margin-top:4px;padding:6px 12px;background:${st.c};color:#000;border:none;border-radius:7px;font-weight:700;font-size:.72rem;cursor:pointer">Fechar conta</button>
      </div>
    </div>`;
  }).join('');
}

function abrirFechamento(mesaId){
  caixaMesaId=mesaId; cupomCaixa=null; fcForma='pix';
  const m=mesas.find(x=>x._id===mesaId); if(!m) return;
  const box=document.getElementById('modal-salao-box'); if(!box) return;
  const sess=m.sessao||{itens:[]};
  const inp='width:100%;box-sizing:border-box;background:var(--card);border:1px solid #3a3530;color:var(--cream);border-radius:6px;padding:6px 8px;font-size:.8rem;outline:none';
  box.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;color:var(--orange);letter-spacing:2px">💵 FECHAR MESA ${m.numero}</div>
      <button onclick="fecharModalSalao()" style="background:none;border:none;color:var(--muted);font-size:1.4rem;cursor:pointer">✕</button>
    </div>
    <div style="font-size:.7rem;color:var(--muted);margin-bottom:8px">🧑‍🍳 ${sess.garcomNome||'—'} · 👥 ${sess.pessoas||'-'} pessoas</div>
    <div style="max-height:110px;overflow-y:auto;margin-bottom:6px">
      ${(sess.itens||[]).map(it=>`<div style="display:flex;justify-content:space-between;font-size:.74rem;padding:2px 0;color:var(--muted)"><span>${it.qtd>1?it.qtd+'x ':''}${it.nome}</span><span>${_rBRL((it.preco||0)*(it.qtd||1))}</span></div>`).join('')||'<div style="font-size:.72rem;color:var(--muted)">Sem itens</div>'}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:.8rem;padding:4px 0;border-top:1px solid #2a2520"><span>Subtotal</span><span>${_rBRL(comandaTotal(m))}</span></div>
    <label style="display:flex;align-items:center;justify-content:space-between;font-size:.78rem;padding:6px 0">
      <span style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="fc-taxa-on" checked onchange="recalcFechamento()"> Taxa de serviço</span>
      <span style="display:flex;align-items:center;gap:4px"><input id="fc-taxa-pct" type="number" min="0" max="100" value="10" oninput="recalcFechamento()" style="width:48px;background:var(--card);border:1px solid #3a3530;color:var(--cream);border-radius:6px;padding:4px 6px;font-size:.78rem;text-align:center">%</span>
    </label>
    <div style="display:flex;gap:8px;margin:4px 0">
      <div style="flex:1"><label class="edit-lbl">Desconto (R$)</label><input id="fc-desc" type="number" min="0" value="0" oninput="recalcFechamento()" style="${inp}"></div>
      <div style="flex:1"><label class="edit-lbl">Nº de pessoas</label><input id="fc-pessoas" type="number" min="1" value="${sess.pessoas||1}" oninput="recalcFechamento()" style="${inp}"></div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:4px">
      <input id="fc-cupom" placeholder="Cupom (opcional)" style="flex:1;${inp};text-transform:uppercase">
      <button onclick="aplicarCupomCaixa()" class="opc-btn">Aplicar</button>
    </div>
    <div id="fc-cupom-msg" style="font-size:.68rem;margin-bottom:6px"></div>
    <div style="display:flex;justify-content:space-between;font-size:.74rem;color:var(--muted);padding:2px 0"><span>Taxa de serviço</span><span id="fc-taxa-v">R$0,00</span></div>
    <div style="display:flex;justify-content:space-between;font-size:.74rem;color:var(--muted);padding:2px 0"><span>Desconto</span><span id="fc-desc-v">R$0,00</span></div>
    <div style="display:flex;justify-content:space-between;font-family:'Bebas Neue',sans-serif;font-size:1.5rem;color:var(--orange);border-top:1px solid #2a2520;padding-top:6px;margin-top:4px"><span>TOTAL</span><span id="fc-total">R$0,00</span></div>
    <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--muted);margin-bottom:12px"><span id="fc-div-lbl">Por pessoa (1)</span><span id="fc-div">R$0,00</span></div>
    <label class="edit-lbl">Pagamento</label>
    <div style="display:flex;gap:6px;margin:4px 0 8px">
      <button class="edit-pag-btn fc-pag sel" data-pag="pix" onclick="selFormaPag('pix')">📱 PIX</button>
      <button class="edit-pag-btn fc-pag" data-pag="dinheiro" onclick="selFormaPag('dinheiro')">💵 Dinheiro</button>
      <button class="edit-pag-btn fc-pag" data-pag="cartao" onclick="selFormaPag('cartao')">💳 Cartão</button>
    </div>
    <div id="fc-troco-wrap" style="display:none;gap:8px;margin-bottom:8px">
      <div style="flex:1"><label class="edit-lbl">Valor recebido (R$)</label><input id="fc-recebido" type="number" min="0" oninput="recalcFechamento()" style="${inp}"></div>
      <div style="flex:1"><label class="edit-lbl">Troco</label><div id="fc-troco" style="padding:7px 8px;font-weight:700;color:#27ae60">R$0,00</div></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button onclick="imprimirConta()" style="flex:1;padding:10px;background:var(--card);color:var(--cream);border:1px solid #3a3530;border-radius:8px;font-weight:700;cursor:pointer">🖨️ Imprimir conta</button>
      <button onclick="concluirFechamento()" style="flex:2;padding:10px;background:linear-gradient(135deg,#27ae60,#1e8449);color:#fff;border:none;border-radius:8px;font-family:'Bebas Neue',sans-serif;font-size:1.05rem;letter-spacing:1px;cursor:pointer">✓ RECEBER E LIBERAR</button>
    </div>`;
  document.getElementById('modal-salao').style.display='flex';
  recalcFechamento();
}
function recalcFechamento(){
  const m=mesas.find(x=>x._id===caixaMesaId); if(!m) return;
  const subtotal=comandaTotal(m);
  const taxaOn=document.getElementById('fc-taxa-on')?.checked;
  const taxaPct=parseFloat(document.getElementById('fc-taxa-pct')?.value)||0;
  const taxa=taxaOn?Math.round(subtotal*taxaPct)/100:0;
  const descManual=parseFloat(document.getElementById('fc-desc')?.value)||0;
  const descCupom=cupomCaixa?cupomCaixa.desconto:0;
  const desconto=descManual+descCupom;
  const total=Math.max(0,subtotal+taxa-desconto);
  const pessoas=Math.max(1,parseInt(document.getElementById('fc-pessoas')?.value)||1);
  _fcCalc={subtotal,taxa,desconto,total,pessoas};
  const set=(id,v)=>{const e=document.getElementById(id); if(e) e.textContent=v;};
  set('fc-taxa-v',_rBRL(taxa)); set('fc-desc-v','- '+_rBRL(desconto)); set('fc-total',_rBRL(total));
  set('fc-div-lbl',`Por pessoa (${pessoas})`); set('fc-div',_rBRL(total/pessoas));
  if(fcForma==='dinheiro'){ const rec=parseFloat(document.getElementById('fc-recebido')?.value)||0; set('fc-troco',_rBRL(Math.max(0,rec-total))); }
}
function aplicarCupomCaixa(){
  const code=(document.getElementById('fc-cupom').value||'').trim().toUpperCase();
  const msg=document.getElementById('fc-cupom-msg');
  const m=mesas.find(x=>x._id===caixaMesaId); const subtotal=comandaTotal(m);
  const fail=t=>{cupomCaixa=null;msg.style.color='#e74c3c';msg.textContent=t;recalcFechamento();};
  if(!code){ cupomCaixa=null; msg.textContent=''; recalcFechamento(); return; }
  const c=(typeof cupons!=='undefined'?cupons:[]).find(x=>x.codigo===code);
  if(!c) return fail('❌ Cupom inválido');
  if(c.ativo===false || (typeof isExp==='function'&&isExp(c))) return fail('❌ Cupom inativo/expirado');
  if(c.usosMax>0 && (c.usosFeitos||0)>=c.usosMax) return fail('❌ Cupom esgotado');
  if(c.minimo>0 && subtotal<c.minimo) return fail(`❌ Mínimo R$${c.minimo}`);
  let desc=0;
  if(c.tipo==='pct') desc=Math.round(subtotal*c.valor)/100;
  else if(c.tipo==='fixo') desc=c.valor;
  else { cupomCaixa=null; msg.style.color='#f39c12'; msg.textContent='ℹ️ Esse tipo de cupom não se aplica no caixa'; recalcFechamento(); return; }
  cupomCaixa={codigo:c.codigo,_id:c._id,desconto:desc};
  msg.style.color='#27ae60'; msg.textContent=`✅ ${c.codigo} aplicado (- ${_rBRL(desc)})`;
  recalcFechamento();
}
function selFormaPag(f){
  fcForma=f;
  document.querySelectorAll('#modal-salao-box .fc-pag').forEach(b=>b.classList.toggle('sel',b.dataset.pag===f));
  const w=document.getElementById('fc-troco-wrap'); if(w) w.style.display=f==='dinheiro'?'flex':'none';
  recalcFechamento();
}
function contaHTML(){
  const m=mesas.find(x=>x._id===caixaMesaId); if(!m) return '';
  const c=_fcCalc||{}, sess=m.sessao||{itens:[]};
  const money=n=>'R$'+Number(n||0).toFixed(2).replace('.',',');
  const linhas=(sess.itens||[]).map(it=>`<div class="row"><span>${it.qtd>1?it.qtd+'x ':''}${it.nome}</span><span>${money((it.preco||0)*(it.qtd||1))}</span></div>`).join('');
  return `<html><head><meta charset="utf-8"><style>${CSS_CUPOM}</style></head><body>
    <div class="c big b">${(TCHO.loja&&TCHO.loja.nome)||'TCHO BURGUER'}</div>
    <div class="c b">CONTA — MESA ${m.numero}</div>
    <div class="c" style="font-size:11px">${sess.garcomNome||''} · ${sess.pessoas||''} pessoa(s) · ${new Date().toLocaleString('pt-BR')}</div>
    <div class="line"></div>${linhas}<div class="line"></div>
    <div class="row"><span>Subtotal</span><span>${money(c.subtotal)}</span></div>
    ${c.taxa?`<div class="row"><span>Taxa de servico</span><span>${money(c.taxa)}</span></div>`:''}
    ${c.desconto?`<div class="row"><span>Desconto</span><span>- ${money(c.desconto)}</span></div>`:''}
    <div class="row big b"><span>TOTAL</span><span>${money(c.total)}</span></div>
    <div class="row"><span>Por pessoa (${c.pessoas})</span><span>${money((c.total||0)/(c.pessoas||1))}</span></div>
    <div class="line"></div><div class="c">Obrigado pela preferencia!</div>
  </body></html>`;
}
function imprimirConta(){
  recalcFechamento();
  const html=contaHTML(); if(!html) return;
  fetch('http://localhost:3333/imprimir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cozinha:html})})
    .then(r=>r.json()).then(d=>{ if(d.ok) showToast('🖨️ Conta impressa!','tok-ok'); else abrirJanelaImpressao(html,400); })
    .catch(()=>{ showToast('🖨️ Abrindo conta...','tok-info'); abrirJanelaImpressao(html,400); });
}
async function concluirFechamento(){
  const m=mesas.find(x=>x._id===caixaMesaId); if(!m) return;
  recalcFechamento();
  const c=_fcCalc||{}, sess=m.sessao||{itens:[]};
  let numOrdem;
  try{ const ref=db.collection('config').doc('contador'); numOrdem=await db.runTransaction(async t=>{const d=await t.get(ref);const n=(d.exists?d.data().ultimo:0)+1;t.set(ref,{ultimo:n},{merge:true});return n;}); }
  catch(e){ numOrdem=Math.floor(Math.random()*900)+100; }
  const num='#'+String(numOrdem).padStart(3,'0');
  const itensTxt=(sess.itens||[]).map(it=>`${it.qtd>1?it.qtd+'x ':''}${it.nome} — R$${(it.preco||0)*(it.qtd||1)}`);
  const horaStr=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const agora=firebase.firestore.FieldValue.serverTimestamp();
  const pedido={
    id:numOrdem, num, tipo:'mesa', mesaNumero:m.numero, nome:`Mesa ${m.numero}`, tel:'',
    garcom:sess.garcomNome||'', pessoas:sess.pessoas||1,
    itens:itensTxt, total:c.total||0, subtotal:c.subtotal||0, taxaServico:c.taxa||0,
    desconto:c.desconto||0, cupom:cupomCaixa?cupomCaixa.codigo:'', pag:fcForma||'pix',
    frete:0, status:'finalizado', origem:'mesa', impresso:true,
    hora:agora, horaStr, horaFim:horaStr, criadoEm:agora,
  };
  db.collection('pedidos').add(pedido).catch(console.error);              // conta como venda no financeiro/histórico
  if(cupomCaixa&&cupomCaixa._id) db.collection('cupons').doc(cupomCaixa._id).update({usosFeitos:firebase.firestore.FieldValue.increment(1)}).catch(()=>{});
  db.collection('mesas').doc(m._id).update({status:'livre', sessao:firebase.firestore.FieldValue.delete()}).catch(console.error);   // libera a mesa
  m.status='livre'; delete m.sessao;
  fecharModalSalao();
  showToast(`✅ Mesa ${m.numero} paga (${fcForma}) e liberada`,'tok-ok');
  renderCaixa(); renderMapaMesas();
}

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
  ['man-nome','man-tel','man-frete','man-obs','man-cep','man-rua','man-numero','man-comp','man-cidade'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const cepMsg=document.getElementById('man-cep-msg'); if(cepMsg) cepMsg.textContent='';
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
// Busca o endereço pelo CEP (ViaCEP) e preenche rua/cidade + tenta casar o bairro atendido — igual ao cliente
async function buscarCepManual(){
  const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const cep=(document.getElementById('man-cep').value||'').replace(/\D/g,'');
  const msg=document.getElementById('man-cep-msg');
  if(cep.length!==8){ if(msg){ msg.style.color='#e74c3c'; msg.textContent='CEP inválido (precisa de 8 dígitos).'; } return; }
  if(msg){ msg.style.color='var(--muted)'; msg.textContent='🔍 Buscando...'; }
  try{
    const d=await fetch(`https://viacep.com.br/ws/${cep}/json/`).then(r=>r.json());
    if(d.erro){ if(msg){ msg.style.color='#e74c3c'; msg.textContent='CEP não encontrado.'; } return; }
    if(d.logradouro) document.getElementById('man-rua').value=d.logradouro;
    if(d.localidade) document.getElementById('man-cidade').value=`${d.localidade}${d.uf?' / '+d.uf:''}`;
    // tenta casar o bairro do CEP com a lista de bairros atendidos
    const bv=norm(d.bairro);
    const sel=document.getElementById('man-bairro');
    let casou=false;
    if(bv && sel){
      for(const opt of sel.options){
        const ov=norm(opt.value);
        if(ov===bv || ov.includes(bv) || bv.includes(ov)){ sel.value=opt.value; casou=true; break; }
      }
    }
    onManualBairro(); // atualiza o frete conforme o bairro selecionado
    if(msg){
      if(casou){ msg.style.color='#27ae60'; msg.textContent=`✅ ${d.bairro} — bairro atendido.`; }
      else if(d.bairro){ msg.style.color='#f39c12'; msg.textContent=`⚠️ Bairro "${d.bairro}" fora da lista — selecione manualmente.`; }
      else { msg.style.color='#f39c12'; msg.textContent='⚠️ CEP sem bairro — selecione manualmente.'; }
    }
    document.getElementById('man-numero').focus();
  }catch(e){ if(msg){ msg.style.color='#e74c3c'; msg.textContent='Erro ao consultar o CEP.'; } }
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
  const cust=getProdsCustom().map(p=>({nome:p.n||p.nome,preco:(p.p!==undefined?p.p:p.preco),cat:'x',id:p.id,opcoes:null}));
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
    manualItens.push({nome:prod.nome, preco:prod.preco, id:prod.id});
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
  manualItens.push({nome, preco, id:p.id});
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
  // Endereço completo (igual ao cliente): "rua, número, complemento" + cidade
  let endereco='', cidade='';
  if(manualTipo==='delivery'){
    const rua=(document.getElementById('man-rua').value||'').trim();
    const numero=(document.getElementById('man-numero').value||'').trim();
    const comp=(document.getElementById('man-comp').value||'').trim();
    cidade=(document.getElementById('man-cidade').value||'').trim();
    if(rua) endereco=`${rua}${numero?', '+numero:''}${comp?', '+comp:''}`;
  }

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
    tipo:manualTipo, nome, tel, bairro, endereco, cidade,
    pag:manualPag, frete, total, desconto:0, cupom:'',
    obs, itens, status:statusPedido, origem:'manual',
    hora:tsPedido,
    horaStr:dataPedido.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    impresso:statusPedido==='finalizado',                  // passado não imprime
    criadoEm:tsPedido,
  };

  // Baixa de estoque só para venda de AGORA (status 'novo'). Pedido retroativo
  // (finalizado numa data passada) é só registro histórico e não mexe no estoque atual.
  if(statusPedido==='novo'){
    const consumo={};
    manualItens.forEach(it=>{ if(it.id) consumo[it.id]=(consumo[it.id]||0)+1; });
    baixarEstoquePorConsumo(consumo);
  }

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
      if(autoAceitar)setTimeout(()=>moverStatus(p._id,proximaEtapaAtiva(p),true),600);
      else renderAll();
    }
    showToast(msg,'tok-ok');
  }
}

// ── IMPRESSÃO ──────────────────────────────────────────────────
const CSS_CUPOM = `*{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:10px;max-width:280px}.c{text-align:center}.b{font-weight:bold}.line{border-top:1px dashed #000;margin:7px 0}.row{display:flex;justify-content:space-between;margin:3px 0}.big{font-size:18px;font-weight:bold}.obs-box{border:2px solid #000;padding:5px 6px;margin:5px 0;font-weight:800;font-size:15px;text-align:center}.rem{display:inline-block;border:1.5px solid #000;border-radius:3px;padding:0 4px;font-weight:800}@media print{@page{margin:3mm;size:80mm auto}}`;

function abrirJanelaImpressao(html, largura=420){
  const win = window.open('','_blank',`width=${largura},height=560`);
  if(!win) return;
  win.document.write(html);
  win.document.close();
}

// Realça "sem <ingredientes>" (removidos) no cupom pra cozinha não errar.
function destacaRemocao(item){
  return String(item).replace(/\bsem\s+([^•)—]+)/gi, (m,p1)=>`<span class="rem">⚠ NÃO ${p1.trim().toUpperCase()}</span>`);
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
    ${p.itens.map(i=>`<div style="margin:3px 0">• ${destacaRemocao(i)}</div>`).join('')}
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
    <div class="line"></div>
    <div class="c" style="font-size:10px">App de pedidos: PedidoEasy — pedidoeasy.com.br</div>
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
  if(statusAnterior==='novo' && novoStatus!=='cancelado' && !auto && !p.impresso) setTimeout(()=>imprimirPedido(p),200);
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

// ── ARRASTAR COM O DEDO (touch) ────────────────────────────────
// O drag-and-drop do HTML5 só funciona com mouse. Aqui replicamos pra toque:
// SEGURA o card ~300ms (long-press) e arrasta. Um toque rápido/deslize continua
// rolando entre as colunas (não conflita). Reaproveita canDrop() e moverStatus().
(function(){
  let tId=null, tSrc=null, tClone=null, tCardW=0, tDragging=false, tTimer=null, tStartX=0, tStartY=0;
  const acharCard=el=>{ while(el && el!==document.body){ if(el.classList && el.classList.contains('card')) return el; el=el.parentElement; } return null; };
  const colUnder=(x,y)=>{ let n=document.elementFromPoint(x,y); while(n && n!==document.body){ if(n.classList && n.classList.contains('col')) return n; n=n.parentElement; } return null; };
  const limpar=()=>{ if(tTimer){clearTimeout(tTimer);tTimer=null;} if(tClone){tClone.remove();tClone=null;} document.querySelectorAll('.card.dragging').forEach(c=>c.classList.remove('dragging')); document.querySelectorAll('.col.drag-over').forEach(c=>c.classList.remove('drag-over')); tId=null;tSrc=null;tDragging=false; };

  document.addEventListener('touchstart', function(e){
    const kb=document.getElementById('kanban'); if(!kb) return;
    const card=acharCard(e.target); if(!card || !kb.contains(card)) return;
    if(e.target.closest('button, a, textarea, input, svg')) return;   // não arrasta ao tocar num botão
    const t=e.touches[0];
    const id=(card.id||'').replace('card-','');
    const ped=acharPedido(id); if(!ped) return;
    tId=id; tSrc=ped.status; tStartX=t.clientX; tStartY=t.clientY; tCardW=card.offsetWidth; tDragging=false;
    tTimer=setTimeout(()=>{                                           // long-press → entra em modo arrasto
      tDragging=true; tTimer=null;
      card.classList.add('dragging');
      tClone=card.cloneNode(true);
      tClone.style.cssText='position:fixed;pointer-events:none;z-index:9999;opacity:.92;width:'+tCardW+'px;left:0;top:0;transform:translate('+(tStartX-tCardW/2)+'px,'+(tStartY-24)+'px);box-shadow:0 12px 34px rgba(0,0,0,.65);rotate:2deg';
      document.body.appendChild(tClone);
      try{ if(navigator.vibrate) navigator.vibrate(25); }catch(_){}
    }, 300);
  }, {passive:true});

  document.addEventListener('touchmove', function(e){
    if(!tId) return;
    const t=e.touches[0];
    if(!tDragging){
      // moveu antes do long-press → é rolagem, cancela o arrasto
      if(Math.abs(t.clientX-tStartX)>10 || Math.abs(t.clientY-tStartY)>10){ if(tTimer){clearTimeout(tTimer);tTimer=null;} tId=null; }
      return;
    }
    e.preventDefault();                                              // arrastando → trava a rolagem
    tClone.style.transform='translate('+(t.clientX-tCardW/2)+'px,'+(t.clientY-24)+'px)';
    // auto-rola o kanban ao chegar perto das bordas (colunas ficam acessíveis)
    const kb=document.getElementById('kanban'); if(kb){ const r=kb.getBoundingClientRect(); if(t.clientX>r.right-42) kb.scrollLeft+=14; else if(t.clientX<r.left+42) kb.scrollLeft-=14; }
    document.querySelectorAll('.col.drag-over').forEach(c=>c.classList.remove('drag-over'));
    const col=colUnder(t.clientX,t.clientY);
    if(col){ const to=(col.id||'').replace('col-',''); if(canDrop(tSrc,to)) col.classList.add('drag-over'); }
  }, {passive:false});

  const soltar=function(e){
    if(!tId){ limpar(); return; }
    const dragging=tDragging;
    const t=e.changedTouches&&e.changedTouches[0];
    const col=(dragging&&t)?colUnder(t.clientX,t.clientY):null;
    const id=tId, src=tSrc;
    limpar();
    if(dragging && col){ const to=(col.id||'').replace('col-',''); if(canDrop(src,to)) moverStatus(id,to); }
  };
  document.addEventListener('touchend', soltar);
  document.addEventListener('touchcancel', soltar);
})();

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
  const tipoEl = p.tipo==='delivery' ? `<span class="card-tipo td">🛵 DEL</span>`
              : p.tipo==='mesa'     ? `<span class="card-tipo tr" style="background:#2a1a08;color:#e67e22">🍽️ MESA ${p.mesaNumero||''}</span>`
              : `<span class="card-tipo tr">🏃 RET</span>`;
  const pb=p.impresso?`<span class="badge-print">🖨</span>`:'';
  const fid=p._id;
  let btns='';
  // Próxima etapa ATIVA (pula as desligadas). Ver proximaEtapaAtiva().
  const prox=proximaEtapaAtiva(p);
  const infoProx=getKanbanStages().find(s=>s.id===prox);
  const nomeProx=infoProx?`${infoProx.e} ${infoProx.t}`:'Finalizar';
  if(p.status==='novo'){
    btns=autoAceitar?`<span style="font-size:.6rem;color:#f39c12">⚡ aceite automático</span>`
      :`<button class="btn-k bk-aceitar" onclick="moverStatus('${fid}','${prox}')">✓ ACEITAR + 🖨️</button><button class="btn-k bk-cancel" onclick="cancelar('${fid}')">×</button>`;
  } else if(prox==='finalizado'){
    const lbl=p.tipo==='delivery'?'ENTREGUE ✓':(p.status==='pronto'?'RETIRADO ✓':'FINALIZAR ✓');
    btns=`<button class="btn-k bk-final" onclick="moverStatus('${fid}','finalizado')">${lbl}</button>`;
  } else {
    btns=`<button class="btn-k bk-pronto" onclick="moverStatus('${fid}','${prox}')">${nomeProx} →</button>`;
  }
  const dragHint=(prox!=='finalizado')?`<div class="drag-hint">↔ Arraste para ${nomeProx}</div>`:'';
  return`<div class="card" id="card-${fid}" draggable="true" ondragstart="onDragStart(event,'${fid}','${p.status}')" ondragend="onDragEnd()">
    <div class="card-hdr"><span class="card-num">${p.num||('#'+p.id)}${pb}</span>${tipoEl}</div>
    <div class="card-cli">${p.nome}${p.bairro?` · ${p.bairro}`:''}</div>
    <div class="card-itens">${p.itens.join(' · ')}</div>
    ${p.obs?`<div class="card-obs">⚠ ${p.obs}</div>`:''}
    <div class="card-ftr"><div class="card-total">R$${p.total}</div><div style="display:flex;align-items:center;gap:8px"><span style="font-size:.68rem;color:var(--muted)" title="Horário do pedido">🕐 ${horaPedido(p)}</span><div class="timer ${cls}">⏱ ${tt(m)}</div></div></div>
    <div class="card-btns">${btns}${temTelValido(p)?`<button class="btn-editar-card" onclick="avisarCliente('${fid}')" title="Avisar cliente no WhatsApp" style="color:#25d366;border-color:#1a5a33;display:inline-flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></button>`:''}<button class="btn-editar-card" onclick="reimprimirPedido('${fid}')" title="Imprimir cupom">🖨️</button><button class="btn-editar-card" onclick="abrirModalEditar('${fid}')" title="Editar pedido">✏️</button><button class="btn-editar-card" onclick="excluirPedido('${fid}')" title="Excluir pedido" style="color:#e74c3c">🗑️</button></div>
    ${dragHint}
  </div>`;
}

// ── AVISAR CLIENTE NO WHATSAPP (modelos por etapa, editáveis) ───
// Modelos padrão por etapa. O dono edita em Marketing → Mensagens.
const MSG_DEFAULTS = {
  novo:      'Olá {nome}! 🍔 Recebemos seu pedido {num} e já vamos preparar. Qualquer coisa é só chamar!',
  prep:      'Olá {nome}! 👨‍🍳 Seu pedido {num} está em preparo. Já já fica pronto!',
  pronto:    'Olá {nome}! ✅ Seu pedido {num} está pronto!',
  entrega:   'Olá {nome}! 🛵 Seu pedido {num} *saiu para entrega* e já está a caminho. Bom apetite! 😋',
  finalizado:'Olá {nome}! 🙏 Obrigado pela preferência! Volte sempre! 🍔',
};
function getMsgTemplates(){
  let s=null; try{ s=JSON.parse(localStorage.getItem('tcho_msg_templates')||'null'); }catch(e){}
  return Object.assign({}, MSG_DEFAULTS, s||{});
}
// Troca as variáveis {nome} {num} {total} {tipo} {bairro} pelos dados do pedido.
function fillTemplate(tpl, p){
  const nome=(p.nome||'').trim().split(' ')[0]||'tudo bem';
  return String(tpl||'')
    .replace(/\{nome\}/gi, nome)
    .replace(/\{num\}/gi, p.num||('#'+p.id))
    .replace(/\{total\}/gi, 'R$'+(p.total!=null?p.total:'?'))
    .replace(/\{tipo\}/gi, p.tipo==='delivery'?'Delivery':(p.tipo==='mesa'?'Mesa':'Retirada'))
    .replace(/\{bairro\}/gi, p.bairro||'');
}
function msgStatusCliente(p){
  const tpls=getMsgTemplates();
  const tpl=tpls[p.status]!==undefined?tpls[p.status]:(tpls.finalizado||'Olá {nome}! Sobre o seu pedido {num}...');
  return fillTemplate(tpl, p);
}
function temTelValido(p){ return (p.tel||'').replace(/\D/g,'').length >= 10; }

// Clique no WhatsApp do card → abre modal com a msg da etapa pra revisar/editar antes de enviar.
function avisarCliente(id){
  const p = acharPedido(id); if(!p) return;
  const tel = (p.tel||'').replace(/\D/g,'');
  if(tel.length < 10){ showToast('Cliente sem telefone válido','tok-err'); return; }
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const ov=document.createElement('div');
  ov.id='modal-whats';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML=`<div style="background:var(--surface);border:1px solid #2a2520;border-radius:14px;padding:18px;max-width:430px;width:100%">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.15rem;letter-spacing:1px;color:#25d366;margin-bottom:3px">Avisar cliente no WhatsApp</div>
      <div style="font-size:.74rem;color:var(--muted);margin-bottom:10px">${esc(p.nome||'')} · ${p.num||('#'+p.id)} — revise/edite e envie</div>
      <textarea id="whats-msg" class="edit-inp" rows="5" style="resize:vertical;line-height:1.5">${esc(msgStatusCliente(p))}</textarea>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button onclick="fecharModalWhats()" style="flex:1;padding:11px;background:var(--card);border:1px solid #3a3530;color:var(--muted);border-radius:8px;font-weight:700;cursor:pointer;font-family:'Barlow',sans-serif">Cancelar</button>
        <button onclick="enviarWhats('${tel}')" style="flex:2;padding:11px;background:#25d366;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-family:'Barlow',sans-serif">Enviar no WhatsApp →</button>
      </div>
    </div>`;
  ov.addEventListener('click', e=>{ if(e.target===ov) fecharModalWhats(); });
  document.body.appendChild(ov);
  const ta=document.getElementById('whats-msg'); if(ta) ta.focus();
}
function fecharModalWhats(){ const m=document.getElementById('modal-whats'); if(m) m.remove(); }
function enviarWhats(tel){
  const ta=document.getElementById('whats-msg');
  const txt=ta?ta.value:'';
  fecharModalWhats();
  window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(txt)}`, '_blank');
}

// ── Marketing → Mensagens: editar os modelos por etapa ──────────
function renderMsgTemplates(){
  const el=document.getElementById('msg-templates'); if(!el) return;
  const tpls=getMsgTemplates();
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const stages=getKanbanStages().filter(s=>s.on).map(s=>({id:s.id,e:s.e,t:s.t}));
  stages.push({id:'finalizado',e:'✅',t:'Finalizado'});
  el.innerHTML=stages.map(s=>`
    <div style="margin-bottom:12px">
      <label class="edit-lbl">${s.e} ${s.t}</label>
      <textarea class="edit-inp" data-stage="${s.id}" rows="2" style="resize:vertical;line-height:1.5">${esc(tpls[s.id]!==undefined?tpls[s.id]:'')}</textarea>
    </div>`).join('');
}
function salvarMsgTemplates(){
  const obj={};
  document.querySelectorAll('#msg-templates textarea[data-stage]').forEach(t=>{ obj[t.dataset.stage]=t.value; });
  localStorage.setItem('tcho_msg_templates', JSON.stringify(obj));
  db.collection('config').doc('operacao').set({msgTemplates:obj},{merge:true}).catch(console.error);
  const st=document.getElementById('msg-templates-status'); if(st){ st.textContent='✅ Modelos salvos! Já valem no botão de WhatsApp dos pedidos.'; setTimeout(()=>{ if(st) st.textContent=''; },3000); }
  showToast('💬 Modelos de mensagem salvos','tok-ok');
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
let editCustProd = null;  // produto em personalização no modal de edição
let editCustIdx = -1;     // índice do item sendo personalizado (-1 = novo item)

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
  cancelarCustEdit();
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
  const base=PRODS.map(p=>({nome:p.n,preco:p.p,cat:p.cat,id:p.id,opcoes:p.opcoes||null}));
  const cust=getProdsCustom().map(p=>({nome:p.n||p.nome,preco:(p.p!==undefined?p.p:p.preco),cat:'x',id:p.id,opcoes:null}));
  return [...base,...cust];
}

function renderItensEdit(){
  const lista=document.getElementById('edit-itens-lista');
  lista.innerHTML=editItens.map((it,i)=>`
    <div style="display:flex;gap:6px;align-items:center">
      <input class="edit-inp" style="flex:1;font-size:.74rem;padding:7px 9px" value="${(it.nome||'').replace(/"/g,'&quot;')}" onchange="updItemNome(${i},this.value)">
      <span style="color:var(--muted);font-size:.7rem">R$</span>
      <input class="edit-inp" type="number" min="0" step="1" style="width:66px;font-size:.74rem;padding:7px 6px" value="${it.preco||0}" oninput="updItemPreco(${i},this.value)">
      <button type="button" onclick="editarCustItem(${i})" title="Personalizar (ponto, adicionais, tirar...)" style="background:var(--surface);color:var(--orange);border:1px solid var(--orange);border-radius:6px;width:30px;height:32px;cursor:pointer;flex:0 0 auto">✎</button>
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
  sel.value='';
  // Hambúrguer ou item com sabor → abre personalização (igual ao cliente/manual).
  // Demais (batata, água) → adiciona direto.
  if(prod.cat==='b' || (prod.opcoes && prod.opcoes.length)){
    const ing = prod.cat==='b' ? (TCHO.burguers.find(b=>b.id===prod.id)?.ing || []) : [];
    abrirCustEdit(prod, ing, null, -1);
  } else {
    editItens.push({nome:prod.nome, preco:prod.preco});
    renderItensEdit();
  }
}
function removerItemEdit(i){ editItens.splice(i,1); renderItensEdit(); }
function updItemNome(i,v){ if(editItens[i]) editItens[i].nome=v; }
function updItemPreco(i,v){ if(editItens[i]){ editItens[i].preco=parseFloat(v)||0; recalcEditTotal(); } }

// ── Personalização de item no modal de EDIÇÃO (reaproveita a lógica do manual) ──
// Separa "Nome (detalhes)" → { base, det }
function parseNomeDet(nome){
  let base=String(nome||'').trim(), det='';
  const m=base.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if(m){ base=m[1].trim(); det=m[2].trim(); }
  return {base, det};
}
// Interpreta os detalhes "ponto • sachê X • sem Y • +Z" pra pré-marcar as opções
function parseDetItem(det){
  const out={ponto:'', sache:'', removidos:[], adicionais:[], opcao:''};
  if(!det) return out;
  det.split('•').map(x=>x.trim()).filter(Boolean).forEach(part=>{
    if(/^sachê\s+/i.test(part)) out.sache=part.replace(/^sachê\s+/i,'').trim();
    else if(/^sem\s+/i.test(part)) out.removidos=part.replace(/^sem\s+/i,'').split(',').map(x=>x.trim()).filter(Boolean);
    else if(/^\+/.test(part)) out.adicionais=part.split(',').map(x=>x.trim().replace(/^\+/,'').trim()).filter(Boolean);
    else if(TCHO.pontos.some(p=>p.nome===part)) out.ponto=part;
    else if(!out.opcao) out.opcao=part; // sabor
  });
  return out;
}
// Clique no ✎ de um item existente: acha o produto base e abre o painel pré-preenchido
function editarCustItem(i){
  const it=editItens[i]; if(!it) return;
  const {base,det}=parseNomeDet(it.nome||'');
  const prod=listaProdutosEdit().find(p=>(p.nome||'').toLowerCase()===base.toLowerCase());
  if(!prod || !(prod.cat==='b' || (prod.opcoes && prod.opcoes.length))){
    showToast('✏️ Item sem personalização — edite pelo campo de texto','tok-err'); return;
  }
  const ing = prod.cat==='b' ? (TCHO.burguers.find(b=>b.id===prod.id)?.ing || []) : [];
  abrirCustEdit(prod, ing, parseDetItem(det), i);
}
// Monta o painel de personalização (pré-marca a partir de `pre`, se houver)
function abrirCustEdit(prod, ing, pre, idx){
  editCustProd={...prod, ing:ing||[]}; editCustIdx=(idx===undefined?-1:idx);
  const el=document.getElementById('edit-cust'); if(!el) return;
  const isB = prod.cat==='b';
  const esc=s=>String(s).replace(/"/g,'&quot;');
  const sel=(a,b)=>a===b?' selected':'';
  const titulo = editCustIdx>=0 ? 'Editar item' : 'Novo item';
  let h=`<div style="font-weight:700;color:var(--orange);font-size:.8rem;margin-bottom:8px">${titulo}: ${prod.nome} — R$${prod.preco}</div>`;
  if(prod.opcoes && prod.opcoes.length){
    h+=`<label class="edit-lbl">🥤 Sabor</label><select id="ec-opcao" class="edit-inp" style="font-size:.74rem;margin:4px 0 8px">${prod.opcoes.map(o=>`<option${sel(o,pre&&pre.opcao)}>${o}</option>`).join('')}</select>`;
  }
  if(isB){
    h+=`<label class="edit-lbl">🔥 Ponto</label><select id="ec-ponto" class="edit-inp" style="font-size:.74rem;margin:4px 0 8px">${TCHO.pontos.map(p=>`<option${sel(p.nome,pre&&pre.ponto)}>${p.nome}</option>`).join('')}</select>`;
    h+=`<label class="edit-lbl">🥫 Sachê</label><select id="ec-sache" class="edit-inp" style="font-size:.74rem;margin:4px 0 8px">${TCHO.saches.map(s=>`<option${sel(s.nome,pre&&pre.sache)}>${s.nome}</option>`).join('')}</select>`;
    if((ing||[]).length){
      h+=`<label class="edit-lbl">➖ Tirar ingrediente</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 8px">${ing.map(i=>`<label style="font-size:.72rem;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" class="ec-rem" value="${esc(i)}"${pre&&pre.removidos.includes(i)?' checked':''}> ${i}</label>`).join('')}</div>`;
    }
    const adic=getAdicionaisAdmin();
    if(adic.length){
      h+=`<label class="edit-lbl">➕ Adicionais</label><div style="display:flex;flex-direction:column;gap:4px;margin:4px 0 8px">${adic.map(a=>`<label style="font-size:.72rem;display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" class="ec-adic" value="${esc(a.nome)}" data-preco="${a.preco}"${pre&&pre.adicionais.includes(a.nome)?' checked':''} onchange="recalcCustEdit()"> ${a.nome} <span style="color:var(--muted)">+R$${a.preco}</span></label>`).join('')}</div>`;
    }
  }
  h+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
      <span style="font-size:.72rem;color:var(--muted)">Item: <b id="ec-preco" style="color:var(--text)">R$${prod.preco}</b></span>
      <div style="display:flex;gap:6px">
        <button type="button" onclick="cancelarCustEdit()" style="padding:6px 10px;background:var(--surface);color:var(--muted);border:1px solid #3a3530;border-radius:6px;font-size:.72rem;cursor:pointer">Cancelar</button>
        <button type="button" onclick="confirmarCustEdit()" style="padding:6px 12px;background:var(--orange);color:#000;border:none;border-radius:6px;font-weight:700;font-size:.72rem;cursor:pointer">✓ ${editCustIdx>=0?'Salvar item':'Adicionar item'}</button>
      </div>
    </div>`;
  el.innerHTML=h; el.style.display='block';
  recalcCustEdit();
  el.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function recalcCustEdit(){
  if(!editCustProd) return;
  let preco=editCustProd.preco;
  document.querySelectorAll('#edit-cust .ec-adic:checked').forEach(c=>preco+=parseFloat(c.dataset.preco)||0);
  const el=document.getElementById('ec-preco'); if(el) el.textContent='R$'+preco;
}
function confirmarCustEdit(){
  if(!editCustProd) return;
  const p=editCustProd;
  let preco=p.preco;
  const det=[];
  const opc=document.getElementById('ec-opcao'); if(opc && opc.value) det.push(opc.value);
  const pt=document.getElementById('ec-ponto'); if(pt && pt.value) det.push(pt.value);
  const sc=document.getElementById('ec-sache'); if(sc && sc.value && sc.value!=='Não quero') det.push('sachê '+sc.value);
  const rem=[...document.querySelectorAll('#edit-cust .ec-rem:checked')].map(c=>c.value);
  if(rem.length) det.push('sem '+rem.join(', '));
  const adic=[...document.querySelectorAll('#edit-cust .ec-adic:checked')];
  adic.forEach(c=>preco+=parseFloat(c.dataset.preco)||0);
  if(adic.length) det.push(adic.map(c=>'+'+c.value).join(', '));
  const item={ nome: det.length ? `${p.nome} (${det.join(' • ')})` : p.nome, preco };
  if(editCustIdx>=0 && editItens[editCustIdx]) editItens[editCustIdx]=item;
  else editItens.push(item);
  cancelarCustEdit();
  renderItensEdit();
}
function cancelarCustEdit(){
  editCustProd=null; editCustIdx=-1;
  const el=document.getElementById('edit-cust'); if(el){ el.style.display='none'; el.innerHTML=''; }
}

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
  cancelarCustEdit();
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
    // Qualquer etapa pode ser ligada/desligada. Ao avançar um pedido, as etapas
    // desligadas são PULADAS (ver proximaEtapaAtiva) — o pedido nunca cai numa
    // coluna que não existe.
    const out=s.map(x=>({id:x.id,e:x.e||'⬜',t:x.t||x.id,on:x.on!==false,base:KB_BASE.some(b=>b.id===x.id)}));
    KB_BASE.forEach((b,i)=>{ if(!out.find(x=>x.id===b.id)) out.splice(i,0,{...b,on:true,base:true}); });  // garante as 4 base existem
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

// Próxima etapa ATIVA do pedido, pulando as desligadas. Retirada/mesa não
// passam por "entrega". Se já está na última etapa ativa → 'finalizado'.
function proximaEtapaAtiva(p){
  const ativos=getKanbanStages().filter(s=>s.on).map(s=>s.id);
  const fluxo=ativos.filter(id=>!(id==='entrega' && p.tipo!=='delivery'));
  const i=fluxo.indexOf(p.status);
  if(i===-1 || i>=fluxo.length-1) return 'finalizado';
  return fluxo[i+1];
}

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
      <label class="toggle-wrap" style="flex-shrink:0" title="Ligar/desligar esta etapa"><input type="checkbox" ${s.on!==false?'checked':''} onchange="editKbStage(${i},'on',this.checked)"><span class="slider"></span></label>
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
      <div style="font-weight:700;color:${cor};font-size:.82rem;margin-top:5px">R$${p.total||0}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
        <button class="btn-editar-card" onclick="reimprimirPedido('${p._id}')">🖨️ Cupom</button>
        <button class="btn-editar-card" onclick="abrirModalEditar('${p._id}')">✏️ Editar</button>
        <button class="btn-editar-card" onclick="excluirPedido('${p._id}')" style="color:#e74c3c">🗑️ Excluir</button>
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

// Baixa de estoque das vendas feitas no painel (balcão/mesa). Igual à do cliente:
// só desconta produtos em MODO QUANTIDADE. consumo = { idProduto: unidades }.
// Usa transação pra ler o valor atual do Firestore e não sobrescrever outras vendas.
function baixarEstoquePorConsumo(consumo){
  const ids=Object.keys(consumo||{}).filter(Boolean);
  if(!ids.length) return;
  const ref=db.collection('cardapio').doc('estoque');
  db.runTransaction(async t=>{
    const snap=await t.get(ref);
    if(!snap.exists) return;
    const data=snap.data().data||{};
    let mudou=false;
    ids.forEach(id=>{
      const e=data[id];
      if(e && e.modo==='qtd'){ e.qtd=Math.max(0,(e.qtd||0)-consumo[id]); mudou=true; }
    });
    if(mudou) t.set(ref,{data},{merge:true});
  }).catch(e=>console.error('baixa de estoque (painel):',e));
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

// ── POPUPS NA TELA DO CLIENTE (Marketing) ───────────────────────────
// Dois popups independentes: "novidade" (novo produto) e "promo" (promoção).
// Cada um aparece 1x por pessoa; ao salvar/relançar (novo `v`), reaparece pra todos.
let novidadeCfg=JSON.parse(localStorage.getItem('tcho_novidade')||'null');
let promoCfg=JSON.parse(localStorage.getItem('tcho_promo')||'null');
// Lista de produtos (base + custom) para os seletores.
function listaProdutosNovidade(){
  const base=PRODS.map(p=>({id:p.id,nome:p.n}));
  const cust=getProdsCustom().map(p=>({id:p.id,nome:p.n||p.nome}));
  return [...base,...cust];
}
// ── Popup NOVOS PRODUTOS ──
function renderNovidade(){
  const c=document.getElementById('novidade-config'); if(!c) return;
  const cfg=novidadeCfg||{};
  const prods=listaProdutosNovidade();
  const ativo=!!cfg.ativo;
  const sel=cfg.produtoId||'';
  const nomeSel=prods.find(p=>p.id===sel)?.nome||'';
  c.innerHTML=`
    <div style="background:var(--card);border:1px solid #2a2520;border-radius:10px;padding:14px">
      <div style="font-size:.72rem;color:var(--muted);margin-bottom:12px;line-height:1.5">Popup com a <b>foto + nome + preço</b> do produto. Aparece <b>uma vez por pessoa</b>; ao salvar/relançar, reaparece pra todo mundo.</div>
      <label class="edit-lbl">Produto em destaque</label>
      <select id="nov-prod" class="edit-inp" style="width:100%;box-sizing:border-box;margin:4px 0 10px">
        <option value="">— escolha um produto —</option>
        ${prods.map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${p.nome}</option>`).join('')}
      </select>
      <label class="edit-lbl">Frase (opcional)</label>
      <textarea id="nov-texto" class="edit-inp" rows="2" style="width:100%;box-sizing:border-box;margin:4px 0 12px;resize:vertical" placeholder="Ex.: Chegou o novo X-Tudo, experimente!">${(cfg.texto||'').replace(/</g,'&lt;')}</textarea>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn-criar" onclick="salvarNovidade()">${ativo?'🔄 Atualizar / relançar':'📣 Ativar popup'}</button>
        ${ativo?`<button class="btn-editar-card" onclick="desativarNovidade()">🚫 Desativar</button>`:''}
        <span style="font-size:.72rem;color:${ativo?'#27ae60':'var(--muted)'}">${ativo?('✅ Ativo'+(nomeSel?' — '+nomeSel:'')):'Desligado'}</span>
      </div>
    </div>`;
}
function salvarNovidade(){
  const produtoId=document.getElementById('nov-prod').value;
  if(!produtoId){ showToast('⚠️ Escolha um produto','tok-err'); return; }
  const texto=(document.getElementById('nov-texto').value||'').trim();
  novidadeCfg={ativo:true, produtoId, texto, v:Date.now()};   // v novo = reaparece pra todos
  localStorage.setItem('tcho_novidade',JSON.stringify(novidadeCfg));
  salvarCardapioFS('novidade', novidadeCfg);
  renderNovidade();
  showToast('📣 Popup de novidade ativado!','tok-ok');
}
function desativarNovidade(){
  novidadeCfg={...(novidadeCfg||{}), ativo:false};
  localStorage.setItem('tcho_novidade',JSON.stringify(novidadeCfg));
  salvarCardapioFS('novidade', novidadeCfg);
  renderNovidade();
  showToast('🚫 Popup de novidade desativado','tok-info');
}
// ── Popup PROMOÇÃO ──
function renderPromo(){
  const c=document.getElementById('promo-config'); if(!c) return;
  const cfg=promoCfg||{};
  const prods=listaProdutosNovidade();
  const ativo=!!cfg.ativo;
  const sel=cfg.produtoId||'';
  c.innerHTML=`
    <div style="background:var(--card);border:1px solid #2a2520;border-radius:10px;padding:14px">
      <div style="font-size:.72rem;color:var(--muted);margin-bottom:12px;line-height:1.5">Quando <b>ativa</b>, cria a seção <b>"🔥 Promoções"</b> no cardápio do cliente (pra ele comprar) e mostra um popup de aviso. Aparece <b>uma vez por pessoa</b>; ao salvar/relançar, reaparece pra todos. Os produtos normais do cardápio <b>não são alterados</b>.</div>
      <label class="edit-lbl">Título</label>
      <input id="promo-titulo" class="edit-inp" type="text" style="width:100%;box-sizing:border-box;margin:4px 0 10px" placeholder="Ex.: Terça em dobro! 🔥" value="${(cfg.titulo||'').replace(/"/g,'&quot;')}">
      <label class="edit-lbl">Frase / descrição</label>
      <textarea id="promo-texto" class="edit-inp" rows="2" style="width:100%;box-sizing:border-box;margin:4px 0 10px;resize:vertical" placeholder="Ex.: X-Bacon com preço especial só hoje!">${(cfg.texto||'').replace(/</g,'&lt;')}</textarea>
      <label class="edit-lbl">Produto (opcional — mostra a foto e o preço original riscado)</label>
      <select id="promo-prod" class="edit-inp" style="width:100%;box-sizing:border-box;margin:4px 0 10px">
        <option value="">— nenhum —</option>
        ${prods.map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${p.nome}</option>`).join('')}
      </select>
      <label class="edit-lbl">Preço promocional (R$) — deixe vazio p/ usar o preço normal do produto</label>
      <input id="promo-preco" class="edit-inp" type="number" min="0" step="0.5" style="width:100%;box-sizing:border-box;margin:4px 0 10px" placeholder="Ex.: 25" value="${cfg.precoPromo!==undefined&&cfg.precoPromo!==null?cfg.precoPromo:''}">
      <label class="edit-lbl">Cupom (opcional)</label>
      <input id="promo-cupom" class="edit-inp" type="text" style="width:100%;box-sizing:border-box;margin:4px 0 12px;text-transform:uppercase" placeholder="Ex.: TERCA2" value="${(cfg.cupom||'').replace(/"/g,'&quot;')}">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn-criar" onclick="salvarPromo()">${ativo?'🔄 Atualizar / relançar':'🔥 Ativar promoção'}</button>
        ${ativo?`<button class="btn-editar-card" onclick="desativarPromo()">🚫 Desativar</button>`:''}
        <span style="font-size:.72rem;color:${ativo?'#27ae60':'var(--muted)'}">${ativo?'✅ Ativa':'Desligada'}</span>
      </div>
    </div>`;
}
function salvarPromo(){
  const titulo=(document.getElementById('promo-titulo').value||'').trim();
  const texto=(document.getElementById('promo-texto').value||'').trim();
  if(!titulo && !texto){ showToast('⚠️ Escreva ao menos um título ou frase','tok-err'); return; }
  const produtoId=document.getElementById('promo-prod').value||'';
  const precoRaw=(document.getElementById('promo-preco').value||'').trim();
  const precoPromo = precoRaw!=='' ? Number(precoRaw) : null;
  if(!produtoId && precoPromo===null){ showToast('⚠️ Escolha um produto ou defina um preço promocional','tok-err'); return; }
  const cupom=(document.getElementById('promo-cupom').value||'').trim().toUpperCase();
  promoCfg={ativo:true, titulo, texto, produtoId, precoPromo, cupom, v:Date.now()};
  localStorage.setItem('tcho_promo',JSON.stringify(promoCfg));
  salvarCardapioFS('promo', promoCfg);
  renderPromo();
  showToast('🔥 Popup de promoção ativado!','tok-ok');
}
function desativarPromo(){
  promoCfg={...(promoCfg||{}), ativo:false};
  localStorage.setItem('tcho_promo',JSON.stringify(promoCfg));
  salvarCardapioFS('promo', promoCfg);
  renderPromo();
  showToast('🚫 Popup de promoção desativado','tok-info');
}
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
  showCrm('crm');
  const el=document.getElementById('crm-clientes-lista');
  if(el) el.innerHTML='<div style="color:var(--muted);font-size:.78rem;padding:10px 0">🔍 Carregando clientes...</div>';
  db.collection('clientes').get().then(snap=>{
    crmClientes=snap.docs.map(d=>({_id:d.id,...d.data()}));
    renderCrmOverview();
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
  if(t==='crm')         renderCrmOverview();
  if(t==='clientes')    renderClientesCRM();
  if(t==='dashboard')   renderDashCRM();
  if(t==='campanhas')   carregarCampanhas();
  if(t==='cupons')      renderCupons();
  if(t==='recuperacao') initRecuperacao();
  if(t==='mensagens')   renderMsgTemplates();
  if(t==='novidade')    renderNovidade();
  if(t==='promo')       renderPromo();
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

// Visão geral do CRM: KPIs principais + atalhos para as demais telas.
function renderCrmOverview(){
  const el=document.getElementById('crm-over-cards');
  if(el){
    const r=n=>'R$'+Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
    const total=crmClientes.length;
    const ativos=crmClientes.filter(c=>{const d=crmDiasDesde(c.dataUltimaCompra);return d!=null&&d<=30;}).length;
    const inativos15=crmClientes.filter(c=>{const d=crmDiasDesde(c.dataUltimaCompra);return d!=null&&d>=15;}).length;
    const vip=crmClientes.filter(c=>classificarCliente(c).label==='VIP').length;
    const faturado=crmClientes.reduce((a,c)=>a+(c.valorTotalGasto||0),0);
    const card=(n,l,cor)=>`<div class="fin-card"><div class="fin-card-n" style="color:${cor||'var(--orange)'}">${n}</div><div class="fin-card-l">${l}</div></div>`;
    el.innerHTML=
      card(total,'Total de clientes')+
      card(ativos,'Ativos (30d)','#27ae60')+
      card(inativos15,'Parados 15d+','#f39c12')+
      card(vip,'Clientes VIP','#9b59b6')+
      card(r(faturado),'Faturado (clientes)');
  }
  const at=document.getElementById('crm-over-atalhos');
  if(at){
    const btn=(t,txt)=>`<button class="btn-criar" style="background:var(--card);border:1px solid #3a3530;color:var(--cream)" onclick="showCrm('${t}')">${txt}</button>`;
    at.innerHTML=btn('clientes','🧑‍🤝‍🧑 Ver clientes')+btn('dashboard','📊 Dashboard')+btn('campanhas','📣 Campanhas')+btn('cupons','🎟️ Cupons');
  }
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
    if(p.status==='cancelado' || p.contabil===false) return false;   // cancelados e rodadas de mesa (só o fechamento conta)
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
      }).filter(p=>p.status!=='cancelado' && p.contabil!==false);   // exclui cancelados e rodadas de mesa
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
  if(autoAceitar) setTimeout(()=>moverStatus('local-'+p.id,proximaEtapaAtiva(p),true),600);
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
              if(autoAceitar)setTimeout(()=>moverStatus(p._id,proximaEtapaAtiva(p),true),600);
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
    if(firebase.auth().currentUser && typeof db!=='undefined'){
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
    if(firebase.auth().currentUser && typeof db!=='undefined'){
      iniciarListenerPedidos();
    }
  };
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') reconectar(); });
  window.addEventListener('online', reconectar);
}

function iniciarApp(){
  renderAll();
  atualizarBotaoSom();
  carregarAcessos(); iniciarPresencaAdmin();   // alimenta o indicador de acessos na Cozinha
  aplicarAcesso();                 // esconde abas conforme o perfil logado
  carregarGarcons();               // cacheia garçons (tcho_garcons) p/ login por PIN
  carregarUsuarios();              // cacheia usuários p/ login por senha
  db.collection('config').doc('marca').get().then(d=>{ if(d.exists){ localStorage.setItem('tcho_marca',JSON.stringify(d.data())); aplicarMarca(d.data()); if(document.getElementById('marca-nome-inp')) carregarMarca(); } }).catch(()=>{});
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
    if(cfg.msgTemplates){ localStorage.setItem('tcho_msg_templates',JSON.stringify(cfg.msgTemplates)); if(document.getElementById('msg-templates')&&document.getElementById('crm-mensagens').classList.contains('active')) renderMsgTemplates(); }
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
      if(doc.id==='novidade'                ){ novidadeCfg=d; localStorage.setItem('tcho_novidade', JSON.stringify(d)); }
      if(doc.id==='promo'                   ){ promoCfg=d;    localStorage.setItem('tcho_promo',    JSON.stringify(d)); }
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