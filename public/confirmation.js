const confirmationContent = document.getElementById("confirmation-content");
const params = new URLSearchParams(window.location.search);
const bookingId = params.get("booking");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderError(message) {
  confirmationContent.innerHTML = `
    <div class="inline-message error">${escapeHtml(message)}</div>
    <p class="confirmation-copy">
      If you just completed the form, please return to the schedule and try again.
    </p>
  `;
}

async function loadConfirmation() {
  if (!bookingId) {
    renderError("A booking reference is missing.");
    return;
  }

  try {
    const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to load your booking confirmation.");
    }

    const slotList = result.slots
      .map(
        (slot) => `
          <li>
            USA Eastern Time: ${escapeHtml(slot.eastern.label)}<br />
            Zimbabwe Time: ${escapeHtml(slot.zimbabwe.label)}
          </li>
        `
      )
      .join("");

    confirmationContent.innerHTML = `
      <p class="confirmation-copy">
        Thank you, <strong>${escapeHtml(result.booking.full_name)}</strong>. Your prayer ${
          result.slots.length === 1 ? "hour has" : "hours have"
        } been reserved.
      </p>
      <div class="confirmation-summary">
        <strong>Selected ${result.slots.length === 1 ? "time" : "times"}</strong>
        <ul class="selected-slot-list">${slotList}</ul>
        Location: ${escapeHtml(result.booking.location)}<br />
        Contact: ${escapeHtml(result.booking.contact)}
        ${result.booking.topic ? `<br />Prayer topic: ${escapeHtml(result.booking.topic)}` : ""}
      </div>
      <p class="confirmation-copy">
        Please keep ${
          result.slots.length === 1 ? "this time" : "these times"
        } available and join ready to lead prayer during your selected ${
          result.slots.length === 1 ? "hour" : "hours"
        }.
      </p>
    `;
  } catch (error) {
    renderError(error.message);
  }
}

loadConfirmation();
