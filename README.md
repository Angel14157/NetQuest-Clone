# NetQuest — clon 🕸️◈

Réplica funcional de **NetQuest** (herramienta de subnetting de la uni) convertida en
**plataforma de aprendizaje de redes**: curso de 0 a avanzado con animaciones interactivas,
10 lecciones con quiz, examen final, topologías VLSM, consola de routers tipo Cisco y un
**creador de ejercicios propios** (cantidad de routers, nombres, hosts y clase A/B/C).

100 % HTML/CSS/JS puro — **sin build, sin dependencias, funciona offline**.

## ▶ Cómo abrirla

| Forma | Cómo |
|---|---|
| Local (doble clic) | Abre `index.html` — funciona directo (la PWA no se registra en `file://`) |
| Local (servidor) | `python -m http.server 8017` → http://127.0.0.1:8017/ |
| En línea (GitHub Pages) | https://\<usuario\>.github.io/NetQuest-Clone/ |

## 📁 Estructura

```
NetQuest-Clone/
├── index.html        6 vistas + panel derecho + creador de ejercicios
├── styles.css        tema oscuro · breakpoints: 1240 / 1080 (rail arriba + hoja inferior) / 900 / 760 (builder)
├── app.js            toda la lógica (ver mapa abajo)
├── manifest.json     PWA: nombre, iconos, display standalone
├── sw.js             service worker: offline + actualización en 2 planos
├── icons/            icon-192 · icon-512 · icon-maskable-512 (◈ ámbar)
└── android/          proyecto Android Studio (APK) — ver sección Android
```

### Mapa de `app.js`

| Bloque | Funciones clave |
|---|---|
| **Matemática IPv4** | `parseIp`, `intToIp`, `netOf`, `blockOf`, `needPrefix`, `maskStr`, `parseCidr`, `solveVlsm` |
| **Topología** | `defaultTopology()` (pizarra CARACAS/LARA/ZULIA), `topoLayout`, `renderTopo`, `solutionTopo` |
| **Creador** | `CLASS_BASE` (A/B/C), `defaultCx`, `KEYS` (`ABCDEF`), `makeTopology`, `renderBuilder`, `buildCustom` |
| **Vista clásica** | `newClassic`, `classicSubnets`, `renderClassic`, `verifyClassic`, `hintClassic`, `solutionClassic` |
| **Consola** | terminal (`showRunning`, `Plan IP`, comandos Cisco simulados) |
| **Curso** | `LESSONS` (array), `ANIMS` (mapa id → animación), quiz, progreso `nq-progress` |
| **Examen** | `EXAM_QUESTIONS` (banco), `EXAM_N = 20`, `EXAM_PASS = 14` (70 %), desbloqueo automático |

## 🛠 Guía de actualizaciones (léela antes de tocar nada)

Para que **los celulares con la app instalada reciban los cambios**:

1. Edita el código.
2. **Sube `CACHE` en `sw.js`** (`'netquest-v3'`, `-4`…). Sin esto, muchos quedarán con la versión vieja.
3. Sube:
   ```bash
   git add -A
   git commit -m "descripción del cambio"
   git push
   ```
   GitHub Pages redespliega solo (~1 min).
4. En el móvil: recarga 1–2 veces.

El service worker usa *stale-while-revalidate*: sirve lo cacheado y re-descarga en segundo
plano, así que incluso sin subir `CACHE` casi siempre llega en la segunda recarga (el bump
lo garantiza).

> Comprobación rápida tras editar: `node --check app.js`.

## 📚 Cómo agregar contenido

**Lección nueva** — añade un objeto en `LESSONS` (se desbloquea sola, en orden):

```js
{
  id:'nat', lvl:2, title:'Qué es NAT',
  hint:'El router traduce IPs privadas a la pública…',
  html:`<p>explicación con <code>html</code>…</p>`,
  anim:'nat',          // opcional: clave de ANIMS
  quiz:[ { q:'…', opts:['a','b','c','d'], a:1,
           ok:'mensaje al acertar', why:'explicación tras fallar' } ]
}
```

**Animación** — añade una función en `ANIMS` con la misma clave:

```js
const ANIMS = {
  nat(slot){ slot.innerHTML = `<div class="anim-row">…</div>`; /* pinta y anima */ }
}
```

**Pregunta de examen** — añade en `EXAM_QUESTIONS`:

```js
{ q:'¿…?', opts:['…','…','…','…'], a:0 /* índice correcto */,
  why:'explicación que se ve en la revisión' }
```

(El examen elige `EXAM_N` al azar de todo el banco; aprueba con `EXAM_PASS`.)

**Creador de ejercicios** — límites y clases en `CLASS_BASE` / `makeTopology`
(1–6 routers, 1–3 LANs por router, enlace serial encadenado opcional).

**Topología de la pizarra** — `defaultTopology()` (hosts de CARACAS/LARA/ZULIA y enlaces A–B–C).

## 💾 Datos guardados (`localStorage`)

| Clave | Qué guarda |
|---|---|
| `nq-progress` | lecciones aprobadas del curso |
| `nq-exam-best` | mejor nota del examen |
| `nq-custom` | tu último ejercicio propio |

“Reiniciar progreso” (vista Aprender) borra curso y examen.

## 📱 PWA y Android

- `manifest.json` + `sw.js` + `icons/` → en Chrome Android: **menú → "Agregar a pantalla de inicio"**.
  Funciona offline y se ve como app (standalone).
- ⚠️ **No convertir `app.js` a módulos ES** (rompen en `file://`, que es como el APK carga la app).
- `sw.js` solo tiene efecto sobre http/https (GitHub Pages o localhost) — dentro del APK no aplica.

### 🤖 APK (carpeta `android/`)

Proyecto **Android Studio** (WebView que carga `file:///android_asset/index.html`, sin permisos,
100 % offline). AGP 9.3.1 · Gradle 9.5 · minSdk 24 · targetSdk 36.

**Compilar:**

1. Abre la carpeta `android/` en Android Studio (Open).
2. Espera el *Gradle sync* la primera vez (descarga Gradle y dependencias).
3. **Build → Build APK(s)**.
4. El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk` (firmado con debug → instalable directo).

**Instalar en el celular:** copia el `.apk` al teléfono (USB/WhatsApp/Drive) y ábrelo →
permite instalación de orígenes desconocidos cuando lo pida.

> La tarea `syncAppAssets` copia `index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`
> e `icons/` desde la raíz del repo en **cada build**: editas la web → recompilar → el APK
> trae los cambios. Sin copias manuales.

---

Hecho para practicar subnetting IPv4: clásico, VLSM, ruteo estático y consola — de cero a avanzado. 🎓
