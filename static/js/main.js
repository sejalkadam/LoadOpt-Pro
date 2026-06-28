// main.js — App orchestration

// Init 3D viewer
Viewer3D.init();
window.addEventListener("resize", Viewer3D.resize);

let currentContainerIdx = 0;

// ── Optimize ──────────────────────────────────────────────────
document.getElementById("btn-optimize").addEventListener("click", async () => {
  // Validation
  if (State.boxes.length === 0) { showAlert("Add at least one cargo item.", "warn"); return; }
  if (State.selectedContainers.size === 0) { showAlert("Select at least one container.", "warn"); return; }
  for (const b of State.boxes) {
    if (!b.l || !b.w || !b.h) { showAlert(`Box "${b.name}" has invalid dimensions.`, "danger"); return; }
    if (!b.weight) { showAlert(`Box "${b.name}" has no weight.`, "warn"); return; }
    if (!b.qty || b.qty < 1) { showAlert(`Box "${b.name}" has invalid quantity.`, "warn"); return; }
    if (!b.allowed_rotations || b.allowed_rotations.length === 0) {
      showAlert(`Box "${b.name}" has no allowed rotations.`, "warn"); return;
    }
  }

  document.getElementById("spinner").style.display = "block";
  document.getElementById("btn-optimize").disabled = true;

  try {
    const payload = {
      items: State.boxes.map(b => ({
        name: b.name, color: b.color,
        l: b.l, w: b.w, h: b.h,
        qty: b.qty, weight: b.weight,
        allowed_rotations: b.allowed_rotations,
      })),
      fleet: State.fleet,
      selected_containers: [...State.selectedContainers],
    };

    const resp = await fetch("/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await resp.json();

    if (!json.success) throw new Error(json.error);

    State.lastResult = json.result;
    renderResults(json.result);

    // Switch to results tab
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelector('[data-tab="results"]').classList.add("active");
    document.getElementById("tab-results").classList.add("active");
    document.getElementById("tab-btn-results").disabled = false;
    Viewer3D.resize();

    // Show export buttons
    document.getElementById("btn-export-excel").style.display = "block";
    document.getElementById("btn-export-pdf").style.display = "block";

  } catch (err) {
    showAlert("Optimisation failed: " + err.message, "danger");
  } finally {
    document.getElementById("spinner").style.display = "none";
    document.getElementById("btn-optimize").disabled = false;
  }
});

function showAlert(msg, type = "danger") {
  const existing = document.querySelector(".alert");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  const bar = document.querySelector(".optimize-bar");
  bar.parentElement.insertBefore(el, bar);
  setTimeout(() => el.remove(), 5000);
}

// ── Results Rendering ─────────────────────────────────────────
function renderResults(result) {
  currentContainerIdx = 0;
  renderSummaryBanner(result);
  renderContainerNav(result);
  renderContainerDetail(result.containers[0], result);
}

function renderSummaryBanner(result) {
  const el = document.getElementById("summary-banner");
  const unplaced = result.unplaced || [];
  el.innerHTML = `
    <div class="sb-kpi"><span class="sk-label">Containers Used</span><span class="sk-val">${result.num_containers}</span></div>
    <div class="sb-sep"></div>
    <div class="sb-kpi"><span class="sk-label">Total Boxes</span><span class="sk-val">${result.total_boxes}</span></div>
    <div class="sb-sep"></div>
    <div class="sb-kpi"><span class="sk-label">Total Weight</span><span class="sk-val">${result.total_weight.toLocaleString()}</span><span class="sk-sub">kg</span></div>
    <div class="sb-sep"></div>
    <div class="sb-kpi"><span class="sk-label">Total Volume</span><span class="sk-val">${(result.total_volume/1e9).toFixed(4)}</span><span class="sk-sub">m³</span></div>
    <div class="sb-sep"></div>
    <div class="sb-kpi"><span class="sk-label">Unplaced</span><span class="sk-val" style="color:${unplaced.length > 0 ? '#FFB347':'#5FD46A'}">${unplaced.length}</span></div>
    ${unplaced.length > 0 ? `<div class="sb-sep"></div><div class="sb-kpi"><span class="sk-label" style="color:#FFB347">⚠ Some boxes could not be placed</span></div>` : ''}`;
}

function renderContainerNav(result) {
  const nav = document.getElementById("container-nav");
  nav.innerHTML = "";
  result.containers.forEach((c, i) => {
    const btn = document.createElement("button");
    btn.className = "cnav-btn" + (i === 0 ? " active" : "");
    btn.innerHTML = `<strong>Container ${i + 1}</strong><br><span style="font-size:11px;font-weight:400">${c.container_name}</span>`;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cnav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentContainerIdx = i;
      renderContainerDetail(result.containers[i], result);
    });
    nav.appendChild(btn);
  });
}

function renderContainerDetail(cd, result) {
  renderStatsSidebar(cd);
  renderPlacementTable(cd);
  Viewer3D.load(cd, false); // animated
}

function renderStatsSidebar(cd) {
  const sb = document.getElementById("stats-sidebar");
  const volColor = cd.utilization_vol > 85 ? "#27AE60" : cd.utilization_vol > 60 ? "#E67E22" : "#C0392B";
  const wtColor  = cd.utilization_wt  > 85 ? "#27AE60" : cd.utilization_wt  > 60 ? "#E67E22" : "#2E6DA4";

  // Legend from placed boxes (unique names)
  const uniqueBoxes = {};
  cd.placed_boxes.forEach(b => {
    if (!uniqueBoxes[b.name]) uniqueBoxes[b.name] = { color: b.color, count: 0 };
    uniqueBoxes[b.name].count++;
  });

  const legendHTML = Object.entries(uniqueBoxes).map(([name, v]) =>
    `<div class="legend-item"><span class="legend-swatch" style="background:${v.color}"></span><span>${name} ×${v.count}</span></div>`
  ).join("");

  sb.innerHTML = `
    <div class="stat-row">
      <span class="st-label">Container</span>
      <span class="st-val" style="font-size:13px">${cd.container_name}</span>
    </div>
    <div class="stat-row">
      <span class="st-label">Dimensions</span>
      <span class="st-val" style="font-size:12px">${cd.container_dims.l} × ${cd.container_dims.w} × ${cd.container_dims.h} mm</span>
    </div>
    <div class="stat-row">
      <span class="st-label">Boxes Loaded</span>
      <span class="st-val">${cd.box_count}</span>
    </div>
    <div class="stat-row">
      <span class="st-label">Weight Utilisation</span>
      <span class="st-val" style="color:${wtColor}">${cd.utilization_wt}%</span>
      <div class="progress-wrap"><div class="progress-fill" style="width:${cd.utilization_wt}%;background:${wtColor}"></div></div>
      <span style="font-size:11px;color:var(--text-3)">${cd.total_weight.toLocaleString()} / ${cd.max_wt.toLocaleString()} kg</span>
    </div>
    <div class="stat-row">
      <span class="st-label">Volume Utilisation</span>
      <span class="st-val" style="color:${volColor}">${cd.utilization_vol}%</span>
      <div class="progress-wrap"><div class="progress-fill" style="width:${cd.utilization_vol}%;background:${volColor}"></div></div>
      <span style="font-size:11px;color:var(--text-3)">${(cd.total_volume_used/1e9).toFixed(4)} / ${(cd.container_volume/1e9).toFixed(4)} m³</span>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
      <span class="st-label">Box Legend</span>
      <div class="legend-list" style="margin-top:8px">${legendHTML}</div>
    </div>`;
}

function renderPlacementTable(cd) {
  const wrap = document.getElementById("placement-table-wrap");
  const rows = cd.placed_boxes.map((b, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><span class="color-dot" style="background:${b.color}"></span></td>
      <td>${b.name}</td>
      <td style="font-family:var(--mono);font-size:12px">${b.rotation}</td>
      <td style="font-family:var(--mono)">${b.x}</td>
      <td style="font-family:var(--mono)">${b.y}</td>
      <td style="font-family:var(--mono)">${b.z}</td>
      <td style="font-family:var(--mono)">${b.dx}×${b.dy}×${b.dz}</td>
      <td>${b.weight.toFixed(1)}</td>
    </tr>`).join("");

  wrap.innerHTML = `
    <h3>📋 Placement Plan — ${cd.container_name} (${cd.placed_boxes.length} boxes)</h3>
    <table class="result-table">
      <thead><tr>
        <th>#</th><th>Color</th><th>Box Name</th><th>Rotation</th>
        <th>X (mm)</th><th>Y (mm)</th><th>Z (mm)</th>
        <th>Dims (dx×dy×dz)</th><th>Wt (kg)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Viewer Controls ───────────────────────────────────────────
document.getElementById("vbtn-play").addEventListener("click", () => Viewer3D.playAnimation());
document.getElementById("vbtn-reset").addEventListener("click", () => Viewer3D.resetView());
document.getElementById("vbtn-wireframe").addEventListener("click", () => {
  Viewer3D.toggleWireframe();
  document.getElementById("vbtn-wireframe").classList.toggle("active");
});
document.getElementById("vbtn-explode").addEventListener("click", () => {
  Viewer3D.toggleExplode();
  document.getElementById("vbtn-explode").classList.toggle("active");
});

// ── Exports ───────────────────────────────────────────────────
async function doExport(endpoint, filename) {
  if (!State.lastResult) return;
  try {
    const resp = await fetch(`/api/export/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: State.lastResult }),
    });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    a.click(); URL.revokeObjectURL(url);
  } catch (e) { alert("Export failed: " + e.message); }
}

document.getElementById("btn-export-excel").addEventListener("click", () => doExport("excel", "load_plan.xlsx"));
document.getElementById("btn-export-pdf").addEventListener("click", () => doExport("pdf", "load_plan.pdf"));

