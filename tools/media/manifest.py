"""Photo manifest: media.js key -> source (video id + exact timestamp) -> crop box (source px) -> output widths.
`v` is a YouTube id or 'ig:<reel code>'; `t` is seconds. Boxes are (x0, y0, x1, y1) on the full-resolution frame."""

W3 = [480, 960, 1280]          # 4:3 cards (services, recipe, craft)
W16 = [480, 960, 1600]         # wide shots
WS = [480, 960]                # small cards (stories, portraits)

# key, source, time, crop box, widths, alt, object-position, grade
PHOTOS = [
    ('hero.arch', 'ig:Ddju-YPPITl', 9.0, (0, 690, 1440, 1500), [480, 960, 1440],
     'Macro of a layered ceramic anterior arch with pink gingiva, held with tweezers between black-gloved fingers', '50% 55%', dict(gamma=1.12)),
    ('anatomy.arch', 'ig:DdU7HnaOmTR', 10.0, (0, 530, 1076, 1340), [480, 960, 1076],
     'Front view of four ceramic incisors on a black background, showing surface texture, lobes and translucent edges', '50% 50%', dict(lift_black=True, black=6, copyrow=(136, 900, 1076))),

    ('recipe.consult', 'GuTcOzEswHo', 124.0, (480, 0, 1920, 1080), W3,
     'Two artisans at a laptop discussing a case while one holds a small ceramic piece', '60% 40%', dict(gamma=0.97)),
    ('recipe.digital', 'At9KcdW1_Cg', 6.0, (360, 0, 1800, 1080), W3,
     'CAD software on a laptop showing a designed upper arch next to an intraoral scanner', '50% 50%', dict(warm=1.5)),
    ('recipe.finishing', 'ig:Ddju-YPPITl', 14.5, (0, 900, 1440, 1980), W3,
     'A fine brush applying stain to the incisal edge of a ceramic anterior arch held with tweezers', '50% 50%', dict(gamma=1.05)),
    ('recipe.result', 'ig:DdPz2AyM1Uw', 3.5, (0, 0, 1440, 1080), W3,
     'Finished ceramic anterior segment with pink gingiva held in tweezers in front of porcelain powder jars', '60% 50%', {}),

    ('services.dsd', 'GuTcOzEswHo', 116.0, (300, 0, 1740, 1080), W3,
     'Digital smile design on a laptop: a patient photograph with a teal tooth mock-up overlaid', '50% 50%', {}),
    ('services.printing', 'GuTcOzEswHo', 178.0, (480, 0, 1920, 1080), W3,
     'Benchtop dental scanner with a model on its turntable, lit in blue', '50% 50%', {}),
    ('services.shade', '4_Bn42aDvnQ', 328.0, (0, 0, 1440, 1080), W3,
     'Hands at the bench reviewing a close-up photograph of teeth on a phone, with ceramic powders behind', '30% 50%', {}),
    ('services.implant', 'wHwWyR-Vsfk', 174.0, (240, 0, 1680, 1080), W3,
     'Implant model with four scan bodies resting on a wooden bench', '50% 55%', {}),
    ('services.ceramic', '4_Bn42aDvnQ', 330.0, (240, 0, 1680, 1080), W3,
     'Hands layering ceramic onto a model with a fine brush, porcelain powder jars behind', '50% 50%', {}),
    ('services.education', 'GuTcOzEswHo', 80.0, (320, 0, 1760, 1080), W3,
     'A ceramist in a white coat demonstrating staining with a brush at a bench with stain palettes and a shade chart', '50% 45%', {}),

    ('about.ola', 'img:Aleksandra-Polczynski-Headshot-BW2-1920w.png', 0, (0, 0, 1440, 1440), WS,
     'Black and white portrait of Aleksandra Polczynski', '50% 35%', {}),
    ('about.jack', 'img:Jack-Polczynski-Headshot-BW2-1920w.png', 0, (0, 0, 1440, 1440), WS,
     'Black and white portrait of Jack Polczynski with arms crossed', '50% 25%', {}),
    ('about.craft', '4_Bn42aDvnQ', 340.0, (240, 0, 1680, 1080), W3,
     'A ceramist working at the bench under a task lamp, ceramic powders and bottles within reach', '50% 50%', dict(gamma=0.95)),
    ('about.studio1', 'GuTcOzEswHo', 234.0, (0, 0, 1920, 1080), W16,
     'The studio workspace with benches, scanners, a pendant lamp and exposed brick', '50% 50%', {}),
    ('about.studio2', 'GuTcOzEswHo', 200.0, (0, 0, 1920, 1080), W16,
     'The studio dining area with a long wood table, wire chairs and abstract art', '50% 50%', {}),
    ('about.studio3', 'GuTcOzEswHo', 226.0, (0, 0, 1920, 1080), W16,
     'A work station in the studio under a glass pendant lamp', '50% 50%', {}),

    ('stories.GuTcOzEswHo', 'GuTcOzEswHo', 62.0, (0, 0, 1920, 1080), WS,
     'Ola Polczynski drawing a portrait at an easel in the studio', '50% 50%', {}),
    ('stories.wHwWyR-Vsfk', 'wHwWyR-Vsfk', 62.0, (0, 0, 1920, 1080), WS,
     'Aleksandra Polczynski at her laptop with a colleague standing beside her', '40% 50%', {}),
    ('stories.tbf0E3Yq3Qs', 'tbf0E3Yq3Qs', 28.0, (0, 0, 1920, 1080), WS,
     'A dental team member with a mask and gloves scanning a patient with an intraoral scanner', '50% 50%', {}),
    ('stories.At9KcdW1_Cg', 'At9KcdW1_Cg', 18.0, (0, 0, 1920, 1080), WS,
     'Ola at her desk with a laptop and an intraoral scanner, resting her chin on her hand', '50% 50%', {}),
    ('stories.cpuyUuM52s8', 'cpuyUuM52s8', 312.0, (0, 0, 1920, 1080), WS,
     'Close-up photograph of a patient smile after treatment', '50% 50%', {}),
    ('stories.4_Bn42aDvnQ', '4_Bn42aDvnQ', 100.0, (0, 0, 1920, 1080), WS,
     'Dr. Miranda Cornejo speaking on camera', '50% 50%', {}),
]

# Vertical cuadros from the reels (no burned-in text). code, time, alt
IG = [
    ('Ddju-YPPITl', 10.5, 'Ceramic stain palette with a fine brush and porcelain powder jars'),
    ('Ddju-YPPITl', 8.0, 'Ceramic arch held in tweezers over a black-gloved hand'),
    ('Ddju-YPPITl', 15.5, 'Brush stain applied to a ceramic arch at the bench'),
    ('DdU7HnaOmTR', 4.5, 'Digital design, unglazed and finished ceramic anterior segments stacked on black'),
    ('Dd623h3PS9j', 12.0, 'Wide view of the studio with benches under a sloped wood ceiling and a pendant lamp'),
    ('Dd623h3PS9j', 22.0, 'A team member walking through the studio past the benches'),
    ('DdnBAQOPvnm', 1.0, 'Ola at her bench in the studio beneath a pendant lamp'),
    ('DdnBAQOPvnm', 7.0, 'Ola seated in the studio beside framed charcoal portraits'),
    ('DdnBAQOPvnm', 17.0, 'Ceramist putting on loupes at the bench'),
    ('DdnBAQOPvnm', 22.0, 'Ceramist at the bench with a ring light and loupes'),
]
