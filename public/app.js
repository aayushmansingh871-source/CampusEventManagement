const state = { events: [], resources: [], studentId: localStorage.getItem('campusStudentId'), filter: 'all' };
const eventGrid = document.querySelector('#event-grid');
const studentSelect = document.querySelector('#student-select');
const notice = document.querySelector('#notice');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || 'Something went wrong. Please try again.');
  return payload;
}

function showNotice(message, kind = 'success') {
  notice.textContent = message;
  notice.className = `notice ${kind}`;
  notice.hidden = false;
  window.setTimeout(() => { notice.hidden = true; }, 5000);
}

function formatDate(value, options = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat('en', options).format(new Date(value.replace(' ', 'T')));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' })
    .format(new Date(value.replace(' ', 'T')));
}

function eventCard(event) {
  const seats = Math.max(0, Number(event.capacity) - Number(event.registered_count));
  const date = new Date(event.starts_at.replace(' ', 'T'));
  const day = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(date);
  const month = new Intl.DateTimeFormat('en', { month: 'short' }).format(date).toUpperCase();
  const statusLabel = event.my_status === 'registered' ? 'You’re going' : event.my_status === 'waitlisted' ? 'On waitlist' : '';
  return `<article class="event-card">
    <div class="event-card-top">
      <span class="category-tag">${escapeHtml(event.category)}</span>
      <button class="more-button" data-details="${event.id}" aria-label="View ${escapeHtml(event.title)} details">···</button>
    </div>
    <div class="event-date"><strong>${day}</strong><span>${month}</span></div>
    <h3>${escapeHtml(event.title)}</h3>
    <p class="event-description">${escapeHtml(event.description)}</p>
    <div class="event-meta"><span>◷ ${formatTime(event.starts_at)}</span><span>⌖ ${escapeHtml(event.location)}</span></div>
    <div class="event-card-bottom">
      <span class="spots ${seats === 0 ? 'full' : ''}">${seats > 0 ? `${seats} spots left` : 'At capacity'}${Number(event.waitlist_count) ? ` · ${event.waitlist_count} waitlisted` : ''}</span>
      <button class="join-button ${event.my_status ? 'joined' : ''}" data-register="${event.id}" data-status="${event.my_status || ''}">
        ${event.my_status ? statusLabel : seats > 0 ? 'Count me in' : 'Join waitlist'} <span>${event.my_status ? '✓' : '↗'}</span>
      </button>
    </div>
    <button class="card-hit-area" data-details="${event.id}" aria-label="View event details for ${escapeHtml(event.title)}"></button>
  </article>`;
}

function renderEvents() {
  const upcoming = state.events.filter((event) => new Date(event.ends_at.replace(' ', 'T')) >= new Date());
  const filtered = state.filter === 'all' ? upcoming : upcoming.filter((event) => event.category === state.filter);
  const myEvents = state.events.filter((event) => event.my_status);
  document.querySelector('#stat-events').textContent = upcoming.length;
  document.querySelector('#stat-spots').textContent = upcoming.reduce(
    (total, event) => total + Math.max(0, Number(event.capacity) - Number(event.registered_count)), 0
  );
  document.querySelector('#stat-mine').textContent = myEvents.length;
  document.querySelector('#my-event-list').innerHTML = myEvents.length
    ? myEvents.map((event) => `<div class="my-event-row"><span class="mini-date">${formatDate(event.starts_at, { month: 'short', day: 'numeric' })}</span><span class="my-event-title">${escapeHtml(event.title)}</span>${Number(event.my_attended) ? `<a class="certificate-link my-certificate" href="/api/events/${event.id}/certificate/${state.studentId}">↓ Certificate</a>` : `<span class="status-pill ${event.my_status}">${event.my_status === 'registered' ? 'Going' : 'Waitlist'}</span>`}</div>`).join('')
    : '<span class="muted">Nothing on the calendar yet. Find an event you love.</span>';
  eventGrid.innerHTML = filtered.length ? filtered.map(eventCard).join('') : '<div class="empty-state">No upcoming events in this category yet. Check back soon.</div>';
  document.querySelectorAll('[data-register]').forEach((button) => button.addEventListener('click', () => handleRegistration(button)));
  document.querySelectorAll('[data-details]').forEach((button) => button.addEventListener('click', () => {
    openEventDetails(Number(button.dataset.details)).catch((error) => showNotice(error.message, 'error'));
  }));
}

async function loadEvents() {
  state.events = await api(`/api/events?studentId=${encodeURIComponent(state.studentId || '')}`);
  renderEvents();
}

async function handleRegistration(button) {
  if (!state.studentId) {
    showNotice('Choose a student account first.', 'error');
    return;
  }
  const eventId = button.dataset.register;
  try {
    if (button.dataset.status) {
      const result = await api(`/api/events/${eventId}/register`, { method: 'DELETE', body: { studentId: Number(state.studentId) } });
      await loadEvents();
      showNotice(result.promotedStudentId ? 'Registration cancelled. A student on the waitlist moved into the open spot.' : result.message);
      return;
    }
    const result = await api(`/api/events/${eventId}/register`, { method: 'POST', body: { studentId: Number(state.studentId) } });
    await loadEvents();
    showNotice(result.message);
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

async function openEventDetails(eventId) {
  const event = state.events.find((item) => Number(item.id) === eventId);
  if (!event) return;
  const dialog = document.querySelector('#detail-dialog');
  const content = document.querySelector('#detail-content');
  const resources = await api('/api/resources');
  const booked = await api(`/api/events/${eventId}/resources`);
  const bookedById = new Map(booked.map((item) => [Number(item.resourceId), item]));
  const available = resources;
  const rooms = available.filter((item) => item.category === 'room');
  const equipment = available.filter((item) => item.category === 'equipment');
  content.innerHTML = `<div class="dialog-heading"><div><div class="eyebrow section-eyebrow">${escapeHtml(event.category)}</div><h2>${escapeHtml(event.title)}</h2></div><button type="button" class="close-button" data-close-detail aria-label="Close">×</button></div>
    <p class="detail-description">${escapeHtml(event.description)}</p>
    <div class="detail-facts"><span>◷ ${formatDate(event.starts_at)} · ${formatTime(event.starts_at)}</span><span>⌖ ${escapeHtml(event.location)}</span><span>♧ ${event.registered_count} / ${event.capacity} registered</span></div>
    ${Number(event.my_attended) ? `<a class="certificate-link" href="/api/events/${event.id}/certificate/${state.studentId}">↓ Download certificate</a>` : ''}
    <div class="qr-area"><div><h3>Event check-in</h3><p>Display this QR code at the event entrance. Students can scan it to check in.</p><button class="secondary-button" id="show-qr" type="button">Show check-in QR</button></div><img id="event-qr" alt="QR code to check in to this event" hidden></div>
    <div class="booking-area"><h3>Room & equipment</h3>
      ${booked.length ? `<div class="booked-list">${booked.map((item) => `<span>${escapeHtml(item.name)}${item.quantity > 1 ? ` × ${item.quantity}` : ''}</span>`).join('')}</div>` : '<p>No resources reserved yet.</p>'}
      <form id="resource-form" data-event="${event.id}">
        <label>Room<select name="roomId"><option value="">No room selected</option>${rooms.map((item) => `<option value="${item.id}" ${bookedById.has(Number(item.id)) ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.location)}</option>`).join('')}</select></label>
        <div class="equipment-options">${equipment.map((item) => `<label class="equipment-choice"><input type="checkbox" value="${item.id}" ${bookedById.has(Number(item.id)) ? 'checked' : ''}><span>${escapeHtml(item.name)} <small>${item.quantity} available</small></span><input type="number" min="1" max="${item.quantity}" value="${bookedById.get(Number(item.id))?.quantity || 1}" aria-label="${escapeHtml(item.name)} quantity"></label>`).join('')}</div>
        <button class="secondary-button" type="submit">Save resource bookings</button>
      </form>
    </div>
    <div class="attendance-area"><h3>Attendance record</h3><div id="attendance-list">Loading attendance…</div></div>`;
  dialog.showModal();
  content.querySelector('[data-close-detail]').addEventListener('click', () => dialog.close());
  content.querySelector('#show-qr').addEventListener('click', async () => {
    try {
      const qr = await api(`/api/events/${event.id}/qr`);
      const image = content.querySelector('#event-qr');
      image.src = qr.dataUrl;
      image.hidden = false;
    } catch (error) { showNotice(error.message, 'error'); }
  });
  content.querySelector('#resource-form').addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    const form = submitEvent.currentTarget;
    const selected = [...form.querySelectorAll('.equipment-choice')].filter((row) => row.querySelector('input[type="checkbox"]').checked)
      .map((row) => ({ id: Number(row.querySelector('input[type="checkbox"]').value), quantity: Number(row.querySelector('input[type="number"]').value) }));
    const roomId = form.elements.roomId.value;
    if (roomId) selected.push({ id: Number(roomId), quantity: 1 });
    try {
      await api(`/api/events/${event.id}/resources`, { method: 'PUT', body: { resources: selected } });
      showNotice('Resource bookings saved.');
      await openEventDetails(event.id);
    } catch (error) { showNotice(error.message, 'error'); }
  });
  try {
    const attendance = await api(`/api/events/${event.id}/attendance`);
    const list = content.querySelector('#attendance-list');
    list.innerHTML = attendance.length
      ? attendance.map((student) => `<span class="attendance-row">${escapeHtml(student.name)} <small>${escapeHtml(formatTime(student.checked_in_at))}</small></span>`).join('')
      : '<span>No check-ins yet.</span>';
  } catch (error) { content.querySelector('#attendance-list').textContent = error.message; }
}

async function initialize() {
  try {
    const students = await api('/api/students');
    if (!students.length) throw new Error('No students found. Run the database seed script to add demo accounts.');
    studentSelect.innerHTML = students.map((student) => `<option value="${student.id}">${escapeHtml(student.name)} · ${escapeHtml(student.student_number)}</option>`).join('');
    if (!students.some((student) => String(student.id) === state.studentId)) state.studentId = String(students[0].id);
    studentSelect.value = state.studentId;
    localStorage.setItem('campusStudentId', state.studentId);
    studentSelect.addEventListener('change', async () => {
      state.studentId = studentSelect.value;
      localStorage.setItem('campusStudentId', state.studentId);
      try { await loadEvents(); } catch (error) { showNotice(error.message, 'error'); }
    });
    await Promise.all([loadEvents(), loadResources()]);
  } catch (error) {
    eventGrid.innerHTML = `<div class="empty-state error-state">${escapeHtml(error.message)}<br><small>Start MySQL, load database/schema.sql and database/seed.sql, then restart the server.</small></div>`;
  }
}

async function loadResources() {
  try {
    state.resources = await api('/api/resources');
    const rooms = state.resources.filter((resource) => resource.category === 'room').length;
    const equipment = state.resources.filter((resource) => resource.category === 'equipment').length;
    document.querySelector('#resource-list').innerHTML = `<span><b>${rooms}</b> reservable rooms</span><span><b>${equipment}</b> equipment types</span><small>Bookings are checked against event times.</small>`;
  } catch (error) { document.querySelector('#resource-list').textContent = error.message; }
}

document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('.filter-button.selected')?.classList.remove('selected');
  button.classList.add('selected');
  state.filter = button.dataset.filter;
  renderEvents();
}));
document.querySelector('#open-event-form').addEventListener('click', () => document.querySelector('#event-dialog').showModal());
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => document.querySelector('#event-dialog').close()));
document.querySelector('#event-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  try {
    const created = await api('/api/events', {
      method: 'POST',
      body: { ...values, capacity: Number(values.capacity) }
    });
    form.reset();
    document.querySelector('#event-dialog').close();
    await loadEvents();
    showNotice(`${created.title} is now on the campus calendar.`);
  } catch (error) { showNotice(error.message, 'error'); }
});

initialize();
