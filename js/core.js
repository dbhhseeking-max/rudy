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
const MOMENTS_CACHE_KEY = 'rudy_moments_cache_v1';
const COMMENTS_CACHE_KEY = 'rudy_comments_cache_v1';

let supabaseClient = null;
function ensureSupabaseClient() {
  if (!supabaseClient && window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return supabaseClient;
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
  const key = decodeURIComponent(clean.slice(prefix.length));
  if (!key || key === 'art-music-catalog.json' || key === 'work-notes-vault.json') return '';
  return key;
}

/* ========================================================================
   GLOBAL IMAGE LIGHTBOX (MOMENTS & WORK & STUDY)
   ======================================================================== */
function openImageLightbox(src, caption = '') {
  if (!src) return;
  const modal = document.getElementById('image-lightbox-modal');
  const imgEl = document.getElementById('image-lightbox-img');
  const capEl = document.getElementById('image-lightbox-caption');
  const origEl = document.getElementById('image-lightbox-original');
  if (!modal || !imgEl) return;

  imgEl.src = src;
  imgEl.alt = caption || 'Preview';
  if (capEl) capEl.textContent = caption || '';
  if (origEl) origEl.href = src;

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

function escapeHtmlSafely(raw) {
  const div = document.createElement('div');
  div.textContent = raw || '';
  return div.innerHTML;
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

async function uploadSingleFileToR2(file) {
  const client = ensureSupabaseClient();
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
  const client = ensureSupabaseClient();
  if (!client) return;

  const email = document.getElementById('author-email-input').value.trim();
  const password = document.getElementById('author-password-input').value;
  const statusEl = document.getElementById('author-login-status');
  const submitBtn = document.getElementById('btn-author-signin');

  if (!email || !password) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'VERIFYING...';
  statusEl.textContent = '';

  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      statusEl.textContent = error.message || 'Invalid credentials.';
      statusEl.className = 'font-mono-code text-[11px] text-rose-400 min-h-[16px]';
    } else {
      isAuthorAuthenticated = true;
      document.getElementById('author-password-input').value = '';
      closeAuthorLoginModal();
      await fetchMomentComments();
      switchChapterDirectly('moment');
    }
  } catch (err) {
    statusEl.textContent = 'Connection error. Please try again.';
    statusEl.className = 'font-mono-code text-[11px] text-rose-400 min-h-[16px]';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'UNLOCK STUDIO ↵';
  }
}

async function handleAuthorLogout() {
  const client = ensureSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
  isAuthorAuthenticated = false;
  selectedMomentFiles = [];
  await fetchMomentComments();
  if (currentView === 'chapter' && activeBookId) {
    renderChapterContent(activeBookId);
  }
}

async function initSupabaseSession() {
  const client = ensureSupabaseClient();
  if (!client) return;
  try {
    const { data } = await client.auth.getSession();
    isAuthorAuthenticated = Boolean(data && data.session);
    if (isAuthorAuthenticated) {
      fetchMomentComments();
      if (currentView === 'chapter' && activeBookId) {
        renderChapterContent(activeBookId);
      }
    }

    client.auth.onAuthStateChange(async (_event, session) => {
      const nextAuth = Boolean(session);
      if (nextAuth !== isAuthorAuthenticated) {
        isAuthorAuthenticated = nextAuth;
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
