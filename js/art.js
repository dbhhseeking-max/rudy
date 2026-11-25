/* ==========================================================================
   VOLUME Y: YEARNING FOR ART — R2 VINYL ARCHIVE & TOP DYNAMIC CAPSULE PLAYER
   ========================================================================== */

// Yearning for Art — Cloudflare R2 Vinyl Archive & Top Dynamic Capsule State
let artVinylTracks = [];
let hasFetchedArtCatalog = false;
let activeVinylId = null;
let extractedVinylId = null; // Tracks which physical vinyl is currently sitting in the top player
let isVinylPlaying = false;
let editingVinylReviewId = null;
let vinylLoopMode = 'all'; // 'all' | 'one' | 'off'
let isTopVinylCollapsed = false;
let isTurntableSheetOpen = false;
let vinylFlightFrame = null;
let lastProgressPaintMs = 0;
let selectedVinylAudioFile = null;
let selectedVinylCoverFile = null;

// Built-in Web Audio API Ambient Synthesizer State
let audioCtx = null;
let isAudioPlaying = false;
let audioIntervalId = null;

/**
 * Builds the Yearning for Art page:
 * Pure Vinyl Record Collection stored in Cloudflare R2 (audio + optional cover + Rudy's custom music reviews).
 */
function buildArtOrbitButterflySvg(uid) {
  return `
    <div class="butterfly-3d-stage">
      <div class="butterfly-wing-pane wing-left">
        <svg viewBox="0 0 50 100" class="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="aoUL_${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fff9e8" stop-opacity="0.98" />
              <stop offset="55%" stop-color="#e4d4a7" stop-opacity="0.92" />
              <stop offset="100%" stop-color="#b89b5e" stop-opacity="0.95" />
            </linearGradient>
          </defs>
          <path d="M48.5 47 C33 17, 6 15, 10 42 C13 55, 33 56, 48.5 52 Z" fill="url(#aoUL_${uid})" stroke="#fffdf7" stroke-width="1"/>
          <path d="M48.5 52 C33 56, 16 68, 24 82 C31 91, 44 76, 48.5 58 Z" fill="url(#aoUL_${uid})" opacity="0.9"/>
        </svg>
      </div>
      <div class="butterfly-wing-pane wing-right">
        <svg viewBox="50 0 50 100" class="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="aoUR_${uid}" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#fff9e8" stop-opacity="0.98" />
              <stop offset="55%" stop-color="#e4d4a7" stop-opacity="0.92" />
              <stop offset="100%" stop-color="#b89b5e" stop-opacity="0.95" />
            </linearGradient>
          </defs>
          <path d="M51.5 47 C67 17, 94 15, 90 42 C87 55, 67 56, 51.5 52 Z" fill="url(#aoUR_${uid})" stroke="#fffdf7" stroke-width="1"/>
          <path d="M51.5 52 C67 56, 84 68, 76 82 C69 91, 56 76, 51.5 58 Z" fill="url(#aoUR_${uid})" opacity="0.9"/>
        </svg>
      </div>
      <div class="butterfly-body-pane">
        <svg viewBox="0 0 100 100" class="w-full h-full overflow-visible">
          <ellipse cx="50" cy="52" rx="2.1" ry="12" fill="#3a2f1d" />
        </svg>
      </div>
    </div>
  `;
}

function buildArtHtml() {
  const authorVinylComposerHtml = isAuthorAuthenticated
    ? `
      <div class="rounded-2xl border border-[#d47a9c]/35 bg-[#1b1418] p-4 sm:p-5 space-y-3.5 shadow-xl">
        <div class="flex flex-wrap items-center justify-between gap-2 pr-20">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span class="font-mono-code text-[11px] tracking-widest uppercase text-[#f0a8c3]">
              AUTHOR MODE · UPLOAD VINYL TO CLOUDFLARE R2
            </span>
          </div>
          <button
            type="button"
            onclick="handleAuthorLogout()"
            class="font-mono-code text-[11px] text-white/45 hover:text-rose-300 transition cursor-pointer"
          >
            [ SIGN OUT ]
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input
            id="vinyl-title-input"
            type="text"
            maxlength="80"
            placeholder="Track Title (e.g. Clair de Lune)"
            class="rounded-lg bg-black/45 border border-white/15 px-3 py-2 text-xs text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#e4d4a7]"
          />
          <input
            id="vinyl-artist-input"
            type="text"
            maxlength="60"
            placeholder="Artist / Composer"
            class="rounded-lg bg-black/45 border border-white/15 px-3 py-2 text-xs text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#e4d4a7]"
          />
          <input
            id="vinyl-mood-input"
            type="text"
            maxlength="32"
            placeholder="Mood / Genre (e.g. Late Night Piano)"
            class="rounded-lg bg-black/45 border border-white/15 px-3 py-2 text-xs text-[#e4d4a7] placeholder-white/35 focus:outline-none focus:border-[#e4d4a7]"
          />
        </div>

        <textarea
          id="vinyl-review-input"
          rows="3"
          placeholder="Write your custom music review, listening impression, or favorite lyric..."
          class="w-full rounded-xl bg-black/45 border border-white/15 p-3 text-xs sm:text-sm text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#e4d4a7]"
        ></textarea>

        <div class="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
          <div class="flex flex-wrap items-center gap-2">
            <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e4d4a7]/35 bg-[#e4d4a7]/10 hover:bg-[#e4d4a7]/20 text-xs font-mono-code text-[#e4d4a7] cursor-pointer transition">
              <span>♪ AUDIO FILE</span>
              <input
                id="vinyl-audio-file"
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.aac"
                onchange="handleVinylAudioPick(event)"
                class="hidden"
              />
            </label>

            <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono-code text-white/75 cursor-pointer transition">
              <span>+ COVER ART (OPTIONAL)</span>
              <input
                id="vinyl-cover-file"
                type="file"
                accept="image/*"
                onchange="handleVinylCoverPick(event)"
                class="hidden"
              />
            </label>
          </div>

          <button
            id="btn-publish-vinyl"
            type="button"
            onclick="publishNewVinylTrack()"
            class="px-4 py-2 rounded-xl bg-[#e4d4a7] hover:bg-[#efe2be] text-[#0c0d0f] font-mono-code text-xs font-medium tracking-wide transition cursor-pointer shadow"
          >
            PRESS VINYL ↵
          </button>
        </div>

        <div id="vinyl-picked-summary" class="font-mono-code text-[11px] text-white/55 hidden"></div>
        <p id="vinyl-composer-status" class="font-mono-code text-[11px] text-amber-300 hidden"></p>
      </div>
    `
    : '';

  let vinylCollectionHtml = '';
  if (artVinylTracks.length > 0) {
    const cardsHtml = artVinylTracks.map((track, idx) => {
      const isInPlayer = extractedVinylId === track.id;
      const isThisSpinning = isInPlayer && isVinylPlaying;
      const isEditingThis = isAuthorAuthenticated && editingVinylReviewId === track.id;
      const safeTitle = escapeHtmlSafely(track.title || 'Untitled');
      const safeArtist = escapeHtmlSafely(track.artist || 'Curated by Rudy');
      const safeMood = escapeHtmlSafely(track.mood || 'VINYL ARCHIVE');
      const safeReview = escapeHtmlSafely(track.review || '');
      const numStr = String(idx + 1).padStart(2, '0');
      const sleeveAccent = track.accent || '#522437';

      const sleeveArt = track.coverUrl
        ? `<img src="${track.coverUrl}" alt="${safeTitle}" loading="lazy" decoding="async" class="w-full h-full object-cover" />`
        : `<div class="w-full h-full p-2.5 flex flex-col justify-between text-left" style="background: linear-gradient(145deg, ${sleeveAccent}, #161216);">
             <span data-sleeve-tag="${track.id}" class="font-mono-code text-[8px] tracking-[0.16em] text-[#e4d4a7]/80">
               ${isInPlayer ? 'EMPTY · ON DECK' : `SIDE A · ${numStr}`}
             </span>
             <span class="font-serif-editorial italic text-xs text-[#f6e7d8] leading-snug line-clamp-2">${safeTitle}</span>
           </div>`;

      const discCenterLabel = track.coverUrl
        ? `<img src="${track.coverUrl}" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover rounded-full" />`
        : `<span class="w-full h-full rounded-full block" style="background-color: ${sleeveAccent};"></span>`;

      const reviewSectionHtml = isEditingThis
        ? `
          <div class="space-y-2.5 pt-1">
            <textarea
              id="vinyl-inline-review-editor-${track.id}"
              rows="3"
              placeholder="Write your custom music review..."
              class="w-full rounded-lg bg-black/45 border border-[#e4d4a7]/45 p-3 text-sm text-[#f3f1ec] leading-relaxed focus:outline-none focus:border-[#e4d4a7]"
            >${safeReview}</textarea>
            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                onclick="toggleEditVinylReview(null)"
                class="px-3 py-1 rounded-lg border border-white/15 font-mono-code text-[10px] text-white/60 hover:text-white transition cursor-pointer"
              >
                CANCEL
              </button>
              <button
                id="btn-save-vinyl-review-${track.id}"
                type="button"
                onclick="saveEditedVinylReview('${track.id}')"
                class="px-3.5 py-1 rounded-lg bg-[#e4d4a7] hover:bg-[#efe2be] text-[#0c0d0f] font-mono-code text-[10px] font-medium transition cursor-pointer"
              >
                SAVE REVIEW TO R2 ↵
              </button>
            </div>
          </div>
        `
        : `
          <p class="font-serif-editorial text-[15px] sm:text-base leading-relaxed text-white/85 whitespace-pre-line break-words">
            ${safeReview || '<span class="italic text-white/35">No music review written yet.</span>'}
          </p>
        `;

      const authorActionsHtml = isAuthorAuthenticated
        ? `
          <div class="flex items-center gap-3">
            <button
              type="button"
              onclick="toggleEditVinylReview('${track.id}')"
              class="font-mono-code text-[10px] tracking-wider uppercase text-[#e4d4a7]/75 hover:text-[#e4d4a7] transition cursor-pointer"
            >
              [ EDIT REVIEW ]
            </button>
            <button
              type="button"
              data-confirm="false"
              onclick="deleteVinylTrack('${track.id}', this)"
              class="font-mono-code text-[10px] tracking-wider uppercase text-white/40 hover:text-rose-400 transition cursor-pointer"
            >
              [ REMOVE ]
            </button>
          </div>
        `
        : '';

      return `
        <article
          data-vinyl-card="${track.id}"
          class="vinyl-card ${isInPlayer ? 'is-in-player border-[#e4d4a7]/45 bg-[#e4d4a7]/[0.04]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'} ${isThisSpinning ? 'is-playing' : ''} rounded-2xl border p-4 sm:p-5 space-y-4 transition"
        >
          <div class="vinyl-card-row">
            <!-- Scheme B: 1:1 Square Sleeve + Right Extractable Disc (Flies to Top Player) + Orbiting Butterflies -->
            <button
              type="button"
              onclick="selectVinylTrack('${track.id}', true)"
              aria-label="Play ${safeTitle}"
              class="vinyl-stage cursor-pointer focus:outline-none"
            >
              <!-- 3 Tiny Champagne-Gold Butterflies Orbiting While This Record Plays -->
              <div class="vinyl-orbit-swarm" aria-hidden="true">
                <span class="vinyl-mini-bfly bfly-1">${buildArtOrbitButterflySvg(`v1_${idx}`)}</span>
                <span class="vinyl-mini-bfly bfly-2">${buildArtOrbitButterflySvg(`v2_${idx}`)}</span>
                <span class="vinyl-mini-bfly bfly-3">${buildArtOrbitButterflySvg(`v3_${idx}`)}</span>
              </div>

              <!-- Right-Peeking Vinyl Disc (Flies into Top Player & Disappears Leaving Empty Sleeve) -->
              <div class="vinyl-disc-wrap peek-disc">
                <div class="vinyl-disc flex items-center justify-center">
                  <span class="vinyl-disc-label">
                    ${discCenterLabel}
                    <span class="absolute w-2 h-2 rounded-full bg-[#0c0d0f] border border-[#e4d4a7]/45"></span>
                  </span>
                </div>
              </div>

              <!-- 1:1 Square Record Sleeve + Crisp ON DECK Badge -->
              <div class="vinyl-sleeve">
                ${sleeveArt}
                <span data-sleeve-deck-pill="${track.id}" class="vinyl-ondeck-pill">ON DECK</span>
              </div>
            </button>

            <div class="flex-1 min-w-0 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2 font-mono-code text-[10px] tracking-[0.16em] uppercase">
                <span data-shelf-badge="${track.id}" class="inline-flex items-center gap-1.5 shrink-0 ${isInPlayer ? 'text-[#e4d4a7]' : 'text-[#f0a8c3]/85'}">
                  ${isThisSpinning
                    ? `<span class="inline-flex items-end gap-[2px] h-2.5"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></span><span>IN PLAYER · SPINNING</span>`
                    : (isInPlayer ? '● ON DECK' : `VINYL · ${numStr}`)}
                </span>
                <span class="text-white/25">·</span>
                <span class="vinyl-genre-tag text-white/50">${safeMood}</span>
              </div>

              <h3 class="font-serif-editorial text-xl sm:text-2xl text-[#f3f1ec] leading-snug break-words">
                ${safeTitle}
              </h3>
              <p class="font-serif-editorial italic text-xs sm:text-sm text-[#e4d4a7]/80">
                ${safeArtist}
              </p>

              <div class="pt-1">
                <button
                  type="button"
                  data-shelf-playbtn="${track.id}"
                  onclick="selectVinylTrack('${track.id}', true)"
                  class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border ${isThisSpinning ? 'border-[#e4d4a7]/60 bg-[#e4d4a7]/20 text-[#e4d4a7]' : 'border-white/15 bg-white/[0.04] hover:border-[#e4d4a7]/45 hover:text-[#e4d4a7] text-white/80'} font-mono-code text-[10px] transition cursor-pointer"
                >
                  ${isThisSpinning ? '❚❚ PAUSE' : (isInPlayer ? '▶ RESUME ON DECK' : '▶ PULL & PLAY')}
                </button>
              </div>
            </div>
          </div>

          <!-- Rudy's Custom Music Review / Liner Notes (Stored in R2) -->
          <div class="rounded-xl border border-white/8 bg-black/25 px-4 py-3.5 space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-2">
              <span class="font-mono-code text-[10px] tracking-[0.18em] uppercase text-[#e4d4a7]/85">
                ✦ LINER NOTES · RUDY'S REVIEW
              </span>
              ${authorActionsHtml}
            </div>
            ${reviewSectionHtml}
          </div>
        </article>
      `;
    }).join('');

    vinylCollectionHtml = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 pr-20">
          <span class="font-mono-code text-[11px] tracking-[0.18em] uppercase text-white/50">
            VINYL ARCHIVE (${artVinylTracks.length})
          </span>
          <span class="font-mono-code text-[10px] text-white/35">
            CLICK ANY SLEEVE TO PULL RECORD INTO TOP PLAYER ↑
          </span>
        </div>
        <div class="space-y-4">
          ${cardsHtml}
        </div>
      </div>
    `;
  } else {
    vinylCollectionHtml = `
      <div class="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center space-y-3">
        <div class="w-20 h-20 mx-auto rounded-full vinyl-disc flex items-center justify-center opacity-85">
          <span class="w-6 h-6 rounded-full bg-[#522437] border border-[#e4d4a7]/40"></span>
        </div>
        <p class="font-serif-editorial italic text-xl text-white/85 pt-1">
          The Vinyl Archive awaits its first record.
        </p>
        <p class="font-mono-code text-[11px] text-white/45">
          ${isAuthorAuthenticated ? 'Upload your first music file and write your review above — saved directly in Cloudflare R2.' : 'Curated vinyl records and music reviews by Rudy will appear here soon.'}
        </p>
      </div>
    `;
  }

  return `
    <div class="space-y-6">
      ${authorVinylComposerHtml}
      ${vinylCollectionHtml}
    </div>
  `;
}

/* ========================================================================
   BUILT-IN WEB AUDIO API AMBIENT STUDY CHORDS (ZERO EXTERNAL AUDIO FILES)
   ======================================================================== */
function updateAudioButtonLabel() {
  const btn = document.getElementById('btn-ambient-audio');
  if (!btn) return;
  btn.textContent = isAudioPlaying ? '■ STOP TONE' : '▶ PLAY TONE';
}

function playWarmChord(frequencies) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  frequencies.forEach((freq) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 3.5);
  });
}

function toggleAmbientAudio() {
  try {
    if (isAudioPlaying) {
      isAudioPlaying = false;
      if (audioIntervalId) {
        clearInterval(audioIntervalId);
        audioIntervalId = null;
      }
      updateAudioButtonLabel();
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const progression = [
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [164.81, 196.0, 246.94, 293.66], // Em7
      [146.83, 174.61, 220.0, 261.63], // Dm7
      [130.81, 164.81, 196.0, 246.94]  // Cmaj7
    ];

    let chordIdx = 0;
    isAudioPlaying = true;
    updateAudioButtonLabel();

    playWarmChord(progression[chordIdx]);
    audioIntervalId = setInterval(() => {
      if (!isAudioPlaying) return;
      chordIdx = (chordIdx + 1) % progression.length;
      playWarmChord(progression[chordIdx]);
    }, 3600);
  } catch (err) {
    console.error('Ambient audio playback error:', err);
  }
}

/* ========================================================================
   YEARNING FOR ART: CLOUDFLARE R2 VINYL ARCHIVE & TOP DYNAMIC CAPSULE ENGINE
   ======================================================================== */
function formatVinylTime(seconds) {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getVinylPlaySvg(playing) {
  return playing
    ? `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>`
    : `<svg class="w-3.5 h-3.5 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
}

function getVinylLoopSvg(mode) {
  const icon = `
    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="17 1 21 5 17 9"></polyline>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
      <polyline points="7 23 3 19 7 15"></polyline>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
    </svg>`;
  if (mode === 'one') {
    return `${icon}<span class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#f0a8c3] text-[#111] font-mono-code text-[8px] font-bold flex items-center justify-center">1</span>`;
  }
  return icon;
}

/**
 * Shows or hides the top sticky vinyl capsule based on route and playback:
 * - On Art page: visible (never blocks reading).
 * - On other pages while playing: stays seamlessly alive at the top (music never cuts off).
 * - On other pages when idle/paused: completely hidden (0px layout footprint).
 */
function syncTopVinylDockForRoute() {
  const dock = document.getElementById('top-vinyl-dock');
  const gotoArtBtn = document.getElementById('sheet-goto-art-btn');
  if (!dock) return;

  const isOnArt = currentView === 'chapter' && activeBookId === 'art';
  const shouldShow = isOnArt || isVinylPlaying;

  if (gotoArtBtn) {
    gotoArtBtn.classList.toggle('hidden', isOnArt);
  }

  if (!shouldShow) {
    dock.classList.add('opacity-0', '-translate-y-2', 'hidden');
    return;
  }

  dock.classList.remove('hidden');
  requestAnimationFrame(() => {
    dock.classList.remove('opacity-0', '-translate-y-2');
  });

  syncTopCapsuleVisuals();
  // Keep perched butterfly aligned smoothly if top capsule height shifted
  if (currentView === 'chapter') {
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  }
}

function setTopVinylCollapsed(collapsed) {
  isTopVinylCollapsed = Boolean(collapsed);
  if (isTopVinylCollapsed) {
    toggleTurntableSheet(false);
  }
  syncTopCapsuleVisuals();
  if (currentView === 'chapter') {
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  }
}

function toggleTurntableSheet(open) {
  isTurntableSheetOpen = Boolean(open);
  const backdrop = document.getElementById('vinyl-sheet-backdrop');
  const panel = document.getElementById('vinyl-sheet-panel');
  if (!backdrop || !panel) return;

  if (isTurntableSheetOpen) {
    syncTopCapsuleVisuals();
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
      backdrop.classList.remove('opacity-0');
      panel.classList.remove('translate-y-10', 'opacity-0');
    });
  } else {
    backdrop.classList.add('opacity-0');
    panel.classList.add('translate-y-10', 'opacity-0');
    setTimeout(() => {
      if (!isTurntableSheetOpen) backdrop.classList.add('hidden');
    }, 280);
  }
}

function triggerTopDockPulse() {
  document.querySelectorAll('.js-top-pill-shell').forEach(el => {
    el.classList.remove('dock-receive-pulse');
    void el.offsetWidth;
    el.classList.add('dock-receive-pulse');
  });
}

/**
 * Smooth GPU-composited flight pulling the physical black vinyl out of its sleeve
 * and docking it straight into the top capsule turntable.
 */
function animateVinylExtractionToTopCapsule(track) {
  const cardEl = document.querySelector(`[data-vinyl-card="${track.id}"]`);
  const sourceDiscEl = cardEl ? cardEl.querySelector('.peek-disc') : null;
  const targetDiscEl = document.getElementById(isTopVinylCollapsed ? 'top-fly-target-mini' : 'top-fly-target');
  const actorEl = document.getElementById('flying-vinyl-actor');
  const actorLabelEl = document.getElementById('flying-vinyl-label');

  if (!cardEl || !sourceDiscEl || !targetDiscEl || !actorEl) {
    extractedVinylId = track.id;
    triggerTopDockPulse();
    syncArtShelfPlayingState();
    return;
  }

  if (vinylFlightFrame) {
    cancelAnimationFrame(vinylFlightFrame);
    vinylFlightFrame = null;
  }

  // 1. Tactile slide-out from cardboard sleeve
  cardEl.classList.remove('is-in-player');
  cardEl.classList.add('is-pulling');

  setTimeout(() => {
    const startRect = sourceDiscEl.getBoundingClientRect();
    const endRect = targetDiscEl.getBoundingClientRect();

    cardEl.classList.remove('is-pulling');
    extractedVinylId = track.id;
    cardEl.classList.add('is-in-player');
    syncArtShelfPlayingState();

    if (!endRect.width || !startRect.width) {
      triggerTopDockPulse();
      return;
    }

    const startCx = startRect.left + startRect.width / 2;
    const startCy = startRect.top + startRect.height / 2;
    const endCx = endRect.left + endRect.width / 2;
    const endCy = endRect.top + endRect.height / 2;
    const startSize = startRect.width || 80;
    const endScale = Math.max(0.32, endRect.width / startSize);

    if (actorLabelEl) {
      const accent = track.accent || '#522437';
      actorLabelEl.innerHTML = track.coverUrl
        ? `<img src="${track.coverUrl}" alt="" class="w-full h-full object-cover rounded-full" /><span class="absolute w-1.5 h-1.5 rounded-full bg-[#0c0d0f]"></span>`
        : `<span class="w-full h-full rounded-full block" style="background:${accent};"></span><span class="absolute w-1.5 h-1.5 rounded-full bg-[#0c0d0f]"></span>`;
    }

    const midX = (startCx + endCx) * 0.5 + (endCx >= startCx ? 50 : -50);
    const midY = Math.min(startCy, endCy) - 55;

    actorEl.style.opacity = '1';
    const duration = 560;
    const startTime = performance.now();

    function step(now) {
      const rawT = Math.min((now - startTime) / duration, 1);
      const t = rawT < 0.5
        ? 4 * rawT * rawT * rawT
        : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

      const inv = 1 - t;
      const x = inv * inv * startCx + 2 * inv * t * midX + t * t * endCx;
      const y = inv * inv * startCy + 2 * inv * t * midY + t * t * endCy;
      const scale = 1 + (endScale - 1) * t;
      const spinDeg = rawT * 390;

      actorEl.style.transform = `translate3d(${x - startSize / 2}px, ${y - startSize / 2}px, 0) scale(${scale.toFixed(3)}) rotate(${spinDeg.toFixed(1)}deg)`;
      actorEl.style.opacity = rawT > 0.86 ? String((1 - rawT) / 0.14) : '1';

      if (rawT < 1) {
        vinylFlightFrame = requestAnimationFrame(step);
      } else {
        vinylFlightFrame = null;
        actorEl.style.opacity = '0';
        actorEl.style.transform = 'translate3d(-200px, -200px, 0)';
        triggerTopDockPulse();
      }
    }

    vinylFlightFrame = requestAnimationFrame(step);
  }, 180);
}

function syncTopCapsuleVisuals() {
  const expandedEl = document.getElementById('top-pill-expanded');
  const collapsedEl = document.getElementById('top-pill-collapsed');
  if (expandedEl) expandedEl.classList.toggle('hidden', isTopVinylCollapsed);
  if (collapsedEl) collapsedEl.classList.toggle('hidden', !isTopVinylCollapsed);

  const track = artVinylTracks.find(t => t.id === activeVinylId) || artVinylTracks[0] || null;
  const isLoaded = Boolean(track && extractedVinylId === track.id);

  document.querySelectorAll('.js-track-title').forEach(el => {
    el.textContent = track ? (track.title || 'Untitled') : 'No Vinyl Loaded';
  });

  const subEl = document.getElementById('top-pill-sub');
  if (subEl) {
    const isOnArt = currentView === 'chapter' && activeBookId === 'art';
    if (!track) {
      subEl.textContent = 'PRESS IN ART';
    } else if (isVinylPlaying) {
      subEl.textContent = isOnArt ? 'SPINNING · DECK' : 'PLAYING · BACKGROUND';
    } else {
      subEl.textContent = isLoaded ? 'PAUSED · TAP DECK' : 'READY · TAP PLAY';
    }
  }

  const artistEl = document.getElementById('sheet-track-artist');
  const reviewEl = document.getElementById('sheet-track-review');
  if (artistEl) artistEl.textContent = track ? (track.artist || 'Curated by Rudy') : 'Rudy\'s Listening Room';
  if (reviewEl) reviewEl.textContent = track ? (track.review || '') : '';

  const accent = (track && track.accent) ? track.accent : '#522437';
  const labelHtml = (track && track.coverUrl)
    ? `<img src="${track.coverUrl}" alt="" class="w-full h-full object-cover rounded-full" /><span class="absolute w-1.5 h-1.5 rounded-full bg-[#0c0d0f] border border-[#e4d4a7]/60"></span>`
    : `<span class="w-full h-full rounded-full block" style="background: radial-gradient(circle at 30% 30%, ${accent}, #181016);"></span><span class="absolute w-1.5 h-1.5 rounded-full bg-[#0c0d0f] border border-[#e4d4a7]/60"></span>`;

  document.querySelectorAll('.js-disc-label').forEach(el => {
    el.innerHTML = labelHtml;
  });
  document.querySelectorAll('.js-spin-disc').forEach(el => {
    el.classList.toggle('is-spinning', isVinylPlaying);
  });
  document.querySelectorAll('.js-tonearm').forEach(el => {
    el.classList.toggle('is-playing', isVinylPlaying);
  });
  document.querySelectorAll('.js-play-btn').forEach(el => {
    el.innerHTML = getVinylPlaySvg(isVinylPlaying);
  });

  const orbDot = document.getElementById('top-orb-status-dot');
  if (orbDot) {
    orbDot.className = isVinylPlaying
      ? 'w-2 h-2 rounded-full bg-emerald-400'
      : 'w-2 h-2 rounded-full bg-white/35';
  }

  document.querySelectorAll('.js-loop-btn').forEach(el => {
    el.innerHTML = getVinylLoopSvg(vinylLoopMode);
    if (vinylLoopMode === 'one') {
      el.classList.remove('text-white/35', 'text-[#e4d4a7]');
      el.classList.add('text-[#f0a8c3]');
      el.title = 'Repeat One';
    } else if (vinylLoopMode === 'all') {
      el.classList.remove('text-white/35', 'text-[#f0a8c3]');
      el.classList.add('text-[#e4d4a7]');
      el.title = 'Repeat All';
    } else {
      el.classList.remove('text-[#e4d4a7]', 'text-[#f0a8c3]');
      el.classList.add('text-white/35');
      el.title = 'Loop Off';
    }
  });

  syncVinylProgressOnly(true);
  syncTopCapsuleHaloState();
}

/**
 * Throttled, zero-reflow progress bar update (~4fps) to keep audio playback silky smooth.
 */
function syncVinylProgressOnly(force = false) {
  const now = performance.now();
  if (!force && now - lastProgressPaintMs < 220) return;
  lastProgressPaintMs = now;

  const audio = document.getElementById('vinyl-audio-engine');
  if (!audio) return;
  const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;

  const fillEl = document.getElementById('top-pill-progress-fill');
  if (fillEl) fillEl.style.width = `${pct.toFixed(1)}%`;

  const barEl = document.getElementById('sheet-progress-bar');
  const curEl = document.getElementById('sheet-time-cur');
  const durEl = document.getElementById('sheet-time-dur');
  if (barEl) barEl.value = pct.toFixed(1);
  if (curEl) curEl.textContent = formatVinylTime(cur);
  if (durEl) durEl.textContent = formatVinylTime(dur);
}

function syncArtShelfPlayingState() {
  if (currentView !== 'chapter' || activeBookId !== 'art') return;

  artVinylTracks.forEach((track, idx) => {
    const isInPlayer = extractedVinylId === track.id;
    const isThisSpinning = isInPlayer && isVinylPlaying;
    const numStr = String(idx + 1).padStart(2, '0');

    const card = document.querySelector(`[data-vinyl-card="${track.id}"]`);
    const sleeveTag = document.querySelector(`[data-sleeve-tag="${track.id}"]`);
    const badge = document.querySelector(`[data-shelf-badge="${track.id}"]`);
    const playBtn = document.querySelector(`[data-shelf-playbtn="${track.id}"]`);

    if (card) {
      card.classList.toggle('is-in-player', isInPlayer);
      card.classList.toggle('is-playing', isThisSpinning);
      card.classList.toggle('border-[#e4d4a7]/45', isInPlayer);
      card.classList.toggle('bg-[#e4d4a7]/[0.04]', isInPlayer);
    }
    if (sleeveTag) {
      sleeveTag.textContent = isInPlayer ? 'ON DECK' : `SIDE A · ${numStr}`;
    }
    if (badge) {
      badge.className = `inline-flex items-center gap-1.5 shrink-0 ${isInPlayer ? 'text-[#e4d4a7]' : 'text-[#f0a8c3]/85'}`;
      badge.innerHTML = isThisSpinning
        ? `<span class="inline-flex items-end gap-[2px] h-2.5"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></span><span>IN PLAYER · SPINNING</span>`
        : (isInPlayer ? '● ON DECK' : `VINYL · ${numStr}`);
    }
    if (playBtn) {
      playBtn.textContent = isThisSpinning ? '❚❚ PAUSE' : (isInPlayer ? '▶ RESUME ON DECK' : '▶ PULL & PLAY');
      playBtn.className = `inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border ${
        isThisSpinning
          ? 'border-[#e4d4a7]/60 bg-[#e4d4a7]/20 text-[#e4d4a7]'
          : 'border-white/15 bg-white/[0.04] hover:border-[#e4d4a7]/45 hover:text-[#e4d4a7] text-white/80'
      } font-mono-code text-[10px] transition cursor-pointer`;
    }
  });
}

async function fetchArtVinylCatalog() {
  hasFetchedArtCatalog = true;
  try {
    const res = await fetch(`${R2_UPLOAD_ENDPOINT}/art-music`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) {
      artVinylTracks = data;
      if (!activeVinylId && artVinylTracks.length > 0) {
        activeVinylId = artVinylTracks[0].id;
      }
      syncTopCapsuleVisuals();
      if (currentView === 'chapter' && activeBookId === 'art') {
        renderChapterContent('art');
        setTimeout(() => syncButterflyToCloseButton(false), 60);
      }
    }
  } catch (err) {
    console.warn('Vinyl catalog sync skipped:', err);
  }
}

async function saveArtVinylCatalogToR2(updatedTracks) {
  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated) {
    throw new Error('Author login required.');
  }
  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : '';

  const res = await fetch(`${R2_UPLOAD_ENDPOINT}/art-music`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatedTracks)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Catalog save failed (${res.status})`);
  }
  return json;
}

/**
 * Compresses oversized album cover art to max 480x480 JPEG/WebP in browser before R2 upload
 * so vinyl sleeves render instantaneously on mobile & desktop networks.
 */
function compressCoverArtForSpeed(file) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/') || file.size < 180 * 1024) {
      resolve(file);
      return;
    }
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      try {
        const maxDim = 480;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          const outFile = new File([blob], 'cover.jpg', { type: 'image/jpeg' });
          resolve(outFile);
        }, 'image/jpeg', 0.82);
      } catch (_e) {
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve(file);
    };
    img.src = objUrl;
  });
}

function handleVinylAudioPick(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  selectedVinylAudioFile = file;
  const titleInput = document.getElementById('vinyl-title-input');
  if (titleInput && !titleInput.value.trim()) {
    titleInput.value = file.name.replace(/\.[^/.]+$/, '');
  }
  updatePickedVinylSummary();
  event.target.value = '';
}

function handleVinylCoverPick(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  selectedVinylCoverFile = file;
  updatePickedVinylSummary();
  event.target.value = '';
}

function updatePickedVinylSummary() {
  const el = document.getElementById('vinyl-picked-summary');
  if (!el) return;
  const parts = [];
  if (selectedVinylAudioFile) {
    const mb = (selectedVinylAudioFile.size / (1024 * 1024)).toFixed(1);
    parts.push(`Audio: ${selectedVinylAudioFile.name} (${mb} MB)`);
  }
  if (selectedVinylCoverFile) {
    parts.push(`Cover: ${selectedVinylCoverFile.name}`);
  }
  if (parts.length > 0) {
    el.textContent = parts.join('  ·  ');
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

async function publishNewVinylTrack() {
  if (!ensureSupabaseClient() || !isAuthorAuthenticated) return;

  const titleEl = document.getElementById('vinyl-title-input');
  const artistEl = document.getElementById('vinyl-artist-input');
  const moodEl = document.getElementById('vinyl-mood-input');
  const reviewEl = document.getElementById('vinyl-review-input');
  const statusEl = document.getElementById('vinyl-composer-status');
  const btn = document.getElementById('btn-publish-vinyl');

  const title = titleEl ? titleEl.value.trim() : '';
  const artist = artistEl && artistEl.value.trim() ? artistEl.value.trim() : 'Curated by Rudy';
  const mood = moodEl && moodEl.value.trim() ? moodEl.value.trim() : 'VINYL ARCHIVE';
  const review = reviewEl ? reviewEl.value.trim() : '';

  if (!selectedVinylAudioFile) {
    if (statusEl) {
      statusEl.textContent = 'Please select an audio file (MP3, M4A, WAV, FLAC) first.';
      statusEl.className = 'font-mono-code text-[11px] text-amber-300';
      statusEl.classList.remove('hidden');
    }
    return;
  }

  btn.disabled = true;
  btn.textContent = 'PRESSING...';
  if (statusEl) {
    statusEl.textContent = 'Uploading audio & custom review to Cloudflare R2...';
    statusEl.className = 'font-mono-code text-[11px] text-[#e4d4a7]';
    statusEl.classList.remove('hidden');
  }

  try {
    const audioUpload = await uploadSingleFileToR2(selectedVinylAudioFile);
    let coverUpload = { url: '', key: '' };
    if (selectedVinylCoverFile) {
      const optimizedCover = await compressCoverArtForSpeed(selectedVinylCoverFile);
      coverUpload = await uploadSingleFileToR2(optimizedCover);
    }

    const palette = ['#522437', '#215273', '#6b5628', '#3c4a38', '#46284a'];
    const newTrack = {
      id: `lp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: title || selectedVinylAudioFile.name.replace(/\.[^/.]+$/, ''),
      artist,
      mood,
      review,
      audioUrl: audioUpload.url,
      audioKey: audioUpload.key,
      coverUrl: coverUpload.url || '',
      coverKey: coverUpload.key || '',
      accent: palette[artVinylTracks.length % palette.length],
      createdAt: new Date().toISOString()
    };

    const updatedCatalog = [newTrack, ...artVinylTracks];
    await saveArtVinylCatalogToR2(updatedCatalog);

    artVinylTracks = updatedCatalog;
    if (!isVinylPlaying) {
      activeVinylId = newTrack.id;
    }
    editingVinylReviewId = null;
    selectedVinylAudioFile = null;
    selectedVinylCoverFile = null;

    renderChapterContent('art');
    syncTopCapsuleVisuals();
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Upload failed: ${err.message || 'Please deploy the updated worker.js first.'}`;
      statusEl.className = 'font-mono-code text-[11px] text-rose-400';
      statusEl.classList.remove('hidden');
    }
    btn.disabled = false;
    btn.textContent = 'PRESS VINYL ↵';
  }
}

/**
 * Selects a vinyl record, triggers physical slide-out + curved flight into the top capsule,
 * and starts streaming immediately inside the click gesture (guarantees iOS/mobile playback).
 */
function selectVinylTrack(trackId, autoPlay = true) {
  const track = artVinylTracks.find(t => t.id === trackId);
  const audio = document.getElementById('vinyl-audio-engine');
  if (!track || !audio) return;

  // Clicking the already loaded record toggles Play/Pause
  if (activeVinylId === trackId && extractedVinylId === trackId && audio.src === track.audioUrl) {
    toggleVinylPlayPause();
    return;
  }

  activeVinylId = track.id;
  const isSameSrc = audio.src === track.audioUrl;
  if (!isSameSrc) {
    audio.src = track.audioUrl;
    audio.load();
  }

  if (autoPlay) {
    // Trigger play directly inside the click event so mobile Safari never blocks audio
    audio.play().catch(err => console.warn('Playback awaiting interaction:', err));
  }

  // Return any previously loaded record sleeve back to shelf visually
  if (currentView === 'chapter' && activeBookId === 'art') {
    document.querySelectorAll('.vinyl-card').forEach(c => {
      if (c.getAttribute('data-vinyl-card') !== track.id) {
        c.classList.remove('is-in-player', 'is-playing', 'is-pulling', 'border-[#e4d4a7]/45', 'bg-[#e4d4a7]/[0.04]');
      }
    });
    animateVinylExtractionToTopCapsule(track);
  } else {
    extractedVinylId = track.id;
    triggerTopDockPulse();
  }

  syncTopCapsuleVisuals();
  syncArtShelfPlayingState();
}

function toggleVinylPlayPause() {
  const audio = document.getElementById('vinyl-audio-engine');
  const track = artVinylTracks.find(t => t.id === activeVinylId) || artVinylTracks[0];
  if (!audio || !track) return;

  if (audio.src !== track.audioUrl || extractedVinylId !== track.id) {
    selectVinylTrack(track.id, true);
    return;
  }

  if (audio.paused) {
    audio.play().catch(err => console.warn('Playback error:', err));
  } else {
    audio.pause();
  }
}

function playAdjacentVinyl(direction) {
  if (artVinylTracks.length === 0) return;
  const currentIdx = artVinylTracks.findIndex(t => t.id === activeVinylId);
  const safeIdx = currentIdx >= 0 ? currentIdx : 0;
  const nextIdx = (safeIdx + direction + artVinylTracks.length) % artVinylTracks.length;
  selectVinylTrack(artVinylTracks[nextIdx].id, true);
}

function cycleVinylLoopMode() {
  const order = ['all', 'one', 'off'];
  vinylLoopMode = order[(order.indexOf(vinylLoopMode) + 1) % order.length];
  syncTopCapsuleVisuals();
}

function seekVinylTrack(percentVal) {
  const audio = document.getElementById('vinyl-audio-engine');
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  audio.currentTime = (parseFloat(percentVal) / 100) * audio.duration;
  syncVinylProgressOnly(true);
}

function setVinylVolume(val) {
  const audio = document.getElementById('vinyl-audio-engine');
  if (!audio) return;
  audio.volume = Math.max(0, Math.min(1, parseFloat(val)));
}

function toggleEditVinylReview(trackIdOrNull) {
  editingVinylReviewId = trackIdOrNull || null;
  if (currentView === 'chapter' && activeBookId === 'art') {
    renderChapterContent('art');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  }
}

async function saveEditedVinylReview(trackId) {
  const editor = document.getElementById(`vinyl-inline-review-editor-${trackId}`);
  const saveBtn = document.getElementById(`btn-save-vinyl-review-${trackId}`);
  if (!editor) return;

  const updatedReview = editor.value.trim();
  const updatedTracks = artVinylTracks.map(t =>
    t.id === trackId ? { ...t, review: updatedReview } : t
  );

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING...';
  }

  try {
    await saveArtVinylCatalogToR2(updatedTracks);
    artVinylTracks = updatedTracks;
    editingVinylReviewId = null;
    renderChapterContent('art');
    syncTopCapsuleVisuals();
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  } catch (err) {
    console.error('Review save error:', err);
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'RETRY SAVE ↵';
    }
  }
}

async function deleteVinylTrack(trackId, btnEl) {
  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated || !trackId) return;

  if (btnEl && btnEl.dataset.confirm !== 'true') {
    btnEl.dataset.confirm = 'true';
    btnEl.textContent = '[ CONFIRM REMOVE? ]';
    btnEl.classList.add('text-rose-400');
    setTimeout(() => {
      if (btnEl && btnEl.dataset.confirm === 'true') {
        btnEl.dataset.confirm = 'false';
        btnEl.textContent = '[ REMOVE ]';
        btnEl.classList.remove('text-rose-400');
      }
    }, 3000);
    return;
  }

  const targetTrack = artVinylTracks.find(t => t.id === trackId);
  const remainingTracks = artVinylTracks.filter(t => t.id !== trackId);

  try {
    await saveArtVinylCatalogToR2(remainingTracks);

    const { data: sessionData } = await client.auth.getSession();
    const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : '';
    const keysToClean = [targetTrack && targetTrack.audioKey, targetTrack && targetTrack.coverKey].filter(Boolean);
    for (const k of keysToClean) {
      fetch(`${R2_UPLOAD_ENDPOINT}/art-music-file?key=${encodeURIComponent(k)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).catch(() => {});
    }

    const audio = document.getElementById('vinyl-audio-engine');
    if (activeVinylId === trackId && audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      isVinylPlaying = false;
      extractedVinylId = null;
    }

    artVinylTracks = remainingTracks;
    activeVinylId = remainingTracks.length > 0 ? remainingTracks[0].id : null;
    editingVinylReviewId = null;
    renderChapterContent('art');
    syncTopCapsuleVisuals();
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  } catch (err) {
    console.error('Failed to remove vinyl track:', err);
  }
}

function bindVinylAudioEngineEvents() {
  const audio = document.getElementById('vinyl-audio-engine');
  if (!audio) return;
  audio.volume = 0.85;

  // Zero-silence CORS fallback: if R2 CORS header isn't configured yet, drop crossOrigin
  // and reload cleanly while rendering smooth champagne-gold rhythm halo.
  audio.addEventListener('error', () => {
    if (audio.crossOrigin && audio.src && !audio.dataset.corsFallbackApplied) {
      audio.dataset.corsFallbackApplied = '1';
      const resumeSrc = audio.src;
      const shouldResume = Boolean(activeVinylId);
      if (capsuleHaloEngine) capsuleHaloEngine.useFallback = true;
      audio.removeAttribute('crossorigin');
      audio.crossOrigin = null;
      audio.src = resumeSrc;
      audio.load();
      if (shouldResume) {
        audio.play().catch(() => {});
      }
    }
  });

  audio.addEventListener('play', () => {
    isVinylPlaying = true;
    syncTopVinylDockForRoute();
    syncTopCapsuleVisuals();
    syncArtShelfPlayingState();
  });

  audio.addEventListener('pause', () => {
    isVinylPlaying = false;
    syncTopCapsuleVisuals();
    syncArtShelfPlayingState();
  });

  audio.addEventListener('timeupdate', () => {
    syncVinylProgressOnly(false);
  });

  audio.addEventListener('loadedmetadata', () => {
    syncVinylProgressOnly(true);
  });

  audio.addEventListener('ended', () => {
    if (vinylLoopMode === 'one') {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    if (vinylLoopMode === 'all' && artVinylTracks.length > 0) {
      if (artVinylTracks.length === 1) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        playAdjacentVinyl(1);
      }
      return;
    }
    // Loop mode OFF: advance sequentially until the final track ends
    const currentIdx = artVinylTracks.findIndex(t => t.id === activeVinylId);
    if (currentIdx >= 0 && currentIdx < artVinylTracks.length - 1) {
      playAdjacentVinyl(1);
    } else {
      isVinylPlaying = false;
      syncTopCapsuleVisuals();
      syncArtShelfPlayingState();
    }
  });
}


/* ========================================================================
   TOP CAPSULE REAL-TIME CHAMPAGNE-GOLD AUDIO-REACTIVE HALO ENGINE
   ======================================================================== */
class CapsuleHaloEngine {
  constructor(audioEl) {
    this.audio = audioEl;
    this.ctx = null;
    this.analyser = null;
    this.dataArray = null;
    this.activeCanvas = null;
    this.rafId = null;
    this.useFallback = false;
    this.silentFrameCount = 0;
  }

  initAudioGraph() {
    if (this.ctx || this.useFallback || !this.audio) return;
    if (!this.audio.crossOrigin) {
      this.useFallback = true;
      return;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        this.useFallback = true;
        return;
      }
      this.ctx = new AudioCtx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;
      const source = this.ctx.createMediaElementSource(this.audio);
      source.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (_err) {
      this.useFallback = true;
    }
  }

  attach(canvasEl) {
    if (!canvasEl) {
      this.stop();
      return;
    }
    if (this.activeCanvas === canvasEl && this.rafId) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    this.stop();
    this.activeCanvas = canvasEl;
    this.silentFrameCount = 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvasEl.getBoundingClientRect();
    const cssSize = Math.round(rect.width) || (isTopVinylCollapsed ? 50 : 64);
    canvasEl.width = cssSize * dpr;
    canvasEl.height = cssSize * dpr;

    this.initAudioGraph();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.render();
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.activeCanvas) {
      const c = this.activeCanvas.getContext('2d');
      if (c) c.clearRect(0, 0, this.activeCanvas.width, this.activeCanvas.height);
      this.activeCanvas = null;
    }
    document.querySelectorAll('.js-top-pill-shell').forEach(el => {
      el.classList.remove('is-halo-active');
      el.style.removeProperty('--capsule-bass');
    });
  }

  render() {
    if (!this.activeCanvas || !this.audio || this.audio.paused) {
      this.stop();
      return;
    }

    const canvas = this.activeCanvas;
    const c = canvas.getContext('2d');
    if (!c) {
      this.stop();
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = w * 0.27;
    const bars = 32;
    const now = performance.now() * 0.003;

    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    let bassAvg = 0;
    let totalEnergy = 0;

    if (!this.useFallback && this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      for (let i = 0; i < 8; i++) bassAvg += this.dataArray[i];
      for (let i = 0; i < this.dataArray.length; i++) totalEnergy += this.dataArray[i];
      bassAvg /= (8 * 255);

      if (totalEnergy === 0 && this.audio.currentTime > 0.35) {
        this.silentFrameCount += 1;
        if (this.silentFrameCount > 45) {
          this.useFallback = true;
        }
      } else {
        this.silentFrameCount = 0;
      }
    }

    if (this.useFallback || !this.analyser) {
      bassAvg = 0.26 + 0.16 * Math.sin(now * 2.2) + 0.08 * Math.sin(now * 4.5);
    }

    // Modulate champagne-gold border & aura on the top capsule pill
    document.querySelectorAll('.js-top-pill-shell').forEach(el => {
      el.classList.add('is-halo-active');
      el.style.setProperty('--capsule-bass', bassAvg.toFixed(3));
    });

    // 1. Soft Champagne-Gold Bass Halo Behind Mini Vinyl
    const glowR = baseRadius + 7 + bassAvg * 7;
    const grad = c.createRadialGradient(cx, cy, Math.max(2, baseRadius - 2), cx, cy, glowR + 6);
    grad.addColorStop(0, 'rgba(228, 212, 167, 0.45)');
    grad.addColorStop(0.55, 'rgba(240, 214, 158, 0.18)');
    grad.addColorStop(1, 'rgba(228, 212, 167, 0)');
    c.fillStyle = grad;
    c.beginPath();
    c.arc(cx, cy, glowR + 6, 0, Math.PI * 2);
    c.fill();

    // 2. Crisp Mini Champagne-Gold Audio-Reactive Star Ring Rays
    c.lineWidth = 1.25;
    c.lineCap = 'round';
    for (let i = 0; i < bars; i++) {
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
      let amp = 0;
      if (!this.useFallback && this.dataArray) {
        const bin = Math.floor((i / bars) * Math.min(36, this.dataArray.length));
        amp = (this.dataArray[bin] || 0) / 255;
      } else {
        amp = 0.2 + 0.28 * Math.abs(Math.sin(now * 1.9 + i * 0.48)) + 0.08 * Math.cos(now * 3.3 - i * 0.25);
      }

      const len = 2 + amp * 8.5;
      const x1 = cx + Math.cos(angle) * (baseRadius + 1.5);
      const y1 = cy + Math.sin(angle) * (baseRadius + 1.5);
      const x2 = cx + Math.cos(angle) * (baseRadius + 1.5 + len);
      const y2 = cy + Math.sin(angle) * (baseRadius + 1.5 + len);

      const alpha = (0.42 + amp * 0.55).toFixed(2);
      c.strokeStyle = i % 3 === 0
        ? `rgba(255, 249, 232, ${alpha})`
        : `rgba(232, 208, 152, ${alpha})`;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
    }

    c.restore();
    this.rafId = requestAnimationFrame(() => this.render());
  }
}

let capsuleHaloEngine = null;

function ensureCapsuleHaloEngine() {
  if (!capsuleHaloEngine) {
    const audio = document.getElementById('vinyl-audio-engine');
    if (audio) capsuleHaloEngine = new CapsuleHaloEngine(audio);
  }
  return capsuleHaloEngine;
}

function syncTopCapsuleHaloState() {
  const engine = ensureCapsuleHaloEngine();
  if (!engine) return;
  const dock = document.getElementById('top-vinyl-dock');
  const dockVisible = dock && !dock.classList.contains('hidden');
  if (isVinylPlaying && dockVisible) {
    const targetCanvas = document.getElementById(isTopVinylCollapsed ? 'top-orb-halo-canvas' : 'top-capsule-halo-canvas');
    if (targetCanvas) {
      engine.attach(targetCanvas);
      return;
    }
  }
  engine.stop();
}
