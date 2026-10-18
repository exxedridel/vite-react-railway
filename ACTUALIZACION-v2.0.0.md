# Pokémon Master Trainer — v2.0.0

## Instalación

1. Conserva una copia de tu proyecto actual y tu archivo `.env`.
2. Copia el contenido de este ZIP sobre el proyecto. Incluye `package.json`, `package-lock.json` y `vite.config.js`, además de `src`, `tests` y `tools`.
3. Conserva tu `.env`: no está incluido en el paquete.
4. Ejecuta `npm ci`, después `npm run dev`. Para producción: `npm run build`.
5. Usa Node 20.16 o superior. Para ejecutar las pruebas: `npm run test:combat`.

La versión visible es 2.0.0. No se borra la partida: los datos del equipo siguen siendo compatibles y el nuevo estado del motor es opcional, con su propia versión. Antes de actualizar conviene terminar o quitar el encuentro salvaje anterior: no se pueden reconstruir retroactivamente sus PP, sustitutos ni acciones previas.

## Alcance

**Solo los encuentros salvajes usan la nueva resolución automática.** Las batallas entre entrenadores conservan el flujo manual anterior. Capturas con dado físico, bonos de pokébolas, encuentros por color, bolsa y tienda mantienen sus reglas.

Se integró `@pkmn/sim` 0.10.11 (motor Pokémon Showdown), configurado en generación III, y un adaptador para los stats y HP del juego de tablero. El catálogo tiene los 354 movimientos de Gen 3. Esto sustituye la necesidad de escribir 354 implementaciones manuales; no significa que se hayan probado todas las combinaciones posibles entre ellos.

## Cómo jugar un encuentro

- Selecciona la acción de tu Pokémon y la del salvaje desde sus respectivas vistas. No se añadió una IA que elija el movimiento enemigo.
- La primera elección queda pendiente. Al confirmar ambas, se resuelven por prioridad y velocidad, se aplican los efectos de fin de turno y avanza el turno automáticamente.
- El panel del turno permite consultar elecciones, PP, continuaciones obligatorias y cambios requeridos tras un debilitamiento. Puedes cancelar una elección pendiente antes de resolver ambas.
- Fly, Dig, Solar Beam y movimientos similares preparan realmente su primer turno. Las continuaciones y recargas obligatorias se incorporan al resolver el siguiente turno; ya no basta confirmar que se gastó un turno previamente.
- La acción de pasar está destinada a acciones físicas del tablero. No permite saltarse una carga o recarga obligatoria.
- Los efectos, daño, curación, cambios de stats y estados se reflejan en Redux. El historial registra movimientos y el cierre del turno. El estado interno y el azar se conservan al recargar.
- PP agotados permiten Struggle desde el panel del turno. Los PP pertenecen al encuentro y se reinician al crear otro.
- Teleport y los movimientos de expulsión pueden terminar el encuentro salvaje bajo sus condiciones. Esto no captura al Pokémon.

## Adaptaciones y límites explícitos

- Se conservan los stats calculados por nivel y el multiplicador de HP de la configuración. La fórmula nativa de daño de Gen 3 aporta su variación aleatoria, categorías por tipo y crítico ×2; el daño puede diferir del motor manual anterior.
- No se incorporó todavía un sistema de habilidades ni objetos equipados. Movimientos que necesitan un objeto fallan si no existe; movimientos exclusivos de aliados no tienen un aliado en este combate individual.
- Sin IVs/EVs/naturalezas en los stats del tablero. El motor recibe IVs 0 y amistad 255 para resolver las mecánicas que los consultan: Hidden Power es Fighting de potencia 30, Return tiene potencia 102 y Frustration potencia 1. El género asignado al comenzar el encuentro se conserva en su estado interno y se muestra en el panel del turno.
- Transform y otros cambios temporales se resuelven dentro del motor. No reemplazan permanentemente la especie, imagen o estadísticas base de la tarjeta.
- No se añadió experiencia automática, evolución automática ni dinero automático para la bolsa por Pay Day. Las recompensas y las cartas siguen perteneciendo al tablero.
- Durante un encuentro automático activo se bloquea el aprendizaje de TM; termina o retira el encuentro para cambiar el catálogo permanente.
- El motor se descarga al iniciar la primera acción salvaje: aproximadamente 1 MB comprimido adicional. No se carga inicialmente para el combate manual.

## Verificación realizada

- Compilación Vite de producción correcta.
- 27 pruebas nuevas aprobadas. Incluyen ejecución de los 354 movimientos, Dream Eater, Snore/Sleep Talk, carga y recarga, daño residual, prioridad, Counter, Baton Pass, Perish Song, sustitutos, PP, captura y actualización atómica del historial.
- Prueba del paquete minificado para navegador, sin globals de Node: guarda y recupera un movimiento de dos turnos correctamente. No sustituye una prueba visual en un celular real.
- El chequeo TypeScript global conserva errores que ya existen en el ZIP original (módulos antiguos de seguros, target ES5, `BASE_URL` y pruebas anteriores). No se presentan como corregidos por esta actualización. Se corrigió además el estado `tormented` faltante en el resultado anterior.
- La batería antigua comparada contra el ZIP original conserva 697 fallos preexistentes; varios fixtures esperan niveles, HP y bonos de captura de versiones anteriores. Las pruebas nuevas del motor se ejecutan separadamente con `npm run test:combat`.

## Organización

`src/lib/emerald/engine.ts`: adaptador y persistencia del simulador.

`src/lib/emerald/audit.ts`: registro de probabilidades y tiradas sin consumir azar adicional.

`src/lib/emerald/commands.ts`: ejecución asíncrona y protección contra confirmaciones duplicadas o estados obsoletos.

`src/lib/emerald/moveData.json`: catálogo generado. Regenerar con `npm run catalog:emerald`.

`ManualMoveExecutionDialog.tsx` y `ManualBattleFieldControl.tsx`: flujo anterior de entrenadores.

`tests/emerald-engine.test.ts` y `tools/test-emerald-browser.mjs`: pruebas específicas.

Motor y licencia: https://github.com/pkmn/ps — MIT. Se incluye la licencia en `THIRD_PARTY/PKMN_SIM_LICENSE.txt`.
