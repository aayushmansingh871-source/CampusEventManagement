class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireValue(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${label} is required.`);
  }
  return value.trim();
}

function requireBodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'A JSON object is required.');
  }
  return body;
}

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new HttpError(400, `${label} must be a positive whole number.`);
  }
  return number;
}

function requireDate(value, label) {
  const match = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
    : null;
  if (!match) throw new HttpError(400, `${label} must be a valid date and time.`);

  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 ||
      date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) {
    throw new HttpError(400, `${label} must be a valid date and time.`);
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
}

module.exports = { HttpError, requireBodyObject, requireValue, requirePositiveInteger, requireDate };
