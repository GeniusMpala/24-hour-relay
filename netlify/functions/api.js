const express = require("express");
const serverless = require("serverless-http");
const PDFDocument = require("pdfkit");
const {
  createBookingGroup,
  createPrayerRequest,
  createReminderLog,
  deletePrayerRequest,
  getBookingGroupById,
  getEventDateSetting,
  getFullScheduleBookings,
  getPrayerRequests,
  getReminderRecipients,
  resetAllBookings,
  resetSlotBooking,
  setEventDateSetting,
} = require("../../src/netlify-state");
const {
  buildReminderMessage,
  getReminderConfigStatus,
  normalizePhoneNumber,
  sendReminderMessage,
} = require("../../src/reminders");
const { renderPrayerSchedulePdf } = require("../../src/pdf-schedule");
const { buildSchedule } = require("../../src/schedule");

const app = express();
const adminToken = process.env.ADMIN_TOKEN || "";
const easternTimeZone = "America/New_York";
const zimbabweTimeZone = "Africa/Harare";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

function serializeSlot(slot, includeBookingDetails) {
  return {
    hour: slot.hour,
    eastern: slot.eastern,
    zimbabwe: slot.zimbabwe,
    isBooked: slot.isBooked,
    booking: includeBookingDetails ? slot.booking : null,
  };
}

async function schedulePayload(includeBookingDetails = false) {
  const eventDate = await getEventDateSetting();
  const bookings = await getFullScheduleBookings();
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

app.get("/api/schedule", async (req, res) => {
  res.json(await schedulePayload(false));
});

app.get("/api/bookings/:id", async (req, res) => {
  const bookings = await getBookingGroupById(req.params.id);

  if (!bookings) {
    return res.status(404).json({ error: "Booking not found." });
  }

  const eventDate = await getEventDateSetting();
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

app.post("/api/bookings", async (req, res) => {
  const { errors, slotHours } = validateBookingInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    const eventDate = await getEventDateSetting();
    const bookingGroup = await createBookingGroup({
      slotHours,
      fullName: req.body.fullName.trim(),
      location: req.body.location.trim(),
      contact: req.body.contact.trim(),
      topic: (req.body.topic || "").trim(),
    });

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
    if (error && error.code === "SLOT_CONFLICT") {
      return res.status(409).json({
        error: error.message,
      });
    }

    console.error(error);
    res.status(500).json({ error: "Unable to save the booking right now." });
  }
});

app.post("/api/prayer-requests", async (req, res) => {
  const { errors, personName, contact, requestText } = validatePrayerRequestInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    await createPrayerRequest({
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

app.get("/api/admin/schedule", requireAdmin, async (req, res) => {
  res.json(await schedulePayload(true));
});

app.get("/api/admin/prayer-requests", requireAdmin, async (req, res) => {
  res.json({
    prayerRequests: await getPrayerRequests(),
  });
});

app.post("/api/admin/prayer-requests/:id/delete", requireAdmin, async (req, res) => {
  const deletedRequest = await deletePrayerRequest(req.params.id);
  if (!deletedRequest) {
    return res.status(404).json({ error: "Prayer request not found." });
  }

  res.json({
    message: "Prayer request deleted successfully.",
    prayerRequest: deletedRequest,
  });
});

app.post("/api/admin/event-date", requireAdmin, async (req, res) => {
  const { error, eventDate } = validateEventDateInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const savedEventDate = await setEventDateSetting(eventDate);
  res.json({
    message: "Prayer date updated successfully.",
    eventDate: savedEventDate,
  });
});

app.post("/api/admin/slots/:hour/reset", requireAdmin, async (req, res) => {
  const slotHour = parseSlotHourParam(req.params.hour);
  if (slotHour === null) {
    return res.status(400).json({ error: "Select a valid schedule hour to reset." });
  }

  const removedBooking = await resetSlotBooking(slotHour);
  if (!removedBooking) {
    return res.status(404).json({ error: "That hour is already available." });
  }

  res.json({
    message: "Prayer hour reset successfully.",
    slotHour,
    booking: removedBooking,
  });
});

app.post("/api/admin/reset-all", requireAdmin, async (req, res) => {
  const resetCount = await resetAllBookings();

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

  const eventDate = await getEventDateSetting();
  const recipients = await getReminderRecipients();

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
      await createReminderLog({
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
      await createReminderLog({
        signupId: recipient.signup_id,
        contact: normalizedPhone,
        messageBody,
        status: "sent",
        providerMessageId: result.sid || "",
        errorMessage: "",
      });
    } catch (sendError) {
      summary.failedCount += 1;
      await createReminderLog({
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

app.get("/admin/export.csv", requireAdmin, async (req, res) => {
  const { eventDate, slots } = await schedulePayload(true);
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

app.get("/admin/export.pdf", requireAdmin, async (req, res) => {
  const { eventDate, slots } = await schedulePayload(true);
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

app.get("/admin/prayer-requests/export.csv", requireAdmin, async (req, res) => {
  const prayerRequests = await getPrayerRequests();
  const eventDate = await getEventDateSetting();
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
    `attachment; filename="prayer-requests-${eventDate}.csv"`
  );
  res.send(buildCsv(rows));
});

exports.handler = serverless(app, {
  binary: ["application/pdf"],
});
