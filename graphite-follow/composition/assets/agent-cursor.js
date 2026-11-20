var KronCursor = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <stdin>
  var stdin_exports = {};
  __export(stdin_exports, {
    drawAgentCursor: () => drawAgentCursor
  });

  // frontend/util/agent-cursor-feedback.ts
  function drawAgentCursor(ctx, point, clickAge, label, reducedMotion = false) {
    ctx.save();
    ctx.translate(point.x, point.y);
    const pulse = !reducedMotion && clickAge >= 0 && clickAge < 320 ? Math.sin(clickAge / 320 * Math.PI) : 0;
    const fog = ctx.createRadialGradient(5, 10, 0, 5, 10, 25 + pulse * 3);
    fog.addColorStop(0, "rgba(242,128,166,0.26)");
    fog.addColorStop(0.5, "rgba(232,133,185,0.12)");
    fog.addColorStop(0.82, "rgba(222,148,201,0.04)");
    fog.addColorStop(1, "rgba(242,148,185,0)");
    ctx.fillStyle = fog;
    ctx.fillRect(-40, -30, 90, 90);
    if (pulse > 0) {
      const hues = ["244,143,168", "232,156,201", "211,164,220"];
      hues.forEach((hue, index) => {
        const angle = index / hues.length * Math.PI * 2;
        const x = Math.cos(angle) * 9;
        const y = Math.sin(angle) * 9;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 27);
        glow.addColorStop(0, `rgba(${hue},${pulse * 0.2})`);
        glow.addColorStop(1, `rgba(${hue},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(x - 27, y - 27, 54, 54);
      });
    }
    ctx.save();
    ctx.scale(1 - pulse * 0.12, 1 - pulse * 0.08);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(1.2, 2.4);
    ctx.quadraticCurveTo(0.4, 0.1, 2.5, 1.5);
    ctx.lineTo(17.4, 11.2);
    ctx.quadraticCurveTo(19, 12.6, 16.8, 13);
    ctx.lineTo(11.7, 13.6);
    ctx.quadraticCurveTo(10.5, 13.8, 10, 14.9);
    ctx.lineTo(7.1, 21);
    ctx.quadraticCurveTo(6.1, 22.8, 5.5, 20.5);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(241,117,158,0.55)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 1;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.restore();
    if (label) {
      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
      const transform = ctx.getTransform();
      const viewport = ctx.canvas.width / (transform.a || 1);
      const viewportHeight = ctx.canvas.height / (transform.d || transform.a || 1);
      let text = label.slice(0, 60);
      const maxWidth = Math.max(0, viewport - 26);
      while (text.length > 1 && ctx.measureText(text).width > maxWidth) text = text.slice(0, -1);
      const width = Math.min(viewport - 8, ctx.measureText(text).width + 18);
      const left = Math.max(4 - point.x, Math.min(12, viewport - point.x - width - 4));
      const top = Math.max(4 - point.y, Math.min(16, viewportHeight - point.y - 32));
      ctx.beginPath();
      ctx.roundRect(left, top, width, 28, 14);
      ctx.fillStyle = "rgba(40,43,48,0.94)";
      ctx.shadowColor = "rgba(20,28,42,0.22)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.fillText(text, left + 9, top + 18);
    }
    ctx.restore();
  }
  return __toCommonJS(stdin_exports);
})();
