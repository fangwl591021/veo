function getLiffConfig(env) {
  const liffId = env.LIFF_ID?.trim();
  const liffUrl = env.LIFF_URL?.trim();

  if (!liffId || !liffUrl) {
    throw new Error("LIFF configuration is missing");
  }

  const parsedUrl = new URL(liffUrl);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "liff.line.me") {
    throw new Error("LIFF URL is invalid");
  }

  return { liffId, liffUrl: parsedUrl.toString() };
}

function renderLiffPage(config) {
  const serializedConfig = JSON.stringify(config).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>veo</title>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
</head>
<body>
  <main>
    <h1>veo</h1>
    <p id="status">正在連接 LINE…</p>
    <p><a id="open-liff" href="${config.liffUrl}">在 LINE 開啟</a></p>
  </main>
  <script>
    const config = ${serializedConfig};
    const status = document.getElementById("status");

    liff.init({ liffId: config.liffId })
      .then(() => {
        status.textContent = liff.isInClient() ? "已連接 LINE" : "請使用 LINE 開啟此服務";
      })
      .catch(() => {
        status.textContent = "LINE 連線失敗，請稍後再試";
      });
  </script>
</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const config = getLiffConfig(env);
      console.info(JSON.stringify({ message: "LIFF page requested", path: new URL(request.url).pathname }));

      return new Response(renderLiffPage(config), {
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
          "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.line-scdn.net; connect-src 'self' https://*.line.me https://*.line-scdn.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff"
        }
      });
    } catch (error) {
      console.error(JSON.stringify({
        message: "LIFF page failed",
        error: error instanceof Error ? error.message : "Unknown error"
      }));
      return new Response("Service unavailable", { status: 500 });
    }
  }
};
