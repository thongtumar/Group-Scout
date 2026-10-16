import test from 'node:test';
import assert from 'node:assert/strict';
import { AGE_BANDS, DEFAULT_SAMPLING, normalizeSampling, validateSampling, samplingSummary } from '../dist/sampling.js';

test('old files migrate to editable operating targets with no invented observations', () => {
  for (const old of [undefined, null, {}, [], 'old']) {
    const value = normalizeSampling(old);
    assert.deepEqual(value, DEFAULT_SAMPLING);
    assert.notEqual(value, DEFAULT_SAMPLING);
    assert.notEqual(value.ages, DEFAULT_SAMPLING.ages);
  }
  assert.deepEqual(AGE_BANDS.map(({ id }) => id), ['18-24', '25-34', '35-44', '45-54', '55-65']);
  const migrated = normalizeSampling({ hcmActual: 12, ages: { '35-44': 5 } });
  assert.equal(migrated.hcmActual, 12);
  assert.equal(migrated.ages['35-44'], 5);
  assert.equal(migrated.ages['18-24'], 0);
  assert.equal(DEFAULT_SAMPLING.hcmActual, 0);
});

test('zero observations produce zero progress, never city-target sample counts', () => {
  const result = validateSampling({}, 0);
  assert.equal(result.ok, true);
  const summary = samplingSummary(result.value, 0);
  assert.deepEqual(summary.cities.map(city => [city.actual, city.remaining, city.percent]), [[0, 250, 0], [0, 250, 0]]);
  assert.ok(summary.ageRows.every(row => row.actual === 0 && row.percent === 0));
  assert.equal(summary.cityUnknown, 0);
  assert.equal(summary.ageUnknown, 0);
  assert.deepEqual(summary.warnings, []);
  assert.equal(Object.hasOwn(summary, 'valid'), false);
});

test('partial classification preserves independent unknown totals and correct denominators', () => {
  const input = { hcmTarget: 300, hnTarget: 200, hcmActual: 30, hnActual: 20, ages: { '25-34': 25, '35-44': 15 } };
  assert.equal(validateSampling(input, 100).ok, true);
  const summary = samplingSummary(input, 100);
  assert.equal(summary.cityUnknown, 50);
  assert.equal(summary.ageUnknown, 60);
  assert.equal(summary.cities[0].percent, 10);
  assert.equal(summary.cities[1].percent, 10);
  assert.equal(summary.ageRows.find(row => row.id === '25-34').percent, 25);
  assert.equal(summary.cityOvercount, 0);
  assert.equal(summary.ageOvercount, 0);
  assert.equal(summary.warnings.length, 2);
});

test('the same respondents can be classified by city and age without double counting', () => {
  const input = { hcmActual: 60, hnActual: 40, ages: { '18-24': 10, '25-34': 50, '35-44': 40 } };
  assert.equal(validateSampling(input, 100).ok, true);
  const summary = samplingSummary(input, 100);
  assert.equal(summary.cityUnknown, 0);
  assert.equal(summary.ageUnknown, 0);
  assert.deepEqual(summary.warnings, []);
  assert.equal(summary.ageRows.reduce((sum, row) => sum + row.percent, 0), 100);
});

test('source deletion reveals an overcount without silently reducing saved counts', () => {
  const input = { hcmActual: 60, hnActual: 40, ages: { '25-34': 80, '35-44': 20 } };
  assert.equal(validateSampling(input, 100).ok, true);
  const before = structuredClone(input);
  const summary = samplingSummary(input, 70);
  assert.equal(summary.cityOvercount, 30);
  assert.equal(summary.ageOvercount, 30);
  assert.equal(summary.cityUnknown, 0);
  assert.equal(summary.ageUnknown, 0);
  assert.equal(summary.cities[0].actual, 60);
  assert.equal(summary.ageRows.find(row => row.id === '25-34').actual, 80);
  assert.ok(summary.warnings.some(message => message.includes('thành phố') && message.includes('vượt') && message.includes('30')));
  assert.ok(summary.warnings.some(message => message.includes('độ tuổi') && message.includes('vượt') && message.includes('30')));
  assert.equal(validateSampling(input, 70).ok, false);
  assert.deepEqual(input, before);
});

test('city and age overcounts are checked separately', () => {
  const city = samplingSummary({ hcmActual: 6, hnActual: 5, ages: { '25-34': 4 } }, 10);
  assert.equal(city.cityOvercount, 1);
  assert.equal(city.ageOvercount, 0);
  assert.equal(city.ageUnknown, 6);
  const age = samplingSummary({ hcmActual: 4, ages: { '25-34': 8, '35-44': 3 } }, 10);
  assert.equal(age.cityUnknown, 6);
  assert.equal(age.cityOvercount, 0);
  assert.equal(age.ageOvercount, 1);
  assert.equal(validateSampling({ hcmActual: 11 }, 10).ok, false);
  assert.equal(validateSampling({ ages: { '25-34': 11 } }, 10).ok, false);
});

test('city targets must total 500 and actual counts may exceed a city operating target', () => {
  for (const targets of [{ hcmTarget: 200, hnTarget: 200 }, { hcmTarget: 500, hnTarget: 1 }, { hcmTarget: -1, hnTarget: 501 }]) {
    assert.equal(validateSampling(targets, 500).ok, false);
  }
  const result = validateSampling({ hcmTarget: 100, hnTarget: 400, hcmActual: 120 }, 120);
  assert.equal(result.ok, true);
  const summary = samplingSummary(result.value, 120);
  assert.equal(summary.cities[0].remaining, 0);
  assert.equal(summary.cities[0].percent, 120);
});

test('form numeric strings are parsed, and invalid integer or excessive values are rejected', () => {
  const result = validateSampling({ hcmTarget: '300', hnTarget: '200', hcmActual: '12', hnActual: '', ages: { '25-34': '5' } }, 12);
  assert.equal(result.ok, true);
  assert.equal(result.value.hcmTarget, 300);
  assert.equal(result.value.hcmActual, 12);
  assert.equal(result.value.hnActual, 0);
  for (const invalid of [-1, 1.5, NaN, Infinity, true, [], {}, 'Infinity', 'not a count', 1_000_001, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validateSampling({ hcmActual: invalid }, 2_000_000).ok, false, String(invalid));
    assert.equal(validateSampling({ ages: { '25-34': invalid } }, 2_000_000).ok, false, String(invalid));
  }
  assert.equal(validateSampling({ hcmActual: 1_000_000 }, 1_000_000).ok, true);
  assert.equal(normalizeSampling({ hcmActual: 1_000_001 }).hcmActual, 1_000_001);
  assert.equal(normalizeSampling({ hcmActual: -1, hnActual: true }).hcmActual, 0);
});

test('deadlines accept real ISO dates in the past or future and reject calendar rollover', () => {
  for (const deadline of ['', '2020-01-01', '2024-02-29', '2030-12-31']) {
    const result = validateSampling({ deadline }, 0, { today: '2026-10-16' });
    assert.equal(result.ok, true, deadline);
    assert.equal(result.value.deadline, deadline);
  }
  for (const deadline of ['2026-02-29', '2026-02-30', '2026-13-01', '16/10/2026', '2026-1-01', '2026-10-16T12:00:00Z', true, 20261016]) {
    assert.equal(validateSampling({ deadline }, 0).ok, false, String(deadline));
  }
});

test('unclassified counts and zero targets do not create nonfinite percentages', () => {
  const summary = samplingSummary({ hcmTarget: 0, hnTarget: 500, hcmActual: 2, ages: { '18-24': 2 } }, 0);
  assert.equal(summary.cities[0].percent, 0);
  assert.equal(summary.cityOvercount, 2);
  assert.equal(summary.ageOvercount, 2);
  assert.ok(summary.cities.every(row => Number.isFinite(row.percent)));
  assert.ok(summary.ageRows.every(row => Number.isFinite(row.percent)));
  assert.ok(summary.warnings.some(message => message.includes('chỉ tiêu là 0')));
});

test('malformed objects and invalid total counts cannot pass validation', () => {
  for (const input of [null, undefined, 'data', []]) assert.equal(validateSampling(input, 0).ok, false);
  for (const total of [-1, NaN, Infinity, 1.2, '5', true]) assert.equal(validateSampling({}, total).ok, false);
  for (const ages of [[], true, 5, 'data']) assert.equal(validateSampling({ ages }, 0).ok, false);
  assert.equal(validateSampling({ ages: null }, 0).ok, true);
});
