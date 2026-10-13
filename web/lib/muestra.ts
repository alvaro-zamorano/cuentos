/**
 * Libro de muestra «Vera y Toby viajan a la Luna» (D6, docs/MUESTRA-LUNA.md): texto e ilustraciones de
 * public/muestra/luna-NN.webp (00 = portada). Lo usa la landing.
 */
export const MUESTRA = {
  title: "Vera y Toby viajan a la Luna",
  hero: "Vera",
  age: 6,
  dedication: "Para Vera, que mira la Luna como quien mira a una amiga.",
  idea: "Vera construye un cohete con una caja de cartón y una noche despega de verdad hacia la Luna con su perro Toby.",
  pages: [
  "Aquella noche, Vera no tenía nada de sueño. Desde la ventana, la Luna brillaba redonda y tranquila.\n—Toby, ¿tú crees que allí arriba vive alguien?\nToby movió la cola, que en idioma perro quiere decir: «Habrá que ir a mirarlo».",
  "A la mañana siguiente, Vera arrastró al jardín la caja más grande de la casa. Le recortó una ventana redonda, le pintó llamas rojas y, en un lado, un dinosaurio verde.\n—Se llamará Dino-1 —anunció.\nToby lo aprobó con un estornudo verde.",
  "Al atardecer, Vera se puso su traje de astronauta, el blanco con rayas amarillas. A Toby le tocó un casco de burbuja hecho a su medida. Vera hizo el saludo más serio del mundo y contó:\n—Tres, dos, uno… ¡despegue!",
  "Dino-1 tembló, chisporroteó y salió volando por encima de los tejados. Las chimeneas se hicieron pequeñas, las ventanas encendidas parecían luciérnagas y la Luna, al fondo, los esperaba.",
  "En el espacio todo flotaba: los lápices de colores, las galletas de Toby y hasta Vera, que dio una voltereta y se quedó cabeza abajo, muerta de risa. Por la ventana pasó un cometa con muchísima prisa.",
  "La Luna se fue haciendo grande, grande, grande, hasta que Dino-1 se posó en ella con un «puf» de polvo plateado. Vera abrió la puerta despacio. Allí fuera todo estaba en silencio.",
  "En la Luna se salta muchísimo. Vera dio un brinco y subió más alto que una farola. Toby lo intentó y se quedó flotando un buen rato con las patas abiertas, como una alfombra peluda.",
  "Caminaron entre cráteres enormes y piedras que brillaban con luz azul. Pero allí no había columpios, ni flores, ni nadie con quien jugar.\n—Creo que la Luna está un poco sola —dijo Vera.",
  "Así que Vera clavó su bandera del dinosaurio en lo alto de una colina. Toby, con sus patas, dibujó en el polvo una sonrisa gigante.\n—Ahora ya tienes visita —le dijo Vera a la Luna.",
  "Desde allí se veía la Tierra, azul y blanca, como una canica. Vera buscó su casa entornando los ojos.\n—¡Allí está! —dijo, aunque solo veía nubes.\nToby ladró, por si acaso, para saludar.",
  "Volvieron a casa con Dino-1 lleno de polvo de estrellas. Al mirar atrás, Vera vio que la Luna parecía más contenta: una sonrisa enorme le brillaba en la cara.",
  "Esa noche, Vera se durmió enseguida, con un poco de polvo plateado todavía en la mejilla. Toby roncaba a sus pies. Por la ventana, la Luna les guiñó un ojo.\n—Buenas noches, Luna. Volveremos pronto.",
  ] as string[],
};

export const muestraImage = (n: number) => `/muestra/luna-${String(n).padStart(2, "0")}.webp`;
