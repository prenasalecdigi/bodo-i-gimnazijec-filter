// Overlay slika mora biti v isti mapi kot index.html (repo root)
const OVERLAY_URL = "gimnazijec.png";

// 16:9 izhod
const OUT_W = 1280;
const OUT_H = 720;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: true });

const btnStart = document.getElementById("btnStart");
const btnSnap = document.getElementById("btnSnap");
const btnDownload = document.getElementById("btnDownload");
const btnReset = document.getElementById("btnReset");
const statusEl = document.getElementById("status");

canvas.width = OUT_W;
canvas.height = OUT_H;

let stream = null;

// overlay
const overlayImg = new Image();
overlayImg.src = OVERLAY_URL;

// zajeta slika (frame) iz videa
let faceImg = null;

// transformacija zajete slike
let faceX = OUT_W * 0.5;
let faceY = OUT_H * 0.45;
let faceScale = 1.0;

// pointer state (drag/pinch)
let pointers = new Map();
let isDragging = false;
let lastPointer = null;
let lastPinchDist = null;

btnSnap.disabled = true;
btnDownload.disabled = true;

function setStatus(text){ statusEl.textContent = text; }

function stopStream(){
  if (stream){
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

async function startCamera(){
  stopStream();
  setStatus("Zaganjam kamero…");

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false
  });

  video.srcObject = stream;
  await video.play();

  btnSnap.disabled = false;
  setStatus("Kamera pripravljena");
  renderLoop();
}

function renderLoop(){
  drawComposite();
  requestAnimationFrame(renderLoop);
}

function drawComposite(){
  ctx.clearRect(0, 0, OUT_W, OUT_H);

  // 1) live video v 16:9 (cover)
  drawVideoCover(video, ctx, OUT_W, OUT_H);

  // 2) zajeta slika (premična/zoom)
  if (faceImg){
    const w = faceImg.width * faceScale;
    const h = faceImg.height * faceScale;
    ctx.drawImage(faceImg, faceX - w/2, faceY - h/2, w, h);
  }

  // 3) overlay png (z luknjo)
  if (overlayImg.complete && overlayImg.naturalWidth){
    ctx.drawImage(overlayImg, 0, 0, OUT_W, OUT_H);
  }
}

function drawVideoCover(videoEl, c, W, H){
  const vw = videoEl.videoWidth || 0;
  const vh = videoEl.videoHeight || 0;
  if (!vw || !vh) return;

  const videoAR = vw / vh;
  const canvasAR = W / H;

  let sx, sy, sw, sh;
  if (videoAR > canvasAR) {
    sh = vh;
    sw = vh * canvasAR;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    sw = vw;
    sh = vw / canvasAR;
    sx = 0;
    sy = (vh - sh) / 2;
  }
  c.drawImage(videoEl, sx, sy, sw, sh, 0, 0, W, H);
}

function captureFaceFrame(){
  // zajemi trenutno sliko videa v 16:9 okvir
  const tmp = document.createElement("canvas");
  tmp.width = OUT_W;
  tmp.height = OUT_H;
  const tctx = tmp.getContext("2d");
  drawVideoCover(video, tctx, OUT_W, OUT_H);

  const img = new Image();
  img.onload = () => {
    faceImg = img;

    // začetne nastavitve (lahko kasneje fino nastavimo na tvojo “luknjo”)
    faceX = OUT_W * 0.5;
    faceY = OUT_H * 0.43;
    faceScale = 1.12;

    btnDownload.disabled = false;
    setStatus("Obraz zajet – poravnaj in prenesi");
  };
  img.src = tmp.toDataURL("image/png");
}

function downloadPNG(){
  const dataURL = canvas.toDataURL("image/png");

  // poskusi download
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = "bodoči-gimnazijec.png";
  document.body.appendChild(a);
  a.click();
  a.remove();

  // iOS fallback (če download ne steče): odpri v novem zavihku
  // uporabnik potem shrani sliko: Share → Save Image
  setTimeout(() => {
    // Če želiš vedno odpirati na iOS: odkomentiraj naslednjo vrstico
    // window.open(dataURL, "_blank");
  }, 200);
}

function resetAll(){
  faceImg = null;
  faceScale = 1.0;
  faceX = OUT_W * 0.5;
  faceY = OUT_H * 0.45;
  btnDownload.disabled = true;
  setStatus("Ponastavljeno");
}

// Events
btnStart.addEventListener("click", async () => {
  try {
    await startCamera();
  } catch (e){
    console.error(e);
    alert("Kamera ni dostopna. Preveri dovoljenja za kamero in da je stran odprta preko HTTPS.\n\n" + e.message);
    setStatus("Napaka kamere");
  }
});

btnSnap.addEventListener("click", captureFaceFrame);
btnDownload.addEventListener("click", downloadPNG);
btnReset.addEventListener("click", resetAll);

// Drag + pinch
canvas.addEventListener("pointerdown", (e) => {
  if (!faceImg) return; // premikanje šele po zajemu
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1){
    isDragging = true;
    lastPointer = { x: e.clientX, y: e.clientY };
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!faceImg) return;
  if (!pointers.has(e.pointerId)) return;

  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  const rect = canvas.getBoundingClientRect();
  const scaleX = OUT_W / rect.width;
  const scaleY = OUT_H / rect.height;

  if (pointers.size === 1 && isDragging && lastPointer){
    const dx = (e.clientX - lastPointer.x) * scaleX;
    const dy = (e.clientY - lastPointer.y) * scaleY;
    faceX += dx;
    faceY += dy;
    lastPointer = { x: e.clientX, y: e.clientY };
  }

  if (pointers.size === 2){
    const pts = Array.from(pointers.values());
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

    if (lastPinchDist != null){
      const factor = dist / lastPinchDist;
      faceScale *= factor;
      faceScale = Math.max(0.25, Math.min(4.0, faceScale));
    }
    lastPinchDist = dist;
  }
});

canvas.addEventListener("pointerup", (e) => {
  pointers.delete(e.pointerId);

  if (pointers.size === 0){
    isDragging = false;
    lastPointer = null;
    lastPinchDist = null;
  }

  if (pointers.size === 1){
    const pt = Array.from(pointers.values())[0];
    lastPointer = { x: pt.x, y: pt.y };
    lastPinchDist = null;
  }
});

// wheel zoom (desktop)
canvas.addEventListener("wheel", (e) => {
  if (!faceImg) return;
  e.preventDefault();
  const delta = Math.sign(e.deltaY);
  const zoom = (delta > 0) ? 0.95 : 1.05;
  faceScale *= zoom;
  faceScale = Math.max(0.25, Math.min(4.0, faceScale));
}, { passive: false });

// Če se overlay ne naloži, naj vsaj opozori v konzoli
overlayImg.addEventListener("error", () => {
  console.warn("Overlay PNG se ni naložil. Preveri, da je datoteka 'gimnazijec.png' v repo root in pravilno poimenovana.");
});

