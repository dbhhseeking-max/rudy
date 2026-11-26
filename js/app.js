/* ==========================================================================
   APP SHELL: BOOKS REGISTRY, 3D BOOKSHELF, BUTTERFLY ENGINE & ROUTING
   ========================================================================== */

/**
 * Structured editorial content for each of the four R-U-D-Y volumes.
 */
const BOOKS_DATA = [
  {
    id: 'profile',
    letter: 'R',
    index: '01 / 04',
    shortLabel: 'R · Profile',
    title: "Rudy's Profile",
    subtitle: 'VOLUME R · PERSONAL CARD',
    accent: '#a7b08e',
    getHtml: buildProfileHtml
  },
  {
    id: 'work',
    letter: 'U',
    index: '02 / 04',
    shortLabel: 'U · Work & Study',
    title: 'Upward: Work & Study',
    subtitle: 'VOLUME U · OBSIDIAN MARKDOWN VAULT & GRAPH',
    accent: '#569cd6',
    getHtml: buildWorkStudyHtml
  },
  {
    id: 'moment',
    letter: 'D',
    index: '03 / 04',
    shortLabel: 'D · Moments',
    title: 'Daily Moments',
    subtitle: 'VOLUME D · LIFE & LANGUAGE SNAPSHOTS',
    accent: '#e2c458',
    getHtml: buildMomentsFeedHtml
  },
  {
    id: 'art',
    letter: 'Y',
    index: '04 / 04',
    shortLabel: 'Y · Art',
    title: 'Yearning for Art',
    subtitle: 'VOLUME Y · AESTHETICS, GALLERY & ACOUSTICS',
    accent: '#d47a9c',
    getHtml: buildArtHtml
  }
];

/* ========================================================================
   APPLICATION STATE & DOM REFERENCES
   ======================================================================== */
let activeBookId = null;
let currentView = 'shelf'; // 'shelf' | 'chapter'
let isTransitioning = false;
let openTransitionTimer = null;
let butterflyAnimFrame = null;
let butterflyPos = { x: -60, y: 120, angle: 12 };

const bookshelfViewEl = document.getElementById('bookshelf-view');
const chapterPageViewEl = document.getElementById('chapter-page-view');
const shelfTitlesBarEl = document.getElementById('shelf-titles-bar');
const chapterTabsEl = document.getElementById('chapter-tabs');
const readerContentEl = document.getElementById('reader-content');
const folioDotsEl = document.getElementById('folio-dots');
const butterflyEl = document.getElementById('butterfly-actor');
const butterflyBubbleEl = document.getElementById('butterfly-bubble');
const closeBtnEl = document.getElementById('btn-close-book');

let isApplyingHashRoute = false;

function parseRouteFromHash() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '').trim();
  if (!raw) return null;
  const parts = raw.split('/');
  const head = (parts[0] || '').toLowerCase();
  if (head === 'shelf') {
    return { view: 'shelf' };
  }
  if (head === 'friends') {
    return { view: 'friends' };
  }
  if (['profile', 'work', 'moment', 'art'].includes(head)) {
    const subId = parts.slice(1).join('/');
    return {
      view: 'chapter',
      bookId: head,
      noteId: subId ? decodeURIComponent(subId) : null
    };
  }
  return null;
}

function updateDocumentTitle() {
  if (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen) {
    document.title = 'Friend List · Rudy — StudyEnglishWith.me';
    return;
  }
  if (currentView !== 'chapter' || !activeBookId) {
    document.title = 'Study English with Rudy — Interactive Press';
    return;
  }
  if (activeBookId === 'work') {
    const activeNote = typeof wsGetActiveNote === 'function' ? wsGetActiveNote() : null;
    document.title = activeNote && activeNote.title
      ? `${activeNote.title} · Work & Study — StudyEnglishWith.me`
      : 'Upward: Work & Study — StudyEnglishWith.me';
    return;
  }
  const book = BOOKS_DATA.find(b => b.id === activeBookId);
  document.title = book
    ? `${book.title} — StudyEnglishWith.me`
    : 'Study English with Rudy — Interactive Press';
}

function syncRouteHash(push = true) {
  if (isApplyingHashRoute) return;
  let targetHash = '';
  if (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen) {
    targetHash = '#friends';
  } else if (currentView === 'chapter' && activeBookId) {
    if (activeBookId === 'work' && typeof wsVault !== 'undefined' && wsVault && wsVault.activeNoteId) {
      targetHash = `#work/${encodeURIComponent(wsVault.activeNoteId)}`;
    } else {
      targetHash = `#${activeBookId}`;
    }
  } else if (currentView === 'shelf' && window.location.hash) {
    targetHash = '#shelf';
  }
  if (targetHash && window.location.hash !== targetHash) {
    try {
      if (push) {
        history.pushState(null, '', targetHash);
      } else {
        history.replaceState(null, '', targetHash);
      }
    } catch (_e) {
      window.location.hash = targetHash;
    }
  }
}

function applyRouteFromHash(route, isInitialLoad = false) {
  if (!route) return false;
  isApplyingHashRoute = true;
  try {
    if (route.view === 'friends') {
      if (isInitialLoad) {
        activeBookId = 'profile';
        currentView = 'chapter';
        renderNavigationIndicators();
        renderChapterContent('profile');
        bookshelfViewEl.classList.add('hidden');
        bookshelfViewEl.style.opacity = '0';
        chapterPageViewEl.classList.remove('hidden');
        chapterPageViewEl.style.opacity = '1';
        chapterPageViewEl.style.transform = 'translateY(0)';
        syncTopVinylDockForRoute();
      }
      if (typeof openFriendsSkyFromProfile === 'function') {
        openFriendsSkyFromProfile(null, true);
      }
      return true;
    }

    if (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen && typeof closeFriendsSky === 'function') {
      closeFriendsSky(true);
    }

    if (route.view === 'shelf') {
      if (isInitialLoad) {
        currentView = 'shelf';
        activeBookId = null;
        renderNavigationIndicators();
        updateDocumentTitle();
        requestAnimationFrame(() => {
          const restSpot = getBookPerchCoords('profile');
          setButterflyTransform(restSpot.x, Math.max(85, restSpot.y - 34), 8, 1);
          butterflyEl.style.opacity = '1';
          butterflyEl.classList.add('is-perched');
        });
      } else if (currentView !== 'shelf') {
        returnToBookshelf();
      }
      return true;
    }

    if (route.view === 'chapter' && route.bookId) {
      if (route.bookId === 'work' && route.noteId) {
        if (typeof wsPendingDeepLinkNoteId !== 'undefined') {
          wsPendingDeepLinkNoteId = route.noteId;
        }
        if (typeof wsVault !== 'undefined' && wsVault) {
          const targetNote = wsVault.notes.find(n => n.id === route.noteId);
          if (targetNote) {
            wsVault.activeNoteId = targetNote.id;
            if (!wsVault.openTabIds.includes(targetNote.id)) {
              wsVault.openTabIds.push(targetNote.id);
            }
          }
        }
      }

      if (isInitialLoad) {
        activeBookId = route.bookId;
        currentView = 'chapter';
        renderNavigationIndicators();
        renderChapterContent(route.bookId);
        bookshelfViewEl.classList.add('hidden');
        bookshelfViewEl.style.opacity = '0';

        if (route.bookId === 'profile') {
          setButterflyTransform(window.innerWidth * 0.45, window.innerHeight * 0.48, -8, 1);
          butterflyEl.style.opacity = '1';
          butterflyEl.classList.add('is-shimmering');
          playBookPageTurnTransition('profile', { x: window.innerWidth * 0.5, y: window.innerHeight * 0.48 }, () => {
            chapterPageViewEl.classList.remove('hidden', 'breeze-page-enter');
            void chapterPageViewEl.offsetWidth;
            chapterPageViewEl.classList.add('breeze-page-enter');
            chapterPageViewEl.style.opacity = '1';
            chapterPageViewEl.style.transform = 'translateY(0)';
            syncTopVinylDockForRoute();
            updateDocumentTitle();
            requestAnimationFrame(() => {
              setTimeout(() => syncButterflyToCloseButton(true, true), 60);
            });
          });
        } else {
          chapterPageViewEl.classList.remove('hidden');
          chapterPageViewEl.style.opacity = '1';
          chapterPageViewEl.style.transform = 'translateY(0)';
          syncTopVinylDockForRoute();
          updateDocumentTitle();
          requestAnimationFrame(() => {
            setTimeout(() => syncButterflyToCloseButton(false), 60);
          });
        }
      } else {
        switchChapterDirectly(route.bookId);
      }
      return true;
    }
  } finally {
    isApplyingHashRoute = false;
  }
  return false;
}

function applyWorkWideLayout(isWork) {
  document.body.classList.toggle('is-chapter-view', currentView === 'chapter');
  document.body.classList.toggle('is-work-wide', Boolean(isWork));
  if (chapterPageViewEl) {
    chapterPageViewEl.classList.toggle('max-w-6xl', Boolean(isWork));
    chapterPageViewEl.classList.toggle('max-w-3xl', !isWork);
  }
  if (currentView === 'chapter' && isButterflyAnchoredInTopbar) {
    requestAnimationFrame(() => anchorButterflyToActiveTab());
  }
}

let breezeScatterFrame = null;
let activeBubbleEditorMode = 'main'; // 'main' | 'backtop'
let isButterflyAnchoredInTopbar = false;
let isButterflyTwirling = false;
let lastKnownButterflyAngle = -6;
let ribbonBubblePeekTimer = null;

function syncButterflyBubbleUi() {
  const canEdit = Boolean(isAuthorAuthenticated);

  // 1. Main Nav Butterfly Bubble
  const textEl = document.getElementById('butterfly-bubble-text');
  const editBtn = document.getElementById('butterfly-bubble-edit-btn');
  const bubbleText = (typeof siteConfig !== 'undefined' && siteConfig.butterflyBubbleText)
    ? siteConfig.butterflyBubbleText
    : 'Close this page?';

  if (textEl) textEl.textContent = bubbleText;
  if (butterflyEl) butterflyEl.title = 'Tap butterfly to flutter';
  if (editBtn) {
    editBtn.hidden = !canEdit;
    editBtn.classList.toggle('hidden', !canEdit);
  }

  // 2. Moments & Art Back-to-Top Butterfly Bubble (Editable & Deletable by Admin)
  const btBubbleEl = document.getElementById('backtop-bubble');
  const btTextEl = document.getElementById('backtop-bubble-text');
  const btEditBtn = document.getElementById('backtop-bubble-edit-btn');
  const btAddBtn = document.getElementById('backtop-bubble-add-btn');
  const btText = (typeof siteConfig !== 'undefined' && typeof siteConfig.backToTopBubbleText === 'string')
    ? siteConfig.backToTopBubbleText.trim()
    : 'Back to top?';

  const hasBtText = btText.length > 0;
  if (btTextEl) btTextEl.textContent = btText;
  if (btBubbleEl) {
    btBubbleEl.hidden = !hasBtText;
    btBubbleEl.classList.toggle('hidden', !hasBtText);
  }
  if (btEditBtn) {
    const showInlineEdit = canEdit && hasBtText;
    btEditBtn.hidden = !showInlineEdit;
    btEditBtn.classList.toggle('hidden', !showInlineEdit);
  }
  if (btAddBtn) {
    const showReadd = canEdit && !hasBtText;
    btAddBtn.hidden = !showReadd;
    btAddBtn.classList.toggle('hidden', !showReadd);
  }
}

function openButterflyBubbleEditor(event, mode = 'main') {
  if (event) event.stopPropagation();
  if (!isAuthorAuthenticated) return;
  const modal = document.getElementById('butterfly-bubble-modal');
  const input = document.getElementById('butterfly-bubble-modal-input');
  const statusEl = document.getElementById('butterfly-bubble-modal-status');
  const kickerEl = document.getElementById('butterfly-bubble-modal-kicker');
  const headingEl = document.getElementById('butterfly-bubble-modal-heading');
  const delBtn = document.getElementById('btn-delete-butterfly-bubble');
  if (!modal || !input) return;

  activeBubbleEditorMode = mode === 'backtop' ? 'backtop' : 'main';
  const isBackTop = activeBubbleEditorMode === 'backtop';

  if (kickerEl) {
    kickerEl.textContent = isBackTop ? '✦ BACK-TO-TOP BUTTERFLY' : '✦ BUTTERFLY COMPANION';
  }
  if (headingEl) {
    headingEl.textContent = isBackTop ? 'Edit Back-to-Top Bubble' : 'Edit Speech Bubble';
  }
  if (delBtn) {
    delBtn.hidden = !isBackTop;
    delBtn.classList.toggle('hidden', !isBackTop);
  }

  if (isBackTop) {
    input.required = false;
    input.placeholder = 'Back to top? (leave blank to hide)';
    input.value = (siteConfig && typeof siteConfig.backToTopBubbleText === 'string')
      ? siteConfig.backToTopBubbleText
      : 'Back to top?';
  } else {
    input.required = true;
    input.placeholder = 'Close this page?';
    input.value = (siteConfig && siteConfig.butterflyBubbleText)
      ? siteConfig.butterflyBubbleText
      : 'Close this page?';
  }

  if (statusEl) statusEl.textContent = '';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    input.focus();
    input.select();
  }, 60);
}

function closeButterflyBubbleEditor() {
  const modal = document.getElementById('butterfly-bubble-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function handleDeleteBackTopBubbleFromModal() {
  if (!isAuthorAuthenticated) return;
  const statusEl = document.getElementById('butterfly-bubble-modal-status');
  const delBtn = document.getElementById('btn-delete-butterfly-bubble');
  if (delBtn) {
    delBtn.disabled = true;
    delBtn.textContent = 'DELETING...';
  }
  if (statusEl) {
    statusEl.textContent = 'Removing bubble & syncing to Cloudflare R2...';
    statusEl.className = 'font-mono-code text-[11px] text-[#e4d4a7] min-h-[16px]';
  }

  const res = await saveSiteConfigToR2({ backToTopBubbleText: '' });
  if (delBtn) {
    delBtn.disabled = false;
    delBtn.textContent = 'DELETE';
  }

  if (res.ok) {
    if (statusEl) {
      statusEl.textContent = '✓ Bubble deleted and synced to Cloudflare R2';
      statusEl.className = 'font-mono-code text-[11px] text-emerald-400 min-h-[16px]';
    }
    if (currentView === 'chapter' && activeBookId === 'profile') {
      renderChapterContent('profile');
    }
    setTimeout(() => closeButterflyBubbleEditor(), 600);
  } else if (statusEl) {
    statusEl.textContent = 'Deleted locally (deploy updated worker.js to sync cloud).';
    statusEl.className = 'font-mono-code text-[11px] text-amber-300 min-h-[16px]';
  }
}

async function handleButterflyBubbleModalSubmit(event) {
  event.preventDefault();
  if (!isAuthorAuthenticated) return;
  const input = document.getElementById('butterfly-bubble-modal-input');
  const statusEl = document.getElementById('butterfly-bubble-modal-status');
  const saveBtn = document.getElementById('btn-save-butterfly-bubble');
  if (!input || !saveBtn) return;

  const isBackTop = activeBubbleEditorMode === 'backtop';
  const rawTrimmed = input.value.trim().slice(0, 80);
  const payload = isBackTop
    ? { backToTopBubbleText: rawTrimmed }
    : { butterflyBubbleText: rawTrimmed || DEFAULT_SITE_CONFIG.butterflyBubbleText };

  saveBtn.disabled = true;
  saveBtn.textContent = 'SAVING...';
  if (statusEl) {
    statusEl.textContent = 'Saving to Cloudflare R2...';
    statusEl.className = 'font-mono-code text-[11px] text-[#e4d4a7] min-h-[16px]';
  }

  const res = await saveSiteConfigToR2(payload);
  saveBtn.disabled = false;
  saveBtn.textContent = 'SAVE BUBBLE ↵';

  if (res.ok) {
    if (statusEl) {
      statusEl.textContent = isBackTop && !rawTrimmed
        ? '✓ Bubble hidden and synced to Cloudflare R2'
        : '✓ Updated and synced to Cloudflare R2';
      statusEl.className = 'font-mono-code text-[11px] text-emerald-400 min-h-[16px]';
    }
    if (currentView === 'chapter' && activeBookId === 'profile') {
      renderChapterContent('profile');
    }
    setTimeout(() => closeButterflyBubbleEditor(), 650);
  } else {
    if (statusEl) {
      statusEl.textContent = 'Saved locally (deploy updated worker.js to sync cloud).';
      statusEl.className = 'font-mono-code text-[11px] text-amber-300 min-h-[16px]';
    }
  }
}

/* ========================================================================
   MOMENTS & ART EXCLUSIVE BACK-TO-TOP WIDGET CONTROLLER
   ======================================================================== */
function syncBackToTopVisibility() {
  const widget = document.getElementById('back-to-top-widget');
  if (!widget) return;

  const isEligiblePage = currentView === 'chapter' && (activeBookId === 'moment' || activeBookId === 'art');
  const isOverlayBlocking =
    (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen) ||
    (typeof wsGraphOpen !== 'undefined' && wsGraphOpen);
  const scrolledEnough = window.scrollY > 260;

  const shouldShow = isEligiblePage && scrolledEnough && !isOverlayBlocking;

  if (!isEligiblePage) {
    widget.classList.remove('is-visible');
    widget.classList.add('hidden');
    widget.setAttribute('aria-hidden', 'true');
    return;
  }

  widget.classList.remove('hidden');
  widget.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  requestAnimationFrame(() => {
    widget.classList.toggle('is-visible', shouldShow);
  });
}

function handleBackToTopClick() {
  const btn = document.getElementById('backtop-trigger-btn');
  if (btn) {
    btn.classList.add('is-lifting');
    setTimeout(() => btn.classList.remove('is-lifting'), 460);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function createBreezeButterflySvgMarkup(uid) {
  return `
    <div class="butterfly-3d-stage">
      <div class="butterfly-wing-pane wing-left">
        <svg viewBox="0 0 50 100" class="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="bzWingUL_${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fffdf4" stop-opacity="0.96" />
              <stop offset="55%" stop-color="#e4d4a7" stop-opacity="0.88" />
              <stop offset="100%" stop-color="#c3a464" stop-opacity="0.9" />
            </linearGradient>
            <linearGradient id="bzWingLL_${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f6ebd0" stop-opacity="0.9" />
              <stop offset="100%" stop-color="#a88b4f" stop-opacity="0.85" />
            </linearGradient>
          </defs>
          <path d="M48.5 47 C33 17, 6 15, 10 42 C13 55, 33 56, 48.5 52 Z" fill="url(#bzWingUL_${uid})" stroke="#fffdf7" stroke-width="0.7"/>
          <path d="M48.5 52 C33 56, 16 68, 24 82 C31 91, 44 76, 48.5 58 Z" fill="url(#bzWingLL_${uid})" stroke="#fffdf7" stroke-width="0.6"/>
        </svg>
      </div>
      <div class="butterfly-wing-pane wing-right">
        <svg viewBox="50 0 50 100" class="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="bzWingUR_${uid}" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#fffdf4" stop-opacity="0.96" />
              <stop offset="55%" stop-color="#e4d4a7" stop-opacity="0.88" />
              <stop offset="100%" stop-color="#c3a464" stop-opacity="0.9" />
            </linearGradient>
            <linearGradient id="bzWingLR_${uid}" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#f6ebd0" stop-opacity="0.9" />
              <stop offset="100%" stop-color="#a88b4f" stop-opacity="0.85" />
            </linearGradient>
          </defs>
          <path d="M51.5 47 C67 17, 94 15, 90 42 C87 55, 67 56, 51.5 52 Z" fill="url(#bzWingUR_${uid})" stroke="#fffdf7" stroke-width="0.7"/>
          <path d="M51.5 52 C67 56, 84 68, 76 82 C69 91, 56 76, 51.5 58 Z" fill="url(#bzWingLR_${uid})" stroke="#fffdf7" stroke-width="0.6"/>
        </svg>
      </div>
      <div class="butterfly-body-pane">
        <svg viewBox="0 0 100 100" class="w-full h-full overflow-visible">
          <ellipse cx="50" cy="52" rx="1.6" ry="11" fill="#3a2f1d" stroke="#e4d4a7" stroke-width="0.35" />
          <circle cx="50" cy="40" r="1.4" fill="#3a2f1d" />
        </svg>
      </div>
    </div>
  `;
}

let pageTurnCleanupTimer = null;

function spawnButterflyShimmerMote(x, y, container) {
  const stage = container || document.getElementById('breeze-transition-stage');
  if (!stage) return;
  const mote = document.createElement('div');
  mote.className = 'breeze-spark-mote';
  const size = 1.8 + Math.random() * 1.8;
  mote.style.width = `${size.toFixed(1)}px`;
  mote.style.height = `${size.toFixed(1)}px`;
  mote.style.left = `${x + (Math.random() - 0.5) * 12}px`;
  mote.style.top = `${y + (Math.random() - 0.5) * 12}px`;
  stage.appendChild(mote);
  setTimeout(() => mote.remove(), 780);
}

/**
 * Tactile 3D Book Page-Turning Cut-In Animation:
 * Renders an editorial hardcover spread where 3 layered dark-parchment pages flip
 * from right to left across a central spine crease, releasing the warm breeze and
 * scattering companion butterflies as the Profile page settles smoothly into view.
 */
function playBookPageTurnTransition(bookId, originCoords, onRevealPage) {
  const overlay = document.getElementById('book-pageturn-overlay');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!overlay || reducedMotion) {
    if (typeof onRevealPage === 'function') onRevealPage();
    return;
  }

  if (pageTurnCleanupTimer) {
    clearTimeout(pageTurnCleanupTimer);
    pageTurnCleanupTimer = null;
  }

  const book = BOOKS_DATA.find(b => b.id === bookId) || BOOKS_DATA[0];
  const safeTitle = escapeHtmlSafely(book.title);
  const safeSub = escapeHtmlSafely(book.subtitle);

  overlay.innerHTML = `
    <div class="pageturn-book">
      <div class="pageturn-spread-left">
        <div class="w-16 h-16 rounded-full border border-[#e4d4a7]/22 flex items-center justify-center">
          <div class="w-10 h-10 rounded-full border border-[#e4d4a7]/15"></div>
        </div>
        <span class="mt-4 font-mono-code text-[9px] tracking-[0.22em] uppercase text-[#e4d4a7]/40">
          OPENING FOLIO
        </span>
      </div>

      <div class="pageturn-spread-right">
        <div class="font-mono-code text-[9px] tracking-[0.2em] uppercase text-[#e4d4a7]/45">
          RUDY'S PRESS · EDITION
        </div>
        <div class="space-y-2 my-auto">
          <p class="font-mono-code text-[9px] tracking-[0.18em] uppercase text-[#a7b08e]/70">${safeSub}</p>
          <p class="font-serif-editorial italic text-xl sm:text-2xl text-[#f3f1ec]/75">${safeTitle}</p>
        </div>
        <div class="font-mono-code text-[9px] tracking-[0.16em] uppercase text-white/25">
          STUDYENGLISHWITH.ME
        </div>
      </div>

      <div class="pageturn-spine-shadow"></div>

      <!-- 3 Staggered 3D Turning Leaves -->
      <div class="pageturn-leaf leaf-3">
        <div class="pageturn-leaf-face pageturn-leaf-front">
          <span class="font-mono-code text-[9px] tracking-[0.18em] uppercase text-[#e4d4a7]/40">PAGE 03</span>
          <div class="pageturn-folio-lines my-auto">
            <span style="width: 72%"></span>
            <span style="width: 90%"></span>
            <span style="width: 64%"></span>
            <span style="width: 82%"></span>
          </div>
          <span class="font-serif-editorial italic text-xs text-white/30">Rudy</span>
        </div>
        <div class="pageturn-leaf-face pageturn-leaf-back"></div>
      </div>

      <div class="pageturn-leaf leaf-2">
        <div class="pageturn-leaf-face pageturn-leaf-front">
          <span class="font-mono-code text-[9px] tracking-[0.18em] uppercase text-[#e4d4a7]/35">PAGE 02</span>
          <div class="pageturn-folio-lines my-auto">
            <span style="width: 85%"></span>
            <span style="width: 68%"></span>
            <span style="width: 78%"></span>
          </div>
          <span class="font-mono-code text-[9px] text-white/20">01 / 04</span>
        </div>
        <div class="pageturn-leaf-face pageturn-leaf-back"></div>
      </div>

      <div class="pageturn-leaf leaf-1">
        <div class="pageturn-leaf-face pageturn-leaf-front">
          <span class="font-mono-code text-[9px] tracking-[0.18em] uppercase text-[#e4d4a7]/50">EX LIBRIS</span>
          <div class="my-auto space-y-1.5">
            <p class="font-serif-editorial text-lg sm:text-xl text-[#f3f1ec]/75">${safeTitle}</p>
            <p class="font-mono-code text-[9px] tracking-[0.16em] uppercase text-white/35">Stay hungry, stay foolish</p>
          </div>
          <span class="font-mono-code text-[9px] text-[#e4d4a7]/35">VOL. 01</span>
        </div>
        <div class="pageturn-leaf-face pageturn-leaf-back"></div>
      </div>
    </div>
  `;

  overlay.classList.remove('hidden', 'is-exiting', 'is-active');
  void overlay.offsetWidth;
  overlay.classList.add('is-active');

  // Sweep warm breeze & release companion butterflies as pages fan open
  const centerOrigin = originCoords || { x: window.innerWidth * 0.5, y: window.innerHeight * 0.48 };
  setTimeout(() => {
    playProfileBreezeCutIn(centerOrigin);
  }, 150);

  // Reveal the live Profile folio underneath as the final leaf sweeps past the spine
  setTimeout(() => {
    if (typeof onRevealPage === 'function') onRevealPage();
  }, 640);

  // Dissolve the 3D book spread seamlessly into the revealed page
  setTimeout(() => {
    overlay.classList.add('is-exiting');
  }, 820);

  pageTurnCleanupTimer = setTimeout(() => {
    overlay.classList.remove('is-active', 'is-exiting');
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    pageTurnCleanupTimer = null;
  }, 1320);
}

/**
 * Silky cinematic cut-in when Rudy's Profile opens from the bookshelf:
 * - Warm golden breeze ribbons sweep gently across the unfolding page
 * - Delicate companion butterflies scatter outward on the wind and fade into soft light
 */
function playProfileBreezeCutIn(originCoords) {
  const stage = document.getElementById('breeze-transition-stage');
  if (!stage) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  if (breezeScatterFrame) {
    cancelAnimationFrame(breezeScatterFrame);
    breezeScatterFrame = null;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ox = originCoords ? originCoords.x : vw * 0.42;
  const oy = originCoords ? originCoords.y : vh * 0.48;

  stage.innerHTML = `
    <div class="breeze-veil"></div>
    <svg class="breeze-ribbons-svg" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="breezeRibbonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#e4d4a7" stop-opacity="0" />
          <stop offset="35%" stop-color="#f6ebd0" stop-opacity="0.34" />
          <stop offset="70%" stop-color="#e4d4a7" stop-opacity="0.22" />
          <stop offset="100%" stop-color="#e4d4a7" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path class="breeze-ribbon-path ribbon-1" d="M -120 560 C 260 440, 560 520, 960 350 C 1180 250, 1340 270, 1580 180" stroke="url(#breezeRibbonGrad)" stroke-width="2.2" fill="none" />
      <path class="breeze-ribbon-path ribbon-2" d="M -140 430 C 220 350, 620 420, 1020 260 C 1220 180, 1380 210, 1600 110" stroke="url(#breezeRibbonGrad)" stroke-width="1.5" fill="none" />
      <path class="breeze-ribbon-path ribbon-3" d="M -100 680 C 310 590, 700 610, 1120 430 C 1300 350, 1440 370, 1620 300" stroke="url(#breezeRibbonGrad)" stroke-width="1.2" fill="none" />
    </svg>
  `;
  stage.classList.remove('hidden');

  // Spawn 7 companion golden butterflies scattering outward on the breeze
  const scatterCount = vw < 640 ? 5 : 7;
  const seedBase = Date.now() % 10000;
  const scatterFlyers = [];

  for (let i = 0; i < scatterCount; i++) {
    const el = document.createElement('div');
    el.className = 'breeze-scatter-butterfly';
    el.innerHTML = createBreezeButterflySvgMarkup(`${seedBase}_${i}`);
    stage.appendChild(el);

    // Fan outward in an organic breeze direction (mostly up-right, up-left, and across)
    const spreadAngle = (-125 + (i / Math.max(1, scatterCount - 1)) * 165) * (Math.PI / 180);
    const dist = Math.min(vw, vh) * (0.42 + (i % 3) * 0.16);
    const startX = ox + (Math.random() - 0.5) * 70;
    const startY = oy + (Math.random() - 0.5) * 90;
    const endX = startX + Math.cos(spreadAngle) * dist + vw * 0.16;
    const endY = startY + Math.sin(spreadAngle) * dist - 65;

    scatterFlyers.push({
      el,
      startX,
      startY,
      endX,
      endY,
      cp1x: startX + (endX - startX) * 0.35 + (i % 2 === 0 ? -45 : 55),
      cp1y: Math.min(startY, endY) - 50 - (i % 3) * 20,
      cp2x: startX + (endX - startX) * 0.72 + 30,
      cp2y: endY + (i % 2 === 0 ? 35 : -35),
      delay: i * 55,
      duration: 1120 + (i % 3) * 180,
      baseScale: 0.46 + (i % 3) * 0.14,
      prevX: startX,
      prevY: startY,
      lastSparkMs: 0,
      done: false
    });
  }

  const t0 = performance.now();

  function tick(now) {
    let anyActive = false;

    for (const f of scatterFlyers) {
      if (f.done) continue;
      const elapsed = now - t0 - f.delay;
      if (elapsed < 0) {
        f.el.style.opacity = '0';
        anyActive = true;
        continue;
      }

      const rawT = Math.min(elapsed / f.duration, 1);
      // Graceful ease-out glide carried by wind
      const t = 1 - Math.pow(1 - rawT, 3);
      const inv = 1 - t;

      const x =
        inv * inv * inv * f.startX +
        3 * inv * inv * t * f.cp1x +
        3 * inv * t * t * f.cp2x +
        t * t * t * f.endX;
      const y =
        inv * inv * inv * f.startY +
        3 * inv * inv * t * f.cp1y +
        3 * inv * t * t * f.cp2y +
        t * t * t * f.endY +
        Math.sin(rawT * Math.PI * 3.5) * (1 - rawT) * 14;

      const vx = x - f.prevX;
      const vy = y - f.prevY;
      const angle = Math.max(-32, Math.min(32, (Math.atan2(vy, vx) * 180) / Math.PI * 0.35));
      f.prevX = x;
      f.prevY = y;

      const fadeIn = Math.min(1, rawT / 0.18);
      const fadeOut = rawT > 0.58 ? Math.max(0, 1 - (rawT - 0.58) / 0.42) : 1;
      const opacity = fadeIn * fadeOut * 0.92;
      const scale = f.baseScale * (0.85 + 0.25 * Math.sin(rawT * Math.PI));

      f.el.style.transform = `translate3d(${x - 18}px, ${y - 18}px, 0) rotate(${angle.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      f.el.style.opacity = opacity.toFixed(3);

      if (rawT > 0.1 && rawT < 0.75 && now - f.lastSparkMs > 140) {
        f.lastSparkMs = now;
        spawnButterflyShimmerMote(x, y, stage);
      }

      if (rawT >= 1) {
        f.done = true;
        f.el.remove();
      } else {
        anyActive = true;
      }
    }

    if (anyActive) {
      breezeScatterFrame = requestAnimationFrame(tick);
    } else {
      breezeScatterFrame = null;
      setTimeout(() => {
        if (!breezeScatterFrame) {
          stage.innerHTML = '';
          stage.classList.add('hidden');
        }
      }, 450);
    }
  }

  breezeScatterFrame = requestAnimationFrame(tick);
}

/* ========================================================================
   BUTTERFLY FLIGHT ENGINE (GRACEFUL S-CURVES, NAV ANCHORING & CLICK TWIRL)
   ======================================================================== */
function setButterflyTransform(x, y, angleDeg = 0, scale = 1) {
  butterflyPos.x = x;
  butterflyPos.y = y;
  butterflyPos.angle = angleDeg;
  lastKnownButterflyAngle = angleDeg;
  butterflyEl.style.left = '0px';
  butterflyEl.style.top = '0px';
  butterflyEl.style.transform = `translate3d(${x - 25}px, ${y - 25}px, 0) rotate(${angleDeg}deg) scale(${scale})`;
}

function cancelButterflyAnimation() {
  if (butterflyAnimFrame) {
    cancelAnimationFrame(butterflyAnimFrame);
    butterflyAnimFrame = null;
  }
  isButterflyTwirling = false;
}

/**
 * Detaches the butterfly from #chapter-topbar back to document.body (position: fixed)
 * while seamlessly preserving its exact current viewport coordinates before takeoff.
 */
function detachButterflyToViewport() {
  if (!butterflyEl) return;
  if (ribbonBubblePeekTimer) {
    clearTimeout(ribbonBubblePeekTimer);
    ribbonBubblePeekTimer = null;
  }
  if (isButterflyAnchoredInTopbar || butterflyEl.parentNode !== document.body) {
    const rect = butterflyEl.getBoundingClientRect();
    const cx = rect.width > 0 ? rect.left + rect.width * 0.5 : butterflyPos.x;
    const cy = rect.height > 0 ? rect.top + rect.height * 0.5 : butterflyPos.y;
    isButterflyAnchoredInTopbar = false;
    butterflyEl.classList.remove('is-anchored', 'is-ribbon-perched', 'is-bubble-peek');
    document.body.appendChild(butterflyEl);
    setButterflyTransform(cx, cy, lastKnownButterflyAngle, 1);
  } else {
    butterflyEl.classList.remove('is-ribbon-perched', 'is-bubble-peek');
  }
}

/**
 * Returns the active volume navigation button:
 * - In Work & Study (Plan A): the active 'U' book-spine button inside Obsidian's left Ribbon.
 * - In Profile / Moments / Art: the active horizontal chapter tab button inside #chapter-tabs.
 */
function getActiveChapterTabEl() {
  if (!activeBookId) return null;
  if (activeBookId === 'work') {
    const ribbonU = document.querySelector('[data-ws-vol="work"]');
    if (ribbonU) return ribbonU;
  }
  if (!chapterTabsEl) return null;
  return chapterTabsEl.querySelector(`[data-chapter-tab="${activeBookId}"]`);
}

/**
 * Computes viewport coordinates where the butterfly should land for the active volume.
 */
function getActiveTabPerchCoords() {
  const tabEl = getActiveChapterTabEl();
  if (tabEl) {
    const rect = tabEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      if (activeBookId === 'work') {
        return {
          x: rect.left + 3,
          y: rect.top + rect.height * 0.5
        };
      }
      return {
        x: rect.left + rect.width * 0.5,
        y: rect.top - 7
      };
    }
  }
  if (closeBtnEl) {
    const rect = closeBtnEl.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.5, y: rect.top - 8 };
  }
  return { x: 140, y: 110 };
}

/**
 * Anchors #butterfly-actor directly into its section container (position: absolute):
 * - Work & Study (Plan A): inside #reader-folio perched delicately on the left edge of Ribbon 'U'
 *   with a brief 2.4s bubble peek and hover-to-reveal so the sidebar stays 100% unobstructed.
 * - Profile / Moments / Art: inside #chapter-topbar right above the active nav pill.
 */
function anchorButterflyToActiveTab(triggerRibbonPeek = false) {
  const tabEl = getActiveChapterTabEl();
  if (!tabEl || !butterflyEl) return false;

  if (ribbonBubblePeekTimer) {
    clearTimeout(ribbonBubblePeekTimer);
    ribbonBubblePeekTimer = null;
  }

  if (activeBookId === 'work') {
    const folioEl = document.getElementById('reader-folio');
    if (!folioEl) return false;
    const folioRect = folioEl.getBoundingClientRect();
    const tabRect = tabEl.getBoundingClientRect();
    if (!folioRect.width || !tabRect.width) return false;

    const relX = (tabRect.left - folioRect.left) + 3;
    const relY = (tabRect.top - folioRect.top) + tabRect.height * 0.5;

    if (butterflyEl.parentNode !== folioEl) {
      folioEl.appendChild(butterflyEl);
    }
    isButterflyAnchoredInTopbar = true;
    butterflyEl.classList.add('is-anchored', 'is-ribbon-perched', 'is-perched', 'can-close');
    butterflyEl.style.opacity = '1';
    butterflyEl.style.left = `${relX.toFixed(1)}px`;
    butterflyEl.style.top = `${relY.toFixed(1)}px`;
    butterflyEl.style.transform = 'translate3d(-25px, -25px, 0) rotate(10deg) scale(0.76)';
    butterflyPos.x = tabRect.left + 3;
    butterflyPos.y = tabRect.top + tabRect.height * 0.5;
    butterflyPos.angle = 10;
    lastKnownButterflyAngle = 10;
    butterflyBubbleEl.classList.add('is-visible');

    if (triggerRibbonPeek) {
      butterflyEl.classList.add('is-bubble-peek');
      ribbonBubblePeekTimer = setTimeout(() => {
        butterflyEl.classList.remove('is-bubble-peek');
        ribbonBubblePeekTimer = null;
      }, 2400);
    }
    return true;
  }

  const topbarEl = document.getElementById('chapter-topbar');
  if (!topbarEl) return false;

  const topRect = topbarEl.getBoundingClientRect();
  const tabRect = tabEl.getBoundingClientRect();
  if (!topRect.width || !tabRect.width) return false;

  const relX = (tabRect.left - topRect.left) + tabRect.width * 0.5;
  const relY = (tabRect.top - topRect.top) - 7;

  if (butterflyEl.parentNode !== topbarEl) {
    topbarEl.appendChild(butterflyEl);
  }
  isButterflyAnchoredInTopbar = true;
  butterflyEl.classList.remove('is-ribbon-perched', 'is-bubble-peek');
  butterflyEl.classList.add('is-anchored', 'is-perched', 'can-close');
  butterflyEl.style.opacity = '1';
  butterflyEl.style.left = `${relX.toFixed(1)}px`;
  butterflyEl.style.top = `${relY.toFixed(1)}px`;
  butterflyEl.style.transform = 'translate3d(-25px, -25px, 0) rotate(-6deg) scale(0.92)';
  butterflyPos.x = tabRect.left + tabRect.width * 0.5;
  butterflyPos.y = tabRect.top - 7;
  butterflyPos.angle = -6;
  lastKnownButterflyAngle = -6;
  butterflyBubbleEl.classList.add('is-visible');
  return true;
}

/**
 * Smoothly flies the butterfly along an organic, sweeping S-curve Bezier trajectory
 * with natural height loft, gentle air-current wave, smooth tangent banking,
 * and optional dynamic target tracking.
 */
function flyButterflyTo(targetX, targetY, options = {}) {
  const {
    duration = 1450,
    endAngle = -6,
    perchOnArrival = true,
    showCloseBubble = false,
    shimmerTrail = false,
    anchorToTabOnArrival = false,
    getTargetCoords = null,
    onComplete = null
  } = options;

  cancelButterflyAnimation();
  detachButterflyToViewport();

  const startX = butterflyPos.x;
  const startY = butterflyPos.y;
  const initTgt = typeof getTargetCoords === 'function' ? getTargetCoords() : { x: targetX, y: targetY };
  const initDx = initTgt.x - startX;
  const initDy = initTgt.y - startY;
  const dist = Math.hypot(initDx, initDy) || 1;

  // Sweep high and wide for an airy, poetic S-curve instead of a stiff straight line
  const loft = Math.max(76, Math.min(168, dist * 0.34 + 42));
  const swayDir = initDx >= 0 ? 1 : -1;
  const lateralSway = Math.max(38, Math.min(115, dist * 0.24));

  butterflyEl.style.opacity = '1';
  butterflyEl.classList.remove('is-perched', 'can-close');
  butterflyEl.classList.toggle('is-shimmering', Boolean(shimmerTrail));
  butterflyBubbleEl.classList.remove('is-visible');

  const startTime = performance.now();
  let lastLeadSparkMs = 0;
  let smoothedAngle = butterflyPos.angle || 0;

  function step(now) {
    const elapsed = now - startTime;
    const rawT = Math.min(elapsed / duration, 1);
    // Graceful ease-in-out quartic-cubic hybrid (gentle takeoff, silky glide, soft landing)
    const t = rawT < 0.5
      ? 4 * rawT * rawT * rawT
      : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

    const curTgt = typeof getTargetCoords === 'function' ? getTargetCoords() : { x: targetX, y: targetY };
    const dx = curTgt.x - startX;
    const dy = curTgt.y - startY;

    // S-curve control points: rises gracefully, arcs subtly one way, counter-curves into landing
    const cp1x = startX + dx * 0.28 - swayDir * lateralSway * 0.55;
    const cp1y = Math.min(startY, curTgt.y) - loft;
    const cp2x = startX + dx * 0.74 + swayDir * lateralSway * 0.48;
    const cp2y = Math.min(startY, curTgt.y) - loft * 0.42 + (dy > 0 ? 14 : -18);

    const inv = 1 - t;
    const waveFade = Math.sin(rawT * Math.PI);
    const airWaveY = Math.sin(rawT * Math.PI * 3.2) * waveFade * 11;
    const airWaveX = Math.cos(rawT * Math.PI * 2.4) * waveFade * 6;

    const x =
      inv * inv * inv * startX +
      3 * inv * inv * t * cp1x +
      3 * inv * t * t * cp2x +
      t * t * t * curTgt.x +
      airWaveX;
    const y =
      inv * inv * inv * startY +
      3 * inv * inv * t * cp1y +
      3 * inv * t * t * cp2y +
      t * t * t * curTgt.y +
      airWaveY;

    const tx = x - butterflyPos.x;
    const ty = y - butterflyPos.y;
    let targetAngle = endAngle;
    if (rawT < 0.9 && (Math.abs(tx) > 0.04 || Math.abs(ty) > 0.04)) {
      targetAngle = Math.max(-32, Math.min(32, (Math.atan2(ty, tx) * 180) / Math.PI * 0.28));
    }
    smoothedAngle = smoothedAngle + (targetAngle - smoothedAngle) * 0.16;

    const flightScale = 1 + Math.sin(rawT * Math.PI) * 0.09;
    setButterflyTransform(x, y, smoothedAngle, Number(flightScale.toFixed(3)));

    if (shimmerTrail && rawT > 0.06 && rawT < 0.93 && now - lastLeadSparkMs > 78) {
      lastLeadSparkMs = now;
      const stage = document.getElementById('breeze-transition-stage');
      if (stage) {
        stage.classList.remove('hidden');
        spawnButterflyShimmerMote(x, y, stage);
      }
    }

    if (rawT < 1) {
      butterflyAnimFrame = requestAnimationFrame(step);
    } else {
      butterflyAnimFrame = null;
      if (anchorToTabOnArrival && currentView === 'chapter') {
        if (!anchorButterflyToActiveTab(true)) {
          setButterflyTransform(curTgt.x, curTgt.y, endAngle, 1);
          if (perchOnArrival) butterflyEl.classList.add('is-perched');
          if (showCloseBubble) {
            butterflyEl.classList.add('can-close');
            butterflyBubbleEl.classList.add('is-visible');
          }
        }
      } else {
        setButterflyTransform(curTgt.x, curTgt.y, endAngle, 1);
        if (perchOnArrival) butterflyEl.classList.add('is-perched');
        if (showCloseBubble) {
          butterflyEl.classList.add('can-close');
          butterflyBubbleEl.classList.add('is-visible');
        }
      }
      if (typeof onComplete === 'function') {
        onComplete();
      }
    }
  }

  butterflyAnimFrame = requestAnimationFrame(step);
}

/**
 * Computes a landing coordinate on top of a specific book slot on the shelf.
 */
function getBookPerchCoords(bookId) {
  const el = document.getElementById(`book-${bookId}`);
  if (!el) return { x: window.innerWidth * 0.45, y: window.innerHeight * 0.4 };
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width * 0.55,
    y: rect.top + 38
  };
}

/**
 * Perches or gracefully flies the butterfly onto the active chapter navigation button.
 * Keeps legacy name `syncButterflyToCloseButton` so all modules remain 100% compatible.
 */
function syncButterflyToCloseButton(animate = false, shimmer = false) {
  if (currentView !== 'chapter') return;
  if (typeof wsIsFullscreen !== 'undefined' && wsIsFullscreen) return;
  if (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen) return;

  if (animate) {
    const target = getActiveTabPerchCoords();
    flyButterflyTo(target.x, target.y, {
      duration: shimmer ? 1240 : 1080,
      endAngle: -6,
      perchOnArrival: true,
      showCloseBubble: true,
      shimmerTrail: true,
      anchorToTabOnArrival: true,
      getTargetCoords: getActiveTabPerchCoords
    });
  } else if (!butterflyAnimFrame && !isButterflyTwirling) {
    if (!anchorButterflyToActiveTab()) {
      const target = getActiveTabPerchCoords();
      setButterflyTransform(target.x, target.y, -6, 1);
      butterflyEl.style.opacity = '1';
      butterflyEl.classList.add('is-perched', 'can-close');
      butterflyBubbleEl.classList.add('is-visible');
    }
  }
}

/**
 * Easter Egg: Clicking the perched butterfly lifts it into an elegant aerial loop
 * right above the current nav tab before gracefully fluttering back to its perch.
 * (Page closing is now strictly handled by the top-right ✕ CLOSE button.)
 */
function playButterflyGracefulTwirl() {
  if (currentView !== 'chapter' || butterflyAnimFrame || isButterflyTwirling) return;
  isButterflyTwirling = true;
  detachButterflyToViewport();

  const originX = butterflyPos.x;
  const originY = butterflyPos.y;
  const duration = 1280;
  const startTime = performance.now();
  let lastSpark = 0;

  butterflyEl.classList.remove('is-perched');
  butterflyEl.classList.add('is-shimmering');
  butterflyBubbleEl.classList.remove('is-visible');

  function step(now) {
    const rawT = Math.min((now - startTime) / duration, 1);
    const theta = rawT * Math.PI * 2;
    const envelope = Math.sin(rawT * Math.PI);

    // Graceful teardrop / oval aerial loop rising above the nav button
    const loopRx = 46;
    const loopRy = 34;
    const x = originX + Math.sin(theta) * loopRx * (0.65 + 0.35 * envelope);
    const y = originY - (1 - Math.cos(theta)) * loopRy;

    const tx = x - butterflyPos.x;
    const ty = y - butterflyPos.y;
    const bank = rawT < 0.92
      ? Math.max(-34, Math.min(34, (Math.atan2(ty, tx) * 180) / Math.PI * 0.32))
      : -6;
    const sc = 1 + envelope * 0.14;

    setButterflyTransform(x, y, bank, Number(sc.toFixed(3)));

    if (rawT > 0.06 && rawT < 0.9 && now - lastSpark > 80) {
      lastSpark = now;
      const stage = document.getElementById('breeze-transition-stage');
      if (stage) {
        stage.classList.remove('hidden');
        spawnButterflyShimmerMote(x, y, stage);
      }
    }

    if (rawT < 1) {
      butterflyAnimFrame = requestAnimationFrame(step);
    } else {
      butterflyAnimFrame = null;
      isButterflyTwirling = false;
      anchorButterflyToActiveTab(true);
    }
  }

  butterflyAnimFrame = requestAnimationFrame(step);
}

function handleButterflyClick() {
  if (currentView === 'chapter') {
    playButterflyGracefulTwirl();
  }
}

/* ========================================================================
   NAVIGATION INDICATORS & EDITORIAL CONTENT RENDERING
   ======================================================================== */
function renderNavigationIndicators() {
  // 1. Floating Serif Title Row above the 3D Bookshelf
  if (shelfTitlesBarEl) {
    shelfTitlesBarEl.innerHTML = BOOKS_DATA.map((book) => {
      const isSelected = activeBookId === book.id;
      return `
        <button
          type="button"
          onclick="selectBookFromShelf('${book.id}')"
          class="font-serif-editorial italic text-xl sm:text-2xl transition-all duration-300 cursor-pointer pb-1 ${
            isSelected
              ? 'text-[#e4d4a7] scale-105'
              : 'text-white/50 hover:text-white/90'
          }"
        >
          ${book.title}
        </button>
      `;
    }).join('');
  }

  // 2. Top Chapter Tabs inside the Dedicated Reading View
  if (chapterTabsEl) {
    chapterTabsEl.innerHTML = BOOKS_DATA.map((book) => {
      const isSelected = activeBookId === book.id;
      return `
        <button
          type="button"
          data-chapter-tab="${book.id}"
          onclick="switchChapterDirectly('${book.id}')"
          class="px-3 py-1 rounded-full font-mono-code text-[11px] tracking-wide transition cursor-pointer ${
            isSelected
              ? 'bg-[#e4d4a7]/20 border border-[#e4d4a7]/55 text-[#e4d4a7]'
              : 'bg-white/[0.03] border border-white/10 text-white/55 hover:text-white hover:border-white/25'
          }"
        >
          ${book.shortLabel}
        </button>
      `;
    }).join('');
  }

  // 3. Bottom Dot Indicators inside the Dedicated Reading View
  if (folioDotsEl) {
    folioDotsEl.innerHTML = BOOKS_DATA.map((book) => {
      const isSelected = activeBookId === book.id;
      return `
        <button
          type="button"
          onclick="switchChapterDirectly('${book.id}')"
          aria-label="Jump to ${book.title}"
          title="${book.title}"
          class="h-2 rounded-full transition-all duration-300 cursor-pointer ${
            isSelected
              ? 'w-6 bg-[#e4d4a7]'
              : 'w-2 bg-white/25 hover:bg-white/55'
          }"
        ></button>
      `;
    }).join('');
  }
}

function renderChapterContent(bookId) {
  const book = BOOKS_DATA.find(b => b.id === bookId);
  if (!book || !readerContentEl) return;

  if (bookId !== 'work' && typeof cleanupWorkStudyGraph === 'function') {
    cleanupWorkStudyGraph();
  }

  applyWorkWideLayout(bookId === 'work');

  if (bookId === 'art' && !hasFetchedArtCatalog) {
    fetchArtVinylCatalog();
  }

  const bodyHtml = typeof book.getHtml === 'function' ? book.getHtml() : book.html;

  readerContentEl.classList.remove('folio-fade-in');
  void readerContentEl.offsetWidth;
  readerContentEl.classList.add('folio-fade-in');

  readerContentEl.innerHTML = `
    <div class="folio-body-wrap">
      ${bodyHtml}
    </div>
  `;

  if (bookId === 'work' && typeof initWorkStudyWorkspace === 'function') {
    initWorkStudyWorkspace();
  }

  syncTopVinylDockForRoute();
  if (bookId === 'art') {
    syncArtShelfPlayingState();
  }
  syncBackToTopVisibility();
}

/* ========================================================================
   3D BOOK OPENING & STAGE SWITCHING (BOOKSHELF <-> CHAPTER PAGE)
   ======================================================================== */
function clearAllOpenBooks() {
  document.querySelectorAll('.book-slot').forEach(slot => {
    slot.classList.remove('is-open');
  });
}

/**
 * Unfolds the chosen book on the 3D bookshelf, lets the reader see the cover swing open,
 * then transitions smoothly into its dedicated full reading page with the butterfly perched
 * on the top-right CLOSE button.
 */
function selectBookFromShelf(bookId, skipButterflyFlight = false, isAutoLanding = false) {
  if (isTransitioning) return;
  isTransitioning = true;

  if (openTransitionTimer) {
    clearTimeout(openTransitionTimer);
    openTransitionTimer = null;
  }

  activeBookId = bookId;
  clearAllOpenBooks();

  const bookEl = document.getElementById(`book-${bookId}`);
  if (bookEl) {
    bookEl.classList.add('is-open');
  }
  renderNavigationIndicators();

  if (!skipButterflyFlight) {
    const perch = getBookPerchCoords(bookId);
    flyButterflyTo(perch.x, perch.y, {
      duration: 620,
      endAngle: -12,
      perchOnArrival: true,
      showCloseBubble: false
    });
  }

  // Capture opened book center before bookshelf fades out
  const originCoords = getBookPerchCoords(bookId);

  // Wait for the 3D cover unfold animation to complete, then enter the Chapter Page
  openTransitionTimer = setTimeout(() => {
    enterChapterPage(bookId, {
      breezeCutIn: bookId === 'profile',
      originCoords,
      skipHashWrite: Boolean(isAutoLanding)
    });
  }, 780);
}

/**
 * Transitions from the 3D Bookshelf into the dedicated Chapter Page.
 */
function enterChapterPage(bookId, transitionOpts = {}) {
  const { breezeCutIn = false, originCoords = null, skipHashWrite = false } = transitionOpts;
  activeBookId = bookId;
  currentView = 'chapter';
  renderNavigationIndicators();
  renderChapterContent(bookId);

  function revealChapterFolio(withBreezeSettle) {
    bookshelfViewEl.classList.add('hidden');
    bookshelfViewEl.style.transform = 'scale(1)';
    chapterPageViewEl.classList.remove('hidden', 'breeze-page-enter');
    window.scrollTo({ top: 0, behavior: 'instant' });

    void chapterPageViewEl.offsetWidth;
    if (withBreezeSettle) {
      chapterPageViewEl.classList.add('breeze-page-enter');
    }

    chapterPageViewEl.style.opacity = '1';
    chapterPageViewEl.style.transform = 'translateY(0)';

    isTransitioning = false;
    syncTopVinylDockForRoute();
    if (!skipHashWrite) syncRouteHash();
    updateDocumentTitle();

    // Lead butterfly lifts off with subtle warm shimmer and glides onto the CLOSE tag
    requestAnimationFrame(() => {
      setTimeout(() => {
        syncButterflyToCloseButton(true, withBreezeSettle);
      }, withBreezeSettle ? 60 : 120);
    });
  }

  if (breezeCutIn) {
    butterflyEl.classList.add('is-shimmering');
    bookshelfViewEl.style.opacity = '0';
    bookshelfViewEl.style.transform = 'scale(1.03) translateX(-14px)';

    // Play realistic 3D book page-turning transition -> breeze & scattering butterflies -> reveal Profile
    playBookPageTurnTransition(bookId, originCoords, () => {
      revealChapterFolio(true);
    });
    return;
  }

  // Standard smooth transition for other chapters
  bookshelfViewEl.style.opacity = '0';
  bookshelfViewEl.style.transform = 'scale(0.97)';
  setTimeout(() => revealChapterFolio(false), 360);
}

/**
 * Switches directly between chapters while already inside the Chapter Page view
 * (e.g., clicking Moments from inside Rudy's Profile, or clicking top tabs).
 */
function switchChapterDirectly(bookId) {
  if (currentView !== 'chapter') {
    selectBookFromShelf(bookId);
    return;
  }
  const isDifferentBook = activeBookId !== bookId;
  if (isDifferentBook) {
    detachButterflyToViewport();
  }
  activeBookId = bookId;
  renderNavigationIndicators();
  renderChapterContent(bookId);
  syncRouteHash();
  updateDocumentTitle();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  syncBackToTopVisibility();

  requestAnimationFrame(() => {
    setTimeout(() => {
      syncButterflyToCloseButton(isDifferentBook, isDifferentBook);
    }, 45);
  });
}

/**
 * Closes the current reading page and returns smoothly to the 3D bookshelf.
 */
function returnToBookshelf() {
  if (typeof cleanupWorkStudyGraph === 'function') {
    cleanupWorkStudyGraph();
  }
  if (isTransitioning) return;

  if (currentView === 'shelf') {
    clearAllOpenBooks();
    activeBookId = null;
    renderNavigationIndicators();
    syncRouteHash();
    updateDocumentTitle();
    return;
  }

  isTransitioning = true;
  detachButterflyToViewport();
  currentView = 'shelf';
  applyWorkWideLayout(false);
  syncBackToTopVisibility();

  // Hide speech bubble immediately and take off
  butterflyBubbleEl.classList.remove('is-visible');
  butterflyEl.classList.remove('can-close', 'is-perched');

  chapterPageViewEl.style.opacity = '0';
  chapterPageViewEl.style.transform = 'translateY(10px)';

  setTimeout(() => {
    chapterPageViewEl.classList.add('hidden');
    clearAllOpenBooks();
    activeBookId = null;
    renderNavigationIndicators();

    bookshelfViewEl.classList.remove('hidden');
    void bookshelfViewEl.offsetWidth;
    bookshelfViewEl.style.opacity = '1';
    bookshelfViewEl.style.transform = 'scale(1)';

    isTransitioning = false;
    syncTopVinylDockForRoute();
    syncRouteHash();
    updateDocumentTitle();

    // Fly butterfly to rest gently above the Profile book on the shelf
    requestAnimationFrame(() => {
      const restSpot = getBookPerchCoords('profile');
      flyButterflyTo(restSpot.x, Math.max(85, restSpot.y - 34), {
        duration: 1100,
        endAngle: 8,
        perchOnArrival: true,
        showCloseBubble: false
      });
    });
  }, 360);
}

/* ========================================================================
   CHOREOGRAPHED OPENING BUTTERFLY FLIGHT SEQUENCE ON PAGE LOAD
   ======================================================================== */
function runOpeningButterflySequence() {
  // Start off-screen near upper-left
  setButterflyTransform(-40, 110, 15, 1);
  butterflyEl.style.opacity = '1';

  const target = getBookPerchCoords('profile');

  // Gentle entrance flight to Rudy's Profile spine
  flyButterflyTo(target.x, target.y, {
    duration: 1050,
    endAngle: -10,
    perchOnArrival: true,
    showCloseBubble: false,
    onComplete: () => {
      // Pause briefly on the spine, then unfold Rudy's Profile automatically
      setTimeout(() => {
        if (currentView === 'shelf' && !activeBookId && !isTransitioning) {
          selectBookFromShelf('profile', true, true);
        }
      }, 180);
    }
  });
}

/* ========================================================================
   EVENT BINDINGS & INITIALIZATION ON DOM READY
   ======================================================================== */
function bindBookShelfEvents() {
  document.querySelectorAll('.book-slot').forEach((slot) => {
    const bookId = slot.getAttribute('data-book');
    if (!bookId) return;

    slot.addEventListener('click', () => {
      selectBookFromShelf(bookId);
    });

    slot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectBookFromShelf(bookId);
      }
    });
  });

  // Keep perched butterfly aligned with CLOSE button on scroll or resize
  window.addEventListener('resize', () => {
    if (currentView === 'chapter') {
      syncButterflyToCloseButton(false);
    }
  });

  window.addEventListener('scroll', () => {
    syncBackToTopVisibility();
  }, { passive: true });

  // Discreet keyboard shortcut (Ctrl+Shift+L or Cmd+Shift+L) to open Author Login Modal
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      openAuthorLoginModal();
    } else if (e.key === 'Escape') {
      if (typeof activeFriendModalId !== 'undefined' && activeFriendModalId && typeof closeFriendDetailModal === 'function') {
        closeFriendDetailModal();
        return;
      }
      if (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen && typeof closeFriendsSky === 'function') {
        closeFriendsSky();
        return;
      }
      closeImageLightbox();
      closeButterflyBubbleEditor();
      closeAuthorLoginModal();
      toggleTurntableSheet(false);
      if (isDirectMessageModalOpen) {
        minimizeDirectMessageModal();
      }
    }
  });

  const handleBrowserRouteNav = () => {
    const route = parseRouteFromHash();
    if (route) {
      if (
        route.view === 'chapter' &&
        currentView === 'chapter' &&
        activeBookId === route.bookId &&
        !(route.bookId === 'work' && route.noteId && typeof wsVault !== 'undefined' && wsVault && wsVault.activeNoteId !== route.noteId) &&
        !(typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen)
      ) {
        return;
      }
      if (route.view === 'friends' && typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen) return;
      if (route.view === 'shelf' && currentView === 'shelf' && !(typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen)) return;
      applyRouteFromHash(route, false);
    } else if (currentView !== 'shelf' || (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen)) {
      isApplyingHashRoute = true;
      try {
        if (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen && typeof closeFriendsSky === 'function') {
          closeFriendsSky(true);
        }
        if (currentView !== 'shelf') {
          returnToBookshelf();
        }
      } finally {
        isApplyingHashRoute = false;
      }
    }
  };
  window.addEventListener('hashchange', handleBrowserRouteNav);
  window.addEventListener('popstate', handleBrowserRouteNav);
}

let hasBootstrappedApp = false;
function bootstrapApp() {
  if (hasBootstrappedApp) return;
  hasBootstrappedApp = true;
  try {
    // 1. Instantly hydrate cached Moments & Comments (0ms on repeat visits)
    hydrateLocalCaches();
    syncButterflyBubbleUi();
    renderNavigationIndicators();
    bindBookShelfEvents();
    bindVinylAudioEngineEvents();
    ensureSupabaseClient();

    // 2. Fire all data requests in parallel immediately (do not wait for fonts or auth)
    fetchSiteConfig();
    if (typeof fetchFriendsList === 'function') fetchFriendsList();
    fetchLiveMoments();
    fetchMomentComments();
    initSupabaseSession();

    // 3. Respect direct URL hash route (#work, #work/<id>, #moment, #art, #profile, #shelf) or run opening flight
    const initialRoute = parseRouteFromHash();
    if (initialRoute) {
      applyRouteFromHash(initialRoute, true);
    } else {
      setTimeout(() => {
        runOpeningButterflySequence();
      }, 150);
    }

    // 4. Defer Art vinyl catalog fetch until after opening animation so first paint stays instant
    setTimeout(() => {
      if (!hasFetchedArtCatalog) fetchArtVinylCatalog();
    }, 900);

    // 5. Defer Work & Study cloud vault fetch until after opening animation
    setTimeout(() => {
      if (!wsHasFetchedCloudVault) wsFetchVaultFromR2();
    }, 1100);
  } catch (err) {
    console.error('Initialization error:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
