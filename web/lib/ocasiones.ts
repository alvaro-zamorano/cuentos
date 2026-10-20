/**
 * Páginas de ocasión (20 oct): una por ocasión con búsqueda propia, para posicionar en buscadores y en las respuestas de
 * los asistentes de IA. Cada una lleva ejemplos reales (portadas hechas con /crear, docs/ILUSTRACION.md), ideas de
 * arranque y preguntas propias. Los datos del libro (precio, envío, plazos) salen de lib/pricing.ts y de la landing:
 * si cambian allí, revisar aquí.
 *
 * `starter`: id de lib/plan/starters.ts con el que se abre /crear. `cover`: una portada de public/muestra; sin portada
 * propia, la página enseña la hoja de personajes del libro de muestra.
 */
export interface Ocasion {
  slug: string;
  /** Nombre corto para enlaces y migas. */
  name: string;
  h1: string;
  metaTitle: string;
  description: string;
  starter: string;
  lead: string;
  cover?: { src: string; title: string; name: string; who: string };
  /** Por qué tiene sentido un cuento así, en dos o tres párrafos cortos. */
  why: string[];
  /** Frases de ejemplo: lo que un adulto podría escribir en el paso 1. */
  ideas: string[];
  faq: { q: string; a: string }[];
}

export const OCASIONES: Ocasion[] = [
  {
    slug: "navidad",
    name: "Navidad y Reyes",
    h1: "Cuento personalizado de Navidad",
    metaTitle: "Cuento personalizado de Navidad y Reyes para niños, en tapa dura",
    description:
      "Un cuento de Navidad con tu hijo, tu nieta o tu sobrino de protagonista: Nochebuena, Papá Noel, la noche de Reyes o la primera nevada. Lo escribimos e ilustramos con su historia y te lo enviamos en tapa dura.",
    starter: "navidad",
    lead: "Su nombre, su aspecto y una historia de Navidad que no ha leído nadie más. Tú das la idea; nosotros la escribimos, la ilustramos y te enviamos el libro.",
    cover: { src: "/muestra/portada-navidad.webp", title: "Daniela y el ruido del tejado", name: "Daniela", who: "Daniela, 4 años: un ruido en el tejado en Nochebuena" },
    why: [
      "Los cuentos de Navidad se leen una y otra vez en las mismas semanas del año. Uno en el que sale él, con su pijama y su perro, se guarda para las Navidades siguientes.",
      "La historia puede ser de Papá Noel, de los Reyes Magos, de la primera nevada o de lo que hacéis en casa esos días. Si nos cuentas detalles vuestros, como el belén del abuelo o los polvorones de la tía, salen en el cuento.",
      "Es un regalo que no se compra en una tienda: lo hace quien conoce al niño. Por eso lo eligen tanto los padres como los abuelos y los tíos.",
    ],
    ideas: [
      "La noche de Nochebuena, Daniela oye un ruido en el tejado y sube a ver quién anda por ahí.",
      "La noche de Reyes, Pablo quiere aguantar despierto para dar las gracias a los camellos, que siempre llegan cansados.",
      "Nieva por primera vez y el muñeco de nieve que hace Lola quiere conocer la ciudad antes de que salga el sol.",
      "A Papá Noel se le ha perdido un reno y Hugo lo encuentra comiéndose las zanahorias del huerto de su abuela.",
    ],
    faq: [
      {
        q: "¿Llega a tiempo para Navidad o para Reyes?",
        a: "El libro impreso tarda una o dos semanas desde que lo mandas a imprimir, con envío a la Península y Baleares. Publicaremos aquí la fecha límite para pedirlo a tiempo. Si vas justo, el PDF está listo en unos minutos y el libro llega después.",
      },
      {
        q: "¿Puede ser de Reyes en vez de Papá Noel?",
        a: "Sí. La historia es la que tú quieras: Papá Noel, los Reyes Magos, los dos o ninguno. Si en tu casa los regalos los trae otro personaje, cuéntanoslo en la idea.",
      },
      {
        q: "¿Pueden salir sus hermanos o su mascota?",
        a: "Sí. Además del protagonista, pueden salir en todo el libro hasta dos personas o mascotas más, y las ves antes de ilustrar las páginas. Otros personajes pueden salir en alguna página, descritos con palabras.",
      },
    ],
  },
  {
    slug: "cumpleanos",
    name: "Cumpleaños",
    h1: "Cuento personalizado de cumpleaños",
    metaTitle: "Cuento personalizado de cumpleaños: un regalo con su nombre y su historia",
    description:
      "Un cuento de cumpleaños escrito e ilustrado para un solo niño o niña: su nombre, su edad, sus amigos y la historia que tú quieras. Lo lees gratis antes de pagar y te lo enviamos en tapa dura.",
    starter: "cumpleanos",
    lead: "Un regalo de cumpleaños hecho para él o para ella: cumple años en el cuento, con su nombre, su aspecto y lo que más le gusta.",
    cover: { src: "/muestra/portada-cumpleanos.webp", title: "Lucía y las pistas de la abuela", name: "Lucía", who: "Lucía, 8 años: las pistas que esconde su abuela por su cumpleaños" },
    why: [
      "Por su cumpleaños recibe muchos juguetes. Un libro en el que es el protagonista es distinto: lo puede leer cada noche y, dentro de unos años, sigue ahí.",
      "El texto se adapta a la edad que cumple: frases cortas y con ritmo para los más pequeños, y más trama y diálogo a partir de los siete.",
      "Le puedes poner una dedicatoria y decir de parte de quién es. Si lo regaláis entre varios, como los abuelos o los tíos, sale en la primera página.",
    ],
    ideas: [
      "Es el cumpleaños de Lucía y desde por la mañana pasan cosas raras: alguien ha escondido pistas por toda la casa.",
      "Mario cumple cinco años y su tarta sale volando por la ventana. Tiene que recuperarla antes de que lleguen sus amigos.",
      "El día de su cumpleaños, Inés descubre que su peluche puede hablar, pero solo durante ese día.",
      "Leo celebra su cumpleaños en el fondo del mar y los invitados son los peces que ha visto en el acuario.",
    ],
    faq: [
      {
        q: "¿Sale su edad?",
        a: "Sí, en el texto. En las ilustraciones no pintamos números ni velas contadas, porque la ilustración no siempre acierta con la cantidad: queda una tarta con velas, sin contar.",
      },
      {
        q: "¿Pueden salir sus amigos o su familia?",
        a: "Sí. Hasta dos personas o mascotas pueden salir en todo el libro, siempre iguales. El resto puede salir en alguna página, descrito con palabras.",
      },
      {
        q: "¿Puedo poner una dedicatoria?",
        a: "Sí. Escribes la tuya o te proponemos una, y dices de parte de quién es el regalo.",
      },
    ],
  },
  {
    slug: "primer-dia-de-cole",
    name: "Primer día de cole",
    h1: "Cuento personalizado para el primer día de cole",
    metaTitle: "Cuento personalizado para el primer día de cole o de guardería",
    description:
      "Un cuento para el primer día de cole o de guardería en el que el protagonista es tu hijo: su mochila, su clase y lo que le espera ese día. Escrito e ilustrado con su historia, en tapa dura.",
    starter: "cole",
    lead: "Antes del primer día, un cuento en el que es él quien entra en clase. Con su mochila, su abrigo y lo que le espera allí.",
    cover: { src: "/muestra/portada-cole.webp", title: "Hugo y la mochila de dinosaurio", name: "Hugo", who: "Hugo, 3 años: su primer día de cole, con su mochila de dinosaurio" },
    why: [
      "El primer día de cole o de guardería es un cambio grande. Un cuento en el que se reconoce le da una forma de hablar de lo que va a pasar antes de que pase.",
      "Cuéntanos lo que conoces: cómo se llama su profe, qué lleva en la mochila, quién le va a recoger. Con esos detalles el cuento se parece a su día.",
      "Los cuentos pueden tener emociones pequeñas, como los nervios o el miedo a separarse, siempre con un final que las resuelve. Nada que asuste de verdad.",
    ],
    ideas: [
      "Mañana es el primer día de cole de Hugo. Le tiemblan un poco las rodillas, pero su mochila de dinosaurio tiene un plan.",
      "Carla empieza la guardería y descubre que su clase tiene una puerta secreta que solo se abre a la hora del recreo.",
      "El primer día de cole, Martín reparte entre sus compañeros las piedras que ha encontrado en el parque.",
    ],
    faq: [
      {
        q: "¿Para qué edades es?",
        a: "De 1 a 10 años. Para la guardería y los primeros cursos el texto es muy corto y con ritmo, para leerlo en voz alta.",
      },
      {
        q: "¿Puede salir su profe o su colegio?",
        a: "Sí, descritos con palabras. Mejor sin el nombre real del colegio si el libro va a salir de casa.",
      },
      {
        q: "¿Cuánto tarda en llegar?",
        a: "El libro impreso tarda una o dos semanas desde que lo mandas a imprimir. El PDF está listo en unos minutos, por si lo quieres leer antes.",
      },
    ],
  },
  {
    slug: "hermanito",
    name: "Llega un hermanito",
    h1: "Cuento personalizado para el hermano mayor",
    metaTitle: "Cuento personalizado para el hermano o la hermana mayor: llega un bebé",
    description:
      "Un cuento para el hermano o la hermana mayor cuando llega un bebé a casa: el protagonista es él o ella, y el bebé puede salir en todo el libro. Escrito e ilustrado con vuestra historia, en tapa dura.",
    starter: "hermanito",
    lead: "Cuando llega un bebé, el protagonista de este cuento es el hermano o la hermana mayor. Y el bebé puede salir con él en todas las páginas.",
    why: [
      "Con un bebé en casa, el mayor oye hablar mucho del pequeño. Un libro en el que él es el protagonista, y el bebé su compañero de aventura, le pone en el centro.",
      "Puede servir antes del parto, para contar lo que va a cambiar, o después, como regalo para él cuando llegan las visitas con regalos para el bebé.",
      "El bebé puede salir con su nombre o como «el bebé», si aún no lo habéis decidido. Lo describes con palabras y lo ves antes de que ilustremos el libro.",
    ],
    ideas: [
      "Va a nacer el hermanito de Martina, que prepara todo lo necesario para enseñarle el mundo.",
      "Pablo descubre que su hermana recién nacida entiende el idioma de los pájaros, y solo él puede traducirlo.",
      "Lucas es el guardián oficial de la cuna y esta noche tiene que proteger al bebé de un monstruo de calcetines.",
    ],
    faq: [
      {
        q: "¿Pueden salir los dos hermanos en todo el libro?",
        a: "Sí. El mayor es el protagonista y el bebé puede ser uno de los dos personajes que salen siempre iguales. Antes de ilustrar las páginas, ves cómo será cada uno.",
      },
      {
        q: "¿Y si el bebé aún no ha nacido?",
        a: "No hace falta su nombre ni saber cómo será. Puede salir como «el bebé», con los rasgos que imagines, o el cuento puede terminar cuando llega a casa.",
      },
      {
        q: "¿Puede ser para una hermana mayor?",
        a: "Sí. Eliges si el protagonista es niño, niña o sin marcar; solo cambia la concordancia del texto.",
      },
    ],
  },
  {
    slug: "regalo-abuelos",
    name: "Regalo de los abuelos",
    h1: "Un cuento personalizado para regalar a un nieto",
    metaTitle: "Regalo para nietos: un cuento personalizado con su nombre, en tapa dura",
    description:
      "El regalo de los abuelos para su nieto o su nieta: un cuento con su nombre, su historia y vosotros dentro. Lo escribimos e ilustramos, lo revisas antes de imprimir y llega a casa en tapa dura.",
    starter: "abuelos",
    lead: "Para los abuelos que quieren regalar algo que dure. Un libro con su nieto de protagonista, y con vosotros en la historia si queréis.",
    cover: { src: "/muestra/portada-nubes.webp", title: "Mateo y la torre que tocaba las nubes", name: "Mateo", who: "Mateo, 5 años: historia sorpresa (le encanta hacer torres)" },
    why: [
      "Un juguete se olvida; un libro con su nombre se queda en la estantería. Y en la primera página dice de parte de quién es.",
      "Los abuelos pueden salir en la historia: la casa del pueblo, la receta de las torrijas, el huerto, lo que hacéis juntos. Esos detalles son los que hacen que el cuento sea vuestro.",
      "No hace falta saber de tecnología: con su nombre, su edad y una frase sale el cuento. Lo lees entero antes de pagar y te lo enviamos a casa, o a la de los padres.",
    ],
    ideas: [
      "Mateo pasa el fin de semana en casa de sus abuelos y juntos arreglan algo muy antiguo que estaba en el trastero.",
      "La abuela Carmen esconde pistas por todo el pueblo y Lucía tiene que encontrarlas antes de la merienda.",
      "El abuelo Juan y Pau plantan una semilla en el huerto que crece hasta las nubes en una sola noche.",
    ],
    faq: [
      {
        q: "¿Lo puedo enviar a casa de los padres?",
        a: "Sí. Al pagar pones la dirección a la que quieres que llegue, en la Península o en Baleares.",
      },
      {
        q: "¿Necesito fotos del niño?",
        a: "No. Lo describes con sus rasgos: pelo, piel, ojos, gafas y lo que le hace único. No pedimos fotos, apellidos ni fecha de nacimiento.",
      },
      {
        q: "¿Pueden salir los abuelos?",
        a: "Sí. Hasta dos personas o mascotas pueden salir en todo el libro, siempre iguales, y las ves antes de ilustrar las páginas.",
      },
    ],
  },
];

export const OCASIONES_PATH = "/cuento-personalizado";
export const ocasionPath = (slug: string) => `${OCASIONES_PATH}/${slug}`;
export const ocasion = (slug: string) => OCASIONES.find((o) => o.slug === slug) ?? null;

/** Ocasión que corresponde a una idea de arranque (para los botones de la landing con la app cerrada). */
export const ocasionForStarter = (starter: string) => OCASIONES.find((o) => o.starter === starter || (starter === "reyes" && o.slug === "navidad")) ?? null;
