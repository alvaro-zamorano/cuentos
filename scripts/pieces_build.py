#!/usr/bin/env python3
"""
Fabrica las piezas de la marioneta pintada a partir del catálogo (web/public/catalog/<estilo>/...):
  - cabezas: bust de pelo recortado por la barbilla → pieces/<estilo>/heads/<pelo>.png (piel y pelo base; recolor en cliente, lib/recolor.ts)
  - cuerpos: conjunto sin cabeza (cuello visible) → pieces/<estilo>/bodies/<conjunto>.png
  - pieces.json: geometría (barbilla, centro, anchos) para que el compositor alinee cabeza y cuerpo.
Assets nuevos (opcionales, carpeta assets/raw/<estilo>/, no versionada; ver docs/ASSETS.md):
  - backgrounds/<escena>.(png|jpg|webp) → pieces/<estilo>/backgrounds/<escena>.jpg (1200×800) + colocación de scripts/backgrounds_layout.json
  - poses/<pose>/<prenda>.png (figura entera, fondo blanco) → pieces/<estilo>/poses/<pose>/<prenda>.png (sin cabeza, misma geometría que bodies)
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
RAW = os.path.join(ROOT, "assets", "raw", STYLE)
SCENES = ["cama-manana", "ventana", "desayuno", "puerta-regalo", "salon-globos", "nube-deseo", "parque", "jardin-juego", "mesa-tarta", "velas", "abrir-regalo", "cama-noche"]
BG_W, BG_H = 1200, 800

SKINS = {  # mismo orden e ids que web/lib/traits.ts
    "muy-clara": "#fde6d6", "clara": "#f4cfae", "melocoton": "#ebbd94", "media": "#d9a070",
    "tostada": "#c48a5c", "morena": "#a86c44", "morena-oscura": "#8a5434", "oscura": "#6a3f27",
}
BASE_SKIN = "#f3c9a6"  # tono de piel del catálogo (medido)


def cutout(img, thresh=38):
    """Fondo blanco → transparente (solo el conectado con el borde; los blancos interiores, como los ojos, se conservan).
    La sombra gris neutra pintada bajo los pies también se quita (si no, el blanco que encierra queda como una mancha)."""
    from PIL import ImageFilter
    from scipy import ndimage
    im = img.convert("RGBA")
    a = np.array(im)
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    h = a.shape[0]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    white = mn > 255 - thresh // 2 - 4  # ≈ > 236 en los tres canales
    rows = np.arange(h)[:, None]
    grey_shadow = (mx - mn < 12) & (mn > 150) & (rows > h * 0.7)  # gris neutro claro en la franja inferior
    bglike = white | grey_shadow
    lab, n = ndimage.label(bglike)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border = border[border > 0]
    bg = np.isin(lab, border)
    # hueco entre las piernas: blanco encerrado (no toca el borde), en la mitad inferior, centrado y alto;
    # los calcetines y las suelas blancas son bajos y descentrados y se conservan
    w = a.shape[1]
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None or i in border:
            continue
        ys, xs = sl
        hh, cx = ys.stop - ys.start, (xs.start + xs.stop) / 2
        if ys.start > h * 0.45 and hh > h * 0.06 and 0.38 * w < cx < 0.62 * w:
            bg |= lab == i
        # restos de suelo blanco entre los zapatos, en la franja inferior
        elif ys.start > h * 0.88 and 0.25 * w < cx < 0.75 * w:
            bg |= lab == i
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # suaviza el borde 1 px y recupera semitransparencia en los píxeles claros del contorno
    am = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(0.8))
    out = a.copy()
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
    # misma máscara que web/lib/recolor.ts (isSkin): tono 8–34°, saturación 0.3–0.8, valor ≥ 0.62
    d = np.maximum(mx - mn, 1)
    hue = np.where(mx == r, 60 * (g - b) / d, 999)
    return (mx == r) & (hue >= 8) & (hue <= 34) & (sat >= 0.3) & (sat <= 0.8) & (mx >= 158) & (al > 0)


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
        # ropa del bust original (cuello amarillo del chubasquero y camiseta azul oscura) que asoma bajo la barbilla:
        # en el tercio inferior se borran esos colores (ni piel ni pelo) y 1 px alrededor
        hr, hg, hb = ha[..., 0].astype(int), ha[..., 1].astype(int), ha[..., 2].astype(int)
        hmx = np.maximum(np.maximum(hr, hg), hb); hmn = np.minimum(np.minimum(hr, hg), hb)
        hsat = (hmx - hmn) / np.maximum(hmx, 1)
        garment = (
            ((hr > 200) & (hg > 160) & (hb < 120) & (hg - hb > 70))  # amarillo
            | ((hb > hr + 10) & (hg < 110) & (hr < 60))  # azul oscuro
            | ((hr > 225) & (hg > 215) & (hb > 190) & (hsat < 0.2))  # forro blanco/crema
            | ((hr > 200) & (hg > 170) & (hb < 170) & (hg - hb > 40) & (hr - hg < 50))  # amarillo pálido del borde
        )
        ochre = (hr > 150) & (hg > 120) & (hb < 80) & (hg - hb > 70) & (hr - hg < 95)  # amarillo en sombra (no es pelo castaño)
        garment |= ochre
        garment[: int(ha.shape[0] * 0.62)] = False
        dil = garment.copy()
        dil[1:] |= garment[:-1]; dil[:-1] |= garment[1:]; dil[:, 1:] |= garment[:, :-1]; dil[:, :-1] |= garment[:, 1:]
        keep = skin_mask(ha) | (hair_mask(ha) & ~ochre)
        ha[..., 3] = np.where(dil & ~keep, 0, ha[..., 3])
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


def headless(im):
    """Figura entera (fondo ya transparente) → cuerpo sin cabeza + geometría (barbilla, cara)."""
    sm = skin_mask(np.array(im))
    # cara: zona de piel en el tercio superior
    top = sm[: int(im.height * 0.45)]
    cols = np.where(top.sum(axis=0) > 3)[0]
    rows = np.where(top.sum(axis=1) > 3)[0]
    face_w = int(cols.max() - cols.min()) if len(cols) else int(im.width * 0.5)
    face_cx = int((cols.max() + cols.min()) / 2) if len(cols) else im.width // 2
    chin = int(rows.max()) if len(rows) else int(im.height * 0.37)
    head_top = chin - 10  # cuello y arranque de la barbilla; por encima va la cabeza nueva (si se deja más barbilla, asoma bajo la cabeza nueva)
    ia = np.array(im)
    ia[:head_top, :, 3] = 0
    fade = np.linspace(0, 1, 8)
    ia[head_top:head_top + 8, :, 3] = (ia[head_top:head_top + 8, :, 3] * fade[:, None]).astype(np.uint8)
    body = Image.fromarray(ia, "RGBA")
    return body, {"w": im.width, "h": im.height, "chin": head_top, "faceW": face_w, "faceCx": face_cx}


def build_bodies():
    bodies = {}
    src = os.path.join(CAT, "outfit")
    os.makedirs(os.path.join(OUT, "bodies"), exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.endswith(".png"):
            continue
        bid = f[:-4]
        body, geom = headless(cutout(Image.open(os.path.join(src, f))))
        body.save(os.path.join(OUT, "bodies", f"{bid}.png"), optimize=True)
        bodies[bid] = geom
    return bodies


def build_poses(bodies):
    """assets/raw/<estilo>/poses/<pose>/<prenda>.png → pieces/<estilo>/poses/<pose>/<prenda>.png. Solo prendas conocidas."""
    src = os.path.join(RAW, "poses")
    poses = {}
    if not os.path.isdir(src):
        return poses
    for pose in sorted(os.listdir(src)):
        pdir = os.path.join(src, pose)
        if not os.path.isdir(pdir):
            continue
        for f in sorted(os.listdir(pdir)):
            if not f.lower().endswith(".png"):
                continue
            bid = f[:-4]
            if bid not in bodies:
                print(f"  aviso: poses/{pose}/{f} no es una prenda conocida ({', '.join(bodies)}); ignorado")
                continue
            body, geom = headless(cutout(Image.open(os.path.join(pdir, f))))
            os.makedirs(os.path.join(OUT, "poses", pose), exist_ok=True)
            body.save(os.path.join(OUT, "poses", pose, f"{bid}.png"), optimize=True)
            poses.setdefault(pose, {})[bid] = geom
    return poses


def build_backgrounds():
    """assets/raw/<estilo>/backgrounds/<escena>.* → pieces/<estilo>/backgrounds/<escena>.jpg (1200×800, recorte centrado a 3:2)."""
    src = os.path.join(RAW, "backgrounds")
    out = {}
    if not os.path.isdir(src):
        return out
    with open(os.path.join(ROOT, "scripts", "backgrounds_layout.json")) as fh:
        layout = json.load(fh)
    for f in sorted(os.listdir(src)):
        sid, ext = os.path.splitext(f)
        if ext.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        if sid not in SCENES:
            print(f"  aviso: backgrounds/{f} no es una escena conocida ({', '.join(SCENES)}); ignorado")
            continue
        im = Image.open(os.path.join(src, f)).convert("RGB")
        w, h = im.size
        if w / h > BG_W / BG_H:
            nw = int(h * BG_W / BG_H); x0 = (w - nw) // 2; im = im.crop((x0, 0, x0 + nw, h))
        else:
            nh = int(w * BG_H / BG_W); y0 = (h - nh) // 2; im = im.crop((0, y0, w, y0 + nh))
        im = im.resize((BG_W, BG_H), Image.LANCZOS)
        os.makedirs(os.path.join(OUT, "backgrounds"), exist_ok=True)
        im.save(os.path.join(OUT, "backgrounds", f"{sid}.jpg"), quality=82, optimize=True, progressive=True)
        out[sid] = {"w": BG_W, "h": BG_H, **layout[sid]}
    return out


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
    poses = build_poses(manifest["bodies"])
    if poses:
        manifest["poses"] = poses
    backgrounds = build_backgrounds()
    if backgrounds:
        manifest["backgrounds"] = backgrounds
    print(f"poses: {sum(len(v) for v in poses.values())} · fondos: {len(backgrounds)}")
    with open(os.path.join(OUT, "pieces.json"), "w") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)
    n = sum(len(files) for _, _, files in os.walk(OUT))
    print(f"{STYLE}: {n} archivos en {OUT}")
    print(json.dumps({k: v for k, v in manifest["heads"].items()}, indent=0)[:600])
    print(json.dumps(manifest["bodies"], indent=0)[:600])
