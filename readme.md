---
title: Vite + React
description: The default Vite + React starter, utilizing `serve` to serve the built app
tags:
  - node
  - vite
  - react
---

# Vite + React + Serve

## Primera integración: `/mensajes-prueba`

Página protegida por el login existente para `hevedrios@gmail.com` y
`najerad2223@gmail.com`. También se accede mediante el botón **Mensajes** del
jugador o **Mensajes de prueba** del administrador.

| Variable de compilación | Servicio |
| --- | --- |
| `VITE_BASE_MIDDLEWARE` | URL base de `mysql-restapi`, que emite el `bearer_token`. |
| `VITE_BASE_SERVICES` | URL base HTTP de `nest-mongo-pokedex`. |
| `VITE_WEBSOCKET_URL` | Opcional: origen HTTP/HTTPS de Nest para Socket.IO. Si falta, se usa el origen de `VITE_BASE_SERVICES`. |

Usar la URL de Nest sin `/api/v2` para `VITE_WEBSOCKET_URL`; la página añade el
namespace `/mensajes-prueba`. El token se envía en la autenticación Socket.IO y
Nest verifica su firma. **No configurar `JWT_SECRET` en React**: debe existir solo
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

Las instrucciones de configuración y pruebas del servidor están en el README de
`nest-mongo-pokedex`. MySQL conserva su endpoint de login y sus cuentas actuales.

Para una comprobación automática de esta página con dos cuentas aisladas:

1. Instalar dependencias y ejecutar `npm run build` en `nest-mongo-pokedex`.
2. Ejecutar `npm run test:messages:browser` en este frontend.

La herramienta levanta temporalmente Nest sin MongoDB y Vite con URLs locales,
abre Chrome en modo headless con un perfil temporal y comprueba el intercambio
en ambos sentidos. Usa JWT exclusivos de prueba y no inicia sesión en Railway.
Requiere Chrome instalado; si no está en la ruta habitual de Windows, indicar el
ejecutable mediante `CHROME_PATH`. Cierra los procesos temporales al terminar.

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
