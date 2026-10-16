/** Local planning helpers. This module never requests or verifies Facebook data. */
import { FIELDWORK_FIELDS, validateFieldwork } from './fieldwork.js';
export const MAX_GROUPS = 1000;
const LIMITS = { name: 160, url: 500, category: 80, location: 80, notes: 3000, id: 160 };
const PERMISSIONS = new Set(['yes', 'no', 'unknown']);
const GROUP_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'mbasic.facebook.com']);
const NUMBER_LABELS = { members: 'Số thành viên', postsPerDay: 'Số bài đăng trung bình mỗi ngày', responses: 'Số phản hồi hợp lệ' };
export const normalizeText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();
export const formatNumber = value => value == null ? 'Chưa rõ' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);

export function validateGroup(input, { today = new Date().toLocaleDateString('en-CA') } = {}) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['Dữ liệu nhóm phải là một đối tượng.'], value: null };
  const string = (key, fallback = '') => {
    const raw = input[key] ?? fallback;
    if (typeof raw !== 'string') { errors.push(`${key}: phải là chuỗi.`); return ''; }
    const value = raw.trim();
    if (value.length > LIMITS[key]) errors.push(`${key}: vượt quá ${LIMITS[key]} ký tự.`);
    return value;
  };
  const name = string('name');
  if (!name) errors.push('Vui lòng nhập tên nhóm.');
  let url = string('url');
  let slug = '';
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/groups\/([A-Za-z0-9._-]+)\/?$/);
    if (parsed.protocol !== 'https:' || !GROUP_HOSTS.has(parsed.hostname) || parsed.username || parsed.password || parsed.port || !match) throw new Error('invalid');
    slug = match[1];
    url = `https://www.facebook.com/groups/${slug}/`;
  } catch { errors.push('Hãy mở trang nhóm Facebook và sao chép link có /groups/ten-hoac-id-nhom/. Nếu link có /share/g/, hãy mở link rồi lấy địa chỉ trang nhóm.'); }
  const id = string('id', slug ? `fb-${slug.toLowerCase()}` : '');
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) errors.push('ID nhóm không hợp lệ.');
  const number = (key, integer, unknown = false) => {
    const raw = input[key];
    if (raw === '' || raw == null || (typeof raw === 'string' && !raw.trim())) return unknown ? null : 0;
    const value = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) errors.push(`${NUMBER_LABELS[key] || key}: phải là số ${integer ? 'nguyên ' : ''}không âm hợp lệ.`);
    return value;
  };
  const members = number('members', true, true);
  const postsPerDay = number('postsPerDay', false, true);
  const responses = number('responses', true);
  const permission = key => {
    const value = input[key] ?? 'unknown';
    if (!PERMISSIONS.has(value)) errors.push(`${key}: chỉ nhận yes, no hoặc unknown.`);
    return value;
  };
  const anonymous = permission('anonymous');
  const surveys = permission('surveys');
  const category = string('category');
  const location = string('location');
  const notes = string('notes');
  let verifiedAt = '';
  if (input.verifiedAt != null && input.verifiedAt !== '') {
    const raw = input.verifiedAt;
    const day = typeof raw === 'string' ? raw.slice(0, 10) : '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00Z`) : new Date(NaN);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day || (raw.length > 10 && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw) || !Number.isFinite(Date.parse(raw))))) errors.push('Ngày xác minh phải là ngày ISO hợp lệ.');
    else verifiedAt = day;
  }
  if (input.saved != null && typeof input.saved !== 'boolean') errors.push('saved: phải là true hoặc false.');
  if ((anonymous === 'yes' || surveys === 'yes') && !verifiedAt) errors.push('Hãy ghi ngày kiểm tra khi xác nhận quyền đăng.');
  if (verifiedAt && verifiedAt > today) errors.push('Ngày kiểm tra không được ở tương lai.');
  const fieldwork = validateFieldwork({ ...input, id }, { today, responses });
  errors.push(...fieldwork.errors);
  const value = { id, name, url, members, postsPerDay, anonymous, surveys, category, location, verifiedAt, notes, saved: input.saved === true, responses, ...fieldwork.value };
  return { ok: errors.length === 0, errors, value };
}

/** 30 membership + 30 activity + 20 anonymous permission + 20 survey permission. */
export function groupScore(group) {
  const members = group.members;
  const membership = members >= 100000 ? 30 : members >= 30000 ? 24 : members >= 10000 ? 18 : members >= 1000 ? 10 : members > 0 ? 4 : 0;
  const activity = Number.isFinite(group.postsPerDay) ? Math.min(30, Math.max(0, group.postsPerDay) * 3) : 0;
  return Math.round(membership + activity + (group.anonymous === 'yes' ? 20 : 0) + (group.surveys === 'yes' ? 20 : 0));
}

export function filterGroups(groups, options = {}) {
  const { query = '', minMembers = 0, minPosts = 0, anonymousOnly = false, surveysOnly = false, category = '', location = '', savedOnly = false, sort = 'fit' } = options;
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  const hasMinimum = (value, minimum) => !(Number(minimum) > 0) || (Number.isFinite(value) && value >= Number(minimum));
  const matches = (value, filter) => !filter || filter === 'all' || normalizeText(value) === normalizeText(filter);
  const filtered = groups.filter(group => {
    const haystack = normalizeText([group.name, group.category, group.location, group.notes].join(' '));
    return words.every(word => haystack.includes(word)) && hasMinimum(group.members, minMembers) && hasMinimum(group.postsPerDay, minPosts)
      && (!anonymousOnly || group.anonymous === 'yes') && (!surveysOnly || group.surveys === 'yes')
      && matches(group.category, category) && matches(group.location, location) && (!savedOnly || group.saved === true);
  });
  const dateValue = group => Number.isFinite(Date.parse(group.verifiedAt)) ? Date.parse(group.verifiedAt) : -Infinity;
  const comparators = {
    fit: (a, b) => groupScore(b) - groupScore(a),
    members: (a, b) => (b.members ?? -1) - (a.members ?? -1),
    activity: (a, b) => (b.postsPerDay ?? -1) - (a.postsPerDay ?? -1),
    recent: (a, b) => dateValue(b) - dateValue(a)
  };
  return filtered.sort((a, b) => (comparators[sort] || comparators.fit)(a, b) || a.name.localeCompare(b.name, 'vi'));
}

export function buildSearchLinks({ query = '', location = '' } = {}) {
  const phrase = [String(query).trim(), String(location).trim()].filter(Boolean).join(' ');
  return {
    facebook: `https://www.facebook.com/search/groups/?q=${encodeURIComponent(phrase)}`,
    google: `https://www.google.com/search?q=${encodeURIComponent(`site:facebook.com/groups/ ${phrase}`.trim())}`
  };
}

export function csvExport(groups) {
  const fields = ['id', 'name', 'url', 'members', 'postsPerDay', 'anonymous', 'surveys', 'category', 'location', 'verifiedAt', 'notes', 'saved', 'responses', ...FIELDWORK_FIELDS, '_demo'];
  const cell = value => {
    let text = value == null ? '' : String(value);
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [fields, ...groups.map(group => fields.map(key => group[key]))].map(row => row.map(cell).join(',')).join('\r\n');
}

/** Atomic import: callers must write only when ok is true. */
export function parseImport(text, validationOptions = {}) {
  if (typeof text !== 'string' || text.length > 5_000_000) return { ok: false, errors: ['Tệp JSON phải nhỏ hơn 5 MB.'], groups: [] };
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, errors: ['Tệp không phải JSON hợp lệ.'], groups: [] }; }
  const rows = Array.isArray(parsed) ? parsed : parsed?.groups;
  if (!Array.isArray(rows) || rows.length > MAX_GROUPS) return { ok: false, errors: [`JSON phải chứa danh sách tối đa ${MAX_GROUPS} nhóm.`], groups: [] };
  const groups = [], errors = [], ids = new Set(), urls = new Set(), sourceCodes = new Set();
  rows.forEach((row, index) => {
    const result = validateGroup(row, validationOptions);
    result.errors.forEach(error => errors.push(`Nhóm ${index + 1}: ${error}`));
    if (!result.ok) return;
    if (ids.has(result.value.id) || urls.has(result.value.url.toLowerCase())) errors.push(`Nhóm ${index + 1}: ID hoặc URL bị trùng.`);
    const sourceCode = result.value.sourceCode.toUpperCase();
    if (sourceCodes.has(sourceCode)) errors.push(`Nhóm ${index + 1}: mã nguồn phản hồi bị trùng.`);
    ids.add(result.value.id); urls.add(result.value.url.toLowerCase()); sourceCodes.add(sourceCode); groups.push(result.value);
  });
  return { ok: errors.length === 0, errors, groups: errors.length ? [] : groups };
}

// Entirely fictional examples: blank URLs, no live Facebook observations.
export const demoGroups = [
  { id: 'demo-1', name: '[Minh họa] Hành trình mua nhà Hà Nội', members: 85000, postsPerDay: 26, anonymous: 'yes', surveys: 'yes', category: 'Mua nhà', location: 'Hà Nội', notes: 'Dữ liệu giả lập. Cần sàng lọc người 18–65 tuổi có ý định mua nhà và xác nhận quyền đăng thực tế.' },
  { id: 'demo-2', name: '[Minh họa] Tìm tổ ấm tại TP.HCM', members: 120000, postsPerDay: 42, anonymous: 'yes', surveys: 'unknown', category: 'Mua nhà', location: 'TP.HCM', notes: 'Dữ liệu giả lập. Chưa xác minh nhóm có cho đăng khảo sát.' },
  { id: 'demo-3', name: '[Minh họa] Cộng đồng nhà ở xanh', members: 36000, postsPerDay: 12, anonymous: 'unknown', surveys: 'yes', category: 'Sống xanh', location: 'Hà Nội', notes: 'Dữ liệu giả lập. Quyền đăng ẩn danh và ý định mua nhà của thành viên chưa xác định.' },
  { id: 'demo-4', name: '[Minh họa] Sống xanh trong căn hộ', members: 68000, postsPerDay: 8, anonymous: 'no', surveys: 'yes', category: 'Sống xanh', location: 'TP.HCM', notes: 'Dữ liệu giả lập. Không có bằng chứng về một nhóm thật.' },
  { id: 'demo-5', name: '[Minh họa] Cư dân và tổ ấm tương lai', members: 24000, postsPerDay: 5, anonymous: 'yes', surveys: 'no', category: 'Cư dân', location: 'Hà Nội', notes: 'Dữ liệu giả lập. Minh họa trường hợp nội quy không cho khảo sát.' },
  { id: 'demo-6', name: '[Minh họa] Kết nối người mua căn hộ', members: null, postsPerDay: null, anonymous: 'unknown', surveys: 'unknown', category: 'Cư dân', location: 'TP.HCM', notes: 'Dữ liệu giả lập. Số thành viên, mức hoạt động và đối tượng phù hợp chưa rõ.' }
].map(group => ({ ...group, url: '', verifiedAt: '', saved: false, responses: 0, _demo: true }));
