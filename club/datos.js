/*
 * EMM Detail · demo conectada: club de socios, TPV y gestión del taller.
 *
 * Todo vive en el navegador (localStorage) y las tres pantallas se avisan
 * entre ellas al momento (BroadcastChannel + evento storage): lo que se
 * reserva en la app sale en la agenda, lo que se cobra en el TPV suma puntos
 * en la app, y el coche que el taller marca «listo» avisa al socio.
 *
 * Las reglas del club son las del club de CBD Lugo (club-socios): 1 punto por
 * euro, niveles por puntos acumulados, canje con código de un solo uso que
 * caduca a los 15 minutos, y monedero prepagado con bono por recarga que no se
 * devuelve en efectivo.
 */
(function () {
  const CLAVE = "emm-demo-v2";
  const canal = "BroadcastChannel" in window ? new BroadcastChannel("emm-demo") : null;
  const oyentes = [];

  /* ───────── Utilidades ───────── */
  const r2 = (n) => Math.round(n * 100) / 100;
  const eur = (n) => r2(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const id = (p) => p + Math.random().toString(36).slice(2, 8);
  const hoyISO = () => fechaISO(new Date());
  function fechaISO(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }
  function sumarDias(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return fechaISO(d);
  }
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function fechaCorta(iso) {
    const d = new Date(iso + "T12:00:00");
    return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()]}`;
  }
  function horaDe(isoCompleto) {
    const d = new Date(isoCompleto);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  /* ───────── Catálogo fijo (la carta real de EMM Detail) ───────── */
  // p: [hasta 5 plazas, más de 5 plazas] · un solo valor = mismo precio · h: horas de trabajo
  const SERVICIOS = [
    { k: "mant", c: "Lavados", n: "Lavado de mantenimiento", h: 2.5, p: [45, 65] },
    { k: "premium", c: "Lavados", n: "Lavado Premium EMMD", h: 3.5, p: [119, 139] },
    { k: "tapiceria", c: "Lavados", n: "Limpieza de tapicería", h: 4.5, p: [179, 199] },
    { k: "integral", c: "Lavados", n: "Limpieza Integral Premium", h: 7.5, p: [229] },
    { k: "detailing", c: "Lavados", n: "Detailing Integral Interior + Exterior", h: 9, p: [279] },
    { k: "pul1", c: "Pulidos", n: "Pulido abrillantado + cera híbrida", h: 16, dias: 2, p: [419, 479] },
    { k: "pul2", c: "Pulidos", n: "Pulido + cerámico Light", h: 16, dias: 2, p: [549, 619] },
    { k: "pul3", c: "Pulidos", n: "Pulido profesional + cerámico Infinite", h: 32, dias: 4, p: [789, 859] },
    { k: "cristales", c: "Extras", n: "Cerámico de cristales", h: 4, p: [99] },
    { k: "cuero", c: "Extras", n: "Limpieza y protección de cuero (por plaza)", h: 2, p: [29] },
  ];
  const HORARIO = { 0: null, 1: [9, 19], 2: [9, 19], 3: [9, 19], 4: [9, 19], 5: [9, 19], 6: [9, 14] };
  const PUESTOS = 2; // coches a la vez en el taller
  const NIVELES = [
    { n: "Bronce", desde: 0, dto: 0, color: "#c08a5b", ventajas: ["1 punto por cada euro", "Reserva desde la app"] },
    { n: "Plata", desde: 300, dto: 5, color: "#c7ced8", ventajas: ["5 % en todos los servicios", "Horas reservadas para socios"] },
    { n: "Oro", desde: 800, dto: 10, color: "#e7c35a", ventajas: ["10 % en todos los servicios", "Horas reservadas para socios", "Recogida y entrega del coche en Lugo"] },
  ];
  const ESTADOS = ["recibido", "proceso", "calidad", "listo", "entregado"];
  const NOMBRE_ESTADO = { recibido: "Recibido", proceso: "En proceso", calidad: "Control de calidad", listo: "Listo para recoger", entregado: "Entregado" };

  /* ───────── Datos de ejemplo ───────── */
  function semilla() {
    const hoy = hoyISO();
    const hace = (n) => sumarDias(hoy, -n);
    // Dentro de n días, saltando el domingo (cerrado)
    const laborable = (n) => { const d = sumarDias(hoy, n); return new Date(d + "T12:00:00").getDay() === 0 ? sumarDias(d, 1) : d; };
    const socios = [
      { id: "s1", nombre: "Lucía Pérez", tel: "600 123 456", email: "lucia@ejemplo.com", alta: hace(210), puntos: 410, acumulados: 860, saldo: 32.5, tarjeta: "EMM-0001",
        coches: [{ id: "c1", modelo: "BMW Serie 1 negro", matricula: "4821 LKJ", plazas: 0 }] },
      { id: "s2", nombre: "Diego Fernández", tel: "611 222 333", email: "diego@ejemplo.com", alta: hace(150), puntos: 180, acumulados: 420, saldo: 0, tarjeta: "EMM-0002",
        coches: [{ id: "c2", modelo: "Golf GTI blanco", matricula: "9034 MBC", plazas: 0 }] },
      { id: "s3", nombre: "Marta Rodríguez", tel: "622 444 555", email: "marta@ejemplo.com", alta: hace(60), puntos: 95, acumulados: 95, saldo: 55, tarjeta: "EMM-0003",
        coches: [{ id: "c3", modelo: "Tesla Model Y gris", matricula: "2210 MNP", plazas: 0 }] },
      { id: "s4", nombre: "Andrés López", tel: "633 666 777", email: "andres@ejemplo.com", alta: hace(330), puntos: 620, acumulados: 1240, saldo: 110, tarjeta: "EMM-0004",
        coches: [{ id: "c4", modelo: "Audi Q5 azul", matricula: "7765 KZT", plazas: 0 }, { id: "c5", modelo: "VW Multivan gris", matricula: "1189 LRF", plazas: 1 }] },
      { id: "s5", nombre: "Sara Novo", tel: "644 888 999", email: "sara@ejemplo.com", alta: hace(20), puntos: 45, acumulados: 45, saldo: 0, tarjeta: "EMM-0005",
        coches: [{ id: "c6", modelo: "Seat León rojo", matricula: "5532 MRS", plazas: 0 }] },
    ];
    const productos = [
      { id: "p1", n: "Champú pH neutro 500 ml", precio: 14.9, stock: 12, minimo: 4 },
      { id: "p2", n: "Quick detailer 500 ml", precio: 16.9, stock: 8, minimo: 4 },
      { id: "p3", n: "Cera en spray 500 ml", precio: 19.9, stock: 3, minimo: 4 },
      { id: "p4", n: "Abrillantador de neumáticos", precio: 12.9, stock: 10, minimo: 3 },
      { id: "p5", n: "Kit 3 microfibras premium", precio: 15.9, stock: 15, minimo: 5 },
      { id: "p6", n: "Ambientador EMM Black Ice", precio: 6.9, stock: 30, minimo: 10 },
      { id: "p7", n: "Tarjeta regalo 50 €", precio: 50, stock: 99, minimo: 0 },
    ];
    const recompensas = [
      { id: "r1", n: "Ambientador EMM Black Ice", puntos: 150, valor: 6.9, producto: "p6" },
      { id: "r2", n: "20 € de descuento", puntos: 400, valor: 20 },
      { id: "r3", n: "Lavado de mantenimiento", puntos: 450, valor: 45, servicio: "mant" },
      { id: "r4", n: "Cerámico de cristales", puntos: 900, valor: 99, servicio: "cristales" },
    ];
    // Citas de esta semana y coches ya en el taller
    const citas = [];
    const ordenes = [];
    const cita = (dia, hora, socio, coche, servicio, origen, extra = {}) => {
      const c = { id: id("ci"), fecha: dia, hora, socioId: socio, cocheId: coche, servicio, origen, estado: "pendiente", ...extra };
      citas.push(c);
      return c;
    };
    const ord = (c, estado, km, notas) => {
      c.estado = "en_taller";
      ordenes.push({ id: id("ot"), citaId: c.id, socioId: c.socioId, cocheId: c.cocheId, servicio: c.servicio, estado, km, notas,
        entrada: `${c.fecha}T${c.hora}:00`, historia: [{ estado: "recibido", en: `${c.fecha}T${c.hora}:00` }].concat(estado !== "recibido" ? [{ estado, en: new Date().toISOString() }] : []) });
    };
    // El coche de Lucía (la del móvil de la demo) está en el taller: así se ve el aviso en directo.
    ord(cita(hoy, "09:00", "s1", "c1", "premium", "app"), "proceso", 48210, "Arañazos leves en la puerta trasera derecha");
    ord(cita(sumarDias(hoy, -1), "09:00", "s4", "c4", "pul2", "app"), "proceso", 61500, "Pulido + cerámico Light, sale mañana");
    ord(cita(hoy, "10:00", null, null, "mant", "mostrador", { cliente: "Pablo (sin cuenta)", coche: "Renault Clio gris", plazas: 0 }), "calidad", 91300, "");
    cita(hoy, "12:00", "s2", "c2", "premium", "app");
    cita(hoy, "16:00", "s5", "c6", "mant", "telefono");
    cita(sumarDias(hoy, 1), "09:00", "s4", "c5", "tapiceria", "app");
    cita(laborable(6), "10:00", "s1", "c1", "cristales", "app");
    cita(sumarDias(hoy, 1), "11:00", "s3", "c3", "cristales", "app");
    cita(sumarDias(hoy, 2), "09:30", null, null, "detailing", "telefono", { cliente: "Iria Castro", coche: "Mini Cooper verde", plazas: 0 });
    // Ventas de los últimos 30 días (para caja e informes)
    const tickets = [];
    const nombres = ["mant", "premium", "tapiceria", "mant", "integral", "pul1", "mant", "premium", "cristales", "detailing", "pul2", "mant"];
    let n = 1;
    for (let d = 29; d >= 1; d--) {
      const dia = hace(d);
      const dow = new Date(dia + "T12:00:00").getDay();
      if (dow === 0) continue;
      const cuantos = 1 + ((d * 7) % 3);
      for (let j = 0; j < cuantos; j++) {
        const k = nombres[(d + j) % nombres.length];
        const s = SERVICIOS.find((x) => x.k === k);
        const socio = (d + j) % 3 === 0 ? null : socios[(d + j) % socios.length];
        const base = s.p[0];
        const dto = socio ? nivelPorAcumulados(socio.acumulados).dto : 0;
        const total = r2(base * (1 - dto / 100));
        const forma = ["tarjeta", "efectivo", "tarjeta", "saldo"][(d + j) % 4];
        tickets.push({ id: id("t"), num: n++, fecha: `${dia}T${String(10 + j * 2).padStart(2, "0")}:15:00`, socioId: socio ? socio.id : null,
          lineas: [{ tipo: "servicio", ref: k, n: s.n, cant: 1, precio: base, dto }], total, pagos: { [socio || forma !== "saldo" ? forma : "tarjeta"]: total }, puntos: socio ? Math.floor(total) : 0 });
      }
    }
    // Productos sueltos vendidos
    tickets.push({ id: id("t"), num: n++, fecha: `${hace(2)}T17:40:00`, socioId: "s1", lineas: [{ tipo: "producto", ref: "p1", n: "Champú pH neutro 500 ml", cant: 2, precio: 14.9, dto: 0 }], total: 29.8, pagos: { tarjeta: 29.8 }, puntos: 29 });
    const movimientos = [
      { id: id("m"), socioId: "s1", fecha: `${hace(12)}T11:00:00`, tipo: "recarga", texto: "Recarga de 50,00 € (+5,00 € de regalo)", saldo: 55 },
      { id: id("m"), socioId: "s1", fecha: `${hace(9)}T12:30:00`, tipo: "compra", texto: "Lavado Premium EMMD", puntos: 107, saldo: -22.5 },
      { id: id("m"), socioId: "s1", fecha: `${hace(2)}T17:40:00`, tipo: "compra", texto: "Champú pH neutro ×2", puntos: 29 },
      { id: id("m"), socioId: "s4", fecha: `${hace(20)}T10:00:00`, tipo: "recarga", texto: "Recarga de 100,00 € (+10,00 € de regalo)", saldo: 110 },
      { id: id("m"), socioId: "s4", fecha: `${hace(15)}T18:00:00`, tipo: "canje", texto: "Canje: 20 € de descuento", puntos: -400 },
      { id: id("m"), socioId: "s3", fecha: `${hace(30)}T10:00:00`, tipo: "recarga", texto: "Recarga de 50,00 € (+5,00 € de regalo)", saldo: 55 },
    ];
    return {
      version: 1,
      config: { puntosPorEuro: 1, bonoRecarga: 10, horasSocio: ["09:00", "16:00"] },
      socios, productos, recompensas, citas, ordenes, tickets, movimientos,
      canjes: [], pedidos: [], avisos: [], ofertas: [{ id: id("of"), fecha: `${hace(3)}T09:00:00`, texto: "Noviembre: cerámico de cristales a 79 € para socios. ¡Prepárate para la lluvia!" }],
      siguienteTicket: n,
    };
  }

  /* ───────── Guardar y avisar a las otras pantallas ───────── */
  function cargar() {
    try {
      const t = localStorage.getItem(CLAVE);
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  }
  let E = cargar() || semilla();
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(E)); } catch { /* sin almacenamiento: sigue en memoria */ }
    if (canal) canal.postMessage("cambio");
    avisarOyentes();
  }
  function avisarOyentes() { oyentes.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); }
  function recargarDeDisco() { const x = cargar(); if (x) { E = x; avisarOyentes(); } }
  if (canal) canal.onmessage = recargarDeDisco;
  window.addEventListener("storage", (e) => { if (e.key === CLAVE) recargarDeDisco(); });
  if (!cargar()) guardar();

  /* ───────── Reglas ───────── */
  function nivelPorAcumulados(acumulados) {
    let n = NIVELES[0];
    for (const x of NIVELES) if (acumulados >= x.desde) n = x;
    return n;
  }
  const socio = (sid) => E.socios.find((s) => s.id === sid) || null;
  const nivel = (s) => nivelPorAcumulados(s ? s.acumulados : 0);
  function siguienteNivel(s) {
    const i = NIVELES.indexOf(nivel(s));
    return NIVELES[i + 1] || null;
  }
  const servicio = (k) => SERVICIOS.find((s) => s.k === k);
  const producto = (pid) => E.productos.find((p) => p.id === pid);
  const coche = (s, cid) => (s ? s.coches.find((c) => c.id === cid) : null) || null;
  function precioBase(k, plazas = 0) {
    const s = servicio(k);
    return s.p.length > 1 ? s.p[plazas ? 1 : 0] : s.p[0];
  }
  function precioSocio(k, plazas, s) {
    const b = precioBase(k, plazas);
    return r2(b * (1 - (s ? nivel(s).dto : 0) / 100));
  }
  function movimiento(sid, tipo, texto, extra = {}) {
    E.movimientos.push({ id: id("m"), socioId: sid, fecha: new Date().toISOString(), tipo, texto, ...extra });
  }
  function aviso(sid, texto, tipo = "info") {
    E.avisos.push({ id: id("a"), socioId: sid, fecha: new Date().toISOString(), texto, tipo, leido: false });
  }
  function sumarPuntos(s, n, texto) {
    if (!s || n <= 0) return;
    s.puntos += n;
    const antes = nivel(s);
    s.acumulados += n;
    const despues = nivel(s);
    if (despues !== antes) aviso(s.id, `¡Has subido a nivel ${despues.n}! Ahora tienes un ${despues.dto} % en todos los servicios.`, "nivel");
    void texto;
  }

  /* ───────── Agenda ───────── */
  function ocupacion(fecha, hora) {
    // Cuántos coches hay a esa hora: citas del día que la cubren + trabajos de varios días empezados antes
    const [h] = hora.split(":").map(Number);
    return E.citas.filter((c) => {
      if (c.estado === "cancelada") return false;
      const s = servicio(c.servicio);
      if (s.dias) {
        const fin = sumarDias(c.fecha, s.dias - 1);
        return c.fecha <= fecha && fecha <= fin;
      }
      if (c.fecha !== fecha) return false;
      const ini = Number(c.hora.split(":")[0]) + Number(c.hora.split(":")[1]) / 60;
      return h >= Math.floor(ini) && h < ini + s.h;
    }).length;
  }
  function huecos(fecha, k, esSocio) {
    const d = new Date(fecha + "T12:00:00");
    const hor = HORARIO[d.getDay()];
    if (!hor) return [];
    const s = servicio(k);
    const lista = [];
    for (let h = hor[0]; h < hor[1]; h++) {
      const hora = `${String(h).padStart(2, "0")}:00`;
      if (s.dias && h > 10) continue; // los trabajos largos se dejan por la mañana
      if (!s.dias && h + Math.min(s.h, 9) > hor[1] + 0.01 && s.h < 7) continue;
      if (s.h >= 7 && !s.dias && h > 10) continue;
      const soloSocio = E.config.horasSocio.includes(hora);
      const libre = ocupacion(fecha, hora) < PUESTOS;
      if (fecha === hoyISO() && h <= new Date().getHours()) continue;
      lista.push({ hora, libre: libre && (!soloSocio || esSocio), soloSocio });
    }
    return lista;
  }
  function reservar({ socioId = null, cocheId = null, servicio: k, fecha, hora, origen = "app", cliente, cocheTexto, plazas = 0, tel }) {
    const s = socio(socioId);
    const c = { id: id("ci"), fecha, hora, socioId, cocheId, servicio: k, origen, estado: "pendiente", cliente, coche: cocheTexto, plazas, tel };
    E.citas.push(c);
    if (s) {
      aviso(s.id, `Cita confirmada: ${servicio(k).n}, ${fechaCorta(fecha)} a las ${hora}.`, "cita");
      movimiento(s.id, "cita", `Reserva: ${servicio(k).n} · ${fechaCorta(fecha)} ${hora}`);
    }
    guardar();
    return c;
  }
  function cancelarCita(cid) {
    const c = E.citas.find((x) => x.id === cid);
    if (!c) return;
    c.estado = "cancelada";
    if (c.socioId) aviso(c.socioId, `Tu cita del ${fechaCorta(c.fecha)} a las ${c.hora} está cancelada.`, "cita");
    guardar();
  }

  /* ───────── Órdenes de trabajo ───────── */
  function recibirCoche(cid, { km = "", notas = "" } = {}) {
    const c = E.citas.find((x) => x.id === cid);
    if (!c || c.estado !== "pendiente") return null;
    c.estado = "en_taller";
    const o = { id: id("ot"), citaId: c.id, socioId: c.socioId, cocheId: c.cocheId, servicio: c.servicio, estado: "recibido", km, notas,
      entrada: new Date().toISOString(), historia: [{ estado: "recibido", en: new Date().toISOString() }] };
    E.ordenes.push(o);
    if (c.socioId) aviso(c.socioId, `Hemos recibido tu ${cocheDeOrden(o)}. Te avisamos en cuanto esté listo.`, "coche");
    guardar();
    return o;
  }
  function moverOrden(oid, estado) {
    const o = E.ordenes.find((x) => x.id === oid);
    if (!o || !ESTADOS.includes(estado)) return;
    o.estado = estado;
    o.historia.push({ estado, en: new Date().toISOString() });
    if (o.socioId) {
      if (estado === "proceso") aviso(o.socioId, `Ya estamos trabajando en tu ${cocheDeOrden(o)}.`, "coche");
      if (estado === "listo") aviso(o.socioId, `¡Tu ${cocheDeOrden(o)} está listo! Puedes pasar a recogerlo hasta las 19:00.`, "listo");
    }
    guardar();
  }
  function cocheDeOrden(o) {
    const cita = E.citas.find((c) => c.id === o.citaId);
    const s = socio(o.socioId);
    const ch = coche(s, o.cocheId);
    return ch ? ch.modelo : cita?.coche || "coche";
  }
  function plazasDeOrden(o) {
    const s = socio(o.socioId);
    const ch = coche(s, o.cocheId);
    const cita = E.citas.find((c) => c.id === o.citaId);
    return ch ? ch.plazas : cita?.plazas || 0;
  }

  /* ───────── Monedero, canjes y tienda ───────── */
  function recargar(sid, importe, via = "efectivo") {
    const s = socio(sid);
    importe = r2(Number(importe));
    if (!s || !(importe > 0)) throw new Error("Importe no válido.");
    const regalo = r2((importe * E.config.bonoRecarga) / 100);
    s.saldo = r2(s.saldo + importe + regalo);
    movimiento(sid, "recarga", `Recarga de ${eur(importe)} (+${eur(regalo)} de regalo) · ${via}`, { saldo: importe + regalo });
    aviso(sid, `Recarga hecha: ${eur(importe)} + ${eur(regalo)} de regalo. Saldo: ${eur(s.saldo)}.`, "saldo");
    guardar();
    return regalo;
  }
  function generarCanje(sid, rid) {
    const s = socio(sid);
    const r = E.recompensas.find((x) => x.id === rid);
    if (!s || !r) throw new Error("Recompensa no válida.");
    if (s.puntos < r.puntos) throw new Error(`Te faltan ${r.puntos - s.puntos} puntos.`);
    const codigo = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    const cj = { codigo, socioId: sid, recompensaId: rid, creado: Date.now(), caduca: Date.now() + 15 * 60 * 1000, usado: false };
    E.canjes = E.canjes.filter((x) => !(x.socioId === sid && !x.usado));
    E.canjes.push(cj);
    guardar();
    return cj;
  }
  function buscarCanje(codigo) {
    const cj = E.canjes.find((x) => x.codigo === String(codigo).trim().toUpperCase());
    if (!cj) return { error: "Ese código no existe." };
    if (cj.usado) return { error: "Ese código ya se ha usado." };
    if (Date.now() > cj.caduca) return { error: "Ese código ha caducado (duran 15 minutos)." };
    return { canje: cj, recompensa: E.recompensas.find((r) => r.id === cj.recompensaId), socio: socio(cj.socioId) };
  }
  function pedirProducto(sid, pid, cant = 1) {
    const s = socio(sid);
    const p = producto(pid);
    const total = r2(p.precio * cant);
    if (!s || !p) throw new Error("Producto no válido.");
    if (p.stock < cant) throw new Error("No queda stock suficiente.");
    if (s.saldo < total) throw new Error(`Te falta saldo: tienes ${eur(s.saldo)}.`);
    s.saldo = r2(s.saldo - total);
    p.stock -= cant;
    const pts = Math.floor(total * E.config.puntosPorEuro);
    sumarPuntos(s, pts);
    const pd = { id: id("pd"), num: E.pedidos.length + 1, socioId: sid, productoId: pid, cant, total, fecha: new Date().toISOString(), estado: "pendiente" };
    E.pedidos.push(pd);
    E.tickets.push({ id: id("t"), num: E.siguienteTicket++, fecha: pd.fecha, socioId: sid, lineas: [{ tipo: "producto", ref: pid, n: p.n, cant, precio: p.precio, dto: 0 }], total, pagos: { saldo: total }, puntos: pts, origen: "app" });
    movimiento(sid, "compra", `Tienda: ${p.n} ×${cant} (recoger en el taller)`, { puntos: pts, saldo: -total });
    aviso(sid, `Pedido hecho: ${p.n}. Te lo tenemos preparado en el mostrador.`, "pedido");
    guardar();
    return pd;
  }
  function entregarPedido(pdid) {
    const pd = E.pedidos.find((x) => x.id === pdid);
    if (!pd) return;
    pd.estado = "entregado";
    guardar();
  }

  /* ───────── Cobro en el TPV ───────── */
  // lineas: [{tipo:'servicio'|'producto'|'canje', ref, n, cant, precio, dto}]
  function totalTicket(lineas) {
    return r2(lineas.reduce((t, l) => t + l.cant * l.precio * (1 - (l.dto || 0) / 100), 0));
  }
  function cobrar({ socioId = null, lineas, pagos, canjeCodigo = null, ordenId = null }) {
    const s = socio(socioId);
    const total = totalTicket(lineas);
    const pagado = r2(Object.values(pagos).reduce((a, b) => a + (Number(b) || 0), 0));
    if (Math.abs(pagado - total) > 0.009) throw new Error(`Faltan ${eur(total - pagado)} por cobrar.`);
    // Primero se comprueba todo; solo después se toca nada (si algo falla, no queda medio cobrado).
    if (pagos.saldo) {
      if (!s) throw new Error("Para pagar con saldo hace falta un socio.");
      if (s.saldo + 0.001 < pagos.saldo) throw new Error(`El socio solo tiene ${eur(s.saldo)} de saldo.`);
    }
    const r = canjeCodigo ? buscarCanje(canjeCodigo) : null;
    if (r && r.error) throw new Error(r.error);
    if (pagos.saldo) s.saldo = r2(s.saldo - pagos.saldo);
    for (const l of lineas) if (l.tipo === "producto") { const p = producto(l.ref); if (p) p.stock = Math.max(0, p.stock - l.cant); }
    let canjeTexto = "";
    if (r) {
      r.canje.usado = true;
      r.socio.puntos -= r.recompensa.puntos;
      movimiento(r.socio.id, "canje", `Canje: ${r.recompensa.n}`, { puntos: -r.recompensa.puntos });
      canjeTexto = r.recompensa.n;
    }
    const pts = s ? Math.floor((total) * E.config.puntosPorEuro) : 0;
    if (s) sumarPuntos(s, pts);
    const t = { id: id("t"), num: E.siguienteTicket++, fecha: new Date().toISOString(), socioId, lineas, total, pagos, puntos: pts, origen: "tpv" };
    E.tickets.push(t);
    if (s) {
      movimiento(s.id, "compra", lineas.filter((l) => l.tipo !== "canje").map((l) => l.n + (l.cant > 1 ? ` ×${l.cant}` : "")).join(", ") || "Compra", { puntos: pts, saldo: pagos.saldo ? -pagos.saldo : undefined });
      aviso(s.id, `Gracias por tu visita: ${eur(total)}${pts ? ` · +${pts} puntos` : ""}${canjeTexto ? ` · canjeado: ${canjeTexto}` : ""}.`, "compra");
    }
    if (ordenId) moverOrdenSinGuardar(ordenId, "entregado");
    guardar();
    return t;
  }
  function moverOrdenSinGuardar(oid, estado) {
    const o = E.ordenes.find((x) => x.id === oid);
    if (!o) return;
    o.estado = estado;
    o.historia.push({ estado, en: new Date().toISOString() });
    const c = E.citas.find((x) => x.id === o.citaId);
    if (c && estado === "entregado") c.estado = "hecha";
  }

  /* ───────── Socios y club ───────── */
  function altaSocio({ nombre, tel, email = "", modelo = "", matricula = "", plazas = 0 }) {
    if (!nombre || !tel) throw new Error("Nombre y teléfono son obligatorios.");
    const n = E.socios.length + 1;
    const s = { id: id("s"), nombre, tel, email, alta: hoyISO(), puntos: 50, acumulados: 50, saldo: 0, tarjeta: `EMM-${String(n).padStart(4, "0")}`,
      coches: modelo ? [{ id: id("c"), modelo, matricula, plazas }] : [] };
    E.socios.push(s);
    movimiento(s.id, "alta", "Bienvenida al club EMM: +50 puntos", { puntos: 50 });
    aviso(s.id, "¡Bienvenido al club EMM! Te regalamos 50 puntos para empezar.", "nivel");
    guardar();
    return s;
  }
  function ajustarPuntos(sid, n, motivo) {
    const s = socio(sid);
    if (!s) return;
    s.puntos = Math.max(0, s.puntos + n);
    if (n > 0) s.acumulados += n;
    movimiento(sid, "ajuste", `Ajuste: ${motivo || "manual"}`, { puntos: n });
    guardar();
  }
  function enviarOferta(texto) {
    if (!texto.trim()) return;
    E.ofertas.unshift({ id: id("of"), fecha: new Date().toISOString(), texto: texto.trim() });
    for (const s of E.socios) aviso(s.id, texto.trim(), "oferta");
    guardar();
  }
  function marcarLeidos(sid) {
    let cambio = false;
    for (const a of E.avisos) if (a.socioId === sid && !a.leido) { a.leido = true; cambio = true; }
    if (cambio) guardar();
  }
  function guardarConfig(parcial) {
    Object.assign(E.config, parcial);
    guardar();
  }
  function guardarProducto(pid, cambios) {
    const p = producto(pid);
    if (p) Object.assign(p, cambios);
    guardar();
  }
  function reiniciar() {
    E = semilla();
    guardar();
  }

  /* ───────── Informes ───────── */
  function caja(fecha = hoyISO()) {
    const del = E.tickets.filter((t) => t.fecha.slice(0, 10) === fecha);
    const formas = { efectivo: 0, tarjeta: 0, bizum: 0, saldo: 0 };
    for (const t of del) for (const [f, v] of Object.entries(t.pagos)) formas[f] = r2((formas[f] || 0) + v);
    return { tickets: del, total: r2(del.reduce((a, t) => a + t.total, 0)), formas };
  }
  function informe(dias = 30) {
    const desde = sumarDias(hoyISO(), -dias + 1);
    const ts = E.tickets.filter((t) => t.fecha.slice(0, 10) >= desde);
    const porDia = {};
    for (let i = dias - 1; i >= 0; i--) porDia[sumarDias(hoyISO(), -i)] = 0;
    for (const t of ts) porDia[t.fecha.slice(0, 10)] = r2((porDia[t.fecha.slice(0, 10)] || 0) + t.total);
    const porServicio = {};
    for (const t of ts) for (const l of t.lineas) if (l.tipo === "servicio") porServicio[l.n] = (porServicio[l.n] || 0) + l.cant;
    const total = r2(ts.reduce((a, t) => a + t.total, 0));
    const deSocios = r2(ts.filter((t) => t.socioId).reduce((a, t) => a + t.total, 0));
    return { total, tickets: ts.length, medio: ts.length ? r2(total / ts.length) : 0, deSocios, pctSocios: total ? Math.round((deSocios / total) * 100) : 0, porDia, porServicio };
  }

  window.EMM = {
    get estado() { return E; },
    alCambiar: (f) => oyentes.push(f),
    // catálogo y reglas
    SERVICIOS, NIVELES, ESTADOS, NOMBRE_ESTADO, HORARIO,
    servicio, producto, socio, coche, nivel, siguienteNivel, precioBase, precioSocio, totalTicket,
    // agenda y taller
    huecos, reservar, cancelarCita, recibirCoche, moverOrden, cocheDeOrden, plazasDeOrden,
    // club
    recargar, generarCanje, buscarCanje, pedirProducto, entregarPedido, altaSocio, ajustarPuntos, enviarOferta, marcarLeidos, guardarConfig, guardarProducto,
    // caja
    cobrar, caja, informe, reiniciar,
    // utilidades
    eur, r2, hoyISO, sumarDias, fechaCorta, horaDe, fechaISO,
  };
})();
