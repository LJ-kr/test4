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
  }, 1000);
});

// ====== "그림판으로 대충 따라 그린" 하찮은 그림 필터 ======
// 원리: 1) 사진을 큼직한 블록으로 뭉개서 픽셀아트처럼 뭉툭하게 만듦
//       2) 각 블록 색을 몇 가지 기본 크레용 색으로 강제 스냅 (미묘한 색 표현 불가 = 유치원생 느낌)
//       3) 블록마다 위치/크기를 살짝씩 어긋나게 칠해서 "선 밖으로 삐져나간" 느낌
//       4) 윤곽선은 두껍고 뚝뚝 끊기는 삐뚤빼뚤한 선으로, 군데군데 안 채워진 흰 여백도 남김
//       5) 구석에 삐뚤빼뚤한 낙서 사인까지 추가
function renderKidPaintStyle(srcCanvas, outCanvas) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  outCanvas.width = w;
  outCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d');
  const outCtx = outCanvas.getContext('2d');

  // --- 기본 크레용 팔레트 (전문적인 색 보정 없이 강제로 스냅) ---
  const PALETTE = [
    [250, 230, 200], // 살구색
    [255, 224, 130], // 노랑
    [255, 138, 101], // 주황
    [239, 83, 80],   // 빨강
    [186, 104, 200], // 보라
    [66, 133, 244],  // 파랑
    [77, 182, 172],  // 청록
    [129, 199, 132], // 초록
    [141, 110, 99],  // 갈색
    [66, 66, 66],    // 검정에 가까운 회색
    [250, 246, 236], // 종이색(흰색에 가까움)
  ];

  function nearestPaletteColor(r, g, b) {
    let best = PALETTE[0];
    let bestDist = Infinity;
    for (const c of PALETTE) {
      const dr = r - c[0], dg = g - c[1], db = b - c[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    return best;
  }

  // --- 1. 종이 배경 ---
  outCtx.fillStyle = '#faf6ec';
  outCtx.fillRect(0, 0, w, h);

  // --- 2. 큼직한 블록 단위로 뭉개고 팔레트에 스냅, 삐뚤빼뚤하게 색칠 ---
  const block = Math.max(10, Math.round(Math.min(w, h) / 26)); // 블록 크기 (클수록 더 하찮음)
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  const blockColors = []; // 윤곽선 계산용으로 저장
  const cols = Math.ceil(w / block);
  const rows = Math.ceil(h / block);

  for (let by = 0; by < rows; by++) {
    blockColors.push([]);
    for (let bx = 0; bx < cols; bx++) {
      const x0 = bx * block;
      const y0 = by * block;
      const x1 = Math.min(w, x0 + block);
      const y1 = Math.min(h, y0 + block);

      // 블록 평균색 계산 (샘플링으로 속도 확보)
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * w + x) * 4;
          r += srcData[i]; g += srcData[i + 1]; b += srcData[i + 2];
          n++;
        }
      }
      r = n ? r / n : 255; g = n ? g / n : 255; b = n ? b / n : 255;
      const snapped = nearestPaletteColor(r, g, b);
      blockColors[by].push(snapped);

      // 삐뚤빼뚤하게 칠하기: 위치/크기를 랜덤하게 어긋나게, 가끔은 아예 빼먹기(흰 여백)
      if (Math.random() < 0.94) {
        const jx = (Math.random() - 0.5) * block * 0.5;
        const jy = (Math.random() - 0.5) * block * 0.5;
        const jw = (x1 - x0) * (0.85 + Math.random() * 0.35);
        const jh = (y1 - y0) * (0.85 + Math.random() * 0.35);
        outCtx.fillStyle = `rgb(${snapped[0]}, ${snapped[1]}, ${snapped[2]})`;
        outCtx.fillRect(x0 + jx, y0 + jy, jw, jh);
      }
    }
  }

  // --- 3. 굵고 삐뚤빼뚤 끊기는 윤곽선 (블록 경계에서 색이 크게 바뀌는 곳만) ---
  outCtx.save();
  outCtx.strokeStyle = 'rgba(40,35,30,0.85)';
  outCtx.lineCap = 'round';
  outCtx.lineJoin = 'round';

  function colorDist(c1, c2) {
    const dr = c1[0] - c2[0], dg = c1[1] - c2[1], db = c1[2] - c2[2];
    return dr * dr + dg * dg + db * db;
  }

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const cur = blockColors[by][bx];
      const right = bx + 1 < cols ? blockColors[by][bx + 1] : null;
      const down = by + 1 < rows ? blockColors[by + 1][bx] : null;
      const x0 = bx * block, y0 = by * block;

      if (right && colorDist(cur, right) > 3000 && Math.random() < 0.8) {
        outCtx.lineWidth = 2.5 + Math.random() * 3;
        outCtx.beginPath();
        const sx = x0 + block + (Math.random() - 0.5) * 6;
        outCtx.moveTo(sx, y0 + (Math.random() - 0.5) * 6);
        outCtx.lineTo(sx + (Math.random() - 0.5) * 6, y0 + block + (Math.random() - 0.5) * 6);
        outCtx.stroke();
      }
      if (down && colorDist(cur, down) > 3000 && Math.random() < 0.8) {
        outCtx.lineWidth = 2.5 + Math.random() * 3;
        outCtx.beginPath();
        const sy = y0 + block + (Math.random() - 0.5) * 6;
        outCtx.moveTo(x0 + (Math.random() - 0.5) * 6, sy);
        outCtx.lineTo(x0 + block + (Math.random() - 0.5) * 6, sy + (Math.random() - 0.5) * 6);
        outCtx.stroke();
      }
    }
  }
  outCtx.restore();

  // --- 4. 화면 전체를 감싸는 삐뚤빼뚤한 외곽 테두리 (마우스로 대충 그린 액자) ---
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

  // --- 5. 구석에 삐뚤빼뚤한 낙서 사인 ---
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
