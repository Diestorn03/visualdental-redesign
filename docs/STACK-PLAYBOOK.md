> Generado por el análisis de repos el 2026-10-01. OJO: el agente asumió una clínica dental (pacientes, "tratamientos", WhatsApp, quiz). El cliente es un laboratorio B2B; ver docs/BRIEF.md. El análisis de stack y de patrones sigue siendo válido.

# Playbook de stack para el rediseño de Visual Dental

Abreviaturas de rutas:
- `EXP` = `C:\Users\diegoa.cardozo\Desktop\Rediseño ExpertsDDT`
- `RW` = `C:\Users\diegoa.cardozo\Desktop\renewwater-redesign`
- `SS` = `C:\Users\diegoa.cardozo\Desktop\ssds-proyectos`

Los números de línea vienen de los informes de lectura de código. Nada se ejecutó, así que hay que verificarlos al copiar. Los bugs marcados como "inferido" no se probaron en navegador.

---

## 1. Stack base y qué añadió cada proyecto

| Pieza | EXP (17-sep) | RW (24-sep a 1-oct) | SS (28-sep) | Fijar en VisualDents |
|---|---|---|---|---|
| astro | 7.3.3 (`^`) | 7.3.5 | 7.3.5 | **7.3.5** exacta |
| @astrojs/sitemap | 3.7.4 | 3.7.4 | 3.7.4 | 3.7.4 |
| gsap | 3.15.0 | 3.15.0 | 3.15.0 | 3.15.0 (plugins gratuitos) |
| lenis | 1.3.26 | 1.3.26 | 1.3.26 | 1.3.26 |
| Fuentes | Poppins por Google CDN | fontsource 5.3.0: geist, instrument-serif, geist-mono, orbitron | fontsource-variable 5.3.0: sora, inter, jetbrains-mono | fontsource (self-host), nunca CDN |
| sharp | no | no | 0.34.5, declarado y sin uso | instalarlo y usarlo (ver §5) |
| Node | 22 en CI | 22 en CI (`engines ^20.19.0 \|\| >=22.12.0`) | 22 en CI | 22 |

Común a los tres:
- Astro SSG con `ClientRouter` (View Transitions) y `trailingSlash:'always'`.
- CSS vanilla, JS vanilla en ES modules.
- Sin Tailwind, sin framework de UI, sin tests.
- Scripts npm: solo `dev`, `build` y `preview`.
- Despliegue a GitHub Pages con `SITE_URL` y `PAGES_BASE`.

Qué añadió cada proyecto:
- **EXP**
  - `SplitText`, i18n con `useI18n` y envoltorios `/es/*`, y dark mode con toggle.
  - Loader con marca en base64, comparador antes/después (`initCompare`) y `.underline-accent`.
  - Integraciones opcionales (GA4, n8n) y `vercel.json`.
- **RW**
  - `DrawSVGPlugin` y `Flip`, y fuentes self-host con fallback métrico (`size-adjust`, `base.css:7`).
  - Motor modular con `onPage()`, `env.desktop` y `env.coarse`.
  - i18n por capas (`original`, `es`, `areas`) y `routes.js`.
  - Transición "La Onda", morph tarjeta a ficha, morph del Lightbox y menú `<dialog>`.
  - Modo propuesta con `PUBLIC_DEMO` y `robots.txt.ts`, y `buildWa({text, ref})`.
  - Plugin PostCSS `motionToClass` y scripts Python en `tools/`.
- **SS**
  - `MotionPathPlugin`, `tsconfig.json` (extiende `astro/tsconfigs/base`) y JSON-LD.
  - `env.lite` con `markLite()` y degradación automática.
  - Muro de Instagram con lightbox FLIP y quiz puro con autoprueba.
  - `docs/BRIEF.md`, `docs/CONCEPTO.md` y `docs/AUDITORIA.md`, y `tools/qa/*` (CDP sin Playwright).

Decisiones de `package.json`:
- Versiones exactas, sin `^`.
- Tras `npm install`, comprobar que `npm ci` pasa en Actions. RW perdió los campos `libc` del lockfile en el commit `959e6f3` y `npm ci` instalaba binarios glibc y musl a la vez.

---

## 2. Evolución: qué maduró y cuál es la versión de referencia

| Patrón | EXP | RW | SS | Versión más madura |
|---|---|---|---|---|
| Motor de motion | `src/scripts/motion.js`, 455 líneas, `boot()` global, todo por `data-*` | `src/scripts/engine.js` con `onPage(fn)`, un script por sección y gates | Igual que RW más `markLite`, `AbortController` y handshake de loader | **`SS/src/scripts/engine.js`** (contrato). Del `engine.js` de RW tras `62d6706`, rescatar la pausa de marquesina por hover/foco y `.stack-veil` |
| Política reduced-motion | `reduced` evaluado una vez, parcial, con bug (ver abajo) | Ignora el SO a propósito (`html.rw-calm`) | Respeta el SO: estado final estático, sin loader, Lenis, pins ni WebGL | **SS** (`base.css:295-299`, `env.reduced`) |
| Anti-parpadeo y sin JS | `html.js` sin fallback sin JS | `fx-fallback` anunciada y sin implementar | `html.js` más failsafe CSS de 4 s (`base.css:281-286`) | **SS** |
| Tokens y tema | `data-theme` global con toggle | `data-theme` por sección y escala de espacio | Igual que RW más `--step-*` y `@property --gx/--gy` (`base.css:256-258`) | **SS `base.css`**, más el fallback métrico de fuente de RW |
| Chrome | Nav persistente y menú con clip-path | Header que se oculta, `<dialog>`, FAB y barra móvil | Igual que RW más hilo "Línea" y footer con wordmark | **SS `chrome.js`** |
| Transiciones | Solo `ClientRouter` y `persist` | "La Onda" más morphs de tarjeta y lightbox | "El Arco" más lightbox FLIP | **RW** (morph tarjeta a ficha) y **SS** (lightbox) |
| Deploy | `deploy.yml` base | Igual más `PUBLIC_DEMO` | Igual más `PUBLIC_DEMO` | **SS o RW** (idénticos), corrigiendo el bug del `\|\|` |
| `tools/` | No existe | Python específico de producto | `tools/qa/shoot.mjs`, `perf-section.mjs`, `audit.mjs` y `deep-audit.workflow.js` | **SS `tools/qa/`** |
| Docs | Solo README | README con tabla "Actual a Propuesta" y pendientes | `docs/BRIEF.md`, `CONCEPTO.md` y `AUDITORIA.md` | **SS `docs/`** como método. **RW `README.md`** para la tabla de pitch al cliente |
| i18n | `useI18n` más envoltorios de 4 líneas | `i18n/index.js` más `routes.js` y capas de texto | Ninguno | **RW** (solo si el briefing lo pide) |
| SEO | hreflang, sin JSON-LD | hreflang, sitemap i18n y noindex en demo | JSON-LD, noindex por prop y robots dinámico | **SS `Base.astro`** más hreflang de RW |

### Qué NO arrastrar (bugs conocidos)
- **EXP**
  - Con reduced-motion en desktop, `.portal__*` queda invisible (`index.astro:324` frente a `global.css:287`). Es inferido.
  - `[data-reveal]{opacity:0}` no depende de `.js`.
  - `.sr-only` no tiene variante `:focus`, así que el skip link nunca se ve.
- **RW**
  - `rw:loader-exit` nunca se emite.
  - No hay botón `[data-marquee-toggle]`.
  - `PUBLIC_DEMO: ${{ vars.PUBLIC_DEMO || '1' }}`: la cadena vacía es falsa en Actions y siempre cae a `'1'`. SS tiene el mismo bug.
- **SS**
  - La imagen del hero tiene `loading=lazy` y `fetchpriority=low`.
  - `const base = import.meta.env.BASE_URL…` repetido unas 15 veces.
  - CLS de carga de 0.008 por falta de fallback métrico de fuente.
  - Los iconos `icons`/`svcIcon` están duplicados en 4 archivos.

---

## 3. Scaffold recomendado

```
Rediseño VisualDents/
  package.json  astro.config.mjs  tsconfig.json  .gitignore  .env.example
  .claude/launch.json
  .github/workflows/deploy.yml
  docs/            BRIEF.md  CONCEPTO.md  QA.md
  tools/
    qa/            shoot.mjs  perf-section.mjs  audit.mjs  deep-audit.workflow.js
    img/           make-variants.mjs        (nuevo, sharp: AVIF/WebP + 320w para public/ig)
  public/          favicon.svg  apple-touch-icon.png  og.jpg  brand/  ig/
  src/
    layouts/Base.astro
    pages/         index  tratamientos/{index,[slug]}  nosotros  contacto  404  robots.txt.ts  kit.astro(temporal)
    components/
      chrome/      Header  Footer  Loader  Logo  WhatsAppFab(+barra "Agendar cita")
      home/        Hero  Manifiesto  Instagram  Casos  Visita  Quiz  Resenas
      treatments/  ...
      pages/       PageHero  PostStrip  OtrosTratamientos
      ui/          Cta  Icon  Lightbox  Compare
    scripts/       engine.js  chrome.js  lightbox.js  compare.js  quiz.js  + 1 por escena
    data/          site.js  posts.js  casos.js  treatments.js  quiz.js  quiz.check.mjs
    lib/           url.js  seo.js
    styles/        tokens.css  base.css  transitions.css
```

Si el briefing exige inglés, añadir `src/i18n/{index,routes,es,en}.js` y `src/pages/en/*`.

Mapa de copia y adaptación:

| Destino | Origen | Adaptación |
|---|---|---|
| `package.json` | `SS/package.json:11-24` | Quitar `topojson-client` y `world-atlas`. Fijar versiones exactas. Añadir script `check:quiz` |
| `astro.config.mjs` | `SS/astro.config.mjs` (`site=SITE_URL\|\|undefined`, `base=PAGES_BASE\|\|'/'`, sitemap solo con `SITE_URL`) | Con i18n, añadir el bloque de `RW/astro.config.mjs:6-7`. **No** copiar `motionToClass` (`RW/astro.config.mjs:9-54`): el motor de SS usa el media query nativo |
| `tsconfig.json` | `SS/tsconfig.json` | Tal cual |
| `.github/workflows/deploy.yml` | `SS/.github/workflows/deploy.yml` | Corregir el bug de `PUBLIC_DEMO` (ver abajo) |
| `.env.example` | `EXP/.env.example` | Solo `PUBLIC_WHATSAPP`, `PUBLIC_GA_ID` y `PUBLIC_DEMO` |
| `.claude/launch.json` | `SS/.claude/launch.json` | Puerto 4321 |
| `src/layouts/Base.astro` | `SS/src/layouts/Base.astro` (JSON-LD `:32-45`, preload `:59-60`, import del engine `:85-87`, prop `noindex`) | JSON-LD con `Dentist`. hreflang de `RW/src/layouts/Base.astro:36-66` si hay i18n. No traer el tema oscuro de EXP |
| `src/scripts/engine.js` | `SS/src/scripts/engine.js` | Quitar tilt, magnetic y glow (`:302-330`) y `MotionPath`. Añadir pausa de marquesina por hover/foco y `.stack-veil` de `RW/src/scripts/engine.js:246-322`. Renombrar eventos `ssds:*` a `vd:*` |
| `src/scripts/chrome.js` | `SS/src/scripts/chrome.js` | Header `:84-122` y tema por sección `:111-119`. FAB `:125-169`. Transición `:12-34`. Footer `:254-293` es opcional. Quitar "La Línea" `:172-251` salvo que se pida |
| `src/styles/base.css` | `SS/src/styles/base.css:6-111` (tokens y temas), `:256-258`, `:281-286`, `:295-299` | Borrar `--navy-*`, `--orange-*` y `--grad-*`. Añadir el `@font-face "Fallback"` con `size-adjust` de `RW/src/styles/base.css:7`. Partir tokens en `tokens.css` |
| `src/styles/transitions.css` | `SS/src/styles/transitions.css:8-24` o `RW/src/styles/transitions.css:8-31` | Suavizar a fundido o círculo corto de unos 500 ms |
| `chrome/Header.astro` | `SS/src/components/chrome/Header.astro` | Con `transition:persist`. El menú `<dialog>` circular ya viene incluido |
| `chrome/Loader.astro` | `SS/src/components/chrome/Loader.astro` (una vez por sesión, botón Saltar, Esc, handshake `:194-234`) | Reemplazar la animación del hexágono por el trazo del logo, ≤1 s |
| `chrome/Logo.astro` | `RW/src/components/chrome/LogoMark.astro` (`data-draw`) | Usar el **vector oficial** de Visual Dental. El `Logo.astro` de SS es una aproximación |
| `chrome/Footer.astro` | `SS/…/Footer.astro` o `RW/…/Footer.astro` | Wordmark gigante con relleno por scroll |
| `chrome/WhatsAppFab.astro` | `SS/…/WhatsAppFab.astro` más `RW/…/MobileActionBar.astro` | Textos "Agendar cita" y "Llamar" |
| `home/Instagram.astro` | `SS/src/components/home/Instagram.astro` (script `:116-241`) | Quitar la ola de rayo y el efecto "power on". Mantener `ScrollTrigger.batch`, `img.decode()` y el fallback sin JS como enlaces |
| `ui/Lightbox.astro`, `scripts/lightbox.js` | `SS/src/components/ui/Lightbox.astro`, `SS/src/scripts/lightbox.js`. Alternativa: `RW/src/scripts/lightbox.js:23-32` (`startViewTransition`) | Tal cual |
| `data/posts.js` | `SS/src/data/site.js` (`posts`), `public/ig/*` | Estructura `{code,src,src320,w,h,alt,caption,url,kind}` |
| `home/Quiz.astro`, `data/quiz.js`, `quiz.check.mjs`, `scripts/quiz.js` | `SS/src/components/home/Diagnostico.astro`, `SS/src/data/diagnostico.js`, `SS/src/data/diagnostico.check.mjs`, `SS/src/scripts/diagnostico.js` | Chips y mensaje de WhatsApp. Sin medidor analógico. Es orientación, no diagnóstico |
| `ui/Compare.astro`, `scripts/compare.js` | `EXP/src/scripts/motion.js:329-344` (`initCompare`), `EXP/src/pages/index.astro:158-168` y CSS `.ba` `:399-412` | Reescribir al contrato `onPage`. Mantener `<input type=range>` y el hint de vaivén |
| `pages/tratamientos/*` | `SS/src/pages/servicios/{index,[slug]}.astro` (`getStaticPaths`). Morph: `RW/…/ProductCard.astro:20` y `ProductDetail.astro:66` (`transition:name`) | Datos en `data/treatments.js` |
| `components/pages/PageHero.astro` | `SS/src/components/pages/PageHero.astro` (entrada solo CSS, la LCP no espera al JS) | Quitar `HeroFx` |
| `ui/Cta.astro`, `ui/Icon.astro` | `SS/src/components/ui/{Cta,Icon}.astro` | Quitar rayos. Dejar solo iconos dentales, sin duplicar mapas por página |
| FAQ | `SS/src/pages/index.astro:36-44` (`<details name="faq">`) | Tal cual |
| `lib/url.js` | `RW/src/i18n/index.js:11` (`url()`, `asset()`) | **Un solo helper**. Prohibido repetir `BASE_URL` por componente |
| `data/site.js` | `SS/src/data/site.js` (forma) y `RW/src/data/site.js:38` (`buildWa`) | Comentario `confirm with client` en cada dato dudoso |
| `pages/robots.txt.ts` | `SS/src/pages/robots.txt.ts` o `RW/…` | Tal cual |
| i18n (condicional) | `RW/src/i18n/{index,routes}.js`, envoltorios `RW/src/pages/en/*`. Referencia: `EXP/src/i18n/index.js:10-21` | Solo si el briefing lo pide |
| `tools/qa/*` | `SS/tools/qa/*` | Cambiar la ruta de Chrome y `ROOT` (`deep-audit.workflow.js:17`). Reescribir los prompts |
| `docs/BRIEF.md`, `docs/CONCEPTO.md` | `SS/docs/BRIEF.md` (8 secciones), `SS/docs/CONCEPTO.md` (gates y contratos) | Reescribir con datos de Visual Dental. Añadir la tabla "Actual a Propuesta" de `RW/README.md` |

Fix de `PUBLIC_DEMO` en `deploy.yml`:
- Usar `PUBLIC_DEMO: ${{ vars.PUBLIC_DEMO != 'off' && '1' || '' }}`.
- Para producción, poner la variable del repo en `off`.
- Verificar que `robots.txt.ts` y el Footer evalúen truthiness y no comparen con `'1'`.

---

## 4. Catálogo de efectos, rankeado para marca dental minimalista y premium

### Núcleo (usar)

| # | Efecto | Origen | Cómo usarlo |
|---|---|---|---|
| 1 | `data-reveal` (up, blur, clip) y `data-stagger` | `SS/engine.js:145-168`, `RW/engine.js:143-169` | Ease `expo.out` de 0.9 s, `once`. Es el 80 % del dinamismo |
| 2 | `data-split` en **lines o words**, `data-lit` y `.underline-accent` | `SS/engine.js:171-192`, `EXP/src/styles/global.css:85-94` | Titulares por líneas. `lit` solo en la frase manifiesto. Sin `chars` |
| 3 | Muro o grilla de Instagram más Lightbox con morph | `SS/Instagram.astro`, `SS/lightbox.js` | Es el pedido central del briefing. Parallax en 2 profundidades, sin tilt 3D |
| 4 | Transición de página suave más header persistente, y morph tarjeta a ficha | `SS/transitions.css`, `SS/chrome.js:12-34`, `RW/ProductCard.astro:20` | "El Arco" y "La Onda" suavizados. Es la firma más fluida y menos tech |
| 5 | Comparador antes/después | `EXP/motion.js:329-344` | Mayor valor de negocio. Solo con casos reales y consentimiento. Operable con teclado |
| 6 | Header de cristal que se oculta al bajar, con tema por sección y menú `<dialog>` circular | `SS/chrome.js:84-122, 111-119` | Un tema claro dominante y quizá una sección oscura |
| 7 | Parallax suave en fotos (`data-parallax`, `data-depth`) | `SS/engine.js:195-207` | Solo desktop |
| 8 | Quiz que termina en WhatsApp | `SS/diagnostico.*` | "¿Qué necesitas?" con orientación, no diagnóstico |
| 9 | FAB de WhatsApp y barra móvil "Agendar cita" con `buildWa` y `ref` | `SS/WhatsAppFab.astro`, `RW/data/site.js:38` | Conversión medible sin analytics |
| 10 | FAQ con `<details name>` | `SS/index.astro:36-44` | Nativo, sin JS |

### Con moderación

| # | Efecto | Origen | Condición |
|---|---|---|---|
| 11 | Contadores `data-count` | `SS/engine.js:210-220` | Solo con cifras confirmadas por el cliente |
| 12 | Wordmark gigante que se rellena en el footer | `SS/chrome.js:254-293` | Si el logotipo lo admite |
| 13 | Reseñas apiladas sticky | `.stack-card`, `RW/engine.js:246-259` | Solo con reseñas reales, y con `.stack-veil` |
| 14 | Loader mínimo | `SS/Loader.astro` | ≤1 s, una vez por sesión, con Saltar y Esc |
| 15 | Marquesina lenta de la tira de IG | `RW/engine.js:261-322` | Con pausa por hover/foco y botón real |
| 16 | Una escena sticky "Tu visita paso a paso" | `SS/Recorrido.astro:465` (sticky por CSS, sin pin de ScrollTrigger) | **Máximo una** escena fijada |
| 17 | Hilo decorativo en el margen | `SS/Linea.astro`, `RW/Hilo.astro` | Solo si no recarga la composición |

### Evitar (demasiado "tech")
- WebGL: `SS/src/scripts/hero/campo.js` y `RW/src/scripts/hero/agua-viva.js`.
- Lente-medidor sobre el H1 y `data-tilt`, `data-magnetic` y `data-glow`.
- Pins largos de +100 % a +220 %: Tablero, Transferencia, SeisEtapas, el hero fijado de EXP y el horizontal de Pillars.
- Canvas de partículas, mapa de Cobertura y escenas de simulación.
- `.streak`, `.grid-bg`, blobs con blur, `-webkit-text-stroke` pesado y `chars` con `rotateX`.
- Marquesina con `playbackRate` hasta 24× (`SS/engine.js:253-298`).
- Loader "El Arranque" y vídeos de pantalla.
- La política RW de ignorar `prefers-reduced-motion`.
- Paletas navy, naranja, aqua o lima y degradados de marca de otros clientes.

---

## 5. Convenciones y reglas

**Accesibilidad (objetivo WCAG 2.2 AA)**
- Skip link visible en `:focus`.
- `:focus-visible` de 3 px.
- Objetivos táctiles ≥44 px.
- `<dialog>` nativo para menú y lightbox.
- `aria-live` en quiz y calculadoras.
- Cada canvas o escena fijada lleva equivalente en texto.
- Marquesinas con pausa real.
- Comparador con `aria-label` y `aria-valuetext`.
- Contraste validado por token. Crear variantes `--*-ink` para texto sobre claro (patrón de `RW/base.css`): el eyebrow naranja de SS dio 3.6-3.9:1.
- `alt` real en cada foto de Instagram.

**Reduced-motion y modo calma**
- `env.reduced` sale del media query nativo (SS).
- Estado final estático: sin loader, sin Lenis, sin pins, y `opacity:1` forzada.
- Reducir también `transform`, no solo opacidad. El CSS global de EXP no lo hacía.
- Interruptor "Reducir movimiento" opcional en el footer: clase `html.calm` más `localStorage`, tomando la idea de `RW/chrome.js:41-45`.
- Reiniciar el motor al cambiar el media query (`SS/engine.js:394-400`).

**Sin JS y robustez**
- Pre-ocultar solo bajo `html.js`, con failsafe CSS de 4 s.
- Cada escena declara en su cabecera su comportamiento en desktop, táctil y reduced (tabla de gates de `SS/docs/CONCEPTO.md`).

**Performance**
- Animar solo `transform`, `opacity`, `clip-path` y variables CSS.
- Lenis y pins solo con `(min-width:768px) and (pointer:fine) and (prefers-reduced-motion:no-preference)`.
- `lagSmoothing(0)`.
- Marquesinas y loops pausados fuera de pantalla (`data-offscreen`).
- Imagen LCP con `fetchpriority="high"`, sin `lazy`.
- Preload del woff2 latin y fallback métrico para toda fuente (corrige el CLS 0.008 de SS).
- Presupuesto: CLS 0, y no superar los ~175 KB sin comprimir del bundle de motor de SS. Quitar `MotionPath` y tilt debería bajarlo.
- Imágenes: ninguno de los tres repos usa `astro:assets`. Probar con un spike de A7 si `<Image>` o `<Picture>` (AVIF/WebP, `sharp` ya instalado) funciona bien bajo `PAGES_BASE`. Si no, usar `tools/img/make-variants.mjs` y `srcset` a mano.

**i18n**
- Por defecto `lang="es"` único (modelo SS).
- Si el briefing pide más idiomas, adoptar el modelo RW: `useI18n`, `routes.js`, envoltorios de 4 líneas, hreflang y sitemap con locale regional.

**SEO local**
- JSON-LD `Dentist` con `telephone`, `address`, `geo`, `openingHoursSpecification`, `areaServed` y `sameAs` (Instagram, Google Business).
- Una página por tratamiento con `title` y `description` únicos.
- NAP idéntico en toda la web.
- `og:image:alt`, `twitter:image` y OG por página (pendiente en los tres repos).
- Canonical y sitemap solo con `SITE_URL`. `noindex` y cinta "propuesta" mientras `PUBLIC_DEMO` esté activo.

**Honestidad de contenido (regla heredada de SS `docs/BRIEF.md`)**
- No inventar cifras, reseñas ni casos.
- Marcar "Simulación ilustrativa" lo que lo sea.
- Evitar promesas clínicas ("sin dolor", "100 %") salvo confirmación del cliente.
- Imágenes de pacientes solo con consentimiento.

**Proceso**
- Commits en español, descriptivos y con medición (por ejemplo "CLS 7.6 a 0").
- En Git Bash de Windows, anteponer `MSYS_NO_PATHCONV=1` a comandos con rutas `/...`.

---

## 6. Reparto para construir con 7 agentes (Sonnet 5.5) más orquestador

### Fase 0: el orquestador, en serie, antes de paralelizar
Crea y congela:
- `package.json`, `astro.config.mjs`, `tsconfig.json`, `deploy.yml`.
- `src/layouts/Base.astro`, `src/styles/{tokens,base}.css`.
- `src/scripts/engine.js` (copia recortada).
- `src/lib/url.js` y `src/lib/seo.js` (stub).
- `src/data/site.js`.
- Stubs de `posts.js` (3 entradas) y `treatments.js`.
- `src/pages/index.astro` (solo ensambla componentes) y `src/pages/kit.astro` (página temporal con todos los `data-*` y componentes base).

**Gate de Fase 0:** `npm run build` limpio y `/kit/` renderizando.

Después ejecutar `git init` y dar un worktree por agente (`agent/aN-*`). Como los archivos son disjuntos, el merge es trivial y los builds no chocan. Si no se usan worktrees, solo un agente construye a la vez y el resto usa `npm run dev -- --port 43xx`.

### Contratos compartidos (nadie los edita sin pasar por el orquestador)
1. **Tokens** (`tokens.css`): `--bg --fg --muted --accent --accent-text --line --card --focus`, `--step--1…--step-6`, `--section-y --container --gutter`, `--ease-out/-in-out/-spring`, `--d-fast/-base/-slow`, `--z-*`. Los valores de marca salen del logo y del Instagram, validados a AA.
2. **Motor:** cada escena es un componente con `<style>` y `<script>` que llama a `onPage(({gsap, ScrollTrigger, SplitText, env, lenis, scrollTo, introGate, emit, onRefresh, getLenis, markLite}) => cleanup)`. Sale si su raíz no existe.
3. **Atributos declarativos:** `data-reveal`, `data-stagger`, `data-split`, `data-lit`, `data-parallax`, `data-depth`, `data-count`, `data-draw`, `data-offscreen`.
4. **Marcado de sección:** `<section id data-theme aria-labelledby>`. Props `mode="static"` donde haya versión sin movimiento.
5. **Eventos:** `vd:ready` y `vd:loader-done` (con `{x,y}`).
6. **Helpers:** `url()`, `asset()` y `wa({text, ref})` en `src/lib/url.js` y `site.js`. Prohibido usar `BASE_URL` directamente.
7. **Forma de datos:** `posts.js` exporta `{code,src,src320,w,h,alt,caption,url,kind:'img'|'reel'}`.
8. **CSS:** cada agente escribe estilos con alcance de componente. `base.css` y `tokens.css` están congelados. Si falta un token, se pide al orquestador.
9. **Contenido:** los datos nuevos van en `data/<área>.js`, nunca en `site.js` (que es solo del orquestador, append-only). Todo dato dudoso lleva `// confirm with client`.

### Fase 1: agentes en paralelo

| Agente | Posee (solo estos archivos) | Entrega |
|---|---|---|
| **A1 Chrome** | `src/components/chrome/**`, `src/scripts/chrome.js`, `src/styles/transitions.css` | Header, menú, footer, loader, logo vectorial, FAB y barra "Agendar cita", transición suave |
| **A2 Home narrativa** | `src/components/home/{Hero,Manifiesto,Visita,Resenas}.astro`, `src/scripts/{hero,visita,resenas}.js` | Hero con H1 por líneas y columnas de posts, manifiesto con `lit`, "Tu visita" (una escena sticky), reseñas |
| **A3 Instagram y casos** | `src/components/home/{Instagram,Casos}.astro`, `src/components/ui/{Lightbox,Compare}.astro`, `src/scripts/{lightbox,compare}.js`, `src/data/{posts,casos}.js`, `public/ig/**`, `tools/img/**` | Muro de IG, lightbox con morph, comparador, script de variantes de imagen |
| **A4 Tratamientos** | `src/pages/tratamientos/**`, `src/components/treatments/**`, `src/data/treatments.js`, `src/scripts/treatments.js` | Índice y ficha por tratamiento con morph tarjeta a ficha |
| **A5 Conversión** | `src/components/home/Quiz.astro`, `src/components/ui/{Cta,Faq}.astro`, `src/pages/contacto.astro`, `src/components/contact/**`, `src/data/quiz.js`, `src/data/quiz.check.mjs`, `src/scripts/quiz.js` | Quiz a WhatsApp con autoprueba, contacto con `WaComposer` y mapa en fachada, FAQ, CTA |
| **A6 Interiores y SEO** | `src/pages/{nosotros,404}.astro`, `src/components/pages/**`, `src/pages/robots.txt.ts`, `src/lib/seo.js` | PageHero y páginas interiores, JSON-LD `Dentist` completo y OG por página. Si hay i18n, también `src/i18n/**` |
| **A7 Plataforma y QA** | `tools/qa/**`, `.github/workflows/**`, `docs/**`, `.env.example`, `README.md` | QA adaptado (Chrome, `ROOT`), `docs/BRIEF.md` y `CONCEPTO.md`, spike de `astro:assets`, auditoría final |

Reglas de cruce:
- Solo el orquestador toca `src/pages/index.astro`. Cada agente entrega un componente con `export` por defecto y `props` documentadas en `kit.astro`.
- Los agentes leen `posts.js`, `site.js` y `treatments.js` pero no los editan.

### Fase 2 y 3
- **Fase 2, integración.** El orquestador mergea en este orden: A1, A3, A4, A2, A5, A6, A7. Luego ensambla `index.astro`.
- **Fase 3, auditoría** (método de `SS/tools/qa/deep-audit.workflow.js`):
  1. Auditores independientes por área (a11y, performance, responsive 320 a 2560, SEO).
  2. Correctores.
  3. Verificadores distintos de los correctores.
  4. Regresión final.
- **Criterios de salida:**
  - Build limpio y consola limpia.
  - CLS 0 y sin desborde de 320 a 2560.
  - Áreas táctiles ≥44 px.
  - Capturas con `--reduced` y sin JS.
  - `quiz.check.mjs` verde.
  - `kit.astro` eliminado.

---

## 7. Preguntas abiertas que dependen del briefing

1. **Marca**
   - ¿Hay logo vectorial (SVG) y hexadecimales oficiales de la paleta?
   - ¿Qué tipografía usan en sus piezas de Instagram?
   - ¿Se admite una sección oscura o todo es claro?
2. **Idioma y mercado**
   - ¿Solo español o también inglés?
   - ¿Qué país y ciudad (código regional, formato de teléfono y WhatsApp)?
3. **Sedes y contacto**
   - ¿Una o varias sedes, con dirección, horarios, teléfono y número de WhatsApp?
   - ¿Existe perfil de Google Business?
   - ¿Hay agenda online (Doctoralia, Calendly u otra) o solo WhatsApp?
4. **Tratamientos**
   - ¿Cuáles tienen página propia y en qué orden?
   - ¿Se muestran precios?
5. **Equipo**
   - ¿Qué doctores aparecen, con qué credenciales y fotos, y con qué papel para Alek?
6. **Casos antes/después**
   - ¿Hay casos reales con consentimiento y cuántos?
   - Si no hay, el comparador se omite. No usar simulaciones.
7. **Reseñas y cifras**
   - ¿Hay reseñas reales (de Google, por ejemplo)?
   - ¿Hay cifras confirmables (años, pacientes)? Si no, se omiten los contadores.
8. **Instagram**
   - ¿Cuál es el handle y cuáles son los posts a incluir, en particular los que le gustaron a Alek?
   - ¿Hay derechos de uso de las imágenes y reels propios (para decidir si hay vídeo)?
   - ¿El feed es curado estático (recomendado) o en vivo?
9. **Conversión y analítica**
   - ¿Cuál es el CTA principal: WhatsApp, formulario o agenda?
   - ¿Se quiere quiz?
   - ¿Hay backend para formularios?
   - ¿GA4 o Meta Pixel, y por tanto banner de cookies?
10. **Web actual**
    - ¿Hay URLs antiguas que preservar? GitHub Pages no hace redirecciones 301.
    - ¿Qué páginas del sitio actual se mantienen?
11. **Legal**
    - ¿Qué aviso de privacidad y qué restricciones de publicidad sanitaria aplican?
    - ¿Existe política de uso de imágenes de pacientes?
12. **Despliegue**
    - ¿Cuál es el dominio final?
    - ¿Dónde se aloja la demo (repo y GitHub Pages)? `PUBLIC_DEMO` va activo hasta producción.
13. **Movimiento**
    - ¿Qué nivel de animación aprobó Alek?
    - ¿Se incluye el interruptor "Reducir movimiento"?
    - ¿Se quiere loader?