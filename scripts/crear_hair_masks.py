"""
Máscaras del pelo de las miniaturas de peinado del paso 2 de /crear (web/public/crear/hair/<id>.webp).

El recoloreado del navegador elegía los píxeles de pelo por su color, uno a uno: cogía también los contornos de ojos,
boca y cara y el botón del chubasquero (halos amarillos con el rubio) y se dejaba las sombras oscuras (el afro a
manchas). Aquí se hace una vez y bien: color de pelo + sombras, quitar islas pequeñas, cerrar huecos y suavizar el
borde. Salida: web/public/crear/hair/<id>.mask.png (gris, 255 = pelo), la usa lib/recolor.ts.

Uso: python3 scripts/crear_hair_masks.py     (necesita numpy, Pillow y scipy)
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as nd

DIR = os.path.join(os.path.dirname(__file__), "..", "web", "public", "crear", "hair")
MIN_AREA = 400  # px a 240×240: los contornos de ojos y boca quedan por debajo


def hair_mask(im: np.ndarray) -> np.ndarray:
    r, g, b = (im[..., i].astype(float) for i in range(3))
    mx = im.max(-1).astype(float)
    mn = im.min(-1).astype(float)
    sat = (mx - mn) / np.maximum(mx, 1)
    hue = np.where(mx > mn, 60 * (g - b) / np.maximum(mx - mn, 1), 0)
    skin_core = (mx == r) & (hue >= 15) & (hue <= 32) & (sat >= 0.36) & (sat <= 0.68) & (mx >= 199)
    m = (r > g) & (g >= b) & (r < 200) & (r - b > 30) & ~skin_core  # castaños y anaranjados
    m |= (mx < 90) & (r >= b) & (mx > 25)  # sombras oscuras del pelo
    m &= ~((g > 150) & (b < 80))  # el amarillo del chubasquero

    def big(x):
        lab, n = nd.label(x)
        if n == 0:
            return x
        sizes = nd.sum(x, lab, range(1, n + 1))
        return np.isin(lab, 1 + np.where(sizes > MIN_AREA)[0])

    keep = big(m)
    keep = nd.binary_closing(keep, iterations=2)
    keep = nd.binary_fill_holes(keep) & nd.binary_dilation(m, iterations=1)
    keep = nd.binary_opening(keep, iterations=1)
    keep = big(keep)
    soft = nd.gaussian_filter(keep.astype(float), 0.8)
    return (soft * 255).clip(0, 255).astype(np.uint8)


def main():
    n = 0
    for f in sorted(os.listdir(DIR)):
        if not f.endswith(".webp"):
            continue
        im = np.array(Image.open(os.path.join(DIR, f)).convert("RGB"))
        out = os.path.join(DIR, f.replace(".webp", ".mask.png"))
        Image.fromarray(hair_mask(im), "L").save(out, optimize=True)
        n += 1
    print(f"{n} máscaras en {DIR}")


if __name__ == "__main__":
    main()
