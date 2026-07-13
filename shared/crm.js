// ═══════════════════════════════════════════════════════════════
// CRM / MARKETING — camada compartilhada (site do cliente + admin)
// ───────────────────────────────────────────────────────────────
// Mantém a coleção `clientes` no Firestore (1 documento por telefone,
// o próprio telefone é o ID — evita duplicados). É atualizada a cada
// pedido: no site do cliente (finalizarPedido) e no admin (pedido manual).
// Best-effort: se falhar, NÃO atrapalha o pedido.
// ═══════════════════════════════════════════════════════════════

// Só os dígitos do telefone.
function crmTelLimpo(tel){ return (tel||'').replace(/\D/g,''); }

// Cria/atualiza o cadastro do cliente a partir de um pedido.
function upsertCliente(pedido){
  try{
    if(typeof db==='undefined' || !pedido) return;
    const tel=crmTelLimpo(pedido.tel);
    if(tel.length<10) return;                       // sem telefone válido → não cadastra
    const ref=db.collection('clientes').doc(tel);
    const agora=firebase.firestore.FieldValue.serverTimestamp();
    const total=Number(pedido.total)||0;
    const primeiroItem=(pedido.itens&&pedido.itens[0])||'';
    return db.runTransaction(async t=>{
      const doc=await t.get(ref);
      if(doc.exists){
        const d=doc.data();
        const qtd=(d.quantidadePedidos||0)+1;
        const gasto=Math.round(((d.valorTotalGasto||0)+total)*100)/100;
        t.update(ref,{
          nome:pedido.nome||d.nome||'',
          telefone:pedido.tel||d.telefone||'',
          endereco:pedido.endereco||d.endereco||'',
          dataUltimaCompra:agora,
          quantidadePedidos:qtd,
          valorTotalGasto:gasto,
          ticketMedio:Math.round((gasto/qtd)*100)/100,
          ultimoProdutoComprado:primeiroItem,
          atualizadoEm:agora,
        });
      }else{
        t.set(ref,{
          nome:pedido.nome||'',
          telefone:pedido.tel||'',
          email:pedido.email||'',
          endereco:pedido.endereco||'',
          dataPrimeiraCompra:agora,
          dataUltimaCompra:agora,
          quantidadePedidos:1,
          valorTotalGasto:total,
          ticketMedio:total,
          ultimoProdutoComprado:primeiroItem,
          criadoEm:agora,
          atualizadoEm:agora,
        });
      }
    }).catch(e=>console.error('upsertCliente:',e));
  }catch(e){ console.error('upsertCliente:',e); }
}

// ── Helpers de leitura (usados nas telas do CRM no admin) ──────────

// Limites para classificação de cliente (ajustáveis).
const CRM_VIP_GASTO   = 300;  // R$ gastos a partir do qual vira VIP
const CRM_VIP_PEDIDOS = 10;   // ou nº de pedidos

// Classificação a partir do histórico do cliente.
function classificarCliente(c){
  const qtd=c.quantidadePedidos||0, gasto=c.valorTotalGasto||0;
  if(gasto>=CRM_VIP_GASTO || qtd>=CRM_VIP_PEDIDOS) return {label:'VIP',        cor:'#e8a825'};
  if(qtd>=2)                                        return {label:'Recorrente', cor:'#27ae60'};
  return                                                   {label:'Novo',       cor:'#3498db'};
}

// Dias desde uma data (aceita Timestamp do Firestore, Date ou string). null se inválida.
function crmDiasDesde(v){
  let d=null;
  if(v && typeof v.toDate==='function') d=v.toDate();
  else if(v){ const x=new Date(v); if(!isNaN(x)) d=x; }
  if(!d || isNaN(d)) return null;
  return Math.floor((Date.now()-d.getTime())/86400000);
}

// ── HORÁRIO DE FUNCIONAMENTO (usado no admin e no cliente) ──────
// Config: { dias:[0..6], p1:{abre:'HH:MM',fecha:'HH:MM'}, doisPeriodos:bool, p2:{abre,fecha} }
// 0=Dom, 1=Seg ... 6=Sáb. Padrão = comportamento antigo (Qui–Dom, 19h–23h).
function horarioPadrao(){
  return { dias:[0,4,5,6], p1:{abre:'19:00',fecha:'23:00'}, doisPeriodos:false, p2:{abre:'',fecha:''} };
}
function _dentroPeriodo(min, per){
  if(!per || !per.abre || !per.fecha) return false;
  const [ah,am]=String(per.abre).split(':').map(Number);
  const [fh,fm]=String(per.fecha).split(':').map(Number);
  if(isNaN(ah)||isNaN(fh)) return false;
  const ini=ah*60+(am||0), fim=fh*60+(fm||0);
  return min>=ini && min<fim;
}
// true se a loja está aberta AGORA conforme o agendamento.
function estaAbertaAgora(horarios){
  const h=(horarios && Array.isArray(horarios.dias)) ? horarios : horarioPadrao();
  const agora=new Date();
  if(!h.dias.includes(agora.getDay())) return false;
  const min=agora.getHours()*60+agora.getMinutes();
  if(_dentroPeriodo(min,h.p1)) return true;
  if(h.doisPeriodos && _dentroPeriodo(min,h.p2)) return true;
  return false;
}
