/* ==========================================================
   main.js
   - Carga config.json y completa los textos de la página
   - Menú del celu
   - Animaciones al scrollear (respaldo con IntersectionObserver)
   - Línea de tiempo que se rellena
   - Galería con flechas
   ========================================================== */
(function () {
  "use strict";

  // Avisamos al CSS que hay JavaScript (lo usan las animaciones de respaldo)
  document.documentElement.classList.add("con-js");

  const preferencia = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sinMovimiento = () => preferencia.matches;

  const $ = (id) => document.getElementById(id);

  function crear(etiqueta, clases, texto) {
    const nodo = document.createElement(etiqueta);
    if (clases) nodo.className = clases;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
  }

  function ponerTexto(id, texto) {
    const nodo = $(id);
    if (nodo && typeof texto === "string") nodo.textContent = texto;
  }

  /* ---------- 1. Cargar y validar config.json ---------- */
  async function cargarConfig() {
    let respuesta;
    try {
      respuesta = await fetch("config.json", { cache: "no-store" });
    } catch (e) {
      throw new Error("No se pudo leer config.json.");
    }
    if (!respuesta.ok) {
      throw new Error("No se encontró config.json (error " + respuesta.status + "). Revisá que esté en la misma carpeta que index.html.");
    }

    let datos;
    try {
      datos = await respuesta.json();
    } catch (e) {
      throw new Error("El config.json tiene un error de escritura. Revisá las comas y las comillas.");
    }

    validarConfig(datos);
    return datos;
  }

  function validarConfig(c) {
    const mal = [];
    if (!c.whatsapp) mal.push("whatsapp");
    if (!Array.isArray(c.tipos_aplicacion) || c.tipos_aplicacion.length === 0) mal.push("tipos_aplicacion");
    if (!Array.isArray(c.localidades) || c.localidades.length === 0) mal.push("localidades");
    ["limite_hectareas", "limite_distancia_km", "recargo_traslado"].forEach((clave) => {
      if (typeof c[clave] !== "number") mal.push(clave);
    });
    if (mal.length > 0) {
      throw new Error("En config.json falta o está mal: " + mal.join(", ") + ".");
    }
  }

  function mostrarErrorConfig(error) {
    console.error(error);
    ponerTexto("aviso-config-texto", error.message);
    $("aviso-config").hidden = false;
  }

  /* ---------- 2. Completar la página con los datos del config ---------- */
  function linkWhatsapp(c, mensaje) {
    const numero = String(c.whatsapp).replace(/\D/g, "");
    return "https://wa.me/" + numero + "?text=" + encodeURIComponent(mensaje);
  }

  function renderizar(c) {
    ponerTexto("texto-banner", c.negocio && c.negocio.banner);

    const h = c.hero || {};
    ponerTexto("hero-etiqueta", h.etiqueta);
    ponerTexto("hero-titulo", h.titulo);
    ponerTexto("hero-frase", h.frase);
    ponerTexto("hero-boton", h.boton);

    const pq = c.por_que || {};
    ponerTexto("titulo-por-que", pq.titulo);
    ponerTexto("subtitulo-por-que", pq.subtitulo);
    renderizarTarjetas(pq.tarjetas || []);

    const pa = c.pasos || {};
    ponerTexto("titulo-pasos", pa.titulo);
    ponerTexto("subtitulo-pasos", pa.subtitulo);
    renderizarPasos(pa.items || []);

    const ga = c.galeria || {};
    ponerTexto("titulo-galeria", ga.titulo);
    ponerTexto("subtitulo-galeria", ga.subtitulo);
    renderizarGaleria(ga.fotos || []);

    const ca = c.calculadora || {};
    ponerTexto("titulo-calculadora", ca.titulo);
    ponerTexto("texto-calculadora", ca.texto);
    ponerTexto("boton-calculadora", ca.boton);

    const co = c.contacto || {};
    ponerTexto("titulo-contacto", co.titulo);
    ponerTexto("texto-contacto", co.texto);
    ponerTexto("texto-zona", co.zona);

    const url = linkWhatsapp(c, co.mensaje_directo || "Hola, quería hacer una consulta.");
    $("boton-whatsapp").href = url;
    $("pie-whatsapp").href = url;
    if (co.boton) {
      $("boton-whatsapp").lastChild.textContent = " " + co.boton;
    }

    const textoPie = (c.footer && c.footer.texto) || "";
    ponerTexto("pie-texto", textoPie.replace("{anio}", new Date().getFullYear()));
  }

  function renderizarTarjetas(lista) {
    const contenedor = $("lista-tarjetas");
    contenedor.replaceChildren();
    lista.forEach((t, i) => {
      const tarjeta = crear("article", "tarjeta revelar-pc");
      tarjeta.style.setProperty("--i", i);          // para el retraso escalonado
      const icono = crear("span", "tarjeta__icono", t.icono || "🌱");
      icono.setAttribute("aria-hidden", "true");
      tarjeta.append(icono, crear("h3", "tarjeta__titulo", t.titulo), crear("p", "tarjeta__texto", t.texto));
      contenedor.append(tarjeta);
    });
  }

  function renderizarPasos(lista) {
    const contenedor = $("lista-pasos");
    contenedor.replaceChildren();
    lista.forEach((p, i) => {
      const paso = crear("li", "paso revelar-pc");
      paso.style.setProperty("--i", i);
      const marca = crear("span", "paso__marca", String(i + 1));
      marca.setAttribute("aria-hidden", "true");
      paso.append(marca, crear("h3", "paso__titulo", p.titulo), crear("p", "paso__texto", p.texto));
      contenedor.append(paso);
    });
  }

  function renderizarGaleria(fotos) {
    const contenedor = $("galeria-pista");
    contenedor.replaceChildren();
    fotos.forEach((f, i) => {
      const figura = crear("figure", "foto foto--" + ((i % 3) + 1));
      const img = document.createElement("img");
      // Si la foto no existe, se esconde y queda el fondo de color (sin ícono roto)
      img.addEventListener("error", () => img.classList.add("sin-imagen"));
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 800;
      img.height = 600;
      img.alt = f.alt || "";
      img.src = f.src;
      figura.append(img);
      contenedor.append(figura);
    });
  }

  /* ---------- 3. Video del hero ---------- */
  function iniciarVideo() {
    const video = document.querySelector(".hero__video");
    if (!video) return;
    const ocultar = () => video.classList.add("sin-video");
    video.addEventListener("error", ocultar);
    const fuente = video.querySelector("source");
    if (fuente) fuente.addEventListener("error", ocultar);

    // Si pidió menos movimiento: no reproducimos el video, queda el poster
    if (sinMovimiento()) {
      video.removeAttribute("autoplay");
      video.pause();
    }
  }

  /* ---------- 4. Menú del celu + sombra del header ---------- */
  function iniciarMenu() {
    const boton = $("boton-menu");
    const menu = $("menu-principal");
    const header = document.querySelector(".sitio-header");

    const cerrar = () => {
      menu.classList.remove("abierto");
      boton.setAttribute("aria-expanded", "false");
      boton.setAttribute("aria-label", "Abrir menú");
    };

    boton.addEventListener("click", () => {
      const abierto = menu.classList.toggle("abierto");
      boton.setAttribute("aria-expanded", String(abierto));
      boton.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
    });

    menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", cerrar));
    document.querySelectorAll("[data-abrir-calculadora]").forEach((b) => b.addEventListener("click", cerrar));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".navbar")) cerrar();
    });
    window.matchMedia("(min-width: 900px)").addEventListener("change", cerrar);

    const alScrollear = () => header.classList.toggle("con-sombra", window.scrollY > 8);
    window.addEventListener("scroll", alScrollear, { passive: true });
    alScrollear();
  }

  /* ---------- 5. Animaciones al scrollear ----------
     Si el navegador soporta animaciones ligadas al scroll, lo hace todo el CSS.
     Si no, usamos IntersectionObserver para sumar la clase "visible". */
  function iniciarAnimaciones() {
    const elementos = document.querySelectorAll(".revelar, .revelar-pc");

    if (sinMovimiento() || (window.CSS && CSS.supports("animation-timeline: view()"))) return;

    if (!("IntersectionObserver" in window)) {
      elementos.forEach((el) => el.classList.add("visible"));
      return;
    }

    const observador = new IntersectionObserver((entradas, obs) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) {
          entrada.target.classList.add("visible");
          obs.unobserve(entrada.target);   // se anima una sola vez
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });

    elementos.forEach((el) => observador.observe(el));
  }

  /* ---------- 6. Línea de tiempo que se rellena al bajar ---------- */
  function iniciarLineaTiempo() {
    const pista = $("lista-pasos");
    if (!pista) return;
    const pasos = Array.from(pista.querySelectorAll(".paso"));
    if (pasos.length === 0) return;

    function pintar(p) {
      pista.style.setProperty("--progreso", p.toFixed(3));
      pasos.forEach((paso, i) => {
        const umbral = pasos.length > 1 ? i / (pasos.length - 1) : 0;
        paso.classList.toggle("activo", p >= umbral - 0.001);
      });
    }

    // Sin animaciones: mostramos todo ya completo
    if (sinMovimiento()) { pintar(1); return; }

    let pendiente = false;
    function calcular() {
      pendiente = false;
      const arriba = pista.getBoundingClientRect().top;
      const alto = window.innerHeight;
      // Empieza cuando la línea sube al 80% de la pantalla y termina al 40%
      const p = (alto * 0.8 - arriba) / (alto * 0.4);
      pintar(Math.min(1, Math.max(0, p)));
    }
    function pedirCalculo() {
      if (!pendiente) { pendiente = true; requestAnimationFrame(calcular); }
    }

    window.addEventListener("scroll", pedirCalculo, { passive: true });
    window.addEventListener("resize", pedirCalculo);
    calcular();
  }

  /* ---------- 7. Carruseles: accesibilidad con teclado + flechas de la galería ---------- */
  function iniciarDeslizables() {
    const zonas = document.querySelectorAll(".deslizable");
    const revisar = () => zonas.forEach((zona) => {
      // Solo se puede enfocar con teclado si realmente se puede scrollear de costado
      if (zona.scrollWidth > zona.clientWidth + 1) zona.setAttribute("tabindex", "0");
      else zona.removeAttribute("tabindex");
    });
    window.addEventListener("resize", revisar);
    revisar();
  }

  function iniciarGaleria() {
    const pista = $("galeria-pista");
    const anterior = $("galeria-anterior");
    const siguiente = $("galeria-siguiente");
    if (!pista || !anterior || !siguiente) return;

    const mover = (direccion) => pista.scrollBy({
      left: direccion * pista.clientWidth * 0.8,
      behavior: sinMovimiento() ? "auto" : "smooth"
    });
    anterior.addEventListener("click", () => mover(-1));
    siguiente.addEventListener("click", () => mover(1));

    const actualizar = () => {
      const maximo = pista.scrollWidth - pista.clientWidth;
      anterior.disabled = pista.scrollLeft <= 4;
      siguiente.disabled = pista.scrollLeft >= maximo - 4;
    };
    pista.addEventListener("scroll", actualizar, { passive: true });
    window.addEventListener("resize", actualizar);
    actualizar();
  }

  /* ---------- Arranque ---------- */
  async function iniciar() {
    iniciarMenu();
    iniciarVideo();

    try {
      const config = await cargarConfig();
      renderizar(config);
      window.Calculadora.iniciar(config);
    } catch (error) {
      mostrarErrorConfig(error);
    }

    iniciarAnimaciones();
    iniciarLineaTiempo();
    iniciarDeslizables();
    iniciarGaleria();
  }

  iniciar();
})();
