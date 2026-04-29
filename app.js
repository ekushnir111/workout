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
  var total = session.querySelectorAll(".exercise").length;
  var done = session.querySelectorAll(".exercise.checked").length;
  var letter = sessionId.split("-")[1];
  var text = done + " / " + total + " completed";
  if (done === total && total > 0) {
    text += "  \u2713";
  }
  document.getElementById("progress-" + letter).textContent = text;
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
      var key = sid + "-" + idx;
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

      var inputK = document.createElement("input");
      inputK.type = "text";
      inputK.inputMode = "decimal";
      inputK.className = "weight-input person-k";
      inputK.placeholder = "K";
      inputK.setAttribute("autocomplete", "off");

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
        var key = sid + "-" + i;
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
