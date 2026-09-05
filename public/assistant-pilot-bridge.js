import { readAssistantPilotEntry, preserveAssistantPilotEntry } from "./assistant-pilot-entry.js?v=20260905-pilot-1";

export function createAssistantPilotBridge({ root, api, onNavigate, onOverview, onAccessDenied }) {
  // Deliberately no storage fallback: a normal visit stays on the original site.
  let entry = readAssistantPilotEntry(location.href);
  let ownerId = "";
  let instance = null;
  let generation = 0;
  let authorizationRun = 0;
  const pilotApi = (path, options = {}) => api(path, {
    ...options, headers:{...options.headers, "x-veo-pilot-entry":entry},
  });
  function leave() {
    generation += 1;
    authorizationRun += 1;
    instance?.dispose();
    instance = null;
    document.body.classList.remove("veo-assistant-open");
  }
  function forget() {
    leave();
    ownerId = "";
    entry = "";
    const url = new URL(location.href);
    url.searchParams.delete("previewInvite");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  async function authorize(member) {
    if (!entry || !member?.userId) return false;
    if (ownerId && ownerId !== member.userId) leave();
    ownerId = "";
    const run = ++authorizationRun;
    try {
      const access = await pilotApi("/v1/assistant-pilot/access", {method:"POST", body:"{}"});
      if (run !== authorizationRun) return false;
      if (access.allowed !== true || access.memberId !== member.userId) return false;
      ownerId = access.memberId;
      return true;
    } catch (error) {
      if (error.status === 401 || error.status === 403) { leave(); return false; }
      throw error;
    }
  }
  async function mount(member) {
    leave();
    const current = generation;
    if (!await authorize(member) || current !== generation) return false;
    const { createAssistantPilot } = await import("./assistant-pilot.js?v=20260905-pilot-1");
    if (current !== generation) return false;
    if (!document.querySelector("link[data-assistant-pilot-style]")) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "/assistant-pilot.css?v=20260905-pilot-1";
      css.dataset.assistantPilotStyle = "1";
      document.head.append(css);
    }
    document.body.classList.remove("veo-entry-open");
    document.body.classList.add("veo-assistant-open");
    root.innerHTML = "";
    instance = createAssistantPilot({root, api:pilotApi, member,
      onNavigate(destination) { leave(); onNavigate(destination); },
      onOverview() { leave(); onOverview(); },
      onAccessDenied(error) { ownerId = ""; leave(); onAccessDenied?.(error); },
    });
    instance.render();
    return true;
  }
  function addReturnButton(member) {
    if (!ownerId || ownerId !== member?.userId) return;
    const nav = document.createElement("nav");
    nav.className = "veo-pilot-return";
    nav.setAttribute("aria-label", "私人助理導航");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "← 返回 AI 助理";
    button.addEventListener("click", () => onNavigate("home"));
    nav.append(button);
    root.prepend(nav);
  }
  return {mount, authorize, leave, forget, addReturnButton,
    get hasEntry() { return Boolean(entry); },
    preservePath(path) { return preserveAssistantPilotEntry(path, entry, location.origin); },
  };
}
