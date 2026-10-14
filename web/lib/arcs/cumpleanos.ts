import type { Arc } from "../types";

/**
 * Arco "Cumpleaños" — 12 dobles páginas.
 * Placeholders: {nombre} {edad} {comp} {Comp} {detalle}
 * Sin adjetivos que concuerden en género con el protagonista.
 */
export const cumpleanos: Arc = {
  id: "cumpleanos",
  title: "El cumpleaños de {nombre}",
  pages: [
    {
      n: 1,
      scene: "cama-manana",
      expression: "sueno",
      withCompanion: false,
      text: {
        "2-4": "Hoy es un día especial. {nombre} cumple {edad} años.",
        "5-8": "El sol se asomó despacio por la ventana y le hizo cosquillas en la nariz. {nombre} abrió un ojo, luego el otro. Hoy era el día. ¡Hoy cumplía {edad} años!",
      },
      scenePrompt: "child waking up in bed, morning light through window, cozy bedroom",
    },
    {
      n: 2,
      scene: "ventana",
      expression: "curioso",
      withCompanion: false,
      text: {
        "2-4": "{nombre} mira por la ventana. ¡El sol también está de fiesta!",
        "5-8": "Se asomó a la ventana. Los pájaros cantaban más fuerte que otros días, y hasta el sol parecía llevar un gorro de fiesta. Todo el barrio sabía que hoy era el cumpleaños de {nombre}.",
      },
      scenePrompt: "child looking out a window at a sunny street, birds, celebratory morning",
    },
    {
      n: 3,
      scene: "desayuno",
      expression: "sorpresa",
      withCompanion: false,
      text: {
        "2-4": "En la cocina hay un globo. ¡Es para {nombre}!",
        "5-8": "En la cocina le esperaba una sorpresa: un globo enorme atado a su silla, y en el plato, tostadas con forma de estrella. {nombre} se frotó los ojos. No era un sueño.",
      },
      scenePrompt: "kitchen breakfast table with a big balloon tied to a chair, star-shaped toast",
    },
    {
      n: 4,
      scene: "puerta-regalo",
      expression: "feliz",
      withCompanion: true,
      text: {
        "2-4": "¡Toc, toc! {Comp} trae un paquete muy grande.",
        "5-8": "¡Toc, toc! Alguien llamaba a la puerta. Era {comp}, con un paquete tan grande que casi no se le veía la cara. «Esto es para después», dijo con una sonrisa misteriosa.",
      },
      textPet: {
        "2-4": "¡Toc, toc! {Comp} empuja un paquete muy grande.",
        "5-8": "¡Toc, toc! Alguien rascaba la puerta. Era {comp}, empujando con el hocico un paquete tan grande que casi no se le veía. Lo dejó en medio del salón y se sentó a vigilarlo. Ese paquete era para después.",
      },
      scenePrompt: "companion arriving at the front door carrying a huge wrapped gift box",
    },
    {
      n: 5,
      scene: "salon-globos",
      expression: "risa",
      withCompanion: true,
      text: {
        "2-4": "Globos arriba, globos abajo. ¡La casa está llena de colores!",
        "5-8": "Entre todos llenaron el salón de globos y guirnaldas. {nombre} infló uno tan grande que salió volando por la habitación haciendo PFFFFFF, y {comp} se rio hasta que le dolió la tripa.",
      },
      textPet: {
        "2-4": "Globos arriba, globos abajo. ¡{Comp} los persigue por toda la casa!",
        "5-8": "Entre todos llenaron el salón de globos y guirnaldas. {nombre} infló uno tan grande que salió volando por la habitación haciendo PFFFFFF, y {comp} lo persiguió por todo el salón sin atraparlo ni una vez.",
      },
      scenePrompt: "living room being decorated with colorful balloons and paper garlands, laughter",
    },
    {
      n: 6,
      scene: "nube-deseo",
      expression: "curioso",
      withCompanion: false,
      text: {
        "2-4": "{nombre} piensa en {detalle}. ¿Qué deseo pedirá?",
        "5-8": "Un momento de calma. {nombre} se sentó en el sillón y pensó en {detalle}. Faltaba lo más importante del día: decidir qué deseo pedir al soplar las velas. Y eso había que pensarlo muy bien.",
      },
      scenePrompt: "child sitting thoughtfully in an armchair, a thought cloud above showing their favourite thing",
    },
    {
      n: 7,
      scene: "parque",
      expression: "feliz",
      withCompanion: true,
      text: {
        "2-4": "¡Al parque! Hay columpios y amigos.",
        "5-8": "Por la tarde fueron todos al parque. Columpios, tobogán y una carrera hasta el árbol grande que {nombre} ganó por muy poquito, con {comp} animando desde el banco.",
      },
      textPet: {
        "2-4": "¡Al parque! {Comp} corre detrás de {nombre}.",
        "5-8": "Por la tarde fueron todos al parque. Columpios, tobogán y una carrera hasta el árbol grande que {nombre} ganó por muy poquito, con {comp} corriendo detrás con la cola en alto.",
      },
      scenePrompt: "sunny park with swings and a slide, children playing, companion cheering from a bench",
    },
    {
      n: 8,
      scene: "jardin-juego",
      expression: "sorpresa",
      withCompanion: true,
      text: {
        "2-4": "Una pista, otra pista… ¡{nombre} encuentra el tesoro!",
        "5-8": "Entonces empezó la búsqueda del tesoro. Una pista debajo de una piedra, otra dentro de una flor, la última colgada de una rama. Y al final, una cajita con un mapa que decía: «Mira en la mesa».",
      },
      scenePrompt: "garden treasure hunt, child finding a clue under a flower, companion nearby",
    },
    {
      n: 9,
      scene: "mesa-tarta",
      expression: "sorpresa",
      withCompanion: true,
      text: {
        "2-4": "¡Una tarta! Tiene {edad} velas.",
        "5-8": "Y en la mesa estaba la tarta. Enorme, con mucha nata y exactamente {edad} velas encendidas, una por cada año de {nombre}. Todos se pusieron alrededor y empezaron a cantar.",
      },
      scenePrompt: "birthday cake on a table with lit candles, everyone gathered around singing",
    },
    {
      n: 10,
      scene: "velas",
      expression: "orgullo",
      withCompanion: false,
      text: {
        "2-4": "{nombre} sopla fuerte. ¡Fuuu! Las velas se apagan.",
        "5-8": "{nombre} cerró los ojos, pensó su deseo en secreto y sopló con todas sus fuerzas. ¡FUUUUU! Las {edad} velas se apagaron a la vez. Hubo aplausos, y alguien gritó «¡bravo!».",
      },
      scenePrompt: "child blowing out candles on the cake, eyes closed, smoke curling up, applause",
    },
    {
      n: 11,
      scene: "abrir-regalo",
      expression: "risa",
      withCompanion: true,
      text: {
        "2-4": "{nombre} abre el regalo de {comp}. ¡Es {regalo}!",
        "5-8": "Llegó la hora del paquete misterioso. {nombre} rasgó el papel con cuidado, luego sin cuidado… y dentro había {regalo}. Justo lo que había pedido en el deseo. {Comp} guiñó un ojo.",
      },
      textPet: {
        "2-4": "{nombre} abre el paquete. ¡Es {regalo}! {Comp} mueve la cola.",
        "5-8": "Llegó la hora del paquete misterioso. {nombre} rasgó el papel con cuidado, luego sin cuidado… y dentro había {regalo}. Justo lo que había pedido en el deseo. {Comp} dio tres vueltas de alegría alrededor de la caja.",
      },
      scenePrompt: "child opening the huge gift from the companion, wrapping paper flying, joy",
    },
    {
      n: 12,
      scene: "cama-noche",
      expression: "sueno",
      withCompanion: false,
      text: {
        "2-4": "Buenas noches, {nombre}. Ha sido un cumpleaños muy feliz.",
        "5-8": "Por la noche, con la tripa llena de tarta y la cabeza llena de risas, {nombre} se acurrucó en la cama. Por la ventana brillaba una estrella. «Hasta el año que viene», pensó. Y se durmió sonriendo.",
      },
      scenePrompt: "child asleep in bed at night, a star visible through the window, gift beside the bed",
    },
  ],
};
