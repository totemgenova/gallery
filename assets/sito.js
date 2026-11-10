(function () {
  "use strict";

  const C = window.CONFIG || {};
  const app = document.getElementById("app");
  let serate = [];

  document.getElementById("sottotitolo").textContent = C.sottotitolo || "";
  document.getElementById("luogo").textContent = C.luogo || "";
  if (C.emailRimozione) {
    const p = document.getElementById("rimozione");
    p.append("Vuoi far rimuovere una foto in cui compari? Scrivi a ");
    const a = document.createElement("a");
    a.href = "mailto:" + C.emailRimozione;
    a.textContent = C.emailRimozione;
    p.append(a, ".");
  }

  fetch("data/serate.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((d) => {
      serate = Array.isArray(d) ? d : [];
      vai();
      window.addEventListener("hashchange", vai);
    })
    .catch(() => (app.innerHTML = '<p class="stato">Impossibile caricare le foto. Riprova tra poco.</p>'));

  function vai() {
    const id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const s = serate.find((x) => x.id === id);
    chiudiLb();
    s ? mostraGalleria(s) : mostraElenco();
    window.scrollTo(0, 0);
  }

  const percorso = (s, tipo, f) => "foto/" + encodeURIComponent(s.id) + "/" + tipo + "/" + encodeURIComponent(f);
  const nomeFile = (s, f, i) => "TOTEM_" + s.id + "_" + String(i + 1).padStart(3, "0") + ".jpg";

  function dataBella(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function el(tag, attrs, figli) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) k === "testo" ? (e.textContent = attrs[k]) : e.setAttribute(k, attrs[k]);
    (figli || []).forEach((f) => f && e.appendChild(f));
    return e;
  }

  // ---------- Elenco serate ----------
  function mostraElenco() {
    app.innerHTML = "";
    if (!serate.length) {
      app.appendChild(el("p", { class: "stato", testo: "Stay tuned · le prime foto arrivano presto" }));
      return;
    }
    const lista = el("div", { class: "serate" });
    serate.forEach((s, i) => {
      lista.appendChild(
        el("a", { class: "serata", href: "#/" + encodeURIComponent(s.id) }, [
          el("img", { src: percorso(s, "thumb", s.foto[0]), alt: s.titolo, loading: i < 4 ? "eager" : "lazy" }),
          i === 0 ? el("span", { class: "badge", testo: "Ultima serata" }) : null,
          el("div", { class: "serata-info" }, [
            el("div", { class: "serata-data", testo: dataBella(s.data) }),
            el("div", { class: "serata-titolo", testo: s.titolo }),
            el("div", { class: "serata-num", testo: s.foto.length + " foto" }),
          ]),
        ])
      );
    });
    app.appendChild(lista);
  }

  // ---------- Galleria ----------
  let corrente = null;
  function mostraGalleria(s) {
    corrente = s;
    app.innerHTML = "";
    const btn = el("button", { class: "btn btn-oro", type: "button", testo: "Scarica tutte" });
    btn.addEventListener("click", () => scaricaTutte(s, btn));
    app.appendChild(
      el("div", { class: "gal-testa" }, [
        el("a", { class: "indietro", href: "#/", testo: "← Tutte le serate" }),
        el("div", { class: "gal-data", testo: dataBella(s.data) }),
        el("h1", { class: "gal-titolo", testo: s.titolo }),
        el("div", { class: "gal-num", testo: s.foto.length + " foto · tocca una foto per aprirla e scaricarla" }),
        btn,
      ])
    );
    const g = el("div", { class: "griglia" });
    s.foto.forEach((f, i) => {
      const b = el("button", { class: "miniatura", type: "button", "aria-label": "Apri foto " + (i + 1) }, [
        el("img", { src: percorso(s, "thumb", f), alt: "", loading: i < 12 ? "eager" : "lazy", decoding: "async" }),
      ]);
      b.addEventListener("click", () => apriLb(i));
      g.appendChild(b);
    });
    app.appendChild(g);
  }

  // ---------- Visualizzatore ----------
  const lb = document.getElementById("lb"), img = document.getElementById("lbImg");
  const conta = document.getElementById("lbConta"), scarica = document.getElementById("lbScarica");
  let indice = 0;
  function apriLb(i) { indice = i; mostra(); lb.hidden = false; document.body.style.overflow = "hidden"; }
  function chiudiLb() { lb.hidden = true; document.body.style.overflow = ""; img.removeAttribute("src"); }
  function mostra() {
    const s = corrente, f = s.foto[indice];
    img.src = percorso(s, "full", f);
    scarica.href = img.src;
    scarica.setAttribute("download", nomeFile(s, f, indice));
    conta.textContent = indice + 1 + " / " + s.foto.length;
    const n = s.foto[indice + 1];
    if (n) new Image().src = percorso(s, "full", n);
  }
  function sposta(d) { const t = corrente.foto.length; indice = (indice + d + t) % t; mostra(); }
  document.getElementById("lbChiudi").onclick = chiudiLb;
  document.getElementById("lbPrec").onclick = () => sposta(-1);
  document.getElementById("lbSucc").onclick = () => sposta(1);
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") chiudiLb();
    if (e.key === "ArrowLeft") sposta(-1);
    if (e.key === "ArrowRight") sposta(1);
  });
  let x0 = null, y0 = null;
  const palco = document.getElementById("lbPalco");
  palco.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  palco.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) sposta(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) chiudiLb();
    x0 = null;
  });

  // ---------- Scarica tutte (zip) ----------
  function caricaJSZip() {
    if (window.JSZip) return Promise.resolve();
    return new Promise((ok, ko) => {
      const sc = document.createElement("script");
      sc.src = "assets/jszip.min.js";
      sc.onload = ok; sc.onerror = ko;
      document.head.appendChild(sc);
    });
  }
  async function scaricaTutte(s, btn) {
    const testo = btn.textContent;
    btn.disabled = true;
    try {
      btn.textContent = "Preparazione…";
      await caricaJSZip();
      const zip = new JSZip();
      let fatte = 0;
      const coda = s.foto.map((f, i) => [f, i]);
      const lavora = async () => {
        while (coda.length) {
          const [f, i] = coda.shift();
          const r = await fetch(percorso(s, "full", f));
          if (!r.ok) throw new Error(f);
          zip.file(nomeFile(s, f, i), await r.blob());
          btn.textContent = "Scarico " + ++fatte + " / " + s.foto.length;
        }
      };
      await Promise.all([lavora(), lavora(), lavora(), lavora()]);
      btn.textContent = "Creo lo zip…";
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const a = el("a", { href: URL.createObjectURL(blob), download: "TOTEM_" + s.id + ".zip" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      btn.textContent = "✓ Fatto";
    } catch (e) {
      alert("Download non riuscito. Controlla la connessione e riprova, oppure scarica le foto una alla volta.");
    } finally {
      setTimeout(() => { btn.disabled = false; btn.textContent = testo; }, 2500);
    }
  }
})();
