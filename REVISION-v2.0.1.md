# Revisión de Dig y Fly — v2.0.1

Se investigó el reporte de ataques que alcanzan al Pokémon durante Dig/Fly. No se reprodujo una pérdida de la protección en el motor automático entregado en v2.0.0. Por tanto, esta revisión no afirma corregir un fallo de cálculo que no pudo demostrarse.

Se añadieron indicadores en el panel del turno y explicaciones en el historial para identificar la fase bajo tierra/en el aire y sus excepciones. Se conserva el orden por prioridad y velocidad: recibir un ataque antes de esconderse, o después de salir para atacar, es válido. La protección no dura necesariamente toda la segunda ronda.

Tres pruebas nuevas verifican:

- Ataques normales fallan mientras Dig/Fly están activos, en ambos lados, incluso tras serializar y recuperar el combate.
- Earthquake/Magnitude contra Dig y Gust/Twister contra Fly reciben el multiplicador ×2. Thunder/Sky Uppercut pueden alcanzar a quien usa Fly sin ese multiplicador adicional.
- El Pokémon más lento puede recibir daño antes de esconderse y evitarlo antes de salir en la segunda ronda. El más rápido evita daño después de esconderse y puede recibirlo después de salir.

Resultado: 30 pruebas aprobadas, prueba minificada del motor aprobada y compilación Vite correcta. No cambia la resolución manual de entrenadores ni se elimina la partida guardada.

Instalación: conservar `.env`, copiar los archivos y ejecutar `npm ci` y `npm run dev`. El ZIP contiene el proyecto completo. Para investigar un caso que aún falle, registrar ambas especies, movimientos, velocidades/modificadores, orden de acciones, modo salvaje/entrenadores y el historial de las dos rondas.
