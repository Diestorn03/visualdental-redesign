# Informe expertsddt (C:\Users\diegoa.cardozo\Desktop\Rediseño ExpertsDDT)

# Informe: Rediseño Experts DDT (repo `Rediseño ExpertsDDT`)

Modo solo lectura. No se ejecutó install, build ni dev. Rutas relativas a `C:\Users\diegoa.cardozo\Desktop\Rediseño ExpertsDDT`.

**Hallazgos previos que cambian el brief:**
- No existen `tools/`, `docs/`, `tsconfig.json`, `CLAUDE.md` ni skills en `.claude/`. Solo hay `.claude/launch.json`.
- No hay `<Image>` ni `sharp`. Los assets se procesaron fuera del repo y se sirven desde `public/`.
- El repo tiene 12 commits, del 17 al 23 de septiembre. Solo `.claude/launch.json` tiene cambios sin commitear.

---

## 1. Stack y versiones exactas

Versiones leídas de `node_modules/*/package.json`:

| Pieza | Versión | Nota |
|---|---|---|
| astro | 7.3.3 | `package.json` pide `^7.3.3` |
| gsap | 3.15.0 | Incluye `ScrollTrigger` y `SplitText` (plugins gratuitos desde 3.13) |
| lenis | 1.3.26 | |
| @astrojs/sitemap | 3.7.4 | |
| Node | 22 | En CI (`.github/workflows/deploy.yml`); local v26.5.1 |

- Sin TypeScript de proyecto. Solo `robots.txt.ts` y `interface Props` en frontmatter.
- Sin framework de UI ni Tailwind. El CSS es vanilla.
- Un único `src/styles/global.css` más bloques `<style>` con scope por página.
- Scripts (`package.json`): `dev`, `build`, `preview`.

---

## 2. Arquitectura

```
src/
  layouts/Base.astro          head, loader, nav, menú móvil, footer, ClientRouter, script motion (195 líneas)
  components/                 Cta, Apex, Analytics (3 archivos)
  i18n/                       en.js, es.js, index.js (useI18n)
  pages/                      index (515), services, courses, store, exocad-libraries, contact, robots.txt.ts
  pages/es/                   6 envoltorios de 4 líneas
  scripts/motion.js           455 líneas: Lenis + GSAP, todo por data-attributes
  styles/global.css           288 líneas: tokens, botones, nav, footer, utilidades
public/{img,video,img/brand}  assets estáticos
```

**Cómo se construyen las páginas**
- Cada página envuelve su contenido en `<Base title=...>`. Los estilos de sección viven en el `<style>` de la propia página.
  - `index.astro:270-515` tiene todo el CSS de la home.
- Las rutas `/es/*` son envoltorios de 4 líneas que importan la página en inglés:
  - `src/pages/es/index.astro:2-4` hace `import Page from '../index.astro'; <Page />`.
  - Funciona porque `Astro.currentLocale` cambia según la ruta.

**Contenido**
- Todo el texto está en `src/i18n/en.js` y `es.js`, con la misma forma. Es un diccionario JS plano, sin collections.
- Los dos archivos tienen 187 y 186 líneas, así que van prácticamente paralelos.
- Las páginas solo maquetan: `{t.hero.title[0]}`, `t.services.items.map(...)`.
- El HTML en títulos se inyecta con `set:html` (`Cta.astro:12`, spans `.cta__accent`).

**i18n** (`astro.config.mjs`)
- `i18n: { defaultLocale:'en', locales:['en','es'], routing:{prefixDefaultLocale:false} }`
- `useI18n(Astro)` (`src/i18n/index.js:10-21`) devuelve `{ t, lang, href, asset, alt, path, base }`.
  - `href(p)` antepone base y `/es`, y deja pasar `https:`, `mailto:`, `tel:` y `#`.
  - `asset(p)` antepone base.
  - `alt` es el enlace al otro idioma, calculado quitando base y `/es`.
- `hreflang` en `Base.astro:36-38`, más sitemap por idioma.

**Base path**
- `astro.config.mjs`: `site = SITE_URL || 'https://expertsddt.com'`, `base = PAGES_BASE || '/'`, `trailingSlash:'always'`.
- `src/i18n/index.js:7`: `base = import.meta.env.BASE_URL.replace(/\/$/, '')`.
- Toda URL interna pasa por `href()` o `asset()`. No hay rutas absolutas hardcodeadas, salvo en `vercel.json`.

**Router y persistencia**
- `ClientRouter` (View Transitions) en `Base.astro:71`.
- El header usa `transition:persist={`nav-${lang}`}` (`Base.astro:82`). El script se carga una vez y se reinicia con `astro:page-load`.

---

## 3. Sistema de diseño

**Tokens** (`src/styles/global.css:4-35`)
```css
:root {
  --blue:#046bd2; --blue-dark:#045cb4; --blue-mid:#2a7abf; --navy:#1d3273; --navy-deep:#0f346e;
  --ink:#1e293b; --slate:#334155; --mist:#f0f5fa; --line:#d1d5db; --white:#fff;
  --surface:#fff; --nav-bg:rgba(255,255,255,.9); --muted:#64748b;
  --grad: linear-gradient(160deg, var(--blue-mid) 0%, var(--navy) 100%);
  --grad-blue: linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%);
  --radius:22px; --nav-h:76px;
  --font:'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --ease-out: cubic-bezier(.16,1,.3,1);
  color-scheme: light;
}
[data-theme="dark"] {
  --ink:#eef2f8; --slate:#b5c2d8; --mist:#101d3a; --line:#24345a;
  --surface:#0b1630; --nav-bg:rgba(11,22,48,.9); --muted:#8fa0bd; color-scheme: dark;
}
```
- A 560px baja `--nav-h` a 64px y `--radius` a 18px (`global.css:269`).

**Tipografía**
- Poppins 400-800 desde Google Fonts, con `<link rel=stylesheet>` y `preconnect` (`Base.astro:39-41`). No hay self-host.
- Escala fluida con `clamp()`:
  - `.h-display`: 2.2rem a 4.6rem, peso 800.
  - `.h-xl`: 1.85rem a 3.4rem.
  - `.h-lg`: 1.4rem a 2.2rem.
  - `.lead`: 1.05rem a 1.25rem.
- Los títulos usan `letter-spacing:-.02em`, `line-height:1.08` y `text-wrap:balance` (`global.css:58`).
- `.eyebrow` va en mayúsculas con tracking .18em y una rayita `::before` (`global.css:69-74`).

**Paleta**
- Azul de marca `#046bd2`, navy `#1d3273`/`#0f346e`, fondos `#f0f5fa`. Extraída del WordPress del cliente (README).
- Otros colores sueltos y hardcodeados:
  - `#0a1a3a` en footer, loader y hero.
  - `#6fb6ff` y `#8fc1ff` para texto sobre oscuro.
  - `#25d366` en WhatsApp.
  - `#f5b301` en estrellas.
- No son tokens, así que hay deuda de tokenización.

**Espaciado y grid**
- Sin escala formal. Se usan `rem` sueltos y `clamp`.
  - `.section`: `padding-block: clamp(4rem,10vw,8.5rem)`.
  - `.wrap`: `width:min(1200px, 100% - 2rem)`.
  - `.nav__inner`: 1240px.
- Utilidades: `.grid-2/3/4`, `.stack` (`gap:1.25rem`), `.cta-row`.
- Breakpoints: 1180px (nav a hamburguesa y fin de escenas fijadas), 960px y 560px.

**Dark mode**
- Atributo `data-theme` en `<html>`. Un script inline en `<head>` lo aplica antes del primer pintado (`Base.astro:51-59`).
  - Lee `localStorage.theme`, con fallback a `prefers-color-scheme`.
- Se reaplica en `astro:after-swap`. El toggle está en `initTheme` (`motion.js:71-86`).
- Hay un bloque de excepciones para texto azul en oscuro (`global.css:248-249`).

**Primitivas visuales**
- `.btn`: pill de 999px con barrido de brillo skew en `::after` (`global.css:97-121`).
- `.card` con sombra doble, `.card--grad`.
- `.pill` y `.underline-accent`: subrayado como `background-size` animado, que sigue al texto si hace salto de línea (`global.css:85-94`).
- `.grid-bg`: rejilla de 64px enmascarada con radial (`global.css:228`).
- Texto contorneado: `-webkit-text-stroke` en `.footer__ghost`, `.hero__ghost`, `.pillar__num`, `.marquee`.
- Nav de cristal con `backdrop-filter`.
- Menú móvil con `clip-path: circle()` que se abre desde el burger (`global.css:167-173`).

---

## 4. Sistema de motion

**Lenis** (`motion.js:36-53`, `initLenis`)
- `new Lenis({ lerp:0.16, wheelMultiplier:1, smoothWheel:true })`.
- Se integra con GSAP así:
  - `lenis.on('scroll', ScrollTrigger.update)`.
  - `gsap.ticker.add(t => lenis.raf(t*1000))`.
  - `gsap.ticker.lagSmoothing(0)`.
- Los clics en anclas `#x` pasan por `lenis.scrollTo(el, {offset:-70})`.
- Se inicializa una sola vez, a nivel de módulo (`motion.js:447`).
- El CSS de Lenis se importa en `Base.astro:6`. `data-lenis-prevent` va en iframe y formulario de contacto.
- Con reduced-motion no se crea Lenis.

**Plugins GSAP:** `ScrollTrigger` y `SplitText` (`motion.js:21`).

**Ciclo de vida** (`motion.js:419-455`)
- `boot()` corre en cada `astro:page-load`.
  - Revierte el `gsap.context` anterior, quita listeners de refresh, mata los ScrollTriggers y reconstruye.
- `astro:before-swap` hace teardown.
- `astro:after-swap` elimina el loader y hace `lenis.scrollTo(0, {immediate:true})`.
- Cruzar el breakpoint de 1180px reinicia todo con un debounce de 150ms.
- `history.scrollRestoration='manual'` y `scrollTo(0,0)` al cargar (`motion.js:28-29`).
- `ScrollTrigger.refresh()` tras `document.fonts.ready` y tras `load`.

**Política reduced-motion**
- Variable `reduced` evaluada una sola vez al cargar (`motion.js:23`). No escucha cambios.
- CSS (`global.css:282-288`):
  - Pone animaciones y transiciones a `.01ms`.
  - Fuerza `[data-reveal], [data-split]` a visibles con `!important`.
- Efectos desactivados en JS con `reduced`:
  - Lenis.
  - Hero fijado.
  - Pillars horizontal.
  - Card stack.
  - Hint de comparador.
  - Tilt, magnetic y glow.
  - Velocidad del marquee.
- Efectos desactivados con `coarse` (puntero táctil):
  - Parallax.
  - Chars a words.
  - Tilt, magnetic y glow.
- Hay una laguna importante. Ver sección 7.

**Efectos firma**

| Efecto | Archivo y marcado | Cómo funciona |
|---|---|---|
| Loader de primera carga | `Base.astro:60-70,76-79` + `initLoader` (`motion.js:56-68`) | Overlay navy con la marca incrustada en base64 y barra. Espera a que decodifique la imagen y carguen las fuentes. Mínimo 500ms, máximo 2s. Sale con `clip-path inset` y emite `loader:done`. |
| Intro del hero | `initHero` `motion.js:195-222` | Timeline pausada con `fromTo` por capas: bg scale 1.15 a 1, eyebrow, títulos `.w` con `yPercent`, lead, CTAs, laptop `.hero__rise`, ghost text. Arranca en `loader:done`, o tras decodificar imagen y fuentes (máx. 400ms) en navegación cliente. |
| Hero fijado con scrub | `motion.js:226-240` | `pin:true`, `end:'+=120%'`, `scrub:.5`. El copy sube y se desvanece. El laptop pasa de `{x:'6vw',y:'18vh',scale:.86}` a centro. Una capa `.hero__dim` sube de opacidad en vez de usar filter. Aparece el capítulo del portal con stagger `back.out`. Solo desktop. |
| Pillars: scroll horizontal | `initPillars` `motion.js:244-274`, markup en `index.astro:87-125` | Pin de la sección y `x: -scrollWidth` con `RATIO .55`. HUD con barra de progreso y contador. Parallax interno `xPercent` de cada media con `containerAnimation`. Copy con stagger al entrar. En móvil o reduced pasa a `.is-static`. |
| Reveals declarativos | `initReveals` `motion.js:127-157` | `data-reveal="up|down|left|right|scale|blur|skew|clip|drop|iris"` con `data-delay` y `data-start`. `fromTo` con ScrollTrigger `once`. Marca `.is-inview` en el elemento, que activa `.underline-accent`. |
| Stagger de hijos | `motion.js:152-156` | `data-stagger=".08"` en el contenedor. Hijos con `y:60`, `skewY:3`, `clearProps:'transform'`. |
| Split text | `initSplits` `motion.js:160-177` | `data-split="chars|words|lines"` con `SplitText`. Chars: cilindro con `rotateX -90`. Words: `y 110%`. Lines: máscara con `yPercent`. En táctil, chars se degrada a words. |
| Iluminado palabra a palabra | `initLit` `motion.js:277-283` | `data-lit`. SplitText en words, opacidad .18 a 1 con `scrub:.6`. Se usa en la sección About. |
| Parallax | `initParallax` `motion.js:180-192` | `data-parallax="0.35"` mueve `yPercent ±amt*40` con scrub. `data-depth` 0-5 mapea a factores. Desactivado en táctil. |
| Card stack de reseñas | `initStack` `motion.js:286-296` + `.stack-card` sticky (`index.astro:486`) | Cada card hace `position:sticky` con `top` escalonado. Con scrub, la anterior reduce escala y baja el opacity de sus hijos, no del fondo. |
| Marquee reactivo al scroll | `initMarquee` `motion.js:301-326` | Duplica el track. Un ticker de GSAP lo mueve con velocidad base más la velocidad de scroll, `translate3d`, y pausa si no es visible (IntersectionObserver). |
| Contadores | `initCounters` `motion.js:347-353` | `data-count="80"` tween de 0 al valor al entrar en vista. |
| Comparador antes/después | `initCompare` `motion.js:329-344`, markup `index.astro:158-168` | `<input type=range>` invisible sobre dos imágenes. `--pos` controla un `clip-path`. Al entrar en vista hace un vaivén 50, 26, 72, 50 como pista. Lo cancela cualquier interacción. |
| Tilt 3D y magnetic | `initPointerFx` `motion.js:356-376` | `data-tilt` con `quickTo` de `rotationX/Y` (±6°). `data-magnetic` desplaza el elemento un 30% hacia el cursor. |
| Glow que sigue al cursor | `initGlow` `motion.js:408-417` | `data-glow` escribe `--gx/--gy`. Un radial-gradient en `.svc::before` los consume (`index.astro:437`). |
| Vídeos por visibilidad | `initVideos` `motion.js:379-405` | Siempre muted. `play`/`pause` por IntersectionObserver con `rootMargin 200px`. Los vídeos con `display:none` (móvil) pierden el `src`. Reanuda el vídeo del hero al volver a la pestaña. |
| Nav sólido por scroll | `initNav` `motion.js:89-124` | ScrollTrigger que añade `.is-solid`. En la home con hero fijado, se activa cuando el hero se suelta. En el resto, a 80px. |
| Menú móvil | `motion.js:110-123` + `global.css:167-189` | Clip-path circular desde el burger y links en cascada con `transition-delay`. Pausa Lenis al abrir. |
| Fondo ambiental | `index.astro:282-287` | Tres blobs `.hero__glow i` con blur y animación `drift`. Más `.float-loop` y `about__orbit` (CSS puro). |
| CSS puro | `global.css:104-109,231`, `index.astro:307,381` | Brillo skew en botones, pulso del FAB, `scrollHint`, flecha `nudge`, órbita `spin`. |

**Pre-posicionado anti-parpadeo.** El script inline añade la clase `html.js` (`Base.astro:54`). El CSS de `index.astro:322-326` pre-oculta los elementos del hero y del portal, y posiciona el laptop, antes de que arranque GSAP. Mismo principio en `[data-reveal]{opacity:0}` y `[data-split]{visibility:hidden}` (`global.css:124-125`).

**View Transitions.** Solo `ClientRouter` más `transition:persist` en el header. No hay animaciones `transition:animate` ni morph entre páginas propias.

---

## 5. Catálogo de componentes

**Archivos `.astro` reales**
- `layouts/Base.astro`: shell completo. Head, SEO, loader, header con logo dual claro/oscuro, menú móvil, footer con texto fantasma, `<Apex/>`, script de motion.
- `components/Cta.astro`: bloque de cierre navy con glow. Acepta `title`/`text`, que vienen por `set:html`. Lo usan todas las páginas internas.
- `components/Apex.astro`: botones flotantes WhatsApp y concierge. Monta el widget `@n8n/chat` desde CDN si hay webhook. Si no, el botón enlaza a contacto.
- `components/Analytics.astro`: GA4 detrás del banner de cookies. No renderiza nada sin `PUBLIC_GA_ID`.

**Patrones por clase CSS** (son maquetación repetida, no componentes)

| Patrón | Dónde | Propósito |
|---|---|---|
| `.page-hero` | `global.css:225-228` | Hero de páginas internas: navy, gradientes radiales, `.grid-bg` |
| `.pillar` / `.pillars__track` | `index.astro:369-428` | Panel horizontal de media + copy con estado `.is-static` |
| `.svc` | `index.astro:436-448` | Tarjeta de servicio con icono SVG inline, tilt y glow |
| `.ba` | `index.astro:399-412` | Comparador antes/después |
| `.stack-card` | `index.astro:486` | Reseña sticky apilada |
| `.marquee` + `.stat` | `index.astro:451-462` | Cinta de keywords y contadores |
| `.res` | `index.astro:502-513` | Tarjetas de recursos y tienda con precio tachado |
| `.portal__feature` | `index.astro:316` | Tarjeta de cristal con icono |
| `.course`, `.product`, `.cat`, `.step`, `.channels`, `.form`, `.jump`, `.tags` | Páginas internas | Piezas de cada página |

---

## 6. Pipeline de assets

- **Imágenes:** WebP con pérdida en `public/img`, servidas directamente.
  - Sin `<Image>`, `astro:assets`, `sharp`, `srcset` ni AVIF.
  - Usan `width`/`height` explícitos en `<img>` y `loading="lazy"`; los héroes llevan `fetchpriority="high"` y `preload` (`index.astro:27-28`).
- **Vídeo:** MP4 H.264 sin audio, bucles de 10-14 s a 720px, de 0,4 a 1,3 MB. Cada uno lleva un `poster` WebP del mismo nombre.
  - Hay 6 MP4 en `public/video/`.
  - `smile-design.mp4` es el del hero, con poster `design-services.webp`.
  - Los tags llevan `autoplay muted loop playsinline`, y el JS quita `autoplay` y controla `play()`.
  - En móvil el vídeo del hero se oculta por CSS (`index.astro:355`).
- **Fuentes:** Google Fonts CDN, Poppins 400-800, `display=swap`.
- **Íconos:** SVG inline pegados como `path d`.
  - Arrays `icons` y `featureIcons` en `index.astro:8-16`.
  - Los sociales, el carrito, el sol y la luna van inline en `Base.astro`.
  - No hay librería de iconos.
- **Marca:** `logo.webp` (original), `logo-light.webp` (reverso para fondos oscuros) y `mark.webp`.
  - La marca se inlinea como `data:` base64 en el loader con `readFileSync` en build (`Base.astro:22`).
  - Dos `<img>` superpuestas con crossfade cambian el logo según el estado del nav.
- **Favicons/OG:** `favicon-32.png`, `apple-touch-icon.png` y un único `og.jpg` de 1200x630, sin imagen por página.
- **Origen:** los assets salieron de un `assets.rar` del cliente de 850 MB que no se versiona. La tabla de procedencia está en el README.

---

## 7. SEO, accesibilidad y performance

**Bien hecho**
- Seguridad y SEO base:
  - `canonical`, `hreflang` en/es/x-default (`Base.astro:35-38`) y sitemap i18n.
  - `robots.txt` como endpoint (`pages/robots.txt.ts`).
  - OG completo con `og:locale` y `twitter:card`.
  - Cabeceras de seguridad y caché inmutable en `vercel.json`.
- Accesibilidad:
  - `lang` dinámico, skip link, `aria-current`, `aria-label` en iconos y `aria-hidden` en decorativos.
  - `:focus-visible` con outline azul, targets de 42-48px y formulario con honeypot.
  - Comparador operable con teclado vía `input type=range`.
  - Dark mode.
- Performance:
  - HTML estático.
  - Solo se anima `transform`, `opacity` y `clip-path`. El oscurecido del hero es una capa, no un filtro.
  - Vídeos con `play` solo en viewport.
  - Móvil sin pin ni vídeo de fondo.
  - Marquee pausado fuera de pantalla.
  - Un solo bundle JS de unos 153 KB sin comprimir (`dist/_astro/Base.astro_astro_type_script_index_0_lang.*.js`).
  - CSS global de unos 16 KB.

**Lo que falta o falla**
1. **Bug con reduced-motion en desktop.**
   - `index.astro:324` pre-oculta `.portal__head`, `.portal__feature` y `.portal__cta` con `html.js` a partir de 1181px.
   - El override de reduced-motion en `global.css:287` solo cubre `[data-reveal]` y `[data-split]`.
   - En `initHero`, `desktop = !reduced && ...`, y con `reduced` se sale antes del timeline de scrub (`motion.js:224`).
   - Resultado: el capítulo del portal queda invisible.
   - Sus enlaces siguen con `pointer-events:auto` y absolutos sobre el hero.
   - El laptop se queda en `position:absolute`.
   - Es una inferencia por lectura de código, no se ejecutó la página.
2. **Reduced-motion solo parcial.** Reveals, splits, parallax, counters y el intro del hero siguen animando `x/y/scale/rotate`. El CSS solo fuerza opacidad y visibilidad. Parallax solo se corta con `coarse`.
3. **Sin fallback sin JS.** `[data-reveal]{opacity:0}` y `[data-split]{visibility:hidden}` no dependen de `.js`. Sin JS, esos bloques quedan ocultos. Tampoco hay `<noscript>`.
4. **Skip link nunca visible al enfocar.** `.sr-only` (`global.css:61`) no tiene variante `:focus`.
5. **Sin datos estructurados.** No hay JSON-LD (Organization, LocalBusiness, Dentist, Service). Falta `og:image:alt`, `twitter:image` y una OG por página.
6. **Fuentes.** Google Fonts bloquea el render y carga 5 pesos. Faltaría self-host con subset y `preload`.
7. **Imágenes.** Sin `srcset` ni responsive. `.hero__bg video` es `preload="auto"` sin condición de red o dispositivo.
8. **Idioma.** El `<html lang>` es `en`/`es` sin región. `hreflang` también.
9. **Color.** Varios hex hardcodeados, sin tokens. Hay un parche de contraste para el azul en dark (`global.css:247-249`). Los textos `#9fb3d4` sobre `#0a1a3a` conviene validarlos con AA.
10. **Marcadores de contenido provisional.** Reseñas marcadas "sample". Antes/después marcado como simulación. Esto es correcto y honesto. Para una clínica real hay que sustituirlos.

---

## 8. Deploy

**`.github/workflows/deploy.yml`**
- Dispara en `push` a `main` y en `workflow_dispatch`.
- Usa `configure-pages@v5` con `enablement:true` y `continue-on-error`, `setup-node@v4` (Node 22, cache npm), `npm ci`, `npm run build`, `upload-pages-artifact@v3` y `deploy-pages@v4`.
- Variables de build:
  - `SITE_URL=https://${{ github.repository_owner }}.github.io`
  - `PAGES_BASE=/${{ github.event.repository.name }}`
  - `PUBLIC_*` desde `vars.*`. `PUBLIC_WHATSAPP` tiene fallback `15106760418`.
- Permisos mínimos: `contents:read`, `pages:write`, `id-token:write`. Concurrencia `pages` con cancelación.
- Con dominio propio: añadir `public/CNAME` y quitar `PAGES_BASE` (README).

**`.env.example`**
- Todas las variables son opcionales: `PUBLIC_GA_ID`, `PUBLIC_N8N_FORM_WEBHOOK`, `PUBLIC_N8N_CHAT_WEBHOOK`, `PUBLIC_GCAL_EMBED`, `PUBLIC_SHOP_URL`, `PUBLIC_WHATSAPP`.
- Cada integración degrada sin variable:
  - El formulario abre `mailto:`.
  - El chat enlaza a contacto.

**`vercel.json`**
- `trailingSlash:true`, 4 redirecciones 301 de rutas antiguas de WordPress, cabeceras de seguridad y `Cache-Control: public, max-age=31536000, immutable` para `/img`, `/video` y `/_astro`.

**`.claude/launch.json`**
- Configuración de servidores de preview, no de despliegue.
- Define `astro-dev` (puerto 4321) y un `renewwater-preview`.
- Ese segundo apunta a otro repo (`renewwater-redesign`, puerto 4323) con `PAGES_BASE` y `SITE_URL=https://diestorn03.github.io`.
- El cambio está sin commitear.

---

## 9. tools/

No existe `tools/` ni ningún script auxiliar en el repo. No hay scripts de optimización de imágenes ni de vídeo, ni de verificación. El procesamiento de assets (WebP, recorte de vídeos, limpieza de fondos) se hizo fuera del repo y solo está descrito en el README.

---

## 10. Convenciones de trabajo

- **`.claude/`:** solo `launch.json`. No hay `CLAUDE.md`, skills, settings ni reglas escritas.
- **`docs/`:** no existe. La única documentación es `README.md` (en español), que cumple las funciones de brief y checklist:
  - Tabla "Qué cambia respecto a la web actual".
  - Tabla de paleta y tipografía "extraídas del sitio actual".
  - Tabla de procedencia de assets del cliente.
  - Sección "Accesibilidad y rendimiento".
  - Sección "Decisiones acordadas y pendientes".
  - Estructura de archivos.
- **Cómo se documentó la decisión de diseño:**
  - `motion.js:3-14` enumera las "Techniques applied (epic-design catalogue)". Es una pista de que se usó la skill epic-design.
  - Los comentarios del código explican el porqué de cada decisión de performance.
- **Convención de contenido:** el texto vive en `i18n/*.js` con la misma forma en ambos idiomas. Las páginas solo maquetan.
- **Convención de motion:** todo declarativo por `data-*`. Una página nueva no toca `motion.js`.
- **Git:** commits en inglés, en imperativo y descriptivos. Muestran el flujo: propuesta inicial, i18n y dark mode, pulido del hero y loader, QA.

---

## 11. Veredicto para Visual Dental

**Patrones y archivos más valiosos para reutilizar** (en este orden)

1. **`src/scripts/motion.js` (motor declarativo por `data-*`).**
   - Cubre `data-reveal`, `data-stagger`, `data-split`, `data-lit`, `data-parallax`, `data-count`, `data-tilt`, `data-magnetic`, `data-glow`.
   - Es lo más reutilizable. Para Visual Dental conviene quitar los efectos de tono "tech" (tilt 3D, magnetic) y dejar solo `reveal`, `split` en lines/words, `lit`, `parallax` suave y `count`.
2. **Ciclo de vida `boot()` / teardown con ClientRouter** (`motion.js:419-455`, `Base.astro:71,82`). Es la parte más delicada y ya está resuelta.
   - `transition:persist` en el header.
   - `astro:page-load`, `before-swap` y `after-swap`.
   - Reinicio al cruzar breakpoint.
3. **Patrón de pre-posicionado `html.js`** (`Base.astro:51-59`, `index.astro:322-326`, `global.css:124-125`) para que no haya primer frame desordenado. Hay que añadir el fallback sin JS que le falta.
4. **`src/i18n/index.js` y la estructura `en.js`/`es.js`** más los envoltorios `/es/*`. El helper `useI18n` con `href`, `asset`, `alt`, `path` y `base` resuelve idioma, base path y hreflang. Es independiente del cliente.
5. **Configuración de deploy:** `astro.config.mjs` con `site`/`base` por entorno, `trailingSlash`, i18n y sitemap, más `deploy.yml` para GitHub Pages. Se copia casi tal cual.
6. **Loader mínimo con marca inline en base64** (`Base.astro:21-22,60-70,76-79`). Es sobrio y rápido, y encaja bien con una clínica minimalista.
7. **Comparador antes/después** (`initCompare` y CSS `.ba`). Para una clínica dental es el patrón con más valor de negocio: casos clínicos reales con el hint de arrastre. Es accesible por teclado. Si se usa, necesita casos reales con consentimiento, no simulaciones.
8. **Marquee reactivo, contadores y underline animado** (`initMarquee`, `initCounters`, `.underline-accent`). Son ligeros y cambian poco al pasar a otro estilo.
   - El underline por `background-size` que sigue al texto en saltos de línea es especialmente limpio.
   - El marquee solo si la identidad lo admite.

**Específico de Experts DDT, NO copiar**
- Paleta azul/navy con degradados `--grad` y `--grad-blue`, todo el dark navy (`#0a1a3a`, `#0f346e`), los blobs `.hero__glow` y `.grid-bg`. Visual Dental tiene su propia paleta minimalista.
- Poppins 800 en mayúsculas y texto contorneado (`-webkit-text-stroke`). Es agresivo para una clínica minimalista.
- Hero "laptop del Doctor Portal" y todo el capítulo `.portal`. Es una escena pinned acoplada a un producto SaaS B2B. `index.astro:322-352` está muy enredado con ese layout.
- Pillars de scroll horizontal con `RATIO .55` y los ajustes de altura (`max-height:820px`). Responde a cuatro pilares con media pesada. Si se usa, que sea para tratamientos y con menos fricción.
- Contenido y marca: textos, stats ("2019", "80%", "<10s"), "The Wizard", Exocad, librerías, tienda Shopify, cursos, portal, Apex/n8n, GA4 y ese footer.
- Vídeos de pantalla de software y los renders `lib-*`.
- Tilt 3D, magnetic y glow del cursor (`initPointerFx`, `initGlow`). Dan un aire "tech/gaming" que choca con un enfoque dental minimalista.
- Los textos de reseñas "sample" y las simulaciones antes/después. Reemplazar por contenido real.

**Antes de reutilizar `motion.js`, arreglar:** el bug de reduced-motion con el portal oculto, el fallback sin JS, la reducción real de transform bajo reduced-motion, y el hecho de que `reduced` no escuche cambios. Conviene también pasar los hex sueltos a tokens y usar `<Image>` de `astro:assets` con AVIF/WebP responsive, porque aquí no se aprovecha.