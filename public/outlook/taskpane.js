// The Assistant add-in's side panel. It reads only the open mail (Office.js, ReadItem) and talks to
// Assistant's public endpoints on this same host, with a personal token kept in the add-in's
// roaming settings.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let token = "";
  let due = null;

  const pad = (n) => String(n).padStart(2, "0");
  // Dates are Seoul dates, like everywhere in Assistant.
  function seoulDate(offsetDays) {
    const d = new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  function endOfWeek() {
    const weekday = new Date(Date.now() + 9 * 3600e3).getUTCDay();
    const toFriday = (5 - weekday + 7) % 7 || 7;
    return seoulDate(toFriday);
  }

  async function api(path, body) {
    const res = await fetch(`/api/v1/public/${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { detail = (await res.json()).detail || detail; } catch (_) { /* not JSON */ }
      throw new Error(res.status === 401 ? "The token doesn't work anymore; connect again." : detail);
    }
    return res.json();
  }

  // ---- the open mail ----------------------------------------------------------------

  function mail() {
    const item = Office.context.mailbox.item;
    const from = item.from ? (item.from.displayName ? `${item.from.displayName} <${item.from.emailAddress}>` : item.from.emailAddress) : "";
    return { subject: item.subject || "(no subject)", from, link: webLink(item) };
  }

  /** A link that opens this mail in Outlook on the web. */
  function webLink(item) {
    try {
      const host = (Office.context.mailbox.diagnostics.hostName || "").toLowerCase();
      // Phones already use REST-style IDs; elsewhere they're converted.
      const id = host.includes("ios") || host.includes("android") ? item.itemId : Office.context.mailbox.convertToRestId(item.itemId, Office.MailboxEnums.RestVersion.v2_0);
      return `https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(id)}`;
    } catch (_) {
      return null;
    }
  }

  function body() {
    return new Promise((resolve, reject) =>
      Office.context.mailbox.item.body.getAsync(Office.CoercionType.Text, (r) => (r.status === Office.AsyncResultStatus.Succeeded ? resolve(r.value) : reject(r.error))),
    );
  }

  function mailNote(m) {
    return [`From: ${m.from}`, m.link ? `[Open in Outlook](${m.link})` : null].filter(Boolean).join("\n");
  }

  // ---- screens --------------------------------------------------------------------------

  function show(id) {
    for (const s of ["loading", "setup", "mail"]) $(s).hidden = s !== id;
  }

  async function start() {
    token = Office.context.roamingSettings.get("token") || "";
    if (!token) return show("setup");
    show("mail");
    const m = mail();
    $("title").value = m.subject;
    renderDue();
    try {
      for (const p of await api("projects")) {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.name;
        $("project").appendChild(o);
      }
    } catch (e) {
      $("error").textContent = e.message;
    }
  }

  function renderDue() {
    const choices = [["No date", null], ["Today", seoulDate(0)], ["Tomorrow", seoulDate(1)], ["End of week", endOfWeek()]];
    $("dueChoices").replaceChildren(
      ...choices.map(([label, date]) => {
        const b = document.createElement("button");
        b.className = "chip" + (due === date ? " on" : "");
        b.textContent = label;
        b.onclick = () => { due = date; renderDue(); };
        return b;
      }),
    );
  }

  function finished(message, url) {
    $("done").hidden = false;
    $("done").textContent = message;
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.textContent = " Open";
      $("done").appendChild(a);
    }
  }

  async function addTask() {
    $("error").textContent = "";
    $("add").disabled = true;
    try {
      const m = mail();
      const r = await api("tasks", {
        title: $("title").value.trim() || m.subject,
        description: mailNote(m),
        due: due ? { date: due } : null,
        projectId: $("project").value || null,
        labels: $("reply").checked ? ["reply"] : [],
      });
      finished("Added to Assistant.", r.url);
    } catch (e) {
      $("error").textContent = e.message;
    } finally {
      $("add").disabled = false;
    }
  }

  let picks = [];

  async function analyze() {
    $("error").textContent = "";
    $("analyze").disabled = true;
    $("analyze").textContent = "Reading…";
    try {
      const m = mail();
      const text = `Mail from ${m.from}, subject: ${m.subject}\n\n${(await body()).slice(0, 40000)}`;
      const r = await api("analyze", { text });
      picks = r.items.map((p) => ({ p, keep: true, title: p.title }));
      renderPicks();
    } catch (e) {
      $("error").textContent = e.message;
    } finally {
      $("analyze").disabled = false;
      $("analyze").textContent = "Analyze again";
    }
  }

  function describe(p) {
    if (p.kind === "event" && p.start) return `Event · ${p.start.slice(0, 16).replace("T", " ")}–${p.end.slice(11, 16)}`;
    if (p.kind === "event" && p.startDate) return `Event · ${p.startDate} (all day)`;
    if (p.due) return `Task · due ${p.due.date}${p.due.time ? " " + p.due.time.slice(0, 5) : ""}`;
    return "Task · no due date";
  }

  function renderPicks() {
    $("proposals").replaceChildren(
      ...(picks.length ? picks : [null]).map((x) => {
        if (!x) {
          const p = document.createElement("p");
          p.className = "muted";
          p.textContent = "Nothing to track found.";
          return p;
        }
        const row = document.createElement("div");
        row.className = "proposal";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = x.keep;
        box.onchange = () => { x.keep = box.checked; };
        const col = document.createElement("div");
        col.style.flex = "1";
        const title = document.createElement("input");
        title.type = "text";
        title.value = x.title;
        title.oninput = () => { x.title = title.value; };
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = describe(x.p) + (x.p.description ? ` · ${x.p.description}` : "");
        col.append(title, meta);
        row.append(box, col);
        return row;
      }),
    );
    $("createPicked").hidden = !picks.length;
  }

  async function createPicked() {
    $("error").textContent = "";
    $("createPicked").disabled = true;
    try {
      const note = mailNote(mail());
      let n = 0;
      for (const x of picks.filter((x) => x.keep)) {
        const p = x.p;
        const description = [p.description, note].filter(Boolean).join("\n\n");
        if (p.kind === "event") await api("events", { title: x.title, notes: description, start: p.start, end: p.end, startDate: p.startDate, endDate: p.endDate });
        else await api("tasks", { title: x.title, description, due: p.due, projectId: p.projectId, priority: p.priority || "none" });
        n++;
      }
      finished(`Added ${n} to Assistant.`);
    } catch (e) {
      $("error").textContent = e.message;
    } finally {
      $("createPicked").disabled = false;
    }
  }

  function save(key, value) {
    return new Promise((resolve, reject) => {
      if (value === null) Office.context.roamingSettings.remove(key);
      else Office.context.roamingSettings.set(key, value);
      Office.context.roamingSettings.saveAsync((r) => (r.status === Office.AsyncResultStatus.Succeeded ? resolve() : reject(r.error)));
    });
  }

  Office.onReady(() => {
    $("saveToken").onclick = async () => {
      const t = $("token").value.trim();
      if (!t.startsWith("ast_")) return ($("setupError").textContent = "That doesn't look like an Assistant token (ast_…).");
      token = t;
      try {
        await api("projects");
        await save("token", t);
        start();
      } catch (e) {
        $("setupError").textContent = e.message;
      }
    };
    $("forget").onclick = async (e) => { e.preventDefault(); await save("token", null); token = ""; show("setup"); };
    $("tabTask").onclick = () => { $("tabTask").className = "on"; $("tabAnalyze").className = ""; $("taskForm").hidden = false; $("analyzeForm").hidden = true; };
    $("tabAnalyze").onclick = () => { $("tabAnalyze").className = "on"; $("tabTask").className = ""; $("taskForm").hidden = true; $("analyzeForm").hidden = false; };
    $("add").onclick = addTask;
    $("analyze").onclick = analyze;
    $("createPicked").onclick = createPicked;
    start();
  });

})();
