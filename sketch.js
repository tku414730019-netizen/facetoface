// ═══════════════════════════════════════════════════════════
//  Chapter 13 — 即時影像 + 臉部網格辨識
//  鏡像：預設開啟
// ═══════════════════════════════════════════════════════════

let capture;
let pulseT    = 0;
let camReady  = false;
let noiseTexture;

// ── ml5 FaceMesh ───────────────────────────────────────────
let faceMesh;
let faces     = [];
let triangles;

function preload() {
  faceMesh = ml5.faceMesh({ maxFaces: 1, flipped: false });
}

function gotFaces(results) {
  faces = results;
}

// ── setup ──────────────────────────────────────────────────
async function setup() {
  createCanvas(windowWidth, windowHeight);
  frameRate(60);
  textFont('serif');

  const hasCamera = await checkHasCamera();

  if (hasCamera) {
    capture = createCapture(VIDEO, () => {
      camReady  = true;
      faceMesh.detectStart(capture, gotFaces);
      triangles = faceMesh.getTriangles();
    });
    capture.size(windowWidth, windowHeight);
    capture.hide();

  } else {
    // 備用影片 fallback
    capture = createVideo('video.mp4');
    
    capture.hide();
    capture.loop();

    capture.elt.addEventListener('canplay', () => {
      if (!camReady) {
        capture.elt.play().catch(e => console.log('自動播放被阻擋:', e));
        camReady  = true;
        faceMesh.detectStart(capture, gotFaces);
        triangles = faceMesh.getTriangles();
      }
    }, { once: true });

    // 備用：800ms 後若還未觸發則強制嘗試
    setTimeout(() => {
      if (!camReady) {
        try {
          capture.play();
          camReady  = true;
          faceMesh.detectStart(capture, gotFaces);
          triangles = faceMesh.getTriangles();
        } catch(e) {}
      }
    }, 800);
  }

  noiseTexture = createGraphics(windowWidth, windowHeight);
  generateNoiseTexture();
}

// ── 偵測是否有攝影機 ────────────────────────────────────────
async function checkHasCamera() {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(d => d.kind === 'videoinput');
  } catch(e) { return false; }
}

// ── draw ───────────────────────────────────────────────────
function draw() {
  background('#297BB2');
  pulseT += 0.035;

  if (!camReady) { drawWaiting(); return; }
  if (capture.elt?.paused) { try { capture.play(); } catch(e){} }

  // 影像框定義（畫面中央 70%）
  const BOX_W = width  * 0.70;
  const BOX_H = height * 0.70;
  const BOX_X = (width  - BOX_W) / 2;
  const BOX_Y = (height - BOX_H) / 2;

  const vw = capture.width;
  const vh = capture.height;
  const { x, y, w, h } = fitKeepRatio(vw, vh, BOX_W, BOX_H, BOX_X, BOX_Y);

  // 光暈底框
  drawGlow(x, y, w, h);

  // 鏡像影像（capture 建立時已設 flipped: true）
  push();
  translate(x + w, y);
  scale(-1, 1);
  image(capture, 0, 0, w, h);
  pop();

  // 臉部網格
  drawFaceMesh(x, y, w, h, vw, vh);

  // 雜訊材質疊層
  push(); blendMode(MULTIPLY); image(noiseTexture, 0, 0, width, height); pop();

  // 影像外框
  noFill(); stroke(255, 255, 255, 80); strokeWeight(1); rect(x, y, w, h, 4);

  // 狀態列
  drawStatusBar();

  // 學號與名字
  noStroke(); fill(255); textAlign(CENTER); textSize(18); textFont('serif');
  text("414730019王曜嘉", width / 2, 50);
}

// ── 臉部網格繪製 ────────────────────────────────────────────
function drawFaceMesh(x, y, w, h, vw, vh) {
  if (faces.length === 0 || !triangles) return;

  const face = faces[0];
  capture.loadPixels();
  if (!capture.pixels || capture.pixels.length === 0) return;

  beginShape(TRIANGLES);
  for (let i = 0; i < triangles.length; i++) {
    const [a, b, c] = triangles[i];
    const pA = face.keypoints[a];
    const pB = face.keypoints[b];
    const pC = face.keypoints[c];

    // 三角形重心，用於採樣顏色
    const cx = (pA.x + pB.x + pC.x) / 3;
    const cy = (pA.y + pB.y + pC.y) / 3;
    const idx = (floor(cx) + floor(cy) * vw) * 4;
    const rr  = capture.pixels[idx]     || 0;
    const gg  = capture.pixels[idx + 1] || 0;
    const bb  = capture.pixels[idx + 2] || 0;

    stroke(255, 255, 0, 90);
    strokeWeight(1.8);
    fill(rr, gg, bb);

    // 映射到畫布框
    vertex(x + w - (pA.x / vw) * w, y + (pA.y / vh) * h);
    vertex(x + w - (pB.x / vw) * w, y + (pB.y / vh) * h);
    vertex(x + w - (pC.x / vw) * w, y + (pC.y / vh) * h);
  }
  endShape();
}

// ── 等待畫面 ───────────────────────────────────────────────
function drawWaiting() {
  const r = 12 + 4 * sin(pulseT * 2);
  noStroke();
  fill(255, 255, 255, 80 + 40 * sin(pulseT * 2));
  ellipse(width / 2, height / 2 - 20, r, r);
  fill(255, 255, 255, 160);
  textAlign(CENTER, CENTER); textFont('DM Mono, monospace'); textSize(14);
  text('鏡頭啟動中...', width / 2, height / 2 + 16);
}

// ── 光暈效果 ───────────────────────────────────────────────
function drawGlow(x, y, w, h) {
  const a = 30 + 15 * sin(pulseT);
  noStroke();
  for (let i = 3; i >= 1; i--) {
    fill(255, 255, 255, a * (i / 3) * 0.25);
    const p = i * 7;
    rect(x - p, y - p, w + p * 2, h + p * 2, 4 + p);
  }
}

// ── 狀態列 ─────────────────────────────────────────────────
function drawStatusBar() {
  noStroke(); fill(0, 0, 0, 38); rect(0, height - 46, width, 46);
  fill(255, 255, 255, 75);
  textAlign(LEFT, CENTER); textFont('DM Mono, monospace'); textSize(11);
  text(/Mobi|Android/i.test(navigator.userAgent) ? '📱 Mobile Camera' : '💻 Desktop Camera', 18, height - 23);
  fill(255, 255, 255, 140);
  textAlign(RIGHT, CENTER); textSize(12);
  text('🟢 Live', width - 18, height - 23);
}

// ── 雜訊材質 ───────────────────────────────────────────────
function generateNoiseTexture() {
  noiseTexture.loadPixels();
  for (let i = 0; i < noiseTexture.pixels.length; i += 4) {
    const v = random(255);
    noiseTexture.pixels[i]     = v;
    noiseTexture.pixels[i + 1] = v;
    noiseTexture.pixels[i + 2] = v;
    noiseTexture.pixels[i + 3] = random(15, 45);
  }
  noiseTexture.updatePixels();
}

// ── 比例保持（letterbox fit）──────────────────────────────
function fitKeepRatio(srcW, srcH, boxW, boxH, offsetX, offsetY) {
  const srcR = srcW / srcH, boxR = boxW / boxH;
  let w, h;
  if (srcR > boxR) { w = boxW; h = boxW / srcR; }
  else             { h = boxH; w = boxH * srcR; }
  return { x: offsetX + (boxW - w) / 2, y: offsetY + (boxH - h) / 2, w, h };
}

// ── 視窗縮放 ───────────────────────────────────────────────
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  noiseTexture = createGraphics(windowWidth, windowHeight);
  generateNoiseTexture();
}
