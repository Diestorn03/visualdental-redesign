# MEDIA

Visual library for the Visual Dental Arts proposal. Everything comes from the client's own material (YouTube videos, IG reels and web files in `insumos/`) and is exported by script. Regenerate with `python tools/media/build.py` (add `--loops` to re-encode the video loops), then run `node tools/media/verify.mjs` to check that every referenced file exists.

## Contract

`src/data/media.js` exports `media`. Each image is `{ base, widths, w, h, alt, position }` and lives at `public/<base>-<width>.avif|webp|jpg` (no width above the source). `w`/`h` are the widest variant. Loops are `{ base, video: true, w, h, alt, poster }` with `public/<base>.mp4` and `.webm`; `poster` is an ordinary image entry. Use images with `<Picture img={media.x.y} />`.

Keys: `brand.{markDark, markLight}` (plus `logoDark`, `logoLight` for the full wordmark and `og`), `hero.arch`, `about.{ola, jack, studio1, studio2, studio3, craft}`, `services.{dsd, printing, shade, implant, ceramic, education}`, `recipe.{consult, digital, finishing, result}`, `anatomy.arch`, `stories.<youtube id>` (6), `ig[]` (10, each with `href`), `loops.{ceramic, studio}`.

Brand files outside the image contract: `brand/logo-mark-dark.png|webp` and `logo-mark-light.png|webp` (molar with alpha, tight crop, about 371x591), `favicon-32.png`, `favicon-192.png`, `apple-touch-icon.png` (180, molar on #161414) and `og.jpg` (1200x630, path in `media.brand.og.src`).

## Table

Source frames are cut at the exact timestamp at full resolution (lossless PNG) and then cropped. Encoders: AVIF q62, WebP q78, JPG q82 progressive. Resize is Lanczos with light sharpening; nothing is upscaled.

| Key | Source (file @ time) | Crop (px of source) | Widths | Grade | Notes |
|---|---|---|---|---|---|
| `hero.arch` | `insumos/ig/reels/Ddju-YPPITl.mp4` @ 9 s | 1440x810 at (0,690) | 480, 960, 1440 | gamma=1.12 | Best macro available. The reel is vertical 1440x2560, so the widest variant is 1440 px (no 2200). Gamma 1.12. |
| `anatomy.arch` | `insumos/ig/reels/DdU7HnaOmTR.mp4` @ 10 s | 1076x810 at (0,530) | 480, 960, 1076 | lift_black=True, black=6, copyrow=(136, 900, 1076) | Frontal, flat, on black (lifted to #161414 so it merges with dark sections). Noise in the blacks crushed and 1 px source seams removed. Ready for SVG annotations. |
| `recipe.consult` | `insumos/youtube/GuTcOzEswHo.mp4` @ 124 s | 1440x1080 at (480,0) | 480, 960, 1280 | gamma=0.97 | Doctor and technician at the laptop with a small ceramic piece. Slightly darkened. |
| `recipe.digital` | `insumos/youtube/At9KcdW1_Cg.mp4` @ 6 s | 1440x1080 at (360,0) | 480, 960, 1280 | warm=1.5 | CAD of an upper arch next to the scanner. Warmed slightly to match the set. |
| `recipe.finishing` | `insumos/ig/reels/Ddju-YPPITl.mp4` @ 14.5 s | 1440x1080 at (0,900) | 480, 960, 1280 | gamma=1.05 | Brush staining the incisal edge of the same arch as the hero, so recipe and hero read as one story. |
| `recipe.result` | `insumos/ig/reels/DdPz2AyM1Uw.mp4` @ 3.5 s | 1440x1080 at (0,0) | 480, 960, 1280 | none | Finished anterior segment in tweezers; porcelain jars blurred behind. |
| `services.dsd` | `insumos/youtube/GuTcOzEswHo.mp4` @ 116 s | 1440x1080 at (300,0) | 480, 960, 1280 | none | Contains a patient face and smile (see Huecos). |
| `services.printing` | `insumos/youtube/GuTcOzEswHo.mp4` @ 178 s | 1440x1080 at (480,0) | 480, 960, 1280 | none | A scanner, not a printer (see Huecos). |
| `services.shade` | `insumos/youtube/4_Bn42aDvnQ.mp4` @ 328 s | 1440x1080 at (0,0) | 480, 960, 1280 | none | Phone photograph of teeth used for shade communication. |
| `services.implant` | `insumos/youtube/wHwWyR-Vsfk.mp4` @ 174 s | 1440x1080 at (240,0) | 480, 960, 1280 | none | Implant model with scan bodies. |
| `services.ceramic` | `insumos/youtube/4_Bn42aDvnQ.mp4` @ 330 s | 1440x1080 at (240,0) | 480, 960, 1280 | none | Layering ceramic with a brush; GC Initial jars behind. |
| `services.education` | `insumos/youtube/GuTcOzEswHo.mp4` @ 80 s | 1440x1080 at (320,0) | 480, 960, 1280 | none | Stain demonstration with palettes and a shade chart. |
| `about.ola` | `insumos/web/Aleksandra-Polczynski-Headshot-BW2-1920w.png` | 1440x1440 at (0,0) | 480, 960 | none | Client headshot as supplied (square, B/W). Not recropped. |
| `about.jack` | `insumos/web/Jack-Polczynski-Headshot-BW2-1920w.png` | 1440x1440 at (0,0) | 480, 960 | none | Client headshot as supplied (square, B/W, cutout on white). |
| `about.craft` | `insumos/youtube/4_Bn42aDvnQ.mp4` @ 340 s | 1440x1080 at (240,0) | 480, 960, 1280 | gamma=0.95 | Ceramist under a task lamp. Slightly brightened. |
| `about.studio1` | `insumos/youtube/GuTcOzEswHo.mp4` @ 234 s | 1920x1080 at (0,0) | 480, 960, 1600 | none | Studio overview, 1080p. |
| `about.studio2` | `insumos/youtube/GuTcOzEswHo.mp4` @ 200 s | 1920x1080 at (0,0) | 480, 960, 1600 | none | Dining and meeting area. |
| `about.studio3` | `insumos/youtube/GuTcOzEswHo.mp4` @ 226 s | 1920x1080 at (0,0) | 480, 960, 1600 | none | Work station with a projection on the wall. |
| `stories.GuTcOzEswHo` | `insumos/youtube/GuTcOzEswHo.mp4` @ 62 s | 1920x1080 at (0,0) | 480, 960 | none | Frame from the video, not the YouTube thumbnail (thumbnails carry baked-in titles). |
| `stories.wHwWyR-Vsfk` | `insumos/youtube/wHwWyR-Vsfk.mp4` @ 62 s | 1920x1080 at (0,0) | 480, 960 | none | Same. |
| `stories.tbf0E3Yq3Qs` | `insumos/youtube/tbf0E3Yq3Qs.mp4` @ 28 s | 1920x1080 at (0,0) | 480, 960 | none | Same. |
| `stories.At9KcdW1_Cg` | `insumos/youtube/At9KcdW1_Cg.mp4` @ 18 s | 1920x1080 at (0,0) | 480, 960 | none | Same. |
| `stories.cpuyUuM52s8` | `insumos/youtube/cpuyUuM52s8.mp4` @ 312 s | 1920x1080 at (0,0) | 480, 960 | none | Same. Patient faces (see Huecos). |
| `stories.4_Bn42aDvnQ` | `insumos/youtube/4_Bn42aDvnQ.mp4` @ 100 s | 1920x1080 at (0,0) | 480, 960 | none | Same. Dr. Cornejo, low relevance. |
| `ig[0]` | `insumos/ig/reels/Ddju-YPPITl.mp4` @ 10.5 s | full frame (9:16) | 360, 720 | none | `media/ig-01`; href `https://www.instagram.com/reel/Ddju-YPPITl/`. Ceramic stain palette with a fine brush and porcelain powder jars. |
| `ig[1]` | `insumos/ig/reels/Ddju-YPPITl.mp4` @ 8 s | full frame (9:16) | 360, 720 | none | `media/ig-02`; href `https://www.instagram.com/reel/Ddju-YPPITl/`. Ceramic arch held in tweezers over a black-gloved hand. |
| `ig[2]` | `insumos/ig/reels/Ddju-YPPITl.mp4` @ 15.5 s | full frame (9:16) | 360, 720 | none | `media/ig-03`; href `https://www.instagram.com/reel/Ddju-YPPITl/`. Brush stain applied to a ceramic arch at the bench. |
| `ig[3]` | `insumos/ig/reels/DdU7HnaOmTR.mp4` @ 4.5 s | full frame (9:16) | 360, 720 | none | `media/ig-04`; href `https://www.instagram.com/reel/DdU7HnaOmTR/`. Digital design, unglazed and finished ceramic anterior segments stacked on black. |
| `ig[4]` | `insumos/ig/reels/Dd623h3PS9j.mp4` @ 12 s | full frame (9:16) | 360, 720 | none | `media/ig-05`; href `https://www.instagram.com/reel/Dd623h3PS9j/`. Wide view of the studio with benches under a sloped wood ceiling and a pendant lamp. |
| `ig[5]` | `insumos/ig/reels/Dd623h3PS9j.mp4` @ 22 s | full frame (9:16) | 360, 720 | none | `media/ig-06`; href `https://www.instagram.com/reel/Dd623h3PS9j/`. A team member walking through the studio past the benches. |
| `ig[6]` | `insumos/ig/reels/DdnBAQOPvnm.mp4` @ 1 s | full frame (9:16) | 360, 720 | none | `media/ig-07`; href `https://www.instagram.com/reel/DdnBAQOPvnm/`. Ola at her bench in the studio beneath a pendant lamp. |
| `ig[7]` | `insumos/ig/reels/DdnBAQOPvnm.mp4` @ 7 s | full frame (9:16) | 360, 720 | none | `media/ig-08`; href `https://www.instagram.com/reel/DdnBAQOPvnm/`. Ola seated in the studio beside framed charcoal portraits. |
| `ig[8]` | `insumos/ig/reels/DdnBAQOPvnm.mp4` @ 17 s | full frame (9:16) | 360, 720 | none | `media/ig-09`; href `https://www.instagram.com/reel/DdnBAQOPvnm/`. Ceramist putting on loupes at the bench. |
| `ig[9]` | `insumos/ig/reels/DdnBAQOPvnm.mp4` @ 22 s | full frame (9:16) | 360, 720 | none | `media/ig-10`; href `https://www.instagram.com/reel/DdnBAQOPvnm/`. Ceramist at the bench with a ring light and loupes. |

Brand: `brand.markLight` is the white molar from `Visual_Dental_Arts_Logo_WhiteBKG-2x-1920w.png` (crop of the molar, x < 470). `brand.markDark` is built from `Visual_Dental_Arts_Logo_Black-2x-1920w.jpg`: alpha is the inverted luminance, filled with #161414. `og.jpg` uses the hero macro at 45 % opacity fading in from the right, the white lockup on the left and an amber hairline.

Loops (muted, 1280x720, 30 fps): `loops.ceramic` is `ig:Ddju-YPPITl` 13.1-17.6 s (brush staining the arch, plain loop; 194 KB mp4 / 123 KB webm). `loops.studio` is `GuTcOzEswHo` 234-237 s, a slow push-in played forward then reversed so the loop has no jump (761 KB mp4 / 907 KB webm). Both have posters (480, 960, 1280).

## Weight

`public/media` is 13.47 MB (12.8 MiB) including both loops (about 2 MB); `public/brand` is about 1.2 MB. A browser downloads one format per image, so a visitor sees a fraction of that: the AVIF set alone is 2.6 MB.

## Huecos

- **Hero is not 1080p-sharp.** `hero.arch` comes from a vertical reel (1440 px wide), so the widest variant is 1440 px. It holds up at full width on a laptop and softens on large or 2x displays. No YouTube video has a macro of a finished arch. The fix is the client's original photo or clip of the Ddju-YPPITl arch.
- **No sharp, full-screen CAD.** `recipe.digital` shows the design software on a laptop with the arch small and the screen slightly out of focus; on-screen text is not readable. It is honest to the real workflow but the weakest of the four steps.
- **`services.printing` is a scanner, not a 3D printer.** The videos show a benchtop scanner with a model on its turntable and no printer. The alt says "scanner" so the page claims nothing it cannot show. If a printer shot turns up, change the entry in `manifest.py`.
- **Patient faces.** `services.dsd` (smile mock-up on a patient photo), `stories.cpuyUuM52s8` and the phone photo in `services.shade` show patients. It is the client's own published material, but confirm consent before it goes on a public site.
- **Equipment and product brands in frame** (an iCam scanner, GC Initial jars, the design software). They cannot be removed without retouching. Fine for a proposal; review before launch.
- **Portraits do not match.** Ola has a grey gradient background; Jack is a cutout on pure white with a faint halo and his head touching the top edge. Both are square, 1440 px max, supplied as-is, and read as light tiles on a dark section. Use a frame or rounded treatment, or ask for a matched pair.
- **No people in the studio stills.** `about.studio1-3` show the room only. Ola and Jack at work appear only in video frames (`stories.*`, `ig`) at 1080p or lower.
- **Stories are frames, not thumbnails.** The six YouTube thumbnails have baked-in pink titles, so frames from each video stand in. `stories.4_Bn42aDvnQ` (Dr. Cornejo) has low relevance by design.
- **Reels with burned-in captions were avoided.** `Ddu7npDN` (studio, caption over most of it) is not in `ig`; the chosen frames have no text. `Ddju-YPPITl` supplies three frames because it holds the best macros.
- **The ceramic loop is not seamless.** The brush gesture does not return to its start. Use it with a short fade or when in view; the poster is enough for reduced motion.
- **Review capture and location.** `Dr_Dean-Boldin_Review-423w.png` is 420 px wide, too small to publish as an image; use the review text from `CONTENT.md`. There are no location photos (Beverly Shores, exterior, map) in the inputs.
