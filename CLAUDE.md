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
   - Para probar variantes de la IA, compara en espejo con muchas partidas (≥ 80): con 30–40 el ruido es de ±8 puntos.
   - Si tocas la campaña o los mapas históricos: `npm run sim -- 40 campana`; en cada capítulo el sustituto del jugador (contra IA normal) gana entre el 25 % y el 90 %, mediana ≤ 45 min, sin final < 15 %. El reparto de plazas de cada capítulo (`campaign.ts`) es la palanca principal: una fortaleza enemiga más o menos cambia el resultado de 0 % a 100 %.
4. `npm run build` y `python3 tools/e2e.py`: móvil vertical y horizontal con toques reales, errores de consola y capturas en `tools/out/`. **Mira las capturas.**
5. Con 2 núcleos, no lances simulaciones mientras corre el e2e. Procesos largos en segundo plano escribiendo a un log.
- Edita archivos grandes con scripts que escriban primero en /tmp y comprueben cada sustitución.

## Arquitectura
- TypeScript + Vite + `vite-plugin-singlefile`: el juego entero es un solo `dist/index.html` (≈490 KB, funciona sin conexión).
- `src/core/`: reglas puras y deterministas, sin DOM. El generador aleatorio con semilla vive en `GameState.rng`. Tick fijo de 0,1 s (`TICK`).
  - `types.ts` tipos serializables · `units.ts` tropas y tipos de asentamiento (`KINDS`) · `maps.ts` mapas y caminos · `path.ts` rutas
  - `historic.ts` mapas reales (ciudades en lat/lon, calzadas, ríos, cordilleras, rótulos, estilo por región) · `geo/costas.ts` costas generadas con `npx vite-node tools/geo.ts` desde Natural Earth 1:10m (`world-atlas`) · `geoutil.ts` tierra/mar · `campaign.ts` campañas y capítulos
  - `game.ts` partida nueva y órdenes (reclutar, enviar, redirigir) · `sim.ts` `step()` · `combat.ts` batallas y asedios · `ai.ts` IA (`AI_PARAMS`: facil, normal, dificil, jugador) · `save.ts` versión y `migrate()` · `validate.ts` validación de mapas
- `src/render/`: dibujo con Canvas 2D propio (se descartó Phaser: menos peso y control total). Terreno horneado una vez a 2× (`terrain.ts`), sprites de soldados y asentamientos horneados (`sprites.ts`), `renderer.ts` dibuja por fotograma solo lo visible. Canvas como mucho a 2× de densidad.
- `src/app.ts`: controlador e interfaz DOM (HUD, panel inferior/lateral, menús). `src/input.ts`: gestos (tocar, arrastrar con inercia, pellizcar, arrastrar para enviar).
- `src/audio.ts`: sonido y música generativa (dórico en re: bordón, lira y tambor; más tambor si hay batallas tuyas) con WebAudio tras el primer toque; música y sonido se apagan por separado.
- `src/render/minimap.ts`: minimapa (arriba a la derecha en vertical, abajo a la izquierda en horizontal); tocarlo mueve la cámara. `renderer.indicators`: avisos en el borde de batallas propias (⚔) y de ejércitos enemigos que van a por tus plazas (!).
- `src/tutorial.ts`: tutorial guiado de 8 pasos en el Po (`GameState.tutorial` = paso); resalta plazas en el mapa (`view.highlight`) y botones (clase `hl`). `src/storage.ts`: guardado en `localStorage` (`legio-roma:partida`, `legio-roma:ajustes`).
- Fuentes Cinzel y EB Garamond dentro del HTML (`@fontsource`, solo latino).
- Vertical y horizontal; `env(safe-area-inset-*)` en los bordes. En horizontal el panel va a la derecha.
- Ganchos de prueba: `window.__legio` (`debugAdvance(seg)`, `debugScreenOf(nombre)`).

## Reglas clave
- Fortaleza (recluta todo, murallas 1100, 14 torres), aldea (básicas y tiradores, empalizada 90), fortín (no recluta, muralla 400, 5 torres).
- Asedio: mientras aguanta la muralla, la infantería atacante la golpea (`wallDmg` por tropa; la caballería apenas) y no hace daño; torres y tiradores defensores disparan. Tras la brecha, cuerpo a cuerpo con poca ventaja defensiva.
- Pueblos: Roma, Galos y Cartago, cuatro papeles cada uno (básica, tiradores, pesada, caballería). Piedra-papel-tijera con `UnitDef.vs`: caballería ×1,8 contra tiradores (y los busca primero), lanzas contra caballería, tiradores contra pesada.
- Comida: fortalezas y aldeas producen; cada hombre consume (`upkeep`). Sin comida no se recluta, las tropas desertan y no se reponen. Se pueden licenciar tropas (`disband`).
- Mapas equilibrados: `po` (2, simetría central), `trinacria` (3) y `cuatro` (4, «Cuatro reinos») con simetría de giro (`buildRotational`); `MapDef.sym` copia la geometría de los caminos para que todas las posiciones sean iguales.
- Mapas históricos (`MapDef.geo`): `italia`, `sicilia`, `hispania`, `galia`, `africa`. Proyección equirectangular corregida por la latitud. Las ciudades costeras se apartan de la orilla (`inland`) y los caminos que caen al mar se llevan a la costa (`toLand`). La validación exige ciudades y caminos en tierra y una distancia mínima de 100. El terreno dibuja mar, bajíos, playa, ríos con puentes, cordilleras, clima (`med`, `norte`, `arido`) y rótulos; su escala se adapta para no pasar de ~6,5 Mpx.
- Escenarios: `PlayerSetup.owns` reparte plazas por nombre (el primero es el jugador); `name`, `color`, `gold`, `fortLevel` y `generals` personalizan cada bando. Las plazas no repartidas de un mapa histórico son independientes (fortaleza 5+3, aldea 2+1, fortín 3+2).
- Campaña (`CAMPAIGNS`): Roma (5 capítulos), Cartago (4) y Galos (3). Al ganar, el progreso (`legio-roma:campana`) guarda el siguiente capítulo, el nivel de la capital y hasta 3 generales vivos, que empiezan el siguiente capítulo en la capital.
- Colores y nombres por bando (`LOOKS`): un pueblo repetido usa otro nombre y color.
- IA difícil: no se estira (alcance 550) y no ataca con escuadras sueltas. Normal y difícil reúnen ataques de varias plazas y hacen volver ejércitos si su fortaleza peligra. Sin trampas.
- Pierdes si no te queda ninguna fortaleza; gana el último bando en pie.
- Mejoras (`upgradeOptions`, `statsOf(s)` calcula las características según tipo, nivel y edificio; usa siempre `statsOf` y no `KINDS[s.kind]` para un asentamiento concreto): fortaleza niveles 1–3 (200 y 350 de oro; +0,8 oro, +0,3 comida, +80 población, muralla +250, +2 torres por nivel), aldea con un edificio (granja, mercado o muro de piedra, 120–130), fortín reforzado (120). Las obras se paran durante un asedio; al conquistar se conservan.
- Generales (`General`): uno al empezar en la fortaleza; uno más por cada nivel extra de fortalezas; cuestan 200. Van con un ejército (`sendArmy(..., generalId)`) o esperan en una plaza; ×(1,08 + 0,04·(nivel−1)) de ataque y defensa, aguantan más antes de huir, suben de nivel con los enemigos abatidos y mueren si cae su ejército o su plaza.
- Moral (`stepBattle`): un bando de ejércitos con menos del 38 % de su vida máxima en la batalla y 1,5 veces más débil que el rival huye (`retreatArmy`) a la plaza propia más cercana perdiendo un 12 %; los que huyen no se paran a luchar. Retirada ordenada (`orderRetreat`) pierde menos. Las guarniciones no huyen.
- Tropas especiales (fortaleza nivel 3): Pretorianos (Roma), Druidas (+10 % de ataque a su bando), Elefantes de guerra (Cartago, derriban murallas).
- IA: fácil no mejora; normal ahorra la mitad de la próxima mejora antes de reclutar; difícil solo mejora con lo que le sobra.
- Guardado v4 (v1 → v2 añade comida; v2 → v3 mejoras, generales y moral; v3 → v4 el mapa simétrico «hispania» pasa a «cuatro»). `GameState.campaign` marca las partidas de campaña; `GameState.history` guarda cada 30 s los hombres de cada bando para la gráfica final.

## Entrega
- Cada hito en su rama (`m0`, `m1`…) con su PR sobre el anterior; se aceptan en orden.
- El jugable se publica como artifact (el `dist/index.html`) y se actualiza ese mismo artifact en cada hito.
- Al cerrar un hito: tsc, tests, simulaciones, e2e, artifact, commit, push, PR, este archivo y `estado-desarrollo.md`.
