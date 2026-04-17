/* ====================================================================  
   app.js – Cholecystectomy Incision Annotation  
   Async final-frame extraction: canvas appears independently of playback.  
   Matches index.html element IDs exactly.  
   ==================================================================== */

(function () {  
  "use strict";

  /* ------------------------------------------------------------------ */  
  /*  CLIPS – pulled from clip-config.js (expects window.CLIP_URLS)     */  
  /* ------------------------------------------------------------------ */  
  const CLIPS = window.CLIP_URLS || [];

  /* ------------------------------------------------------------------ */  
  /*  STATE                                                              */  
  /* ------------------------------------------------------------------ */  
  let currentClipIndex = 0;  
  let annotationLine = null;       // { x1, y1, x2, y2 } normalised 0-1  
  let drawing = false;  
  let startPt = null;  
  let frameReady = false;  
  let clipFullyWatched = false;  
  let seekVideo = null;            // hidden video for frame extraction

  /* ------------------------------------------------------------------ */  
  /*  DOM REFS  (matching index.html IDs exactly)                       */  
  /* ------------------------------------------------------------------ */  
  // --- Section 1: Participant Info ---  
  const emailInput       = document.getElementById("participantIdInput");  
  const ageInput         = document.getElementById("ageInput");  
  const genderSelect     = document.getElementById("genderInput");  
  const levelSelect      = document.getElementById("levelInput");  
  const specialtyInput   = document.getElementById("specialtyInput");  
  const yearsInput       = document.getElementById("yearsPracticeInput");  
  const aiSelect         = document.getElementById("familiarityInput");  
  const alertSelect      = document.getElementById("fatigueInput");

  // --- Section 2: Video ---  
  const videoEl          = document.getElementById("caseVideo");  
  const replayBtn        = document.getElementById("replayBtn");  
  const videoStatus      = document.getElementById("videoStatus");

  // --- Section 3: Annotation ---  
  const canvasContainer  = document.getElementById("canvasContainer");  
  const frameCanvas      = document.getElementById("finalFrame");  
  const drawCanvas       = document.getElementById("annotationCanvas");  
  const frameCtx         = frameCanvas.getContext("2d");  
  const drawCtx          = drawCanvas.getContext("2d");  
  const clearBtn         = document.getElementById("clearLineBtn");  
  const annotationStatus = document.getElementById("annotationStatus");

  // --- Section 4: Submit ---  
  const submitBtn        = document.getElementById("submitAnnotationBtn");  
  const submissionStatus = document.getElementById("submissionStatus");

  // --- Section 5: Confidence ---  
  const confidenceSection = document.getElementById("confidenceSection");  
  const confidenceSelect  = document.getElementById("confidenceInput");  
  const confidenceBtn     = document.getElementById("submitConfidenceBtn");

  // --- Done ---  
  const completionCard   = document.getElementById("completionCard");

  // --- Toast ---  
  const toastTemplate    = document.getElementById("toastTemplate");  
  let toastEl = null;

  /* ------------------------------------------------------------------ */  
  /*  TOAST                                                              */  
  /* ------------------------------------------------------------------ */  
  function showToast(msg, duration) {  
    duration = duration || 3000;  
    if (!toastEl) {  
      toastEl = toastTemplate.content.cloneNode(true).querySelector(".toast");  
      document.body.appendChild(toastEl);  
    }  
    toastEl.textContent = msg;  
    toastEl.classList.add("toast--visible");  
    clearTimeout(toastEl._timer);  
    toastEl._timer = setTimeout(function () {  
      toastEl.classList.remove("toast--visible");  
    }, duration);  
  }

  /* ------------------------------------------------------------------ */  
  /*  UTILITIES                                                          */  
  /* ------------------------------------------------------------------ */  
  function pointerPos(e, rect) {  
    var src = e.touches ? e.touches[0] : e;  
    return {  
      x: (src.clientX - rect.left) / rect.width,  
      y: (src.clientY - rect.top) / rect.height  
    };  
  }

  function debounce(fn, ms) {  
    var t;  
    return function () {  
      clearTimeout(t);  
      t = setTimeout(fn, ms);  
    };  
  }

  /* ------------------------------------------------------------------ */  
  /*  DRAWING                                                            */  
  /* ------------------------------------------------------------------ */  
  function renderAnnotation() {  
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);  
    if (!annotationLine) return;  
    var x1 = annotationLine.x1 * drawCanvas.width;  
    var y1 = annotationLine.y1 * drawCanvas.height;  
    var x2 = annotationLine.x2 * drawCanvas.width;  
    var y2 = annotationLine.y2 * drawCanvas.height;  
    drawCtx.save();  
    drawCtx.strokeStyle = "#00ff41";  
    drawCtx.lineWidth = Math.max(2, drawCanvas.width * 0.005);  
    drawCtx.lineCap = "round";  
    drawCtx.shadowColor = "rgba(0,255,65,0.6)";  
    drawCtx.shadowBlur = 6;  
    drawCtx.beginPath();  
    drawCtx.moveTo(x1, y1);  
    drawCtx.lineTo(x2, y2);  
    drawCtx.stroke();  
    drawCtx.restore();  
  }

  function updateSubmitBtn() {  
    submitBtn.disabled = !annotationLine;  
    if (annotationLine) {  
      submissionStatus.textContent = "Annotation ready. You may submit.";  
    } else {  
      submissionStatus.textContent = "Draw the incision on the frozen frame to enable submission.";  
    }  
  }

  /* ------------------------------------------------------------------ */  
  /*  ASYNC FINAL-FRAME EXTRACTION                                      */  
  /* ------------------------------------------------------------------ */  
  function extractFinalFrame(src) {  
    frameReady = false;  
    annotationLine = null;  
    canvasContainer.hidden = true;  
    clearBtn.disabled = true;  
    annotationStatus.textContent = "Preparing final frame…";  
    annotationStatus.classList.add("frame-status");

    // Tear down previous seekVideo  
    if (seekVideo) {  
      seekVideo.pause();  
      seekVideo.removeAttribute("src");  
      seekVideo.load();  
      if (seekVideo.parentNode) seekVideo.parentNode.removeChild(seekVideo);  
    }

    seekVideo = document.createElement("video");  
    seekVideo.crossOrigin = "anonymous";  
    seekVideo.preload = "auto";  
    seekVideo.muted = true;  
    seekVideo.playsInline = true;  
    seekVideo.setAttribute("playsinline", "");  
    // Off-screen  
    seekVideo.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;";  
    document.body.appendChild(seekVideo);

    seekVideo.addEventListener("loadedmetadata", function onMeta() {  
      seekVideo.removeEventListener("loadedmetadata", onMeta);  
      var target = Math.max(0, seekVideo.duration - 0.1);  
      seekVideo.currentTime = target;  
    });

    seekVideo.addEventListener("seeked", function onSeeked() {  
      seekVideo.removeEventListener("seeked", onSeeked);  
      paintFinalFrame();  
    });

    // Handle errors  
    seekVideo.addEventListener("error", function onErr() {  
      seekVideo.removeEventListener("error", onErr);  
      annotationStatus.textContent = "⚠ Could not extract final frame. Try reloading.";  
      annotationStatus.classList.remove("frame-status");  
      console.error("seekVideo error:", seekVideo.error);  
    });

    seekVideo.src = src;  
    seekVideo.load();  
  }

  function paintFinalFrame() {  
    if (!seekVideo) return;  
    var w = seekVideo.videoWidth || 640;  
    var h = seekVideo.videoHeight || 360;

    // Size both canvases to native resolution  
    frameCanvas.width = w;  
    frameCanvas.height = h;  
    drawCanvas.width = w;  
    drawCanvas.height = h;

    // Paint the frozen frame onto the background canvas  
    frameCtx.drawImage(seekVideo, 0, 0, w, h);

    // Show the container  
    frameReady = true;  
    canvasContainer.hidden = false;  
    clearBtn.disabled = false;  
    annotationStatus.textContent = "Final frame ready. Draw your incision line above.";  
    annotationStatus.classList.remove("frame-status");  
    updateSubmitBtn();  
  }

  /* ------------------------------------------------------------------ */  
  /*  CANVAS POINTER EVENTS  (mouse + touch, mobile-safe)               */  
  /* ------------------------------------------------------------------ */  
  function onPointerDown(e) {  
    if (!frameReady) return;  
    e.preventDefault();  
    var rect = drawCanvas.getBoundingClientRect();  
    startPt = pointerPos(e, rect);  
    drawing = true;  
    annotationLine = null;  
    renderAnnotation();  
  }

  function onPointerMove(e) {  
    if (!drawing || !startPt) return;  
    e.preventDefault();  
    var rect = drawCanvas.getBoundingClientRect();  
    var cur = pointerPos(e, rect);  
    annotationLine = { x1: startPt.x, y1: startPt.y, x2: cur.x, y2: cur.y };  
    renderAnnotation();  
  }

  function onPointerUp() {  
    if (!drawing) return;  
    drawing = false;  
    renderAnnotation();  
    updateSubmitBtn();  
  }

  drawCanvas.addEventListener("mousedown", onPointerDown);  
  drawCanvas.addEventListener("mousemove", onPointerMove);  
  drawCanvas.addEventListener("mouseup", onPointerUp);  
  drawCanvas.addEventListener("mouseleave", onPointerUp);  
  drawCanvas.addEventListener("touchstart", onPointerDown, { passive: false });  
  drawCanvas.addEventListener("touchmove", onPointerMove, { passive: false });  
  drawCanvas.addEventListener("touchend", onPointerUp);  
  drawCanvas.addEventListener("touchcancel", onPointerUp);

  clearBtn.addEventListener("click", function () {  
    annotationLine = null;  
    renderAnnotation();  
    updateSubmitBtn();  
  });

  /* ------------------------------------------------------------------ */  
  /*  RESIZE                                                             */  
  /* ------------------------------------------------------------------ */  
  window.addEventListener("resize", debounce(function () {  
    if (frameReady) renderAnnotation();  
  }, 200));

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
    canvasContainer.hidden = true;  
    submitBtn.disabled = true;  
    confidenceSection.hidden = true;  
    replayBtn.disabled = true;  
    videoStatus.textContent = "Loading clip…";

    var src = CLIPS[index];

    // 1) Playback video  
    videoEl.src = src;  
    videoEl.load();  
    videoEl.play().catch(function () {});

    // 2) Simultaneously extract final frame (async, no waiting)  
    extractFinalFrame(src);  
  }

  videoEl.addEventListener("loadeddata", function () {  
    videoStatus.textContent = "Playing clip " + (currentClipIndex + 1) + " of " + CLIPS.length + "…";  
    replayBtn.disabled = false;  
  });

  videoEl.addEventListener("ended", function () {  
    clipFullyWatched = true;  
    videoStatus.textContent = "Clip finished. You may replay or annotate below.";  
  });

  videoEl.addEventListener("error", function () {  
    videoStatus.textContent = "⚠ Error loading clip. Check the URL or your connection.";  
    console.error("Video error:", videoEl.error);  
  });

  replayBtn.addEventListener("click", function () {  
    videoEl.currentTime = 0;  
    videoEl.play().catch(function () {});  
  });

  /* ------------------------------------------------------------------ */  
  /*  SUBMIT ANNOTATION                                                  */  
  /* ------------------------------------------------------------------ */  
  submitBtn.addEventListener("click", function () {  
    if (!annotationLine) return;

    // Basic validation  
    var email = emailInput.value.trim();  
    if (!email) {  
      showToast("Please enter your email first.");  
      emailInput.focus();  
      return;  
    }

    var payload = {  
      email: email,  
      age: ageInput.value,  
      gender: genderSelect.value,  
      level: levelSelect.value,  
      specialty: specialtyInput.value,  
      years: yearsInput.value,  
      aiUsage: aiSelect.value,  
      alertness: alertSelect.value,  
      clipIndex: currentClipIndex,  
      clipSrc: CLIPS[currentClipIndex],  
      annotation: annotationLine,  
      clipFullyWatched: clipFullyWatched,  
      timestamp: new Date().toISOString()  
    };

    console.log("Annotation payload:", payload);

    // -------- Replace with your actual submission logic --------  
    // fetch("/api/submit", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) })  
    // ----------------------------------------------------------

    showToast("Annotation saved ✓");  
    submissionStatus.textContent = "Submitted! Now answer the confidence question.";

    // Show confidence question  
    confidenceSection.hidden = false;  
    confidenceSelect.value = "";  
    confidenceSection.scrollIntoView({ behavior: "smooth" });  
  });

  /* ------------------------------------------------------------------ */  
  /*  SUBMIT CONFIDENCE                                                  */  
  /* ------------------------------------------------------------------ */  
  confidenceBtn.addEventListener("click", function () {  
    var conf = confidenceSelect.value;  
    if (!conf) {  
      showToast("Please select a confidence level.");  
      return;  
    }

    console.log("Confidence:", conf, "for clip", currentClipIndex);

    // -------- Send confidence alongside earlier payload if needed --------

    showToast("Moving to next clip…");

    // Next clip  
    loadClip(currentClipIndex + 1);  
    window.scrollTo({ top: 0, behavior: "smooth" });  
  });

  /* ------------------------------------------------------------------ */  
  /*  DONE                                                               */  
  /* ------------------------------------------------------------------ */  
  function showDone() {  
    // Hide the working sections  
    var cards = document.querySelectorAll("main.layout > .card");  
    cards.forEach(function (c) { c.hidden = true; });  
    // Show completion  
    completionCard.hidden = false;  
    showToast("All clips completed – thank you!");  
  }

  /* ------------------------------------------------------------------ */  
  /*  INIT                                                               */  
  /* ------------------------------------------------------------------ */  
  if (CLIPS.length) {  
    loadClip(0);  
  } else {  
    annotationStatus.textContent = "No clips configured. Add URLs to clip-config.js.";  
    annotationStatus.classList.remove("frame-status");  
    videoStatus.textContent = "No clips to load.";  
    console.warn("CLIPS array is empty. Set window.CLIP_URLS in clip-config.js.");  
  }

})();  
