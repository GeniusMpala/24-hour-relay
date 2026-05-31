const crypto = require("crypto");

const stateKey = "state";
const defaultEventDate = process.env.EVENT_DATE || "2026-06-01";

async function getStateStore() {
  const { getStore } = await import("@netlify/blobs");
  const envGetter =
    typeof Netlify !== "undefined" && Netlify?.env?.get
      ? (key) => Netlify.env.get(key)
      : () => undefined;
  const readEnv = (key) => process.env[key] || envGetter(key);

  const siteID =
    readEnv("BLOBS_SITE_ID") ||
    readEnv("NETLIFY_BLOBS_SITE_ID") ||
    readEnv("SITE_ID") ||
    readEnv("NETLIFY_SITE_ID");
  const token =
    readEnv("BLOBS_TOKEN") ||
    readEnv("NETLIFY_BLOBS_TOKEN") ||
    readEnv("NETLIFY_AUTH_TOKEN") ||
    readEnv("NETLIFY_ACCESS_TOKEN");

  if (siteID && token) {
    return getStore({
      name: "prayer-schedule",
      siteID,
      token,
    });
  }

  return getStore("prayer-schedule");
}

function createInitialState() {
  return {
    eventDate: defaultEventDate,
    bookings: [],
    reminderLogs: [],
    updatedAt: new Date().toISOString(),
  };
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

async function readState() {
  const store = await getStateStore();
  const entry = await store.getWithMetadata(stateKey, {
    type: "json",
    consistency: "strong",
  });

  if (!entry) {
    return {
      state: createInitialState(),
      etag: null,
    };
  }

  return {
    state: entry.data || createInitialState(),
    etag: entry.etag,
  };
}

async function writeState(state) {
  state.updatedAt = new Date().toISOString();

  const store = await getStateStore();
  await store.setJSON(stateKey, state);
}

async function updateState(mutator, options = {}) {
  const { state } = await readState();
  const nextState = cloneValue(state);
  const result = await mutator(nextState);
  await writeState(nextState);

  return {
    state: nextState,
    result,
  };
}

async function getEventDateSetting() {
  const { state } = await readState();
  return state.eventDate || defaultEventDate;
}

async function setEventDateSetting(eventDate) {
  const update = await updateState((state) => {
    state.eventDate = eventDate;
    return { eventDate };
  });
  return update.state.eventDate;
}

async function resetSlotBooking(slotHour) {
  const update = await updateState((state) => {
    const bookingIndex = (state.bookings || []).findIndex((entry) => entry.slot_hour === slotHour);

    if (bookingIndex === -1) {
      return null;
    }

    const [removedBooking] = state.bookings.splice(bookingIndex, 1);
    return removedBooking;
  });

  return update.result;
}

async function getFullScheduleBookings() {
  const { state } = await readState();
  return state.bookings || [];
}

async function getTakenSlots() {
  const bookings = await getFullScheduleBookings();
  return bookings.map((booking) => booking.slot_hour);
}

async function createBookingGroup(booking) {
  const signupId = crypto.randomUUID();

  const update = await updateState((state) => {
    const existingSlots = new Set((state.bookings || []).map((entry) => entry.slot_hour));
    const conflicts = booking.slotHours.filter((slotHour) => existingSlots.has(slotHour));
    if (conflicts.length > 0) {
      const error = new Error("One or more selected hours have already been booked. Please choose different slots.");
      error.code = "SLOT_CONFLICT";
      throw error;
    }

    const createdAt = new Date().toISOString();
    const nextBookings = booking.slotHours.map((slotHour) => ({
      id: crypto.randomUUID(),
      public_id: crypto.randomUUID(),
      signup_id: signupId,
      slot_hour: slotHour,
      full_name: booking.fullName,
      location: booking.location,
      contact: booking.contact,
      topic: booking.topic,
      created_at: createdAt,
    }));

    state.bookings = [...(state.bookings || []), ...nextBookings].sort(
      (left, right) => left.slot_hour - right.slot_hour
    );

    return {
      signupId,
      bookings: nextBookings,
    };
  });

  return update.result;
}

async function getBookingGroupById(id) {
  const bookings = await getFullScheduleBookings();
  const matches = bookings
    .filter((booking) => booking.signup_id === id)
    .sort((left, right) => left.slot_hour - right.slot_hour);

  if (matches.length === 0) {
    return null;
  }

  return matches;
}

async function getReminderRecipients() {
  const bookings = await getFullScheduleBookings();
  const groups = new Map();

  for (const booking of bookings) {
    if (!groups.has(booking.signup_id)) {
      groups.set(booking.signup_id, {
        signup_id: booking.signup_id,
        full_name: booking.full_name,
        location: booking.location,
        contact: booking.contact,
        topic: booking.topic,
        slot_hours: [],
      });
    }

    groups.get(booking.signup_id).slot_hours.push(booking.slot_hour);
  }

  return [...groups.values()]
    .map((recipient) => ({
      ...recipient,
      slot_hours: recipient.slot_hours.sort((a, b) => a - b),
    }))
    .sort((left, right) => left.full_name.localeCompare(right.full_name));
}

async function createReminderLog(entry) {
  await updateState((state) => {
    state.reminderLogs = [...(state.reminderLogs || []), {
      id: crypto.randomUUID(),
      signup_id: entry.signupId,
      contact: entry.contact,
      message_body: entry.messageBody,
      status: entry.status,
      provider_message_id: entry.providerMessageId,
      error_message: entry.errorMessage,
      created_at: new Date().toISOString(),
    }];
    return null;
  });
}

module.exports = {
  createBookingGroup,
  createReminderLog,
  getBookingGroupById,
  getEventDateSetting,
  getFullScheduleBookings,
  getReminderRecipients,
  getTakenSlots,
  resetSlotBooking,
  setEventDateSetting,
};
