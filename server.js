const path = require("path");
const express = require("express");
const PDFDocument = require("pdfkit");
const {
  createBookingGroup,
  createPrayerRequest,
  createReminderLog,
  deletePrayerRequest,
  getBookingGroupById,
  getEventDateSetting,
  getFullSchedule,
  getPrayerRequests,
  getReminderRecipients,
  getTakenSlots,
  resetAllBookings,
  resetSlotBooking,
  setEventDateSetting,
} = require("./src/db");
const {
  buildReminderMessage,
  getReminderConfigStatus,
  normalizePhoneNumber,
  sendReminderMessage,
} = require("./src/reminders");
const { renderPrayerSchedulePdf } = require("./src/pdf-schedule");
const { buildSchedule } = require("./src/schedule");

const app = express();
const port = process.env.PORT || 3000;
const adminToken = process.env.ADMIN_TOKEN || "";
const easternTimeZone = "America/New_York";
const zimbabweTimeZone = "Africa/Harare";
const streamClients = new Set();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function matchesAdminToken(req) {
  if (!adminToken) {
    return true;
  }

  const tokenFromQuery = req.query.token;
  const tokenFromHeader = req.get("x-admin-token");
  return tokenFromQuery === adminToken || tokenFromHeader === adminToken;
}

function requireAdmin(req, res, next) {
  if (!matchesAdminToken(req)) {
    return res.status(401).json({
      error: "Unauthorized. Provide a valid admin token.",
    });
  }

  next();
}

function requireAdminPage(req, res, next) {
  if (!matchesAdminToken(req)) {
    return res.status(401).send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Admin Access Required</title>
          <style>
            body { font-family: Arial, sans-serif; background: #f6f2e8; color: #2b2a24; padding: 2rem; }
            main { max-width: 36rem; margin: 4rem auto; background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 16px 40px rgba(0,0,0,.08); }
            h1 { margin-top: 0; }
            code { background: #f0eadf; padding: .15rem .35rem; border-radius: 6px; }
          </style>
        </head>
        <body>
          <main>
            <h1>Admin Access Required</h1>
            <p>This page is protected. Add <code>?token=YOUR_ADMIN_TOKEN</code> to the URL.</p>
          </main>
        </body>
      </html>
    `);
  }

  next();
}

function validateBookingInput(input) {
  const errors = [];

  if (!input.fullName || !input.fullName.trim()) {
    errors.push("Full name is required.");
  }

  if (!input.location || !input.location.trim()) {
    errors.push("Country or location is required.");
  }

  if (!input.contact || !input.contact.trim()) {
    errors.push("Phone number or email is required.");
  } else {
    const value = input.contact.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^[+\d\s().-]{7,}$/;

    if (!emailPattern.test(value) && !phonePattern.test(value)) {
      errors.push("Enter a valid email address or phone number.");
    }
  }

  const rawSlotHours = Array.isArray(input.slotHours)
    ? input.slotHours
    : input.slotHour !== undefined
      ? [input.slotHour]
      : [];
  const slotHours = [...new Set(rawSlotHours.map((value) => Number(value)))];

  if (slotHours.length === 0) {
    errors.push("Select at least one valid time slot.");
  }

  if (slotHours.some((slotHour) => !Number.isInteger(slotHour) || slotHour < 0 || slotHour > 23)) {
    errors.push("Select valid time slots.");
  }

  return {
    errors,
    slotHours,
  };
}

function validatePrayerRequestInput(input) {
  const errors = [];
  const personName = String(input?.personName || "").trim();
  const contact = String(input?.contact || "").trim();
  const requestText = String(input?.requestText || "").trim();

  if (!personName) {
    errors.push("Person name is required.");
  }

  if (!requestText) {
    errors.push("Prayer request is required.");
  } else if (requestText.length > 600) {
    errors.push("Keep the prayer request under 600 characters.");
  }

  if (contact) {
    const phonePattern = /^[+\d\s().-]{7,}$/;
    if (!phonePattern.test(contact)) {
      errors.push("Enter a valid phone number or leave it blank.");
    }
  }

  return {
    errors,
    personName,
    contact,
    requestText,
  };
}

function serializeSlot(slot, includeBookingDetails) {
  return {
    hour: slot.hour,
    eastern: slot.eastern,
    zimbabwe: slot.zimbabwe,
    isBooked: slot.isBooked,
    booking: includeBookingDetails ? slot.booking : null,
  };
}

function getCurrentEventDate() {
  return getEventDateSetting();
}

function schedulePayload(includeBookingDetails = false) {
  const eventDate = getCurrentEventDate();
  const bookings = getFullSchedule();
  const slots = buildSchedule({
    eventDate,
    easternTimeZone,
    zimbabweTimeZone,
    bookings,
  });

  return {
    eventDate,
    easternTimeZone,
    zimbabweTimeZone,
    slots: slots.map((slot) => serializeSlot(slot, includeBookingDetails)),
  };
}

function broadcastScheduleUpdate() {
  const payload = `data: ${JSON.stringify(schedulePayload(false))}\n\n`;

  for (const client of streamClients) {
    client.write(payload);
  }
}

function validateEventDateInput(input) {
  const value = String(input?.eventDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return {
      error: "Enter a valid date in YYYY-MM-DD format.",
      eventDate: null,
    };
  }

  return {
    error: null,
    eventDate: value,
  };
}

function validateReminderInput(input) {
  const reminderMessage = String(input?.message || "").trim();
  if (reminderMessage.length > 600) {
    return {
      error: "Keep the custom reminder message under 600 characters.",
      reminderMessage: "",
    };
  }

  return {
    error: null,
    reminderMessage,
  };
}

function parseSlotHourParam(value) {
  const slotHour = Number(value);
  if (!Number.isInteger(slotHour) || slotHour < 0 || slotHour > 23) {
    return null;
  }

  return slotHour;
}

function buildCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
}

app.get("/api/schedule", (req, res) => {
  res.json(schedulePayload(false));
});

app.get("/api/bookings/:id", (req, res) => {
  const bookings = getBookingGroupById(req.params.id);

  if (!bookings) {
    return res.status(404).json({ error: "Booking not found." });
  }

  const eventDate = getCurrentEventDate();
  const slots = buildSchedule({
    eventDate,
    easternTimeZone,
    zimbabweTimeZone,
    bookings,
  }).filter((entry) => bookings.some((booking) => booking.slot_hour === entry.hour));

  res.json({
    booking: bookings[0],
    bookings,
    slots,
  });
});

app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  streamClients.add(res);
  res.write(`data: ${JSON.stringify(schedulePayload(false))}\n\n`);

  req.on("close", () => {
    streamClients.delete(res);
  });
});

app.post("/api/bookings", (req, res) => {
  const { errors, slotHours } = validateBookingInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const takenSlots = new Set(getTakenSlots());
  const unavailableSlots = slotHours.filter((slotHour) => takenSlots.has(slotHour));
  if (unavailableSlots.length > 0) {
    return res.status(409).json({
      error: "One or more selected hours have already been booked. Please choose different slots.",
    });
  }

  try {
    const eventDate = getCurrentEventDate();
    const bookingGroup = createBookingGroup({
      slotHours,
      fullName: req.body.fullName.trim(),
      location: req.body.location.trim(),
      contact: req.body.contact.trim(),
      topic: (req.body.topic || "").trim(),
    });

    broadcastScheduleUpdate();

    const selectedSlots = buildSchedule({
      eventDate,
      easternTimeZone,
      zimbabweTimeZone,
      bookings: bookingGroup.bookings,
    }).filter((entry) =>
      bookingGroup.bookings.some((booking) => booking.slot_hour === entry.hour)
    );

    res.status(201).json({
      message:
        selectedSlots.length === 1
          ? "Your prayer hour has been booked."
          : "Your prayer hours have been booked.",
      bookingId: bookingGroup.signupId,
      selectedSlots,
    });
  } catch (error) {
    if (error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "One or more selected hours have already been booked. Please choose different slots.",
      });
    }

    console.error(error);
    res.status(500).json({ error: "Unable to save the booking right now." });
  }
});

app.post("/api/prayer-requests", (req, res) => {
  const { errors, personName, contact, requestText } = validatePrayerRequestInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    createPrayerRequest({
      personName,
      contact,
      requestText,
    });

    res.status(201).json({
      message: "Your prayer request has been shared with the admin team.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to save the prayer request right now." });
  }
});

app.get("/admin", requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/api/admin/schedule", requireAdmin, (req, res) => {
  res.json(schedulePayload(true));
});

app.get("/api/admin/prayer-requests", requireAdmin, (req, res) => {
  res.json({
    prayerRequests: getPrayerRequests(),
  });
});

app.post("/api/admin/prayer-requests/:id/delete", requireAdmin, (req, res) => {
  const deletedRequest = deletePrayerRequest(req.params.id);
  if (!deletedRequest) {
    return res.status(404).json({ error: "Prayer request not found." });
  }

  res.json({
    message: "Prayer request deleted successfully.",
    prayerRequest: deletedRequest,
  });
});

app.post("/api/admin/event-date", requireAdmin, (req, res) => {
  const { error, eventDate } = validateEventDateInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const savedEventDate = setEventDateSetting(eventDate);
  broadcastScheduleUpdate();

  res.json({
    message: "Prayer date updated successfully.",
    eventDate: savedEventDate,
  });
});

app.post("/api/admin/slots/:hour/reset", requireAdmin, (req, res) => {
  const slotHour = parseSlotHourParam(req.params.hour);
  if (slotHour === null) {
    return res.status(400).json({ error: "Select a valid schedule hour to reset." });
  }

  const removedBooking = resetSlotBooking(slotHour);
  if (!removedBooking) {
    return res.status(404).json({ error: "That hour is already available." });
  }

  broadcastScheduleUpdate();

  res.json({
    message: "Prayer hour reset successfully.",
    slotHour,
    booking: removedBooking,
  });
});

app.post("/api/admin/reset-all", requireAdmin, (req, res) => {
  const resetCount = resetAllBookings();
  broadcastScheduleUpdate();

  res.json({
    message: "Full prayer schedule reset successfully.",
    resetCount,
  });
});

app.post("/api/admin/send-reminders", requireAdmin, async (req, res) => {
  const { error, reminderMessage } = validateReminderInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  if (!getReminderConfigStatus().isConfigured) {
    return res.status(400).json({
      error:
        "SMS reminders are not configured yet. Set Twilio credentials and a sender number first.",
    });
  }

  const eventDate = getCurrentEventDate();
  const recipients = getReminderRecipients();

  if (recipients.length === 0) {
    return res.json({
      message: "There are no booked participants to remind yet.",
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
    });
  }

  const summary = {
    sentCount: 0,
    skippedCount: 0,
    failedCount: 0,
  };

  for (const recipient of recipients) {
    const normalizedPhone = normalizePhoneNumber(recipient.contact, recipient.location);
    const messageBody = buildReminderMessage({
      recipient,
      eventDate,
      customMessage: reminderMessage,
    });

    if (!normalizedPhone) {
      summary.skippedCount += 1;
      createReminderLog({
        signupId: recipient.signup_id,
        contact: recipient.contact,
        messageBody,
        status: "skipped",
        providerMessageId: "",
        errorMessage: "Contact is not a valid SMS phone number.",
      });
      continue;
    }

    try {
      const result = await sendReminderMessage({
        to: normalizedPhone,
        body: messageBody,
      });

      summary.sentCount += 1;
      createReminderLog({
        signupId: recipient.signup_id,
        contact: normalizedPhone,
        messageBody,
        status: "sent",
        providerMessageId: result.sid || "",
        errorMessage: "",
      });
    } catch (sendError) {
      summary.failedCount += 1;
      createReminderLog({
        signupId: recipient.signup_id,
        contact: normalizedPhone,
        messageBody,
        status: "failed",
        providerMessageId: "",
        errorMessage: sendError.message || "Unknown SMS error.",
      });
    }
  }

  res.json({
    message: "Reminder run completed.",
    ...summary,
  });
});

app.get("/admin/export.csv", requireAdmin, (req, res) => {
  const { eventDate, slots } = schedulePayload(true);
  const rows = [
    [
      "Hour",
      "Eastern Time",
      "Zimbabwe Time",
      "Status",
      "Full Name",
      "Location",
      "Contact",
      "Prayer Topic",
    ],
    ...slots.map((slot) => [
      slot.hour,
      slot.eastern.label,
      slot.zimbabwe.label,
      slot.isBooked ? "Booked" : "Available",
      slot.booking?.full_name || "",
      slot.booking?.location || "",
      slot.booking?.contact || "",
      slot.booking?.topic || "",
    ]),
  ];

  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="prayer-schedule-${eventDate}.csv"`
  );
  res.send(csv);
});

app.get("/admin/export.pdf", requireAdmin, (req, res) => {
  const { eventDate, slots } = schedulePayload(true);
  const doc = new PDFDocument({
    margin: 40,
    size: "A4",
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="prayer-schedule-${eventDate}.pdf"`
  );

  doc.pipe(res);
  renderPrayerSchedulePdf(doc, { eventDate, slots });
  doc.end();
});

app.get("/admin/prayer-requests/export.csv", requireAdmin, (req, res) => {
  const prayerRequests = getPrayerRequests();
  const rows = [
    ["Submitted", "Person", "Phone", "Request"],
    ...prayerRequests.map((request) => [
      request.created_at || "",
      request.person_name || "",
      request.contact || "",
      request.request_text || "",
    ]),
  ];

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="prayer-requests-${getCurrentEventDate()}.csv"`
  );
  res.send(buildCsv(rows));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/confirmation", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "confirmation.html"));
});

app.listen(port, () => {
  console.log(`Prayer schedule app listening on http://localhost:${port}`);
  console.log(`Event date: ${getCurrentEventDate()}`);
  console.log(
    adminToken
      ? "Admin token protection is enabled."
      : "Admin token protection is disabled."
  );
});
