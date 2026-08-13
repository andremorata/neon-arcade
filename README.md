# NEON ARCADE

Suíte de 9 jogos clássicos em HTML/Canvas com estética synthwave. Sem build, sem
dependências, sem backend — cada jogo é um único arquivo `.html` que roda direto no navegador.

Jogos: Serpent (snake), Blocks (tetris), Pong, Simon, Asteroid, Flappy, 2048, Mines, Whack.

**▶ Jogue agora: https://andremorata.github.io/neon-arcade/** — funciona no desktop e no celular,
nada pra instalar.

## Requisitos

- Um navegador moderno (WebAudio + Canvas 2D).
- Node.js apenas para rodar o teste (`node test-games.js`).
- Conexão de rede na primeira carga: as fontes (Orbitron, Space Mono) vêm do Google Fonts.

## Rodando

Para jogar basta abrir <https://andremorata.github.io/neon-arcade/> (GitHub Pages, servido da
`main`). Para mexer no código, abrir `index.html` no navegador funciona. Para evitar diferenças de comportamento
com `file://`, prefira um servidor local:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Teste

```bash
node test-games.js
```

Verifica que os scripts de Pong e Flappy avaliam sem erro de sintaxe, que a física de
rebatida do Pong devolve a bola na direção certa, e que a duração do toast no CSS não
regride.

## Estrutura

```
index.html               menu do arcade (lista GAMES + melhores pontuações)
games/neon-*.html        um jogo por arquivo: markup + CSS específico + loop de jogo
assets/js/neon-core.js   núcleo compartilhado (window.Neon)
assets/css/neon-theme.css tema, layout do stage, overlay, HUD, animações
test-games.js            teste de regressão
```

`window.Neon` expõe: áudio sintetizado via WebAudio (`audio.sfx`, trilha procedural
`audio.music`), sistema de partículas, overlay/HUD, recordes em `localStorage`
(chave `neon-best-<jogo>`) e utilitários de canvas.

## Configuração

Nenhuma. Estado do jogador (recordes, som ligado/desligado) fica em `localStorage`
no navegador.

## Licença

MIT — veja [LICENSE](LICENSE).
