CREATE DATABASE IF NOT EXISTS campus_events
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE campus_events;

CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_number VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(60) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(180) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  qr_token CHAR(36) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_event_capacity CHECK (capacity > 0),
  CONSTRAINT chk_event_times CHECK (ends_at > starts_at),
  INDEX idx_events_schedule (starts_at, ends_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS registrations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  status ENUM('registered', 'waitlisted') NOT NULL,
  registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_registration_student_event UNIQUE (student_id, event_id),
  CONSTRAINT fk_registration_student FOREIGN KEY (student_id)
    REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_registration_event FOREIGN KEY (event_id)
    REFERENCES events(id) ON DELETE CASCADE,
  INDEX idx_registration_waitlist (event_id, status, registered_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS resources (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  category ENUM('room', 'equipment') NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  location VARCHAR(180) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_resource_category_name UNIQUE (category, name),
  CONSTRAINT chk_resource_quantity CHECK (quantity > 0),
  INDEX idx_resources_category (category, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS resource_reservations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  resource_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  status ENUM('booked', 'cancelled') NOT NULL DEFAULT 'booked',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_event_resource UNIQUE (event_id, resource_id),
  CONSTRAINT chk_reservation_quantity CHECK (quantity > 0),
  CONSTRAINT chk_reservation_times CHECK (ends_at > starts_at),
  CONSTRAINT fk_reservation_event FOREIGN KEY (event_id)
    REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_reservation_resource FOREIGN KEY (resource_id)
    REFERENCES resources(id),
  INDEX idx_resource_reservation_conflict (resource_id, status, starts_at, ends_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  registration_id INT UNSIGNED NOT NULL UNIQUE,
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attendance_registration FOREIGN KEY (registration_id)
    REFERENCES registrations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS certificates (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  registration_id INT UNSIGNED NOT NULL UNIQUE,
  certificate_code CHAR(36) NOT NULL UNIQUE,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificate_registration FOREIGN KEY (registration_id)
    REFERENCES registrations(id) ON DELETE CASCADE
) ENGINE=InnoDB;
