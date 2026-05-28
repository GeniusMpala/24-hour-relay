const { DateTime } = require("luxon");

function parseEventDate(eventDate, easternTimeZone) {
  const [year, month, day] = eventDate.split("-").map(Number);
  return { year, month, day, zone: easternTimeZone };
}

function formatRange(start, end, timeZone) {
  const localStart = start.setZone(timeZone);
  const localEnd = end.setZone(timeZone);
  const endFormat = localStart.hasSame(localEnd, "day") ? "h:mm a" : "MMM d, h:mm a";
  return `${localStart.toFormat("MMM d, h:mm a")} - ${localEnd.toFormat(endFormat)}`;
}

function buildSchedule({ eventDate, easternTimeZone, zimbabweTimeZone, bookings }) {
  const bookingMap = new Map(bookings.map((booking) => [booking.slot_hour, booking]));
  const baseDate = parseEventDate(eventDate, easternTimeZone);

  return Array.from({ length: 24 }, (_, hour) => {
    const start = DateTime.fromObject(
      { year: baseDate.year, month: baseDate.month, day: baseDate.day, hour },
      { zone: easternTimeZone }
    );
    const end = start.plus({ hours: 1 });
    const booking = bookingMap.get(hour) || null;

    return {
      hour,
      eastern: {
        label: formatRange(start, end, easternTimeZone),
      },
      zimbabwe: {
        label: formatRange(start, end, zimbabweTimeZone),
      },
      isBooked: Boolean(booking),
      booking,
    };
  });
}

module.exports = {
  buildSchedule,
};
