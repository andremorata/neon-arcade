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

- `index.html` — arcade menu. The `GAMES` array is the single source of truth for tiles and
  for the game count in the header; a new game means one entry there plus one file in
  `games/`. Never hardcode how many games exist — derive it from `GAMES`.
- `games/neon-*.html` — one self-contained game per file: markup, page-specific `<style>`,
  and the game loop in a trailing `<script>`. Games do not import each other.
- `assets/js/neon-core.js` — `window.Neon`, shared by every page. Changing it touches every
  game at once.
- `assets/css/neon-theme.css` — shared theme, `.stage`, overlay, HUD, toast, animations.
- `sw.js` + `manifest.webmanifest` — offline/PWA. `sw.js` precaches only the shell; the menu
  precaches every `GAMES` href into the same cache, so a new game needs no change here.
  `assets/icon.svg` is the icon source — regenerate the PNGs from it, do not hand-edit them.

## Constraints

- **Shared core is load-bearing.** Before editing `neon-core.js` or `neon-theme.css`, grep
  every file in `games/` for the symbol/class. A "small" change there is an all-games change.
- Games reach the core through `window.Neon` only. Keep the returned API surface stable.
- Best scores live in `localStorage` under `neon-best-<key>`, where `<key>` matches the
  `key` field in the `GAMES` array. Renaming a key silently wipes players' records.
- Audio is 100% synthesized (WebAudio oscillators + noise buffers). No audio files, no
  audio libraries. New sounds go in the `sfx` object in `neon-core.js`.
- Game loops are `requestAnimationFrame` with delta time. Do not switch to fixed
  `setInterval` stepping.
- UI copy is pt-BR. Match it.
- `test-games.js` discovers games by scanning `games/*.html`, so a new file is covered
  automatically — but it parses HTML by string matching (last `<script>` block, the literal
  `  function bounce(onPlayer)` line in Pong, and `pb = Neon.best.update('<key>', <var>)` for
  the games listed in its `BEST` map). Renaming or reindenting those breaks the test in a
  confusing way — update the test in the same change.

## Validation

Run `node test-games.js`, then open the affected game in a browser and actually play it —
canvas rendering, audio, and input have no automated coverage.

## Safety

Do not add a build step, a framework, a bundler, or an npm dependency. The whole point is
that a `.html` file opens and works.
