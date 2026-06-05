<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tcho Burguer — Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#0f0d0b;--surface:#1a1510;--card:#221e19;--orange:#f5820a;--orange2:#ff6b00;--gold:#e8a825;--cream:#f5f0e8;--muted:#7a6f65}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--cream);font-family:'Barlow',sans-serif;font-size:14px;min-height:100vh}

/* LOGIN */
.login-screen{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.login-box{background:var(--surface);border:1px solid #2a2520;border-radius:16px;padding:32px 24px;width:100%;max-width:360px;text-align:center}
.login-logo{font-size:3rem;margin-bottom:8px}
.login-title{font-family:'Bebas Neue',sans-serif;font-size:2rem;letter-spacing:3px;background:linear-gradient(135deg,var(--orange),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px}
.login-sub{font-size:.75rem;color:var(--muted);margin-bottom:24px;letter-spacing:1px;text-transform:uppercase}
.login-input{width:100%;background:var(--card);border:1px solid #3a3530;color:var(--cream);border-radius:8px;padding:12px 14px;font-family:'Barlow',sans-serif;font-size:.9rem;outline:none;transition:border-color .2s;margin-bottom:10px}
.login-input:focus{border-color:var(--orange)}
.login-btn{width:100%;padding:13px;background:linear-gradient(135deg,var(--orange),var(--orange2));color:#000;font-family:'Bebas Neue',sans-serif;font-size:1.15rem;letter-spacing:2px;border:none;border-radius:10px;cursor:pointer;margin-top:4px}
.login-btn:hover{opacity:.9}
.login-err{color:#e74c3c;font-size:.75rem;margin-top:8px;min-height:18px}

/* APP */
.app{display:none;flex-direction:column;min-height:100vh}
.app.show{display:flex}

/* TOPBAR */
.topbar{background:var(--surface);border-bottom:2px solid var(--orange);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.topbar-title{font-family:'Bebas Neue',sans-serif;font-size:1.2rem;letter-spacing:3px;background:linear-gradient(135deg,var(--orange),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.topbar-right{display:flex;align-items:center;gap:10px}
.loja-badge{font-size:.7rem;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;cursor:pointer}
.loja-badge.aberta{background:#081508;color:#27ae60;border:1px solid #0d2a15}
.loja-badge.fechada{background:#1a0808;color:#e74c3c;border:1px solid #3d1a1a}
.btn-logout{background:none;border:1px solid #3a3530;color:var(--muted);border-radius:6px;padding:5px 10px;font-size:.7rem;cursor:pointer;letter-spacing:.5px}
.btn-logout:hover{border-color:#e74c3c;color:#e74c3c}

/* NAV TABS */
.nav{display:flex;background:var(--surface);border-bottom:1px solid #2a2520;overflow-x:auto}
.nav-tab{flex:1;min-width:80px;padding:12px 8px;text-align:center;cursor:pointer;font-size:.72rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);border-bottom:3px solid transparent;transition:all .2s;white-space:nowrap}
.nav-tab.active{color:var(--orange);border-bottom-color:var(--orange);background:#221e19}
.nav-tab:hover:not(.active){color:var(--cream)}
.nav-badge{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:#e74c3c;color:#fff;border-radius:50%;font-size:.6rem;font-weight:900;margin-left:4px;vertical-align:middle}

/* PAGES */
.page{display:none;padding:14px;max-width:1100px;margin:0 auto;width:100%}
.page.active{display:block}

/* SECTION */
.section{background:var(--surface);border:1px solid #2a2520;border-radius:10px;padding:14px;margin-bottom:14px}
.sec-title{font-size:.8rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--orange);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:8px}

/* STATS */
.stats-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px}
.stat-card{background:var(--surface);border:1px solid #2a2520;border-radius:10px;padding:12px;text-align:center}
.stat-n{font-size:1.5rem;font-weight:700}
.stat-l{font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:2px}

/* KANBAN */
.kanban{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.col{display:flex;flex-direction:column;border-radius:10px;overflow:hidden;border:1px solid #2a2520;background:var(--surface);min-height:200px;transition:border-color .2s}
.col.drag-over{border-color:var(--orange);box-shadow:0 0 0 2px rgba(245,130,10,.3)}
.col-hdr{padding:9px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2a2520;flex-shrink:0}
.col-title{font-size:.68rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}
.col-cnt{font-size:.65rem;background:#2a2520;border-radius:20px;padding:2px 7px;color:var(--muted);font-weight:700}
.col-body{flex:1;padding:6px;overflow-y:auto}
.col-novo .col-title{color:#e74c3c}.col-novo .col-hdr{background:#1a0e0e;border-bottom-color:#3d1a1a}
.col-prep .col-title{color:#f39c12}.col-prep .col-hdr{background:#1a1508;border-bottom-color:#2a2010}
.col-pronto .col-title{color:#27ae60}.col-pronto .col-hdr{background:#081508;border-bottom-color:#0d2a15}
.col-entrega .col-title{color:#3498db}.col-entrega .col-hdr{background:#08101a;border-bottom-color:#0d2040}
/* CARDS */
.card{background:var(--card);border-radius:8px;padding:9px 10px;margin-bottom:6px;border:1px solid #2a2520;cursor:grab;transition:all .2s}
.card:hover{border-color:var(--orange);transform:translateY(-1px)}
.card:active{cursor:grabbing}
.card.dragging{opacity:.4;transform:scale(.97)}
.card-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.card-num{font-weight:700;font-size:.82rem;color:var(--orange)}
.card-tipo{font-size:.58rem;padding:2px 5px;border-radius:3px;font-weight:700}
.td{background:#1a0e0e;color:#e74c3c;border:1px solid #3d1a1a}
.tr{background:#081508;color:#27ae60;border:1px solid #0d2a15}
.card-cli{font-size:.7rem;color:var(--cream);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-itens{font-size:.63rem;color:var(--muted);margin-bottom:4px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-obs{font-size:.62rem;color:#f39c12;margin-bottom:3px}
.card-ftr{display:flex;justify-content:space-between;align-items:center;padding-top:5px;border-top:1px solid #2a2520}
.card-total{font-size:.8rem;font-weight:700}
.timer{font-size:.6rem;font-weight:700}
.tok{color:#27ae60}.twarn{color:#f39c12}.tlate{color:#e74c3c}
.card-btns{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}
.btn-k{border:none;border-radius:5px;padding:4px 8px;font-size:.62rem;font-weight:700;cursor:pointer;text-transform:uppercase;transition:all .15s;white-space:nowrap}
.btn-k:hover{opacity:.85}
.bk-aceitar{background:var(--orange);color:#000}
.bk-pronto{background:#27ae60;color:#fff}
.bk-entrega{background:#2980b9;color:#fff}
.bk-final{background:#1a5276;color:#fff}
.bk-cancel{background:#2a2520;color:var(--muted)}
.badge-print{font-size:.52rem;background:#0d2a15;color:#27ae60;padding:1px 4px;border-radius:3px;border:1px solid #1a4a25;margin-left:3px}
.drag-hint{font-size:.58rem;color:#3a3530;text-align:center;padding:4px 0 0;display:flex;align-items:center;justify-content:center;gap:3px}
.vazio-col{text-align:center;padding:18px 8px;color:#3a3530;font-size:.7rem}

/* TOGGLE */
.toggle-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2a2520}
.toggle-row:last-child{border-bottom:none}
.toggle-info{flex:1}
.toggle-label{font-size:.85rem;font-weight:600;margin-bottom:2px}
.toggle-desc{font-size:.7rem;color:var(--muted);line-height:1.4}
.toggle-wrap{position:relative;width:46px;height:24px;flex-shrink:0;margin-left:12px}
.toggle-wrap input{opacity:0;width:0;height:0;position:absolute}
.slider{position:absolute;inset:0;background:#2a2520;border-radius:24px;cursor:pointer;transition:.3s}
.slider:before{content:'';position:absolute;width:18px;height:18px;left:3px;top:3px;background:var(--muted);border-radius:50%;transition:.3s}
input:checked+.slider{background:var(--orange)}
input:checked+.slider:before{transform:translateX(22px);background:#000}

/* CARDÁPIO */
.prod-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #2a2520}
.prod-row:last-child{border-bottom:none}
.prod-emoji{font-size:1.3rem;width:28px;text-align:center;flex-shrink:0}
.prod-info{flex:1;min-width:0}
.prod-nome{font-size:.8rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prod-preco{font-size:.67rem;color:var(--orange)}
.prod-stock{display:flex;align-items:center;gap:6px;flex-shrink:0}
.stock-toggle{display:flex;border:1px solid #2a2520;border-radius:6px;overflow:hidden}
.stock-btn{padding:3px 7px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:.65rem;font-weight:700;transition:all .15s}
.stock-btn.active{background:var(--orange);color:#000}
.stock-input{width:44px;background:var(--card);border:1px solid #3a3530;border-radius:5px;color:var(--cream);font-size:.72rem;padding:3px 5px;text-align:center;outline:none}
.stock-input:focus{border-color:var(--orange)}
.sbadge{font-size:.65rem;padding:2px 7px;border-radius:4px;font-weight:700}
.sok{background:#0d2a15;color:#27ae60;border:1px solid #1a4a25}
.slow{background:#2a1a08;color:#f39c12;border:1px solid #4a3010}
.sout{background:#2a0e0e;color:#e74c3c;border:1px solid #4a1a1a}
.sinf{background:#0d1a2a;color:#3498db;border:1px solid #1a3050}

/* MARKETING — CUPONS */
.mkt-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.mkt-stat{background:var(--card);border:1px solid #2a2520;border-radius:8px;padding:10px;text-align:center}
.mkt-stat-n{font-size:1.3rem;font-weight:700;color:var(--orange)}
.mkt-stat-l{font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:2px}
.cupom-card{background:var(--card);border:1px solid #2a2520;border-radius:10px;padding:12px;margin-bottom:10px;transition:border-color .2s}
.cupom-card.ativo{border-color:#27ae60}
.cupom-codigo{font-family:'Courier New',monospace;font-size:1rem;font-weight:700;letter-spacing:3px;color:var(--orange);background:#1a1510;padding:4px 10px;border-radius:6px;border:1px dashed #3a3530}
.cupom-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:4px}
.badge{font-size:.62rem;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:.5px}
.badge-ativo{background:#081508;color:#27ae60;border:1px solid #0d2a15}
.badge-inativo{background:#1a1510;color:var(--muted);border:1px solid #2a2520}
.badge-tipo{background:#0d1a2a;color:#3498db;border:1px solid #1a3050}
.badge-exp{background:#1a0808;color:#e74c3c;border:1px solid #3d1a1a}
.cupom-info{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px}
.cupom-info-item{font-size:.68rem;color:var(--muted)}
.cupom-info-item strong{color:var(--cream)}
.cupom-acoes{display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid #2a2520;flex-wrap:wrap}
.btn-sm{border:none;border-radius:6px;padding:5px 10px;font-size:.68rem;font-weight:700;cursor:pointer;letter-spacing:.5px;text-transform:uppercase;transition:all .2s}
.btn-sm:hover{opacity:.85}
.bsm-toggle{background:#2a2520;color:var(--cream)}
.bsm-edit{background:#0d1a2a;color:#3498db;border:1px solid #1a3050}
.bsm-del{background:#1a0808;color:#e74c3c;border:1px solid #3d1a1a}
.bsm-copy{background:#1a2a0d;color:#27ae60;border:1px solid #0d2a15}

/* FORM */
.form-cupom{background:var(--surface);border:1px solid var(--orange);border-radius:10px;padding:14px;margin-bottom:14px;display:none}
.form-cupom.open{display:block}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.fgroup{margin-bottom:0}
.flabel{display:block;font-size:.72rem;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.finput,.fselect{width:100%;background:var(--card);border:1px solid #3a3530;color:var(--cream);border-radius:7px;padding:9px 11px;font-family:'Barlow',sans-serif;font-size:.85rem;outline:none;transition:border-color .2s}
.finput:focus,.fselect:focus{border-color:var(--orange)}
.fselect option{background:var(--card)}
.tipo-preview{background:var(--card);border:1px dashed #3a3530;border-radius:8px;padding:10px;margin:10px 0;font-size:.78rem;color:var(--muted);text-align:center;min-height:36px}
.tipo-preview strong{color:var(--orange);font-size:1rem}
.btn-gerar{background:#2a2520;border:1px solid #3a3530;border-radius:6px;padding:6px 10px;color:var(--cream);font-size:.72rem;cursor:pointer;margin-left:6px;font-weight:700;transition:all .2s}
.btn-gerar:hover{border-color:var(--orange);color:var(--orange)}
.form-acoes{display:flex;gap:8px;margin-top:4px}
.btn-criar{background:linear-gradient(135deg,var(--orange),var(--orange2));color:#000;border:none;border-radius:8px;padding:9px 16px;font-weight:700;font-size:.78rem;cursor:pointer;text-transform:uppercase;letter-spacing:1px}
.btn-salvar{flex:1;padding:10px;background:linear-gradient(135deg,var(--orange),var(--orange2));color:#000;font-weight:700;font-size:.82rem;letter-spacing:1px;border:none;border-radius:8px;cursor:pointer;text-transform:uppercase}
.btn-cancelar{padding:10px 14px;background:none;color:var(--muted);font-size:.8rem;font-weight:700;border:1px solid #3a3530;border-radius:8px;cursor:pointer}
.btn-cancelar:hover{border-color:var(--orange);color:var(--orange)}

/* PEDIDOS HISTÓRICO */
.hist-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #2a2520;font-size:.78rem;flex-wrap:wrap;gap:4px}
.hist-row:last-child{border-bottom:none}
.hist-num{font-weight:700;color:var(--orange);font-family:'Bebas Neue',sans-serif;font-size:1rem}
.hist-status{font-size:.6rem;padding:2px 6px;border-radius:4px;font-weight:700}
.hs-novo{background:#1a0808;color:#e74c3c;border:1px solid #3d1a1a}
.hs-prep{background:#1a1508;color:#f39c12;border:1px solid #2a2010}
.hs-pronto{background:#081508;color:#27ae60;border:1px solid #0d2a15}
.hs-entrega{background:#08101a;color:#3498db;border:1px solid #0d2040}
.hs-finalizado{background:#1a1510;color:var(--muted);border:1px solid #2a2520}
.empty{text-align:center;padding:28px;color:var(--muted);font-size:.8rem}
.empty-icon{font-size:2.5rem;margin-bottom:8px}

/* TOAST */
.toast{position:fixed;bottom:16px;right:16px;border-radius:10px;padding:10px 18px;font-weight:700;font-size:.8rem;display:none;z-index:9999;animation:slideUp .3s ease}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
.toast.show{display:block}
.tok-ok{background:#27ae60;color:#fff}
.tok-info{background:var(--orange);color:#000}
.tok-err{background:#e74c3c;color:#fff}

/* INNER TABS */
.inner-tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.inner-tab{padding:7px 14px;border-radius:20px;border:1px solid #2a2520;cursor:pointer;font-size:.72rem;font-weight:700;color:var(--muted);transition:all .2s}
.inner-tab.active{background:var(--orange);color:#000;border-color:var(--orange)}
.inner-tab:hover:not(.active){border-color:var(--orange);color:var(--orange)}
.inner-page{display:none}
.inner-page.active{display:block}

/* AUTO BANNER */
.auto-banner{background:#1a1508;border-bottom:1px solid #4a3010;padding:6px 16px;font-size:.7rem;color:#f39c12;display:none;align-items:center;gap:6px}
.auto-banner.show{display:flex}

/* FIDELIDADE STATUS */
.fid-status{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-size:.75rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:10px;width:100%;justify-content:center}
.fid-off{background:#1a0808;border:1px solid #3d1a1a;color:#e74c3c}
.fid-on{background:#081508;border:1px solid #0d2a15;color:#27ae60}
</style>
</head>
<body>

<!-- LOGIN -->
<div class="login-screen" id="login-screen">
  <div class="login-box">
    <div class="login-logo">🍔</div>
    <div class="login-title">TCHO BURGUER</div>
    <div class="login-sub">Painel Administrativo</div>
    <input class="login-input" type="text" id="login-user" placeholder="Usuário" autocomplete="username">
    <input class="login-input" type="password" id="login-pass" placeholder="Senha" autocomplete="current-password" onkeydown="if(event.key==='Enter')fazerLogin()">
    <button class="login-btn" onclick="fazerLogin()">ENTRAR</button>
    <div class="login-err" id="login-err"></div>
    <div style="margin-top:16px;font-size:.68rem;color:var(--muted)">Demo: admin / tcho2025</div>
  </div>
</div>

<!-- APP -->
<div class="app" id="app">
  <div class="topbar">
    <div class="topbar-title">🍔 TCHO BURGUER — ADMIN</div>
    <div class="topbar-right">
      <div class="loja-badge aberta" id="loja-badge" onclick="toggleLoja()">🟢 ABERTA</div>
      <button class="btn-logout" onclick="logout()">SAIR</button>
    </div>
  </div>

  <div class="auto-banner" id="auto-banner">⚡ <strong>Aceite automático ativado</strong> — pedidos aceitos e impressos automaticamente</div>

  <div class="nav">
    <div class="nav-tab active" onclick="showPage('cozinha')">🍳 Cozinha <span class="nav-badge" id="badge-novos" style="display:none">0</span></div>
    <div class="nav-tab" onclick="showPage('pedidos')">📋 Pedidos</div>
    <div class="nav-tab" onclick="showPage('config')">⚙️ Config</div>
    <div class="nav-tab" onclick="showPage('cardapio')">🍔 Cardápio</div>
    <div class="nav-tab" onclick="showPage('marketing')">📣 Marketing</div>
  </div>

  <!-- ══ COZINHA ══ -->
  <div class="page active" id="page-cozinha">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding-top:4px">
      <div class="stats-grid" style="flex:1;min-width:0">
        <div class="stat-card"><div class="stat-n" id="sn" style="color:#e74c3c">0</div><div class="stat-l">Novos</div></div>
        <div class="stat-card"><div class="stat-n" id="sp" style="color:#f39c12">0</div><div class="stat-l">Preparo</div></div>
        <div class="stat-card"><div class="stat-n" id="sk" style="color:#27ae60">0</div><div class="stat-l">Prontos</div></div>
        <div class="stat-card"><div class="stat-n" id="se" style="color:#3498db">0</div><div class="stat-l">Entrega</div></div>
        <div class="stat-card"><div class="stat-n" id="st" style="color:var(--orange)">0</div><div class="stat-l">Hoje</div></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;font-weight:700">Aceite automático</div>
          <button class="btn-auto" id="btn-auto" onclick="toggleAutoAceitar()" style="display:flex;align-items:center;gap:7px;background:#1a1510;border:1.5px solid #3a3530;color:var(--muted);border-radius:8px;padding:6px 12px;font-weight:700;font-size:.72rem;cursor:pointer;transition:all .2s">
            <div style="width:32px;height:16px;background:#2a2520;border-radius:16px;position:relative;transition:background .3s" id="mini-tog"><div style="position:absolute;width:12px;height:12px;background:var(--muted);border-radius:50%;top:2px;left:2px;transition:all .3s" id="mini-ball"></div></div>
            <span id="auto-txt">Desativado</span>
          </button>
        </div>
        <button onclick="simularPedido()" style="background:linear-gradient(135deg,var(--orange),var(--orange2));color:#000;border:none;border-radius:7px;padding:8px 14px;font-weight:700;font-size:.75rem;cursor:pointer;text-transform:uppercase;letter-spacing:1px">+ Simular</button>
      </div>
    </div>
    <div class="kanban">
      <div class="col col-novo" id="col-novo" ondragover="onDragOver(event,'novo')" ondragleave="onDragLeave(event,'novo')" ondrop="onDrop(event,'novo')">
        <div class="col-hdr"><div class="col-title">🔴 Novos</div><div class="col-cnt" id="cnt-novo">0</div></div>
        <div class="col-body" id="body-novo"><div class="vazio-col">Aguardando pedidos...</div></div>
      </div>
      <div class="col col-prep" id="col-prep" ondragover="onDragOver(event,'prep')" ondragleave="onDragLeave(event,'prep')" ondrop="onDrop(event,'prep')">
        <div class="col-hdr"><div class="col-title">🟡 Em preparo</div><div class="col-cnt" id="cnt-prep">0</div></div>
        <div class="col-body" id="body-prep"><div class="vazio-col">Nada em preparo</div></div>
      </div>
      <div class="col col-pronto" id="col-pronto" ondragover="onDragOver(event,'pronto')" ondragleave="onDragLeave(event,'pronto')" ondrop="onDrop(event,'pronto')">
        <div class="col-hdr"><div class="col-title">🟢 Prontos</div><div class="col-cnt" id="cnt-pronto">0</div></div>
        <div class="col-body" id="body-pronto"><div class="vazio-col">Nenhum pronto</div></div>
      </div>
      <div class="col col-entrega" id="col-entrega" ondragover="onDragOver(event,'entrega')" ondragleave="onDragLeave(event,'entrega')" ondrop="onDrop(event,'entrega')">
        <div class="col-hdr"><div class="col-title">🔵 Entrega</div><div class="col-cnt" id="cnt-entrega">0</div></div>
        <div class="col-body" id="body-entrega"><div class="vazio-col">Nenhuma entrega</div></div>
      </div>
    </div>
  </div>

  <!-- ══ PEDIDOS ══ -->
  <div class="page" id="page-pedidos">
    <div class="section">
      <div class="sec-title">📋 Histórico de pedidos <span style="font-size:.7rem;color:var(--muted);font-weight:400;letter-spacing:0">atualizados em tempo real</span></div>
      <div id="hist-lista"><div class="empty"><div class="empty-icon">📋</div><div>Nenhum pedido ainda</div></div></div>
    </div>
  </div>

  <!-- ══ CONFIG ══ -->
  <div class="page" id="page-config">
    <div class="section">
      <div class="sec-title">🛵 Operação</div>
      <div class="toggle-row">
        <div class="toggle-info"><div class="toggle-label">Loja aberta</div><div class="toggle-desc">Quando desligado, site exibe mensagem de fechado</div></div>
        <label class="toggle-wrap"><input type="checkbox" id="cfg-loja" checked onchange="salvarConfig()"><span class="slider"></span></label>
      </div>
      <div class="toggle-row">
        <div class="toggle-info"><div class="toggle-label">Delivery disponível</div><div class="toggle-desc">Desative se estiver sem motoboy</div></div>
        <label class="toggle-wrap"><input type="checkbox" id="cfg-delivery" checked onchange="salvarConfig()"><span class="slider"></span></label>
      </div>
      <div class="toggle-row">
        <div class="toggle-info"><div class="toggle-label">Retirada no local</div><div class="toggle-desc">Permite clientes retirarem na loja</div></div>
        <label class="toggle-wrap"><input type="checkbox" id="cfg-retirada" checked onchange="salvarConfig()"><span class="slider"></span></label>
      </div>
    </div>
    <div class="section">
      <div class="sec-title">🤖 Automação</div>
      <div class="toggle-row">
        <div class="toggle-info"><div class="toggle-label">Aceite automático</div><div class="toggle-desc">Pedidos aceitos automaticamente ao chegar</div></div>
        <label class="toggle-wrap"><input type="checkbox" id="cfg-auto" onchange="syncAutoConfig()"><span class="slider"></span></label>
      </div>
      <div class="toggle-row">
        <div class="toggle-info"><div class="toggle-label">Impressão automática</div><div class="toggle-desc">Imprime cupom ao aceitar cada pedido</div></div>
        <label class="toggle-wrap"><input type="checkbox" id="cfg-print" checked onchange="salvarConfig()"><span class="slider"></span></label>
      </div>
    </div>
  </div>

  <!-- ══ CARDÁPIO ══ -->
  <div class="page" id="page-cardapio">
    <div class="section">
      <div class="sec-title">🍔 Hamburguers</div>
      <div id="lista-burguers"></div>
    </div>
    <div class="section">
      <div class="sec-title">🍟 Extras & Bebidas</div>
      <div id="lista-extras"></div>
    </div>
    <div class="section">
      <div class="sec-title">🍟🥤 Combo</div>
      <div id="lista-combo"></div>
    </div>
  </div>

  <!-- ══ MARKETING ══ -->
  <div class="page" id="page-marketing">
    <div class="inner-tabs">
      <div class="inner-tab active" onclick="showInner('cupons')">🎟️ Cupons</div>
      <div class="inner-tab" onclick="showInner('fidelidade')">🎁 Fidelidade</div>
    </div>

    <!-- CUPONS -->
    <div class="inner-page active" id="inner-cupons">
      <div class="mkt-stats">
        <div class="mkt-stat"><div class="mkt-stat-n" id="mkt-ativos">0</div><div class="mkt-stat-l">Ativos</div></div>
        <div class="mkt-stat"><div class="mkt-stat-n" id="mkt-usos">0</div><div class="mkt-stat-l">Usos totais</div></div>
        <div class="mkt-stat"><div class="mkt-stat-n" id="mkt-econ">R$0</div><div class="mkt-stat-l">Desconto dado</div></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:.78rem;color:var(--muted)">Gerencie seus cupons</div>
        <button class="btn-criar" onclick="abrirFormCupom()">+ Criar cupom</button>
      </div>
      <div class="form-cupom" id="form-cupom">
        <div style="font-size:.8rem;font-weight:700;color:var(--orange);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px" id="form-titulo">Novo cupom</div>
        <div class="form-grid">
          <div class="fgroup">
            <div class="flabel">Código</div>
            <div style="display:flex"><input class="finput" id="c-codigo" type="text" placeholder="Ex: TCHO10" style="border-radius:7px 0 0 7px;text-transform:uppercase" oninput="this.value=this.value.toUpperCase()"><button class="btn-gerar" style="border-radius:0 7px 7px 0;margin:0;padding:9px 10px" onclick="gerarCodigo()">🎲</button></div>
          </div>
          <div class="fgroup"><div class="flabel">Tipo de desconto</div><select class="fselect" id="c-tipo" onchange="atualizarPreview()"><option value="pct">Porcentagem (%)</option><option value="fixo">Valor fixo (R$)</option><option value="frete">Frete grátis</option><option value="item">Item grátis</option></select></div>
        </div>
        <div class="form-grid" id="c-valor-row">
          <div class="fgroup"><div class="flabel">Valor do desconto</div><input class="finput" id="c-valor" type="number" placeholder="Ex: 10" min="0" oninput="atualizarPreview()"></div>
          <div class="fgroup"><div class="flabel">Pedido mínimo (R$)</div><input class="finput" id="c-minimo" type="number" placeholder="0 = sem mínimo" min="0"></div>
        </div>
        <div id="c-item-row" style="display:none;margin-bottom:10px"><div class="fgroup"><div class="flabel">Item grátis</div><select class="fselect" id="c-item"><option value="X-Burguer">🍔 X-Burguer (R$23)</option><option value="X-Salada">🥗 X-Salada (R$25)</option><option value="X-Bacon">🥓 X-Bacon (R$30)</option><option value="Porção de Batata">🍟 Porção de Batata (R$13)</option><option value="Refrigerante Lata">🥤 Refrigerante Lata (R$6)</option></select></div></div>
        <div class="tipo-preview" id="c-preview">Selecione o tipo e valor para ver o preview</div>
        <div class="form-grid">
          <div class="fgroup"><div class="flabel">Usos máximos</div><input class="finput" id="c-usos" type="number" placeholder="0 = ilimitado" min="0"></div>
          <div class="fgroup"><div class="flabel">Validade</div><input class="finput" id="c-validade" type="date"></div>
        </div>
        <div class="fgroup" style="margin-bottom:10px"><div class="flabel">Descrição (aparece pro cliente)</div><input class="finput" id="c-desc" type="text" placeholder="Ex: 10% de desconto no seu pedido!"></div>
        <div class="form-acoes">
          <button class="btn-salvar" onclick="salvarCupom()">✓ SALVAR CUPOM</button>
          <button class="btn-cancelar" onclick="fecharFormCupom()">Cancelar</button>
        </div>
      </div>
      <div id="lista-cupons"></div>
    </div>

    <!-- FIDELIDADE -->
    <div class="inner-page" id="inner-fidelidade">
      <div class="section">
        <div class="sec-title">🎁 Programa de Fidelidade</div>
        <div class="toggle-row">
          <div class="toggle-info"><div class="toggle-label">Ativar programa de fidelidade</div><div class="toggle-desc">Quando ativo, clientes acumulam carimbos e ganham burguer grátis. <strong style="color:#f39c12">Desligado por padrão.</strong></div></div>
          <label class="toggle-wrap"><input type="checkbox" id="flag-fid" onchange="onFlagFidelidade()"><span class="slider"></span></label>
        </div>
        <div id="fid-status" class="fid-status fid-off"><span>🔒</span><span>Programa desativado — não visível para clientes</span></div>
        <div id="fid-config" style="display:none;margin-top:12px">
          <div class="toggle-row" style="padding-top:0"><div class="toggle-info"><div class="toggle-label" style="font-size:.78rem">Notificar ao completar</div><div class="toggle-desc">Aviso ao cliente ao atingir 10 carimbos</div></div><label class="toggle-wrap"><input type="checkbox" id="fid-notif" checked><span class="slider"></span></label></div>
          <div class="toggle-row"><div class="toggle-info"><div class="toggle-label" style="font-size:.78rem">Exigir telefone obrigatório</div><div class="toggle-desc">Vincula pedido ao programa pelo telefone</div></div><label class="toggle-wrap"><input type="checkbox" id="fid-tel" checked><span class="slider"></span></label></div>
        </div>
      </div>
      <div style="background:var(--card);border:1px solid #2a2520;border-radius:10px;padding:12px;font-size:.75rem;color:var(--muted);line-height:1.6">
        📋 <strong style="color:var(--cream)">Regras atuais:</strong><br>
        • 10 pedidos = 1 burguer grátis<br>
        • Burguers: X-Burguer, X-Salada ou X-Bacon<br>
        • Identificação pelo número de celular
      </div>
    </div>
  </div>
</div>

<!-- TOAST -->
<div class="toast" id="toast"></div>

<script>
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

// ── NAVIGATION ──────────────────────────────────────────────────
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

// ── LOJA ABERTA/FECHADA ──────────────────────────────────────────
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
  // comunica com o site do cliente via localStorage
  localStorage.setItem('tcho_loja_aberta', aberta);
}

// ── CONFIGS ──────────────────────────────────────────────────────
function salvarConfig(){
  atualizarBadgeLoja();
  const cfg={
    lojaAberta:document.getElementById('cfg-loja').checked,
    deliveryAtivo:document.getElementById('cfg-delivery').checked,
    retiradaAtiva:document.getElementById('cfg-retirada').checked,
    autoAceitar:autoAceitar,
    autoImprimir:document.getElementById('cfg-print').checked,
  };
  localStorage.setItem('tcho_config',JSON.stringify(cfg));
  showToast('✅ Configuração salva!','tok-ok');
}
function syncAutoConfig(){
  autoAceitar=document.getElementById('cfg-auto').checked;
  atualizarBotaoAuto();
  salvarConfig();
}

// ── KANBAN & PEDIDOS ──────────────────────────────────────────────
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

const NOMES=['João','Maria','Pedro','Ana','Carlos','Lucas','Fernanda','Rafael','Beatriz','Guilherme'];
const BAIRROS=['Copacabana','Floramar','Heliópolis','Jardim Europa','Lagoa','Planalto','Tupi','Venda Nova'];
const MOCK=[['X-Burguer (🥩 Ao ponto • 🍅 Ketchup)'],['X-Bacon (🔥 Bem passado • 🤍 Maionese)','Refrigerante Lata'],['X-Picles (🩸 Mal passado)','Porção de Batata'],['X-Tropical (🥩 Ao ponto)'],['X-Bacon Duplo (🔥 Bem passado)','Suco Lata'],['X-Romeu & Julieta (🥩 Ao ponto • + Queijo)']];

function simularPedido(){
  const num=++contPed,tipo=Math.random()>.35?'delivery':'retirada';
  const itens=MOCK[Math.floor(Math.random()*MOCK.length)];
  const nome=NOMES[Math.floor(Math.random()*NOMES.length)];
  const bairro=tipo==='delivery'?BAIRROS[Math.floor(Math.random()*BAIRROS.length)]:'';
  const pag=['PIX','Dinheiro','Cartão'][Math.floor(Math.random()*3)];
  const total=Math.floor(Math.random()*70)+25,frete=tipo==='delivery'?[4,5,6,7,8][Math.floor(Math.random()*5)]:0;
  const obs=Math.random()>.72?'Sem cebola':'';
  const p={id:num,tipo,nome,bairro,pag,total,frete,obs,itens,status:'novo',hora:new Date(),horaStr:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),impresso:false};
  pedidos.push(p);totalHoje++;
  showToast(`🔔 Novo pedido #${num} — ${nome}`,'tok-info');
  atualizarBadgeNovos();
  if(autoAceitar)setTimeout(()=>moverStatus(p.id,'prep',true),600);
  else renderAll();
}

function imprimirPedido(p){
  if(!document.getElementById('cfg-print').checked)return;
  // Tenta imprimir via servidor local (impressora térmica)
  fetch('http://localhost:3333/imprimir',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(p)
  }).then(r=>r.json()).then(d=>{
    if(d.ok)showToast(`🖨️ Pedido #${p.id} impresso!`,'tok-ok');
    else showToast(`⚠️ Erro ao imprimir: ${d.erro}`,'tok-err');
  }).catch(()=>{
    // Servidor não disponível — abre janela de impressão
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
    ${p.bairro?`<div class="row"><span>Bairro:</span><span>${p.bairro}</span></div>`:''}
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

function moverStatus(id,novoStatus,auto=false){
  const p=pedidos.find(x=>x.id===id);if(!p)return;
  if(novoStatus==='finalizado'){p.status='finalizado';p.horaFim=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
  else{p.status=novoStatus;p.hora=new Date();p.horaStr=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
  if(novoStatus==='prep')setTimeout(()=>imprimirPedido(p),200);
  atualizarBadgeNovos();
  renderAll();
  renderHistorico();
}
function cancelar(id){if(!confirm(`Cancelar pedido #${id}?`))return;pedidos=pedidos.filter(x=>x.id!==id);totalHoje=Math.max(0,totalHoje-1);renderAll();renderHistorico();}

// DRAG & DROP
function onDragStart(event,id,status){dragId=id;dragSrc=status;event.dataTransfer.effectAllowed='move';setTimeout(()=>{const el=document.getElementById(`card-${id}`);if(el)el.classList.add('dragging');},0);}
function onDragEnd(){document.querySelectorAll('.card').forEach(el=>el.classList.remove('dragging'));document.querySelectorAll('.col').forEach(el=>el.classList.remove('drag-over'));dragId=null;dragSrc=null;}
function onDragOver(event,status){event.preventDefault();if(!dragId||!canDrop(dragSrc,status)){event.dataTransfer.dropEffect='none';return;}event.dataTransfer.dropEffect='move';document.getElementById('col-'+status).classList.add('drag-over');}
function onDragLeave(event,status){const col=document.getElementById('col-'+status);if(!col.contains(event.relatedTarget))col.classList.remove('drag-over');}
function onDrop(event,toStatus){event.preventDefault();document.getElementById('col-'+toStatus).classList.remove('drag-over');if(!dragId||!canDrop(dragSrc,toStatus))return;moverStatus(dragId,toStatus);}

// RENDER CARDS
function getMin(h){return Math.floor((new Date()-h)/60000);}
function tc(m,s){if(s==='novo')return m<3?'tok':m<6?'twarn':'tlate';if(s==='prep')return m<15?'tok':m<25?'twarn':'tlate';if(s==='entrega')return m<30?'tok':m<50?'twarn':'tlate';return'tok';}
function tt(m){if(m<1)return'agora';if(m>=60)return Math.floor(m/60)+'h'+(m%60?String(m%60).padStart(2,'0')+'min':'');return m+'min';}

function renderCard(p){
  const m=getMin(p.hora),cls=tc(m,p.status);
  const tipoEl=p.tipo==='delivery'?`<span class="card-tipo td">🛵 DEL</span>`:`<span class="card-tipo tr">🏃 RET</span>`;
  const pb=p.impresso?`<span class="badge-print">🖨</span>`:'';
  let btns='';
  if(p.status==='novo'){btns=autoAceitar?`<span style="font-size:.6rem;color:#f39c12">⚡ aceite automático</span>`:`<button class="btn-k bk-aceitar" onclick="moverStatus(${p.id},'prep')">✓ ACEITAR + 🖨️</button><button class="btn-k bk-cancel" onclick="cancelar(${p.id})">×</button>`;}
  else if(p.status==='prep'){btns=`<button class="btn-k bk-pronto" onclick="moverStatus(${p.id},'pronto')">PRONTO ✓</button>`;}
  else if(p.status==='pronto'){btns=p.tipo==='delivery'?`<button class="btn-k bk-entrega" onclick="moverStatus(${p.id},'entrega')">SAIU 🛵</button>`:`<button class="btn-k bk-final" onclick="moverStatus(${p.id},'finalizado')">RETIRADO ✓</button>`;}
  else if(p.status==='entrega'){btns=`<button class="btn-k bk-final" onclick="moverStatus(${p.id},'finalizado')">ENTREGUE ✓</button>`;}
  const nextLabel={novo:'Em preparo →',prep:'Pronto →',pronto:p.tipo==='delivery'?'Entrega →':'',entrega:''}[p.status];
  const dragHint=nextLabel?`<div class="drag-hint">↔ Arraste para ${nextLabel}</div>`:'';
  return`<div class="card" id="card-${p.id}" draggable="true" ondragstart="onDragStart(event,${p.id},'${p.status}')" ondragend="onDragEnd()">
    <div class="card-hdr"><span class="card-num">#${p.id}${pb}</span>${tipoEl}</div>
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

// HISTÓRICO
function renderHistorico(){
  const todos=[...pedidos].sort((a,b)=>b.id-a.id);
  if(!todos.length){document.getElementById('hist-lista').innerHTML=`<div class="empty"><div class="empty-icon">📋</div><div>Nenhum pedido ainda</div></div>`;return;}
  const statusLabel={novo:'Novo',prep:'Em preparo',pronto:'Pronto',entrega:'Em entrega',finalizado:'Finalizado'};
  const statusClass={novo:'hs-novo',prep:'hs-prep',pronto:'hs-pronto',entrega:'hs-entrega',finalizado:'hs-finalizado'};
  document.getElementById('hist-lista').innerHTML=todos.map(p=>`
    <div class="hist-row">
      <div><div class="hist-num">#${p.id}</div><div style="font-size:.7rem;color:var(--muted)">${p.nome}${p.bairro?' · '+p.bairro:''}</div></div>
      <div style="font-size:.72rem;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.itens[0]}${p.itens.length>1?' +'+( p.itens.length-1)+' item(s)':''}</div>
      <div style="text-align:right"><div class="hist-status ${statusClass[p.status]||'hs-finalizado'}">${statusLabel[p.status]||p.status}</div><div style="font-size:.68rem;color:var(--muted);margin-top:3px">R$${p.total+(p.frete||0)} · ${p.horaStr}</div></div>
    </div>`).join('');
}

// ── CARDÁPIO ────────────────────────────────────────────────────
const PRODS=[
  {id:'xb',e:'🍔',n:'X-Burguer',p:23,cat:'b'},{id:'xs',e:'🥗',n:'X-Salada',p:25,cat:'b'},
  {id:'xba',e:'🥓',n:'X-Bacon',p:30,cat:'b'},{id:'xp',e:'🥒',n:'X-Picles Burguer',p:33,cat:'b'},
  {id:'xt',e:'🍍',n:'X-Tropical',p:37,cat:'b'},{id:'xbd',e:'🍔',n:'X-Bacon Duplo',p:40,cat:'b'},
  {id:'xrj',e:'🧀',n:'X-Romeu & Julieta',p:45,cat:'b'},{id:'xrjd',e:'🧀',n:'X-Romeu & Julieta Duplo',p:55,cat:'b'},
  {id:'xbt',e:'🥓',n:'X-Bacon Triplo',p:60,cat:'b'},
  {id:'bat',e:'🍟',n:'Porção de Batata',p:13,cat:'e'},{id:'r15',e:'🥤',n:'Refrigerante 1,5L',p:14,cat:'e'},
  {id:'rla',e:'🥤',n:'Refrigerante Lata',p:6,cat:'e'},{id:'suc',e:'🧃',n:'Suco Lata',p:7,cat:'e'},
  {id:'agu',e:'💧',n:'Água com Gás',p:5,cat:'e'},{id:'cmb',e:'🍟',n:'Combo (+R$15)',p:15,cat:'c'},
];
const est={};PRODS.forEach(p=>{est[p.id]={ativo:true,modo:'inf',qtd:10};});
function renderEstoqueBadge(id){const e=est[id];if(!e.ativo)return`<span class="sbadge sout">INATIVO</span>`;if(e.modo==='inf')return`<span class="sbadge sinf">∞</span>`;if(e.qtd<=0)return`<span class="sbadge sout">Esgotado</span>`;if(e.qtd<=3)return`<span class="sbadge slow">${e.qtd} restam</span>`;return`<span class="sbadge sok">${e.qtd} un.</span>`;}
function renderLista(cat,containerId){document.getElementById(containerId).innerHTML=PRODS.filter(p=>p.cat===cat).map(p=>{const ev=est[p.id];return`<div class="prod-row" id="prow-${p.id}"><div class="prod-emoji">${p.e}</div><div class="prod-info"><div class="prod-nome">${p.n}</div><div class="prod-preco">R$${p.p}</div></div><label class="toggle-wrap" style="margin-right:8px"><input type="checkbox" ${ev.ativo?'checked':''} onchange="toggleAtivo('${p.id}',this.checked)"><span class="slider"></span></label><div class="prod-stock" id="stock-${p.id}" style="${!ev.ativo?'opacity:.35;pointer-events:none':''}"><div class="stock-toggle"><button class="stock-btn ${ev.modo==='inf'?'active':''}" onclick="setModo('${p.id}','inf')">∞</button><button class="stock-btn ${ev.modo==='qtd'?'active':''}" onclick="setModo('${p.id}','qtd')">Qtd</button></div><div id="inp-${p.id}" style="display:${ev.modo==='qtd'?'block':'none'}"><input class="stock-input" type="number" min="0" max="999" value="${ev.qtd}" onchange="setQtd('${p.id}',this.value)" onclick="event.stopPropagation()"></div>${renderEstoqueBadge(p.id)}</div></div>`;}).join('');}
function renderCardapio(){renderLista('b','lista-burguers');renderLista('e','lista-extras');renderLista('c','lista-combo');}
function toggleAtivo(id,val){est[id].ativo=val;renderCardapio();showToast(`${val?'✅':'🔒'} ${PRODS.find(p=>p.id===id)?.n} ${val?'ativo':'inativo'}`,'tok-ok');}
function setModo(id,modo){est[id].modo=modo;document.getElementById(`inp-${id}`).style.display=modo==='qtd'?'block':'none';document.querySelectorAll(`#stock-${id} .stock-btn`).forEach(b=>b.classList.toggle('active',b.textContent.trim()===(modo==='inf'?'∞':'Qtd')));const row=document.getElementById(`prow-${id}`);if(row){row.querySelectorAll('.sbadge').forEach(b=>b.remove());document.getElementById(`stock-${id}`).insertAdjacentHTML('beforeend',renderEstoqueBadge(id));}}
function setQtd(id,val){est[id].qtd=Math.max(0,parseInt(val)||0);const row=document.getElementById(`prow-${id}`);if(row){row.querySelectorAll('.sbadge').forEach(b=>b.remove());document.getElementById(`stock-${id}`).insertAdjacentHTML('beforeend',renderEstoqueBadge(id));}}

// ── MARKETING — CUPONS ──────────────────────────────────────────
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
  if(id){const c=cupons.find(x=>x.id===id);if(!c)return;document.getElementById('c-codigo').value=c.codigo;document.getElementById('c-tipo').value=c.tipo;document.getElementById('c-valor').value=c.valor||'';document.getElementById('c-minimo').value=c.minimo||'';document.getElementById('c-usos').value=c.usosMax||'';document.getElementById('c-validade').value=c.validade||'';document.getElementById('c-desc').value=c.descricao||'';if(c.tipo==='item')document.getElementById('c-item').value=c.item||'';}
  else{document.getElementById('c-codigo').value='';document.getElementById('c-tipo').value='pct';document.getElementById('c-valor').value='';document.getElementById('c-minimo').value='';document.getElementById('c-usos').value='';document.getElementById('c-validade').value='';document.getElementById('c-desc').value='';gerarCodigo();}
  atualizarPreview();document.getElementById('form-cupom').classList.add('open');document.getElementById('form-cupom').scrollIntoView({behavior:'smooth'});
}
function fecharFormCupom(){document.getElementById('form-cupom').classList.remove('open');editandoId=null;}
function salvarCupom(){
  const codigo=document.getElementById('c-codigo').value.trim().toUpperCase();
  if(!codigo){showToast('⚠️ Digite o código do cupom','tok-err');return;}
  const tipo=document.getElementById('c-tipo').value,valor=parseFloat(document.getElementById('c-valor').value)||0;
  if(tipo!=='frete'&&tipo!=='item'&&!valor){showToast('⚠️ Informe o valor do desconto','tok-err');return;}
  const existe=cupons.find(c=>c.codigo===codigo&&c.id!==editandoId);
  if(existe){showToast('⚠️ Esse código já existe!','tok-err');return;}
  const cupom={id:editandoId||Date.now(),codigo,tipo,valor,minimo:parseFloat(document.getElementById('c-minimo').value)||0,usosMax:parseInt(document.getElementById('c-usos').value)||0,usosFeitos:editandoId?(cupons.find(c=>c.id===editandoId)?.usosFeitos||0):0,validade:document.getElementById('c-validade').value||null,descricao:document.getElementById('c-desc').value||'',item:document.getElementById('c-item').value,ativo:true,criadoEm:editandoId?(cupons.find(c=>c.id===editandoId)?.criadoEm||new Date().toLocaleDateString('pt-BR')):new Date().toLocaleDateString('pt-BR')};
  if(editandoId){const idx=cupons.findIndex(c=>c.id===editandoId);cupons[idx]=cupom;showToast('✅ Cupom atualizado!','tok-ok');}
  else{cupons.push(cupom);showToast('🎟️ Cupom criado!','tok-ok');}
  fecharFormCupom();renderCupons();
}
function toggleCupom(id){const c=cupons.find(x=>x.id===id);if(!c)return;c.ativo=!c.ativo;showToast(c.ativo?'✅ Cupom ativado!':'🔒 Cupom desativado',c.ativo?'tok-ok':'tok-info');renderCupons();}
function deletarCupom(id){const c=cupons.find(x=>x.id===id);if(!c||!confirm(`Excluir cupom "${c.codigo}"?`))return;cupons=cupons.filter(x=>x.id!==id);showToast('🗑️ Cupom excluído','tok-info');renderCupons();}
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
        <button class="btn-sm bsm-toggle" onclick="toggleCupom(${c.id})">${c.ativo?'🔒 Desativar':'✅ Ativar'}</button>
        <button class="btn-sm bsm-edit" onclick="abrirFormCupom(${c.id})">✏️ Editar</button>
        <button class="btn-sm bsm-del" onclick="deletarCupom(${c.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

// ── FIDELIDADE ──────────────────────────────────────────────────
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

// ── POLLING — lê pedidos do site do cliente ──────────────────────
function lerPedidosCliente(){
  const salvos=JSON.parse(localStorage.getItem('tcho_pedidos')||'[]');
  salvos.forEach(p=>{
    if(!pedidos.find(x=>x.id===p.id)){
      pedidos.push({...p,hora:new Date(p.hora),status:p.status||'novo',impresso:false});
      totalHoje++;
      showToast(`🔔 Novo pedido #${p.id} — ${p.nome}`,'tok-info');
      atualizarBadgeNovos();
      if(autoAceitar)setTimeout(()=>moverStatus(p.id,'prep',true),600);
    }
  });
  renderAll();
}

// ── INIT ──────────────────────────────────────────────────────────
function iniciarApp(){
  renderAll();
  // Polling a cada 5s para pegar novos pedidos do site do cliente
  setInterval(lerPedidosCliente,5000);
  setInterval(renderAll,30000);
  // Cupons de exemplo
  cupons=[
    {id:1,codigo:'TCHO10',tipo:'pct',valor:10,minimo:30,usosMax:100,usosFeitos:0,validade:'2025-12-31',descricao:'10% de desconto acima de R$30!',item:'',ativo:true,criadoEm:new Date().toLocaleDateString('pt-BR')},
  ];
}
</script>
</body>
</html>
