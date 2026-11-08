# Campus Event Portal

A small full-stack campus events application built with HTML, CSS, vanilla JavaScript, Node.js/Express, and MySQL. It demonstrates many-to-many event registrations, capacity limits with a FIFO waitlist, time-conflict-aware resource booking, QR check-in, attendance tracking, and downloadable PDF certificates.

## Requirements

- Node.js 20 or newer
- MySQL 8.0 or newer

## Run locally

1. Create a MySQL database and load the schema and sample records:

   ```powershell
   Get-Content .\database\schema.sql -Raw | mysql -u root -p
   Get-Content .\database\seed.sql -Raw | mysql -u root -p campus_events
   ```

   The sample events are scheduled relative to when the seed script runs. Rerun the seed command to refresh their dates in an existing database.

2. Copy `.env.example` to `.env` and set the MySQL connection details if they differ from the defaults.
   To let phones on the same network open QR check-in links, set `BASE_URL` to the computer's LAN address (for example, `http://192.168.1.20:3000`) and allow that port through the local firewall.

3. Install packages and start the app:

   ```sh
   npm install
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000). The seeded student accounts are available in the “Viewing as” selector.

## Features

- Browse and filter published campus events; create events and set participant limits.
- Register students transactionally. When capacity is reached, later students enter a FIFO waitlist. Cancelling an active registration promotes the next waitlisted student in the same transaction.
- Reserve rooms and quantities of shared equipment. Inventory rows are locked while availability is checked and bookings are replaced, so overlapping reservations cannot overbook a resource.
- Generate event-specific QR check-in codes. Scanning a code opens the check-in page; a student with an active registration can check in during the event.
- View attendance records and download a PDF participation certificate after check-in.

## Database model

`students` and `events` are connected by `registrations` (a many-to-many relationship). `events` and `resources` are connected by `resource_reservations`, which records the booked quantity and time interval. `attendance` and `certificates` each reference a registration, with one record per attendee.

## API overview

- `GET /api/events?studentId=1`, `POST /api/events`
- `POST /api/events/:id/register`, `DELETE /api/events/:id/register`
- `GET /api/resources`, `GET /api/events/:id/resources`, `PUT /api/events/:id/resources`
- `GET /api/events/:id/qr`, `POST /api/attendance/check-in`
- `GET /api/events/:id/attendance`, `GET /api/events/:id/certificate/:studentId`
- `GET /api/students`, `GET /api/health`

This student-project demo uses a student selector rather than production authentication. Add authentication and organizer authorization before deploying it for real campus use.

## Tests

```sh
npm test
```
