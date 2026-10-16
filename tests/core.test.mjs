import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGroup, filterGroups, groupScore, buildSearchLinks, csvExport, parseImport, demoGroups } from '../dist/core.js';

const group = overrides => ({ id: 'group-1', name: 'Nhóm nghiên cứu', url: 'https://www.facebook.com/groups/research.vn/', members: 10000, postsPerDay: 5, anonymous: 'unknown', surveys: 'unknown', ...overrides });

test('group URL validation accepts canonical Facebook group links and rejects malicious targets', () => {
  assert.equal(validateGroup(group({ url: 'https://facebook.com/groups/12345/?ref=share' })).value.url, 'https://www.facebook.com/groups/12345/');
  for (const url of ['http://facebook.com/groups/test', 'https://facebook.com.evil.test/groups/test', 'javascript:alert(1)', 'https://facebook.com@evil.test/groups/test', 'https://evil@facebook.com/groups/test', 'https://facebook.com/groups/test/posts/42', 'https://facebook.com/groups/', 'https://facebook.com:8443/groups/test']) {
    assert.equal(validateGroup(group({ url })).ok, false, url);
  }
});

test('mobile group links normalize safely and shared links explain how to obtain a direct group address', () => {
  for (const host of ['m.facebook.com', 'mbasic.facebook.com']) {
    const result = validateGroup(group({ url: `https://${host}/groups/12345/?ref=share` }));
    assert.equal(result.ok, true, host);
    assert.equal(result.value.url, 'https://www.facebook.com/groups/12345/');
  }
  for (const url of [
    'https://m.facebook.com.evil.test/groups/12345/',
    'https://mbasic.facebook.com.evil.test/groups/12345/',
    'https://m.facebook.com@evil.test/groups/12345/',
    'https://user@m.facebook.com/groups/12345/',
    'http://m.facebook.com/groups/12345/',
    'https://mbasic.facebook.com:8443/groups/12345/',
    'https://www.facebook.com/share/g/opaque-token/'
  ]) assert.equal(validateGroup(group({ url })).ok, false, url);
  const shared = validateGroup(group({ url: 'https://www.facebook.com/share/g/opaque-token/' }));
  assert.ok(shared.errors.some(error => error.includes('/share/g/') && error.includes('/groups/')));
});

test('invalid observation counts identify their visible Vietnamese field labels', () => {
  for (const [key, label] of [['members', 'Số thành viên'], ['postsPerDay', 'Số bài đăng trung bình mỗi ngày'], ['responses', 'Số phản hồi hợp lệ']]) {
    const result = validateGroup(group({ [key]: -1 }));
    assert.equal(result.ok, false, key);
    assert.ok(result.errors.some(error => error.startsWith(`${label}:`)), key);
  }
});

test('blank observations remain unknown and numeric minima exclude unknown records', () => {
  const result = validateGroup(group({ members: '', postsPerDay: '' }));
  assert.equal(result.ok, true);
  assert.equal(result.value.members, null);
  assert.equal(result.value.postsPerDay, null);
  const rows = [result.value, group({ id: 'known', members: 100, postsPerDay: 2 })];
  assert.equal(filterGroups(rows, {}).length, 2);
  assert.deepEqual(filterGroups(rows, { minMembers: 1 }).map(row => row.id), ['known']);
  assert.deepEqual(filterGroups(rows, { minPosts: 0.1 }).map(row => row.id), ['known']);
});

test('permission filters require explicit yes, and Vietnamese query matches without accents', () => {
  const rows = [group({ id: 'yes', anonymous: 'yes', surveys: 'yes' }), group({ id: 'unknown' }), group({ id: 'no', anonymous: 'no', surveys: 'no' })];
  assert.deepEqual(filterGroups(rows, { anonymousOnly: true, surveysOnly: true }).map(row => row.id), ['yes']);
  assert.equal(filterGroups(rows, { query: 'nhom nghien cuu' }).length, 3);
  assert.equal(filterGroups(rows, { category: 'Sinh viên' }).length, 0);
  assert.equal(groupScore(group({ members: 100000, postsPerDay: 100, anonymous: 'yes', surveys: 'yes' })), 100);
  assert.equal(groupScore(group({ members: null, postsPerDay: null })), 0);
});

test('sorting is deterministic and does not mutate the original list', () => {
  const rows = [group({ id: 'small', members: 10 }), group({ id: 'large', members: 1000 })];
  assert.deepEqual(filterGroups(rows, { sort: 'members' }).map(row => row.id), ['large', 'small']);
  assert.equal(rows[0].id, 'small');
});

test('CSV escapes formulas, quotes, commas and line breaks and preserves unknown cells', () => {
  const csv = csvExport([group({ name: '=HYPERLINK("bad")', notes: ' \t@SUM(1,2)\nline', members: null })]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"\' \t@SUM(1,2)\nline"'));
  assert.ok(csv.includes('"","5"'));
});

test('JSON import is atomic for malformed rows, duplicate IDs, duplicate links and invalid responses', () => {
  assert.equal(parseImport(JSON.stringify({ groups: [group({ responses: 12 })] })).groups[0].responses, 12);
  for (const rows of [
    [group(), group({ url: 'https://facebook.com/groups/another/' })],
    [group(), group({ id: 'other' })],
    [group(), group({ id: 'other', responses: -1 })],
    [group({ responses: 1.5 })],
    [group({ responses: 'Infinity' })],
    [group({ members: true })]
  ]) {
    const result = parseImport(JSON.stringify(rows));
    assert.equal(result.ok, false);
    assert.deepEqual(result.groups, []);
    assert.ok(result.errors.length > 0);
  }
  assert.equal(parseImport('null').ok, false);
  assert.equal(parseImport('{broken').ok, false);
  assert.equal(parseImport(JSON.stringify(Array(1001).fill(group()))).ok, false);
});

test('dates must be real ISO dates and saved status is boolean', () => {
  assert.equal(validateGroup(group({ verifiedAt: '2026-02-30' })).ok, false);
  assert.equal(validateGroup(group({ verifiedAt: '2026-10-15T12:30:00Z' }), { today: '2026-10-16' }).value.verifiedAt, '2026-10-15');
  assert.equal(validateGroup(group({ saved: 'false' })).ok, false);
  assert.equal(validateGroup(group({ anonymous: 'yes', verifiedAt: '' })).ok, false);
  assert.equal(parseImport(JSON.stringify([group({ surveys: 'yes' })])).ok, false);
  assert.equal(parseImport(JSON.stringify([group({ anonymous: 'yes', surveys: 'yes', verifiedAt: '2026-10-15' })]), { today: '2026-10-16' }).ok, true);
  assert.equal(validateGroup(group({ verifiedAt: '2026-10-17' }), { today: '2026-10-16' }).ok, false);
  const futureImport = parseImport(JSON.stringify([group(), group({ id: 'future', url: 'https://facebook.com/groups/another/', verifiedAt: '2026-10-17' })]), { today: '2026-10-16' });
  assert.equal(futureImport.ok, false);
  assert.deepEqual(futureImport.groups, []);
});

test('search links encode user input and demo records cannot be mistaken for validated links', () => {
  const links = buildSearchLinks({ query: 'sinh viên & khảo sát', location: 'HN' });
  assert.equal(new URL(links.facebook).searchParams.get('q'), 'sinh viên & khảo sát HN');
  assert.ok(new URL(links.google).searchParams.get('q').startsWith('site:facebook.com/groups/'));
  assert.equal(demoGroups.length, 6);
  assert.ok(demoGroups.every(row => row._demo && row.url === '' && row.name.includes('[Minh họa]')));
});
