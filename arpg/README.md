# Dark Noise (protótipo)

ARPG cyberpunk de ação em tempo real, para celular e PC, sempre em tela cheia.
Mora em `arpg/` enquanto é protótipo; a ideia é virar repositório próprio.

Sem build e sem dependências: scripts clássicos carregados em ordem por `index.html`,
então abre direto do arquivo ou por `python3 -m http.server`.

## Estrutura

| Arquivo | O que faz |
|---|---|
| `js/base.js` | utilidades, sorteio com semente, constantes do mundo e paleta Aurora |
| `js/dados.js` | **fonte única dos números** (habilidades, inimigos, fórmulas, bairros, estilo); o dossiê lê o mesmo |
| `js/regras.js` | transforma os dados em regras de jogo (metros em unidades, fórmulas em funções), biscates e vendedores |
| `js/sistemas.js` | atributos, mochila e equipamento, implantes, Ruído, Atenção, dívida, lojas e teclas 1 a 4 |
| `js/mundo.js` | cidade gerada por quadras, bairros, colisão, linha de visão |
| `js/figuras.js` | personagens: esqueleto vestido, sombreado, luz de recorte e contorno, em cache por pose |
| `js/entidades.js` | jogador, habilidades, dano, loot, XP e biscates |
| `js/inimigos.js` | IA de cada inimigo, bandos por bairro, o chefe Calha, Eco e Cobradores |
| `js/render.js` | câmera, desenho com profundidade, luzes, névoa e chuva |
| `js/hud.js` | barras, botões, minimapa, biscate, chefe, avisos |
| `js/paineis.js` | janelas do personagem e das lojas |
| `js/input.js` | teclado/mouse e joystick virtual |
| `js/audio.js` | som sintetizado |
| `js/main.js` | laço, menus, tela cheia e save |
| `docs/` | dossiê de design e quadro-alvo do visual |

`base.js`, `dados.js`, `regras.js`, `sistemas.js` e `mundo.js` não tocam no DOM: `node test-games.js` roda os cinco.

## Controles

- **PC:** WASD anda, Espaço ou clique atira, 1 a 4 habilidades, Q rola, E injetor (ou falar perto de vendedor), I personagem, Esc pausa.
- **Celular:** joystick à esquerda; ataque, habilidades, esquiva e injetor/falar à direita; ⚙ abre o personagem; mira automática.
- **iPhone:** tela cheia só instalando (Compartilhar → Adicionar à Tela de Início).

`?debug` na URL expõe `window.J` (estado do jogo) no console.
