const twilio = require("twilio");
const { buildSchedule } = require("./schedule");

const easternTimeZone = "America/New_York";
const zimbabweTimeZone = "Africa/Harare";

function createReminderClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";

  if (!accountSid || !authToken) {
    return null;
  }

  return twilio(accountSid, authToken);
}

function getReminderConfigStatus() {
  const isDryRun = String(process.env.SMS_REMINDER_DRY_RUN || "").toLowerCase() === "true";
  const hasCredentials = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  );
  const hasSender = Boolean(
    process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID
  );

  return {
    isDryRun,
    isConfigured: isDryRun || (hasCredentials && hasSender),
  };
}

function isEmailContact(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isZimbabweLocation(location) {
  return /zimbabwe|harare|bulawayo|zim/i.test(String(location || ""));
}

function normalizePhoneNumber(contact, location) {
  const rawValue = String(contact || "").trim();
  if (!rawValue || isEmailContact(rawValue)) {
    return null;
  }

  const compact = rawValue.replace(/[^\d+]/g, "");

  if (/^\+\d{8,15}$/.test(compact)) {
    return compact;
  }

  if (/^00\d{8,15}$/.test(compact)) {
    return `+${compact.slice(2)}`;
  }

  const digitsOnly = compact.replace(/\D/g, "");
  if (!digitsOnly) {
    return null;
  }

  if (digitsOnly.length === 12 && digitsOnly.startsWith("263")) {
    return `+${digitsOnly}`;
  }

  if (digitsOnly.length === 10 && digitsOnly.startsWith("07")) {
    return `+263${digitsOnly.slice(1)}`;
  }

  if (isZimbabweLocation(location) && digitsOnly.length === 9 && digitsOnly.startsWith("7")) {
    return `+263${digitsOnly}`;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return `+${digitsOnly}`;
  }

  if (!isZimbabweLocation(location) && digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }

  return null;
}

function getRecipientTimePreference(location) {
  if (isZimbabweLocation(location)) {
    return {
      slotKey: "zimbabwe",
      label: "Zimbabwe time",
    };
  }

  return {
    slotKey: "eastern",
    label: "USA Eastern Time",
  };
}

function formatRecipientSlots(recipient, eventDate) {
  const recipientBookings = recipient.slot_hours.map((slotHour) => ({
    slot_hour: slotHour,
  }));
  const slotPreference = getRecipientTimePreference(recipient.location);
  const slots = buildSchedule({
    eventDate,
    easternTimeZone,
    zimbabweTimeZone,
    bookings: recipientBookings,
  }).filter((slot) => recipient.slot_hours.includes(slot.hour));

  return {
    slotPreference,
    labels: slots.map((slot) => slot[slotPreference.slotKey].label),
  };
}

function buildReminderMessage({ recipient, eventDate, customMessage }) {
  const { slotPreference, labels } = formatRecipientSlots(recipient, eventDate);
  const hoursSummary = labels.join("; ");
  const leadIn = customMessage?.trim()
    ? customMessage.trim()
    : `Wisdom and Grace reminder for the 24-hour prayer schedule on ${eventDate}.`;

  return `${leadIn}\n${recipient.full_name}, your prayer time${labels.length === 1 ? "" : "s"} (${slotPreference.label}): ${hoursSummary}. Please be ready to lead in prayer.`;
}

async function sendReminderMessage({ to, body }) {
  if (getReminderConfigStatus().isDryRun) {
    return {
      sid: `dry-run-${Date.now()}`,
    };
  }

  const client = createReminderClient();
  if (!client) {
    throw new Error("Twilio credentials are not configured.");
  }

  const fromNumber = process.env.TWILIO_FROM_NUMBER || "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || "";

  if (!fromNumber && !messagingServiceSid) {
    throw new Error(
      "Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID before sending reminders."
    );
  }

  const messageOptions = {
    body,
    to,
  };

  if (messagingServiceSid) {
    messageOptions.messagingServiceSid = messagingServiceSid;
  } else {
    messageOptions.from = fromNumber;
  }

  return client.messages.create(messageOptions);
}

module.exports = {
  buildReminderMessage,
  getReminderConfigStatus,
  isEmailContact,
  normalizePhoneNumber,
  sendReminderMessage,
};
