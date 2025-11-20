/* app.js - UI polish update:
 - Chart drawing improved (devicePixelRatio scaling, rounded bars, clean percent labels)
 - Modal scroll (CSS) already applied; inputs/select/date styled in CSS
 - All core logic (storage/reminders/undo/stock) unchanged
*/

// ---------- Utilities & storage keys ----------
const LS = {
  users: "medtrack_users_v1",
  meds: "medtrack_meds_v1",
  adherence: "medtrack_adherence_v1",
  lastNotified: "medtrack_lastnotified_v1",
};

function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 10);
}
function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || [];
  } catch (e) {
    return [];
  }
}
function write(key, val) {
  localStorage.setItem(key, JSON.stringify(val || []));
}

function nowIST() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 330 * 60000);
}
function hhmmFromDate(d) {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
async function sendNotification(title, body) {
  if (Notification.permission === "granted") new Notification(title, { body });
  else alert(`${title}\n\n${body}`);
}

// data helpers
function loadUsers() {
  return read(LS.users);
}
function saveUsers(u) {
  write(LS.users, u);
}
function loadMeds() {
  return read(LS.meds);
}
function saveMeds(m) {
  write(LS.meds, m);
}
function loadAdherence() {
  return read(LS.adherence);
}
function saveAdherence(a) {
  write(LS.adherence, a);
}
function loadLastNotified() {
  return read(LS.lastNotified);
}
function saveLastNotified(l) {
  write(LS.lastNotified, l);
}

// UI hooks
const memberListEl = document.getElementById("member-list");
const filterMemberSel = document.getElementById("filter-member");
const btnAddMember = document.getElementById("btn-add-member");
const btnAddMed = document.getElementById("btn-add-med");
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");
const medGrid = document.getElementById("medicines-grid");
const todayList = document.getElementById("today-list");
const reqNotifBtn = document.getElementById("request-notif");
const trackerSummary = document.getElementById("tracker-summary");
const searchInput = document.getElementById("search");
const medListTitle = document.getElementById("med-list-title");
const chartCanvas = document.getElementById("adherence-chart");

// state
let users = loadUsers();
let meds = loadMeds();
let adherence = loadAdherence();
let lastNotified = loadLastNotified();
let activeMemberId = users[0]?.id || null;

// ---------- Helpers ----------
function refreshAllUI() {
  users = loadUsers();
  meds = loadMeds();
  adherence = loadAdherence();
  lastNotified = loadLastNotified();
  renderMembers();
  renderMedicines();
  renderToday();
  renderTracker();
}
function formatFrequency(n) {
  if (!n) return "No schedule";
  if (n === 1) return "Once daily";
  if (n === 2) return "Twice daily";
  return `${n} times daily`;
}

// ---------- Members rendering ----------
function renderMembers() {
  memberListEl.innerHTML = "";
  filterMemberSel.innerHTML = '<option value="all">All members</option>';
  users.forEach((u) => {
    const li = document.createElement("li");
    li.className = "member-item" + (u.id === activeMemberId ? " active" : "");
    li.innerHTML = `<div style="display:flex;align-items:center"><div class="member-avatar"></div><div><strong>${
      u.name
    }</strong><div style="font-size:12px;color:#6b7280">${
      u.relationship || "—"
    }</div></div></div>
        <div><button class="small-btn" data-id="${
          u.id
        }" data-action="edit">Edit</button>
        <button class="small-btn" data-id="${
          u.id
        }" data-action="del">Delete</button></div>`;
    li.addEventListener("click", (e) => {
      if (e.target.dataset && e.target.dataset.action) return;
      activeMemberId = u.id;
      filterMemberSel.value = u.id;
      refreshAllUI();
    });
    memberListEl.appendChild(li);
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.name;
    filterMemberSel.appendChild(opt);
  });
  if (users.length === 0) {
    const defaultUser = {
      id: uid("u_"),
      name: "Me",
      relationship: "Self",
      age: "",
      avatar: "",
    };
    users.push(defaultUser);
    saveUsers(users);
    activeMemberId = defaultUser.id;
    renderMembers();
  }
}

// ---------- Medicines rendering ----------
function renderMedicines() {
  medGrid.innerHTML = "";
  const q = (searchInput.value || "").toLowerCase();
  const memberFilter = filterMemberSel.value;
  let effectiveFilter = memberFilter;
  if (memberFilter === "all" && activeMemberId)
    effectiveFilter = activeMemberId;

  const filtered = meds.filter((m) => {
    if (effectiveFilter !== "all" && m.familyMemberId !== effectiveFilter)
      return false;
    if (q && !m.name.toLowerCase().includes(q)) return false;
    return true;
  });

  if (effectiveFilter === "all") medListTitle.textContent = "Medicines (all)";
  else {
    const owner = users.find((u) => u.id === effectiveFilter);
    medListTitle.textContent = `Medicines — ${owner ? owner.name : "Selected"}`;
  }

  if (filtered.length === 0) {
    medGrid.innerHTML = "<div style='color:#6b7280'>No medicines yet.</div>";
    return;
  }

  filtered.forEach((m) => {
    const owner = users.find((u) => u.id === m.familyMemberId);
    const timesPerDay = (m.times || []).length;
    const freqText = formatFrequency(timesPerDay);
    const daysRemaining =
      m.stockQty && timesPerDay
        ? Math.floor(m.stockQty / Math.max(1, timesPerDay))
        : null;

    const card = document.createElement("div");
    card.className = "med-card";
    card.innerHTML = `
        <div class="med-top">
          <div class="med-icon" ><img src="medicare2.png"></div>
          <div class="med-title">
            <h4>${m.name}</h4>
            <div class="med-meta">${m.dosage || ""} • ${
      m.type || ""
    } • <small>${owner ? owner.name : "—"}</small></div>
            <div class="badges"><div class="type-pill">${freqText}</div>${(
      m.times || []
    )
      .map((t) => `<div class="time-badge">${t}</div>`)
      .join("")}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="small-btn" data-id="${
              m.id
            }" data-act="edit">✎</button>
            <button class="small-btn" data-id="${
              m.id
            }" data-act="del">🗑</button>
          </div>
        </div>
        <div class="stock-box">
          <div style="flex:1">
            <div class="stock-qty">Stock: ${m.stockQty ?? 0} doses</div>
            <div class="stock-days">${
              daysRemaining === null
                ? "Estimate unavailable"
                : `~${daysRemaining} day${
                    daysRemaining === 1 ? "" : "s"
                  } remaining`
            }</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
            <button class="action-btn" data-id="${
              m.id
            }" data-act="view">View</button>
          </div>
        </div>
      `;
    card.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        if (act === "edit") openEditMed(id);
        if (act === "del") {
          if (confirm("Delete this medicine?")) deleteMed(id);
        }
        if (act === "view") openViewMed(id);
      });
    });
    medGrid.appendChild(card);
  });
}

// ---------- Today list with undo & stock behavior ----------
function renderToday() {
  const ist = nowIST();
  const todayDate = ist.toISOString().slice(0, 10);
  const active = activeMemberId;
  const medsForToday = meds.filter((m) => {
    if (!active) return false;
    if (m.familyMemberId !== active) return false;
    if (m.startDate && m.startDate > todayDate) return false;
    if (m.endDate && m.endDate < todayDate) return false;
    return (m.times || []).length > 0;
  });

  if (medsForToday.length === 0) {
    todayList.innerHTML = `<div style="color:#6b7280">No medicines scheduled for selected member today.</div>`;
    return;
  }

  const events = loadAdherence();
  todayList.innerHTML = "";

  medsForToday.forEach((m) => {
    (m.times || []).forEach((t) => {
      const ev = events.find(
        (e) =>
          e.medicineId === m.id && e.date === todayDate && e.scheduledTime === t
      );
      const container = document.createElement("div");
      container.className = "today-item";
      const left = document.createElement("div");
      left.className = "today-left";
      const titleSpan = document.createElement("div");
      titleSpan.className = "today-title";
      titleSpan.textContent = `${t} • ${m.name}`;
      const metaSpan = document.createElement("div");
      metaSpan.className = "today-meta";
      metaSpan.textContent = `${m.dosage || ""}${
        m.notes ? " • " + m.notes : ""
      }`;
      left.appendChild(titleSpan);
      left.appendChild(metaSpan);
      const right = document.createElement("div");

      if (ev) {
        const label = document.createElement("div");
        label.className = `status-label ${
          ev.taken ? "status-taken" : "status-skipped"
        }`;
        label.textContent = ev.taken ? "Taken" : "Skipped";

        const undo = document.createElement("button");
        undo.className = "undo-btn";
        undo.textContent = "Undo";
        undo.addEventListener("click", (e) => {
          e.stopPropagation();
          undoAdherence(m.id, t);
        });

        right.appendChild(label);
        right.appendChild(undo);

        if (ev.taken) {
          titleSpan.style.textDecoration = "line-through";
          titleSpan.style.color = "var(--success)";
        } else {
          titleSpan.style.color = "var(--danger)";
        }
      } else {
        const btnTaken = document.createElement("button");
        btnTaken.className = "action-btn";
        btnTaken.textContent = "Taken";
        btnTaken.dataset.id = m.id;
        btnTaken.dataset.time = t;
        const btnSkip = document.createElement("button");
        btnSkip.className = "action-btn";
        btnSkip.textContent = "Skip";
        btnSkip.dataset.id = m.id;
        btnSkip.dataset.time = t;

        btnTaken.addEventListener("click", (e) => {
          e.stopPropagation();
          markTakenManual(m.id, t, true);
          // immediate visual replacement with Undo
          const label = document.createElement("div");
          label.className = "status-label status-taken";
          label.textContent = "Taken";
          const undo = document.createElement("button");
          undo.className = "undo-btn";
          undo.textContent = "Undo";
          undo.addEventListener("click", (evnt) => {
            evnt.stopPropagation();
            undoAdherence(m.id, t);
          });
          right.innerHTML = "";
          right.appendChild(label);
          right.appendChild(undo);
          titleSpan.style.textDecoration = "line-through";
          titleSpan.style.color = "var(--success)";
        });

        btnSkip.addEventListener("click", (e) => {
          e.stopPropagation();
          markTakenManual(m.id, t, false);
          const label = document.createElement("div");
          label.className = "status-label status-skipped";
          label.textContent = "Skipped";
          const undo = document.createElement("button");
          undo.className = "undo-btn";
          undo.textContent = "Undo";
          undo.addEventListener("click", (evnt) => {
            evnt.stopPropagation();
            undoAdherence(m.id, t);
          });
          right.innerHTML = "";
          right.appendChild(label);
          right.appendChild(undo);
          titleSpan.style.color = "var(--danger)";
        });

        right.appendChild(btnTaken);
        right.appendChild(btnSkip);
      }

      container.appendChild(left);
      container.appendChild(right);
      todayList.appendChild(container);
    });
  });
}

// Undo adherence and restore stock if needed
function undoAdherence(medicineId, scheduledTime) {
  const ist = nowIST();
  const todayDate = ist.toISOString().slice(0, 10);
  const idx = adherence.findIndex(
    (x) =>
      x.medicineId === medicineId &&
      x.date === todayDate &&
      x.scheduledTime === scheduledTime
  );
  if (idx === -1) return;
  const removed = adherence.splice(idx, 1)[0];
  if (removed.taken) {
    const medObj = meds.find((mm) => mm.id === removed.medicineId);
    if (medObj) {
      medObj.stockQty = (Number(medObj.stockQty) || 0) + 1;
      saveMeds(meds);
    }
  }
  saveAdherence(adherence);
  refreshAllUI();
}

// persist taken/skipped; when taken === true decrement stock
function markTakenManual(id, time, taken) {
  const m = meds.find((x) => x.id === id);
  if (!m) return;
  const ist = nowIST();
  const todayDate = ist.toISOString().slice(0, 10);
  const ev = {
    id: uid("e_"),
    medicineId: id,
    familyMemberId: m.familyMemberId,
    taken: !!taken,
    takenAt: ist.toISOString(),
    scheduledTime: time,
    date: todayDate,
  };
  adherence.push(ev);
  if (taken) {
    m.stockQty = Math.max(0, (Number(m.stockQty) || 0) - 1);
    saveMeds(meds);
  }
  saveAdherence(adherence);
  refreshAllUI();
}

// ---------- Tracker: compute last 7 days and draw chart ----------
function renderTracker() {
  if (!activeMemberId) {
    trackerSummary.textContent = "No member selected";
    drawChart([]);
    return;
  }
  const memberMeds = meds.filter((m) => m.familyMemberId === activeMemberId);
  if (memberMeds.length === 0) {
    trackerSummary.textContent = "No medicines";
    drawChart([]);
    return;
  }
  const totalDoses = memberMeds.reduce(
    (acc, m) => acc + (m.times || []).length,
    0
  );
  const events = loadAdherence();
  const taken = events.filter(
    (e) => e.familyMemberId === activeMemberId && e.taken
  ).length;
  trackerSummary.innerHTML = `<strong>${taken} / ${totalDoses}</strong> doses taken (last recorded)`;

  const days = [];
  const istNow = nowIST();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(istNow);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    let scheduled = 0;
    memberMeds.forEach((m) => {
      if (m.startDate && m.startDate > dateStr) return;
      if (m.endDate && m.endDate < dateStr) return;
      scheduled += (m.times || []).length;
    });
    const takenCount = events.filter(
      (e) =>
        e.familyMemberId === activeMemberId && e.date === dateStr && e.taken
    ).length;
    const percent =
      scheduled === 0 ? 0 : Math.round((takenCount / scheduled) * 100);
    days.push({ date: dateStr, scheduled, taken: takenCount, percent });
  }
  drawChart(days);
}

// drawChart: crisp drawing using devicePixelRatio, rounded bars, centered percent text
function drawChart(days) {
  if (!chartCanvas) return;
  const ctx = chartCanvas.getContext("2d");
  // handle DPR
  const dpr = window.devicePixelRatio || 1;
  const cssW = chartCanvas.clientWidth;
  const cssH = chartCanvas.clientHeight;
  chartCanvas.width = Math.round(cssW * dpr);
  chartCanvas.height = Math.round(cssH * dpr);
  chartCanvas.style.width = cssW + "px";
  chartCanvas.style.height = cssH + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // clear
  ctx.clearRect(0, 0, cssW, cssH);
  // background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cssW, cssH);

  if (!days || days.length === 0) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "13px Inter, Arial";
    ctx.fillText("No adherence data", 12, 40);
    return;
  }

  const paddingX = 16;
  const paddingY = 14;
  const chartW = cssW - paddingX * 2;
  const chartH = cssH - paddingY * 2 - 18; // leave bottom space for date labels
  const slotW = chartW / days.length;
  const barW = Math.min(32, slotW * 0.55);
  const gap = slotW - barW;

  // draw baseline grid (subtle)
  ctx.strokeStyle = "rgba(15,23,42,0.04)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(paddingX, paddingY + chartH);
  ctx.lineTo(paddingX + chartW, paddingY + chartH);
  ctx.stroke();

  days.forEach((d, i) => {
    const x = paddingX + i * slotW + gap / 2;
    const percent = Math.max(0, Math.min(100, d.percent));
    const barH = (percent / 100) * (chartH - 10); // leave a little top gap
    const y = paddingY + (chartH - barH);

    // bar shadow/background rounded rect
    const radius = 6;
    // choose color based on percent
    const fill =
      percent >= 75 ? "#10b981" : percent >= 40 ? "#f59e0b" : "#ef4444";
    // background card area (very subtle)
    ctx.fillStyle = "rgba(241,248,255,0.6)";
    roundRect(ctx, x, paddingY, barW, chartH, 6, true, false);

    // bar fill - rounded rect
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, barW, barH, radius, true, false);

    // percent text above bar (centered)
    ctx.fillStyle = "#0f172a";
    ctx.font = "12px Inter, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(percent + "%", x + barW / 2, y - 6);

    // day label below
    ctx.fillStyle = "#6b7280";
    ctx.font = "11px Inter, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(d.date.slice(5), x + barW / 2, paddingY + chartH + 6);
  });
}

// helper: rounded rect
function roundRect(ctx, x, y, w, h, r, fill = true, stroke = true) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// ---------- Add / Edit med (unchanged logic; UI sized inputs match CSS) ----------
function openAddMedicine() {
  modalBody.innerHTML = `
      <h3>Add Medicine</h3>
      <div class="form-row">
        <label>Family member</label>
        <div style="position:relative">
          <select id="med-family" class="custom-select">${users
            .map((u) => `<option value="${u.id}">${u.name}</option>`)
            .join("")}</select>
          <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);color:#94a3b8;font-weight:700">▾</span>
        </div>
      </div>
      <div class="form-row"><label>Medicine name</label><input id="med-name" type="text" /></div>
      <div class="form-row flex" style="gap:12px">
        <div style="flex:1"><label>Dosage</label><input id="med-dosage" type="text" placeholder="e.g., 500mg"></div>
        <div style="width:170px"><label>Type</label><select id="med-type" class="custom-select"><option>Tablet</option><option>Capsule</option><option>Syrup</option><option>Injection</option></select></div>
      </div>
  
      <div class="form-row">
        <label>Dosage Times</label>
        <div id="times-list"></div>
        <div id="add-time" class="add-time">➕ <span style="margin-left:8px">Add Time</span></div>
        <div class="hint">Add one or more times (HH:MM). Times determine daily frequency.</div>
      </div>
  
      <div class="form-row flex" style="gap:12px">
        <div style="flex:1"><label>Start date</label><input id="med-start" type="date" /></div>
        <div style="flex:1"><label>End date (optional)</label><input id="med-end" type="date" /></div>
      </div>
  
      <div class="form-row"><label>Stock Qty (optional)</label><input id="med-stock" type="number" min="0" /></div>
      <div class="form-row"><label>Notes</label><textarea id="med-notes" rows="3"></textarea></div>
  
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button id="save-med" class="btn primary">Add Medicine</button>
        <button id="cancel-med" class="btn small">Cancel</button>
      </div>
    `;
  modal.classList.remove("hidden");

  const timesListEl = document.getElementById("times-list");
  const addTimeBtn = document.getElementById("add-time");
  const times = [];

  function renderTimes() {
    timesListEl.innerHTML = "";
    if (times.length === 0) {
      timesListEl.innerHTML = `<div class="hint">No times added yet</div>`;
      return;
    }
    times.forEach((t, idx) => {
      const row = document.createElement("div");
      row.className = "time-row";
      row.innerHTML = `<input type="time" value="${t}" data-idx="${idx}" /><button class="remove-time" data-idx="${idx}">✕</button>`;
      row.querySelector("input").addEventListener("change", (e) => {
        times[idx] = e.target.value;
      });
      row.querySelector(".remove-time").addEventListener("click", () => {
        times.splice(idx, 1);
        renderTimes();
      });
      timesListEl.appendChild(row);
    });
  }

  addTimeBtn.addEventListener("click", () => {
    const ist = nowIST();
    const roundedMin = Math.ceil(ist.getMinutes() / 5) * 5;
    ist.setMinutes(roundedMin);
    times.push(hhmmFromDate(ist));
    renderTimes();
  });

  document.getElementById("cancel-med").addEventListener("click", closeModal);
  document.getElementById("save-med").addEventListener("click", () => {
    const familyMemberId = document.getElementById("med-family").value;
    const name = document.getElementById("med-name").value.trim();
    const dosage = document.getElementById("med-dosage").value.trim();
    const type = document.getElementById("med-type").value;
    const start = document.getElementById("med-start").value || null;
    const end = document.getElementById("med-end").value || null;
    const stock =
      parseInt(document.getElementById("med-stock").value || "0") || 0;
    const notes = document.getElementById("med-notes").value.trim();
    const cleanedTimes = times.map((t) => t.trim()).filter(Boolean);
    if (!name || cleanedTimes.length === 0)
      return alert("Name and at least one time required.");
    const med = {
      id: uid("m_"),
      familyMemberId,
      name,
      dosage,
      type,
      times: cleanedTimes,
      startDate: start,
      endDate: end,
      stockQty: stock,
      notes,
      createdAt: new Date().toISOString(),
    };
    meds.push(med);
    saveMeds(meds);
    closeModal();
    refreshAllUI();
  });

  renderTimes();
}

// openEditMed similar to add (keeps behavior)
function openEditMed(id) {
  const m = meds.find((x) => x.id === id);
  if (!m) return alert("Not found");
  modalBody.innerHTML = `
      <h3>Edit Medicine</h3>
      <div class="form-row"><label>Medicine name</label><input id="med-name" type="text" value="${
        m.name
      }" /></div>
      <div class="form-row flex" style="gap:12px">
        <div style="flex:1"><label>Dosage</label><input id="med-dosage" type="text" value="${
          m.dosage || ""
        }"></div>
        <div style="width:170px"><label>Type</label><select id="med-type" class="custom-select"><option${
          m.type === "Tablet" ? " selected" : ""
        }>Tablet</option><option${
    m.type === "Capsule" ? " selected" : ""
  }>Capsule</option><option${
    m.type === "Syrup" ? " selected" : ""
  }>Syrup</option><option${
    m.type === "Injection" ? " selected" : ""
  }>Injection</option></select></div>
      </div>
  
      <div class="form-row">
        <label>Dosage Times</label>
        <div id="times-list"></div>
        <div id="add-time" class="add-time">➕ <span style="margin-left:8px">Add Time</span></div>
        <div class="hint">Add one or more times (HH:MM). Times determine daily frequency.</div>
      </div>
  
      <div class="form-row flex" style="gap:12px">
        <div style="flex:1"><label>Start date</label><input id="med-start" type="date" value="${
          m.startDate || ""
        }" /></div>
        <div style="flex:1"><label>End date (optional)</label><input id="med-end" type="date" value="${
          m.endDate || ""
        }" /></div>
      </div>
  
      <div class="form-row"><label>Stock Qty (optional)</label><input id="med-stock" type="number" value="${
        m.stockQty || 0
      }" min="0" /></div>
      <div class="form-row"><label>Notes</label><textarea id="med-notes" rows="3">${
        m.notes || ""
      }</textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button id="save-med" class="btn primary">Save</button><button id="cancel-med" class="btn small">Cancel</button></div>
    `;
  modal.classList.remove("hidden");

  const timesListEl = document.getElementById("times-list");
  const addTimeBtn = document.getElementById("add-time");
  const times = (m.times || []).slice();

  function renderTimes() {
    timesListEl.innerHTML = "";
    if (times.length === 0) {
      timesListEl.innerHTML = `<div class="hint">No times added yet</div>`;
      return;
    }
    times.forEach((t, idx) => {
      const row = document.createElement("div");
      row.className = "time-row";
      row.innerHTML = `<input type="time" value="${t}" data-idx="${idx}" /><button class="remove-time" data-idx="${idx}">✕</button>`;
      row.querySelector("input").addEventListener("change", (e) => {
        times[idx] = e.target.value;
      });
      row.querySelector(".remove-time").addEventListener("click", () => {
        times.splice(idx, 1);
        renderTimes();
      });
      timesListEl.appendChild(row);
    });
  }

  addTimeBtn.addEventListener("click", () => {
    const ist = nowIST();
    const roundedMin = Math.ceil(ist.getMinutes() / 5) * 5;
    ist.setMinutes(roundedMin);
    times.push(hhmmFromDate(ist));
    renderTimes();
  });

  document.getElementById("cancel-med").addEventListener("click", closeModal);
  document.getElementById("save-med").addEventListener("click", () => {
    m.name = document.getElementById("med-name").value.trim();
    m.dosage = document.getElementById("med-dosage").value.trim();
    m.type = document.getElementById("med-type").value;
    m.times = times.map((t) => t.trim()).filter(Boolean);
    m.startDate = document.getElementById("med-start").value || null;
    m.endDate = document.getElementById("med-end").value || null;
    m.stockQty =
      parseInt(document.getElementById("med-stock").value || "0") || 0;
    m.notes = document.getElementById("med-notes").value.trim();
    saveMeds(meds);
    closeModal();
    refreshAllUI();
  });

  renderTimes();
}

// ---------- view med ----------
function openViewMed(id) {
  const m = meds.find((x) => x.id === id);
  if (!m) return alert("Not found");
  const owner = users.find((u) => u.id === m.familyMemberId);
  const timesPerDay = (m.times || []).length;
  const freqText = formatFrequency(timesPerDay);
  const daysRemaining =
    m.stockQty && timesPerDay
      ? Math.floor(m.stockQty / Math.max(1, timesPerDay))
      : null;

  modalBody.innerHTML = `
      <h3>${m.name}</h3>
      <div class="med-meta">${m.dosage || ""} • ${m.type || ""} • ${
    owner ? owner.name : ""
  }</div>
      <div style="margin-top:8px">${m.notes || ""}</div>
      <div style="margin-top:12px"><div style="font-weight:700">Dosage & Frequency</div><div class="hint">${
        m.dosage || ""
      } • ${freqText}</div></div>
      <div style="margin-top:12px"><div style="font-weight:700">Daily Times</div><div class="badges">${(
        m.times || []
      )
        .map((t) => `<div class="time-badge">${t}</div>`)
        .join("")}</div></div>
      <div style="margin-top:12px"><div style="font-weight:700">Stock</div><div class="stock-box" style="margin-top:8px"><div style="flex:1"><div class="stock-qty">Stock: ${
        m.stockQty ?? 0
      } doses</div><div class="stock-days">${
    daysRemaining === null
      ? "Estimate unavailable"
      : `~${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
  }</div></div></div></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button id="close-view" class="btn small">Close</button></div>
    `;
  modal.classList.remove("hidden");
  document.getElementById("close-view").addEventListener("click", closeModal);
}

// ---------- delete / reminders ----------
function deleteMed(id) {
  meds = meds.filter((m) => m.id !== id);
  saveMeds(meds);
  refreshAllUI();
}
setInterval(checkReminders, 20000);
checkReminders();
function checkReminders() {
  const ist = nowIST();
  const nowHHMM = hhmmFromDate(ist);
  const todayDate = ist.toISOString().slice(0, 10);
  meds.forEach((m) => {
    if (m.startDate && m.startDate > todayDate) return;
    if (m.endDate && m.endDate < todayDate) return;
    (m.times || []).forEach((t) => {
      if (t === nowHHMM) {
        const key = `${m.id}#${t}`;
        const ln = lastNotified.find((x) => x.key === key);
        const lastTs = ln ? new Date(ln.ts).getTime() : 0;
        if (Date.now() - lastTs > 60000) {
          const owner = users.find((u) => u.id === m.familyMemberId);
          const title = `Medicine Reminder: ${m.name}`;
          const body = `${owner ? owner.name : ""} • ${m.dosage || ""} • ${t}`;
          playBeep();
          sendNotification(title, body);
          const newEntry = { key, ts: new Date().toISOString() };
          lastNotified = lastNotified.filter((x) => x.key !== key);
          lastNotified.push(newEntry);
          saveLastNotified(lastNotified);
        }
      }
    });
  });
}
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.6);
    setTimeout(() => o.stop(), 650);
  } catch (e) {}
}

// ---------- Member list handlers & UI wiring ----------
memberListEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.action;
  if (act === "del") {
    if (!confirm("Delete this member and their medicines?")) return;
    users = users.filter((u) => u.id !== id);
    meds = meds.filter((m) => m.familyMemberId !== id);
    saveUsers(users);
    saveMeds(meds);
    if (activeMemberId === id) activeMemberId = users[0]?.id || null;
    refreshAllUI();
  }
  if (act === "edit") {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    modalBody.innerHTML = `<h3>Edit Member</h3><div class="form-row"><label>Name</label><input id="fm-name" type="text" value="${
      u.name
    }" /></div><div class="form-row"><label>Relationship</label><input id="fm-relationship" type="text" value="${
      u.relationship || ""
    }" /></div><div style="display:flex;gap:8px;justify-content:flex-end"><button id="save-fm" class="btn primary">Save</button><button id="cancel-fm" class="btn small">Cancel</button></div>`;
    modal.classList.remove("hidden");
    document.getElementById("cancel-fm").addEventListener("click", closeModal);
    document.getElementById("save-fm").addEventListener("click", () => {
      u.name = document.getElementById("fm-name").value.trim();
      u.relationship = document.getElementById("fm-relationship").value.trim();
      saveUsers(users);
      closeModal();
      refreshAllUI();
    });
  }
});

// Add / Edit wiring
btnAddMember.addEventListener("click", openAddMember);
btnAddMed.addEventListener("click", () => {
  if (!activeMemberId) return alert("Select or add a family member first.");
  openAddMedicine();
});
modalClose.addEventListener("click", closeModal);
reqNotifBtn.addEventListener("click", async () => {
  if (!("Notification" in window)) return alert("Notifications not supported");
  const p = await Notification.requestPermission();
  alert("Notification permission: " + p);
});

searchInput.addEventListener("input", () => renderMedicines());
filterMemberSel.addEventListener("change", () => {
  if (filterMemberSel.value !== "all") activeMemberId = filterMemberSel.value;
  renderMedicines();
  renderToday();
  renderTracker();
});

// Add Member
function openAddMember() {
  modalBody.innerHTML = `<h3>Add Family Member</h3><div class="form-row"><label>Name</label><input id="fm-name" type="text" /></div><div class="form-row"><label>Relationship</label><input id="fm-relationship" type="text" /></div><div class="form-row"><label>Age (optional)</label><input id="fm-age" type="number" /></div><div style="display:flex;gap:8px;justify-content:flex-end"><button id="save-fm" class="btn primary">Add Member</button><button id="cancel-fm" class="btn small">Cancel</button></div>`;
  modal.classList.remove("hidden");
  document.getElementById("cancel-fm").addEventListener("click", closeModal);
  document.getElementById("save-fm").addEventListener("click", () => {
    const name = document.getElementById("fm-name").value.trim();
    const rel = document.getElementById("fm-relationship").value.trim();
    const age = document.getElementById("fm-age").value.trim();
    if (!name) return alert("Name required");
    const u = { id: uid("u_"), name, relationship: rel, age, avatar: "" };
    users.push(u);
    saveUsers(users);
    activeMemberId = u.id;
    filterMemberSel.value = u.id;
    closeModal();
    refreshAllUI();
  });
}

// Modal close
function closeModal() {
  modal.classList.add("hidden");
  modalBody.innerHTML = "";
}

// Init
(function init() {
  users = loadUsers();
  meds = loadMeds();
  adherence = loadAdherence();
  lastNotified = loadLastNotified();
  if (users.length === 0) {
    const u = {
      id: uid("u_"),
      name: "Me",
      relationship: "Self",
      age: "",
      avatar: "",
    };
    users.push(u);
    saveUsers(users);
    activeMemberId = u.id;
  }
  refreshAllUI();
  reqNotifBtn.style.display =
    Notification.permission === "default" ? "inline-block" : "none";
})();
