const text = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const OPTIONS = [
  { value: 1, label: "非常不像我" }, { value: 2, label: "比較不像我" },
  { value: 3, label: "不一定" }, { value: 4, label: "比較像我" }, { value: 5, label: "非常像我" },
];
const rows = (items) => items.map(([id, dimension, prompt]) => ({ id, dimension, prompt, options: OPTIONS }));
const define = (type, title, intro, items) => ({ type, title, intro, version: "v1", disclaimer: "結果僅供自我覺察與互動參考，不構成心理或醫療診斷。", questions: rows(items) });

export const PERSONALITY_ASSESSMENTS = {
  mbti: define("mbti", "MBTI 性格偏好", "理解你習慣如何取得能量、接收資訊、做決定與安排生活。", [
    ["e1","E","與陌生人互動時，我通常會主動開啟話題。"],["e2","E","團體討論會讓我更有精神。"],["e3","E","我喜歡邊說邊整理自己的想法。"],["i1","I","忙碌社交後，我需要獨處才能恢復精神。"],
    ["s1","S","我習慣先確認具體事實與可執行細節。"],["s2","S","我偏好已有經驗可驗證的方法。"],["s3","S","說明事情時，我會提供實際例子。"],["n1","N","我常先看到可能性與長期趨勢。"],
    ["t1","T","做決定時，我會優先檢查邏輯是否一致。"],["t2","T","即使意見不受歡迎，我仍會指出問題核心。"],["t3","T","我傾向用一致標準處理衝突。"],["f1","F","做決定時，我會優先考量對人的影響。"],
    ["j1","J","我喜歡提早安排並確定完成期限。"],["j2","J","事情有清楚結論時，我會比較安心。"],["j3","J","我會先完成重要工作再放鬆。"],["p1","P","我喜歡保留彈性，視現場情況調整。"],
  ]),
  disc: define("disc", "DISC 行為風格", "理解你在工作與互動情境中較常展現的行為風格。", [
    ["d1","D","面對卡關時，我會快速決定方向並推進。"],["d2","D","我願意承擔風險以爭取更好的結果。"],["d3","D","團隊缺乏方向時，我會自然接手主導。"],
    ["i1","I","我容易用熱情與故事帶動他人。"],["i2","I","建立新關係對我來說自然且有趣。"],["i3","I","我樂於公開表達想法並獲得回饋。"],
    ["s1","S","我重視穩定合作，願意耐心支持他人。"],["s2","S","突如其來的變動會讓我想先確認影響。"],["s3","S","我擅長持續做完需要耐心的工作。"],
    ["c1","C","交付前，我會再次核對規格與細節。"],["c2","C","資料不足時，我不喜歡倉促下結論。"],["c3","C","我重視品質、規則與可被驗證的依據。"],
  ]),
  enneagram: define("enneagram", "九型人格", "從核心動機與壓力反應找出目前最接近的性格類型。", [
    ["e1a","1","我常注意哪些地方可以做得更正確。"],["e1b","1","即使沒人要求，我也會遵守自己認定的標準。"],["e2a","2","能實際幫上別人會讓我感到有價值。"],["e2b","2","我很快就能察覺他人的需要。"],
    ["e3a","3","達成目標與被肯定會驅動我前進。"],["e3b","3","我會依情境調整呈現方式以提高成功率。"],["e4a","4","我重視真實感受與個人獨特性。"],["e4b","4","我常從情緒與美感中理解自己。"],
    ["e5a","5","行動前，我想先蒐集足夠資訊。"],["e5b","5","我需要不被打擾的空間來深入思考。"],["e6a","6","做重大決定前，我會先評估風險與備案。"],["e6b","6","可靠的承諾與團隊支持對我很重要。"],
    ["e7a","7","我會自然想到許多新選項與有趣計畫。"],["e7b","7","我不喜歡長時間停留在受限或沉重的狀態。"],["e8a","8","我會直接保護自己與在意的人。"],["e8b","8","遇到不公平時，我傾向立即表態。"],
    ["e9a","9","我擅長理解不同立場並維持和諧。"],["e9b","9","若衝突不緊急，我可能先放下自己的主張。"],
  ]),
  big_five: define("big_five", "Big Five 五大人格", "以五個連續向度呈現性格傾向，不把你限制在單一類型。", [
    ["o1","O","我喜歡接觸新的觀點、文化或創作。"],["o2","O","我常把不同領域的概念連結在一起。"],["o3","O","比起固定做法，我願意嘗試新方法。"],
    ["c1","C","我會規劃步驟並按時完成承諾。"],["c2","C","即使工作枯燥，我仍能維持品質。"],["c3","C","我的檔案、行程或工作流程通常有條理。"],
    ["e1","E","我喜歡主動參與熱鬧的互動場合。"],["e2","E","我容易把自己的熱情傳遞給別人。"],["e3","E","需要公開表達時，我通常能快速進入狀態。"],
    ["a1","A","我會先理解對方的處境再回應。"],["a2","A","合作時，我願意調整做法以找到共同點。"],["a3","A","我通常相信多數人是出於善意。"],
    ["n1","N","壓力出現時，我容易反覆擔心可能的問題。"],["n2","N","負面回饋會在我心中停留一段時間。"],["n3","N","面對不確定性時，我的情緒容易受到影響。"],
  ]),
};
const LABELS = { mbti:"MBTI", disc:"DISC", enneagram:"九型人格", big_five:"Big Five" };
const DISC = { D:"主導型", I:"影響型", S:"穩健型", C:"分析型" };
const ENNEAGRAM = { 1:"改革者",2:"助人者",3:"成就者",4:"自我型",5:"觀察者",6:"忠誠者",7:"樂觀者",8:"挑戰者",9:"和平者" };
const BIG_FIVE = { O:"開放性",C:"盡責性",E:"外向性",A:"親和性",N:"情緒敏感度" };
function validated(type, raw) {
  const assessment = PERSONALITY_ASSESSMENTS[type];
  if (!assessment) throw new Error("不支援的性格測驗");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("測驗答案格式錯誤");
  const answers = {};
  for (const question of assessment.questions) {
    const value = Number(raw[question.id]);
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error(`請完成全部 ${assessment.questions.length} 題`);
    answers[question.id] = value;
  }
  return answers;
}
function scoresFor(type, answers) {
  const totals = {}, counts = {};
  for (const question of PERSONALITY_ASSESSMENTS[type].questions) {
    totals[question.dimension] = (totals[question.dimension] || 0) + answers[question.id];
    counts[question.dimension] = (counts[question.dimension] || 0) + 1;
  }
  return Object.fromEntries(Object.keys(totals).map((key) => [key, Math.round(((totals[key] / counts[key]) - 1) * 25)]));
}
export function scorePersonalityAssessment(type, raw) {
  const answers = validated(type, raw), scores = scoresFor(type, answers);
  let resultCode = "", headline = "", summary = "";
  if (type === "mbti") {
    resultCode = `${scores.E >= scores.I ? "E" : "I"}${scores.S >= scores.N ? "S" : "N"}${scores.T >= scores.F ? "T" : "F"}${scores.J >= scores.P ? "J" : "P"}`;
    headline = resultCode; summary = `目前偏好為 ${resultCode}；這是互動偏好，不代表能力高低，且可能隨情境調整。`;
  } else if (type === "disc") {
    const ranked = Object.entries(scores).sort((a,b) => b[1] - a[1]);
    resultCode = ranked.slice(0,2).map(([key]) => key).join(""); headline = ranked.slice(0,2).map(([key]) => `${key} ${DISC[key]}`).join(" × "); summary = `主要風格為${headline}，可用於調整溝通節奏與合作方式。`;
  } else if (type === "enneagram") {
    resultCode = Object.entries(scores).sort((a,b) => b[1] - a[1])[0][0]; headline = `${resultCode} 號・${ENNEAGRAM[resultCode]}`; summary = `目前最接近${headline}；九型著重核心動機，建議搭配長期自我觀察。`;
  } else {
    resultCode = "OCEAN"; const ranked = Object.entries(scores).sort((a,b) => b[1] - a[1]); headline = `${BIG_FIVE[ranked[0][0]]} ${ranked[0][1]} 分`; summary = `最高向度為${headline}；五項分數是連續傾向，沒有好壞之分。`;
  }
  return { type, label:LABELS[type], resultCode, headline, summary, scores, answers, version:"v1" };
}
function fromRow(row = {}) {
  let result = {}; try { result = JSON.parse(row.result_json || "{}") || {}; } catch {}
  return { id:text(row.id,80), type:text(row.assessment_type,30), label:LABELS[row.assessment_type] || text(row.assessment_type,30), resultCode:text(row.result_code,40), headline:text(result.headline,160), summary:text(result.summary,300), scores:result.scores && typeof result.scores === "object" ? result.scores : {}, completedAt:text(row.completed_at,80) };
}
export async function listPersonalityAssessmentResults(db, userId) {
  const result = await db.prepare(`SELECT id,assessment_type,result_code,result_json,completed_at FROM member_personality_assessments WHERE platform_user_id=? ORDER BY completed_at DESC,id DESC LIMIT 100`).bind(userId).all();
  const latest = {}; for (const row of result.results || []) if (!latest[row.assessment_type]) latest[row.assessment_type] = fromRow(row); return latest;
}
export async function savePersonalityAssessment(db, userId, type, raw) {
  const scored = scorePersonalityAssessment(type, raw), id = crypto.randomUUID();
  await db.prepare(`INSERT INTO member_personality_assessments (id,platform_user_id,assessment_type,result_code,result_json,answers_json,assessment_version) VALUES (?,?,?,?,?,?,?)`).bind(id,userId,type,scored.resultCode,JSON.stringify(scored),JSON.stringify(scored.answers),scored.version).run();
  return { id, ...scored, completedAt:new Date().toISOString() };
}
export function publicPersonalityAssessments() {
  return Object.fromEntries(Object.entries(PERSONALITY_ASSESSMENTS).map(([key,value]) => [key,{...value,questions:value.questions.map(({dimension,...question}) => question)}]));
}