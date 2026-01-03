// 1) Nastavi URL tvoje PNG maske (16:9, z prosojnim obrazom)
const OVERLAY_URL = "https://tvoj-domen.si/gimnazija.png";

const video = document.getElementById("video");
const canvas = document.getElementById("preview");
const ctx = canvas.getContext("2d");

const startCamBtn = document.getElementById("startCam");
const snapBtn = document.getElementById("snap");
const downloadBtn = document.getElementById("download");
const resetBtn = document.getElementById("reset");

let stream = null;

// overlay (tvoja slika gimnazija)
const overlayImg = new Image();
overlayImg.crossOrigin = "anonymous"; // pomaga, če hosting dovoljuje CORS
overlayImg.src = OVERLAY_URL;

// selfie (zajet kader iz kamere)
let faceImg = null;

// transformacija obraza (premik + zoom)
let faceX = canvas.width * 0.5;
let faceY = canvas.height * 0.5;
let faceScale = 1.0;

// drag/pinch state
let isDragging = false;
let lastPointer = null;
let pointers = new Map();
let lastPinchDist = null;

// osnovne gumbe
snapBtn.disabled = true;
downloadBtn.disabled = true;

function stopStream() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

async function startCamera() {
  stopStream();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  snapBtn.disabled = false;
  renderLoop();
}

function renderLoop(){
  // riši stalno (da vidiš live + overlay)
  drawComposite();
  requestAnimationFrame(renderLoop);
}

function drawComposite(){
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  // 1) ozadje: live kamera
  // "cover" v canvasu
  drawVideoCover(video, ctx, W, H);

  // 2) če imamo zajet obraz: riši ga čez video, da ga lahko nastavljaš
  if (faceImg){
    const w = faceImg.width * faceScale;
    const h = faceImg.height * faceScale;
    ctx.drawImage(faceImg, faceX - w/2, faceY - h/2, w, h);
  }

  // 3) overlay maska (tvoja PNG z luknjo)
  if (overlayImg.complete && overlayImg.naturalWidth){
    ctx.drawImage(overlayImg, 0, 0, W, H);
  }

  // mali napis (opcijsko)
  ctx.save();
  ctx.font = "22px system-ui";
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText("Grm Novo mesto – biotehniška gimnazija", 24, H - 28);
  ctx.restore();
}

function drawVideoCover(videoEl, c, W, H){
  const vw = videoEl.videoWidth || 1280;
  const vh = videoEl.videoHeight || 720;
  if (!vw || !vh) return;

  const videoAR = vw / vh;
  const canvasAR = W / H;

  let sx, sy, sw, sh;
  if (videoAR > canvasAR) {
    // video širši -> odreži levo/desno
    sh = vh;
    sw = vh * canvasAR;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    // video višji -> odreži gor/dol
    sw = vw;
    sh = vw / canvasAR;
    sx = 0;
    sy = (vh - sh) / 2;
  }
  c.drawImage(videoEl, sx, sy, sw, sh, 0, 0, W, H);
}

function captureFace(){
  // naredimo posnetek trenutnega videa v začasen canvas, in ga pretvorimo v sliko
  const tmp = document.createElement("canvas");
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  const tctx = tmp.getContext("2d");

  // zajemi video "cover" (enako kot prikaz)
  drawVideoCover(video, tctx, tmp.width, tmp.height);

  const img = new Image();
  img.onload = () => {
    faceImg = img;

    // start nastavitve: sredina + malo večji zoom
    faceX = canvas.width * 0.5;
    faceY = canvas.height * 0.42;
    faceScale = 1.1;

    downloadBtn.disabled = false;
  };
  img.src = tmp.toDataURL("image/png");
}

function downloadImage(){
  // final render (že je v canvasu)
  const dataURL = canvas.toDataURL("image/png");

  // download (Android/desktop OK; iOS včasih odpre v nov zavihek)
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = "bodoči-gimnazijec.png";
  document.body.appendChild(a);
  a.click();
  a.remove();

  // fallback za iOS: odpri sliko v novem zavihku
  // (če download ne deluje, uporabnik dolgo pritisne -> Save Image)
  // window.open(dataURL, "_blank");
}

function reset(){
  faceImg = null;
  faceScale = 1.0;
  faceX = canvas.width * 0.5;
  faceY = canvas.height * 0.5;
  downloadBtn.disabled = true;
}

startCamBtn.addEventListener("click", async () => {
  try { await startCamera(); }
  catch(e){
    alert("Kamera ni dostopna. Preveri dovoljenja ali ali si na HTTPS strani.\n\n" + e.message);
  }
});

snapBtn.addEventListener("click", captureFace);
downloadBtn.addEventListener("click", downloadImage);
resetBtn.addEventListener("click", reset);

// -----------------------------
// Interakcija: drag + zoom
// -----------------------------
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pointers.size === 1){
    isDragging = true;
    lastPointer = {x:e.clientX, y:e.clientY};
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!faceImg) return;

  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});

  if (pointers.size === 1 && isDragging && lastPointer){
    const dx = e.clientX - lastPointer.x;
    const dy = e.clientY - lastPointer.y;

    // pretvori iz CSS px -> canvas px (ker je canvas responsive)
    const scaleX = canvas.width / canvas.getBoundingClientRect().width;
    const scaleY = canvas.height / canvas.getBoundingClientRect().height;

    faceX += dx * scaleX;
    faceY += dy * scaleY;

    lastPointer = {x:e.clientX, y:e.clientY};
  }

  if (pointers.size === 2){
    const pts = Array.from(pointers.values());
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (lastPinchDist != null){
      const factor = dist / lastPinchDist;
      faceScale *= factor;
      faceScale = Math.max(0.3, Math.min(3.0, faceScale));
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
    // preklop iz pinch nazaj na drag
    const pt = Array.from(pointers.values())[0];
    lastPointer = {x: pt.x, y: pt.y};
    lastPinchDist = null;
  }
});

canvas.addEventListener("wheel", (e) => {
  if (!faceImg) return;
  e.preventDefault();
  const delta = Math.sign(e.deltaY);
  // wheel gor -> zoom in
  const zoom = (delta > 0) ? 0.95 : 1.05;
  faceScale *= zoom;
  faceScale = Math.max(0.3, Math.min(3.0, faceScale));
}, {passive:false});

// -----------------------------
// QR koda (opcijsko) - uporabi qrcodejs
// V JSFiddle: External Resources dodaj:
// https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
// -----------------------------
function makeQR(){
  if (typeof QRCode === "undefined") return;
  const url = window.location.href;
  document.getElementById("qrcode").innerHTML = "";
  new QRCode(document.getElementById("qrcode"), {
    text: url,
    width: 180,
    height: 180
  });
}
makeQR();
