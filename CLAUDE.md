# Legio — Fortalezas de Roma

Estrategia en tiempo real para móvil inspirada en *Imperium III: Las grandes batallas de Roma*.
Propuesta y estado: documentos `claude/propuesta-juego.md` y `claude/estado-desarrollo.md` del proyecto de Claude «Juego roma 2».

## Idioma
Todo en español: textos del juego, comentarios, commits, PR y documentación.

## Comprobaciones antes de dar por bueno un cambio
1. `npx tsc` sin errores.
2. `npm test` (Vitest): reglas, validación automática de cada mapa, partidas IA contra IA, determinismo y guardado.
3. Si tocas reglas, unidades, mapas o IA: `npm run sim -- 200` (≈4 min, en segundo plano) y que se cumplan todos los objetivos (✔):
   - Duelos de pueblos en el Po (Roma/Galos/Cartago, IA normal) entre 40 % y 60 %.
   - Trinacria (3 pueblos): ninguno por encima del 45 % ni por debajo del 20 %. Hispania (4 bandos): ninguno por encima del 40 %.
   - Duración mediana en el Po entre 8 y 25 min; en Trinacria e Hispania ≤ 40 min.
   - Partidas sin final < 10 %. La IA normal pasa hambre < 10 % del tiempo.
   - Sustituto del jugador (`jugador`, en espejo Roma contra Roma): gana a Fácil ≥ 75 %, a Normal entre 35 % y 65 %, y a Difícil ≤ 42 % (y menos que a Normal).
4. `npm run build` y `python3 tools/e2e.py`: móvil vertical y horizontal con toques reales, errores de consola y capturas en `tools/out/`. **Mira las capturas.**
5. Con 2 núcleos, no lances simulaciones mientras corre el e2e. Procesos largos en segundo plano escribiendo a un log.
- Edita archivos grandes con scripts que escriban primero en /tmp y comprueben cada sustitución.

## Arquitectura
- TypeScript + Vite + `vite-plugin-singlefile`: el juego entero es un solo `dist/index.html` (≈380 KB, funciona sin conexión).
- `src/core/`: reglas puras y deterministas, sin DOM. El generador aleatorio con semilla vive en `GameState.rng`. Tick fijo de 0,1 s (`TICK`).
  - `types.ts` tipos serializables · `units.ts` tropas y tipos de asentamiento (`KINDS`) · `maps.ts` mapas y caminos · `path.ts` rutas
  - `game.ts` partida nueva y órdenes (reclutar, enviar, redirigir) · `sim.ts` `step()` · `combat.ts` batallas y asedios · `ai.ts` IA (`AI_PARAMS`: facil, normal, dificil, jugador) · `save.ts` versión y `migrate()` · `validate.ts` validación de mapas
- `src/render/`: dibujo con Canvas 2D propio (se descartó Phaser: menos peso y control total). Terreno horneado una vez a 2× (`terrain.ts`), sprites de soldados y asentamientos horneados (`sprites.ts`), `renderer.ts` dibuja por fotograma solo lo visible. Canvas como mucho a 2× de densidad.
- `src/app.ts`: controlador e interfaz DOM (HUD, panel inferior/lateral, menús). `src/input.ts`: gestos (tocar, arrastrar con inercia, pellizcar, arrastrar para enviar).
- `src/audio.ts`: sonido sintetizado con WebAudio tras el primer toque. `src/storage.ts`: guardado en `localStorage` (`legio-roma:partida`, `legio-roma:ajustes`).
- Fuentes Cinzel y EB Garamond dentro del HTML (`@fontsource`, solo latino).
- Vertical y horizontal; `env(safe-area-inset-*)` en los bordes. En horizontal el panel va a la derecha.
- Ganchos de prueba: `window.__legio` (`debugAdvance(seg)`, `debugScreenOf(nombre)`).

## Reglas clave
- Fortaleza (recluta todo, murallas 1100, 14 torres), aldea (básicas y tiradores, empalizada 90), fortín (no recluta, muralla 400, 5 torres).
- Asedio: mientras aguanta la muralla, la infantería atacante la golpea (`wallDmg` por tropa; la caballería apenas) y no hace daño; torres y tiradores defensores disparan. Tras la brecha, cuerpo a cuerpo con poca ventaja defensiva.
- Pueblos: Roma, Galos y Cartago, cuatro papeles cada uno (básica, tiradores, pesada, caballería). Piedra-papel-tijera con `UnitDef.vs`: caballería ×1,8 contra tiradores (y los busca primero), lanzas contra caballería, tiradores contra pesada.
- Comida: fortalezas y aldeas producen; cada hombre consume (`upkeep`). Sin comida no se recluta, las tropas desertan y no se reponen. Se pueden licenciar tropas (`disband`).
- Mapas: `po` (2, simetría central), `trinacria` (3) e `hispania` (4) con simetría de giro (`buildRotational`); `MapDef.sym` copia la geometría de los caminos para que todas las posiciones sean iguales.
- Colores y nombres por bando (`LOOKS`): un pueblo repetido usa otro nombre y color.
- IA difícil: no se estira (alcance 550) y no ataca con escuadras sueltas. Normal y difícil reúnen ataques de varias plazas y hacen volver ejércitos si su fortaleza peligra. Sin trampas.
- Pierdes si no te queda ninguna fortaleza; gana el último bando en pie.
- Guardado v2 (v1 → v2 añade comida).

## Entrega
- Cada hito en su rama (`m0`, `m1`…) con su PR sobre el anterior; se aceptan en orden.
- El jugable se publica como artifact (el `dist/index.html`) y se actualiza ese mismo artifact en cada hito.
- Al cerrar un hito: tsc, tests, simulaciones, e2e, artifact, commit, push, PR, este archivo y `estado-desarrollo.md`.
