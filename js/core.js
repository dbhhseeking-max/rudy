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
   GLOBAL IMAGE LIGHTBOX (MOMENTS & WORK & STUDY)
   ======================================================================== */
function openImageLightbox(src, caption = '') {
  const safeSrc = sanitizeSafeMediaUrl(src);
  if (!safeSrc) return;
  const modal = document.getElementById('image-lightbox-modal');
  const imgEl = document.getElementById('image-lightbox-img');
  const capEl = document.getElementById('image-lightbox-caption');
  const origEl = document.getElementById('image-lightbox-original');
  if (!modal || !imgEl) return;

  imgEl.src = safeSrc;
  imgEl.alt = caption || 'Preview';
  if (capEl) capEl.textContent = caption || '';
  if (origEl) origEl.href = safeSrc;

  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.remove('opacity-0');
  });
}

function closeImageLightbox() {
  const modal = document.getElementById('image-lightbox-modal');
  const imgEl = document.getElementById('image-lightbox-img');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('opacity-0');
  setTimeout(() => {
    modal.classList.add('hidden');
    if (imgEl) imgEl.removeAttribute('src');
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
  if (statusEl) statusEl.textContent = '';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    const emailInput = document.getElementById('author-email-input');
    if (emailInput) emailInput.focus();
  }, 60);
}

function closeAuthorLoginModal() {
  const modal = document.getElementById('author-login-modal');
  if (!modal) return;
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
      closeAuthorLoginModal();
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
const DEFAULT_SITE_CONFIG = {
  profileTags: [
    { id: 'tag-english', label: 'English Learning', color: '#e4d4a7' },
    { id: 'tag-thinking', label: 'Thinking', color: '#a7b08e' },
    { id: 'tag-math', label: 'Math', color: '#e4d4a7' }
  ],
  butterflyBubbleText: 'Close this page?',
  backToTopBubbleText: 'Back to top?',
  avatarUrl: './avatar.jpg',
  avatarKey: ''
};

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
        avatarKey: typeof parsed.avatarKey === 'string' ? parsed.avatarKey : ''
      };
    }
  } catch (_e) {}
  return {
    profileTags: DEFAULT_SITE_CONFIG.profileTags.map(t => ({ ...t })),
    butterflyBubbleText: DEFAULT_SITE_CONFIG.butterflyBubbleText,
    backToTopBubbleText: DEFAULT_SITE_CONFIG.backToTopBubbleText,
    avatarUrl: DEFAULT_SITE_CONFIG.avatarUrl,
    avatarKey: ''
  };
})();

function getRudyAvatarUrl() {
  return sanitizeSafeMediaUrl(siteConfig && siteConfig.avatarUrl, './avatar.jpg');
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

    if (changed) {
      persistSiteConfigLocal();
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
        color: sanitizeHexColor(t.color, '#e4d4a7')
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

  persistSiteConfigLocal();
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
