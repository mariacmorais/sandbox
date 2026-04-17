/*  app.js – Cholecystectomy Incision Annotation  
    Final-frame extraction is now ASYNC: the canvas appears as soon as  
    the browser has enough video data, regardless of playback position.  */

(function () {  
  "use strict";

  /* ------------------------------------------------------------------ */  
  /*  CONFIG                                                             */  
  /* ------------------------------------------------------------------ */  
  const CLIPS = [  
    // Add your clip URLs / paths here  
    // e.g. "clips/clip1.mp4", "clips/clip2.mp4"  
  ];

  /* ------------------------------------------------------------------ */  
  /*  STATE                                                              */  
  /* ------------------------------------------------------------------ */  
  let currentClipIndex = 0;  
  let annotationLine = null;       // { x1, y1, x2, y2 } normalised 0-1  
  let drawing = false;  
  let startPt = null;  
  let frameReady = false;  
  let clipFullyWatched = false;

  /* ------------------------------------------------------------------ */  
  /*  DOM REFS                                                           */  
  /* ------------------------------------------------------------------ */  
  const emailInput        = document.getElementById("email");  
  const ageInput          = document.getElementById("age");  
  const genderSelect      = document.getElementById("gender");  
  const levelSelect       = document.getElementById("level");  
  const specialtyInput    = document.getElementById("specialty");  
  const yearsInput        = document.getElementById("years");  
  const aiSelect          = document.getElementById("ai-usage");  
  const alertSelect       = document.getElementById("alertness");

  const videoEl           = document.getElementById("clip-video");  
  const replayBtn         = document.getElementById("replay-btn");

  const canvasWrap        = document.getElementById("canvas-wrap");  
  const canvas            = document.getElementById("annotation-canvas");  
  const ctx               = canvas.getContext("2d");  
  const clearBtn          = document.getElementById("clear-btn");  
  const frameStatus       = document.getElementById("frame-status");

  const submitBtn         = document.getElementById("submit-btn");  
  const confidenceSection = document.getElementById("confidence-section");  
  const confidenceInputs  = document.querySelectorAll('input[name="confidence"]');  
  const confidenceBtn     = document.getElementById("confidence-btn");  
  const doneSection       = document.getElementById("done-section");

  /* Hidden off-screen video used ONLY for seeking to the last frame */  
  let seekVideo = null;

  /* ------------------------------------------------------------------ */  
  /*  UTILITIES                                                          */  
  /* ------------------------------------------------------------------ */  
  function pointerPos(e, rect) {  
    const touch = e.touches ? e.touches[0] : e;  
    return {  
      x: (touch.clientX - rect.left) / rect.width,  
      y: (touch.clientY - rect.top) / rect.height,  
    };  
  }

  function drawLine() {  
    ctx.clearRect(0, 0, canvas.width, canvas.height);  
    // Redraw the frozen frame  
    if (seekVideo) {  
      ctx.drawImage(seekVideo, 0, 0, canvas.width, canvas.height);  
    }  
    if (!annotationLine) return;  
    const { x1, y1, x2, y2 } = annotationLine;  
    ctx.save();  
    ctx.strokeStyle = "#00ff41";  
    ctx.lineWidth = Math.max(2, canvas.width * 0.005);  
    ctx.lineCap = "round";  
    ctx.shadowColor = "rgba(0,255,65,0.6)";  
    ctx.shadowBlur = 6;  
    ctx.beginPath();  
    ctx.moveTo(x1 * canvas.width, y1 * canvas.height);  
    ctx.lineTo(x2 * canvas.width, y2 * canvas.height);  
    ctx.stroke();  
    ctx.restore();  
  }

  function updateSubmitBtn() {  
    submitBtn.disabled = !annotationLine;  
  }

  /* ------------------------------------------------------------------ */  
  /*  FINAL-FRAME EXTRACTION  (async – independent of playback)         */  
  /* ------------------------------------------------------------------ */  
  function extractFinalFrame(src) {  
    frameReady = false;  
    annotationLine = null;  
    canvasWrap.style.display = "none";  
    frameStatus.textContent = "Preparing final frame…";  
    frameStatus.style.display = "block";

    // Create a separate video element solely for seeking  
    if (seekVideo) {  
      seekVideo.pause();  
      seekVideo.removeAttribute("src");  
      seekVideo.load();  
    }  
    seekVideo = document.createElement("video");  
    seekVideo.crossOrigin = "anonymous";  
    seekVideo.preload = "auto";  
    seekVideo.muted = true;  
    seekVideo.playsInline = true;  
    // Keep it off-screen  
    seekVideo.style.position = "fixed";  
    seekVideo.style.left = "-9999px";  
    seekVideo.style.top = "-9999px";  
    seekVideo.style.width = "1px";  
    seekVideo.style.height = "1px";  
    document.body.appendChild(seekVideo);

    seekVideo.src = src;

    seekVideo.addEventListener("loadedmetadata", function onMeta() {  
      seekVideo.removeEventListener("loadedmetadata", onMeta);  
      // Seek to ~0.1 s before end to grab the last visible frame  
      const target = Math.max(0, seekVideo.duration - 0.1);  
      seekVideo.currentTime = target;  
    });

    seekVideo.addEventListener("seeked", function onSeeked() {  
      seekVideo.removeEventListener("seeked", onSeeked);  
      showFinalFrame();  
    });

    seekVideo.load();  
  }

  function showFinalFrame() {  
    if (!seekVideo) return;  
    // Size canvas to video's natural dimensions (CSS will scale it)  
    canvas.width = seekVideo.videoWidth || 640;  
    canvas.height = seekVideo.videoHeight || 360;  
    ctx.drawImage(seekVideo, 0, 0, canvas.width, canvas.height);

    frameReady = true;  
    frameStatus.style.display = "none";  
    canvasWrap.style.display = "block";  
    updateSubmitBtn();  
  }

  /* ------------------------------------------------------------------ */  
  /*  CANVAS INTERACTION  (touch + mouse, mobile-friendly)              */  
  /* ------------------------------------------------------------------ */  
  function onPointerDown(e) {  
    if (!frameReady) return;  
    e.preventDefault();  
    const rect = canvas.getBoundingClientRect();  
    startPt = pointerPos(e, rect);  
    drawing = true;  
    annotationLine = null;  
    drawLine();  
  }

  function onPointerMove(e) {  
    if (!drawing || !startPt) return;  
    e.preventDefault();  
    const rect = canvas.getBoundingClientRect();  
    const cur = pointerPos(e, rect);  
    annotationLine = {  
      x1: startPt.x,  
      y1: startPt.y,  
      x2: cur.x,  
      y2: cur.y,  
    };  
    drawLine();  
  }

  function onPointerUp(e) {  
    if (!drawing) return;  
    drawing = false;  
    if (annotationLine) {  
      drawLine();  
    }  
    updateSubmitBtn();  
  }

  canvas.addEventListener("mousedown", onPointerDown);  
  canvas.addEventListener("mousemove", onPointerMove);  
  canvas.addEventListener("mouseup", onPointerUp);  
  canvas.addEventListener("mouseleave", onPointerUp);

  canvas.addEventListener("touchstart", onPointerDown, { passive: false });  
  canvas.addEventListener("touchmove", onPointerMove, { passive: false });  
  canvas.addEventListener("touchend", onPointerUp);  
  canvas.addEventListener("touchcancel", onPointerUp);

  clearBtn.addEventListener("click", function () {  
    annotationLine = null;  
    drawLine();  
    updateSubmitBtn();  
  });

  /* ------------------------------------------------------------------ */  
  /*  RESIZE HANDLING  (keeps canvas sharp on orientation change, etc.)  */  
  /* ------------------------------------------------------------------ */  
  function onResize() {  
    if (!frameReady) return;  
    // Canvas CSS size is handled by CSS (max-width:100%), but we  
    // need to re-render at the correct internal resolution.  
    drawLine();  
  }  
  window.addEventListener("resize", debounce(onResize, 200));

  function debounce(fn, ms) {  
    let t;  
    return function () {  
      clearTimeout(t);  
      t = setTimeout(fn, ms);  
    };  
  }

  /* ------------------------------------------------------------------ */  
  /*  CLIP LOADING                                                       */  
  /* ------------------------------------------------------------------ */  
  function loadClip(index) {  
    if (index >= CLIPS.length) {  
      showDone();  
      return;  
    }  
    currentClipIndex = index;  
    clipFullyWatched = false;  
    annotationLine = null;  
    frameReady = false;  
    canvasWrap.style.display = "none";  
    submitBtn.disabled = true;  
    confidenceSection.style.display = "none";

    const src = CLIPS[index];

    // 1) Start playback video  
    videoEl.src = src;  
    videoEl.load();  
    videoEl.play().catch(() => {});

    // 2) Simultaneously kick off final-frame extraction  
    extractFinalFrame(src);  
  }

  videoEl.addEventListener("ended", function () {  
    clipFullyWatched = true;  
  });

  replayBtn.addEventListener("click", function () {  
    videoEl.currentTime = 0;  
    videoEl.play().catch(() => {});  
  });

  /* ------------------------------------------------------------------ */  
  /*  SUBMIT                                                             */  
  /* ------------------------------------------------------------------ */  
  submitBtn.addEventListener("click", function () {  
    if (!annotationLine) return;

    const payload = {  
      email: emailInput.value.trim(),  
      age: ageInput.value,  
      gender: genderSelect.value,  
      level: levelSelect.value,  
      specialty: specialtyInput ? specialtyInput.value : "",  
      years: yearsInput ? yearsInput.value : "",  
      aiUsage: aiSelect.value,  
      alertness: alertSelect.value,  
      clipIndex: currentClipIndex,  
      clipSrc: CLIPS[currentClipIndex],  
      annotation: annotationLine,   // normalised 0-1  
      timestamp: new Date().toISOString(),  
    };

    console.log("Annotation payload:", payload);

    // ------- Replace with your actual submission logic -------  
    // e.g. fetch("/api/submit", { method:"POST", body: JSON.stringify(payload) })  
    // --------------------------------------------------------

    // Show confidence question  
    confidenceSection.style.display = "block";  
    confidenceSection.scrollIntoView({ behavior: "smooth" });  
  });

  confidenceBtn.addEventListener("click", function () {  
    let conf = null;  
    confidenceInputs.forEach((r) => {  
      if (r.checked) conf = r.value;  
    });  
    if (!conf) {  
      alert("Please select a confidence level.");  
      return;  
    }

    console.log("Confidence:", conf, "for clip", currentClipIndex);

    // ------- Send confidence alongside earlier payload if needed -------

    // Move to next clip  
    loadClip(currentClipIndex + 1);  
  });

  /* ------------------------------------------------------------------ */  
  /*  DONE                                                               */  
  /* ------------------------------------------------------------------ */  
  function showDone() {  
    document.getElementById("step-video").style.display = "none";  
    document.getElementById("step-annotate").style.display = "none";  
    document.getElementById("step-submit").style.display = "none";  
    confidenceSection.style.display = "none";  
    doneSection.style.display = "block";  
  }

  /* ------------------------------------------------------------------ */  
  /*  INIT                                                               */  
  /* ------------------------------------------------------------------ */  
  if (CLIPS.length) {  
    loadClip(0);  
  } else {  
    frameStatus.textContent =  
      "No clips configured. Add URLs to the CLIPS array in app.js.";  
    frameStatus.style.display = "block";  
  }  
})();  
