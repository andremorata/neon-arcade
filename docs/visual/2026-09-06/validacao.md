# Aurora Arcade — implementação e validação

Proposta 02 aplicada em 6 de setembro de 2026. Branch local: `codex/aurora-arcade`.

## Implementação

- Azul profundo, menta, lavanda, âmbar e títulos creme no menu e nos 24 jogos.
- Tema compartilhado reaproveitado; removidos efeitos decorativos de glitch, faixas animadas e bordas multicoloridas. Brilho reduzido também no Canvas.
- Paletas semânticas distintas preservadas em Blocks, Simon, Mines, 2048 e nos estados dos jogos.
- Orbit e Echo usam os componentes comuns; mantêm sua composição e ambientação próprias.
- Instruções compactas para jogos horizontais em retrato; início do Racha cabe em paisagem curta. HUD de Breach e Slug reserva espaço para voltar.
- Assets com revisão `aurora-2` e revalidação no service worker evitam misturar HTML novo com tema antigo no cache do WebKit.
- Sem dependências, build ou alterações de regras, física, chaves de recorde e API pública `window.Neon`.

## Verificações executadas

`node test-games.js`: **24 jogos OK**. Inclui os testes existentes de comportamento e compatibilidade, contraste dos textos comuns sobre os dois fundos, botão principal e classificação dos assets no cache.

`git diff --check`: passou. Revisão das alterações nos scripts: cores, sombras e posições de HUD; loops e regras preservados.

No navegador integrado, cada jogo foi iniciado e recebeu entrada real. Pausa/retomada foram verificadas durante a rodada de inspeção; o console não apresentou erros de execução nos testes online.

| Jogos | Interação conferida |
| --- | --- |
| Pong | Movimento da raquete |
| Wheels | Seleção da primeira fase e aceleração |
| Orbit | Lançamento da nave, incluindo clique no Canvas em viewport móvel |
| Echo | Movimento, sonar e isca; sonar e direcional na tela em viewport móvel |
| Snake, Asteroid, Flappy | Curvas, propulsão/tiro e impulsos |
| Blocks, 2048, Bomber | Movimento/rotação/queda, fusão de peças e bomba |
| Simon, Mines, Whack | Toque em campo, abertura de casas e tentativa de acertar alvo |
| Hoops, Darts, Archer, Piano | Impulso, travamento/disparo e teclas musicais |
| Enduro, Racha, Runner, River | Direção, troca de marcha, movimento e tiro |
| Breach, Slug | Movimento e tiro; inspeção do HUD em paisagem curta |
| Siege | Arraste do estilingue e lançamento; pontuação e recorde exibidos |

Whack também chegou ao fim do tempo e mostrou a tela de resultado/reinício. Simon avançou de rodada sem falhas. 2048 registrou fusão e pontuação. Isso não representa uma campanha completa nem verificação de todos os finais de cada jogo.

Layout inicial dos 24 jogos conferido em retrato **325 × 703 CSS px** e paisagem **703 × 325 CSS px**, além da janela desktop. Sem transbordamento horizontal ou quadro fora da viewport nas medidas coletadas. Racha recebeu uma nova conferência após encurtar as instruções: botão inicial dentro do quadro. As medidas são do navegador, não de aparelhos físicos.

Botão de som alternou o estado silenciado e voltou ao estado original. A implementação WebAudio não mudou; a ferramenta não permitiu avaliar subjetivamente a reprodução sonora. Foco visível e redução de movimento permanecem cobertos no CSS/testes; não foi feita auditoria completa com leitor de tela ou aparelho iOS.

## Offline e limites

Com o servidor local desligado, o menu e os 24 HTML abriram pelo cache, todos com fundo Aurora, Canvas e botão de início. Pong iniciou, recebeu movimento e pausou offline. Servidor reiniciado após o teste. Não houve limpeza de dados ou recordes.

A abertura direta por `file://` foi bloqueada pela política de segurança do navegador de testes. Não foi contornada nem declarada validada; a inspeção interativa ocorreu em `http://localhost:8000`. As referências locais continuam relativas e não foi introduzida dependência de servidor.

Contraste automatizado cobre os tokens de texto da interface comum; não certifica cada pixel de texto ou efeito em todos os cenários do Canvas. Publicação e testes físicos de instalação do PWA não foram executados.

## Atualização: início em tela cheia

Todos os jogos passam pela entrada compartilhada ao fechar o overlay: solicitam Fullscreen API uma vez por página e adotam layout ampliado. Recusa ou falta de suporte não interrompe o início. Sair da tela cheia não provoca nova solicitação ao retomar. Placar externo permanece visível nos jogos que dependem dele; os demais conservam o modo imersivo existente. Revisão dos assets atualizada para `fullscreen-1`.

`node test-games.js` passou com cobertura de sucesso, ausência de API, rejeição, exceção síncrona, tela cheia já ativa e ausência de solicitação repetida. Início e entrada por teclado dos 24 jogos conferidos em 390 × 844 e 844 × 390 CSS px, incluindo a seleção de fase do Wheels: nenhum quadro ultrapassou a viewport. Pausa também foi acionada. Pong foi inspecionado em desktop com placar preservado.

O layout ampliado foi confirmado nos navegadores integrado e Chromium conectado. A entrada em tela cheia nativa não foi confirmada pela automação; o teste do Chromium ocorreu em aba de segundo plano. A implementação usa a API padrão ligada ao gesto de início, com fallback funcional. Não houve teste físico de iPhone/Android. Referência: [MDN — requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen).

Durante esta atualização, Jungle foi adicionado por trabalho simultâneo no diretório. Sua referência de assets foi alinhada a `fullscreen-1`; início, movimento, salto e pausa foram conferidos nas duas dimensões acima, com o quadro dentro da viewport. A última execução completa retornou **25 jogos OK**, já com Jungle. Nenhuma alteração de regras do novo jogo fez parte do ajuste de tela cheia.
