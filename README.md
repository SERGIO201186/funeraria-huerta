# 🏛️ Sistema Operativo — Servicios Funerarios Huerta

Panel de control operativo para gestión de órdenes de servicio (ODS), logística de sepelio, inventario y colaboradores. Funciona como **PWA instalable** en PC y celular, con soporte **offline completo** y sincronización automática con Google Sheets.

---

## 📁 Estructura del repositorio

```
funeraria-huerta/
├── panel.html          ← Interfaz principal (SPA + PWA)
├── Codigo.gs           ← Backend Google Apps Script
├── manifest.json       ← Configuración PWA
├── sw.js               ← Service Worker (offline + sync)
├── genera_iconos.py    ← Script para generar iconos (ejecutar 1 vez)
├── icons/
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

---

## 🚀 Pasos para poner en producción

### 1. Subir a GitHub Pages (hosting gratuito)

```bash
# En tu PC, dentro de la carpeta del proyecto:
git init
git add .
git commit -m "Sistema Funeraria Huerta v2.0 - PWA con offline"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/funeraria-huerta.git
git push -u origin main
```

Luego en GitHub.com:
1. Ve a tu repositorio → **Settings** → **Pages**
2. En *Source* selecciona **Deploy from a branch**
3. Branch: `main`, Folder: `/ (root)`
4. Clic en **Save**
5. En ~2 minutos tu app estará en: `https://TU_USUARIO.github.io/funeraria-huerta/panel.html`

### 2. Configurar Google Apps Script

1. Abre [script.google.com](https://script.google.com)
2. Crea un nuevo proyecto → pega el contenido de `Codigo.gs`
3. **Implementar → Nueva implementación**
   - Tipo: *Aplicación web*
   - Ejecutar como: *Yo mismo*
   - Quién tiene acceso: *Cualquier persona*
4. Copia la URL generada
5. En `panel.html` busca `URL_SCRIPT` y reemplaza con tu URL

### 3. Configurar PIN Maestro seguro

En Google Apps Script → Ajustes del proyecto → **Propiedades del script**:
- Clave: `PIN_MAESTRO`
- Valor: tu PIN de 4 dígitos de respaldo

---

## 📱 Instalar como app en celulares (Android / iPhone)

### Android (Chrome)
1. Abre `https://TU_USUARIO.github.io/funeraria-huerta/panel.html`
2. Aparece banner automático **"Instalar Funeraria Huerta"** → toca **Instalar**
3. O: menú ⋮ → **Agregar a pantalla de inicio**

### iPhone / iPad (Safari)
1. Abre la URL en Safari
2. Toca el botón de compartir 📤
3. Selecciona **"Agregar a pantalla de inicio"**
4. La app aparecerá con el ícono de la cruz dorada

### PC / Windows / Mac (Chrome o Edge)
1. Abre la URL en Chrome o Edge
2. En la barra de direcciones aparece un ícono de instalación 🖥️
3. Clic → **Instalar**
4. La app abre en ventana propia (sin barra de navegador)

---

## 🔌 Funcionalidad Offline

| Función | Online | Offline |
|---------|--------|---------|
| Capturar ODS completa | ✅ | ✅ (folio temporal) |
| Editar logística posterior | ✅ | ✅ (se encola) |
| Ver historial de órdenes | ✅ | ✅ (caché local) |
| Alertas de recolección | ✅ | ✅ (caché local) |
| Sincronizar con Google Sheets | ✅ | ⏳ (al reconectarse) |
| Calcular KM con Maps | ✅ | ❌ (requiere internet) |
| Generar e imprimir contrato | ✅ | ✅ |

### Flujo de sincronización

```
Empleado sin internet
    → Captura ODS / edita logística
    → Se guarda en IndexedDB local
    → Badge "SIN CONEXIÓN" visible

Al recuperar internet
    → App detecta conexión automáticamente
    → Envía todos los cambios pendientes a Google Sheets
    → Badge "Sincronizando..." → "EN LÍNEA"
    → Toast de confirmación con número de cambios enviados
```

---

## 🔄 Actualizar la app

```bash
# Edita los archivos que necesites, luego:
git add .
git commit -m "descripción del cambio"
git push
```

GitHub Pages publica automáticamente en ~1 minuto. Los empleados recibirán la actualización la próxima vez que tengan internet (el Service Worker se actualiza en segundo plano).

Para forzar actualización de caché, cambia el número en `sw.js`:
```js
const CACHE_NAME = 'huerta-v1.5';  // incrementar versión
```

---

## 🛡️ Seguridad

- Los PINes **nunca** se almacenan en el código fuente
- El PIN Maestro vive solo en `PropertiesService` de Google Apps Script
- La app sirve desde GitHub Pages (HTTPS obligatorio)
- Google Sheets actúa como base de datos con control de acceso de Google

---

## 📞 Soporte

Sistema desarrollado para **Servicios Funerarios Huerta** — Xalapa, Veracruz, México.
