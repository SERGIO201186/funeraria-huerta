// ====================================================
// FUNERARIA HUERTA – Google Apps Script (Code.gs)
// Backend COMPARTIDO entre app ODS y app de Previsiones
// v2.2.0 — columnas por nombre (no por posición fija) + campos de
//          logística de cremación/foráneo que antes no se guardaban
// INSTRUCCIONES:
// 1. Pega en script.google.com > proyecto existente (reemplaza todo)
// 2. Implementar > Gestionar implementaciones > Editar (lápiz) >
//    Nueva versión > Implementar
//    (si usas "Nueva implementación" en vez de una nueva versión de la
//    misma, la URL cambia y hay que actualizarla en ambas apps)
// 3. Ejecutar como: YO | Acceso: Cualquier persona
// ====================================================

// — NOMBRES DE HOJAS
const SH_ODS   = "OrdenesTrabajo";
const SH_EMP   = "Colaboradores";  // ← COMPARTIDA entre las dos apps
const SH_PREV  = "Previsiones";
const SH_ABONO = "Abonos";
const SH_LOG   = "LogActividad";
const SH_PROD  = "Productos";      // ← catálogo de ataúdes/urnas
const SH_SOLIC = "Solicitudes";    // ← solicitudes de edición de ODS (empleados)

// — CABECERAS ODS ----------------------------------------------
// IMPORTANTE: el ORDEN de este arreglo ya no determina en qué columna
// física se guarda cada dato — eso ahora lo decide el encabezado real de
// la hoja (ver ensureColumns/toRow más abajo). Este arreglo solo define:
// (a) el orden de columnas cuando se crea la hoja por primera vez, y
// (b) qué columnas deben existir sí o sí (si falta alguna se agrega sola
// al final de la hoja, sin mover las que ya existen).
const ODS_COLS = [
  "folio","fallecido","contratante","telefono",
  "direccionCalle","direccionColonia","direccionLocalidad","direccionMunicipio",
  "modalidadServicio",
  "ataudId","ataudNombre","costoAtaud",
  "tipoCremacion","costoAdicionalCremacion","urnaId","urnaNombre","costoUrna",
  "urnaCambioId","urnaCambioNombre","costoUrnaCambio",
  "embalsamado","costoEmbalsamado",
  "tramites","costoTramites",
  "modalidadVelacion","equipoVelacion",
  "fechaInstalacion","fechaRecoleccion",
  "salaVelacion","costoSala","insumos",
  "destinoTipo","destinoNombre","kmTraslado","costoTraslado",
  "excesoPeso","costoExcesoPeso","objetoCuerpo","costoObjetoCuerpo","otrosCargos",
  "subtotal","descuento","iva","totalGeneral","porcentajeAnticipo","anticipo","restante",
  "tienePagare","montoPagare","nombreDeudor","telefonoDeudor","ineDeudor",
  "vencimientoPagare","domicilioDeudor","cantidadLetras",
  "lugSepelio","fechaSepelio","salidaTraslado","horaMisa","horaSepelio",
  "crematorio","fechaCremacion","salidaCremacion","horaMisaCrem","horaCremacion",
  "foraneoLugarSalida","foraneoHoraSalida",
  "anotaciones","estatusEquipo","estatus",
  "firmaContratanteB64","firmaFecha",
  "creadoPor","fechaCreacion","fechaActualizacion"
];

// — CABECERAS COLABORADORES ----------------------------------------------
const EMP_COLS = [
  "idColaborador","fechaIngreso","nombreCompleto","puesto",
  "domicilio","telefono","familiarNombre","familiarTelefono",
  "usuario","contrasena","pin","estatus","nota","fechaRegistro"
];

// — CABECERAS PRODUCTOS (ataúdes/urnas) --------------------------------
const PROD_COLS = [
  "id","tipo","nombre","descripcion",
  "costo","precioSugerido","proveedor","existencia",
  "disponibleInmediato","activo",
  "creadoPor","fechaCreacion","fechaActualizacion"
];

// — CABECERAS SOLICITUDES DE EDICIÓN -------------------------------------
const SOLIC_COLS = [
  "id","folio","empleadoId","empleadoNombre","motivo","nuevoTotalPropuesto",
  "estado","fecha","fechaHora","fechaResolucion","resueltoPor"
];

//
//  SALIDA JSON
//  NOTA: ContentService.TextOutput NO tiene método setHeader().
//  Ese método solo existe en HtmlOutput. Intentar usarlo aquí
//  es lo que rompía CADA respuesta del servidor ("output.setHeader
//  is not a function"). Apps Script ya permite peticiones fetch
//  simples (Content-Type: text/plain) sin necesidad de cabeceras
//  CORS manuales.
//
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doOptions(e) {
  return ContentService.createTextOutput("");
}

// ============================================================
// PUNTO DE ENTRADA
// ============================================================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const accion  = payload.accion || "";
    let result;

    switch (accion) {
      case "ping":                          result = { ok:true, mensaje:"Servidor Huerta v2 activo ✓" }; break;
      case "guardarODS":                    result = guardarODS(payload.datos);  break;
      case "obtenerODS":                    result = obtenerODS(payload.filtros||{}); break;
      case "actualizarODS":                 result = actualizarODS(payload.folio, payload.datos); break;
      case "eliminarODS":                   result = eliminarODS(payload.folio); break;
      case "guardarColaborador":            result = guardarColaborador(payload.datos);break;
      case "obtenerColaboradores":          result = obtenerColaboradores();          break;
      case "validarAcceso":                 result = validarAcceso(payload);          break;
      case "sincronizarTodo":               result = sincronizarTodo(payload);        break;
      // Previsiones (compatibilidad con app hermana)
      case "guardarPrevision":   result = guardarPrevision(payload.datos);  break;
      case "obtenerPrevisiones": result = obtenerPrevisiones(payload.filtros||{}); break;
      case "guardarAbono":       result = guardarAbono(payload.datos);      break;
      case "obtenerAbonos":      result = obtenerAbonos(payload.folio);     break;
      case "guardarFirma":       result = guardarFirma(payload.datos);      break;
      case "obtenerContratoHTML":result = { ok:true, html: generarContratoHTML(payload.folio) }; break;
      // Productos (ataúdes/urnas)
      case "guardarProducto":    result = guardarProducto(payload.datos);   break;
      case "obtenerProductos":   result = obtenerProductos(payload.filtros||{}); break;
      case "eliminarProducto":   result = eliminarProducto(payload.id);    break;
      // Solicitudes de edición de ODS (empleados piden autorización)
      case "guardarSolicitud":   result = guardarSolicitud(payload.datos);  break;
      case "obtenerSolicitudes": result = obtenerSolicitudes(payload.filtros||{}); break;
      default: result = { ok:false, mensaje:"Acción desconocida: " + accion };
    }

    return jsonOut(result);
  } catch(err) {
    return jsonOut({ ok:false, error: err.message });
  }
}

function doGet(e) {
  const accion = (e.parameter && e.parameter.accion) || "ping";
  let result = { ok:false, mensaje:"Usa POST" };
  if (accion === "ping") result = { ok:true, mensaje:"Servidor Huerta v2 activo ✓" };
  return jsonOut(result);
}

//
//  INICIALIZAR / AUTO-REPARAR HOJAS
//
// Si la hoja no existe, se crea con las columnas en el orden dado.
// Si YA existe (aunque tenga columnas de más, de menos, o en otro orden
// por cambios anteriores del script), NO se toca el orden existente:
// solo se agregan al final las columnas que falten. Esto es lo que evita
// que una escritura futura quede desalineada con lo que ya hay guardado.
function ensureColumns(sh, columnasEsperadas) {
  const anchoActual = sh.getLastColumn();
  const headersActuales = anchoActual > 0
    ? sh.getRange(1, 1, 1, anchoActual).getValues()[0]
    : [];
  const faltantes = columnasEsperadas.filter(c => headersActuales.indexOf(c) < 0);
  if (faltantes.length) {
    sh.getRange(1, headersActuales.length + 1, 1, faltantes.length).setValues([faltantes]);
    sh.getRange(1, headersActuales.length + 1, 1, faltantes.length)
      .setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
  }
  return headersActuales.concat(faltantes);
}

function initSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1,1,1,headers.length)
      .setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    sh.setFrozenRows(1);
    return sh;
  }
  ensureColumns(sh, headers);
  return sh;
}
function getODSSh()  { return initSheet(SH_ODS,   ODS_COLS);  }
function getEmpSh()  { return initSheet(SH_EMP,   EMP_COLS);  }
function getPrevSh() { return initSheet(SH_PREV,  ["folio","titular","ine","celular","correo","beneficiario1","telBen1","beneficiario2",
"telBen2","paquete","asesor","precioTotal","enganche","cuotas","frecuencia","cuotaMonto","restante","estatus","creadoPor","fechaCreacion",
"fechaActualizacion"]); }
function getAbonoSh() { return initSheet(SH_ABONO, ["id","folio","contratante","monto","porcentaje","fecha","metodo","referencia","nota",
"cajero","estado","fechaRegistro"]); }
function getProdSh() { return initSheet(SH_PROD, PROD_COLS); }
function getSolicSh() { return initSheet(SH_SOLIC, SOLIC_COLS); }

// Encabezados REALES de la hoja tal como están hoy (para leer/escribir
// siempre alineado a lo que en verdad hay en la fila 1, nunca a una
// constante fija que pudo haber quedado desactualizada).
function headersReales(sh) {
  const ancho = sh.getLastColumn();
  return ancho > 0 ? sh.getRange(1, 1, 1, ancho).getValues()[0] : [];
}

//
//  UTILIDADES
//
function toObj(headers, row) {
  const o = {};
  headers.forEach((h,i) => o[h] = row[i]);
  return o;
}
function toRow(headers, obj) {
  return headers.map(h => obj[h] !== undefined ? obj[h] : "");
}
function findRow(sh, col, val) {
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return -1;
  const ci = data[0].indexOf(col);
  if (ci < 0) return -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][ci]) === String(val)) return i + 1;
  }
  return -1;
}
function logActividad(accion, usuario, detalle) {
  try {
    const sh = initSheet(SH_LOG, ["timestamp","accion","usuario","detalle"]);
    sh.appendRow([new Date().toISOString(), accion, usuario, detalle]);
  } catch(e) {}
}

// ============================================================
//  VALIDAR ACCESO – PIN o usuario+contraseña
//  Funciona para AMBAS aplicaciones
// ============================================================
function validarAcceso(payload) {
  const sh   = getEmpSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok:false, mensaje:"Sin colaboradores registrados" };
  const headers = data[0];

  for (let i = 1; i < data.length; i++) {
    const e = toObj(headers, data[i]);
    if (String(e.estatus) !== "ACTIVO") continue;

    // Por PIN
    if (payload.pin && String(e.pin) === String(payload.pin)) {
      return { ok:true, colaborador: _empPublic(e) };
    }
    // Por usuario + contraseña
    if (payload.usuario && payload.contrasena &&
        String(e.usuario) === String(payload.usuario) &&
        String(e.contrasena) === String(payload.contrasena)) {
      return { ok:true, colaborador: _empPublic(e) };
    }
  }
  return { ok:false, mensaje:"Credenciales incorrectas o colaborador inactivo" };
}
function _empPublic(e) {
  return { id:e.idColaborador, nombre:e.nombreCompleto, puesto:e.puesto, telefono:e.telefono };
}

// ============================================================
//  ODS
// ============================================================
function guardarODS(datos) {
  const sh  = getODSSh();
  if (datos.folio) {
    const idx = findRow(sh, "folio", datos.folio);
    if (idx > 0) return actualizarODS(datos.folio, datos);
  }
  const headers = headersReales(sh);
  datos.fechaCreacion     = datos.fechaCreacion     || new Date().toISOString();
  datos.fechaActualizacion = new Date().toISOString();
  sh.appendRow(toRow(headers, datos));
  logActividad("guardarODS", datos.creadoPor||"", datos.folio);
  return { ok:true, folio:datos.folio };
}

function obtenerODS(filtros) {
  const sh   = getODSSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok:true, datos:[] };
  const headers = data[0];
  let filas = data.slice(1).map(r => toObj(headers, r));
  if (filtros.estatus)   filas = filas.filter(r => r.estatus   === filtros.estatus);
  if (filtros.folio)     filas = filas.filter(r => r.folio     === filtros.folio);
  if (filtros.creadoPor) filas = filas.filter(r => r.creadoPor === filtros.creadoPor);
  return { ok:true, datos:filas, total:filas.length };
}

function actualizarODS(folio, datos) {
  const sh = getODSSh();
  const idx = findRow(sh, "folio", folio);
  if (idx < 0) return guardarODS(datos);    // si no existe, crear
  const headers = headersReales(sh);
  datos.fechaActualizacion = new Date().toISOString();
  sh.getRange(idx, 1, 1, headers.length).setValues([toRow(headers, datos)]);
  logActividad("actualizarODS", datos.creadoPor||"", folio);
  return { ok:true, folio };
}

function eliminarODS(folio) {
  const sh = getODSSh();
  const idx = findRow(sh, "folio", folio);
  if (idx > 0) sh.deleteRow(idx);
  logActividad("eliminarODS", "", folio);
  return { ok:true };
}

// ============================================================
//  COLABORADORES
// ============================================================
function guardarColaborador(datos) {
  const sh = getEmpSh();
  const headers = headersReales(sh);
  const idx = findRow(sh, "idColaborador", datos.idColaborador);
  datos.fechaRegistro = new Date().toISOString();
  if (idx > 0) {
    sh.getRange(idx,1,1,headers.length).setValues([toRow(headers, datos)]);
    return { ok:true, mensaje:"Colaborador actualizado" };
  }
  datos.estatus = datos.estatus || "ACTIVO";
  sh.appendRow(toRow(headers, datos));
  return { ok:true, mensaje:"Colaborador registrado" };
}

function obtenerColaboradores() {
  const sh = getEmpSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok:true, datos:[] };
  const headers = data[0];
  return { ok:true, datos: data.slice(1).map(r => toObj(headers,r)) };
}

// ============================================================
//  PRODUCTOS (ataúdes/urnas)
// ============================================================
function guardarProducto(datos) {
  const sh = getProdSh();
  const headers = headersReales(sh);
  datos.id = datos.id || ('PROD-' + Date.now());
  const idx = findRow(sh, "id", datos.id);
  datos.fechaActualizacion = new Date().toISOString();
  if (idx > 0) {
    sh.getRange(idx, 1, 1, headers.length).setValues([toRow(headers, datos)]);
    return { ok:true, id:datos.id, mensaje:"Producto actualizado" };
  }
  datos.fechaCreacion = datos.fechaCreacion || new Date().toISOString();
  sh.appendRow(toRow(headers, datos));
  return { ok:true, id:datos.id, mensaje:"Producto agregado" };
}

function obtenerProductos(filtros) {
  const sh = getProdSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok:true, datos:[] };
  const headers = data[0];
  let filas = data.slice(1).map(r => toObj(headers, r));
  filtros = filtros || {};
  if (filtros.tipo) filas = filas.filter(r => r.tipo === filtros.tipo);
  if (filtros.disponibleInmediato !== undefined) {
    filas = filas.filter(r => String(r.disponibleInmediato) === String(filtros.disponibleInmediato));
  }
  if (filtros.activo !== undefined) {
    filas = filas.filter(r => String(r.activo) === String(filtros.activo));
  }
  return { ok:true, datos:filas, total:filas.length };
}

function eliminarProducto(id) {
  const sh = getProdSh();
  const idx = findRow(sh, "id", id);
  if (idx > 0) sh.deleteRow(idx);
  return { ok:true };
}

// ============================================================
//  SOLICITUDES DE EDICIÓN DE ODS
//  Un empleado pide autorización para editar una orden ya guardada; el
//  Administrador aprueba o rechaza. Es upsert por "id" igual que Productos,
//  así sirve tanto para crear la solicitud como para actualizar su estado
//  (pendiente -> aprobada/rechazada/usada).
// ============================================================
function guardarSolicitud(datos) {
  const sh = getSolicSh();
  const headers = headersReales(sh);
  datos.id = datos.id || ('SOL-' + Date.now());
  const idx = findRow(sh, "id", datos.id);
  if (idx > 0) {
    sh.getRange(idx, 1, 1, headers.length).setValues([toRow(headers, datos)]);
    return { ok:true, id:datos.id, mensaje:"Solicitud actualizada" };
  }
  sh.appendRow(toRow(headers, datos));
  return { ok:true, id:datos.id, mensaje:"Solicitud registrada" };
}

function obtenerSolicitudes(filtros) {
  const sh = getSolicSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok:true, datos:[] };
  const headers = data[0];
  let filas = data.slice(1).map(r => toObj(headers, r));
  filtros = filtros || {};
  if (filtros.folio)  filas = filas.filter(r => r.folio  === filtros.folio);
  if (filtros.estado) filas = filas.filter(r => r.estado === filtros.estado);
  return { ok:true, datos:filas, total:filas.length };
}

// ============================================================
//  PREVISIONES (compatibilidad app hermana)
// ============================================================
function guardarPrevision(datos) {
  const sh  = getPrevSh();
  const headers = headersReales(sh);
  const idx = findRow(sh, "folio", datos.folio);
  datos.fechaActualizacion = new Date().toISOString();
  if (idx > 0) {
    sh.getRange(idx,1,1,headers.length).setValues([toRow(headers, datos)]);
    return { ok:true, folio:datos.folio };
  }
  datos.fechaCreacion = datos.fechaCreacion || new Date().toISOString();
  sh.appendRow(toRow(headers, datos));
  return { ok:true, folio:datos.folio };
}

function obtenerPrevisiones(filtros) {
  const sh  = getPrevSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok:true, datos:[] };
  const headers = data[0];
  let filas = data.slice(1).map(r => toObj(headers, r));
  if (filtros.estatus)   filas = filas.filter(r => r.estatus   === filtros.estatus);
  if (filtros.creadoPor) filas = filas.filter(r => r.creadoPor === filtros.creadoPor);
  return { ok:true, datos:filas };
}

function guardarAbono(datos) {
  const sh = getAbonoSh();
  const headers = headersReales(sh);
  datos.id = datos.id || `AB-${Date.now()}`;
  const idx = findRow(sh, "id", datos.id);
  if (idx > 0) {
    // El abono ya existe: solo actualizamos su estado (ej. pendiente -> confirmado),
    // sin tocar el resto de las columnas ni duplicar la fila.
    const ciEstado = headers.indexOf("estado");
    if (ciEstado >= 0 && datos.estado) sh.getRange(idx, ciEstado + 1).setValue(datos.estado);
    return { ok:true, id:datos.id, mensaje:"Estado actualizado" };
  }
  datos.fechaRegistro = new Date().toISOString();
  sh.appendRow(toRow(headers, datos));
  return { ok:true, id:datos.id };
}

function obtenerAbonos(folio) {
  const sh  = getAbonoSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok:true, datos:[] };
  const headers = data[0];
  const filas = data.slice(1)
    .map(r => toObj(headers,r))
    .filter(r => !folio || String(r.folio) === String(folio));
  return { ok:true, datos:filas };
}

// ============================================================
//  SINCRONIZACIÓN MASIVA
// ============================================================
function sincronizarTodo(payload) {
  const ods         = payload.ods    || [];
  const emps        = payload.colaboradores || [];
  const prevs       = payload.previsiones   || [];
  const abonos      = payload.abonos        || [];
  const solicitudes = payload.solicitudes   || [];

  ods.forEach(o         => guardarODS(o));
  emps.forEach(e        => guardarColaborador(e));
  prevs.forEach(p       => guardarPrevision(p));
  abonos.forEach(a      => guardarAbono(a));
  solicitudes.forEach(s => guardarSolicitud(s));

  return {
    ok:true,
    mensaje:`Sync OK: ${ods.length} ODS, ${emps.length} colaboradores, ${prevs.length} previsiones`,
    ods:            obtenerODS({}).datos,
    colaboradores: obtenerColaboradores().datos,
    previsiones:    obtenerPrevisiones({}).datos,
    abonos:         obtenerAbonos(null).datos,
    solicitudes:    obtenerSolicitudes({}).datos
  };
}

// ============================================================
//  FIRMA DEL CONTRATANTE (Canvas → base64 PNG)
// ============================================================
function guardarFirma(datos) {
  const sh = getODSSh();
  const idx = findRow(sh, "folio", datos.folio);
  if (idx < 0) return { ok:false, mensaje:"Folio no encontrado: " + datos.folio };
  const headers = headersReales(sh);
  const ciFirma = headers.indexOf("firmaContratanteB64");
  const ciFecha = headers.indexOf("firmaFecha");
  if (ciFirma >= 0) sh.getRange(idx, ciFirma+1).setValue(datos.firmaB64 || "");
  if (ciFecha >= 0) sh.getRange(idx, ciFecha+1).setValue(new Date().toISOString());
  logActividad("guardarFirma", datos.creadoPor||"", datos.folio);
  return { ok:true, mensaje:"Firma guardada" };
}

// ============================================================
//  CONTRATO DE ADHESIÓN – genera HTML listo para imprimir/PDF
// ============================================================
function generarContratoHTML(folio) {
  const sh  = getODSSh();
  const data = sh.getDataRange().getValues();
  const idx  = findRow(sh, "folio", folio);
  if (idx < 0) return "<p>Folio no encontrado.</p>";
  const headers = data[0];
  const o = toObj(headers, data[idx-1]);

  const firmaImg = o.firmaContratanteB64
    ? `<img src="${o.firmaContratanteB64}" style="height:70px;border-bottom:1px solid #000"/>`
    : `<div style="height:70px;border-bottom:1px solid #000"></div>`;

  return `
<div style="font-family:Georgia,serif;max-width:720px;margin:0 auto;color:#111;line-height:1.5;padding:20px">
  <h2 style="text-align:center;margin-bottom:2px">FUNERARIA HUERTA</h2>
  <p style="text-align:center;font-size:12px;color:#555;margin-top:0">Nicolás Bravo 11, Zona Centro, C.P. 91000, Xalapa, Veracruz</p>
  <h3 style="text-align:center;text-decoration:underline;margin-top:18px">CONTRATO DE ADHESIÓN DE PRESTACIÓN DE SERVICIOS FUNERARIOS</h3>
  <p><strong>Folio:</strong> ${o.folio} &nbsp; <strong>Fecha:</strong> ${(o.fechaCreacion||'').slice(0,10)}</p>
  <p><strong>Contratante:</strong> ${o.contratante||'-'} &nbsp; <strong>Teléfono:</strong> ${o.telefono||'-'}</p>
  <p><strong>Nombre del fallecido:</strong> ${o.fallecido||'-'}</p>
  <p>El presente contrato de adhesión se celebra entre <strong>FUNERARIA HUERTA</strong> (en adelante "EL PRESTADOR")
  y la persona arriba identificada como "EL CONTRATANTE", quien manifiesta su conformidad con los términos y condiciones
  generales de prestación de servicios funerarios que se describen a continuación, mismos que han sido puestos a su
  disposición y explicados previamente a la firma de este documento, en cumplimiento de la Ley Federal de Protección
  al Consumidor.</p>
  <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:13px">
    <tr><td style="border:1px solid #999;padding:5px"><strong>Servicio contratado</strong></td><td style="border:1px solid #999;padding:5px">${o.modalidadServicio||'-'}</td></tr>
    <tr><td style="border:1px solid #999;padding:5px"><strong>Total general</strong></td><td style="border:1px solid #999;padding:5px">$${(+o.totalGeneral||0).toLocaleString('es-MX')}</td></tr>
    <tr><td style="border:1px solid #999;padding:5px"><strong>Anticipo (${o.porcentajeAnticipo||60}%)</strong></td><td style="border:1px solid #999;padding:5px">$${(+o.anticipo||0).toLocaleString('es-MX')}</td></tr>
    <tr><td style="border:1px solid #999;padding:5px"><strong>Saldo restante</strong></td><td style="border:1px solid #999;padding:5px">$${(+o.restante||0).toLocaleString('es-MX')}</td></tr>
  </table>
  <p style="font-size:13px"><strong>Condición de pago:</strong> EL CONTRATANTE se obliga a liquidar el saldo restante
  en el momento de la entrega/recolección del equipo de velación utilizado, de conformidad con lo pactado verbalmente
  y reflejado en la presente orden de servicio.</p>
  <p style="font-size:13px">EL CONTRATANTE declara haber recibido información clara sobre los conceptos, costos y
  condiciones del servicio, y firma de conformidad en este documento como constancia de su aceptación expresa.</p>
  <div style="margin-top:40px;text-align:center">
    ${firmaImg}
    <p style="margin-top:4px">Firma de EL CONTRATANTE – ${o.contratante||'-'}</p>
  </div>
</div>`;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚙ Huerta Admin")
    .addItem("Inicializar / reparar columnas de hojas", "inicializarTodasLasHojas")
    .addToUi();
}
function inicializarTodasLasHojas() {
  getODSSh(); getEmpSh(); getPrevSh(); getAbonoSh(); getProdSh(); getSolicSh();
  SpreadsheetApp.getUi().alert("✅ Hojas inicializadas/reparadas correctamente. Cualquier columna nueva que faltaba se agregó al final de cada hoja.");
}
