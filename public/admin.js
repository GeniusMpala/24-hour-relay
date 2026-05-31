const adminMessage = document.getElementById("admin-message");
const adminEventDate = document.getElementById("admin-event-date");
const adminTableBody = document.getElementById("admin-table-body");
const adminMobileList = document.getElementById("admin-mobile-list");
const exportCsv = document.getElementById("export-csv");
const exportPdf = document.getElementById("export-pdf");
const eventDateForm = document.getElementById("event-date-form");
const eventDateInput = document.getElementById("event-date-input");
const saveDateButton = document.getElementById("save-date-button");
const reminderForm = document.getElementById("reminder-form");
const reminderMessageInput = document.getElementById("reminder-message-input");
const sendRemindersButton = document.getElementById("send-reminders-button");

const adminParams = new URLSearchParams(window.location.search);
const adminToken = adminParams.get("token");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setAdminMessage(type, text) {
  adminMessage.className = `inline-message ${type}`;
  adminMessage.textContent = text;
}

function getResetButtonMarkup(slot) {
  if (!slot.isBooked) {
    return '<span class="admin-action-note">Open</span>';
  }

  return `
    <button class="secondary-button admin-reset-button" type="button" data-slot-hour="${slot.hour}">
      Reset hour
    </button>
  `;
}

function renderAdminSchedule(schedule) {
  adminEventDate.textContent = `Event date: ${schedule.eventDate}`;
  eventDateInput.value = schedule.eventDate;
  adminTableBody.innerHTML = "";
  adminMobileList.innerHTML = "";

  schedule.slots.forEach((slot) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${String(slot.hour).padStart(2, "0")}:00</td>
      <td>${escapeHtml(slot.eastern.label)}</td>
      <td>${escapeHtml(slot.zimbabwe.label)}</td>
      <td>
        <span class="status-pill ${slot.isBooked ? "status-booked" : "status-open"}">
          ${slot.isBooked ? "Booked" : "Available"}
        </span>
      </td>
      <td>${escapeHtml(slot.booking?.full_name || "-")}</td>
      <td>${escapeHtml(slot.booking?.location || "-")}</td>
      <td>${escapeHtml(slot.booking?.contact || "-")}</td>
      <td>${escapeHtml(slot.booking?.topic || "-")}</td>
      <td>${getResetButtonMarkup(slot)}</td>
    `;
    adminTableBody.appendChild(row);

    const card = document.createElement("article");
    card.className = "admin-mobile-card";
    card.innerHTML = `
      <p><strong>Hour:</strong> ${String(slot.hour).padStart(2, "0")}:00</p>
      <p><strong>USA Eastern:</strong> ${escapeHtml(slot.eastern.label)}</p>
      <p><strong>Zimbabwe:</strong> ${escapeHtml(slot.zimbabwe.label)}</p>
      <p><strong>Status:</strong> ${slot.isBooked ? "Booked" : "Available"}</p>
      <p><strong>Booked By:</strong> ${escapeHtml(slot.booking?.full_name || "-")}</p>
      <p><strong>Location:</strong> ${escapeHtml(slot.booking?.location || "-")}</p>
      <p><strong>Contact:</strong> ${escapeHtml(slot.booking?.contact || "-")}</p>
      <p><strong>Topic:</strong> ${escapeHtml(slot.booking?.topic || "-")}</p>
      <div class="admin-mobile-actions">${getResetButtonMarkup(slot)}</div>
    `;
    adminMobileList.appendChild(card);
  });

  setAdminMessage("success", "Schedule loaded. This page refreshes when new bookings come in.");
}

async function resetSlot(slotHour, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Resetting...";

  try {
    const response = await fetch(
      `/api/admin/slots/${slotHour}/reset${adminToken ? `?token=${encodeURIComponent(adminToken)}` : ""}`,
      {
        method: "POST",
      }
    );

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Unable to reset this prayer hour.");
    }

    setAdminMessage("success", "Prayer hour reset. That slot is available again.");
    await loadAdminSchedule();
  } catch (error) {
    setAdminMessage("error", error.message);
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function loadAdminSchedule() {
  try {
    const response = await fetch(`/api/admin/schedule${adminToken ? `?token=${encodeURIComponent(adminToken)}` : ""}`);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to load the admin schedule.");
    }

    renderAdminSchedule(result);
  } catch (error) {
    setAdminMessage("error", error.message);
  }
}

let adminRefreshTimer = null;

function startAdminPolling() {
  if (adminRefreshTimer) {
    clearInterval(adminRefreshTimer);
  }

  adminRefreshTimer = setInterval(() => {
    loadAdminSchedule().catch((error) => {
      console.error("Unable to refresh the admin schedule.", error);
    });
  }, 15000);
}

exportCsv.href = `/admin/export.csv${adminToken ? `?token=${encodeURIComponent(adminToken)}` : ""}`;
exportPdf.href = `/admin/export.pdf${adminToken ? `?token=${encodeURIComponent(adminToken)}` : ""}`;

eventDateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveDateButton.disabled = true;
  saveDateButton.textContent = "Saving...";

  try {
    const response = await fetch(
      `/api/admin/event-date${adminToken ? `?token=${encodeURIComponent(adminToken)}` : ""}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventDate: eventDateInput.value,
        }),
      }
    );

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Unable to update the prayer date.");
    }

    setAdminMessage("success", "Prayer date updated. The public schedule now reflects the new date.");
    await loadAdminSchedule();
  } catch (error) {
    setAdminMessage("error", error.message);
  } finally {
    saveDateButton.disabled = false;
    saveDateButton.textContent = "Save date";
  }
});

reminderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  sendRemindersButton.disabled = true;
  sendRemindersButton.textContent = "Sending...";

  try {
    const response = await fetch(
      `/api/admin/send-reminders${adminToken ? `?token=${encodeURIComponent(adminToken)}` : ""}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: reminderMessageInput.value,
        }),
      }
    );

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Unable to send text reminders.");
    }

    setAdminMessage(
      "success",
      `${result.message} Sent: ${result.sentCount}. Skipped: ${result.skippedCount}. Failed: ${result.failedCount}.`
    );
  } catch (error) {
    setAdminMessage("error", error.message);
  } finally {
    sendRemindersButton.disabled = false;
    sendRemindersButton.textContent = "Send text reminders";
  }
});

document.addEventListener("click", (event) => {
  const resetButton = event.target.closest("[data-slot-hour]");
  if (!resetButton) {
    return;
  }

  const slotHour = Number(resetButton.dataset.slotHour);
  if (!Number.isInteger(slotHour)) {
    return;
  }

  resetSlot(slotHour, resetButton).catch((error) => {
    console.error("Unable to reset the slot.", error);
  });
});

loadAdminSchedule();
startAdminPolling();
