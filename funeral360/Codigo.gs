// ====================================================
// FUNERAL360 by Omnia T3chnology — Módulo de Certificación
// Google Apps Script (Codigo.gs) — backend INDEPENDIENTE, propio de este
// producto. NO es el mismo backend de la app "funeraria-huerta" — vive en
// este mismo repositorio solo para control de versiones, pero se despliega
// como un proyecto de Apps Script COMPLETAMENTE APARTE, vinculado a una
// Hoja de Google propia. Así, los datos de cada funeraria que use
// Funeral360 quedan aislados: nunca se mezclan entre clientes, ni con los
// datos de ninguna otra app.
//
// INSTRUCCIONES DE DESPLIEGUE:
// 1. Crea una Hoja de Google NUEVA y vacía (será la base de datos de este
//    cliente). Ábrela → menú Extensiones → Apps Script.
// 2. Borra todo el código de ejemplo (Ctrl+A, Suprimir) y pega este
//    archivo completo.
// 3. Guarda. En el editor, corre una vez la función "inicializarTodasLasHojas"
//    (menú de funciones de arriba, o usa el menú "Funeral360" que aparece
//    solo al abrir la Hoja de Google directamente) — esto crea todas las
//    hojas necesarias y da de alta un colaborador Administrador temporal:
//        ID: admin   PIN: 1234
//    Inicia sesión con ese PIN en la app y CAMBIA el PIN de inmediato desde
//    "Colaboradores" (o da de alta al Administrador real y desactiva este).
// 4. Implementar → Nueva implementación → Tipo: Aplicación web.
//    Ejecutar como: YO | Acceso: Cualquier persona (incluso anónima).
//    Copia la URL que te da (termina en /exec).
// 5. Pega esa URL en la app Funeral360 → Configuración → Sincronización
//    Nube. A partir de ahí todos los dispositivos que usen esa misma URL
//    comparten los mismos datos.
// 6. (Opcional) Para que la lectura automática de documentos (INE/actas/
//    certificados) funcione: ⚙ Configuración del proyecto → Propiedades
//    del script → agrega GEMINI_API_KEY con una clave de
//    https://aistudio.google.com/apikey (capa gratuita). Sin esto, subir y
//    guardar documentos sigue funcionando normal — solo se desactiva el
//    llenado automático.
//
// Si alguna vez necesitas actualizar el código sin perder la URL: usa
// "Gestionar implementaciones → Editar (lápiz) → Nueva versión" (NO crear
// una implementación nueva, o la URL cambia).
// ====================================================

// — NOMBRES DE HOJAS
const SH_EMP  = "Colaboradores";
const SH_FOL  = "Folios";                       // ← expedientes que se están certificando (equivalente ligero a "ODS")
const SH_CERT = "Certificaciones";              // ← datos para certificado médico / Registro Civil
const SH_RC   = "SolicitudRegistroCivil";       // ← formato oficial de Registro Civil (frente + reverso)
const SH_DOC  = "Documentos";                   // ← índice de documentos de respaldo (INE, actas, certificados) guardados en Drive

// — CABECERAS COLABORADORES (login PIN / usuario+contraseña) ---------------
const EMP_COLS = ["idColaborador", "nombreCompleto", "puesto", "telefono", "usuario", "contrasena", "pin", "estatus", "fechaRegistro"];

// — CABECERAS FOLIOS (expediente mínimo: a quién se le está certificando) --
const FOL_COLS = [
  "folio", "fallecido", "contratante", "telefono",
  "direccionCalle", "direccionColonia", "direccionLocalidad", "direccionMunicipio",
  "creadoPor", "fechaCreacion", "fechaActualizacion"
];

// — CABECERAS CERTIFICACIÓN (datos para el médico + Registro Civil) --------
// Idéntico esquema al de la app hermana funeraria-huerta — mismos nombres de
// campo, para que la pestaña "Certificar" se comporte exactamente igual.
const CERT_COLS = [
  "folio",
  "finadoNombre", "finadoEstadoCivil", "finadoFechaNacimiento", "finadoEntidadNacimiento",
  "finadoGradoEstudios", "finadoDomicilio", "finadoAfiliacionSalud", "finadoOcupacion",
  "finadoLugarDefuncion", "finadoFechaDefuncion", "finadoHoraDefuncion",
  "causaDirecta", "causaDirectaIntervalo",
  "causaIntermedia", "causaIntermediaIntervalo",
  "causaBasica", "causaBasicaIntervalo",
  "otrosEstadosPatologicos",
  "tipoDefuncion", "seNecropsia", "fallecioEmbarazoPartoPuerperio",
  "finadoEraCasado",
  "conyugeNombre", "conyugeEstado", "conyugeFechaNacimiento",
  "conyugeLocalidadNac", "conyugeMunicipioNac", "conyugeEstadoNac", "conyugePaisNac",
  "padreNombre", "padreEstado", "padreFechaNacimiento",
  "padreLocalidadNac", "padreMunicipioNac", "padreEstadoNac", "padrePaisNac",
  "madreNombre", "madreEstado", "madreFechaNacimiento",
  "madreLocalidadNac", "madreMunicipioNac", "madreEstadoNac", "madrePaisNac",
  "declaranteNombre", "declaranteParentesco", "declaranteEstadoCivil",
  "declaranteLocalidadNac", "declaranteMunicipioNac", "declaranteEstadoNac", "declarantePaisNac", "declaranteTelefono",
  "testigo1Nombre", "testigo1Parentesco", "testigo1EstadoCivil",
  "testigo1LocalidadNac", "testigo1MunicipioNac", "testigo1EstadoNac", "testigo1PaisNac", "testigo1Telefono",
  "testigo2Nombre", "testigo2Parentesco", "testigo2EstadoCivil",
  "testigo2LocalidadNac", "testigo2MunicipioNac", "testigo2EstadoNac", "testigo2PaisNac", "testigo2Telefono",
  "creadoPor", "fechaCreacion", "fechaActualizacion"
];

// — CABECERAS SOLICITUD REGISTRO CIVIL (formato oficial, tamaño oficio) ----
const RC_COLS = [
  "folio",
  "rcFinadoCurp", "rcFinadoNombres", "rcFinadoApellidoPaterno", "rcFinadoApellidoMaterno",
  "rcFinadoFechaNacimiento", "rcFinadoEdad", "rcFinadoNacionalidad", "rcFinadoSexo",
  "rcFinadoLocalidadNac", "rcFinadoMunicipioNac", "rcFinadoEntidadNac", "rcFinadoPaisNac",
  "rcFinadoDomCalle", "rcFinadoDomNumero", "rcFinadoDomColonia", "rcFinadoDomLocalidad",
  "rcFinadoDomMunicipio", "rcFinadoDomEntidad", "rcFinadoDomPais", "rcFinadoEstadoCivil",
  "rcConyugeNombre", "rcConyugeEstado", "rcConyugeNacionalidad", "rcConyugeFechaNacimiento", "rcConyugeSexo",
  "rcConyugeLocalidadNac", "rcConyugeMunicipioNac", "rcConyugeEntidadNac", "rcConyugePaisNac",
  "rcPadreNombre", "rcPadreEstado", "rcPadreNacionalidad", "rcPadreFechaNacimiento", "rcPadreSexo",
  "rcPadreLocalidadNac", "rcPadreMunicipioNac", "rcPadreEntidadNac", "rcPadrePaisNac",
  "rcMadreNombre", "rcMadreEstado", "rcMadreNacionalidad", "rcMadreFechaNacimiento", "rcMadreSexo",
  "rcMadreLocalidadNac", "rcMadreMunicipioNac", "rcMadreEntidadNac", "rcMadrePaisNac",
  "rcFechaDefuncion", "rcHoraDefuncion", "rcLugarFallecimiento", "rcFallecLugarDetalle", "rcNumeroCertificado",
  "rcDestinoInhumacion", "rcDestinoCremacion", "rcDestinoTraslado", "rcTrasladoDestino", "rcTrasladoMunicipio",
  "rcNombrePanteon", "rcPanteonUbicacion", "rcFechaInhumacion", "rcHoraInhumacion",
  "rcDeclaranteNombre", "rcDeclaranteParentesco", "rcDeclaranteNacionalidad", "rcDeclaranteEstadoCivil",
  "rcDeclaranteLocalidadNac", "rcDeclaranteMunicipioNac", "rcDeclaranteEntidadNac", "rcDeclarantePaisNac",
  "rcDeclaranteDomCalle", "rcDeclaranteDomNumero", "rcDeclaranteDomColonia", "rcDeclaranteDomLocalidad",
  "rcDeclaranteDomMunicipio", "rcDeclaranteDomEntidad", "rcDeclaranteDomPais",
  "rcDeclaranteFechaNacimiento", "rcDeclaranteEdad", "rcDeclaranteTelefono",
  "rcTestigo1Curp", "rcTestigo1Nombre", "rcTestigo1Telefono", "rcTestigo1FechaNacimiento", "rcTestigo1Edad",
  "rcTestigo1Sexo", "rcTestigo1LocalidadNac", "rcTestigo1MunicipioNac", "rcTestigo1EntidadNac", "rcTestigo1PaisNac",
  "rcTestigo1EstadoCivil", "rcTestigo1Parentesco", "rcTestigo1Nacionalidad",
  "rcTestigo1DomCalle", "rcTestigo1DomNumero", "rcTestigo1DomColonia", "rcTestigo1DomLocalidad",
  "rcTestigo1DomMunicipio", "rcTestigo1DomEntidad", "rcTestigo1DomPais",
  "rcTestigo2Curp", "rcTestigo2Nombre", "rcTestigo2Telefono", "rcTestigo2FechaNacimiento", "rcTestigo2Edad",
  "rcTestigo2Sexo", "rcTestigo2LocalidadNac", "rcTestigo2MunicipioNac", "rcTestigo2EntidadNac", "rcTestigo2PaisNac",
  "rcTestigo2EstadoCivil", "rcTestigo2Parentesco", "rcTestigo2Nacionalidad",
  "rcTestigo2DomCalle", "rcTestigo2DomNumero", "rcTestigo2DomColonia", "rcTestigo2DomLocalidad",
  "rcTestigo2DomMunicipio", "rcTestigo2DomEntidad", "rcTestigo2DomPais",
  "rcFunerariaNombre", "rcFunerariaCiudad", "rcFunerariaTelefono", "rcFunerarioAsiste",
  "rcAtencionMedica", "rcSituacionLaboral", "rcSituacionLaboralOtro",
  "rcEscolaridad", "rcEscolaridadUltimoGrado", "rcPosicionTrabajo",
  "creadoPor", "fechaCreacion", "fechaActualizacion"
];

// — CABECERAS DOCUMENTOS (respaldos digitalizados: INE, actas, certificados) —
const DOC_COLS = [
  "id", "folio", "tipoDocumento",
  "nombreFinado", "nombreContratante",
  "driveFileId", "mimeType", "nombreArchivo", "tamanoBytes",
  "fechaSubida", "subidoPor"
];

//
//  SALIDA JSON
//
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function doOptions(e) {
  return ContentService.createTextOutput("");
}

// ============================================================
//  INICIALIZAR / AUTO-REPARAR HOJAS
// ============================================================
function ensureColumns(sh, columnasEsperadas) {
  const anchoActual = sh.getLastColumn();
  const headersActuales = anchoActual > 0 ? sh.getRange(1, 1, 1, anchoActual).getValues()[0] : [];
  const faltantes = columnasEsperadas.filter(c => headersActuales.indexOf(c) < 0);
  if (faltantes.length) {
    sh.getRange(1, headersActuales.length + 1, 1, faltantes.length).setValues([faltantes]);
    sh.getRange(1, headersActuales.length + 1, 1, faltantes.length).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
  }
  return headersActuales.concat(faltantes);
}
function initSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    sh.setFrozenRows(1);
    return sh;
  }
  ensureColumns(sh, headers);
  return sh;
}
function getEmpSh()  { return initSheet(SH_EMP,  EMP_COLS);  }
function getFolSh()  { return initSheet(SH_FOL,  FOL_COLS);  }
function getCertSh() { return initSheet(SH_CERT, CERT_COLS); }
function getRcSh()   { return initSheet(SH_RC,   RC_COLS);   }
function getDocSh()  { return initSheet(SH_DOC,  DOC_COLS);  }

function headersReales(sh) {
  const ancho = sh.getLastColumn();
  return ancho > 0 ? sh.getRange(1, 1, 1, ancho).getValues()[0] : [];
}
function toObj(headers, row) {
  const o = {};
  headers.forEach((h, i) => {
    let v = row[i];
    // Un valor "HH:mm" sin fecha se guarda en Sheets con una fecha base falsa
    // (30-dic-1899) — sin esto, viajaría como "1899-12-30T...Z" en vez de "HH:mm".
    if (v instanceof Date && v.getFullYear() === 1899 && v.getMonth() === 11 && v.getDate() === 30) {
      v = Utilities.formatDate(v, Session.getScriptTimeZone(), "HH:mm");
    }
    o[h] = v;
  });
  return o;
}
function toRow(headers, obj) {
  return headers.map(h => (obj[h] !== undefined ? obj[h] : ""));
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

// ============================================================
//  HASHING DE CREDENCIALES (PIN / CONTRASEÑA)
//  Mismo formato que funeraria-huerta ("h1:<saltHex>:<hashHex>") — el
//  cliente sabe verificarlo igual para el respaldo de login sin conexión.
// ============================================================
const _HASH_PREFIX = "h1:";
function _esCredencialHasheada(v) {
  return typeof v === "string" && v.indexOf(_HASH_PREFIX) === 0 && v.split(":").length === 3;
}
function _bytesAHex(bytes) {
  return bytes.map(b => ((b & 0xff) + 0x100).toString(16).substring(1)).join("");
}
function _hashCredencial(valorPlano, saltHex) {
  const salt = saltHex || Utilities.getUuid().replace(/-/g, "");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(valorPlano) + ":" + salt, Utilities.Charset.UTF_8);
  return _HASH_PREFIX + salt + ":" + _bytesAHex(digest);
}
function _coincideCredencial(valorPlano, valorGuardado) {
  if (!valorPlano || !valorGuardado) return false;
  if (_esCredencialHasheada(valorGuardado)) {
    const partes = valorGuardado.split(":");
    return _hashCredencial(valorPlano, partes[1]) === valorGuardado;
  }
  return String(valorGuardado) === String(valorPlano);
}
function _migrarCredencialSiHaceFalta(sh, headers, rowIdx, campo, valorPlano, valorGuardado) {
  if (_esCredencialHasheada(valorGuardado)) return;
  const col = headers.indexOf(campo);
  if (col < 0) return;
  sh.getRange(rowIdx + 1, col + 1).setValue(_hashCredencial(valorPlano));
}

// ============================================================
//  LÍMITE DE INTENTOS DE LOGIN (fuerza bruta de PIN/contraseña)
// ============================================================
function _loginBloqueado(payload) {
  const cache = CacheService.getScriptCache();
  const credKey = "loginFail_" + String(payload.pin || payload.usuario || "anon");
  const intentosCred = Number(cache.get(credKey) || 0);
  const intentosGlobal = Number(cache.get("loginFailGlobal") || 0);
  return intentosCred >= 8 || intentosGlobal >= 40 ? credKey : null;
}
function _registrarLoginFallido(credKey) {
  const cache = CacheService.getScriptCache();
  cache.put(credKey, String(Number(cache.get(credKey) || 0) + 1), 300);
  cache.put("loginFailGlobal", String(Number(cache.get("loginFailGlobal") || 0) + 1), 300);
}
function _limpiarLoginFallido(credKey) {
  CacheService.getScriptCache().remove(credKey);
}

// ============================================================
//  AUTENTICACIÓN
// ============================================================
function _esActivo(estatus) {
  return String(estatus || "").toUpperCase() === "ACTIVO";
}
function _empPublic(e) {
  return { id: e.idColaborador, nombre: e.nombreCompleto, puesto: e.puesto, telefono: e.telefono };
}
function _esPuestoAdmin(puesto) {
  const p = String(puesto || "").trim().toUpperCase();
  return p === "ADMIN" || p.indexOf("ADMINISTRADOR") !== -1;
}
function validarAcceso(payload) {
  const credKey = "loginFail_" + String(payload.pin || payload.usuario || "anon");
  if (_loginBloqueado(payload)) {
    return { ok: false, mensaje: "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo." };
  }
  const sh = getEmpSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok: false, mensaje: "Sin colaboradores registrados. Corre 'inicializarTodasLasHojas' desde el editor de Apps Script." };
  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    const e = toObj(headers, data[i]);
    if (!_esActivo(e.estatus)) continue;
    if (payload.pin && _coincideCredencial(payload.pin, e.pin)) {
      _migrarCredencialSiHaceFalta(sh, headers, i, "pin", payload.pin, e.pin);
      _limpiarLoginFallido(credKey);
      return { ok: true, colaborador: _empPublic(e) };
    }
    if (payload.usuario && payload.contrasena && String(e.usuario) === String(payload.usuario) && _coincideCredencial(payload.contrasena, e.contrasena)) {
      _migrarCredencialSiHaceFalta(sh, headers, i, "contrasena", payload.contrasena, e.contrasena);
      _limpiarLoginFallido(credKey);
      return { ok: true, colaborador: _empPublic(e) };
    }
  }
  _registrarLoginFallido(credKey);
  return { ok: false, mensaje: "Credenciales incorrectas o colaborador inactivo" };
}
function buscarColaboradorPorAuth(auth) {
  if (!auth) return null;
  const sh = getEmpSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return null;
  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    const e = toObj(headers, data[i]);
    if (!_esActivo(e.estatus)) continue;
    if (auth.pin && _coincideCredencial(auth.pin, e.pin)) return e;
    if (auth.usuario && auth.contrasena && String(e.usuario) === String(auth.usuario) && _coincideCredencial(auth.contrasena, e.contrasena)) return e;
  }
  return null;
}
function verificarAdminColaborador(auth) {
  const e = buscarColaboradorPorAuth(auth);
  return !!(e && _esPuestoAdmin(e.puesto));
}

// ============================================================
//  COLABORADORES
// ============================================================
function guardarColaborador(datos, quienGuardaEsAdmin) {
  if (!quienGuardaEsAdmin && _esPuestoAdmin(datos.puesto)) {
    return { ok: false, mensaje: "No autorizado: solo un Administrador puede asignar ese puesto." };
  }
  if (datos.pin && !_esCredencialHasheada(datos.pin)) datos.pin = _hashCredencial(datos.pin);
  if (datos.contrasena && !_esCredencialHasheada(datos.contrasena)) datos.contrasena = _hashCredencial(datos.contrasena);
  const sh = getEmpSh();
  const headers = headersReales(sh);
  const idx = findRow(sh, "idColaborador", datos.idColaborador);
  if (idx > 0) {
    const existente = toObj(headers, sh.getRange(idx, 1, 1, headers.length).getValues()[0]);
    const fusionado = Object.assign({}, existente, datos, { fechaRegistro: existente.fechaRegistro || new Date().toISOString() });
    sh.getRange(idx, 1, 1, headers.length).setValues([toRow(headers, fusionado)]);
    return { ok: true, mensaje: "Colaborador actualizado" };
  }
  datos.estatus = datos.estatus || "ACTIVO";
  datos.fechaRegistro = new Date().toISOString();
  sh.appendRow(toRow(headers, datos));
  return { ok: true, mensaje: "Colaborador registrado" };
}
function obtenerColaboradores() {
  const sh = getEmpSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, datos: [] };
  const headers = data[0];
  const porId = {};
  let sinId = 0;
  data.slice(1).forEach(r => {
    const o = toObj(headers, r);
    const clave = o.idColaborador ? String(o.idColaborador) : "__sin_id_" + sinId++;
    porId[clave] = o;
  });
  return { ok: true, datos: Object.values(porId) };
}

// ============================================================
//  FOLIOS (expediente mínimo: a quién se le está certificando)
// ============================================================
function guardarFolio(datos) {
  if (!datos || !datos.folio) return { ok: false, mensaje: "Folio sin folio: no se guardó." };
  const sh = getFolSh();
  const headers = headersReales(sh);
  const idx = findRow(sh, "folio", datos.folio);
  datos.fechaActualizacion = new Date().toISOString();
  if (idx > 0) {
    sh.getRange(idx, 1, 1, headers.length).setValues([toRow(headers, datos)]);
    return { ok: true, folio: datos.folio, mensaje: "Folio actualizado" };
  }
  datos.fechaCreacion = datos.fechaCreacion || new Date().toISOString();
  sh.appendRow(toRow(headers, datos));
  return { ok: true, folio: datos.folio, mensaje: "Folio guardado" };
}
function obtenerFolios(filtros) {
  const sh = getFolSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, datos: [] };
  const headers = data[0];
  let filas = data.slice(1).map(r => toObj(headers, r));
  filtros = filtros || {};
  if (filtros.folio) filas = filas.filter(r => r.folio === filtros.folio);
  return { ok: true, datos: filas, total: filas.length };
}

// ============================================================
//  CERTIFICACIÓN (datos para el médico + Registro Civil) — una fila por folio
// ============================================================
function guardarCertificacion(datos) {
  const sh = getCertSh();
  const headers = headersReales(sh);
  const idx = findRow(sh, "folio", datos.folio);
  datos.fechaActualizacion = new Date().toISOString();
  if (idx > 0) {
    sh.getRange(idx, 1, 1, headers.length).setValues([toRow(headers, datos)]);
    return { ok: true, folio: datos.folio, mensaje: "Certificación actualizada" };
  }
  datos.fechaCreacion = datos.fechaCreacion || new Date().toISOString();
  sh.appendRow(toRow(headers, datos));
  return { ok: true, folio: datos.folio, mensaje: "Certificación guardada" };
}
function obtenerCertificaciones(filtros) {
  const sh = getCertSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, datos: [] };
  const headers = data[0];
  let filas = data.slice(1).map(r => toObj(headers, r));
  filtros = filtros || {};
  if (filtros.folio) filas = filas.filter(r => r.folio === filtros.folio);
  return { ok: true, datos: filas, total: filas.length };
}

// ============================================================
//  SOLICITUD REGISTRO CIVIL — una fila por folio
// ============================================================
function guardarSolicitudRC(datos) {
  const sh = getRcSh();
  const headers = headersReales(sh);
  const idx = findRow(sh, "folio", datos.folio);
  datos.fechaActualizacion = new Date().toISOString();
  if (idx > 0) {
    sh.getRange(idx, 1, 1, headers.length).setValues([toRow(headers, datos)]);
    return { ok: true, folio: datos.folio, mensaje: "Solicitud de Registro Civil actualizada" };
  }
  datos.fechaCreacion = datos.fechaCreacion || new Date().toISOString();
  sh.appendRow(toRow(headers, datos));
  return { ok: true, folio: datos.folio, mensaje: "Solicitud de Registro Civil guardada" };
}
function obtenerSolicitudesRC(filtros) {
  const sh = getRcSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, datos: [] };
  const headers = data[0];
  let filas = data.slice(1).map(r => toObj(headers, r));
  filtros = filtros || {};
  if (filtros.folio) filas = filas.filter(r => r.folio === filtros.folio);
  return { ok: true, datos: filas, total: filas.length };
}

// ============================================================
//  SINCRONIZACIÓN GENERAL (offline-first: cada dispositivo sube lo que
//  tenga y se lleva de vuelta la versión más reciente de todo)
// ============================================================
function _procesarLista(lista, fn, etiqueta, errores) {
  (lista || []).forEach(item => {
    try { fn(item); }
    catch (err) { errores.push(etiqueta + " (folio " + (item && item.folio) + "): " + err.message); }
  });
}
function sincronizarTodo(payload) {
  const folios = payload.folios || [];
  const certificaciones = payload.certificaciones || [];
  const solicitudesRC = payload.solicitudesRC || [];
  const colaboradores = payload.colaboradores || [];
  const errores = [];

  _procesarLista(folios, guardarFolio, "Folio", errores);
  _procesarLista(certificaciones, guardarCertificacion, "Certificación", errores);
  _procesarLista(solicitudesRC, guardarSolicitudRC, "Solicitud RC", errores);
  // Los colaboradores nunca se fusionan a ciegas: si el dispositivo local no
  // es Administrador, guardarColaborador ya rechaza asignar el puesto ADMIN.
  const esAdminQuienSync = buscarColaboradorPorAuth(payload.auth) && _esPuestoAdmin(buscarColaboradorPorAuth(payload.auth).puesto);
  _procesarLista(colaboradores, emp => guardarColaborador(emp, esAdminQuienSync), "Colaborador", errores);

  return {
    ok: true,
    mensaje: errores.length ? "Sync con errores parciales" : ("Sync OK: " + folios.length + " folios, " + certificaciones.length + " certificaciones"),
    erroresSync: errores,
    folios: obtenerFolios({}).datos,
    certificaciones: obtenerCertificaciones({}).datos,
    solicitudesRC: obtenerSolicitudesRC({}).datos,
    colaboradores: obtenerColaboradores().datos
  };
}

// ============================================================
//  MAPEO DEL FORMATO DE REGISTRO CIVIL (calibración compartida entre
//  dispositivos de dónde va cada dato sobre la imagen del formato oficial)
// ============================================================
const PROP_MAPEO_RC = "MAPEO_RC";
function guardarMapeoRC(mapeo) {
  const raw = PropertiesService.getScriptProperties().getProperty(PROP_MAPEO_RC);
  const actual = raw ? JSON.parse(raw) : {};
  const fusionado = Object.assign(actual, mapeo || {});
  PropertiesService.getScriptProperties().setProperty(PROP_MAPEO_RC, JSON.stringify(fusionado));
  return { ok: true, mensaje: "Mapeo guardado", mapeo: fusionado };
}
function obtenerMapeoRC() {
  const raw = PropertiesService.getScriptProperties().getProperty(PROP_MAPEO_RC);
  return { ok: true, mapeo: raw ? JSON.parse(raw) : {} };
}
function reiniciarMapeoRC() {
  PropertiesService.getScriptProperties().setProperty(PROP_MAPEO_RC, JSON.stringify({}));
  return { ok: true, mensaje: "Mapeo reiniciado" };
}

// ============================================================
//  DATOS DE LA FUNERARIA (nombre/ciudad/teléfono que usa esta instalación
//  de Funeral360 — cada cliente captura los suyos, nunca vienen fijos en
//  el código: este producto es genérico, no pertenece a ninguna funeraria
//  en particular)
// ============================================================
const PROP_CONFIG_FUNERARIA = "CONFIG_FUNERARIA";
function guardarConfigFuneraria(datos) {
  PropertiesService.getScriptProperties().setProperty(PROP_CONFIG_FUNERARIA, JSON.stringify(datos || {}));
  return { ok: true, mensaje: "Datos de la funeraria guardados" };
}
function obtenerConfigFuneraria() {
  const raw = PropertiesService.getScriptProperties().getProperty(PROP_CONFIG_FUNERARIA);
  return { ok: true, datos: raw ? JSON.parse(raw) : {} };
}

// ============================================================
//  DOCUMENTOS (respaldos digitalizados en Drive: INE, actas, certificados)
//  Nunca se hacen públicos: siempre se leen a través de este script,
//  autenticado con la misma credencial de colaborador que usa el resto.
// ============================================================
const PROP_DOCS_ROOT_FOLDER_ID = "DOCS_ROOT_FOLDER_ID";
function _carpetaDocumentosRaiz() {
  const props = PropertiesService.getScriptProperties();
  const idGuardado = props.getProperty(PROP_DOCS_ROOT_FOLDER_ID);
  if (idGuardado) {
    try { return DriveApp.getFolderById(idGuardado); } catch (e) { /* ya no existe, se crea otra abajo */ }
  }
  const carpeta = DriveApp.createFolder("Documentos Funeral360");
  props.setProperty(PROP_DOCS_ROOT_FOLDER_ID, carpeta.getId());
  return carpeta;
}
function _subCarpeta(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  if (it.hasNext()) return it.next();
  return padre.createFolder(nombre);
}
function _carpetaFolio(folio) {
  const raiz = _carpetaDocumentosRaiz();
  const nombreFolio = String(folio || "SIN_FOLIO").replace(/[\/\\:*?"<>|]/g, "_");
  return _subCarpeta(raiz, nombreFolio);
}
function subirDocumento(payload) {
  const folio = payload && payload.folio;
  const tipoDocumento = payload && payload.tipoDocumento;
  const base64 = payload && payload.base64;
  if (!folio || !tipoDocumento || !base64) return { ok: false, error: "Faltan datos (folio, tipoDocumento o archivo)." };
  const base64Limpio = String(base64).split(",").pop();
  let bytes;
  try { bytes = Utilities.base64Decode(base64Limpio); }
  catch (e) { return { ok: false, error: "El archivo recibido no es válido." }; }
  const mimeType = payload.mimeType || "image/jpeg";
  const carpeta = _carpetaFolio(folio);
  const nombreArchivo = (payload.nombreArchivo || tipoDocumento) + "_" + Date.now();
  const blob = Utilities.newBlob(bytes, mimeType, nombreArchivo);
  const file = carpeta.createFile(blob);
  const sh = getDocSh();
  const headers = headersReales(sh);
  const id = Utilities.getUuid();
  sh.appendRow(toRow(headers, {
    id, folio: String(folio), tipoDocumento,
    nombreFinado: payload.nombreFinado || "", nombreContratante: payload.nombreContratante || "",
    driveFileId: file.getId(), mimeType, nombreArchivo,
    tamanoBytes: bytes.length, fechaSubida: new Date().toISOString(), subidoPor: payload.subidoPor || ""
  }));
  return { ok: true, id, driveFileId: file.getId() };
}
function obtenerDocumentos(filtros) {
  filtros = filtros || {};
  const sh = getDocSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, documentos: [] };
  const headers = data[0];
  let filas = data.slice(1).map(r => toObj(headers, r));
  if (filtros.folio) filas = filas.filter(r => String(r.folio) === String(filtros.folio));
  if (filtros.nombre) {
    const buscado = String(filtros.nombre).trim().toLowerCase();
    filas = filas.filter(r =>
      String(r.nombreFinado || "").toLowerCase().indexOf(buscado) !== -1 ||
      String(r.nombreContratante || "").toLowerCase().indexOf(buscado) !== -1
    );
  }
  filas.sort((a, b) => new Date(b.fechaSubida) - new Date(a.fechaSubida));
  return { ok: true, documentos: filas, total: filas.length };
}
function obtenerDocumentoArchivo(payload) {
  const sh = getDocSh();
  const idx = findRow(sh, "id", payload && payload.id);
  if (idx < 0) return { ok: false, error: "Documento no encontrado." };
  const headers = headersReales(sh);
  const fila = toObj(headers, sh.getRange(idx, 1, 1, headers.length).getValues()[0]);
  let file;
  try { file = DriveApp.getFileById(fila.driveFileId); }
  catch (e) { return { ok: false, error: "El archivo ya no existe en Drive." }; }
  const blob = file.getBlob();
  return { ok: true, mimeType: fila.mimeType, nombreArchivo: fila.nombreArchivo, base64: Utilities.base64Encode(blob.getBytes()) };
}
function eliminarDocumento(payload) {
  const sh = getDocSh();
  const idx = findRow(sh, "id", payload && payload.id);
  if (idx < 0) return { ok: false, error: "Documento no encontrado." };
  const headers = headersReales(sh);
  const fila = toObj(headers, sh.getRange(idx, 1, 1, headers.length).getValues()[0]);
  try { DriveApp.getFileById(fila.driveFileId).setTrashed(true); } catch (e) { /* si ya no existe en Drive, igual se limpia el índice */ }
  sh.deleteRow(idx);
  return { ok: true };
}

// ============================================================
//  EXTRACCIÓN AUTOMÁTICA DE DATOS (IA) — Gemini API
//  Lee una foto de INE / acta de nacimiento / certificado de defunción y
//  regresa los datos ya estructurados en JSON, para precargar la Pestaña 2
//  (Solicitud Registro Civil). Siempre es un apoyo para capturar más
//  rápido, nunca un dato definitivo — el usuario debe revisar/corregir
//  antes de guardar. Requiere la propiedad de script GEMINI_API_KEY.
// ============================================================
const _INE_PROMPT =
  "Esta imagen es una identificación oficial (INE/IFE) mexicana. Lee únicamente " +
  "el texto que aparece impreso en la credencial. La credencial imprime primero " +
  "los apellidos y después el/los nombre(s) — NO los devuelvas concatenados ni en " +
  "ese orden de impresión: sepáralos en tres campos distintos: nombres, " +
  "apellidoPaterno y apellidoMaterno. Además responde con: curp tal como esté " +
  "impresa; sexo como una sola letra 'H' o 'M', exactamente como aparece impresa " +
  "junto a la palabra SEXO; fechaNacimiento en formato AAAA-MM-DD si es legible; y " +
  "el domicilio separado en calle, número, colonia, localidad, municipio y entidad " +
  "federativa, tal como esté impreso (si el domicilio viene en una sola línea, " +
  "sepáralo de la forma más razonable). La entidad federativa siempre escríbela " +
  "completa, nunca abreviada — si en la credencial aparece abreviada (ej. 'VER', " +
  "'Ver.', 'Gro.'), escribe el nombre completo del estado (ej. 'Veracruz', " +
  "'Guerrero'). Si un dato no aparece o no es legible, regresa una cadena vacía " +
  "para ese campo — nunca inventes ni completes información que no esté impresa.";
const _INE_SCHEMA = {
  type: "OBJECT",
  properties: {
    nombres: { type: "STRING" }, apellidoPaterno: { type: "STRING" }, apellidoMaterno: { type: "STRING" },
    curp: { type: "STRING" }, sexo: { type: "STRING" }, fechaNacimiento: { type: "STRING" },
    domicilioCalle: { type: "STRING" }, domicilioNumero: { type: "STRING" }, domicilioColonia: { type: "STRING" },
    domicilioLocalidad: { type: "STRING" }, domicilioMunicipio: { type: "STRING" }, domicilioEntidad: { type: "STRING" }
  }
};
const _ACTA_NACIMIENTO_PROMPT =
  "Esta imagen es un acta de nacimiento mexicana. Lee únicamente el texto impreso " +
  "o manuscrito del acta. Responde con: nombre(s), apellido paterno y apellido " +
  "materno de la persona registrada; su fecha de nacimiento en formato AAAA-MM-DD; " +
  "su lugar de nacimiento separado en localidad, municipio, entidad federativa y " +
  "país (si el acta no menciona localidad o municipio por separado, deja esos dos " +
  "campos vacíos — no adivines; la entidad federativa siempre escríbela completa, " +
  "nunca abreviada, ej. 'Veracruz' y no 'VER' o 'Ver.'); y el nombre completo del " +
  "padre y de la madre tal como aparecen en el acta (si el acta solo registra a uno " +
  "de los dos, deja el otro campo vacío; si no registra a ninguno, deja ambos " +
  "vacíos). No captures aquí si los padres viven o no — eso no aparece en el acta. " +
  "Si un dato no aparece o no es legible, regresa una cadena vacía — nunca inventes información.";
const _ACTA_NACIMIENTO_SCHEMA = {
  type: "OBJECT",
  properties: {
    nombres: { type: "STRING" }, apellidoPaterno: { type: "STRING" }, apellidoMaterno: { type: "STRING" },
    fechaNacimiento: { type: "STRING" }, lugarNacimientoLocalidad: { type: "STRING" },
    lugarNacimientoMunicipio: { type: "STRING" }, lugarNacimientoEntidad: { type: "STRING" }, lugarNacimientoPais: { type: "STRING" },
    nombrePadre: { type: "STRING" }, nombreMadre: { type: "STRING" }
  }
};
const _CERTIFICADO_DEFUNCION_PROMPT =
  "Esta imagen es un certificado de defunción mexicano. Lee únicamente el texto " +
  "impreso o manuscrito del certificado — revisa TODA la imagen con cuidado, " +
  "incluyendo folios, sellos y recuadros pequeños, antes de dar un campo por " +
  "vacío. Responde con: fecha de defunción en formato AAAA-MM-DD; hora de " +
  "defunción en formato de 24 horas HH:mm; el lugar de la defunción tal como " +
  "esté descrito (texto libre, ej. hospital, domicilio); el número/folio del " +
  "certificado (puede estar rotulado como 'No.', 'Folio' o similar) — casi " +
  "siempre está impreso en la esquina superior derecha del documento, como un " +
  "número o código corto, a veces junto a un sello: revisa esa zona con " +
  "cuidado antes de dar este campo por vacío; y el domicilio " +
  "habitual del finado que aparezca en el certificado, separado en calle, " +
  "número, colonia, localidad, municipio y entidad federativa (esta última " +
  "siempre completa, nunca abreviada, ej. 'Veracruz' y no 'VER' o 'Ver.'). Si " +
  "un dato realmente no aparece o no es legible, regresa una cadena vacía — nunca inventes información.";
const _CERTIFICADO_DEFUNCION_SCHEMA = {
  type: "OBJECT",
  properties: {
    fechaDefuncion: { type: "STRING" }, horaDefuncion: { type: "STRING" }, lugarDefuncionTexto: { type: "STRING" },
    numeroCertificado: { type: "STRING" }, domicilioCalle: { type: "STRING" }, domicilioNumero: { type: "STRING" },
    domicilioColonia: { type: "STRING" }, domicilioLocalidad: { type: "STRING" }, domicilioMunicipio: { type: "STRING" }, domicilioEntidad: { type: "STRING" }
  }
};
const _ESQUEMA_EXTRACCION = {
  INE_FINADO: { prompt: _INE_PROMPT, schema: _INE_SCHEMA },
  INE_CONTRATANTE: { prompt: _INE_PROMPT, schema: _INE_SCHEMA },
  INE_DECLARANTE: { prompt: _INE_PROMPT, schema: _INE_SCHEMA },
  INE_TESTIGO1: { prompt: _INE_PROMPT, schema: _INE_SCHEMA },
  INE_TESTIGO2: { prompt: _INE_PROMPT, schema: _INE_SCHEMA },
  ACTA_NACIMIENTO_FINADO: { prompt: _ACTA_NACIMIENTO_PROMPT, schema: _ACTA_NACIMIENTO_SCHEMA },
  CERTIFICADO_DEFUNCION: { prompt: _CERTIFICADO_DEFUNCION_PROMPT, schema: _CERTIFICADO_DEFUNCION_SCHEMA }
};
function extraerDatosDocumento(payload) {
  const tipoDocumento = payload && payload.tipoDocumento;
  const cfg = _ESQUEMA_EXTRACCION[tipoDocumento];
  if (!cfg) return { ok: false, error: "Este tipo de documento no tiene lectura automática." };
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) return { ok: false, error: "Falta configurar GEMINI_API_KEY en las Propiedades del script." };
  const base64Limpio = String(payload.base64 || "").split(",").pop();
  if (!base64Limpio) return { ok: false, error: "Falta la imagen a analizar." };
  const modelo = PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL") || "gemini-2.5-flash";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent";
  const cuerpo = {
    contents: [{ parts: [{ text: cfg.prompt }, { inline_data: { mime_type: payload.mimeType || "image/jpeg", data: base64Limpio } }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: cfg.schema }
  };
  let resp;
  try {
    resp = UrlFetchApp.fetch(url, {
      method: "post", contentType: "application/json",
      headers: { "x-goog-api-key": apiKey },
      payload: JSON.stringify(cuerpo), muteHttpExceptions: true
    });
  } catch (err) {
    return { ok: false, error: "No se pudo contactar al servicio de IA: " + err.message };
  }
  let json;
  try { json = JSON.parse(resp.getContentText()); }
  catch (e) { return { ok: false, error: "Respuesta inválida del servicio de IA." }; }
  if (resp.getResponseCode() !== 200) {
    return { ok: false, error: (json.error && json.error.message) || ("Error del servicio de IA (" + resp.getResponseCode() + ").") };
  }
  try {
    const texto = json.candidates[0].content.parts[0].text;
    return { ok: true, datos: JSON.parse(texto) };
  } catch (e) {
    return { ok: false, error: "No se pudo interpretar la respuesta de IA." };
  }
}

// ============================================================
//  PUNTO DE ENTRADA
// ============================================================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const accion = payload.accion || "";
    let result;

    // Candado general (deny-by-default): toda acción exige una credencial
    // real de un colaborador activo, salvo las 2 que por diseño deben poder
    // llamarse antes de haber iniciado sesión.
    const ACCIONES_PUBLICAS = ["ping", "validarAcceso"];
    if (ACCIONES_PUBLICAS.indexOf(accion) === -1) {
      if (!buscarColaboradorPorAuth(payload.auth)) {
        return jsonOut({ ok: false, mensaje: "No autorizado. Vuelve a iniciar sesión." });
      }
    }

    switch (accion) {
      case "ping": result = { ok: true, mensaje: "Servidor Funeral360 activo ✓" }; break;
      case "validarAcceso": result = validarAcceso(payload); break;
      case "obtenerColaboradores": result = obtenerColaboradores(); break;
      case "guardarColaborador": result = guardarColaborador(payload.datos, verificarAdminColaborador(payload.auth)); break;
      case "sincronizarTodo": result = sincronizarTodo(payload); break;
      case "guardarFolio": result = guardarFolio(payload.datos); break;
      case "obtenerFolios": result = obtenerFolios(payload.filtros || {}); break;
      case "guardarCertificacion": result = guardarCertificacion(payload.datos); break;
      case "obtenerCertificaciones": result = obtenerCertificaciones(payload.filtros || {}); break;
      case "guardarSolicitudRC": result = guardarSolicitudRC(payload.datos); break;
      case "obtenerSolicitudesRC": result = obtenerSolicitudesRC(payload.filtros || {}); break;
      case "guardarMapeoRC": result = guardarMapeoRC(payload.mapeo || {}); break;
      case "obtenerMapeoRC": result = obtenerMapeoRC(); break;
      case "reiniciarMapeoRC": result = reiniciarMapeoRC(); break;
      case "guardarConfigFuneraria": result = guardarConfigFuneraria(payload.datos || {}); break;
      case "obtenerConfigFuneraria": result = obtenerConfigFuneraria(); break;
      case "subirDocumento": result = subirDocumento(payload); break;
      case "obtenerDocumentos": result = obtenerDocumentos(payload.filtros || {}); break;
      case "obtenerDocumentoArchivo": result = obtenerDocumentoArchivo(payload); break;
      case "eliminarDocumento": result = verificarAdminColaborador(payload.auth) ? eliminarDocumento(payload) : { ok: false, error: "No autorizado (solo administradores)." }; break;
      case "extraerDatosDocumento": result = extraerDatosDocumento(payload); break;
      default: result = { ok: false, mensaje: "Acción desconocida: " + accion };
    }
    return jsonOut(result);
  } catch (err) {
    const detalle = (err && err.message) ? err.message : String(err || "Excepción desconocida");
    const tipo = (err && err.name) ? err.name + ": " : "";
    const stackResumen = (err && err.stack) ? " — " + String(err.stack).split("\n").slice(0, 2).join(" | ") : "";
    return jsonOut({ ok: false, error: tipo + detalle + stackResumen });
  }
}
function doGet(e) {
  const accion = (e.parameter && e.parameter.accion) || "ping";
  const result = accion === "ping" ? { ok: true, mensaje: "Servidor Funeral360 activo ✓" } : { ok: false, mensaje: "Usa POST para todo lo que no sea ping." };
  return jsonOut(result);
}

// ============================================================
//  MENÚ Y BOOTSTRAPPING (correr una vez al desplegar en una Hoja nueva)
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Funeral360")
    .addItem("Inicializar / reparar todas las hojas", "inicializarTodasLasHojas")
    .addToUi();
}
function inicializarTodasLasHojas() {
  getEmpSh(); getFolSh(); getCertSh(); getRcSh(); getDocSh();
  const empSh = getEmpSh();
  if (empSh.getLastRow() <= 1) {
    guardarColaborador({
      idColaborador: "admin", nombreCompleto: "Administrador", puesto: "ADMIN",
      telefono: "", usuario: "", contrasena: "", pin: "1234", estatus: "ACTIVO"
    }, true);
    try {
      SpreadsheetApp.getUi().alert(
        "Hojas creadas. Se dio de alta un Administrador temporal — ID: admin · PIN: 1234. " +
        "Inicia sesión con ese PIN y CÁMBIALO de inmediato desde Colaboradores."
      );
    } catch (e) { /* corriendo desde el editor, sin UI de hoja — no pasa nada */ }
  }
}
