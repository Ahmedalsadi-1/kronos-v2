(() => {
  // frontend/util/agent-cursor-feedback.ts
  function drawAgentCursor(ctx, point, clickAge, label, reducedMotion = false) {
    ctx.save();
    ctx.translate(point.x, point.y);
    const pulse = !reducedMotion && clickAge >= 0 && clickAge < 160 ? Math.sin(clickAge / 160 * Math.PI) : 0;
    const fog = ctx.createRadialGradient(5, 12, 0, 5, 12, 33 + pulse * 1.2);
    fog.addColorStop(0, "rgba(97,92,89,0.30)");
    fog.addColorStop(0.5, "rgba(110,105,102,0.18)");
    fog.addColorStop(0.82, "rgba(117,112,110,0.07)");
    fog.addColorStop(1, "rgba(153,153,153,0)");
    ctx.fillStyle = fog;
    ctx.fillRect(-40, -30, 90, 90);
    ctx.save();
    ctx.scale(1 - pulse * 0.04, 1 + pulse * 0.02);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(1, 1);
    ctx.lineTo(20, 15);
    ctx.lineTo(12, 16);
    ctx.lineTo(8, 25);
    ctx.lineTo(5, 23);
    ctx.lineTo(9, 15);
    ctx.lineTo(1, 16);
    ctx.closePath();
    ctx.fillStyle = "#615c59";
    ctx.fill();
    ctx.strokeStyle = "#eeeeee";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    if (label) {
      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
      const text = label.slice(0, 60);
      const width = ctx.measureText(text).width + 18;
      const viewport = ctx.canvas.width / (ctx.getTransform().a || 1);
      const left = Math.min(22, viewport - point.x - width - 4);
      const top = 18;
      ctx.beginPath();
      ctx.roundRect(left, top, width, 28, 14);
      ctx.fillStyle = "rgba(49,49,49,0.92)";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(text, left + 9, top + 18);
    }
    ctx.restore();
  }
  function advanceAgentCursor(point, target, velocity, dt) {
    const omega = 18;
    const decay = Math.exp(-omega * dt);
    const next = { x: point.x, y: point.y };
    const speed = { x: velocity.x, y: velocity.y };
    for (const axis of ["x", "y"]) {
      const offset = point[axis] - target[axis];
      const coefficient = velocity[axis] + omega * offset;
      next[axis] = target[axis] + (offset + coefficient * dt) * decay;
      speed[axis] = (velocity[axis] - omega * coefficient * dt) * decay;
    }
    return { point: next, velocity: speed };
  }
  function mountAgentCursor(host2, draw = drawAgentCursor, advance = advanceAgentCursor) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.agentCursor = "";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
    host2.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let point, target;
    let velocity = { x: 0, y: 0 };
    let frame;
    let lastTime = 0;
    let clickAt = -Infinity;
    let pendingClick = false;
    let label = "";
    let reduced = media.matches;
    let destroyed = false;
    const clear = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = void 0;
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };
    const render = (now) => {
      frame = void 0;
      if (!ctx || destroyed || !target) return;
      const dt = Math.max(0, Math.min((now - lastTime) / 1e3, 0.05));
      lastTime = now;
      if (reduced) {
        point = { ...target };
        velocity = { x: 0, y: 0 };
      } else {
        const next = advance(point, target, velocity, dt);
        point = next.point;
        velocity = next.velocity;
      }
      const moving = Math.hypot(point.x - target.x, point.y - target.y) > 0.1 || Math.hypot(velocity.x, velocity.y) > 0.5;
      if (!moving) {
        point = { ...target };
        velocity = { x: 0, y: 0 };
        if (pendingClick) {
          clickAt = now;
          pendingClick = false;
        }
      }
      const width = host2.clientWidth, height = host2.clientHeight, dpr = devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      draw(ctx, point, now - clickAt, label, reduced);
      if (moving || now - clickAt < 160) frame = requestAnimationFrame(render);
    };
    return {
      update(next, nextLabel = "", click = false, reduce = media.matches) {
        if (destroyed || !ctx || !Number.isFinite(next.x) || !Number.isFinite(next.y)) return;
        target = { ...next };
        point ??= { ...target };
        label = nextLabel;
        reduced = reduce;
        if (click) pendingClick = true;
        if (frame == null) {
          lastTime = performance.now();
          render(lastTime);
        }
      },
      clear() {
        clear();
        point = target = void 0;
        velocity = { x: 0, y: 0 };
        clickAt = -Infinity;
        pendingClick = false;
      },
      destroy() {
        destroyed = true;
        clear();
        canvas.remove();
      }
    };
  }

  // output/cursor-feedback/preview.ts
  var stages = [
    { label: "Rest", age: -1 },
    { label: "Press \xB7 80 ms", age: 80 },
    { label: "Release \xB7 160 ms", age: 160 }
  ];
  for (const stage of stages) {
    const section = document.createElement("section");
    section.innerHTML = `<h2>${stage.label}</h2><canvas width="360" height="180"></canvas>`;
    document.querySelector("#stages").appendChild(section);
    const canvas = section.querySelector("canvas");
    drawAgentCursor(canvas.getContext("2d"), { x: 100, y: 95 }, stage.age, "Click Save");
  }
  var host = document.querySelector("#live");
  var cursor = mountAgentCursor(host);
  var timer;
  var run = () => {
    clearTimeout(timer);
    cursor.clear();
    const targets = [
      { x: 75, y: 110, label: "Inspect controls", click: false },
      { x: host.clientWidth * 0.5, y: 140, label: "Click Save", click: true },
      { x: host.clientWidth * 0.75, y: 100, label: "Inspect result", click: false },
      { x: host.clientWidth * 0.28, y: 150, label: "Click Done", click: true }
    ];
    let index = 0;
    const step = () => {
      const target = targets[index++];
      cursor.update(target, target.label, target.click);
      if (index < targets.length) timer = setTimeout(step, 1200);
    };
    step();
  };
  document.querySelector("#run").addEventListener("click", run);
})();
