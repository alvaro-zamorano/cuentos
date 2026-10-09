#!/usr/bin/env python3
"""
Fabrica las piezas de la marioneta pintada a partir del catálogo (web/public/catalog/<estilo>/...):
  - cabezas: bust de pelo recortado por la barbilla → pieces/<estilo>/heads/<pelo>.png (piel y pelo base; recolor en cliente, lib/recolor.ts)
  - cuerpos: conjunto sin cabeza (cuello visible) → pieces/<estilo>/bodies/<conjunto>.png
  - pieces.json: geometría (barbilla, centro, anchos) para que el compositor alinee cabeza y cuerpo.
Recolor de piel: desplaza tono/luminosidad de los píxeles "piel" hacia el tono objetivo conservando el sombreado.
Uso: python3 scripts/pieces_build.py [estilo]   (por defecto gouache)
"""
import colorsys, json, os, sys
from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STYLE = sys.argv[1] if len(sys.argv) > 1 else "gouache"
CAT = os.path.join(ROOT, "web", "public", "catalog", STYLE)
OUT = os.path.join(ROOT, "web", "public", "pieces", STYLE)

SKINS = {  # mismo orden e ids que web/lib/traits.ts
    "muy-clara": "#fde6d6", "clara": "#f4cfae", "melocoton": "#ebbd94", "media": "#d9a070",
    "tostada": "#c48a5c", "morena": "#a86c44", "morena-oscura": "#8a5434", "oscura": "#6a3f27",
}
BASE_SKIN = "#f3c9a6"  # tono de piel del catálogo (medido)


def cutout(img, thresh=38):
    """Fondo blanco → transparente. Solo el blanco conectado con el borde (los blancos interiores se conservan)."""
    from PIL import ImageDraw, ImageFilter
    im = img.convert("RGBA")
    rgb = im.convert("RGB")
    probe = rgb.copy()
    w, h = probe.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for sx, sy in seeds:
        if sum(probe.getpixel((sx, sy))) > 600:
            ImageDraw.floodfill(probe, (sx, sy), (255, 0, 255), thresh=thresh)
    pa = np.array(probe)
    bg = (pa[..., 0] == 255) & (pa[..., 1] == 0) & (pa[..., 2] == 255)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # suaviza el borde 1 px y recupera semitransparencia en los píxeles claros del contorno
    am = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(0.8))
    out = np.array(im)
    out[..., 3] = np.minimum(out[..., 3], np.array(am))
    return Image.fromarray(out, "RGBA")


def hex2rgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def skin_mask(a):
    """Máscara de piel del catálogo: tono naranja-melocotón, saturación media, claro."""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    al = a[..., 3]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1)
    hue_ok = (r > g) & (g > b) & (r - b > 50) & (r - b < 140) & (r - g > 24) & (g - b < 58)
    light = (r > 185) & (g > 130) & (b > 90)
    return hue_ok & light & (sat > 0.26) & (sat < 0.62) & (al > 0)


HAIRS = {"castano": None, "negro": "#2b2118", "rubio": "#e8c470", "pelirrojo": "#d2602c", "caoba": "#8c3b2e"}
BASE_HAIR = "#7a4a26"


def hair_mask(a):
    """Pelo castaño del catálogo: marrón saturado, más oscuro que la piel."""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    al = a[..., 3]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1)
    return (r > g) & (g >= b) & (r < 200) & (r - b > 30) & (sat > 0.35) & (al > 0) & ~skin_mask(a)


def recolor_hair(img, target_hex):
    if target_hex is None:
        return img
    a = np.array(img.convert("RGBA")).astype(float)
    m = hair_mask(a.astype(np.uint8))
    if not m.any():
        return img
    tr, tg, tb = hex2rgb(target_hex); br, bg, bb = hex2rgb(BASE_HAIR)
    th, tl, ts = colorsys.rgb_to_hls(tr / 255, tg / 255, tb / 255)
    bh, bl, bs = colorsys.rgb_to_hls(br / 255, bg / 255, bb / 255)
    px = a[m][:, :3] / 255.0
    out = np.empty_like(px)
    for i, (r, g, b) in enumerate(px):
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        l2 = min(1.0, max(0.0, tl * (l / max(bl, 1e-6))))
        s2 = min(1.0, max(0.0, s * (ts / max(bs, 1e-6))))
        out[i] = colorsys.hls_to_rgb((h + (th - bh)) % 1.0, l2, s2)
    a[m, :3] = out * 255
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def recolor_skin(img, target_hex):
    a = np.array(img.convert("RGBA")).astype(float)
    m = skin_mask(a.astype(np.uint8))
    if not m.any():
        return img
    tr, tg, tb = hex2rgb(target_hex); br, bg, bb = hex2rgb(BASE_SKIN)
    th, ts, tl = colorsys.rgb_to_hls(tr / 255, tg / 255, tb / 255)
    bh, bs, bl = colorsys.rgb_to_hls(br / 255, bg / 255, bb / 255)
    px = a[m][:, :3] / 255.0
    out = np.empty_like(px)
    for i, (r, g, b) in enumerate(px):
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        # conserva el sombreado relativo: luminosidad escalada al tono objetivo
        l2 = min(1.0, max(0.0, tl * (l / max(bl, 1e-6))))
        s2 = min(1.0, max(0.0, s * (ts / max(bs, 1e-6))))
        h2 = (h + (th - bh)) % 1.0
        out[i] = colorsys.hls_to_rgb(h2, l2, s2)
    a[m, :3] = out * 255
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def first_row_where(mask, min_frac, width):
    rows = mask.sum(axis=1)
    idx = np.where(rows > width * min_frac)[0]
    return int(idx[0]) if len(idx) else None


def build_heads():
    heads = {}
    src = os.path.join(CAT, "hair")
    os.makedirs(os.path.join(OUT, "heads"), exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.endswith(".png"):
            continue
        hid = f[:-4]
        im = cutout(Image.open(os.path.join(src, f)))
        a = np.array(im)
        r, g, b, al = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int), a[..., 3]
        yellow = (r > 215) & (g > 175) & (b < 110) & (g - b > 90) & (al > 0)  # chubasquero amarillo del bust
        rows = yellow.sum(axis=1)
        cand = [i for i in range(int(im.height * 0.5), im.height) if rows[i] > im.width * 0.22]
        chin = cand[0] if cand else int(im.height * 0.7)
        # recorte: solo la cabeza (hasta la barbilla + 6 px) con desvanecido en el borde inferior
        head = im.crop((0, 0, im.width, min(im.height, chin + 6)))
        ha = np.array(head)
        fade = np.ones(ha.shape[0]); fade[-10:] = np.linspace(1, 0, 10)
        ha[..., 3] = (ha[..., 3] * fade[:, None]).astype(np.uint8)
        head = Image.fromarray(ha, "RGBA")
        # ancho de la cara (zona de piel) para escalar
        sm = skin_mask(np.array(head))
        cols = np.where(sm.sum(axis=0) > 3)[0]
        face_w = int(cols.max() - cols.min()) if len(cols) else int(im.width * 0.3)
        face_cx = int((cols.max() + cols.min()) / 2) if len(cols) else im.width // 2
        head.save(os.path.join(OUT, "heads", f"{hid}.png"), optimize=True)  # base: piel melocotón, pelo castaño; recolor en cliente
        heads[hid] = {"w": head.width, "h": head.height, "chin": int(chin), "faceW": face_w, "faceCx": face_cx}
    return heads


def build_bodies():
    bodies = {}
    src = os.path.join(CAT, "outfit")
    os.makedirs(os.path.join(OUT, "bodies"), exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.endswith(".png"):
            continue
        bid = f[:-4]
        im = cutout(Image.open(os.path.join(src, f)))
        sm = skin_mask(np.array(im))
        # cara: zona de piel en el tercio superior
        top = sm[: int(im.height * 0.45)]
        cols = np.where(top.sum(axis=0) > 3)[0]
        rows = np.where(top.sum(axis=1) > 3)[0]
        face_w = int(cols.max() - cols.min()) if len(cols) else int(im.width * 0.5)
        face_cx = int((cols.max() + cols.min()) / 2) if len(cols) else im.width // 2
        chin = int(rows.max()) if len(rows) else int(im.height * 0.37)
        head_top = chin - 26  # barbilla visible; por encima va la cabeza nueva
        ia = np.array(im)
        ia[:head_top, :, 3] = 0
        fade = np.linspace(0, 1, 8)
        ia[head_top:head_top + 8, :, 3] = (ia[head_top:head_top + 8, :, 3] * fade[:, None]).astype(np.uint8)
        headless = Image.fromarray(ia, "RGBA")
        headless.save(os.path.join(OUT, "bodies", f"{bid}.png"), optimize=True)
        bodies[bid] = {"w": im.width, "h": im.height, "chin": head_top, "faceW": face_w, "faceCx": face_cx}
    return bodies


def copy_dir(cat, out):
    src = os.path.join(CAT, cat); dst = os.path.join(OUT, out)
    os.makedirs(dst, exist_ok=True)
    meta = {}
    for f in sorted(os.listdir(src)):
        if f.endswith(".png"):
            im = cutout(Image.open(os.path.join(src, f)))
            im.save(os.path.join(dst, f), optimize=True)
            meta[f[:-4]] = {"w": im.width, "h": im.height}
    return meta


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    manifest = {
        "style": STYLE,
        "heads": build_heads(),
        "bodies": build_bodies(),
        "pets": copy_dir("pet", "pets"),
        "grandparents": copy_dir("grandparent", "grandparents"),
        "skins": list(SKINS.keys()),
        "hairColors": list(HAIRS.keys()),
    }
    with open(os.path.join(OUT, "pieces.json"), "w") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)
    n = sum(len(files) for _, _, files in os.walk(OUT))
    print(f"{STYLE}: {n} archivos en {OUT}")
    print(json.dumps({k: v for k, v in manifest["heads"].items()}, indent=0)[:600])
    print(json.dumps(manifest["bodies"], indent=0)[:600])
