# Contexto de la trilogia Pokemon

Acuerdo del usuario confirmado el 2026-11-08:

- `mysql-restapi` gestiona autenticacion e identidad mediante JWT.
- `nest-mongo-pokedex` comunica las instancias del frontend mediante WebSocket.
- `vite-react-railway` contiene las vistas de jugadores y administrador; las batallas se llevan a cabo en el panel administrador.
- Los tres proyectos forman una sola aplicacion y se deben usar conjuntamente.

Si esta disponible, leer [la memoria compartida](../PROJECT_MEMORY.md). Este resumen se conserva tambien aqui para sesiones que abran solo este repositorio.

Saneamiento autorizado 2026-11-10: retirados 20 archivos huerfanos/legacy, 14
dependencias directas y APIs de seguros del store/contexto. Configuracion Vite
ES2022/Bundler strict con tests incluidos; TypeScript global CERO errores.
Los 16 errores anteriores estan resueltos. `npm run typecheck` y audit:source
permiten comprobarlo; test:arena-status ejecuta 8 pruebas con renderer React18.
Build y Chrome PvP pasan tras la limpieza; no se tocaron .env ni datos reales.

Conservar el panel administrador como centro de las batallas. El usuario confirmo
limitar WebSocket a PvP: instantaneas de equipos al admin y resultados de vuelta;
cada jugador conserva su partida. Etapa PvP autorizada y local implementada:
ADMIN controla ambos equipos; jugadores observan. Panel batalla ofrece PvP y
manual. Locks por cuenta/Web Locks, guardia party/*, rendicion en turno propio,
patch HP/estados tras salir y recibo+ACK antes de liberar ambos. Reconexion no
desbloquea; equipo divergente exige dispositivo original. Ver README/protocolo.
No convertir moves[].pp de catalogo en PP gastados; Full Restore solo manual
porque mochila no tiene existencias. No se agregan XP ni premios.
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
