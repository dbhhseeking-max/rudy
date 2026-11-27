/* ==========================================================================
   VOLUME R: RUDY'S PROFILE, DYNAMIC CONSTELLATION TAGS & TELEGRAM RELAY
   ========================================================================== */

// Direct Correspondence Modal State
const DM_COOLDOWN_KEY = 'rudy_dm_last_sent_v1';
let isDirectMessageModalOpen = false;
let directMessageOpenedAt = 0;
let lastDirectMessageSentAt = (() => {
  try {
    return Number(localStorage.getItem(DM_COOLDOWN_KEY) || 0) || 0;
  } catch (_e) {
    return 0;
  }
})();

// Admin Profile Customization Panel State
let isProfileTagEditorOpen = false;
let profileConfigSaveMsg = '';
let profileConfigSaveTone = 'muted'; // 'muted' | 'ok' | 'err'

const PROFILE_TAG_COLORS = ['#e4d4a7', '#a7b08e', '#7cc4fa', '#f0a8c3'];

/**
 * Computes balanced orbital coordinates in a 440 x 300 constellation viewBox
 * centered strictly at (220, 150) so 1..8 focus tags orbit the avatar cleanly.
 */
function computeProfileConstellationNodes(tags) {
  const cx = 220;
  const cy = 150;
  const count = tags.length;
  if (count === 0) return [];

  // Curated editorial angles for 1-3 tags; balanced elliptical orbit for 4-8 tags
  const presets = {
    1: [{ deg: -90, rx: 140, ry: 108 }],
    2: [
      { deg: -145, rx: 148, ry: 98 },
      { deg: -35, rx: 148, ry: 98 }
    ],
    3: [
      { deg: -142, rx: 148, ry: 108 },
      { deg: -26, rx: 150, ry: 96 },
      { deg: 136, rx: 144, ry: 106 }
    ]
  };

  return tags.map((tag, idx) => {
    let rad;
    let rx = 152;
    let ry = 108;

    if (presets[count] && presets[count][idx]) {
      rad = (presets[count][idx].deg * Math.PI) / 180;
      rx = presets[count][idx].rx;
      ry = presets[count][idx].ry;
    } else {
      const startDeg = -132;
      const deg = startDeg + (360 / count) * idx;
      rad = (deg * Math.PI) / 180;
      // Slightly wider horizontally when crowded
      if (count >= 6) {
        rx = 156;
        ry = 114;
      }
    }

    const x = cx + Math.cos(rad) * rx;
    const y = cy + Math.sin(rad) * ry;
    const clampedX = Math.max(58, Math.min(382, x));
    const clampedY = Math.max(26, Math.min(274, y));

    return {
      ...tag,
      x: Math.round(clampedX * 10) / 10,
      y: Math.round(clampedY * 10) / 10,
      xPct: ((clampedX / 440) * 100).toFixed(2),
      yPct: ((clampedY / 300) * 100).toFixed(2)
    };
  });
}

/**
 * Builds the minimalist Editorial Constellation Profile HTML:
 * - Centered circular portrait strictly aligned and proportioned inside the solid golden ring.
 * - Dynamic glowing Focus graph nodes orbiting the portrait (editable by Admin, synced via R2).
 * - Clean serif identity, Bio statement, Moments preview bar & Send Message popup button.
 */
function buildProfileHtml() {
  const tags = Array.isArray(siteConfig.profileTags) ? siteConfig.profileTags : [];
  const nodes = computeProfileConstellationNodes(tags);

  const raysSvg = nodes.map(n => `
    <line x1="220" y1="150" x2="${n.x}" y2="${n.y}" stroke="url(#graphEdgeGold)" stroke-width="1" />
  `).join('');

  const polygonSvg = nodes.length >= 3
    ? `<polygon points="${nodes.map(n => `${n.x},${n.y}`).join(' ')}" stroke="rgba(228, 212, 167, 0.1)" stroke-width="1" stroke-dasharray="2 5" fill="none" />`
    : (nodes.length === 2
      ? `<line x1="${nodes[0].x}" y1="${nodes[0].y}" x2="${nodes[1].x}" y2="${nodes[1].y}" stroke="rgba(228, 212, 167, 0.1)" stroke-width="1" stroke-dasharray="2 5" />`
      : '');

  const nodesHtml = nodes.map((n, idx) => {
    const safeLabel = escapeHtmlSafely(n.label);
    const delay = (idx * 1.15).toFixed(2);
    const dotColor = n.color || '#e4d4a7';
    const adminClickAttr = isAuthorAuthenticated
      ? `onclick="toggleProfileTagEditor(true)" title="Click to customize Focus Tags"`
      : '';
    return `
      <div
        class="profile-node-anchor"
        style="left: ${n.xPct}%; top: ${n.yPct}%;"
      >
        <div
          ${adminClickAttr}
          class="profile-focus-node inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#e4d4a7]/35 bg-[#121417]/90 backdrop-blur-md ${isAuthorAuthenticated ? 'cursor-pointer hover:border-[#e4d4a7]/70' : ''}"
          style="animation-delay: ${delay}s;"
        >
          <span class="profile-focus-dot w-1.5 h-1.5 rounded-full shrink-0" style="background-color: ${dotColor}; animation-delay: ${(idx * 0.85).toFixed(2)}s;"></span>
          <span class="font-mono-code text-[10px] sm:text-[11px] tracking-wide text-[#f4ecd4] whitespace-nowrap">
            ${safeLabel}
          </span>
        </div>
      </div>
    `;
  }).join('');

  const latestThumbs = getLatestMomentThumbnails(3);
  const thumbsHtml = latestThumbs.length > 0
    ? latestThumbs.map((src, idx) => {
        const label = String(idx + 1).padStart(2, '0');
        return `
          <img
            src="${escapeHtmlSafely(src)}"
            alt="Moment preview ${label}"
            loading="lazy"
            decoding="async"
            onerror="this.onerror=null; this.src=getInlineSvgFallbackDataUri('${label}');"
            class="w-11 h-11 rounded-lg object-cover border border-white/15 bg-[#1a1c20] transition-transform duration-300 group-hover:scale-105"
          />
        `;
      }).join('')
    : `<span class="font-mono-code text-[10px] tracking-wider uppercase text-white/35">OPEN FEED</span>`;

  // Admin-only Studio Bar to Add / Edit / Delete Focus Tags & Customize Butterfly Speech Bubble
  let adminCustomizerHtml = '';
  if (isAuthorAuthenticated) {
    const statusColor = profileConfigSaveTone === 'ok'
      ? 'text-emerald-400'
      : (profileConfigSaveTone === 'err' ? 'text-rose-400' : 'text-[#e4d4a7]/75');

    const tagEditorRows = tags.length > 0
      ? tags.map((t, idx) => `
          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick="cycleProfileTagColor('${t.id}')"
              title="Switch glow dot color"
              class="w-6 h-6 rounded-full border border-white/15 bg-black/40 flex items-center justify-center shrink-0 cursor-pointer hover:border-[#e4d4a7]/60 transition"
            >
              <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${t.color || '#e4d4a7'};"></span>
            </button>
            <input
              id="profile-tag-input-${idx}"
              type="text"
              maxlength="32"
              value="${escapeHtmlSafely(t.label)}"
              onchange="updateProfileTagLabel('${t.id}', this.value)"
              onkeydown="if (event.key === 'Enter') { event.preventDefault(); this.blur(); }"
              class="flex-1 min-w-0 rounded-lg bg-black/45 border border-white/12 px-2.5 py-1.5 text-xs text-[#f3f1ec] focus:outline-none focus:border-[#e4d4a7]"
            />
            <button
              type="button"
              onclick="deleteProfileTag('${t.id}')"
              title="Delete tag"
              aria-label="Delete ${escapeHtmlSafely(t.label)}"
              class="w-7 h-7 rounded-lg border border-white/10 bg-white/[0.03] hover:border-rose-400/50 hover:bg-rose-500/15 text-white/45 hover:text-rose-300 font-mono-code text-xs flex items-center justify-center shrink-0 transition cursor-pointer"
            >✕</button>
          </div>
        `).join('')
      : `<p class="font-mono-code text-[11px] text-white/40 py-1">No tags yet. Add one below.</p>`;

    const editorBody = isProfileTagEditorOpen
      ? `
        <div class="pt-3 border-t border-white/10 space-y-4">
          <!-- Rudy Avatar Upload (Admin Only) -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono-code text-[10px] tracking-[0.16em] uppercase text-white/50">
                RUDY'S AVATAR
              </span>
              <span class="font-mono-code text-[10px] text-white/35">Saved to Cloudflare R2</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onclick="triggerRudyAvatarUpload()"
                class="px-3 py-1.5 rounded-lg bg-[#e4d4a7]/20 hover:bg-[#e4d4a7]/30 border border-[#e4d4a7]/45 font-mono-code text-[11px] text-[#e4d4a7] transition cursor-pointer"
              >↑ UPLOAD NEW AVATAR</button>
              <button
                type="button"
                onclick="openFriendsSkyFromProfile()"
                class="px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.04] hover:border-[#e4d4a7]/45 font-mono-code text-[11px] text-white/75 hover:text-[#e4d4a7] transition cursor-pointer"
              >✦ MANAGE FRIEND LIST</button>
            </div>
          </div>

          <!-- Focus Tags CRUD -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-mono-code text-[10px] tracking-[0.16em] uppercase text-white/50">
                ORBIT FOCUS TAGS (${tags.length}/8)
              </span>
              <span class="font-mono-code text-[10px] text-white/35">Edit &amp; press Enter</span>
            </div>

            <div class="space-y-2">
              ${tagEditorRows}
            </div>

            ${tags.length < 8 ? `
              <form onsubmit="handleAddProfileTag(event)" class="flex items-center gap-2 pt-1">
                <input
                  id="new-profile-tag-input"
                  type="text"
                  maxlength="32"
                  placeholder="Add new tag (e.g. Physics, Reading)..."
                  class="flex-1 min-w-0 rounded-lg bg-black/45 border border-white/15 px-3 py-1.5 text-xs text-[#f3f1ec] placeholder-white/30 focus:outline-none focus:border-[#e4d4a7]"
                />
                <button
                  type="submit"
                  class="px-3 py-1.5 rounded-lg bg-[#e4d4a7]/20 hover:bg-[#e4d4a7]/30 border border-[#e4d4a7]/45 font-mono-code text-[11px] text-[#e4d4a7] transition cursor-pointer shrink-0"
                >+ ADD</button>
              </form>
            ` : ''}
          </div>

          <!-- Butterfly Speech Bubble Text Editor -->
          <div class="space-y-1.5 pt-2 border-t border-white/10">
            <label for="profile-butterfly-bubble-input" class="block font-mono-code text-[10px] tracking-[0.16em] uppercase text-white/50">
              NAV BUTTERFLY SPEECH BUBBLE
            </label>
            <form onsubmit="handleProfileButterflyBubbleSubmit(event)" class="flex items-center gap-2">
              <input
                id="profile-butterfly-bubble-input"
                type="text"
                maxlength="80"
                value="${escapeHtmlSafely(siteConfig.butterflyBubbleText || 'Close this page?')}"
                placeholder="Close this page?"
                class="flex-1 min-w-0 rounded-lg bg-black/45 border border-white/15 px-3 py-1.5 text-xs text-[#f3f1ec] placeholder-white/30 focus:outline-none focus:border-[#e4d4a7]"
              />
              <button
                type="submit"
                class="px-3 py-1.5 rounded-lg bg-[#e4d4a7] hover:bg-[#f2e5bf] text-[#0c0d0f] font-mono-code text-[11px] font-medium transition cursor-pointer shrink-0"
              >SAVE ↵</button>
            </form>
          </div>

          <!-- Back-to-Top Butterfly Bubble Editor (Moments & Art) -->
          <div class="space-y-1.5 pt-2 border-t border-white/10">
            <label for="profile-backtop-bubble-input" class="block font-mono-code text-[10px] tracking-[0.16em] uppercase text-white/50">
              BACK-TO-TOP BUBBLE (EMPTY = HIDDEN)
            </label>
            <form onsubmit="handleProfileBackTopBubbleSubmit(event)" class="flex items-center gap-2">
              <input
                id="profile-backtop-bubble-input"
                type="text"
                maxlength="80"
                value="${escapeHtmlSafely(typeof siteConfig.backToTopBubbleText === 'string' ? siteConfig.backToTopBubbleText : 'Back to top?')}"
                placeholder="Leave blank to hide bubble"
                class="flex-1 min-w-0 rounded-lg bg-black/45 border border-white/15 px-3 py-1.5 text-xs text-[#f3f1ec] placeholder-white/30 focus:outline-none focus:border-[#e4d4a7]"
              />
              <button
                type="submit"
                class="px-3 py-1.5 rounded-lg bg-[#e4d4a7] hover:bg-[#f2e5bf] text-[#0c0d0f] font-mono-code text-[11px] font-medium transition cursor-pointer shrink-0"
              >SAVE ↵</button>
              <button
                type="button"
                onclick="handleClearBackTopBubble()"
                title="Delete Back-to-Top Bubble"
                class="px-2.5 py-1.5 rounded-lg border border-white/12 hover:border-rose-400/50 text-[10px] font-mono-code text-white/55 hover:text-rose-300 transition cursor-pointer shrink-0"
              >DEL</button>
            </form>
          </div>

          ${profileConfigSaveMsg ? `<p class="font-mono-code text-[11px] ${statusColor}">${escapeHtmlSafely(profileConfigSaveMsg)}</p>` : ''}
        </div>
      `
      : '';

    adminCustomizerHtml = `
      <div class="max-w-md mx-auto rounded-xl border border-[#e4d4a7]/30 bg-[#17181c]/95 px-4 py-3 space-y-2 shadow-lg">
        <div class="flex items-center justify-between gap-2">
          <button
            type="button"
            onclick="toggleProfileTagEditor()"
            class="flex items-center gap-2 text-left cursor-pointer group"
          >
            <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
            <span class="font-mono-code text-[11px] tracking-wider uppercase text-[#e4d4a7] group-hover:text-white transition">
              ✦ AUTHOR · EDIT TAGS &amp; BUTTERFLY
            </span>
          </button>
          <div class="flex items-center gap-2.5">
            <button
              type="button"
              onclick="toggleProfileTagEditor()"
              class="font-mono-code text-[10px] text-white/55 hover:text-[#e4d4a7] transition cursor-pointer"
            >${isProfileTagEditorOpen ? '[ HIDE ]' : '[ EDIT ]'}</button>
            <button
              type="button"
              onclick="handleAuthorLogout()"
              class="font-mono-code text-[10px] text-white/40 hover:text-rose-300 transition cursor-pointer"
            >[ SIGN OUT ]</button>
          </div>
        </div>
        ${editorBody}
      </div>
    `;
  }

  return `
    <!-- Minimalist Constellation Graph Profile Layout -->
    <div class="max-w-lg mx-auto pt-1 space-y-6">

      <!-- 1. Open Constellation Graph: Glowing Focus Nodes Orbiting Rudy's Portrait -->
      <div class="profile-constellation-stage select-none">
        <!-- Fine Orbital Hairlines & Dynamic Graph Edges (Exact 440x300 Coordinate Space) -->
        <svg
          viewBox="0 0 440 300"
          fill="none"
          aria-hidden="true"
          class="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
        >
          <defs>
            <radialGradient id="profileCoreHalo" cx="50%" cy="50%" r="48%">
              <stop offset="0%" stop-color="#e4d4a7" stop-opacity="0.18" />
              <stop offset="55%" stop-color="#a7b08e" stop-opacity="0.06" />
              <stop offset="100%" stop-color="#0c0d0f" stop-opacity="0" />
            </radialGradient>
            <linearGradient id="graphEdgeGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#e4d4a7" stop-opacity="0.52" />
              <stop offset="100%" stop-color="#a7b08e" stop-opacity="0.2" />
            </linearGradient>
          </defs>

          <!-- Soft Ambient Halo Behind Center Portrait -->
          <circle cx="220" cy="150" r="122" fill="url(#profileCoreHalo)" />

          <!-- Outer Dashed Celestial Orbit -->
          <circle cx="220" cy="150" r="118" stroke="rgba(228, 212, 167, 0.09)" stroke-width="1" stroke-dasharray="3 5" />

          <!-- Dynamic Connecting Polygon & Primary Constellation Rays -->
          ${polygonSvg}
          ${raysSvg}

          <!-- Inner Solid Golden Ring (Concentrically matched to Avatar Core r=64) -->
          <circle cx="220" cy="150" r="64" stroke="rgba(228, 212, 167, 0.42)" stroke-width="1.25" />

          <!-- Decorative Micro-Starlight Points Along Outer Orbit -->
          <circle cx="332" cy="186" r="1.8" fill="#e4d4a7" fill-opacity="0.45" />
          <circle cx="278" cy="258" r="1.4" fill="#a7b08e" fill-opacity="0.5" />
          <circle cx="106" cy="130" r="1.5" fill="#e4d4a7" fill-opacity="0.35" />
        </svg>

        <!-- Center Floating Circular Avatar (Click to ascend into Starry Friend List) -->
        <div id="profile-rudy-avatar-core" class="profile-avatar-core z-10">
          <button
            type="button"
            onclick="openFriendsSkyFromProfile(event)"
            title="Enter Rudy's Starry Friend List"
            aria-label="Enter Rudy's Starry Friend List"
            class="profile-avatar-trigger group relative block w-full h-full rounded-full p-[2px] bg-gradient-to-tr from-[#e4d4a7]/95 via-[#a7b08e]/75 to-[#f3f1ec]/85 shadow-[0_0_26px_rgba(228,212,167,0.22)] cursor-pointer focus:outline-none"
          >
            <img
              id="profile-rudy-avatar-img"
              src="${escapeHtmlSafely(getRudyAvatarUrl())}"
              alt="Rudy's Avatar"
              decoding="async"
              onerror="this.onerror=null; this.src=getInlineSvgFallbackDataUri('Rudy');"
              class="w-full h-full rounded-full object-cover bg-[#181a17] transition-transform duration-300 group-hover:scale-105"
            />
          </button>
          ${isAuthorAuthenticated ? `
            <button
              type="button"
              onclick="event.stopPropagation(); triggerRudyAvatarUpload();"
              title="Change Rudy's Avatar"
              aria-label="Change Rudy's Avatar"
              class="absolute -bottom-1 -right-1 z-30 w-7 h-7 rounded-full border border-[#e4d4a7]/60 bg-[#15161a]/95 hover:bg-[#e4d4a7] text-[#e4d4a7] hover:text-[#0c0d0f] flex items-center justify-center shadow-lg transition cursor-pointer"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
            </button>
            <input
              id="rudy-avatar-file-input"
              type="file"
              accept="image/*"
              onchange="handleRudyAvatarFileChange(event)"
              class="hidden"
            />
          ` : ''}
        </div>

        <!-- Dynamic Glowing Focus Graph Nodes -->
        ${nodesHtml}
      </div>

      ${adminCustomizerHtml}

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
   ADMIN FOCUS TAGS & BUTTERFLY SPEECH BUBBLE MANAGEMENT (CLOUDFLARE R2)
   ======================================================================== */
function toggleProfileTagEditor(forceOpen) {
  if (!isAuthorAuthenticated) return;
  isProfileTagEditorOpen = typeof forceOpen === 'boolean' ? forceOpen : !isProfileTagEditorOpen;
  profileConfigSaveMsg = '';
  if (currentView === 'chapter' && activeBookId === 'profile') {
    renderChapterContent('profile');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  }
}

async function persistProfileConfigChange(updates, successLabel) {
  if (!isAuthorAuthenticated) return;
  profileConfigSaveMsg = 'Saving to Cloudflare R2...';
  profileConfigSaveTone = 'muted';
  if (currentView === 'chapter' && activeBookId === 'profile') {
    renderChapterContent('profile');
  }

  const res = await saveSiteConfigToR2(updates);
  if (res.ok) {
    profileConfigSaveMsg = `✓ ${successLabel} (synced to R2)`;
    profileConfigSaveTone = 'ok';
  } else {
    profileConfigSaveMsg = `Saved locally — deploy updated worker.js to sync cloud (${res.error || 'offline'})`;
    profileConfigSaveTone = 'err';
  }

  if (currentView === 'chapter' && activeBookId === 'profile') {
    renderChapterContent('profile');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  }
}

async function handleAddProfileTag(event) {
  event.preventDefault();
  if (!isAuthorAuthenticated) return;
  const input = document.getElementById('new-profile-tag-input');
  const label = input ? input.value.trim().slice(0, 32) : '';
  if (!label) return;

  const currentTags = Array.isArray(siteConfig.profileTags) ? [...siteConfig.profileTags] : [];
  if (currentTags.length >= 8) return;

  const nextColor = PROFILE_TAG_COLORS[currentTags.length % PROFILE_TAG_COLORS.length];
  currentTags.push({
    id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    label,
    color: nextColor
  });

  await persistProfileConfigChange({ profileTags: currentTags }, `Added "${label}"`);
}

async function updateProfileTagLabel(tagId, rawLabel) {
  if (!isAuthorAuthenticated) return;
  const cleanLabel = String(rawLabel || '').trim().slice(0, 32);
  const currentTags = Array.isArray(siteConfig.profileTags) ? [...siteConfig.profileTags] : [];
  const target = currentTags.find(t => t.id === tagId);
  if (!target) return;

  if (!cleanLabel) {
    await deleteProfileTag(tagId);
    return;
  }
  if (cleanLabel === target.label) return;

  const updated = currentTags.map(t => (t.id === tagId ? { ...t, label: cleanLabel } : t));
  await persistProfileConfigChange({ profileTags: updated }, 'Tag updated');
}

async function cycleProfileTagColor(tagId) {
  if (!isAuthorAuthenticated) return;
  const currentTags = Array.isArray(siteConfig.profileTags) ? [...siteConfig.profileTags] : [];
  const updated = currentTags.map(t => {
    if (t.id !== tagId) return t;
    const idx = PROFILE_TAG_COLORS.indexOf(t.color || '#e4d4a7');
    const nextColor = PROFILE_TAG_COLORS[(idx + 1) % PROFILE_TAG_COLORS.length];
    return { ...t, color: nextColor };
  });
  await persistProfileConfigChange({ profileTags: updated }, 'Tag color updated');
}

async function deleteProfileTag(tagId) {
  if (!isAuthorAuthenticated) return;
  const currentTags = Array.isArray(siteConfig.profileTags) ? [...siteConfig.profileTags] : [];
  const updated = currentTags.filter(t => t.id !== tagId);
  await persistProfileConfigChange({ profileTags: updated }, 'Tag removed');
}

async function handleProfileButterflyBubbleSubmit(event) {
  event.preventDefault();
  if (!isAuthorAuthenticated) return;
  const input = document.getElementById('profile-butterfly-bubble-input');
  const nextText = input ? input.value.trim().slice(0, 80) : '';
  await persistProfileConfigChange(
    { butterflyBubbleText: nextText || DEFAULT_SITE_CONFIG.butterflyBubbleText },
    'Butterfly bubble updated'
  );
}

async function handleProfileBackTopBubbleSubmit(event) {
  event.preventDefault();
  if (!isAuthorAuthenticated) return;
  const input = document.getElementById('profile-backtop-bubble-input');
  const nextText = input ? input.value.trim().slice(0, 80) : '';
  await persistProfileConfigChange(
    { backToTopBubbleText: nextText },
    nextText ? 'Back-to-Top bubble updated' : 'Back-to-Top bubble removed'
  );
}

async function handleClearBackTopBubble() {
  if (!isAuthorAuthenticated) return;
  await persistProfileConfigChange(
    { backToTopBubbleText: '' },
    'Back-to-Top bubble removed'
  );
}

function triggerRudyAvatarUpload() {
  if (!isAuthorAuthenticated) return;
  const input = document.getElementById('rudy-avatar-file-input');
  if (input) input.click();
}

async function handleRudyAvatarFileChange(event) {
  if (!isAuthorAuthenticated) return;
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;

  isProfileTagEditorOpen = true;
  profileConfigSaveMsg = 'Compressing & uploading avatar to Cloudflare R2...';
  profileConfigSaveTone = 'muted';
  if (currentView === 'chapter' && activeBookId === 'profile') {
    renderChapterContent('profile');
  }

  try {
    const prevKey = (siteConfig && siteConfig.avatarKey) ? siteConfig.avatarKey : '';
    const optimized = await compressAvatarImageForSpeed(file, 512);
    const uploaded = await uploadSingleFileToR2(optimized);
    const res = await saveSiteConfigToR2({
      avatarUrl: uploaded.url,
      avatarKey: uploaded.key || ''
    });

    if (res.ok) {
      // Clean up old R2 avatar object if replaced
      if (prevKey && prevKey !== uploaded.key) {
        const client = ensureSupabaseClient();
        if (client) {
          const { data: sData } = await client.auth.getSession();
          const token = sData && sData.session ? sData.session.access_token : '';
          fetch(`${R2_UPLOAD_ENDPOINT}/r2-file?key=${encodeURIComponent(prevKey)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => {});
        }
      }
      profileConfigSaveMsg = '✓ Avatar updated and synced to Cloudflare R2';
      profileConfigSaveTone = 'ok';
    } else {
      profileConfigSaveMsg = `Avatar uploaded, config sync error: ${res.error || 'retry'}`;
      profileConfigSaveTone = 'err';
    }
  } catch (err) {
    profileConfigSaveMsg = `Avatar upload failed: ${err.message || 'please retry'}`;
    profileConfigSaveTone = 'err';
  }

  if (currentView === 'chapter' && activeBookId === 'profile') {
    renderChapterContent('profile');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  }
  if (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen && typeof renderFriendsSkyStage === 'function') {
    renderFriendsSkyStage(false);
  }
}

/* ========================================================================
   PROFILE DIRECT CORRESPONDENCE DIALOG (POPUP, MINIMIZE & CLOSE)
   ======================================================================== */
function openDirectMessageModal() {
  const modal = document.getElementById('direct-message-modal');
  const panel = document.getElementById('direct-message-panel');
  const miniPill = document.getElementById('direct-minimized-pill');
  if (!modal || !panel) return;

  const wasOpen = isDirectMessageModalOpen;
  isDirectMessageModalOpen = true;
  if (!wasOpen && typeof pushOverlayHistoryMarker === 'function') {
    pushOverlayHistoryMarker('direct-message');
  }
  directMessageOpenedAt = Date.now();
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

function minimizeDirectMessageModal(fromPopstate = false) {
  const modal = document.getElementById('direct-message-modal');
  const panel = document.getElementById('direct-message-panel');
  const miniPill = document.getElementById('direct-minimized-pill');
  if (!modal || !panel) return;

  const wasOpen = isDirectMessageModalOpen;
  isDirectMessageModalOpen = false;
  if (wasOpen) {
    if (fromPopstate) {
      if (typeof discardOverlayHistoryMarker === 'function') discardOverlayHistoryMarker('direct-message');
    } else if (typeof popOverlayHistoryMarker === 'function') {
      popOverlayHistoryMarker('direct-message');
    }
  }
  modal.classList.add('opacity-0');
  panel.classList.add('translate-y-10', 'opacity-0');

  setTimeout(() => {
    if (!isDirectMessageModalOpen) {
      modal.classList.add('hidden');
      if (miniPill) miniPill.classList.remove('hidden');
    }
  }, 260);
}

function closeDirectMessageModal(fromPopstate = false) {
  const modal = document.getElementById('direct-message-modal');
  const panel = document.getElementById('direct-message-panel');
  const miniPill = document.getElementById('direct-minimized-pill');
  const statusEl = document.getElementById('dm-message-status');

  const wasOpen = isDirectMessageModalOpen;
  isDirectMessageModalOpen = false;
  if (wasOpen) {
    if (fromPopstate) {
      if (typeof discardOverlayHistoryMarker === 'function') discardOverlayHistoryMarker('direct-message');
    } else if (typeof popOverlayHistoryMarker === 'function') {
      popOverlayHistoryMarker('direct-message');
    }
  }
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

  const hpEl = document.getElementById('dm-website-hp');
  const hpVal = hpEl ? hpEl.value.trim() : '';

  const nowMs = Date.now();
  if (nowMs - lastDirectMessageSentAt < 12000) {
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
      body: JSON.stringify({
        name,
        contact,
        message,
        website: hpVal,
        clientTs: directMessageOpenedAt || (nowMs - 3000)
      })
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      throw new Error('Delivery unavailable');
    }

    lastDirectMessageSentAt = Date.now();
    try { localStorage.setItem(DM_COOLDOWN_KEY, String(lastDirectMessageSentAt)); } catch (_e) {}
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
