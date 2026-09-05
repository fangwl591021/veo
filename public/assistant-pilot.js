import {
  PILOT_DESTINATIONS, storageKey, normalizePreferences, normalizeHistory,
  normalizeAction, normalizeContext, formatTaskDue,
} from './assistant-pilot-state.js';

const PERSONAS = {
  friendly: { name: '小唯', type: '親切型', description: '溫暖自然，陪你把事情一步步完成。', color: 'peach' },
  professional: { name: '以安', type: '專業型', description: '沉穩俐落，和你一起整理工作重點。', color: 'blue' },
  energetic: { name: '小晴', type: '活力型', description: '明亮有精神，陪你找到下一個機會。', color: 'lilac' },
};
const ICONS = {
  spark: '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8" cy="10" r="1.8"/><path d="M5 16a3 3 0 0 1 6 0m3-7h4m-4 4h4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1m-8 3h1"/>',
  tasks: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 3h6v4H9zm0 9 1 1 2-2m2 2h2m-7 4h7"/>',
  gift: '<path d="M3 9h18v4H3zm2 4v8h14v-8M12 9v12m0-12H8a3 3 0 1 1 3-3zm0 0h4a3 3 0 1 0-3-3Z"/>',
  sound: '<path d="M11 4 6 8H3v8h3l5 4zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 4 6 8H3v8h3l5 4zm5 5 5 6m0-6-5 6"/>',
  motion: '<circle cx="12" cy="12" r="8"/><path d="m10 8 6 4-6 4Z"/>',
  send: '<path d="m12 19 0-14M6 11l6-6 6 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
};

export function createAssistantPilot({ root, api, member, onNavigate, onOverview, onAccessDenied }) {
  if (!root || typeof api !== 'function') throw new TypeError('Assistant pilot requires a root and api');
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const speech = win.speechSynthesis;
  const canSpeak = Boolean(speech && win.SpeechSynthesisUtterance);
  const preferencesKey = storageKey(member, 'preferences');
  const conversationKey = storageKey(member, 'conversation');
  const initialSession = readStorage('sessionStorage', conversationKey);
  let preferences = normalizePreferences(readStorage('localStorage', preferencesKey));
  let history = normalizeHistory(initialSession?.history);
  // Confirmation tokens live only in memory; a reload must request a fresh draft.
  let pendingAction = null;
  let context = null;
  let contextError = '';
  let contextLoading = false;
  let contextRequest = 0;
  let view = 'assistant';
  let disposed = false;
  let revoked = false;
  let busy = false;
  let confirming = false;
  let speaking = false;
  let speechEnabledForVisit = false;
  let activeUtterance = null;
  let speechRun = 0;
  let speechTimer = null;
  let speechDeadline = null;
  let idleTimer = null;
  let blinkTimer = null;
  let rendered = false;
  let eventController = null;
  let dialog = null;
  let dialogPreviousFocus = null;
  let avatarLoad = 0;
  let lastError = '';
  const refs = {};

  function readStorage(kind, key) {
    if (!key) return null;
    try { return JSON.parse(win[kind].getItem(key) || 'null'); } catch { return null; }
  }
  function writeStorage(kind, key, value) {
    if (!key) return;
    try { win[kind].setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ }
  }
  function persistConversation() {
    history = normalizeHistory(history);
    writeStorage('sessionStorage', conversationKey, { history });
  }
  function persistPreferences() { writeStorage('localStorage', preferencesKey, preferences); }
  function element(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function icon(name) {
    const node = element('span', 'vap-icon');
    // Only fixed, application-owned SVG paths enter this template.
    node.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.spark}</svg>`;
    return node;
  }
  function button(text, className, action, iconName) {
    const node = element('button', className);
    node.type = 'button';
    if (action) node.dataset.pilotAction = action;
    if (iconName) node.append(icon(iconName));
    node.append(element('span', '', text));
    return node;
  }
  function number(value) { return value === null || value === undefined ? '—' : value.toLocaleString('zh-TW'); }
  function name() {
    const value = context?.member?.displayName || context?.member?.name || member?.displayName || member?.name;
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : '你好';
  }
  function effectiveMotion() { return preferences.motion && !reducedMotion?.matches && !doc.hidden; }
  function setFrame(frame) {
    if (!refs.avatar) return;
    const index = effectiveMotion() ? frame : 0;
    refs.avatar.style.backgroundPosition = `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 100}%`;
  }
  function clearAnimation() {
    win.clearTimeout(idleTimer); win.clearTimeout(blinkTimer); win.clearInterval(speechTimer);
    idleTimer = blinkTimer = speechTimer = null;
  }
  function scheduleIdle() {
    win.clearTimeout(idleTimer);
    if (disposed || !rendered || view !== 'assistant' || !effectiveMotion() || speaking) return;
    idleTimer = win.setTimeout(() => {
      setFrame(4);
      blinkTimer = win.setTimeout(() => { setFrame(0); scheduleIdle(); }, 150);
    }, 2800 + Math.random() * 3000);
  }
  function startSpeechMotion() {
    win.clearInterval(speechTimer); speechTimer = null;
    if (!speaking || !effectiveMotion()) { setFrame(0); return; }
    let step = 0;
    const frames = [1, 2, 1, 3, 1, 0, 2, 1];
    // Approximate cadence only. Browser speech events do not supply phonemes.
    speechTimer = win.setInterval(() => {
      step += 1; setFrame(frames[step % frames.length] + (step % 31 === 0 ? 4 : 0));
    }, 135);
  }
  function updateStatus(text) {
    if (refs.avatarStatus) refs.avatarStatus.textContent = text || (speaking ? '正在為你說明' : busy ? '正在整理你的需求' : '我在這裡，隨時可以開始');
    refs.stage?.classList.toggle('is-thinking', busy && effectiveMotion());
    refs.stage?.classList.toggle('is-speaking', speaking);
    refs.stage?.classList.toggle('has-motion', effectiveMotion());
    if (refs.stop) refs.stop.hidden = !speaking;
  }
  function stopSpeech() {
    speechRun += 1;
    if (activeUtterance) {
      activeUtterance.onstart = activeUtterance.onend = activeUtterance.onerror = activeUtterance.onboundary = null;
    }
    activeUtterance = null;
    if (speaking || speechTimer || speechDeadline) speech?.cancel();
    speaking = false;
    win.clearTimeout(speechDeadline); speechDeadline = null;
    clearAnimation(); setFrame(0); updateStatus(); scheduleIdle();
  }
  function voices() {
    if (!canSpeak) return [];
    return speech.getVoices().filter(voice => /^zh([_-]|$)/i.test(voice.lang))
      .sort((a, b) => Number(/^zh[-_]TW$/i.test(b.lang)) - Number(/^zh[-_]TW$/i.test(a.lang)));
  }
  function speak(text, fromGesture = false) {
    if (!canSpeak || disposed || revoked || doc.hidden) return;
    if (fromGesture) speechEnabledForVisit = true;
    if (!speechEnabledForVisit || (!preferences.sound && !fromGesture)) return;
    stopSpeech();
    const run = speechRun;
    const utterance = new win.SpeechSynthesisUtterance(String(text).slice(0, 4000));
    const available = voices();
    const selected = available.find(voice => voice.voiceURI === preferences.voiceURI) || available[0];
    if (selected) utterance.voice = selected;
    utterance.lang = selected?.lang || 'zh-TW';
    utterance.rate = preferences.persona === 'energetic' ? 1.03 : preferences.persona === 'professional' ? 0.96 : 0.98;
    activeUtterance = utterance;
    const finish = error => {
      if (run !== speechRun || disposed) return;
      stopSpeech();
      if (error) updateStatus('語音暫時無法播放，可以繼續閱讀文字');
    };
    utterance.onstart = () => {
      if (run !== speechRun || disposed) return;
      speaking = true; clearAnimation(); updateStatus();
      startSpeechMotion();
    };
    utterance.onboundary = () => { if (run === speechRun && speaking) setFrame(1); };
    utterance.onend = () => finish(false);
    utterance.onerror = () => finish(true);
    speechDeadline = win.setTimeout(() => finish(true), Math.min(240000, Math.max(15000, String(text).length * 600)));
    try { speech.speak(utterance); } catch { finish(true); }
  }
  function updateAvatar() {
    if (!refs.avatar) return;
    const persona = PERSONAS[preferences.persona];
    const source = `/assets/assistant-pilot/${preferences.persona}.png`;
    const load = ++avatarLoad;
    refs.avatar.style.backgroundImage = `url("${source}")`;
    refs.avatar.setAttribute('aria-label', `${persona.name}，${persona.type}虛擬助理`);
    refs.stage.dataset.persona = preferences.persona;
    refs.personaName.textContent = persona.name;
    refs.personaType.textContent = persona.type;
    refs.avatar.classList.remove('is-loaded');
    refs.avatarFallback.hidden = false;
    const picture = new win.Image();
    picture.onload = () => {
      if (!disposed && load === avatarLoad && refs.avatar) {
        refs.avatar.classList.add('is-loaded'); refs.avatarFallback.hidden = true;
      }
    };
    picture.onerror = () => { if (!disposed && load === avatarLoad) updateStatus('人物載入中，文字對話仍可使用'); };
    picture.src = source;
    setFrame(0); updateControls(); updateStatus(); scheduleIdle();
  }
  function updateControls() {
    if (refs.sound) {
      refs.sound.replaceChildren(icon(preferences.sound ? 'sound' : 'mute'), element('span', '', canSpeak ? `聲音${preferences.sound ? '開啟' : '關閉'}` : '文字模式'));
      refs.sound.disabled = !canSpeak || revoked;
      refs.sound.setAttribute('aria-pressed', String(preferences.sound));
    }
    if (refs.motion) {
      refs.motion.querySelector('span:last-child').textContent = reducedMotion?.matches ? '已減少動態' : `人物動態${preferences.motion ? '開' : '關'}`;
      refs.motion.setAttribute('aria-pressed', String(effectiveMotion()));
    }
  }
  function handleError(error, fallback) {
    const status = Number(error?.status || error?.response?.status || error?.statusCode);
    if (status === 401 || status === 403 || /(?:unauthorized|forbidden|pilot_access_denied|pilot_not_allowed|pilot_entry_required|invalid_pilot_entry)/i.test(error?.code || '')) {
      revoked = true; stopSpeech(); pendingAction = null; history = [];
      for (const [kind, key] of [['sessionStorage', conversationKey], ['localStorage', preferencesKey]]) {
        if (key) { try { win[kind].removeItem(key); } catch { /* Storage is optional. */ } }
      }
      lastError = status === 401 ? '登入已過期，請回到原頁重新登入。' : '這個帳號目前無法使用私人測試，請回到原版工作總覽。';
      closeDialog();
      if (typeof onAccessDenied === 'function') { onAccessDenied(error); return; }
      renderView();
    } else lastError = fallback;
    if (refs.error) { refs.error.textContent = lastError; refs.error.hidden = false; }
  }
  async function refreshContext() {
    if (disposed || revoked) return;
    const request = ++contextRequest;
    contextLoading = true; contextError = ''; updateContext();
    try {
      const result = await api('/v1/assistant-pilot/context', { method: 'GET' });
      if (disposed || request !== contextRequest) return;
      context = normalizeContext(result);
    } catch (error) {
      if (disposed || request !== contextRequest) return;
      context = null; contextError = '工作資料暫時讀取不到，請重試。';
      handleError(error, contextError);
    } finally {
      if (!disposed && request === contextRequest) { contextLoading = false; updateContext(); }
    }
  }
  function summaryCard(label, value, destination, iconName) {
    const node = button('', 'vap-summary-card', 'navigate', iconName);
    node.dataset.destination = destination;
    node.lastChild.remove();
    node.append(element('strong', '', value), element('span', 'vap-summary-label', label));
    return node;
  }
  function updateContext() {
    if (disposed || !rendered) return;
    if (refs.greeting) refs.greeting.textContent = `${name()}，今天想推進什麼？`;
    if (refs.summary) refs.summary.replaceChildren(
      summaryCard('可用點數', number(context?.wallet.balance), 'wallet', 'gift'),
      summaryCard('近期待辦', context?.tasksAvailable ? number(context.tasks.length) : '—', 'tasks', 'tasks'),
      summaryCard('收藏人脈', number(context?.contactCount), 'cardCollection', 'people'),
    );
    if (refs.contextHint) refs.contextHint.textContent = contextLoading ? '正在讀取你的工作資料…' : contextError || '資料來自你的會員帳號';
    if (refs.refresh) { refs.refresh.disabled = contextLoading || revoked; refs.refresh.textContent = contextLoading ? '讀取中…' : '重新整理'; }
    if (refs.taskList) {
      refs.taskList.replaceChildren();
      if (!context?.tasksAvailable) refs.taskList.append(element('p', 'vap-empty', contextLoading ? '正在讀取待辦…' : '待辦資料暫時無法顯示。'));
      else if (!context.tasks.length) refs.taskList.append(element('p', 'vap-empty', '目前沒有待辦，可以請助理幫你安排下一步。'));
      else for (const task of context.tasks.slice(0, 3)) {
        const row = button('', 'vap-task-row', 'navigate'); row.dataset.destination = 'tasks'; row.replaceChildren();
        const content = element('span', 'vap-task-text');
        content.append(element('strong', '', task.title), element('span', '', formatTaskDue(task.dueAt)));
        row.append(icon('tasks'), content, icon('arrow')); refs.taskList.append(row);
      }
    }
    if (refs.overviewPrompt) refs.overviewPrompt.textContent = context?.tasksAvailable && context.tasks.length
      ? `近期有 ${context.tasks.length} 件待辦。要一起整理下一步嗎？`
      : '需要整理名片、尋找合作人選，或安排事情嗎？';
  }
  function renderHeader(shell) {
    const header = element('header', 'vap-header');
    const brand = element('div', 'vap-brand');
    brand.append(element('span', 'vap-brand-mark', 'V'), element('strong', '', 'VEO'), element('span', 'vap-private', '私人測試'));
    const profile = button('我的', 'vap-profile-button', 'navigate', 'people'); profile.dataset.destination = 'profile';
    header.append(brand, profile);
    const navigation = element('nav', 'vap-tabs'); navigation.setAttribute('aria-label', '主畫面');
    for (const [key, label, iconName] of [['assistant', 'AI 助理', 'spark'], ['overview', '工作總覽', 'grid']]) {
      const tab = button(label, `vap-tab${view === key ? ' is-active' : ''}`, key, iconName);
      tab.setAttribute('aria-current', view === key ? 'page' : 'false'); navigation.append(tab);
    }
    shell.append(header, navigation);
  }
  function renderAssistant(shell) {
    const stage = element('section', 'vap-avatar-stage'); refs.stage = stage;
    stage.setAttribute('aria-label', '你的虛擬助理');
    const stageTop = element('div', 'vap-stage-top');
    const identity = element('div', 'vap-persona-identity');
    refs.personaName = element('strong', '', PERSONAS[preferences.persona].name);
    refs.personaType = element('span', '', PERSONAS[preferences.persona].type);
    identity.append(refs.personaName, refs.personaType);
    stageTop.append(identity, button('更換人物', 'vap-small-button vap-persona-switch', 'personas', 'people'));
    const portrait = element('div', 'vap-portrait');
    refs.avatar = element('div', 'vap-avatar'); refs.avatar.setAttribute('role', 'img');
    refs.avatarFallback = element('div', 'vap-avatar-fallback');
    refs.avatarFallback.append(element('span', '', 'V'), element('small', '', '你的 AI 助理'));
    portrait.append(refs.avatar, refs.avatarFallback);
    const status = element('div', 'vap-avatar-status');
    status.append(element('span', 'vap-status-dot'));
    refs.avatarStatus = element('span', '', '我在這裡，隨時可以開始'); status.append(refs.avatarStatus);
    const controls = element('div', 'vap-avatar-controls');
    refs.sound = button('聲音關閉', 'vap-control', 'sound', 'mute');
    refs.motion = button('人物動態開', 'vap-control', 'motion', 'motion');
    refs.stop = button('停止朗讀', 'vap-control vap-stop', 'stop', 'stop'); refs.stop.hidden = true;
    controls.append(refs.sound, refs.motion, refs.stop);
    stage.append(stageTop, portrait, status, controls); shell.append(stage);

    const conversation = element('section', 'vap-conversation'); conversation.setAttribute('aria-label', '助理對話');
    const intro = element('div', 'vap-intro');
    refs.greeting = element('h1', '', `${name()}，今天想推進什麼？`);
    intro.append(refs.greeting, element('p', '', '直接告訴我，也可以從下面開始。')); conversation.append(intro);
    const starters = element('div', 'vap-starters');
    for (const [label, message, iconName] of [
      ['整理名片', '我想整理一張名片', 'card'],
      ['找合作人選', '幫我找合作對象，請先問我需要什麼類型', 'people'],
      ['安排下一步', '幫我看看待辦，安排下一步', 'tasks'],
    ]) {
      const starter = button(label, 'vap-starter', 'prompt', iconName); starter.dataset.message = message; starters.append(starter);
    }
    conversation.append(starters);
    refs.messages = element('div', 'vap-messages');
    refs.messages.setAttribute('role', 'log'); refs.messages.setAttribute('aria-label', '對話紀錄'); refs.messages.setAttribute('aria-live', 'polite');
    refs.messages.setAttribute('aria-relevant', 'additions text');
    refs.actions = element('div', 'vap-action-area');
    refs.error = element('div', 'vap-error'); refs.error.setAttribute('role', 'alert'); refs.error.hidden = !lastError; refs.error.textContent = lastError;
    const form = element('form', 'vap-composer'); form.dataset.pilotComposer = 'true';
    const label = element('label', 'vap-visually-hidden', '輸入你的需求'); label.htmlFor = 'vap-message-input';
    refs.input = element('textarea', 'vap-input'); refs.input.id = 'vap-message-input'; refs.input.rows = 1;
    refs.input.maxLength = 2000; refs.input.placeholder = '輸入訊息，和助理聊聊…'; refs.input.disabled = busy || confirming || revoked;
    refs.send = button('送出', 'vap-send', null, 'send'); refs.send.type = 'submit'; refs.send.disabled = busy || confirming || revoked;
    refs.send.setAttribute('aria-label', '送出訊息'); form.append(label, refs.input, refs.send);
    conversation.append(refs.messages, refs.actions, refs.error, form, element('p', 'vap-caption', '建立事項前會先請你確認。人物嘴型為簡易語音動畫。'));
    shell.append(conversation); renderMessages(); renderAction(); updateAvatar();
  }
  function feature(label, description, destination, iconName) {
    const item = button('', 'vap-feature', 'navigate', iconName); item.dataset.destination = destination; item.lastChild.remove();
    const text = element('span', 'vap-feature-text'); text.append(element('strong', '', label), element('small', '', description)); item.append(text); return item;
  }
  function renderOverview(shell) {
    const page = element('section', 'vap-overview');
    const heading = element('div', 'vap-overview-heading');
    const headingText = element('div');
    headingText.append(element('p', 'vap-eyebrow', 'YOUR WORKSPACE'));
    refs.greeting = element('h1', '', `${name()}，今天想推進什麼？`); headingText.append(refs.greeting);
    refs.refresh = button('重新整理', 'vap-text-button', 'refresh'); heading.append(headingText, refs.refresh); page.append(heading);
    refs.summary = element('div', 'vap-summary');
    refs.contextHint = element('p', 'vap-context-hint'); page.append(refs.summary, refs.contextHint);
    const helper = element('div', 'vap-helper-card');
    const miniAvatar = element('div', 'vap-mini-avatar'); miniAvatar.style.backgroundImage = `url("/assets/assistant-pilot/${preferences.persona}.png")`;
    const helperText = element('div', 'vap-helper-text'); helperText.append(element('strong', '', `${PERSONAS[preferences.persona].name}陪你整理`));
    refs.overviewPrompt = element('p'); helperText.append(refs.overviewPrompt);
    helper.append(miniAvatar, helperText, button('找助理', 'vap-small-button', 'assistant', 'arrow')); page.append(helper);
    const features = element('div', 'vap-features');
    features.append(feature('名片收藏', '整理我的人脈', 'cardCollection', 'people'), feature('電子名片', '分享與介紹自己', 'card', 'card'),
      feature('智能配對', '尋找合作機會', 'smartMatch', 'spark'), feature('個人行程', '查看時間安排', 'calendar', 'calendar'),
      feature('AI 任務', '追蹤每個下一步', 'tasks', 'tasks'), feature('每日簽到', '查看活動與進度', 'daily', 'gift'));
    page.append(features);
    const tasks = element('section', 'vap-panel');
    const taskHeader = element('div', 'vap-panel-heading'); taskHeader.append(element('h2', '', '接下來的事情'));
    const seeAll = button('查看全部', 'vap-text-button', 'navigate'); seeAll.dataset.destination = 'tasks'; taskHeader.append(seeAll);
    refs.taskList = element('div', 'vap-task-list'); tasks.append(taskHeader, refs.taskList); page.append(tasks);
    const events = element('section', 'vap-panel'); events.append(element('h2', '', '活動與學習'));
    const eventGrid = element('div', 'vap-event-grid');
    eventGrid.append(feature('活動與簽到', '查看活動內容及贈點條件', 'daily', 'gift'), feature('課程報名', '查看課程與報名資訊', 'courses', 'calendar'));
    events.append(eventGrid); page.append(events);
    refs.error = element('div', 'vap-error'); refs.error.setAttribute('role', 'alert'); refs.error.hidden = !lastError; refs.error.textContent = lastError; page.append(refs.error);
    page.append(button('開啟原版完整總覽', 'vap-original-button', 'original', 'grid'));
    shell.append(page); updateContext();
  }
  function renderMessages() {
    if (!refs.messages || view !== 'assistant' || disposed) return;
    refs.messages.replaceChildren();
    const entries = history.length ? history : [{ role: 'assistant', content: '很高興陪你一起工作。你可以請我整理人脈、找合作方向，或把想做的事變成下一步。' }];
    for (const entry of entries) {
      const row = element('div', `vap-message-row is-${entry.role}`);
      const bubble = element('div', 'vap-bubble');
      if (entry.role === 'assistant') bubble.append(element('span', 'vap-message-author', PERSONAS[preferences.persona].name));
      bubble.append(element('p', '', entry.content));
      if (entry.role === 'assistant' && canSpeak && history.length) {
        const read = button('朗讀', 'vap-read', 'read', 'sound'); read.dataset.messageIndex = String(history.indexOf(entry)); bubble.append(read);
      }
      row.append(bubble); refs.messages.append(row);
    }
    if (busy) {
      const status = element('div', 'vap-thinking', '正在整理你的需求…'); status.setAttribute('role', 'status'); refs.messages.append(status);
    }
    refs.messages.scrollTop = refs.messages.scrollHeight;
  }
  function renderAction() {
    if (!refs.actions || view !== 'assistant') return;
    refs.actions.replaceChildren();
    if (!pendingAction || revoked) return;
    if (pendingAction.type === 'navigate') {
      const nav = button(pendingAction.label, 'vap-primary-button', 'navigate', 'arrow'); nav.dataset.destination = pendingAction.destination; refs.actions.append(nav); return;
    }
    const draft = pendingAction.draft;
    const card = element('section', 'vap-draft'); card.setAttribute('aria-label', '待確認的任務');
    card.append(element('span', 'vap-draft-label', '確認後才會建立'), element('h2', '', draft.title), element('p', 'vap-draft-date', formatTaskDue(draft.dueAt)));
    if (draft.notes) card.append(element('p', 'vap-draft-notes', draft.notes));
    if (draft.description) card.append(element('p', 'vap-draft-notes', draft.description));
    if (draft.contactName) card.append(element('p', 'vap-draft-notes', `聯繫對象：${draft.contactName}`));
    card.append(element('p', 'vap-draft-notes', '測試任務，不發送 LINE／Telegram 通知。'));
    const actions = element('div', 'vap-draft-buttons');
    const confirm = button(confirming ? '正在建立…' : '確認建立', 'vap-primary-button', 'confirm', 'check'); confirm.disabled = confirming || busy;
    const adjust = button('調整內容', 'vap-secondary-button', 'adjust'); adjust.disabled = confirming || busy;
    actions.append(confirm, adjust); card.append(actions); refs.actions.append(card);
  }
  function renderView() {
    if (disposed) return;
    closeDialog(); stopSpeech();
    eventController?.abort(); eventController = new win.AbortController();
    Object.keys(refs).forEach(key => delete refs[key]);
    root.replaceChildren(); root.classList.add('veo-assistant-pilot');
    const shell = element('div', `vap-shell vap-view-${view}`); renderHeader(shell);
    if (revoked) {
      const panel = element('section', 'vap-access-error');
      panel.append(element('h1', '', '私人測試目前無法使用'), element('p', '', lastError), button('回到原版工作總覽', 'vap-primary-button', 'original'));
      shell.append(panel);
    } else if (view === 'assistant') renderAssistant(shell); else renderOverview(shell);
    root.append(shell); rendered = true;
    root.addEventListener('click', handleClick, { signal: eventController.signal });
    root.addEventListener('submit', handleSubmit, { signal: eventController.signal });
    root.addEventListener('keydown', handleKeydown, { signal: eventController.signal });
    updateContext(); updateStatus(); scheduleIdle();
  }
  function navigate(destination) {
    if (!PILOT_DESTINATIONS.has(destination) || revoked || busy || confirming) return;
    stopSpeech(); closeDialog();
    if (typeof onNavigate === 'function') onNavigate(destination);
  }
  function switchView(next) {
    if (!['assistant', 'overview'].includes(next)) return;
    view = next; renderView();
  }
  function setBusy(value) {
    busy = value;
    if (refs.input) refs.input.disabled = busy || confirming || revoked;
    if (refs.send) refs.send.disabled = busy || confirming || revoked;
    root.querySelectorAll('.vap-starter').forEach(node => { node.disabled = busy || confirming || revoked; });
    updateStatus(); renderMessages(); renderAction();
  }
  async function sendMessage(message) {
    const content = String(message || '').trim().slice(0, 2000);
    if (!content || busy || confirming || revoked || disposed) return;
    stopSpeech(); speechEnabledForVisit = true;
    const previousHistory = normalizeHistory(history).slice(-8)
      .map(item => ({ role: item.role, content: item.content.slice(0, 1200) }));
    history.push({ role: 'user', content }); pendingAction = null; lastError = ''; persistConversation();
    if (refs.input) refs.input.value = '';
    if (refs.error) refs.error.hidden = true;
    setBusy(true);
    try {
      const result = await api('/v1/assistant-pilot/reply', { method: 'POST', body: JSON.stringify({ message: content, history: previousHistory }) });
      if (disposed || revoked) return;
      if (typeof result?.reply !== 'string' || !result.reply.trim()) throw new Error('Empty assistant reply');
      history.push({ role: 'assistant', content: result.reply.trim().slice(0, 6000) });
      pendingAction = normalizeAction(result.action); persistConversation();
      if (view === 'assistant' && preferences.sound) speak(result.reply);
    } catch (error) {
      if (disposed) return;
      handleError(error, '助理暫時無法回覆，訊息已保留。請稍後再試一次。');
    } finally {
      if (!disposed) { setBusy(false); if (view === 'assistant' && !revoked) refs.input?.focus({ preventScroll: true }); }
    }
  }
  async function confirmTask() {
    if (pendingAction?.type !== 'task' || busy || confirming || revoked || disposed) return;
    const currentAction = pendingAction;
    confirming = true; lastError = ''; if (refs.error) refs.error.hidden = true; setBusy(false);
    try {
      const result = await api('/v1/assistant-pilot/confirm', { method: 'POST', body: JSON.stringify({ confirmationToken: currentAction.confirmationToken }) });
      if (disposed || revoked) return;
      if (result?.success === false || !result?.task ||
          !['string', 'number'].includes(typeof result.task.id) || !String(result.task.id).trim()) {
        throw new Error('Task creation not confirmed');
      }
      pendingAction = null;
      history.push({ role: 'assistant', content: result.replayed ? `這件測試任務已經建立過了：「${currentAction.draft.title}」。可以到工作總覽查看，本次不發送 LINE／Telegram 通知。` : `已建立測試任務「${currentAction.draft.title}」。可以到工作總覽查看，本次不發送 LINE／Telegram 通知。` });
      persistConversation(); await refreshContext();
    } catch (error) {
      if (!disposed) handleError(error, '目前無法確認建立結果。草稿已保留，再次確認不會重複建立同一件事。');
    } finally {
      if (!disposed) { confirming = false; setBusy(false); }
    }
  }
  function handleSubmit(event) {
    if (!event.target.matches('[data-pilot-composer]')) return;
    event.preventDefault(); sendMessage(refs.input?.value);
  }
  function handleKeydown(event) {
    if (event.target === refs.input && event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault(); sendMessage(refs.input.value);
    }
  }
  function handleClick(event) {
    const target = event.target.closest('[data-pilot-action]');
    if (!target || !root.contains(target) || target.disabled) return;
    const action = target.dataset.pilotAction;
    if (action === 'original') { stopSpeech(); closeDialog(); onOverview?.(); return; }
    if (revoked) return;
    if (action === 'assistant' || action === 'overview') switchView(action);
    else if (action === 'navigate') navigate(target.dataset.destination);
    else if (action === 'prompt') sendMessage(target.dataset.message);
    else if (action === 'refresh') refreshContext();
    else if (action === 'personas') openDialog(target);
    else if (action === 'stop') stopSpeech();
    else if (action === 'sound') {
      preferences.sound = !preferences.sound; persistPreferences(); updateControls();
      if (preferences.sound) speak('聲音已開啟，我會陪你一起整理事情。', true); else stopSpeech();
    } else if (action === 'motion') {
      preferences.motion = !preferences.motion; persistPreferences();
      if (!effectiveMotion()) { clearAnimation(); setFrame(0); } else if (speaking) startSpeechMotion(); else scheduleIdle();
      updateControls(); updateStatus();
    } else if (action === 'read') {
      const entry = history[Number(target.dataset.messageIndex)];
      if (entry?.role === 'assistant') speak(entry.content, true);
    } else if (action === 'confirm') confirmTask();
    else if (action === 'adjust') {
      if (refs.input) { refs.input.value = `調整剛才的任務「${pendingAction?.draft?.title || ''}」：`; refs.input.focus(); }
    }
  }
  function closeDialog() {
    if (!dialog) return;
    const old = dialog; dialog = null; old.remove();
    if (dialogPreviousFocus?.isConnected) dialogPreviousFocus.focus({ preventScroll: true });
    dialogPreviousFocus = null;
  }
  function populateVoices(select) {
    const list = voices(); select.replaceChildren();
    const automatic = element('option', '', '自動選擇中文聲音'); automatic.value = ''; select.append(automatic);
    for (const voice of list) {
      const option = element('option', '', `${voice.name}（${voice.lang}）`); option.value = voice.voiceURI; select.append(option);
    }
    select.value = list.some(voice => voice.voiceURI === preferences.voiceURI) ? preferences.voiceURI : '';
    select.disabled = !canSpeak;
  }
  function openDialog(trigger) {
    stopSpeech(); closeDialog(); dialogPreviousFocus = trigger;
    dialog = element('div', 'vap-modal-backdrop');
    const panel = element('section', 'vap-modal'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'vap-personas-title');
    const header = element('div', 'vap-modal-heading');
    const title = element('h2', '', '選一位陪你工作的助理'); title.id = 'vap-personas-title';
    const close = button('關閉', 'vap-close-button', null, 'close'); close.addEventListener('click', closeDialog); header.append(title, close);
    panel.append(header, element('p', 'vap-modal-description', '更換人物會保留你的對話、資料與待確認事項。'));
    const choices = element('div', 'vap-persona-choices'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', '助理人物');
    for (const [key, persona] of Object.entries(PERSONAS)) {
      const choice = button('', `vap-persona-choice ${key === preferences.persona ? 'is-selected' : ''}`);
      choice.setAttribute('aria-pressed', String(key === preferences.persona)); choice.replaceChildren();
      const portrait = element('div', `vap-choice-portrait vap-${persona.color}`); portrait.style.backgroundImage = `url("/assets/assistant-pilot/${key}.png")`;
      const labels = element('span', 'vap-choice-labels'); labels.append(element('strong', '', persona.name), element('span', '', persona.type), element('small', '', persona.description));
      choice.append(portrait, labels);
      choice.addEventListener('click', () => {
        stopSpeech(); preferences.persona = key; persistPreferences(); updateAvatar(); renderMessages();
        choices.querySelectorAll('button').forEach(node => { node.classList.remove('is-selected'); node.setAttribute('aria-pressed', 'false'); });
        choice.classList.add('is-selected'); choice.setAttribute('aria-pressed', 'true');
      }); choices.append(choice);
    }
    panel.append(choices);
    const voiceLabel = element('label', 'vap-voice-label', '助理聲音'); voiceLabel.htmlFor = 'vap-voice-choice';
    const voiceSelect = element('select', 'vap-voice-select'); voiceSelect.id = 'vap-voice-choice'; populateVoices(voiceSelect);
    voiceSelect.addEventListener('change', () => { stopSpeech(); preferences.voiceURI = voiceSelect.value; persistPreferences(); });
    const preview = button(canSpeak ? '試聽聲音' : '此瀏覽器使用文字模式', 'vap-secondary-button', null, 'sound'); preview.disabled = !canSpeak;
    preview.addEventListener('click', () => speak(`你好，我是${PERSONAS[preferences.persona].name}。今天想先完成什麼事情？`, true));
    panel.append(voiceLabel, voiceSelect, preview, element('p', 'vap-caption', '可用聲音由裝置提供；說話時以簡易嘴型動畫呈現。'));
    const done = button('完成選擇', 'vap-primary-button vap-modal-done'); done.addEventListener('click', closeDialog); panel.append(done);
    dialog.append(panel); root.append(dialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); stopSpeech(); closeDialog(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...panel.querySelectorAll('button:not([disabled]),select:not([disabled]),[tabindex="0"]')];
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    close.focus({ preventScroll: true });
  }
  function onVisibilityChange() { if (doc.hidden) stopSpeech(); else scheduleIdle(); }
  function onReducedMotion() { clearAnimation(); setFrame(0); updateControls(); updateStatus(); if (speaking) startSpeechMotion(); else scheduleIdle(); }
  function onVoicesChanged() { const select = dialog?.querySelector('select'); if (select) populateVoices(select); }
  doc.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotion?.addEventListener?.('change', onReducedMotion);
  speech?.addEventListener?.('voiceschanged', onVoicesChanged);

  function render() { if (disposed) return; renderView(); if (!context && !contextLoading) refreshContext(); }
  function dispose() {
    if (disposed) return;
    stopSpeech(); disposed = true; contextRequest += 1; clearAnimation(); closeDialog(); eventController?.abort();
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    reducedMotion?.removeEventListener?.('change', onReducedMotion);
    speech?.removeEventListener?.('voiceschanged', onVoicesChanged);
    root.classList.remove('veo-assistant-pilot'); root.replaceChildren();
  }
  return { render, dispose, refreshContext, stopSpeech };
}
