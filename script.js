/* ==========================================================
   Mental Health Signal — script.js
   ========================================================== */

/* ============================================================
   CONFIGURATION — change these if your FastAPI setup differs
   ============================================================ */

const API_URL = "https://mental-health-score-36o7.onrender.com";
const PREDICT_ENDPOINT = `${API_URL}/predict`;

// NOTE ON CORS:
// Since this page may be opened directly from the filesystem / VS Code Live
// Server (a different origin than 127.0.0.1:8000), your FastAPI app must
// allow this frontend's origin via CORSMiddleware. Your backend snippet
// already has `allow_origins=["*"]`, which covers this — just make sure
// FastAPI is actually running before you submit the form.

/* ============================================================
   DOM REFERENCES
   ============================================================ */

const form = document.getElementById("signal-form");
const submitBtn = document.getElementById("submit-btn");
const formStatus = document.getElementById("form-status");

const stressGroup = document.getElementById("stress-group");
const stressButtons = Array.from(stressGroup.querySelectorAll(".stress-btn"));
const stressErrorEl = document.getElementById("stress-error");

const resultInner = document.getElementById("result-inner");
const stateIdle = document.getElementById("state-idle");
const stateLoading = document.getElementById("state-loading");
const stateResult = document.getElementById("state-result");
const stateError = document.getElementById("state-error");
const errorMessageEl = document.getElementById("error-message");

const gaugeFill = document.getElementById("gauge-fill");
const gaugeScoreEl = document.getElementById("gauge-score");
const resultStatusEl = document.getElementById("result-status");
const resultMessageEl = document.getElementById("result-message");

const GAUGE_ARC_LENGTH = 282.74; // pre-computed length of the semicircle path (pi * r=90)

let selectedStress = null;

/* ============================================================
   STRESS BUTTON SELECTION
   ============================================================ */

stressButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    stressButtons.forEach((b) => b.setAttribute("aria-checked", "false"));
    btn.setAttribute("aria-checked", "true");
    selectedStress = btn.dataset.value;
    stressErrorEl.textContent = "";
  });
});

/* ============================================================
   FIELD VALIDATION HELPERS
   ============================================================ */

function setFieldError(fieldId, message) {
  const errorEl = document.getElementById(`${fieldId}-error`);
  const inputEl = document.getElementById(fieldId);
  if (errorEl) errorEl.textContent = message || "";
  if (inputEl) inputEl.classList.toggle("touched", Boolean(message));
}

function clearAllFieldErrors() {
  document.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
}

function showFormStatus(message) {
  formStatus.textContent = message;
  formStatus.classList.toggle("visible", Boolean(message));
}

/**
 * Validates the form.
 * Returns { valid: boolean, values: {...} } — values are raw (unmapped) form values.
 */
function validateForm() {
  clearAllFieldErrors();
  showFormStatus("");
  let valid = true;

  const values = {
    age: document.getElementById("age").value,
    gender: document.getElementById("gender").value,
    country: document.getElementById("country").value.trim(),
    academicLevel: document.getElementById("academicLevel").value,
    platform: document.getElementById("platform").value,
    purpose: document.getElementById("purpose").value,
    screenTime: document.getElementById("screenTime").value,
    phoneUnlocks: document.getElementById("phoneUnlocks").value,
    studyHours: document.getElementById("studyHours").value,
    physicalActivity: document.getElementById("physicalActivity").value,
    sleepHours: document.getElementById("sleepHours").value,
    stress: selectedStress,
  };

  const age = Number(values.age);
  if (!values.age || Number.isNaN(age) || age < 10 || age > 100) {
    setFieldError("age", "Enter an age between 10 and 100.");
    valid = false;
  }

  if (!values.gender) {
    setFieldError("gender", "Please select a gender.");
    valid = false;
  }

  if (!values.country) {
    setFieldError("country", "Country is required.");
    valid = false;
  }

  if (!values.academicLevel) {
    setFieldError("academicLevel", "Please select an academic level.");
    valid = false;
  }

  if (!values.platform) {
    setFieldError("platform", "Please select a platform.");
    valid = false;
  }

  if (!values.purpose) {
    setFieldError("purpose", "Please select a purpose.");
    valid = false;
  }

  const screenTime = Number(values.screenTime);
  if (values.screenTime === "" || Number.isNaN(screenTime) || screenTime < 0 || screenTime > 24) {
    setFieldError("screenTime", "Enter a value between 0 and 24.");
    valid = false;
  }

  const phoneUnlocks = Number(values.phoneUnlocks);
  if (values.phoneUnlocks === "" || Number.isNaN(phoneUnlocks) || phoneUnlocks < 0) {
    setFieldError("phoneUnlocks", "Enter a valid number.");
    valid = false;
  }

  const studyHours = Number(values.studyHours);
  if (values.studyHours === "" || Number.isNaN(studyHours) || studyHours < 0 || studyHours > 23) {
    setFieldError("studyHours", "Enter a value between 0 and 23.");
    valid = false;
  }

  const physicalActivity = Number(values.physicalActivity);
  if (values.physicalActivity === "" || Number.isNaN(physicalActivity) || physicalActivity < 0 || physicalActivity > 24) {
    setFieldError("physicalActivity", "Enter a value between 0 and 24.");
    valid = false;
  }

  const sleepHours = Number(values.sleepHours);
  if (values.sleepHours === "" || Number.isNaN(sleepHours) || sleepHours < 0 || sleepHours > 24) {
    setFieldError("sleepHours", "Enter a value between 0 and 24.");
    valid = false;
  }

  if (!values.stress) {
    stressErrorEl.textContent = "Please choose a stress level.";
    valid = false;
  }

  if (!valid) {
    showFormStatus("Please fix the highlighted fields before submitting.");
  }

  return { valid, values };
}

/* ============================================================
   PAYLOAD CONSTRUCTION
   ============================================================
   Field names below match the backend's `StudentData` pydantic
   model exactly (Age, Gender, Country, Academic_Level, ...).
   If your backend schema changes, this is the only place you
   need to edit.
*/

function buildPayload(values) {
  return {
    Age: Number(values.age),
    Gender: values.gender,
    Country: values.country,
    Academic_Level: values.academicLevel,
    Most_Used_Platform: values.platform,
    Purpose_Of_Use: values.purpose,
    Avg_Daily_Usage_Hours: Number(values.screenTime),
    Daily_Unlocks: Number(values.phoneUnlocks),
    Study_Hours: Number(values.studyHours),
    Physical_Activity_Hours: Number(values.physicalActivity),
    Sleep_Hours_Per_Night: Number(values.sleepHours),
    Stress_Level: values.stress,
  };
}

/* ============================================================
   RESPONSE PARSING
   ============================================================
   Supports several common response shapes. Add another
   `data.xxx ??` clause here if your backend uses a different key.
*/

function extractPrediction(data) {
  if (!data || typeof data !== "object") return undefined;
  return (
    data.predicted_mental_health_score ??
    data.prediction ??
    data.score ??
    data.mental_health_score
  );
}

/* ============================================================
   UI STATE MANAGEMENT
   ============================================================ */

function showResultState(state) {
  resultInner.dataset.state = state;
  stateIdle.hidden = state !== "idle";
  stateLoading.hidden = state !== "loading";
  stateResult.hidden = state !== "result";
  stateError.hidden = state !== "error";
}

function setSubmitLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle("is-loading", isLoading);
}

function describeScore(score) {
  if (score < 3) {
    return {
      status: "Low concern",
      message:
        "Your current habits look steady. Keep an eye on sleep and screen time as they change over time.",
    };
  }
  if (score < 5) {
    return {
      status: "Mild concern",
      message:
        "Your current habits show a mild signal. Small adjustments to sleep or stress management could help.",
    };
  }
  if (score < 7) {
    return {
      status: "Moderate concern",
      message:
        "Your current habits indicate a moderate signal. Consider paying attention to sleep, stress, and screen-time patterns.",
    };
  }
  if (score < 8.5) {
    return {
      status: "Elevated concern",
      message:
        "Your current habits indicate an elevated signal. Consider paying attention to sleep, stress, physical activity, and screen-time patterns.",
    };
  }
  return {
    status: "High concern",
    message:
      "Your current habits indicate a high signal. It may help to talk to someone you trust or a professional about how you've been feeling.",
  };
}

/**
 * Animates the gauge fill and the numeric score readout from 0 to `score`.
 */
function animateGauge(score) {
  const clamped = Math.max(0, Math.min(10, score));
  const fraction = clamped / 10;
  const targetOffset = GAUGE_ARC_LENGTH * (1 - fraction);

  // Reset instantly, then animate on the next frame so the CSS transition fires.
  gaugeFill.style.transition = "none";
  gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH);

  requestAnimationFrame(() => {
    gaugeFill.style.transition = "";
    gaugeFill.style.strokeDashoffset = String(targetOffset);
  });

  const duration = 1100;
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = (clamped * eased).toFixed(1);
    gaugeScoreEl.firstChild.textContent = current;
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      gaugeScoreEl.firstChild.textContent = clamped.toFixed(1);
    }
  }
  requestAnimationFrame(tick);
}

function resetGauge() {
  gaugeFill.style.transition = "none";
  gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH);
  gaugeScoreEl.firstChild.textContent = "0.0";
}

/* ============================================================
   FORM SUBMISSION
   ============================================================ */

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const { valid, values } = validateForm();
  if (!valid) {
    return;
  }

  const payload = buildPayload(values);

  setSubmitLoading(true);
  showResultState("loading");
  resetGauge();

  try {
    const response = await fetch(PREDICT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errorBody = await response.json();
        detail = errorBody?.detail
          ? typeof errorBody.detail === "string"
            ? errorBody.detail
            : JSON.stringify(errorBody.detail)
          : "";
      } catch (_) {
        /* response body wasn't JSON — ignore */
      }

      if (response.status === 422) {
        throw new Error(
          detail || "The server rejected the submitted data (422). Check that field values match the backend's expected format."
        );
      }
      if (response.status === 400) {
        throw new Error(detail || "The server could not process this request (400 Bad Request).");
      }
      if (response.status === 500) {
        throw new Error(detail || "The prediction server hit an internal error (500). Check the FastAPI logs.");
      }
      throw new Error(detail || `Request failed with status ${response.status}.`);
    }

    const data = await response.json();
    const prediction = extractPrediction(data);

    if (prediction === undefined || prediction === null || Number.isNaN(Number(prediction))) {
      throw new Error(
        "The server responded, but no recognizable prediction value was found. Check extractPrediction() in script.js against your API's response shape."
      );
    }

    const score = Number(prediction);
    const { status, message } = describeScore(score);
    resultStatusEl.textContent = status;
    resultMessageEl.textContent = message;

    showResultState("result");
    animateGauge(score);
  } catch (err) {
    let message = err.message || "Something went wrong.";

    if (err instanceof TypeError) {
      // fetch() throws a TypeError on network failure / CORS block / server down
      message = `Unable to connect to the prediction server. Make sure FastAPI is running at ${API_URL}.`;
    }

    errorMessageEl.textContent = message;
    showResultState("error");
  } finally {
    setSubmitLoading(false);
  }
});
