# Contexto de la trilogia Pokemon

Acuerdo del usuario confirmado el 2026-11-08:

- `mysql-restapi` gestiona autenticacion e identidad mediante JWT.
- `nest-mongo-pokedex` comunica las instancias del frontend mediante WebSocket.
- `vite-react-railway` contiene las vistas de jugadores y administrador; las batallas se llevan a cabo en el panel administrador.
- Los tres proyectos forman una sola aplicacion y se deben usar conjuntamente.

Si esta disponible, leer [la memoria compartida](../PROJECT_MEMORY.md). Este resumen se conserva tambien aqui para sesiones que abran solo este repositorio.

Etapa vigente2026-11-13 React2.9.0: BackOffice dificultadglobal0..20, +modifier
despuésminbase1, >20bloqueadopredebito. CatálogoWS+revision, quoteincluyemin/
encounterId/captureDifficulty/captureRevision; lock+receiptcaptureRevisionopt.
Legacyplanes/hash/captureAttempt2.8 sincamposintactos. Pagaunavez bajo revisión
vigente, paidmínimofijo trasedit/reload. Reactguardausenciacatalog.captureDifficulty
antesPREPAREparaNestviejo. TS/build/wallet28/captura8/cuentas7/Party9/audit163 pasan;
ChromeCapture+Shopcompleto/Center/dificultad aprobados sinJSerrors. Ver memoria/
protocolos; Nest→React/recargar2.9.0 sinvars/
MySQL/seed/reset/borrados. Motor/Party/dado siguenlocales.

Etapa vigente2026-11-13 frontend2.8.0: Bag Poké/Great/Ultra, confirmar1bola+
mínimoD20existente, gastar antesmanual Capturada/Escapó. Usuario confirmóacción
consumida+respuestaautomáticasalvajealfallar. Reusarshop:use; captureAttempt se
persisteenplan, habilitarrollsólotrasAPPLIEDquita itemUseLock. FreezeParty+snapshot/
reset/import/items/Center mientraspending; rawcapturegratis bloqueado. Semilla/ID
previos ylastCaptureResult guardan outcomeuna vez (Storage/reload/retry), KOexige
reemplazosinrepetirrespuesta. PPpropiosintactos, rivales/efectosnativos. combatKey/
hasheslegacyintactos, CONSUMABLE3admin. TS/build/wallet26/cuentas7/Party9/captura12/
audit163 yChromeCapture+Shopcompleto/Center pasan sinJSerrors. Cerrar manageOpen
cuando captureAttempt aparece, así tiradaquedasinmodalesapilados sobrearena.
Viewport1280/375 sin overflow. Ver memoria/
POKEBALL_PROTOCOL. Nest→React/recargarambos2.8.0 sinvars/MySQL/seed/reset/borrados.

Etapa vigente2026-11-12 frontend2.7.0: Poké Center admin juntoaTienda, fondoFireRed
local original. ADMIN selecciona1–2 gratis/sinespera, reviveKO/HP/PP/status/stages
neutrales sin cambiarstatspermanentes/level/moves/progreso/Bag/PD. Previewtemporal
hash+revision, centerLock planexacto checkedwriteantesPREPAREACK y efecto+applied
antesACKterminal; centerHealingRevision impide paquetesviejos/reload repetir.
NuevoCenter capausente=false; otrosflujos guardanlockincluidoimport/rehidratación.
Diálogojugadorcompacto mantienechildren; cancelación autorizativa libera pero
no reviertecuraciónya guardada/APPLIED. ACKasyncdedup libera cola mientras espera
red: heldACK no bloqueacancelación. TS/build, wallet24/cuentas7/Party9/audit159
y ChromeCenter aislado+Shopcompleto aprobados; móvil375 sin overflow. Ver memoria/
POKE_CENTER_PROTOCOL; deployNest→React/recargarambos2.7.0 sinvars/MySQL/seed/reset/
borrados. Producción no verificada.

Correcciónvigente2026-11-12 frontend2.6.1: adoptar ajustes pending propios
sinlock/locklegacy/walletyaacreditada, sin sumardelta. Marca persistente
balanceAdjustmentRevision terminal impide pending tardío trasreload. Mantener
Party/PP/items yencuentro localenrecovery; CREATE fuerabatalla. AbortButton Gate+
BO compensa pendientes vía shop:balance-abort; APPLIED conserva resultado y
cancelled usa cancelledWalletRevision/Balance sin tocar otroslocks. Supportsflag
presence y ACKoperation previenen clientesviejos; BO indicaactualizar. No borrar
partida para repararloop. Ver memoria/pruebas. DeployNest→React yrecargarambos.

Etapa anterior2026-11-12 frontend2.6.0: /back-office admin modifica precios0+
y ajustaPD+/- conectados sólo fuerabatalla/sinpendientes. React lee ShopState.catalog
conrevisión; no usar defaults SHOP_ITEMS para cobrar. Precio cambiado bloquea
cotización hasta actualizar (newrequestId). Gratis max99 sin dividirpor0.
Ajuste PREPARE guarda shopLock.operation balance-adjustment+expectedRevision;
checkedwrite wallet+marker antes balance-applied. CoincidenteAPPLIED libera;
abortno libera marker aplicado. Sync adjustmentRequestId exacto recupera ledger.
Party/items/PP se conservan, modalItems/música intactos. Tests/BOChrome aislado
pasan; regresión completa Shop/reset/FullRestore/audio/PP/TM/Trainer+BO aprobada.
Leer memoria. Deploy Nest luegoReact,
sin MySQL/env/seed ni borrar datos; conservar ediciónusuario PokemonBagDialog.

Etapa anterior2026-11-12 frontend2.5.0: TM consumible500, sólo fuera combate.
Usuario conserva2movimientos inicialesgratis y sustituye con4 por1TM. UI usa
useTm(captureId,move,replaceMoveId?), stock/conexión/sync/locks controlan botón;
no carta física. Plan durable antes débito, movimiento+wallet+marca antesACK,
recuperación exacta sin repetir. PPnuevo máximo y contadorgratis conservado.
Store bloquea thunk/raw dispatch TM gratis; plannerpuro interno valida learnset/
GenIII/espacio/reemplazo. USABLE4 para uso local, CONSUMABLE3 para batalla;
TM sólo contextparty+moveId y no carga motor. Modal2.4.1/música intactos, no
tocar ITEMS mayúsculo editado por usuario. TS/build/157pruebas combinadas y
wallet17/cuentas7/Party9 pasan; Chrome TM completo+flujosprevios pasa (500,
cancelación/dobleclick/stock0/offline/batalla/Storage-reload/reemplazo4).
Nest primero luego React,
sin variables nuevas/MySQL/schema/seed ni borrar partidas. Ver memoria.

Corrección anterior2026-11-12 frontend2.4.1: ShopPartyGate mantiene siempre
children en el mismo slot al activar/desactivar itemUseLock/pendingUse; no
desmontar Layout/BattleMusicProvider/arena/diálogo al aplicar objetos. Modal
compacto role=alertdialog con fondo ligero, sin X/Escape/exterior, foco/acciones
bloqueados y recuperación existente. Compra/reset mantienen su pantalla previa.
Combate jugador: details Items separado bajo BATTLE MOVES; admin Battle moves
abierto e Items cerrado debajo. Preservar privacidad de acciones pendientes.
Sólo React, sin cambios de motor/PP/cartera/protocolos/Nest/MySQL/env/datos.
Ver memoria para pruebas finales y estado de despliegue.

Etapa anterior2026-11-12 frontend2.4.0: PP persistentes y Max Ether350pd/
Max Elixir700pd. Usuario confirmó conservar PP entre batallas/reloads; missing/
movimiento nuevo a máximo. moves[].pp sigue catálogo inmutable, currentPp guarda
restantes. Un uso gasta1; PP0 impide elegir; Struggle nativo con todos agotados,
continuaciones/recarga sin PP adicional. Ether requiere elegir un movimiento,
Elixir restaura todos del Pokémon; admite KO sin cambiar HP. Sin PP faltantes
no gasta objeto ni acción. Mismas reglas de compra/Bag/locks/turno Full Restore,
que no restaura PP. UI dashboard y combate individual/admin disponibles; NPC
automático sin objetos. useItem(itemId,captureId,moveId?) conserva plan durable,
itemUseLock y ACK sólo después de escribir efecto/wallet/marca. Grants y pending
enlazan itemId/moveId; used sólo tras evento nativo. Cancelar/forfeit previo no
cobra. Result.movesPp por IDs originales exactos no sustituye otros datos.
No normalizar fotos/planes legacy antes de hashes ni alterar resultados previos;
los que omiten PP siguen válidos. Motores persisten baseMoveSlots originales,
incluido KO/reservas; Transform/Mimic temporales no reemplazan moves guardados.
FallbackGenIII src/lib/movePpData.json debe coincidir con copia Nest/assetdist;
máximo pp catálogo entero0..100 prevalece. Conserva guardia transactPvpParty,
RNG/FutureSight y reservas. Sketch guarda PP originales removidos en
boardOriginalPp; wrapper restoreEmeraldBattle conserva Transform con menos slots.
Pruebas14 motor PP/6 legacy/9 Party/15 wallet/7 cuentas y Nest63 Shop/47 PvP/29
chat pasan. Suite combinada152, TS y builds correctos; Chrome Tienda/PP/wild/
Trainer/JcJ/reconexión pasan, incluidos stock y PP tras resultado/reload.
Producción no verificada. Desplegar Nest primero y React después, sin vars/MySQL/seed ni borrar
batallas. Ver Punto de continuacion de memoria compartida.

Etapa anterior: Full Restore con stock Bag autorizado 2026-11-12, versión2.3.0. Acciones del
dashboard y BATTLE MOVES usan ShopContext.useFullRestore: plan persistido antes
del débito y ACK después de guardar efecto+wallet. itemUseLock/recibos impiden
repetir curación/turno/consumo tras fallo Storage o reload. Wild usa evento nativo
priority8/order102, sin PP; objeto pagado no cancelable. Legacy gasta acción
hasta Finalizar turno. Admin PvP/Trainer usa stock humano y comandos autorizados,
networkItems.pending/used por callback del evento y outbox Nest antes del débito.
Cancelar/forfeit antes del efecto no consume. NPC sin objetos. Preservar RNG,
daño y Future Sight. El thunk antiguo rechaza curas gratis. Desplegar Nest
primero y React después, sin MySQL ni variables. Ver memoria/protocolos.
Los turnos nativos locales usan transactPvpParty y revisión persistida. La
guardia de escritura transitoria durante pause/flush evita que una wallet tardía
sobrescriba la siguiente acción. No convertirla en un bloqueo visual permanente.

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
autoridad de saldo/items; partida general permanece local. Full Restore se habilitó
después, seguido de Max Ether/Max Elixir2.4.0; otros objetos continúan sin uso.
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
No convertir moves[].pp de catalogo en PP gastados. Full Restore confirmado
consume inventario y la acción de turno. No se agregan XP ni premios.
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
