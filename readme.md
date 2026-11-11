# Pokémon Master Trainer

Frontend del juego con React, TypeScript y Vite. `mysql-restapi` autentica y
administra usuarios; `nest-mongo-pokedex` comunica jugadores y conserva las
batallas PvP. El motor de combate se ejecuta en el panel administrador.

## Desarrollo y comprobaciones

```bash
npm ci
npm run dev
npm run typecheck
npm run build
npm run test:future-sight
```

`npm run typecheck` revisa aplicación y pruebas con TypeScript estricto.
`npm run audit:source` muestra el grafo de imports y posibles módulos huérfanos;
no elimina archivos automáticamente. Las referencias dinámicas a assets deben
revisarse antes de eliminar recursos. `npm run test:arena-status` ejecuta las
pruebas de estados/sprites de la arena con React Test Renderer.

`test:future-sight` comprueba Future Sight y Doom Desire en los adaptadores
salvaje/Trainer y el motor local anterior: lanzamiento sin daño inmediato,
impacto al final del segundo turno posterior, recargas, cambios, daño único y
fallos de precisión. El resumen muestra el impacto como una acción propia con
HP reales; el motor nativo conserva su cálculo y PRNG originales.

El NPC evita usar otro ataque futuro mientras haya uno pendiente sobre la
posición objetivo, incluso si cambia el Pokémon. Elige otra acción legal y
vuelve a considerar esos ataques después del impacto. Los movimientos forzados
y los casos sin alternativa conservan las reglas nativas para poder avanzar.
En encuentros locales no salvajes, sólo **Finalizar turno** reduce el contador
del ataque pendiente; corregir manualmente el número de turno no aplica daño.

Railway ejecuta `npm start` para servir `dist` con soporte de rutas SPA y el
puerto `PORT`. Variables locales de ejemplo en `.env.example`; las variables
`VITE_*` se incorporan al compilar. Las instrucciones de cada flujo siguen abajo.

## Usuarios: `/users`

El panel administrador incluye **Usuarios** para listar, buscar, crear, editar
y eliminar cuentas. Permite asignar roles `player` o `admin` y cambiar contraseñas.
Las operaciones requieren autorización del servidor; un jugador no puede usar
el CRUD aunque escriba la ruta manualmente. La sesión se verifica con
`GET /api/auth/me` antes de mostrar las pantallas protegidas.

Cada usuario inicia sesión con su propio correo. El administrador inicial es
`najerad2223@gmail.com`, asignado una sola vez por la migración MySQL. No hay alta
pública ni verificación de correo. Cambiar correo, contraseña o rol exige iniciar
sesión nuevamente; no se permite eliminar la propia cuenta o retirarse su rol admin.

El equipo e inventario persistidos por Redux se guardan por ID de usuario en
`persist:root:user:<id>`; el apodo también se separa por cuenta. Cerrar sesión
conserva la partida de esa cuenta en este dispositivo. Esto no incorpora guardado
remoto ni sincroniza la partida entre dispositivos.

Una partida previa en la clave compartida `persist:root` se ofrece para importar
solo con confirmación de su dueño. Se conserva el original y un respaldo; una
reserva impide asignarla a varias cuentas del mismo navegador. La importación
requiere Web Locks (navegador compatible y contexto seguro). Si no está disponible
o falla el guardado, se muestra el error y se conserva la partida original.
Los datos del escenario administrador siguen siendo locales al dispositivo.

## Batallas PvP con jugadores conectados

En **Panel batalla → Jugadores conectados · PvP**, el administrador selecciona
dos cuentas de jugador que estén conectadas. La conexión PvP se mantiene desde
las páginas de la aplicación; no hace falta dejar abierto `/mensajes-prueba`.
El administrador elige las acciones de ambos equipos; los jugadores observan.
La pestaña **Trainer Battle** enfrenta a un jugador con un NPC de Kanto.

### Trainer Battle: jugador contra NPC

1. Abre **Panel batalla → Trainer Battle** y selecciona al jugador conectado.
2. Elige categoría y Trainer. Hay ocho líderes de gimnasio, cuatro del Alto
   Mando y dos encuentros del rival con tres variantes cada uno: **18 presets**.
   En Rival selecciona el tipo del inicial original del **jugador**; se carga
   el equipo contrario correspondiente. La vista previa muestra niveles y movesets.
3. Pulsa **Solicitar equipo y preparar Trainer**. El lado A recibe la Party
   actual completa (1–6); el lado B recibe el preset, sano y con el multiplicador
   de HP del jugador. Se reserva únicamente la cuenta real del jugador.
4. Pulsa **Iniciar Trainer Battle**. El administrador maneja las acciones del
   jugador A. El NPC decide sus movimientos y reemplazos automáticamente en el
   navegador del administrador, respetando solicitudes legales, PP y recargas.
   Las decisiones usan el estado visible del combate, sin consultar la elección
   pendiente del jugador. El motor sigue funcionando en React.
5. Si falta el jugador original, el combate se pausa y conserva su reserva.
   Al terminar, **Salir y actualizar Party** publica HP/condiciones finales;
   la reserva se libera tras guardar y confirmar ese único resultado. El NPC
   no necesita cuenta, conexión ni ACK. Se conserva mochila/progreso restante.

Los presets reproducen el listado proporcionado por el usuario, incluidos los
movimientos del primer rival a nivel 5. El catálogo es local, no consulta
PokeAPI para preparar Trainers. El mapa disponible es Kanto; no se añaden
recompensas, experiencia o medallas automáticas en este flujo. La pestaña manual
anterior se sustituyó; sus datos locales antiguos no se borran.

El panel valida el checkpoint recibido antes de mostrar controles o procesar
acciones. Si está incompleto, muestra un aviso y permite **Actualizar conexión**;
los equipos conservan sus reservas. Para corregir el fallo de pantalla negra
causado por objetos vacíos eliminados al guardar, desplegar primero la corrección
de Nest (schema `minimize: false` y recuperación de documentos anteriores), luego
este frontend y recargar los navegadores originales. No requiere variables nuevas.

1. Cada jugador inicia sesión con su correo en su navegador/dispositivo. Su
   Party debe contener de 1 a 6 Pokémon, al menos uno con HP, con 1–4 movimientos
   válidos de Gen III por Pokémon y sin otro encuentro local activo.
2. El administrador selecciona **Jugador A / Jugador B** y pulsa **Solicitar ambos
   equipos**. Se guardan las reservas antes de enviar los snapshots. Se importa
   todo el equipo con HP, estados, niveles, movimientos y stats actuales; los
   dos usuarios pueden tener multiplicadores de HP distintos.
3. Cuando ambos equipos están recibidos y sus propietarios están conectados,
   pulsa **Iniciar batalla PvP**. El panel maneja movimientos, cambios, acciones
   obligatorias y **Rendirse**. La rendición requiere confirmación y solo se
   acepta cuando ese lado tiene una solicitud de acción propia disponible.
4. Tras declarar ganador, **Salir y actualizar Partys** publica el resultado.
   Cada navegador guarda HP y condiciones finales junto con un recibo de resultado;
   ambos confirman ese guardado y entonces se liberan los equipos. Los estados
   temporales y modificadores se limpian al finalizar. Dinero, medallas, especie,
   nivel y movimientos permanecen en sus respectivas partidas.

No hay existencias de objetos en la mochila actual, solo dinero y medallas.
Por eso Full Restore del simulador manual no aparece en PvP. Los PP se consumen
en el runtime de esta batalla; `moves[].pp` sigue siendo información del catálogo.
No se añade XP, premios o intercambio de Pokémon en este flujo.

Durante la reserva se bloquean globalmente las acciones `party/*`: curación,
edición, captura, evolución, cambios de mochila, reinicio y resultados asíncronos
del juego local. El bloqueo y los recibos se guardan por cuenta; cerrar sesión,
recargar o desconectarse no los elimina. Un equipo distinto en otro dispositivo
se conserva y queda bloqueado con un aviso: debe recuperarse el navegador que
envió el equipo. No se sobreescribe una partida divergente.

Al detectar que falta un propietario, el panel pausa las acciones hasta que
vuelva. Si el admin recarga, recupera el checkpoint confirmado y el azar del
motor. Una pestaña admin diferente debe reclamar el control explícitamente;
los mensajes de un anfitrión anterior se rechazan. Solo se puede cancelar la
preparación: una batalla activa termina por resultado o rendición. Si un jugador
no vuelve para guardar su resultado, ambos equipos siguen reservados.

El navegador necesita HTTPS (localhost también funciona), Web Crypto y Web Locks
para las operaciones PvP. Tras el primer chequeo de reservas, una partida sin
batalla pendiente puede seguir usándose localmente si se pierde la conexión.
Una partida con reserva exige reconectar y completar el cierre.

### Desplegar esta etapa

Desplegar **Nest primero y React después**. Se reutilizan `JWT_SECRET`,
`AUTH_API_URL`, `FRONTEND_ORIGINS`, `MONGODB` y las URLs `VITE_*` ya configuradas.
No añadir `/pvp` a la variable: el cliente construye el namespace desde el origen.
Nest crea la colección `pvp_battles` y sus índices de reservas al arrancar. Los
checkpoints/resultados de combate se guardan en Mongo; el guardado general del
jugador continúa en su navegador. Usar una sola réplica Nest en esta etapa.

### Pruebas PvP

```bash
npm run test:pvp:engine
npm run test:pvp:party
npm run test:pvp:browser
npm run test:trainer:catalog
```

La prueba Chrome requiere compilar primero Nest. Usa Express con repositorio en
memoria, Nest aislado sin servidor Mongo y tres sesiones reales de navegador.
MongoPvpRepository ejecuta consultas y serialización Mongoose con una colección
simulada: prueba objetos vacíos y recuperación de documentos anteriores. Cubre
estado incompleto sin pantalla negra, importación 1/6, bloqueo, desconexión y
recargas, un turno, rendición, salida, guardado de ambos e idempotencia.
No modifica Railway ni bases reales.
La misma prueba Chrome también cubre Trainer Battle: variante del rival, preset
de Brock, turno automático, reserva de un usuario, pausa/recarga, rendición,
entrega offline y liberación tras su único ACK. `test:trainer:browser` ejecuta
esa prueba conjunta. Los tests de motor incluyen PP agotados/Struggle y recarga
nativa de Hyper Beam; el catálogo comprueba los 18 equipos completos.

## Cierre de sesión

`/logout` está disponible aunque falle la verificación del perfil. React captura
el token actual, solicita `POST /api/logout`, elimina la identidad local, vacía
el estado en memoria y desconecta el chat al salir de su pantalla. Conserva la
partida guardada por cuenta. MySQL revoca únicamente ese token; otros logins del
mismo usuario siguen funcionando. Los tokens nuevos llevan un `jti` distinto.

La solicitud tiene un límite de cinco segundos. Si el servidor no confirma el
cierre, la aplicación sale igualmente de la cuenta en este navegador y muestra
una advertencia; no afirma que el token remoto haya sido revocado. Una respuesta
401 indica que la sesión ya no era válida y permite completar el cierre local.
La inactividad conserva el límite de quince minutos y reconoce actividad táctil;
al volver del segundo plano comprueba el tiempo transcurrido.

Desplegar primero la actualización MySQL (tabla aditiva `revoked_tokens`) y luego
React. Nest ya consulta la identidad vigente: rechaza la sesión cerrada al
reconectar o en la siguiente operación/comprobación, sin una migración del chat.

La prueba Chrome de usuarios incluye logout desde la interfaz, revocación
comprobada por HTTP/Nest, independencia de otro login de la misma cuenta,
conservación de la partida y salida con fallo de perfil o red. Se usan cuentas
y servidores locales de prueba, sin modificar los servicios desplegados.

## Mensajería: `/mensajes-prueba`

Página protegida para cualquier cuenta registrada. Permite elegir otro usuario
del directorio y enviar mensajes privados; **Actualizar contactos** incorpora
cuentas creadas o editadas durante la sesión. Se accede mediante **Mensajes** del
jugador o **Mensajes de prueba** del administrador.

| Variable de compilación | Servicio |
| --- | --- |
| `VITE_BASE_MIDDLEWARE` | URL base de `mysql-restapi`, que emite el `bearer_token`. |
| `VITE_BASE_SERVICES` | URL base HTTP de `nest-mongo-pokedex`. |
| `VITE_WEBSOCKET_URL` | Opcional: origen HTTP/HTTPS de Nest para Socket.IO. Si falta, se usa el origen de `VITE_BASE_SERVICES`. |

Usar la URL de Nest sin `/api/v2` para `VITE_WEBSOCKET_URL`; la página añade el
namespace `/mensajes-prueba`. El token se envía en la autenticación Socket.IO y
Nest verifica su firma y consulta la identidad vigente en MySQL. **No configurar `JWT_SECRET` en React**: debe existir solo
en MySQL y Nest con el mismo valor privado.

La configuración actual de `VITE_BASE_SERVICES` puede reutilizarse. En Railway,
las variables `VITE_*` se aplican al compilar: reconstruir el frontend si cambian.
Hay un ejemplo local sin secretos en `.env.example`.

Para comprobar el intercambio, abrir las dos cuentas en perfiles o dispositivos
distintos, o una en una ventana privada. Dos pestañas normales comparten el login
por `localStorage`. Ambos usuarios deben mantener abierta la página de mensajes.

La página muestra conexión, presencia, mensajes y confirmación de envío. Conserva
hasta 200 mensajes en memoria y permite reintentar si falta confirmación. No hay
historial persistente ni entrega posterior al destinatario desconectado.

Para desplegar esta versión: primero MySQL (CRUD y migración de roles), después
Nest con `AUTH_API_URL` apuntando al origen público de MySQL, y finalmente este
frontend. Se conservan las URLs anteriores; no intercambiar los dos servicios.
Las instrucciones de configuración están en los README de ambos servidores.

Para comprobar automáticamente usuarios y mensajes con sesiones aisladas:

1. Instalar dependencias y ejecutar `npm run build` en `nest-mongo-pokedex`.
2. Ejecutar `npm run test:users:browser` en este frontend (`test:messages:browser`
   se conserva como alias compatible).

La herramienta levanta la API Express con usuarios en memoria, Nest sin MongoDB
y Vite con URLs locales. Abre Chrome headless con un perfil temporal y usa el
login real de la interfaz con credenciales de prueba. No conecta a Railway ni
a bases de datos reales.
Requiere Chrome instalado; si no está en la ruta habitual de Windows, indicar el
ejecutable mediante `CHROME_PATH`. Cierra los procesos temporales al terminar.

`npm run test:accounts` comprueba el guardado por cuenta y la importación anterior
con almacenamiento simulado, incluyendo errores de escritura y datos corruptos;
no abre el navegador ni realiza peticiones de red.

La etapa de saneamiento retira módulos de seguros, APIs y componentes sin
consumidores, dependencias sobrantes y configuración Next/ES5. La aplicación
usa el proveedor de tema local y conserva los recursos y herramientas del juego.
