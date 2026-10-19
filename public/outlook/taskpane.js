// The Assistant add-in's side panel. It reads only the open mail (Office.js, ReadItem) and talks to
// Assistant's public endpoints on this same host, with a personal token kept in the add-in's
// roaming settings.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...children) => Object.assign(document.createElement(tag), props).appendChildren(children);
  Element.prototype.appendChildren = function (children) {
    for (const c of children.flat()) if (c != null) this.append(c);
    return this;
  };

  let token = "";
  let due = null;

  // ---- dates (Seoul, like everywhere in Assistant) -------------------------------------

  const pad = (n) => String(n).padStart(2, "0");
  function seoul(offsetDays = 0) {
    const d = new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const weekday = () => new Date(Date.now() + 9 * 3600e3).getUTCDay();
  const friday = () => seoul((5 - weekday() + 7) % 7 || 7);
  const short = (date) => new Date(date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  // ---- API ----------------------------------------------------------------------------------

  async function api(path, body) {
    const res = await fetch(`/api/v1/public/${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { detail = (await res.json()).detail || detail; } catch (_) { /* not JSON */ }
      throw new Error(res.status === 401 ? "This token doesn't work anymore. Disconnect and connect again." : detail);
    }
    return res.json();
  }

  async function busy(button, label, work) {
    const text = button.textContent;
    button.disabled = true;
    button.classList.add("busy");
    if (label) button.textContent = label;
    $("error").textContent = "";
    try { return await work(); } catch (e) { $("error").textContent = e.message; } finally {
      button.disabled = false;
      button.classList.remove("busy");
      button.textContent = text;
    }
  }

  // ---- the open mail ---------------------------------------------------------------------

  function mail() {
    const item = Office.context.mailbox.item;
    const f = item.from;
    const from = f ? (f.displayName ? `${f.displayName} <${f.emailAddress}>` : f.emailAddress) : "";
    return {
      subject: item.subject || "(no subject)",
      from,
      name: f ? f.displayName || f.emailAddress : "",
      date: item.dateTimeCreated,
      link: webLink(item),
      ref: midLink(item.internetMessageId),
    };
  }

  /** The mail as a reference everywhere else: mid:<Message-ID> (RFC 2392). */
  function midLink(messageId) {
    if (!messageId) return null;
    return "mid:" + encodeURIComponent(messageId.trim().replace(/^</, "").replace(/>$/, "")).replace(/%40/g, "@");
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

  // Brackets in the subject are escaped so the link stays intact.
  const mailNote = (m) =>
    [m.ref ? `Mail: [${m.subject.replace(/([[\]])/g, "\\$1")}](${m.ref})` : null, `From: ${m.from}`, m.link ? `[Open in Outlook](${m.link})` : null]
      .filter(Boolean)
      .join("\n");

  // ---- screens ---------------------------------------------------------------------------

  function show(screen) {
    $("loading").hidden = screen !== "loading";
    $("setup").hidden = screen !== "setup";
    $("mail").hidden = screen !== "mail";
    $("footer").hidden = screen !== "mail";
  }

  async function start() {
    token = Office.context.roamingSettings.get("token") || "";
    if (!token) return show("setup");
    show("mail");
    const m = mail();
    $("subject").textContent = m.subject;
    const when = m.date ? new Date(m.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
    $("sender").textContent = [m.name, when].filter(Boolean).join(" · ");
    $("title").value = m.subject;
    renderDue();
    try {
      const projects = await api("projects");
      $("project").replaceChildren(el("option", { value: "", textContent: "No project" }), ...projects.map((p) => el("option", { value: p.id, textContent: p.name })));
    } catch (e) {
      $("error").textContent = e.message;
    }
  }

  function renderDue() {
    const choices = [["None", null], ["Today", seoul()], ["Tomorrow", seoul(1)], ["Fri " + short(friday()).split(" ")[1], friday()]];
    const picked = due && !choices.some(([, d]) => d === due);
    $("dueChoices").replaceChildren(
      ...choices.map(([label, date]) => el("button", { className: "chip" + (due === date ? " on" : ""), textContent: label, onclick: () => { due = date; $("pickDate").hidden = true; renderDue(); } })),
      el("button", {
        className: "chip" + (picked ? " on" : ""), textContent: picked ? short(due) : "Pick…",
        onclick: () => { $("pickDate").hidden = false; $("pickDate").value = due || seoul(); $("pickDate").focus(); },
      }),
    );
  }

  function showDone(text, url) {
    $("doneText").textContent = text;
    $("doneOpen").hidden = !url;
    if (url) $("doneOpen").href = url;
    $("done").hidden = false;
    $("taskForm").hidden = true;
    $("analyzeForm").hidden = true;
    document.querySelector(".tabs").hidden = true;
  }

  function reset() {
    $("done").hidden = true;
    document.querySelector(".tabs").hidden = false;
    tab($("tabTask").classList.contains("on") ? "task" : "analyze");
  }

  function tab(which) {
    $("tabTask").classList.toggle("on", which === "task");
    $("tabAnalyze").classList.toggle("on", which === "analyze");
    $("taskForm").hidden = which !== "task";
    $("analyzeForm").hidden = which !== "analyze";
    $("error").textContent = "";
  }

  // ---- reply later --------------------------------------------------------------------------

  async function addTask() {
    await busy($("add"), "Adding", async () => {
      const m = mail();
      const r = await api("tasks", {
        title: $("title").value.trim() || m.subject,
        description: mailNote(m),
        due: due ? { date: due } : null,
        projectId: $("project").value || null,
        labels: $("reply").classList.contains("on") ? ["reply"] : [],
      });
      showDone("Added to Assistant", r.url);
    });
  }

  // ---- triage -------------------------------------------------------------------------------

  async function sendToTriage() {
    await busy($("analyze"), "Sending", async () => {
      const m = mail();
      const text = `Mail from ${m.from}, subject: ${m.subject}\n\n${(await body()).slice(0, 40000)}`;
      const r = await api("triage", { title: m.subject, text, link: m.ref });
      showDone("Sent to Triage", r.url);
    });
  }

  // ---- setup ----------------------------------------------------------------------------------

  function save(key, value) {
    return new Promise((resolve, reject) => {
      if (value === null) Office.context.roamingSettings.remove(key);
      else Office.context.roamingSettings.set(key, value);
      Office.context.roamingSettings.saveAsync((r) => (r.status === Office.AsyncResultStatus.Succeeded ? resolve() : reject(r.error)));
    });
  }

  Office.onReady(() => {
    $("saveToken").onclick = () => {
      const t = $("token").value.trim();
      if (!t.startsWith("ast_")) return void ($("setupError").textContent = "That doesn't look like an Assistant token (it starts with ast_).");
      $("setupError").textContent = "";
      return busy($("saveToken"), "Connecting", async () => {
        token = t;
        try {
          await api("projects");
        } catch (e) {
          token = "";
          $("setupError").textContent = e.message;
          return;
        }
        await save("token", t);
        start();
      });
    };
    $("forget").onclick = async (e) => { e.preventDefault(); await save("token", null); token = ""; show("setup"); };
    $("tabTask").onclick = () => tab("task");
    $("tabAnalyze").onclick = () => tab("analyze");
    $("reply").onclick = () => { const on = $("reply").classList.toggle("on"); $("reply").setAttribute("aria-pressed", String(on)); };
    $("pickDate").onchange = () => { if ($("pickDate").value) { due = $("pickDate").value; renderDue(); } };
    $("add").onclick = addTask;
    $("analyze").onclick = sendToTriage;
    $("again").onclick = (e) => { e.preventDefault(); reset(); };
    start();
  });
})();
