/* ==========================================================================
   VOLUME R: RUDY'S PROFILE & DIRECT CORRESPONDENCE (TELEGRAM RELAY)
   ========================================================================== */

// Direct Correspondence Modal State
let isDirectMessageModalOpen = false;
let lastDirectMessageSentAt = 0;

/**
 * Builds the minimalist Editorial Constellation Profile HTML:
 * - Open floating portrait (no heavy box) orbited by 3 gently glowing Focus graph nodes
 *   (English Learning, Thinking, Math) connected by fine constellation hairlines.
 * - Clean serif identity & open Bio statement (Motto removed per user request).
 * - Retains Moments preview bar & Send Message popup button.
 */
function buildProfileHtml() {
  const latestThumbs = getLatestMomentThumbnails(3);
  const thumbsHtml = latestThumbs.length > 0
    ? latestThumbs.map((src, idx) => {
        const label = String(idx + 1).padStart(2, '0');
        return `
          <img
            src="${src}"
            alt="Moment preview ${label}"
            loading="lazy"
            decoding="async"
            onerror="this.onerror=null; this.src='https://placehold.co/100x100/22252a/e4d4a7?text=${label}';"
            class="w-11 h-11 rounded-lg object-cover border border-white/15 bg-[#1a1c20] transition-transform duration-300 group-hover:scale-105"
          />
        `;
      }).join('')
    : `<span class="font-mono-code text-[10px] tracking-wider uppercase text-white/35">OPEN FEED</span>`;

  return `
    <!-- Minimalist Constellation Graph Profile Layout -->
    <div class="max-w-lg mx-auto pt-1 space-y-6">

      <!-- 1. Open Constellation Graph: Glowing Focus Nodes Orbiting Rudy's Portrait -->
      <div class="relative w-full max-w-[420px] h-[250px] sm:h-[276px] mx-auto select-none">
        <!-- Fine Orbital Hairlines & Graph Edges -->
        <svg
          viewBox="0 0 420 276"
          fill="none"
          aria-hidden="true"
          class="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
        >
          <defs>
            <radialGradient id="profileCoreHalo" cx="50%" cy="52%" r="48%">
              <stop offset="0%" stop-color="#e4d4a7" stop-opacity="0.16" />
              <stop offset="55%" stop-color="#a7b08e" stop-opacity="0.05" />
              <stop offset="100%" stop-color="#0c0d0f" stop-opacity="0" />
            </radialGradient>
            <linearGradient id="graphEdgeGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#e4d4a7" stop-opacity="0.52" />
              <stop offset="100%" stop-color="#a7b08e" stop-opacity="0.18" />
            </linearGradient>
          </defs>

          <!-- Soft Ambient Halo Behind Center Portrait -->
          <circle cx="210" cy="144" r="118" fill="url(#profileCoreHalo)" />

          <!-- Concentric Fine Celestial Orbits -->
          <circle cx="210" cy="144" r="78" stroke="rgba(228, 212, 167, 0.14)" stroke-width="1" />
          <circle cx="210" cy="144" r="116" stroke="rgba(228, 212, 167, 0.08)" stroke-width="1" stroke-dasharray="3 5" />

          <!-- Subtle Secondary Graph Triangle Connecting the 3 Focus Nodes -->
          <path
            d="M 88 38 L 340 62 L 96 234 Z"
            stroke="rgba(228, 212, 167, 0.09)"
            stroke-width="1"
            stroke-dasharray="2 5"
          />

          <!-- Primary Constellation Rays From Center Portrait to Focus Nodes -->
          <line x1="210" y1="144" x2="88" y2="38" stroke="url(#graphEdgeGold)" stroke-width="1" />
          <line x1="210" y1="144" x2="340" y2="62" stroke="url(#graphEdgeGold)" stroke-width="1" />
          <line x1="210" y1="144" x2="96" y2="234" stroke="url(#graphEdgeGold)" stroke-width="1" />

          <!-- Decorative Micro-Starlight Points Along Outer Orbit -->
          <circle cx="322" cy="176" r="1.8" fill="#e4d4a7" fill-opacity="0.45" />
          <circle cx="268" cy="244" r="1.4" fill="#a7b08e" fill-opacity="0.5" />
          <circle cx="104" cy="124" r="1.5" fill="#e4d4a7" fill-opacity="0.35" />
        </svg>

        <!-- Center Floating Circular Avatar -->
        <div class="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 z-10">
          <div class="w-24 h-24 sm:w-28 sm:h-28 rounded-full p-[2px] bg-gradient-to-tr from-[#e4d4a7]/90 via-[#a7b08e]/75 to-[#f3f1ec]/80 shadow-[0_0_34px_rgba(228,212,167,0.22)]">
            <img
              src="./avatar.jpg"
              alt="Rudy's Avatar"
              decoding="async"
              onerror="this.onerror=null; this.src='https://placehold.co/320x320/1c1f1a/e4d4a7?text=Rudy';"
              class="w-full h-full rounded-full object-cover bg-[#181a17]"
            />
          </div>
        </div>

        <!-- Focus Graph Node 1: English Learning -->
        <div
          class="profile-focus-node absolute top-[4%] left-[0%] sm:left-[3%] z-20 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#e4d4a7]/35 bg-[#121417]/88 backdrop-blur-md"
          style="animation-delay: 0s;"
        >
          <span class="profile-focus-dot w-1.5 h-1.5 rounded-full bg-[#e4d4a7] shrink-0"></span>
          <span class="font-mono-code text-[10px] sm:text-[11px] tracking-wide text-[#f4ecd4] whitespace-nowrap">
            English Learning
          </span>
        </div>

        <!-- Focus Graph Node 2: Thinking -->
        <div
          class="profile-focus-node absolute top-[14%] right-[0%] sm:right-[4%] z-20 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#e4d4a7]/35 bg-[#121417]/88 backdrop-blur-md"
          style="animation-delay: 1.4s;"
        >
          <span class="profile-focus-dot w-1.5 h-1.5 rounded-full bg-[#a7b08e] shrink-0" style="animation-delay: 1.1s;"></span>
          <span class="font-mono-code text-[10px] sm:text-[11px] tracking-wide text-[#f4ecd4] whitespace-nowrap">
            Thinking
          </span>
        </div>

        <!-- Focus Graph Node 3: Math -->
        <div
          class="profile-focus-node absolute bottom-[6%] left-[5%] sm:left-[10%] z-20 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#e4d4a7]/35 bg-[#121417]/88 backdrop-blur-md"
          style="animation-delay: 2.7s;"
        >
          <span class="profile-focus-dot w-1.5 h-1.5 rounded-full bg-[#e4d4a7] shrink-0" style="animation-delay: 2.1s;"></span>
          <span class="font-mono-code text-[10px] sm:text-[11px] tracking-wide text-[#f4ecd4] whitespace-nowrap">
            Math
          </span>
        </div>
      </div>

      <!-- 2. Open Editorial Identity & Bio (Seamless Typography, No Box Clutter) -->
      <div class="text-center space-y-2.5 px-2">
        <h2 class="font-serif-editorial text-3xl sm:text-4xl text-[#f3f1ec] tracking-tight">
          Rudy
        </h2>
        <p class="font-mono-code text-[11px] tracking-[0.16em] text-white/45">
          ID: StudyEnglishWith_me
        </p>

        <div class="w-12 h-[1px] mx-auto my-4 bg-gradient-to-r from-transparent via-[#e4d4a7]/50 to-transparent"></div>

        <p class="max-w-md mx-auto font-serif-editorial text-[16px] sm:text-[17px] leading-relaxed text-[#f3f1ec]/85 pt-0.5">
          Speaking as a self-learner, if studying never really ends, what’s the real goal of it all? ❤️Honestly, it’s sharing, because that’s the only way we both keep improving.
        </p>
      </div>

      <!-- 3. Retained Moments Bar & Direct Send Message Action -->
      <div class="max-w-md mx-auto pt-2 space-y-3.5">
        <button
          type="button"
          onclick="switchChapterDirectly('moment')"
          class="w-full rounded-xl border border-white/10 bg-white/[0.025] hover:border-[#e4d4a7]/40 hover:bg-white/[0.05] px-4 py-3.5 flex items-center justify-between gap-3 transition-all duration-300 cursor-pointer group"
        >
          <div class="text-left">
            <span class="block font-serif-editorial text-lg text-[#f3f1ec] leading-tight">
              Moments
            </span>
            <span class="block font-mono-code text-[9px] tracking-[0.16em] uppercase text-white/40 mt-0.5">
              RECENT SNAPSHOTS
            </span>
          </div>

          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1.5">
              ${thumbsHtml}
            </div>
            <span class="text-base text-white/40 group-hover:text-[#e4d4a7] group-hover:translate-x-0.5 transition-all ml-1">›</span>
          </div>
        </button>

        <button
          type="button"
          onclick="openDirectMessageModal()"
          class="w-full rounded-xl bg-[#e4d4a7] hover:bg-[#f0e3bd] text-[#0c0d0f] font-medium text-sm py-3.5 px-5 flex items-center justify-center gap-2.5 shadow-[0_8px_28px_rgba(228,212,167,0.16)] transition cursor-pointer group"
        >
          <svg class="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
          <span>Send Message</span>
        </button>
      </div>

    </div>
  `;
}

/* ========================================================================
   PROFILE DIRECT CORRESPONDENCE DIALOG (POPUP, MINIMIZE & CLOSE)
   ======================================================================== */
function openDirectMessageModal() {
  const modal = document.getElementById('direct-message-modal');
  const panel = document.getElementById('direct-message-panel');
  const miniPill = document.getElementById('direct-minimized-pill');
  if (!modal || !panel) return;

  isDirectMessageModalOpen = true;
  if (miniPill) miniPill.classList.add('hidden');
  modal.classList.remove('hidden');

  requestAnimationFrame(() => {
    modal.classList.remove('opacity-0');
    panel.classList.remove('translate-y-10', 'opacity-0');
  });

  setTimeout(() => {
    const msgInput = document.getElementById('dm-message-body');
    if (msgInput) msgInput.focus();
  }, 120);
}

function minimizeDirectMessageModal() {
  const modal = document.getElementById('direct-message-modal');
  const panel = document.getElementById('direct-message-panel');
  const miniPill = document.getElementById('direct-minimized-pill');
  if (!modal || !panel) return;

  isDirectMessageModalOpen = false;
  modal.classList.add('opacity-0');
  panel.classList.add('translate-y-10', 'opacity-0');

  setTimeout(() => {
    if (!isDirectMessageModalOpen) {
      modal.classList.add('hidden');
      if (miniPill) miniPill.classList.remove('hidden');
    }
  }, 260);
}

function closeDirectMessageModal() {
  const modal = document.getElementById('direct-message-modal');
  const panel = document.getElementById('direct-message-panel');
  const miniPill = document.getElementById('direct-minimized-pill');
  const statusEl = document.getElementById('dm-message-status');

  isDirectMessageModalOpen = false;
  if (miniPill) miniPill.classList.add('hidden');
  if (statusEl) statusEl.textContent = '';

  if (modal && panel) {
    modal.classList.add('opacity-0');
    panel.classList.add('translate-y-10', 'opacity-0');
    setTimeout(() => {
      if (!isDirectMessageModalOpen) modal.classList.add('hidden');
    }, 260);
  }
}

async function handleDirectMessageSubmit(event) {
  event.preventDefault();

  const nameEl = document.getElementById('dm-sender-name');
  const contactEl = document.getElementById('dm-sender-contact');
  const bodyEl = document.getElementById('dm-message-body');
  const statusEl = document.getElementById('dm-message-status');
  const btn = document.getElementById('btn-send-dm-message');
  if (!bodyEl || !statusEl || !btn) return;

  const message = bodyEl.value.trim();
  const name = nameEl ? nameEl.value.trim() : '';
  const contact = contactEl ? contactEl.value.trim() : '';

  if (!message) {
    statusEl.textContent = 'Please write a short note first.';
    statusEl.className = 'font-mono-code text-[11px] min-h-[16px] text-amber-300';
    return;
  }

  const nowMs = Date.now();
  if (nowMs - lastDirectMessageSentAt < 8000) {
    statusEl.textContent = 'Please wait a few seconds before sending another note.';
    statusEl.className = 'font-mono-code text-[11px] min-h-[16px] text-amber-300';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'SENDING...';
  statusEl.textContent = 'Sending your note to Rudy...';
  statusEl.className = 'font-mono-code text-[11px] min-h-[16px] text-[#e4d4a7]';

  try {
    const relayPath = ['/', 'tele', 'gram-message'].join('');
    const res = await fetch(`${R2_UPLOAD_ENDPOINT}${relayPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contact, message })
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      throw new Error('Delivery unavailable');
    }

    lastDirectMessageSentAt = Date.now();
    bodyEl.value = '';
    statusEl.textContent = '✓ Delivered to Rudy — thank you for writing!';
    statusEl.className = 'font-mono-code text-[11px] min-h-[16px] text-emerald-400';

    setTimeout(() => {
      if (isDirectMessageModalOpen) {
        closeDirectMessageModal();
      }
    }, 2200);
  } catch (_err) {
    statusEl.textContent = 'Could not send note right now. Please try again shortly.';
    statusEl.className = 'font-mono-code text-[11px] min-h-[16px] text-rose-400';
  } finally {
    btn.disabled = false;
    btn.textContent = 'SEND NOTE ↵';
  }
}
