/** Local fieldwork planning only. No Facebook requests or messages are sent. */
export const STAGES = Object.freeze({
  new: 'Chưa liên hệ',
  contacted: 'Đã xin phép',
  approved: 'Được phép đăng',
  pending: 'Bài chờ duyệt',
  posted: 'Đã đăng bài',
  paused: 'Tạm dừng',
  rejected: 'Bị từ chối'
});

export const FIELDWORK_FIELDS = Object.freeze([
  'stage', 'contactedAt', 'submittedAt', 'postedAt', 'lastReviewedAt', 'nextActionAt',
  'nextAction', 'postUrl', 'sourceCode', 'surveyUrl', 'received', 'rejected',
  'minutesSpent', 'stopReason'
]);

const utcToday = () => new Date().toISOString().slice(0, 10);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const dayValue = value => {
  if (typeof value !== 'string') return '';
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const stamp = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== day) return '';
  if (value.length > 10 && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)))) return '';
  return day;
};
const addDays = (day, days) => {
  const normalized = dayValue(day);
  return normalized ? new Date(Date.parse(`${normalized}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10) : '';
};

/** Stable FNV-1a identifier; this code labels a source, not an individual. */
export function makeSourceCode(id) {
  let hash = 2166136261;
  for (const char of String(id ?? '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `GS-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

export function validateFieldwork(input, { today = utcToday(), responses = 0 } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['Dữ liệu thu thập phải là một đối tượng.'], value: null };
  const errors = [];
  const string = (key, max, fallback = '') => {
    const raw = input[key] ?? fallback;
    if (typeof raw !== 'string') { errors.push(`${key}: phải là chuỗi.`); return ''; }
    const text = raw.trim();
    if (text.length > max) errors.push(`${key}: vượt quá ${max} ký tự.`);
    return text;
  };
  const date = (key, future = false) => {
    if (input[key] == null || input[key] === '') return '';
    const day = dayValue(input[key]);
    if (!day) errors.push(`${key}: phải là ngày ISO hợp lệ.`);
    else if (!future && day > today) errors.push(`${key}: không được ở tương lai.`);
    return day;
  };
  const number = (key, integer = true, nullable = false) => {
    const raw = input[key];
    if (raw == null || raw === '' || (typeof raw === 'string' && !raw.trim())) return nullable ? null : 0;
    const value = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) errors.push(`${key}: phải là số ${integer ? 'nguyên ' : ''}không âm hợp lệ.`);
    return value;
  };
  const stage = string('stage', 20, 'new');
  if (!Object.hasOwn(STAGES, stage)) errors.push('stage: trạng thái thu thập không hợp lệ.');
  const contactedAt = date('contactedAt');
  const submittedAt = date('submittedAt');
  const postedAt = date('postedAt');
  const lastReviewedAt = date('lastReviewedAt');
  const nextActionAt = date('nextActionAt', true);
  const requiredDate = { contacted: ['contactedAt', contactedAt], pending: ['submittedAt', submittedAt], posted: ['postedAt', postedAt] }[stage];
  if (requiredDate && !requiredDate[1]) errors.push(`${requiredDate[0]}: cần ghi ngày thực hiện khi chọn trạng thái này.`);
  const nextAction = string('nextAction', 300);
  const stopReason = string('stopReason', 1000);
  const sourceCode = string('sourceCode', 24, makeSourceCode(input.id)).toUpperCase() || makeSourceCode(input.id);
  if (!/^[A-Z0-9_-]{2,24}$/.test(sourceCode)) errors.push('sourceCode: dùng 2–24 ký tự A–Z, 0–9, dấu gạch dưới hoặc gạch ngang.');
  let postUrl = string('postUrl', 500);
  if (postUrl) {
    try {
      const url = new URL(postUrl);
      if (url.protocol !== 'https:' || !['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname) || url.username || url.password || url.port || !/^\/groups\/[A-Za-z0-9._-]+\/(?:posts|permalink)\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)) throw new Error('invalid');
      postUrl = `https://www.facebook.com${url.pathname.replace(/\/?$/, '/')}`;
    } catch { errors.push('postUrl: dùng liên kết HTTPS bài đăng Facebook trong nhóm (posts hoặc permalink).'); }
  }
  let surveyUrl = string('surveyUrl', 2000);
  if (surveyUrl) {
    try {
      const url = new URL(surveyUrl);
      const validPath = url.hostname === 'forms.gle' ? /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) : url.hostname === 'docs.google.com' && /^\/forms\/(?:u\/\d+\/)?(?:d\/(?:e\/)?[^/]+\/)viewform\/?$/.test(url.pathname);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !validPath) throw new Error('invalid');
      surveyUrl = url.href;
    } catch { errors.push('surveyUrl: dùng liên kết HTTPS forms.gle hoặc Google Forms có đường dẫn viewform.'); }
  }
  const received = number('received', true, true);
  const rejected = number('rejected');
  const minutesSpent = number('minutesSpent', false);
  if (received == null && rejected !== 0) errors.push('Cần nhập tổng phản hồi nhận được trước khi ghi số phản hồi loại.');
  if (received != null && Number.isFinite(received) && Number.isFinite(responses) && Number.isFinite(rejected) && received < responses + rejected) errors.push('Tổng phản hồi nhận được phải lớn hơn hoặc bằng mẫu hợp lệ cộng mẫu loại.');
  const value = { stage, contactedAt, submittedAt, postedAt, lastReviewedAt, nextActionAt, nextAction, postUrl, sourceCode, surveyUrl, received, rejected, minutesSpent, stopReason };
  return { ok: errors.length === 0, errors, value };
}

/** At most one manual task per real group. Future reminders defer automatic
 * stage tasks; denied permission and stale verification still need attention. */
export function buildTaskQueue(groups, { today = utcToday() } = {}) {
  const tasks = [];
  for (const group of groups) {
    if (group._demo || ['paused', 'rejected'].includes(group.stage)) continue;
    const task = (type, title, dueAt, priority) => tasks.push({ groupId: group.id, type, title, dueAt, priority });
    const next = dayValue(group.nextActionAt);
    const verified = dayValue(group.verifiedAt);
    if (group.surveys === 'no') {
      task('blocked', 'Tạm dừng: nội quy không cho đăng khảo sát', '', 100);
    } else if (next && next <= today) {
      task('scheduled', group.nextAction || 'Thực hiện công việc đã hẹn', next, 90);
    } else if (!verified || addDays(verified, 30) < today) {
      task('verify', 'Kiểm tra lại nội quy và quyền đăng của nhóm', verified ? addDays(verified, 31) : today, 80);
    } else if (next && next > today) {
      continue;
    } else if (group.stage === 'approved') {
      task('prepare', 'Chuẩn bị bài mời khảo sát', today, 60);
    } else if (['contacted', 'pending', 'posted'].includes(group.stage)) {
      const stageDate = dayValue(group.stage === 'contacted' ? group.contactedAt : group.stage === 'pending' ? group.submittedAt : group.postedAt);
      const reviewed = dayValue(group.lastReviewedAt);
      const since = reviewed && reviewed > stageDate ? reviewed : stageDate;
      const due = addDays(since, 3);
      if (!stageDate || !due || due > today) continue;
      if (group.stage === 'posted') {
        const stats = groupYield(group);
        const title = stats.received == null ? 'Kiểm tra và cập nhật số phản hồi đã nhận' : stats.pending > 0 ? 'Rà soát phản hồi chưa kiểm tra' : 'Kiểm tra phản hồi mới từ bài đã đăng';
        task('review', title, due, 40);
      } else {
        task('check', group.stage === 'pending' ? 'Kiểm tra trạng thái duyệt bài' : 'Kiểm tra kết quả xin phép quản trị viên', due, 50);
      }
    }
  }
  return tasks.sort((a, b) => {
    const aDue = a.dueAt && a.dueAt <= today ? 1 : 0;
    const bDue = b.dueAt && b.dueAt <= today ? 1 : 0;
    return bDue - aDue || (aDue && bDue ? a.dueAt.localeCompare(b.dueAt) : 0) || b.priority - a.priority || String(a.groupId).localeCompare(String(b.groupId));
  });
}

export function groupYield(group) {
  if (group._demo) return { valid: 0, received: 0, rejected: 0, pending: 0, rate: null, minutesPerValid: null };
  const valid = count(group.responses);
  const received = group.received != null && group.received !== '' && Number.isSafeInteger(group.received) && group.received >= 0 ? group.received : null;
  const rejected = count(group.rejected);
  const minutes = Number.isFinite(group.minutesSpent) && group.minutesSpent >= 0 ? group.minutesSpent : 0;
  return {
    valid, received, rejected,
    pending: received == null ? 0 : Math.max(0, received - valid - rejected),
    rate: received > 0 && received >= valid + rejected ? valid / received : null,
    minutesPerValid: valid > 0 && minutes > 0 ? minutes / valid : null
  };
}

export function responseSummary(groups, baseline = 0) {
  const base = count(baseline);
  const summary = { valid: base, receivedKnown: 0, rejected: 0, pending: 0, unknownSources: 0, baselineUnknown: base > 0, rate: null };
  let inconsistent = false;
  for (const group of groups) {
    if (group._demo) continue;
    const stats = groupYield(group);
    summary.valid += stats.valid;
    summary.rejected += stats.rejected;
    summary.pending += stats.pending;
    if (stats.received == null) summary.unknownSources++;
    else {
      summary.receivedKnown += stats.received;
      if (stats.received < stats.valid + stats.rejected) inconsistent = true;
    }
  }
  if (!summary.unknownSources && !summary.baselineUnknown && !inconsistent && summary.receivedKnown > 0) summary.rate = summary.valid / summary.receivedKnown;
  return summary;
}
