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
  /*  CLIPS & SUBMISSION CONFIG                                         */  
  /* ------------------------------------------------------------------ */  
  var CLIPS = window.ANNOTATION_CLIPS || [];  
  var SUBMIT_CFG = window.ANNOTATION_SUBMISSION || null;

  /* ------------------------------------------------------------------ */  
  /*  STATE                                                              */  
  /* ------------------------------------------------------------------ */  
  var currentClipIndex = 0;  
  var annotationLine = null;  
  var drawing = false;  
  var startPt = null;  
  var frameReady = false;  
  var clipFullyWatched = false;  
  var seekVideo = null;  
  var lastPayload = null;

  /* ------------------------------------------------------------------ */  
  /*  DOM REFS                                                           */  
  /* ------------------------------------------------------------------ */  
  var emailInput        = document.getElementById("participantIdInput");  
  var ageInput          = document.getElementById("ageInput");  
  var genderSelect      = document.getElementById("genderInput");  
  var levelSelect       = document.getElementById("levelInput");  
  var specialtyInput    = document.getElementById("specialtyInput");  
  var yearsInput        = document.getElementById("yearsPracticeInput");  
  var aiSelect          = document.getElementById("familiarityInput");  
  var alertSelect       = document.getElementById("fatigueInput");

  var videoEl           = document.getElementById("caseVideo");  
  var replayBtn         = document.getElementById("replayBtn");  
  var videoStatus       = document.getElementById("videoStatus");

  var canvasContainer   = document.getElementById("canvasContainer");  
  var frameCanvas       = document.getElementById("finalFrame");  
  var drawCanvas        = document.getElementById("annotationCanvas");  
  var frameCtx          = frameCanvas.getContext("2d");  
  var drawCtx           = drawCanvas.getContext("2d");  
  var clearBtn          = document.getElementById("clearLineBtn");  
  var annotationStatus  = document.getElementById("annotationStatus");

  var submitBtn         = document.getElementById("submitAnnotationBtn");  
  var submissionStatus  = document.getElementById("submissionStatus");

  var confidenceSection = document.getElementById("confidenceSection");  
  var confidenceSelect  = document.getElementById("confidenceInput");  
  var confidenceBtn     = document.getElementById("submitConfidenceBtn");

  var completionCard    = document.getElementById("completionCard");

  var toastTemplate     = document.getElementById("toastTemplate");  
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
  /*  ANNOTATION DRAWING                                                 */  
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
  /*  Two-pronged approach:                                              */  
  /*  A) Hidden seekVideo tries to load + seek to end immediately.      */  
  /*  B) Fallback: if seekVideo fails (CORS, format), capture from      */  
  /*     the main playback video when it ends.                          */  
  /*  Whichever succeeds first paints the frame.                        */  
  /* ------------------------------------------------------------------ */  
  var frameCaptured = false; // guard so only one source paints

  function extractFinalFrame(src) {  
    frameReady = false;  
    frameCaptured = false;  
    annotationLine = null;

    // IMPORTANT: keep container hidden until frame is actually painted  
    canvasContainer.hidden = true;  
    clearBtn.disabled = true;  
    annotationStatus.textContent = "Preparing final frame…";

    // --- Clean up previous seekVideo ---  
    if (seekVideo) {  
      seekVideo.pause();  
      seekVideo.removeAttribute("src");  
      seekVideo.load();  
      if (seekVideo.parentNode) seekVideo.parentNode.removeChild(seekVideo);  
      seekVideo = null;  
    }

    // --- Strategy A: Hidden seek video ---  
    seekVideo = document.createElement("video");  
    seekVideo.preload = "auto";  
    seekVideo.muted = true;  
    seekVideo.playsInline = true;  
    seekVideo.setAttribute("playsinline", "");  
    seekVideo.style.cssText =  
      "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;opacity:0;";  
    document.body.appendChild(seekVideo);

    seekVideo.addEventListener("loadedmetadata", function onMeta() {  
      seekVideo.removeEventListener("loadedmetadata", onMeta);  
      if (frameCaptured) return;  
      var target = Math.max(0, seekVideo.duration - 0.05);  
      console.log("seekVideo: seeking to", target.toFixed(2), "of", seekVideo.duration.toFixed(2));  
      seekVideo.currentTime = target;  
    });

    seekVideo.addEventListener("seeked", function onSeeked() {  
      seekVideo.removeEventListener("seeked", onSeeked);  
      if (frameCaptured) return;  
      console.log("seekVideo: seeked, attempting paint");  
      try {  
        paintFinalFrame(seekVideo, "seekVideo");  
      } catch (err) {  
        console.warn("seekVideo paint failed:", err.message);  
        // Strategy B will handle it  
      }  
    });

    seekVideo.addEventListener("error", function () {  
      console.warn("seekVideo error:", seekVideo.error);  
      // Strategy B will handle it  
    });

    seekVideo.src = src;  
    seekVideo.load();

    // --- Strategy B: Capture from playback video at end ---  
    // Also listen for the playback video to end — if seekVideo hasn't  
    // painted by then, capture from the visible video.  
    function fallbackOnEnd() {  
      videoEl.removeEventListener("ended", fallbackOnEnd);  
      if (frameCaptured) return;  
      console.log("Fallback: capturing from playback video at ended");  
      try {  
        paintFinalFrame(videoEl, "playbackVideo-ended");  
      } catch (err) {  
        console.error("Fallback paint failed:", err.message);  
        annotationStatus.textContent = "⚠ Could not capture frame. Try reloading.";  
      }  
    }  
    // Remove any old listener first  
    videoEl.removeEventListener("ended", fallbackOnEnd);  
    videoEl.addEventListener("ended", fallbackOnEnd);

    // Store the fallback remover so we can clean it up on next clip load  
    extractFinalFrame._fallbackRemover = function () {  
      videoEl.removeEventListener("ended", fallbackOnEnd);  
    };  
  }

  function paintFinalFrame(sourceVideo, debugLabel) {  
    if (frameCaptured) return; // already done  
    if (!sourceVideo || sourceVideo.videoWidth === 0) {  
      console.warn("paintFinalFrame skipped — no video dimensions yet from", debugLabel);  
      return;  
    }

    var w = sourceVideo.videoWidth;  
    var h = sourceVideo.videoHeight;

    console.log("paintFinalFrame from", debugLabel, ":", w, "x", h);

    frameCanvas.width = w;  
    frameCanvas.height = h;  
    drawCanvas.width = w;  
    drawCanvas.height = h;

    frameCtx.drawImage(sourceVideo, 0, 0, w, h);

    frameCaptured = true;  
    frameReady = true;  
    canvasContainer.hidden = false;  
    clearBtn.disabled = false;  
    annotationStatus.textContent =  
      "Final frame ready — draw your incision line above.";  
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
    annotationLine = {  
      x1: startPt.x,  
      y1: startPt.y,  
      x2: cur.x,  
      y2: cur.y  
    };  
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
  window.addEventListener(  
    "resize",  
    debounce(function () {  
      if (frameReady) renderAnnotation();  
    }, 200)  
  );

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
    frameCaptured = false;  
    lastPayload = null;  
    canvasContainer.hidden = true;  
    submitBtn.disabled = true;  
    confidenceSection.hidden = true;  
    replayBtn.disabled = true;  
    clearBtn.disabled = true;  
    videoStatus.textContent = "Loading " + clipLabel(index) + "…";  
    submissionStatus.textContent =  
      "Draw the incision on the frozen frame to enable submission.";  
    annotationStatus.textContent = "Preparing final frame…";

    // Remove old fallback listener  
    if (extractFinalFrame._fallbackRemover) {  
      extractFinalFrame._fallbackRemover();  
    }

    var src = clipSrc(index);

    // Update clip counter in the header  
    var videoCard = videoEl.closest(".card");  
    if (videoCard) {  
      var h2 = videoCard.querySelector("h2");  
      if (h2)  
        h2.textContent =  
          "2. Watch Clip (" + (index + 1) + " / " + CLIPS.length + ")";  
    }

    // 1) Set up playback video with controls so user can always play  
    videoEl.pause();  
    videoEl.removeAttribute("src");  
    videoEl.load(); // reset  
    videoEl.src = src;  
    if (CLIPS[index].poster) {  
      videoEl.poster = CLIPS[index].poster;  
    } else {  
      videoEl.removeAttribute("poster");  
    }  
    videoEl.load();

    // Try autoplay (muted videos can autoplay in most browsers)  
    var playPromise = videoEl.play();  
    if (playPromise && playPromise.catch) {  
      playPromise.catch(function (err) {  
        console.log("Autoplay blocked:", err.message, "— user can use controls.");  
        videoStatus.textContent =  
          "Press play to watch " + clipLabel(index) + ".";  
      });  
    }

    // 2) Simultaneously extract final frame  
    extractFinalFrame(src);  
  }

  videoEl.addEventListener("canplay", function () {  
    videoStatus.textContent =  
      "Playing " +  
      clipLabel(currentClipIndex) +  
      " (" +  
      (currentClipIndex + 1) +  
      " of " +  
      CLIPS.length +  
      ")…";  
    replayBtn.disabled = false;  
  });

  videoEl.addEventListener("ended", function () {  
    clipFullyWatched = true;  
    videoStatus.textContent =  
      clipLabel(currentClipIndex) + " finished. Replay or annotate below.";  
  });

  videoEl.addEventListener("error", function () {  
    videoStatus.textContent =  
      "⚠ Error loading clip. Check your connection and reload.";  
    console.error("Playback video error:", videoEl.error);  
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

    if (SUBMIT_CFG && SUBMIT_CFG.endpoint) {  
      submitBtn.disabled = true;  
      submissionStatus.textContent = "Submitting…";

      fetch(SUBMIT_CFG.endpoint, {  
        method: SUBMIT_CFG.method || "POST",  
        headers: SUBMIT_CFG.headers || {  
          "Content-Type": "application/json"  
        },  
        body: JSON.stringify(payload)  
      })  
        .then(function (res) {  
          if (!res.ok) throw new Error("Server responded " + res.status);  
          showToast("Annotation submitted ✓");  
          submissionStatus.textContent =  
            "Submitted! Answer the confidence question below.";  
          confidenceSection.hidden = false;  
          confidenceSelect.value = "";  
          confidenceSection.scrollIntoView({ behavior: "smooth" });  
        })  
        .catch(function (err) {  
          console.error("Submission error:", err);  
          showToast("Submission failed – try again.");  
          submissionStatus.textContent = "⚠ Submission failed. Try again.";  
          submitBtn.disabled = false;  
        });  
    } else {  
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
        headers: SUBMIT_CFG.headers || {  
          "Content-Type": "application/json"  
        },  
        body: JSON.stringify(confPayload)  
      }).catch(function (err) {  
        console.error("Confidence submission error:", err);  
      });  
    }

    showToast("Moving to next clip…");  
    window.scrollTo({ top: 0, behavior: "smooth" });

    setTimeout(function () {  
      loadClip(currentClipIndex + 1);  
    }, 400);  
  });

  /* ------------------------------------------------------------------ */  
  /*  DONE                                                               */  
  /* ------------------------------------------------------------------ */  
  function showDone() {  
    var cards = document.querySelectorAll("main.layout > section.card");  
    cards.forEach(function (c) {  
      c.hidden = true;  
    });  
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
    annotationStatus.textContent =  
      "Add clips to window.ANNOTATION_CLIPS in clip-config.js.";  
    console.warn("ANNOTATION_CLIPS is empty.");  
  }  
})();  
