# 24-Hour Prayer Signup System

A simple mobile-friendly web application for a 24-hour prayer schedule. People can choose one available hour, enter their details, and receive a confirmation. Admins can view the full schedule and export it as CSV or PDF.

## Features

- Public signup page with 24 one-hour slots
- One participant can reserve multiple open hours in a single signup
- Times shown side by side in:
  - USA Eastern Time (`America/New_York`)
  - Zimbabwe Time (`Africa/Harare`)
- Real-time booking updates using Server-Sent Events
- Double-booking prevention with:
  - live UI updates
  - server validation
  - a unique database constraint on `slot_hour`
- Required validation for:
  - full name
  - country/location
  - phone number or email
- Thank-you confirmation page after booking
- Admin schedule page with full booking details
- Admin control to change the prayer date without restarting the app
- Admin action to send SMS reminders to booked participants who entered phone numbers
- CSV export
- PDF export
- SQLite database for simple deployment

## Tech Stack

- Node.js
- Express
- SQLite via `better-sqlite3`
- Netlify Functions and Netlify Blobs for Netlify deployment
- Vanilla HTML, CSS, and JavaScript
- PDFKit for PDF export
- Luxon for timezone-safe schedule rendering

## Project Structure

```text
.
|-- netlify/
|   `-- functions/
|       `-- api.js
|-- public/
|   |-- index.html
|   |-- confirmation.html
|   |-- admin.html
|   |-- styles.css
|   |-- app.js
|   |-- confirmation.js
|   `-- admin.js
|-- src/
|   |-- db.js
|   |-- netlify-state.js
|   |-- reminders.js
|   `-- schedule.js
|-- netlify.toml
|-- server.js
|-- package.json
`-- README.md
```

## Database Schema

The app creates `data.sqlite` automatically with this table:

```sql
CREATE TABLE bookings (
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
```

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

```bash
npm start
```

The app will run at:

```text
http://localhost:3000
```

## Environment Variables

Optional configuration:

- `PORT`
  - Default: `3000`
- `EVENT_DATE`
  - Default: `2026-06-01`
  - Format: `YYYY-MM-DD`
  - This is the initial prayer event date anchored in USA Eastern Time.
  - After first startup, admins can update the date from the admin page.
- `ADMIN_TOKEN`
  - Default: empty
  - If set, the admin page and exports require `?token=YOUR_TOKEN`.
- `TWILIO_ACCOUNT_SID`
  - Required for live SMS sending
- `TWILIO_AUTH_TOKEN`
  - Required for live SMS sending
- `TWILIO_FROM_NUMBER`
  - Twilio phone number used to send reminders
  - Set this or `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_MESSAGING_SERVICE_SID`
  - Optional alternative to `TWILIO_FROM_NUMBER`
- `SMS_REMINDER_DRY_RUN`
  - Optional
  - Set to `true` to test reminder sending without actually texting anyone

## Netlify Deployment

This repository is now customized for Netlify using:

- `public/` as the publish directory
- `netlify/functions/api.js` for the backend API
- Netlify Blobs for persistent schedule storage when deployed on Netlify

The Netlify configuration is stored in [netlify.toml](./netlify.toml).

### Required Netlify environment variables

- `ADMIN_TOKEN`
- optional `EVENT_DATE` for the first default date only
- `TWILIO_ACCOUNT_SID` for live reminders
- `TWILIO_AUTH_TOKEN` for live reminders
- `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID` for live reminders

### Important note about storage

When deployed on Netlify, the app uses Netlify Blobs instead of SQLite because Netlify Functions do not run with a persistent local database file.

For local `node server.js` development, the app still uses SQLite.

Example:

```bash
$env:EVENT_DATE="2026-06-14"
$env:ADMIN_TOKEN="prayer-admin-secret"
$env:TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
$env:TWILIO_AUTH_TOKEN="your-auth-token"
$env:TWILIO_FROM_NUMBER="+15551234567"
npm start
```

## Pages

- Public signup page: `/`
- Confirmation page: `/confirmation?booking=PUBLIC_BOOKING_ID`
- Admin schedule page: `/admin`
- CSV export: `/admin/export.csv`
- PDF export: `/admin/export.pdf`

If `ADMIN_TOKEN` is set, open admin pages like this:

```text
http://localhost:3000/admin?token=prayer-admin-secret
```

## SMS Reminders

From the admin page, you can send text reminders to everyone who booked a prayer slot and entered a phone number. The app:

- sends one text per signup, even if that person booked multiple hours
- skips email-only contacts automatically
- logs sent, skipped, and failed reminder attempts in SQLite

For live SMS delivery, configure Twilio credentials and a sender number. Twilio’s Message API documentation shows the standard `messages.create({ body, to, from })` flow and notes that phone numbers should use E.164 format.

- Messages resource: https://www.twilio.com/docs/sms/api/message
- Node SMS tutorial: https://www.twilio.com/docs/messaging/tutorials/how-to-send-sms-messages/node?save_locale=en-us

## How Double Booking Is Prevented

1. The public page disables slots that are already booked.
2. The page listens for live updates so new bookings appear immediately.
3. The server re-checks every selected slot when the form is submitted.
4. The SQLite table enforces a unique constraint on `slot_hour`, which blocks race conditions even if two people submit at nearly the same time.

## Deployment Notes

This app is easy to deploy on services like Render, Railway, Fly.io, or a VPS.

### Important for SQLite

SQLite is file-based, so production hosting must keep `data.sqlite` on persistent disk. If your host uses an ephemeral filesystem, bookings will be lost after restart or redeploy.

### Deploy on Render

1. Push this project to GitHub.
2. Create a new Web Service in Render.
3. Set:
   - Build command: `npm install`
   - Start command: `npm start`
4. Add environment variables:
   - `EVENT_DATE`
   - `ADMIN_TOKEN`
   - optionally `PORT` if your host requires it
5. Attach a persistent disk and mount it to the app directory so `data.sqlite` survives deploys.

### Deploy on Railway

1. Create a new project from the repo.
2. Set `npm install` and `npm start` if Railway does not detect them automatically.
3. Add `EVENT_DATE` and `ADMIN_TOKEN`.
4. Use a persistent volume for the SQLite file.

### Deploy on a VPS

1. Install Node.js 18+.
2. Copy the project to the server.
3. Run:

```bash
npm install
npm start
```

4. Put it behind Nginx or Caddy if you want HTTPS and a custom domain.
5. Run the Node process with a service manager such as `pm2` or `systemd`.

## Suggested Next Improvements

- Add a configurable event title and church name
- Add an admin action to clear or edit a booking
- Send email or SMS confirmations
- Add a printable public schedule view
