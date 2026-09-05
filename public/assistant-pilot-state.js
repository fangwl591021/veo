export const PILOT_DESTINATIONS = new Set([
  'cardCollection', 'card', 'smartMatch', 'calendar', 'tasks',
  'daily', 'courses', 'wallet', 'profile',
]);

export function getMemberKey(member) {
  const id = member?.userId ?? member?.id ?? member?.memberId ?? member?.member_id;
  return (typeof id === 'string' || typeof id === 'number') && String(id).trim()
    ? String(id).trim() : '';
}

export function storageKey(member, suffix) {
  const key = getMemberKey(member);
  return key ? `veo:assistant-pilot:${encodeURIComponent(key)}:${suffix}` : null;
}

export function normalizePreferences(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    persona: ['friendly', 'professional', 'energetic'].includes(value.persona) ? value.persona : 'friendly',
    sound: value.sound === true,
    motion: value.motion !== false,
    voiceURI: typeof value.voiceURI === 'string' ? value.voiceURI.slice(0, 200) : '',
  };
}

export function normalizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(item => item && ['user', 'assistant'].includes(item.role) &&
    typeof item.content === 'string' && item.content.trim()).slice(-24)
    .map(item => ({ role: item.role, content: item.content.trim().slice(0, 6000) }));
}

export function normalizeAction(action) {
  if (!action || typeof action !== 'object') return null;
  if (action.type === 'navigate' && PILOT_DESTINATIONS.has(action.destination)) {
    return {
      type: 'navigate', destination: action.destination,
      label: typeof action.label === 'string' && action.label.trim()
        ? action.label.trim().slice(0, 60) : '開啟功能',
    };
  }
  if (action.type === 'task' && typeof action.confirmationToken === 'string' &&
      action.confirmationToken.trim() && action.confirmationToken.length <= 16384 &&
      typeof action.draft?.title === 'string' && action.draft.title.trim()) {
    const draft = { title: action.draft.title.trim().slice(0, 200) };
    for (const key of ['dueAt', 'notes', 'description', 'contactName', 'priority']) {
      if (typeof action.draft[key] === 'string') draft[key] = action.draft[key].slice(0, 1500);
    }
    return { type: 'task', draft, confirmationToken: action.confirmationToken };
  }
  return null;
}

export function getActiveTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  const closed = new Set(['done', 'completed', 'complete', 'resolved', 'cancelled', 'canceled', 'archived']);
  return tasks.filter(task => task && typeof task === 'object' &&
    typeof task.title === 'string' && task.title.trim() &&
    !closed.has(String(task.status || '').toLowerCase()) &&
    task.completed !== true && task.isCompleted !== true).slice(0, 20)
    .map(task => ({
      id: typeof task.id === 'string' || typeof task.id === 'number' ? String(task.id) : '',
      title: task.title.trim().slice(0, 200),
      dueAt: typeof task.dueAt === 'string' ? task.dueAt.slice(0, 80) : null,
      status: typeof task.status === 'string' ? task.status : 'pending',
    }));
}

function nonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeContext(raw) {
  return {
    wallet: { balance: nonNegativeNumber(raw?.wallet?.balance) },
    contactCount: nonNegativeNumber(raw?.contactCount),
    tasks: getActiveTasks(raw?.tasks),
    tasksAvailable: Array.isArray(raw?.tasks),
    member: raw?.member && typeof raw.member === 'object' ? raw.member : null,
  };
}

export function formatTaskDue(value) {
  if (!value || typeof value !== 'string') return '待安排時間';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '待安排時間';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}
