# NEON ARCADE

Suíte de jogos arcade em HTML/Canvas com estética synthwave. Sem build, sem
dependências, sem backend — cada jogo é um único arquivo `.html` que roda direto no navegador.

**▶ Jogue agora: https://andremorata.github.io/neon-arcade/** — funciona no desktop e no celular,
nada pra instalar. O catálogo completo é o próprio menu; ele se monta a partir de `games/`.

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

O teste varre `games/` sozinho: todo `.html` novo entra na checagem sem editar nada. Verifica
que o script de cada jogo avalia sem erro de sintaxe e tem tile no menu, que a física de
rebatida do Pong devolve a bola na direção certa, que a geometria do alvo do Darts pontua o
setor/anel que desenha, que os jogos de placar crescente atualizam o recorde, e que a duração
do toast no CSS não regride.

## Estrutura

```
index.html               menu do arcade (lista GAMES + melhores pontuações)
games/neon-*.html        um jogo por arquivo: markup + CSS específico + loop de jogo
assets/js/neon-core.js   núcleo compartilhado (window.Neon)
assets/css/neon-theme.css tema, layout do stage, overlay, HUD, animações
test-games.js            teste de regressão
```

Um jogo novo = um arquivo em `games/` + uma entrada no array `GAMES` de `index.html`. Nada
mais precisa ser tocado: menu, contagem e teste saem dessas duas fontes.

`window.Neon` expõe: áudio sintetizado via WebAudio (`audio.sfx`, trilha procedural
`audio.music`), sistema de partículas, overlay/HUD, recordes em `localStorage`
(chave `neon-best-<jogo>`) e utilitários de canvas.

## Configuração

Nenhuma. Estado do jogador (recordes, som ligado/desligado) fica em `localStorage`
no navegador.

## Licença

MIT — veja [LICENSE](LICENSE).
