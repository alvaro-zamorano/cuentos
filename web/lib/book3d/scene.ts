/**
 * Visor 3D del libro de tapa dura (Three.js). Solo navegador: se carga con import() desde components/book3d/Book3D.tsx,
 * para que three no entre en el paquete de las páginas que no lo usan.
 *
 * El libro es apaisado (4:3, como el impreso y el PDF). Cada hoja gira sobre el lomo y se curva un poco al pasar.
 * Hojas: 0 portadilla / hoja de personajes · 1 dedicatoria / ilustración 1 · k texto k-1 / ilustración k · última texto P / «Fin».
 * Cerrado, el libro se puede girar arrastrando (lomo, cantos y trasera) y al soltar vuelve de frente.
 * No genera nada: pinta en canvas lo que recibe (URLs ya existentes) y, sin imagen, un hueco de papel.
 */
import * as THREE from "three";

export interface Book3DPage {
  n: number;
  text: string;
  /** Ilustración ya pintada. Sin ella (antes del pago o en pruebas) va papel con «se pintará: …». */
  imageUrl?: string | null;
  /** Qué imagen es (el id del job). La URL firmada cambia en cada consulta; la clave no, y solo si cambia se recarga. */
  imageKey?: string | null;
  scene?: string;
}

export interface Book3DData {
  title: string;
  name: string;
  from?: string;
  dedication?: string;
  coverUrl?: string | null;
  sheetUrl?: string | null;
  sheetKey?: string | null;
  /** Retratos de la página de personajes (25 oct): si están todos, van en vez de la hoja, como en el libro impreso. */
  portraits?: { name: string; url: string | null; key: string | null }[];
  pages: Book3DPage[];
  /** Páginas sin pintar todavía porque falta el pago: llevan la etiqueta «Al pagar». */
  locked?: boolean;
}

export interface Book3DFonts {
  serif: string;
  ui: string;
  hand: string;
}

export interface Book3DHandle {
  /** Número de «pasos»: 0 cerrado, 1 portadilla … último, «Fin». */
  readonly steps: number;
  go: (n: number) => void;
  next: () => void;
  prev: () => void;
  /** Media vuelta de presentación (una vez), para enseñar el lomo. */
  intro: () => void;
  /**
   * Cambios en caliente (25 oct), sin rehacer la escena ni perder la página: textos, dedicatoria, «Al pagar» e imágenes
   * nuevas (por su clave). Devuelve false si cambia algo que obliga a rehacer el libro (título, nombre, portada, nº de páginas).
   */
  update: (next: Book3DData) => boolean;
  dispose: () => void;
}

const C = {
  night: "#1d2747",
  paper: "#fbf5ea",
  paperDeep: "#f4ead8",
  card: "#fffdf8",
  ink: "#232036",
  inkSoft: "#5d566c",
  accent: "#c8492c",
  star: "#f2b84b",
  moon: "#fbf1da",
};

type Face =
  | { k: "titulo" }
  | { k: "hoja" }
  | { k: "dedicatoria" }
  | { k: "ilus"; n: number }
  | { k: "texto"; n: number }
  | { k: "fin" };

const W = 1.4;
const H = 1.05; // hoja 4:3
const BW = W + 0.03;
const BH = H + 0.045; // tapa, con vuelo
const T = 0.034; // grosor del cartón
const EPS = 0.0042; // grosor de cada hoja en la pila
const SEG = 28;
const TEX_W = 1280;
const TEX_H = 960;
const TILT_CLOSED = -0.42;
const TILT_OPEN = -0.62;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = url;
  });
}

export async function createBook3D(opts: {
  canvas: HTMLCanvasElement;
  data: Book3DData;
  fonts: Book3DFonts;
  reduceMotion: boolean;
  onStep: (n: number) => void;
}): Promise<Book3DHandle> {
  const { canvas, data, fonts, reduceMotion } = opts;
  const P = data.pages.length;
  // memoria de vídeo (25 oct): en pantallas pequeñas las caras se pintan a 0,6 (768×576 en vez de 1280×960)
  const SMALL = Math.min(window.innerWidth, window.innerHeight) < 700;
  const TEX_SCALE = SMALL ? 0.6 : 1;
  const newFaceCanvas = () => {
    const cv = document.createElement("canvas");
    cv.width = Math.round(TEX_W * TEX_SCALE);
    cv.height = Math.round(TEX_H * TEX_SCALE);
    const x = cv.getContext("2d")!;
    x.scale(TEX_SCALE, TEX_SCALE);
    return { cv, x };
  };

  /* ---------- hojas ---------- */
  const LEAVES: [Face, Face][] = [[{ k: "titulo" }, { k: "hoja" }], [{ k: "dedicatoria" }, { k: "ilus", n: 1 }]];
  for (let k = 2; k <= P; k++) LEAVES.push([{ k: "texto", n: k - 1 }, { k: "ilus", n: k }]);
  LEAVES.push([{ k: "texto", n: P }, { k: "fin" }]);
  const N = LEAVES.length;
  const ITEMS = N + 1; // tapa + hojas
  const MAXTURN = ITEMS;

  /* ---------- imágenes ---------- */
  const pics = new Map<string, HTMLImageElement>();
  // la portada primero: es lo que se ve al cargar. El resto, bajo demanda (25 oct): cuando se pinta la cara que la usa
  const coverImg = data.coverUrl ? await loadImage(data.coverUrl) : null;
  if (coverImg) pics.set("cover", coverImg);
  const urlOf = (key: string): string | null | undefined => {
    if (key === "sheet") return data.sheetUrl;
    if (key.startsWith("r")) return data.portraits?.[Number(key.slice(1)) - 1]?.url;
    if (key.startsWith("p")) return data.pages.find((p) => p.n === Number(key.slice(1)))?.imageUrl;
    return null;
  };
  const asked = new Map<string, string>(); // clave → URL pedida
  function fetchPic(key: string) {
    const url = urlOf(key);
    if (!url || asked.get(key) === url || pics.has(key)) return;
    asked.set(key, url);
    void loadImage(url).then((img) => {
      if (!img || disposed || asked.get(key) !== url) return;
      pics.set(key, img);
      refreshFacesUsing(key);
    });
  }

  /* ---------- dibujo de caras ---------- */
  const serif = (w: number, px: number) => `${w} ${px}px ${fonts.serif}`;
  const ui = (w: number, px: number) => `${w} ${px}px ${fonts.ui}`;
  const hand = (px: number) => `${px}px ${fonts.hand}`;

  let grain: HTMLCanvasElement | null = null;
  const grainCanvas = () => {
    if (grain) return grain;
    const g = document.createElement("canvas");
    g.width = g.height = 256;
    const x = g.getContext("2d")!;
    const d = x.createImageData(256, 256);
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 120 + rnd() * 40;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 10;
    }
    x.putImageData(d, 0, 0);
    grain = g;
    return g;
  };
  const paper = (x: CanvasRenderingContext2D, color: string) => {
    x.fillStyle = color;
    x.fillRect(0, 0, TEX_W, TEX_H);
    x.fillStyle = x.createPattern(grainCanvas(), "repeat")!;
    x.fillRect(0, 0, TEX_W, TEX_H);
  };
  const gutter = (x: CanvasRenderingContext2D, side: "left" | "right", strength = 0.16) => {
    const w = 110;
    const g = side === "left" ? x.createLinearGradient(0, 0, w, 0) : x.createLinearGradient(TEX_W, 0, TEX_W - w, 0);
    g.addColorStop(0, `rgba(30,25,45,${strength})`);
    g.addColorStop(1, "rgba(30,25,45,0)");
    x.fillStyle = g;
    if (side === "left") x.fillRect(0, 0, w, TEX_H);
    else x.fillRect(TEX_W - w, 0, w, TEX_H);
  };
  const star = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) => {
    x.save();
    x.translate(cx, cy);
    x.fillStyle = color;
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const rr = i % 2 ? r * 0.28 : r;
      x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
    x.restore();
  };
  const moon = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, bg: string) => {
    x.fillStyle = color;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = bg;
    x.beginPath();
    x.arc(cx + r * 0.42, cy - r * 0.18, r * 0.86, 0, Math.PI * 2);
    x.fill();
  };
  const coverFit = (x: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) => {
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    x.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  };
  const wrap = (x: CanvasRenderingContext2D, text: string, maxW: number): (string | null)[] => {
    const lines: (string | null)[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const t = line ? `${line} ${word}` : word;
        if (x.measureText(t).width > maxW && line) {
          lines.push(line);
          line = word;
        } else line = t;
      }
      lines.push(line);
      lines.push(null);
    }
    lines.pop();
    return lines;
  };
  const centered = (x: CanvasRenderingContext2D, lines: (string | null)[], cx: number, cy: number, lh: number) => {
    const real = lines.filter((l): l is string => !!l);
    let y = cy - ((real.length - 1) * lh) / 2;
    for (const l of real) {
      x.fillText(l, cx, y);
      y += lh;
    }
    return y;
  };
  /** Texto que no cabe: baja el cuerpo hasta que cabe en el alto disponible. */
  const fitText = (x: CanvasRenderingContext2D, text: string, maxW: number, maxH: number) => {
    for (let px = 44; px >= 28; px -= 2) {
      x.font = serif(400, px);
      const lines = wrap(x, text, maxW);
      const lh = px * 1.5;
      const gap = px * 0.6;
      const h = lines.reduce((a, l) => a + (l === null ? gap : lh), 0);
      if (h <= maxH || px === 28) return { lines, lh, gap, h };
    }
    throw new Error("inalcanzable");
  };

  const facesUsing = new Map<string, Set<number>>(); // imagen → hojas que la usan
  const portraitKeys = () => (data.portraits ?? []).map((_, i) => `r${i + 1}`);
  const faceImageKeys = (f: Face): string[] => (f.k === "ilus" ? [`p${f.n}`] : f.k === "hoja" ? ["sheet", ...portraitKeys()] : []);
  /** Pide las imágenes que necesita una cara (una vez). */
  const want = (f: Face) => faceImageKeys(f).forEach(fetchPic);

  function drawFace(face: Face, side: "left" | "right"): HTMLCanvasElement {
    const { cv, x } = newFaceCanvas();
    want(face);
    const cx = TEX_W / 2;
    switch (face.k) {
      case "ilus": {
        const img = pics.get(`p${face.n}`);
        if (img) {
          coverFit(x, img, TEX_W, TEX_H);
          gutter(x, side, 0.32);
          break;
        }
        // papel tramado con lo que se pintará (antes del pago, o en pruebas sin imagen)
        paper(x, C.paperDeep);
        x.strokeStyle = "rgba(93,86,108,0.08)";
        x.lineWidth = 3;
        for (let i = -TEX_H; i < TEX_W; i += 26) {
          x.beginPath();
          x.moveTo(i, 0);
          x.lineTo(i + TEX_H, TEX_H);
          x.stroke();
        }
        if (data.locked) {
          x.fillStyle = C.card;
          x.beginPath();
          if (typeof x.roundRect === "function") x.roundRect(side === "left" ? TEX_W - 290 : 60, 52, 230, 64, 32);
          else x.rect(side === "left" ? TEX_W - 290 : 60, 52, 230, 64); // Safari 15 no tiene roundRect
          x.fill();
          x.fillStyle = C.ink;
          x.font = ui(600, 30);
          x.textAlign = "center";
          x.fillText("Al pagar", side === "left" ? TEX_W - 175 : 175, 95);
        }
        const page = data.pages.find((p) => p.n === face.n);
        x.fillStyle = C.inkSoft;
        x.textAlign = "center";
        x.font = hand(46);
        const scene = page?.scene ? `se pintará: ${page.scene}` : "ilustración de prueba";
        centered(x, wrap(x, scene, TEX_W * 0.66).slice(0, 7), cx, TEX_H / 2 + 20, 60);
        star(x, cx, 230, 20, C.accent);
        gutter(x, side, 0.18);
        break;
      }
      case "texto": {
        paper(x, C.paper);
        const page = data.pages.find((p) => p.n === face.n);
        const maxW = TEX_W * 0.68;
        const { lines, lh, gap, h } = fitText(x, page?.text ?? "", maxW, TEX_H * 0.66);
        x.fillStyle = C.ink;
        x.textAlign = "left";
        const left = (TEX_W - maxW) / 2 + (side === "left" ? 24 : -24);
        let y = (TEX_H - h) / 2 + lh * 0.75;
        for (const l of lines) {
          if (l === null) {
            y += gap;
            continue;
          }
          x.fillText(l, left, y);
          y += lh;
        }
        star(x, cx + (side === "left" ? 24 : -24), 110, 16, C.star);
        x.font = ui(600, 26);
        x.fillStyle = C.inkSoft;
        x.textAlign = side === "left" ? "right" : "left";
        x.fillText(String(face.n), side === "left" ? TEX_W - 90 : 90, TEX_H - 60);
        gutter(x, side);
        break;
      }
      case "titulo": {
        paper(x, C.paper);
        moon(x, cx, 230, 60, C.star, C.paper);
        x.textAlign = "center";
        x.fillStyle = C.night;
        x.font = serif(600, 70);
        const ty = centered(x, wrap(x, data.title, TEX_W * 0.74), cx, 470, 86);
        x.fillStyle = C.accent;
        x.font = hand(46);
        x.fillText(`para ${data.name}`, cx, ty + 50);
        gutter(x, side);
        break;
      }
      case "dedicatoria": {
        paper(x, C.paper);
        x.textAlign = "center";
        x.fillStyle = C.ink;
        x.font = serif(400, 46);
        const y = centered(x, wrap(x, data.dedication || `Para ${data.name}.`, TEX_W * 0.6), cx, TEX_H / 2 - 20, 68);
        star(x, cx - 46, y + 20, 13, C.star);
        star(x, cx, y + 20, 18, C.star);
        star(x, cx + 46, y + 20, 13, C.star);
        if (data.from) {
          x.fillStyle = C.inkSoft;
          x.font = ui(600, 24);
          x.fillText(`DE PARTE DE ${data.from.toUpperCase()}`, cx, TEX_H - 110);
        }
        gutter(x, side);
        break;
      }
      case "hoja": {
        paper(x, C.paperDeep);
        x.textAlign = "center";
        x.fillStyle = C.inkSoft;
        x.font = hand(42);
        x.fillText(`Así ${data.pages.length ? "son" : "es"} en el libro`, cx, 112);
        // con todos los retratos pintados, como en el impreso: uno por personaje con su nombre debajo
        const rs = (data.portraits ?? []).map((p, i) => ({ name: p.name, img: pics.get(`r${i + 1}`) }));
        if (rs.length > 0 && rs.every((r) => r.img) && (data.portraits ?? []).every((p) => p.url)) {
          const n = rs.length;
          const gapPx = 48;
          const sz = Math.min(n === 1 ? 560 : n === 2 ? 440 : 340, (TEX_W * 0.86 - (n - 1) * gapPx) / n);
          const top = 190;
          let left = cx - (n * sz + (n - 1) * gapPx) / 2;
          for (const r of rs) {
            const im = r.img!;
            const k = Math.min(sz / im.width, sz / im.height);
            x.save();
            x.globalCompositeOperation = "multiply";
            x.drawImage(im, left + (sz - im.width * k) / 2, top + (sz - im.height * k) / 2, im.width * k, im.height * k);
            x.restore();
            x.fillStyle = C.ink;
            x.font = serif(600, 46);
            x.fillText(r.name, left + sz / 2, top + sz + 64, sz);
            left += sz + gapPx;
          }
          gutter(x, side);
          break;
        }
        const img = pics.get("sheet");
        const w = TEX_W * 0.78;
        const h = img ? (w * img.height) / img.width : w / 1.5;
        x.save();
        x.translate(cx, 150 + h / 2 + 20);
        x.rotate(-0.025);
        x.shadowColor = "rgba(35,32,54,0.25)";
        x.shadowBlur = 24;
        x.shadowOffsetY = 10;
        x.fillStyle = "#fffaf0";
        x.fillRect(-w / 2 - 16, -h / 2 - 16, w + 32, h + 32);
        x.shadowColor = "transparent";
        if (img) x.drawImage(img, -w / 2, -h / 2, w, h);
        x.fillStyle = "rgba(242,184,75,0.55)";
        for (const s of [-1, 1]) {
          x.save();
          x.translate(s * (w / 2 - 30), -h / 2 - 8);
          x.rotate(s * 0.6);
          x.fillRect(-60, -18, 120, 36);
          x.restore();
        }
        x.restore();
        gutter(x, side);
        break;
      }
      case "fin": {
        paper(x, C.paper);
        x.textAlign = "center";
        x.fillStyle = C.night;
        x.font = serif(600, 96);
        x.fillText("Fin", cx, TEX_H / 2 + 20);
        star(x, cx, TEX_H / 2 - 120, 22, C.star);
        x.fillStyle = C.inkSoft;
        x.font = ui(600, 24);
        x.fillText("ÉRASE SU VEZ", cx, TEX_H - 90);
        gutter(x, side);
        break;
      }
    }
    return cv;
  }

  function drawEndpaper(seed: number) {
    const { cv, x } = newFaceCanvas();
    x.fillStyle = C.night;
    x.fillRect(0, 0, TEX_W, TEX_H);
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) star(x, rnd() * TEX_W, rnd() * TEX_H, 6 + rnd() * 12, rnd() > 0.3 ? C.star : C.moon);
    for (let i = 0; i < 6; i++) moon(x, rnd() * TEX_W, rnd() * TEX_H, 16 + rnd() * 10, C.moon, C.night);
    return cv;
  }

  /** La portada como la de BookCover: ilustración entera, degradado arriba, título, «para …» y «De parte de …». */
  function drawCover() {
    const cv = document.createElement("canvas");
    cv.width = 1400;
    cv.height = Math.round((1400 * BH) / BW);
    const x = cv.getContext("2d")!;
    const w = cv.width;
    const h = cv.height;
    x.fillStyle = C.night;
    x.fillRect(0, 0, w, h);
    const img = pics.get("cover");
    if (img) coverFit(x, img, w, h);
    else for (let i = 0; i < 40; i++) star(x, ((i * 997) % 1000) / 1000 * w, ((i * 613) % 1000) / 1000 * h, 6 + (i % 4) * 3, i % 3 ? C.star : C.moon);
    const g = x.createLinearGradient(0, 0, 0, h * 0.6);
    g.addColorStop(0, "rgba(15,20,40,0.6)");
    g.addColorStop(1, "rgba(15,20,40,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h * 0.6);
    x.fillStyle = C.moon;
    x.textAlign = "left";
    x.shadowColor = "rgba(10,20,50,0.6)";
    x.shadowBlur = 16;
    const left = w * 0.07;
    x.font = serif(600, 84);
    const lines = wrap(x, data.title, w * 0.63).filter((l): l is string => !!l);
    let y = h * 0.06 + 84;
    for (const l of lines) {
      x.fillText(l, left, y);
      y += 92;
    }
    y += 28;
    x.font = `italic ${serif(500, 48)}`;
    x.fillText("para", left, y);
    const pw = x.measureText("para ").width;
    x.font = serif(600, 70);
    x.fillText(data.name || "…", left + pw * 1.1, y);
    if (data.from) {
      x.font = ui(600, 26);
      x.fillText(`DE PARTE DE ${data.from.toUpperCase()}`, left, y + 60);
    }
    x.shadowColor = "transparent";
    const sg = x.createLinearGradient(0, 0, w * 0.04, 0);
    sg.addColorStop(0, "rgba(0,0,0,0.32)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = sg;
    x.fillRect(0, 0, w * 0.04, h);
    return cv;
  }

  function drawBackCover() {
    const cv = document.createElement("canvas");
    cv.width = 1400;
    cv.height = Math.round((1400 * BH) / BW);
    const x = cv.getContext("2d")!;
    x.fillStyle = C.night;
    x.fillRect(0, 0, cv.width, cv.height);
    moon(x, cv.width / 2, cv.height / 2 - 30, 44, C.star, C.night);
    x.fillStyle = C.moon;
    x.textAlign = "center";
    x.font = serif(600, 40);
    x.fillText("Érase su vez", cv.width / 2, cv.height / 2 + 70);
    return cv;
  }

  function drawSpine() {
    const cv = document.createElement("canvas");
    cv.width = 160;
    cv.height = 1200;
    const x = cv.getContext("2d")!;
    x.fillStyle = C.night;
    x.fillRect(0, 0, cv.width, cv.height);
    x.save();
    x.translate(cv.width / 2, cv.height / 2);
    x.rotate(-Math.PI / 2);
    x.fillStyle = C.moon;
    x.textAlign = "center";
    x.textBaseline = "middle";
    let px = 50;
    x.font = serif(600, px);
    while (x.measureText(data.title).width > 880 && px > 26) x.font = serif(600, (px -= 2));
    x.fillText(data.title, -60, 4);
    star(x, 470, 0, 18, C.star);
    x.restore();
    return cv;
  }

  /* ---------- three ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = Math.min(SMALL ? 4 : 16, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x8a7f74, 1.55));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.5);
  key.position.set(-1.6, 2.2, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.01;
  Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 1.6, bottom: -1.6, near: 0.5, far: 9 });
  scene.add(key, key.target);

  const book = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.add(book);
  tilt.rotation.x = TILT_CLOSED;
  const spin = new THREE.Group();
  spin.add(tilt);
  scene.add(spin);

  const textures: THREE.Texture[] = [];
  const disposables: { dispose: () => void }[] = [];
  const canvasTex = (cv: HTMLCanvasElement, mirror = false) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    if (mirror) {
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.x = -1;
      t.offset.x = 1;
    }
    textures.push(t);
    return t;
  };
  const mat = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(p);
    disposables.push(m);
    return m;
  };
  const paperMat = mat({ color: C.paper, roughness: 0.92 });
  const paperBackMat = mat({ color: C.paper, roughness: 0.92, side: THREE.BackSide });
  const nightMat = mat({ color: C.night, roughness: 0.55 });

  // sombra de contacto, color tinta (sobre el papel de la página)
  {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const x = cv.getContext("2d")!;
    const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, "rgba(35,32,54,0.34)");
    g.addColorStop(0.55, "rgba(35,32,54,0.12)");
    g.addColorStop(1, "rgba(35,32,54,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(cv);
    textures.push(t);
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
    disposables.push(m);
    const g2 = new THREE.PlaneGeometry(1, 1);
    disposables.push(g2);
    const shadow = new THREE.Mesh(g2, m);
    shadow.scale.set(BW * 1.28, BH * 1.22, 1);
    shadow.position.z = -T - 0.004;
    book.add(shadow);
  }

  // cantos de papel
  const edgeTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = 8;
    cv.height = 64;
    const x = cv.getContext("2d")!;
    x.fillStyle = "#efe4cf";
    x.fillRect(0, 0, 8, 64);
    x.fillStyle = "rgba(150,125,90,0.35)";
    for (let y = 0; y < 64; y += 4) x.fillRect(0, y, 8, 1);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 6);
    textures.push(t);
    return t;
  })();
  const edgeMat = mat({ map: edgeTex, roughness: 0.95 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(unitBox);
  const block = () => {
    const m = new THREE.Mesh(unitBox, [edgeMat, edgeMat, edgeMat, edgeMat, paperMat, paperMat]);
    m.castShadow = m.receiveShadow = true;
    book.add(m);
    return m;
  };
  const blockR = block();
  const blockL = block();

  // tapas y lomo
  const boardGeo = new THREE.BoxGeometry(BW, BH, T);
  disposables.push(boardGeo);
  const backBoard = new THREE.Mesh(boardGeo, [nightMat, nightMat, nightMat, nightMat, mat({ map: canvasTex(drawEndpaper(29)), roughness: 0.8 }), mat({ map: canvasTex(drawBackCover()), roughness: 0.6 })]);
  backBoard.position.set(BW / 2 - 0.006, 0, -T / 2);
  backBoard.castShadow = backBoard.receiveShadow = true;
  book.add(backBoard);

  const coverPivot = new THREE.Group();
  book.add(coverPivot);
  const coverMesh = new THREE.Mesh(boardGeo, [nightMat, nightMat, nightMat, nightMat, mat({ map: canvasTex(drawCover()), roughness: 0.6 }), mat({ map: canvasTex(drawEndpaper(11)), roughness: 0.8 })]);
  coverMesh.position.x = BW / 2 - 0.006;
  coverMesh.castShadow = coverMesh.receiveShadow = true;
  coverPivot.add(coverMesh);

  const spineGeo = new THREE.BoxGeometry(0.014, BH, 1);
  disposables.push(spineGeo);
  const spine = new THREE.Mesh(spineGeo, [nightMat, mat({ map: canvasTex(drawSpine()), roughness: 0.55 }), nightMat, nightMat, nightMat, nightMat]);
  spine.castShadow = true;
  book.add(spine);

  interface Leaf {
    i: number;
    geo: THREE.PlaneGeometry;
    front: THREE.Mesh;
    back: THREE.Mesh;
    pivot: THREE.Group;
    tex: [THREE.Texture, THREE.Texture] | null;
    flatAt: string | null;
  }
  const leaves: Leaf[] = [];
  for (let i = 0; i < N; i++) {
    const geo = new THREE.PlaneGeometry(W, H, SEG, 1);
    geo.translate(W / 2, 0, 0);
    disposables.push(geo);
    const front = new THREE.Mesh(geo, paperMat);
    const back = new THREE.Mesh(geo, paperBackMat);
    front.castShadow = back.castShadow = front.receiveShadow = back.receiveShadow = true;
    const pivot = new THREE.Group();
    pivot.add(front, back);
    book.add(pivot);
    leaves.push({ i, geo, front, back, pivot, tex: null, flatAt: null });
    for (const f of LEAVES[i]) for (const k of faceImageKeys(f)) facesUsing.set(k, (facesUsing.get(k) ?? new Set()).add(i));
  }

  const items = Array.from({ length: ITEMS }, () => ({ p: 0, target: 0, dir: 1 }));
  let turned = 0;

  const freeLeafTex = (L: Leaf) => {
    if (!L.tex) return;
    L.tex.forEach((t) => t.dispose());
    (L.front.material as THREE.Material).dispose();
    (L.back.material as THREE.Material).dispose();
    L.front.material = paperMat;
    L.back.material = paperBackMat;
    L.tex = null;
  };
  /** Texturas bajo demanda: solo las hojas cerca de la que se ve (en el móvil, la memoria de vídeo es corta). */
  function ensureTextures(center: number) {
    for (const L of leaves) {
      const near = Math.abs(L.i + 1 - center) <= 2;
      if (near && !L.tex) {
        const [f, b] = LEAVES[L.i];
        const tf = new THREE.CanvasTexture(drawFace(f, "left"));
        const tb = new THREE.CanvasTexture(drawFace(b, "right"));
        for (const t of [tf, tb]) {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = maxAniso;
        }
        tb.wrapS = THREE.RepeatWrapping;
        tb.repeat.x = -1;
        tb.offset.x = 1;
        L.front.material = new THREE.MeshStandardMaterial({ map: tf, roughness: 0.9 });
        L.back.material = new THREE.MeshStandardMaterial({ map: tb, roughness: 0.9, side: THREE.BackSide });
        L.tex = [tf, tb];
      } else if (!near) freeLeafTex(L);
    }
  }
  /** Llega una imagen tarde: se repintan las hojas cargadas que la usan. */
  function refreshFacesUsing(key: string) {
    for (const i of facesUsing.get(key) ?? []) {
      const L = leaves[i];
      if (L.tex) {
        freeLeafTex(L);
        ensureTextures(turned);
      }
    }
    kick(300);
  }

  function bendLeaf(L: Leaf, e: number, dir: number) {
    const flat = e === 0 ? "0" : e === 1 ? "1" : null;
    if (flat && L.flatAt === flat) return;
    L.flatAt = flat;
    const theta = Math.PI * e;
    const b = 0.62 * Math.sin(Math.PI * e) * dir;
    const pos = L.geo.attributes.position as THREE.BufferAttribute;
    const ds = W / SEG;
    let px = 0;
    let pz = 0;
    const xs = [0];
    const zs = [0];
    for (let c = 1; c <= SEG; c++) {
      const a = theta + b * Math.pow(((c - 0.5) * ds) / W, 1.6);
      px += Math.cos(a) * ds;
      pz += Math.sin(a) * ds;
      xs.push(px);
      zs.push(pz);
    }
    for (let v = 0; v < pos.count; v++) {
      const c = v % (SEG + 1);
      pos.setX(v, xs[c]);
      pos.setZ(v, zs[c]);
    }
    pos.needsUpdate = true;
    L.geo.computeVertexNormals();
    L.geo.computeBoundingSphere();
  }

  /* ---------- navegación ---------- */
  const DUR = reduceMotion ? 0.001 : 0.95;
  const orbit = { yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0, intro: null as number | null };

  function go(n: number) {
    n = Math.max(0, Math.min(MAXTURN, n));
    if (n === turned) return;
    turned = n;
    orbit.intro = null;
    for (let i = 0; i < ITEMS; i++) {
      const t = i < turned ? 1 : 0;
      if (items[i].target !== t) {
        items[i].target = t;
        items[i].dir = t ? 1 : -1;
      }
    }
    ensureTextures(turned);
    opts.onStep(turned);
    kick();
  }
  const next = () => go(turned === MAXTURN ? 0 : turned + 1);
  const prev = () => go(turned - 1);

  let down: { x: number; y: number; id: number } | null = null;
  const onDown = (e: PointerEvent) => {
    kick();
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    orbit.intro = null;
    if (turned === 0 && items[0].p === 0) {
      orbit.dragging = true;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* algunos navegadores no la dan: se sigue sin captura */
      }
    }
  };
  const onMove = (e: PointerEvent) => {
    kick(800);
    pointer.x = e.clientX / window.innerWidth - 0.5;
    pointer.y = e.clientY / window.innerHeight - 0.5;
    if (!orbit.dragging || !down || e.pointerId !== down.id) return;
    const k = 6 / Math.max(320, canvas.clientWidth); // un ancho de visor ≈ una vuelta
    orbit.yaw += (e.clientX - orbit.lastX) * k;
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + (e.clientY - orbit.lastY) * k * 0.6, -0.4, 0.4);
    orbit.lastX = e.clientX;
    orbit.lastY = e.clientY;
  };
  const onCancel = () => {
    orbit.dragging = false;
    down = null;
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const r = canvas.getBoundingClientRect();
    const wasOrbit = orbit.dragging;
    orbit.dragging = false;
    down = null;
    const tap = Math.abs(dx) < 8 && Math.abs(dy) < 8;
    if (wasOrbit) {
      if (tap) next();
      return;
    }
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next();
      else prev();
      return;
    }
    if (tap) {
      if (turned === 0 || turned === MAXTURN) next();
      else if (e.clientX - r.left > r.width / 2) next();
      else prev();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      next();
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      prev();
      e.preventDefault();
    }
  };
  const pointer = { x: 0, y: 0 };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("keydown", onKey);

  /* ---------- tamaño y cámara ---------- */
  const parent = canvas.parentElement!;
  let camDist = 4;
  const fitDistance = (openness: number) => {
    const w = parent.clientWidth || 1;
    const h = parent.clientHeight || 1;
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * (w / h));
    const spanW = THREE.MathUtils.lerp(BW * 1.25, BW * 2.42, openness);
    const spanH = BH * Math.cos(tilt.rotation.x) * 1.35 + 0.1;
    return Math.max(spanW / 2 / Math.tan(hf / 2), spanH / 2 / Math.tan(vf / 2));
  };
  const resize = () => {
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  // el callback llega después de montar (kick ya está listo)
  const ro = new ResizeObserver(() => {
    resize();
    kick(300);
  });
  ro.observe(parent);
  resize();

  /* ---------- bucle ---------- */
  let raf = 0;
  let last = performance.now();
  let started = false;
  let disposed = false;
  let visible = true;
  // render bajo demanda (25 oct): solo mientras algo se mueve o justo después (el encuadre se asienta), no en reposo
  let settleUntil = 0;
  function kick(ms = 1500) {
    settleUntil = Math.max(settleUntil, performance.now() + ms);
    if (visible && !raf && !disposed) raf = requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) kick();
  });
  io.observe(canvas);

  function frame(now: number) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // al saltar varias, cada hoja espera a que la anterior lleve un trecho
    for (let i = 0; i < ITEMS; i++) {
      const it = items[i];
      if (it.p === it.target) continue;
      if (it.target === 1 && i > 0 && items[i - 1].target === 1 && items[i - 1].p < 0.22) continue;
      if (it.target === 0 && i < ITEMS - 1 && items[i + 1].target === 0 && items[i + 1].p > 0.78) continue;
      const step = dt / DUR;
      it.p = it.target ? Math.min(1, it.p + step) : Math.max(0, it.p - step);
    }

    const ec = ease(items[0].p);
    coverPivot.rotation.y = -Math.PI * ec;
    coverPivot.position.z = THREE.MathUtils.lerp((N + 1) * EPS + T / 2 + 0.001, -T / 2, ec) + Math.sin(Math.PI * ec) * 0.05;

    let leftCount = 0;
    for (const L of leaves) {
      const it = items[L.i + 1];
      const e = ease(it.p);
      leftCount += e;
      L.pivot.position.z = THREE.MathUtils.lerp((N - L.i) * EPS, (L.i + 1) * EPS, e) + Math.sin(Math.PI * e) * 0.06;
      bendLeaf(L, e, it.dir);
      L.pivot.visible = (e > 0 && e < 1) || Math.abs(L.i + 1 - turned) <= 2;
    }
    const rightCount = N - leftCount;
    const hR = Math.max(0.0005, rightCount * EPS - EPS * 0.5);
    const hL = Math.max(0.0005, leftCount * EPS - EPS * 0.5);
    blockR.scale.set(W * 0.992, H * 0.99, hR);
    blockR.position.set(W / 2 + 0.002, 0, hR / 2);
    blockL.scale.set(W * 0.992, H * 0.99, hL);
    blockL.position.set(-W / 2 - 0.002, 0, hL / 2);
    blockR.visible = rightCount > 0.02;
    blockL.visible = leftCount > 0.02;

    const top = coverPivot.position.z + (T / 2) * Math.cos(Math.PI * ec);
    const sh = Math.max(0.001, top + T);
    spine.scale.z = sh;
    spine.position.set(-0.007, 0, -T + sh / 2);

    // encuadre: cerrado, centrado en la tapa; abierto, en el lomo
    book.position.x = (-BW / 2) * (1 - ec);
    book.position.y = 0;
    const par = reduceMotion || orbit.dragging ? 0 : ec; // balanceo con el puntero, solo abierto
    const tgtRy = pointer.x * 0.12 * par;
    const tgtRx = THREE.MathUtils.lerp(TILT_CLOSED, TILT_OPEN, ec) + pointer.y * 0.06 * par;
    tilt.rotation.y += (tgtRy - tilt.rotation.y) * 0.05;
    tilt.rotation.x += (tgtRx - tilt.rotation.x) * 0.05;

    if (orbit.intro !== null) {
      const u = (now - orbit.intro) / 3600;
      if (u >= 1) {
        orbit.intro = null;
        orbit.yaw = 0;
      } else if (u > 0) orbit.yaw = Math.sin(Math.PI * ease(u)) * 1.9;
    }
    if (!orbit.dragging && orbit.intro === null) {
      const home = Math.round(orbit.yaw / (Math.PI * 2)) * Math.PI * 2; // de frente por el camino corto
      const k = 1 - Math.exp(-dt * (turned === 0 ? 3.2 : 7));
      orbit.yaw += (home - orbit.yaw) * k;
      orbit.pitch += -orbit.pitch * k;
      if (Math.abs(home - orbit.yaw) < 1e-4) orbit.yaw = 0;
    }
    spin.rotation.set(orbit.pitch * (1 - ec), orbit.yaw, 0, "YXZ");

    const target = fitDistance(ec);
    camDist += (target - camDist) * (started && !reduceMotion ? 1 - Math.exp(-dt * 4) : 1);
    camera.position.set(0, 0.05, camDist);
    camera.lookAt(0, 0.02, 0);

    renderer.render(scene, camera);
    started = true;
    const moving = items.some((it) => it.p !== it.target) || orbit.dragging || orbit.intro !== null;
    if (moving) settleUntil = Math.max(settleUntil, now + 1500);
    if (visible && now < settleUntil) raf = requestAnimationFrame(frame);
  }

  ensureTextures(0);
  kick();

  return {
    steps: MAXTURN,
    go,
    next,
    prev,
    intro: () => {
      if (!reduceMotion && turned === 0) {
        orbit.intro = performance.now() + 300;
        kick();
      }
    },
    update: (next: Book3DData) => {
      if (next.title !== data.title || next.name !== data.name || next.from !== data.from || next.pages.length !== P) return false;
      if ((next.coverUrl ? 1 : 0) !== (data.coverUrl ? 1 : 0)) return false;
      const dirty = new Set<number>();
      const leavesWith = (pred: (f: Face) => boolean) => LEAVES.forEach((pair, i) => pair.some(pred) && dirty.add(i));
      if (next.dedication !== data.dedication) {
        data.dedication = next.dedication;
        leavesWith((f) => f.k === "dedicatoria");
      }
      if (!!next.locked !== !!data.locked) {
        data.locked = next.locked;
        LEAVES.forEach((_, i) => dirty.add(i));
      }
      // la URL nueva ya está en `data` cuando se llama: se pide al volver a pintar la cara (o ahora, si está cargada)
      const reload = (key: string) => {
        pics.delete(key);
        asked.delete(key);
        for (const i of facesUsing.get(key) ?? []) dirty.add(i);
      };
      const pk = (d: Book3DData) => JSON.stringify((d.portraits ?? []).map((p) => [p.name, p.key]));
      if (pk(next) !== pk(data)) {
        if ((next.portraits ?? []).length !== (data.portraits ?? []).length) return false;
        (next.portraits ?? []).forEach((np, i) => {
          const cur = data.portraits![i];
          cur.name = np.name;
          if (np.key !== cur.key) {
            cur.key = np.key;
            cur.url = np.url;
            reload(`r${i + 1}`);
          }
        });
        leavesWith((f) => f.k === "hoja");
      }
      if ((next.sheetKey ?? null) !== (data.sheetKey ?? null)) {
        data.sheetKey = next.sheetKey;
        data.sheetUrl = next.sheetUrl;
        reload("sheet");
      }
      next.pages.forEach((np, i) => {
        const cur = data.pages[i];
        if (np.text !== cur.text || np.scene !== cur.scene) {
          cur.text = np.text;
          cur.scene = np.scene;
          leavesWith((f) => (f.k === "texto" || f.k === "ilus") && f.n === cur.n);
        }
        if ((np.imageKey ?? null) !== (cur.imageKey ?? null)) {
          cur.imageKey = np.imageKey;
          cur.imageUrl = np.imageUrl;
          reload(`p${cur.n}`);
        }
      });
      for (const i of dirty) freeLeafTex(leaves[i]);
      if (dirty.size) {
        ensureTextures(turned);
        kick(300);
      }
      return true;
    },
    dispose: () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("keydown", onKey);
      leaves.forEach(freeLeafTex);
      textures.forEach((t) => t.dispose());
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      // libera el contexto WebGL ya (el navegador solo deja unos pocos vivos a la vez)
      renderer.forceContextLoss();
    },
  };
}
