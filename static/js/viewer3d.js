// viewer3d.js — Three.js 3D Load Visualizer

const Viewer3D = (() => {
  let scene, camera, renderer, animFrame;
  let boxMeshes = [], containerMesh;
  let isWireframe = false, isExploded = false;
  let currentData = null;
  let mouseDown = false, lastMouse = { x: 0, y: 0 };
  let camTheta = 0.6, camPhi = 0.5, camR = 5;
  let animating = false, animIdx = 0, animInterval = null;

  const canvas = document.getElementById("three-canvas");

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0F1B2D);
    scene.fog = new THREE.FogExp2(0x0F1B2D, 0.012);

    camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.01, 200);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    resize();

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(5, 10, 8);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x4A90D9, 0.3);
    fillLight.position.set(-5, 2, -5);
    scene.add(fillLight);

    // Grid
    const grid = new THREE.GridHelper(20, 20, 0x1E3352, 0x1E3352);
    scene.add(grid);

    setupControls();
    animate();
    window.addEventListener("resize", resize);
  }

  function resize() {
    if (!renderer) return;
    const wrap = document.getElementById("viewer-wrap");
    const w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h);
    if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }

  function setupControls() {
    canvas.addEventListener("mousedown", e => { mouseDown = true; lastMouse = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener("mouseup", () => { mouseDown = false; });
    canvas.addEventListener("mousemove", e => {
      if (!mouseDown) return;
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      camTheta -= dx * 0.008;
      camPhi = Math.max(0.1, Math.min(Math.PI / 2, camPhi - dy * 0.008));
      lastMouse = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("wheel", e => {
      camR = Math.max(1, Math.min(30, camR + e.deltaY * 0.01));
    });
    // Touch
    let lastTouch = null;
    canvas.addEventListener("touchstart", e => { if (e.touches.length === 1) lastTouch = e.touches[0]; });
    canvas.addEventListener("touchmove", e => {
      if (e.touches.length === 1 && lastTouch) {
        camTheta -= (e.touches[0].clientX - lastTouch.clientX) * 0.008;
        camPhi = Math.max(0.1, Math.min(Math.PI / 2, camPhi - (e.touches[0].clientY - lastTouch.clientY) * 0.008));
        lastTouch = e.touches[0];
      }
    });
  }

  function animate() {
    animFrame = requestAnimationFrame(animate);
    const cx = camR * Math.sin(camTheta) * Math.cos(camPhi);
    const cy = camR * Math.sin(camPhi);
    const cz = camR * Math.cos(camTheta) * Math.cos(camPhi);
    camera.position.set(cx, cy, cz);
    camera.lookAt(0, 0.3, 0);
    renderer.render(scene, camera);
  }

  function clearScene() {
    boxMeshes.forEach(m => scene.remove(m));
    boxMeshes = [];
    if (containerMesh) { scene.remove(containerMesh); containerMesh = null; }
    stopAnimation();
  }

  function loadContainer(containerData, immediate) {
    clearScene();
    currentData = containerData;
    isWireframe = false; isExploded = false;

    const c = containerData.container_dims;
    const scale = 0.002; // mm → scene units

    const CL = c.l * scale, CW = c.w * scale, CH = c.h * scale;
    const cx = CL / 2, cy = CH / 2, cz = CW / 2;

    // Container wireframe
    const cGeo = new THREE.BoxGeometry(CL, CH, CW);
    const cEdge = new THREE.EdgesGeometry(cGeo);
    const cMat = new THREE.LineBasicMaterial({ color: 0x4A90D9, linewidth: 2, transparent: true, opacity: 0.7 });
    containerMesh = new THREE.LineSegments(cEdge, cMat);
    containerMesh.position.set(cx, cy, cz);
    scene.add(containerMesh);

    // Floor plane
    const floorGeo = new THREE.PlaneGeometry(CL, CW);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1E3352, transparent: true, opacity: 0.5 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    scene.add(floor);
    boxMeshes.push(floor);

    // Auto-fit camera
    const maxDim = Math.max(CL, CW, CH);
    camR = maxDim * 2.2;
    camTheta = 0.6; camPhi = 0.45;

    if (immediate) {
      containerData.placed_boxes.forEach(b => addBoxMesh(b, scale, cx, cy, cz));
    } else {
      // animate placement
      animateBoxPlacement(containerData.placed_boxes, scale, cx, cy, cz);
    }

    updateViewerInfo(containerData);
  }

  function addBoxMesh(b, scale, cx, cy, cz, opacity = 1) {
    const bx = b.dx * scale, by = b.dz * scale, bz = b.dy * scale;
    const geo = new THREE.BoxGeometry(bx, by, bz);

    const hex = parseInt(b.color.replace("#", ""), 16);
    const mat = new THREE.MeshStandardMaterial({
      color: hex,
      transparent: true,
      opacity: opacity * 0.82,
      roughness: 0.4, metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      b.x * scale + bx / 2,
      b.z * scale + by / 2,
      b.y * scale + bz / 2
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { box: b, origPos: mesh.position.clone(), scale };
    scene.add(mesh);
    boxMeshes.push(mesh);

    // Edge highlight
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    mesh.add(edges);

    return mesh;
  }

  function animateBoxPlacement(boxes, scale, cx, cy, cz) {
    let i = 0;
    const speed = Math.max(80, 1200 / boxes.length); // faster for many boxes
    animInterval = setInterval(() => {
      if (i >= boxes.length) { clearInterval(animInterval); animInterval = null; return; }
      const mesh = addBoxMesh(boxes[i], scale, cx, cy, cz, 0);
      // Drop-in animation via opacity
      let t = 0;
      const rise = setInterval(() => {
        t += 0.08;
        if (mesh.material) mesh.material.opacity = Math.min(0.82, t * 0.82);
        if (t >= 1) clearInterval(rise);
      }, 16);
      i++;
    }, speed);
  }

  function stopAnimation() {
    if (animInterval) { clearInterval(animInterval); animInterval = null; }
  }

  function updateViewerInfo(cd) {
    const info = document.getElementById("viewer-info");
    if (!info) return;
    info.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px;color:#90C8FF">${cd.container_name}</div>
      <div>📦 ${cd.placed_boxes.length} boxes</div>
      <div>⚖ ${cd.total_weight.toLocaleString()} kg</div>
      <div>📊 Vol: ${cd.utilization_vol}% | Wt: ${cd.utilization_wt}%</div>`;
  }

  // ── Public API ──────────────────────────────────────────────
  return {
    init,
    load(cd, immediate = false) { loadContainer(cd, immediate); },
    toggleWireframe() {
      isWireframe = !isWireframe;
      boxMeshes.forEach(m => {
        if (m.material && m.material.color) {
          m.material.wireframe = isWireframe;
        }
      });
    },
    toggleExplode() {
      isExploded = !isExploded;
      if (!currentData) return;
      const scale = 0.002;
      const factor = isExploded ? 0.3 : 0;
      boxMeshes.forEach(m => {
        if (!m.userData.box) return;
        const orig = m.userData.origPos;
        const cx = currentData.container_dims.l * scale / 2;
        const cy = currentData.container_dims.h * scale / 2;
        const cz = currentData.container_dims.w * scale / 2;
        m.position.set(
          orig.x + (orig.x - cx) * factor,
          orig.y + (orig.y - cy) * factor,
          orig.z + (orig.z - cz) * factor
        );
      });
    },
    playAnimation() {
      if (!currentData) return;
      // re-load with animation
      loadContainer(currentData, false);
    },
    resetView() {
      camTheta = 0.6; camPhi = 0.45;
      if (currentData) {
        const c = currentData.container_dims;
        const maxDim = Math.max(c.l, c.w, c.h) * 0.002;
        camR = maxDim * 2.2;
      }
    },
    resize,
  };
})();
