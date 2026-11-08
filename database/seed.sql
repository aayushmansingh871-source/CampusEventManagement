USE campus_events;

INSERT INTO students (student_number, name, email) VALUES
  ('STU1001', 'Aarav Sharma', 'aarav@example.edu'),
  ('STU1002', 'Maya Patel', 'maya@example.edu'),
  ('STU1003', 'Noah Williams', 'noah@example.edu'),
  ('STU1004', 'Isha Gupta', 'isha@example.edu'),
  ('STU1005', 'Leo Chen', 'leo@example.edu')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO resources (name, category, quantity, location) VALUES
  ('Innovation Hall', 'room', 1, 'Engineering Block · Ground floor'),
  ('Seminar Room 204', 'room', 1, 'Library Block · Level 2'),
  ('Auditorium A', 'room', 1, 'Student Centre'),
  ('Projector', 'equipment', 4, 'AV Store · Student Centre'),
  ('Wireless microphone', 'equipment', 8, 'AV Store · Student Centre'),
  ('Laptop', 'equipment', 6, 'IT Help Desk')
ON DUPLICATE KEY UPDATE location = VALUES(location);

INSERT INTO events
  (title, category, description, location, starts_at, ends_at, capacity, qr_token)
VALUES
  ('Campus Innovation Summit', 'Technology',
   'A day of student demos, guest talks, and ideas shaping what comes next.',
   'Innovation Hall', DATE_ADD(NOW(), INTERVAL 2 DAY),
   DATE_ADD(NOW(), INTERVAL 2 DAY) + INTERVAL 3 HOUR, 80,
   'eaa38522-8543-49ca-a42f-c6319e118827'),
  ('Design for Good Workshop', 'Workshop',
   'A hands-on introduction to human-centred design for community projects.',
   'Seminar Room 204', DATE_ADD(NOW(), INTERVAL 4 DAY),
   DATE_ADD(NOW(), INTERVAL 4 DAY) + INTERVAL 2 HOUR, 32,
   'f34a5f0b-0f6c-45e7-a1b5-7e4e4ca4a804'),
  ('Open Mic on the Quad', 'Arts & culture',
   'An evening of live music, poetry, and performances from our campus community.',
   'Student Centre', DATE_ADD(NOW(), INTERVAL 6 DAY),
   DATE_ADD(NOW(), INTERVAL 6 DAY) + INTERVAL 3 HOUR, 120,
   'a76c7e12-cb3b-4c84-9418-499e8d669993'),
  ('Sustainable Campus Forum', 'Community',
   'Join students and faculty for practical conversations about a greener campus.',
   'Auditorium A', DATE_ADD(NOW(), INTERVAL 8 DAY),
   DATE_ADD(NOW(), INTERVAL 8 DAY) + INTERVAL 2 HOUR, 100,
   '56280955-5bd7-47e8-af7b-7f4d60dcc117'),
  ('Build Night: Campus Apps', 'Technology',
   'Team up with other students to prototype useful apps for campus life. Beginners are welcome.',
   'Innovation Hall', DATE_ADD(NOW(), INTERVAL 10 DAY),
   DATE_ADD(NOW(), INTERVAL 10 DAY) + INTERVAL 3 HOUR, 60,
   '86d80bd5-cd64-40a9-a550-003687da9577'),
  ('Printmaking for Beginners', 'Arts & culture',
   'Learn the basics of printmaking and take home a small series of your own designs.',
   'Seminar Room 204', DATE_ADD(NOW(), INTERVAL 12 DAY),
   DATE_ADD(NOW(), INTERVAL 12 DAY) + INTERVAL 2 HOUR, 24,
   'aa4a08bd-6a53-45cf-b2f4-a0112a15bbb4'),
  ('Campus 5K & Wellness Walk', 'Sports',
   'Choose a relaxed walk or a 5K route, then meet classmates for refreshments at the finish.',
   'Student Centre', DATE_ADD(NOW(), INTERVAL 14 DAY),
   DATE_ADD(NOW(), INTERVAL 14 DAY) + INTERVAL 2 HOUR, 100,
   '75a2d4d7-edc7-41c5-8535-d0b072e86cf8'),
  ('Community Garden Volunteer Day', 'Community',
   'Help prepare the campus garden for the season. Tools and a short orientation are provided.',
   'Auditorium A', DATE_ADD(NOW(), INTERVAL 16 DAY),
   DATE_ADD(NOW(), INTERVAL 16 DAY) + INTERVAL 2 HOUR, 40,
   'aa3474d6-8a5d-4c48-bd43-09b1174d2aa4')
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  category = VALUES(category),
  description = VALUES(description),
  location = VALUES(location),
  starts_at = VALUES(starts_at),
  ends_at = VALUES(ends_at),
  capacity = VALUES(capacity);

INSERT IGNORE INTO registrations (student_id, event_id, status)
SELECT s.id, e.id, 'registered'
FROM students s
JOIN events e ON e.title = 'Campus Innovation Summit'
WHERE s.student_number IN ('STU1001', 'STU1002', 'STU1003');

INSERT IGNORE INTO registrations (student_id, event_id, status)
SELECT s.id, e.id, 'registered'
FROM students s
JOIN events e ON e.title = 'Sustainable Campus Forum'
WHERE s.student_number IN ('STU1001', 'STU1002');

INSERT IGNORE INTO attendance (registration_id)
SELECT r.id
FROM registrations r
JOIN events e ON e.id = r.event_id
JOIN students s ON s.id = r.student_id
WHERE e.title = 'Sustainable Campus Forum'
  AND s.student_number = 'STU1001';
