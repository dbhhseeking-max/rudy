/* ==========================================================================
   FRIEND LIST — FREE-FLOATING STARRY SKY, BUTTERFLY MORPH & COMET TAIL PHYSICS
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
let friendsPhysicsFrame = null;
let friendsRudyPhys = null;
let friendsPhysNodes = [];
let friendsStageSize = { w: 1200, h: 720 };
let isDraggingRudyComet = false;
let rudyDragPointerId = null;
let rudyDragStart = { px: 0, py: 0, rx: 0, ry: 0, moved: false };
let rudyDragTarget = { x: 0, y: 0 };
let rudyTrail = [];
let rudyHeading = { x: -1, y: 0.2 };
let lastCometMoteMs = 0;

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
      if (isFriendsSkyOpen && !friendsTransitionFrame) {
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
      ? 'AUTHOR MODE · DRAG RUDY FOR COMET TRAIL · CLICK STARS TO EDIT'
      : 'DRAG RUDY TO LEAD THE BUTTERFLIES · HOVER STARS FOR NICKNAMES';
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
    const x = ((i * 61.80339887) % 94) + 3;
    const y = ((i * 38.19660113 + 17) % 90) + 5;
    const size = i % 5 === 0 ? 2.4 : (i % 2 === 0 ? 1.7 : 1.2);
    const delay = ((i * 0.43) % 4.5).toFixed(2);
    const dur = (2.8 + (i % 4) * 0.85).toFixed(2);
    html += `<span class="friends-ambient-star" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;width:${size}px;height:${size}px;animation-delay:${delay}s;animation-duration:${dur}s;"></span>`;
  }
  return html;
}

/**
 * Computes spacious, collision-free organic sky positions around Rudy's center avatar.
 */
function computeFriendsOrbitLayout(friends, stageW, stageH) {
  const count = friends.length;
  if (count === 0) return [];

  const cx = stageW / 2;
  const cy = stageH / 2;
  const rudySize = getFriendsTargetRudySize();
  const friendSize = rudySize * 0.7; // Strictly 30% smaller than Rudy
  const isCompact = stageW < 640;

  const ring1Cap = isCompact ? 6 : 8;
  const ring2Cap = isCompact ? 10 : 14;

  const minRx1 = rudySize * 0.5 + friendSize * 0.5 + (isCompact ? 38 : 72);
  const minRy1 = rudySize * 0.5 + friendSize * 0.5 + (isCompact ? 46 : 64);
  const maxRx = Math.max(minRx1, stageW * (isCompact ? 0.38 : 0.37));
  const maxRy = Math.max(minRy1, stageH * (isCompact ? 0.35 : 0.35));

  const ring1Count = Math.min(count, ring1Cap);
  const ring2Count = Math.max(0, Math.min(count - ring1Cap, ring2Cap));
  const ring3Count = Math.max(0, count - ring1Cap - ring2Cap);

  const hasMultiRing = count > ring1Cap;
  const rx1 = hasMultiRing ? Math.max(minRx1, maxRx * 0.62) : Math.min(maxRx, Math.max(minRx1, stageW * 0.28));
  const ry1 = hasMultiRing ? Math.max(minRy1, maxRy * 0.62) : Math.min(maxRy, Math.max(minRy1, stageH * 0.28));

  const rx2 = Math.max(rx1 + friendSize * 1.2, maxRx * 0.94);
  const ry2 = Math.max(ry1 + friendSize * 1.2, maxRy * 0.94);

  const rx3 = rx2 + friendSize * 1.25;
  const ry3 = ry2 + friendSize * 1.25;

  return friends.map((friend, idx) => {
    let angle;
    let rx;
    let ry;

    if (idx < ring1Cap) {
      const startDeg = ring1Count === 1 ? -90 : (ring1Count === 2 ? -152 : -124);
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

    const jitterR = 1 + ((idx % 3) - 1) * 0.06;
    const rawX = cx + Math.cos(angle) * rx * jitterR;
    const rawY = cy + Math.sin(angle) * ry * jitterR;

    const padX = friendSize * 0.65 + 16;
    const padY = friendSize * 0.65 + 32;
    const x = Math.max(padX, Math.min(stageW - padX, rawX));
    const y = Math.max(padY, Math.min(stageH - padY, rawY));

    return {
      friend,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10
    };
  });
}

function spawnFriendMorphRing(x, y, container) {
  const host = container || document.getElementById('friends-fx-layer');
  if (!host) return;
  const ring = document.createElement('div');
  ring.className = 'friends-morph-ring';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  host.appendChild(ring);
  setTimeout(() => ring.remove(), 580);
}

function spawnFriendStarMote(x, y, container) {
  const host = container || document.getElementById('friends-fx-layer');
  if (!host) return;
  const mote = document.createElement('div');
  mote.className = 'friends-comet-mote';
  const size = 1.8 + Math.random() * 2;
  mote.style.width = `${size.toFixed(1)}px`;
  mote.style.height = `${size.toFixed(1)}px`;
  mote.style.left = `${x + (Math.random() - 0.5) * 10}px`;
  mote.style.top = `${y + (Math.random() - 0.5) * 10}px`;
  host.appendChild(mote);
  setTimeout(() => mote.remove(), 700);
}

function stopFriendsPhysicsLoop() {
  if (friendsPhysicsFrame) {
    cancelAnimationFrame(friendsPhysicsFrame);
    friendsPhysicsFrame = null;
  }
}

function buildCometButterflySvg(uid) {
  if (typeof createBreezeButterflySvgMarkup === 'function') {
    return createBreezeButterflySvgMarkup(uid);
  }
  return '';
}

/**
 * Renders the Friend List starry sky (NO yellow orbit circles, NO dashed lines)
 * and initializes the Obsidian-Graph-inspired 60fps free-floating physics engine.
 */
function renderFriendsSkyStage(startPendingForMorph = false) {
  const stageEl = document.getElementById('friends-sky-stage');
  if (!stageEl) return;

  stopFriendsPhysicsLoop();
  syncFriendsAdminControls();

  const rect = stageEl.getBoundingClientRect();
  const stageW = rect.width || window.innerWidth;
  const stageH = rect.height || (window.innerHeight - 56);
  friendsStageSize = { w: stageW, h: stageH };
  const cx = stageW / 2;
  const cy = stageH / 2;

  const rudyAvatar = escapeHtmlSafely(getRudyAvatarUrl());
  const placed = computeFriendsOrbitLayout(friendsList, stageW, stageH);
  const canEdit = Boolean(isAuthorAuthenticated);

  // Preserve previous coordinates smoothly if re-rendering after edit/resize
  const prevById = new Map(friendsPhysNodes.map(n => [n.id, n]));

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
        class="friends-star-node ${startPendingForMorph ? 'is-pending' : 'is-revealed'} ${isTooltipPinned ? 'is-tooltip-open' : ''}"
        data-friend-node-idx="${idx}"
        data-friend-id="${escapeHtmlSafely(f.id)}"
        onmouseenter="setFriendNodeHover('${escapeHtmlSafely(f.id)}', true)"
        onmouseleave="setFriendNodeHover('${escapeHtmlSafely(f.id)}', false)"
      >
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

        <!-- Small Flapping Golden Butterfly (Revealed when dragging Rudy as a Comet Tail!) -->
        <div class="friends-comet-butterfly" aria-hidden="true">
          ${buildCometButterflySvg(`cm_${idx}_${Date.now() % 9999}`)}
        </div>
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

    <!-- FX Layer for Obsidian-Style Morph Rings & Faint Comet Stardust -->
    <div id="friends-fx-layer" class="friends-fx-layer" aria-hidden="true"></div>

    <!-- Central Rudy Avatar (Soft Borderless Micro-Glow, Draggable Comet Head) -->
    <div id="friends-rudy-center" class="friends-rudy-center ${startPendingForMorph ? 'is-landing' : ''}" title="Drag Rudy across the sky">
      <div class="friends-rudy-halo" aria-hidden="true"></div>
      <div class="friends-rudy-frame">
        <img
          src="${rudyAvatar}"
          alt="Rudy"
          draggable="false"
          decoding="async"
          onerror="this.onerror=null; this.src='https://placehold.co/320x320/1c1f1a/e4d4a7?text=Rudy';"
          class="w-full h-full rounded-full object-cover bg-[#181a17] pointer-events-none"
        />
      </div>
      <span class="friends-rudy-caption font-serif-editorial italic pointer-events-none">Rudy</span>
    </div>

    <!-- Surrounding Free-Floating Friend Star Nodes (30% Smaller Than Rudy) -->
    ${nodesHtml}

    ${emptyStateHtml}
  `;

  // Initialize Rudy Physics State
  const rudyEl = document.getElementById('friends-rudy-center');
  friendsRudyPhys = {
    x: cx,
    y: cy,
    vx: 0,
    vy: 0,
    baseX: cx,
    baseY: cy,
    el: rudyEl
  };
  if (rudyEl) {
    rudyEl.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
    bindRudyCometDragEvents(rudyEl, stageEl);
  }

  // Initialize Friend Physics Nodes
  friendsPhysNodes = placed.map((item, idx) => {
    const f = item.friend;
    const prev = prevById.get(f.id);
    const el = stageEl.querySelector(`[data-friend-node-idx="${idx}"]`);
    const bflyEl = el ? el.querySelector('.friends-comet-butterfly') : null;
    const x = (!startPendingForMorph && prev) ? Math.max(40, Math.min(stageW - 40, prev.x)) : item.x;
    const y = (!startPendingForMorph && prev) ? Math.max(46, Math.min(stageH - 46, prev.y)) : item.y;

    if (el) {
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    }

    return {
      id: f.id,
      idx,
      x,
      y,
      homeX: item.x,
      homeY: item.y,
      vx: 0,
      vy: 0,
      phaseX: idx * 1.9 + 0.4,
      phaseY: idx * 2.3 + 1.1,
      freqX: 0.00042 + (idx % 4) * 0.00011,
      freqY: 0.00036 + (idx % 3) * 0.00013,
      arrived: !startPendingForMorph,
      mode: 'avatar', // 'avatar' | 'butterfly' | 'returning'
      tailIndex: idx,
      hoverSlow: false,
      returnStartAt: 0,
      returnDuration: 720,
      returnStartX: x,
      returnStartY: y,
      returnTargetX: item.x,
      returnTargetY: item.y,
      lastSparkMs: 0,
      el,
      bflyEl
    };
  });

  startFriendsPhysicsLoop();
  return friendsPhysNodes;
}

function setFriendNodeHover(friendId, hovering) {
  const node = friendsPhysNodes.find(n => n.id === friendId);
  if (node) node.hoverSlow = Boolean(hovering);
}

/* ========================================================================
   DRAG RUDY AVATAR -> COMET WITH SMALL-BUTTERFLY TAIL INTERACTION
   ======================================================================== */
function bindRudyCometDragEvents(rudyEl, stageEl) {
  if (!rudyEl || !stageEl) return;

  rudyEl.addEventListener('pointerdown', (e) => {
    if (!isFriendsSkyOpen) return;
    e.preventDefault();
    e.stopPropagation();

    rudyDragPointerId = e.pointerId;
    try { rudyEl.setPointerCapture(e.pointerId); } catch (_e) {}

    const rect = stageEl.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    rudyDragStart = {
      px,
      py,
      rx: friendsRudyPhys.x,
      ry: friendsRudyPhys.y,
      moved: false
    };
    rudyDragTarget = { x: friendsRudyPhys.x, y: friendsRudyPhys.y };
  });

  rudyEl.addEventListener('pointermove', (e) => {
    if (!isFriendsSkyOpen || e.pointerId !== rudyDragPointerId) return;
    const rect = stageEl.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const dx = px - rudyDragStart.px;
    const dy = py - rudyDragStart.py;

    if (!rudyDragStart.moved && Math.hypot(dx, dy) > 4) {
      rudyDragStart.moved = true;
      enterRudyCometMode();
    }

    if (rudyDragStart.moved) {
      const rudyR = getFriendsTargetRudySize() * 0.5 + 10;
      rudyDragTarget.x = Math.max(rudyR, Math.min(rect.width - rudyR, rudyDragStart.rx + dx));
      rudyDragTarget.y = Math.max(rudyR, Math.min(rect.height - rudyR, rudyDragStart.ry + dy));
    }
  });

  function releaseRudyDrag(e) {
    if (e.pointerId !== rudyDragPointerId) return;
    rudyDragPointerId = null;
    if (rudyDragStart.moved) {
      rudyDragStart.moved = false;
      exitRudyCometMode();
    }
  }

  rudyEl.addEventListener('pointerup', releaseRudyDrag);
  rudyEl.addEventListener('pointercancel', releaseRudyDrag);
}

function enterRudyCometMode() {
  if (isDraggingRudyComet || !friendsRudyPhys) return;
  isDraggingRudyComet = true;
  activeMobileTooltipFriendId = null;

  if (friendsRudyPhys.el) {
    friendsRudyPhys.el.classList.add('is-comet-head');
  }

  // Seed comet trail history at Rudy's current coordinates
  rudyTrail = [{ x: friendsRudyPhys.x, y: friendsRudyPhys.y }];
  rudyHeading = { x: -0.95, y: 0.3 };

  // Order friend nodes by proximity to Rudy so closest friends lead the comet tail
  const arrivedNodes = friendsPhysNodes
    .filter(n => n.arrived)
    .sort((a, b) => {
      const da = Math.hypot(a.x - friendsRudyPhys.x, a.y - friendsRudyPhys.y);
      const db = Math.hypot(b.x - friendsRudyPhys.x, b.y - friendsRudyPhys.y);
      return da - db;
    });

  const fxLayer = document.getElementById('friends-fx-layer');
  arrivedNodes.forEach((node, orderIdx) => {
    node.tailIndex = orderIdx;
    node.mode = 'butterfly';
    node.hoverSlow = false;
    if (node.el) {
      node.el.classList.remove('is-tooltip-open');
      node.el.classList.add('is-comet-butterfly');
    }
    spawnFriendMorphRing(node.x, node.y, fxLayer);
  });
}

function exitRudyCometMode() {
  if (!isDraggingRudyComet) return;
  isDraggingRudyComet = false;

  if (friendsRudyPhys && friendsRudyPhys.el) {
    friendsRudyPhys.el.classList.remove('is-comet-head');
  }

  const freshLayout = computeFriendsOrbitLayout(friendsList, friendsStageSize.w, friendsStageSize.h);
  const targetById = new Map(freshLayout.map(item => [item.friend.id, item]));
  const now = performance.now();

  friendsPhysNodes.forEach((node) => {
    if (node.mode !== 'butterfly') return;
    const tgt = targetById.get(node.id) || { x: node.homeX, y: node.homeY };
    node.mode = 'returning';
    node.returnStartX = node.x;
    node.returnStartY = node.y;
    node.returnTargetX = tgt.x;
    node.returnTargetY = tgt.y;
    node.homeX = tgt.x;
    node.homeY = tgt.y;
    node.returnStartAt = now + Math.min(node.tailIndex * 55, 320);
    node.returnDuration = 680 + (node.tailIndex % 3) * 100;
    node.vx = 0;
    node.vy = 0;
  });
}

/**
 * Samples a smooth point along Rudy's comet breadcrumb trail at `targetDist` pixels behind Rudy.
 */
function sampleCometTrailPoint(targetDist) {
  if (!rudyTrail.length) {
    return {
      x: friendsRudyPhys.x - rudyHeading.x * targetDist,
      y: friendsRudyPhys.y - rudyHeading.y * targetDist,
      tx: rudyHeading.x,
      ty: rudyHeading.y
    };
  }

  let acc = 0;
  for (let i = 0; i < rudyTrail.length - 1; i++) {
    const p0 = rudyTrail[i];
    const p1 = rudyTrail[i + 1];
    const segDx = p1.x - p0.x;
    const segDy = p1.y - p0.y;
    const segLen = Math.hypot(segDx, segDy);
    if (segLen < 0.001) continue;
    if (acc + segLen >= targetDist) {
      const frac = (targetDist - acc) / segLen;
      return {
        x: p0.x + segDx * frac,
        y: p0.y + segDy * frac,
        tx: -segDx / segLen,
        ty: -segDy / segLen
      };
    }
    acc += segLen;
  }

  // Trail shorter than slot distance -> project gracefully behind last heading vector
  const tailEnd = rudyTrail[rudyTrail.length - 1];
  const remain = targetDist - acc;
  return {
    x: tailEnd.x - rudyHeading.x * remain,
    y: tailEnd.y - rudyHeading.y * remain,
    tx: rudyHeading.x,
    ty: rudyHeading.y
  };
}

/* ========================================================================
   60FPS FREE-FLOATING + COMET TAIL PHYSICS SIMULATION LOOP
   ======================================================================== */
function startFriendsPhysicsLoop() {
  stopFriendsPhysicsLoop();

  const fxLayer = document.getElementById('friends-fx-layer');

  function step(now) {
    if (!isFriendsSkyOpen || !friendsRudyPhys) {
      friendsPhysicsFrame = null;
      return;
    }

    const stageW = friendsStageSize.w;
    const stageH = friendsStageSize.h;
    const rudySize = getFriendsTargetRudySize();
    const friendSize = rudySize * 0.7;
    const isCompact = stageW < 640;

    // 1. Update Rudy's Position (Dragging Comet Head vs Gentle Center Floating)
    const prevRx = friendsRudyPhys.x;
    const prevRy = friendsRudyPhys.y;

    if (isDraggingRudyComet) {
      friendsRudyPhys.x += (rudyDragTarget.x - friendsRudyPhys.x) * 0.36;
      friendsRudyPhys.y += (rudyDragTarget.y - friendsRudyPhys.y) * 0.36;
      friendsRudyPhys.vx = friendsRudyPhys.x - prevRx;
      friendsRudyPhys.vy = friendsRudyPhys.y - prevRy;

      const moveDist = Math.hypot(friendsRudyPhys.vx, friendsRudyPhys.vy);
      if (moveDist > 1.2) {
        const nx = friendsRudyPhys.vx / moveDist;
        const ny = friendsRudyPhys.vy / moveDist;
        rudyHeading.x = rudyHeading.x * 0.82 + nx * 0.18;
        rudyHeading.y = rudyHeading.y * 0.82 + ny * 0.18;
        const hLen = Math.hypot(rudyHeading.x, rudyHeading.y) || 1;
        rudyHeading.x /= hLen;
        rudyHeading.y /= hLen;
      }

      const lastPt = rudyTrail[0];
      if (!lastPt || Math.hypot(friendsRudyPhys.x - lastPt.x, friendsRudyPhys.y - lastPt.y) >= 4) {
        rudyTrail.unshift({ x: friendsRudyPhys.x, y: friendsRudyPhys.y });
        if (rudyTrail.length > 260) rudyTrail.pop();
      }

      // Faint comet stardust wake behind Rudy while moving
      if (moveDist > 1.6 && now - lastCometMoteMs > 55) {
        lastCometMoteMs = now;
        spawnFriendStarMote(
          friendsRudyPhys.x - rudyHeading.x * (rudySize * 0.32),
          friendsRudyPhys.y - rudyHeading.y * (rudySize * 0.32),
          fxLayer
        );
      }
    } else {
      // Gentle, slow floating around the sky center
      const anchorX = friendsRudyPhys.baseX + Math.sin(now * 0.00052) * 9;
      const anchorY = friendsRudyPhys.baseY + Math.cos(now * 0.00041) * 7;
      friendsRudyPhys.vx = (friendsRudyPhys.vx + (anchorX - friendsRudyPhys.x) * 0.035) * 0.85;
      friendsRudyPhys.vy = (friendsRudyPhys.vy + (anchorY - friendsRudyPhys.y) * 0.035) * 0.85;
      friendsRudyPhys.x += friendsRudyPhys.vx;
      friendsRudyPhys.y += friendsRudyPhys.vy;
    }

    if (friendsRudyPhys.el) {
      friendsRudyPhys.el.style.transform = `translate3d(${friendsRudyPhys.x.toFixed(2)}px, ${friendsRudyPhys.y.toFixed(2)}px, 0) translate(-50%, -50%)`;
    }

    // 2. Update Each Friend Node (Avatar Free-Float vs Comet Butterfly Tail vs Return-Morph)
    const padX = friendSize * 0.65 + 14;
    const padY = friendSize * 0.65 + 26;
    const minFriendSep = friendSize * 1.48;
    const minRudySep = rudySize * 0.5 + friendSize * 0.5 + (isCompact ? 26 : 44);

    for (let i = 0; i < friendsPhysNodes.length; i++) {
      const node = friendsPhysNodes[i];
      if (!node.arrived) continue;

      if (node.mode === 'butterfly') {
        // Comet Tail Follow Mode: follow staggered point along Rudy's path with butterfly flutter
        const slotDist = rudySize * 0.68 + node.tailIndex * (isCompact ? 30 : 38);
        const pt = sampleCometTrailPoint(slotDist);
        // Perpendicular vector for organic weaving butterfly tail width
        const perpX = -pt.ty;
        const perpY = pt.tx;
        const flutterAmp = 6 + Math.min(18, node.tailIndex * 3.2);
        const flutter = Math.sin(now * 0.0065 + node.tailIndex * 1.55) * flutterAmp;

        const targetX = pt.x + perpX * flutter;
        const targetY = pt.y + perpY * flutter;

        node.vx = (node.vx + (targetX - node.x) * 0.095) * 0.76;
        node.vy = (node.vy + (targetY - node.y) * 0.095) * 0.76;
        node.x += node.vx;
        node.y += node.vy;

        const speed = Math.hypot(node.vx, node.vy);
        let bankAngle = 0;
        if (speed > 0.3) {
          bankAngle = Math.max(-36, Math.min(36, (Math.atan2(node.vy, node.vx) * 180) / Math.PI * 0.35));
        } else {
          bankAngle = Math.sin(now * 0.004 + node.tailIndex) * 10;
        }
        const tailScale = Math.max(0.66, 0.96 - node.tailIndex * 0.055);

        if (node.el) {
          node.el.style.transform = `translate3d(${node.x.toFixed(2)}px, ${node.y.toFixed(2)}px, 0) translate(-50%, -50%)`;
        }
        if (node.bflyEl) {
          node.bflyEl.style.transform = `translate(-50%, -50%) rotate(${bankAngle.toFixed(1)}deg) scale(${tailScale.toFixed(3)})`;
        }

        if (speed > 2.2 && now - node.lastSparkMs > 160) {
          node.lastSparkMs = now;
          spawnFriendStarMote(node.x, node.y, fxLayer);
        }
        continue;
      }

      if (node.mode === 'returning') {
        // Disperse back from comet tail to spacious sky position, then morph into avatar!
        const elapsed = now - node.returnStartAt;
        if (elapsed < 0) {
          // Hover lightly before peeling off
          node.x += Math.sin(now * 0.008 + node.idx) * 0.35;
          node.y += Math.cos(now * 0.007 + node.idx) * 0.35;
          if (node.el) {
            node.el.style.transform = `translate3d(${node.x.toFixed(2)}px, ${node.y.toFixed(2)}px, 0) translate(-50%, -50%)`;
          }
          continue;
        }

        const rawT = Math.min(1, elapsed / node.returnDuration);
        const eased = rawT < 0.5
          ? 4 * rawT * rawT * rawT
          : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

        const arcSign = node.idx % 2 === 0 ? 1 : -1;
        const arcLift = Math.sin(rawT * Math.PI) * 32 * arcSign;
        const prevX = node.x;
        const prevY = node.y;

        node.x = node.returnStartX + (node.returnTargetX - node.returnStartX) * eased;
        node.y = node.returnStartY + (node.returnTargetY - node.returnStartY) * eased + arcLift;

        const vx = node.x - prevX;
        const vy = node.y - prevY;
        const angle = Math.max(-34, Math.min(34, (Math.atan2(vy, vx) * 180) / Math.PI * 0.35));

        if (node.el) {
          node.el.style.transform = `translate3d(${node.x.toFixed(2)}px, ${node.y.toFixed(2)}px, 0) translate(-50%, -50%)`;
        }
        if (node.bflyEl) {
          const shrink = rawT > 0.8 ? Math.max(0.35, 1 - (rawT - 0.8) / 0.2 * 0.65) : 0.92;
          node.bflyEl.style.transform = `translate(-50%, -50%) rotate(${angle.toFixed(1)}deg) scale(${shrink.toFixed(3)})`;
        }

        if (rawT >= 1) {
          node.mode = 'avatar';
          node.vx = 0;
          node.vy = 0;
          if (node.el) {
            node.el.classList.remove('is-comet-butterfly');
          }
          spawnFriendMorphRing(node.x, node.y, fxLayer);
        }
        continue;
      }

      // Normal Free-Floating Mode ('avatar' — Obsidian-Graph-inspired slow, peaceful drift)
      let ax = Math.cos(now * node.freqX + node.phaseX) * 0.011;
      let ay = Math.sin(now * node.freqY + node.phaseY) * 0.011;

      // Very gentle home tether so nodes wander freely across a wide zone without bunching
      ax += (node.homeX - node.x) * 0.00028;
      ay += (node.homeY - node.y) * 0.00028;

      // Soft repulsion from Rudy's center avatar
      const rdx = node.x - friendsRudyPhys.x;
      const rdy = node.y - friendsRudyPhys.y;
      const rDist = Math.hypot(rdx, rdy) || 1;
      if (rDist < minRudySep) {
        const push = (minRudySep - rDist) * 0.012;
        ax += (rdx / rDist) * push;
        ay += (rdy / rDist) * push;
      }

      // Soft repulsion between friend avatars so they never overlap
      for (let j = 0; j < friendsPhysNodes.length; j++) {
        if (i === j) continue;
        const other = friendsPhysNodes[j];
        if (!other.arrived || other.mode !== 'avatar') continue;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < minFriendSep) {
          const push = (minFriendSep - dist) * 0.009;
          ax += (dx / dist) * push;
          ay += (dy / dist) * push;
        }
      }

      // Gentle viewport containment
      if (node.x < padX) ax += (padX - node.x) * 0.02;
      else if (node.x > stageW - padX) ax -= (node.x - (stageW - padX)) * 0.02;
      if (node.y < padY) ay += (padY - node.y) * 0.02;
      else if (node.y > stageH - padY) ay -= (node.y - (stageH - padY)) * 0.02;

      node.vx = (node.vx + ax) * 0.94;
      node.vy = (node.vy + ay) * 0.94;

      // Cap drift velocity so motion stays calm & dreamy
      const speed = Math.hypot(node.vx, node.vy);
      const maxSpd = node.hoverSlow ? 0.07 : 0.42;
      if (speed > maxSpd) {
        node.vx = (node.vx / speed) * maxSpd;
        node.vy = (node.vy / speed) * maxSpd;
      }

      node.x += node.vx;
      node.y += node.vy;

      if (node.el) {
        node.el.style.transform = `translate3d(${node.x.toFixed(2)}px, ${node.y.toFixed(2)}px, 0) translate(-50%, -50%)`;
      }
    }

    friendsPhysicsFrame = requestAnimationFrame(step);
  }

  friendsPhysicsFrame = requestAnimationFrame(step);
}

function handleFriendAvatarClick(friendId, event) {
  if (event) event.stopPropagation();
  if (isAuthorAuthenticated) {
    openFriendDetailModal(friendId);
    return;
  }
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
 * Choreographs the Obsidian-Graph-inspired entrance from Profile into Friend List:
 * 1. Other Profile elements turn into golden butterflies swirling around Rudy's avatar,
 *    carrying Rudy's avatar smoothly up to the center of the night sky.
 * 2. Upon arrival, butterflies scatter outward from Rudy along curved Bezier arcs
 *    directly to each friend's spot and MORPH (with a golden burst ring) into each friend's avatar!
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
  isDraggingRudyComet = false;
  activeMobileTooltipFriendId = null;
  document.body.classList.add('friends-sky-lock');

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
      renderFriendsSkyStage(false);
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

  const headerOffset = 56;
  const targetCx = vw / 2;
  const targetCy = headerOffset + (vh - headerOffset) / 2;
  const targetSize = getFriendsTargetRudySize();

  // Gather Profile elements to morph into butterflies
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

  if (chapterPageViewEl) {
    chapterPageViewEl.classList.add('profile-to-butterflies-fade');
  }

  transLayer.innerHTML = '';
  transLayer.classList.remove('hidden');

  const avatarActor = document.createElement('div');
  avatarActor.className = 'friends-ascending-avatar';
  avatarActor.style.width = `${startSize}px`;
  avatarActor.style.height = `${startSize}px`;
  avatarActor.innerHTML = `
    <div class="w-full h-full rounded-full p-[2px] bg-gradient-to-tr from-[#e4d4a7]/95 via-[#a7b08e]/75 to-[#f3f1ec]/85 shadow-[0_0_22px_rgba(228,212,167,0.22)]">
      <img
        src="${escapeHtmlSafely(getRudyAvatarUrl())}"
        alt="Rudy"
        onerror="this.onerror=null; this.src='https://placehold.co/320x320/1c1f1a/e4d4a7?text=Rudy';"
        class="w-full h-full rounded-full object-cover bg-[#181a17]"
      />
    </div>
  `;
  transLayer.appendChild(avatarActor);

  // Pre-mount starry sky stage so we know exact friend target coordinates in viewport space
  overlay.classList.remove('hidden');
  overlay.classList.add('opacity-0');
  const stageEl = document.getElementById('friends-sky-stage');
  const mountedNodes = renderFriendsSkyStage(true) || [];
  const stageRect = stageEl ? stageEl.getBoundingClientRect() : { left: 0, top: headerOffset };

  // At least 1 butterfly per friend + a few extra ambient butterflies
  const friendCount = mountedNodes.length;
  const totalButterflies = Math.max(friendCount + 5, vw < 640 ? 10 : 14);
  const seedBase = Date.now() % 10000;
  const flyers = [];

  for (let i = 0; i < totalButterflies; i++) {
    const src = sourceOrigins.length > 0
      ? sourceOrigins[i % sourceOrigins.length]
      : {
          x: startCx + Math.cos((i / totalButterflies) * Math.PI * 2) * 150,
          y: startCy + Math.sin((i / totalButterflies) * Math.PI * 2) * 140
        };

    const el = document.createElement('div');
    el.className = 'friends-wrap-butterfly';
    el.innerHTML = buildCometButterflySvg(`fl_${seedBase}_${i}`);
    transLayer.appendChild(el);

    const assignedNode = i < friendCount ? mountedNodes[i] : null;
    const endX = assignedNode
      ? stageRect.left + assignedNode.homeX
      : targetCx + Math.cos((i / totalButterflies) * Math.PI * 2) * Math.min(vw, vh) * 0.45;
    const endY = assignedNode
      ? stageRect.top + assignedNode.homeY
      : targetCy + Math.sin((i / totalButterflies) * Math.PI * 2) * Math.min(vw, vh) * 0.4;

    flyers.push({
      el,
      assignedNode,
      sx: src.x + (Math.random() - 0.5) * 32,
      sy: src.y + (Math.random() - 0.5) * 26,
      baseAngle: (i / totalButterflies) * Math.PI * 2,
      wrapRadius: targetSize * (0.58 + (i % 3) * 0.14),
      endX,
      endY,
      launchX: targetCx,
      launchY: targetCy,
      launchCaptured: false,
      morphDelay: assignedNode ? Math.min(i * 65, 340) : (i - friendCount) * 45,
      morphDur: assignedNode ? (760 + (i % 3) * 110) : 640,
      scale: assignedNode ? 0.88 : (0.56 + (i % 3) * 0.12),
      prevX: src.x,
      prevY: src.y,
      lastMoteMs: 0,
      done: false
    });
  }

  let skyRevealed = false;
  const ascendDur = 920;
  const t0 = performance.now();

  function tick(now) {
    if (!isFriendsSkyOpen) {
      transLayer.innerHTML = '';
      transLayer.classList.add('hidden');
      friendsTransitionFrame = null;
      return;
    }

    const elapsed = now - t0;
    const ascendRaw = Math.min(1, elapsed / ascendDur);
    const ascendEased = ascendRaw < 0.5
      ? 4 * ascendRaw * ascendRaw * ascendRaw
      : 1 - Math.pow(-2 * ascendRaw + 2, 3) / 2;

    const curAx = startCx + (targetCx - startCx) * ascendEased;
    const liftArc = -Math.sin(ascendRaw * Math.PI) * Math.min(68, vh * 0.085);
    const curAy = startCy + (targetCy - startCy) * ascendEased + liftArc;
    const curScale = 1 + (targetSize / startSize - 1) * ascendEased;

    avatarActor.style.transform = `translate3d(${curAx - startSize / 2}px, ${curAy - startSize / 2}px, 0) scale(${curScale.toFixed(3)})`;

    if (!skyRevealed && elapsed >= 220) {
      skyRevealed = true;
      overlay.classList.remove('opacity-0');
    }

    if (elapsed > ascendDur) {
      const fadeOut = Math.max(0, 1 - (elapsed - ascendDur) / 220);
      avatarActor.style.opacity = fadeOut.toFixed(3);
    } else {
      avatarActor.style.opacity = '1';
    }

    let anyFlyerActive = false;

    for (const f of flyers) {
      if (f.done) continue;

      if (elapsed < ascendDur) {
        // Phase 1: Butterflies gather from Profile & swirl around ascending Rudy
        const gatherT = Math.min(1, elapsed / 360);
        const gEased = 1 - Math.pow(1 - gatherT, 3);
        const orbitAngle = f.baseAngle + ascendRaw * Math.PI * 2.8;
        const orbitX = curAx + Math.cos(orbitAngle) * f.wrapRadius;
        const orbitY = curAy + Math.sin(orbitAngle) * (f.wrapRadius * 0.78);

        const x = f.sx + (orbitX - f.sx) * gEased;
        const y = f.sy + (orbitY - f.sy) * gEased;
        const op = Math.min(0.95, elapsed / 140);

        const vx = x - f.prevX;
        const vy = y - f.prevY;
        const tilt = Math.max(-34, Math.min(34, (Math.atan2(vy, vx) * 180) / Math.PI * 0.35));
        f.prevX = x;
        f.prevY = y;

        f.el.style.transform = `translate3d(${x - 17}px, ${y - 17}px, 0) rotate(${tilt.toFixed(1)}deg) scale(${f.scale.toFixed(2)})`;
        f.el.style.opacity = op.toFixed(3);
        anyFlyerActive = true;
      } else {
        // Phase 2: Obsidian-Graph-Style Scatter -> Curved Bezier Flight -> Morph Into Friend Avatar!
        const phase2Elapsed = elapsed - ascendDur - f.morphDelay;
        if (phase2Elapsed < 0) {
          // Keep gently orbiting Rudy until this butterfly's staggered launch
          const orbitAngle = f.baseAngle + Math.PI * 2.8 + (elapsed - ascendDur) * 0.005;
          const x = targetCx + Math.cos(orbitAngle) * f.wrapRadius;
          const y = targetCy + Math.sin(orbitAngle) * (f.wrapRadius * 0.78);
          f.prevX = x;
          f.prevY = y;
          f.el.style.transform = `translate3d(${x - 17}px, ${y - 17}px, 0) scale(${f.scale.toFixed(2)})`;
          anyFlyerActive = true;
          continue;
        }

        if (!f.launchCaptured) {
          f.launchCaptured = true;
          f.launchX = f.prevX;
          f.launchY = f.prevY;
          const dx = f.endX - f.launchX;
          const dy = f.endY - f.launchY;
          const arcSign = (f.assignedNode ? f.assignedNode.idx : 1) % 2 === 0 ? -1 : 1;
          f.cp1x = f.launchX + dx * 0.32 + arcSign * 56;
          f.cp1y = Math.min(f.launchY, f.endY) - 52;
          f.cp2x = f.launchX + dx * 0.72 - arcSign * 34;
          f.cp2y = f.endY + arcSign * 26;
        }

        const rawT = Math.min(1, phase2Elapsed / f.morphDur);
        const t = rawT < 0.5
          ? 4 * rawT * rawT * rawT
          : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
        const inv = 1 - t;

        const x =
          inv * inv * inv * f.launchX +
          3 * inv * inv * t * f.cp1x +
          3 * inv * t * t * f.cp2x +
          t * t * t * f.endX;
        const y =
          inv * inv * inv * f.launchY +
          3 * inv * inv * t * f.cp1y +
          3 * inv * t * t * f.cp2y +
          t * t * t * f.endY +
          Math.sin(rawT * Math.PI * 3.5) * (1 - rawT) * 10;

        const vx = x - f.prevX;
        const vy = y - f.prevY;
        const tilt = Math.max(-34, Math.min(34, (Math.atan2(vy, vx) * 180) / Math.PI * 0.35));
        f.prevX = x;
        f.prevY = y;

        const op = f.assignedNode
          ? (rawT > 0.8 ? Math.max(0, 1 - (rawT - 0.8) / 0.2) : 0.96)
          : Math.max(0, 1 - rawT) * 0.75;
        const sc = f.assignedNode
          ? (rawT > 0.78 ? f.scale * (1 - (rawT - 0.78) / 0.22 * 0.65) : f.scale)
          : f.scale * (0.95 - rawT * 0.35);

        f.el.style.transform = `translate3d(${x - 17}px, ${y - 17}px, 0) rotate(${tilt.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
        f.el.style.opacity = op.toFixed(3);

        if (f.assignedNode && rawT > 0.08 && rawT < 0.88 && now - f.lastMoteMs > 110) {
          f.lastMoteMs = now;
          spawnFriendStarMote(x - stageRect.left, y - stageRect.top);
        }

        if (rawT >= 1) {
          f.done = true;
          f.el.remove();
          if (f.assignedNode) {
            f.assignedNode.arrived = true;
            f.assignedNode.x = f.assignedNode.homeX;
            f.assignedNode.y = f.assignedNode.homeY;
            if (f.assignedNode.el) {
              f.assignedNode.el.classList.remove('is-pending');
              f.assignedNode.el.classList.add('is-revealed');
            }
            spawnFriendMorphRing(f.assignedNode.homeX, f.assignedNode.homeY);
          }
        } else {
          anyFlyerActive = true;
        }
      }
    }

    if (anyFlyerActive || elapsed < ascendDur + 240) {
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
  isDraggingRudyComet = false;
  rudyDragPointerId = null;
  activeMobileTooltipFriendId = null;
  stopFriendsPhysicsLoop();
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
      statusEl.textContent = `Save failed: ${err.message || 'Please check network.'}`;
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
  if (isFriendsSkyOpen && !friendsTransitionFrame) {
    renderFriendsSkyStage(false);
  }
});
