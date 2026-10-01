# Informe renewwater (C:\Users\diegoa.cardozo\Desktop\renewwater-redesign)

# Informe de análisis: renewwater-redesign (solo lectura)

No modifiqué nada ni ejecuté `npm install`, `build` ni `dev`. Para comparar con el commit inicial usé `git archive` sobre un directorio temporal que luego borré.

## 0. Cuál es la canónica y qué cambió entre ambas

**Canónica:** `C:\Users\diegoa.cardozo\Desktop\renewwater-redesign`. Tiene `.git`, origin `github.com/Diestorn03/renewwater-redesign`, rama `main` y 4 commits (el último del 1-oct, `62d6706`).

**Copia "Rediseño RenewWater" (24-sep):** es un snapshot anterior. Comparado con `git archive 1e36194` (commit inicial "tal como llegó en el zip", ignorando CRLF) difiere solo en `src/fonts/nasalization.woff2` (10 KB). La carpeta `.astro` de la copia se tocó el 28-sep. El repo nuevo la omitió por licencia (README línea 104).

Diferencias reales de la copia al repo nuevo (3 commits):

1. **`b875200` (26-sep), política de motion.** `astro.config.mjs` pasa de 21 a 69 líneas con el plugin PostCSS `motionToClass` (líneas 9-54, activado en 68). El plugin reescribe `@media (prefers-reduced-motion: reduce)` a `:where(html.rw-calm) …` y `no-preference` a `:where(html:not(.rw-calm)) …`.
2. **Reduced-motion en JS.** La copia vieja leía `matchMedia('(prefers-reduced-motion: reduce)')` (`engine.js` `mqReduced`). Ahora el sitio anima siempre y solo se apaga con la clase `html.rw-calm`.
3. **Cómo se activa `rw-calm`.** Se guarda en `localStorage['rw-motion']` y la pone un script inline en `Base.astro:60-65`. El interruptor "Reducir movimiento" del pie recarga la página (`chrome.js:41-45`).
4. **Fuente de marca.** Orbitron (OFL, vía fontsource) sustituye a Nasalization. Se re-midieron el "$0" y el "RENEW WATER" del pie (110px).
5. **`959e6f3` (26-sep).** Recupera los campos `libc` del lockfile para que `npm ci` en GitHub Actions no instale binarios glibc y musl a la vez.
6. **`62d6706` (1-oct), rendimiento de scroll.** `engine.js` pasa de 333 a 432 líneas: `gsap.ticker.lagSmoothing(0)`, marquesinas que corren solo en pantalla, `.stack-veil` en una capa GPU, `will-change` en parallax y pins, y arranque en `DOMContentLoaded`. Restaura el scroll tras crear los pins y mueve el foco a las anclas.
7. **Mismo commit, otros ficheros.** Cambian `Footer`, `Hilo`, `CeroSeLlena`, `Hero`, `Invisible`, `SeisEtapas`, `Soluciones`, `calle.js`, `cero.js`, `sostenible.js` y `base.css`. El commit declara pérdida de frames del 22-28% al 5% medida en Chrome real a 144 Hz.
8. **`tools/`: sin cambios funcionales.** `prep-logos.py` difiere solo en CRLF, así que la política de motion no tocó nada ahí.
9. **Idénticos salvo CRLF:** `.gitignore` y `.github/workflows/deploy.yml`.
10. **Entorno.** `core.autocrlf=true`: el working tree está en CRLF y el índice en LF.

**Ausencias en ambas copias.** No existen `.claude/`, `docs/`, `CLAUDE.md`, `tsconfig.json` ni `vercel.json`. Las secciones 7, 8 y 10 lo tratan.

---

## 1. Stack y versiones exactas (de `package-lock.json`)

| Pieza | Versión |
|---|---|
| `astro` | 7.3.5 (build estático, `trailingSlash:'always'`, i18n nativo) |
| `@astrojs/sitemap` | 3.7.4 |
| `gsap` | 3.15.0 (ScrollTrigger, SplitText, DrawSVGPlugin, Flip) |
| `lenis` | 1.3.26 |
| `@fontsource-variable/geist` / `@fontsource/geist-mono` / `@fontsource/instrument-serif` / `@fontsource/orbitron` | 5.3.0 cada uno |
| `vite` (transitivo) | 8.3.1 |
| `postcss` (transitivo) | 8.5.28 |

- **Node:** CI usa Node 22. Los `engines` del lockfile piden `^20.19.0 || >=22.12.0`.
- **Sin framework UI:** solo `.astro` más JS vanilla. Tampoco hay Tailwind, React ni TypeScript compilado.
- **TS en `.astro`:** hay `interface Props` y tipos, pero sin `tsconfig.json` ni `astro check`. Es solo sintaxis.
- **Scripts npm:** únicamente `dev`, `build` y `preview`. No hay lint ni tests. `src/scripts/etapas/particles.check.js` se ejecuta a mano con `node` y no está en `package.json`.
- **Rastro de uso previo:** `engine.js:3` dice "Recycled from the Experts DDT redesign". El motor viene de tu repo experts y está recortado a la parte declarativa.

## 2. Arquitectura

```
src/
  layouts/Base.astro                 # único layout: head/SEO, ClientRouter, chrome, <slot/>, importa engine.js
  pages/                             # index, sobre-nosotros, unete, contacto, analisis, 404, robots.txt.ts
    productos/{index,[slug]}.astro   # getStaticPaths desde products.json (11 productos)
    en/...                           # envolturas de 4 líneas: `import Page from '../x.astro'; <Page/>`
  components/
    chrome/ home/ about/ contact/ join/ lab/ products/ ui/
  scripts/                           # engine.js, chrome.js + un script por sección (calle, cero, sostenible, lightbox)
    etapas/ hero/ lab/ products/
  styles/{base.css, transitions.css}
  data/                              # site.js, photos.js, products.json, reviews.json, lab-rules.json
  i18n/                              # index.js, routes.js, es.js/en.js, original.*.js, areas/*.js
public/                              # img/, favicons, og.jpg
```

- **Construcción de páginas:** SSG puro, unas 36 páginas (home, about, productos, contacto, analisis y unete en ES y EN; 11 fichas por idioma; un único 404).
- **Páginas EN:** reutilizan el mismo componente. El idioma sale de `Astro.currentLocale` en `useI18n` (`i18n/index.js:23-36`).
- **Dónde vive el contenido:**
  - `src/data/products.json`: array de 11 productos con campos bilingües `{es,en}`.
  - `src/data/reviews.json`: 5 reseñas.
  - `src/data/lab-rules.json`: reglas del laboratorio.
  - `src/data/site.js`: teléfonos, dirección, redes, stats, financieras, noticias y `buildWa`.
  - No usa Content Collections.
- **Capas de texto:**
  - `original.{es,en}.js` es la copia literal del sitio actual (`o.*`).
  - `es.js` y `en.js` son el copy común (`t.*`).
  - `areas/*.js` guarda `{es,en}` por área y se lee con `pick(copy, lang)`.
- **Rutas:** `routes.js` mapea clave a `{es,en}`. `translatePath` y `matchRoute` resuelven el slug del producto y alimentan hreflang y el LangSwitch.
- **Base path:** `base = import.meta.env.BASE_URL.replace(/\/$/, '')` (`i18n/index.js:11`). Todo enlace y asset pasa por `url()` o `asset()`. `astro.config.mjs:6-7` lee `SITE_URL` y `PAGES_BASE`.
- **Page transitions:** `<ClientRouter/>` en `Base.astro:66`. El header persiste con `transition:persist={`hdr-${lang}…`}` (`Header.astro:23`).

## 3. Sistema de diseño

Todo está en `src/styles/base.css`, y los componentes llevan CSS scoped de Astro. El documento comienza con `data-theme="dark"`. Cada `<section>` declara `data-theme="dark|light"`; no hay toggle de usuario ni `prefers-color-scheme`.

**`:root` relevante (`base.css:9-71`):**

```css
--navy:#001C38; --abyss:#000B18; --current:#062B4F; --tide:#0A4A66;
--aqua:#00D0D0; --mint:#00D08C; --leaf:#00CC60; --lime:#98C400; --sun:#F8C000;
--foam:#F4FBF9; --mist:#E2F3EF; --slate:#3F5566; --haze:#8FB3C4; --foam-text:#EAFBF9;
--aqua-ink:#00767A; --leaf-ink:#00745A; --lime-ink:#4F6A00;        /* AA sobre claro */
--grad-brand: linear-gradient(90deg,#00D0D0 0%,#00D08C 38%,#00CC60 68%,#98C400 100%);
--r-xs:6px; --r-sm:12px; --r-md:20px; --r-lg:28px; --r-pill:999px; --r-arch:999px 999px var(--r-lg) var(--r-lg);
--s-1:4px … --s-10:128px;   --gutter:clamp(16px,4vw,48px);   --section-y:clamp(64px,8vw,120px);
--maxw:1280px; --measure:62ch; --header-h:72px (64px <768); --bar-h:64px;
--ease-out:cubic-bezier(.16,1,.3,1); --ease-in-out:cubic-bezier(.65,0,.35,1);
--ease-water:cubic-bezier(.33,1,.68,1); --ease-spring:cubic-bezier(.34,1.56,.64,1);
--d-fast:.2s; --d-base:.45s; --d-slow:.9s; --d-reveal:1.1s;
--z-canvas:0; --z-content:1; --z-header:50; --z-fab:60; --z-menu:80; --z-loader:100;
--font-brand:"Orbitron",system-ui,sans-serif;
--font-sans:"Geist Variable","Geist Fallback",system-ui,…;
--font-serif:"Instrument Serif",Georgia,serif;  --font-mono:"Geist Mono",ui-monospace,monospace;
--fs-display:clamp(2.75rem,1.2rem+6.5vw,7.5rem); --fs-h2:clamp(2rem,1rem+3.6vw,4.25rem);
--fs-h3:clamp(1.25rem,1rem+.8vw,1.625rem); --fs-lead:clamp(1.125rem,1rem+.5vw,1.375rem);
--fs-body:clamp(1rem,.95rem+.25vw,1.125rem); --fs-num-xl:clamp(5rem,3rem+12vw,15rem); --fs-bleed:24vw;
```

**Temas (`base.css:75-90`).** Un bloque `:root, [data-theme="dark"]` y otro `[data-theme="light"]` redefinen los tokens semánticos. Son `--bg --surface --fg --fg-muted --line --accent-text --focus --grad-text --card-sh --accent-bg --ghost-border --solid-*`. `color-scheme` va por tema. `@media (prefers-contrast: more)` aplica en `91-94`.

**Tipografía.**
- Se cargan con `@fontsource` importado en `Base.astro:3-6` (`geist/wght.css`, `instrument-serif/400-italic`, `geist-mono/500`, `orbitron/400`). El CSS de fontsource declara subsets por `unicode-range`.
- Se precargan solo los woff2 latin de Orbitron y Geist (`Base.astro:49-50`).
- `@font-face "Geist Fallback"` (Arial con `size-adjust:104%`, `ascent-override`, `descent-override`) reduce el CLS (`base.css:7`).
- Usos: Geist para titulares y cuerpo, Orbitron para kickers, números y marca, Instrument Serif cursiva (`.accent`) para una palabra por titular, Geist Mono para etiquetas.

**Grid y contenedores (`base.css:127-138`).**
- `.wrap` es `min(1280px, 100% - 2*gutter)`.
- `.grid-2/3/4` se reducen a 2 columnas a 960px y a 1 columna a 560px.
- `.stack` y `.cta-row` son los otros helpers.
- El hero usa grid de 12 columnas (`Hero.astro:129`).
- Breakpoints recurrentes: 560, 767/768, 960, 1024, 1100 y 1200px.

**Primitivas.**
- Botones: `.btn--primary`, `--ghost` (borde degradado con `mask-composite`), `--solid`, `--text`, `--wa`.
- Chips: radio o checkbox nativo con `:has(input:checked)`.
- `.card`, `.glass` (blur solo con `pointer: fine`), `.arch`, `.frame`, `.pill`, `.kicker` (con triángulo del logo), `.num`, `.bleed-word` (palabra gigante con contorno), `.grad-text`.
- Reveals: `.js [data-reveal]{opacity:0}` y `.js [data-split]{visibility:hidden}` (`base.css:219-221`).

## 4. Sistema de motion

**Setup (`src/scripts/engine.js`).**
- Registra `ScrollTrigger`, `SplitText` y `DrawSVGPlugin` (`:40`). `Flip` se registra aparte en `products/catalog.js:6`.
- **Lenis:** `new Lenis({ lerp: 0.14, smoothWheel: true })` (`:117`). Se maneja con `gsap.ticker.add(lenisRaf)` y `lenis.on('scroll', ScrollTrigger.update)`. Solo existe en el "desktop gate", es decir `(min-width:768px) and (pointer:fine)` y no `rw-calm` (`:45`, `:53`).
- **`lagSmoothing(0)`** en `:43`.
- **Inicialización:** `Base.astro:92-94` importa `engine.js`.
  - Cada sección se registra con `onPage(fn)` y recibe `{gsap, ScrollTrigger, SplitText, env, lenis, scrollTo, introGate, emit, onRefresh, getLenis}`.
  - `boot()` hace teardown, crea un `gsap.context`, corre el registro y luego los built-ins.
  - Los splits y `lit` esperan a `document.fonts.ready` (máximo 900 ms) en `:376-403`.
  - Navegación: `astro:before-swap` hace teardown y `astro:page-load` hace boot. El Back/Forward restaura scroll después de crear los pins.
  - Cruzar el breakpoint reinicia todo (`:423-432`).
- **Política reduced-motion:** el sitio ignora el ajuste del SO a propósito.
  - `env.reduced` es `html.rw-calm` (`:54`).
  - El interruptor del pie (`Footer.astro:34`/`98`) lo guarda en `localStorage['rw-motion']` y recarga.
  - `rw-calm` apaga loader, pins, scrubs, WebGL, marquesinas y Lenis.
  - Las `@media (prefers-reduced-motion)` del CSS se reescriben a clases en build (`astro.config.mjs:19-54`). Hay un `throw` si una media query mezcla `reduce` y `no-preference`.
- **Gates:**
  - `env.desktop` activa pins, parallax, tilt, magnetic, WebGL y Lenis.
  - `env.coarse` cambia `chars` por `words`.
  - Móvil: scroll nativo, scroll-snap e `IntersectionObserver`.

**Efectos firma (archivo : cómo funciona).**

*Declarativos en `engine.js`*
- **`[data-reveal=up|down|left|right|scale|blur|clip|drop|iris]`** (`:143-169`): `fromTo` con ScrollTrigger `once` en `top 88%`, ease `expo.out` de 0.9 s (1.2 s para los clip). Usa `data-delay` y `data-start`.
- **`[data-stagger]`** (`:164-168`): los hijos entran con y:48 y ritmo de 0.08.
- **`[data-split=lines|words|chars]`** (`:172-185`): SplitText con máscara por línea, `yPercent` 110, y blur en chars.
- **`[data-lit]`** (`:186-195`): las palabras pasan de opacidad .3 a 1 con scrub. Usa `aria:'none'` y un fin dinámico para párrafos largos.
- **`[data-parallax]` y `[data-depth]`** (`:198-212`): drift scrubbed de `yPercent`, con `willChange`.
- **`[data-count]`** (`:215-224`): contador de 2 s `power3.out`, una vez, formateado por locale.
- **`[data-draw]`** (`:227-243`): DrawSVG una vez al entrar, o scrub con `data-draw="scrub"`. Mide solo al entrar en pantalla.
- **`.stack-card`** (`:246-259`): la tarjeta de abajo escala y rota, y un `.stack-veil` en capa GPU la atenúa.
- **`.marquee`** (`:261-322`):
  - Pistas duplicadas, velocidad que reacciona a la del scroll, y ticker activo solo mientras haya una a la vista.
  - Se detiene con hover o foco (WCAG 2.2.2).
  - Atributo `data-paused` más un manejador de botón `[data-marquee-toggle]`.
- **`[data-tilt]`, `[data-magnetic]`, `[data-glow]`** (`:327-348`): `quickTo`. Glow escribe `--gx/--gy`.
- **Offscreen** (`:354-360`): `[data-offscreen]` pausa las animaciones CSS lejanas.
- **Anclas** (`:127-140`): pasan por Lenis con offset de header y mueven el foco.
- **No hay cursor custom.**

*Chrome (`chrome.js`, `Loader`, `transitions.css`)*
- **"La Onda"** (`transitions.css:8-31` más `chrome.js:11-38`): View Transition con círculo que se abre desde el punto de clic (`--vt-x/--vt-y`). La página vieja baja a opacidad .6 y escala .98. Header, FAB y barra móvil tienen `view-transition-name` propio.
- **Loader "El Trazo"** (`Loader.astro`): CSS puro, una vez por sesión (`sessionStorage`), con logo dibujándose, wordmark en barrido, gota que cae y salida por `clip-path`. Dura unos 1.2 s, con botón "Saltar" y Esc.
- **Header** (`chrome.js:97-141`): vidrio tras 80px, se oculta al bajar, y copia `data-theme` de la sección que tiene debajo con un `IntersectionObserver`.
- **Menú móvil** (`MobileMenu.astro`): `<dialog>` modal con revelado circular desde el burger, filas escalonadas de 40 ms, y para Lenis mientras está abierto.
- **FAB WhatsApp y barra móvil** (`chrome.js:143-201`): aparecen pasado el hero y se ocultan sobre `#laboratorio`, `#encuentranos` y el wordmark del pie. El FAB se abre 4 s tras `rw:etapas-complete`.
- **"El Hilo"** (`Hilo.astro`, `chrome.js:203-264`): hilo SVG en el margen izquierdo (≥1024px) que se dibuja con el scroll. Usa curvas S cada ~820px y la punta se interpola desde una LUT precalculada. Va en capa `contain:strict`.
- **Pie** (`chrome.js:266-316`, `Footer.astro`):
  - El hilo entra al logo y este se dibuja.
  - "RENEW WATER" gigante se rellena de degradado con una ventana deslizante hecha solo con transforms.
  - En móvil el relleno se dispara una vez.
- **`LogoMark`:** isotipo como paths con trazo y `draw="load|view"`.

*Home*
- **Hero "Agua Viva"** (`Hero.astro:225-394` y `hero/agua-viva.js`).
  - WebGL1 en bruto con GLSL propio: fbm con domain warp, rampa de 4 colores de marca, caustics, destello ámbar, empuje del puntero y `u_depth` ligado al pin.
  - Resolución a la mitad.
  - Se autodegrada: 10 frames seguidos >32 ms hacen que se suelte el contexto y quede el póster.
  - Lente circular que sigue al cursor sobre el H1, un SplitText por caracteres tras `introGate()`, y el arco con clip-path.
  - Pin `+=100%` con `scrub:.6`. Dentro del pin: profundidad del shader, H1 sube con blur, CTAs salen, el arco escala y una línea-puente aparece palabra a palabra.
  - Móvil: póster en dos capas con drift CSS y un barrido único de lente.
- **`Invisible`** (`:95-127`): 5 chips de contaminantes con deriva sinusoidal CSS y repulsión de ≤12px. Al salir de la sección se hunden hacia el siguiente capítulo con scrub.
- **`SeisEtapas`** (`scripts/etapas/etapas.js`).
  - Pin `+=200%` con scrub. Todo se calcula como función pura del progreso: un modelo determinista de 240 partículas en Canvas2D (`particles.js`, con semilla), frente de agua, odómetro, barra de impurezas y raíl de pasos.
  - Las bandas, los callouts y los ticks hacen saltar al paso.
  - Móvil: tanque sticky y 6 tarjetas con `IntersectionObserver` que fija `data-step`.
  - La `<ol>` de etapas está siempre en el DOM como equivalente en texto.
- **`Soluciones`** (`:104-144`): una "tubería" se rellena con scrub y cada nodo se enciende al pasar el frente. Las tarjetas tienen tilt y glow.
- **`Laboratorio`** (`lab/*`).
  - Formulario que genera partículas (Canvas2D con muelle amortiguado) dentro de un vaso, y un botón "mantén pulsado para purificar" de 1.6 s.
  - Tarjeta de resultado con giro 3D y mensaje de WhatsApp compuesto.
  - Reglas en `lab-rules.json` evaluadas por `rules.js` (lógica pura). El texto de `lab.js` anuncia el progreso con `aria-live`.
  - Vibración en táctil.
- **`CalleRenew`** (`calle.js`).
  - Pin horizontal de `D` píxeles con scrub:1.
  - Una tubería con clip-path guía la lectura, las ramas se llenan al pasar y las fotos tienen parallax interno (`containerAnimation`).
  - Contador "+500" ligado al progreso y "+12 ciudades" desde el 50%.
  - Móvil: fila con scroll-snap.
- **`CeroSeLlena`** (`cero.js`).
  - Un "$0" gigante se rellena de agua con dos olas en bucle. Cada una es una capa HTML con `mask-image` desplazada por transform.
  - El nivel `--lvl` se scrubea en desktop y se anima una vez en móvil.
  - Tickets con rotación de aterrizaje y sellos "thump".
  - Marquesina de financieras.
- **`Familias`** (`:54-67`): reseñas como pila sticky con `.stack-card`, titular fijado y estrellas con `back.out`. Debajo, dos marquesinas de fotos en sentidos opuestos. Móvil: deck con snap.
- **`Sostenible`** (`sostenible.js`): escena sticky de 100svh con una foto "después" que sube con marea scrubbed (`clip-path inset`). Calculadora de botellas (`n × 52`) que siempre funciona.
- **`Beneficios`** (`:100-111`): arco fotográfico sticky, numerales de contorno con parallax .4, y gotas que se llenan de degradado al llegar a `top 58%`.
- **`Encuentranos`:** CTA con botón magnético y fachada de mapa.

*Otras páginas*
- **About:** Ken Burns en `AboutHero`, `data-lit` en la misión, `Historia` con título sticky y fotos con parallax a tres profundidades, `Objetivos` con líneas `data-draw="scrub"`, y vídeos tras fachada.
- **Productos:**
  - El hero tiene trío de cutouts con `data-depth`.
  - El catálogo filtra con GSAP Flip y sincroniza `?tipo=` (`catalog.js:35-40`).
  - La tarjeta se transforma en la ficha por `transition:name="prod-<slug>"` (`ProductCard.astro:20`, `ProductDetail.astro:66`).
  - `ConfigToggle` usa `:has` en CSS y `detail.js` reescribe el enlace de WhatsApp.
  - La barra de cotización móvil está en `#pd-bar`.
- **Lightbox** (`lightbox.js:23-32`): la foto se transforma con `document.startViewTransition` entre miniatura y modal. Navega con teclado, deslizamiento táctil y precarga del vecino.
- **Únete:** `JoinHero` (caracteres con blur, tiles con clip-path, columnas con parallax, `introGate`) y `ProfileCheck` (gota que se llena n/7).
- **Contacto:** `WaComposer` (formulario que arma el mensaje de WhatsApp sin backend) y `MapFacade`.
- **404:** animación CSS de un filtro.

## 5. Catálogo de componentes

| Carpeta | Componente → propósito |
|---|---|
| `chrome/` | `Header` header fijo con vidrio y tema por sección · `MobileMenu` menú modal `<dialog>` · `LangSwitch` píldora ES/EN · `Loader` intro "El Trazo" · `LogoMark` isotipo animable · `Hilo` hilo de scroll · `Footer` pie con wordmark que se llena · `FloatingWhatsApp` FAB · `MobileActionBar` barra WhatsApp/llamar |
| `home/` | `Hero` Agua Viva · `Invisible` contaminantes · `SeisEtapas` tanque pinned (también modo `static`) · `Soluciones` 4 tarjetas con tubería · `CalleRenew` instalaciones en horizontal · `CeroSeLlena` "$0" + tickets + financieras · `Familias` reseñas apiladas y fotos · `Sostenible` plástico a grifo + calculadora · `Beneficios` 4 beneficios · `Encuentranos` CTA y ubicación |
| `lab/` | `Laboratorio` quiz y vaso · `HoldButton` botón de mantener pulsado · `ResultCard` tarjeta de resultado |
| `products/` | `Catalog` filtros y grid · `ProductCard` tarjeta · `ProductDetail` ficha · `ConfigToggle` selector de etapas |
| `about/` | `AboutHero` · `Historia` · `Objetivos` · `Noticias` · `YouTubeFacade` |
| `join/` | `JoinHero` · `ProfileCheck` |
| `contact/` | `ContactCards` · `WaComposer` · `MapFacade` |
| `ui/` | `Icon` set SVG de trazo (con `grad`) · `Lightbox` · `ReviewCard` · `Stamp` · `Stars` · `TicketStub` |

## 6. Pipeline de assets

- **Imágenes:** todo WebP ya optimizado a mano y servido desde `public/img/` (~9.9 MB en total).
  - **No** se usa `astro:assets`, `<Image>` ni sharp (grep sin resultados). Son `<img>` simples con `width/height`, `loading=lazy` y `decoding=async`.
  - Variantes `-sm` para clients, installations y products. `public/img/_sizes.json` guarda las dimensiones intrínsecas y `data/photos.js` las copia.
  - `srcset` aparece solo en `Hero`, `Beneficios` y `Sostenible`.
  - El script que generó `_sizes.json` y las variantes `-sm` no está en el repo, y tampoco el que exportó `hero/poster.webp` ("exportado una vez" del shader).
  - La carpeta `flyers` que `crop-products.py` espera queda fuera del repo.
- **Vídeo:** ninguno. El hero es WebGL más póster.
- **Fuentes:** véase la sección 3.
- **Íconos:** `Icon.astro` (SVG inline 24×24, trazo 1.75, uniones biseladas que imitan el logo) y `LogoMark.astro` (paths, no imagen). El wordmark se usa como máscara CSS (`--wm:url(logo.webp)`, `Header.astro:27, 81-85`), rellena con degradado según el tema.
- **Favicons y OG:** `favicon-32.png`, `apple-touch-icon.png` y `og.jpg` (1200×630, 73 KB). `icon-512.png` no se referencia en ninguna parte (no hay manifest).
- **YouTube:** las miniaturas vienen de `i.ytimg.com/hqdefault.jpg` y el iframe se carga bajo clic desde `youtube-nocookie.com`. El mapa de Google también es fachada.

## 7. SEO, accesibilidad y performance

**Bien resuelto**
- **SEO** (`Base.astro:36-66`): `<html lang>`, title `X · Renew Water`, description por página, canonical, hreflang es/en/x-default y Open Graph completo (1200×630, locale).
- **Sitemap y robots:** sitemap con i18n (`es-US`, `en-US`) y `robots.txt.ts` dinámico. Con `PUBLIC_DEMO` pone `noindex, nofollow` y `Disallow: /`.
- **Accesibilidad:**
  - Skip link, `<main id="main" tabindex="-1">` y `:focus-visible` de 3px.
  - Objetivos táctiles de 48px y `aria-current` en la navegación.
  - `<dialog>` nativo para menú y lightbox.
  - `aria-live` en los contadores del laboratorio, la calculadora y el filtro.
  - Los canvas tienen equivalente en texto.
  - `prefers-contrast: more` (`base.css:91-94`) y marquesinas que pausan con hover o foco.
  - El interruptor de motion es propio y accesible (`aria-pressed`).
  - Los textos animados se mantienen accesibles (`aria:'none'` en lit y la `<ol>` de etapas).
- **Performance:**
  - Todo lo que se mueve va en capas GPU con `will-change`, y `contain` en `Hilo`.
  - Las animaciones CSS lejanas se pausan (`data-offscreen`) y los tickers solo corren con la sección visible.
  - El WebGL se autodegrada y las fachadas evitan terceros.
  - `Lenis` solo en desktop y `backdrop-filter` solo con `pointer: fine`.

**Falta o está a medias**
1. **Red de seguridad `fx-fallback` sin completar.**
   - `engine.js:148-151` y `:379-382` leen `fx-fallback`, y el commit `62d6706` la anuncia, pero ni `Base.astro` ni `base.css` la implementan.
   - Si el JS falla o tarda, `.js [data-reveal]{opacity:0}` (`base.css:219`) y `[data-split]{visibility:hidden}` dejan el contenido oculto.
   - Solo el hero tiene su propio fallback de 5 s (`Hero.astro:144-148`).
2. **`rw:loader-exit` nunca se emite.** `engine.js:85-86` lo escucha para solapar el intro del hero con la salida del loader, pero `Loader.astro:40` solo dispara `rw:loader-done`. En la práctica el intro espera a que termine el loader.
3. **`[data-marquee-toggle]` sin botón.** El manejador existe (`engine.js:316-322`) pero ningún componente renderiza el botón, así que no hay control de pausa explícito para las marquesinas (WCAG 2.2.2).
4. **Posible doble animación en el logo (sin verificar en navegador).** `LogoMark` con `data-draw="load|view"` (`LogoMark.astro:37`) coincide con el selector `[data-draw]` de `initDraw` (`engine.js:228`). Eso puede solaparse con la animación CSS del propio logo.
5. **Falta de datos estructurados:** no hay JSON-LD (`LocalBusiness`, `Product`, `Review`), ni `og:image:alt`, ni imagen OG por página (todas usan `/og.jpg`, `Base.astro:28`). Tampoco hay manifest, `preconnect` ni AVIF.
6. **Documentación y tipado ausentes:** `.claude/`, `docs/`, `tsconfig.json` y `astro check`. Los comentarios citan una spec ("spec §6.1…", "Flujo Vivo spec") y un `scratchpad/a4-check.mjs` (`lab/rules.js:2`) que no existen en el repo.
7. **Sin cobertura de pruebas** salvo `particles.check.js`, que se lanza a mano.
8. **Muchos pins en un mismo home:** hero, etapas, calle y escena sticky de sostenible. Es costoso en móvil y en dispositivos modestos, aunque el móvil ya los degrada a scroll nativo.
9. **Datos sin confirmar** (README líneas 98-104): dirección, correo `@renewsolarus.com`, reglas del laboratorio, sellos NSF/EPA y enlaces de noticias.

## 8. Deploy

- **`.github/workflows/deploy.yml`:**
  - Se dispara con push a `main` o `workflow_dispatch`.
  - Permisos `contents:read`, `pages:write`, `id-token:write`. `concurrency: pages` con `cancel-in-progress`.
  - Job `build`: `checkout@v4`, `configure-pages@v5` (`enablement:true`, `continue-on-error`), `setup-node@v4` (Node 22, cache npm), `npm ci`, `npm run build`, `upload-pages-artifact@v3` (`dist`).
  - Job `deploy`: `deploy-pages@v4` con environment `github-pages`.
- **Variables de build:**
  - `SITE_URL=https://<owner>.github.io` y `PAGES_BASE=/<repo>` se fijan siempre, así que el workflow no puede construir la versión de dominio propio sin editarlo (el comentario dice "quitar `PAGES_BASE`").
  - `PUBLIC_DEMO` es `${{ vars.PUBLIC_DEMO || '1' }}` (línea 37). **Bug:** en Actions la cadena vacía es falsa, así que `''` cae a `'1'`. La instrucción del README (línea 27: crear la variable con valor vacío) nunca desactiva el modo demo.
  - `PUBLIC_BENCH` activa `window.__rw` solo en builds de benchmark (`engine.js:71`).
- **Dominio final:** `npm run build` sin variables da rutas desde `/` y `site = https://renewwaterus.com`. No hay `vercel.json`.
- **Requisito del README:** repo público y Pages con Source = GitHub Actions.

## 9. `tools/` (Python con Pillow y numpy; sin `requirements.txt`)

- **`crop-products.py`:** recorta los 11 cutouts de producto desde los folletos 1236×1600.
  - Quita la marca de agua mediante "votación de placa": el valor por píxel que coincide en la mayoría de folletos plantilla (con una máscara `BUSY` de zonas ocupadas) se resta y se funde a blanco.
  - Repara por interpolación las líneas de callout sobre las sombras y feather en los bordes.
  - Escribe `public/img/products/cut-<slug>.webp` (≤800px de alto, q82). El resultado se muestra con `mix-blend-mode:multiply`.
  - Espera una carpeta `../flyers` fuera del repo.
- **`make-tiles.py`:** recorta del folleto `product-9.jpeg` las 6 bandas de medios del Renew City y las espeja 2×2 para repetirlas sin costuras (`tile-*.webp`, 80×168, q70). Valida el tamaño con `assert`.
- **`prep-logos.py`:** "des-matea" los logos de financieras que traen caja blanca y genera variantes de color y blanca en WebP sin pérdida a 96px de alto. Incluye un `assert` de equivalencia visual y avisa de que hay que copiar los anchos a `LOGO_W` en `CeroSeLlena.astro`.

## 10. Convenciones de trabajo

- **No hay `.claude/` ni `docs/`.** La documentación es el `README.md` en español. Incluye:
  - tabla "Actual → Propuesta" (útil como pitch al cliente);
  - tabla de refs de conversión;
  - paleta;
  - accesibilidad;
  - lista "Pendiente de confirmar con Renew Water" con 7 puntos como checklist de validación.
- **Separación de textos:**
  - `original.*.js` es la copia literal, con solo los typos obvios corregidos.
  - `es.js`/`en.js` y `areas/*.js` guardan el copy nuevo.
  - Los cambios de redacción pendientes del cliente se marcan como `PROPUESTA` (`i18n/areas/home-story.js`).
- **Etiquetado de conversión:** `buildWa({text, ref})` añade `(ref: web-…)` a cada mensaje de WhatsApp para saber el origen sin analytics (`data/site.js:38`).
- **Modo propuesta:** `PUBLIC_DEMO` agrega `noindex` y una línea "Propuesta de rediseño · demo" en el pie.
- **Trazas de método:**
  - `pages/index.astro:2` dice "sections are owned by their agents", lo que apunta a un trabajo multi-agente con un lead.
  - El motor se recicla de un repo anterior.
- **Commits:** en español, con cuerpo en viñetas y claims medibles. Llevan `Co-Authored-By: Claude Opus 5.5`.
- **Prácticas visibles en el código:**
  - Comentarios de cabecera por sección con el contrato de comportamiento por dispositivo (desktop gate, táctil y reduced).
  - Texto accesible junto a cada canvas y fallback sin JS por sección.
  - Prefijo `rw-` en clases y eventos propios.

## 11. Veredicto para Visual Dental

**Patrones y archivos más valiosos para reutilizar**

1. **`src/scripts/engine.js`.** Motor declarativo por atributos (`data-reveal/split/lit/parallax/count/draw/stagger`), registro `onPage()` con teardown limpio bajo View Transitions, gates `env.desktop/reduced/coarse` y Lenis sincronizado con el ticker de GSAP.
2. **Tokens y `data-theme` por sección** (`base.css:9-90`, `.wrap`, `.section`, `.btn`, `.chip`, `.card`, `.kicker`). Hay que rebrandear valores, pero la estructura (escala de espacio, tipografía fluida con `clamp`, easings, z-index, tema por sección que alimenta el header) se mantiene.
3. **i18n y datos:** `i18n/index.js` + `routes.js` + capas `original`/`es`/`areas`, base path y `trailingSlash:'always'` en `astro.config.mjs`, hreflang y sitemap. Encaja directo con el briefing de tu novia.
4. **Kit de chrome:** `Header` (vidrio, ocultar al bajar, `persist`), `MobileMenu` (`<dialog>` con revelado circular), `FloatingWhatsApp` más `MobileActionBar` (para clínica: "Agendar cita") y `Footer`.
5. **Transiciones de página:** `transitions.css` más `chrome.js:11-38` (La Onda), el morph de `ProductCard` a `ProductDetail` y el morph del Lightbox (`lightbox.js`). Es la firma más "fluida" con menos coste visual, adecuada para un estilo minimalista.
6. **Patrón pin con scrub y texto equivalente:** `etapas.js` más `particles.js` (modelo puro y determinista, con `check` en node, estado en `data-step`) y `calle.js` (horizontal). Adaptable a "tu tratamiento paso a paso" o antes/después, usando 1 o 2 escenas, no 4.
7. **Capa de conversión sin backend:** `buildWa` con `ref`, `WaComposer` y el patrón quiz con reglas JSON más lógica pura (`lab-rules.json` + `rules.js`) para un "¿qué tratamiento necesito?". También las fachadas de YouTube y mapa.
8. **Deploy de propuestas:** `deploy.yml` con `SITE_URL`/`PAGES_BASE`, `PUBLIC_DEMO` (corrigiendo el bug del `||`) y `robots.txt.ts`.

**Específico de Renew Water, no copiar**
- **Marca y estética:**
  - Degradado aqua a lima, paleta navy y la fuente Orbitron/Nasalization.
  - Tema oscuro por defecto: para clínica dental minimalista es mejor claro.
  - Metáforas de agua: Hilo, Agua Viva (shader), tanque, "$0 que se llena", marea de plástico.
  - Isotipo, wordmark como máscara, sello WQA, financieras y sellos de producto.
- **Datos y contenido:**
  - Reglas del laboratorio, 11 productos y folletos (`crop-products.py`, `make-tiles.py`, `prep-logos.py`).
  - Datos de `site.js`: teléfonos, dirección, correos `@renewsolarus.com`, redes, noticias.
- **La política "animar aunque el SO pida reducir movimiento":** no se debe heredar por defecto. Para una clínica con público amplio, respetar `prefers-reduced-motion` y dejar el interruptor como extra. El plugin `motionToClass` sí es reutilizable invirtiendo ese valor por defecto.
- **Sobrecarga de movimiento:** loader en primera visita, WebGL en el hero, 4 pins y 15 efectos firma. Con un estilo minimalista conviene elegir 3 o 4 firmas y subordinar el resto.
- **Deuda a no arrastrar:** el contrato `fx-fallback` incompleto, `rw:loader-exit` huérfano, el botón de marquesina ausente y la falta de JSON-LD (para una clínica, `Dentist`/`LocalBusiness` en el SEO local sí importa).

Rutas clave:
- `C:\Users\diegoa.cardozo\Desktop\renewwater-redesign\astro.config.mjs`
- `C:\Users\diegoa.cardozo\Desktop\renewwater-redesign\src\scripts\engine.js`
- `C:\Users\diegoa.cardozo\Desktop\renewwater-redesign\src\scripts\chrome.js`
- `C:\Users\diegoa.cardozo\Desktop\renewwater-redesign\src\styles\base.css`
- `C:\Users\diegoa.cardozo\Desktop\renewwater-redesign\.github\workflows\deploy.yml`