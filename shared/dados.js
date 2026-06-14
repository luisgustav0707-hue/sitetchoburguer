/**
 * TCHO BURGUER — Fonte única de dados do cardápio
 * Usado pelo site do cliente (cliente/cliente.js)
 * e pelo painel admin (admin/admin.js).
 * Para alterar preço, nome ou ingrediente: edite só aqui.
 */
const TCHO = {

  // ── INFO DA LOJA ──────────────────────────────────────
  loja: {
    nome:          'Tcho Burguer',
    tel:           '(31) 98309-4152',
    whatsapp:      '5531983094152',
    instagram:     '@TchoBurguer',
    horario:       'Qui–Dom • 19h às 23h',
    pixKey:        '63.633.508/0001-47',
    corPrimaria:   '#f5820a',
    corSecundaria: '#ff6b00',
    gold:          '#e8a825',
  },

  // ── HAMBURGUERS ───────────────────────────────────────
  burguers: [
    { id:'xb',   emoji:'🍔', nome:'X-Burguer',               preco:23, desc:'Pão brioche, carne 160g, queijo cheddar, maionese da casa',                                                            ing:['Queijo cheddar','Maionese da casa'],                                         ativo:true },
    { id:'xs',   emoji:'🥗', nome:'X-Salada',                preco:25, desc:'Pão brioche, carne 160g, queijo cheddar, alface, tomate, maionese da casa',                                             ing:['Queijo cheddar','Alface','Tomate','Maionese da casa'],                       ativo:true },
    { id:'xba',  emoji:'🥓', nome:'X-Bacon',                 preco:30, desc:'Pão brioche, carne 160g, queijo cheddar, bacon, alface, tomate, maionese da casa',                                      ing:['Queijo cheddar','Bacon','Alface','Tomate','Maionese da casa'],               ativo:true },
    { id:'xp',   emoji:'🥒', nome:'X-Picles Burguer',        preco:33, desc:'Pão brioche, carne 160g, queijo cheddar, bacon, picles, alface, tomate, maionese da casa',                              ing:['Queijo cheddar','Bacon','Picles','Alface','Tomate','Maionese da casa'],      ativo:true },
    { id:'xt',   emoji:'🍍', nome:'X-Tropical',              preco:37, desc:'Pão brioche, carne 160g, queijo cheddar, bacon, abacaxi caramelizado, alface, tomate, maionese da casa',                ing:['Queijo cheddar','Bacon','Abacaxi caramelizado','Alface','Tomate','Maionese da casa'], ativo:true },
    { id:'xbd',  emoji:'🍔', nome:'X-Bacon Duplo',           preco:40, desc:'Pão brioche, 2 carnes 160g, queijo cheddar, bacon, alface, tomate, maionese da casa',                                   ing:['Queijo cheddar','Bacon','Alface','Tomate','Maionese da casa'],               ativo:true },
    { id:'xrj',  emoji:'🧀', nome:'X-Romeu & Julieta',       preco:45, desc:'Pão brioche, carne 160g, queijo coalho tostado, BBQ de goiabada, bacon, alface, tomate, maionese da casa',              ing:['Queijo coalho','BBQ de goiabada','Bacon','Alface','Tomate','Maionese da casa'], ativo:true },
    { id:'xrjd', emoji:'🧀', nome:'X-Romeu & Julieta Duplo', preco:55, desc:'Pão brioche, 2 carnes 160g, queijo coalho, BBQ de goiabada, bacon, alface, tomate, maionese da casa', tag:'ESPECIAL', ing:['Queijo coalho','BBQ de goiabada','Bacon','Alface','Tomate','Maionese da casa'], ativo:true },
    { id:'xbt',  emoji:'🥓', nome:'X-Bacon Triplo',          preco:60, desc:'Pão brioche, 3 carnes 160g, triplo queijo cheddar, triplo bacon, alface, tomate, maionese da casa',       tag:'TOP',     ing:['Queijo cheddar','Bacon','Alface','Tomate','Maionese da casa'],               ativo:true },
  ],

  // ── EXTRAS & BEBIDAS (id 'cmb' = combo) ──────────────
  extras: [
    { id:'bat', emoji:'🍟', nome:'Porção de Batata',  preco:13, desc:'Aprox. 200g',                        ativo:true },
    { id:'r15', emoji:'🥤', nome:'Refrigerante 1,5L', preco:14, opcoes:['Coca-Cola','Guaraná','Fanta Laranja','Fanta Uva','Sprite'],        ativo:true },
    { id:'rla', emoji:'🥤', nome:'Refrigerante Lata', preco:6,  opcoes:['Coca-Cola','Guaraná','Fanta Laranja','Fanta Uva','Sprite'],        ativo:true },
    { id:'suc', emoji:'🧃', nome:'Suco Lata',         preco:7,  opcoes:['Del Valle Uva','Del Valle Pêssego','Del Valle Laranja','Goiaba'], ativo:true },
    { id:'agu', emoji:'💧', nome:'Água com Gás',      preco:5,                                              ativo:true },
    { id:'cmb', emoji:'🍟', nome:'Combo +R$15',       preco:15, desc:'Refrigerante lata + Batata frita',   opcoes:['Coca-Cola','Guaraná','Fanta Laranja','Fanta Uva','Sprite'], ativo:true },
  ],

  // ── ADICIONAIS ────────────────────────────────────────
  adicionais: [
    { id:'ac_carne',   nome:'Carne bovina 160g', preco:10 },
    { id:'ac_coalho',  nome:'Queijo Coalho',      preco:10 },
    { id:'ac_abacaxi', nome:'Abacaxi',            preco:8  },
    { id:'ac_bacon',   nome:'Bacon',              preco:5  },
    { id:'ac_cheddar', nome:'Queijo Cheddar',     preco:4  },
    { id:'ac_picles',  nome:'Picles',             preco:3  },
    { id:'ac_molho',   nome:'Molhos',             preco:3  },
    { id:'ac_salada',  nome:'Salada',             preco:3  },
  ],

  // ── PONTO DA CARNE ────────────────────────────────────
  pontos: [
    { id:'mp', emoji:'🩸', nome:'Mal passado' },
    { id:'ap', emoji:'🥩', nome:'Ao ponto'    },
    { id:'bp', emoji:'🔥', nome:'Bem passado' },
  ],

  // ── SACHÊS ────────────────────────────────────────────
  saches: [
    { id:'sn', emoji:'🚫',   nome:'Não quero'      },
    { id:'sk', emoji:'🍅',   nome:'Ketchup'         },
    { id:'sm', emoji:'🤍',   nome:'Maionese'        },
    { id:'sa', emoji:'🍅🤍', nome:'Ketchup + Maio'  },
  ],

  // ── BAIRROS ATENDIDOS E TAXAS DE ENTREGA ─────────────
  bairros: [
    {nome:'Botafogo',taxa:7},{nome:'Canaã',taxa:7},{nome:'Candelária',taxa:4},{nome:'Cenáculo',taxa:4},
    {nome:'Céu Azul',taxa:6},{nome:'Comerciários',taxa:4},{nome:'Copacabana',taxa:7},
    {nome:'Etelvina Carneiro',taxa:7},{nome:'Floramar',taxa:7},{nome:'Guarani',taxa:7},
    {nome:'Heliópolis',taxa:8},{nome:'Itapoã',taxa:7},{nome:'Jaqueline',taxa:6},
    {nome:'Jardim Europa',taxa:3},{nome:'Jardim Felicidade',taxa:7},{nome:'Jardim Guanabara',taxa:7},
    {nome:'Jardim Leblon',taxa:6},{nome:'Juliana',taxa:6},{nome:'Justinópolis',taxa:7},
    {nome:'Lagoa',taxa:6},{nome:'Lagoinha',taxa:6},{nome:'Letícia',taxa:5},
    {nome:'Mantiqueira',taxa:5},{nome:'Maria Helena',taxa:5},{nome:'Minascaixa',taxa:4},
    {nome:'Minaslândia',taxa:7},{nome:'Nova Pampulha',taxa:6},{nome:'Parque São Pedro',taxa:5},
    {nome:'Piratininga',taxa:6},{nome:'Planalto',taxa:7},{nome:'Rio Branco',taxa:4},
    {nome:'Santa Amélia',taxa:6},{nome:'Santa Branca',taxa:7},{nome:'Santa Clara',taxa:7},
    {nome:'Santa Mônica',taxa:6},{nome:'São Bernardo',taxa:8},{nome:'São João Batista',taxa:5},
    {nome:'São Tomáz',taxa:8},{nome:'Serra Verde',taxa:4},{nome:'Tupi',taxa:7},
    {nome:'Venda Nova',taxa:5},{nome:'Vila Clóris',taxa:6},{nome:'Xodó-Marize',taxa:7},
  ],

  // ── FLAGS DE OPERAÇÃO (admin pode mudar via Firestore) ─
  config: {
    lojaAberta:      true,
    deliveryAtivo:   true,
    retiradaAtiva:   true,
    autoAceitar:     false,
    autoImprimir:    true,
    fidelidadeAtivo: false,
    cuponsAtivos:    true,
  },
};

if (typeof module !== 'undefined') module.exports = TCHO;
else window.TCHO = TCHO;
