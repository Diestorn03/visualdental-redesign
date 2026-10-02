# DIGITAL · Sección "Our standards are high and digital" (exocad + CBCT + implante 3D)

> Origen: feedback del cliente (vía la novia del usuario, 2026-10-02). Al sitio "le falta algo… el aspecto más tecnológico, tipo exocad,
> CBCT… alguna animación de un implante dentro de un marco de exocad que se mueva en 3D". Debe ser **el "wow"** de la página.
> Además: "me gusta el oro", así que la paleta **amber** es la principal.

## Ubicación y navegación

- Nueva sección `<section id="digital" data-theme="dark">` en `src/components/sections/Digital.astro`, **entre `#services` y `#process`**.
  La razón: Services cierra con "Analog Meets Digital" y los chips STL · DICOM · Smilecloud®, y DICOM es justamente el CBCT.
- Nav: añadir **Digital** entre Services y Process (`src/data/site.js`).

## Copy (verbatim de su reel DdZV_q3B68L de Instagram; no inventar)

- Eyebrow: `Digital workflow`
- H2 [verbatim reel]: **Our standards are high and digital.**
- Lead [verbatim web, servicio 04]: Digital implant workflows, guided surgery collaboration, and CAD/CAM abutment design.
- 6 pasos [verbatim reel, en este orden]:
  1. **Accurate scans**
  2. **Prosthetically driven planning**
  3. **Implants exactly where we planned them**
  4. **A surgical guide that fits**
  5. **Components that fit the first time**
  6. **A provisional ready when the patient is**
  (El reel también dice "Teeth printed during the surgery"; se puede usar como micro-nota del paso 6.)
- Nota visible y discreta: `Illustrative 3D visualization`. Es honestidad: no es un caso real.
- Etiquetas del UI estilo CAD (son genéricas, no claims): `Implant planning`, `Axial`, `Sagittal`, `Coronal`, `Ø 4.0 × 10 mm`,
  `Angle 12°`, `Prosthetic axis`, `Wizard 1/6 … 6/6`, `Drag to rotate`.

## Composición

Escritorio: escenario sticky a la izquierda (≈62 %) y lista de pasos a la derecha, que scrollea. Altura de la sección ≈ 260–300 svh.

- **Ventana estilo exocad** (marco de app, no captura falsa de la marca exocad: sin logo ni nombre "exocad"):
  - Barra de título con 3 puntos y el título "Implant planning · illustrative case".
  - Toolbar vertical izquierda con 6–8 íconos de línea fina (rotar, medir, sección, implante, guía, capas). El activo va en --accent.
  - **Viewport 3D** (canvas WebGL, three.js) con fondo degradado frío como el de los CAD (gris azulado oscuro) y viñeta.
    Gizmo de ejes XYZ abajo a la izquierda. Callouts de medida en HTML proyectados desde puntos 3D, con línea fina y Oswald pequeño.
  - **Panel CBCT**: 3 cortes en escala de grises (Axial / Sagittal / Coronal) generados proceduralmente en canvas 2D (ruido + forma de
    maxilar y hueso cortical brillante + el implante como silueta blanca cuando ya está colocado), con mira (crosshair) en --accent
    que se mueve con el paso.
  - **Wizard** abajo: "Step N/6" + el nombre del paso + barra de progreso, como el asistente de exocad.
- **Pasos** (lista derecha, 6 bloques altos): número Oswald grande, título en Instrument Serif y una línea de apoyo opcional sacada del
  copy existente. El paso activo se ilumina y los demás quedan atenuados. Clic en un paso → `scrollToTarget` a ese paso.

Móvil (<768 px o táctil): el escenario sticky arriba (≈55svh) y los pasos debajo, que scrollean. Sin OrbitControls: en táctil no se
captura el gesto (touch-action: pan-y) y la escena solo auto-rota suave.

## Secuencia 3D (progreso 0→1 del scroll de la sección, 6 tramos)

Escena: segmento de maxilar inferior estilizado. Hueso y modelo en piedra "beige CAD" (#d8c9a6 aprox.), encía rosa translúcida,
2 dientes vecinos y un hueco en el centro.

1. **Accurate scans**: el modelo aparece con un **barrido de escaneo** (banda de luz --accent que recorre la malla; shader o clipping
   plane) y la malla wireframe se funde con la superficie sólida.
2. **Prosthetically driven planning**: aparece la **corona** planificada, translúcida y flotando sobre el hueco, y de ella baja una línea
   punteada: el **eje protésico**, con su callout "Prosthetic axis".
3. **Implants exactly where we planned them**: el **implante** (titanio, roscas helicoidales reales) **baja girando** por el eje hasta
   el hueso (rotación + traslación acopladas = atornillado). Un **plano de corte CBCT** atraviesa el hueso y deja ver el implante
   dentro. Callouts "Ø 4.0 × 10 mm" y "Angle 12°". En el panel CBCT aparece la silueta del implante.
4. **A surgical guide that fits**: una **guía quirúrgica** translúcida, una carcasa sobre los dientes vecinos con un anillo-manguito
   metálico alineado al eje, baja y encaja; luego se desvanece.
5. **Components that fit the first time**: el **pilar** (abutment) baja y encaja sobre el implante con un pequeño rebote y un destello.
6. **A provisional ready when the patient is**: la corona pasa de translúcida a **sólida color diente**, la cámara hace una órbita
   lenta de presentación y se habilita "Drag to rotate".

Cámara: encuadre 3/4 desde arriba y de frente. Leve dolly/órbita por paso, siempre suave (lerp por frame, nunca saltos).

## Arquitectura técnica (contrato)

- `src/scripts/digital/scene.js`, **sin estado global**:
  `export async function createScene(canvas, { reduced, lite, dpr }) → { setProgress(p), resize(), start(), stop(), dispose(), project(name) → {x,y,visible} }`.
  `three` se importa **dinámicamente** dentro (`await import('three')`), y lo mismo `OrbitControls` y `RoomEnvironment` desde
  `three/examples/jsm/...`. Geometría procedural (LatheGeometry, TubeGeometry helicoidal para la rosca, ExtrudeGeometry o deformación
  para el hueso). Materiales: MeshStandardMaterial / MeshPhysicalMaterial con PMREM de RoomEnvironment. **Sin modelos externos ni texturas
  descargadas.**
- `src/scripts/digital/cbct.js`: dibuja los 3 cortes en canvas 2D. `drawCbct(ctx, {view, progress})`.
- `src/scripts/digital.js`: une todo con `onPage`. Usa IntersectionObserver para cargar three.js cuando la sección está a <1 viewport
  y ScrollTrigger (sin pin: el escenario es CSS `position: sticky`) para el progreso de los pasos. `setProgress` se suaviza por frame.
  Renderiza **solo si la sección es visible** y pausa fuera de pantalla.
- Rendimiento: DPR máx. 1.75 (lite: 1), antialias, sombras baratas (sin shadow maps pesados; un contact shadow falso con un plano y un
  degradado). Objetivo: p95 de cuadro < 20 ms en esta laptop con GPU. Sin trabajo en el hilo principal durante el scroll más allá de
  setProgress y el render.
- Fallback (reduced, sin WebGL o lite): una imagen fija renderizada de la escena en el paso 6, en `public/media/digital-poster-*.{avif,webp,jpg}`
  (se genera capturando el canvas con Chrome headless), con los pasos como lista normal. Sin JS: igual.
- Accesibilidad: el canvas lleva `aria-hidden` y hay una descripción textual del proceso (los 6 pasos ya son texto real). El botón
  "Drag to rotate" solo es una pista visual. Foco visible en los pasos clicables.
