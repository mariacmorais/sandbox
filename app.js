/* ====================================================================  
   app.js – Cholecystectomy Incision Annotation  
   • Reads clips from window.ANNOTATION_CLIPS (clip-config.js)  
   • Async final-frame extraction (independent of playback)  
   • Submits to Formspree via window.ANNOTATION_SUBMISSION  
   • Mobile-friendly touch + mouse drawing  
   ==================================================================== */

(function () {  
  "use strict";

  /* ------------------------------------------------------------------ */  
  /*  CLIPS & SUBMISSION CONFIG  (from clip-config.js)                  */  
  /* ------------------------------------------------------------------ */  
  var CLIPS = window.ANNOTATION_CLIPS || [];  
  var SUBMIT_CFG = window.ANNOTATION_SUBMISSION || null;

  /* ------------------------------------------------------------------ */  
  /*  STATE                                                              */  
  /* ------------------------------------------------------------------ */  
  var currentClipIndex = 0;  
  var annotationLine = null;       // { x1, y1, x2, y2 } normalised 0-1  
  var drawing = false;  
  var startPt = null;  
  var frameReady = false;  
  var clipFullyWatched = false;  
  var seekVideo = null;            // hidden <video> for frame extraction  
  var lastPayload = null;          // stored so confidence can be appended

  /* ------------------------------------------------------------------ */  
  /*  DOM REFS  (matching index.html IDs)                               */  
  /* ------------------------------------------------------------------ */  
  var emailInput       = document.getElementById("participantIdInput");  
  var ageInput         = document.getElementById("ageInput");  
  var genderSelect     = document.getElementById("genderInput");  
  var levelSelect      = document.getElementById("levelInput");  
  var specialtyInput   = document.getElementById("specialtyInput");  
  var yearsInput       = document.getElementById("yearsPracticeInput");  
  var aiSelect         = document.getElementById("familiarityInput");  
  var alertSelect      = document.getElementById("fatigueInput");  
  var participantStatus = document.getElementById("participantIdStatus");

  var videoEl          = document.getElementById("caseVideo");  
  var replayBtn        = document.getElementById("replayBtn");  
  var videoStatus      = document.getElementById("videoStatus");

  var canvasContainer  = document.getElementById("canvasContainer");  
  var frameCanvas      = document.getElementById("finalFrame");  
  var drawCanvas       = document.getElementById("annotationCanvas");  
  var frameCtx         = frameCanvas.getContext("2d");  
  var drawCtx          = drawCanvas.getContext("2d");  
  var clearBtn         = document.getElementById("clearLineBtn");  
  var annotationStatus = document.getElementById("annotationStatus");

  var submitBtn        = document.getElementById("submitAnnotationBtn");  
  var submissionStatus = document.getElementById("submissionStatus");

  var confidenceSection = document.getElementById("confidenceSection");  
  var confidenceSelect  = document.getElementById("confidenceInput");  
  var confidenceBtn     = document.getElementById("submitConfidenceBtn");

  var completionCard   = document.getElementById("completionCard");

  var toastTemplate    = document.getElementById("toastTemplate");  
  var toastEl = null;

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

  function clipSrc(index) {  
    var c = CLIPS[index];  
    return c ? c.src : "";  
  }

  function clipId(index) {  
    var c = CLIPS[index];  
    return c ? (c.id || c.label || ("clip_" + index)) : "";  
  }

  function clipLabel(index) {  
    var c = CLIPS[index];  
    return c ? (c.label || c.id || ("Clip " + (index + 1))) : "";  
  }

  /* ------------------------------------------------------------------ */  
  /*  DRAWING  (annotation layer only – frame stays on its own canvas)  */  
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
    submissionStatus.textContent = annotationLine  
      ? "Annotation ready. You may submit."  
      : "Draw the incision on the frozen frame to enable submission.";  
  }

  /* ------------------------------------------------------------------ */  
  /*  ASYNC FINAL-FRAME EXTRACTION                                      */  
  /*                                                                     */  
  /*  Strategy: we use the SAME video element trick but WITHOUT          */  
  /*  crossOrigin (GitHub raw doesn't send CORS headers for video).     */  
  /*  Instead of drawImage from a cross-origin video (which taints the  */  
  /*  canvas), we let the playback video itself seek in the background. */  
  /*  We create a SECOND invisible video, set its src, wait for         */  
  /*  metadata, seek to near-end, then capture the frame.               */  
  /*                                                                     */  
  /*  If crossOrigin blocks drawImage, we fall back to capturing from   */  
  /*  the main playback video at its ended event.                       */  
  /* ------------------------------------------------------------------ */  
  function extractFinalFrame(src) {  
    frameReady = false;  
    annotationLine = null;  
    canvasContainer.hidden = true;  
    clearBtn.disabled = true;  
    annotationStatus.textContent = "Preparing final frame…";

    // Tear down previous seekVideo  
    if (seekVideo) {  
      seekVideo.pause();  
      seekVideo.removeAttribute("src");  
      seekVideo.load();  
      if (seekVideo.parentNode) seekVideo.parentNode.removeChild(seekVideo);  
      seekVideo = null;  
    }

    seekVideo = document.createElement("video");  
    // Do NOT set crossOrigin – GitHub raw doesn't support CORS for large files  
    // This means we can still drawImage as long as we don't read pixels back  
    seekVideo.preload = "auto";  
    seekVideo.muted = true;  
    seekVideo.playsInline = true;  
    seekVideo.setAttribute("playsinline", "");  
    seekVideo.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;";  
    document.body.appendChild(seekVideo);

    var settled = false;

    seekVideo.addEventListener("loadedmetadata", function onMeta() {  
      seekVideo.removeEventListener("loadedmetadata", onMeta);  
      var target = Math.max(0, seekVideo.duration - 0.05);  
      seekVideo.currentTime = target;  
    });

    seekVideo.addEventListener("seeked", function onSeeked() {  
      seekVideo.removeEventListener("seeked", onSeeked);  
      if (settled) return;  
      settled = true;  
      try {  
        paintFinalFrame(seekVideo);  
      } catch (err) {  
        console.warn("seekVideo drawImage failed, will use fallback:", err);  
        setupFallbackCapture();  
      }  
    });

    seekVideo.addEventListener("error", function onErr() {  
      seekVideo.removeEventListener("error", onErr);  
      if (settled) return;  
      settled = true;  
      console.warn("seekVideo failed to load, using fallback capture.");  
      setupFallbackCapture();  
    });

    seekVideo.src = src;  
    seekVideo.load();  
  }

  /* Fallback: capture from the main playback video when it ends */  
  function setupFallbackCapture() {  
    annotationStatus.textContent = "Frame will appear when clip finishes playing…";

    function onEnded() {  
      videoEl.removeEventListener("ended", onEnded);  
      try {  
        paintFinalFrame(videoEl);  
      } catch (err2) {  
        console.error("Fallback frame capture also failed:", err2);  
        annotationStatus.textContent = "⚠ Could not capture frame. Try a different browser.";  
      }  
    }

    // If video already ended, capture now  
    if (videoEl.ended && videoEl.readyState >= 2) {  
      try {  
        paintFinalFrame(videoEl);  
      } catch (err3) {  
        console.error("Immediate fallback failed:", err3);  
        annotationStatus.textContent = "⚠ Could not capture frame.";  
      }  
    } else {  
      videoEl.addEventListener("ended", onEnded);  
    }  
  }

  function paintFinalFrame(sourceVideo) {  
    var w = sourceVideo.videoWidth || 640;  
    var h = sourceVideo.videoHeight || 360;

    frameCanvas.width = w;  
    frameCanvas.height = h;  
    drawCanvas.width = w;  
    drawCanvas.height = h;

    frameCtx.drawImage(sourceVideo, 0, 0, w, h);

    frameReady = true;  
    canvasContainer.hidden = false;  
    clearBtn.disabled = false;  
    annotationStatus.textContent = "Final frame ready — draw your incision line above.";  
    updateSubmitBtn();  
  }

  /* ------------------------------------------------------------------ */  
  /*  CANVAS POINTER EVENTS                                              */  
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
    lastPayload = null;  
    canvasContainer.hidden = true;  
    submitBtn.disabled = true;  
    confidenceSection.hidden = true;  
    replayBtn.disabled = true;  
    clearBtn.disabled = true;  
    videoStatus.textContent = "Loading " + clipLabel(index) + "…";  
    submissionStatus.textContent = "Draw the incision on the frozen frame to enable submission.";  
    annotationStatus.textContent = "Preparing final frame…";

    var src = clipSrc(index);

    // Update header to show progress  
    var headerH2 = videoEl.closest(".card").querySelector("h2");  
    if (headerH2) {  
      headerH2.textContent = "2. Watch Clip (" + (index + 1) + " / " + CLIPS.length + ")";  
    }

    // 1) Playback video  
    videoEl.removeAttribute("crossorigin");  
    videoEl.src = src;  
    if (CLIPS[index].poster) videoEl.poster = CLIPS[index].poster;  
    videoEl.load();  
    videoEl.play().catch(function () {  
      // Autoplay may be blocked; that's fine, user can tap play  
      videoStatus.textContent = "Tap play to watch " + clipLabel(index) + ".";  
    });

    // 2) Simultaneously extract final frame (async)  
    extractFinalFrame(src);  
  }

  videoEl.addEventListener("loadeddata", function () {  
    videoStatus.textContent = "Playing " + clipLabel(currentClipIndex) +  
      " (" + (currentClipIndex + 1) + " of " + CLIPS.length + ")…";  
    replayBtn.disabled = false;  
  });

  videoEl.addEventListener("ended", function () {  
    clipFullyWatched = true;  
    videoStatus.textContent = clipLabel(currentClipIndex) + " finished. Replay or annotate below.";  
  });

  videoEl.addEventListener("error", function () {  
    videoStatus.textContent = "⚠ Error loading clip. Check connection and try reloading.";  
    console.error("Playback video error:", videoEl.error);  
  });

  replayBtn.addEventListener("click", function () {  
    videoEl.currentTime = 0;  
    videoEl.play().catch(function () {});  
  });

  /* ------------------------------------------------------------------ */  
  /*  SUBMIT ANNOTATION  (to Formspree)                                 */  
  /* ------------------------------------------------------------------ */  
  submitBtn.addEventListener("click", function () {  
    if (!annotationLine) return;

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
      yearsPractice: yearsInput.value,  
      aiFamiliarity: aiSelect.value,  
      fatigue: alertSelect.value,  
      clipId: clipId(currentClipIndex),  
      clipLabel: clipLabel(currentClipIndex),  
      clipIndex: currentClipIndex,  
      clipSrc: clipSrc(currentClipIndex),  
      annotationX1: annotationLine.x1,  
      annotationY1: annotationLine.y1,  
      annotationX2: annotationLine.x2,  
      annotationY2: annotationLine.y2,  
      clipFullyWatched: clipFullyWatched,  
      timestamp: new Date().toISOString()  
    };

    lastPayload = payload;  
    console.log("Annotation payload:", payload);

    // Send to Formspree  
    if (SUBMIT_CFG && SUBMIT_CFG.endpoint) {  
      submitBtn.disabled = true;  
      submissionStatus.textContent = "Submitting…";

      fetch(SUBMIT_CFG.endpoint, {  
        method: SUBMIT_CFG.method || "POST",  
        headers: SUBMIT_CFG.headers || { "Content-Type": "application/json" },  
        body: JSON.stringify(payload)  
      })  
        .then(function (res) {  
          if (res.ok) {  
            showToast("Annotation submitted ✓");  
            submissionStatus.textContent = "Submitted! Now answer the confidence question below.";  
          } else {  
            throw new Error("Server responded " + res.status);  
          }  
        })  
        .catch(function (err) {  
          console.error("Submission error:", err);  
          showToast("Submission failed – check console.");  
          submissionStatus.textContent = "⚠ Submission failed. Try again.";  
          submitBtn.disabled = false;  
          return;  
        })  
        .then(function () {  
          // Show confidence  
          confidenceSection.hidden = false;  
          confidenceSelect.value = "";  
          confidenceSection.scrollIntoView({ behavior: "smooth" });  
        });  
    } else {  
      // No endpoint configured – just proceed  
      showToast("Annotation saved (no endpoint configured).");  
      confidenceSection.hidden = false;  
      confidenceSelect.value = "";  
      confidenceSection.scrollIntoView({ behavior: "smooth" });  
    }  
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

    console.log("Confidence:", conf, "for", clipId(currentClipIndex));

    // Send confidence as a separate submission  
    if (SUBMIT_CFG && SUBMIT_CFG.endpoint && lastPayload) {  
      var confPayload = {  
        email: lastPayload.email,  
        clipId: lastPayload.clipId,  
        clipLabel: lastPayload.clipLabel,  
        clipIndex: lastPayload.clipIndex,  
        confidence: conf,  
        type: "confidence",  
        timestamp: new Date().toISOString()  
      };

      fetch(SUBMIT_CFG.endpoint, {  
        method: SUBMIT_CFG.method || "POST",  
        headers: SUBMIT_CFG.headers || { "Content-Type": "application/json" },  
        body: JSON.stringify(confPayload)  
      }).catch(function (err) {  
        console.error("Confidence submission error:", err);  
      });  
    }

    showToast("Moving to next clip…");  
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Small delay so the scroll feels natural  
    setTimeout(function () {  
      loadClip(currentClipIndex + 1);  
    }, 400);  
  });

  /* ------------------------------------------------------------------ */  
  /*  DONE                                                               */  
  /* ------------------------------------------------------------------ */  
  function showDone() {  
    // Hide all working cards  
    var cards = document.querySelectorAll("main.layout > section.card");  
    cards.forEach(function (c) { c.hidden = true; });  
    completionCard.hidden = false;  
    showToast("All clips completed – thank you!", 5000);  
  }

  /* ------------------------------------------------------------------ */  
  /*  INIT                                                               */  
  /* ------------------------------------------------------------------ */  
  if (CLIPS.length) {  
    console.log("Loaded " + CLIPS.length + " clips from clip-config.js");  
    loadClip(0);  
  } else {  
    videoStatus.textContent = "No clips configured.";  
    annotationStatus.textContent = "Add clips to window.ANNOTATION_CLIPS in clip-config.js.";  
    console.warn("ANNOTATION_CLIPS is empty or undefined.");  
  }

})();  
