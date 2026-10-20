/**
 * 會員付費 panel — interactive 3D glossy jelly + #022 CSS sheen on tab/title.
 * Three.js loaded lazily via ESM CDN when the panel first opens.
 * Soft vertex springs: press-drag-release wobble (touch + mouse).
 * Stub only — no payment backend.
 */
(function () {
  "use strict";

  var THREE_CDN =
    "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

  var MATCHA = 0x7cb342;
  var MATCHA_DARK = 0x558b2f;
  // Snappy jelly: stiff springs, firm damping, wide poke (tuned for phone 60fps)
  var STIFFNESS = 130;
  var DAMPING = 0.76;
  var GRAB_RADIUS = 0.9;
  var GRAB_STRENGTH = 1.05;
  var GRAB_FOLLOW = 0.82;
  var HIT_LERP = 0.62;
  var IDLE_AMP = 0.01;
  var IDLE_AMP_REDUCED = 0.002;

  var THREE = null;
  var loadPromise = null;

  var rafId = 0;
  var running = false;
  var disposed = true;
  var startToken = 0;
  var reducedMotion = false;

  var host = null;
  var canvas = null;
  var renderer = null;
  var scene = null;
  var camera = null;
  var jellyMesh = null;
  var eyeL = null;
  var eyeR = null;
  var restPositions = null;
  var velocities = null;
  var eyeRestL = null;
  var eyeRestR = null;

  var pointer = {
    active: false,
    id: null,
    hitLocal: null,
    grabLocal: null,
    plane: null,
    ndc: { x: 0, y: 0 }
  };

  var clock = null;
  var resizeObs = null;
  var mqReduced = null;

  function panelVisible() {
    var panel = document.getElementById("home-panel-member-pay");
    return !!(
      panel &&
      !panel.classList.contains("hidden") &&
      !panel.hasAttribute("hidden")
    );
  }

  function prefersReducedMotion() {
    return !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function loadThree() {
    if (THREE) return Promise.resolve(THREE);
    if (loadPromise) return loadPromise;
    loadPromise = import(THREE_CDN)
      .then(function (mod) {
        THREE = mod;
        return THREE;
      })
      .catch(function (err) {
        loadPromise = null;
        throw err;
      });
    return loadPromise;
  }

  function restartCssSheen() {
    var nodes = [
      document.getElementById("home-tab-member-pay"),
      document.getElementById("member-pay-title")
    ];
    nodes.forEach(function (el) {
      if (!el) return;
      el.classList.remove("is-light-sweep");
      void el.offsetWidth;
      el.classList.add("is-light-sweep");
    });
  }

  /** Shape a sphere into Soft Goods–style cat jelly rest pose (ears kept). */
  function shapeCatBlob(attr) {
    var i;
    var x;
    var y;
    var z;
    var side;
    var earX;
    var earY;
    var earBaseY;
    var t;
    var dx;
    var dz;
    var proximity;
    var baseBlend;
    var tipPull;
    var count = attr.count;
    for (i = 0; i < count; i++) {
      x = attr.getX(i);
      y = attr.getY(i);
      z = attr.getZ(i);

      // Slightly taller body, softer cheeks
      y *= 1.1;
      x *= 1.04;
      z *= 0.92;

      // Integrated ear lobes: wide base blend into head, tapered tips
      if (y > 0.08) {
        side = x >= 0 ? 1 : -1;
        earX = side * 0.48;
        earY = 1.22;
        earBaseY = 0.42;
        t = Math.max(0, (y - 0.08) / 1.05);
        t = t * t * (3 - 2 * t); // smoothstep
        dx = x - earX * 0.55;
        dz = z;
        // Wider lateral falloff so ears merge into crown instead of looking stuck-on
        proximity = Math.exp(-(dx * dx) * 4.2 - (dz * dz) * 2.4) * t;
        // Pull toward a flared base then tip
        baseBlend = proximity * (0.55 + 0.35 * Math.max(0, (y - earBaseY) / 0.7));
        x += (earX - x) * baseBlend * 0.72;
        y += (earY - y) * proximity * 0.68;
        z *= 1 - proximity * 0.38;
        // Soft tip taper (not a hard spike)
        if (proximity > 0.28) {
          tipPull = Math.min(0.55, (proximity - 0.28) * 0.55);
          x = x * (1 - tipPull) + earX * 0.88 * tipPull;
          y = y * (1 - tipPull) + earY * tipPull;
          z = z * (1 - tipPull * 0.85);
        }
      }

      // Sit flatter on the ground
      if (y < -0.4) {
        y = -0.4 + (y + 0.4) * 0.28;
        x *= 1.06;
        z *= 1.05;
      }

      attr.setXYZ(i, x, y, z);
    }
  }

  function avgDispNear(target, radius) {
    if (!restPositions || !jellyMesh) return new THREE.Vector3();
    var pos = jellyMesh.geometry.attributes.position;
    var r2 = radius * radius;
    var sx = 0;
    var sy = 0;
    var sz = 0;
    var n = 0;
    var i;
    var dx;
    var dy;
    var dz;
    var count = restPositions.length / 3;
    for (i = 0; i < count; i++) {
      dx = restPositions[i * 3] - target.x;
      dy = restPositions[i * 3 + 1] - target.y;
      dz = restPositions[i * 3 + 2] - target.z;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      sx += pos.getX(i) - restPositions[i * 3];
      sy += pos.getY(i) - restPositions[i * 3 + 1];
      sz += pos.getZ(i) - restPositions[i * 3 + 2];
      n++;
    }
    if (!n) return new THREE.Vector3();
    return new THREE.Vector3(sx / n, sy / n, sz / n);
  }

  function createJellyGeometry() {
    // Fewer segments keeps phone drag at ~60fps; still enough for ear silhouette
    var geo = new THREE.SphereGeometry(1, 28, 20);
    shapeCatBlob(geo.attributes.position);
    geo.computeVertexNormals();
    return geo;
  }

  function createScene(THREE_ns, containerEl) {
    var w = Math.max(containerEl.clientWidth || 320, 160);
    var h = Math.max(containerEl.clientHeight || 260, 200);

    canvas = document.createElement("canvas");
    canvas.className = "member-pay-jelly-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.touchAction = "none";
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    containerEl.appendChild(canvas);

    renderer = new THREE_ns.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    // Cap DPR for mobile fill-rate; still sharp enough on retina
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE_ns.SRGBColorSpace;
    renderer.toneMapping = THREE_ns.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    scene = new THREE_ns.Scene();

    camera = new THREE_ns.PerspectiveCamera(38, w / h, 0.1, 40);
    camera.position.set(0, 0.35, 3.85);
    camera.lookAt(0, 0.15, 0);

    var hemi = new THREE_ns.HemisphereLight(0xffffff, 0xa8c090, 0.75);
    scene.add(hemi);
    var key = new THREE_ns.DirectionalLight(0xffffff, 1.55);
    key.position.set(2.4, 3.4, 2.6);
    scene.add(key);
    var fill = new THREE_ns.DirectionalLight(0xd8f5c4, 0.55);
    fill.position.set(-2.4, 0.8, 1.4);
    scene.add(fill);
    var rim = new THREE_ns.PointLight(0xffffff, 0.75, 14);
    rim.position.set(-1.4, 2.4, -2.3);
    scene.add(rim);
    var gloss = new THREE_ns.PointLight(0xe8ffd0, 0.4, 8);
    gloss.position.set(0.6, 1.8, 2.2);
    scene.add(gloss);

    var geo = createJellyGeometry();
    var posAttr = geo.attributes.position;
    var count = posAttr.count;
    restPositions = new Float32Array(count * 3);
    velocities = new Float32Array(count * 3);
    var i;
    for (i = 0; i < count; i++) {
      restPositions[i * 3] = posAttr.getX(i);
      restPositions[i * 3 + 1] = posAttr.getY(i);
      restPositions[i * 3 + 2] = posAttr.getZ(i);
    }

    var mat = new THREE_ns.MeshPhysicalMaterial({
      color: MATCHA,
      roughness: 0.12,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      transmission: 0.28,
      thickness: 0.95,
      ior: 1.42,
      specularIntensity: 1.15,
      sheen: 0.42,
      sheenColor: new THREE_ns.Color(MATCHA_DARK),
      sheenRoughness: 0.32,
      transparent: true,
      opacity: 0.97
    });

    jellyMesh = new THREE_ns.Mesh(geo, mat);
    jellyMesh.position.y = -0.12;
    jellyMesh.scale.set(1.05, 1.05, 1.05);
    scene.add(jellyMesh);

    var eyeMat = new THREE_ns.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.35,
      metalness: 0.1
    });
    var eyeGeo = new THREE_ns.SphereGeometry(0.07, 12, 10);
    eyeRestL = new THREE_ns.Vector3(-0.26, 0.22, 0.92);
    eyeRestR = new THREE_ns.Vector3(0.26, 0.22, 0.92);
    eyeL = new THREE_ns.Mesh(eyeGeo, eyeMat);
    eyeR = new THREE_ns.Mesh(eyeGeo.clone(), eyeMat);
    jellyMesh.add(eyeL);
    jellyMesh.add(eyeR);
    eyeL.position.copy(eyeRestL);
    eyeR.position.copy(eyeRestR);

    var shadowGeo = new THREE_ns.CircleGeometry(0.95, 32);
    var shadowMat = new THREE_ns.MeshBasicMaterial({
      color: MATCHA_DARK,
      transparent: true,
      opacity: 0.18
    });
    var shadow = new THREE_ns.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.12;
    scene.add(shadow);

    clock = new THREE_ns.Clock();
    pointer.plane = new THREE_ns.Plane(new THREE_ns.Vector3(0, 0, 1), 0);
    disposed = false;
  }

  function bindPointer() {
    if (!canvas) return;
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("lostpointercapture", onPointerUp);
  }

  function unbindPointer() {
    if (!canvas) return;
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("lostpointercapture", onPointerUp);
  }

  function setNdcFromEvent(e) {
    var rect = canvas.getBoundingClientRect();
    var rw = rect.width || 1;
    var rh = rect.height || 1;
    pointer.ndc.x = ((e.clientX - rect.left) / rw) * 2 - 1;
    pointer.ndc.y = -((e.clientY - rect.top) / rh) * 2 + 1;
  }

  function onPointerDown(e) {
    if (!jellyMesh || !camera || disposed) return;
    e.preventDefault();
    setNdcFromEvent(e);
    var raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer.ndc, camera);
    var hits = raycaster.intersectObject(jellyMesh, false);
    if (!hits.length) return;
    pointer.active = true;
    pointer.id = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
    pointer.hitLocal = jellyMesh.worldToLocal(hits[0].point.clone());
    pointer.grabLocal = pointer.hitLocal.clone();
    var worldNormal = hits[0].face
      ? hits[0].face.normal
          .clone()
          .transformDirection(jellyMesh.matrixWorld)
          .normalize()
      : new THREE.Vector3(0, 0, 1);
    pointer.plane.setFromNormalAndCoplanarPoint(worldNormal, hits[0].point);
  }

  function onPointerMove(e) {
    if (!pointer.active || pointer.id !== e.pointerId) return;
    e.preventDefault();
    setNdcFromEvent(e);
    var raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer.ndc, camera);
    var worldHit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(pointer.plane, worldHit)) {
      worldHit.copy(raycaster.ray.origin).add(
        raycaster.ray.direction.clone().multiplyScalar(3.5)
      );
    }
    pointer.grabLocal = jellyMesh.worldToLocal(worldHit.clone());
  }

  function onPointerUp(e) {
    if (pointer.id != null && e.pointerId !== pointer.id) return;
    pointer.active = false;
    pointer.id = null;
    pointer.hitLocal = null;
    pointer.grabLocal = null;
  }

  function applyGrab(dt) {
    if (!pointer.active || !pointer.hitLocal || !pointer.grabLocal) return;
    var pos = jellyMesh.geometry.attributes.position;
    var count = pos.count;
    var hx = pointer.hitLocal.x;
    var hy = pointer.hitLocal.y;
    var hz = pointer.hitLocal.z;
    var gx = pointer.grabLocal.x;
    var gy = pointer.grabLocal.y;
    var gz = pointer.grabLocal.z;
    var pullX = gx - hx;
    var pullY = gy - hy;
    var pullZ = gz - hz;
    var r2 = GRAB_RADIUS * GRAB_RADIUS;
    var i;
    var dx;
    var dy;
    var dz;
    var d2;
    var w;
    var follow;
    var rx;
    var ry;
    var rz;
    var tx;
    var ty;
    var tz;
    // Same-frame deformation: verts jump toward grab offset immediately
    for (i = 0; i < count; i++) {
      rx = restPositions[i * 3];
      ry = restPositions[i * 3 + 1];
      rz = restPositions[i * 3 + 2];
      dx = rx - hx;
      dy = ry - hy;
      dz = rz - hz;
      d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      w = 1 - Math.sqrt(d2) / GRAB_RADIUS;
      w = w * w * (3 - 2 * w); // smooth falloff, strong near poke
      follow = w * GRAB_FOLLOW * GRAB_STRENGTH;
      tx = rx + pullX * follow;
      ty = ry + pullY * follow;
      tz = rz + pullZ * follow;
      pos.setXYZ(i, tx, ty, tz);
      // Kill residual velocity under the poke so it does not fight the finger
      velocities[i * 3] *= 1 - w * 0.85;
      velocities[i * 3 + 1] *= 1 - w * 0.85;
      velocities[i * 3 + 2] *= 1 - w * 0.85;
      // Light impulse for release wobble
      velocities[i * 3] += pullX * w * GRAB_STRENGTH * 10 * dt;
      velocities[i * 3 + 1] += pullY * w * GRAB_STRENGTH * 10 * dt;
      velocities[i * 3 + 2] += pullZ * w * GRAB_STRENGTH * 10 * dt;
    }
    // Keep grab origin glued to finger (was 0.18 — felt laggy)
    pointer.hitLocal.lerp(pointer.grabLocal, HIT_LERP);
  }

  function integrate(dt, t) {
    var pos = jellyMesh.geometry.attributes.position;
    var count = pos.count;
    var amp = reducedMotion ? IDLE_AMP_REDUCED : IDLE_AMP;
    var i;
    var rx;
    var ry;
    var rz;
    var cx;
    var cy;
    var cz;
    var fx;
    var fy;
    var fz;
    var idle;
    var maxStep = Math.min(dt, 0.033);
    for (i = 0; i < count; i++) {
      rx = restPositions[i * 3];
      ry = restPositions[i * 3 + 1];
      rz = restPositions[i * 3 + 2];
      idle =
        Math.sin(t * 2.1 + ry * 4.5 + rx * 2.0) * amp * (0.6 + 0.4 * ry);
      cx = pos.getX(i);
      cy = pos.getY(i);
      cz = pos.getZ(i);
      fx = (rx - cx) * STIFFNESS;
      fy = (ry + idle - cy) * STIFFNESS;
      fz = (rz - cz) * STIFFNESS;
      velocities[i * 3] = (velocities[i * 3] + fx * maxStep) * DAMPING;
      velocities[i * 3 + 1] = (velocities[i * 3 + 1] + fy * maxStep) * DAMPING;
      velocities[i * 3 + 2] = (velocities[i * 3 + 2] + fz * maxStep) * DAMPING;
      pos.setXYZ(
        i,
        cx + velocities[i * 3] * maxStep,
        cy + velocities[i * 3 + 1] * maxStep,
        cz + velocities[i * 3 + 2] * maxStep
      );
    }
    pos.needsUpdate = true;

  }

  function resizeToHost() {
    if (!host || !renderer || !camera || disposed) return;
    var w = Math.max(host.clientWidth || 320, 160);
    var h = Math.max(host.clientHeight || 260, 200);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(w, h, false);
  }

  function updateEyes() {
    if (!eyeL || !eyeR || !eyeRestL || !eyeRestR) return;
    var dL = avgDispNear(eyeRestL, 0.35);
    var dR = avgDispNear(eyeRestR, 0.35);
    eyeL.position.set(
      eyeRestL.x + dL.x,
      eyeRestL.y + dL.y,
      eyeRestL.z + dL.z
    );
    eyeR.position.set(
      eyeRestR.x + dR.x,
      eyeRestR.y + dR.y,
      eyeRestR.z + dR.z
    );
  }

  var _normalFrame = 0;

  function updateNormals() {
    if (!jellyMesh) return;
    // Every frame while dragging (deformation changed); alternate when idle
    if (pointer.active || (_normalFrame++ % 2 === 0)) {
      jellyMesh.geometry.computeVertexNormals();
    }
  }

  function frame() {
    if (!running || disposed) return;
    if (!panelVisible()) {
      hide();
      return;
    }
    var dt = clock ? clock.getDelta() : 0.016;
    var t = clock ? clock.elapsedTime : 0;
    // Springs first, then grab overrides so verts track the finger this frame
    integrate(dt, t);
    applyGrab(dt);
    updateEyes();
    updateNormals();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (running || disposed) return;
    running = true;
    if (clock) clock.start();
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function disposeScene() {
    stopLoop();
    unbindPointer();
    pointer.active = false;
    pointer.id = null;
    if (resizeObs) {
      try {
        resizeObs.disconnect();
      } catch (e) {}
      resizeObs = null;
    }
    if (jellyMesh) {
      if (jellyMesh.geometry) jellyMesh.geometry.dispose();
      if (jellyMesh.material) jellyMesh.material.dispose();
    }
    if (eyeL) {
      if (eyeL.geometry) eyeL.geometry.dispose();
      if (eyeL.material) eyeL.material.dispose();
    }
    if (eyeR) {
      if (eyeR.geometry) eyeR.geometry.dispose();
    }
    if (scene) {
      scene.traverse(function (obj) {
        if (obj.isMesh && obj !== jellyMesh && obj !== eyeL && obj !== eyeR) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        }
      });
    }
    if (renderer) {
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch (e2) {}
    }
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    canvas = null;
    renderer = null;
    scene = null;
    camera = null;
    jellyMesh = null;
    eyeL = null;
    eyeR = null;
    restPositions = null;
    velocities = null;
    eyeRestL = null;
    eyeRestR = null;
    clock = null;
    disposed = true;
  }

  function ensureHost() {
    host = document.getElementById("member-pay-hero");
    return host;
  }

  function mount() {
    if (!ensureHost()) return Promise.resolve();
    if (!disposed && renderer) {
      resizeToHost();
      startLoop();
      return Promise.resolve();
    }
    return loadThree().then(function (T) {
      if (!panelVisible() || !ensureHost()) return;
      // Clear any leftover 2D canvas from older builds
      while (host.firstChild) host.removeChild(host.firstChild);
      createScene(T, host);
      bindPointer();
      resizeToHost();
      if (typeof ResizeObserver === "function") {
        resizeObs = new ResizeObserver(function () {
          resizeToHost();
        });
        resizeObs.observe(host);
      }
      startLoop();
    });
  }

  function show() {
    reducedMotion = prefersReducedMotion();
    restartCssSheen();
    var token = ++startToken;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (token !== startToken) return;
        if (!panelVisible()) return;
        mount().catch(function (err) {
          console.warn("[member-pay] jelly failed to start", err);
        });
      });
    });
  }

  function hide() {
    startToken++;
    stopLoop();
    disposeScene();
  }

  function stop() {
    hide();
  }

  function onReducedMotionChange() {
    reducedMotion = prefersReducedMotion();
  }

  if (window.matchMedia) {
    mqReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mqReduced.addEventListener) {
      mqReduced.addEventListener("change", onReducedMotionChange);
    } else if (mqReduced.addListener) {
      mqReduced.addListener(onReducedMotionChange);
    }
  }

  window.SchoolAdminMemberPay = {
    show: show,
    hide: hide,
    start: show,
    stop: stop
  };
})();
