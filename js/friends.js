/* ==========================================================================
   FRIEND LIST — STARRY CONSTELLATION SKY & BUTTERFLY-WRAP ASCENT TRANSITION
   ========================================================================== */

const FRIENDS_PUBLIC_CACHE_KEY = 'rudy_friends_public_v1';
const FRIEND_RING_COLORS = ['#e4d4a7', '#a7b08e', '#7cc4fa', '#f0a8c3', '#c8b6ff'];

let friendsList = (() => {
  try {
    const raw = localStorage.getItem(FRIENDS_PUBLIC_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_e) {}
  return [];
})();

let hasFetchedFriendsList = false;
let isFriendsSkyOpen = false;
let friendsTransitionFrame = null;
let friendsStarRevealTimers = [];
let activeFriendModalId = null; // null | '__new__' | friend.id
let isFriendModalEditMode = false;
let selectedFriendAvatarFile = null;
let selectedFriendAvatarPreviewUrl = '';
let selectedFriendAccent = '#e4d4a7';
let activeMobileTooltipFriendId = null;

function persistFriendsPublicCacheOnly() {
  try {
    const publicOnly = friendsList.map(f => ({
      id: f.id,
      nickname: f.nickname,
      avatarUrl: f.avatarUrl || '',
      accent: f.accent || '#e4d4a7'
    }));
    localStorage.setItem(FRIENDS_PUBLIC_CACHE_KEY, JSON.stringify(publicOnly));
  } catch (_e) {}
}

async function fetchFriendsList(force = false) {
  if (hasFetchedFriendsList && !force) return;
  hasFetchedFriendsList = true;
  try {
    const headers = {};
    const client = ensureSupabaseClient();
    if (isAuthorAuthenticated && client) {
      const { data: sData } = await client.auth.getSession();
      const token = sData && sData.session ? sData.session.access_token : '';
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${R2_UPLOAD_ENDPOINT}/friends`, {
      headers,
      cache: 'no-store'
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) {
      friendsList = data;
      persistFriendsPublicCacheOnly();
      if (isFriendsSkyOpen) {
        renderFriendsSkyStage(false);
      }
    }
  } catch (err) {
    console.warn('Friends list sync skipped:', err);
  }
}

async function saveFriendsListToR2(updatedFriends) {
  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated) {
    throw new Error('Author login required.');
  }
  const { data: sData } = await client.auth.getSession();
  const accessToken = sData && sData.session ? sData.session.access_token : '';

  const res = await fetch(`${R2_UPLOAD_ENDPOINT}/friends`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatedFriends)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Save failed (${res.status})`);
  }
  return json;
}

function handleFriendsAuthLogout() {
  // Immediately scrub any private fields from memory and close admin friend modals on logout
  closeFriendDetailModal();
  friendsList = friendsList.map(f => ({
    id: f.id,
    nickname: f.nickname,
    avatarUrl: f.avatarUrl || '',
    accent: f.accent || '#e4d4a7'
  }));
  persistFriendsPublicCacheOnly();
  if (isFriendsSkyOpen) {
    syncFriendsAdminControls();
    renderFriendsSkyStage(false);
  }
}

function syncFriendsAdminControls() {
  const addBtn = document.getElementById('btn-friends-add');
  const subtitleEl = document.getElementById('friends-sky-subtitle');
  const canEdit = Boolean(isAuthorAuthenticated);

  if (addBtn) {
    addBtn.hidden = !canEdit;
    addBtn.classList.toggle('hidden', !canEdit);
  }
  if (subtitleEl) {
    subtitleEl.textContent = canEdit
      ? 'AUTHOR MODE · CLICK ANY STAR FOR DETAILS & EDITING'
      : 'HOVER ANY STAR TO SEE THEIR NICKNAME';
  }
}

function getFriendsTargetRudySize() {
  const vw = window.innerWidth;
  if (vw < 640) return 76;
  if (vw < 1024) return 92;
  return 108;
}

/**
 * Generates deterministic subtle ambient background stars for the night sky.
 */
function buildAmbientSkyStarsHtml(count = 44) {
  let html = '';
  for (let i = 0; i < count; i++) {
    // Golden-ratio quasirandom scatter across viewport
    const x = ((i * 61.80339887) % 94) + 3;
    const y = ((i * 38.19660113 + 17) % 90) + 5;
    const size = i % 5 === 0 ? 2.6 : (i % 2 === 0 ? 1.8 : 1.3);
    const delay = ((i * 0.43) % 4.5).toFixed(2);
    const dur = (2.8 + (i % 4) * 0.85).toFixed(2);
    html += `<span class="friends-ambient-star" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;width:${size}px;height:${size}px;animation-delay:${delay}s;animation-duration:${dur}s;"></span>`;
  }
  return html;
}

/**
 * Computes responsive, collision-free orbital positions for friends around Rudy's center avatar.
 * Works cleanly on wide desktop, tablet, and narrow portrait mobile screens.
 */
function computeFriendsOrbitLayout(friends, stageW, stageH) {
  const count = friends.length;
  if (count === 0) return [];

  const cx = stageW / 2;
  const cy = stageH / 2;
  const rudySize = getFriendsTargetRudySize();
  const friendSize = rudySize * 0.7; // Strictly 30% smaller than Rudy's avatar
  const isCompact = stageW < 640;

  // Determine concentric ring capacities so avatars never overlap
  const ring1Cap = isCompact ? 6 : 8;
  const ring2Cap = isCompact ? 10 : 14;

  const minRx1 = rudySize * 0.5 + friendSize * 0.5 + (isCompact ? 34 : 58);
  const minRy1 = rudySize * 0.5 + friendSize * 0.5 + (isCompact ? 40 : 52);
  const maxRx = Math.max(minRx1, stageW * (isCompact ? 0.39 : 0.38));
  const maxRy = Math.max(minRy1, stageH * (isCompact ? 0.36 : 0.36));

  const ring1Count = Math.min(count, ring1Cap);
  const ring2Count = Math.max(0, Math.min(count - ring1Cap, ring2Cap));
  const ring3Count = Math.max(0, count - ring1Cap - ring2Cap);

  const hasMultiRing = count > ring1Cap;
  const rx1 = hasMultiRing ? Math.max(minRx1, maxRx * 0.62) : Math.min(maxRx, Math.max(minRx1, stageW * 0.27));
  const ry1 = hasMultiRing ? Math.max(minRy1, maxRy * 0.62) : Math.min(maxRy, Math.max(minRy1, stageH * 0.28));

  const rx2 = Math.max(rx1 + friendSize * 1.15, maxRx * 0.94);
  const ry2 = Math.max(ry1 + friendSize * 1.15, maxRy * 0.94);

  const rx3 = rx2 + friendSize * 1.25;
  const ry3 = ry2 + friendSize * 1.25;

  return friends.map((friend, idx) => {
    let angle;
    let rx;
    let ry;

    if (idx < ring1Cap) {
      const startDeg = ring1Count === 1 ? -90 : (ring1Count === 2 ? -155 : -118);
      const deg = startDeg + (360 / ring1Count) * idx;
      angle = (deg * Math.PI) / 180;
      rx = rx1;
      ry = ry1;
    } else if (idx < ring1Cap + ring2Cap) {
      const subIdx = idx - ring1Cap;
      const deg = -90 + (360 / Math.max(1, ring2Count)) * subIdx + (180 / Math.max(1, ring2Count));
      angle = (deg * Math.PI) / 180;
      rx = rx2;
      ry = ry2;
    } else {
      const subIdx = idx - ring1Cap - ring2Cap;
      const deg = -70 + (360 / Math.max(1, ring3Count)) * subIdx;
      angle = (deg * Math.PI) / 180;
      rx = rx3;
      ry = ry3;
    }

    // Subtle organic celestial drift so the sky feels alive rather than rigid
    const jitterR = 1 + ((idx % 3) - 1) * 0.04;
    const rawX = cx + Math.cos(angle) * rx * jitterR;
    const rawY = cy + Math.sin(angle) * ry * jitterR;

    const padX = friendSize * 0.65 + 10;
    const padY = friendSize * 0.65 + 24;
    const x = Math.max(padX, Math.min(stageW - padX, rawX));
    const y = Math.max(padY, Math.min(stageH - padY, rawY));

    return {
      friend,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      xPct: ((x / stageW) * 100).toFixed(2),
      yPct: ((y / stageH) * 100).toFixed(2)
    };
  });
}

function clearFriendsRevealTimers() {
  while (friendsStarRevealTimers.length > 0) {
    clearTimeout(friendsStarRevealTimers.pop());
  }
}

function renderFriendsSkyStage(animateSequentialBloom = false) {
  const stageEl = document.getElementById('friends-sky-stage');
  if (!stageEl) return;

  clearFriendsRevealTimers();
  syncFriendsAdminControls();

  const rect = stageEl.getBoundingClientRect();
  const stageW = rect.width || window.innerWidth;
  const stageH = rect.height || (window.innerHeight - 64);
  const cx = stageW / 2;
  const cy = stageH / 2;

  const rudyAvatar = escapeHtmlSafely(getRudyAvatarUrl());
  const placed = computeFriendsOrbitLayout(friendsList, stageW, stageH);
  const canEdit = Boolean(isAuthorAuthenticated);

  const linesSvg = placed.map((item, idx) => `
    <line
      class="friends-constellation-ray ${animateSequentialBloom ? 'is-pending' : 'is-visible'}"
      data-friend-ray-idx="${idx}"
      x1="${cx.toFixed(1)}"
      y1="${cy.toFixed(1)}"
      x2="${item.x}"
      y2="${item.y}"
      stroke="rgba(228, 212, 167, 0.16)"
      stroke-width="1"
      stroke-dasharray="2 5"
    />
  `).join('');

  const orbitRing1 = Math.min(stageW, stageH) * 0.27;
  const orbitRing2 = Math.min(stageW, stageH) * 0.41;

  const nodesHtml = placed.map((item, idx) => {
    const f = item.friend;
    const safeNick = escapeHtmlSafely(f.nickname || 'Star');
    const initial = escapeHtmlSafely((f.nickname || 'S').trim().slice(0, 1).toUpperCase());
    const ringColor = f.accent || '#e4d4a7';
    const isTooltipPinned = activeMobileTooltipFriendId === f.id;
    const avatarInner = f.avatarUrl
      ? `<img src="${escapeHtmlSafely(f.avatarUrl)}" alt="${safeNick}" loading="lazy" decoding="async" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" class="w-full h-full rounded-full object-cover bg-[#181a1f]" /><span style="display:none;background:radial-gradient(circle at 30% 30%, ${ringColor}33, #15171d);" class="w-full h-full rounded-full items-center justify-center font-serif-editorial text-base sm:text-lg text-[#f4ecd4]">${initial}</span>`
      : `<span style="background:radial-gradient(circle at 30% 30%, ${ringColor}36, #15171d);" class="w-full h-full rounded-full flex items-center justify-center font-serif-editorial text-base sm:text-lg text-[#f4ecd4]">${initial}</span>`;

    return `
      <div
        class="friends-star-node ${animateSequentialBloom ? 'is-pending' : 'is-revealed'} ${isTooltipPinned ? 'is-tooltip-open' : ''}"
        data-friend-node-idx="${idx}"
        data-friend-id="${escapeHtmlSafely(f.id)}"
        style="left: ${item.xPct}%; top: ${item.yPct}%;"
      >
        <div class="friends-star-twinkle-core" style="background-color: ${ringColor};"></div>
        <button
          type="button"
          onclick="handleFriendAvatarClick('${escapeHtmlSafely(f.id)}', event)"
          aria-label="${safeNick}"
          class="friends-avatar-btn ${canEdit ? 'is-admin-clickable' : ''}"
          style="--friend-accent: ${ringColor};"
        >
          <span class="friends-avatar-ring">
            ${avatarInner}
          </span>
          <span class="friends-nickname-tooltip" role="tooltip">
            <span class="friends-tooltip-dot" style="background-color: ${ringColor};"></span>
            <span>${safeNick}</span>
          </span>
        </button>
      </div>
    `;
  }).join('');

  const emptyStateHtml = friendsList.length === 0
    ? `
      <div class="friends-empty-caption">
        <p class="font-serif-editorial italic text-base sm:text-lg text-white/65">
          ${canEdit ? 'Your starry sky awaits its first friend.' : 'Quiet starlight surrounds Rudy.'}
        </p>
        ${canEdit ? `
          <button
            type="button"
            onclick="openFriendDetailModal('__new__')"
            class="mt-2.5 px-4 py-1.5 rounded-full border border-[#e4d4a7]/45 bg-[#e4d4a7]/15 hover:bg-[#e4d4a7]/25 font-mono-code text-[11px] text-[#e4d4a7] transition cursor-pointer"
          >+ ADD FIRST FRIEND</button>
        ` : ''}
      </div>
    `
    : '';

  stageEl.innerHTML = `
    <div class="friends-ambient-layer" aria-hidden="true">
      ${buildAmbientSkyStarsHtml(stageW < 640 ? 28 : 48)}
    </div>

    <svg class="friends-constellation-svg" viewBox="0 0 ${stageW} ${stageH}" preserveAspectRatio="none" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${orbitRing1.toFixed(1)}" stroke="rgba(228, 212, 167, 0.08)" stroke-width="1" fill="none" />
      <circle cx="${cx}" cy="${cy}" r="${orbitRing2.toFixed(1)}" stroke="rgba(228, 212, 167, 0.05)" stroke-width="1" stroke-dasharray="3 6" fill="none" />
      ${linesSvg}
    </svg>

    <!-- Central Rudy Avatar (100% Reference Size; Friends are strictly 70% = 30% smaller) -->
    <div id="friends-rudy-center" class="friends-rudy-center ${animateSequentialBloom ? 'is-landing' : ''}">
      <div class="friends-rudy-halo" aria-hidden="true"></div>
      <div class="friends-rudy-frame">
        <img
          src="${rudyAvatar}"
          alt="Rudy"
          decoding="async"
          onerror="this.onerror=null; this.src='https://placehold.co/320x320/1c1f1a/e4d4a7?text=Rudy';"
          class="w-full h-full rounded-full object-cover bg-[#181a17]"
        />
      </div>
      <span class="friends-rudy-caption font-serif-editorial italic">Rudy</span>
    </div>

    <!-- Surrounding Friend Star Nodes (30% smaller than Rudy's avatar) -->
    ${nodesHtml}

    ${emptyStateHtml}
  `;

  // Sequential starlight appearance ("以Rudy头像为中心四周陆续出现星星点点")
  if (animateSequentialBloom && placed.length > 0) {
    placed.forEach((_item, idx) => {
      const delay = 140 + idx * 125;
      const t = setTimeout(() => {
        const nodeEl = stageEl.querySelector(`[data-friend-node-idx="${idx}"]`);
        const rayEl = stageEl.querySelector(`[data-friend-ray-idx="${idx}"]`);
        if (nodeEl) {
          nodeEl.classList.remove('is-pending');
          nodeEl.classList.add('is-revealed');
        }
        if (rayEl) {
          rayEl.classList.remove('is-pending');
          rayEl.classList.add('is-visible');
        }
      }, delay);
      friendsStarRevealTimers.push(t);
    });
  }
}

function handleFriendAvatarClick(friendId, event) {
  if (event) event.stopPropagation();
  if (isAuthorAuthenticated) {
    // Admin can click any friend star to view full private details & edit
    openFriendDetailModal(friendId);
    return;
  }
  // Ordinary visitor: NO detail view or edit access; tapping on touch devices simply toggles nickname tooltip
  activeMobileTooltipFriendId = (activeMobileTooltipFriendId === friendId) ? null : friendId;
  document.querySelectorAll('.friends-star-node').forEach(node => {
    node.classList.toggle('is-tooltip-open', node.getAttribute('data-friend-id') === activeMobileTooltipFriendId);
  });
}

function dismissMobileFriendTooltip(event) {
  if (!activeMobileTooltipFriendId) return;
  if (event && event.target && event.target.closest && event.target.closest('.friends-star-node')) return;
  activeMobileTooltipFriendId = null;
  document.querySelectorAll('.friends-star-node.is-tooltip-open').forEach(el => {
    el.classList.remove('is-tooltip-open');
  });
}

/**
 * Choreographs the magical butterfly-wrapped ascent from Profile into the Starry Friend List:
 * 1. Other Profile elements transform into a swirling cluster of golden butterflies.
 * 2. The butterflies wrap around Rudy's avatar and carry it smoothly upward into the night sky.
 * 3. Once centered in the starry sky, butterflies scatter gently and friends bloom one by one around Rudy.
 */
function openFriendsSkyFromProfile(event, skipTransition = false) {
  if (event) event.stopPropagation();
  if (isFriendsSkyOpen) return;

  const overlay = document.getElementById('friends-sky-overlay');
  const transLayer = document.getElementById('friends-transition-layer');
  if (!overlay) return;

  if (!hasFetchedFriendsList) {
    fetchFriendsList();
  }

  isFriendsSkyOpen = true;
  activeMobileTooltipFriendId = null;
  document.body.classList.add('friends-sky-lock');

  // Hide chapter close butterfly cleanly while in Friend List sky
  if (typeof butterflyEl !== 'undefined' && butterflyEl) {
    butterflyEl.style.opacity = '0';
    if (typeof butterflyBubbleEl !== 'undefined' && butterflyBubbleEl) {
      butterflyBubbleEl.classList.remove('is-visible');
    }
  }

  if (typeof syncRouteHash === 'function') syncRouteHash();
  if (typeof updateDocumentTitle === 'function') updateDocumentTitle();

  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const avatarEl = document.getElementById('profile-rudy-avatar-core');

  if (skipTransition || reducedMotion || !transLayer || !avatarEl) {
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
      overlay.classList.remove('opacity-0');
      renderFriendsSkyStage(true);
    });
    return;
  }

  if (friendsTransitionFrame) {
    cancelAnimationFrame(friendsTransitionFrame);
    friendsTransitionFrame = null;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const avatarRect = avatarEl.getBoundingClientRect();
  const startCx = avatarRect.left + avatarRect.width / 2;
  const startCy = avatarRect.top + avatarRect.height / 2;
  const startSize = avatarRect.width || 110;

  // Target exact center of the Friend List sky stage (accounting for ~56px top bar)
  const targetCx = vw / 2;
  const targetCy = 56 + (vh - 56) / 2;
  const targetSize = getFriendsTargetRudySize();

  // Gather coordinates of OTHER Profile content elements to morph into butterflies
  const sourceOrigins = [];
  const profileContainer = document.getElementById('reader-content');
  if (profileContainer) {
    const candidates = profileContainer.querySelectorAll('.profile-focus-node, h2, p, button');
    candidates.forEach(el => {
      if (el.closest && el.closest('#profile-rudy-avatar-core')) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.top < vh && r.bottom > 0) {
        sourceOrigins.push({
          x: r.left + r.width * (0.25 + Math.random() * 0.5),
          y: r.top + r.height * 0.5
        });
      }
    });
  }

  // Gently dissolve Profile page content as it transforms into butterflies
  if (chapterPageViewEl) {
    chapterPageViewEl.classList.add('profile-to-butterflies-fade');
  }

  transLayer.innerHTML = '';
  transLayer.classList.remove('hidden');

  // Create ascending Rudy avatar actor
  const avatarActor = document.createElement('div');
  avatarActor.className = 'friends-ascending-avatar';
  avatarActor.style.width = `${startSize}px`;
  avatarActor.style.height = `${startSize}px`;
  avatarActor.innerHTML = `
    <div class="w-full h-full rounded-full p-[2px] bg-gradient-to-tr from-[#e4d4a7]/95 via-[#a7b08e]/75 to-[#f3f1ec]/85 shadow-[0_0_26px_rgba(228,212,167,0.3)]">
      <img
        src="${escapeHtmlSafely(getRudyAvatarUrl())}"
        alt="Rudy"
        onerror="this.onerror=null; this.src='https://placehold.co/320x320/1c1f1a/e4d4a7?text=Rudy';"
        class="w-full h-full rounded-full object-cover bg-[#181a17]"
      />
    </div>
  `;
  transLayer.appendChild(avatarActor);

  // Spawn golden butterflies from Profile elements that swirl & wrap around the ascending Rudy avatar
  const bCount = vw < 640 ? 11 : 16;
  const seedBase = Date.now() % 10000;
  const wrappers = [];

  for (let i = 0; i < bCount; i++) {
    const src = sourceOrigins.length > 0
      ? sourceOrigins[i % sourceOrigins.length]
      : {
          x: startCx + Math.cos((i / bCount) * Math.PI * 2) * 150,
          y: startCy + Math.sin((i / bCount) * Math.PI * 2) * 140
        };

    const el = document.createElement('div');
    el.className = 'friends-wrap-butterfly';
    el.innerHTML = createBreezeButterflySvgMarkup(`fl_${seedBase}_${i}`);
    transLayer.appendChild(el);

    wrappers.push({
      el,
      sx: src.x + (Math.random() - 0.5) * 32,
      sy: src.y + (Math.random() - 0.5) * 26,
      baseAngle: (i / bCount) * Math.PI * 2,
      wrapRadius: targetSize * (0.58 + (i % 3) * 0.16),
      scatterRadius: Math.min(vw, vh) * (0.36 + (i % 4) * 0.08),
      scale: 0.62 + (i % 3) * 0.14,
      prevX: src.x,
      prevY: src.y,
      lastMoteMs: 0
    });
  }

  // Reveal starry sky backdrop smoothly during ascent
  overlay.classList.remove('hidden');
  overlay.classList.add('opacity-0');
  let skyRevealed = false;
  let stageRendered = false;

  const duration = 1520;
  const t0 = performance.now();

  function tick(now) {
    if (!isFriendsSkyOpen) {
      transLayer.innerHTML = '';
      transLayer.classList.add('hidden');
      friendsTransitionFrame = null;
      return;
    }

    const rawT = Math.min((now - t0) / duration, 1);

    // Phase A (0 -> 0.74): Ascend smoothly upward into the sky center with gentle arc
    const ascendRaw = Math.min(1, rawT / 0.74);
    const ascendEased = ascendRaw < 0.5
      ? 4 * ascendRaw * ascendRaw * ascendRaw
      : 1 - Math.pow(-2 * ascendRaw + 2, 3) / 2;

    const curAx = startCx + (targetCx - startCx) * ascendEased;
    // Slight upward lift curve so avatar visibly rises skyward
    const liftArc = -Math.sin(ascendRaw * Math.PI) * Math.min(72, vh * 0.09);
    const curAy = startCy + (targetCy - startCy) * ascendEased + liftArc;
    const curScale = 1 + (targetSize / startSize - 1) * ascendEased;

    avatarActor.style.transform = `translate3d(${curAx - startSize / 2}px, ${curAy - startSize / 2}px, 0) scale(${curScale.toFixed(3)})`;

    // Fade in deep midnight starry sky as Rudy ascends
    if (!skyRevealed && rawT >= 0.24) {
      skyRevealed = true;
      overlay.classList.remove('opacity-0');
    }

    // Mount live sky stage & start sequential friend starlight bloom right as Rudy lands
    if (!stageRendered && rawT >= 0.72) {
      stageRendered = true;
      renderFriendsSkyStage(true);
    }

    // Fade floating avatar actor seamlessly into the live center Rudy avatar
    if (rawT > 0.75) {
      const fadeOut = Math.max(0, 1 - (rawT - 0.75) / 0.14);
      avatarActor.style.opacity = fadeOut.toFixed(3);
    } else {
      avatarActor.style.opacity = '1';
    }

    // Update each butterfly: gather from Profile -> wrap/orbit around ascending Rudy -> bloom outward into starlight
    for (const b of wrappers) {
      let x;
      let y;
      let op;

      if (rawT < 0.72) {
        const gatherT = Math.min(1, rawT / 0.32);
        const gEased = 1 - Math.pow(1 - gatherT, 3);
        const orbitAngle = b.baseAngle + rawT * Math.PI * 3.1;
        const orbitX = curAx + Math.cos(orbitAngle) * b.wrapRadius;
        const orbitY = curAy + Math.sin(orbitAngle) * (b.wrapRadius * 0.78);

        x = b.sx + (orbitX - b.sx) * gEased;
        y = b.sy + (orbitY - b.sy) * gEased;
        op = Math.min(0.95, rawT / 0.12);
      } else {
        // Disperse gently outward around Rudy into the starry sky
        const dispT = (rawT - 0.72) / 0.28;
        const dEased = 1 - Math.pow(1 - dispT, 2.6);
        const orbitAngle = b.baseAngle + 0.72 * Math.PI * 3.1 + dispT * 0.9;
        const r = b.wrapRadius + (b.scatterRadius - b.wrapRadius) * dEased;
        x = targetCx + Math.cos(orbitAngle) * r;
        y = targetCy + Math.sin(orbitAngle) * r * 0.82;
        op = Math.max(0, 1 - dispT) * 0.9;
      }

      const vx = x - b.prevX;
      const vy = y - b.prevY;
      const tilt = Math.max(-34, Math.min(34, (Math.atan2(vy, vx) * 180) / Math.PI * 0.35));
      b.prevX = x;
      b.prevY = y;

      b.el.style.transform = `translate3d(${x - 17}px, ${y - 17}px, 0) rotate(${tilt.toFixed(1)}deg) scale(${b.scale.toFixed(2)})`;
      b.el.style.opacity = op.toFixed(3);

      if (rawT > 0.14 && rawT < 0.88 && now - b.lastMoteMs > 170) {
        b.lastMoteMs = now;
        spawnButterflyShimmerMote(x, y, transLayer);
      }
    }

    if (rawT < 1) {
      friendsTransitionFrame = requestAnimationFrame(tick);
    } else {
      friendsTransitionFrame = null;
      transLayer.innerHTML = '';
      transLayer.classList.add('hidden');
      if (chapterPageViewEl) {
        chapterPageViewEl.classList.remove('profile-to-butterflies-fade');
      }
    }
  }

  friendsTransitionFrame = requestAnimationFrame(tick);
}

function closeFriendsSky(skipHashSync = false) {
  if (!isFriendsSkyOpen) return;
  isFriendsSkyOpen = false;
  activeMobileTooltipFriendId = null;
  clearFriendsRevealTimers();
  closeFriendDetailModal();

  if (friendsTransitionFrame) {
    cancelAnimationFrame(friendsTransitionFrame);
    friendsTransitionFrame = null;
  }

  const transLayer = document.getElementById('friends-transition-layer');
  if (transLayer) {
    transLayer.innerHTML = '';
    transLayer.classList.add('hidden');
  }
  if (chapterPageViewEl) {
    chapterPageViewEl.classList.remove('profile-to-butterflies-fade');
  }

  const overlay = document.getElementById('friends-sky-overlay');
  if (overlay) {
    overlay.classList.add('opacity-0');
    setTimeout(() => {
      if (!isFriendsSkyOpen) overlay.classList.add('hidden');
    }, 340);
  }

  document.body.classList.remove('friends-sky-lock');

  if (!skipHashSync && typeof syncRouteHash === 'function') syncRouteHash();
  if (typeof updateDocumentTitle === 'function') updateDocumentTitle();

  if (currentView === 'chapter') {
    setTimeout(() => {
      if (typeof syncButterflyToCloseButton === 'function') syncButterflyToCloseButton(false);
    }, 90);
  }
}

/* ========================================================================
   ADMIN-ONLY FRIEND DETAIL & CRUD MODAL (COMPLETELY LOCKED FROM VISITORS)
   ======================================================================== */
function openFriendDetailModal(friendIdOrNew) {
  // Strict double guard: visitors can NEVER open friend details or editor
  if (!isAuthorAuthenticated) return;

  const modal = document.getElementById('friend-detail-modal');
  if (!modal) return;

  activeFriendModalId = friendIdOrNew;
  isFriendModalEditMode = (friendIdOrNew === '__new__');
  selectedFriendAvatarFile = null;
  if (selectedFriendAvatarPreviewUrl) {
    URL.revokeObjectURL(selectedFriendAvatarPreviewUrl);
    selectedFriendAvatarPreviewUrl = '';
  }

  const existing = friendIdOrNew !== '__new__'
    ? friendsList.find(f => f.id === friendIdOrNew)
    : null;
  selectedFriendAccent = (existing && existing.accent)
    ? existing.accent
    : FRIEND_RING_COLORS[friendsList.length % FRIEND_RING_COLORS.length];

  renderFriendDetailModalBody();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeFriendDetailModal() {
  activeFriendModalId = null;
  isFriendModalEditMode = false;
  selectedFriendAvatarFile = null;
  if (selectedFriendAvatarPreviewUrl) {
    URL.revokeObjectURL(selectedFriendAvatarPreviewUrl);
    selectedFriendAvatarPreviewUrl = '';
  }
  const modal = document.getElementById('friend-detail-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function toggleFriendModalEditMode(editMode) {
  if (!isAuthorAuthenticated || !activeFriendModalId) return;
  isFriendModalEditMode = Boolean(editMode);
  renderFriendDetailModalBody();
}

function handleFriendAvatarFilePick(event) {
  if (!isAuthorAuthenticated) return;
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  selectedFriendAvatarFile = file;
  if (selectedFriendAvatarPreviewUrl) URL.revokeObjectURL(selectedFriendAvatarPreviewUrl);
  selectedFriendAvatarPreviewUrl = URL.createObjectURL(file);
  const previewImg = document.getElementById('friend-editor-avatar-preview');
  const previewFallback = document.getElementById('friend-editor-avatar-fallback');
  if (previewImg) {
    previewImg.src = selectedFriendAvatarPreviewUrl;
    previewImg.classList.remove('hidden');
  }
  if (previewFallback) {
    previewFallback.classList.add('hidden');
  }
}

function selectFriendAccentColor(hex) {
  if (!isAuthorAuthenticated) return;
  selectedFriendAccent = hex;
  document.querySelectorAll('[data-friend-color-swatch]').forEach(btn => {
    const isActive = btn.getAttribute('data-friend-color-swatch') === hex;
    btn.classList.toggle('border-white', isActive);
    btn.classList.toggle('scale-105', isActive);
    btn.classList.toggle('border-white/15', !isActive);
  });
}

function renderFriendDetailModalBody() {
  if (!isAuthorAuthenticated) return;
  const panel = document.getElementById('friend-detail-panel');
  if (!panel) return;

  const isNew = activeFriendModalId === '__new__';
  const friend = !isNew ? friendsList.find(f => f.id === activeFriendModalId) : null;
  if (!isNew && !friend) {
    closeFriendDetailModal();
    return;
  }

  if (!isFriendModalEditMode && friend) {
    // Admin Detail Read View (Shows full private details)
    const safeNick = escapeHtmlSafely(friend.nickname || 'Unnamed');
    const initial = escapeHtmlSafely((friend.nickname || 'S').slice(0, 1).toUpperCase());
    const ringColor = friend.accent || '#e4d4a7';

    const avatarMarkup = friend.avatarUrl
      ? `<img src="${escapeHtmlSafely(friend.avatarUrl)}" alt="${safeNick}" class="w-full h-full rounded-full object-cover bg-[#181a1f]" />`
      : `<span style="background:radial-gradient(circle at 30% 30%, ${ringColor}36, #15171d);" class="w-full h-full rounded-full flex items-center justify-center font-serif-editorial text-2xl text-[#f4ecd4]">${initial}</span>`;

    const metaRows = [
      { label: 'FULL NAME', val: friend.realName },
      { label: 'RELATION', val: friend.relation },
      { label: 'LOCATION', val: friend.location },
      { label: 'MET AT', val: friend.metAt },
      { label: 'CONTACT', val: friend.contact }
    ].filter(r => r.val && String(r.val).trim());

    const metaGridHtml = metaRows.length > 0
      ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          ${metaRows.map(r => `
            <div class="rounded-xl border border-white/8 bg-black/30 px-3 py-2">
              <span class="block font-mono-code text-[9px] tracking-[0.16em] uppercase text-white/40">${r.label}</span>
              <span class="block text-xs text-[#f3f1ec]/90 mt-0.5 break-words">${escapeHtmlSafely(r.val)}</span>
            </div>
          `).join('')}
        </div>`
      : '';

    const notesHtml = friend.notes
      ? `<div class="rounded-xl border border-white/10 bg-black/35 p-3.5 space-y-1">
          <span class="block font-mono-code text-[9px] tracking-[0.16em] uppercase text-[#e4d4a7]/75">PRIVATE NOTES</span>
          <p class="text-xs sm:text-sm leading-relaxed text-white/80 whitespace-pre-line break-words">${escapeHtmlSafely(friend.notes)}</p>
        </div>`
      : `<p class="font-mono-code text-[11px] text-white/35 italic">No additional private notes yet.</p>`;

    panel.innerHTML = `
      <div class="flex items-start justify-between gap-3 border-b border-white/10 pb-3.5">
        <div class="flex items-center gap-3.5 min-w-0">
          <div class="w-14 h-14 rounded-full p-[2px] shrink-0" style="background: linear-gradient(135deg, ${ringColor}, rgba(255,255,255,0.2));">
            ${avatarMarkup}
          </div>
          <div class="min-w-0">
            <p class="font-mono-code text-[9px] tracking-[0.2em] uppercase text-[#e4d4a7]/75">✦ AUTHOR PRIVATE CARD</p>
            <h3 class="font-serif-editorial text-2xl text-[#f3f1ec] truncate mt-0.5">${safeNick}</h3>
          </div>
        </div>
        <button
          type="button"
          onclick="closeFriendDetailModal()"
          aria-label="Close friend details"
          class="text-white/45 hover:text-[#e4d4a7] font-mono-code text-xs px-2 py-1 cursor-pointer shrink-0"
        >✕</button>
      </div>

      <div class="space-y-3.5 max-h-[58vh] overflow-y-auto pr-1">
        ${metaGridHtml}
        ${notesHtml}
      </div>

      <div class="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
        <button
          type="button"
          data-confirm="false"
          onclick="deleteFriendEntry('${escapeHtmlSafely(friend.id)}', this)"
          class="px-3 py-1.5 rounded-lg border border-white/10 hover:border-rose-400/50 hover:bg-rose-500/15 font-mono-code text-[11px] text-white/45 hover:text-rose-300 transition cursor-pointer"
        >DELETE</button>
        <button
          type="button"
          onclick="toggleFriendModalEditMode(true)"
          class="px-4 py-2 rounded-xl bg-[#e4d4a7] hover:bg-[#f2e5bf] text-[#0c0d0f] font-mono-code text-xs font-medium transition cursor-pointer"
        >✎ EDIT DETAILS</button>
      </div>
    `;
    return;
  }

  // Admin Create / Edit Form View
  const f = friend || {
    nickname: '',
    avatarUrl: '',
    realName: '',
    relation: '',
    contact: '',
    location: '',
    metAt: '',
    notes: ''
  };
  const previewSrc = selectedFriendAvatarPreviewUrl || f.avatarUrl || '';
  const initial = escapeHtmlSafely((f.nickname || '+').slice(0, 1).toUpperCase());

  const swatchesHtml = FRIEND_RING_COLORS.map(hex => {
    const active = selectedFriendAccent === hex;
    return `
      <button
        type="button"
        data-friend-color-swatch="${hex}"
        onclick="selectFriendAccentColor('${hex}')"
        aria-label="Select glow color ${hex}"
        class="w-6 h-6 rounded-full border-2 ${active ? 'border-white scale-105' : 'border-white/15'} transition cursor-pointer"
        style="background-color: ${hex};"
      ></button>
    `;
  }).join('');

  panel.innerHTML = `
    <div class="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
      <div>
        <p class="font-mono-code text-[10px] tracking-[0.2em] uppercase text-[#e4d4a7]/80">
          ✦ ${isNew ? 'ADD STAR TO SKY' : 'EDIT FRIEND'}
        </p>
        <h3 class="font-serif-editorial text-2xl text-[#f3f1ec] mt-0.5">
          ${isNew ? 'New Friend Star' : escapeHtmlSafely(f.nickname || 'Edit Friend')}
        </h3>
      </div>
      <button
        type="button"
        onclick="closeFriendDetailModal()"
        aria-label="Close editor"
        class="text-white/45 hover:text-[#e4d4a7] font-mono-code text-xs px-2 py-1 cursor-pointer"
      >✕</button>
    </div>

    <form onsubmit="handleFriendFormSubmit(event)" class="space-y-3.5 max-h-[68vh] overflow-y-auto pr-1">
      <!-- Avatar Upload + Star Glow Color -->
      <div class="flex items-center gap-4 pt-1">
        <label class="relative w-16 h-16 rounded-full border border-[#e4d4a7]/45 bg-black/45 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer group">
          <img
            id="friend-editor-avatar-preview"
            src="${escapeHtmlSafely(previewSrc)}"
            alt="Friend avatar"
            class="${previewSrc ? '' : 'hidden'} w-full h-full object-cover"
          />
          <span
            id="friend-editor-avatar-fallback"
            class="${previewSrc ? 'hidden' : ''} font-serif-editorial text-xl text-[#e4d4a7]"
          >${initial}</span>
          <input
            type="file"
            accept="image/*"
            onchange="handleFriendAvatarFilePick(event)"
            class="hidden"
          />
        </label>
        <div class="flex-1 space-y-2">
          <p class="font-mono-code text-[10px] uppercase tracking-wider text-white/50">
            Click circle to upload avatar
          </p>
          <div class="flex items-center gap-2">
            ${swatchesHtml}
          </div>
        </div>
      </div>

      <!-- Public Nickname (Visible to visitors on hover) -->
      <div class="space-y-1">
        <label for="friend-field-nickname" class="block font-mono-code text-[10px] uppercase tracking-wider text-[#e4d4a7]">
          Nickname * (Public on Hover)
        </label>
        <input
          id="friend-field-nickname"
          type="text"
          required
          maxlength="40"
          value="${escapeHtmlSafely(f.nickname)}"
          placeholder="Displayed when hovering their avatar"
          class="w-full rounded-xl bg-black/45 border border-white/15 px-3 py-2 text-xs text-[#f3f1ec] placeholder-white/30 focus:outline-none focus:border-[#e4d4a7]"
        />
      </div>

      <!-- Private Admin-Only Fields -->
      <div class="pt-1 border-t border-white/8 space-y-2.5">
        <p class="font-mono-code text-[9px] tracking-[0.18em] uppercase text-white/40">
          PRIVATE DETAILS (ADMIN ONLY · HIDDEN FROM VISITORS)
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input
            id="friend-field-realname"
            type="text"
            maxlength="60"
            value="${escapeHtmlSafely(f.realName || '')}"
            placeholder="Real / Full Name"
            class="w-full rounded-xl bg-black/45 border border-white/12 px-3 py-2 text-xs text-[#f3f1ec] placeholder-white/30 focus:outline-none focus:border-[#e4d4a7]"
          />
          <input
            id="friend-field-relation"
            type="text"
            maxlength="60"
            value="${escapeHtmlSafely(f.relation || '')}"
            placeholder="Relation / Tag (e.g. Study Partner)"
            class="w-full rounded-xl bg-black/45 border border-white/12 px-3 py-2 text-xs text-[#f3f1ec] placeholder-white/30 focus:outline-none focus:border-[#e4d4a7]"
          />
          <input
            id="friend-field-location"
            type="text"
            maxlength="80"
            value="${escapeHtmlSafely(f.location || '')}"
            placeholder="City / Location"
            class="w-full rounded-xl bg-black/45 border border-white/12 px-3 py-2 text-xs text-[#f3f1ec] placeholder-white/30 focus:outline-none focus:border-[#e4d4a7]"
          />
          <input
            id="friend-field-metat"
            type="text"
            maxlength="80"
            value="${escapeHtmlSafely(f.metAt || '')}"
            placeholder="How / Where we met"
            class="w-full rounded-xl bg-black/45 border border-white/12 px-3 py-2 text-xs text-[#f3f1ec] placeholder-white/30 focus:outline-none focus:border-[#e4d4a7]"
          />
        </div>
        <input
          id="friend-field-contact"
          type="text"
          maxlength="120"
          value="${escapeHtmlSafely(f.contact || '')}"
          placeholder="Contact / Social Handle (WeChat, X, Email...)"
          class="w-full rounded-xl bg-black/45 border border-white/12 px-3 py-2 text-xs text-[#f3f1ec] placeholder-white/30 focus:outline-none focus:border-[#e4d4a7]"
        />
        <textarea
          id="friend-field-notes"
          rows="3"
          maxlength="1200"
          placeholder="Private memories, shared topics, or notes..."
          class="w-full rounded-xl bg-black/45 border border-white/12 p-3 text-xs leading-relaxed text-[#f3f1ec] placeholder-white/30 focus:outline-none focus:border-[#e4d4a7]"
        >${escapeHtmlSafely(f.notes || '')}</textarea>
      </div>

      <p id="friend-editor-status" class="font-mono-code text-[11px] min-h-[16px] text-[#e4d4a7]"></p>

      <div class="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onclick="${isNew ? 'closeFriendDetailModal()' : 'toggleFriendModalEditMode(false)'}"
          class="px-3.5 py-2 rounded-xl border border-white/12 text-xs font-mono-code text-white/60 hover:text-white transition cursor-pointer"
        >CANCEL</button>
        <button
          id="btn-save-friend-entry"
          type="submit"
          class="px-5 py-2 rounded-xl bg-[#e4d4a7] hover:bg-[#f2e5bf] text-[#0c0d0f] font-mono-code text-xs font-medium transition cursor-pointer shadow"
        >SAVE TO R2 ↵</button>
      </div>
    </form>
  `;
}

async function handleFriendFormSubmit(event) {
  event.preventDefault();
  if (!isAuthorAuthenticated) return;

  const nickEl = document.getElementById('friend-field-nickname');
  const realEl = document.getElementById('friend-field-realname');
  const relEl = document.getElementById('friend-field-relation');
  const locEl = document.getElementById('friend-field-location');
  const metEl = document.getElementById('friend-field-metat');
  const contactEl = document.getElementById('friend-field-contact');
  const notesEl = document.getElementById('friend-field-notes');
  const statusEl = document.getElementById('friend-editor-status');
  const saveBtn = document.getElementById('btn-save-friend-entry');

  const nickname = nickEl ? nickEl.value.trim().slice(0, 40) : '';
  if (!nickname) return;

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING...';
  }
  if (statusEl) {
    statusEl.textContent = selectedFriendAvatarFile
      ? 'Uploading avatar & saving to Cloudflare R2...'
      : 'Saving friend to Cloudflare R2...';
    statusEl.className = 'font-mono-code text-[11px] min-h-[16px] text-[#e4d4a7]';
  }

  try {
    const isNew = activeFriendModalId === '__new__';
    const existing = !isNew ? friendsList.find(f => f.id === activeFriendModalId) : null;
    let avatarUrl = existing ? (existing.avatarUrl || '') : '';
    let avatarKey = existing ? (existing.avatarKey || '') : '';
    const oldAvatarKey = avatarKey;

    if (selectedFriendAvatarFile) {
      const optimized = await compressAvatarImageForSpeed(selectedFriendAvatarFile, 420);
      const uploaded = await uploadSingleFileToR2(optimized);
      avatarUrl = uploaded.url;
      avatarKey = uploaded.key || '';
    }

    const entry = {
      id: existing ? existing.id : `fr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nickname,
      avatarUrl,
      avatarKey,
      accent: selectedFriendAccent || '#e4d4a7',
      realName: realEl ? realEl.value.trim().slice(0, 60) : '',
      relation: relEl ? relEl.value.trim().slice(0, 60) : '',
      location: locEl ? locEl.value.trim().slice(0, 80) : '',
      metAt: metEl ? metEl.value.trim().slice(0, 80) : '',
      contact: contactEl ? contactEl.value.trim().slice(0, 120) : '',
      notes: notesEl ? notesEl.value.trim().slice(0, 1200) : '',
      createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updatedList = isNew
      ? [...friendsList, entry]
      : friendsList.map(f => (f.id === entry.id ? entry : f));

    const res = await saveFriendsListToR2(updatedList);
    friendsList = Array.isArray(res.friends) ? res.friends : updatedList;
    persistFriendsPublicCacheOnly();

    // Clean up replaced avatar object from R2
    if (selectedFriendAvatarFile && oldAvatarKey && oldAvatarKey !== avatarKey) {
      const client = ensureSupabaseClient();
      if (client) {
        const { data: sData } = await client.auth.getSession();
        const token = sData && sData.session ? sData.session.access_token : '';
        fetch(`${R2_UPLOAD_ENDPOINT}/r2-file?key=${encodeURIComponent(oldAvatarKey)}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
      }
    }

    selectedFriendAvatarFile = null;
    renderFriendsSkyStage(false);
    closeFriendDetailModal();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Save failed: ${err.message || 'Please deploy updated worker-v2.js first.'}`;
      statusEl.className = 'font-mono-code text-[11px] min-h-[16px] text-rose-400';
    }
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'SAVE TO R2 ↵';
    }
  }
}

async function deleteFriendEntry(friendId, btnEl) {
  if (!isAuthorAuthenticated || !friendId) return;
  if (btnEl && btnEl.dataset.confirm !== 'true') {
    btnEl.dataset.confirm = 'true';
    btnEl.textContent = 'CONFIRM DELETE?';
    btnEl.classList.add('text-rose-400');
    setTimeout(() => {
      if (btnEl && btnEl.dataset.confirm === 'true') {
        btnEl.dataset.confirm = 'false';
        btnEl.textContent = 'DELETE';
        btnEl.classList.remove('text-rose-400');
      }
    }, 3000);
    return;
  }

  const target = friendsList.find(f => f.id === friendId);
  const remaining = friendsList.filter(f => f.id !== friendId);
  if (btnEl) btnEl.textContent = 'DELETING...';

  try {
    await saveFriendsListToR2(remaining);
    friendsList = remaining;
    persistFriendsPublicCacheOnly();

    if (target && target.avatarKey) {
      const client = ensureSupabaseClient();
      if (client) {
        const { data: sData } = await client.auth.getSession();
        const token = sData && sData.session ? sData.session.access_token : '';
        fetch(`${R2_UPLOAD_ENDPOINT}/r2-file?key=${encodeURIComponent(target.avatarKey)}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
      }
    }

    closeFriendDetailModal();
    renderFriendsSkyStage(false);
  } catch (err) {
    console.error('Delete friend failed:', err);
    if (btnEl) btnEl.textContent = 'RETRY DELETE';
  }
}

window.addEventListener('resize', () => {
  if (isFriendsSkyOpen) {
    renderFriendsSkyStage(false);
  }
});
