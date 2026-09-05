// This is routing context only. Every private API independently verifies the
// invitation and its authenticated owner; query parameters grant no permission.
export function readAssistantPilotEntry(href) {
  try {
    const url = new URL(href);
    const params = [url.searchParams];
    if (url.searchParams.getAll("liff.state").length > 1) return "";
    if (url.searchParams.has("liff.state")) {
      const nested = new URL(url.searchParams.get("liff.state"), url.origin);
      if (nested.origin !== url.origin || nested.searchParams.has("liff.state")) return "";
      params.push(nested.searchParams);
    }
    const entries = [];
    for (const query of params) {
      // Public sharing and scheduled check-ins retain their established routes.
      if (["publicCard", "sharedContact", "shareCardId", "courseSession", "smartCheckin"].some(key => query.has(key))) return "";
      for (const key of ["invite", "previewInvite"]) {
        if (query.getAll(key).length > 1) return "";
        if (query.has(key)) {
          const value = query.get(key);
          if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) return "";
          entries.push(value);
        }
      }
    }
    if (url.pathname.startsWith("/i/")) {
      const value = decodeURIComponent(url.pathname.slice(3));
      if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) return "";
      entries.push(value);
    }
    return entries.length && entries.every(value => value === entries[0]) ? entries[0] : "";
  } catch { return ""; }
}

export function preserveAssistantPilotEntry(path, entry, origin) {
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error("Assistant return route must be same-origin");
  if (entry) url.searchParams.set("previewInvite", entry);
  return `${url.pathname}${url.search}${url.hash}`;
}
