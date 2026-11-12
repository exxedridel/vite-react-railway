# Contexto de la trilogia Pokemon

Acuerdo del usuario confirmado el 2026-11-08:

- `mysql-restapi` gestiona autenticacion e identidad mediante JWT.
- `nest-mongo-pokedex` comunica las instancias del frontend mediante WebSocket.
- `vite-react-railway` contiene las vistas de jugadores y administrador; las batallas se llevan a cabo en el panel administrador.
- Los tres proyectos forman una sola aplicacion y se deben usar conjuntamente.

Si esta disponible, leer [la memoria compartida](../PROJECT_MEMORY.md). Este resumen se conserva tambien aqui para sesiones que abran solo este repositorio.

Poké Mart2.2.0 desplegado y funcionando según usuario. Corrección autorizada
2026-11-12 versión2.2.1: Reiniciar juego del jugador exige conexión, establece
500 Pokedollars y vacía objetos además de equipo/progreso/medallas. ContextoShop
guarda resetLock antes de shop:reset; aplica sólo recibo propio confirmado,
escribe Party+marca antes del ACK y libera por APPLIED/cancelled coincidente.
No liberar por timeout/caché/sync sin recibo. Recuperación mismo ID/client;
historial/recibos PvP se conservan. Dispatch resetGame aislado no borra Party.
Compras y combates bloquean reinicio; reset pendiente bloquea Party/import/
snapshotPvP/compra. Tienda sólo observa saldo500 en vivo, no reinicia al abrir.
Otros dispositivos no borran su Party por el reset de otro navegador. Nest es
autoridad de saldo/items; partida general permanece local. Uso de objetos futuro.
Desplegar Nest primero y React después, sin variables nuevas ni MySQL.

FutureSight global corregido 2026-11-11: auditoría native boardfuture produce
resultado de impacto en wild/trainer; no volver a aplicar HP nativo ni tirar
RNG extra. Legacy no-wild usa pendingDelayedAttacks persistido en BattleField
y consume ticks sólo al finalizar turnos (no corregir contador). 248/353 comparten
posición y stats de lanzamiento. NPC consulta slot futuremove serializado y evita
otro futuro con alternativa legal, incluso al cambiar/recargar. Test específico
test:future-sight + minified browser + Chrome Sabrina cubren estas rutas.
Para esta corrección sólo desplegar React. No se cambian Nest/MySQL ni .env.

Trainer Battle autorizado 2026-11-11 sustituye manual/editor: humano A conectado
contra preset NPC B Kanto. Usuario eligió NPC AUTOMÁTICO: IA/motor local admin,
acciones humano por admin. 18 presets/68 slots exactos + variantes por starter
del jugador seleccionado explícitamente. /pvp reserva sólo A; results/ACK A
único, applied.b=true. Preservar pausa/navegador original/outbox/recibos/guardia.
No premios/XP/medallas automáticos. Tests catálogo y IA (Struggle/Recharge0),
Chrome PvP+Trainer y build/TS pasan. Desplegar Nest y React, sin nuevas variables.

Saneamiento autorizado 2026-11-10: retirados 20 archivos huerfanos/legacy, 14
dependencias directas y APIs de seguros del store/contexto. Configuracion Vite
ES2022/Bundler strict con tests incluidos; TypeScript global CERO errores.
Los 16 errores anteriores estan resueltos. `npm run typecheck` y audit:source
permiten comprobarlo; test:arena-status ejecuta 8 pruebas con renderer React18.
Build y Chrome PvP pasan tras la limpieza; no se tocaron .env ni datos reales.

Conservar el panel administrador como centro de las batallas. El usuario confirmo
limitar WebSocket a batallas: instantaneas al admin y resultados de vuelta;
cada jugador conserva su partida. Etapa PvP autorizada y local implementada:
ADMIN controla ambos equipos en PvP; jugadores observan. En Trainer NPC automático.
Locks por cuenta/Web Locks, guardia party/*, rendicion en turno propio,
patch HP/estados tras salir y recibo+ACK antes de liberar ambos. Reconexion no
desbloquea; equipo divergente exige dispositivo original. Ver README/protocolo.
No convertir moves[].pp de catalogo en PP gastados; Full Restore del simulador
no consume aún los objetos comprados de mochila. No se agregan XP ni premios.
Correccion 2026-11-11: PvpBattlePanel valida checkpoint antes de montar controles
o procesar cola/outbox. Estado incompatible muestra aviso y permite actualizar
conexion sin desbloquear. Causa Nest: Mongoose eliminaba pending={} (minimize).
QA navegador usa MongoPvpRepository con serializacion Mongoose y driver simulado.
Desplegar Nest primero y React despues; coleccion Mongo real no verificada.

Etapa autorizada 2026-11-10: CRUD en `/users`, solo rol admin verificado por
MySQL, login por correo propio y contactos dinamicos en `/mensajes-prueba`.
Redux Persist y apodos se separan por ID; la partida antigua requiere importacion
explicita y nunca se asigna automaticamente. Los datos admin siguen locales.
Desplegar primero MySQL, Nest con AUTH_API_URL y finalmente este frontend.
No afirmar que esta nueva etapa ya se verifico en produccion.

Correccion autorizada posterior (2026-11-10): logout real por token en MySQL.
`/logout` debe funcionar sin esperar un perfil verificado; limpieza local no
purga partidas. Si falla el cierre remoto, avisar que solo se confirmo la salida
local. Nuevos cambios requieren desplegar MySQL primero y React despues.

No guardar credenciales o tokens en la documentacion. Actualizar el contexto cuando el usuario confirme nuevos acuerdos.

Primera integracion local (2026-11-09): ya existe `/mensajes-prueba`, accesible para jugador/admin y conectada al Gateway Nest con el `bearer_token` actual. Usa `VITE_WEBSOCKET_URL` opcional o el origen de `VITE_BASE_SERVICES`; no necesita secretos de firma en React. Ver README.
