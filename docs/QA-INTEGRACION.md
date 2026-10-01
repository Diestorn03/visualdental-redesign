# QA de integración · 2026-10-01

Pasada del integrador sobre las 8 secciones y el chrome ya reales. Todo se midió con Chrome headless por CDP (`tools/qa/`), sobre el dev server (`:4340`, `VITE_CACHE_DIR=.vite-int`) y sobre el build de producción (`astro preview`, `:4341`).

## Resultado

- `npm run build` limpio: 2 páginas (`/` y `/404/`), sin errores ni avisos. Los stubs ya no existen; `src/pages/index.astro` monta las 8 secciones en el orden de CONCEPTO §4. Las páginas de kit (`src/pages/kit/`) se borraron.
- La home tiene 38 ids, ninguno repetido, un solo `h1`, y todos los `href="#…"` resuelven.
- **0 errores y 0 avisos de consola** en las 6 recorridas completas (escritorio, móvil, `--reduced` en ambos, mono y `--calm`) y en las 24 mediciones del audit. 0 respuestas HTTP >= 400.
- **0 desbordes horizontales** de 320 a 2560 px (audit en 12 viewports). A 320 px, `document.documentElement.scrollWidth` vale 320.
- El header cambió de tema sin desajuste en los 168 pasos de las 6 recorridas: en cada paso su tema coincide con el del bloque que tiene debajo.
- Hay una sola escena fijada (Recipe, `#process`) y no compite con nada: las otras escenas con scrub (manifiesto, anatomía, wordmark del footer) no fijan nada y se calculan después del pin.

## Cambios de integración

Cambios mínimos; cada sección conserva su autoría.

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/scripts/engine.js` | `scrollToTarget` aterriza en `scroll-padding-top` + `scroll-margin-top` del destino; con Lenis el desplazamiento por defecto es 0 | Lenis ya resta el padding del `<html>` y el motor lo restaba otra vez: todas las anclas quedaban 88 px más abajo (pedido de A8) |
| `src/scripts/engine.js` | `setCalm()` guarda la posición **antes** de cambiar la clase | Al quitar `html.calm` el CSS recoloca las tiras de Services antes de que pasaran los 200 ms del guardado, y el lector volvía a otra posición |
| `src/styles/base.css` | `main > section[id] { scroll-margin-top: -(header + 16px) }` | Las anclas aterrizan con la sección pegada arriba: el header toma su tema y el padding de la sección lo despeja. Sin esto, 16 px de la sección anterior quedaban visibles bajo el header |
| `src/styles/base.css` | `#services` y `#faq` reducen su `padding-top` (40 % de `--section-y`, mínimo `header + 24px`) | Siguen a otra sección clara (About, Stories) y los dos paddings se sumaban en un hueco de ~340 px (pedido de A3) |
| `src/components/sections/About.astro` | `&nbsp;—` pasa a `<span class="nb">…—</span>` en 3 textos con `data-split` | SplitText envuelve cada palabra y pierde el espacio no separable: la cita de Ola partía en 3 líneas y, al revertir el split, en 4. La página crecía 61 px a media lectura y las anclas posteriores quedaban descuadradas |
| `src/layouts/Base.astro` | Preload del woff2 latin de Oswald | Pedido de A1: marca, nav y botones son Oswald sobre el pliegue |
| `astro.config.mjs` | `vite.server.watch.ignored` para `.shots` y `.vite-*`; el sitemap ya no filtra `/kit` | Pedido de A2: los perfiles de Chrome inundaban el watcher de EBUSY. Ahora 0 errores EBUSY |
| `src/components/chrome/PaletteSwitch.astro` | (Revisión del orquestador) Compacto: dos puntos abajo a la izquierda, oculto sobre el hero en todos los anchos; nombres visibles al hover o foco y siempre accesibles para lectores de pantalla | Abajo al centro tapaba CTAs de varias secciones (p. ej. "Book a lecture or workshop") y en móvil cubría texto |
| `src/scripts/chrome.js` | Alterna `html.past-hero` junto a `has-bar` | Lo lee PaletteSwitch en móvil |
| `src/components/chrome/Footer.astro` | `min-width: 44px` en los enlaces de lista | El audit marcó "FAQ" con 31×44 px |
| `src/components/sections/Anatomy.astro` | Números de anotación de 11.5 a 12 px | El audit marcó texto < 12 px |
| `src/pages/kit/` | Borrada la carpeta; comentarios que la nombraban, limpiados | Eran páginas temporales de prueba de cada agente |
| `tools/qa/walk.mjs`, `tools/qa/sheet.py` | Nuevos | Recorrer la página entera con una captura por paso y montar hojas de contacto. `shoot.mjs` solo captura en objetivos fijos |
| `README.md`, `docs/QA-INTEGRACION.md` | Nuevos | |

## Pedidos de los informes

| Origen | Pedido | Estado |
|---|---|---|
| Fundación | Sustituir los stubs del chrome | Hecho (A1). Header, Footer, ContactFab, PaletteSwitch y Logo reales |
| Fundación | Borrar `src/pages/kit/` y el filtro del sitemap | Hecho |
| Fundación | `media.js` lo importan `index.astro` y las secciones | Hecho: Hero, About, Services, Recipe, Anatomy, Stories, Contact y Logo lo usan |
| Fundación | Conservar `<header data-header>` y `--header-h` | Hecho: el scroll-padding y el aterrizaje de las anclas dependen de ellos |
| Fundación | Build final con `PUBLIC_DEMO=1` | Hecho: `dist/` trae `noindex`, `Disallow: /` y el selector de paleta. Build "real" (`PUBLIC_DEMO=` vacío, `SITE_URL`, `PAGES_BASE=/vd`) comprobado: canonical, og, sitemap, robots y preloads con `/vd`, sin demo |
| Medios | `og` solo para el meta | Hecho: `Base.astro` usa `asset('brand/og.jpg')` |
| Medios | Favicons sin `.ico` ni SVG | Hecho: png 32, 192 y apple-touch |
| Medios | Loops por `.webm` y `.mp4` con póster | Hecho: Services usa `loops.ceramic` con `preload="none"`. `loops.studio` no se usa |
| A1 | Preload de Oswald | Hecho |
| A1 | `data-fab-hide` en secciones con controles propios | No hizo falta: `#contact` y el footer ya ocultan el botón flotante, y las demás secciones solo llevan enlaces a `#contact` |
| A1 | `id="top"` en el hero | Presente |
| A1 | Nadie toca `menu-open`, `has-bar` ni `is-lite` | Cumplido. Se añadió `past-hero`, que vive en `chrome.js` (de A1) |
| A1, A2, A4, A5, A6, A7, A8 | `astro dev --ignore-lock`, `SHOTS_DIR` absoluto | Documentado en el README (sección Verificación) |
| A2 | Ignorar `.shots` y `.vite-*` en el watcher | Hecho |
| A2 | Confirmar que el build resuelve `hero-mesh.svg?raw` | Confirmado: el build lo incrusta |
| A3 | Hueco doble entre secciones claras | Hecho (ver arriba) |
| A5 | Header o botón flotante mientras `#process` está fijado | No hizo falta: el stage reserva `--header-h + 12px` arriba y se ve limpio en las capturas |
| A5 | Alinear el wireframe de Recipe con la malla del hero | No se tocó: los dos son trazo fino ámbar y leen como el mismo dibujo |
| A6 | Dos secciones oscuras seguidas (Recipe → Anatomy) | Se ve bien: las separa una línea fina y el padding |
| A8 | Anclas con Lenis 88 px más abajo | Corregido en el motor (ver arriba) |
| A8 | Contrato de `data-topic` | Comprobado en vivo con Lenis: Hero y FAQ preseleccionan "consultation", Anatomy "education", header y footer "new-case", los canales "support"; el foco cae en `#cf-first` |

## Lo verificado

**Recorridas completas** (`tools/qa/walk.mjs`, 1366×820 y 390×844). Aviso por paso: sección bajo el header, tema del header, botón flotante, CLS, desborde.

| Modo | Pasos | Resultado |
|---|---|---|
| Escritorio, amber | 32 | Lenis activo, pin de Recipe, 0 desajustes de header, CLS 0 |
| Móvil 390, amber | 31 | Sin Lenis ni pin, barra "Call / Send a case" tras el hero, CLS 0 |
| Escritorio `--reduced` | 27 | Sin Lenis ni pin, todo visible, manifiesto iluminado |
| Móvil `--reduced` | 28 | Todo visible |
| Escritorio `?palette=mono` | 27 | Los dos tokens funcionan en todas las secciones |
| Escritorio `--calm` (interruptor) | 23 | Igual que `--reduced` |

**Anclas.** Con Lenis (1366) y con scroll nativo (390), el menú de navegación aterriza con cada sección a `top = 0` y con el header en su tema. Las cargas con hash (`/#education`, `/#process`, `/#faq`, `/#contact`) quedan igual tras el restore del motor, también con la escena fijada por encima.

**Interruptor "Reduce motion".** Activar y desactivar recarga y devuelve al lector a la misma sección y fracción (`services f=0.261` antes y después, en los dos sentidos). Queda `vd-calm` en `localStorage`, `aria-pressed` correcto y Lenis apagado en calm.

**Teclado.** El primer Tab cae en el skip link, el segundo en la marca. El menú móvil (`<dialog>`) abre, cierra y devuelve el foco (A1). Los CTA con `data-topic` mueven el foco al primer campo del formulario.

**Formulario.** Envío vacío: "4 fields need your attention." y 4 campos con `aria-invalid`. Los demás estados (enviando, enviado, reintento) los verificó A8.

**Audit** (`tools/qa/audit.mjs`, producción, 12 viewports de 320 a 2560 px, `/` y `/404/`; `.shots/final/audit-prod.json`):

| Métrica | Resultado |
|---|---|
| Errores de consola y fallos de red | 0 y 0 |
| Desborde horizontal | 0 en los 24 casos |
| Elementos de motion atascados | 0 |
| Imágenes rotas o sin `alt` | 0 y 0 |
| `h1` por página | 1 |
| Enlaces o botones sin nombre | 0 |
| CLS | máximo 0.0014 |
| LCP en la home | 124 a 520 ms (el peor, 320 px; en local) |
| FPS al hacer scroll | mínimo 59.6, peor fotograma 50 ms |
| Targets táctiles < 40 px | 1 ("FAQ" del footer, 31×44): corregido con `min-width: 44px` |
| Texto < 12 px | Etiqueta del selector de paleta y números de anotación (11.2 y 11.5 px): corregidos |

Las 12 mediciones de `/404/` salen limpias (LCP de ~1.1 s).

**Peso** (producción, caché vacía, CDP):

| | Carga inicial | Tras recorrer toda la página |
|---|---|---|
| Escritorio 1366 | 276 KB | 942 KB |
| Móvil 390 | 277 KB | 634 KB |

La carga inicial son 25 KB de HTML, 67 KB de JS, 17 KB de CSS, 132 KB de fuentes y 35 KB de imágenes (todo comprimido). Los videos no se piden hasta pasar el puntero por la fila 05 de Services. `dist/` pesa 16 MB, casi todo el abanico de formatos de `public/media` (cada visitante baja un solo formato por imagen).

**Copy.** Se extrajo el texto visible del build y se cruzó con `docs/CONTENT.md`: no hay texto de marketing, cifras ni reseñas que no estén en él. Lo que no está son etiquetas funcionales (listadas abajo).

## Microcopy funcional que no está en CONTENT.md

Para que el cliente lo apruebe: "Skip to content", "Menu" / "Close", "(opens in a new tab)", "Scroll", "Hover a row to see the work", "Explore education", "Materials" y "Files" (rótulos de las dos listas del cierre de Services), "Watch on YouTube: …", "Frames from our reels. On Instagram:", "Pause" / "Scrolling", "Follow @aleksandra_polczynski", "Select a topic", "Send message", "Required", "Sending…", "Send another message", los mensajes de error del formulario, "This form needs JavaScript. Please call … or write to …", "Open in Google Maps", "Call", "Explore", "Follow", "Legal", "Back to top", "(system setting)" y "Design proposal / Amber / Mono" (solo en la versión de propuesta).

## Capturas finales

Todas en `.shots/final/` (ignorada por git). Nombre: `9340-<d|m><R|C>-home-<palette>-<paso>-<sección>-y<scroll>.png`; `d` escritorio 1366×820, `m` móvil 390×844, `R` = `--reduced`, `C` = `--calm`.

| Recorrida | Capturas | Hojas de contacto |
|---|---|---|
| Escritorio amber | `.shots/final/9340-d-home-paletteamber-*.png` (32) | `.shots/final/sheets/d-00.png` … `d-05.png` |
| Móvil amber | `.shots/final/9340-m-home-paletteamber-*.png` (31) | `sheets/m-00.png` … `m-07.png` |
| Escritorio `--reduced` | `.shots/final/9340-dR-home-paletteamber-*.png` (27) | `sheets/dR-00.png` … |
| Móvil `--reduced` | `.shots/final/9340-mR-home-paletteamber-*.png` (28) | `sheets/mR-00.png` … |
| Escritorio mono | `.shots/final/9340-d-home-palettemono-*.png` (27) | `sheets/dMono-00.png` … |
| Escritorio `--calm` | `.shots/final/9340-dC-home-paletteamber-*.png` (23) | `sheets/dC-00.png` … |

Además: `walk-*.log` (la salida de cada recorrida), `audit-prod.json` y `audit-prod.log`, y `.shots/final/audit/` con una captura de página completa por viewport.

## Pendiente y límites

- **Solo Chrome.** No se probó Safari ni Firefox, ni dispositivos reales. Falta una pasada con lector de pantalla y una pasada solo con teclado de toda la página (cada agente probó su sección).
- **El interruptor de paleta no está probado en táctil real**; el selector se probó con puntero y con la emulación táctil de Chrome.
- **Hover en táctil:** el panel de Services solo existe con puntero fino (en táctil, foto en línea bajo cada fila). La marquesina de Stories se pausa por hover solo donde hay hover; en táctil queda el botón "Pause".
- **YouTube:** en headless no arranca el autoplay tras el clic (política del navegador); el iframe sí carga. Falta verlo en un navegador normal.
- **Rendimiento con GPU real y CPU lenta:** el audit y las mediciones de A5 usan SwiftShader. A5 midió 47 fps en la escena fijada con la CPU ×4.
- **Contraste:** se calculó para los pares de tokens (mínimo 5.35:1). No se midió píxel a píxel sobre cada foto; A2 lo hizo para el texto del hero.
- **Material del cliente** (ver README, "Pendiente de confirmar"): fotos en alta resolución, SVG del logo, consentimiento de pacientes, canal de YouTube, destino del formulario, dominio y portal "Sign in".
- **Límites de las fotos** (docs/MEDIA.md): la del hero es de 1440 px, `recipe.digital` es la más débil, `services.printing` es un escáner y el loop de cerámica no es continuo (salto cada ~4.5 s mientras se mantiene el hover).
- **Próximos pasos** (docs/ESTADO.md): ronda de QA adversarial contra las referencias, revisión con las dos paletas, deploy a GitHub Pages con `PUBLIC_DEMO` y video de presentación.
