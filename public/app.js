const scheduleGrid = document.getElementById("schedule-grid");
const scheduleStatus = document.getElementById("schedule-status");
const selectedSlotSummary = document.getElementById("selected-slot-summary");
const eventDateBadge = document.getElementById("event-date-badge");
const countryBadge = document.getElementById("country-badge");
const changeCountryButton = document.getElementById("change-country");
const jumpToPrayerRequestButton = document.getElementById("jump-to-prayer-request");
const formPanel = document.getElementById("form-panel");
const bookingForm = document.getElementById("booking-form");
const slotHourInput = document.getElementById("slotHour");
const submitButton = document.getElementById("submit-button");
const formMessage = document.getElementById("form-message");
const prayerRequestModal = document.getElementById("prayer-request-modal");
const prayerRequestForm = document.getElementById("prayer-request-form");
const prayerRequestButton = document.getElementById("prayer-request-button");
const prayerRequestMessage = document.getElementById("prayer-request-message");
const closePrayerRequestModalButton = document.getElementById("close-prayer-request-modal");
const countryModal = document.getElementById("country-modal");
const countryButtons = document.querySelectorAll(".country-choice");
const locationInput = document.getElementById("location");
const mobileCta = document.getElementById("mobile-cta");

let scheduleState = null;
let selectedHours = [];
let selectedCountry = null;

const countryConfig = {
  usa: {
    label: "USA",
    timeLabel: "USA Eastern Time",
    slotKey: "eastern",
    locationValue: "USA",
  },
  zimbabwe: {
    label: "Zimbabwe",
    timeLabel: "Zimbabwe Time",
    slotKey: "zimbabwe",
    locationValue: "Zimbabwe",
  },
};

function setMessage(element, type, text) {
  element.className = `inline-message ${type}`;
  element.textContent = text;
}

function clearMessage(element) {
  element.className = "inline-message hidden";
  element.textContent = "";
}

function getSelectedCountryConfig() {
  return selectedCountry ? countryConfig[selectedCountry] : null;
}

function syncModalState() {
  const isCountryModalOpen = !countryModal.classList.contains("hidden");
  const isPrayerRequestModalOpen = !prayerRequestModal.classList.contains("hidden");
  document.body.classList.toggle("modal-open", isCountryModalOpen || isPrayerRequestModalOpen);
}

function openCountryPrompt() {
  countryModal.classList.remove("hidden");
  syncModalState();
}

function closeCountryPrompt() {
  countryModal.classList.add("hidden");
  syncModalState();
}

function openPrayerRequestModal() {
  clearMessage(prayerRequestMessage);
  prayerRequestModal.classList.remove("hidden");
  syncModalState();
}

function closePrayerRequestModal() {
  prayerRequestModal.classList.add("hidden");
  syncModalState();
}

function updateCountryUi() {
  const config = getSelectedCountryConfig();
  if (!config) {
    countryBadge.classList.add("hidden");
    changeCountryButton.classList.add("hidden");
    setMessage(scheduleStatus, "info", "Select your country to view the schedule.");
    return;
  }

  countryBadge.textContent = `Viewing: ${config.timeLabel}`;
  countryBadge.classList.remove("hidden");
  changeCountryButton.classList.remove("hidden");
  setMessage(
    scheduleStatus,
    "info",
    `Showing prayer hours in ${config.timeLabel}. Booked slots update live.`
  );
}

function updateMobileCta() {
  if (!mobileCta) {
    return;
  }

  if (!selectedCountry || selectedHours.length === 0) {
    mobileCta.classList.add("hidden");
    mobileCta.textContent = "Continue with selected hours";
    return;
  }

  mobileCta.classList.remove("hidden");
  mobileCta.textContent =
    selectedHours.length === 1
      ? "Continue with 1 selected hour"
      : `Continue with ${selectedHours.length} selected hours`;
}

function renderSelectedSummary() {
  const config = getSelectedCountryConfig();
  if (!scheduleState || !config || selectedHours.length === 0) {
    selectedSlotSummary.className = "selected-slot empty";
    selectedSlotSummary.textContent = "Select one or more available hours to continue.";
    slotHourInput.value = "";
    updateMobileCta();
    return;
  }

  const selectedLabels = selectedHours
    .map((hour) => scheduleState.slots.find((slot) => slot.hour === hour))
    .filter(Boolean)
    .map((slot) => `<span class="selected-slot-chip">${slot[config.slotKey].label}</span>`)
    .join("");

  slotHourInput.value = selectedHours.join(",");
  selectedSlotSummary.className = "selected-slot";
  selectedSlotSummary.innerHTML = `
    <div class="selected-slot-heading">
      <strong>${selectedHours.length === 1 ? "1 hour selected" : `${selectedHours.length} hours selected`}</strong>
      <span>${config.timeLabel}</span>
    </div>
    <div class="selected-slot-chips">${selectedLabels}</div>
  `;
  updateMobileCta();
}

function toggleHourSelection(hour) {
  const slot = scheduleState?.slots.find((entry) => entry.hour === hour && !entry.isBooked);
  if (!slot) {
    selectedHours = selectedHours.filter((selectedHour) => selectedHour !== hour);
    renderSelectedSummary();
    renderSchedule();
    return;
  }

  if (selectedHours.includes(hour)) {
    selectedHours = selectedHours.filter((selectedHour) => selectedHour !== hour);
  } else {
    selectedHours = [...selectedHours, hour].sort((a, b) => a - b);
  }

  renderSelectedSummary();
  renderSchedule();
}

function renderSchedule() {
  const config = getSelectedCountryConfig();
  if (!scheduleState || !config) {
    return;
  }

  eventDateBadge.textContent = `Event date: ${scheduleState.eventDate}`;
  scheduleGrid.innerHTML = "";

  scheduleState.slots.forEach((slot) => {
    const article = document.createElement("article");
    article.className = `slot-card ${slot.isBooked ? "booked" : "available"} ${selectedHours.includes(slot.hour) ? "selected" : ""}`;

    article.innerHTML = `
      <div class="slot-header">
        <span class="status-pill ${slot.isBooked ? "status-booked" : "status-open"}">
          ${slot.isBooked ? "Booked" : "Available"}
        </span>
      </div>

      <div class="slot-times">
        <div class="slot-time">
          <strong>${slot[config.slotKey].label}</strong>
          <span>${config.timeLabel}</span>
        </div>
      </div>
    `;

    if (!slot.isBooked) {
      article.addEventListener("click", () => toggleHourSelection(slot.hour));
    }

    scheduleGrid.appendChild(article);
  });
}

function applySchedule(schedule) {
  scheduleState = schedule;

  const stillOpenHours = selectedHours.filter((selectedHour) =>
    schedule.slots.some((slot) => slot.hour === selectedHour && !slot.isBooked)
  );

  if (stillOpenHours.length !== selectedHours.length) {
    selectedHours = stillOpenHours;
    setMessage(
      formMessage,
      "error",
      "One of your selected hours was just booked by someone else. Please review your selection."
    );
  }

  updateCountryUi();
  if (selectedCountry) {
    renderSelectedSummary();
    renderSchedule();
  } else {
    updateMobileCta();
  }
}

async function loadSchedule() {
  try {
    const response = await fetch("/api/schedule");
    if (!response.ok) {
      throw new Error("Unable to load the schedule.");
    }

    const schedule = await response.json();
    applySchedule(schedule);
  } catch (error) {
    setMessage(scheduleStatus, "error", error.message);
  }
}

let scheduleRefreshTimer = null;

function startSchedulePolling() {
  if (scheduleRefreshTimer) {
    clearInterval(scheduleRefreshTimer);
  }

  scheduleRefreshTimer = setInterval(() => {
    loadSchedule().catch((error) => {
      console.error("Unable to refresh the schedule.", error);
    });
  }, 15000);
}

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(formMessage);

  if (!selectedCountry) {
    setMessage(formMessage, "error", "Please select your country first.");
    openCountryPrompt();
    return;
  }

  if (selectedHours.length === 0) {
    setMessage(formMessage, "error", "Please choose one or more available hours before submitting.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Saving your booking...";

  const payload = {
    slotHours: selectedHours,
    fullName: document.getElementById("fullName").value,
    location: document.getElementById("location").value,
    contact: document.getElementById("contact").value,
    topic: document.getElementById("topic").value,
  };

  try {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      const message = result.errors?.join(" ") || result.error || "Unable to save your booking.";
      throw new Error(message);
    }

    setMessage(formMessage, "success", "Your prayer hours are confirmed. Redirecting...");
    window.location.href = `/confirmation?booking=${encodeURIComponent(result.bookingId)}`;
  } catch (error) {
    setMessage(formMessage, "error", error.message);
    await loadSchedule();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Confirm my prayer hours";
  }
});

prayerRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(prayerRequestMessage);

  prayerRequestButton.disabled = true;
  prayerRequestButton.textContent = "Saving prayer request...";

  const payload = {
    personName: document.getElementById("prayer-person-name").value,
    contact: document.getElementById("prayer-person-contact").value,
    requestText: document.getElementById("prayer-request-text").value,
  };

  try {
    const response = await fetch("/api/prayer-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      const message =
        result.errors?.join(" ") || result.error || "Unable to save your prayer request.";
      throw new Error(message);
    }

    prayerRequestForm.reset();
    setMessage(
      prayerRequestMessage,
      "success",
      "Your prayer request was sent privately to the admin team."
    );
  } catch (error) {
    setMessage(prayerRequestMessage, "error", error.message);
  } finally {
    prayerRequestButton.disabled = false;
    prayerRequestButton.textContent = "Add prayer request";
  }
});

countryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedCountry = button.dataset.country;
    const config = getSelectedCountryConfig();
    if (!locationInput.value.trim()) {
      locationInput.value = config.locationValue;
    }
    closeCountryPrompt();
    updateCountryUi();
    renderSchedule();
  });
});

changeCountryButton.addEventListener("click", () => {
  selectedCountry = null;
  selectedHours = [];
  slotHourInput.value = "";
  selectedSlotSummary.className = "selected-slot empty";
  selectedSlotSummary.textContent = "Select one or more available hours to continue.";
  scheduleGrid.innerHTML = "";
  updateCountryUi();
  updateMobileCta();
  openCountryPrompt();
});

if (mobileCta) {
  mobileCta.addEventListener("click", () => {
    formPanel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

if (jumpToPrayerRequestButton) {
  jumpToPrayerRequestButton.addEventListener("click", () => {
    openPrayerRequestModal();
  });
}

if (closePrayerRequestModalButton) {
  closePrayerRequestModalButton.addEventListener("click", () => {
    closePrayerRequestModal();
  });
}

if (prayerRequestModal) {
  prayerRequestModal.addEventListener("click", (event) => {
    if (event.target === prayerRequestModal) {
      closePrayerRequestModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && prayerRequestModal && !prayerRequestModal.classList.contains("hidden")) {
    closePrayerRequestModal();
  }
});

loadSchedule();
openCountryPrompt();
startSchedulePolling();
