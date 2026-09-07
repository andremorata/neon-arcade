# Unificação visual do Neon Arcade

Status: proposta **02 — Aurora Arcade** aprovada pelo usuário e implementada no menu e nos 24 jogos, na branch `codex/aurora-arcade`. Ver [registro de validação](validacao.md). Alterações locais, sem publicação.

## Diagnóstico

O commit `737fd70` adicionou Orbit e Echo, os dois jogos mais recentes. O tema anterior usa fundo violeta `#04001a`, ciano `#00f0ff`, magenta `#ff2bd6`, bordas multicoloridas, brilho forte e títulos em gradiente. Orbit usa fundo `#030917` e botão `#b9f6df`; Echo usa `#020d12` e botão `#a2ffd9`. Ambos adotam títulos claros, composição à esquerda, fundo de jogo visível e brilho localizado.

A diferença aparece também dentro da própria página: o cabeçalho externo de Orbit/Echo ainda usa o gradiente antigo, enquanto o quadro já tem outra linguagem. Portanto, trocar só a cor dos botões não resolve a continuidade.

## Direção comum

Manter a identidade de arcade e a geometria de cada jogo, trazendo dos novos o respiro, a hierarquia e a luz controlada. Unificar fundo, tipografia, botões, bordas, placares e estados. Preservar diferenças de cenário e cores que explicam as regras.

- Orbitron nos títulos e Space Mono nos textos, aproveitando as fontes locais.
- Textos claros sem brilho; cor e brilho concentrados no jogador, objetivos e feedback.
- Fundo escuro comum; no máximo dois acentos dominantes por tela, além das cores semânticas necessárias.
- Ações, sucesso, recompensa e perigo com papéis consistentes. Não recolorir indiscriminadamente Simon, Blocks, 2048 ou elementos cuja cor participa da regra.
- Ícone, forma ou rótulo acompanham informações importantes; perigo não depende apenas de vermelho.
- Mesma aparência para voltar, som, pausa, iniciar, continuar, recorde e controles de toque.
- Preservar proporção, área jogável e controles de cada jogo. A grade das imagens serve para comparar conceitos, não propõe reunir quatro jogos numa tela.

## Cinco propostas

| Proposta | Paleta de referência | Característica | Compromisso |
| --- | --- | --- | --- |
| 01 — Neon Essencial | `#090719` `#121129` `#62E7F2` `#ED78C8` `#ECF5FF` | Violeta, ciano e rosa suavizados; brilho moderado | Mais próxima do arcade original; menor mudança de identidade |
| 02 — Aurora Arcade | `#080D1C` `#111D2C` `#9BE7CE` `#AFA3F5` `#E9B77C` | Azul profundo, menta, lavanda e âmbar; atmosfera discreta | Meio-termo recomendado: leva o refinamento dos novos aos antigos e devolve variedade aos novos |
| 03 — Cinema Cósmico | `#080B14` `#151A2A` `#A8DFEE` `#B8ACDF` `#E9AC96` | Títulos claros, moldura mínima, grande área de jogo | Mais próxima de Orbit/Echo; reduz bastante a exuberância retrô |
| 04 — Fósforo Moderno | `#071211` `#10221F` `#A6E8C8` `#B39ADB` `#E8BD75` | Traços técnicos, menta, violeta e âmbar; textura CRT sutil | Identidade forte e consistente; exige cuidado para não deixar os jogos monocromáticos |
| 05 — Espectro Modular | `#0B101A` `#E889C5` `#E5B878` `#A8AEF0` `#93DFC9` | Interface neutra comum, acento por jogo | Maior variedade; consistência depende de respeitar os mesmos componentes |

Cada imagem compara Pong, Wheels, Orbit e Echo, com amostras de paleta, botões e placar. As imagens são estudos gerados por IA, não screenshots de código implementado. Valores hex deste documento são a referência de implementação; cores da imagem são aproximações visuais.

## Plano aprovado

A autorização “vamos com o 2. Pode fazer” cobre a implementação completa. O piloto foi usado como verificação interna antes de expandir a linguagem aos demais jogos.

1. **Fechar a direção.** Escolher uma proposta ou combinação explícita, incluindo intensidade de brilho, tratamento dos títulos e uso de acento por jogo. Minha sugestão é a proposta 02; a regra de acentos da 05 pode ser incorporada se a variedade for desejada.
2. **Validar um piloto representativo.** Aplicar ao menu e a Pong, Wheels, Orbit e Echo em uma branch `codex/…`. Comparar entrada e partida, em desktop e celular. Esses quatro cobrem geometria simples, cenário complexo e as duas novas linguagens. Conferir o resultado real antes de expandir.
3. **Consolidar o tema existente.** Inventariar todos os usos das classes/símbolos antes de alterar `neon-theme.css` ou `neon-core.js`. Reutilizar variáveis e componentes atuais, removendo overrides que se tornarem redundantes. Ajustar também cores e sombras desenhadas no Canvas: CSS sozinho não muda esses elementos. Se houver necessidade real de uma paleta acessível aos renderizadores, adicioná-la pelo `window.Neon`, preservando toda a API existente. Não criar outro sistema de temas ou seletor sem necessidade.
4. **Migrar os demais por família.** Em cada lote, aplicar a direção aprovada aos componentes e ao desenho local, sem mudar regras, física ou controles. Revisar exceções semânticas individualmente.
5. **Validar e concluir.** Rodar `node test-games.js` por lote e no final. Jogar cada jogo alterado no navegador; verificar entrada, partida, pausa, derrota/vitória quando aplicável, recordes, áudio e toque. Conferir retrato, paisagem, movimento reduzido, foco visível e legibilidade. Testar abertura direta dos HTML e experiência offline/PWA com cache atualizado, para não aprovar uma mistura de versões antigas e novas.

### Cobertura da migração

| Lote | Jogos/arquivos |
| --- | --- |
| Piloto | Pong, Wheels, Orbit, Echo e menu |
| Tabuleiros e memória | Serpent (`snake`), Blocks, Simon, 2048, Mines, Whack, Piano |
| Precisão e esportes | Hoops, Darts, Archer, Siege |
| Movimento e ação | Asteroid, Flappy, Bomber, Enduro, Breach, Racha, Slug, Runner, River |

## Critérios de aceite

- Menu e jogos parecem pertencer à mesma coleção, inclusive ao entrar e sair do modo imersivo.
- Jogador, inimigos, objetivos e obstáculos continuam distinguíveis em movimento.
- Textos normais buscam contraste mínimo de 4,5:1; texto grande e indicadores essenciais, 3:1. Medir no protótipo real, inclusive sobre o cenário; as imagens não comprovam contraste.
- Brilho não encobre texto nem geometria de colisão; animações decorativas respeitam movimento reduzido.
- Nenhum HUD ou controle cobre uma área essencial, inclusive em celular com safe areas.
- Chaves de `GAMES`, recordes `neon-best-*`, progresso, API `window.Neon`, áudio sintetizado e loops com delta time permanecem compatíveis.
- Contagem do menu continua derivada de `GAMES`. Sem framework, build, dependência ou fontes remotas novas.
- Teste automatizado passa e cada jogo alterado recebe verificação manual registrada.

## Verificação inicial do estudo (antes da aprovação)

Histórico Git, menu, CSS compartilhado e código de Orbit/Echo/Pong/Wheels examinados. Telas iniciais desses quatro jogos inspecionadas no navegador. `node test-games.js` passou para os 24 jogos existentes. Nenhum arquivo de execução foi alterado; não foi feita validação de gameplay de um redesign, pois ele ainda não foi implementado.

## Arquivos de avaliação

As cinco imagens e os prompts completos ficam nesta pasta. Ferramenta utilizada: geração de imagens integrada (`image_gen`), sem CLI/API externa configurada.
