// ====== 요소 참조 ======
const video = document.getElementById('video');
const startCameraBtn = document.getElementById('start-camera');
const switchCameraBtn = document.getElementById('switch-camera');
const shootBtn = document.getElementById('shoot');
const cameraHint = document.getElementById('camera-hint');

const cameraStep = document.getElementById('camera-step');
const loadingStep = document.getElementById('loading-step');
const resultStep = document.getElementById('result-step');

const captureCanvas = document.getElementById('capture-canvas');
const loadingCanvas = document.getElementById('loading-canvas');
const resultCanvas = document.getElementById('result-canvas');
const originalImg = document.getElementById('original-img');

const compare = document.getElementById('compare');
const afterClip = document.getElementById('after-clip');
const sliderLine = document.getElementById('slider-line');
const range = document.getElementById('range');

const downloadBtn = document.getElementById('download');
const retryBtn = document.getElementById('retry');

let stream = null;
let currentFacing = 'user'; // 'user' = 전면(셀카), 'environment' = 후면

// ====== 단계 전환 ======
function showStep(step) {
  [cameraStep, loadingStep, resultStep].forEach(s => s.classList.remove('active'));
  step.classList.add('active');
}

// ====== 카메라 켜기 / 끄기 토글 ======
startCameraBtn.addEventListener('click', async () => {
  if (stream) {
    stopCamera();
  } else {
    await startCamera(currentFacing);
  }
});

// ====== 전면/후면 카메라 전환 ======
switchCameraBtn.addEventListener('click', async () => {
  currentFacing = currentFacing === 'user' ? 'environment' : 'user';
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    await startCamera(currentFacing);
  }
});

async function startCamera(facing = 'user') {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 720 }, height: { ideal: 540 } },
      audio: false
    });
    video.srcObject = stream;
    // 전면 카메라만 좌우 반전(거울 모드), 후면은 실제 시야 그대로
    video.classList.toggle('mirrored', facing === 'user');
    startCameraBtn.textContent = '카메라 끄기';
    shootBtn.disabled = false;
    switchCameraBtn.hidden = false;
    cameraHint.textContent = '준비되면 셔터를 눌러주세요';
  } catch (err) {
    cameraHint.textContent = '카메라 권한을 허용해주세요 (브라우저 설정을 확인해보세요)';
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  stream = null;
  video.srcObject = null;
  startCameraBtn.textContent = '카메라 켜기';
  shootBtn.disabled = true;
  switchCameraBtn.hidden = true;
  cameraHint.textContent = '카메라를 켜고 포즈를 잡아보세요';
}

// ====== 사진 찍기 ======
shootBtn.addEventListener('click', () => {
  const w = video.videoWidth || 720;
  const h = video.videoHeight || 540;
  captureCanvas.width = w;
  captureCanvas.height = h;
  const ctx = captureCanvas.getContext('2d');
  if (currentFacing === 'user') {
    // 전면 카메라는 셀피처럼 좌우반전 저장
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);

  originalImg.src = captureCanvas.toDataURL('image/png');

  // 로딩 화면에 원본을 흐릿하게 보여주며 변환 연출
  loadingCanvas.width = w;
  loadingCanvas.height = h;
  loadingCanvas.getContext('2d').drawImage(captureCanvas, 0, 0);

  showStep(loadingStep);

  // 연출용 짧은 딜레이 후 변환 (실제 처리는 즉시 끝남)
  setTimeout(() => {
    renderKidPaintStyle(captureCanvas, resultCanvas);
    showStep(resultStep);
    setSliderPosition(50);
  }, 900);
});

// ====== "그림판으로 대충 따라 그린" 하찮은 그림 필터 ======
// 원리: 1) 사진 축소본으로 k-평균 군집화를 돌려 "이 사진에 실제로 있는 색" 6~7가지를 뽑아냄
//         (고정된 색상표 대신 사진마다 맞는 색을 학습하므로 배경/옷 색이 엉뚱하게 안 변함)
//       2) 사진을 큼직한 블록으로 나눠 각 블록을 학습된 색 중 가장 가까운 것으로 칠함
//       3) 블록 위치/크기를 아주 살짝 흔들고, 색도 미세하게 흔들어 크레용 느낌 연출
//       4) 실제로 색이 다른 블록 경계에만 삐뚤빼뚤 끊기는 선을 그림 (억지로 다 긋지 않음)
//       5) 액자 테두리 + 구석 낙서 사인으로 마무리
function renderKidPaintStyle(srcCanvas, outCanvas) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  outCanvas.width = w;
  outCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d');
  const outCtx = outCanvas.getContext('2d');

  // --- 1. 축소본으로 k-평균 학습 (사진에서 실제 색 7가지 추출) ---
  const K = 7;
  const smallW = 120;
  const smallH = Math.max(1, Math.round(h * (smallW / w)));
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = smallW;
  smallCanvas.height = smallH;
  const smallCtx = smallCanvas.getContext('2d');
  smallCtx.drawImage(srcCanvas, 0, 0, smallW, smallH);
  const samplePixels = smallCtx.getImageData(0, 0, smallW, smallH).data;
  const centers = kMeansTrain(samplePixels, K, 6);

  function nearestCenterIndex(r, g, b) {
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < K; c++) {
      const dr = r - centers[c][0];
      const dg = g - centers[c][1];
      const db = b - centers[c][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    return best;
  }

  // --- 2. 종이 배경 ---
  outCtx.fillStyle = '#faf6ec';
  outCtx.fillRect(0, 0, w, h);

  // --- 3. 큼직한 블록 단위로 뭉개고 학습된 색으로 칠하기 (살짝만 삐뚤빼뚤하게) ---
  const block = Math.max(20, Math.round(Math.min(w, h) / 13));
  const srcData = srcCtx.getImageData(0, 0, w, h).data;
  const cols = Math.ceil(w / block);
  const rows = Math.ceil(h / block);
  const blockIdx = [];

  for (let by = 0; by < rows; by++) {
    blockIdx.push([]);
    for (let bx = 0; bx < cols; bx++) {
      const x0 = bx * block;
      const y0 = by * block;
      const x1 = Math.min(w, x0 + block);
      const y1 = Math.min(h, y0 + block);

      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * w + x) * 4;
          r += srcData[i]; g += srcData[i + 1]; b += srcData[i + 2];
          n++;
        }
      }
      r = n ? r / n : 255; g = n ? g / n : 255; b = n ? b / n : 255;
      const idx = nearestCenterIndex(r, g, b);
      blockIdx[by].push(idx);
      const cc = centers[idx];

      if (Math.random() < 0.985) {
        const jitter = (v) => Math.max(0, Math.min(255, v + (Math.random() - 0.5) * 20));
        const jx = (Math.random() - 0.5) * block * 0.14;
        const jy = (Math.random() - 0.5) * block * 0.14;
        const jw = (x1 - x0) * (0.97 + Math.random() * 0.08);
        const jh = (y1 - y0) * (0.97 + Math.random() * 0.08);
        outCtx.fillStyle = `rgb(${jitter(cc[0]) | 0}, ${jitter(cc[1]) | 0}, ${jitter(cc[2]) | 0})`;
        outCtx.fillRect(x0 + jx, y0 + jy, jw, jh);
      }
    }
  }

  // --- 4. 실제로 색이 다른 블록 경계에만 삐뚤빼뚤 끊기는 선 ---
  outCtx.save();
  outCtx.strokeStyle = 'rgba(40,35,30,0.85)';
  outCtx.lineCap = 'round';
  outCtx.lineJoin = 'round';

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const cur = blockIdx[by][bx];
      const x0 = bx * block, y0 = by * block;

      if (bx + 1 < cols && blockIdx[by][bx + 1] !== cur && Math.random() < 0.5) {
        outCtx.lineWidth = 1.6 + Math.random() * 1.8;
        outCtx.beginPath();
        const sx = x0 + block + (Math.random() - 0.5) * 5;
        outCtx.moveTo(sx, y0 + (Math.random() - 0.5) * 5);
        outCtx.lineTo(sx + (Math.random() - 0.5) * 5, y0 + block + (Math.random() - 0.5) * 5);
        outCtx.stroke();
      }
      if (by + 1 < rows && blockIdx[by + 1][bx] !== cur && Math.random() < 0.5) {
        outCtx.lineWidth = 1.6 + Math.random() * 1.8;
        outCtx.beginPath();
        const sy = y0 + block + (Math.random() - 0.5) * 5;
        outCtx.moveTo(x0 + (Math.random() - 0.5) * 5, sy);
        outCtx.lineTo(x0 + block + (Math.random() - 0.5) * 5, sy + (Math.random() - 0.5) * 5);
        outCtx.stroke();
      }
    }
  }
  outCtx.restore();

  // --- 5. 화면 전체를 감싸는 삐뚤빼뚤한 외곽 테두리 ---
  outCtx.save();
  outCtx.strokeStyle = 'rgba(40,35,30,0.7)';
  outCtx.lineWidth = 4;
  outCtx.lineJoin = 'round';
  outCtx.beginPath();
  const wob = () => (Math.random() - 0.5) * 8;
  outCtx.moveTo(4 + wob(), 4 + wob());
  outCtx.lineTo(w - 4 + wob(), 6 + wob());
  outCtx.lineTo(w - 6 + wob(), h - 4 + wob());
  outCtx.lineTo(6 + wob(), h - 6 + wob());
  outCtx.closePath();
  outCtx.stroke();
  outCtx.restore();

  // --- 6. 구석에 삐뚤빼뚤한 낙서 사인 ---
  outCtx.save();
  outCtx.strokeStyle = 'rgba(40,35,30,0.6)';
  outCtx.lineWidth = 2;
  outCtx.lineCap = 'round';
  const sx0 = w - 70, sy0 = h - 26;
  outCtx.beginPath();
  outCtx.moveTo(sx0, sy0);
  for (let i = 1; i <= 6; i++) {
    outCtx.lineTo(sx0 + i * 10 + (Math.random() - 0.5) * 6, sy0 + (Math.random() - 0.5) * 14);
  }
  outCtx.stroke();
  outCtx.restore();
}

// ---- k-평균 학습 (RGB 공간, 사진 축소본에서 실제 색 추출) ----
function kMeansTrain(pixelData, k, iterations) {
  const points = [];
  for (let i = 0; i < pixelData.length; i += 4) {
    points.push([pixelData[i], pixelData[i + 1], pixelData[i + 2]]);
  }
  const centers = [];
  const stride = Math.max(1, Math.floor(points.length / k));
  for (let i = 0; i < k; i++) {
    centers.push(points[Math.min(points.length - 1, i * stride)].slice());
  }

  for (let iter = 0; iter < iterations; iter++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (const p of points) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const dr = p[0] - centers[c][0];
        const dg = p[1] - centers[c][1];
        const db = p[2] - centers[c][2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; best = c; }
      }
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      sums[best][3] += 1;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centers[c][0] = sums[c][0] / sums[c][3];
        centers[c][1] = sums[c][1] / sums[c][3];
        centers[c][2] = sums[c][2] / sums[c][3];
      }
    }
  }
  return centers;
}

// ====== 비교 슬라이더 ======
function setSliderPosition(percent) {
  afterClip.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
  sliderLine.style.left = percent + '%';
  range.value = percent;
}

range.addEventListener('input', (e) => setSliderPosition(Number(e.target.value)));

let dragging = false;
compare.addEventListener('pointerdown', (e) => { dragging = true; updateFromPointer(e); });
window.addEventListener('pointermove', (e) => { if (dragging) updateFromPointer(e); });
window.addEventListener('pointerup', () => dragging = false);

function updateFromPointer(e) {
  const rect = compare.getBoundingClientRect();
  let percent = ((e.clientX - rect.left) / rect.width) * 100;
  percent = Math.max(0, Math.min(100, percent));
  setSliderPosition(percent);
}

// ====== 저장 ======
downloadBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = '하찮은-그림.png';
  link.href = resultCanvas.toDataURL('image/png');
  link.click();
});

// ====== 다시 찍기 ======
retryBtn.addEventListener('click', () => {
  showStep(cameraStep);
});
