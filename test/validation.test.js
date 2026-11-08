const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError, requireBodyObject, requireDate, requirePositiveInteger, requireValue } = require('../src/validation');

test('requireDate accepts a real local date and formats it for MySQL', () => {
  assert.equal(requireDate('2026-10-24T18:08', 'Start time'), '2026-10-24 18:08:00');
});

test('requireDate rejects impossible dates and malformed input', () => {
  for (const value of ['2026-02-30T10:00', '2026-13-01T10:00', 'not-a-date', '']) {
    assert.throws(() => requireDate(value, 'Start time'), (error) =>
      error instanceof HttpError && error.status === 400);
  }
});

test('requirePositiveInteger accepts whole positive IDs and rejects invalid values', () => {
  assert.equal(requirePositiveInteger('12', 'Student'), 12);
  for (const value of [0, -1, 1.5, 'abc', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => requirePositiveInteger(value, 'Student'), (error) =>
      error instanceof HttpError && error.status === 400);
  }
});

test('requireValue trims non-empty strings and rejects missing values', () => {
  assert.equal(requireValue('  Campus event  ', 'Title'), 'Campus event');
  for (const value of ['', '   ', null, 12]) {
    assert.throws(() => requireValue(value, 'Title'), (error) =>
      error instanceof HttpError && error.status === 400);
  }
});

test('requireBodyObject rejects absent, primitive, and array request bodies', () => {
  assert.deepEqual(requireBodyObject({ studentId: 1 }), { studentId: 1 });
  for (const body of [undefined, null, 'invalid', [], 4]) {
    assert.throws(() => requireBodyObject(body), (error) =>
      error instanceof HttpError && error.status === 400);
  }
});
