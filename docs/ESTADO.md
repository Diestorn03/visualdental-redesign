# ESTADO · Handoff para retomar (2026-10-01, ~12:57)

## Último estado (2026-10-02 16:05). Push hecho, el usuario lo autorizó por falta de tiempo
- **Pantalla de carga** (`src/components/chrome/Loader.astro`): sale en cada carga, F5 incluido, con el molar, el wordmark, la barra y el % reales, y un telón que sube.
  No aparece con "reducir movimiento" ni con `html.calm`. Tiene un failsafe de 6 s. El hero espera a `vd:loader-done`.
- La verificación r2 (`wf_766bf684-c85`) seguía corriendo al hacer el push. v4 (calidad visual y "wow") **aprobó**, con 5 detalles menores.
  Lo que no haya terminado se retoma leyendo su journal.
- Verificación r2:
  - v4 aprobó.
  - v1 falló. **Importante:** al arrancar el JS, la franja de IG de Stories pasa a marquesina y cambia de alto
    (-10 px en escritorio), lo que desplaza FAQ, Contacto y footer (área f5). Lo demás es menor.
  - v3 falló. **Importante:** los CTA hacia `#contact` con `data-topic` hacen dos cortes en vez de un glide (área f2). Lo demás es menor.
  - v2 (fluidez) corría al cerrar la sesión.
  - Próxima sesión: corregir esos 2 importantes y los menores baratos, re-verificar, cerrar `docs/FLUIDEZ.md` y hacer push.
- Pendientes conocidos: los menores de v4 (callout "Prosthetic axis" en móvil, la placa Ø sobre las roscas en p≈0.46,
  y el selector de paleta tapando texto en móvil) y lo que reporten v1, v3 y v2.

## RETOMAR AQUÍ (2026-10-02, la sesión se cortó con el workflow `wf_a80d85d1-883` en la verificación 2)
- **Hecho:** fase 1 (f1-f5, d1, d2) → build 1 → verificación r1 (v1-v4: **los 4 fallaron**, con 8, 6, 6 y 8 fallos) → ronda de corrección (7 áreas) → build 2.
- **Informes guardados:** `.shots/wf/fluidez-results.json` (array de 20).
  - Índices 0-6: entregas de fase 1, en el orden en que terminaron.
  - 7: build 1.
  - 8-11: veredictos r1, con `failures` por área.
  - 12-18: correcciones.
  - 19: build 2.
- **Relanzado (2026-10-02 15:20):** workflow `wf_766bf684-c85` (`verificar-y-cerrar`), con este orden:
  1. Verificación r2: v1, v3 y v4 en paralelo; después v2 sola, para que la GPU no se contamine.
  2. Corrección por área.
  3. Build y verificación r3, solo de los verificadores que fallaron.
  4. Cierre (`docs/FLUIDEZ.md`).
  - Script: `...\workflows\scriptserificar-y-cerrar-wf_766bf684-c85.js`.
  - Si se vuelve a cortar: leer su journal (`...\subagents\workflows\wf_766bf684-c85\journal.jsonl`) y relanzar solo lo que falte.
- **Falta:**
  1. Verificación r2 (v1 saltos, v2 fluidez, v3 puntero y claridad, v4 calidad visual y "wow").
  2. Si algo falla, otra ronda de corrección por área.
  3. Cierre: `docs/FLUIDEZ.md`, este archivo y el README.
- **Cómo retomar:** copiar el script `...\workflows\scripts\fluidez-y-digital-wf_a80d85d1-883.js`, dejar solo `runVerify(2)` + corrección + cierre,
  pasarle como contexto `.shots/wf/fluidez-results.json` y relanzar. Los verificadores necesitan `dist/` construido: correr `npm run build` primero.
  Sus sondas están en `tools/qa/probes/v*-*.mjs`.
- Los cambios del árbol de trabajo **no están commiteados**, a propósito. **No hacer push** hasta que pase la verificación y el usuario lo vea.
- Matar dev servers y preview colgados en los puertos 4400-4430 y los Chrome de CDP en 9400-9430 antes de relanzar.


## BUILD ronda 2 (2026-10-02 12:45): build limpio, verificado sobre `astro preview`, todavia NO entregado
- `npm run build` pasa sin errores ni avisos (2 paginas, 17 MB `dist`). No hizo falta tocar codigo. `index.astro` monta `#digital` entre `#services` y `#process`; no existen `src/pages/lab` ni `src/pages/kit`; no quedan servidores en 4400-4430 ni Chrome en 94xx.
- Pedidos cruzados ya aplicados en el codigo (comprobados con grep): ningun `ScrollTrigger.refresh()` fuera de `engine.js`, `scrub: true` con Lenis, `sizes` de Hero/About, `scrollToTarget(y)` acepta numeros, sin `:has(> .split-line-mask)` universal, sin `queueRefresh` suelto, README con la fila Services anclada, Digital, `?digital=3d` y poster.
- Sonda `d3-triggers` sobre la build (Chrome headless con GPU, 1366x820, recorrido completo con rueda real, 24 s): 88 triggers, 1 solo refresh (28,5 ms, a los 659 ms de la carga), 0 layout shifts, deriva de triggers 0 px antes del refresh forzado, alturas de los 14 `[data-split]` identicas en boot/fuentes/final. Sonda `.shots/build/checks.mjs`: consola sin errores ni avisos; `scrollHeight` 25050 estable desde los 312 ms (antes 24898 -> 25064 a los 640 ms).
- No se re-ejecutaron `f1-triggers`/`f1-verify` tal cual: parchean `/src/scripts/engine.js` (dev). `d3-triggers` es su equivalente para `dist`.
- Pendiente para marcar como entregado: re-medir p95/max de cuadro con la maquina en reposo (`d1-scroll`/`d2-*` sobre preview) y decidir lo de la escena 3D en frio (PMREM, ~0,9 s).

## BUILD ronda 1 (2026-10-02 10:50): build limpio, todavia NO entregado
- `npm run build` pasa sin errores ni avisos. El aviso de chunk > 500 kB era `three` (720 kB, `import()` solo desde #digital, no esta en `index.html`): se silencio con `build.chunkSizeWarningLimit` en `astro.config.mjs`.
- `index.astro` monta `#digital` entre `#services` y `#process`; no existen `src/pages/lab` ni `src/pages/kit`. Consola de la build sin errores ni avisos propios (solo el aviso HLSL X4122 de ANGLE al compilar shaders de three, inofensivo).
- Cambios de esta ronda: `scrub: true` con Lenis (anatomy, recipe, footer en chrome.js); `will-change` solo mientras dura el tween en reveals, stagger y splits del motor; `sizes` de Hero (72vw) y About studio1 (713px a >=1336px); escena Digital partida en fases con un cuadro entre cada una y primer bake CBCT un panel por cuadro; el disparo por cercania de #digital espera una pausa del scroll (`quiet()`); README al dia (Services anclado, fila Digital, `?digital=3d`, poster, politica de scroll).
- Medicion con sondas CDP sobre `astro preview` (Chrome headless con GPU, rueda real, 1366x820 DPR1, pagina completa):
  - Cuadros > 40 ms en un recorrido completo con cache de shaders de la GPU tibia: antes 1 cuadro de 372-414 ms en `scene.js` (y 1 de ~90 ms en el bake CBCT); ahora 4 cuadros de 55-96 ms, y con una pausa de lectura de 1,8 s la construccion cae dentro de la pausa. Resto de la pagina: ningun cuadro > 45 ms.
  - Con cache de shaders fria (primera visita de un perfil de Chrome) el unico cuadro grande que queda es `PMREMGenerator.fromScene` compilando shaders de forma sincrona: ~840 ms (antes ~1000). No se puede partir desde fuera de three; ver pendientes.
  - Regiones About y Contact: p95 ~11.6 ms, max 14-21 ms; sin diferencia medible entre la build anterior y la nueva (la ganancia de las capas transitorias es del orden del ruido en esta GPU).
  - FAQ: abrir/cerrar mueve los triggers de Contacto (-120 px medidos) por el ResizeObserver del motor; `vd:layout` no hace falta.
- Pendientes de esta ronda (no se hicieron, con motivo):
  - Escena 3D, visita en frio: ~0,9 s de bloqueo por el PMREM. Salidas: moverla a un Worker con OffscreenCanvas (la real), o cambiar el entorno de los metales por matcap (sin PMREM). Decision para el dueño.
  - Salto de scrollHeight 24898 -> 25064 (166 px) a los ~640 ms de la carga, al montarse el pin de Recipe: es antes de que nadie pueda hacer scroll y `restore()` lo reapunta; reservarlo por CSS depende de la altura del viewport y no se hizo.
  - Medios: `tools/media/build.py` (variante 240 px para `ig[]`, 1280 px para `stories.*`, 192 px para el avatar de Education) requiere regenerar imagenes desde `insumos/`.
  - Los `figure[data-reveal=clip]` (About x6, Anatomy, Recipe) siguen con `clip-path` desde JS; en esta GPU no se nota (max 14 ms), en maquinas flojas conviene el patron de dos capas de `contact.js`.
  - Sondas `f1-*` apuntan al modulo de dev (`/src/scripts/engine.js`); las `d3-*` solo sirven contra `dist`/`preview`. Las de `.shots/build/` (stalls, ab3, trace2, checks) usan un perfil de Chrome persistente para medir con cache de shaders tibia.
- Servidores: `astro dev` necesita `--ignore-lock` si ya hay otro en el proyecto. Services ya es vista previa anclada (sticky), con el top centrado en la linea de lectura y sin pista manuscrita; depende de que `main` y sus ancestros tengan `overflow-x: clip` (no `hidden`/`auto`) en `base.css`.

## En curso (2026-10-02 08:40): fluidez + sección Digital. Reunión con Alek este fin de semana
- Feedback del cliente (vía la novia del usuario): falta el lado **tecnológico** (exocad, CBCT, un implante animado en 3D) y le **gusta el dorado**.
  La paleta amber queda como principal. Especificación en `docs/DIGITAL.md`.
- `three@0.186.1` instalado (versión exacta).
- El diagnóstico `wf_fab4eaee-b4d` murió con la sesión anterior sin informes, pero dejó sondas en `tools/qa/probes/` y mediciones en `.shots/diag/`:
  - Jank medido: p95 29.7 ms, máx 303 ms y 122 cuadros > 25 ms en una pasada.
  - #contact es la sección más cara de pintar.
  - El agente d4 dejó escrita la especificación de Services anclado.
- **Workflow actual: `wf_a80d85d1-883`** (`fluidez-y-digital`).
  - Fase 1: 5 áreas de fluidez (f1 a f5) y 2 agentes de Digital (d1 escena 3D, d2 sección).
  - Después: build, 4 verificadores adversariales (v1 a v4), corrección por área y cierre con `docs/FLUIDEZ.md`.
  - Script: `...\workflows\scriptsluidez-y-digital-wf_a80d85d1-883.js`.
  - Si se corta: leer el journal y relanzar solo lo que falte; los archivos de cada área están en el script.
- Todavía NO hacer push: el usuario no quiere presentarlo hasta que esté fluido.

## En curso (15:35, día anterior): fluidez. NO presentar todavía
- El usuario reporta tres cosas: animaciones poco fluidas, saltos repentinos al hacer scroll, y un hover de Services impreciso que no se entiende a la primera.
- Hipótesis iniciales:
  - El `split.revert()` de SplitText cambia alturas a mitad del scroll.
  - Hay refresh tardíos de ScrollTrigger (`recipe.js:83-84`) con el pin de Recipe.
  - El panel de Services trae 0,9 s de lag y deriva en x.
- Decisión del orquestador: Services pasa a **vista previa anclada (sticky)** en vez de perseguir el puntero.
- Workflow de diagnóstico `wf_fab4eaee-b4d` (5 diagnósticos con CDP más un planificador). Las sondas quedan en `tools/qa/probes/`.
  Después viene un workflow de arreglo y verificación, que se relanza a partir de `plan.groups`.

## Publicado (15:25)
- Repo: https://github.com/Diestorn03/visualdental-redesign (público, rama `main`).
- Sitio: https://diestorn03.github.io/visualdental-redesign/. Modo propuesta: noindex y selector de paletas. Pages se publica con GitHub Actions en cada push a `main`.
- Para pasar a producción: variable de repositorio `PUBLIC_DEMO=off` y, si hay dominio propio, quitar `PAGES_BASE` en `deploy.yml`.

## Actualización 15:10: integración terminada
- El workflow `wf_8cff4377-ecd` completó fundación, medios, las 8 secciones y la integración. El sitio está montado, el build es limpio y la verificación está en `docs/QA-INTEGRACION.md`. Cómo correrlo, las dos paletas, el deploy y los pendientes del cliente están en `README.md`.
- Las páginas de kit se borraron. `tools/qa/walk.mjs` y `tools/qa/sheet.py` son nuevos.
- **Falta** (de "Cómo retomar", punto 4): ronda de QA adversarial contra las referencias, revisión con el cliente de las dos paletas, deploy a GitHub Pages con `PUBLIC_DEMO` y video de presentación, como en RenewWater y SSDS. La carpeta aún no es un repositorio git.
- Las capturas finales están en `.shots/final/` y no van a git.
- 15:13 (orquestador): el selector de paleta quedó compacto, abajo a la izquierda, y oculto sobre el hero, porque tapaba CTAs y texto. Build limpio.
  Revisé el recorrido completo (escritorio, móvil y mono) y no encontré nada más roto.
  Siguiente paso, a decidir con el usuario:
  - QA adversarial.
  - Deploy a GitHub Pages: hace falta `git init`, crear el repo y hacer push, con su confirmación.
  - Video de presentación.
  - Pedir a Alek fotos en alta resolución, porque el hero sale de un reel de 720p y se ve algo blando.

## Hecho
- Brief, copy y contrato: `docs/BRIEF.md`, `docs/CONTENT.md`, `docs/CONCEPTO.md`. Análisis de repos: `docs/STACK-PLAYBOOK.md` y `docs/repos/`.
- Decisiones del usuario:
  - Dirección "The Ceramist's Notes" **aprobada**.
  - **Dos paletas** (amber y mono) con `?palette=`.
  - **Formulario simulado** hasta que compren el rediseño.
  - Permiso para descargar fotos de su web, YouTube e IG.
- Insumos descargados en `insumos/`:
  - `web/`: logo y retratos.
  - `youtube/`: 6 mp4 1080p y miniaturas.
  - `ig/reels/`: 10 reels.
  - `ig/frames/`: cuadros y hojas de contacto.

## Actualización 13:45: relanzado tras el límite de uso
- El primer run (`wf_57eae62b-245`) murió por el límite de sesión. Para entonces F0 estaba casi completo y M0 ya había curado todo
  (`tools/media/manifest.py`) y generado brand y loops.
- **Run actual: `wf_8cff4377-ecd`**. Usa el mismo script, con prompts de continuación para F0 y M0 y las fases 2 y 3 iguales.
  Journal: `...\subagents\workflows\wf_8cff4377-ecd\journal.jsonl`.

## En curso al cortar la sesión (run original)
Workflow de construcción `construir-visualdents`:
- Run `wf_57eae62b-245`, lanzado a las 12:42.
- Script: `C:\Users\diegoa.cardozo\.claude\projects\C--Users-diegoa-cardozo-Desktop-Redise-o-VisualDents\99f2f1d2-e2d5-458a-9ebe-7ce374b168dd\workflows\scripts\construir-visualdents-wf_57eae62b-245.js`
- Journal, con un resultado por agente: `...\99f2f1d2-e2d5-458a-9ebe-7ce374b168dd\subagents\workflows\wf_57eae62b-245\journal.jsonl`

Fases:
1. Fundación (F0) y Medios (M0) en paralelo.
2. 8 secciones en paralelo: A1 Chrome, A2 Hero, A3 About, A4 Services, A5 Recipe, A6 Anatomy, A7 Stories y A8 Faq+Contact. Los puertos van de 4331 a 4338.
3. Integrador: build, capturas en `.shots/final`, `README.md` y `docs/QA-INTEGRACION.md`.

## Cómo retomar en una sesión nueva
`resumeFromRunId` solo funciona en la misma sesión, así que hay que mirar el disco.

1. Leer `journal.jsonl` (líneas `"type":"result"`) para ver qué agentes terminaron, y revisar los archivos del proyecto: `src/components/sections/*.astro`, que en un stub son mínimos, `src/data/media.js`, `public/media/` y `README.md`.
2. Matar dev servers colgados (puertos 4320-4340).
3. Copiar el script de arriba, quitar las fases ya completas pasando sus `notes` del journal como contexto, y relanzar solo lo que falta. Si se cortó en Integración, basta con relanzar el integrador.
4. Después:
   - Revisar las capturas.
   - Hacer una ronda de QA adversarial (a11y, rendimiento, responsive, motion contra las referencias).
   - Mostrar el sitio con ambas paletas.
   - Hacer el deploy a GitHub Pages con `PUBLIC_DEMO`.
   - Preparar el video de presentación, como en RenewWater y SSDS.
