// Piccolo aiutante per parlare con GitHub (usato da pannello e installatore)
window.GH = (function () {
  "use strict";

  function crea(owner, repo, token) {
    const base = "https://api.github.com/repos/" + owner + "/" + repo;

    async function api(metodo, percorso, corpo, tentativi) {
      tentativi = tentativi == null ? 4 : tentativi;
      const r = await fetch(percorso.startsWith("http") ? percorso : base + percorso, {
        method: metodo,
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(corpo ? { "Content-Type": "application/json" } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      if ((r.status === 403 || r.status === 429 || r.status >= 500) && tentativi > 0) {
        const attesa = Number(r.headers.get("retry-after")) || (5 - tentativi) * 8 + 4;
        await new Promise((ok) => setTimeout(ok, attesa * 1000));
        return api(metodo, percorso, corpo, tentativi - 1);
      }
      const testo = await r.text();
      let dati = null;
      try { dati = testo ? JSON.parse(testo) : null; } catch (e) { dati = testo; }
      if (!r.ok) {
        const err = new Error((dati && dati.message) || "Errore GitHub " + r.status);
        err.status = r.status;
        throw err;
      }
      return dati;
    }

    let ramo = null;
    async function ramoPrincipale() {
      if (!ramo) ramo = (await api("GET", "")).default_branch || "main";
      return ramo;
    }

    async function blob(base64) {
      return (await api("POST", "/git/blobs", { content: base64, encoding: "base64" })).sha;
    }

    // voci: [{path, sha}] oppure [{path, content}] oppure [{path, sha:null}] per cancellare
    async function commit(voci, messaggio) {
      const b = await ramoPrincipale();
      for (let i = 0; i < 4; i++) {
        const ref = await api("GET", "/git/ref/heads/" + b);
        const padre = await api("GET", "/git/commits/" + ref.object.sha);
        const albero = await api("POST", "/git/trees", {
          base_tree: padre.tree.sha,
          tree: voci.map((v) => ({ path: v.path, mode: "100644", type: "blob", ...("content" in v ? { content: v.content } : { sha: v.sha }) })),
        });
        const nuovo = await api("POST", "/git/commits", { message: messaggio, tree: albero.sha, parents: [ref.object.sha] });
        try {
          await api("PATCH", "/git/refs/heads/" + b, { sha: nuovo.sha });
          return nuovo.sha;
        } catch (e) {
          if (e.status !== 422 && e.status !== 409) throw e; // qualcun altro ha appena salvato: riprovo
        }
      }
      throw new Error("Impossibile salvare su GitHub, riprova tra poco.");
    }

    async function albero() {
      const b = await ramoPrincipale();
      const t = await api("GET", "/git/trees/" + b + "?recursive=1");
      return t.tree || [];
    }

    async function leggiTesto(sha) {
      const d = await api("GET", "/git/blobs/" + sha);
      return decodeURIComponent(escape(atob(d.content.replace(/\n/g, ""))));
    }

    async function statoPubblicazione(sha) {
      const d = await api("GET", "/actions/runs?head_sha=" + sha + "&per_page=5");
      const run = (d.workflow_runs || [])[0];
      if (!run) return "attesa";
      if (run.status !== "completed") return "in corso";
      return run.conclusion === "success" ? "ok" : "errore";
    }

    return { api, ramoPrincipale, blob, commit, albero, leggiTesto, statoPubblicazione };
  }

  function bufferBase64(buf) {
    const b = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function testoBase64(t) {
    return btoa(unescape(encodeURIComponent(t)));
  }
  function urlSito(owner, repo) {
    const o = owner.toLowerCase();
    return repo.toLowerCase() === o + ".github.io" ? "https://" + o + ".github.io/" : "https://" + o + ".github.io/" + repo + "/";
  }

  return { crea, bufferBase64, testoBase64, urlSito };
})();
