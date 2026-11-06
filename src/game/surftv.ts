// The beach TV's show: cartoon penguins surfing, drawn fresh every frame (original art).
export function drawSurfShow(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // sky and sun
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, "#ffb36a");
  sky.addColorStop(1, "#ffe2a8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff4c8";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.22, h * 0.11, 0, Math.PI * 2);
  ctx.fill();
  // distant swell
  ctx.fillStyle = "#3a9ac0";
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) ctx.lineTo(x, h * 0.5 + Math.sin(x * 0.04 + t * 1.2) * 3);
  ctx.lineTo(w, h);
  ctx.fill();
  // the big wave: a moving curl
  const crest = (x: number) => h * 0.52 + Math.sin((x - t * 70) * 0.03) * h * 0.09 + Math.sin((x - t * 40) * 0.07) * h * 0.03;
  ctx.fillStyle = "#1f78a8";
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 3) ctx.lineTo(x, crest(x));
  ctx.lineTo(w, h);
  ctx.fill();
  // foam along the crest
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 3) (x ? ctx.lineTo : ctx.moveTo).call(ctx, x, crest(x));
  ctx.stroke();
  // three surfers riding the face of the wave; one occasionally wipes out
  for (let i = 0; i < 3; i++) {
    const cycle = (t * 0.22 + i / 3) % 1;
    const x = -30 + cycle * (w + 60);
    const y = crest(x) - 4 + Math.sin(t * 3 + i) * 2;
    const tilt = Math.cos((x - t * 70) * 0.03) * 0.35;
    const wipe = i === 1 && cycle > 0.62 && cycle < 0.8;
    penguin(ctx, x, y, tilt, wipe ? (cycle - 0.62) * 30 : 0, ["#ff5a7a", "#ffd23a", "#5ad0a0"][i]);
  }
  // spray
  ctx.fillStyle = "rgba(255,255,255,.8)";
  for (let i = 0; i < 18; i++) {
    const x = (i * 53 + t * 90) % w;
    const y = crest(x) - ((t * 60 + i * 13) % 14);
    ctx.fillRect(x, y, 2, 2);
  }
  // a little scanline glow so it reads as a screen
  ctx.fillStyle = "rgba(0,0,0,.06)";
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

function penguin(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, spin: number, board: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt + spin);
  // surfboard
  ctx.fillStyle = board;
  ctx.beginPath();
  ctx.ellipse(0, 2, 22, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.fillRect(-18, 1, 36, 1.5);
  // body
  ctx.fillStyle = "#1e2228";
  ctx.beginPath();
  ctx.ellipse(0, -14, 9, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f6f2e8";
  ctx.beginPath();
  ctx.ellipse(2.5, -11, 5.5, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // flippers out for balance
  ctx.fillStyle = "#1e2228";
  ctx.beginPath();
  ctx.ellipse(-9, -14, 3, 9, -1.1, 0, Math.PI * 2);
  ctx.ellipse(9, -14, 3, 9, 1.1, 0, Math.PI * 2);
  ctx.fill();
  // eye, beak, feet
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(3, -23, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(3.6, -23, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2902a";
  ctx.beginPath();
  ctx.moveTo(7, -21);
  ctx.lineTo(13, -19.5);
  ctx.lineTo(7, -18);
  ctx.fill();
  ctx.fillRect(-5, -1, 4, 2);
  ctx.fillRect(2, -1, 4, 2);
  ctx.restore();
}

/** The King's signal: static, then a crowned silhouette and a message (once you've earned his attention). */
export function drawKingSignal(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // static
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 120 + 40;
    img.data[i] = v * 0.8;
    img.data[i + 1] = v * 0.95;
    img.data[i + 2] = v * 1.1;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // rolling bar
  const bar = ((t * 40) % (h + 30)) - 30;
  ctx.fillStyle = "rgba(200,230,255,.18)";
  ctx.fillRect(0, bar, w, 18);
  // the silhouette of a crowned penguin
  const cx = w / 2,
    cy = h * 0.55,
    s = h / 120;
  const flicker = 0.75 + 0.25 * Math.sin(t * 13);
  ctx.globalAlpha = flicker;
  ctx.fillStyle = "#0a1020";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 14 * s, 22 * s, 32 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - 22 * s, 15 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8c040";
  ctx.beginPath();
  ctx.moveTo(cx - 14 * s, cy - 34 * s);
  for (let i = 0; i <= 4; i++) {
    ctx.lineTo(cx - 14 * s + i * 7 * s, cy - 48 * s);
    ctx.lineTo(cx - 10.5 * s + i * 7 * s, cy - 38 * s);
  }
  ctx.lineTo(cx + 14 * s, cy - 34 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#9ae8ff";
  ctx.fillRect(cx - 2 * s, cy - 40 * s, 4 * s, 4 * s);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#dff4ff";
  ctx.font = `bold ${Math.round(9 * s)}px monospace`;
  ctx.textAlign = "center";
  const msg = Math.floor(t / 3) % 2 ? "WHERE THE ICE NEVER MELTS" : "COME FIND ME";
  ctx.fillText(msg, cx, h * 0.92);
}
