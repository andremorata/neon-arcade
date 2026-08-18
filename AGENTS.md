# AGENTS.md

Static site, no build step, no package manager, no dependencies. Everything runs from the
filesystem.

## Commands

```bash
node test-games.js          # the only test; must pass before you call work done
python3 -m http.server 8000 # serve locally to check a change in the browser
```

There is no linter, formatter, or type checker. Do not add one unless asked.

## Map

- `index.html` — arcade menu. The `GAMES` array is the single source of truth for tiles;
  a new game means one entry there plus one file in `games/`.
- `games/neon-*.html` — one self-contained game per file: markup, page-specific `<style>`,
  and the game loop in a trailing `<script>`. Games do not import each other.
- `assets/js/neon-core.js` — `window.Neon`, shared by every page. Changing it touches all
  11 games.
- `assets/css/neon-theme.css` — shared theme, `.stage`, overlay, HUD, toast, animations.

## Constraints

- **Shared core is load-bearing.** Before editing `neon-core.js` or `neon-theme.css`, grep
  the 11 game files for the symbol/class. A "small" change there is an 11-game change.
- Games reach the core through `window.Neon` only. Keep the returned API surface stable.
- Best scores live in `localStorage` under `neon-best-<key>`, where `<key>` matches the
  `key` field in the `GAMES` array. Renaming a key silently wipes players' records.
- Audio is 100% synthesized (WebAudio oscillators + noise buffers). No audio files, no
  audio libraries. New sounds go in the `sfx` object in `neon-core.js`.
- Game loops are `requestAnimationFrame` with delta time. Do not switch to fixed
  `setInterval` stepping.
- UI copy is pt-BR. Match it.
- `test-games.js` parses game HTML by string matching (last `<script>` block, the literal
  `  function bounce(onPlayer)` line in Pong). Renaming or reindenting those breaks the test
  in a confusing way — update the test in the same change.

## Validation

Run `node test-games.js`, then open the affected game in a browser and actually play it —
canvas rendering, audio, and input have no automated coverage.

## Safety

Do not add a build step, a framework, a bundler, or an npm dependency. The whole point is
that a `.html` file opens and works.
