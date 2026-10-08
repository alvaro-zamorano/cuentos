#!/usr/bin/env python3
"""
Construye el catálogo a partir de assets/raw/ (imágenes GPT-image de Álvaro, ignoradas por git).

- Escribe assets/manifest.json con la clasificación {tipo, estilo, variante} de cada imagen
  (clasificación hecha a mano mirando hojas de contacto; ver CLASIFICACION abajo).
- Recorta cada cuadrícula en PNG individuales: web/public/catalog/<estilo>/<categoria>/<id>.png
- Escribe assets/styles.json (paleta extraída del ancla de cada estilo).

Uso: python3 scripts/assets_build.py   (desde la raíz del repo; requiere Pillow, numpy, scipy)
"""
import json, os, re
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "assets", "raw")
OUT = os.path.join(ROOT, "web", "public", "catalog")

STYLES = ["3d", "flat", "gouache", "papercraft", "lapiz", "acuarela"]

# Ids de rasgo por posición de la cuadrícula (orden de lectura). Coinciden con web/lib/traits.ts.
GRID_IDS = {
    "hair": ["corto", "flequillo", "melena", "coleta", "rizos", "rizos-media", "rizos-largos", "afro", "trenzas", "rapado", "ondulado", "mono"],
    "skin": ["muy-clara", "clara", "melocoton", "media", "tostada", "morena", "morena-oscura", "oscura"],
    "eyes": ["puntos", "redondos", "ovalados", "dormilones", "cerrados", "risuenos"],
    "glasses": ["redondas", "redondas-gruesas", "ovaladas", "cuadradas", "pasta", "transparentes"],
    "outfit": ["chubasquero", "peto", "jersey", "marinera", "vestido", "plumifero", "pijama", "verano"],
    "accessory": ["gorro", "diadema", "mochila", "sombrero", "bufanda", "lazo", "casco", "bolso"],
    "pet": ["corgi", "golden", "manchado", "atigrado", "blanquinegro", "conejo", "cobaya", "periquito"],
}
GRID_SHAPE = {"hair": (3, 4), "skin": (2, 4), "eyes": (2, 3), "glasses": (2, 3), "outfit": (2, 4), "accessory": (2, 4), "pet": (2, 4), "grandparent": (2, 4)}

# Los catálogos de abuelos NO tienen el mismo orden en todos los estilos (B01 no es la misma persona).
# Se definen 8 arquetipos y, por estilo, la posición que mejor encaja. "nota" registra la discrepancia.
GRANDPARENT_MAP = {
    "lapiz":      {"abuela-mono": "B01", "abuelo-gafas": "B02", "abuela-rizos": "B03", "abuelo-calvo": "B04", "abuela-gafas": "B05", "abuelo-barba": "B06", "abuela-ondas": "B07", "abuelo-gris": "B08"},
    "flat":       {"abuela-ondas": "B01", "abuelo-gafas": "B02", "abuela-rizos": "B03", "abuelo-calvo": "B04", "abuelo-barba": "B05", "abuela-gafas": "B06", "abuelo-gris": "B07", "abuela-mono": "B08"},
    "3d":         {"abuela-mono": "B01", "abuelo-gafas": "B02", "abuela-rizos": "B03", "abuelo-calvo": "B04", "abuela-ondas": "B05", "abuelo-barba": "B06", "abuela-gafas": "B07", "abuelo-gris": "B08"},
    "papercraft": {"abuela-mono": "B01", "abuela-rizos": "B02", "abuela-ondas": "B03", "abuela-gafas": "B04", "abuelo-calvo": "B05", "abuelo-gris": "B06", "abuelo-barba": "B07", "abuelo-gafas": "B08"},
    "gouache":    {"abuela-ondas": "B01", "abuela-rizos": "B02", "abuela-gafas": "B03", "abuela-mono": "B04", "abuelo-calvo": "B05", "abuelo-gris": "B06", "abuelo-barba": "B07", "abuelo-gafas": "B08"},
    "acuarela":   {"abuela-mono": "B01", "abuela-rizos": "B02", "abuela-ondas": "B03", "abuela-gafas": "B04", "abuelo-calvo": "B05", "abuelo-barba": "B06", "abuelo-gafas": "B07", "abuelo-gris": "B08"},
}
GRANDPARENT_NOTES = {
    "lapiz": "B03 sin gafas; B06 con gafas y sin barba (arquetipo abuelo-barba aproximado)",
    "flat": "B06 sin gafas (arquetipo abuela-gafas aproximado); B08 sin gafas",
    "papercraft": "B05 calvo con gafas",
    "acuarela": "B08 lleva gorra",
}

# (archivo, tipo, categoria, estilo, confianza, nota)
CLASIFICACION = [
    ("Cometa roja en el prado.png", "ancla", None, "3d", "alta", ""),
    ("El niño, la abuela y la cometa.png", "ancla", None, "flat", "alta", ""),
    ("La cometa roja en el prado-1.png", "ancla", None, "gouache", "alta", "pintura opaca, trenca con alamares"),
    ("La cometa roja en el prado.png", "ancla", None, "papercraft", "alta", "fieltro/papel recortado"),
    ("La cometa roja y la abuela-2.png", "ancla", None, "lapiz", "alta", ""),
    ("La cometa y la abuela.png", "ancla", None, "acuarela", "alta", "protagonista con melena; el resto de anclas, pelo corto"),
    ("Catálogo de 12 peinados infantiles-1.png", "catalogo", "hair", "flat", "alta", ""),
    ("Catálogo de 12 peinados infantiles-2.png", "catalogo", "hair", "lapiz", "alta", ""),
    ("Catálogo de 12 peinados infantiles-3.png", "catalogo", "hair", "gouache", "media", "trenca con alamares como el ancla gouache"),
    ("Catálogo de abuelos sonrientes B01–B08-1.png", "catalogo", "grandparent", "lapiz", "alta", ""),
    ("Catálogo de ocho abuelos amables-3.png", "catalogo", "grandparent", "gouache", "media", "pincel seco opaco; distinguir de acuarela es dudoso"),
    ("Catálogo de ocho abuelos amables-4.png", "catalogo", "grandparent", "flat", "alta", ""),
    ("Catálogo de ocho abuelos amables-5.png", "catalogo", "grandparent", "acuarela", "media", "aguadas transparentes"),
    ("Catálogo de ocho abuelos amistosos-2.png", "catalogo", "grandparent", "papercraft", "alta", ""),
    ("Catálogo de ocho abuelos sonrientes.png", "catalogo", "grandparent", "3d", "alta", ""),
    ("Catálogo de accesorios infantiles A01–A08-1.png", "catalogo", "accessory", "acuarela", "media", "textura moteada suave"),
    ("Catálogo ilustrado de accesorios infantiles-3.png", "catalogo", "accessory", "gouache", "media", "pincelada opaca; gorro rojo en vez de amarillo"),
    ("Catálogo de accesorios infantiles A01–A08-4.png", "catalogo", "accessory", "papercraft", "alta", ""),
    ("Catálogo de accesorios infantiles en cuadrícula-2.png", "catalogo", "accessory", "lapiz", "alta", ""),
    ("Catálogo de ocho accesorios infantiles en cuadrícula-1.png", "catalogo", "accessory", "flat", "alta", ""),
    ("Muestrario de accesorios infantiles-5.png", "catalogo", "accessory", "3d", "alta", ""),
    ("Catálogo de mascotas amistosas P01–P08-4.png", "catalogo", "pet", "3d", "alta", ""),
    ("Catálogo de ocho mascotas adorables-2.png", "catalogo", "pet", "papercraft", "alta", "textura de fieltro"),
    ("Catálogo de ocho mascotas amigables-1.png", "catalogo", "pet", "lapiz", "alta", ""),
    ("Catálogo de ocho mascotas amigables-3.png", "catalogo", "pet", "acuarela", "media", "aguadas suaves"),
    ("Catálogo de ocho mascotas amigables-4.png", "catalogo", "pet", "flat", "alta", ""),
    ("Hoja de referencia de ocho mascotas-2.png", "catalogo", "pet", "gouache", "media", "pincelada opaca"),
    ("Catálogo de ocho conjuntos infantiles-1.png", "catalogo", "outfit", "flat", "alta", ""),
    ("Catálogo de ocho conjuntos infantiles-2.png", "catalogo", "outfit", "gouache", "media", "trenca con alamares"),
    ("Catálogo de ocho conjuntos infantiles-3.png", "catalogo", "outfit", "lapiz", "alta", ""),
    ("Catálogo de ocho conjuntos infantiles-4.png", "catalogo", "outfit", "3d", "alta", ""),
    ("Ocho conjuntos infantiles en cuadrícula-5.png", "catalogo", "outfit", "papercraft", "alta", ""),
    ("Catálogo de ocho tonos de piel-1.png", "catalogo", "skin", "gouache", "media", ""),
    ("Catálogo de ocho tonos de piel-6.png", "catalogo", "skin", "lapiz", "alta", ""),
    ("Catálogo infantil de tonos de piel-2.png", "catalogo", "skin", "papercraft", "alta", ""),
    ("Muestrario de ocho tonos de piel-4.png", "catalogo", "skin", "acuarela", "alta", "niña con melena como el ancla acuarela"),
    ("Muestrario de ocho tonos de piel-5.png", "catalogo", "skin", "3d", "alta", ""),
    ("Muestrario infantil de ocho tonos de piel-7.png", "catalogo", "skin", "flat", "alta", ""),
    ("Catálogo de ojos infantiles E01–E06-4.png", "catalogo", "eyes", "3d", "alta", ""),
    ("Catálogo de ojos infantiles E01–E06-6.png", "catalogo", "eyes", "lapiz", "alta", ""),
    ("Catálogo de ojos infantiles E01–E06-7.png", "catalogo", "eyes", "gouache", "media", ""),
    ("Catálogo de seis diseños de ojos infantiles-1.png", "catalogo", "eyes", "flat", "alta", ""),
    ("Catálogo de seis diseños de ojos-5.png", "catalogo", "eyes", "acuarela", "alta", ""),
    ("Muestrario de seis ojos infantiles-3.png", "catalogo", "eyes", "papercraft", "alta", ""),
    ("Catálogo de seis gafas infantiles-2.png", "catalogo", "glasses", "papercraft", "alta", ""),
    ("Catálogo de seis monturas infantiles-4.png", "catalogo", "glasses", "3d", "alta", ""),
    ("Catálogo de seis monturas infantiles-5.png", "catalogo", "glasses", "gouache", "media", ""),
    ("Muestrario de seis gafas infantiles-2.png", "catalogo", "glasses", "flat", "alta", ""),
    ("Seis diseños de gafas infantiles-1.png", "catalogo", "glasses", "acuarela", "alta", ""),
    ("Seis diseños de gafas infantiles-3.png", "catalogo", "glasses", "lapiz", "alta", ""),
]
CATEGORIES = ["hair", "skin", "eyes", "glasses", "outfit", "accessory", "pet", "grandparent"]
TARGET_H = 400
MARGIN = 0.08


def suffix(name):
    m = re.search(r"-(\d+)\.png$", name)
    return int(m.group(1)) if m else None


def _runs(v, min_gap):
    """Tramos [a,b) donde v es True, fusionando huecos menores que min_gap."""
    runs, a = [], None
    for i, x in enumerate(v):
        if x and a is None:
            a = i
        elif not x and a is not None:
            runs.append([a, i]); a = None
    if a is not None:
        runs.append([a, len(v)])
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < min_gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return merged


def _force(runs, n):
    """Ajusta a n tramos fusionando los huecos más pequeños."""
    runs = [list(r) for r in runs]
    while len(runs) > n:
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        i = gaps.index(min(gaps))
        runs[i][1] = runs[i + 1][1]
        del runs[i + 1]
    return runs


def find_cells(img, rows, cols):
    """Rejilla por proyecciones: bandas de filas (descartando etiquetas de texto) y columnas dentro de cada banda."""
    a = np.asarray(img.convert("RGB")).astype(int)
    mask = a.min(axis=2) < 232
    mask = ndimage.binary_opening(mask, iterations=1)
    H, W = mask.shape
    bands = [r for r in _runs(mask.sum(axis=1) > 2, 4) if r[1] - r[0] >= 70]
    if len(bands) < rows:
        raise RuntimeError(f"filas: esperaba {rows}, encontradas {len(bands)}")
    bands = _force(bands, rows) if len(bands) > rows else bands
    cells = []
    for y0, y1 in bands:
        sub = mask[y0:y1]
        colruns = [r for r in _runs(sub.sum(axis=0) > 1, 18) if r[1] - r[0] >= 25]
        if len(colruns) < cols:
            # figuras que se tocan: corta en el mínimo de la proyección cerca de cada frontera uniforme
            proj = sub.sum(axis=0)
            xa, xb = colruns[0][0], colruns[-1][1]
            step = (xb - xa) / cols
            cuts = [xa]
            for k in range(1, cols):
                c = int(xa + k * step); w = int(step * 0.2)
                cuts.append(c - w + int(np.argmin(proj[c - w:c + w])))
            cuts.append(xb)
            colruns = [[cuts[k], cuts[k + 1]] for k in range(cols)]
        colruns = _force(colruns, cols)
        for x0, x1 in colruns:
            cm = mask[y0:y1, x0:x1]
            # limpia etiquetas de texto: blobs pequeños (letras/palabras) tras dilatar 2 px
            lab, n = ndimage.label(ndimage.binary_dilation(cm, iterations=2))
            keep = np.zeros(n + 1, bool)
            for i, sl in enumerate(ndimage.find_objects(lab), start=1):
                h = sl[0].stop - sl[0].start
                area = int((lab[sl] == i).sum())
                keep[i] = h >= 45 or area >= 2500
            km = keep[lab] & cm
            ys = np.where(km.any(axis=1))[0]
            xs = np.where(km.any(axis=0))[0]
            erase = np.zeros(mask.shape, bool)
            erase[y0:y1, x0:x1] = cm & ~keep[lab]
            cells.append({"sl": (slice(y0 + ys[0], y0 + ys[-1] + 1), slice(x0 + xs[0], x0 + xs[-1] + 1)), "erase": erase})
    return cells, mask


def crop_cell(img, cell, lab):
    a = np.asarray(img.convert("RGB")).copy()
    a[cell["erase"]] = 255
    sl = cell["sl"]
    region = a[sl].copy()
    h, w = region.shape[:2]
    m = int(max(h, w) * MARGIN)
    canvas = np.full((h + 2 * m, w + 2 * m, 3), 255, dtype=np.uint8)
    canvas[m:m + h, m:m + w] = region
    im = Image.fromarray(canvas)
    scale = TARGET_H / im.height
    return im.resize((max(1, round(im.width * scale)), TARGET_H), Image.LANCZOS)


def palette(path, k=6):
    im = Image.open(path).convert("RGB").resize((384, 256))
    q = im.quantize(colors=k, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: 3 * k]
    counts = sorted(q.getcolors(), reverse=True)
    return ["#%02x%02x%02x" % tuple(pal[3 * idx: 3 * idx + 3]) for _, idx in counts]


PROMPT_STYLE = {
    "3d": "soft 3D children's book illustration, rounded clay-like characters with smooth matte materials, gentle global illumination, warm pastel palette, shallow depth of field",
    "flat": "flat vector-style children's book illustration, simple solid shapes, subtle paper grain, limited warm palette, no outlines, clean composition",
    "gouache": "retro gouache children's book illustration, opaque matte paint with visible brush texture, mid-century picture-book feel, warm earthy palette",
    "papercraft": "papercraft children's book illustration, layered cut paper and felt textures with soft drop shadows, handmade tactile look, bright cheerful palette",
    "lapiz": "colored pencil children's book illustration, visible pencil strokes and paper tooth, soft hatching, light airy palette, hand-drawn warmth",
    "acuarela": "watercolor children's book illustration, transparent washes with soft edges and paper texture, fine ink details, fresh light palette",
}
LABELS = {"3d": "3D suave", "flat": "Plano", "gouache": "Gouache retro", "papercraft": "Papercraft", "lapiz": "Lápiz de colores", "acuarela": "Acuarela"}


def main():
    files = sorted(os.listdir(RAW))
    known = {c[0] for c in CLASIFICACION}
    missing = [f for f in files if f not in known]
    if missing:
        raise SystemExit(f"sin clasificar: {missing}")
    images, crops = [], []
    sets = {s: {"anchor": None, **{c: None for c in CATEGORIES}} for s in STYLES}
    for fname, tipo, cat, style, conf, note in CLASIFICACION:
        rel = f"assets/raw/{fname}"
        img_entry = {"file": fname, "tipo": tipo, "categoria": cat, "estilo": style, "variante": suffix(fname), "confianza": conf}
        if note:
            img_entry["nota"] = note
        images.append(img_entry)
        key = "anchor" if tipo == "ancla" else cat
        if sets[style][key] is not None:
            raise SystemExit(f"duplicado {style}/{key}")
        sets[style][key] = rel
        if tipo != "catalogo":
            continue
        img = Image.open(os.path.join(RAW, fname))
        rows, cols = GRID_SHAPE[cat]
        cells, lab = find_cells(img, rows, cols)
        if cat == "grandparent":
            pos_to_id = {v: k for k, v in GRANDPARENT_MAP[style].items()}
            ids = [pos_to_id[f"B{n:02d}"] for n in range(1, 9)]
        else:
            ids = GRID_IDS[cat]
        os.makedirs(os.path.join(OUT, style, cat), exist_ok=True)
        for n, (cell, tid) in enumerate(zip(cells, ids), start=1):
            out = crop_cell(img, cell, lab)
            p = os.path.join(OUT, style, cat, f"{tid}.png")
            out.save(p, optimize=True)
            sl = cell["sl"]
            # ruta en repo = web/public + publicPath; imagen de origen = juegos[estilo][categoria]
            crops.append({"estilo": style, "categoria": cat, "traitId": tid, "posicion": n,
                          "publicPath": "/" + os.path.relpath(p, os.path.join(ROOT, "web", "public")),
                          "bbox": [int(sl[1].start), int(sl[0].start), int(sl[1].stop), int(sl[0].stop)]})
    huecos = [{"estilo": s, "categoria": c} for s in STYLES for c in CATEGORIES if sets[s][c] is None]
    manifest = {
        "version": 1,
        "fuente": "GPT-image, generadas por Álvaro siguiendo los prompts del plan; 1536×1024",
        "estilos": STYLES,
        "categorias": CATEGORIES,
        "nota_variante": "variante = sufijo -N del nombre de archivo. Verificado: NO indica el estilo (p. ej. -1 aparece en flat, lapiz, gouache y acuarela).",
        "nota_seleccion": "Hay como máximo una imagen por (estilo, categoría): el juego de cada estilo es esa imagen. Ruta original = assets/raw/<file>.",
        "abuelos": {"nota": "El orden B01–B08 cambia entre estilos; se mapean 8 arquetipos a la posición más parecida.",
                    "mapa": GRANDPARENT_MAP, "discrepancias": GRANDPARENT_NOTES},
        "imagenes": images,
        "juegos": sets,
        "huecos": huecos,
        "nota_recortes": "Un PNG por id en web/public/catalog/<estilo>/<categoria>/<id>.png, en el orden de la cuadrícula. Las bbox se recalculan al ejecutar este script.",
        "recortes": recortes_por_juego(crops, sets),
    }
    with open(os.path.join(ROOT, "assets", "manifest.json"), "w") as f:
        f.write(compact_json(manifest))
    styles = []
    for s in STYLES:
        styles.append({"id": s, "label": LABELS[s], "anchorPath": sets[s]["anchor"],
                       "promptStyle": PROMPT_STYLE[s],
                       "promptStyleOrigen": "redactado por el agente mirando el ancla; sustituir por el texto exacto del Prompt 1",
                       "palette": palette(os.path.join(ROOT, sets[s]["anchor"]))})
    for out in (os.path.join(ROOT, "assets", "styles.json"), os.path.join(ROOT, "web", "lib", "generation", "styles.json")):
        # web/lib/generation/styles.json es copia generada (Next no importa fuera de web/)
        with open(out, "w") as f:
            json.dump({"version": 1, "styles": styles}, f, ensure_ascii=False, indent=2)
    write_seed_sql(manifest)
    print(f"imagenes={len(images)} recortes={len(crops)} huecos={huecos}")
    return crops


def recortes_por_juego(crops, sets):
    out = {}
    for c in crops:
        k = (c["estilo"], c["categoria"])
        out.setdefault(k, {"estilo": k[0], "categoria": k[1], "origen": sets[k[0]][k[1]], "ids": []})["ids"].append(c["traitId"])
    return list(out.values())


def compact_json(manifest):
    """JSON legible pero compacto: una imagen y un recorte por línea."""
    lines = ["{"]
    keys = list(manifest)
    for i, k in enumerate(keys):
        v = manifest[k]
        end = "," if i < len(keys) - 1 else ""
        if isinstance(v, list) and v and isinstance(v[0], dict):
            items = [json.dumps(x, ensure_ascii=False) for x in v]
            lines.append(f'  "{k}": [\n    ' + ",\n    ".join(items) + f"\n  ]{end}")
        else:
            lines.append(f'  "{k}": ' + json.dumps(v, ensure_ascii=False) + end)
    return "\n".join(lines) + "\n}\n"


def write_seed_sql(manifest):
    """supabase/migrations/0003_cuentos_3_assets_seed.sql a partir del manifest."""
    groups = {(r["estilo"], r["categoria"]): r["ids"] for r in manifest["recortes"]}
    anchors = ",\n  ".join(f"('{st}', '{v['anchor']}')" for st, v in manifest["juegos"].items())
    crops = ",\n  ".join(f"('{s}', '{c}', '{{{','.join(ids)}}}')" for (s, c), ids in sorted(groups.items()))
    sql = f"""-- cuentos_3_assets_seed · generado por scripts/assets_build.py desde assets/manifest.json
-- Anclas: ruta en el repo (assets/raw, ignorado por git). Recortes: ruta pública /catalog/<estilo>/<categoria>/<id>.png
insert into public.cuentos_assets (kind, style_id, category, trait_id, path)
select 'anchor', s, null, null, p from (values
  {anchors}
) a(s, p)
on conflict (path) do nothing;

insert into public.cuentos_assets (kind, style_id, category, trait_id, path)
select 'crop', g.s, g.c, t.id, '/catalog/' || g.s || '/' || g.c || '/' || t.id || '.png'
from (values
  {crops}
) g(s, c, ids)
cross join lateral unnest(g.ids::text[]) as t(id)
on conflict (path) do nothing;
"""
    with open(os.path.join(ROOT, "supabase", "migrations", "0003_cuentos_3_assets_seed.sql"), "w") as f:
        f.write(sql)


if __name__ == "__main__":
    main()
