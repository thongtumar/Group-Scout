import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, makeSourceCode, validateFieldwork, buildTaskQueue, responseSummary, groupYield } from '../dist/fieldwork.js';
import { validateGroup, parseImport, csvExport, demoGroups } from '../dist/core.js';

const today = '2026-10-16';
const options = { today };
const group = overrides => ({ id: 'group-1', name: 'Người mua nhà', url: 'https://www.facebook.com/groups/homebuyers/', verifiedAt: today, responses: 0, ...overrides });
const queueGroup = overrides => ({ ...validateGroup(group(), options).value, ...overrides });

test('legacy groups migrate without losing valid responses or inventing collection events', () => {
  const result = validateGroup(group({ responses: 12 }), options);
  assert.equal(result.ok, true);
  assert.equal(result.value.responses, 12);
  assert.equal(result.value.received, null);
  assert.equal(result.value.rejected, 0);
  assert.equal(result.value.minutesSpent, 0);
  assert.equal(result.value.stage, 'new');
  for (const field of ['contactedAt', 'submittedAt', 'postedAt', 'lastReviewedAt', 'nextActionAt']) assert.equal(result.value[field], '');
  assert.equal(result.value.sourceCode, makeSourceCode('group-1'));
  assert.match(makeSourceCode('group-1'), /^GS-[A-F0-9]{8}$/);
  assert.notEqual(makeSourceCode('group-1'), makeSourceCode('group-2'));
  assert.equal(validateFieldwork({ id: 'group-1', sourceCode: '' }, options).value.sourceCode, makeSourceCode('group-1'));
  assert.deepEqual(Object.keys(STAGES), ['new', 'contacted', 'approved', 'pending', 'posted', 'paused', 'rejected']);
});

test('received, valid and rejected counts must reconcile before saving or importing', () => {
  const valid = validateGroup(group({ responses: 8, received: '12', rejected: '2', minutesSpent: '12.5' }), options);
  assert.equal(valid.ok, true);
  assert.equal(valid.value.received, 12);
  assert.equal(valid.value.rejected, 2);
  assert.equal(valid.value.minutesSpent, 12.5);
  for (const fields of [
    { responses: 8, received: 9, rejected: 2 },
    { responses: 8, received: null, rejected: 1 },
    { received: -1 }, { received: true }, { received: 'Infinity' }, { received: 1.2 },
    { rejected: -1 }, { rejected: 1.1 }, { rejected: false },
    { minutesSpent: -1 }, { minutesSpent: 'NaN' }, { minutesSpent: true }
  ]) assert.equal(validateGroup(group(fields), options).ok, false, JSON.stringify(fields));
  assert.equal(parseImport(JSON.stringify([group({ responses: 8, received: 7 })]), options).ok, false);
});

test('stage events require explicit real dates, with future dates reserved for next actions', () => {
  for (const [stage, field] of [['contacted', 'contactedAt'], ['pending', 'submittedAt'], ['posted', 'postedAt']]) {
    assert.equal(validateFieldwork({ stage }, options).ok, false, stage);
    assert.equal(validateFieldwork({ stage, [field]: today }, options).ok, true, stage);
  }
  const approved = validateGroup(group({ stage: 'approved', anonymous: 'unknown', surveys: 'unknown' }), options);
  assert.equal(approved.ok, true);
  assert.equal(approved.value.surveys, 'unknown');
  assert.equal(approved.value.anonymous, 'unknown');
  assert.equal(approved.value.postedAt, '');
  for (const field of ['contactedAt', 'submittedAt', 'postedAt', 'lastReviewedAt']) {
    assert.equal(validateFieldwork({ [field]: '2026-10-17' }, options).ok, false, field);
    assert.equal(validateFieldwork({ [field]: '2026-02-30' }, options).ok, false, field);
    assert.equal(validateFieldwork({ [field]: '2026-10-15T12:30:00Z' }, options).value[field], '2026-10-15');
  }
  assert.equal(validateFieldwork({ nextActionAt: '2026-11-01' }, options).ok, true);
  assert.equal(validateFieldwork({ nextActionAt: '2026-11-31' }, options).ok, false);
  assert.equal(validateFieldwork({ nextAction: 'x'.repeat(301) }, options).ok, false);
  assert.equal(validateFieldwork({ stopReason: 'x'.repeat(1001) }, options).ok, false);
  assert.equal(validateFieldwork({ stage: '__proto__' }, options).ok, false);
});

test('post links are group Facebook posts and survey links point to respondent forms', () => {
  for (const postUrl of [
    'https://facebook.com/groups/homebuyers/posts/123/',
    'https://m.facebook.com/groups/123/permalink/456?ref=share'
  ]) {
    const result = validateFieldwork({ postUrl }, options);
    assert.equal(result.ok, true, postUrl);
    assert.ok(result.value.postUrl.startsWith('https://www.facebook.com/groups/'));
    assert.equal(new URL(result.value.postUrl).search, '');
  }
  for (const postUrl of [
    'http://facebook.com/groups/g/posts/1',
    'https://facebook.com.evil.test/groups/g/posts/1',
    'https://user:pass@facebook.com/groups/g/posts/1',
    'https://facebook.com/groups/g/',
    'https://facebook.com/groups/g/posts/1/comment/2',
    'https://facebook.com:8443/groups/g/posts/1',
    'javascript:alert(1)'
  ]) assert.equal(validateFieldwork({ postUrl }, options).ok, false, postUrl);
  for (const surveyUrl of [
    'https://forms.gle/Ab12Cd34',
    'https://docs.google.com/forms/d/e/ABC/viewform?usp=pp_url&entry.12=GS-123',
    'https://docs.google.com/forms/u/0/d/ABC/viewform'
  ]) assert.equal(validateFieldwork({ surveyUrl }, options).ok, true, surveyUrl);
  for (const surveyUrl of [
    'http://forms.gle/Ab12Cd34',
    'https://forms.gle.evil.test/Ab12Cd34',
    'https://user@forms.gle/Ab12Cd34',
    'https://docs.google.com/forms/d/ABC/edit',
    'https://docs.google.com/forms/d/ABC/viewform/evil',
    'https://docs.google.com/document/d/ABC/viewform',
    'https://forms.gle/'
  ]) assert.equal(validateFieldwork({ surveyUrl }, options).ok, false, surveyUrl);
});

test('source codes normalize consistently and duplicate source imports fail atomically', () => {
  const normalized = validateGroup(group({ sourceCode: ' hn_01 ' }), options);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.sourceCode, 'HN_01');
  for (const sourceCode of ['A', 'A'.repeat(25), 'NHÓM_01', 'ABC DEF', '<script>']) assert.equal(validateFieldwork({ sourceCode }, options).ok, false, sourceCode);
  const rows = [group({ sourceCode: 'HN_01' }), group({ id: 'group-2', url: 'https://facebook.com/groups/second/', sourceCode: 'hn_01' })];
  const imported = parseImport(JSON.stringify(rows), options);
  assert.equal(imported.ok, false);
  assert.deepEqual(imported.groups, []);
  assert.ok(imported.errors.some(error => error.includes('mã nguồn')));
  const header = csvExport([normalized.value]).split('\r\n')[0];
  for (const field of ['stage', 'received', 'rejected', 'minutesSpent', 'postUrl', 'surveyUrl', 'sourceCode', 'lastReviewedAt', 'nextActionAt', 'stopReason']) assert.ok(header.includes(`"${field}"`), field);
});

test('task queue never solicits stopped groups or groups that disallow surveys', () => {
  const queue = buildTaskQueue([
    queueGroup({ id: 'paused', stage: 'paused', nextActionAt: '2026-10-01' }),
    queueGroup({ id: 'rejected', stage: 'rejected', nextActionAt: '2026-10-01' }),
    queueGroup({ id: 'blocked', surveys: 'no', stage: 'posted', postedAt: '2026-10-01', nextActionAt: '2026-10-01', nextAction: 'Gửi lại bài' }),
    queueGroup({ id: 'demo', _demo: true, verifiedAt: '' })
  ], options);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].groupId, 'blocked');
  assert.equal(queue[0].type, 'blocked');
  assert.ok(queue[0].title.includes('Tạm dừng'));
  assert.ok(!queue[0].title.includes('Gửi lại'));
});

test('queue is date-sorted, emits only one task per group and respects scheduled future work', () => {
  const queue = buildTaskQueue([
    queueGroup({ id: 'today', nextActionAt: today, nextAction: 'Đọc kết quả duyệt' }),
    queueGroup({ id: 'old', nextActionAt: '2026-10-10', verifiedAt: '' }),
    queueGroup({ id: 'yesterday', stage: 'pending', submittedAt: '2026-10-12' }),
    queueGroup({ id: 'future', nextActionAt: '2026-10-20', stage: 'approved' }),
    queueGroup({ id: 'stale', verifiedAt: '2026-09-01', nextActionAt: '2026-10-20' })
  ], options);
  assert.deepEqual(queue.map(task => task.groupId), ['stale', 'old', 'yesterday', 'today']);
  assert.equal(queue.find(task => task.groupId === 'old').type, 'scheduled');
  assert.equal(queue.find(task => task.groupId === 'today').title, 'Đọc kết quả duyệt');
  assert.equal(queue.find(task => task.groupId === 'stale').type, 'verify');
  assert.equal(new Set(queue.map(task => task.groupId)).size, queue.length);
  assert.equal(buildTaskQueue([queueGroup({ verifiedAt: '2026-09-16' })], options).length, 0);
  assert.equal(buildTaskQueue([queueGroup({ verifiedAt: '2026-09-15' })], options)[0].type, 'verify');
});

test('three-day checks restart after review and retain manual permission semantics', () => {
  const queue = buildTaskQueue([
    queueGroup({ id: 'contacted', stage: 'contacted', contactedAt: '2026-10-13' }),
    queueGroup({ id: 'pending', stage: 'pending', submittedAt: '2026-10-12', lastReviewedAt: '2026-10-15' }),
    queueGroup({ id: 'posted', stage: 'posted', postedAt: '2026-10-10', received: null }),
    queueGroup({ id: 'counted', stage: 'posted', postedAt: '2026-10-10', received: 0 }),
    queueGroup({ id: 'approved', stage: 'approved', surveys: 'unknown' })
  ], options);
  assert.deepEqual(queue.map(task => [task.groupId, task.type]), [['counted', 'review'], ['posted', 'review'], ['approved', 'prepare'], ['contacted', 'check']]);
  assert.equal(buildTaskQueue([queueGroup({ stage: 'posted', postedAt: '2026-10-01', lastReviewedAt: today, received: null })], options).length, 0);
});

test('posted sources keep review tasks after receipt totals are known', () => {
  const groups = [
    queueGroup({ id: 'pending-quality', stage: 'posted', postedAt: '2026-10-01', lastReviewedAt: '2026-10-13', received: 100, responses: 30, rejected: 10 }),
    queueGroup({ id: 'reviewed-all', stage: 'posted', postedAt: '2026-10-01', lastReviewedAt: '2026-10-13', received: 40, responses: 30, rejected: 10 }),
    queueGroup({ id: 'reviewed-recently', stage: 'posted', postedAt: '2026-10-01', lastReviewedAt: '2026-10-14', received: 100, responses: 30, rejected: 10 }),
    queueGroup({ id: 'future', stage: 'posted', postedAt: '2026-10-01', received: 100, responses: 30, rejected: 10, nextActionAt: '2026-10-20' }),
    queueGroup({ id: 'paused', stage: 'paused', postedAt: '2026-10-01', received: 100, responses: 30, rejected: 10 })
  ];
  const tasks = buildTaskQueue(groups, options);
  assert.deepEqual(tasks.map(task => task.groupId), ['pending-quality', 'reviewed-all']);
  assert.equal(tasks[0].type, 'review');
  assert.equal(tasks[0].title, 'Rà soát phản hồi chưa kiểm tra');
  assert.equal(tasks[1].title, 'Kiểm tra phản hồi mới từ bài đã đăng');
  assert.ok(tasks.every(task => task.dueAt === today));
});

test('quality summaries expose unknown denominators and exclude demonstrations', () => {
  const known = queueGroup({ responses: 8, received: 12, rejected: 2, minutesSpent: 40 });
  assert.deepEqual(groupYield(known), { valid: 8, received: 12, rejected: 2, pending: 2, rate: 8 / 12, minutesPerValid: 5 });
  const summary = responseSummary([known, ...demoGroups]);
  assert.deepEqual(summary, { valid: 8, receivedKnown: 12, rejected: 2, pending: 2, unknownSources: 0, baselineUnknown: false, rate: 8 / 12 });
  const unknown = responseSummary([known, queueGroup({ responses: 3, received: null })]);
  assert.equal(unknown.valid, 11);
  assert.equal(unknown.receivedKnown, 12);
  assert.equal(unknown.unknownSources, 1);
  assert.equal(unknown.rate, null);
  const legacy = responseSummary([known], 10);
  assert.equal(legacy.valid, 18);
  assert.equal(legacy.baselineUnknown, true);
  assert.equal(legacy.rate, null);
  assert.equal(responseSummary([]).rate, null);
  assert.equal(groupYield({ responses: 0, received: 0 }).minutesPerValid, null);
  assert.equal(groupYield({ responses: 10, received: 10, minutesSpent: 0 }).minutesPerValid, null);
  assert.equal(groupYield({ responses: 10, received: 10 }).minutesPerValid, null);
  assert.equal(responseSummary([queueGroup({ responses: 9, received: 8 })]).rate, null);
  assert.equal(groupYield({ _demo: true, responses: 1000, received: 1000 }).valid, 0);
});
