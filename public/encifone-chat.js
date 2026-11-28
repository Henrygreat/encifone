(() => {
  const script = document.currentScript;
  const key = script?.dataset.widget;
  if (!key) return;
  const endpoint = new URL(`/api/chat/${encodeURIComponent(key)}`, script.src);
  const storageKey = `encifone-chat:${endpoint.origin}:${key}`;
  let token;
  try { token = sessionStorage.getItem(storageKey); } catch { /* Storage may be disabled. */ }
  const call = async (payload) => {
    const response = await fetch(endpoint, payload ? {
      method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    } : { credentials: "omit" });
    if (!response.ok) {
      const error = new Error((await response.json().catch(() => null))?.error || "Chat is temporarily unavailable.");
      error.status = response.status;
      throw error;
    }
    return response.json();
  };
  const mount = async () => {
    const config = await call();
    const container = document.createElement("div");
    const shadow = container.attachShadow({ mode: "open" });
    const element = (tag, text, parent) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      parent.append(node);
      return node;
    };
    const style = element("style", null, shadow);
    style.textContent = `
      :host { position:fixed; bottom:16px; ${config.position === "left" ? "left" : "right"}:16px; z-index:2147483000; color:#152034; font:14px system-ui,sans-serif }
      button,input,textarea { box-sizing:border-box; font:inherit } button { cursor:pointer; border:1px solid #677487; border-radius:6px; padding:8px 12px; background:#fff; color:#152034 }
      button:focus-visible,input:focus-visible,textarea:focus-visible { outline:2px solid #155e75; outline-offset:2px }
      section { width:min(350px,calc(100vw - 32px)); max-height:calc(100dvh - 80px); overflow:auto; background:#fff; border:1px solid #677487; border-radius:10px; padding:14px; box-sizing:border-box }
      h2 { font-size:18px; margin:0 } ol { max-height:32vh; overflow:auto; padding-left:24px; overflow-wrap:anywhere }
      li { padding:4px 0; white-space:pre-wrap } label { display:block; margin:8px 0 } input,textarea { display:block; width:100%; margin-top:3px; padding:6px; border:1px solid #677487; border-radius:4px }
      .toggle { float:${config.position === "left" ? "left" : "right"}; margin-top:8px; border-top:4px solid ${config.colour} }
      small { overflow-wrap:anywhere } [hidden] { display:none!important }
    `;
    const panel = element("section", null, shadow);
    panel.setAttribute("aria-label", "Website chat");
    panel.hidden = true;
    element("h2", config.name, panel);
    element("p", config.welcome, panel);
    element("small", config.privacyNotice, panel);
    const messages = element("ol", null, panel);
    messages.setAttribute("aria-label", "Chat transcript");
    const status = element("p", null, panel);
    status.setAttribute("role", "status");
    const form = element("form", null, panel);
    const name = element("input", null, element("label", "Name (optional)", form));
    name.maxLength = 100;
    const email = element("input", null, element("label", "Email (optional)", form));
    email.type = "email"; email.maxLength = 254;
    const input = element("textarea", null, element("label", "Message", form));
    input.maxLength = 3000; input.required = true;
    const send = element("button", "Send message", form);
    send.type = "submit";
    const restart = element("button", "Start another conversation", panel);
    restart.hidden = true;
    const toggle = element("button", "Open chat", shadow);
    toggle.className = "toggle";
    toggle.setAttribute("aria-expanded", "false");
    let after;
    let polling = false;
    let unread = 0;
    const remember = () => {
      name.parentElement.hidden = Boolean(token);
      email.parentElement.hidden = Boolean(token);
      try {
        if (token) sessionStorage.setItem(storageKey, token);
        else sessionStorage.removeItem(storageKey);
      } catch { /* Storage may be disabled. */ }
    };
    const poll = async () => {
      if (!token || polling || document.visibilityState === "hidden") return;
      polling = true;
      try {
        const result = await call({ action: "poll", token, after });
        for (const item of result.messages) {
          after = item.id;
          element("li", `${item.kind === "INBOUND" ? "You" : config.name}: ${item.body}`, messages);
          if (panel.hidden && item.kind === "OUTBOUND") unread++;
        }
        if (panel.hidden && unread) toggle.textContent = `Open chat (${unread} unread)`;
        if (result.closed) { form.hidden = true; restart.hidden = false; status.textContent = "Conversation closed."; }
        if (result.messages.length) messages.scrollTop = messages.scrollHeight;
      } catch (error) {
        status.textContent = error.message;
        if (error.status === 404) { form.hidden = true; restart.hidden = false; }
      } finally { polling = false; }
    };
    toggle.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
      toggle.textContent = panel.hidden ? "Open chat" : "Close chat";
      if (!panel.hidden) { unread = 0; if (!form.hidden) input.focus(); void poll(); }
    });
    restart.addEventListener("click", () => {
      token = undefined; after = undefined; messages.replaceChildren();
      form.hidden = false; restart.hidden = true; status.textContent = ""; remember(); input.focus();
    });
    let outgoing;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (send.disabled) return;
      send.disabled = true;
      try {
        const body = input.value.trim();
        if (!body) return;
        if (token) {
          if (outgoing?.body !== body) outgoing = { body, requestKey: crypto.randomUUID() };
          await call({ action: "message", token, ...outgoing });
          outgoing = undefined;
        } else {
          const result = await call({ action: "start", body, name: name.value.trim() || undefined, email: email.value.trim() || undefined });
          token = result.token; remember();
        }
        input.value = ""; status.textContent = ""; await poll();
      } catch (error) { status.textContent = error.message; }
      finally { send.disabled = false; }
    });
    remember();
    document.body.append(container);
    setInterval(() => void poll(), 6000);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void mount().catch(() => {}), { once: true });
  else void mount().catch(() => {});
})();
