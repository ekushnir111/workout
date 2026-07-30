// Register service worker for offline support
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

// Keep screen awake while app is open
var wakeLock = null;

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (e) { /* user denied or not supported */ }
}

// Request on load and re-request when tab becomes visible again
requestWakeLock();
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "visible") {
    requestWakeLock();
  }
});

var STORAGE_KEY = "workout-checks";
var WEIGHTS_KEY = "workout-weights";
var MIGRATION_KEY = "workout-migrated-v3";

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) { return {}; }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadWeights() {
  try {
    return JSON.parse(localStorage.getItem(WEIGHTS_KEY)) || {};
  } catch (e) { return {}; }
}

function saveWeights(weights) {
  localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights));
}

// ─────────────────────────────────────────────────────────────
// One-time migration: v2 keyed weights by DOM index (session-a-0),
// which breaks the moment exercises are reordered. v3 keys by the
// stable data-id on each .exercise (session-a-a1). Map old slots to
// their new home; drop the two lifts that were replaced outright.
// ─────────────────────────────────────────────────────────────
var MIGRATION_MAP = {
  "session-a-0": "session-a-a1",  // DB RDL        → Barbell RDL
  "session-a-1": "session-a-a2",  // Incline Press → unchanged
  "session-a-2": "session-a-b1",  // Bulgarian     → unchanged
  "session-a-3": "session-a-c2",  // Rear Delt     → demoted to C2
  "session-a-4": "session-a-d1",  // Pallof        → D1
  "session-a-5": "session-a-d2",  // Farmer's      → D2
  // session-b-0 Goblet Squat  → dropped, Hack Squat loads differently
  "session-b-1": "session-b-a2",  // Chin-Up       → unchanged
  // session-b-2 DB Step-Up    → dropped, replaced by Leg Curl
  "session-b-3": "session-b-c1",  // OHP           → C1
  "session-b-4": "session-b-c2",  // Low Row       → C2
  "session-b-5": "session-b-e",   // Dead Hang     → E
  "session-b-6": "session-b-b2"   // Pec Fly       → promoted to B2
};

function migrateWeights() {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  var old = loadWeights();
  var next = {};

  for (var oldKey in MIGRATION_MAP) {
    if (!MIGRATION_MAP.hasOwnProperty(oldKey)) continue;
    var newKey = MIGRATION_MAP[oldKey];
    ["-weight-e", "-weight-k"].forEach(function(suffix) {
      if (old[oldKey + suffix]) {
        next[newKey + suffix] = old[oldKey + suffix];
      }
    });
  }

  // Preserve anything already stored under the new scheme
  for (var k in old) {
    if (old.hasOwnProperty(k) && !/^session-[ab]-\d+-weight-[ek]$/.test(k)) {
      next[k] = old[k];
    }
  }

  saveWeights(next);
  localStorage.removeItem(STORAGE_KEY); // stale checkmarks, not worth remapping
  localStorage.setItem(MIGRATION_KEY, "1");
}

migrateWeights();

function toggleExercise(ex, cb, key, sessionId) {
  var s = loadState();
  s[key] = cb.checked;
  saveState(s);
  if (cb.checked) {
    ex.classList.add("checked");
  } else {
    ex.classList.remove("checked");
  }
  updateProgress(sessionId);
}

function updateProgress(sessionId) {
  var session = document.getElementById(sessionId);
  if (!session) return;
  var letter = sessionId.split("-")[1];
  var label = document.getElementById("progress-" + letter);
  if (!label) return; // reference panes have no exercises

  var total = session.querySelectorAll(".exercise").length;
  var done = session.querySelectorAll(".exercise.checked").length;
  var text = done + " / " + total + " completed";
  if (done === total && total > 0) {
    text += "  \u2713";
  }
  label.textContent = text;
}

// Tab switching
var tabs = document.querySelectorAll(".tab");
var sessions = document.querySelectorAll(".session");

for (var t = 0; t < tabs.length; t++) {
  (function(tab) {
    tab.addEventListener("click", function() {
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove("active");
      }
      for (var i = 0; i < sessions.length; i++) {
        sessions[i].classList.remove("active");
      }
      tab.classList.add("active");
      document.getElementById("session-" + tab.getAttribute("data-tab")).classList.add("active");
      window.scrollTo(0, 0);
    });
  })(tabs[t]);
}

// Init exercises
var state = loadState();
var weights = loadWeights();
var allSessions = document.querySelectorAll(".session");

for (var s = 0; s < allSessions.length; s++) {
  var session = allSessions[s];
  var sessionId = session.id;
  var exercises = session.querySelectorAll(".exercise");

  for (var i = 0; i < exercises.length; i++) {
    (function(ex, idx, sid) {
      // Stable key from data-id; fall back to index if ever missing
      var key = sid + "-" + (ex.getAttribute("data-id") || idx);
      var cb = ex.querySelector("input[type='checkbox']");

      // ── Inject weight inputs ──
      var weightsDiv = document.createElement("div");
      weightsDiv.className = "weights";

      var inputE = document.createElement("input");
      inputE.type = "text";
      inputE.inputMode = "decimal";
      inputE.className = "weight-input person-e";
      inputE.placeholder = "E";
      inputE.setAttribute("autocomplete", "off");
      inputE.setAttribute("aria-label", "Weight for E");

      var inputK = document.createElement("input");
      inputK.type = "text";
      inputK.inputMode = "decimal";
      inputK.className = "weight-input person-k";
      inputK.placeholder = "K";
      inputK.setAttribute("autocomplete", "off");
      inputK.setAttribute("aria-label", "Weight for K");

      // Restore saved weights
      var keyE = key + "-weight-e";
      var keyK = key + "-weight-k";
      if (weights[keyE]) inputE.value = weights[keyE];
      if (weights[keyK]) inputK.value = weights[keyK];

      // Save on change
      function saveWeight(input, wKey) {
        input.addEventListener("input", function() {
          var w = loadWeights();
          if (input.value.trim()) {
            w[wKey] = input.value.trim();
          } else {
            delete w[wKey];
          }
          saveWeights(w);
        });
        // Prevent row click from toggling checkbox when interacting with input
        input.addEventListener("click", function(e) { e.stopPropagation(); });
        input.addEventListener("focus", function(e) { e.stopPropagation(); });
      }
      saveWeight(inputE, keyE);
      saveWeight(inputK, keyK);

      weightsDiv.appendChild(inputE);
      weightsDiv.appendChild(inputK);
      ex.appendChild(weightsDiv);

      // ── Checkbox logic ──
      if (state[key]) {
        cb.checked = true;
        ex.classList.add("checked");
      }

      cb.addEventListener("change", function() {
        toggleExercise(ex, cb, key, sid);
      });

      ex.addEventListener("click", function(e) {
        if (e.target === cb) return;
        // Don't toggle when interacting with weight inputs
        if (e.target.classList.contains("weight-input")) return;
        cb.checked = !cb.checked;
        toggleExercise(ex, cb, key, sid);
      });
    })(exercises[i], i, sessionId);
  }

  updateProgress(sessionId);
}

// Reset buttons (only reset checkboxes, NOT weights)
var resetBtns = document.querySelectorAll(".reset-btn");
for (var r = 0; r < resetBtns.length; r++) {
  (function(btn) {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      var sid = "session-" + btn.getAttribute("data-session");
      var session = document.getElementById(sid);
      var st = loadState();
      var exs = session.querySelectorAll(".exercise");

      for (var i = 0; i < exs.length; i++) {
        var key = sid + "-" + (exs[i].getAttribute("data-id") || i);
        var cb = exs[i].querySelector("input[type='checkbox']");
        cb.checked = false;
        exs[i].classList.remove("checked");
        delete st[key];
      }

      saveState(st);
      updateProgress(sid);
    });
  })(resetBtns[r]);
}
