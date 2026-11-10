(function () {
  "use strict";

  const C = window.CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const LATO_GRANDE = 1800, QUALITA_GRANDE = 0.8;
  const LATO_MINI = 520, QUALITA_MINI = 0.72;
  const MAX_ZIP = 18 * 1024 * 1024;

  // ---------- Quale repository? ----------
  function trovaRepo() {
    if (C.owner && C.repo) return { owner: C.owner, repo: C.repo };
    const h = location.hostname;
    if (h.endsWith(".github.io")) {
      const owner = h.replace(".github.io", "");
      const primo = location.pathname.split("/").filter(Boolean)[0];
      const repo = primo && !primo.endsWith(".html") ? primo : h;
      return { owner, repo };
    }
    return null;
  }
  const R = trovaRepo();

  const memoria = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
  };

  let gh = null;
  let serate = []; // {id, titolo, data, foto:[], inAttesa:n, percorsi:[]}

  function mostraVista(id) {
    ["vAccesso", "vElenco", "vCarica", "vGestisci"].forEach((v) => ($(v).hidden = v !== id));
    window.scrollTo(0, 0);
  }

  // ---------- Accesso ----------
  async function entra(token) {
    if (!R) throw new Error("Apri questa pagina dall'indirizzo del sito (….github.io).");
    const prova = GH.crea(R.owner, R.repo, token);
    const info = await prova.api("GET", "");
    if (!info.permissions || !info.permissions.push) throw new Error("La chiave non ha il permesso di scrivere su questo sito.");
    gh = prova;
    memoria.set("totem_token", token);
  }

  $("entra").onclick = async () => {
    const t = $("token").value.trim();
    $("errAccesso").textContent = "";
    if (!t) return;
    $("entra").disabled = true;
    try { await entra(t); await caricaElenco(); }
    catch (e) { $("errAccesso").textContent = e.status === 401 ? "Chiave non valida o scaduta." : e.message; }
    $("entra").disabled = false;
  };
  $("token").addEventListener("keydown", (e) => e.key === "Enter" && $("entra").click());
  $("esci").onclick = () => { memoria.set("totem_token", null); gh = null; $("token").value = ""; mostraVista("vAccesso"); };
  $("aggiorna").onclick = () => caricaElenco();

  // ---------- Elenco serate ----------
  async function caricaElenco() {
    mostraVista("vElenco");
    $("lista").innerHTML = '<p class="nota">Caricamento…</p>';
    const albero = await gh.albero();
    const mappa = {};
    const prendi = (id) => (mappa[id] = mappa[id] || { id, titolo: id, data: "", foto: [], inAttesa: 0, percorsi: [], infoSha: null });
    albero.forEach((v) => {
      if (v.type !== "blob") return;
      let m = v.path.match(/^foto\/([^/]+)\/(.+)$/);
      if (m) {
        const s = prendi(m[1]);
        s.percorsi.push(v.path);
        if (m[2] === "info.json") s.infoSha = v.sha;
        const f = m[2].match(/^full\/([^/]+\.jpg)$/);
        if (f) s.foto.push(f[1]);
        return;
      }
      m = v.path.match(/^upload\/(.+?)__.+\.zip$/);
      if (m) { const s = prendi(m[1]); s.inAttesa++; s.percorsi.push(v.path); }
    });
    serate = Object.values(mappa);
    await Promise.all(serate.map(async (s) => {
      if (!s.infoSha) return;
      try { const i = JSON.parse(await gh.leggiTesto(s.infoSha)); s.titolo = i.titolo || s.id; s.data = i.data || ""; } catch (e) {}
    }));
    serate.forEach((s) => s.foto.sort());
    serate.sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id));
    disegnaElenco();
  }

  function dataBella(iso) {
    if (!iso) return "";
    return new Date(iso + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  }

  function disegnaElenco() {
    const L = $("lista");
    L.innerHTML = "";
    if (!serate.length) { L.innerHTML = '<p class="nota">Nessuna serata ancora. Creane una qui sopra.</p>'; return; }
    serate.forEach((s) => {
      const v = document.createElement("div");
      v.className = "voce";
      const anteprima = s.foto.length ? Object.assign(document.createElement("img"), { src: "foto/" + s.id + "/thumb/" + s.foto[0], alt: "", loading: "lazy" }) : Object.assign(document.createElement("div"), { className: "vuota" });
      anteprima.onerror = () => anteprima.replaceWith(Object.assign(document.createElement("div"), { className: "vuota" }));
      const testo = document.createElement("div");
      testo.innerHTML = '<div class="t"></div><div class="s"></div>';
      testo.querySelector(".t").textContent = s.titolo;
      testo.querySelector(".s").textContent = dataBella(s.data) + " · " + s.foto.length + " foto";
      if (s.inAttesa) testo.querySelector(".s").insertAdjacentHTML("beforeend", " · <b>nuove foto in pubblicazione…</b>");
      const az = document.createElement("div");
      az.className = "az";
      az.append(
        bottone("Aggiungi foto", "btn btn-piccolo btn-oro", () => apriCarica(s)),
        bottone("Gestisci", "btn btn-piccolo", () => apriGestisci(s)),
        bottone("Elimina", "btn btn-piccolo btn-pericolo", () => eliminaSerata(s))
      );
      v.append(anteprima, testo, az);
      L.appendChild(v);
    });
  }
  function bottone(t, cls, fn) { const b = document.createElement("button"); b.className = cls; b.textContent = t; b.onclick = fn; return b; }

  // ---------- Nuova serata ----------
  function domenicaRecente() {
    const d = new Date(); d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  }
  $("nData").value = domenicaRecente();
  function slug(t) {
    return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }
  $("crea").onclick = () => {
    const titolo = $("nTitolo").value.trim(), data = $("nData").value;
    if (!titolo) { $("nTitolo").focus(); return; }
    if (!data) { $("nData").focus(); return; }
    let id = data + (slug(titolo) ? "-" + slug(titolo) : ""), n = 2;
    while (serate.some((s) => s.id === id)) id = data + "-" + slug(titolo) + "-" + n++;
    $("nTitolo").value = "";
    apriCarica({ id, titolo, data, foto: [], inAttesa: 0, percorsi: [], nuova: true });
  };

  // ---------- Caricamento foto ----------
  let destinazione = null, scelte = [], occupato = false;

  function apriCarica(s) {
    destinazione = s;
    scelte.forEach((x) => URL.revokeObjectURL(x.url));
    scelte = [];
    $("caricaTitolo").textContent = s.titolo + " · " + dataBella(s.data);
    $("anteprime").innerHTML = "";
    $("avanzamento").hidden = true;
    $("zona").hidden = false;
    aggiornaPulsante();
    mostraVista("vCarica");
  }
  $("annullaCarica").onclick = () => { if (!occupato) caricaElenco(); };

  function aggiungiFile(lista) {
    if (occupato) return;
    [...lista].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name)).forEach((f) => {
      if (scelte.some((x) => x.file.name === f.name && x.file.size === f.size)) return;
      const x = { file: f, url: URL.createObjectURL(f) };
      scelte.push(x);
      const d = document.createElement("div");
      d.className = "ant";
      d.innerHTML = '<img alt=""><button title="Togli">&times;</button>';
      d.querySelector("img").src = x.url;
      d.querySelector("button").onclick = () => { if (occupato) return; scelte = scelte.filter((y) => y !== x); URL.revokeObjectURL(x.url); d.remove(); aggiornaPulsante(); };
      $("anteprime").appendChild(d);
    });
    aggiornaPulsante();
  }
  function aggiornaPulsante() {
    $("pubblica").disabled = !scelte.length || occupato;
    $("pubblica").textContent = scelte.length ? "Pubblica " + scelte.length + " foto" : "Pubblica";
  }
  $("file").onchange = (e) => { aggiungiFile(e.target.files); e.target.value = ""; };
  const zona = $("zona");
  ["dragenter", "dragover"].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add("sopra"); }));
  ["dragleave", "drop"].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.remove("sopra"); }));
  zona.addEventListener("drop", (e) => aggiungiFile(e.dataTransfer.files));

  function caricaImmagine(file) {
    return new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Formato non supportato: " + file.name));
      i.src = URL.createObjectURL(file);
    });
  }
  async function decodifica(file) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) { return caricaImmagine(file); }
  }
  function ridimensiona(src, lato, q) {
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    const k = Math.min(1, lato / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("Errore immagine"))), "image/jpeg", q));
  }

  function stato(testo, perc, classe) {
    $("avanzamento").hidden = false;
    $("msgCarica").textContent = testo;
    $("msgCarica").className = "messaggio " + (classe || "");
    if (perc != null) $("barra").style.width = Math.round(perc) + "%";
  }

  $("pubblica").onclick = async () => {
    if (!scelte.length || occupato) return;
    occupato = true;
    aggiornaPulsante();
    $("zona").hidden = true;
    window.onbeforeunload = () => "Caricamento in corso";
    const s = destinazione, timbro = Date.now().toString(36), tot = scelte.length;
    const voci = [];
    let zip = new JSZip(), dimZip = 0, nZip = 0, saltate = 0;

    async function inviaZip() {
      if (!dimZip) return;
      stato("Invio a GitHub…", null);
      const buf = await zip.generateAsync({ type: "arraybuffer", compression: "STORE" });
      const sha = await gh.blob(GH.bufferBase64(buf));
      voci.push({ path: "upload/" + s.id + "__" + timbro + "-" + nZip++ + ".zip", sha });
      zip = new JSZip(); dimZip = 0;
    }

    try {
      const ordinate = scelte.slice().sort((a, b) => a.file.lastModified - b.file.lastModified || a.file.name.localeCompare(b.file.name));
      for (let i = 0; i < tot; i++) {
        stato("Preparo le foto… " + (i + 1) + " / " + tot, (i / tot) * 90);
        let img;
        try { img = await decodifica(ordinate[i].file); }
        catch (e) { saltate++; continue; }
        const nome = timbro + "-" + String(i).padStart(4, "0") + ".jpg";
        const [g, m] = await Promise.all([ridimensiona(img, LATO_GRANDE, QUALITA_GRANDE), ridimensiona(img, LATO_MINI, QUALITA_MINI)]);
        if (img.close) img.close();
        zip.file(s.id + "/full/" + nome, g);
        zip.file(s.id + "/thumb/" + nome, m);
        dimZip += g.size + m.size;
        if (dimZip > MAX_ZIP) await inviaZip();
      }
      await inviaZip();
      if (!voci.length) throw new Error("Nessuna foto valida da caricare.");
      if (s.nuova || !s.infoSha) voci.push({ path: "foto/" + s.id + "/info.json", content: JSON.stringify({ titolo: s.titolo, data: s.data }) });
      stato("Salvo…", 95);
      const sha = await gh.commit(voci, "Nuove foto: " + s.titolo);
      window.onbeforeunload = null;
      stato("✓ Caricate " + (tot - saltate) + " foto" + (saltate ? " (" + saltate + " saltate: formato non leggibile)" : "") + ". Pubblicazione sul sito in corso…", 100, "ok");
      attendiPubblicazione(sha);
      setTimeout(() => { occupato = false; caricaElenco(); }, 3500);
    } catch (e) {
      window.onbeforeunload = null;
      occupato = false;
      $("zona").hidden = false;
      aggiornaPulsante();
      stato("Errore: " + e.message + " — riprova.", 0, "errore");
    }
  };

  // Mostra quando il sito è aggiornato (in alto, sopra l'elenco)
  async function attendiPubblicazione(sha, cb) {
    const avviso = document.createElement("div");
    avviso.className = "scheda messaggio";
    avviso.textContent = "Pubblicazione in corso… di solito 1–2 minuti.";
    $("vElenco").prepend(avviso);
    for (let i = 0; i < 60; i++) {
      await new Promise((ok) => setTimeout(ok, 6000));
      let st;
      try { st = await gh.statoPubblicazione(sha); } catch (e) { avviso.textContent = "Le foto saranno online tra 1–2 minuti."; return; }
      if (st === "ok") { avviso.textContent = "✓ Sito aggiornato! Le foto sono online."; avviso.classList.add("ok"); if (!$("vElenco").hidden) caricaElenco(); setTimeout(() => avviso.remove(), 15000); return; }
      if (st === "errore") { avviso.textContent = "La pubblicazione non è riuscita. Premi “Aggiorna” e riprova a caricare."; avviso.classList.add("errore"); return; }
    }
  }

  // ---------- Gestione foto ----------
  let inGestione = null, selezionate = new Set();
  function apriGestisci(s) {
    inGestione = s; selezionate = new Set();
    $("gestTitolo").textContent = s.titolo + " · " + s.foto.length + " foto";
    $("msgGest").textContent = "";
    const G = $("gestFoto");
    G.innerHTML = s.foto.length ? "" : '<p class="nota">Nessuna foto pubblicata.</p>';
    s.foto.forEach((f) => {
      const d = document.createElement("div");
      d.className = "ant cliccabile";
      d.innerHTML = '<img alt="" loading="lazy">';
      d.querySelector("img").src = "foto/" + s.id + "/thumb/" + f;
      d.onclick = () => { selezionate.has(f) ? selezionate.delete(f) : selezionate.add(f); d.classList.toggle("sel"); aggSel(); };
      G.appendChild(d);
    });
    aggSel();
    mostraVista("vGestisci");
  }
  function aggSel() {
    $("eliminaSel").disabled = !selezionate.size;
    $("eliminaSel").textContent = selezionate.size ? "Elimina " + selezionate.size + " foto" : "Elimina selezionate";
  }
  $("chiudiGest").onclick = () => caricaElenco();
  $("eliminaSel").onclick = async () => {
    const s = inGestione, n = selezionate.size;
    if (!n || !confirm("Eliminare " + n + " foto da “" + s.titolo + "”?")) return;
    $("eliminaSel").disabled = true;
    $("msgGest").textContent = "Elimino…";
    try {
      const voci = [];
      selezionate.forEach((f) => voci.push({ path: "foto/" + s.id + "/full/" + f, sha: null }, { path: "foto/" + s.id + "/thumb/" + f, sha: null }));
      const sha = await gh.commit(voci, "Rimosse " + n + " foto da " + s.titolo);
      await caricaElenco();
      attendiPubblicazione(sha);
    } catch (e) {
      $("msgGest").textContent = "Errore: " + e.message;
      $("msgGest").className = "messaggio errore";
      aggSel();
    }
  };

  async function eliminaSerata(s) {
    if (!confirm("Eliminare tutta la serata “" + s.titolo + "” (" + s.foto.length + " foto)? Non si può annullare.")) return;
    try {
      const sha = await gh.commit(s.percorsi.map((p) => ({ path: p, sha: null })), "Eliminata serata " + s.titolo);
      await caricaElenco();
      attendiPubblicazione(sha);
    } catch (e) { alert("Errore: " + e.message); }
  }

  // ---------- Avvio ----------
  (async () => {
    const t = memoria.get("totem_token");
    if (t) {
      try { await entra(t); await caricaElenco(); return; } catch (e) { memoria.set("totem_token", null); }
    }
    mostraVista("vAccesso");
    if (!R) $("errAccesso").textContent = "Apri questa pagina dall'indirizzo del sito (….github.io/…/admin.html).";
  })();
})();
