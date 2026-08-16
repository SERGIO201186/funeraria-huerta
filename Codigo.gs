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
const SH_CERT  = "Certificaciones"; // ← datos para certificado médico / Registro Civil
const SH_ELIM  = "ODSEliminadas";  // ← folios borrados (evita que resuciten con una sync vieja)
const SH_RC    = "SolicitudRegistroCivil"; // ← formato oficial de Registro Civil (frente + reverso)

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
  // fechaCeremonia/horaCeremonia + salidaTraslado/horaMisa: campos únicos de
  // logística de sepelio/cremación, compartidos entre las 2 modalidades desde
  // v2.3 (antes había un juego duplicado por modalidad — fechaSepelio/
  // fechaCremacion, horaSepelio/horaCremacion, etc. — que se deja aquí solo
  // para no perder los datos ya guardados en órdenes viejas).
  "lugSepelio","crematorio","fechaCeremonia","salidaTraslado","horaMisa","horaCeremonia",
  "fechaSepelio","horaSepelio","fechaCremacion","salidaCremacion","horaMisaCrem","horaCremacion",
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

// — CABECERAS CERTIFICACIÓN (datos para el médico + Registro Civil) -----
// Una fila por folio (upsert, igual que Previsiones). "EstadoX" en cónyuge/
// padre/madre guarda "VIVO" o "FINADO"; los datos de nacimiento solo
// aplican si está "VIVO". El parentesco de declarante/testigos solo admite
// vínculo consanguíneo — cualquier otro (amistad, padrino, compadre,
// novio, etc.) se captura como "NINGUNO".
const CERT_COLS = [
  "folio",
  "finadoNombre","finadoEstadoCivil","finadoFechaNacimiento","finadoEntidadNacimiento",
  "finadoGradoEstudios","finadoDomicilio","finadoAfiliacionSalud","finadoOcupacion",
  "finadoLugarDefuncion","finadoFechaDefuncion","finadoHoraDefuncion",
  "finadoEraCasado",
  "conyugeNombre","conyugeEstado","conyugeFechaNacimiento",
  "conyugeLocalidadNac","conyugeMunicipioNac","conyugeEstadoNac","conyugePaisNac",
  "padreNombre","padreEstado","padreFechaNacimiento",
  "padreLocalidadNac","padreMunicipioNac","padreEstadoNac","padrePaisNac",
  "madreNombre","madreEstado","madreFechaNacimiento",
  "madreLocalidadNac","madreMunicipioNac","madreEstadoNac","madrePaisNac",
  "declaranteNombre","declaranteParentesco","declaranteEstadoCivil",
  "declaranteLocalidadNac","declaranteMunicipioNac","declaranteEstadoNac","declarantePaisNac","declaranteTelefono",
  "testigo1Nombre","testigo1Parentesco","testigo1EstadoCivil",
  "testigo1LocalidadNac","testigo1MunicipioNac","testigo1EstadoNac","testigo1PaisNac","testigo1Telefono",
  "testigo2Nombre","testigo2Parentesco","testigo2EstadoCivil",
  "testigo2LocalidadNac","testigo2MunicipioNac","testigo2EstadoNac","testigo2PaisNac","testigo2Telefono",
  "creadoPor","fechaCreacion","fechaActualizacion"
];

// — CABECERAS SOLICITUD REGISTRO CIVIL (formato oficial, tamaño oficio) -
// Una fila por folio (upsert). Sigue el formato de Registro Civil de
// Xalapa (frente + reverso); los formatos de Tlalnehuayocan, Banderilla y
// Emiliano Zapata son parecidos y se integran después por separado.
// "Estado" en cónyuge/padre/madre guarda "VIVE" o "FINADO" — si es finado
// no se piden más datos. "rcDestinoX" son 3 casillas independientes:
// Inhumación es excluyente; Cremación y Traslado se pueden marcar juntas.
const RC_COLS = [
  "folio",
  // Grupo 1 — Datos del finado
  "rcFinadoCurp","rcFinadoNombres","rcFinadoApellidoPaterno","rcFinadoApellidoMaterno",
  "rcFinadoFechaNacimiento","rcFinadoEdad","rcFinadoNacionalidad","rcFinadoSexo",
  "rcFinadoLocalidadNac","rcFinadoMunicipioNac","rcFinadoEntidadNac","rcFinadoPaisNac",
  "rcFinadoDomCalle","rcFinadoDomNumero","rcFinadoDomColonia","rcFinadoDomLocalidad",
  "rcFinadoDomMunicipio","rcFinadoDomEntidad","rcFinadoDomPais","rcFinadoEstadoCivil",
  // Grupo 2 — Cónyuge / Padre / Madre
  "rcConyugeNombre","rcConyugeEstado","rcConyugeNacionalidad","rcConyugeFechaNacimiento","rcConyugeSexo",
  "rcConyugeLocalidadNac","rcConyugeMunicipioNac","rcConyugeEntidadNac","rcConyugePaisNac",
  "rcPadreNombre","rcPadreEstado","rcPadreNacionalidad","rcPadreFechaNacimiento","rcPadreSexo",
  "rcPadreLocalidadNac","rcPadreMunicipioNac","rcPadreEntidadNac","rcPadrePaisNac",
  "rcMadreNombre","rcMadreEstado","rcMadreNacionalidad","rcMadreFechaNacimiento","rcMadreSexo",
  "rcMadreLocalidadNac","rcMadreMunicipioNac","rcMadreEntidadNac","rcMadrePaisNac",
  // Grupo 3 — Datos del fallecimiento
  "rcFechaDefuncion","rcHoraDefuncion","rcLugarFallecimiento","rcFallecLugarDetalle","rcNumeroCertificado",
  "rcDestinoInhumacion","rcDestinoCremacion","rcDestinoTraslado","rcTrasladoDestino",
  "rcNombrePanteon","rcPanteonUbicacion","rcFechaInhumacion","rcHoraInhumacion",
  // Grupo 4 — Datos del declarante
  "rcDeclaranteNombre","rcDeclaranteParentesco","rcDeclaranteNacionalidad","rcDeclaranteEstadoCivil",
  "rcDeclaranteLocalidadNac","rcDeclaranteMunicipioNac","rcDeclaranteEntidadNac","rcDeclarantePaisNac",
  "rcDeclaranteDomCalle","rcDeclaranteDomNumero","rcDeclaranteDomColonia","rcDeclaranteDomLocalidad",
  "rcDeclaranteDomMunicipio","rcDeclaranteDomEntidad","rcDeclaranteDomPais",
  "rcDeclaranteFechaNacimiento","rcDeclaranteEdad","rcDeclaranteTelefono",
  // Grupo 5 — Testigo 1 y Testigo 2
  "rcTestigo1Curp","rcTestigo1Nombre","rcTestigo1Telefono","rcTestigo1FechaNacimiento","rcTestigo1Edad",
  "rcTestigo1Sexo","rcTestigo1LocalidadNac","rcTestigo1MunicipioNac","rcTestigo1EntidadNac","rcTestigo1PaisNac",
  "rcTestigo1EstadoCivil","rcTestigo1Parentesco","rcTestigo1Nacionalidad",
  "rcTestigo1DomCalle","rcTestigo1DomNumero","rcTestigo1DomColonia","rcTestigo1DomLocalidad",
  "rcTestigo1DomMunicipio","rcTestigo1DomEntidad","rcTestigo1DomPais",
  "rcTestigo2Curp","rcTestigo2Nombre","rcTestigo2Telefono","rcTestigo2FechaNacimiento","rcTestigo2Edad",
  "rcTestigo2Sexo","rcTestigo2LocalidadNac","rcTestigo2MunicipioNac","rcTestigo2EntidadNac","rcTestigo2PaisNac",
  "rcTestigo2EstadoCivil","rcTestigo2Parentesco","rcTestigo2Nacionalidad",
  "rcTestigo2DomCalle","rcTestigo2DomNumero","rcTestigo2DomColonia","rcTestigo2DomLocalidad",
  "rcTestigo2DomMunicipio","rcTestigo2DomEntidad","rcTestigo2DomPais",
  // Grupo 6 — Datos de la funeraria
  "rcFunerariaNombre","rcFunerariaCiudad","rcFunerariaTelefono","rcFunerarioAsiste",
  // Reverso — Datos complementarios (opción múltiple)
  "rcAtencionMedica","rcSituacionLaboral","rcSituacionLaboralOtro",
  "rcEscolaridad","rcEscolaridadUltimoGrado","rcPosicionTrabajo",
  "creadoPor","fechaCreacion","fechaActualizacion"
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
      // Certificación (datos para el médico + Registro Civil)
      case "guardarCertificacion":   result = guardarCertificacion(payload.datos);   break;
      case "obtenerCertificaciones": result = obtenerCertificaciones(payload.filtros||{}); break;
      // Solicitud Registro Civil (formato oficial, frente + reverso)
      case "guardarSolicitudRC":     result = guardarSolicitudRC(payload.datos);     break;
      case "obtenerSolicitudesRC":   result = obtenerSolicitudesRC(payload.filtros||{}); break;
      // Alertas de pendientes por correo (equipos sin recoger, saldos, solicitudes, abonos)
      case "guardarAlertaConfig":result = guardarAlertaConfig(payload.datos||{}); break;
      case "obtenerAlertaConfig":result = obtenerAlertaConfig();            break;
      case "enviarAlertaPrueba": result = enviarAlertasPendientes(true);    break;
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
function getCertSh()  { return initSheet(SH_CERT,  CERT_COLS);  }
function getElimSh()  { return initSheet(SH_ELIM,  ["folio","fecha"]); }
function getRcSh()    { return initSheet(SH_RC,    RC_COLS);  }

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
// Cuando se escribe un valor tipo "HH:mm" (hora suelta, sin fecha) en una
// celda, Sheets lo detecta como hora y lo guarda con su fecha base interna
// (30-dic-1899). getValues() entonces devuelve un objeto Date con esa fecha
// falsa, y al mandarlo por JSON se vuelve "1899-12-30T18:21:00.000Z" en vez
// de "18:21" — eso es lo que se veía en la app como fecha/hora rota. Aquí se
// detecta ese patrón y se regresa solo la hora; cualquier otro Date (fechas
// reales) se deja igual, tal como antes.
function toObj(headers, row) {
  const o = {};
  headers.forEach((h,i) => {
    let v = row[i];
    if (v instanceof Date && v.getFullYear() === 1899 && v.getMonth() === 11 && v.getDate() === 30) {
      v = Utilities.formatDate(v, Session.getScriptTimeZone(), "HH:mm");
    }
    o[h] = v;
  });
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
    // El folio no existe en la hoja: puede ser una orden nueva, o una que ya
    // se eliminó y un dispositivo con caché local vieja (de antes del
    // borrado) la manda de nuevo al hacer una sincronización completa. Si ya
    // está en el registro de eliminados, NO se vuelve a crear.
    if (findRow(getElimSh(), "folio", datos.folio) > 0) {
      return { ok:true, folio:datos.folio, eliminado:true, mensaje:"Orden eliminada anteriormente; no se vuelve a crear" };
    }
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

  // Protección contra sincronizaciones "de vuelta": la app manda su copia
  // local COMPLETA cada vez que sincroniza, incluyendo órdenes que ese
  // dispositivo en realidad no tocó. Si el celular A edita una orden y el
  // celular B sincroniza después con su copia vieja de esa misma orden (sin
  // enterarse todavía del cambio de A), B terminaba sobreescribiendo el
  // cambio de A con datos viejos. Aquí se compara la fecha de actualización
  // que manda el cliente contra la que ya está guardada: si la que llega es
  // MÁS VIEJA que la que ya hay, se ignora el guardado (gana el cambio más
  // reciente, sin importar qué dispositivo sincronizó al final).
  const ciFecha = headers.indexOf("fechaActualizacion");
  if (ciFecha >= 0 && datos.fechaActualizacion) {
    const actual = sh.getRange(idx, ciFecha + 1).getValue();
    const actualTs = actual ? new Date(actual).getTime() : 0;
    const entranteTs = new Date(datos.fechaActualizacion).getTime();
    if (actualTs && entranteTs && entranteTs < actualTs) {
      return { ok:true, folio, omitido:true };
    }
  }

  datos.fechaActualizacion = new Date().toISOString();
  sh.getRange(idx, 1, 1, headers.length).setValues([toRow(headers, datos)]);
  logActividad("actualizarODS", datos.creadoPor||"", folio);
  return { ok:true, folio };
}

function eliminarODS(folio) {
  const sh = getODSSh();
  const idx = findRow(sh, "folio", folio);
  if (idx > 0) sh.deleteRow(idx);
  registrarEliminacionODS(folio);
  logActividad("eliminarODS", "", folio);
  return { ok:true };
}

// Deja constancia del borrado para que ninguna sincronización futura (de
// este dispositivo u otro con caché vieja) pueda volver a crear el folio.
function registrarEliminacionODS(folio) {
  const sh = getElimSh();
  const idx = findRow(sh, "folio", folio);
  const fecha = new Date().toISOString();
  if (idx > 0) { sh.getRange(idx, 2).setValue(fecha); return; }
  sh.appendRow([folio, fecha]);
}

function obtenerFoliosEliminados() {
  const sh = getElimSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => r[0]).filter(Boolean);
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
//  CERTIFICACIÓN (datos para el médico + Registro Civil)
//  Una fila por folio, upsert igual que Previsiones.
// ============================================================
function guardarCertificacion(datos) {
  const sh = getCertSh();
  const headers = headersReales(sh);
  const idx = findRow(sh, "folio", datos.folio);
  datos.fechaActualizacion = new Date().toISOString();
  if (idx > 0) {
    sh.getRange(idx, 1, 1, headers.length).setValues([toRow(headers, datos)]);
    return { ok:true, folio:datos.folio, mensaje:"Certificación actualizada" };
  }
  datos.fechaCreacion = datos.fechaCreacion || new Date().toISOString();
  sh.appendRow(toRow(headers, datos));
  return { ok:true, folio:datos.folio, mensaje:"Certificación guardada" };
}

function obtenerCertificaciones(filtros) {
  const sh = getCertSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok:true, datos:[] };
  const headers = data[0];
  let filas = data.slice(1).map(r => toObj(headers, r));
  filtros = filtros || {};
  if (filtros.folio) filas = filas.filter(r => r.folio === filtros.folio);
  return { ok:true, datos:filas, total:filas.length };
}

// ============================================================
//  SOLICITUD REGISTRO CIVIL (formato oficial, frente + reverso)
//  Una fila por folio, upsert igual que Certificaciones.
// ============================================================
function guardarSolicitudRC(datos) {
  const sh = getRcSh();
  const headers = headersReales(sh);
  const idx = findRow(sh, "folio", datos.folio);
  datos.fechaActualizacion = new Date().toISOString();
  if (idx > 0) {
    sh.getRange(idx, 1, 1, headers.length).setValues([toRow(headers, datos)]);
    return { ok:true, folio:datos.folio, mensaje:"Solicitud de Registro Civil actualizada" };
  }
  datos.fechaCreacion = datos.fechaCreacion || new Date().toISOString();
  sh.appendRow(toRow(headers, datos));
  return { ok:true, folio:datos.folio, mensaje:"Solicitud de Registro Civil guardada" };
}

function obtenerSolicitudesRC(filtros) {
  const sh = getRcSh();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok:true, datos:[] };
  const headers = data[0];
  let filas = data.slice(1).map(r => toObj(headers, r));
  filtros = filtros || {};
  if (filtros.folio) filas = filas.filter(r => r.folio === filtros.folio);
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
  const ods            = payload.ods    || [];
  const emps           = payload.colaboradores || [];
  const prevs          = payload.previsiones   || [];
  const abonos         = payload.abonos        || [];
  const solicitudes    = payload.solicitudes   || [];
  const certificaciones= payload.certificaciones || [];
  const solicitudesRC  = payload.solicitudesRC || [];

  ods.forEach(o             => guardarODS(o));
  emps.forEach(e            => guardarColaborador(e));
  prevs.forEach(p           => guardarPrevision(p));
  abonos.forEach(a          => guardarAbono(a));
  solicitudes.forEach(s     => guardarSolicitud(s));
  certificaciones.forEach(c => guardarCertificacion(c));
  solicitudesRC.forEach(s   => guardarSolicitudRC(s));

  return {
    ok:true,
    mensaje:`Sync OK: ${ods.length} ODS, ${emps.length} colaboradores, ${prevs.length} previsiones`,
    ods:            obtenerODS({}).datos,
    colaboradores: obtenerColaboradores().datos,
    // "Previsiones" es solo para la app hermana: esta app nunca manda datos
    // aquí. Si alguien borró esa pestaña a propósito, no hay que recrearla
    // sola con cada sincronización — por eso solo se lee si ya existe.
    previsiones:    _previsionesSiExiste(),
    abonos:         obtenerAbonos(null).datos,
    solicitudes:    obtenerSolicitudes({}).datos,
    certificaciones: obtenerCertificaciones({}).datos,
    solicitudesRC:  obtenerSolicitudesRC({}).datos,
    // Folios borrados: el cliente los usa para limpiar cualquier copia local
    // vieja que le haya quedado de antes del borrado (celular que no
    // sincronizaba desde hace tiempo, pestaña abierta desde antes, etc.).
    eliminados: obtenerFoliosEliminados()
  };
}

function _previsionesSiExiste() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SH_PREV)) return [];
  return obtenerPrevisiones({}).datos;
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

// ============================================================
//  ALERTAS DE PENDIENTES POR CORREO
//  Junta en un solo correo: equipos de velación sin recoger, órdenes con
//  saldo pendiente, solicitudes de edición sin autorizar y abonos sin
//  confirmar. Se puede mandar de inmediato (botón "Enviar prueba ahora" en
//  la app, o el menú de abajo) o dejar un disparador diario instalado.
// ============================================================
const PROP_ALERT_EMAIL  = "ALERT_EMAIL";
const ALERT_TRIGGER_FN  = "enviarAlertasPendientes";

function getAlertEmail() {
  return PropertiesService.getScriptProperties().getProperty(PROP_ALERT_EMAIL) || "";
}
function setAlertEmail(email) {
  PropertiesService.getScriptProperties().setProperty(PROP_ALERT_EMAIL, email);
}
function alertasActivas() {
  return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === ALERT_TRIGGER_FN);
}
function activarAlertasDiarias(hora) {
  desactivarAlertasDiarias();
  ScriptApp.newTrigger(ALERT_TRIGGER_FN).timeBased().everyDays(1).atHour(hora || 8).create();
}
function desactivarAlertasDiarias() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === ALERT_TRIGGER_FN) ScriptApp.deleteTrigger(t);
  });
}

// Llamado desde la app (página Nube). datos = { email, activo }
// activo=true activa el disparador diario, activo=false lo desactiva; si se
// omite, solo se guarda el correo sin tocar el disparador (para el botón
// "Enviar prueba ahora", que no debe activar/desactivar nada por su cuenta).
function guardarAlertaConfig(datos) {
  const email = String(datos.email || "").trim();
  if (!email) return { ok:false, mensaje:"Correo vacío" };
  setAlertEmail(email);
  if (datos.activo === true) activarAlertasDiarias(datos.hora);
  else if (datos.activo === false) desactivarAlertasDiarias();
  return { ok:true, mensaje:"Alertas configuradas", email:email, activo:alertasActivas() };
}
function obtenerAlertaConfig() {
  return { ok:true, email:getAlertEmail(), activo:alertasActivas() };
}

// Reúne todo lo pendiente en la ODS activas (no CERRADA), Solicitudes y Abonos.
function calcularPendientes() {
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  const dataOds = getODSSh().getDataRange().getValues();
  const headersOds = dataOds[0] || [];
  const ordenes = dataOds.length > 1
    ? dataOds.slice(1).map(r => toObj(headersOds, r)).filter(o => o.estatus !== "CERRADA")
    : [];

  const equipos = ordenes
    .filter(o => o.modalidadVelacion === "DOMICILIO" && o.estatusEquipo === "ACTIVO")
    .map(o => {
      let dias = null;
      if (o.fechaRecoleccion) {
        const r = new Date(o.fechaRecoleccion); r.setHours(0,0,0,0);
        dias = Math.ceil((r - hoy) / 86400000);
      }
      return { folio:o.folio, fallecido:o.fallecido, dias:dias };
    })
    .sort((a,b) => (a.dias===null?999:a.dias) - (b.dias===null?999:b.dias));

  const pagos = ordenes
    .filter(o => (+o.restante || 0) > 0)
    .map(o => ({ folio:o.folio, contratante:o.contratante, restante:+o.restante || 0 }))
    .sort((a,b) => b.restante - a.restante);

  const dataSol = getSolicSh().getDataRange().getValues();
  const headersSol = dataSol[0] || [];
  const solicitudes = dataSol.length > 1
    ? dataSol.slice(1).map(r => toObj(headersSol, r)).filter(s => s.estado === "pendiente")
    : [];

  const dataAb = getAbonoSh().getDataRange().getValues();
  const headersAb = dataAb[0] || [];
  const abonos = dataAb.length > 1
    ? dataAb.slice(1).map(r => toObj(headersAb, r)).filter(a => a.estado === "pendiente")
    : [];

  return { equipos:equipos, pagos:pagos, solicitudes:solicitudes, abonos:abonos };
}

// forzar=true manda el correo aunque no haya nada pendiente (para probar
// que la configuración de correo sí funciona).
function enviarAlertasPendientes(forzar) {
  const email = getAlertEmail();
  if (!email) return { ok:false, mensaje:"No hay correo configurado para alertas" };

  const p = calcularPendientes();
  const total = p.equipos.length + p.pagos.length + p.solicitudes.length + p.abonos.length;
  if (!total && !forzar) return { ok:true, mensaje:"Sin pendientes, no se envió correo", total:0 };

  const fmtMx = n => "$" + (+n || 0).toLocaleString("es-MX");
  const fila = (a,b,c) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${a}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${b}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${c}</td></tr>`;
  const tabla = (titulo, color, colB, colC, filas) => `
    <h3 style="color:${color};margin:18px 0 6px">${titulo}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#0f172a;color:#fff"><th style="padding:4px 8px;text-align:left">Folio</th><th style="padding:4px 8px;text-align:left">${colB}</th><th style="padding:4px 8px;text-align:right">${colC}</th></tr>
      ${filas}
    </table>`;

  let html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
    <h2 style="color:#0f172a;margin-bottom:2px">Funeraria Huerta — Pendientes</h2>
    <p style="color:#666;font-size:12px;margin-top:0">${new Date().toLocaleString("es-MX")}</p>`;

  if (p.equipos.length) {
    html += tabla(`📦 Equipos de velación sin recoger (${p.equipos.length})`, "#b45309", "—", "Recolección",
      p.equipos.map(e => fila(e.folio, e.fallecido || "—",
        e.dias===null ? "sin fecha" : e.dias<0 ? `vencido ${-e.dias}d` : e.dias===0 ? "hoy" : `en ${e.dias}d`)).join(""));
  }
  if (p.pagos.length) {
    const tot = p.pagos.reduce((s,x) => s + x.restante, 0);
    html += tabla(`💰 Órdenes con saldo pendiente (${p.pagos.length}, total ${fmtMx(tot)})`, "#b91c1c", "Contratante", "Restante",
      p.pagos.map(x => fila(x.folio, x.contratante || "—", fmtMx(x.restante))).join(""));
  }
  if (p.solicitudes.length) {
    html += tabla(`✏️ Solicitudes de edición sin autorizar (${p.solicitudes.length})`, "#1d4ed8", "Empleado", "Motivo",
      p.solicitudes.map(s => fila(s.folio, s.empleadoNombre || "—", s.motivo || "—")).join(""));
  }
  if (p.abonos.length) {
    html += tabla(`🧾 Abonos sin confirmar (${p.abonos.length})`, "#a16207", "Cajero", "Monto",
      p.abonos.map(a => fila(a.folio, a.cajero || "—", fmtMx(a.monto))).join(""));
  }
  if (!total) html += `<p style="color:#16a34a">✅ No hay pendientes registrados.</p>`;
  html += `<p style="font-size:11px;color:#888;margin-top:16px">Correo automático de Funeraria Huerta.</p></div>`;

  const asunto = total ? `Funeraria Huerta: ${total} pendiente(s) por atender` : "Funeraria Huerta: sin pendientes";
  MailApp.sendEmail({ to: email, subject: asunto, htmlBody: html });
  logActividad("enviarAlertasPendientes", "sistema", total + " pendientes -> " + email);
  return { ok:true, mensaje:"Correo de alertas enviado", total:total };
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚙ Huerta Admin")
    .addItem("Inicializar / reparar columnas de hojas", "inicializarTodasLasHojas")
    .addItem("🎨 Embellecer todas las hojas", "embellecerHojas")
    .addSeparator()
    .addItem("Configurar correo de alertas...", "configurarCorreoAlertasUI")
    .addItem("Activar alertas diarias (8:00 am)", "activarAlertasDiariasUI")
    .addItem("Desactivar alertas diarias", "desactivarAlertasDiariasUI")
    .addItem("Enviar alerta de prueba ahora", "enviarAlertaPruebaUI")
    .addSeparator()
    .addItem("🔧 Corregir ODS-26-0003 y ODS-26-0005 (una vez)", "corregirOrdenesEquipoAgosto2026")
    .addItem("🔍 Diagnosticar columnas con encabezado vacío", "diagnosticarColumnasVacias")
    .addSeparator()
    .addItem("🗂 Previsualizar reorganización de OrdenesTrabajo", "previsualizarReorganizacionODS")
    .addItem("✅ Aplicar reorganización de OrdenesTrabajo", "aplicarReorganizacionODS")
    .addToUi();
}
function inicializarTodasLasHojas() {
  getODSSh(); getEmpSh(); getPrevSh(); getAbonoSh(); getProdSh(); getSolicSh(); getCertSh(); getElimSh(); getRcSh();
  SpreadsheetApp.getUi().alert("✅ Hojas inicializadas/reparadas correctamente. Cualquier columna nueva que faltaba se agregó al final de cada hoja.");
}
function configurarCorreoAlertasUI() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt(
    "Correo para alertas de pendientes",
    "Se usará para el resumen de equipos, saldos, solicitudes y abonos pendientes.\nActual: " + (getAlertEmail() || "(sin configurar)"),
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const email = (r.getResponseText() || "").trim();
  if (!email) { ui.alert("Correo vacío, no se guardó."); return; }
  setAlertEmail(email);
  ui.alert("✅ Correo de alertas configurado: " + email);
}
function activarAlertasDiariasUI() {
  if (!getAlertEmail()) { SpreadsheetApp.getUi().alert("Configura primero el correo de alertas."); return; }
  activarAlertasDiarias(8);
  SpreadsheetApp.getUi().alert("✅ Alertas diarias activadas (8:00 am).");
}
function desactivarAlertasDiariasUI() {
  desactivarAlertasDiarias();
  SpreadsheetApp.getUi().alert("Alertas diarias desactivadas.");
}
function enviarAlertaPruebaUI() {
  if (!getAlertEmail()) { SpreadsheetApp.getUi().alert("Configura primero el correo de alertas."); return; }
  const r = enviarAlertasPendientes(true);
  SpreadsheetApp.getUi().alert(r.ok ? ("✅ " + r.mensaje + " (" + r.total + " pendientes)") : ("❌ " + r.mensaje));
}

// ============================================================
//  EMBELLECER HOJAS
//  Solo formato visual (encabezados fijos, franjas alternas, moneda/fecha,
//  colores por estatus) — nunca borra ni mueve columnas o datos, así que es
//  seguro correrlo las veces que se quiera.
// ============================================================
function embellecerHojas() {
  _embellecerHoja(getODSSh(), {
    freezeCols: 2,
    money: ["costoAtaud","costoAdicionalCremacion","costoUrna","costoUrnaCambio","costoEmbalsamado",
            "costoTramites","costoSala","costoTraslado","costoExcesoPeso","costoObjetoCuerpo","otrosCargos",
            "subtotal","descuento","iva","totalGeneral","anticipo","restante","montoPagare"],
    date: ["fechaInstalacion","fechaRecoleccion","fechaCreacion","fechaActualizacion","fechaCeremonia",
           "fechaSepelio","fechaCremacion","vencimientoPagare","firmaFecha"],
    // Estas son horas sueltas (sin fecha real) que Sheets guarda con una
    // fecha base falsa (30-dic-1899); mostrarlas como "HH:mm" en vez de
    // fecha completa es solo cosmético, no cambia el valor guardado.
    time: ["salidaTraslado","horaMisa","horaCeremonia","horaSepelio","salidaCremacion","horaMisaCrem","horaCremacion","foraneoHoraSalida"]
  });
  _embellecerHoja(getEmpSh(),  { freezeCols: 2 });
  _embellecerHoja(getPrevSh(), { freezeCols: 2, money: ["precioTotal","enganche","cuotaMonto","restante"] });
  _embellecerHoja(getAbonoSh(),{ freezeCols: 2, money: ["monto"], date: ["fecha","fechaRegistro"] });
  _embellecerHoja(getProdSh(), { freezeCols: 2, money: ["costo","precioSugerido"] });
  _embellecerHoja(getSolicSh(),{ freezeCols: 2 });
  _embellecerHoja(getCertSh(), { freezeCols: 2, date: ["finadoFechaNacimiento","finadoFechaDefuncion",
    "conyugeFechaNacimiento","padreFechaNacimiento","madreFechaNacimiento","fechaCreacion","fechaActualizacion"] });
  _embellecerHoja(getRcSh(), { freezeCols: 2, date: ["rcFinadoFechaNacimiento","rcConyugeFechaNacimiento",
    "rcPadreFechaNacimiento","rcMadreFechaNacimiento","rcFechaDefuncion","rcFechaInhumacion",
    "rcDeclaranteFechaNacimiento","rcTestigo1FechaNacimiento","rcTestigo2FechaNacimiento",
    "fechaCreacion","fechaActualizacion"] });

  _colorearEstatusODS();

  SpreadsheetApp.getUi().alert("✅ Hojas embellecidas: encabezados fijos, franjas alternas, formato de moneda/fecha y colores de estatus en ODS.");
}

function _embellecerHoja(sh, opts) {
  opts = opts || {};
  const headers = headersReales(sh);
  const numCols = headers.length;
  const numRows = sh.getLastRow();
  if (!numCols || numRows < 1) return;

  sh.getRange(1, 1, 1, numCols).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
  sh.setFrozenRows(1);
  if (opts.freezeCols) sh.setFrozenColumns(Math.min(opts.freezeCols, numCols));
  sh.autoResizeColumns(1, numCols);

  if (numRows > 1) {
    const rango = sh.getRange(1, 1, numRows, numCols);
    rango.getBandings().forEach(b => b.remove());
    rango.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);

    (opts.money || []).forEach(col => {
      const ci = headers.indexOf(col);
      if (ci >= 0) sh.getRange(2, ci + 1, numRows - 1, 1).setNumberFormat("$#,##0.00");
    });
    (opts.date || []).forEach(col => {
      const ci = headers.indexOf(col);
      if (ci >= 0) sh.getRange(2, ci + 1, numRows - 1, 1).setNumberFormat("dd/mm/yyyy hh:mm");
    });
    (opts.time || []).forEach(col => {
      const ci = headers.indexOf(col);
      if (ci >= 0) sh.getRange(2, ci + 1, numRows - 1, 1).setNumberFormat("HH:mm");
    });
  }
}

// Colorea de un vistazo la columna "estatus" (ACTIVA/PENDIENTE_PAGO/CERRADA)
// y "estatusEquipo" (ACTIVO/RECOGIDO) de la hoja de ODS.
function _colorearEstatusODS() {
  const sh = getODSSh();
  const headers = headersReales(sh);
  const numRows = sh.getLastRow();
  if (numRows < 2) return;

  const ciEstatus = headers.indexOf("estatus");
  const ciEquipo  = headers.indexOf("estatusEquipo");
  const nuevas = [];

  if (ciEstatus >= 0) {
    const rango = sh.getRange(2, ciEstatus + 1, numRows - 1, 1);
    nuevas.push(
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("ACTIVA").setBackground("#dcfce7").setFontColor("#166534").setRanges([rango]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("PENDIENTE_PAGO").setBackground("#fef3c7").setFontColor("#92400e").setRanges([rango]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("CERRADA").setBackground("#e5e7eb").setFontColor("#374151").setRanges([rango]).build()
    );
  }
  if (ciEquipo >= 0) {
    const rango = sh.getRange(2, ciEquipo + 1, numRows - 1, 1);
    nuevas.push(
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("ACTIVO").setBackground("#fee2e2").setFontColor("#991b1b").setRanges([rango]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("RECOGIDO").setBackground("#dcfce7").setFontColor("#166534").setRanges([rango]).build()
    );
  }

  // Conserva reglas de otras columnas que ya existieran; reemplaza solo las de estatus/estatusEquipo.
  const colsNuevas = [ciEstatus + 1, ciEquipo + 1];
  const conservadas = sh.getConditionalFormatRules().filter(r =>
    !r.getRanges().some(rg => colsNuevas.includes(rg.getColumn()))
  );
  sh.setConditionalFormatRules(conservadas.concat(nuevas));
}

// ============================================================
//  CORRECCIÓN PUNTUAL — ODS-26-0003 y ODS-26-0005
//  Estas 2 órdenes quedaron con datos incorrectos de antes de los fixes de
//  guardarEdicionODS()/recopilar(): equipo de velación marcado como no
//  activo, y restos de "Sala" (nombre y costo) en una orden que en
//  realidad es velación en Domicilio. Se corrige celda por celda (no con
//  actualizarODS, que reescribiría la fila completa y podría perder datos)
//  para tocar solo esos campos puntuales.
//
//  IMPORTANTE: después de correr esto, hay que borrar el caché local de la
//  app en CADA celular que se use (página Nube → "🗑 Borrar datos locales
//  de este dispositivo") y luego sincronizar. Si no, la siguiente vez que
//  ese celular sincronice con su copia vieja en memoria, va a volver a
//  sobreescribir esta corrección con los datos viejos.
// ============================================================
function corregirOrdenesEquipoAgosto2026() {
  const sh = getODSSh();
  const headers = headersReales(sh);
  const ui = SpreadsheetApp.getUi();

  function setCelda(folio, campo, valor) {
    const fila = findRow(sh, "folio", folio);
    if (fila < 0) { ui.alert("No se encontró la orden " + folio); return; }
    const ci = headers.indexOf(campo);
    if (ci < 0) { ui.alert("No existe la columna " + campo); return; }
    sh.getRange(fila, ci + 1).setValue(valor);
  }

  setCelda("ODS-26-0003", "estatusEquipo", "ACTIVO");
  setCelda("ODS-26-0003", "salaVelacion", "");
  setCelda("ODS-26-0003", "costoSala", 0);

  setCelda("ODS-26-0005", "estatusEquipo", "ACTIVO");

  ui.alert(
    "✅ ODS-26-0003 y ODS-26-0005 corregidas en la hoja.\n\n" +
    "IMPORTANTE: en la app, entra a Nube y usa \"🗑 Borrar datos locales de " +
    "este dispositivo\" y luego \"☁️ Sincronizar Todo\" — hazlo en CADA " +
    "celular que uses la app, si no el próximo que sincronice con su copia " +
    "vieja puede volver a sobreescribir esta corrección."
  );
}

// ============================================================
//  DIAGNOSTICAR / MIGRAR COLUMNAS CON ENCABEZADO VACÍO
//  En algún momento el encabezado de una columna de OrdenesTrabajo se quedó
//  en blanco (en vez de decir "salaVelacion"), así que ensureColumns()
//  agregó una columna NUEVA con ese nombre al final de la hoja — la vieja,
//  con encabezado vacío, se quedó ahí sin que ningún código la lea ni
//  escriba (por eso "no existe" un encabezado con nombre, aunque la
//  columna en sí sigue presente).
//  Esta función reporta cuántas filas tienen datos en cada columna vacía y,
//  si encuentra algo, lo copia a "salaVelacion" (solo en filas donde ese
//  campo esté vacío, para no pisar nada). Nunca borra la columna sola —
//  eso se hace a mano en Sheets (clic derecho en la letra → Eliminar
//  columna) una vez confirmado que ya no tiene nada de valor.
// ============================================================
function diagnosticarColumnasVacias() {
  const sh = getODSSh();
  const ui = SpreadsheetApp.getUi();
  const ancho = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, ancho).getValues()[0];
  const numRows = sh.getLastRow();

  const vacias = [];
  headers.forEach((h, i) => { if (String(h).trim() === '') vacias.push(i); });

  if (!vacias.length) { ui.alert("No hay columnas con encabezado vacío en OrdenesTrabajo."); return; }

  const ciSala = headers.indexOf("salaVelacion");
  let migrados = 0;
  const reportes = [];

  vacias.forEach(ci => {
    let conDatos = 0;
    if (numRows > 1) {
      const valores = sh.getRange(2, ci + 1, numRows - 1, 1).getValues();
      valores.forEach((fila, idx) => {
        const v = fila[0];
        if (v === '' || v === null || v === undefined) return;
        conDatos++;
        if (ciSala >= 0) {
          const filaSheet = idx + 2;
          const valorSala = sh.getRange(filaSheet, ciSala + 1).getValue();
          if (valorSala === '' || valorSala === null || valorSala === undefined) {
            sh.getRange(filaSheet, ciSala + 1).setValue(v);
            migrados++;
          }
        }
      });
    }
    reportes.push(`Columna ${_letraColumna(ci + 1)} (posición ${ci + 1}): ${conDatos} fila(s) con datos.`);
  });

  ui.alert(
    "🔍 Columnas con encabezado vacío en OrdenesTrabajo:\n\n" +
    reportes.join("\n") +
    (migrados ? `\n\n✅ Se migraron ${migrados} valor(es) a la columna "salaVelacion".` : "") +
    "\n\nSi ya no quedan datos ahí (o ya se migraron), esa columna está huérfana y la puedes borrar tú mismo en Sheets: clic derecho en la letra de la columna → Eliminar columna."
  );
}
function _letraColumna(col) {
  let letra = '';
  while (col > 0) {
    const resto = (col - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    col = Math.floor((col - 1) / 26);
  }
  return letra;
}

// ============================================================
//  REORGANIZAR OrdenesTrabajo POR GRUPOS DE FUNCIÓN
//  Agrupa los encabezados existentes por función (contratante/finado,
//  servicio, costos, velación/equipo, logística, traslado, financiero,
//  pagaré, firma/notas) y junta en un solo campo los que hoy están
//  duplicados (fechaSepelio/fechaCremacion → fechaCeremonia,
//  horaSepelio/horaCremacion → horaCeremonia, salidaCremacion →
//  salidaTraslado, horaMisaCrem → horaMisa) migrando primero el dato que
//  falte. NO inventa columnas nuevas ni cambia cómo la app captura datos
//  (sigue leyendo/escribiendo por nombre de encabezado, sin importar el
//  orden) — solo reordena y junta lo que ya existe.
//
//  Por seguridad, esto es un proceso de 2 pasos:
//  1) "Previsualizar" arma una hoja NUEVA ("OrdenesTrabajo (vista previa)")
//     con el resultado, sin tocar en absoluto la hoja OrdenesTrabajo real.
//  2) "Aplicar" (solo cuando ya revisaste la vista previa) renombra la hoja
//     actual como respaldo y pone la vista previa en su lugar — nada se
//     borra, el respaldo se queda ahí por si hay que revertir.
// ============================================================
const GRUPOS_ODS = {
  "Identificación": ["folio","estatus","creadoPor","fechaCreacion","fechaActualizacion"],
  "Contratante y Finado": ["fallecido","contratante","telefono","direccionCalle","direccionColonia","direccionLocalidad","direccionMunicipio"],
  "Servicio Contratado": ["modalidadServicio","ataudId","ataudNombre","tipoCremacion","urnaId","urnaNombre","urnaCambioId","urnaCambioNombre","embalsamado","tramites"],
  "Costos del Servicio": ["costoAtaud","costoAdicionalCremacion","costoUrna","costoUrnaCambio","costoEmbalsamado","costoTramites"],
  "Velación y Equipo": ["modalidadVelacion","equipoVelacion","estatusEquipo","fechaInstalacion","fechaRecoleccion","salaVelacion","costoSala","insumos"],
  "Logística de Sepelio/Cremación": ["lugSepelio","crematorio","fechaCeremonia","salidaTraslado","horaMisa","horaCeremonia"],
  "Traslado": ["destinoTipo","destinoNombre","kmTraslado","costoTraslado","excesoPeso","costoExcesoPeso","objetoCuerpo","costoObjetoCuerpo","foraneoLugarSalida","foraneoHoraSalida"],
  "Financiero": ["subtotal","descuento","iva","otrosCargos","totalGeneral","porcentajeAnticipo","anticipo","restante"],
  "Pagaré": ["tienePagare","montoPagare","nombreDeudor","telefonoDeudor","ineDeudor","vencimientoPagare","domicilioDeudor","cantidadLetras"],
  "Firma y Notas": ["anotaciones","firmaContratanteB64","firmaFecha"]
};
// Campos viejos que ya quedaron reemplazados por uno unificado (ver arriba)
// — se migran a su reemplazo y luego se descartan de la vista reorganizada.
const CAMPOS_VIEJOS_ODS = {
  fechaSepelio: "fechaCeremonia", fechaCremacion: "fechaCeremonia",
  horaSepelio: "horaCeremonia", horaCremacion: "horaCeremonia",
  salidaCremacion: "salidaTraslado", horaMisaCrem: "horaMisa"
};

function previsualizarReorganizacionODS() {
  const ui = SpreadsheetApp.getUi();
  const shOrig = getODSSh();
  const dataOrig = shOrig.getDataRange().getValues();
  if (dataOrig.length < 1) { ui.alert("La hoja OrdenesTrabajo está vacía."); return; }
  const headersOrig = dataOrig[0];
  const filas = dataOrig.slice(1).map(r => toObj(headersOrig, r));

  // 1) Migra a los campos unificados (solo en memoria) el dato viejo que
  //    falte, y cualquier columna con encabezado vacío hacia salaVelacion.
  filas.forEach(o => {
    Object.keys(CAMPOS_VIEJOS_ODS).forEach(viejo => {
      const nuevo = CAMPOS_VIEJOS_ODS[viejo];
      if (!o[nuevo] && o[viejo]) o[nuevo] = o[viejo];
    });
    if (!o.salaVelacion && o['']) o.salaVelacion = o[''];
  });

  // 2) Arma el nuevo orden agrupado. Cualquier columna real que exista hoy
  //    pero no esté en ningún grupo (por si se agregó una nueva sin
  //    actualizar esta lista) se agrega al final, para no perderla.
  const nuevoOrden = [].concat(...Object.values(GRUPOS_ODS));
  const descartar = new Set(Object.keys(CAMPOS_VIEJOS_ODS).concat(['']));
  headersOrig.forEach(h => {
    const nombre = String(h).trim();
    if (!nombre || descartar.has(nombre) || nuevoOrden.includes(nombre)) return;
    nuevoOrden.push(nombre);
  });

  // 3) Escribe la vista previa en una hoja NUEVA — la original no se toca.
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nombrePreview = "OrdenesTrabajo (vista previa)";
  const previaVieja = ss.getSheetByName(nombrePreview);
  if (previaVieja) ss.deleteSheet(previaVieja);
  const shPreview = ss.insertSheet(nombrePreview);

  const filasNuevas = filas.map(o => nuevoOrden.map(h => o[h] !== undefined ? o[h] : ''));
  shPreview.getRange(1, 1, 1, nuevoOrden.length).setValues([nuevoOrden]);
  if (filasNuevas.length) shPreview.getRange(2, 1, filasNuevas.length, nuevoOrden.length).setValues(filasNuevas);

  _embellecerHoja(shPreview, {
    freezeCols: 2,
    money: ["costoAtaud","costoAdicionalCremacion","costoUrna","costoUrnaCambio","costoEmbalsamado",
            "costoTramites","costoSala","costoTraslado","costoExcesoPeso","costoObjetoCuerpo","otrosCargos",
            "subtotal","descuento","iva","totalGeneral","anticipo","restante","montoPagare"],
    date: ["fechaInstalacion","fechaRecoleccion","fechaCreacion","fechaActualizacion","fechaCeremonia",
           "vencimientoPagare","firmaFecha"],
    time: ["salidaTraslado","horaMisa","horaCeremonia","foraneoHoraSalida"]
  });

  // Un color de encabezado distinto por grupo, para que se note la
  // agrupación de un vistazo (las columnas "extra" al final quedan con el
  // color parejo que ya dejó _embellecerHoja). Va DESPUÉS de _embellecerHoja
  // a propósito: ese helper repinta todo el encabezado de un solo color, así
  // que si esto corriera antes, los colores por grupo quedarían tapados.
  const coloresGrupo = ["#0f172a","#1e3a5f","#134e2e","#5b3a29","#4a1d5c","#5c1d1d","#1d4e5c","#5c4a1d","#2d1d5c","#1d5c4a"];
  let col = 1;
  Object.values(GRUPOS_ODS).forEach((cols, i) => {
    shPreview.getRange(1, col, 1, cols.length).setBackground(coloresGrupo[i % coloresGrupo.length]).setFontColor("#ffffff").setFontWeight("bold");
    col += cols.length;
  });

  ui.alert(
    "✅ Vista previa creada en la pestaña \"" + nombrePreview + "\".\n\n" +
    "La hoja OrdenesTrabajo real NO se tocó — revisa la vista previa con calma. " +
    "Si se ve bien, corre \"✅ Aplicar reorganización de OrdenesTrabajo\" para reemplazarla " +
    "(la hoja actual se guarda como respaldo, no se borra nada)."
  );
}

function aplicarReorganizacionODS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const preview = ss.getSheetByName("OrdenesTrabajo (vista previa)");
  if (!preview) { ui.alert("Primero corre \"🗂 Previsualizar reorganización de OrdenesTrabajo\"."); return; }

  const r = ui.alert(
    "¿Aplicar la reorganización?",
    "Esto renombra la hoja actual \"OrdenesTrabajo\" como respaldo y pone la vista previa en su lugar. No se borra nada. ¿Continuar?",
    ui.ButtonSet.YES_NO
  );
  if (r !== ui.Button.YES) return;

  const actual = ss.getSheetByName(SH_ODS);
  const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HHmm");
  const nombreRespaldo = "OrdenesTrabajo (respaldo " + fecha + ")";
  actual.setName(nombreRespaldo);
  preview.setName(SH_ODS);

  ui.alert(
    "✅ Listo. La hoja reorganizada ya es \"" + SH_ODS + "\".\n\n" +
    "La versión anterior quedó guardada como \"" + nombreRespaldo + "\" — bórrala tú mismo cuando " +
    "confirmes que todo está bien (Sheets no lo hace solo)."
  );
}
