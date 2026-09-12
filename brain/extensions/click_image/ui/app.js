/**
 * Click Image - Camera Web UI Controller
 * Zero emojis, rich features: live stream, filters, timer, photo gallery, download & clipboard.
 */

(function () {
  const videoFeed = document.getElementById("videoFeed");
  const canvas = document.getElementById("captureCanvas");
  const ctx = canvas.getContext("2d");
  const snapBtn = document.getElementById("snapBtn");
  const cameraSelect = document.getElementById("cameraSelect");
  const filterSelect = document.getElementById("filterSelect");
  const timerSelect = document.getElementById("timerSelect");
  const mirrorToggle = document.getElementById("mirrorToggle");
  const flashOverlay = document.getElementById("flashOverlay");
  const countdownOverlay = document.getElementById("countdownOverlay");
  const galleryGrid = document.getElementById("galleryGrid");
  const galleryCount = document.getElementById("galleryCount");
  const clearGalleryBtn = document.getElementById("clearGalleryBtn");
  const downloadAllBtn = document.getElementById("downloadAllBtn");
  const cameraStatus = document.getElementById("cameraStatus");

  let currentStream = null;
  let photos = [];
  let isCapturing = false;

  // Initialize Camera
  async function initCamera(deviceId = null) {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }

    cameraStatus.textContent = "Initializing camera...";
    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      currentStream = stream;
      videoFeed.srcObject = stream;
      cameraStatus.textContent = "LIVE";
      await listCameras();
    } catch (err) {
      console.warn("Camera init error or fallback:", err);
      cameraStatus.textContent = "Standby / Preview";
      createPlaceholderFeed();
    }
  }

  // List available video input devices
  async function listCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      
      const currentSelected = cameraSelect.value;
      cameraSelect.innerHTML = "";
      
      if (videoDevices.length === 0) {
        cameraSelect.innerHTML = '<option value="">Default Camera</option>';
        return;
      }

      videoDevices.forEach((dev, idx) => {
        const opt = document.createElement("option");
        opt.value = dev.deviceId;
        opt.textContent = dev.label || `Camera ${idx + 1}`;
        if (dev.deviceId === currentSelected) opt.selected = true;
        cameraSelect.appendChild(opt);
      });
    } catch (err) {
      console.warn("Cannot enumerate devices:", err);
    }
  }

  // Fallback procedural canvas feed if no physical webcam is plugged in / allowed
  function createPlaceholderFeed() {
    if (videoFeed.srcObject) return;
    
    const fallbackCanvas = document.createElement("canvas");
    fallbackCanvas.width = 640;
    fallbackCanvas.height = 480;
    const fctx = fallbackCanvas.getContext("2d");

    function renderMockFrame() {
      fctx.fillStyle = "#16161e";
      fctx.fillRect(0, 0, 640, 480);

      // Grid lines
      fctx.strokeStyle = "rgba(122, 162, 247, 0.15)";
      fctx.lineWidth = 1;
      for (let x = 0; x < 640; x += 40) {
        fctx.beginPath();
        fctx.moveTo(x, 0);
        fctx.lineTo(x, 480);
        fctx.stroke();
      }
      for (let y = 0; y < 480; y += 40) {
        fctx.beginPath();
        fctx.moveTo(0, y);
        fctx.lineTo(640, y);
        fctx.stroke();
      }

      // Center crosshair
      fctx.strokeStyle = "#7aa2f7";
      fctx.lineWidth = 2;
      fctx.beginPath();
      fctx.arc(320, 240, 60, 0, Math.PI * 2);
      fctx.stroke();

      fctx.fillStyle = "#c0caf5";
      fctx.font = "14px monospace";
      fctx.textAlign = "center";
      fctx.fillText("FLUFFY CAMERA TEST PATTERN", 320, 235);
      fctx.fillStyle = "#7982a9";
      fctx.font = "11px monospace";
      fctx.fillText(new Date().toISOString(), 320, 260);

      const stream = fallbackCanvas.captureStream(30);
      videoFeed.srcObject = stream;
    }

    setInterval(renderMockFrame, 100);
  }

  // Trigger snapshot capture with countdown
  async function triggerCapture() {
    if (isCapturing) return;
    const delaySec = parseInt(timerSelect.value, 10) || 0;

    if (delaySec > 0) {
      isCapturing = true;
      snapBtn.disabled = true;
      countdownOverlay.style.display = "block";

      for (let i = delaySec; i > 0; i--) {
        countdownOverlay.textContent = i;
        await new Promise((r) => setTimeout(r, 1000));
      }

      countdownOverlay.style.display = "none";
      isCapturing = false;
      snapBtn.disabled = false;
    }

    captureSnapshot();
  }

  // Real capture routine
  function captureSnapshot() {
    const videoWidth = videoFeed.videoWidth || 640;
    const videoHeight = videoFeed.videoHeight || 480;

    canvas.width = videoWidth;
    canvas.height = videoHeight;

    // Flash animation
    flashOverlay.classList.add("active");
    setTimeout(() => flashOverlay.classList.remove("active"), 150);

    const isMirrored = !videoFeed.classList.contains("no-mirror");
    const activeFilter = filterSelect.value;

    ctx.save();
    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    // Apply canvas CSS filter string
    let canvasFilter = "none";
    if (activeFilter === "filter-bw") canvasFilter = "grayscale(100%) contrast(120%)";
    else if (activeFilter === "filter-cyber") canvasFilter = "hue-rotate(140deg) saturate(200%) contrast(110%)";
    else if (activeFilter === "filter-contrast") canvasFilter = "contrast(160%) brightness(105%)";
    else if (activeFilter === "filter-sepia") canvasFilter = "sepia(85%) contrast(110%)";
    else if (activeFilter === "filter-warm") canvasFilter = "saturate(140%) brightness(105%) sepia(20%)";

    ctx.filter = canvasFilter;
    ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/png");
    const photoItem = {
      id: "photo_" + Date.now(),
      dataUrl,
      time: new Date().toLocaleTimeString(),
      resolution: `${videoWidth}x${videoHeight}`,
    };

    photos.unshift(photoItem);
    renderGallery();
  }

  // Render gallery cards
  function renderGallery() {
    galleryCount.textContent = `${photos.length} captured`;

    if (photos.length === 0) {
      galleryGrid.innerHTML = `
        <div class="empty-gallery">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <div>No photos captured yet.<br>Click "Capture Snapshot" to take one.</div>
        </div>
      `;
      return;
    }

    galleryGrid.innerHTML = "";
    photos.forEach((photo) => {
      const card = document.createElement("div");
      card.className = "photo-card";
      card.innerHTML = `
        <div class="photo-thumb-wrap">
          <img src="${photo.dataUrl}" class="photo-thumb" alt="Captured photo">
        </div>
        <div class="photo-meta">
          <span>${photo.time} (${photo.resolution})</span>
          <div class="photo-actions">
            <button class="photo-action-btn download" title="Download Image">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            <button class="photo-action-btn delete" title="Delete">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      // Event handlers
      card.querySelector(".download").addEventListener("click", () => downloadPhoto(photo));
      card.querySelector(".delete").addEventListener("click", () => {
        photos = photos.filter((p) => p.id !== photo.id);
        renderGallery();
      });

      galleryGrid.appendChild(card);
    });
  }

  function downloadPhoto(photo) {
    const a = document.createElement("a");
    a.href = photo.dataUrl;
    a.download = `fluffy_photo_${photo.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Event Listeners
  snapBtn.addEventListener("click", triggerCapture);

  cameraSelect.addEventListener("change", (e) => {
    initCamera(e.target.value);
  });

  filterSelect.addEventListener("change", (e) => {
    videoFeed.className = e.target.value;
    if (mirrorToggle.dataset.mirrored === "false") {
      videoFeed.classList.add("no-mirror");
    }
  });

  mirrorToggle.addEventListener("click", () => {
    const isMirrored = mirrorToggle.dataset.mirrored !== "false";
    if (isMirrored) {
      mirrorToggle.dataset.mirrored = "false";
      videoFeed.classList.add("no-mirror");
      mirrorToggle.textContent = "Mirror: Off";
    } else {
      mirrorToggle.dataset.mirrored = "true";
      videoFeed.classList.remove("no-mirror");
      mirrorToggle.textContent = "Mirror: On";
    }
  });

  clearGalleryBtn.addEventListener("click", () => {
    photos = [];
    renderGallery();
  });

  downloadAllBtn.addEventListener("click", () => {
    photos.forEach((photo) => downloadPhoto(photo));
  });

  // Start initialization
  initCamera();
  renderGallery();
})();
