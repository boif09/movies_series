# Películas y series

Aplicación web local para buscar películas y series en TMDB y guardar vuestra lista en SQLite.

## Qué incluye

- Buscador de películas y series usando TMDB.
- Portadas, descripción, año, tipo y nota media de TMDB.
- Guardar como pendiente o vista.
- Valoración del 1 al 10 y comentario para contenido visto.
- Categoría para lo visto: "Obra maestra", "La recomendaría", "Meh" o "Mierdón".
- Editar cualquier registro guardado (estado, nota, fecha, categoría y comentario), también los vistos juntos.
- Filtros por estado, categoría, tipo y usuario.
- Instalable como aplicación desde Chrome (PWA).
- SQLite configurable desde `config.json`.
- SQLite nativo de Node.js, sin `better-sqlite3` y sin instalar Visual Studio Build Tools.

## Requisitos

- Node.js 24 o superior.
- Tu base SQLite local `movies_serie.db`.
- Token v4 de TMDB.

## Instalación limpia en Windows

Si ya habías probado una versión anterior y te falló `npm install`, borra primero dependencias antiguas:

```powershell
rmdir /s /q node_modules
del package-lock.json
```

Si alguno de esos comandos dice que no existe, no pasa nada.

Después instala de nuevo:

```powershell
npm install
```

Copia el archivo de entorno:

```powershell
copy .env.example .env
```

Edita `.env` y pega tu token de TMDB:

```env
TMDB_ACCESS_TOKEN=tu_token_v4
```

No subas `.env` a GitHub.

## Instalación en Mac/Linux

```bash
npm install
cp .env.example .env
```

Edita `.env` y pega tu token de TMDB.

## Configuración de la base de datos

La ruta está en `config.json`:

```json
{
  "database": {
    "provider": "sqlite",
    "path": "C:/Users/xavid/Documents/Casa - Judit y Xavi/BBDD/movies_serie.db",
    "url": ""
  }
}
```

Recomiendo usar `/` en rutas Windows para evitar problemas de escape.

La propiedad `url` queda preparada para una migración futura, pero esta versión solo implementa SQLite por ruta local.

## Arranque

```bash
npm start
```

Abre:

```text
http://localhost:3000/movies_series
```

Si entras en `http://localhost:3000`, la app te redirige automáticamente a `/movies_series`.

## Instalar como aplicación

Con el servidor arrancado, abre la app en Chrome y pulsa el icono de instalar de la barra de direcciones
(o menú ⋮ → "Enviar, guardar y compartir" → "Instalar página como aplicación").

Chrome solo permite instalar desde `localhost` o desde HTTPS. Para instalarla en el móvil hay que servirla
por HTTPS (por ejemplo detrás de nginx, como `repartos-app`).

Los iconos se generan con `node scripts/make-icons.js`.

## Ruta de la aplicación

La ruta base también está en `config.json`:

```json
{
  "app": {
    "basePath": "/movies_series"
  }
}
```

También puedes sobrescribirla desde `.env`:

```env
BASE_PATH=/movies_series
```

Las rutas internas de la app quedan así:

```text
Frontend: http://localhost:3000/movies_series
API:      http://localhost:3000/movies_series/api
```

## Usuarios iniciales

Los usuarios iniciales se configuran en `config.json`:

```json
"defaultUsers": ["Xavi", "Judit"]
```

La app los crea automáticamente con `INSERT OR IGNORE`, así que no duplica usuarios si ya existen.

## Tablas

La app crea o completa estas tablas al arrancar:

- `users`
- `media`
- `user_media`

También añade automáticamente las columnas nuevas `runtime`, `number_of_seasons` y `number_of_episodes` si ya habías creado la tabla `media` antes.

## Nota importante sobre el token

Has compartido el token en el chat. Para un proyecto local no pasa nada grave si lo usas solo tú, pero por seguridad lo ideal sería regenerarlo en TMDB y usar el nuevo en `.env`.
