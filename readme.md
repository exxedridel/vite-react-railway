---
title: Vite + React
description: The default Vite + React starter, utilizing `serve` to serve the built app
tags:
  - node
  - vite
  - react
---

# Vite + React + Serve

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

Validación local de la etapa de usuarios: build de producción correcto, 7 casos
de almacenamiento y prueba Chrome aprobados. El `tsc --noEmit` global conserva
16 errores previos (módulos antiguos ausentes, objetivo ES5 y pruebas anteriores);
no está limpio aunque esta etapa no añade diagnósticos.

## Plantilla original

This is a [Vite + React](https://vitejs.dev/guide/#trying-vite-online) starter that uses [serve](https://www.npmjs.com/package/serve).

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/NeiLty?referralCode=ySCnWl)

## ✨ Features

- Vite + React
- Serve

## 💁‍♀️ How to use

- Install required dependencies with `npm install`
- Start the server for local development `npm run dev`

## ❓ Why use `serve`

By default Railway will use the `start` script defined in package.json to run your app, the default Vite + React starter project does not come with any `start` script, so I have added `serve` as the start script, there are many benefits to using serve over just running the vite command. 

 - `serve` is more suited to run single page apps
 - Uses less ram than `vite` or `vite preview` (<100mb)
 - Far more performant and stable
