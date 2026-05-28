const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const configuredDatabasePath = process.env.DATABASE_PATH || "data.sqlite";
const resolvedDatabasePath = path.isAbsolute(configuredDatabasePath)
  ? configuredDatabasePath
  : path.join(__dirname, "..", configuredDatabasePath);

fs.mkdirSync(path.dirname(resolvedDatabasePath), { recursive: true });

const db = new Database(resolvedDatabasePath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    signup_id TEXT,
    slot_hour INTEGER NOT NULL UNIQUE CHECK(slot_hour >= 0 AND slot_hour <= 23),
    full_name TEXT NOT NULL,
    location TEXT NOT NULL,
    contact TEXT NOT NULL,
    topic TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reminder_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signup_id TEXT NOT NULL,
    contact TEXT NOT NULL,
    message_body TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_message_id TEXT DEFAULT '',
    error_message TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const tableInfo = db.prepare("PRAGMA table_info(bookings)").all();
const hasSignupIdColumn = tableInfo.some((column) => column.name === "signup_id");

if (!hasSignupIdColumn) {
  db.exec(`
    ALTER TABLE bookings ADD COLUMN signup_id TEXT;
    UPDATE bookings SET signup_id = public_id WHERE signup_id IS NULL;
  `);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_bookings_signup_id
  ON bookings(signup_id);
`);

const defaultEventDate = process.env.EVENT_DATE || "2026-06-01";

const seedEventDateSetting = db.prepare(`
  INSERT INTO app_settings (key, value)
  VALUES ('event_date', ?)
  ON CONFLICT(key) DO NOTHING
`);

seedEventDateSetting.run(defaultEventDate);

const insertBooking = db.prepare(`
  INSERT INTO bookings (public_id, signup_id, slot_hour, full_name, location, contact, topic)
  VALUES (@publicId, @signupId, @slotHour, @fullName, @location, @contact, @topic)
`);

const selectBookingsBySignupId = db.prepare(`
  SELECT *
  FROM bookings
  WHERE signup_id = ?
  ORDER BY slot_hour ASC
`);

const selectAllBookings = db.prepare(`
  SELECT *
  FROM bookings
  ORDER BY slot_hour ASC
`);

const selectTakenSlots = db.prepare(`
  SELECT slot_hour
  FROM bookings
`);

const selectReminderRecipients = db.prepare(`
  SELECT
    signup_id,
    full_name,
    location,
    contact,
    topic,
    GROUP_CONCAT(slot_hour, ',') AS slot_hours
  FROM bookings
  GROUP BY signup_id, full_name, location, contact, topic
  ORDER BY full_name ASC
`);

const selectSetting = db.prepare(`
  SELECT value
  FROM app_settings
  WHERE key = ?
`);

const upsertSetting = db.prepare(`
  INSERT INTO app_settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const insertReminderLog = db.prepare(`
  INSERT INTO reminder_logs (
    signup_id,
    contact,
    message_body,
    status,
    provider_message_id,
    error_message
  )
  VALUES (
    @signupId,
    @contact,
    @messageBody,
    @status,
    @providerMessageId,
    @errorMessage
  )
`);

const insertBookingGroup = db.transaction((booking) => {
  const signupId = crypto.randomUUID();

  for (const slotHour of booking.slotHours) {
    insertBooking.run({
      publicId: crypto.randomUUID(),
      signupId,
      slotHour,
      fullName: booking.fullName,
      location: booking.location,
      contact: booking.contact,
      topic: booking.topic,
    });
  }

  return {
    signupId,
    bookings: selectBookingsBySignupId.all(signupId),
  };
});

function createBookingGroup(booking) {
  return insertBookingGroup(booking);
}

function getBookingGroupById(id) {
  const bookings = selectBookingsBySignupId.all(id);
  if (bookings.length === 0) {
    return null;
  }

  return bookings;
}

function getFullSchedule() {
  return selectAllBookings.all();
}

function getTakenSlots() {
  return selectTakenSlots.all().map((row) => row.slot_hour);
}

function getReminderRecipients() {
  return selectReminderRecipients.all().map((row) => ({
    signup_id: row.signup_id,
    full_name: row.full_name,
    location: row.location,
    contact: row.contact,
    topic: row.topic,
    slot_hours: row.slot_hours
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value))
      .sort((a, b) => a - b),
  }));
}

function getEventDateSetting() {
  return selectSetting.get("event_date")?.value || defaultEventDate;
}

function setEventDateSetting(eventDate) {
  upsertSetting.run("event_date", eventDate);
  return getEventDateSetting();
}

function createReminderLog(entry) {
  insertReminderLog.run(entry);
}

module.exports = {
  createBookingGroup,
  createReminderLog,
  getBookingGroupById,
  getEventDateSetting,
  getFullSchedule,
  getReminderRecipients,
  getTakenSlots,
  setEventDateSetting,
};
