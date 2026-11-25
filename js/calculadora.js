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
    const localidad = cfg.localidades[datos.indiceLocalidad];
    if (!tipo || !localidad) {
      throw new Error("Falta el tipo de aplicación o la localidad.");
    }

    const hectareas = datos.hectareas;
    const base = Math.round(hectareas * tipo.precio_por_hectarea * 100) / 100;

    const esChico = hectareas < cfg.limite_hectareas;
    const esLejos = localidad.distancia_km > cfg.limite_distancia_km;
    const aplicaRecargo = esChico && esLejos;
    const recargo = aplicaRecargo ? cfg.recargo_traslado : 0;

    return {
      tipo,
      localidad,
      hectareas,
      precioHa: tipo.precio_por_hectarea,
      base,
      recargo,
      aplicaRecargo,
      esChico,
      esLejos,
      total: base + recargo
    };
  }

  /* ---------- Validación ---------- */
  function leerHectareas(texto) {
    const limpio = String(texto).trim();
    if (!/^\d+(?:[.,]\d+)?$/.test(limpio)) return null;   // solo números, con coma o punto
    const n = Number(limpio.replace(",", "."));
    return n > 0 ? n : null;
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
    ["nombre", "localidad", "hectareas", "tipo"].forEach((campo) => {
      const input = $("calc-" + campo);
      const error = $("error-" + campo);
      if (error) { error.hidden = true; error.textContent = ""; }
      if (input) input.removeAttribute("aria-invalid");
    });
    $("calc-aviso").hidden = true;
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
    if (hectareas === null) errores.push(["hectareas", "Poné las hectáreas con un número mayor a 0 (por ejemplo 120 o 85,5)."]);
    if (tipoId === "") errores.push(["tipo", "Elegí el tipo de aplicación."]);

    if (errores.length > 0) {
      errores.forEach(([campo, mensaje]) => mostrarError(campo, mensaje));
      $("calc-" + errores[0][0]).focus();
      reiniciarResultado();
      return;
    }

    presupuestoActual = Object.assign(
      { nombre },
      calcularPresupuesto(config, { indiceLocalidad: Number(indice), hectareas, tipoId })
    );
    mostrarResultado(presupuestoActual);
  }

  /* ---------- WhatsApp ---------- */
  function enviarPorWhatsApp() {
    if (!presupuestoActual) return;

    const numeroWsp = String(config.whatsapp || "").replace(/\D/g, "");
    if (numeroWsp.length < 10) {
      const aviso = $("calc-aviso");
      aviso.textContent = "El número de WhatsApp del config.json no es válido. Revisalo (formato 549 + código de área + número).";
      aviso.hidden = false;
      return;
    }

    const p = presupuestoActual;
    const mensaje = [
      "Hola Guido, ¿cómo andás? Soy " + p.nombre + ".",
      "Te paso los datos para un presupuesto de aplicación con dron:",
      "",
      "• Localidad: " + p.localidad.nombre,
      "• Hectáreas: " + numero(p.hectareas),
      "• Tipo de aplicación: " + p.tipo.nombre,
      "• Total estimado: " + dinero(p.total),
      "",
      "Ojo: es un presupuesto estimativo, hecho con la calculadora de la web. ¿Lo confirmamos?"
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
    // Si cambia cualquier dato, el resultado viejo se esconde (así no se manda un total desactualizado)
    form.addEventListener("input", reiniciarResultado);
    form.addEventListener("change", reiniciarResultado);

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

    $("calc-sin-config").hidden = true;
    $("calc-form").hidden = false;
  }

  enlazarEventos();
  window.Calculadora = { iniciar, calcularPresupuesto };
})();
