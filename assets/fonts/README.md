# Fontes

Subset `latin` (cobre o pt-BR) baixado do Google Fonts e servido localmente, para o arcade
não depender de rede depois da primeira carga.

| Arquivo | Família | Origem |
| --- | --- | --- |
| `orbitron-var-latin.woff2` | Orbitron (variável, 400–900) | https://fonts.google.com/specimen/Orbitron |
| `space-mono-400-latin.woff2` | Space Mono Regular | https://fonts.google.com/specimen/Space+Mono |
| `space-mono-700-latin.woff2` | Space Mono Bold | https://fonts.google.com/specimen/Space+Mono |

Ambas são licenciadas sob a [SIL Open Font License 1.1](https://openfontlicense.org/), que
permite redistribuição junto com o projeto.

Para atualizar: pegue o CSS em `https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap`
com User-Agent de navegador moderno, baixe os `woff2` dos blocos cujo `unicode-range` começa
em `U+0000-00FF` e substitua os arquivos acima. Os `@font-face` ficam em
`assets/css/neon-theme.css`.
