const safeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

export function inviteShareLiffHtml({ liffId, origin, inviteToken }) {
  const inviteUrl = `${origin}/i/${encodeURIComponent(inviteToken)}`;
  return new Response(`<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>分享推薦網址</title><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#fff8f3;color:#3d2920;font-family:system-ui,"Noto Sans TC",sans-serif}.page{min-height:100svh;display:grid;place-items:center;padding:24px}.card{width:min(100%,420px);padding:28px 22px;border:1px solid #edcdbd;border-radius:24px;background:#fff;text-align:center;box-shadow:0 8px 24px rgba(113,48,21,.08)}.mark{width:54px;height:54px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;background:#f9e9df;color:#b95121;font-size:26px;font-weight:800}h1{font-size:24px;margin:0 0 10px}p{margin:0;color:#765b4e;line-height:1.65;white-space:pre-wrap}.detail{margin-top:14px;font-size:12px;color:#9b7c6e;word-break:break-word}</style></head>
<body><main class="page"><section class="card"><div class="mark">A</div><h1 id="title">正在開啟 LINE 通訊錄</h1><p id="message">請稍候，接著選擇好友或群組即可傳送。</p><div id="detail" class="detail"></div></section></main>
<script>
const LIFF_ID=${safeJson(liffId)};
const INVITE_TOKEN=${safeJson(inviteToken)};
const INVITE_URL=${safeJson(inviteUrl)};
const title=document.querySelector("#title");
const message=document.querySelector("#message");
const detail=document.querySelector("#detail");
const clean=(value,max=300)=>String(value||"").trim().slice(0,max);
const show=(heading,text,error="")=>{title.textContent=heading;message.textContent=text||"";detail.textContent=error||"";};
const cleanRedirect=()=>{const url=new URL(location.href);["code","state","scope","error","error_description","liff.state","liff.referrer"].forEach(key=>url.searchParams.delete(key));url.pathname="/r/invite-share";url.searchParams.set("inviteToken",INVITE_TOKEN);return url.toString();};
(async()=>{
  try{
    await liff.init({liffId:LIFF_ID});
    if(!liff.isLoggedIn()){liff.login({redirectUri:cleanRedirect()});return;}
    if(!liff.isApiAvailable("shareTargetPicker"))throw Object.assign(new Error("請在 LINE Developers 為此 LIFF 啟用 shareTargetPicker 並同意使用條款"),{code:"SHARE_TARGET_PICKER_UNAVAILABLE"});
    const result=await liff.shareTargetPicker([{type:"text",text:"A’kaffit 專屬分享\\n"+INVITE_URL}],{isMultiple:true});
    if(result===false){show("已取消分享","你尚未選擇分享對象，可以關閉此頁後再試一次。");return;}
    show("推薦網址已分享","已傳送到你選擇的 LINE 好友或群組。");
    setTimeout(()=>{try{if(liff.isInClient())liff.closeWindow();}catch{}},700);
  }catch(error){
    const code=clean(error&&error.code,80);const reason=clean(error&&error.message,300)||"未知錯誤";
    show("無法開啟 LINE 通訊錄","請確認分享 LIFF 已啟用 shareTargetPicker。",(code?code+"｜":"")+reason);
  }
})();
</script></body></html>`, { headers: { "content-type":"text/html; charset=utf-8", "cache-control":"no-store" } });
}
