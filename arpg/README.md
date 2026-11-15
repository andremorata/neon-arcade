# Dark Noise (protótipo)

ARPG cyberpunk de ação em tempo real, para celular e PC, sempre em tela cheia.
Mora em `arpg/` enquanto é protótipo; a ideia é virar repositório próprio.

Sem build e sem dependências: scripts clássicos carregados em ordem por `index.html`,
então abre direto do arquivo ou por `python3 -m http.server`.

## Estrutura

| Arquivo | O que faz |
|---|---|
| `js/base.js` | utilidades, sorteio com semente, tabelas (bairros, inimigos, habilidades, loot) |
| `js/mundo.js` | cidade gerada por quadras, bairros, colisão, linha de visão |
| `js/entidades.js` | jogador, inimigos, combate, loot, XP |
| `js/render.js` | câmera, desenho com profundidade, luzes neon, chuva |
| `js/hud.js` | barras, botões, minimapa, avisos |
| `js/input.js` | teclado/mouse e joystick virtual |
| `js/audio.js` | som sintetizado |
| `js/main.js` | laço, menus, tela cheia, save |
| `docs/` | plano de design |

`base.js` e `mundo.js` não tocam no DOM: `node test-games.js` roda os dois.

## Controles

- **PC:** WASD anda, Espaço ou clique atira, Q/E/R (ou 1/2/3) habilidades, Esc pausa.
- **Celular:** joystick à esquerda, ataque e habilidades à direita, mira automática.
- **iPhone:** tela cheia só instalando (Compartilhar → Adicionar à Tela de Início).

`?debug` na URL expõe `window.J` (estado do jogo) no console.
