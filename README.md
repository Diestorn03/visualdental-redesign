# Visual Dental Arts · Propuesta de rediseño web

Rediseño de [visualdentalarts.com](https://www.visualdentalarts.com) construido con **Astro 7**, **GSAP 3.15** (ScrollTrigger, SplitText, DrawSVG) y **Lenis**. Visual Dental Arts es un **laboratorio dental boutique (B2B)** en Beverly Shores, Indiana. El sitio le habla a odontólogos, no a pacientes, y está en inglés. Es una landing de una sola página que reutiliza el copy, el logo, los videos de YouTube, los reels de Instagram y las fotos del cliente. Todo vive dentro de una idea llamada **"The Ceramist's Notes"**: la web dibuja, anota y estratifica como lo hace el laboratorio. Líneas finas que se trazan solas, anotaciones manuscritas sobre fotografía macro y una receta que se revela capa a capa.

Las secciones, en orden: Hero (`#top`) · About (`#about`) · Services (`#services`) · Process, "The Recipe" (`#process`) · Education, "Anatomy" (`#education`) · Stories (`#stories`) · FAQ (`#faq`) · Contact (`#contact`).

## Arrancar en local

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # sitio estático en /dist
npm run preview    # sirve /dist
```

Node 22 (el mismo que usa el workflow). Si ya hay otro `astro dev` corriendo en esta carpeta, Astro 7 se niega a levantar un segundo: usa `npx astro dev --ignore-lock --port 4340` (nunca `--force`, que mata al otro). Para tener una caché de Vite aparte: `VITE_CACHE_DIR=.vite-int`.

## Dos paletas para evaluar

El cliente pidió "las dos versiones", así que el sitio trae dos paletas con los mismos componentes:

| Paleta | Cómo es | Cómo se activa |
|---|---|---|
| `amber` (por defecto) | Tinta `#161414`, porcelana cálida `#F7F4EF` y un solo acento dentina/ámbar `#D4A373` | `?palette=amber` |
| `mono` | Tinta, blanco `#FAFAFA` y acento blanco, sin color | `?palette=mono` |

- `?palette=` se aplica antes del primer pintado (script inline en `<head>`) y se recuerda en `localStorage` (`vd-palette`).
- En la versión de propuesta hay además un selector visible **Amber | Mono**: abajo al centro en escritorio, y en el móvil aparece al pasar el hero para no tapar el primer botón.
- Los tokens viven en [src/styles/tokens.css](src/styles/tokens.css). Los componentes solo usan los alias semánticos (`--bg --fg --muted --stroke --line`), nunca un hex suelto. Cada sección declara su tema con `data-theme="dark|light"`, y el header toma el tema del bloque que tiene debajo. El contraste AA está calculado en el comentario de cabecera de ese archivo (el mínimo es 5.35:1).

## Despliegue

### GitHub Pages (demo de la propuesta)

Cada push a `main` ejecuta [.github/workflows/deploy.yml](.github/workflows/deploy.yml) y publica en `https://<usuario>.github.io/<repo>/`. Requisitos, una sola vez: repositorio público y **Settings → Pages → Source → GitHub Actions**.

Tres variables controlan el build:

| Variable | Para qué | Valor en el workflow |
|---|---|---|
| `SITE_URL` | Origen absoluto: `canonical`, `og:url`, `og:image`, `sitemap` y `robots.txt` | `https://<dueño>.github.io` |
| `PAGES_BASE` | Subruta del sitio de proyecto. Todo pasa por `url()` y `asset()` de [src/lib/url.js](src/lib/url.js) | `/<repo>` |
| `PUBLIC_DEMO` | Modo propuesta: `noindex` y `robots.txt` con `Disallow: /`, selector de paleta y la nota "Demo form — no data is sent." | `1`, salvo que la variable de repositorio `PUBLIC_DEMO` valga `off` |

Sin `SITE_URL` el build no emite canonical, `og:url` ni sitemap en vez de apuntar a un dominio que nadie confirmó. En local, `.env` trae `PUBLIC_DEMO=1` (está ignorado por git; la plantilla es [.env.example](.env.example)).

Notas:
- Para probar un build "real" en local: `SITE_URL=https://ejemplo.github.io PAGES_BASE=/vd PUBLIC_DEMO= npm run build`. En **Git Bash** antepón `MSYS_NO_PATHCONV=1`, o `/vd` se convierte en una ruta de Windows.
- Cuando la propuesta se apruebe: crea la variable de repositorio `PUBLIC_DEMO` con valor `off` (una variable vacía es falsa en Actions y volvería a `1`) y, si hay dominio propio, quita `PAGES_BASE` y pon `SITE_URL=https://<dominio>`.
- El resultado es estático: sirve en cualquier hosting (Netlify, Cloudflare Pages, Vercel, el servidor del cliente). No necesita backend.

## Qué cambia respecto al sitio actual

Auditoría hecha el 2026-10-01 sobre visualdentalarts.com (Duda). El detalle está en [docs/BRIEF.md](docs/BRIEF.md), sección 3.

| Sitio actual | Propuesta |
|---|---|
| El CTA "Book a Meeting" apunta a `/`: no hace nada. Es justo la queja de "no tiene botones de contacto" | "Send a case" en el header, el hero, el footer y un **botón flotante fijo** (en móvil, una barra "Call / Send a case"). "Book a consultation" en el hero y la FAQ. Todos van a `#contact` y **preseleccionan el tema** del formulario (el canal "Consultations" también) |
| Los íconos sociales del footer van a `twitter.com/`, `facebook.com/`, `youtube.com/`… genéricos. El Instagram verificado de 9,9 mil seguidores no está enlazado | Solo el Instagram real, `@aleksandra_polczynski`, en el footer, el contacto, el menú móvil y la tira "Behind the scenes". No hay íconos de redes que el cliente no tenga |
| El teléfono del footer es `tel:278 0110`, sin código de área: no llama desde el móvil | `tel:+12192780110` en el botón Call fijo, el footer, el contacto y el menú |
| Texto de plantilla publicado: "This is where you introduce visitors to why your craftsmanship stands apart…" | Todo el copy sale de [docs/CONTENT.md](docs/CONTENT.md): literal del sitio actual o marcado como propuesta. Sin lorem ni cifras inventadas |
| La imagen del hero es una foto stock o IA de la plantilla | Foto macro propia (cuadro de su reel) con el molar del logo dibujado en malla low-poly encima, trazo a trazo |
| El logo solo existe en raster (1920×650) | La marca (el molar) con transparencia en AVIF/WebP/JPG/PNG, el wordmark en texto vivo y favicons y `og.jpg`. Falta el SVG vectorial (ver pendientes) |
| Tipografía Roboto genérica, cero movimiento, botón vacío "Button" | Instrument Serif + Oswald + Inter + Architects Daughter (solo anotaciones), movimiento con GSAP y Lenis, e interruptor "Reduce motion". Sin botones vacíos |
| Repartida en 4 páginas (home, About-us, media-page, contact) | Una sola página con nav por anclas y el header que cambia de tema según la sección |
| No hay formulario de contacto en el home | Formulario accesible (simulado hasta la compra), 3 canales y bloque "Visit Our Studio" con dirección y Google Maps |

## Efectos y movimiento

| Sección | Efecto | Sin movimiento / táctil |
|---|---|---|
| Hero | El molar low-poly se dibuja (DrawSVG) y se funde con la foto macro. El H1 entra por líneas | Malla completa y estática |
| About | Retratos B/N con revelado por `clip-path`, manifiesto que se ilumina palabra a palabra con el scroll, estudio con parallax suave | Todo visible, manifiesto iluminado |
| Services | Índice 01–06. Al pasar el puntero o enfocar una fila, su foto o loop aparece en un panel que sigue al cursor | Foto en línea bajo cada fila |
| Process | **La única escena fijada**: foto fija y pasos STEP 01 → 02 → 03 → RESULT con wipe antes/después. En el paso 2 se dibuja un wireframe sobre el modelo CAD | Lista vertical con las 4 imágenes |
| Education | Foto macro con 6 anotaciones manuscritas que se dibujan con el scroll | Foto con marcadores y leyenda numerada |
| Stories | Cita por líneas, 6 videos de YouTube con facade (el iframe carga al hacer clic, `youtube-nocookie.com`) y tira de IG en marquesina con pausa | Tira con scroll nativo |
| Footer | Wordmark gigante que se rellena de color con el scroll | Wordmark completo |

- **Lenis, parallax y el pin solo corren con `(min-width: 768px) and (pointer: fine)`** y sin movimiento reducido. En móvil y táctil todo es scroll nativo.
- **Movimiento reducido:** lo respeta el sistema operativo (`prefers-reduced-motion`) **y** el interruptor "Reduce motion" del footer (`aria-pressed`, se recuerda en `localStorage` como `vd-calm`). Al activarlo o al cruzar 768 px, el motor recarga y devuelve al lector a la misma posición.
- **Sin JavaScript** todo es legible: el formulario muestra el teléfono y el email, el menú pasa a marca más botón y los videos son enlaces a YouTube.
- Solo se animan `transform`, `opacity`, `clip-path` y `stroke-dashoffset`. Sin WebGL, partículas ni cursor propio. La API completa del motor (atributos `data-reveal`, `data-split`, `data-lit`, `data-parallax`, `data-draw`, `data-count`, `onPage`, `env`) está en la cabecera de [src/scripts/engine.js](src/scripts/engine.js).

## Estructura

```
src/
  pages/            index.astro (ensambla las secciones), 404.astro, robots.txt.ts
  layouts/Base.astro   head, fuentes, JSON-LD, script de paleta, skip link, chrome
  components/
    chrome/         Header, Footer, ContactFab, PaletteSwitch, Logo
    sections/       Hero, About, Services, Recipe, Anatomy, Stories, Faq, Contact
    ui/             Picture (AVIF/WebP/JPG), Button, Icon
  scripts/          engine.js (GSAP + Lenis) y un módulo por sección
  data/             site.js (contacto, nav, demo) y media.js (generado)
  styles/           tokens.css y base.css
  lib/url.js        url() y asset(): lo único que lee BASE_URL
public/             media/ (imágenes y loops) y brand/ (marca, favicons, og.jpg)
tools/
  media/            curaduría y export de imágenes (Python + ffmpeg)
  svg/              generador de la malla del hero
  qa/               shoot, walk, audit, perf-section, sheet
docs/               BRIEF, CONCEPTO, CONTENT, MEDIA, STACK-PLAYBOOK, QA-INTEGRACION
```

Las imágenes se regeneran con `python tools/media/build.py` (añade `--loops` para recodificar los videos) y `node tools/media/verify.mjs` comprueba que todo lo referenciado existe. Salen de `insumos/` (no va a git: videos y reels pesan unos 440 MB). Detalle de cada recorte en [docs/MEDIA.md](docs/MEDIA.md).

## Verificación (QA)

Sin Playwright: cuatro scripts que hablan con Chrome por CDP. Chrome en `C:/Program Files/Google/Chrome/Application/chrome.exe`.

```bash
# En Git Bash: MSYS_NO_PATHCONV=1 delante, y SHOTS_DIR siempre ABSOLUTO (con ruta relativa Chrome no arranca)
export MSYS_NO_PATHCONV=1 SHOTS_DIR="C:/ruta/al/proyecto/.shots/final"

node tools/qa/walk.mjs  --port=9340 desktop http://127.0.0.1:4340/            # recorre la página entera, una captura por paso
node tools/qa/walk.mjs  --port=9340 mobile  http://127.0.0.1:4340/ --reduced   # --reduced (SO) o --calm (interruptor)
node tools/qa/walk.mjs  --port=9340 desktop "http://127.0.0.1:4340/?palette=mono"
node tools/qa/shoot.mjs --port=9340 desktop http://127.0.0.1:4340/ "#faq" "#process@8"   # secciones o escenas fijadas
node tools/qa/audit.mjs http://127.0.0.1:4341 .shots/final/audit.json --port=9344 / /404/ # 12 viewports: desbordes, targets, CLS, FPS
python tools/qa/sheet.py ".shots/final/9340-d-home-*.png" .shots/final/sheets/d 2 3 0.5     # hojas de contacto
```

`walk.mjs` anota en cada paso la sección que hay bajo el header, el tema del header, si el botón flotante se ve y el CLS acumulado, y avisa si el tema del header no coincide con el del bloque que tiene debajo. Los resultados de la última pasada, con las capturas, están en [docs/QA-INTEGRACION.md](docs/QA-INTEGRACION.md). `.shots/` está ignorado por git.

## Honestidad del contenido

- Nada de cifras, premios ni reseñas inventados. La única reseña es la del Dr. Dean Boldin, tomada del sitio actual.
- Las fotos son **cuadros de sus propios videos de YouTube y reels de Instagram** (uso interno de la propuesta). Los cuadros se eligieron sin texto quemado; las miniaturas de YouTube traen títulos incrustados y no se usan.
- El formulario es **simulado**: no hace `fetch`, no guarda nada y no usa `localStorage`. Con `PUBLIC_DEMO` lo dice en pantalla.
- El microcopy funcional que no está en CONTENT.md (etiquetas de botones y estados, mensajes de error del formulario, "Hover a row to see the work", los rótulos "Materials" y "Files", "Frames from our reels") está listado en [docs/QA-INTEGRACION.md](docs/QA-INTEGRACION.md) para que el cliente lo apruebe.

## Pendiente de confirmar con el cliente

1. **Fotos propias en alta resolución:** casos macro, estudio, Ola y Jack. La foto del hero sale de un reel vertical (1440 px de ancho) y se ve blanda en pantallas grandes. No hay fotos del lugar (exterior, mapa). Los dos retratos tienen fondos distintos.
2. **Logo en SVG**, o permiso para vectorizarlo desde el PNG.
3. **Consentimiento de pacientes:** `services.dsd`, `services.shade` (foto de un móvil con una boca) y el video "Breaking Free from Painful Veneer Procedures" muestran pacientes. Es material que ya publicaron, pero hay que confirmarlo antes de un sitio público.
4. **Canal de YouTube:** los 6 videos se enlazan por ID; no hay canal confirmado.
5. **Destino del formulario:** correo de yahoo vía Formspree o Web3Forms, o solo `mailto` y teléfono. Hasta entonces no envía nada.
6. **Acento ámbar o 100 % monocromo:** decisión final entre las dos paletas.
7. **Portal "Sign in"** de Duda (hoy `/signin`): ¿se mantiene?
8. **Dominio final** y si migran fuera de Duda. Hasta entonces `Privacy Policy` y `Terms & Conditions` siguen apuntando a las URLs del sitio actual.
9. **Citas:** la cita del estudio no trae autor en el sitio actual y se atribuye a "Visual Dental Arts". La frase de Ola en Education es una línea de su bio, en tercera persona; si prefieren una cita en primera persona, la tienen que dar ellos.
10. **Marcas en cuadro** (escáner iCam, frascos GC Initial, el software de diseño): fine para una propuesta, a revisar antes del lanzamiento.
11. **Duración de un caso:** "10–14 días" sale de su FAQ; confirmar que sigue vigente.
