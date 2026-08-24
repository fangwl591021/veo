import { readFileSync, writeFileSync } from 'node:fs';

const path='public/app-20260815-132.js';
let source=readFileSync(path,'utf8');

const replacements=[
  ['if (!confirm("確定刪除這筆行程？")) return;', 'if (!(await appConfirm("確定刪除這筆行程？",{danger:true,okText:"刪除"}))) return;'],
  ['if(!confirm(`刪除「${label.name}」標籤？標籤內的行程會移到「未分類」。`))return;', 'if(!(await appConfirm(`刪除「${label.name}」標籤？標籤內的行程會移到「未分類」。`,{danger:true,okText:"刪除"})))return;'],
  ['if(action==="cancel"&&!confirm(`確定取消「${task.title}」？`))return;', 'if(action==="cancel"&&!(await appConfirm(`確定取消「${task.title}」？`,{danger:true,okText:"取消任務"})))return;'],
  ['result.body.code==="duplicate_contact"&&confirm(`收藏名單已有「${result.body.duplicate?.displayName || "相同名片"}」，要用這次資料更新嗎？更新既有名片不會重複贈點。`)', 'result.body.code==="duplicate_contact"&&(await appConfirm(`收藏名單已有「${result.body.duplicate?.displayName || "相同名片"}」，要用這次資料更新嗎？更新既有名片不會重複贈點。`,{title:"發現重複名片",okText:"更新既有名片"}))'],
  ['if(!confirm(`確定刪除「${card.displayName}」？圖片也會一併刪除並釋放空間。`))return;', 'if(!(await appConfirm(`確定刪除「${card.displayName}」？圖片也會一併刪除並釋放空間。`,{danger:true,okText:"刪除"})))return;'],
  ['if(!confirm("確定停止這張名片目前的公開分享？舊網址將立即失效。"))return;', 'if(!(await appConfirm("確定停止這張名片目前的公開分享？舊網址將立即失效。",{danger:true,okText:"停止分享"})))return;'],
  ['const name = prompt("建立行事曆標籤，例如：工作、家庭、約訪、學習", initial);', 'const name = await appPrompt("建立行事曆標籤，例如：工作、家庭、約訪、學習", initial,{title:"新增標籤",placeholder:"例如：工作"});'],
  ['const color = prompt("標籤顏色（HEX 色碼）", current?.color || suggestedColors[cleanName] || "#52637d") || current?.color || "#52637d";', 'const color = (await appPrompt("標籤顏色（HEX 色碼）", current?.color || suggestedColors[cleanName] || "#52637d",{title:"設定標籤顏色",placeholder:"#52637d"})) || current?.color || "#52637d";'],
  ['const value=prompt("延期到何時？請輸入 YYYY-MM-DDTHH:mm",initial);', 'const value=await appPrompt("延期到何時？請輸入 YYYY-MM-DDTHH:mm",initial,{title:"延期任務"});'],
  ['const note=prompt("新增 CRM 紀錄");', 'const note=await appPrompt("新增 CRM 紀錄","",{title:"CRM 紀錄",placeholder:"輸入本次聯繫或進度"});'],
];

for(const [from,to] of replacements){
  if(!source.includes(from))throw new Error(`notification migration target not found: ${from.slice(0,80)}`);
  source=source.replace(from,to);
}

if(/\bconfirm\s*\(/.test(source))throw new Error('native confirm remains in main app');
if(/\bprompt\s*\(/.test(source))throw new Error('native prompt remains in main app');
writeFileSync(path,source);
