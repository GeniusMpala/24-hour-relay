const scheduleGrid = document.getElementById("schedule-grid");
const scheduleStatus = document.getElementById("schedule-status");
const selectedSlotSummary = document.getElementById("selected-slot-summary");
const eventDateBadge = document.getElementById("event-date-badge");
const countryBadge = document.getElementById("country-badge");
const changeCountryButton = document.getElementById("change-country");
const bookingForm = document.getElementById("booking-form");
const slotHourInput = document.getElementById("slotHour");
const submitButton = document.getElementById("submit-button");
const formMessage = document.getElementById("form-message");
const countryModal = document.getElementById("country-modal");
const countryButtons = document.querySelectorAll(".country-choice");
const locationInput = document.getElementById("location");

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

function openCountryPrompt() {
  document.body.classList.add("modal-open");
  countryModal.classList.remove("hidden");
}

function closeCountryPrompt() {
  document.body.classList.remove("modal-open");
  countryModal.classList.add("hidden");
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

function renderSelectedSummary() {
  const config = getSelectedCountryConfig();
  if (!scheduleState || !config || selectedHours.length === 0) {
    selectedSlotSummary.className = "selected-slot empty";
    selectedSlotSummary.textContent = "Select one or more available hours to continue.";
    slotHourInput.value = "";
    return;
  }

  const selectedLabels = selectedHours
    .map((hour) => scheduleState.slots.find((slot) => slot.hour === hour))
    .filter(Boolean)
    .map((slot) => `<li>${slot[config.slotKey].label}</li>`)
    .join("");

  slotHourInput.value = selectedHours.join(",");
  selectedSlotSummary.className = "selected-slot";
  selectedSlotSummary.innerHTML = `
    <strong>Selected hours (${selectedHours.length})</strong>
    <ul class="selected-slot-list">${selectedLabels}</ul>
  `;
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
          <strong>${config.timeLabel}</strong>
          <span>${slot[config.slotKey].label}</span>
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
  openCountryPrompt();
});

loadSchedule();
openCountryPrompt();
startSchedulePolling();
