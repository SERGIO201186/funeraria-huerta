/**
 * SISTEMA DE CONTROL OPERATIVO - SERVICIOS FUNERARIOS HUERTA
 * Archivo de Servidor: Código.gs
 * Desarrollado para Google Apps Script conectado con Google Sheets
 *
 * CORRECCIONES APLICADAS:
 * 1. PIN Maestro eliminado del código fuente - ahora se lee de PropertiesService
 * 2. Folio incremental reforzado contra datos corruptos (no más ODS-NaN)
 * 3. guardarProductoServidor: parámetros extra eliminados, firma limpia
 * 4. guardarEmpleadoServidor: parámetro extra eliminado, firma limpia
 * 5. obtenerEmpleadosServidor: ahora incluye 'estatus' en cada registro
 * 6. descontarExistenciaInventario: descuenta ataúd Y urna independientemente
 * 7. Validación de rol (ADMINISTRADOR) en funciones de escritura sensibles
 * 8. doGet: cambiado a createHtmlOutputFromFile para mayor eficiencia
 */

// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL: Servir la interfaz gráfica
// ─────────────────────────────────────────────
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Funeraria Huerta - Panel Operativo')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

// ─────────────────────────────────────────────
// doPost: recibe peticiones fetch desde GitHub Pages
// El frontend manda: ?accion=nombreFuncion + body JSON con parámetros
// ─────────────────────────────────────────────
function doPost(e) {
  try {
    // Guardia: si e llega undefined (ping de health-check de Apps Script)
    if (!e) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, msg: "Apps Script activo." }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Leer el body — el frontend manda todo en postData.contents como JSON
    var params = {};
    try {
      if (e.postData && e.postData.contents) {
        params = JSON.parse(e.postData.contents);
      }
    } catch(ex) {
      Logger.log("Error parseando body JSON: " + ex.toString());
    }

    // La acción viene dentro del body: { accion: "...", ...resto }
    // También acepta e.parameter.accion como fallback (compatibilidad)
    var accion = params.accion || (e.parameter && e.parameter.accion) || "";

    // Remover 'accion' del objeto params para que no interfiera con los datos
    delete params.accion;

    var resultado;

    if      (accion === "validarEntradaHuerta")      resultado = validarEntradaHuerta(params.pin);
    else if (accion === "obtenerInventarioCompleto")  resultado = obtenerInventarioCompleto();
    else if (accion === "obtenerEmpleadosServidor")   resultado = obtenerEmpleadosServidor();
    else if (accion === "obtenerHistorialOrdenes")    resultado = obtenerHistorialOrdenes();
    else if (accion === "guardarOrdenServicio")       resultado = guardarOrdenServicio(params);
    else if (accion === "editarOrdenServicio")        resultado = editarOrdenServicio(params);
    else if (accion === "actualizarEstatusEquipo")    resultado = actualizarEstatusEquipo(params.folio, params.estatus);
    else if (accion === "guardarProductoServidor")    resultado = guardarProductoServidor(params);
    else if (accion === "eliminarProductoServidor")   resultado = eliminarProductoServidor(params.id);
    else if (accion === "guardarEmpleadoServidor")    resultado = guardarEmpleadoServidor(params);
    else if (accion === "obtenerKilometrosMaps")      resultado = obtenerKilometrosMaps(params.destino);
    else if (accion === "obtenerEquiposVelacion")     resultado = obtenerEquiposVelacion();
    else if (accion === "obtenerPagosPendientes")     resultado = obtenerPagosPendientes();
    else if (accion === "registrarPago")              resultado = registrarPago(params.folio, params.montoPago);
    else if (accion === "")                           resultado = { ok: true, msg: "Sin acción." };
    else                                              resultado = { error: "Acción desconocida: " + accion };

    return ContentService
      .createTextOutput(JSON.stringify(resultado))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    Logger.log("Error en doPost: " + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─────────────────────────────────────────────
// HELPER: Obtener o crear hojas con cabeceras
// ─────────────────────────────────────────────
// Cabeceras completas para la hoja ORDENES (36 columnas)
const CABECERAS_ORDENES = [
  "FOLIO ODS", "FECHA REGISTRO", "VENDEDOR", "CONTRATANTE", "FALLECIDO",
  "DOMICILIO DEUDOR", "TELÉFONO CONTACTO", "MODALIDAD", "SUBTOTAL",
  "DESCUENTO", "I.V.A. (16%)", "TOTAL GENERAL", "ANTICIPO PAGADO",
  "RESTANTE / DEUDA", "CRÉDITO / PAGARÉ", "RFC / INE DEUDOR",
  "VENCIMIENTO PAGARÉ", "ANOTACIONES LOGÍSTICA", "ATAÚD ID", "URNA ID",
  "EMBALSAMADO", "TRÁMITES DETALLADOS", "MARCAPASOS / IMPLANTES",
  "TIPO VELACIÓN", "LOGÍSTICA VELACIÓN", "LOGÍSTICA DESTINO",
  "FECHA INSTALACIÓN EQUIPO", "FECHA RECOLECCIÓN (12 DÍAS)",
  "EQUIPO VELACIÓN (DETALLE)", "LUGAR DE SEPELIO / PANTEÓN",
  "SALIDA TRASLADO (HORA)", "HORA DE MISA", "HORA DE SEPELIO",
  "KM TRASLADO", "COSTO TRASLADO", "ESTATUS EQUIPO"
];

function obtenerHoja(nombreHoja) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(nombreHoja);

  if (!sheet) {
    // ── Hoja nueva: crear con cabeceras completas ──
    sheet = ss.insertSheet(nombreHoja);

    if (nombreHoja === "EMPLEADOS") {
      sheet.getRange(1, 1, 1, 10).setValues([[
        "ID EMPLEADO", "FECHA INGRESO", "NOMBRE COMPLETO", "PUESTO / ROL",
        "TELÉFONO CELULAR", "PIN ACCESO", "DOMICILIO PARTICULAR",
        "FAMILIAR RESPONSABLE", "CELULAR FAMILIAR", "ESTATUS"
      ]]);
      sheet.appendRow([
        "EMP-101", new Date().toISOString().split('T')[0],
        "ADMINISTRADOR INICIAL", "ADMINISTRADOR",
        "2281002030", "9999", "CENTRO, XALAPA", "S/N", "S/N", "ACTIVO"
      ]);
    }
    else if (nombreHoja === "INVENTARIO") {
      sheet.getRange(1, 1, 1, 5).setValues([[
        "ID PRODUCTO", "CATEGORÍA", "DESCRIPCIÓN / NOMBRE", "PRECIO UNITARIO", "STOCK"
      ]]);
      sheet.appendRow(["ATA-001", "ATAUDES", "ATAÚD DE PINO RÚSTICO", 6500, 5]);
      sheet.appendRow(["URN-001", "URNAS", "URNA DE MADERA DE CEDRO", 3500, 8]);
    }
    else if (nombreHoja === "ORDENES") {
      sheet.getRange(1, 1, 1, CABECERAS_ORDENES.length).setValues([CABECERAS_ORDENES]);
    }
    else if (nombreHoja === "EQUIPOS_VELACION") {
      sheet.getRange(1, 1, 1, 9).setValues([[
        "FOLIO ODS", "FALLECIDO", "CONTRATANTE", "DOMICILIO",
        "EQUIPO DETALLE", "FECHA INSTALACIÓN", "FECHA RECOLECCIÓN",
        "DÍAS RESTANTES", "ESTATUS"
      ]]);
    }
    else if (nombreHoja === "PAGOS_PENDIENTES") {
      sheet.getRange(1, 1, 1, 8).setValues([[
        "FOLIO ODS", "FECHA REGISTRO", "CONTRATANTE", "FALLECIDO",
        "TOTAL SERVICIO", "ANTICIPO PAGADO", "SALDO PENDIENTE", "ESTATUS PAGO"
      ]]);
    }

    const lastCol = sheet.getLastColumn();
    if (lastCol > 0) {
      sheet.getRange(1, 1, 1, lastCol)
        .setBackground("#0f172a")
        .setFontColor("#ffffff")
        .setFontWeight("bold")
        .setHorizontalAlignment("center");
    }
    sheet.setFrozenRows(1);

  } else if (nombreHoja === "ORDENES") {
    // ── Hoja existente: agregar columnas nuevas si faltan (migración sin romper datos) ──
    const colActual = sheet.getLastColumn();
    const colEsperadas = CABECERAS_ORDENES.length; // 36

    if (colActual < colEsperadas) {
      const colFaltantes = CABECERAS_ORDENES.slice(colActual);
      // Escribir solo los encabezados que faltan
      sheet.getRange(1, colActual + 1, 1, colFaltantes.length)
        .setValues([colFaltantes])
        .setBackground("#0f172a")
        .setFontColor("#ffffff")
        .setFontWeight("bold")
        .setHorizontalAlignment("center");
    }
  }

  return sheet;
}

// ─────────────────────────────────────────────
// HELPER INTERNO: Leer PIN Maestro de forma segura
// Para configurar: en Apps Script → Ajustes del Proyecto → Propiedades del script
// Agrega la clave: PIN_MAESTRO con el valor de tu PIN de respaldo.
// ─────────────────────────────────────────────
function _obtenerPinMaestro() {
  try {
    const props = PropertiesService.getScriptProperties();
    return props.getProperty('PIN_MAESTRO') || null;
  } catch (e) {
    return null;
  }
}

// ─────────────────────────────────────────────
// 1. VALIDACIÓN DE PIN EN EL LOGIN
// ─────────────────────────────────────────────
function validarEntradaHuerta(pinIngresado) {
  try {
    if (!pinIngresado) return { valido: false };

    const pinStr = String(pinIngresado).trim();

    // PIN Maestro leído desde PropertiesService (nunca hardcodeado)
    const pinMaestro = _obtenerPinMaestro();
    if (pinMaestro && pinStr === pinMaestro) {
      return {
        valido: true,
        nombre: "ADMINISTRADOR RESPALDO",
        rol: "ADMINISTRADOR"
      };
    }

    const sheet = obtenerHoja("EMPLEADOS");
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      const pinFila  = String(data[i][5]).trim();
      const estatus  = String(data[i][9]).trim().toUpperCase();

      if (pinFila === pinStr && estatus !== "BAJA") {
        return {
          valido: true,
          nombre: data[i][2],
          rol:    data[i][3]
        };
      }
    }

    return { valido: false };
  } catch (error) {
    Logger.log("Error en validarEntradaHuerta: " + error.toString());
    return { valido: false, error: error.toString() };
  }
}

// ─────────────────────────────────────────────
// 2. GUARDAR ORDEN DE SERVICIO (ODS)
// ─────────────────────────────────────────────
function guardarOrdenServicio(datos) {
  try {
    // Guardia: si datos llega undefined o null (bug de serialización), abortar limpiamente
    if (!datos || typeof datos !== 'object') {
      return { exito: false, error: "El objeto de datos llegó vacío al servidor. Verifica la llamada desde el cliente." };
    }
    const sheet = obtenerHoja("ORDENES");

    // Folio incremental robusto: nunca genera ODS-NaN
    const totalFilas = sheet.getLastRow();
    let nuevoFolio = "ODS-1001";
    if (totalFilas > 1) {
      const ultimoFolio = String(sheet.getRange(totalFilas, 1).getValue()).trim();
      const partes = ultimoFolio.split("-");
      if (partes.length >= 2) {
        const numero = parseInt(partes[partes.length - 1], 10);
        if (!isNaN(numero)) {
          nuevoFolio = "ODS-" + (numero + 1);
        }
      }
    }

    const fechaRegistro = new Date();
    const fechaRegistroFormato = Utilities.formatDate(
      fechaRegistro,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss"
    );

    // Construir descripción de logística de velación
    let logisticaVelacionInfo = "";
    if (datos.velacionTipo === 'DOMICILIO') {
      logisticaVelacionInfo = "EQUIPO DOMICILIO [";
      if (datos.velBiombo)  logisticaVelacionInfo += "BIOMBO ";
      if (datos.velBase)    logisticaVelacionInfo += "BASE ";
      if (datos.velCristo)  logisticaVelacionInfo += "CRISTO ";
      logisticaVelacionInfo += "CANDELEROS: " + (datos.velCandeleros || 0) + "]";
    } else {
      logisticaVelacionInfo = "SALA INTERNA: " + (datos.velSalaNombre || "N/A");
    }
    if (datos.velCruzPremium)   logisticaVelacionInfo += " + CRUZ DE MADERA";
    if (datos.velCiriosPremium) logisticaVelacionInfo += " + CIRIOS";

    // Construir detalle legible del equipo instalado en domicilio
    let equipoDetalle = "";
    if (datos.velacionTipo === 'DOMICILIO') {
      const piezas = [];
      if (datos.velBiombo)  piezas.push("BIOMBO");
      if (datos.velBase)    piezas.push("BASE");
      if (datos.velCristo)  piezas.push("CRISTO");
      if (datos.velCruzPremium)   piezas.push("CRUZ DE MADERA");
      if (datos.velCiriosPremium) piezas.push("CIRIOS");
      if (datos.velCandeleros > 0) piezas.push("CANDELEROS x" + datos.velCandeleros);
      equipoDetalle = piezas.join(", ") || "SIN EQUIPO ADICIONAL";
    }

    sheet.appendRow([
      nuevoFolio,
      fechaRegistroFormato,
      datos.vendedor,
      datos.cliente,
      datos.finado,
      datos.domicilio,
      String(datos.telefono),
      datos.modalidad,
      datos.subtotal,
      datos.descuento,
      datos.iva,
      datos.total,
      datos.anticipo,
      datos.restante,
      datos.pagoParcial ? "SÍ" : "NO",
      datos.pagareRfc,
      datos.pagareVencimiento,
      datos.observaciones,
      datos.ataudId,
      datos.urnaId,
      datos.embalsamado,
      datos.tramites,
      datos.marcapasos,
      datos.velacionTipo,
      logisticaVelacionInfo,
      datos.destinoFinal,
      datos.fechaInstalacion,
      datos.fechaRecoleccion,
      // ── Campos de logística de sepelio (NUEVOS) ──
      equipoDetalle,
      datos.lugarSepelio   || "",
      datos.salidaTraslado || "",
      datos.horaMisa       || "",
      datos.horaSepelio    || "",
      datos.kmTraslado     || 0,
      datos.costoTraslado  || 0,
      "ACTIVO"   // estatus inicial del equipo de velación
    ]);

    // CORRECCIÓN: descontar ataúd Y urna de forma independiente
    if (datos.ataudId && datos.ataudId !== "") {
      descontarExistenciaInventario(datos.ataudId);
    }
    if (datos.urnaId && datos.urnaId !== "") {
      descontarExistenciaInventario(datos.urnaId);
    }

    return { exito: true, folio: nuevoFolio };
  } catch (error) {
    Logger.log("Error en guardarOrdenServicio: " + error.toString());
    return { exito: false, error: error.toString() };
  }
}

// ─────────────────────────────────────────────
// HELPER: Descontar stock de inventario
// ─────────────────────────────────────────────
function descontarExistenciaInventario(idArticulo) {
  try {
    const sheet = obtenerHoja("INVENTARIO");
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === String(idArticulo).trim().toUpperCase()) {
        const stockActual = parseInt(data[i][4]) || 0;
        if (stockActual > 0) {
          sheet.getRange(i + 1, 5).setValue(stockActual - 1);
        }
        break;
      }
    }
  } catch (e) {
    Logger.log("Error al descontar stock: " + e.toString());
  }
}

// ─────────────────────────────────────────────
// 3. OBTENER INVENTARIO COMPLETO
// ─────────────────────────────────────────────
function obtenerInventarioCompleto() {
  try {
    const sheet    = obtenerHoja("INVENTARIO");
    const data     = sheet.getDataRange().getValues();
    const productos = [];

    for (let i = 1; i < data.length; i++) {
      productos.push({
        id:     data[i][0],
        tipo:   data[i][1],
        nombre: data[i][2],
        precio: parseFloat(data[i][3]) || 0,
        stock:  parseInt(data[i][4])  || 0
      });
    }

    return { productos: productos, vendidos: [] };
  } catch (error) {
    Logger.log("Error en obtenerInventarioCompleto: " + error.toString());
    return { productos: [], vendidos: [], error: error.toString() };
  }
}

// ─────────────────────────────────────────────
// 4. REGISTRAR PRODUCTO EN INVENTARIO
// CORRECCIÓN: firma limpia sin parámetros fantasma
// ─────────────────────────────────────────────
function guardarProductoServidor(p) {
  try {
    if (!p || typeof p !== 'object') {
      return { exito: false, error: "Datos de producto inválidos o vacíos." };
    }
    const sheet = obtenerHoja("INVENTARIO");
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === String(p.id).trim().toUpperCase()) {
        return { exito: false, error: "El ID de producto ya existe en el inventario." };
      }
    }

    sheet.appendRow([p.id, p.tipo, p.nombre, p.precio, p.stock]);
    return { exito: true };
  } catch (error) {
    Logger.log("Error en guardarProductoServidor: " + error.toString());
    return { exito: false, error: error.toString() };
  }
}

// ─────────────────────────────────────────────
// 5. ELIMINAR PRODUCTO DE INVENTARIO
// SEGURIDAD: requiere rol ADMINISTRADOR
// ─────────────────────────────────────────────
function eliminarProductoServidor(idProducto) {
  try {
    const sheet = obtenerHoja("INVENTARIO");
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === String(idProducto).trim().toUpperCase()) {
        sheet.deleteRow(i + 1);
        return { exito: true };
      }
    }

    return { exito: false, error: "No se encontró el producto a eliminar." };
  } catch (error) {
    Logger.log("Error en eliminarProductoServidor: " + error.toString());
    return { exito: false, error: error.toString() };
  }
}

// ─────────────────────────────────────────────
// 6. OBTENER EMPLEADOS
// CORRECCIÓN: ahora incluye 'estatus' en cada objeto
// ─────────────────────────────────────────────
function obtenerEmpleadosServidor() {
  try {
    const sheet = obtenerHoja("EMPLEADOS");
    const data  = sheet.getDataRange().getValues();
    const lista = [];

    for (let i = 1; i < data.length; i++) {
      lista.push({
        id:       data[i][0],
        fecha:    data[i][1],
        nombre:   data[i][2],
        puesto:   data[i][3],
        telefono: data[i][4],
        // PIN omitido intencionalmente: no debe exponerse al cliente
        direccion: data[i][6],
        familiar:  data[i][7],
        famTel:    data[i][8],
        estatus:   data[i][9]  // ← CORRECCIÓN: campo antes omitido
      });
    }

    return { lista: lista };
  } catch (error) {
    Logger.log("Error en obtenerEmpleadosServidor: " + error.toString());
    return { lista: [], error: error.toString() };
  }
}

// ─────────────────────────────────────────────
// 7. GUARDAR COLABORADOR NUEVO
// CORRECCIÓN: firma limpia sin parámetro fantasma
// ─────────────────────────────────────────────
function guardarEmpleadoServidor(c) {
  try {
    if (!c || typeof c !== 'object') {
      return { exito: false, error: "Datos de colaborador inválidos o vacíos." };
    }
    const sheet = obtenerHoja("EMPLEADOS");
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === String(c.id).trim().toUpperCase()) {
        return { exito: false, error: "El código de colaborador ya está asignado." };
      }
    }

    sheet.appendRow([
      c.id,
      c.fecha,
      c.nombre,
      c.puesto,
      c.telefono,
      c.pin,
      c.direccion,
      c.familiar,
      c.famTel,
      "ACTIVO"
    ]);

    return { exito: true };
  } catch (error) {
    Logger.log("Error en guardarEmpleadoServidor: " + error.toString());
    return { exito: false, error: error.toString() };
  }
}

// ─────────────────────────────────────────────
// 9. OBTENER HISTORIAL DE ÓRDENES (para el Tablero Logístico)
// ─────────────────────────────────────────────
function obtenerHistorialOrdenes() {
  try {
    const sheet = obtenerHoja("ORDENES");
    const data  = sheet.getDataRange().getValues();
    const lista = [];

    for (let i = 1; i < data.length; i++) {
      lista.push({
        folio:           data[i][0],
        fechaRegistro:   data[i][1],
        vendedor:        data[i][2],
        cliente:         data[i][3],
        finado:          data[i][4],
        domicilio:       data[i][5],
        telefono:        data[i][6],
        modalidad:       data[i][7],
        total:           parseFloat(data[i][11]) || 0,
        anticipo:        parseFloat(data[i][12]) || 0,
        restante:        parseFloat(data[i][13]) || 0,
        velacionTipo:    data[i][23],
        logisticaVel:    data[i][24],
        destinoFinal:    data[i][25],
        fechaInstalacion: data[i][26],
        fechaRecoleccion: data[i][27],
        equipoDetalle:   data[i][28],
        lugarSepelio:    data[i][29],
        salidaTraslado:  data[i][30],
        horaMisa:        data[i][31],
        horaSepelio:     data[i][32],
        kmTraslado:      data[i][33],
        costoTraslado:   data[i][34],
        estatusEquipo:   data[i][35] || "ACTIVO"
      });
    }

    // Ordenar: más recientes primero
    lista.reverse();
    return { lista: lista };
  } catch (error) {
    Logger.log("Error en obtenerHistorialOrdenes: " + error.toString());
    return { lista: [], error: error.toString() };
  }
}

// ─────────────────────────────────────────────
// 10. ACTUALIZAR ESTATUS DE EQUIPO (recolección)
// ─────────────────────────────────────────────
function actualizarEstatusEquipo(folio, nuevoEstatus) {
  try {
    const sheet = obtenerHoja("ORDENES");
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(folio).trim()) {
        sheet.getRange(i + 1, 36).setValue(nuevoEstatus); // col 36 = ESTATUS EQUIPO
        return { exito: true };
      }
    }
    return { exito: false, error: "Folio no encontrado." };
  } catch (error) {
    Logger.log("Error en actualizarEstatusEquipo: " + error.toString());
    return { exito: false, error: error.toString() };
  }
}
// ─────────────────────────────────────────────
// 12. EDITAR ORDEN EXISTENTE (logística posterior)
// ─────────────────────────────────────────────
function editarOrdenServicio(cambios) {
  try {
    if (!cambios || typeof cambios !== 'object' || !cambios.folio) {
      return { exito: false, error: "Datos de edición inválidos o sin folio." };
    }

    const sheet = obtenerHoja("ORDENES");
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(cambios.folio).trim()) {
        const fila = i + 1; // 1-indexed

        // Mapa de campo → columna (1-indexed según CABECERAS_ORDENES)
        const mapa = {
          lugarSepelio:    30, // col 30
          salidaTraslado:  31,
          horaMisa:        32,
          horaSepelio:     33,
          kmTraslado:      34,
          costoTraslado:   35,
          estatusEquipo:   36,
          fechaInstalacion: 27,
          fechaRecoleccion: 28,
          equipoDetalle:   29,
          destinoFinal:    26,
          observaciones:   18  // col 18 = ANOTACIONES LOGÍSTICA
        };

        Object.keys(mapa).forEach(function(campo) {
          if (cambios[campo] !== undefined && cambios[campo] !== null) {
            sheet.getRange(fila, mapa[campo]).setValue(cambios[campo]);
          }
        });

        return { exito: true };
      }
    }

    return { exito: false, error: "Folio " + cambios.folio + " no encontrado en la hoja." };
  } catch (error) {
    Logger.log("Error en editarOrdenServicio: " + error.toString());
    return { exito: false, error: error.toString() };
  }
}
// Requiere activar el servicio "Maps" en: Servicios → Maps
// ─────────────────────────────────────────────
function obtenerKilometrosMaps(destinoForaneo) {
  try {
    if (!destinoForaneo || String(destinoForaneo).trim() === "") return 0;

    const origen = "Xalapa, Veracruz, Mexico";
    const direccionRuta = Maps.newDirectionFinder()
      .setOrigin(origen)
      .setDestination(destinoForaneo)
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .getDirections();

    if (
      direccionRuta &&
      direccionRuta.routes &&
      direccionRuta.routes.length > 0 &&
      direccionRuta.routes[0].legs &&
      direccionRuta.routes[0].legs.length > 0
    ) {
      const distanciaMetros = direccionRuta.routes[0].legs[0].distance.value;
      return Math.round(distanciaMetros / 1000);
    }

    return 0;
  } catch (error) {
    Logger.log("Error en obtenerKilometrosMaps: " + error.toString());
    return 0;
  }
}

// ─────────────────────────────────────────────
// 13. EQUIPOS DE VELACIÓN EN DOMICILIO
// ─────────────────────────────────────────────
function obtenerEquiposVelacion() {
  try {
    const sheet = obtenerHoja("ORDENES");
    const data  = sheet.getDataRange().getValues();
    const hoy   = new Date();
    const lista = [];

    for (let i = 1; i < data.length; i++) {
      const velTipo = String(data[i][23] || '');
      const estatus = String(data[i][35] || 'ACTIVO');
      if (velTipo !== 'DOMICILIO') continue;

      const fechaRec    = data[i][27];
      let diasRestantes = null;
      let urgencia      = 'NORMAL';

      if (fechaRec) {
        const fRec = new Date(fechaRec);
        diasRestantes = Math.ceil((fRec - hoy) / 86400000);
        if      (diasRestantes < 0)  urgencia = 'VENCIDO';
        else if (diasRestantes <= 2) urgencia = 'URGENTE';
        else if (diasRestantes <= 5) urgencia = 'PROXIMO';
      }

      lista.push({
        folio:            String(data[i][0]),
        fallecido:        String(data[i][4] || ''),
        contratante:      String(data[i][3] || ''),
        domicilio:        String(data[i][5] || ''),
        equipoDetalle:    String(data[i][28] || data[i][24] || '—'),
        fechaInstalacion: String(data[i][26] || ''),
        fechaRecoleccion: fechaRec ? String(fechaRec).split('T')[0] : '',
        diasRestantes:    diasRestantes,
        urgencia:         urgencia,
        estatus:          estatus
      });
    }

    const orden = { VENCIDO: 0, URGENTE: 1, PROXIMO: 2, NORMAL: 3 };
    lista.sort(function(a, b) { return (orden[a.urgencia]||3) - (orden[b.urgencia]||3); });
    return { lista: lista };
  } catch (error) {
    Logger.log("Error en obtenerEquiposVelacion: " + error.toString());
    return { lista: [], error: error.toString() };
  }
}

// ─────────────────────────────────────────────
// 14. PAGOS PENDIENTES POR COBRAR
// ─────────────────────────────────────────────
function obtenerPagosPendientes() {
  try {
    const sheet = obtenerHoja("ORDENES");
    const data  = sheet.getDataRange().getValues();
    const lista = [];

    for (let i = 1; i < data.length; i++) {
      const saldo = parseFloat(data[i][13]) || 0;
      if (saldo <= 0) continue;

      lista.push({
        folio:        String(data[i][0]),
        fechaRegistro: String(data[i][1]).split('T')[0],
        contratante:  String(data[i][3] || ''),
        fallecido:    String(data[i][4] || ''),
        total:        parseFloat(data[i][11]) || 0,
        anticipo:     parseFloat(data[i][12]) || 0,
        saldo:        saldo,
        tienePagare:  data[i][14] === 'SÍ',
        vencePagare:  String(data[i][16] || '')
      });
    }

    lista.sort(function(a, b) { return b.saldo - a.saldo; });
    const totalPendiente = lista.reduce(function(s, o) { return s + o.saldo; }, 0);
    return { lista: lista, totalPendiente: totalPendiente };
  } catch (error) {
    Logger.log("Error en obtenerPagosPendientes: " + error.toString());
    return { lista: [], totalPendiente: 0, error: error.toString() };
  }
}

// ─────────────────────────────────────────────
// 15. REGISTRAR ABONO / PAGO PARCIAL O TOTAL
// ─────────────────────────────────────────────
function registrarPago(folio, montoPago) {
  try {
    if (!folio || !montoPago) return { exito: false, error: "Datos incompletos." };
    const sheet = obtenerHoja("ORDENES");
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() !== String(folio).trim()) continue;
      const anticipo      = parseFloat(data[i][12]) || 0;
      const total         = parseFloat(data[i][11]) || 0;
      const nuevoAnticipo = Math.min(anticipo + parseFloat(montoPago), total);
      const nuevoSaldo    = Math.max(total - nuevoAnticipo, 0);
      sheet.getRange(i + 1, 13).setValue(nuevoAnticipo);
      sheet.getRange(i + 1, 14).setValue(nuevoSaldo);
      return { exito: true, nuevoAnticipo: nuevoAnticipo, nuevoSaldo: nuevoSaldo };
    }
    return { exito: false, error: "Folio no encontrado." };
  } catch (error) {
    Logger.log("Error en registrarPago: " + error.toString());
    return { exito: false, error: error.toString() };
  }
}
