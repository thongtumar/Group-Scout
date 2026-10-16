/** Manual, aggregate classification of already validated responses.
 * These counts describe the same responses by independent dimensions; they
 * must never be added to collected-response progress. City targets are an
 * editable operational plan, not population weights or representative quotas.
 */
export const AGE_BANDS = Object.freeze([
  Object.freeze({ id: '18-24', label: '18–24' }),
  Object.freeze({ id: '25-34', label: '25–34' }),
  Object.freeze({ id: '35-44', label: '35–44' }),
  Object.freeze({ id: '45-54', label: '45–54' }),
  Object.freeze({ id: '55-65', label: '55–65' })
]);

export const DEFAULT_SAMPLING = Object.freeze({
  hcmTarget: 250,
  hnTarget: 250,
  hcmActual: 0,
  hnActual: 0,
  ages: Object.freeze(Object.fromEntries(AGE_BANDS.map(({ id }) => [id, 0]))),
  deadline: ''
});

const MAX_COUNT = 1_000_000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const readCount = (raw, fallback) => {
  if (raw == null) return { valid: true, value: fallback };
  const value = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
  return { valid: integer(value), value: integer(value) ? value : fallback };
};
const dayValue = raw => {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : '';
};

/** Migrate old local files without fabricating observations or reducing counts.
 * Validation remains separate: safe integer values above the form limit or
 * above current valid-response totals are retained for review.
 */
export function normalizeSampling(input) {
  const source = object(input) ? input : {};
  const ages = object(source.ages) ? source.ages : {};
  return {
    hcmTarget: readCount(source.hcmTarget, DEFAULT_SAMPLING.hcmTarget).value,
    hnTarget: readCount(source.hnTarget, DEFAULT_SAMPLING.hnTarget).value,
    hcmActual: readCount(source.hcmActual, 0).value,
    hnActual: readCount(source.hnActual, 0).value,
    ages: Object.fromEntries(AGE_BANDS.map(({ id }) => [id, readCount(ages[id], 0).value])),
    deadline: dayValue(source.deadline)
  };
}

/** Validate a form/import before saving. Missing classifications stay unknown.
 * The today option is accepted for API consistency; past deadlines are valid.
 */
export function validateSampling(input, totalValid, { today } = {}) {
  if (!object(input)) return { ok: false, errors: ['Dữ liệu phân bổ mẫu phải là một đối tượng.'], value: null };
  const errors = [];
  const value = normalizeSampling(input);
  const count = (raw, fallback, label) => {
    const parsed = readCount(raw, fallback);
    if (!parsed.valid || parsed.value > MAX_COUNT) errors.push(`${label}: cần số nguyên không âm, tối đa 1.000.000.`);
  };
  count(input.hcmTarget, DEFAULT_SAMPLING.hcmTarget, 'Chỉ tiêu TP.HCM');
  count(input.hnTarget, DEFAULT_SAMPLING.hnTarget, 'Chỉ tiêu Hà Nội');
  count(input.hcmActual, 0, 'Mẫu hợp lệ TP.HCM');
  count(input.hnActual, 0, 'Mẫu hợp lệ Hà Nội');
  if (input.ages != null && !object(input.ages)) errors.push('Phân bổ độ tuổi phải là một đối tượng.');
  const ages = object(input.ages) ? input.ages : {};
  for (const { id, label } of AGE_BANDS) count(ages[id], 0, `Độ tuổi ${label}`);
  if (value.hcmTarget + value.hnTarget !== 500) errors.push('Tổng chỉ tiêu TP.HCM và Hà Nội phải bằng 500 mẫu.');
  if (!integer(totalValid)) errors.push('Tổng mẫu hợp lệ phải là số nguyên không âm an toàn.');
  else {
    if (value.hcmActual + value.hnActual > totalValid) errors.push('Tổng mẫu theo thành phố vượt tổng mẫu hợp lệ. Hãy đối chiếu lại phân bổ.');
    if (Object.values(value.ages).reduce((sum, actual) => sum + actual, 0) > totalValid) errors.push('Tổng mẫu theo độ tuổi vượt tổng mẫu hợp lệ. Hãy đối chiếu lại phân bổ.');
  }
  if (input.deadline != null && input.deadline !== '' && !dayValue(input.deadline)) errors.push('Hạn hoàn thành phải là ngày ISO hợp lệ (YYYY-MM-DD).');
  return { ok: errors.length === 0, errors, value };
}

/** Summarize without rewriting historical counts when source totals decrease. */
export function samplingSummary(sampling, totalValid) {
  const value = normalizeSampling(sampling);
  const total = integer(totalValid) ? totalValid : 0;
  const cities = [
    { id: 'hcm', label: 'TP.HCM', actual: value.hcmActual, target: value.hcmTarget },
    { id: 'hn', label: 'Hà Nội', actual: value.hnActual, target: value.hnTarget }
  ].map(city => ({
    ...city,
    remaining: Math.max(0, city.target - city.actual),
    percent: city.target > 0 ? city.actual / city.target * 100 : 0
  }));
  const cityTotal = cities.reduce((sum, city) => sum + city.actual, 0);
  const ageRows = AGE_BANDS.map(({ id, label }) => ({ id, label, actual: value.ages[id], percent: total > 0 ? value.ages[id] / total * 100 : 0 }));
  const ageTotal = ageRows.reduce((sum, row) => sum + row.actual, 0);
  const cityUnknown = Math.max(0, total - cityTotal);
  const ageUnknown = Math.max(0, total - ageTotal);
  const cityOvercount = Math.max(0, cityTotal - total);
  const ageOvercount = Math.max(0, ageTotal - total);
  const warnings = [];
  const format = count => count.toLocaleString('vi-VN');
  if (!integer(totalValid)) warnings.push('Tổng mẫu hợp lệ chưa hợp lệ; cần kiểm tra lại trước khi đọc tỷ lệ.');
  if (cityOvercount) warnings.push(`Phân bổ thành phố vượt tổng mẫu hợp lệ ${format(cityOvercount)} mẫu. Số đã nhập được giữ nguyên; hãy đối chiếu sau khi sửa hoặc xóa nguồn phản hồi.`);
  if (ageOvercount) warnings.push(`Phân bổ độ tuổi vượt tổng mẫu hợp lệ ${format(ageOvercount)} mẫu. Số đã nhập được giữ nguyên; hãy đối chiếu sau khi sửa hoặc xóa nguồn phản hồi.`);
  if (cityUnknown) warnings.push(`Còn ${format(cityUnknown)} mẫu hợp lệ chưa phân loại theo thành phố.`);
  if (ageUnknown) warnings.push(`Còn ${format(ageUnknown)} mẫu hợp lệ chưa phân loại theo độ tuổi.`);
  for (const city of cities) {
    if (city.target === 0 && city.actual > 0) warnings.push(`${city.label} có ${format(city.actual)} mẫu hợp lệ trong khi chỉ tiêu là 0; tỷ lệ hoàn thành chưa xác định.`);
  }
  return { cities, cityUnknown, ageUnknown, cityOvercount, ageOvercount, ageRows, warnings };
}
