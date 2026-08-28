<img src="assets/icon-192.png" alt="NEON ARCADE" width="128" align="right">

# NEON ARCADE

Suíte de jogos arcade em HTML/Canvas com estética synthwave. Sem build, sem
dependências, sem backend — cada jogo é um único arquivo `.html` que roda direto no navegador.

**▶ Jogue agora: https://andremorata.github.io/neon-arcade/** — funciona no desktop e no celular.
O catálogo completo é o próprio menu; ele se monta a partir de `games/`.

## Instalar / jogar offline

O arcade é um PWA. Abrir o menu uma vez já baixa todos os jogos, o tema e as fontes para o
cache — a partir daí ele roda sem rede, inclusive os jogos que você nunca abriu. As fontes são
servidas do próprio repositório (`assets/fonts/`), então não há nenhuma chamada a terceiros.

- **Windows / Android (Chrome, Edge):** ícone de instalar na barra de endereço → *Instalar*.
- **iOS / iPadOS (Safari):** Compartilhar → *Adicionar à Tela de Início*.

Atualizações chegam sozinhas: a página serve o cache na hora e revalida em segundo plano, então
a versão nova aparece na visita seguinte.

## Requisitos

- Um navegador moderno (WebAudio + Canvas 2D).
- Node.js apenas para rodar o teste (`node test-games.js`).
- Conexão de rede só na primeira carga, para baixar o cache. O service worker não roda em
  `file://` — abrindo o `.html` direto do disco o jogo funciona, mas sem instalar nem cachear.

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

O teste varre `games/` sozinho: todo `.html` novo entra na checagem sem editar nada. Ele
confere que o script de cada jogo avalia sem erro de sintaxe e tem tile no menu, que os jogos
de placar crescente gravam o recorde, e que a duração do toast no CSS não regride.

Além disso, recorta funções direto do fonte de cada jogo e roda a lógica de verdade, em vez de
uma cópia que dessincroniza com o tempo. Hoje cobre a rebatida do Pong, os setores do alvo do
Darts, os anéis do Archer, o apoio por centro de massa do Siege, a curva de velocidade do
Piano, a cruz de explosão e a fuga da própria bomba no Bomber, e a projeção da pista, as
curvas de clima e a contagem de ultrapassagem do Enduro. Boa parte desses testes nasceu de um
bug real, e o comentário acima de cada um diz qual.

## Estrutura

```
index.html               menu do arcade (lista GAMES + melhores pontuações)
games/neon-*.html        um jogo por arquivo: markup + CSS específico + loop de jogo
assets/js/neon-core.js   núcleo compartilhado (window.Neon)
assets/css/neon-theme.css tema, layout do stage, overlay, HUD, animações
assets/fonts/            Orbitron e Space Mono (subset latin, servidas localmente)
assets/icon.svg          ícone (fonte); os PNGs ao lado saem dele
manifest.webmanifest     metadados de instalação (PWA)
sw.js                    service worker: cache offline
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
