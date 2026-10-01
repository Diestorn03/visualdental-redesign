# CONCEPTO · "The Ceramist's Notes": contrato de diseño y construcción

Lo leen todos los agentes antes de escribir código. Fuentes: `docs/BRIEF.md` (quién es el cliente y las referencias),
`docs/CONTENT.md` (todo el copy; **no inventar**) y `docs/STACK-PLAYBOOK.md` (stack y patrones de los repos previos).

**Idea:** la web dibuja, anota y estratifica como lo hace el laboratorio. Líneas finas que se trazan solas, anotaciones manuscritas
sobre fotografía macro y una receta que se revela capa a capa. Minimalista y monocroma como la marca, pero viva.

## 1. Stack (fijo)

- Astro 7.3.5, gsap 3.15.0 (ScrollTrigger, SplitText, DrawSVGPlugin; todos gratuitos en 3.15) y lenis 1.3.26.
  `@fontsource*` self-host, `@astrojs/sitemap`. Versiones exactas, sin `^`.
- CSS vanilla con alcance de componente. JS vanilla en ES modules. Sin Tailwind, sin frameworks UI, sin nuevas dependencias
  salvo las de esta lista (si hace falta otra, se justifica en el informe final y **no** se instala).
- **Una sola página** (`src/pages/index.astro`) más `404.astro`, `robots.txt.ts` y páginas de kit temporales.
- Deploy a GitHub Pages con `SITE_URL` y `PAGES_BASE`. `PUBLIC_DEMO` activo implica `noindex`, cinta "Proposal" y selector de paleta.

## 2. Tipografía

| Rol | Fuente (fontsource) | Uso |
|---|---|---|
| Display | **Instrument Serif** (400 + italic) | H1/H2, nombres de pasos ("Hand Finishing"), citas |
| Etiquetas | **Oswald Variable** | Eyebrows, nav, botones y "STEP 01" en MAYÚSCULAS con tracking 0.18–0.3em, como el wordmark del logo |
| Texto | **Inter Variable** | Párrafos, formulario, FAQ |
| Anotación | **Architects Daughter** | Solo para las anotaciones sobre fotos (Anatomy) y notas pequeñas a mano. Nunca en párrafos |

Precargar solo el woff2 latin de Instrument Serif y de Inter. Fallback métrico con `size-adjust` (patrón de `RW/src/styles/base.css:7`).

## 3. Color: dos paletas para evaluar (decisión del cliente: "haz las dos versiones")

`<html data-palette="amber|mono">`. Por defecto `amber`. Se puede cambiar con `?palette=mono|amber`, que persiste en `localStorage`
(con try/catch). Un script inline en `<head>` lo aplica antes del primer pintado. El selector visible solo existe si `PUBLIC_DEMO`.

Tokens semánticos (los componentes **solo** usan estos, nunca hex sueltos):

| Token | Uso | mono | amber |
|---|---|---|---|
| `--ink` | fondo oscuro / texto sobre claro | `#161414` | `#161414` |
| `--paper` | fondo claro | `#FAFAFA` | `#F7F4EF` (porcelana cálida) |
| `--white` | | `#FFFFFF` | `#FFFFFF` |
| `--graphite` | texto secundario sobre claro | `#5F5F5F` | `#5E5853` |
| `--silver` | texto secundario sobre oscuro | `#9EA0A2` | `#A8A29C` |
| `--accent` | líneas, números de STEP, trazos sobre **oscuro** | `#FFFFFF` | `#D4A373` (dentina / ámbar de lámpara) |
| `--accent-ink` | acento como **texto sobre claro** (AA ≥4.5:1) | `#161414` | `#8A5A2B` |
| `--line` | hairlines | `rgb(255 255 255 / .18)` en oscuro, `rgb(22 20 20 / .14)` en claro | igual |

Más los alias por tema de sección: `[data-theme="dark"]` define `--bg:var(--ink) --fg:var(--paper) --muted:var(--silver) --stroke:var(--accent)`,
y `[data-theme="light"]` define `--bg:var(--paper) --fg:var(--ink) --muted:var(--graphite) --stroke:var(--accent-ink)`.
Los componentes usan `--bg --fg --muted --stroke --line`. Contraste AA validado por quien define los tokens (Fundación).

## 4. Secciones, orden, ids, tema y dueño

| # | id | Componente | Tema | Dueño |
|---|---|---|---|---|
| 0 | | `chrome/Header.astro`, `chrome/ContactFab.astro`, `chrome/PaletteSwitch.astro`, `chrome/Footer.astro` | auto | **A1 Chrome** |
| 1 | `top` | `sections/Hero.astro` | dark | **A2 Hero** |
| 2 | `about` | `sections/About.astro` (historia, fundadores, manifiesto, estudio) | light → manifiesto dark → estudio light | **A3 About** |
| 3 | `services` | `sections/Services.astro` | light | **A4 Services** |
| 4 | `process` | `sections/Recipe.astro` | dark | **A5 Recipe** |
| 5 | `education` | `sections/Anatomy.astro` | dark | **A6 Anatomy** |
| 6 | `stories` | `sections/Stories.astro` (testimonio, videos, tira IG) | light | **A7 Stories** |
| 7 | `faq` | `sections/Faq.astro` | light | **A8 Contact** |
| 8 | `contact` | `sections/Contact.astro` | dark | **A8 Contact** |

Cada sección es `<section id data-theme aria-labelledby>`. `index.astro` (lo crea Fundación, solo lo edita el orquestador) ensambla en ese orden.

## 5. Efectos firma (cada uno con su versión sin movimiento)

1. **Hero, "Drawings and lines"**: un molar low-poly (malla triangulada, eco del logo) se dibuja trazo a trazo (DrawSVG) y se
   funde con la foto macro de la arcada. El H1 entra por líneas (SplitText `lines`). Reduced: malla completa estática con la foto.
2. **About**: retratos B/N con revelado por `clip-path`. El manifiesto se ilumina palabra a palabra con el scroll (`data-lit`).
   El estudio con parallax suave (solo desktop).
3. **Services**: índice 01–06 tipo catálogo. En desktop, al hover o foco cada fila muestra su foto o loop en un panel que sigue al
   puntero de forma suave. En táctil, la foto se ve inline.
4. **Process, "The Recipe"** (ref. sofeska_dent): **la única escena fijada del sitio** (pin ≤ +250 %). Foto macro fija y el
   contenido cambia por pasos: STEP 01 → 02 → 03 → RESULT, con wipe de `clip-path` antes/después, número grande en Oswald y
   nombre en serif. En táctil o reduced: lista vertical normal con las 4 imágenes.
5. **Education, "Anatomy"** (refs. dr.sajadhusseiin y vivodentallab): foto macro frontal con líneas guía SVG que se dibujan
   y etiquetas en Architects Daughter que aparecen en orden con el scroll. En móvil: foto más leyenda numerada. Reduced: todo visible.
6. **Stories**: cita grande con revelado por líneas, grilla de 6 videos con facade y tira de cuadros de IG en marquesina lenta
   con pausa por hover, foco y botón.
7. **Contact**: botón flotante "Send a case" siempre visible (se oculta cuando `#contact` está en pantalla). Formulario simulado.

Límites: nada de WebGL, partículas, tilt 3D, cursores custom, glow ni scroll-jacking fuera de la escena 4. Animar solo `transform`,
`opacity`, `clip-path` y `stroke-dashoffset`. Easing por defecto `expo.out` 0.9 s. La elegancia está en lo lento y preciso.

## 6. Motor y contratos de código

- `src/scripts/engine.js` (Fundación, adaptado de `SS/src/scripts/engine.js`): `onPage(({gsap, ScrollTrigger, SplitText, DrawSVGPlugin, env, lenis, emit}) => cleanup)`.
  - `env = {desktop, coarse, reduced, lite}`. `reduced` es true si el media query del SO **o** `html.calm` (interruptor del footer).
  - Atributos declarativos: `data-reveal` (`up|fade|clip|blur`), `data-stagger`, `data-split` (`lines|words`),
    `data-lit`, `data-parallax`, `data-draw`, `data-count`.
  - Pre-ocultar solo bajo `html.js`, con failsafe CSS de 4 s. Lenis y pin solo con
    `(min-width:768px) and (pointer:fine)` y sin reduced.
  - Eventos con prefijo `vd:`.
- Cada sección es un `.astro` con `<style>` propio y `<script>` que importa `onPage` y sale si su raíz no existe.
- `src/lib/url.js`: `url(path)` y `asset(path)` respetan `import.meta.env.BASE_URL`. **Prohibido** usar `BASE_URL` directo en componentes.
- `src/data/site.js` (Fundación, solo lectura para los demás): NAP, redes, nav, `demo`.
- `src/data/media.js` (agente de Medios, solo lectura para los demás): manifiesto de imágenes `{src, srcset, w, h, alt}` por clave.
- `src/components/ui/Picture.astro` (Fundación): `<picture>` con AVIF/WebP + JPG, `width`/`height`, `loading` y `fetchpriority`
  por prop. Todas las imágenes pasan por aquí.
- Botones y enlaces CTA: `src/components/ui/Button.astro` (Fundación) con variantes `solid | ghost | link`.
- Datos de cada sección: dentro de su propio `.astro` o en `src/data/<seccion>.js` propio.

## 7. Accesibilidad, rendimiento y honestidad

- WCAG 2.2 AA: skip link visible al foco, `:focus-visible` de 3 px en `--stroke`, objetivos táctiles ≥44 px, `alt` real,
  `<details name="faq">` nativo, `<dialog>` para el menú móvil, `aria-live` en el formulario, marquesina con pausa real.
- Sin desborde horizontal de 320 a 2560 px. CLS 0. Imagen LCP del hero con `fetchpriority="high"` y sin `lazy`.
- Funciona sin JS: todo visible y legible; el formulario muestra el teléfono y el email.
- Honestidad: no inventar cifras ni reseñas. Las fotos son cuadros de su IG o YouTube (uso interno de la propuesta).

## 8. Reglas de trabajo en paralelo (crítico)

- **Cada agente edita SOLO sus archivos** (tabla §4 más `src/scripts/<seccion>.js` y `src/data/<seccion>.js` y su página
  de kit `src/pages/kit/<seccion>.astro`). Nunca `index.astro`, `Base.astro`, `engine.js`, `tokens.css`, `base.css`,
  `site.js`, `media.js` ni los de otro agente. Si falta algo compartido, lo anota en su informe final como "pedido al orquestador".
- **Nadie ejecuta `npm install`, `astro build` ni `git`.** Para verificar, cada agente levanta su propio dev server:
  `VITE_CACHE_DIR=.vite-<id> npx astro dev --port <puerto>` (el puerto se lo da el orquestador). Captura con
  `node tools/qa/shoot.mjs --port=<cdp> desktop|mobile http://127.0.0.1:<puerto>/kit/<seccion>/ ...` y mira las capturas con Read.
  Al terminar, mata su dev server.
- La página de kit `src/pages/kit/<seccion>.astro` usa `Base` y monta **solo** su sección (más un spacer arriba y abajo
  para poder hacer scroll), para probarla aislada.
