function serializeForScript(value) {
	return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function renderLoginPage(liffId) {
	return `<!doctype html>
<html lang="zh-Hant">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
	<meta name="theme-color" content="#06c755">
	<title>veo 登入</title>
	<style>
		:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937}*{box-sizing:border-box}
		body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f3f6f4}
		main{width:min(100%,420px);padding:40px 28px;text-align:center;background:#fff;border-radius:24px;box-shadow:0 18px 55px #1430211f}
		.logo{width:72px;height:72px;display:grid;place-items:center;margin:0 auto 20px;color:#fff;background:#06c755;border-radius:22px;font-size:32px;font-weight:800}
		h1{margin:0 0 10px;font-size:28px}p{margin:0;color:#64748b;line-height:1.7}
		.status{min-height:68px;margin-top:26px;padding:18px;background:#f8faf9;border-radius:16px}.status strong{display:block;margin-bottom:4px}.error strong{color:#b42318}
		.actions{display:grid;gap:12px;margin-top:24px}button{width:100%;min-height:50px;padding:12px 18px;border:0;border-radius:14px;font:inherit;font-weight:700;cursor:pointer}
		.primary{color:#fff;background:#06c755}.secondary{color:#334155;background:#eef2f0}button[hidden]{display:none}
		.spinner{width:24px;height:24px;margin:0 auto 10px;border:3px solid #dce5e0;border-top-color:#06c755;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
	</style>
	<script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
</head>
<body>
	<main>
		<div class="logo" aria-hidden="true">V</div><h1>veo 登入</h1><p>使用 LINE 安全登入此服務</p>
		<div id="status" class="status" role="status" aria-live="polite"><div class="spinner" aria-hidden="true"></div><strong>正在連接 LINE</strong><span>請稍候，不要關閉此頁面。</span></div>
		<div class="actions"><button id="login" class="primary" type="button" hidden>使用 LINE 登入</button><button id="close" class="secondary" type="button" hidden>關閉視窗</button><button id="retry" class="secondary" type="button" hidden>重新嘗試</button></div>
	</main>
	<script>
		const LIFF_ID=${serializeForScript(liffId)};
		const statusBox=document.getElementById("status"),loginButton=document.getElementById("login"),closeButton=document.getElementById("close"),retryButton=document.getElementById("retry");
		function showStatus(title,message,isError=false){statusBox.classList.toggle("error",isError);statusBox.innerHTML="<strong></strong><span></span>";statusBox.querySelector("strong").textContent=title;statusBox.querySelector("span").textContent=message}
		async function startLiff(){loginButton.hidden=true;closeButton.hidden=true;retryButton.hidden=true;try{await liff.init({liffId:LIFF_ID,withLoginOnExternalBrowser:true});if(!liff.isLoggedIn()){showStatus("尚未登入","請按下方按鈕繼續。");loginButton.hidden=false;return}showStatus("登入成功","已完成 LINE 身分驗證，可以繼續使用 veo。");if(liff.isInClient())closeButton.hidden=false}catch(error){console.error("LIFF initialization failed",error);showStatus("無法連接 LINE","請確認網路後重新嘗試。",true);retryButton.hidden=false}}
		loginButton.addEventListener("click",()=>liff.login({redirectUri:window.location.href}));closeButton.addEventListener("click",()=>liff.closeWindow());retryButton.addEventListener("click",()=>window.location.reload());startLiff();
	</script>
</body>
</html>`;
}

export default {
	async fetch(request, env) {
		if (request.method !== "GET" && request.method !== "HEAD") {
			return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
		}
		const html = renderLoginPage(env.LIFF_ID);
		return new Response(request.method === "HEAD" ? null : html, {
			headers: {
				"Content-Type": "text/html; charset=UTF-8",
				"Cache-Control": "no-store",
				"Referrer-Policy": "strict-origin-when-cross-origin",
				"X-Content-Type-Options": "nosniff",
			},
		});
	},
};
