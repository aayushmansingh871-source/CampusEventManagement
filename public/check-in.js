async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Could not complete check-in.');
  return payload;
}

async function initializeCheckIn() {
  const select = document.querySelector('#checkin-student');
  const form = document.querySelector('#checkin-form');
  const message = document.querySelector('#checkin-message');
  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) {
    message.textContent = 'Scan the event’s check-in QR code to open this page.';
    message.className = 'notice error';
    message.hidden = false;
    form.hidden = true;
    return;
  }

  try {
    const students = await requestJson('/api/students');
    select.innerHTML = students.map((student) => `<option value="${student.id}">${student.name} · ${student.student_number}</option>`).join('');
  } catch (error) {
    message.textContent = error.message;
    message.className = 'notice error';
    message.hidden = false;
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await requestJson('/api/attendance/check-in', {
        method: 'POST',
        body: { token, studentId: Number(select.value) }
      });
      message.textContent = `${result.message} · ${result.event}`;
      message.className = 'notice success';
    } catch (error) {
      message.textContent = error.message;
      message.className = 'notice error';
    } finally {
      message.hidden = false;
      button.disabled = false;
    }
  });
}

initializeCheckIn();
