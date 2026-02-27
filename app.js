(() => {
  const CONFIG = window.PHOTOBOOTH_CONFIG || { GAS_POST_URL: "" };

  // UI
  const framesEl = document.getElementById("frames");
  const frameOverlay = document.getElementById("frameOverlay");
  const video = document.getElementById("video");
  const chipDot = document.getElementById("chipDot");
  const chipText = document.getElementById("chipText");
  const flashEl = document.getElementById("flash");
  const countdownEl = document.getElementById("countdown");

  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");

  const modal = document.getElementById("modal");
  const stripPreview = document.getElementById("stripPreview");
  const downloadBtn = document.getElementById("downloadBtn");
  const emailInput = document.getElementById("emailInput");
  const emailBtn = document.getElementById("emailBtn");
  const startOverBtn = document.getElementById("startOverBtn");

  // Settings
  const SHOTS = 3;
  const COUNTDOWN_SECONDS = 3;

  // Frames (replace filenames with your real assets)
  const FRAMES = [
    { name: "Gathering Classic", src: "assets/frames/frame-gathering-classic.png" },
    { name: "Killough Maroon",   src: "assets/frames/frame-killough-maroon.png" },
    { name: "Farmers Night",     src: "assets/frames/frame-farmers-night.png" },
    { name: "Texas Star",        src: "assets/frames/frame-texas-star.png" },
  ];

  let selectedFrame = 0;
  let stream = null;
  let stripDataUrl = "";
  let busy = false;

  function setChip(state, text) {
    chipText.textContent = text;
    chipDot.classList.remove("ok", "warn", "bad");
    chipDot.classList.add(state);
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function flash() {
    flashEl.style.transition = "none";
    flashEl.style.opacity = 0.9;
    requestAnimationFrame(() => {
      flashEl.style.transition = "opacity 220ms ease";
      flashEl.style.opacity = 0;
    });
  }

  function showCountdown(n) {
    countdownEl.style.opacity = 1;
    countdownEl.textContent = String(n);
  }

  function hideCountdown() {
    countdownEl.style.opacity = 0;
    countdownEl.textContent = "";
  }

  function buildFramePicker() {
    framesEl.innerHTML = "";
    FRAMES.forEach((f, i) => {
      const card = document.createElement("div");
      card.className = "frameCard" + (i === selectedFrame ? " selected" : "");
      card.addEventListener("click", () => setFrame(i));

      const thumb = document.createElement("div");
      thumb.className = "frameThumb";
      const img = document.createElement("img");
      img.src = f.src;
      thumb.appendChild(img);

      const name = document.createElement("div");
      name.className = "frameName";
      name.textContent = f.name;

      card.appendChild(thumb);
      card.appendChild(name);
      framesEl.appendChild(card);
    });
  }

  function setFrame(i) {
    selectedFrame = i;
    frameOverlay.src = FRAMES[i].src;
    [...document.querySelectorAll(".frameCard")].forEach((el, idx) => {
      el.classList.toggle("selected", idx === i);
    });
  }

  async function ensureCamera() {
    if (stream) return true;

    try {
      // Request AFTER user gesture (Start) for iOS/Chrome reliability
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      video.srcObject = stream;

      await new Promise(resolve => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      resetBtn.disabled = false;
      setChip("ok", "Camera ready");
      return true;
    } catch (e) {
      console.error(e);
      setChip("bad", "Camera blocked");
      alert("Camera blocked. Allow camera for this site, then refresh.");
      return false;
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function captureWithOverlay() {
    // wait for video dimensions
    if (!video.videoWidth || !video.videoHeight) {
      await sleep(200);
    }
    const w = video.videoWidth;
    const h = video.videoHeight;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    // mirror capture to match preview
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    // draw overlay
    const overlay = await loadImage(FRAMES[selectedFrame].src);
    ctx.drawImage(overlay, 0, 0, w, h);

    return canvas.toDataURL("image/png", 0.92);
  }

  async function buildPhotoStrip(images) {
    const loaded = await Promise.all(images.map(loadImage));

    const stripW = 900;
    const photoW = stripW;
    const photoH = Math.round(photoW * (loaded[0].height / loaded[0].width));
    const gap = 20, headerH = 120, footerH = 160;

    const totalH = headerH + (photoH * loaded.length) + (gap * (loaded.length - 1)) + footerH;

    const c = document.createElement("canvas");
    c.width = stripW;
    c.height = totalH;
    const ctx = c.getContext("2d");

    // Background
    ctx.fillStyle = "#0b0b10";
    ctx.fillRect(0, 0, c.width, c.height);

    // Header
    ctx.fillStyle = "#6b1020";
    ctx.fillRect(0, 0, stripW, headerH);
    ctx.fillStyle = "#fff";
    ctx.font = "900 52px Arial";
    ctx.fillText("THE GATHERING", 28, 68);
    ctx.font = "900 36px Arial";
    ctx.fillText("ON SUMMIT • LHS KILLOUGH", 28, 108);

    // Photos
    let y = headerH;
    for (let i = 0; i < loaded.length; i++) {
      ctx.drawImage(loaded[i], 0, y, photoW, photoH);
      y += photoH + gap;
    }

    // Footer
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, c.height - footerH, stripW, footerH);
    ctx.fillStyle = "#fff";
    ctx.font = "900 34px Arial";
    ctx.fillText("GATHERING ON SUMMIT 2026", 28, c.height - 92);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "700 22px Arial";
    ctx.fillText(new Date().toLocaleString(), 28, c.height - 52);

    // Border
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, c.width - 24, c.height - 24);

    return c.toDataURL("image/png", 0.92);
  }

  function openResult(dataUrl) {
    stripDataUrl = dataUrl;
    stripPreview.src = dataUrl;
    modal.style.display = "flex";
  }

  function closeResult() {
    modal.style.display = "none";
  }

  function startOver() {
    closeResult();
    stripDataUrl = "";
    stripPreview.src = "";
    emailInput.value = "";
    setChip(stream ? "ok" : "warn", stream ? "Camera ready" : "Tap Start");
  }

  function downloadStrip() {
    if (!stripDataUrl) return;
    const a = document.createElement("a");
    a.href = stripDataUrl;
    a.download = `GOS_PhotoStrip_${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    a.click();
  }

  async function emailStrip() {
    if (!CONFIG.GAS_POST_URL) {
      alert("Email is not configured. Add your Apps Script URL in config.js.");
      return;
    }
    const email = emailInput.value.trim();
    if (!email) {
      alert("Enter your email.");
      return;
    }
    if (!stripDataUrl) return;

    emailBtn.disabled = true;
    setChip("warn", "Sending email…");

    // POSTing cross-domain can trigger CORS. We use no-cors so it still sends.
    // You won’t be able to read the response in the browser, but the email will send.
    const payload = { email, pngDataUrl: stripDataUrl };

    try {
      await fetch(CONFIG.GAS_POST_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });

      setChip("ok", "Email sent (check inbox)");
      alert("Sent! Check your email.");
    } catch (e) {
      console.error(e);
      setChip("bad", "Email failed");
      alert("Email failed. Check the console or your Apps Script deployment access.");
    } finally {
      emailBtn.disabled = false;
    }
  }

  async function startSession() {
    if (busy) return;
    busy = true;

    const ok = await ensureCamera();
    if (!ok) { busy = false; return; }

    setChip("warn", "Capturing…");
    startBtn.disabled = true;

    const shots = [];

    for (let s = 1; s <= SHOTS; s++) {
      for (let t = COUNTDOWN_SECONDS; t >= 1; t--) {
        showCountdown(t);
        await sleep(900);
      }
      hideCountdown();
      flash();
      shots.push(await captureWithOverlay());
      await sleep(450);
    }

    setChip("warn", "Building strip…");
    const strip = await buildPhotoStrip(shots);
    openResult(strip);

    setChip("ok", "Done");
    startBtn.disabled = false;
    busy = false;
  }

  // Wire up buttons
  startBtn.addEventListener("click", startSession);
  resetBtn.addEventListener("click", startOver);
  downloadBtn.addEventListener("click", downloadStrip);
  emailBtn.addEventListener("click", emailStrip);
  startOverBtn.addEventListener("click", startOver);

  // Init
  buildFramePicker();
  setFrame(0);
  setChip("warn", "Tap Start");
})();
