const form = document.getElementById("form");
const panel = document.getElementById("panel");
const fill = document.getElementById("fill");
const tick = document.getElementById("tick");
const pctNum = document.getElementById("pctNum");
const verdict = document.getElementById("verdict");
const note = document.getElementById("note");
const facts = document.getElementById("facts");
const btn = document.getElementById("go");
const income = form.person_income, amount = form.loan_amnt, pct = document.getElementById("pct");
const pctHint = document.getElementById("pctHint");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Grade picker
const grades = document.getElementById("grades");
"ABCDEFG".split("").forEach(g => {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = g; b.dataset.v = g;
  b.setAttribute("role", "radio");
  if (g === form.loan_grade.value) b.classList.add("on");
  grades.appendChild(b);
});
function pick(group, hidden) {
  group.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    group.querySelectorAll("button").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); hidden.value = b.dataset.v;
  });
}
pick(grades, form.loan_grade);
pick(document.getElementById("seg"), form.cb_person_default_on_file);

// Loan as share of income (the model expects a ratio, e.g. 0.20)
function updatePct() {
  const i = parseFloat(income.value), a = parseFloat(amount.value);
  if (i > 0 && a > 0) {
    pct.value = (a / i).toFixed(2);
    const over = a / i > 1;
    pctHint.textContent = over ? "Loan is larger than yearly income" : `Loan is ${Math.round(a / i * 100)}% of yearly income`;
    pctHint.classList.toggle("warn", over);
  } else { pct.value = ""; pctHint.textContent = "Worked out from loan amount and income"; }
}
income.addEventListener("input", updatePct);
amount.addEventListener("input", updatePct);
updatePct();

// Gauge helpers
function placeTick(t) {
  const a = Math.PI * t, cx = 110, cy = 110;
  const p = r => [cx - r * Math.cos(a), cy - r * Math.sin(a)];
  const [x1, y1] = p(79), [x2, y2] = p(103);
  tick.setAttribute("x1", x1); tick.setAttribute("y1", y1);
  tick.setAttribute("x2", x2); tick.setAttribute("y2", y2);
}
function countUp(to) {
  if (reduce) { pctNum.textContent = to.toFixed(1); return; }
  const start = performance.now(), dur = 1100;
  (function step(now) {
    const k = Math.min((now - start) / dur, 1), e = 1 - Math.pow(1 - k, 3);
    pctNum.textContent = (to * e).toFixed(1);
    if (k < 1) requestAnimationFrame(step);
  })(start);
}
function setGauge(v) {
  fill.style.transition = reduce ? "none" : "stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1), stroke .5s";
  fill.style.strokeDashoffset = 100 - v * 100;
}

function validate() {
  let ok = true;
  form.querySelectorAll("input:not([type=hidden]):not([readonly])").forEach(el => {
    const bad = el.value === "" || !el.checkValidity();
    el.classList.toggle("bad", bad); if (bad) ok = false;
  });
  return ok;
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!validate()) {
    panel.dataset.state = "error";
    verdict.textContent = "Some fields need fixing";
    note.textContent = "Check the highlighted fields and try again.";
    return;
  }
  const fd = new FormData(form), body = {};
  const ints = ["person_age", "cb_person_cred_hist_length"];
  const nums = ["person_income", "person_emp_length", "loan_amnt", "loan_int_rate", "loan_percent_income"];
  for (const [k, v] of fd.entries()) body[k] = ints.includes(k) ? parseInt(v, 10) : nums.includes(k) ? parseFloat(v) : v;

  btn.disabled = true; btn.textContent = "Checking…";
  panel.dataset.state = "idle"; setGauge(0); pctNum.textContent = "--";
  verdict.textContent = "Checking application"; note.textContent = "This takes a moment."; facts.hidden = true;

  try {
    const res = await fetch("/predict", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const d = await res.json();
    const p = d.default_probability, high = d.default_prediction === 1;

    placeTick(Math.min(d.threshold, 1));
    panel.dataset.state = high ? "high" : "low";
    setGauge(p); countUp(p * 100);
    verdict.textContent = d.Result;
    note.textContent = high
      ? "Default chance is above the cut-off. This application needs a closer look."
      : "Default chance is below the cut-off. This application looks safe to approve.";
    document.getElementById("thr").textContent = (d.threshold * 100).toFixed(1) + "%";
    document.getElementById("dec").textContent = high ? "Review" : "Approve";
    facts.hidden = false;
  } catch (err) {
    panel.dataset.state = "error";
    verdict.textContent = "Couldn't get a result";
    note.textContent = "The server didn't respond. Wait a few seconds and try again.";
  } finally {
    btn.disabled = false; btn.textContent = "Check risk";
  }
});
