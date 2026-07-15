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

// ====== "삐뚤빼뚤한 손그림 선" 필터 ======
// 원리: 원본 사진의 색은 그대로 두고, 윤곽선만 굵고 삐뚤빼뚤하게 여러 겹 겹쳐서
//       마치 사진을 보고 손으로 대충 따라 그린 것처럼 보이게 합니다.
function renderKidPaintStyle(srcCanvas, outCanvas) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  outCanvas.width = w;
  outCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d');
  const outCtx = outCanvas.getContext('2d');

  // --- 1. 원본 사진을 색 보정 없이 그대로 베이스로 사용 ---
  outCtx.drawImage(srcCanvas, 0, 0, w, h);

  // --- 2. 그레이스케일 + Sobel 엣지로 윤곽 추출 ---
  const srcData = srcCtx.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * srcData[i * 4] + 0.587 * srcData[i * 4 + 1] + 0.114 * srcData[i * 4 + 2];
  }
  const edge = new Uint8ClampedArray(w * h);
  const gxK = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyK = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = gray[(y + dy) * w + (x + dx)];
          gx += v * gxK[k];
          gy += v * gyK[k];
          k++;
        }
      }
      edge[y * w + x] = Math.sqrt(gx * gx + gy * gy) > 75 ? 255 : 0;
    }
  }

  const edgeCanvas = document.createElement('canvas');
  edgeCanvas.width = w;
  edgeCanvas.height = h;
  const edgeCtx = edgeCanvas.getContext('2d');
  const edgeImg = edgeCtx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    edgeImg.data[i * 4] = 35;
    edgeImg.data[i * 4 + 1] = 30;
    edgeImg.data[i * 4 + 2] = 25;
    edgeImg.data[i * 4 + 3] = edge[i] ? 255 : 0;
  }
  edgeCtx.putImageData(edgeImg, 0, 0);

  // --- 3. 윤곽선을 여러 겹, 살짝씩 어긋나고 회전된 채로 겹쳐 그려서 손떨림 느낌 연출 ---
  outCtx.save();
  outCtx.globalAlpha = 0.55;
  const passes = 4;
  for (let i = 0; i < passes; i++) {
    const dx = (Math.random() - 0.5) * 5;
    const dy = (Math.random() - 0.5) * 5;
    const angle = (Math.random() - 0.5) * 0.02;
    outCtx.save();
    outCtx.translate(w / 2 + dx, h / 2 + dy);
    outCtx.rotate(angle);
    outCtx.translate(-w / 2, -h / 2);
    outCtx.drawImage(edgeCanvas, 0, 0, w, h);
    outCtx.restore();
  }
  outCtx.restore();

  // --- 4. 화면 전체를 감싸는 삐뚤빼뚤한 외곽 테두리 ---
  outCtx.save();
  outCtx.strokeStyle = 'rgba(35,30,25,0.75)';
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
  outCtx.strokeStyle = 'rgba(35,30,25,0.6)';
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
