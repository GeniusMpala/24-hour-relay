const adminMessage = document.getElementById("admin-message");
const adminEventDate = document.getElementById("admin-event-date");
const adminTableBody = document.getElementById("admin-table-body");
const adminMobileList = document.getElementById("admin-mobile-list");
const prayerRequestCount = document.getElementById("prayer-request-count");
const prayerRequestEmpty = document.getElementById("prayer-request-empty");
const prayerRequestTableBody = document.getElementById("prayer-request-table-body");
const prayerRequestMobileList = document.getElementById("prayer-request-mobile-list");
const exportPrayerRequestsCsv = document.getElementById("export-prayer-requests-csv");
const exportCsv = document.getElementById("export-csv");
const exportPdf = document.getElementById("export-pdf");
const eventDateForm = document.getElementById("event-date-form");
const eventDateInput = document.getElementById("event-date-input");
const saveDateButton = document.getElementById("save-date-button");
const reminderForm = document.getElementById("reminder-form");
const reminderMessageInput = document.getElementById("reminder-message-input");
const sendRemindersButton = document.getElementById("send-reminders-button");
const resetAllButton = document.getElementById("reset-all-button");

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

function formatSubmittedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRequestText(value) {
  return escapeHtml(value || "-").replace(/\n/g, "<br />");
}

function getDeletePrayerRequestButtonMarkup(request) {
  return `
    <button
      class="danger-button admin-delete-button"
      type="button"
      data-prayer-request-id="${escapeHtml(request.public_id)}"
    >
      Delete
    </button>
  `;
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
}

function renderPrayerRequests(prayerRequests) {
  prayerRequestCount.textContent =
    prayerRequests.length === 1 ? "1 request" : `${prayerRequests.length} requests`;
  prayerRequestTableBody.innerHTML = "";
  prayerRequestMobileList.innerHTML = "";

  if (prayerRequests.length === 0) {
    prayerRequestEmpty.classList.remove("hidden");
    return;
  }

  prayerRequestEmpty.classList.add("hidden");

  prayerRequests.forEach((request) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(formatSubmittedAt(request.created_at))}</td>
      <td>${escapeHtml(request.person_name || "-")}</td>
      <td>${escapeHtml(request.contact || "-")}</td>
      <td class="request-text-cell">${formatRequestText(request.request_text)}</td>
      <td>${getDeletePrayerRequestButtonMarkup(request)}</td>
    `;
    prayerRequestTableBody.appendChild(row);

    const card = document.createElement("article");
    card.className = "admin-mobile-card";
    card.innerHTML = `
      <p><strong>Submitted:</strong> ${escapeHtml(formatSubmittedAt(request.created_at))}</p>
      <p><strong>Person:</strong> ${escapeHtml(request.person_name || "-")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(request.contact || "-")}</p>
      <p><strong>Request:</strong><br />${formatRequestText(request.request_text)}</p>
      <div class="admin-mobile-actions">${getDeletePrayerRequestButtonMarkup(request)}</div>
    `;
    prayerRequestMobileList.appendChild(card);
  });
}

async function deletePrayerRequestEntry(requestId, button) {
  const originalText = button.textContent;
  if (!window.confirm("Delete this prayer request? This cannot be undone.")) {
    return;
  }

  button.disabled = true;
  button.textContent = "Deleting...";

  try {
    const response = await fetch(
      `/api/admin/prayer-requests/${encodeURIComponent(requestId)}/delete${adminToken ? `?token=${encodeURIComponent(adminToken)}` : ""}`,
      {
        method: "POST",
      }
    );

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Unable to delete this prayer request.");
    }

    setAdminMessage("success", "Prayer request deleted.");
    await loadAdminData();
  } catch (error) {
    setAdminMessage("error", error.message);
    button.disabled = false;
    button.textContent = originalText;
  }
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
    await loadAdminData();
  } catch (error) {
    setAdminMessage("error", error.message);
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function resetAllHours() {
  if (!window.confirm("This will clear every booked prayer hour and reopen the full schedule. Continue?")) {
    return;
  }

  resetAllButton.disabled = true;
  resetAllButton.textContent = "Resetting all...";

  try {
    const response = await fetch(
      `/api/admin/reset-all${adminToken ? `?token=${encodeURIComponent(adminToken)}` : ""}`,
      {
        method: "POST",
      }
    );

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Unable to reset the full prayer schedule.");
    }

    setAdminMessage(
      "success",
      result.resetCount > 0
        ? `All booked hours were cleared. ${result.resetCount} hour${result.resetCount === 1 ? "" : "s"} reopened.`
        : "The schedule was already fully open."
    );
    await loadAdminData();
  } catch (error) {
    setAdminMessage("error", error.message);
  } finally {
    resetAllButton.disabled = false;
    resetAllButton.textContent = "Reset all hours";
  }
}

async function loadAdminData() {
  try {
    const tokenSuffix = adminToken ? `?token=${encodeURIComponent(adminToken)}` : "";
    const [scheduleResponse, requestsResponse] = await Promise.all([
      fetch(`/api/admin/schedule${tokenSuffix}`),
      fetch(`/api/admin/prayer-requests${tokenSuffix}`),
    ]);
    const scheduleResult = await scheduleResponse.json();
    const requestsResult = await requestsResponse.json();

    if (!scheduleResponse.ok) {
      throw new Error(scheduleResult.error || "Unable to load the admin schedule.");
    }

    if (!requestsResponse.ok) {
      throw new Error(requestsResult.error || "Unable to load prayer requests.");
    }

    renderAdminSchedule(scheduleResult);
    renderPrayerRequests(requestsResult.prayerRequests || []);
    setAdminMessage(
      "success",
      "Schedule and private prayer requests loaded. This page refreshes automatically."
    );
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
    loadAdminData().catch((error) => {
      console.error("Unable to refresh the admin data.", error);
    });
  }, 15000);
}

exportCsv.href = `/admin/export.csv${adminToken ? `?token=${encodeURIComponent(adminToken)}` : ""}`;
exportPdf.href = `/admin/export.pdf${adminToken ? `?token=${encodeURIComponent(adminToken)}` : ""}`;
exportPrayerRequestsCsv.href = `/admin/prayer-requests/export.csv${adminToken ? `?token=${encodeURIComponent(adminToken)}` : ""}`;

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
    await loadAdminData();
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

resetAllButton.addEventListener("click", () => {
  resetAllHours().catch((error) => {
    console.error("Unable to reset the full schedule.", error);
  });
});

document.addEventListener("click", (event) => {
  const resetButton = event.target.closest("[data-slot-hour]");
  if (resetButton) {
    const slotHour = Number(resetButton.dataset.slotHour);
    if (!Number.isInteger(slotHour)) {
      return;
    }

    resetSlot(slotHour, resetButton).catch((error) => {
      console.error("Unable to reset the slot.", error);
    });
    return;
  }

  const deletePrayerRequestButton = event.target.closest("[data-prayer-request-id]");
  if (!deletePrayerRequestButton) {
    return;
  }

  const requestId = deletePrayerRequestButton.dataset.prayerRequestId;
  if (!requestId) {
    return;
  }

  deletePrayerRequestEntry(requestId, deletePrayerRequestButton).catch((error) => {
    console.error("Unable to delete the prayer request.", error);
  });
});

loadAdminData();
startAdminPolling();
