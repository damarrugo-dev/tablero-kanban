# Tablero Kanban

Tablero Kanban en línea con **procesos** (columnas) y **carriles** (filas).

- Cada tarjeta tiene título, descripción, responsable, color, lista de tareas, notas de avance y enlaces.
- Cada vez que una tarjeta entra a un proceso o carril se guarda la **fecha de entrada**; el historial muestra cuánto tiempo estuvo en cada etapa y quién la movió.
- Las tarjetas se arrastran entre celdas (en el celular: mantener presionada la tarjeta y arrastrar, o abrirla y cambiar el proceso/carril).
- Búsqueda, filtro por responsable y exportación del seguimiento a Excel (CSV).
- Varios tableros con el mismo sitio: agrega `?tablero=nombre` al enlace.

Es un sitio estático (`index.html`, `app.js`, `styles.css`) publicado con GitHub Pages. Los datos compartidos viven en Firebase Firestore; mientras `config.js` tenga `firebaseConfig = null`, el tablero funciona en **modo de prueba** (solo guarda en el navegador).

## Puesta en marcha

### 1. Publicar el sitio (GitHub Pages)

1. En este repositorio: **Settings** → **Pages**.
2. En *Build and deployment* → *Source*: **Deploy from a branch**.
3. En *Branch*: **main** y carpeta **/ (root)** → **Save**.
4. En uno o dos minutos el tablero queda en `https://damarrugo-dev.github.io/tablero-kanban/`.

### 2. Base de datos compartida (Firebase, gratis)

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Crear un proyecto** → nombre `tablero-kanban` → Continuar → desactiva Google Analytics → **Crear proyecto**.
3. Menú izquierdo: **Compilación / Build** → **Firestore Database** → **Crear base de datos** → elige una ubicación (por ejemplo `southamerica-east1`) → **modo de producción** → **Crear**.
4. Pestaña **Reglas**: borra lo que hay, pega el contenido de [`firestore.rules`](firestore.rules) → **Publicar**.
5. Rueda ⚙ (arriba a la izquierda) → **Configuración del proyecto** → abajo en *Tus apps* pulsa el ícono **`</>`** (Web) → apodo `tablero` → **Registrar app**.
6. Copia el bloque `const firebaseConfig = { ... }` que aparece y pégalo en `config.js` (reemplazando `null`).

> Para entrar, cada persona escribe su correo @hitss.com o @anava.com y abre el enlace que le llega. Las reglas de `firestore.rules` solo permiten esos correos (activar en Firebase: Authentication → Correo electrónico/contraseña → Vínculo de correo electrónico, y agregar `damarrugo-dev.github.io` en Dominios autorizados).

## Control de acceso

Cada vez que alguien pide el enlace para entrar, entra al tablero o intenta con un correo no permitido, queda registrado en Firestore (colección `accesos`). Los administradores de `config.js` (`administradores`) ven el botón **Accesos** con el resumen por persona, el detalle de movimientos y la opción de exportarlo a Excel. Las reglas de `firestore.rules` impiden que alguien cambie o borre ese registro.
