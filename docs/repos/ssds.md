# Informe ssds (C:\Users\diegoa.cardozo\Desktop\ssds-proyectos)

# Informe de análisis: `ssds-proyectos` (SSD&S C.A.), solo lectura

Repo: `C:\Users\diegoa.cardozo\Desktop\ssds-proyectos`. Rutas relativas a esa raíz. No ejecuté install, build ni dev.

Tres hechos sobre lo que existe y lo que no:
- No hay `README.md`.
- No hay `CLAUDE.md`, skills ni settings. `.claude/` solo contiene `launch.json` (servidor `astro-dev` en el puerto 4321).
- "Rediseño RenewWater", la referencia de calidad del dueño, no está en este repo (`docs/CONCEPTO.md:5`, `docs/CONTINUAR-EN-CASA.md:14`).

## 1. Stack y versiones exactas

Versiones tomadas de `node_modules/*/package.json`. Dependencias en `package.json:11-24`.

| Pieza | Versión | Uso |
|---|---|---|
| astro | 7.3.5 | SSG, `ClientRouter` (View Transitions) |
| @astrojs/sitemap | 3.7.4 | sitemap solo si hay `SITE_URL` |
| gsap | 3.15.0 | ScrollTrigger, SplitText, DrawSVGPlugin, MotionPathPlugin (`engine.js:31-38`) |
| lenis | 1.3.26 | scroll suave solo en desktop |
| sharp | 0.34.5 | declarado, pero ningún código lo importa (ver §6) |
| @fontsource-variable/sora, inter, jetbrains-mono | 5.3.0 | fuentes variables |
| topojson-client 3.1.0, world-atlas 2.0.2 | devDeps | solo para `tools/venezuela-map.mjs` |

- Node 22 en CI (`.github/workflows/deploy.yml:26-29`).
- Sin Tailwind, sin React ni islas de framework, sin librería de UI.
- TypeScript solo laxo dentro de los `.astro` (`tsconfig.json` extiende `astro/tsconfigs/base`). No hay `astro check`, lint ni prettier.
- El JS es vanilla ES modules (`src/scripts/*.js`).
- Todo el GSAP va en un solo bundle: `dist/_astro/engine.*.js` pesa 175 KB sin comprimir y se carga en todas las páginas. `client.*.js` (ClientRouter) pesa 12 KB.

## 2. Arquitectura

```
src/
  layouts/Base.astro              head, SEO, JSON-LD, fuentes, Loader/Header/Footer/Línea/FAB, importa engine
  pages/  index, nosotros, contacto, diagnostico, 404, robots.txt.ts, servicios/{index,[slug]}
  components/
    chrome/ Header, Footer, Loader, Linea, Logo, WhatsAppFab
    home/   Hero, Tablero, Transferencia, Diagnostico, Cobertura, Recorrido, Valores, Instagram
    pages/  PageHero, HeroFx, Proceso, PostStrip, OtrosServicios
    ui/     Cta, Icon, Lightbox
  scripts/  engine.js, chrome.js, + 1 controlador por escena, hero/campo.js (WebGL)
  data/     site.js (contenido), diagnostico.js (+ .check.mjs), venezuela.js (GENERADO)
  styles/   base.css (tokens + helpers), transitions.css (View Transitions)
```

**Cómo se construyen las páginas**
- Cada página es `<Base title=...>` más componentes-escena.
- `src/pages/index.astro:17-51` apila las secciones: Hero, Tablero, Transferencia, Diagnóstico, Cobertura, Recorrido, Valores, FAQ, Instagram y Cta. Alterna `data-theme` dark/light a propósito.
- `servicios/[slug].astro` usa `getStaticPaths()` sobre `services`.
- Las escenas se reutilizan en modo estático: `<Tablero mode="static"/>` y `<Transferencia mode="static"/>`.
- Cada componente lleva su `<style>` con alcance de componente y su `<script>`. El script hace `onPage(fn)` y devuelve una función de limpieza (contrato en `docs/CONCEPTO.md:48-54`).

**Contenido**
- Todo vive en `src/data/site.js` (marca, contacto, `wa()`, nav, `services`, `process`, `values`, `sectors`, `faqs`, `claims`, `posts`).
- No hay content collections ni CMS.
- Los hechos no confirmados llevan un comentario "confirm with client".
- `data/diagnostico.js` son reglas puras sin DOM, con autoprueba en `diagnostico.check.mjs`.
- `data/venezuela.js` es generado por `tools/venezuela-map.mjs`.

**i18n**: no hay. Es un solo idioma, `<html lang="es">` (`Base.astro:48`), y `og:locale es_VE`.

**Base path**
- `astro.config.mjs:8-9` define `site = SITE_URL || undefined` y `base = PAGES_BASE || '/'`. También `trailingSlash: 'always'`.
- Sin `SITE_URL` no se emiten canonical, `og:url` ni sitemap absolutos. Es intencional.
- Cada componente repite `const base = import.meta.env.BASE_URL.replace(/\/$/, '')` (unas 15 veces) y arma `${base}/ig/...`. No hay helper.
- Las imágenes de `public/` y los enlaces internos deben prefijarse a mano.

## 3. Sistema de diseño

Archivo principal: `src/styles/base.css`. Tokens esenciales (líneas 6-78):

```css
:root {
  --navy-950:#060d1f; --navy-900:#0b1a3a; --navy-800:#10244f; --navy-700:#1a3468; --navy-600:#25488a;
  --orange-600:#d95a12; --orange-500:#f26a1b; --orange-ink:#c94f0c; /* blanco sobre este = 4.56:1 */
  --orange-400:#ff7d33; --orange-300:#ff9c5c; --amber-400:#ffb454; --glow:#ffd79a;
  --paper:#f4f6fb; --paper-2:#e9edf5; --ink:#0b1a3a; --ink-2:#3a4a6b; --line-light:#d6dce8;
  --wa:#25d366; --ok:#3ddc84; --danger:#ff5c5c;
  --grad-brand: linear-gradient(90deg,#f26a1b 0%,#ff9c5c 45%,#ffd79a 100%);
  --grad-streak: linear-gradient(90deg,transparent,rgba(255,156,92,.6) 18%,#ffd79a 50%,rgba(255,125,51,.7) 82%,transparent);
  /* semánticos (oscuro por defecto) */
  --bg:var(--navy-900); --bg-2:var(--navy-800); --fg:#f4f6fb; --muted:#a9b6cf; --accent:var(--orange-500);
  --accent-text:var(--orange-300); --line:rgba(255,255,255,.1); --card:rgba(255,255,255,.04); --focus:var(--amber-400);
  --font-display:'Sora Variable',system-ui,...; --font-body:'Inter Variable',...; --font-mono:'JetBrains Mono Variable',...;
  --header-h:72px (64px <768); --bar-h:60px; --container:1200px; --gutter:clamp(16px,4vw,40px);
  --section-y:clamp(72px,10vw,140px); --radius:14px; --radius-lg:24px; --r-pill:999px;
  --ease-out:cubic-bezier(.16,1,.3,1); --ease-in-out:cubic-bezier(.65,0,.35,1); --ease-spring:cubic-bezier(.34,1.56,.64,1);
  --d-fast:.2s; --d-base:.45s; --d-slow:.9s;
  --step--1:clamp(.8rem,.78rem+.15vw,.9rem); --step-0:clamp(1rem,.95rem+.25vw,1.125rem);
  --step-1:clamp(1.2rem,1.08rem+.55vw,1.5rem); --step-2:clamp(1.5rem,1.2rem+1.2vw,2.1rem);
  --step-3:clamp(2rem,1.45rem+2.4vw,3.2rem); --step-4:clamp(2.6rem,1.6rem+4.2vw,5rem);
  --step-5:clamp(3.2rem,1.6rem+7vw,7.6rem); --step-6:clamp(4rem,1.5rem+10vw,11rem); --fs-bleed:22vw;
}
```

**Tema oscuro y claro**
- No hay toggle ni `prefers-color-scheme`. El tema es por sección: `[data-theme='light'|'dark']` redefine `--bg/--fg/--muted/--line/--card/--accent-text/--focus` (`base.css:81-107`).
- El `<html>` arranca en `data-theme="dark"`.
- El header toma el tema de la sección que tiene debajo con un `IntersectionObserver` (`chrome.js:111-119`).
- El logo y el color de los botones usan `--logo-b` y `--btn-bg`, que cascada con el tema.
- `prefers-contrast: more` apaga los blur y pone el borde en `currentColor` (`base.css:108-111`).

**Tipografía**
- Sora (títulos, 700/800, `letter-spacing -0.03em`, `text-wrap: balance`), Inter (texto) y JetBrains Mono (etiquetas `.eyebrow`, `.mono`, `.disclaimer`).
- Se cargan con `@fontsource-variable/*/wght.css` importado en `Base.astro:3-5`.
- Se hace preload del woff2 latin de Sora e Inter (`Base.astro:59-60`). JetBrains Mono no se precarga.
- Escala fluida `--step--1` a `--step-6`.

**Espaciado, grid y contenedores**
- `.container` y `.wrap`: `width: min(100% - 2*gutter, 1200px)`.
- `.section` usa `padding-block: var(--section-y)` con `isolation: isolate`.
- `.grid--2/3/4` desde 720 px.
- El hero amplía el contenedor a 1480 px (≥1600) y a 1840 px (≥2200) (`Hero.astro` ~línea 200).
- Los botones miden 52 px (48 px en móvil), con área táctil ≥44 px.

**Componentes CSS base**
- `.btn` con variantes `--primary/--ghost/--white/--wa/--text/--sm`. El primary lleva barrido de brillo en `::after`.
- `.chip` es un label con input nativo y estilo vía `:has(input:checked)`.
- `.card` con tilt y glow por puntero. Los `--gx/--gy` están registrados con `@property` como no heredables (`base.css:256-258`) para que escribirlos no restilice todo el subárbol.
- `.glass`, `.pill`, `.streak` (el motivo de marca: rayo diagonal) y `.bleed-word` (palabra gigante en contorno).
- Pre-hide solo con `html.js` y un failsafe CSS de 4 s si el motor no arranca (`base.css:281-286`).

## 4. Sistema de motion

**Inicialización**
- Un solo `src/scripts/engine.js`, importado desde `Base.astro:85-87`. Registra los 4 plugins de GSAP.
- Los scripts de cada escena llaman `onPage(fn)`. `fn` recibe `{gsap, ScrollTrigger, SplitText, env, lenis, scrollTo, introGate, emit, onRefresh, getLenis, markLite}` (`engine.js:95-109`).
- Todo corre dentro de un `gsap.context` que se revierte al navegar (`teardown` en `engine.js:352-360`).
- El motor arranca en `astro:page-load`, se desmonta en `astro:before-swap` y reinicia al cambiar el media query desktop (`engine.js:394-400`).
- Con loader, el motor arranca debajo de la cortina (`start()`, `engine.js:385-393`). Las escenas que deben esperar usan `introGate()`.

**Lenis** (`engine.js:119-130`)
- `new Lenis({lerp:0.12, smoothWheel:true})`, solo en `env.desktop`.
- Se sincroniza con `lenis.on('scroll', ScrollTrigger.update)` y `gsap.ticker.add(lenisRaf)`, con `lagSmoothing(0)`.
- Se destruye si cambia el media query.
- Los anclas `#id` pasan por `scrollTo` con offset del header (`engine.js:132-142`).
- El lightbox y el menú hacen `lenis.stop()` y `start()`. El `<dialog>` lleva `data-lenis-prevent`.

**Gates** (`engine.js:40-64`)
- `env.desktop = (min-width:768px) and (pointer:fine) and (prefers-reduced-motion:no-preference)`. Pone `html.is-desktop-fx`.
- `env.reduced`, `env.coarse`, `env.mobile`.
- `env.lite`: ≤2 hilos, ≤2 GB, ≤4 hilos y ≤4 GB, o Save-Data. Es dinámico: una escena llama `markLite()` y queda guardado en `sessionStorage`.
- WebGL y canvas pesado solo con `desktop && !lite`.
- Pins, scrub, Lenis, tilt y magnético solo en desktop.

**Política de reduced-motion**
- Estado final estático, sin loader, sin Lenis, sin pins y sin WebGL.
- Los reveals fuerzan `opacity:1`.
- CSS global: `animation-duration: .01ms !important` (`base.css:295-299`).
- View Transition con fundido de 150 ms.
- Las marquesinas pasan a lista envuelta (`base.css:274-278`).

**Helpers declarativos** (`engine.js:3-14`). Usos contados en el repo: `data-reveal` 45, `data-split` 13, `data-tilt` 7, `data-magnetic` 11, `data-draw` 13.

| Efecto | Dónde | Cómo funciona |
|---|---|---|
| `data-reveal=up/down/left/right/scale/blur/clip/drop/iris` | `engine.js:145-168` | `gsap.fromTo` con `ScrollTrigger once` a `top 88%`. `clip`, `drop` e `iris` animan `clip-path`. `data-delay` y `data-start` ajustan. |
| `data-stagger` | `engine.js:163-167` | Los hijos entran con `y:44→0`, `expo.out`. |
| `data-split=chars/words/lines` | `engine.js:171-184` | SplitText con máscara de líneas, tras `document.fonts.ready` (tope 900 ms). En táctil, `chars` degrada a `words`. |
| `data-lit` | `engine.js:185-192` | Palabra por palabra de opacidad 0.22→1 con scrub, en el titular de convicción. |
| `data-parallax` y `data-depth` | `engine.js:195-207` | `yPercent` con scrub. Solo desktop. |
| `data-count` | `engine.js:210-220` | Contador con `toLocaleString('es-VE')`, `once`. |
| `data-draw` y `data-draw=scrub` | `engine.js:223-233` | DrawSVG de todos los trazos del SVG. |
| `.stack-card` | `engine.js:236-245` | Pila de tarjetas: la anterior se encoge y se atenúa con scrub. Solo desktop. |
| `.marquee` reactiva al scroll | `engine.js:253-298` | Web Animation en el compositor. El scroll sube `playbackRate` (hasta ~24×) con un ticker que se retira al quedar quieto. Se pausa con IO fuera de pantalla. |
| `data-tilt`, `data-magnetic`, `data-glow` | `engine.js:302-330` | `quickTo` para rotación 3D, atracción máxima 8 px y spotlight por rAF. `AbortController` para limpiar. Solo desktop. |
| `[data-offscreen]` | `engine.js:343-349`, `base.css:292` | Pausa las animaciones CSS infinitas de secciones a más de 100 % de viewport. |

**Efectos firma por archivo**

*Chrome (`src/components/chrome/`, `src/scripts/chrome.js`)*
- **Loader "El Arranque"** (`Loader.astro`): una vez por sesión, solo transform y opacity.
  - Las dos mitades del hexágono giran y entran, una chispa recorre el contorno (`cqw`), el wordmark se destapa con un telón naranja, cruza el rayo y la cortina sube. Dura ~1.5 s.
  - Hay botón "Saltar" y Esc.
  - Sale cuando terminó la animación y el motor emitió `ssds:ready`, con tope de 2.8 s (script inline en `Loader.astro:194-234`). Emite `ssds:loader-done` con `{x,y}`.
- **"El Arco"** (`styles/transitions.css:8-24`): la página nueva se abre en `clip-path: circle()` desde el punto del clic (`--vt-x/--vt-y`, `chrome.js:12-34`), 0.65 s. El header y el FAB tienen su propio grupo de transición.
- **Header** (`chrome.js:84-122`, `Header.astro`): cristal tras 40 px, se oculta al bajar tras 400 px y reaparece al subir, tema por sección. Persiste con `transition:persist`. Menú móvil como `<dialog>` que se abre en círculo desde el botón.
- **La Línea** (`Linea.astro`, `chrome.js:172-251`): hilo SVG por el margen izquierdo (≥1024 px, puntero fino) con curvas S cada ~820 px. La punta se interpola con `quickTo`. Usa una tabla de longitud de arco propia (`PER_SEG=32`) en vez de `getPointAtLength` (≈3 ms por frame).
- **Pie** (`Footer.astro`, `chrome.js:254-293`): un hilo entra al isotipo, que se dibuja. Wordmark "SSD&S" gigante cuyo relleno de gradiente avanza con el scroll (rect con `translateX` dentro de un `clipPath` de texto).
- **FAB WhatsApp y barra móvil** (`WhatsAppFab.astro`, `chrome.js:125-169`): aparecen pasado el héroe y se ocultan en `[data-fab-hide]`. El anillo pulsa solo con `.is-shown`.

*Home*
- **Hero "Alta Tensión"** (`Hero.astro`, script en líneas 403-673):
  - Póster CSS y SVG con 12 líneas de campo generadas en build (Catmull-Rom → Bézier, líneas 26-39) y un paquete de corriente en el rayo.
  - Lente-medidor sobre el H1: copia del título con gradiente y `clip-path: circle()` que sigue al puntero (`quickTo`). El H1 blanco recibe un agujero con `mask-image` (líneas 436-500). En táctil hay un barrido guionado sobre "confiable".
  - Intro por caracteres con SplitText tras `introGate`. Los trazos se dibujan con DrawSVG.
  - Muro 3D de 14 posts de Instagram en 3 columnas con parallax de puntero. Debajo de 1024 px o en vertical son 2 filas en deriva (banda).
  - **Pin +100 %** desde 1024 px en horizontal (línea 618, `scrub:0.6`): el campo se calma, el título sube y se desenfoca con crossfade a una copia ya desenfocada, y aparece palabra a palabra "¿Tu energía está protegida?".
  - **WebGL "campo eléctrico"** (`scripts/hero/campo.js`): WebGL1 crudo, un triángulo a pantalla completa, GLSL propio. Corre a media resolución y DPR ≤1, se carga con `import()` dinámico en `requestIdleCallback` y se degrada solo si hace <22 fps sostenidos (`markLite()`). Los clics lanzan una onda.
- **Tablero** (`Tablero.astro`, `scripts/tablero.js`): servicios como tablero de distribución.
  - **Pin +220 %** con `pinType:'transform'` (`tablero.js:185`).
  - Una puerta gira, cada breaker baja a ON con un "clack" CSS, su circuito se dibuja con DrawSVG, una chispa lo recorre con MotionPath y una aguja analógica sube.
  - Los estados discretos son clases conmutadas por umbral (`A=[0.16,0.4,0.64]`).
  - Timeline precalentado (`tl.progress(1,true).progress(0,true)`, línea 207).
  - Táctil: tablero sticky más tarjetas, con IO como disparador.
  - Foco por teclado: `focusin` salta a su etapa.
- **Transferencia (ATS)** (`transferencia.js`): un timeline maestro de 13.5 s con fases `PHASES` que escriben `data-*` sobre la figura.
  - **Pin +200 %**, `scrub:0.4` (línea 170).
  - Cuenta la historia red OK → falla → manual (un operador camina por un `motionPath`) → rebobinado → ATS.
  - Táctil: se reproduce una vez a 1.9× con botón "Repetir".
  - Lleva el rótulo "Simulación ilustrativa".
- **Diagnóstico** (`scripts/diagnostico.js`, `data/diagnostico.js`): cuestionario de 4 pasos con chips nativos y medidor analógico con aguja que hace resorte. Entrega servicios recomendados y un mensaje de WhatsApp prellenado. `aria-live` para el resultado. También es la landing `/diagnostico/` del link en bio.
- **Cobertura** (`cobertura.js`): silueta de Venezuela con 11 rutas DrawSVG desde Maracay, chispa por MotionPath, pings, y una matriz de puntos que se ilumina por alcance. Scrub con la columna de texto (≥1024 px, línea 227) o una sola pasada. Sonda de coordenadas y tilt con puntero. Selector de estado que arma el mensaje de WhatsApp. Contadores 23/3/4.
- **Recorrido** (`recorrido.js`, `Recorrido.astro:465`): scroll horizontal con el stage en `position: sticky` por CSS (no ScrollTrigger pin).
  - Un `gsap.to([track,intro])` con scrub mueve el track. `render(p)` calcula la punta de un cable que se llena, ramas que "conectan" cada estación y un HUD "Etapa 0X / 04".
  - Parallax interno con `containerAnimation`.
  - El catch-up del scrub se acelera 4× fuera de rango para no cruzarse con la sección siguiente.
  - Táctil: fila con scroll-snap y IO.
- **Valores** (`Valores.astro`, script en líneas 126-241): palabra "POTENCIA" cuyo relleno diagonal sigue la variable `--p` (0 a 100) con scrub. Pila de 4 tarjetas sticky con `.stack-card`, que se encienden con DrawSVG y un LED en el índice lateral.
- **FAQ** (`index.astro:36-44`): `<details name="faq">` nativo con `::details-content` e `interpolate-size`.
- **Instagram** (`Instagram.astro`, script en líneas 116-241):
  - `ScrollTrigger.batch` hace entrar cada tarjeta ("power on": sube, un rayo la cruza, el velo se levanta).
  - Una ola de rayo cruza la grilla cada ~6.5 s.
  - Dos profundidades de parallax en desktop.
  - "Ver las 14" espera `img.decode()` (máx. 450 ms) antes de animar.
  - Lightbox `<dialog>` con morph FLIP desde la miniatura, swipe y teclado (`scripts/lightbox.js`).
  - Sin JS, las tarjetas son enlaces a Instagram.

*Interiores*
- **HeroFx** (`components/pages/HeroFx.astro`): rejilla, glows, trazas DrawSVG, 3 rayos que se disparan y llevan pulsos en compositor, y salida con scrub.
- **PageHero**: entrada solo CSS (la LCP no espera al JS).
- **PostStrip**: scroll-snap más barra de progreso con `animation-timeline: scroll()` bajo `@supports`.
- **404** (`404.astro`): un breaker SVG disparado que se "restablece" al pasar el ratón o al enfocar.

**Efectos que NO existen en el repo**: cursor personalizado y video.

## 5. Catálogo de componentes

**chrome/**
- `Header`: barra fija con glass, tema por sección, menú `<dialog>` circular.
- `Footer`: pie con hilo y wordmark gigante.
- `Loader`: intro de primera visita, solo compositor.
- `Linea`: hilo decorativo que se dibuja con el scroll.
- `Logo`: aproximación vectorial del isotipo hexagonal en 3 variantes. Aviso en el código: sustituir por el vector oficial.
- `WhatsAppFab`: FAB más barra móvil "Llamar · WhatsApp".

**home/**
- `Hero`: escena 1 con campo WebGL, muro de posts y lente.
- `Tablero`: servicios como tablero con pin.
- `Transferencia`: simulación ATS con timeline.
- `Diagnostico`: cuestionario más medidor a WhatsApp.
- `Cobertura`: mapa nacional con rutas.
- `Recorrido`: proceso en 4 estaciones.
- `Valores`: valores en pila de tarjetas.
- `Instagram`: feed de posts con lightbox. Prop `limit`.

**pages/**
- `PageHero`: hero interior con migas, acento de gradiente y slots `actions/aside/bottom`.
- `HeroFx`: fondo decorativo del hero interior.
- `Proceso`: cable con estaciones. `layout="row|column"`.
- `PostStrip`: tira horizontal de posts relacionados.
- `OtrosServicios`: tarjetas de enlace con icono DrawSVG.

**ui/**
- `Cta`: bloque de contacto con rayos, WhatsApp, teléfono y correo.
- `Icon`: set inline de 29 iconos stroke-based (24×24, `currentColor`).
- `Lightbox`: marcado y estilos del visor `<dialog>`.

## 6. Pipeline de assets

- **Imágenes**: 14 posts reales en `public/ig/<code>.webp` (640×811) y `<code>-320.webp`. Total 599 KB entre los 28 archivos.
  - No se usa `astro:assets`, ni `<Image>`, ni `<Picture>`, ni AVIF.
  - `srcset` y `sizes` van a mano en `Hero.astro:15-17` y en `Cobertura`, `servicios/index` y `PostStrip`.
  - `sharp` está instalado (lo usa por defecto el servicio de imágenes de Astro) pero no hay ninguna llamada.
  - Los `-320.webp` los generó un script ad hoc que no está en `tools/` (commit `dad7c53`).
  - El LCP del hero usa `loading="lazy"` y `fetchpriority="low"` en el muro. El LCP real es texto (`p.lead`).
- **Video**: ninguno. Los reels se muestran como su fotograma de portada con insignia.
- **Fuentes**: `@fontsource-variable` con `wght.css`.
  - Eso empaqueta todos los subsets (latin, latin-ext, cyrillic, greek, vietnamese) en `dist/_astro/` (~400 KB de woff2). El navegador solo descarga los que usa por `unicode-range`.
  - Solo se precargan Sora e Inter en latin.
- **Íconos**: sprite inline (`Icon.astro`, 29 glifos, todos con `aria-hidden`). Los glifos extra van locales (`Diagnostico.astro`).
- **Favicons y OG**:
  - `public/favicon.svg` (684 B, hexágono sobre fondo navy).
  - `public/apple-touch-icon.png` (180×180).
  - `public/og.png` (1200×630, 80 KB), una sola imagen para todas las páginas (`image = '/og.png'`, `Base.astro:26`).
  - No hay `manifest.webmanifest`.
- **Mapa**: `data/venezuela.js` generado por `tools/venezuela-map.mjs`. Lo generado trae su cabecera "do not edit".

## 7. SEO, accesibilidad y performance

**Bien hecho**
- **SEO** (`Base.astro`):
  - `<title>` por página, `description`, canonical condicionado a `SITE_URL`, OG completo (title, description, type, url, image con tamaño, locale) y `twitter:card`.
  - JSON-LD `['Electrician','HVACBusiness']` con teléfono, email, dirección, `areaServed` y `sameAs` (líneas 32-45).
  - `robots.txt` dinámico (`pages/robots.txt.ts`): `Disallow: /` en modo demo, y sitemap solo si hay `SITE_URL`.
  - `noindex` en el 404 (prop `noindex`).
- **Accesibilidad**:
  - Skip link, `lang="es"`, un `<h1>`, `aria-labelledby` en cada sección, `:focus-visible`, `.sr-only`.
  - `<dialog>` nativo para menú y visor (focus trap y Esc gratis).
  - Los SVG y canvas decorativos van `aria-hidden` y tienen equivalente en texto.
  - Foco por teclado en escenas pinneadas: salta a su etapa (`tablero.js:229-233`, `recorrido.js:166-177`). El FAB oculto no es enfocable.
  - Área táctil ≥44 px en táctil.
  - Todo aplica `prefers-reduced-motion` (53 menciones en `src/`).
  - Sin JS, todo se ve (los pre-hide solo con `html.js`).
- **Performance** (`docs/AUDITORIA.md`):
  - CLS 0.000 en todas las páginas medidas, y LCP del home de 1.62 s en desktop y 1.19 s en móvil.
  - 72–101 fps en todas las secciones a 1366×768.
  - Pausa de CSS infinito fuera de pantalla, marquesinas en el compositor, timelines precalentados, `will-change` solo durante el pin, IO para parar canvas y loops.
  - Medición con CPU ×4: scenes pinneadas bajan a ~21–24 fps.

**Lo que falta o queda abierto** (parte lo reconoce `AUDITORIA.md:167-189`)
- **Contraste AA**: el eyebrow naranja sobre claro da 3.6–3.9:1. El texto blanco sobre botón naranja se resolvió con `--orange-ink`.
- **CLS de carga 0.008** en `/servicios/` por el cambio de fuente: faltan métricas de fuente de respaldo (`size-adjust`) y precarga de JetBrains Mono.
- **Imágenes**: sin AVIF ni pipeline de build, `og.png` único, sin OG por página, sin `twitter:image` ni `og:site_name`, sin manifest.
- **Verificación incompleta**:
  - No se corrió el build de producción en la auditoría.
  - No hay pruebas en dispositivos reales, Safari, Firefox ni lector de pantalla.
  - No hay Lighthouse.
- **Páginas y tooling**: sin test runner, sin lint, sin `astro check`, sin CI de QA. Las únicas pruebas son `diagnostico.check.mjs` y las herramientas CDP en `tools/qa/`.
- **Peso**: bundle de motor de 175 KB en todas las páginas, y CSS por escena grande (Tablero 44 KB, Transferencia 40 KB, `index` 97 KB). Hay una duplicación visible: los mapas `icons`/`svcIcon` por servicio se repiten en 4 archivos.
- **Safari**: `animation-timeline` y `interpolate-size`/`::details-content` están bajo `@supports`, pero no hay verificación cruzada de navegadores.

## 8. Deploy

`.github/workflows/deploy.yml`:
- Dispara en push a `main` y en `workflow_dispatch`.
- Pasos: `checkout@v4`, `configure-pages@v5` (con `enablement: true` y `continue-on-error`), `setup-node@v4` (Node 22, caché npm), `npm ci`, `npm run build`, `upload-pages-artifact@v3` con `path: dist`, y job `deploy` con `deploy-pages@v4`.
- Variables de build:
  - `SITE_URL: https://${{ github.repository_owner }}.github.io`
  - `PAGES_BASE: /${{ github.event.repository.name }}`
  - `PUBLIC_DEMO: ${{ vars.PUBLIC_DEMO || '1' }}`: noindex más cinta "propuesta de sitio web · demo" en el pie (`Footer.astro:81`). Poner la variable del repo en `""` al pasar a producción.
- Con dominio propio se quita `PAGES_BASE`.
- No hay `vercel.json`.
- Aviso para Windows con Git Bash: anteponer `MSYS_NO_PATHCONV=1` a los comandos con rutas `/...` (`docs/CONTINUAR-EN-CASA.md:81`).
- Los comandos de build y preview de producción están documentados en `docs/CONTINUAR-EN-CASA.md:82-87`.

## 9. `tools/`

- `tools/venezuela-map.mjs`: se corre una vez. Lee `world-atlas/countries-50m.json`, extrae Venezuela con `topojson-client`, la proyecta (equirectangular con x×cos 7°, K=72), traza la Zona en Reclamación recortada con el Esequibo a mano, calcula arcos a 11 ciudades y las 24 capitales, y escribe `src/data/venezuela.js`.
- `tools/qa/shoot.mjs`: Chrome headless por CDP crudo. Capturas y errores de consola.
  - Objetivos: `#id`, `#id!`, `#id@N` (N cuadros a lo largo de una escena pinneada) y `js:<expr>`.
  - Flags: `--reduced`, `--lite`, `--intro`, `--w`, `--h`, `--port`.
- `tools/qa/perf-section.mjs`: traza el scroll por una sección. Da fps, peor frame, ms por fase (Layout, Paint, Layerize...), los nodos que más repintan y el JS más caro. Acepta `--cpu=4`.
- `tools/qa/audit.mjs`: auditoría responsive por lotes en 12 viewports (320 a 2560). Mide desbordes, áreas táctiles, textos pequeños, reveals trabados, imágenes rotas o sobredimensionadas, LCP, CLS, fps y errores.
- `tools/qa/deep-audit.workflow.js`: flujo de agentes en 4 fases: 10 auditores (9 áreas más 1 transversal), 9 correctores, 9 verificadores independientes y una regresión final. Usa `ROOT` fijo (línea 17) y esquemas JSON de salida. Todos comparten un bloque `COMMON` con las reglas y rutas.
- Todos los scripts de `tools/qa/` dependen de `C:/Program Files/Google/Chrome/Application/chrome.exe` y guardan salidas en `%TEMP%/ssds-shots` (o `SHOTS_DIR`).

## 10. Convenciones de trabajo

**No hay reglas de agente en `.claude/`.** Las convenciones viven en `docs/`:
- `docs/BRIEF.md` (59 líneas) es la **única fuente de datos**. Estructura:
  1. Fuente y regla ("contenido REAL, extraído de sus publicaciones. No inventar cifras").
  2. Identidad (nombre legal, tagline, frases de marca, logo, paleta real, tipografía de sus piezas).
  3. Ubicación y contacto.
  4. Portafolio literal.
  5. Promesas y valores literales.
  6. Lista de los 14 posts con código, fecha y primera línea.
  7. "Lo que NO sabemos (confirmar con cliente)".
  8. Requerimientos del sitio del usuario (stack incluido).
- `docs/CONCEPTO.md` (54 líneas) cubre el concepto "Corriente Viva", la **tabla de gates**, el catálogo de escenas con propietario y los **contratos técnicos**. Es la plantilla de método más reusable:
  - Una escena es un componente con `<style>` y `<script>` que registra `onPage` y sale si su raíz no está.
  - Pins con `anticipatePin` e `invalidateOnRefresh`. Medir en el refresh, nunca en el scroll.
  - Solo animar transform, opacity, clip-path y variables CSS.
  - DPR de canvas limitado, y parar canvas fuera de pantalla.
  - Cada sección con `id`, `data-theme` y `aria-labelledby`.
  - Verificación: build limpio, capturas, consola limpia.
- `docs/CONTINUAR-EN-CASA.md`: traspaso entre máquinas (qué es el proyecto, qué quiere el usuario, estado, bug visto en el video, hallazgos medidos, cómo preparar la PC, herramientas, cómo cerrar).
- `docs/AUDITORIA.md`: informe final con método, tablas antes/después, qué se corrigió y "Lo que queda (honesto)".
- `docs/auditoria/notas-parciales.md`: notas rescatadas de transcripciones cuando la auditoría se cortó.

Checklist de facto que repiten los documentos:
- Ningún dato inventado, y todo número simulado lleva "Simulación ilustrativa".
- Gates en cada escena.
- CLS 0.
- Sin desbordes de 320 a 2560.
- Áreas táctiles ≥44 px.
- Probar también ventanas bajas reales (1266×606, 1366×657, 1536×730).

Los commits van en español, descriptivos y con medición (por ejemplo "CLS 7.6 → 0, LCP 3.3 s → 1.6 s"). Llevan trailer `Co-Authored-By` de Claude.

**Discrepancias en los docs**
- `CONCEPTO.md` dice pin +200 % en el Tablero, pero el código usa +220 % (`tablero.js:185`).
- `CONCEPTO.md` describe el Recorrido con pin y desplazamiento horizontal. Hoy es sticky por CSS (`Recorrido.astro:465`).

## 11. Veredicto

### Qué reutilizar en Visual Dental (orden de valor)

1. **`src/scripts/engine.js`** (`onPage`, gates, Lenis ligado a `gsap.ticker`, teardown con ClientRouter, `markLite`).
   - Es el activo más valioso: ya resolvió que las escenas se reinicien limpio al navegar, que respeten reduced-motion y que los equipos modestos degraden solos.
   - Copiarlo casi entero. Recortar `initStack`, `initPointerFx` y el glow si no se usan.
2. **Helpers declarativos de `engine.js`** (`data-reveal`, `data-split`, `data-lit`, `data-count`, `data-draw`, marquesina por Web Animation).
   - Son lo que da dinamismo barato a un sitio minimalista sin escribir JS por sección.
   - Usar `up`, `blur`, `clip`, `lines` y `words` con ease `expo.out`.
3. **`src/styles/base.css` + patrón `data-theme` por sección + `chrome.js:111-119`.**
   - El sistema de tokens semánticos que redefine variables por sección, más el header que cambia de tema según lo que tiene debajo.
   - Para una clínica minimalista, ajustar a un solo tema claro dominante y quizá una sección oscura.
   - Conservar la escala fluida `--step-*`, `.container`, `.section`, `.btn`, `.chip` y el pre-hide con failsafe de 4 s.
4. **`src/layouts/Base.astro` + `astro.config.mjs` + `deploy.yml`.**
   - SEO condicionado a `SITE_URL`, `PUBLIC_DEMO` que pone noindex y cinta de propuesta, `BASE_URL` para GitHub Pages, preload de fuentes y JSON-LD.
   - Cambiar el tipo a `Dentist`/`MedicalBusiness` y verificar la URL del repo.
   - Ideal para mostrar la propuesta a Alek sin que se indexe.
5. **Instagram como fuente: `Instagram.astro`, `Lightbox.astro`, `scripts/lightbox.js`, `data/site.js` (`posts`) y `public/ig/*-320.webp`.**
   - Es el patrón exacto del briefing de Visual Dental: posts reales en un data file, miniaturas `-320` con `srcset`, lightbox `<dialog>` con FLIP, sin JS = enlaces.
   - Falta automatizar la generación de variantes (agregar un script `tools/` con `sharp`) y pasar a AVIF.
6. **Patrón Diagnóstico** (`data/diagnostico.js` puro + `diagnostico.check.mjs` + `scripts/diagnostico.js`): cuestionario por chips que termina en un mensaje de WhatsApp.
   - Adaptado a "¿Qué necesitas?" (limpieza, estética, ortodoncia, urgencia). Es conversión sin backend.
   - Reusar la lógica, no el medidor analógico.
7. **`src/styles/transitions.css` + `chrome.js:12-34` ("El Arco")** como base de View Transitions, `transition:persist` del header y `Loader.astro` con exit por transform.
   - Adaptar a algo más suave (fundido o cortina corta de unos 600 ms) y mantener `ssds:ready` y `introGate()`.
8. **Método y QA: `docs/BRIEF.md`, `docs/CONCEPTO.md`, `tools/qa/shoot.mjs`, `perf-section.mjs`, `audit.mjs` y la estructura de `deep-audit.workflow.js`.**
   - El briefing con la regla de "no inventar y marcar confirmar con cliente" y la tabla de gates es la plantilla de documentación del brief.
   - Las herramientas CDP funcionan sin Playwright. Cambiar la ruta de Chrome y el `ROOT`.

### Específico de SSD&S, NO copiar

- **Metáfora y estética eléctrica completa**: Tablero, breakers y medidor, Transferencia/ATS, Cobertura/mapa de Venezuela, "Corriente Viva", `.streak`, La Línea, glows naranja, rejillas de ingeniería y `bleed-word`. Es identidad del cliente y es lo opuesto a minimalismo dental.
- **Paleta navy y naranja** (`--navy-*`, `--orange-*`, `--grad-*`), y la tipografía Sora itálica en el wordmark. Los tokens se sustituyen por la paleta y el logo de Visual Dental.
- **El campo WebGL** (`campo.js`) y el lente-medidor del hero: pesado y fuera de tono para una clínica.
- **Escenas con pin largo** (+100 %, +200 %, +220 %): demasiado scroll forzado. En Visual Dental, a lo sumo una escena fijada.
- **Datos y copy**: `data/site.js`, `venezuela.js`, `docs/BRIEF.md` (contenido), teléfono, correo, `@tusolucionindustrial` y los 14 posts.
- **`PUBLIC_DEMO` y cinta "propuesta" con el nombre del repo de Diestorn03**: parametrizar.
- **`deep-audit.workflow.js`**: los prompts, las áreas y la ruta están atados a SSD&S.
- **Mantener la disciplina de honestidad**: no mostrar cifras de pacientes, años ni certificaciones sin confirmar con el cliente.

### Vacíos para una clínica dental (no existen aquí y habría que construirlos)

- Comparador antes/después.
- Galería de casos.
- Testimonios o reseñas.
- Agenda o cita.
- Sedes múltiples.
- Equipo o doctores.
- Video, si el Instagram de Visual Dental tiene reels propios.

Archivos clave, todos bajo `C:\Users\diegoa.cardozo\Desktop\ssds-proyectos\`:
- `src/scripts/engine.js`
- `src/styles/base.css`
- `src/layouts/Base.astro`
- `src/scripts/chrome.js`
- `src/components/chrome/Loader.astro`
- `src/components/home/Instagram.astro`
- `src/scripts/lightbox.js`
- `src/data/site.js`
- `src/data/diagnostico.js`
- `docs/BRIEF.md`
- `docs/CONCEPTO.md`
- `tools/qa/shoot.mjs`
- `.github/workflows/deploy.yml`