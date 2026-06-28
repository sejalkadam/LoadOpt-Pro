// ui.js — UI state management

const State = {
  fleet: JSON.parse(JSON.stringify(DEFAULT_FLEET)),
  selectedContainers: new Set(),
  globalRotations: new Set(ROTATIONS.map(r => r.id)),  // all ON by default
  boxes: [],          // array of box objects
  lastResult: null,
  colorIdx: 0,

  nextColor() {
    const c = BOX_COLORS[this.colorIdx % BOX_COLORS.length];
    this.colorIdx++;
    return c;
  }
};

// ── Fleet rendering ───────────────────────────────────────────
function renderFleet() {
  const list = document.getElementById("fleet-list");
  list.innerHTML = "";
  State.fleet.forEach(c => {
    const div = document.createElement("div");
    div.className = "fleet-item" + (State.selectedContainers.has(c.name) ? " selected" : "");
    div.innerHTML = `
      <input type="checkbox" ${State.selectedContainers.has(c.name) ? "checked" : ""}/>
      <div style="flex:1">
        <div class="fi-name">${c.name}</div>
        <div class="fi-spec">${c.l}×${c.w}×${c.h} mm | ${c.max_wt.toLocaleString()} kg</div>
      </div>`;
    div.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") return;
      div.querySelector("input").click();
    });
    div.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) { State.selectedContainers.add(c.name); div.classList.add("selected"); }
      else { State.selectedContainers.delete(c.name); div.classList.remove("selected"); }
    });
    list.appendChild(div);
  });
}

document.getElementById("btn-select-all-containers").addEventListener("click", () => {
  const allSelected = State.selectedContainers.size === State.fleet.length;
  State.selectedContainers.clear();
  if (!allSelected) State.fleet.forEach(c => State.selectedContainers.add(c.name));
  renderFleet();
});

document.getElementById("btn-add-container").addEventListener("click", () => {
  const name = document.getElementById("cc-name").value.trim();
  const l = +document.getElementById("cc-l").value;
  const w = +document.getElementById("cc-w").value;
  const h = +document.getElementById("cc-h").value;
  const max_wt = +document.getElementById("cc-wt").value;
  if (!name || !l || !w || !h || !max_wt) { alert("Fill all custom container fields."); return; }
  if (State.fleet.find(c => c.name === name)) { alert("Container name already exists."); return; }
  State.fleet.push({ name, l, w, h, max_wt });
  State.selectedContainers.add(name);
  renderFleet();
  ["cc-name","cc-l","cc-w","cc-h","cc-wt"].forEach(id => document.getElementById(id).value = "");
});

// ── Global Rotation Grid ──────────────────────────────────────
function renderRotationGrid(container, selected, onChange) {
  container.innerHTML = "";
  ROTATIONS.forEach(rot => {
    const btn = document.createElement("button");
    btn.className = "rot-btn" + (selected.has(rot.id) ? " active" : "");
    btn.innerHTML = `<span class="rot-icon">${rot.icon}</span>
      <span class="rot-label">${rot.label}</span>
      <span class="rot-sub">${rot.sub}</span>`;
    btn.title = rot.desc;
    btn.addEventListener("click", () => {
      if (selected.has(rot.id)) {
        if (selected.size === 1) return; // keep at least one
        selected.delete(rot.id);
        btn.classList.remove("active");
      } else {
        selected.add(rot.id);
        btn.classList.add("active");
      }
      onChange && onChange();
    });
    container.appendChild(btn);
  });
}

renderRotationGrid(
  document.getElementById("rotation-grid"),
  State.globalRotations,
  () => {
    // update boxes that haven't been overridden
    State.boxes.forEach(b => {
      if (!b._rotOverride) b.allowed_rotations = [...State.globalRotations];
    });
    updateBoxTable();
  }
);

// ── Box Table ─────────────────────────────────────────────────
function updateBoxTable() {
  const tbody = document.getElementById("box-tbody");
  tbody.innerHTML = "";

  if (State.boxes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9">
      <div class="empty-state">
        <div class="es-icon">📦</div>
        <p>No cargo items yet. Click <strong>+ Add Box</strong> to begin.</p>
      </div></td></tr>`;
    updateTotals();
    return;
  }

  State.boxes.forEach((box, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" value="${box.name}" placeholder="Box name" style="min-width:100px"
          oninput="State.boxes[${idx}].name=this.value; updateTotals()"/></td>
      <td><input type="number" value="${box.l}" onkeydown="if(event.key === '-') event.preventDefault();" min="0.01" step="any" style="width:72px"
          oninput="State.boxes[${idx}].l=+this.value; updateTotals()"/></td>
      <td><input type="number" value="${box.w}" onkeydown="if(event.key === '-') event.preventDefault();" min="0.01" step="any" style="width:72px"
          oninput="State.boxes[${idx}].w=+this.value; updateTotals()"/></td>
      <td><input type="number" value="${box.h}" onkeydown="if(event.key === '-') event.preventDefault();" min="0.01" step="any" style="width:72px"
          oninput="State.boxes[${idx}].h=+this.value; updateTotals()"/></td>
      <td><input type="number" value="${box.qty}" onkeydown="if(event.key === '-' || event.key === '.' || event.key.toLowerCase() === 'e') event.preventDefault();" min="1" step="1" style="width:54px"
          oninput="State.boxes[${idx}].qty=+this.value; updateTotals()"/></td>
      <td><input type="number" value="${box.weight}" onkeydown="if(event.key === '-') event.preventDefault();" min="0.01" step="0.01" style="width:90px"
          oninput="State.boxes[${idx}].weight=+this.value; updateTotals()"/></td>
      <td><input type="color" value="${box.color}"
          oninput="State.boxes[${idx}].color=this.value"/></td>
      <td>
        <button class="btn-rot-override" onclick="openRotModal(${idx})">
          ${box._rotOverride ? '✏ Custom' : box.allowed_rotations.length + ' rots'}
        </button>
      </td>
      <td><button class="btn-delete" onclick="deleteBox(${idx})" title="Remove">×</button></td>`;
    tbody.appendChild(tr);
  });

  updateTotals();
}

function deleteBox(idx) {
  State.boxes.splice(idx, 1);
  updateBoxTable();
}

function updateTotals() {
  let totalBoxes = 0, totalWt = 0, totalVol = 0;
  State.boxes.forEach(b => {
    const q = +b.qty || 0;
    totalBoxes += q;
    totalWt += (b.weight || 0) * q;
    totalVol += (b.l || 0) * (b.w || 0) * (b.h || 0) * q;
  });
  document.getElementById("tot-items").textContent = State.boxes.length;
  document.getElementById("tot-boxes").textContent = totalBoxes;
  document.getElementById("tot-wt").textContent = totalWt.toFixed(1) + " kg";
  document.getElementById("tot-vol").textContent = (totalVol / 1e9).toFixed(4) + " m³";
}

document.getElementById("btn-add-box").addEventListener("click", () => {
  State.boxes.push({
    name: "Item " + (State.boxes.length + 1),
    l: 600, w: 500, h: 400,
    qty: 50, weight: 25,
    color: State.nextColor(),
    allowed_rotations: [...State.globalRotations],
    _rotOverride: false,
  });
  updateBoxTable();
});

// ── Rotation Modal ────────────────────────────────────────────
let _modalBoxIdx = null;
let _modalSelected = new Set();

function openRotModal(idx) {
  _modalBoxIdx = idx;
  _modalSelected = new Set(State.boxes[idx].allowed_rotations);
  renderRotationGrid(
    document.getElementById("modal-rotation-grid"),
    _modalSelected, null
  );
  document.getElementById("rotation-modal").style.display = "flex";
}

document.getElementById("modal-close").addEventListener("click", closeRotModal);
document.getElementById("modal-cancel").addEventListener("click", closeRotModal);
document.getElementById("modal-save").addEventListener("click", () => {
  if (_modalBoxIdx !== null) {
    State.boxes[_modalBoxIdx].allowed_rotations = [..._modalSelected];
    State.boxes[_modalBoxIdx]._rotOverride = true;
  }
  closeRotModal();
  updateBoxTable();
});
document.getElementById("rotation-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeRotModal();
});

function closeRotModal() {
  document.getElementById("rotation-modal").style.display = "none";
  _modalBoxIdx = null;
}

// ── Tab switching ─────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + tab).classList.add("active");
    if (tab === "results" && State.lastResult) {
      renderResults(State.lastResult);
      Viewer3D.resize();
    }
  });
});

// ── Init ──────────────────────────────────────────────────────
renderFleet();
updateBoxTable();
