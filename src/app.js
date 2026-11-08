require('dotenv').config();

const crypto = require('node:crypto');
const express = require('express');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const pool = require('./db');
const { HttpError, requireBodyObject, requireValue, requirePositiveInteger, requireDate } = require('./validation');

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/check-in', (_request, response) => {
  response.sendFile(path.join(__dirname, '..', 'public', 'check-in.html'));
});

function route(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

async function getEvent(eventId, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT e.id, e.title, e.category, e.description, e.location,
            e.starts_at, e.ends_at, e.capacity, e.qr_token,
            (SELECT COUNT(*) FROM registrations r
             WHERE r.event_id = e.id AND r.status = 'registered') AS registered_count,
            (SELECT COUNT(*) FROM registrations r
             WHERE r.event_id = e.id AND r.status = 'waitlisted') AS waitlist_count
     FROM events e
     WHERE e.id = ?`,
    [eventId]
  );
  return rows[0];
}

app.get('/api/health', route(async (_request, response) => {
  await pool.query('SELECT 1');
  response.json({ status: 'ok' });
}));

app.get('/api/students', route(async (_request, response) => {
  const [students] = await pool.execute(
    'SELECT id, student_number, name FROM students ORDER BY name'
  );
  response.json(students);
}));

app.get('/api/events', route(async (request, response) => {
  const studentId = request.query.studentId ? requirePositiveInteger(request.query.studentId, 'Student') : null;
  const [events] = await pool.execute(
    `SELECT e.id, e.title, e.category, e.description, e.location,
            e.starts_at, e.ends_at, e.capacity,
            (SELECT COUNT(*) FROM registrations r
             WHERE r.event_id = e.id AND r.status = 'registered') AS registered_count,
            (SELECT COUNT(*) FROM registrations r
             WHERE r.event_id = e.id AND r.status = 'waitlisted') AS waitlist_count,
            ${studentId ? `(SELECT r.status FROM registrations r
                             WHERE r.event_id = e.id AND r.student_id = ?
                             LIMIT 1)` : 'NULL'} AS my_status,
            ${studentId ? `(SELECT COUNT(*) FROM attendance a
                            JOIN registrations r ON r.id = a.registration_id
                            WHERE r.event_id = e.id AND r.student_id = ?)` : '0'} AS my_attended
     FROM events e
     ORDER BY e.starts_at ASC`,
    studentId ? [studentId, studentId] : []
  );
  response.json(events);
}));

app.post('/api/events', route(async (request, response) => {
  const body = requireBodyObject(request.body);
  const title = requireValue(body.title, 'Event title');
  const category = requireValue(body.category, 'Category');
  const description = requireValue(body.description, 'Description');
  const location = requireValue(body.location, 'Location');
  const startsAt = requireDate(body.startsAt, 'Start time');
  const endsAt = requireDate(body.endsAt, 'End time');
  const capacity = requirePositiveInteger(body.capacity, 'Capacity');

  if (new Date(endsAt.replace(' ', 'T')) <= new Date(startsAt.replace(' ', 'T'))) {
    throw new HttpError(400, 'End time must be after start time.');
  }

  const [result] = await pool.execute(
    `INSERT INTO events
       (title, category, description, location, starts_at, ends_at, capacity, qr_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, category, description, location, startsAt, endsAt, capacity, crypto.randomUUID()]
  );
  response.status(201).json(await getEvent(result.insertId));
}));

app.post('/api/events/:id/register', route(async (request, response) => {
  const eventId = requirePositiveInteger(request.params.id, 'Event');
  const studentId = requirePositiveInteger(requireBodyObject(request.body).studentId, 'Student');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [eventRows] = await connection.execute(
      'SELECT id, capacity, starts_at FROM events WHERE id = ? FOR UPDATE',
      [eventId]
    );
    if (!eventRows.length) throw new HttpError(404, 'Event not found.');
    if (new Date(eventRows[0].starts_at.replace(' ', 'T')) <= new Date()) {
      throw new HttpError(409, 'Registration is closed because this event has started.');
    }

    const [studentRows] = await connection.execute(
      'SELECT id FROM students WHERE id = ?',
      [studentId]
    );
    if (!studentRows.length) throw new HttpError(404, 'Student not found.');

    const [existing] = await connection.execute(
      'SELECT status FROM registrations WHERE event_id = ? AND student_id = ?',
      [eventId, studentId]
    );
    if (existing.length) {
      throw new HttpError(409, `You are already ${existing[0].status} for this event.`);
    }

    const [counts] = await connection.execute(
      `SELECT COUNT(*) AS total FROM registrations
       WHERE event_id = ? AND status = 'registered'`,
      [eventId]
    );
    const status = Number(counts[0].total) < eventRows[0].capacity ? 'registered' : 'waitlisted';
    await connection.execute(
      'INSERT INTO registrations (student_id, event_id, status) VALUES (?, ?, ?)',
      [studentId, eventId, status]
    );
    await connection.commit();
    response.status(201).json({ status, message: status === 'registered' ? 'You’re on the attendee list.' : 'You’ve been added to the waitlist.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.delete('/api/events/:id/register', route(async (request, response) => {
  const eventId = requirePositiveInteger(request.params.id, 'Event');
  const studentId = requirePositiveInteger(requireBodyObject(request.body).studentId, 'Student');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [eventRows] = await connection.execute('SELECT id FROM events WHERE id = ? FOR UPDATE', [eventId]);
    if (!eventRows.length) throw new HttpError(404, 'Event not found.');

    const [registrationRows] = await connection.execute(
      'SELECT id, status FROM registrations WHERE event_id = ? AND student_id = ? FOR UPDATE',
      [eventId, studentId]
    );
    if (!registrationRows.length) throw new HttpError(404, 'Registration not found.');

    await connection.execute('DELETE FROM registrations WHERE id = ?', [registrationRows[0].id]);
    let promotedStudentId = null;
    if (registrationRows[0].status === 'registered') {
      const [waitlisted] = await connection.execute(
        `SELECT id, student_id FROM registrations
         WHERE event_id = ? AND status = 'waitlisted'
         ORDER BY registered_at, id
         LIMIT 1 FOR UPDATE`,
        [eventId]
      );
      if (waitlisted.length) {
        await connection.execute(
          "UPDATE registrations SET status = 'registered' WHERE id = ?",
          [waitlisted[0].id]
        );
        promotedStudentId = waitlisted[0].student_id;
      }
    }
    await connection.commit();
    response.json({ message: 'Registration cancelled.', promotedStudentId });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get('/api/resources', route(async (_request, response) => {
  const [resources] = await pool.execute(
    `SELECT id, name, category, quantity, location
     FROM resources WHERE is_active = TRUE ORDER BY category, name`
  );
  response.json(resources);
}));

app.get('/api/events/:id/resources', route(async (request, response) => {
  const eventId = requirePositiveInteger(request.params.id, 'Event');
  const [rows] = await pool.execute(
    `SELECT rr.resource_id AS resourceId, rr.quantity, r.name, r.category
     FROM resource_reservations rr
     JOIN resources r ON r.id = rr.resource_id
     WHERE rr.event_id = ? AND rr.status = 'booked'
     ORDER BY r.category, r.name`,
    [eventId]
  );
  response.json(rows);
}));

app.put('/api/events/:id/resources', route(async (request, response) => {
  const eventId = requirePositiveInteger(request.params.id, 'Event');
  const requested = requireBodyObject(request.body).resources;
  if (!Array.isArray(requested) || requested.length > 20) {
    throw new HttpError(400, 'Provide a list of up to 20 resources.');
  }
  const normalized = requested.map((item) => ({
    id: requirePositiveInteger(item.id, 'Resource'),
    quantity: requirePositiveInteger(item.quantity ?? 1, 'Resource quantity')
  }));
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) {
    throw new HttpError(400, 'A resource can only be selected once.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [events] = await connection.execute(
      'SELECT id, starts_at, ends_at FROM events WHERE id = ? FOR UPDATE',
      [eventId]
    );
    if (!events.length) throw new HttpError(404, 'Event not found.');

    const [current] = await connection.execute(
      `SELECT resource_id AS id FROM resource_reservations
       WHERE event_id = ? AND status = 'booked'`,
      [eventId]
    );
    const idsToLock = [...new Set([...normalized.map((item) => item.id), ...current.map((item) => item.id)])].sort((a, b) => a - b);
    const resourceMap = new Map();
    for (const id of idsToLock) {
      const [resources] = await connection.execute(
        'SELECT id, name, category, quantity FROM resources WHERE id = ? AND is_active = TRUE FOR UPDATE',
        [id]
      );
      if (resources.length) resourceMap.set(id, resources[0]);
    }

    for (const item of normalized) {
      const resource = resourceMap.get(item.id);
      if (!resource) throw new HttpError(404, `Resource ${item.id} not found.`);
      if (resource.category === 'room' && item.quantity !== 1) {
        throw new HttpError(400, 'Room bookings must have a quantity of one.');
      }
      if (item.quantity > resource.quantity) {
        throw new HttpError(409, `${resource.name} does not have that many available.`);
      }
      const [overlaps] = await connection.execute(
        `SELECT COALESCE(SUM(quantity), 0) AS reserved
         FROM resource_reservations
         WHERE resource_id = ? AND status = 'booked' AND event_id <> ?
           AND starts_at < ? AND ends_at > ?`,
        [item.id, eventId, events[0].ends_at, events[0].starts_at]
      );
      if (Number(overlaps[0].reserved) + item.quantity > resource.quantity) {
        throw new HttpError(409, `${resource.name} is already booked for that time.`);
      }
    }

    await connection.execute(
      "DELETE FROM resource_reservations WHERE event_id = ? AND status = 'booked'",
      [eventId]
    );
    for (const item of normalized) {
      await connection.execute(
        `INSERT INTO resource_reservations
           (event_id, resource_id, quantity, starts_at, ends_at, status)
         VALUES (?, ?, ?, ?, ?, 'booked')`,
        [eventId, item.id, item.quantity, events[0].starts_at, events[0].ends_at]
      );
    }
    await connection.commit();
    response.json({ message: 'Resource bookings saved.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get('/api/events/:id/qr', route(async (request, response) => {
  const eventId = requirePositiveInteger(request.params.id, 'Event');
  const [events] = await pool.execute('SELECT qr_token FROM events WHERE id = ?', [eventId]);
  if (!events.length) throw new HttpError(404, 'Event not found.');

  const baseUrl = (process.env.BASE_URL || `${request.protocol}://${request.get('host')}`).replace(/\/$/, '');
  const checkInUrl = `${baseUrl}/check-in?token=${encodeURIComponent(events[0].qr_token)}`;
  response.json({ url: checkInUrl, dataUrl: await QRCode.toDataURL(checkInUrl, { width: 280, margin: 1 }) });
}));

app.post('/api/attendance/check-in', route(async (request, response) => {
  const body = requireBodyObject(request.body);
  const token = requireValue(body.token, 'QR token');
  const studentId = requirePositiveInteger(body.studentId, 'Student');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [events] = await connection.execute(
      'SELECT id, title, starts_at, ends_at FROM events WHERE qr_token = ? FOR UPDATE',
      [token]
    );
    if (!events.length) throw new HttpError(404, 'This event check-in QR code is not valid.');
    const event = events[0];
    const now = new Date();
    const startsAt = new Date(event.starts_at.replace(' ', 'T'));
    const endsAt = new Date(event.ends_at.replace(' ', 'T'));
    if (now < startsAt || now > endsAt) {
      throw new HttpError(409, 'Check-in is only available while the event is in progress.');
    }

    const [registrations] = await connection.execute(
      `SELECT id FROM registrations
       WHERE event_id = ? AND student_id = ? AND status = 'registered'
       FOR UPDATE`,
      [event.id, studentId]
    );
    if (!registrations.length) {
      throw new HttpError(403, 'An active registration is required to check in.');
    }
    const [existing] = await connection.execute(
      'SELECT id FROM attendance WHERE registration_id = ?',
      [registrations[0].id]
    );
    if (existing.length) {
      await connection.commit();
      response.json({ message: 'You are already checked in.', event: event.title });
      return;
    }
    await connection.execute(
      'INSERT INTO attendance (registration_id) VALUES (?)',
      [registrations[0].id]
    );
    await connection.commit();
    response.status(201).json({ message: 'Check-in recorded. Enjoy the event!', event: event.title });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get('/api/events/:id/attendance', route(async (request, response) => {
  const eventId = requirePositiveInteger(request.params.id, 'Event');
  const [rows] = await pool.execute(
    `SELECT s.student_number, s.name, a.checked_in_at
     FROM attendance a
     JOIN registrations r ON r.id = a.registration_id
     JOIN students s ON s.id = r.student_id
     WHERE r.event_id = ?
     ORDER BY a.checked_in_at DESC`,
    [eventId]
  );
  response.json(rows);
}));

app.get('/api/events/:id/certificate/:studentId', route(async (request, response) => {
  const eventId = requirePositiveInteger(request.params.id, 'Event');
  const studentId = requirePositiveInteger(request.params.studentId, 'Student');
  const [rows] = await pool.execute(
    `SELECT r.id AS registration_id, s.name, e.title, e.starts_at
     FROM registrations r
     JOIN students s ON s.id = r.student_id
     JOIN events e ON e.id = r.event_id
     JOIN attendance a ON a.registration_id = r.id
     WHERE e.id = ? AND s.id = ? AND r.status = 'registered'`,
    [eventId, studentId]
  );
  if (!rows.length) throw new HttpError(404, 'A participation certificate is available after attendance is recorded.');

  await pool.execute(
    'INSERT IGNORE INTO certificates (registration_id, certificate_code) VALUES (?, ?)',
    [rows[0].registration_id, crypto.randomUUID()]
  );
  const [certificates] = await pool.execute(
    'SELECT certificate_code, issued_at FROM certificates WHERE registration_id = ?',
    [rows[0].registration_id]
  );

  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="campus-certificate-${eventId}.pdf"`);
  const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 48 });
  document.pipe(response);
  document.rect(24, 24, 794, 547).lineWidth(3).strokeColor('#246b58').stroke();
  document.fontSize(14).fillColor('#246b58').text('CAMPUS  /  STUDENT LIFE', 0, 92, { align: 'center' });
  document.moveDown(1.4);
  document.fontSize(36).fillColor('#14251f').text('Certificate of Participation', { align: 'center' });
  document.moveDown(1.1);
  document.fontSize(17).fillColor('#51615b').text('This certificate is proudly presented to', { align: 'center' });
  document.moveDown(0.7);
  document.fontSize(31).fillColor('#246b58').text(rows[0].name, { align: 'center' });
  document.moveDown(0.8);
  document.fontSize(16).fillColor('#51615b').text('for attending', { align: 'center' });
  document.moveDown(0.5);
  document.fontSize(23).fillColor('#14251f').text(rows[0].title, { align: 'center' });
  document.moveDown(1);
  document.fontSize(12).fillColor('#51615b').text(
    `Issued ${new Date(certificates[0].issued_at).toLocaleDateString()}  ·  Certificate ${certificates[0].certificate_code}`,
    { align: 'center' }
  );
  document.end();
}));

app.use('/api', (_request, _response, next) => {
  next(new HttpError(404, 'API route not found.'));
});

app.use((error, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  if (error.code === 'ER_DUP_ENTRY') {
    response.status(409).json({ error: 'That record already exists.' });
    return;
  }
  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    response.status(404).json({ error: 'The selected record was not found.' });
    return;
  }
  if (error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body')) {
    response.status(400).json({ error: 'Request body must be valid JSON.' });
    return;
  }
  console.error(error);
  response.status(500).json({ error: 'The request could not be completed. Check the server logs.' });
});

module.exports = app;
