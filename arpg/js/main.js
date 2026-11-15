'use strict';
// Laço principal, menus, tela cheia e save.
(() => {
  const G = window.G, J = G.jogo;
  const $ = id => document.getElementById(id);
  const SAVE = 'arpg-save';
  let estado = 'menu';          // menu | jogando | pausa | morto
  let relogioSave = 0;

  const ler = () => { try { return JSON.parse(localStorage.getItem(SAVE)); } catch { return null; } };
  const salvar = () => {
    if (!J.p || J.p.morto) return;
    try { localStorage.setItem(SAVE, JSON.stringify(G.salvavel())); } catch {}
  };

  // ── tela cheia ──────────────────────────────────────
  const raiz = document.documentElement;
  const podeTelaCheia = !!(raiz.requestFullscreen || raiz.webkitRequestFullscreen);
  const emTelaCheia = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const instalado = () => matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  async function pedirTelaCheia() {
    if (!podeTelaCheia || emTelaCheia()) return;
    try {
      if (raiz.requestFullscreen) await raiz.requestFullscreen({ navigationUI: 'hide' });
      else raiz.webkitRequestFullscreen();
    } catch {}
    try { await screen.orientation.lock('landscape'); } catch {}
  }

  function aoSairTelaCheia() {
    if (!emTelaCheia() && estado === 'jogando') pausar('Saiu da tela cheia');
  }
  document.addEventListener('fullscreenchange', aoSairTelaCheia);
  document.addEventListener('webkitfullscreenchange', aoSairTelaCheia);

  // ── estados ─────────────────────────────────────────
  function mostrar(id) {
    for (const p of document.querySelectorAll('.painel')) p.hidden = p.id !== id;
    $('hud').hidden = id === 'telaInicio';
  }

  async function jogar(novo) {
    G.som.iniciar();
    await pedirTelaCheia();
    if (novo || !J.p) {
      const s = novo ? null : ler();
      if (novo) try { localStorage.removeItem(SAVE); } catch {}
      G.iniciarJogo(s || {});
      G.render.centrar();
      G.hud.reiniciar();
    }
    G.input.soltarTudo();
    estado = 'jogando';
    mostrar(null);
    G.som.suspender(false);
  }

  function pausar(motivo) {
    if (estado !== 'jogando') return;
    estado = 'pausa';
    G.input.soltarTudo();
    $('pausaMotivo').textContent = motivo || '';
    mostrar('telaPausa');
    salvar();
  }

  G.aoMorrer = () => {
    estado = 'morto';
    setTimeout(() => { if (estado === 'morto') mostrar('telaMorte'); }, 900);
  };

  // ── botões ──────────────────────────────────────────
  function montarMenu() {
    const s = ler();
    $('btnContinuar').hidden = !s;
    $('btnNovo').textContent = s ? 'Novo jogo' : 'Jogar';
    $('btnNovo').classList.toggle('principal', !s);
    if (s) $('saveInfo').textContent = `Nível ${s.nivel} · ¢ ${(s.creditos || 0).toLocaleString('pt-BR')}`;
    $('dicaIos').hidden = podeTelaCheia || instalado();
  }
  $('btnContinuar').addEventListener('click', () => jogar(false));
  $('btnNovo').addEventListener('click', () => {
    if (ler() && !confirm('Começar do zero? O progresso salvo será apagado.')) return;
    jogar(true);
  });
  $('btnVoltar').addEventListener('click', () => jogar(false));
  $('btnMenu').addEventListener('click', () => { salvar(); estado = 'menu'; J.p = null; montarMenu(); mostrar('telaInicio'); });
  $('btnPausa').addEventListener('click', () => pausar());
  $('btnSom').addEventListener('click', () => { $('btnSom').classList.toggle('off', !G.som.alternar()); });
  $('btnSom').classList.toggle('off', !G.som.ligado);
  $('btnReerguer').addEventListener('click', () => {
    const perda = G.reerguer();
    if (perda) G.hud.aviso(`Perdeu ¢${perda} no caminho de volta`, '#ff7ab8');
    jogar(false);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pausar(); salvar(); G.som.suspender(true); }
  });
  addEventListener('pagehide', salvar);
  // bloqueia zoom por gesto e menu de toque longo no celular
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());

  // ── laço ────────────────────────────────────────────
  const retrato = matchMedia('(orientation: portrait)');
  let antes = performance.now();
  function quadro(agora) {
    const dt = Math.min(0.05, (agora - antes) / 1000);
    antes = agora;
    // celular em pé: o aviso de girar cobre a tela e o jogo espera
    const girar = G.input.toque && retrato.matches;
    if (estado === 'jogando' && !girar) {
      G.atualizar(dt);
      if ((relogioSave += dt) > 8) { relogioSave = 0; salvar(); }
    }
    if (J.p) {
      G.render.quadro(estado === 'jogando' || estado === 'morto' ? dt : 0);
      if (estado === 'morto') G.atualizar(dt * 0.3);   // o mundo segue em câmera lenta atrás do aviso
      G.hud.atualizar(dt);
    }
    requestAnimationFrame(quadro);
  }

  G.render.iniciar($('tela'));
  G.hud.iniciar();
  G.input.ligar($('tela'), () => (estado === 'jogando' ? pausar() : estado === 'pausa' ? jogar(false) : null));
  montarMenu();
  mostrar('telaInicio');
  requestAnimationFrame(quadro);

  // atalho pra testar no navegador: ?nivel=12&x=..&y=..
  const q = new URLSearchParams(location.search);
  if (q.has('debug')) window.J = J;
})();
