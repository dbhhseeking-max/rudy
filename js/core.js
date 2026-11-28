/* ==========================================================================
   CORE CONFIGURATION, SHARED AUTH & CLOUDFLARE R2 / SUPABASE HELPERS
   ========================================================================== */

/**
 * Supabase Connection Configuration (Proxied via Cloudflare Edge for fast China access)
 */
const SUPABASE_DIRECT_URL = 'https://vgyjjxdbykyopmoilaxg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vM6SMe-9kCWR05F_HeVwJw_TGZvGC-E';
// Cloudflare R2 10GB media uploader, direct note relay & Supabase China-accelerated proxy endpoint
const R2_UPLOAD_ENDPOINT = 'https://upload.studyenglishwith.me';
const SUPABASE_URL = `${R2_UPLOAD_ENDPOINT}/sb`;
const SUPABASE_SDK_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const MOMENTS_CACHE_KEY = 'rudy_moments_cache_v1';
const COMMENTS_CACHE_KEY = 'rudy_comments_cache_v1';

let supabaseClient = null;
let supabaseSdkPromise = null;

function hasStoredSupabaseSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token') && localStorage.getItem(k)) {
        return true;
      }
    }
  } catch (_e) {}
  return false;
}

function loadSupabaseSdk() {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    return Promise.resolve(window.supabase);
  }
  if (supabaseSdkPromise) return supabaseSdkPromise;

  supabaseSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SUPABASE_SDK_CDN;
    script.async = true;
    script.onload = () => {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        resolve(window.supabase);
      } else {
        supabaseSdkPromise = null;
        reject(new Error('Supabase SDK unavailable'));
      }
    };
    script.onerror = () => {
      supabaseSdkPromise = null;
      reject(new Error('Failed to load Supabase SDK'));
    };
    document.head.appendChild(script);
  });
  return supabaseSdkPromise;
}

function ensureSupabaseClient() {
  if (!supabaseClient && window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return supabaseClient;
}

async function ensureSupabaseClientAsync() {
  if (!ensureSupabaseClient()) {
    await loadSupabaseSdk();
  }
  return ensureSupabaseClient();
}

/**
 * Rewrites legacy supabase.co media URLs through our Cloudflare edge proxy (/sb/*)
 * so older photos & videos also load fast in Mainland China.
 */
function optimizeMediaUrl(url) {
  if (typeof url === 'string' && url.startsWith(`${SUPABASE_DIRECT_URL}/`)) {
    return `${SUPABASE_URL}${url.slice(SUPABASE_DIRECT_URL.length)}`;
  }
  return url;
}

let isAuthorAuthenticated = false;
let secretTapCount = 0;
let secretTapTimer = null;

/**
 * Checks whether a media URL points to a video file.
 */
function isVideoMediaUrl(url, explicitType = '') {
  if (explicitType === 'video') return true;
  if (!url || typeof url !== 'string') return false;
  const cleanUrl = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogg)$/.test(cleanUrl);
}

const PUBLIC_MEDIA_BASE = 'https://media.studyenglishwith.me';

/**
 * Extracts the R2 object key from a public media URL (returns '' for non-R2 or protected JSON keys).
 */
function extractR2KeyFromMediaUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const clean = url.split('?')[0].trim();
  const prefix = `${PUBLIC_MEDIA_BASE}/`;
  if (!clean.startsWith(prefix)) return '';
  try {
    const key = decodeURIComponent(clean.slice(prefix.length));
    if (
      !key ||
      key === 'art-music-catalog.json' ||
      key === 'work-notes-vault.json' ||
      key === 'work-notes-vault.prev.json' ||
      key === 'site-config.json' ||
      key === 'friends-list.json'
    ) {
      return '';
    }
    return key;
  } catch (_e) {
    return '';
  }
}

/* ========================================================================
   SECURITY, SANITIZATION & INLINE OFFLINE FALLBACK HELPERS
   ======================================================================== */
function escapeHtmlSafely(raw) {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeSafeMediaUrl(rawUrl, fallback = '') {
  const u = String(rawUrl || '').trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(u) || /^\.\/[^\s"'<>]+$/i.test(u)) {
    return u;
  }
  return fallback;
}

function sanitizeHexColor(rawColor, fallback = '#e4d4a7') {
  const c = String(rawColor || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback;
}

function getInlineSvgFallbackDataUri(label = 'R') {
  const safeText = String(label || 'R').replace(/[<>&"']/g, '').slice(0, 8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#1c1f1a"/><text x="60" y="68" text-anchor="middle" fill="#e4d4a7" font-family="Georgia, serif" font-size="34">${safeText}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ========================================================================
   MOBILE BACK-GESTURE & OVERLAY HISTORY CONTROLLER
   ======================================================================== */
const OVERLAY_HISTORY_STACK = [];
let ignoreNextOverlayPopCount = 0;
let hasSeededInSiteBackstop = false;

function markInSiteBackstopSatisfied() {
  hasSeededInSiteBackstop = true;
}

function ensureChapterHistoryBackstop() {
  if (hasSeededInSiteBackstop) return;
  if (typeof currentView === 'undefined' || currentView !== 'chapter' || typeof activeBookId === 'undefined' || !activeBookId) {
    return;
  }
  hasSeededInSiteBackstop = true;
  if (history.state && history.state.__rudyOverlay) return;
  try {
    const rawHash = (window.location.hash || '').trim();
    const curTargetHash = rawHash && rawHash !== '#shelf'
      ? window.location.href
      : (activeBookId === 'work' && typeof wsVault !== 'undefined' && wsVault && wsVault.activeNoteId
        ? `#work/${encodeURIComponent(wsVault.activeNoteId)}`
        : `#${activeBookId}`);
    history.replaceState({ ...(history.state || {}), __rudyBackstopBase: 'shelf' }, '', '#shelf');
    history.pushState(null, '', curTargetHash);
  } catch (_e) {}
}

function isOverlayCurrentlyOpen(name) {
  switch (name) {
    case 'lightbox': {
      const m = document.getElementById('image-lightbox-modal');
      return Boolean(m && !m.classList.contains('hidden'));
    }
    case 'global-search': {
      const m = document.getElementById('global-search-modal');
      return Boolean(m && !m.classList.contains('hidden'));
    }
    case 'bubble-editor': {
      const m = document.getElementById('butterfly-bubble-modal');
      return Boolean(m && !m.classList.contains('hidden'));
    }
    case 'author-login': {
      const m = document.getElementById('author-login-modal');
      return Boolean(m && !m.classList.contains('hidden'));
    }
    case 'friend-detail': {
      const m = document.getElementById('friend-detail-modal');
      return Boolean(m && !m.classList.contains('hidden'));
    }
    case 'direct-message':
      return Boolean(typeof isDirectMessageModalOpen !== 'undefined' && isDirectMessageModalOpen);
    case 'turntable-sheet':
      return Boolean(typeof isTurntableSheetOpen !== 'undefined' && isTurntableSheetOpen);
    case 'ws-graph':
      return Boolean(typeof wsGraphOpen !== 'undefined' && wsGraphOpen);
    case 'ws-fullscreen':
      return Boolean(typeof wsIsFullscreen !== 'undefined' && wsIsFullscreen);
    default:
      return false;
  }
}

function closeNamedOverlayFromHistory(name) {
  switch (name) {
    case 'lightbox': closeImageLightbox(true); return true;
    case 'global-search': if (typeof closeGlobalSearchModal === 'function') closeGlobalSearchModal(true); return true;
    case 'bubble-editor': if (typeof closeButterflyBubbleEditor === 'function') closeButterflyBubbleEditor(true); return true;
    case 'author-login': closeAuthorLoginModal(true); return true;
    case 'friend-detail': if (typeof closeFriendDetailModal === 'function') closeFriendDetailModal(true); return true;
    case 'direct-message': if (typeof closeDirectMessageModal === 'function') closeDirectMessageModal(true); return true;
    case 'turntable-sheet': if (typeof toggleTurntableSheet === 'function') toggleTurntableSheet(false, true); return true;
    case 'ws-graph': if (typeof wsCloseGraphView === 'function') wsCloseGraphView(true); return true;
    case 'ws-fullscreen': if (typeof wsToggleFullscreen === 'function') wsToggleFullscreen(false, true); return true;
    default: return false;
  }
}

function pushOverlayHistoryMarker(name) {
  if (!name) return;
  ensureChapterHistoryBackstop();
  if (OVERLAY_HISTORY_STACK[OVERLAY_HISTORY_STACK.length - 1] === name) return;
  OVERLAY_HISTORY_STACK.push(name);
  try {
    history.pushState({ ...(history.state || {}), __rudyOverlay: name }, '', window.location.href);
  } catch (_e) {}
}

function discardOverlayHistoryMarker(name) {
  const idx = OVERLAY_HISTORY_STACK.lastIndexOf(name);
  if (idx !== -1) {
    OVERLAY_HISTORY_STACK.splice(idx, 1);
  }
}

function popOverlayHistoryMarker(name) {
  discardOverlayHistoryMarker(name);
  if (history.state && history.state.__rudyOverlay === name) {
    ignoreNextOverlayPopCount += 1;
    try {
      history.back();
    } catch (_e) {
      ignoreNextOverlayPopCount = Math.max(0, ignoreNextOverlayPopCount - 1);
    }
  }
}

function consumeOverlayPopOnBack() {
  if (ignoreNextOverlayPopCount > 0) {
    ignoreNextOverlayPopCount -= 1;
    return true;
  }
  while (OVERLAY_HISTORY_STACK.length > 0) {
    const topName = OVERLAY_HISTORY_STACK.pop();
    if (isOverlayCurrentlyOpen(topName)) {
      closeNamedOverlayFromHistory(topName);
      return true;
    }
  }
  const fallbackOrder = [
    'lightbox',
    'global-search',
    'bubble-editor',
    'author-login',
    'friend-detail',
    'direct-message',
    'turntable-sheet',
    'ws-graph',
    'ws-fullscreen'
  ];
  for (const name of fallbackOrder) {
    if (isOverlayCurrentlyOpen(name)) {
      closeNamedOverlayFromHistory(name);
      return true;
    }
  }
  return false;
}

/* ========================================================================
   GLOBAL SWIPEABLE IMAGE LIGHTBOX (MOMENTS & WORK & STUDY)
   ======================================================================== */
let lightboxGalleryItems = [];
let lightboxGalleryIndex = 0;
let lightboxTouchBound = false;
let suppressLightboxBackdropClickUntil = 0;

function renderImageLightboxSlide() {
  const modal = document.getElementById('image-lightbox-modal');
  const imgEl = document.getElementById('image-lightbox-img');
  const capEl = document.getElementById('image-lightbox-caption');
  const origEl = document.getElementById('image-lightbox-original');
  const countEl = document.getElementById('image-lightbox-counter');
  const prevBtn = document.getElementById('image-lightbox-prev');
  const nextBtn = document.getElementById('image-lightbox-next');
  const hintEl = document.getElementById('image-lightbox-hint');
  if (!modal || !imgEl || lightboxGalleryItems.length === 0) return;

  const total = lightboxGalleryItems.length;
  lightboxGalleryIndex = ((lightboxGalleryIndex % total) + total) % total;
  const current = lightboxGalleryItems[lightboxGalleryIndex];

  imgEl.classList.remove('is-dragging');
  imgEl.style.transform = '';
  imgEl.style.opacity = '1';
  imgEl.src = current.src;
  imgEl.alt = current.caption || 'Preview';
  if (capEl) capEl.textContent = current.caption || '';
  if (origEl) origEl.href = current.src;

  const hasMultiple = total > 1;
  if (countEl) {
    countEl.textContent = `${lightboxGalleryIndex + 1} / ${total}`;
    countEl.classList.toggle('hidden', !hasMultiple);
  }
  if (prevBtn) prevBtn.classList.toggle('hidden', !hasMultiple);
  if (nextBtn) nextBtn.classList.toggle('hidden', !hasMultiple);
  if (hintEl) hintEl.classList.toggle('hidden', !hasMultiple);

  // Preload adjacent gallery images silently for instant left/right swipes
  if (hasMultiple) {
    const nextItem = lightboxGalleryItems[(lightboxGalleryIndex + 1) % total];
    const prevItem = lightboxGalleryItems[(lightboxGalleryIndex - 1 + total) % total];
    [nextItem, prevItem].forEach(it => {
      if (it && it.src) {
        const preImg = new Image();
        preImg.src = it.src;
      }
    });
  }
}

function stepImageLightbox(delta) {
  if (lightboxGalleryItems.length <= 1) return;
  const imgEl = document.getElementById('image-lightbox-img');
  const dir = delta >= 0 ? 1 : -1;
  lightboxGalleryIndex += dir;

  if (imgEl) {
    imgEl.classList.remove('is-dragging');
    imgEl.style.opacity = '0.25';
    imgEl.style.transform = `translate3d(${dir > 0 ? '-18px' : '18px'}, 0, 0)`;
    setTimeout(() => {
      renderImageLightboxSlide();
    }, 90);
  } else {
    renderImageLightboxSlide();
  }
}

function bindImageLightboxSwipeOnce() {
  if (lightboxTouchBound) return;
  const stage = document.getElementById('image-lightbox-stage');
  const imgEl = document.getElementById('image-lightbox-img');
  if (!stage || !imgEl) return;
  lightboxTouchBound = true;

  let startX = 0;
  let startY = 0;
  let lastDx = 0;
  let lastDy = 0;
  let isTracking = false;
  let isMultiTouch = false;

  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
      isMultiTouch = true;
      isTracking = false;
      imgEl.classList.remove('is-dragging');
      imgEl.style.transform = '';
      imgEl.style.opacity = '1';
      return;
    }
    if (window.visualViewport && window.visualViewport.scale > 1.08) {
      isTracking = false;
      return;
    }
    isMultiTouch = false;
    isTracking = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    lastDx = 0;
    lastDy = 0;
    imgEl.classList.add('is-dragging');
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (!isTracking || isMultiTouch || e.touches.length > 1) {
      isMultiTouch = e.touches.length > 1;
      return;
    }
    lastDx = e.touches[0].clientX - startX;
    lastDy = e.touches[0].clientY - startY;

    if (lightboxGalleryItems.length > 1 && Math.abs(lastDx) > Math.abs(lastDy) * 1.1 && Math.abs(lastDx) > 8) {
      suppressLightboxBackdropClickUntil = Date.now() + 360;
      const dampedX = Math.max(-140, Math.min(140, lastDx * 0.55));
      imgEl.style.transform = `translate3d(${dampedX.toFixed(1)}px, 0, 0)`;
    } else if (lastDy > 14 && Math.abs(lastDy) > Math.abs(lastDx) * 1.3) {
      suppressLightboxBackdropClickUntil = Date.now() + 360;
      const pullY = Math.min(130, lastDy * 0.6);
      const fade = Math.max(0.45, 1 - pullY / 240);
      imgEl.style.transform = `translate3d(0, ${pullY.toFixed(1)}px, 0)`;
      imgEl.style.opacity = fade.toFixed(2);
    }
  }, { passive: true });

  const resetOrCommitTouch = () => {
    imgEl.classList.remove('is-dragging');
    if (!isTracking || isMultiTouch) {
      imgEl.style.transform = '';
      imgEl.style.opacity = '1';
      isTracking = false;
      return;
    }
    isTracking = false;

    const absX = Math.abs(lastDx);
    const absY = Math.abs(lastDy);

    if (lightboxGalleryItems.length > 1 && absX >= 42 && absX > absY * 1.1) {
      suppressLightboxBackdropClickUntil = Date.now() + 360;
      stepImageLightbox(lastDx < 0 ? 1 : -1);
      return;
    }

    if (lastDy >= 95 && absY > absX * 1.35) {
      suppressLightboxBackdropClickUntil = Date.now() + 360;
      closeImageLightbox();
      return;
    }

    imgEl.style.transform = '';
    imgEl.style.opacity = '1';
  };

  stage.addEventListener('touchend', resetOrCommitTouch, { passive: true });
  stage.addEventListener('touchcancel', () => {
    isTracking = false;
    imgEl.classList.remove('is-dragging');
    imgEl.style.transform = '';
    imgEl.style.opacity = '1';
  }, { passive: true });
}

function handleLightboxBackdropClick(event) {
  if (Date.now() < suppressLightboxBackdropClickUntil) return;
  if (event && event.target !== event.currentTarget) return;
  closeImageLightbox();
}

function openImageLightboxFromEl(imgEl, defaultCaption = '') {
  if (!imgEl) return;
  const root = imgEl.closest('[data-lightbox-gallery], #ws-preview-body');
  if (!root) {
    const raw = imgEl.getAttribute('data-lightbox-src') || imgEl.src;
    openImageLightbox(raw, defaultCaption);
    return;
  }
  const galleryCap = root.getAttribute('data-lightbox-gallery') || defaultCaption;
  const imgs = Array.from(root.querySelectorAll('img'));
  const items = [];
  let targetIndex = 0;

  imgs.forEach((node) => {
    const src = sanitizeSafeMediaUrl(node.getAttribute('data-lightbox-src') || node.currentSrc || node.src);
    if (!src) return;
    if (node === imgEl) targetIndex = items.length;
    const alt = (node.getAttribute('alt') || '').trim();
    const itemCap = root.id === 'ws-preview-body'
      ? (alt && alt !== 'Work & Study Note' ? alt : defaultCaption)
      : (galleryCap || alt);
    items.push({ src, caption: itemCap });
  });

  if (items.length === 0) {
    openImageLightbox(imgEl.src, defaultCaption);
    return;
  }
  openImageLightbox(items, galleryCap || defaultCaption, targetIndex);
}

function openImageLightbox(srcOrItems, caption = '', startIndex = 0) {
  let items = [];
  if (Array.isArray(srcOrItems)) {
    items = srcOrItems
      .map(it => {
        if (typeof it === 'string') {
          const s = sanitizeSafeMediaUrl(it);
          return s ? { src: s, caption: caption || '' } : null;
        }
        if (it && typeof it === 'object') {
          const s = sanitizeSafeMediaUrl(it.src);
          return s ? { src: s, caption: it.caption || caption || '' } : null;
        }
        return null;
      })
      .filter(Boolean);
  } else {
    const safeSrc = sanitizeSafeMediaUrl(srcOrItems);
    if (safeSrc) items = [{ src: safeSrc, caption: caption || '' }];
  }

  if (items.length === 0) return;

  const modal = document.getElementById('image-lightbox-modal');
  if (!modal) return;
  const wasHidden = modal.classList.contains('hidden');

  lightboxGalleryItems = items;
  lightboxGalleryIndex = Math.max(0, Math.min(items.length - 1, Number(startIndex) || 0));
  bindImageLightboxSwipeOnce();
  renderImageLightboxSlide();

  if (wasHidden) {
    pushOverlayHistoryMarker('lightbox');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
      modal.classList.remove('opacity-0');
    });
  }
}

function closeImageLightbox(fromPopstate = false, skipHistoryPop = false) {
  const modal = document.getElementById('image-lightbox-modal');
  const imgEl = document.getElementById('image-lightbox-img');
  if (!modal || modal.classList.contains('hidden')) {
    discardOverlayHistoryMarker('lightbox');
    return;
  }
  if (fromPopstate || skipHistoryPop) {
    discardOverlayHistoryMarker('lightbox');
  } else {
    popOverlayHistoryMarker('lightbox');
  }

  modal.classList.add('opacity-0');
  setTimeout(() => {
    modal.classList.add('hidden');
    lightboxGalleryItems = [];
    lightboxGalleryIndex = 0;
    if (imgEl) {
      imgEl.classList.remove('is-dragging');
      imgEl.style.transform = '';
      imgEl.style.opacity = '1';
      imgEl.removeAttribute('src');
    }
  }, 220);
}

/**
 * Fast Supabase REST helper: routes via Cloudflare Edge (/sb/*) using native fetch
 * with automatic fallback to direct supabase.co if the Worker proxy is unreachable.
 */
async function fetchSupabaseRestFast(restPath, accessToken = '') {
  const headers = {
    'apikey': SUPABASE_PUBLISHABLE_KEY,
    'Authorization': `Bearer ${accessToken || SUPABASE_PUBLISHABLE_KEY}`
  };

  try {
    const proxyRes = await fetch(`${SUPABASE_URL}/rest/v1/${restPath}`, {
      headers,
      cache: 'no-store'
    });
    if (proxyRes.ok) {
      return await proxyRes.json();
    }
  } catch (_proxyErr) {
    // Fallback below if proxy route is unreachable
  }

  const directRes = await fetch(`${SUPABASE_DIRECT_URL}/rest/v1/${restPath}`, {
    headers,
    cache: 'no-store'
  });
  if (!directRes.ok) throw new Error(`HTTP ${directRes.status}`);
  return await directRes.json();
}

/**
 * Fast Supabase REST POST helper: submits directly via Cloudflare Edge (/sb/*) using native fetch
 * so visitor comments work reliably on mobile networks even if the external Supabase JS CDN is slow or blocked.
 */
async function postSupabaseRestFast(restPath, payload, accessToken = '') {
  const headers = {
    'apikey': SUPABASE_PUBLISHABLE_KEY,
    'Authorization': `Bearer ${accessToken || SUPABASE_PUBLISHABLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };
  const bodyStr = JSON.stringify(payload);

  try {
    const proxyRes = await fetch(`${SUPABASE_URL}/rest/v1/${restPath}`, {
      method: 'POST',
      headers,
      body: bodyStr
    });
    if (proxyRes.ok) {
      return { ok: true };
    }
    if (proxyRes.status >= 400 && proxyRes.status < 500) {
      const errText = await proxyRes.text().catch(() => '');
      throw new Error(errText || `HTTP ${proxyRes.status}`);
    }
  } catch (proxyErr) {
    if (proxyErr && proxyErr.message && proxyErr.message.includes('HTTP 4')) {
      throw proxyErr;
    }
  }

  const directRes = await fetch(`${SUPABASE_DIRECT_URL}/rest/v1/${restPath}`, {
    method: 'POST',
    headers,
    body: bodyStr
  });
  if (!directRes.ok) {
    const errText = await directRes.text().catch(() => '');
    throw new Error(errText || `HTTP ${directRes.status}`);
  }
  return { ok: true };
}

async function uploadSingleFileToR2(file) {
  const client = await ensureSupabaseClientAsync();
  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : '';

  const res = await fetch(R2_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'track.mp3')
    },
    body: file
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) {
    throw new Error(json.error || `R2 upload failed (${res.status})`);
  }
  return json;
}

/**
 * Center-crops and compresses an uploaded avatar image into a crisp square JPEG (<= 512x512)
 * before streaming to Cloudflare R2 so circular portraits load instantaneously.
 */
function compressAvatarImageForSpeed(file, maxDim = 512) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      try {
        const minSide = Math.min(img.width, img.height);
        const sx = Math.round((img.width - minSide) / 2);
        const sy = Math.round((img.height - minSide) / 2);
        const outSize = Math.min(maxDim, Math.max(128, minSide));
        const canvas = document.createElement('canvas');
        canvas.width = outSize;
        canvas.height = outSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, outSize, outSize);
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.86);
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

/* ========================================================================
   DISCREET AUTHOR AUTHENTICATION & SUPABASE LIVE MOMENTS ENGINE
   ======================================================================== */
function registerSecretTap() {
  secretTapCount += 1;
  if (secretTapTimer) clearTimeout(secretTapTimer);
  if (secretTapCount >= 3) {
    secretTapCount = 0;
    openAuthorLoginModal();
    return;
  }
  secretTapTimer = setTimeout(() => {
    secretTapCount = 0;
  }, 650);
}

function openAuthorLoginModal() {
  if (isAuthorAuthenticated) {
    switchChapterDirectly('moment');
    return;
  }
  loadSupabaseSdk().catch(() => {});
  const modal = document.getElementById('author-login-modal');
  const statusEl = document.getElementById('author-login-status');
  if (!modal) return;
  if (modal.classList.contains('hidden')) {
    pushOverlayHistoryMarker('author-login');
  }
  if (statusEl) statusEl.textContent = '';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    const emailInput = document.getElementById('author-email-input');
    if (emailInput) emailInput.focus();
  }, 60);
}

function closeAuthorLoginModal(fromPopstate = false, skipHistoryPop = false) {
  const modal = document.getElementById('author-login-modal');
  if (!modal || modal.classList.contains('hidden')) {
    discardOverlayHistoryMarker('author-login');
    return;
  }
  if (fromPopstate || skipHistoryPop) {
    discardOverlayHistoryMarker('author-login');
  } else {
    popOverlayHistoryMarker('author-login');
  }
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function handleAuthorLoginSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('author-email-input').value.trim();
  const password = document.getElementById('author-password-input').value;
  const statusEl = document.getElementById('author-login-status');
  const submitBtn = document.getElementById('btn-author-signin');

  if (!email || !password) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'VERIFYING...';
  statusEl.textContent = '';

  try {
    const client = await ensureSupabaseClientAsync();
    if (!client) throw new Error('Auth service unavailable.');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      statusEl.textContent = error.message || 'Invalid credentials.';
      statusEl.className = 'font-mono-code text-[11px] text-rose-400 min-h-[16px]';
    } else {
      isAuthorAuthenticated = true;
      if (typeof syncButterflyBubbleUi === 'function') syncButterflyBubbleUi();
      document.getElementById('author-password-input').value = '';
      closeAuthorLoginModal(false, true);
      await fetchMomentComments();
      if (typeof fetchFriendsList === 'function') fetchFriendsList(true);
      switchChapterDirectly('moment');
    }
  } catch (err) {
    statusEl.textContent = (err && err.message) ? err.message : 'Connection error. Please try again.';
    statusEl.className = 'font-mono-code text-[11px] text-rose-400 min-h-[16px]';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'UNLOCK STUDIO ↵';
  }
}

async function handleAuthorLogout() {
  const client = ensureSupabaseClient();
  if (client) {
    await client.auth.signOut().catch(() => {});
  }
  isAuthorAuthenticated = false;
  if (typeof syncButterflyBubbleUi === 'function') syncButterflyBubbleUi();
  selectedMomentFiles = [];
  if (typeof revokeComposerPreviewUrls === 'function') revokeComposerPreviewUrls();
  if (typeof handleFriendsAuthLogout === 'function') handleFriendsAuthLogout();
  await fetchMomentComments();
  if (currentView === 'chapter' && activeBookId) {
    renderChapterContent(activeBookId);
  }
}

async function initSupabaseSession() {
  // Public visitors without a saved auth token never download external Supabase JS SDK
  if (!hasStoredSupabaseSession()) {
    isAuthorAuthenticated = false;
    if (typeof syncButterflyBubbleUi === 'function') syncButterflyBubbleUi();
    return;
  }

  try {
    const client = await ensureSupabaseClientAsync();
    if (!client) return;
    const { data } = await client.auth.getSession();
    isAuthorAuthenticated = Boolean(data && data.session);
    if (typeof syncButterflyBubbleUi === 'function') syncButterflyBubbleUi();
    if (isAuthorAuthenticated) {
      fetchMomentComments();
      if (typeof fetchFriendsList === 'function') fetchFriendsList(true);
      if (currentView === 'chapter' && activeBookId) {
        renderChapterContent(activeBookId);
      }
    }

    client.auth.onAuthStateChange(async (_event, session) => {
      const nextAuth = Boolean(session);
      if (nextAuth !== isAuthorAuthenticated) {
        isAuthorAuthenticated = nextAuth;
        if (typeof syncButterflyBubbleUi === 'function') syncButterflyBubbleUi();
        if (!isAuthorAuthenticated && typeof handleFriendsAuthLogout === 'function') {
          handleFriendsAuthLogout();
        } else if (typeof fetchFriendsList === 'function') {
          fetchFriendsList(true);
        }
        await fetchMomentComments();
        if (currentView === 'chapter' && activeBookId) {
          renderChapterContent(activeBookId);
        }
      }
    });
  } catch (err) {
    console.warn('Auth session check skipped:', err);
  }
}

/* ========================================================================
   SITE CONFIG (PROFILE FOCUS TAGS & BUTTERFLY BUBBLE — CLOUDFLARE R2 SYNC)
   ======================================================================== */
const SITE_CONFIG_CACHE_KEY = 'rudy_site_config_v1';
const ALLOWED_DEFAULT_BOOK_IDS = new Set(['', 'shelf', 'profile', 'moment', 'art', 'work']);
const DEFAULT_SITE_CONFIG = {
  profileTags: [
    { id: 'tag-english', label: 'English Learning', color: '#007aff' },
    { id: 'tag-thinking', label: 'Thinking', color: '#34c759' },
    { id: 'tag-math', label: 'Math', color: '#5856d6' }
  ],
  butterflyBubbleText: 'Close this page?',
  backToTopBubbleText: 'Back to top?',
  avatarUrl: './avatar.jpg',
  avatarKey: '',
  glassOpacity: 68,
  backgroundUrl: '',
  backgroundKey: '',
  defaultBookId: 'profile'
};

function sanitizeGlassOpacity(val, fallback = DEFAULT_SITE_CONFIG.glassOpacity) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(15, Math.min(95, Math.round(n)));
}

function sanitizeDefaultBookId(val, fallback = DEFAULT_SITE_CONFIG.defaultBookId) {
  const clean = typeof val === 'string' ? val.trim() : '';
  return ALLOWED_DEFAULT_BOOK_IDS.has(clean) ? (clean || fallback) : fallback;
}

let siteConfig = (() => {
  try {
    const raw = localStorage.getItem(SITE_CONFIG_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        profileTags: Array.isArray(parsed.profileTags) ? parsed.profileTags : DEFAULT_SITE_CONFIG.profileTags.map(t => ({ ...t })),
        butterflyBubbleText: typeof parsed.butterflyBubbleText === 'string' && parsed.butterflyBubbleText.trim()
          ? parsed.butterflyBubbleText.trim()
          : DEFAULT_SITE_CONFIG.butterflyBubbleText,
        backToTopBubbleText: typeof parsed.backToTopBubbleText === 'string'
          ? parsed.backToTopBubbleText.trim().slice(0, 80)
          : DEFAULT_SITE_CONFIG.backToTopBubbleText,
        avatarUrl: sanitizeSafeMediaUrl(parsed.avatarUrl, DEFAULT_SITE_CONFIG.avatarUrl),
        avatarKey: typeof parsed.avatarKey === 'string' ? parsed.avatarKey : '',
        glassOpacity: sanitizeGlassOpacity(parsed.glassOpacity, DEFAULT_SITE_CONFIG.glassOpacity),
        backgroundUrl: typeof parsed.backgroundUrl === 'string' && parsed.backgroundUrl.trim()
          ? sanitizeSafeMediaUrl(parsed.backgroundUrl, '')
          : '',
        backgroundKey: typeof parsed.backgroundKey === 'string' ? parsed.backgroundKey.trim().slice(0, 200) : '',
        defaultBookId: sanitizeDefaultBookId(parsed.defaultBookId, DEFAULT_SITE_CONFIG.defaultBookId)
      };
    }
  } catch (_e) {}
  return {
    profileTags: DEFAULT_SITE_CONFIG.profileTags.map(t => ({ ...t })),
    butterflyBubbleText: DEFAULT_SITE_CONFIG.butterflyBubbleText,
    backToTopBubbleText: DEFAULT_SITE_CONFIG.backToTopBubbleText,
    avatarUrl: DEFAULT_SITE_CONFIG.avatarUrl,
    avatarKey: '',
    glassOpacity: DEFAULT_SITE_CONFIG.glassOpacity,
    backgroundUrl: '',
    backgroundKey: '',
    defaultBookId: DEFAULT_SITE_CONFIG.defaultBookId
  };
})();

function getRudyAvatarUrl() {
  return sanitizeSafeMediaUrl(siteConfig && siteConfig.avatarUrl, './avatar.jpg');
}

function applySiteAppearanceFromConfig(overrideGlassOpacity = null) {
  const root = document.documentElement;
  const pct = sanitizeGlassOpacity(
    overrideGlassOpacity !== null ? overrideGlassOpacity : (siteConfig && siteConfig.glassOpacity),
    DEFAULT_SITE_CONFIG.glassOpacity
  );
  const alpha = (pct / 100).toFixed(2);
  const cardAlpha = Math.max(0.14, Math.min(0.95, pct / 100)).toFixed(2);
  const navAlpha = Math.max(0.12, Math.min(0.92, (pct * 0.88) / 100)).toFixed(2);
  root.style.setProperty('--glass-alpha', alpha);
  root.style.setProperty('--glass-card-alpha', cardAlpha);
  root.style.setProperty('--glass-nav-alpha', navAlpha);

  const bgUrl = siteConfig && typeof siteConfig.backgroundUrl === 'string'
    ? sanitizeSafeMediaUrl(siteConfig.backgroundUrl, '')
    : '';
  const hasBg = Boolean(bgUrl);
  root.classList.toggle('has-site-wallpaper', hasBg);

  const bgEl = document.getElementById('site-bg-wallpaper');
  if (bgEl) {
    if (hasBg) {
      const safeCssUrl = bgUrl.replace(/["'()\\]/g, encodeURIComponent);
      bgEl.style.backgroundImage = `url("${safeCssUrl}")`;
      bgEl.classList.add('is-active');
    } else {
      bgEl.style.backgroundImage = '';
      bgEl.classList.remove('is-active');
    }
  }
}

let hasFetchedSiteConfig = false;

function persistSiteConfigLocal() {
  try {
    localStorage.setItem(SITE_CONFIG_CACHE_KEY, JSON.stringify(siteConfig));
  } catch (_e) {}
}

async function fetchSiteConfig() {
  hasFetchedSiteConfig = true;
  try {
    const res = await fetch(`${R2_UPLOAD_ENDPOINT}/site-config`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data || typeof data !== 'object') return;

    let changed = false;
    if (Array.isArray(data.profileTags)) {
      siteConfig.profileTags = data.profileTags
        .filter(t => t && typeof t.label === 'string' && t.label.trim())
        .slice(0, 8)
        .map((t, idx) => ({
          id: t.id || `tag-${idx + 1}`,
          label: t.label.trim().slice(0, 32),
          color: sanitizeHexColor(t.color, '#e4d4a7')
        }));
      changed = true;
    }
    if (typeof data.butterflyBubbleText === 'string' && data.butterflyBubbleText.trim()) {
      siteConfig.butterflyBubbleText = data.butterflyBubbleText.trim().slice(0, 80);
      changed = true;
    }
    if (typeof data.backToTopBubbleText === 'string') {
      siteConfig.backToTopBubbleText = data.backToTopBubbleText.trim().slice(0, 80);
      changed = true;
    }
    if (typeof data.avatarUrl === 'string' && data.avatarUrl.trim()) {
      siteConfig.avatarUrl = sanitizeSafeMediaUrl(data.avatarUrl, DEFAULT_SITE_CONFIG.avatarUrl);
      changed = true;
    }
    if (typeof data.avatarKey === 'string') {
      siteConfig.avatarKey = data.avatarKey.trim().slice(0, 200);
    }
    if (data.glassOpacity !== undefined) {
      const nextGlass = sanitizeGlassOpacity(data.glassOpacity, DEFAULT_SITE_CONFIG.glassOpacity);
      if (nextGlass !== siteConfig.glassOpacity) {
        siteConfig.glassOpacity = nextGlass;
        changed = true;
      }
    }
    if (typeof data.backgroundUrl === 'string') {
      const nextBgUrl = data.backgroundUrl.trim() ? sanitizeSafeMediaUrl(data.backgroundUrl, '') : '';
      if (nextBgUrl !== siteConfig.backgroundUrl) {
        siteConfig.backgroundUrl = nextBgUrl;
        changed = true;
      }
    }
    if (typeof data.backgroundKey === 'string') {
      siteConfig.backgroundKey = data.backgroundKey.trim().slice(0, 200);
    }
    if (typeof data.defaultBookId === 'string') {
      const nextBook = sanitizeDefaultBookId(data.defaultBookId, DEFAULT_SITE_CONFIG.defaultBookId);
      if (nextBook !== siteConfig.defaultBookId) {
        siteConfig.defaultBookId = nextBook;
        changed = true;
      }
    }

    if (changed) {
      persistSiteConfigLocal();
      applySiteAppearanceFromConfig();
      if (typeof syncButterflyBubbleUi === 'function') syncButterflyBubbleUi();
      if (typeof currentView !== 'undefined' && currentView === 'chapter' && (activeBookId === 'profile' || activeBookId === 'moment')) {
        renderChapterContent(activeBookId);
        setTimeout(() => syncButterflyToCloseButton(false), 60);
      }
      if (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen && typeof renderFriendsSkyStage === 'function') {
        renderFriendsSkyStage(false);
      }
    }
  } catch (err) {
    console.warn('Site config sync skipped:', err);
  }
}

async function saveSiteConfigToR2(partialUpdates = {}) {
  if (Array.isArray(partialUpdates.profileTags)) {
    siteConfig.profileTags = partialUpdates.profileTags
      .filter(t => t && typeof t.label === 'string' && t.label.trim())
      .slice(0, 8)
      .map((t, idx) => ({
        id: t.id || `tag-${Date.now()}-${idx}`,
        label: t.label.trim().slice(0, 32),
        color: sanitizeHexColor(t.color, '#007aff')
      }));
  }
  if (typeof partialUpdates.butterflyBubbleText === 'string') {
    const cleaned = partialUpdates.butterflyBubbleText.trim().slice(0, 80);
    siteConfig.butterflyBubbleText = cleaned || DEFAULT_SITE_CONFIG.butterflyBubbleText;
  }
  if (typeof partialUpdates.backToTopBubbleText === 'string') {
    siteConfig.backToTopBubbleText = partialUpdates.backToTopBubbleText.trim().slice(0, 80);
  }
  if (typeof partialUpdates.avatarUrl === 'string') {
    siteConfig.avatarUrl = sanitizeSafeMediaUrl(partialUpdates.avatarUrl, DEFAULT_SITE_CONFIG.avatarUrl);
  }
  if (typeof partialUpdates.avatarKey === 'string') {
    siteConfig.avatarKey = partialUpdates.avatarKey.trim().slice(0, 200);
  }
  if (partialUpdates.glassOpacity !== undefined) {
    siteConfig.glassOpacity = sanitizeGlassOpacity(partialUpdates.glassOpacity, DEFAULT_SITE_CONFIG.glassOpacity);
  }
  if (typeof partialUpdates.backgroundUrl === 'string') {
    siteConfig.backgroundUrl = partialUpdates.backgroundUrl.trim()
      ? sanitizeSafeMediaUrl(partialUpdates.backgroundUrl, '')
      : '';
  }
  if (typeof partialUpdates.backgroundKey === 'string') {
    siteConfig.backgroundKey = partialUpdates.backgroundKey.trim().slice(0, 200);
  }
  if (typeof partialUpdates.defaultBookId === 'string') {
    siteConfig.defaultBookId = sanitizeDefaultBookId(partialUpdates.defaultBookId, DEFAULT_SITE_CONFIG.defaultBookId);
  }

  persistSiteConfigLocal();
  applySiteAppearanceFromConfig();
  if (typeof syncButterflyBubbleUi === 'function') syncButterflyBubbleUi();

  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated) {
    return { ok: false, localOnly: true, error: 'Author login required' };
  }

  try {
    const { data: sessionData } = await client.auth.getSession();
    const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : '';
    const res = await fetch(`${R2_UPLOAD_ENDPOINT}/site-config`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(siteConfig)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json.error || `Save failed (${res.status})` };
    }
    return { ok: true, config: json.config || siteConfig };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

/* ========================================================================
   MEDIA COMPRESSION (IMAGE CANVAS + ON-DEMAND DESKTOP FFMPEG.WASM VIDEO)
   ======================================================================== */
function compressImageFileForSpeed(file, maxDim = 1600, quality = 0.84) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/gif') {
      resolve(file);
      return;
    }
    if (file.size < 160 * 1024) {
      resolve(file);
      return;
    }
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const base = (file.name || 'photo').replace(/\.[^/.]+$/, '');
          resolve(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
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

let ffmpegInstancePromise = null;
function loadSingleThreadFfmpeg(onProgress) {
  if (ffmpegInstancePromise) return ffmpegInstancePromise;
  ffmpegInstancePromise = new Promise(async (resolve, reject) => {
    try {
      if (!window.FFmpeg) {
        await new Promise((resScript, rejScript) => {
          const s = document.createElement('script');
          s.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
          s.async = true;
          s.onload = resScript;
          s.onerror = () => rejScript(new Error('Failed to load video compressor'));
          document.head.appendChild(s);
        });
      }
      const { createFFmpeg } = window.FFmpeg;
      const instance = createFFmpeg({
        mainName: 'main',
        corePath: 'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
        log: false,
        progress: (p) => {
          if (typeof onProgress === 'function' && p && Number.isFinite(p.ratio)) {
            onProgress(Math.max(0, Math.min(1, p.ratio)));
          }
        }
      });
      await instance.load();
      resolve(instance);
    } catch (err) {
      ffmpegInstancePromise = null;
      reject(err);
    }
  });
  return ffmpegInstancePromise;
}

async function compressVideoFileWithFfmpeg(file, onProgress) {
  if (!file || !file.type || !file.type.startsWith('video/')) return file;
  try {
    const ffmpeg = await loadSingleThreadFfmpeg(onProgress);
    const { fetchFile } = window.FFmpeg;
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    const inName = `in.${ext}`;
    const outName = 'out.mp4';
    ffmpeg.FS('writeFile', inName, await fetchFile(file));
    await ffmpeg.run(
      '-i', inName,
      '-vf', "scale='min(1280,iw)':-2",
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      outName
    );
    const data = ffmpeg.FS('readFile', outName);
    try { ffmpeg.FS('unlink', inName); } catch (_e) {}
    try { ffmpeg.FS('unlink', outName); } catch (_e) {}
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    if (!blob.size || blob.size >= file.size) return file;
    const base = (file.name || 'video').replace(/\.[^/.]+$/, '');
    return new File([blob], `${base}.mp4`, { type: 'video/mp4' });
  } catch (err) {
    console.warn('Video compression skipped, using original:', err);
    return file;
  }
}

/* ========================================================================
   GITHUB PRIVATE VAULT STORAGE HELPERS (dbhhseeking-max/rudy-vault)
   ======================================================================== */
const GITHUB_PROXY_PREFIX = `${R2_UPLOAD_ENDPOINT}/gh/`;

function extractGitHubPathFromMediaUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const clean = url.split('?')[0].trim();
  if (!clean.startsWith(GITHUB_PROXY_PREFIX)) return '';
  try {
    return decodeURIComponent(clean.slice(GITHUB_PROXY_PREFIX.length)).replace(/^\/+/, '');
  } catch (_e) {
    return '';
  }
}

async function getAuthorAccessTokenOrThrow() {
  const client = await ensureSupabaseClientAsync();
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData && sessionData.session ? sessionData.session.access_token : '';
  if (!token) throw new Error('Author login required');
  return token;
}

async function fetchGitHubFolders() {
  try {
    const token = await getAuthorAccessTokenOrThrow();
    const res = await fetch(`${R2_UPLOAD_ENDPOINT}/gh-folders`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!res.ok) return ['moments', 'work-media', 'work-vault'];
    const json = await res.json().catch(() => ({}));
    return Array.isArray(json.folders) && json.folders.length > 0
      ? json.folders
      : ['moments', 'work-media', 'work-vault'];
  } catch (_e) {
    return ['moments', 'work-media', 'work-vault'];
  }
}

async function createGitHubFolder(folderPath) {
  const clean = String(folderPath || '').trim().replace(/^\/+|\/+$/g, '');
  if (!clean) throw new Error('Empty folder name');
  const token = await getAuthorAccessTokenOrThrow();
  const res = await fetch(`${R2_UPLOAD_ENDPOINT}/gh-folder`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ folder: clean })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Folder create failed (${res.status})`);
  }
  return json;
}

async function uploadSingleFileToGitHub(file, folder = 'moments') {
  const token = await getAuthorAccessTokenOrThrow();
  const cleanFolder = String(folder || 'moments').trim().replace(/^\/+|\/+$/g, '') || 'moments';
  const res = await fetch(`${R2_UPLOAD_ENDPOINT}/gh-upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'media.bin'),
      'X-Target-Folder': encodeURIComponent(cleanFolder)
    },
    body: file
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) {
    throw new Error(json.error || `GitHub upload failed (${res.status})`);
  }
  return json;
}

async function deleteGitHubVaultFile(ghPath) {
  if (!ghPath) return;
  try {
    const token = await getAuthorAccessTokenOrThrow();
    await fetch(`${R2_UPLOAD_ENDPOINT}/gh-file?path=${encodeURIComponent(ghPath)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (_e) {}
}

async function archiveVaultToGitHub(vaultPayload) {
  const token = await getAuthorAccessTokenOrThrow();
  const res = await fetch(`${R2_UPLOAD_ENDPOINT}/gh-archive-notes`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(vaultPayload)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `GitHub archive failed (${res.status})`);
  }
  return json;
}

/* ========================================================================
   MOMENTS PERSISTENT 8-LIKE CAP & SINGLE-IP WORKER RELAY HELPERS
   ======================================================================== */
const MOMENT_LIKES_STORAGE_KEY = 'rudy_liked_moments_v1';

function getLikedMomentsSet() {
  try {
    const raw = localStorage.getItem(MOMENT_LIKES_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map(String));
    }
  } catch (_e) {}
  return new Set();
}

function hasLikedMomentLocally(momentId) {
  return getLikedMomentsSet().has(String(momentId));
}

function markMomentLikedLocal(momentId) {
  try {
    const set = getLikedMomentsSet();
    set.add(String(momentId));
    localStorage.setItem(MOMENT_LIKES_STORAGE_KEY, JSON.stringify(Array.from(set).slice(-200)));
  } catch (_e) {}
}

async function incrementMomentLikeOnServer(momentId) {
  const res = await fetch(`${R2_UPLOAD_ENDPOINT}/moment-like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ momentId: String(momentId) })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Like failed (${res.status})`);
  }
  return json;
}

/* ========================================================================
   ONE-CLICK DARK / WARM PAPER LIGHT THEME ENGINE
   ======================================================================== */
const SITE_THEME_STORAGE_KEY = 'rudy_site_theme_v1';

function getSiteTheme() {
  return document.documentElement.classList.contains('theme-light') ? 'light' : 'dark';
}

function syncThemeToggleUi() {
  const isLight = getSiteTheme() === 'light';
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    btn.title = isLight ? 'Switch to Dark Mode' : 'Switch to Apple Light Mode';
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isLight ? '#f5f5f7' : '#0c0d0f');
  }
}

function applySiteTheme(theme, persist = true) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.classList.toggle('theme-light', next === 'light');
  if (persist) {
    try {
      localStorage.setItem(SITE_THEME_STORAGE_KEY, next);
    } catch (_e) {}
  }
  syncThemeToggleUi();
  if (typeof wsSyncThemeOnShell === 'function') {
    wsSyncThemeOnShell();
  }
}

function toggleSiteTheme() {
  const next = getSiteTheme() === 'light' ? 'dark' : 'light';
  applySiteTheme(next, true);
}

applySiteAppearanceFromConfig();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => applySiteAppearanceFromConfig());
}
