/* ==========================================================
   calculadora.js
   - Abre/cierra la ventana de la calculadora
   - Valida los datos
   - Calcula el presupuesto con las reglas del config.json
   - Arma el mensaje y abre WhatsApp
   ========================================================== */
(function () {
  "use strict";

  let config = null;            // lo carga main.js y nos lo pasa en iniciar()
  let presupuestoActual = null; // último presupuesto calculado
  let formateador = null;

  const $ = (id) => document.getElementById(id);

  const WHATSAPP_EJEMPLO = "5493510000000";   // número de ejemplo del config original: no se considera válido
  const MAXIMO_HECTAREAS_POR_DEFECTO = 100000;

  /* ---------- WhatsApp: UNA sola validación para todo el sitio ----------
     Devuelve solo los dígitos si el número sirve (10 a 15 dígitos), o null si no. */
  function normalizarWhatsapp(valor) {
    const digitos = String(valor == null ? "" : valor).replace(/\D/g, "");
    if (!/^\d{10,15}$/.test(digitos) || digitos === WHATSAPP_EJEMPLO) return null;
    return digitos;
  }

  /* ---------- Formato ---------- */
  function dinero(valor) {
    try {
      return formateador.format(valor);
    } catch (e) {
      return "$ " + valor.toLocaleString("es-AR");
    }
  }

  function numero(valor) {
    return valor.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  }

  /* ---------- CÁLCULO (función pura: fácil de probar y de cambiar) ----------
     total_base = hectareas x precio_por_hectarea
     Recargo SOLO si hectareas < limite_hectareas Y distancia > limite_distancia_km */
  function calcularPresupuesto(cfg, datos) {
    const tipo = cfg.tipos_aplicacion.find((t) => t.id === datos.tipoId);
    const indiceLocalidad = Number(datos.indiceLocalidad);
    const localidad = Number.isInteger(indiceLocalidad) ? cfg.localidades[indiceLocalidad] : null;

    if (!tipo || !localidad) {
      throw new Error("Falta el tipo de aplicación o la localidad.");
    }

    const hectareas = Number(datos.hectareas);
    const precioHa = Number(tipo.precio_por_hectarea);
    const distanciaKm = Number(localidad.distancia_km);
    const limiteHectareas = Number(cfg.limite_hectareas);
    const limiteDistanciaKm = Number(cfg.limite_distancia_km);
    const recargoConfigurado = Number(cfg.recargo_traslado);

    if (!Number.isFinite(hectareas) || hectareas <= 0 ||
        !Number.isFinite(precioHa) || precioHa < 0 ||
        !Number.isFinite(distanciaKm) || distanciaKm < 0 ||
        !Number.isFinite(limiteHectareas) || limiteHectareas < 0 ||
        !Number.isFinite(limiteDistanciaKm) || limiteDistanciaKm < 0 ||
        !Number.isFinite(recargoConfigurado) || recargoConfigurado < 0) {
      throw new Error("Hay datos numéricos inválidos en el presupuesto o en config.json.");
    }

    const base = Math.round(hectareas * precioHa * 100) / 100;
    if (!Number.isFinite(base)) {
      throw new Error("El importe calculado es demasiado grande. Revisá las hectáreas ingresadas.");
    }

    const esChico = hectareas < limiteHectareas;
    const esLejos = distanciaKm > limiteDistanciaKm;
    const aplicaRecargo = esChico && esLejos;
    const recargo = aplicaRecargo ? recargoConfigurado : 0;
    const total = base + recargo;

    if (!Number.isFinite(total)) {
      throw new Error("No se pudo calcular un total válido. Revisá los datos ingresados.");
    }

    return {
      tipo,
      localidad,
      hectareas,
      precioHa,
      base,
      recargo,
      aplicaRecargo,
      esChico,
      esLejos,
      total
    };
  }

  /* ---------- Validación ---------- */
  /* Acepta: 120 · 85,5 · 85.5 · 1.500 (miles con punto) · 1.500,5
     Un punto seguido de exactamente 3 dígitos (y sin 0 adelante) se lee como separador de miles,
     como se escribe en Argentina: "1.500" son mil quinientas hectáreas, no 1,5. */
  function leerHectareas(texto) {
    const limpio = String(texto).trim();
    let normal;
    if (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(limpio)) {
      normal = limpio.replace(/\./g, "").replace(",", ".");
    } else if (/^\d+(?:[.,]\d+)?$/.test(limpio)) {
      normal = limpio.replace(",", ".");
    } else {
      return null;
    }
    const n = Number(normal);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function maximoHectareas() {
    const m = config && Number(config.maximo_hectareas);
    return Number.isFinite(m) && m > 0 ? m : MAXIMO_HECTAREAS_POR_DEFECTO;
  }

  function limpiarErrorCampo(campo) {
    const input = $("calc-" + campo);
    const error = $("error-" + campo);
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
    if (input) input.removeAttribute("aria-invalid");
  }

  function mostrarError(campo, mensaje) {
    const input = $("calc-" + campo);
    const error = $("error-" + campo);
    if (!input || !error) return;
    error.textContent = mensaje;
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
  }

  function limpiarErrores() {
    ["nombre", "localidad", "hectareas", "tipo"].forEach(limpiarErrorCampo);
    const aviso = $("calc-aviso");
    if (aviso) {
      aviso.hidden = true;
      aviso.textContent = "";
    }
  }

  function alEditarCampo(evento) {
    const camposPorId = {
      "calc-nombre": "nombre",
      "calc-localidad": "localidad",
      "calc-hectareas": "hectareas",
      "calc-tipo": "tipo"
    };
    const campo = camposPorId[evento.target && evento.target.id];
    if (campo) limpiarErrorCampo(campo);
    reiniciarResultado();
  }

  function reiniciarResultado() {
    presupuestoActual = null;
    $("calc-resultado").hidden = true;
    $("calc-aviso").hidden = true;
  }

  /* ---------- Mostrar resultado ---------- */
  function mostrarResultado(p) {
    $("res-base-etiqueta").textContent = p.tipo.nombre;
    $("res-base-detalle").textContent = numero(p.hectareas) + " ha × " + dinero(p.precioHa);
    $("res-base").textContent = dinero(p.base);

    $("fila-recargo").hidden = !p.aplicaRecargo;
    if (p.aplicaRecargo) $("res-recargo").textContent = dinero(p.recargo);

    $("res-total").textContent = dinero(p.total);

    const c = config;
    let aclaracion;
    if (p.aplicaRecargo) {
      aclaracion = "Se suma el recargo de traslado porque son menos de " + c.limite_hectareas +
        " ha y " + p.localidad.nombre + " queda a " + p.localidad.distancia_km +
        " km (más de " + c.limite_distancia_km + " km).";
    } else if (!p.esChico) {
      aclaracion = "Sin recargo de traslado: como son " + c.limite_hectareas +
        " ha o más, no se cobra traslado quede donde quede.";
    } else {
      aclaracion = "Sin recargo de traslado: " + p.localidad.nombre + " queda a " +
        p.localidad.distancia_km + " km (hasta " + c.limite_distancia_km + " km no se cobra).";
    }
    $("res-aclaracion").textContent = aclaracion;

    const caja = $("calc-resultado");
    caja.hidden = false;
    caja.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /* ---------- Formulario ---------- */
  function alEnviar(evento) {
    evento.preventDefault();
    limpiarErrores();

    const nombre = $("calc-nombre").value.trim();
    const indice = $("calc-localidad").value;
    const hectareas = leerHectareas($("calc-hectareas").value);
    const tipoId = $("calc-tipo").value;

    const errores = [];
    if (nombre.length < 2) errores.push(["nombre", "Contanos tu nombre (mínimo 2 letras)."]);
    if (indice === "") errores.push(["localidad", "Elegí tu localidad de la lista."]);
    if (hectareas === null) {
      errores.push(["hectareas", "Poné las hectáreas con un número mayor a 0 (por ejemplo 120, 1.500 u 85,5)."]);
    } else if (hectareas > maximoHectareas()) {
      errores.push(["hectareas", "Para más de " + numero(maximoHectareas()) + " ha escribinos directo por WhatsApp y lo vemos juntos."]);
    }
    if (tipoId === "") errores.push(["tipo", "Elegí el tipo de aplicación."]);

    if (errores.length > 0) {
      errores.forEach(([campo, mensaje]) => mostrarError(campo, mensaje));
      $("calc-" + errores[0][0]).focus();
      reiniciarResultado();
      return;
    }

    try {
      presupuestoActual = Object.assign(
        { nombre },
        calcularPresupuesto(config, { indiceLocalidad: Number(indice), hectareas, tipoId })
      );
      mostrarResultado(presupuestoActual);
    } catch (error) {
      console.error("No se pudo calcular el presupuesto:", error);
      reiniciarResultado();
      const aviso = $("calc-aviso");
      aviso.textContent = error.message || "No se pudo calcular el presupuesto. Revisá los datos e intentá nuevamente.";
      aviso.hidden = false;
    }
  }

  /* ---------- WhatsApp ---------- */
  function enviarPorWhatsApp() {
    if (!presupuestoActual) return;

    const numeroWsp = normalizarWhatsapp(config.whatsapp);
    if (!numeroWsp) {
      const aviso = $("calc-aviso");
      aviso.textContent = "El número de WhatsApp de config.json no parece válido. Usá el formato internacional, con código de país y área (por ejemplo: 549XXXXXXXXXX).";
      aviso.hidden = false;
      return;
    }

    const p = presupuestoActual;
    const responsable = String((config.negocio && config.negocio.responsable) || "equipo GS Agroquímicos").trim();
    const mensaje = [
      "Hola " + responsable + ", ¿cómo andás? Soy " + p.nombre + ".",
      "Quería consultar por una aplicación con dron. Te paso los datos:",
      "",
      "DATOS DEL TRABAJO",
      "• Localidad: " + p.localidad.nombre,
      "• Superficie: " + numero(p.hectareas) + " ha",
      "• Tipo de aplicación: " + p.tipo.nombre,
      "",
      "PRESUPUESTO ESTIMADO",
      "• Precio por hectárea: " + dinero(p.precioHa),
      "• Aplicación: " + dinero(p.base),
      ...(p.aplicaRecargo ? ["• Traslado: " + dinero(p.recargo)] : []),
      "• TOTAL: " + dinero(p.total),
      "",
      "¿Podemos confirmar el presupuesto y coordinar?"
    ].join("\n");

    const url = "https://wa.me/" + numeroWsp + "?text=" + encodeURIComponent(mensaje);
    const ventana = window.open(url, "_blank");
    if (ventana) {
      ventana.opener = null;
    } else {
      window.location.href = url;   // si el navegador bloqueó la pestaña nueva
    }
  }

  /* ---------- Ventana flotante ---------- */
  function abrir() {
    const dialogo = $("dialogo-calculadora");
    if (dialogo.open) return;
    if (typeof dialogo.showModal === "function") {
      dialogo.showModal();
    } else {
      dialogo.setAttribute("open", "");
    }
    document.documentElement.classList.add("sin-scroll");
  }

  function cerrar() {
    const dialogo = $("dialogo-calculadora");
    if (typeof dialogo.close === "function") {
      dialogo.close();
    } else {
      dialogo.removeAttribute("open");
    }
    document.documentElement.classList.remove("sin-scroll");
  }

  function enlazarEventos() {
    const dialogo = $("dialogo-calculadora");

    document.querySelectorAll("[data-abrir-calculadora]").forEach((boton) => {
      boton.addEventListener("click", abrir);
    });
    $("calc-cerrar").addEventListener("click", cerrar);

    // Clic en el fondo oscuro cierra; también la tecla Esc (lo hace el navegador)
    dialogo.addEventListener("click", (e) => { if (e.target === dialogo) cerrar(); });
    dialogo.addEventListener("close", () => document.documentElement.classList.remove("sin-scroll"));

    const form = $("calc-form");
    form.addEventListener("submit", alEnviar);
    // Al editar, se limpia el error de ese campo y se oculta cualquier resultado anterior.
    form.addEventListener("input", alEditarCampo);
    form.addEventListener("change", alEditarCampo);

    $("calc-whatsapp").addEventListener("click", enviarPorWhatsApp);
  }

  /* ---------- Lo llama main.js cuando ya cargó el config.json ---------- */
  function iniciar(cfg) {
    config = cfg;

    try {
      const moneda = cfg.moneda || {};
      formateador = new Intl.NumberFormat(moneda.locale || "es-AR", {
        style: "currency",
        currency: moneda.codigo || "ARS",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      });
    } catch (e) {
      formateador = null;
    }

    // Lista de localidades (ordenadas A-Z; el value es la posición original en el config)
    const selLoc = $("calc-localidad");
    selLoc.replaceChildren(new Option("Elegí tu localidad", "", true, true));
    selLoc.options[0].disabled = true;
    cfg.localidades
      .map((loc, i) => ({ loc, i }))
      .sort((a, b) => a.loc.nombre.localeCompare(b.loc.nombre, "es"))
      .forEach(({ loc, i }) => selLoc.add(new Option(loc.nombre, String(i))));

    // Lista de tipos de aplicación
    const selTipo = $("calc-tipo");
    selTipo.replaceChildren(new Option("Elegí el tipo de aplicación", "", true, true));
    selTipo.options[0].disabled = true;
    cfg.tipos_aplicacion.forEach((t) => selTipo.add(new Option(t.nombre, t.id)));

    $("calc-nota").textContent =
      "Ojo: si el trabajo es de menos de " + cfg.limite_hectareas + " ha y queda a más de " +
      cfg.limite_distancia_km + " km, se suma un recargo de traslado de " + dinero(cfg.recargo_traslado) +
      ". Desde " + cfg.limite_hectareas + " ha no se cobra traslado, quede donde quede.";

    // Si el número de WhatsApp no sirve, no mostramos un botón que no puede funcionar
    $("calc-whatsapp").hidden = !normalizarWhatsapp(cfg.whatsapp);

    $("calc-sin-config").hidden = true;
    $("calc-form").hidden = false;
  }

  enlazarEventos();
  window.Calculadora = { iniciar, calcularPresupuesto, normalizarWhatsapp, leerHectareas };
})();
