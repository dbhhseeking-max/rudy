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
    accent: '#0a84ff',
    getHtml: buildProfileHtml
  },
  {
    id: 'moment',
    letter: 'D',
    index: '02 / 04',
    shortLabel: 'D · Moments',
    title: 'Daily Moments',
    subtitle: 'VOLUME D · LIFE & LANGUAGE SNAPSHOTS',
    accent: '#5ac8fa',
    getHtml: buildMomentsFeedHtml
  },
  {
    id: 'art',
    letter: 'Y',
    index: '03 / 04',
    shortLabel: 'Y · Art',
    title: 'Yearning for Art',
    subtitle: 'VOLUME Y · AESTHETICS, GALLERY & ACOUSTICS',
    accent: '#ff375f',
    getHtml: buildArtHtml
  },
  {
    id: 'work',
    letter: 'N',
    index: '04 / 04',
    shortLabel: 'N · Note',
    title: 'Note',
    subtitle: 'VOLUME N · OBSIDIAN MARKDOWN VAULT & GRAPH',
    accent: '#0a84ff',
    getHtml: buildWorkStudyHtml
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
      ? `${activeNote.title} · Note — StudyEnglishWith.me`
      : 'Note — StudyEnglishWith.me';
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
  const isReplacingOverlaySlot = Boolean(history.state && history.state.__rudyOverlay);
  if (targetHash && (window.location.hash !== targetHash || isReplacingOverlaySlot)) {
    try {
      if (push && !isReplacingOverlaySlot) {
        if (typeof markInSiteBackstopSatisfied === 'function') markInSiteBackstopSatisfied();
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
      if (route.bookId === 'moment') {
        if (typeof pendingDeepLinkMomentId !== 'undefined') {
          pendingDeepLinkMomentId = route.noteId || null;
        }
      }
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

        chapterPageViewEl.classList.remove('hidden', 'breeze-page-enter');
        chapterPageViewEl.style.opacity = '1';
        chapterPageViewEl.style.transform = '';
        if (typeof syncSegmentedNavSlider === 'function') syncSegmentedNavSlider(false);
        syncTopVinylDockForRoute();
        syncFolioDockRail();
        updateDocumentTitle();
        requestAnimationFrame(() => {
          if (typeof syncSegmentedNavSlider === 'function') syncSegmentedNavSlider(false);
          setTimeout(() => {
            syncButterflyToCloseButton(false);
            if (typeof syncSegmentedNavSlider === 'function') syncSegmentedNavSlider(false);
          }, 50);
        });
        if (route.bookId === 'moment' && route.noteId && typeof focusMomentCardById === 'function') {
          setTimeout(() => focusMomentCardById(route.noteId), 120);
        }
      } else {
        switchChapterDirectly(route.bookId);
        if (route.bookId === 'moment' && route.noteId && typeof focusMomentCardById === 'function') {
          setTimeout(() => focusMomentCardById(route.noteId), 120);
        }
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
let activeBubbleEditorMode = 'main'; // 'main' | 'chapter' | 'backtop'
let isButterflyAnchoredInTopbar = false;
let isButterflyTwirling = false;
let lastKnownButterflyAngle = -6;
let ribbonBubblePeekTimer = null;
let butterflyChoreoWakeTimer = null;
let rudyGoldShimmerTimer = null;

function getActiveMainButterflyBubbleText() {
  if (typeof siteConfig === 'undefined' || !siteConfig) return '';
  if (currentView === 'chapter' && activeBookId === 'profile') {
    return typeof siteConfig.butterflyBubbleText === 'string'
      ? siteConfig.butterflyBubbleText.trim()
      : '';
  }
  return typeof siteConfig.chapterButterflyBubbleText === 'string'
    ? siteConfig.chapterButterflyBubbleText.trim()
    : '';
}

function syncButterflyBubbleUi() {
  const canEdit = Boolean(isAuthorAuthenticated);

  // 1. Main Companion Butterfly Bubble (Profile Moments card or Chapter Corner — hidden when empty)
  const textEl = document.getElementById('butterfly-bubble-text');
  const editBtn = document.getElementById('butterfly-bubble-edit-btn');
  const bubbleText = getActiveMainButterflyBubbleText();
  const hasBubbleText = bubbleText.length > 0;

  if (textEl) textEl.textContent = bubbleText;
  if (butterflyEl) butterflyEl.title = 'Tap butterfly to flutter';
  if (butterflyBubbleEl) {
    butterflyBubbleEl.hidden = !hasBubbleText;
    butterflyBubbleEl.classList.toggle('hidden', !hasBubbleText);
    if (!hasBubbleText) {
      butterflyBubbleEl.classList.remove('is-visible');
    } else if (butterflyEl && butterflyEl.classList.contains('is-perched') && !butterflyAnimFrame) {
      butterflyBubbleEl.classList.add('is-visible');
    }
  }
  if (editBtn) {
    const showEditBtn = canEdit && hasBubbleText;
    editBtn.hidden = !showEditBtn;
    editBtn.classList.toggle('hidden', !showEditBtn);
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

function openButterflyBubbleEditor(event, mode = 'auto') {
  if (event) event.stopPropagation();
  if (!isAuthorAuthenticated) return;
  const modal = document.getElementById('butterfly-bubble-modal');
  const input = document.getElementById('butterfly-bubble-modal-input');
  const statusEl = document.getElementById('butterfly-bubble-modal-status');
  const kickerEl = document.getElementById('butterfly-bubble-modal-kicker');
  const headingEl = document.getElementById('butterfly-bubble-modal-heading');
  const delBtn = document.getElementById('btn-delete-butterfly-bubble');
  if (!modal || !input) return;

  if (mode === 'backtop') {
    activeBubbleEditorMode = 'backtop';
  } else if (mode === 'chapter' || (mode !== 'main' && currentView === 'chapter' && activeBookId !== 'profile')) {
    activeBubbleEditorMode = 'chapter';
  } else {
    activeBubbleEditorMode = 'main';
  }

  const isBackTop = activeBubbleEditorMode === 'backtop';
  const isChapterCorner = activeBubbleEditorMode === 'chapter';

  if (kickerEl) {
    kickerEl.textContent = isBackTop
      ? '✦ BACK-TO-TOP BUTTERFLY'
      : (isChapterCorner ? '✦ CHAPTER CORNER BUTTERFLY' : '✦ PROFILE MOMENTS BUTTERFLY');
  }
  if (headingEl) {
    headingEl.textContent = isBackTop
      ? 'Edit Back-to-Top Bubble'
      : (isChapterCorner ? 'Edit Chapter Corner Bubble' : 'Edit Profile Moments Bubble');
  }
  if (delBtn) {
    delBtn.hidden = false;
    delBtn.classList.remove('hidden');
  }

  input.required = false;
  if (isBackTop) {
    input.placeholder = 'Back to top? (leave blank to hide)';
    input.value = (siteConfig && typeof siteConfig.backToTopBubbleText === 'string')
      ? siteConfig.backToTopBubbleText
      : 'Back to top?';
  } else if (isChapterCorner) {
    input.placeholder = 'Default hidden (leave blank to hide)';
    input.value = (siteConfig && typeof siteConfig.chapterButterflyBubbleText === 'string')
      ? siteConfig.chapterButterflyBubbleText
      : '';
  } else {
    input.placeholder = 'Default hidden (leave blank to hide)';
    input.value = (siteConfig && typeof siteConfig.butterflyBubbleText === 'string')
      ? siteConfig.butterflyBubbleText
      : '';
  }

  if (statusEl) statusEl.textContent = '';
  if (modal.classList.contains('hidden') && typeof pushOverlayHistoryMarker === 'function') {
    pushOverlayHistoryMarker('bubble-editor');
  }
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    input.focus();
    input.select();
  }, 60);
}

function closeButterflyBubbleEditor(fromPopstate = false) {
  const modal = document.getElementById('butterfly-bubble-modal');
  if (!modal || modal.classList.contains('hidden')) {
    if (typeof discardOverlayHistoryMarker === 'function') discardOverlayHistoryMarker('bubble-editor');
    return;
  }
  if (fromPopstate) {
    if (typeof discardOverlayHistoryMarker === 'function') discardOverlayHistoryMarker('bubble-editor');
  } else if (typeof popOverlayHistoryMarker === 'function') {
    popOverlayHistoryMarker('bubble-editor');
  }
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

  const payload = activeBubbleEditorMode === 'backtop'
    ? { backToTopBubbleText: '' }
    : (activeBubbleEditorMode === 'chapter'
      ? { chapterButterflyBubbleText: '' }
      : { butterflyBubbleText: '' });

  const res = await saveSiteConfigToR2(payload);
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
  const isChapterCorner = activeBubbleEditorMode === 'chapter';
  const rawTrimmed = input.value.trim().slice(0, 80);
  const payload = isBackTop
    ? { backToTopBubbleText: rawTrimmed }
    : (isChapterCorner
      ? { chapterButterflyBubbleText: rawTrimmed }
      : { butterflyBubbleText: rawTrimmed });

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
      statusEl.textContent = !rawTrimmed
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
  if (butterflyChoreoWakeTimer) {
    clearTimeout(butterflyChoreoWakeTimer);
    butterflyChoreoWakeTimer = null;
  }
  isButterflyTwirling = false;
}

/**
 * Triggers the warm champagne-gold light sweep across Rudy's name in Profile.
 */
function triggerRudyNameGoldShimmer() {
  const nameEl = document.getElementById('profile-rudy-name');
  if (!nameEl) return;
  if (rudyGoldShimmerTimer) {
    clearTimeout(rudyGoldShimmerTimer);
    rudyGoldShimmerTimer = null;
  }
  nameEl.classList.remove('is-golden-sweep');
  void nameEl.offsetWidth;
  nameEl.classList.add('is-golden-sweep');
  rudyGoldShimmerTimer = setTimeout(() => {
    nameEl.classList.remove('is-golden-sweep');
  }, 1450);
}

/**
 * Detaches the butterfly from #reader-folio back to document.body (position: fixed)
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
    butterflyEl.classList.remove('is-anchored', 'is-ribbon-perched', 'is-bubble-peek', 'is-bubble-left');
    document.body.appendChild(butterflyEl);
    setButterflyTransform(cx, cy, lastKnownButterflyAngle, 1);
  } else {
    butterflyEl.classList.remove('is-ribbon-perched', 'is-bubble-peek', 'is-bubble-left');
  }
}

function getActiveChapterTabEl() {
  if (!activeBookId || !chapterTabsEl) return null;
  return chapterTabsEl.querySelector(`[data-chapter-tab="${activeBookId}"]`);
}

function getChapterCornerPerchCoords() {
  if (closeBtnEl && closeBtnEl.offsetParent !== null) {
    const rect = closeBtnEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const yOffset = activeBookId === 'work' ? 6 : 6;
      const xOffset = activeBookId === 'work' ? -10 : -4;
      return { x: rect.left + xOffset, y: rect.top + yOffset };
    }
  }
  const folioEl = document.getElementById('reader-folio');
  if (folioEl) {
    const fr = folioEl.getBoundingClientRect();
    if (fr.width > 0) {
      return { x: fr.right - 52, y: fr.top + 22 };
    }
  }
  return { x: Math.max(120, window.innerWidth - 70), y: 108 };
}

/**
 * Computes viewport coordinates where the companion butterfly rests:
 * always perches cleanly on the upper-left rim of the circular Close button.
 */
function getActiveTabPerchCoords() {
  return getChapterCornerPerchCoords();
}

/**
 * Anchors #butterfly-actor calmly onto the circular #btn-close-book button inside #reader-folio.
 * Speech bubble renders only when configured by Admin.
 */
function anchorButterflyToActiveTab(_triggerRibbonPeek = false) {
  const folioEl = document.getElementById('reader-folio');
  if (!closeBtnEl || !folioEl || !butterflyEl || closeBtnEl.offsetParent === null) return false;

  const folioRect = folioEl.getBoundingClientRect();
  const closeRect = closeBtnEl.getBoundingClientRect();
  if (!folioRect.width || !closeRect.width) return false;

  if (ribbonBubblePeekTimer) {
    clearTimeout(ribbonBubblePeekTimer);
    ribbonBubblePeekTimer = null;
  }

  const xOffset = activeBookId === 'work' ? -10 : -4;
  const yOffset = 6;
  const vpX = closeRect.left + xOffset;
  const vpY = closeRect.top + yOffset;
  const relX = vpX - folioRect.left;
  const relY = vpY - folioRect.top;
  const endDeg = -14;
  const restScale = activeBookId === 'work' ? 0.70 : 0.78;

  if (butterflyEl.parentNode !== folioEl) {
    folioEl.appendChild(butterflyEl);
  }
  isButterflyAnchoredInTopbar = true;
  butterflyEl.classList.remove('is-ribbon-perched', 'is-bubble-peek', 'is-shimmering');
  butterflyEl.classList.add('is-anchored', 'is-perched', 'can-close', 'is-bubble-left');
  butterflyEl.style.opacity = '1';
  butterflyEl.style.left = `${relX.toFixed(1)}px`;
  butterflyEl.style.top = `${relY.toFixed(1)}px`;
  butterflyEl.style.transform = `translate3d(-25px, -25px, 0) rotate(${endDeg}deg) scale(${restScale})`;
  butterflyPos.x = vpX;
  butterflyPos.y = vpY;
  butterflyPos.angle = endDeg;
  lastKnownButterflyAngle = endDeg;

  syncButterflyBubbleUi();
  const hasBubbleText = Boolean(getActiveMainButterflyBubbleText());
  butterflyBubbleEl.classList.toggle('is-visible', hasBubbleText);
  return true;
}

/**
 * Keeps compatibility helper cleanly placing the butterfly without screen-spanning flights.
 */
function flyButterflyTo(targetX, targetY, options = {}) {
  const {
    endAngle = -14,
    perchOnArrival = true,
    showCloseBubble = false,
    anchorToTabOnArrival = false,
    getTargetCoords = null,
    onComplete = null
  } = options;

  cancelButterflyAnimation();
  const curTgt = typeof getTargetCoords === 'function' ? getTargetCoords() : { x: targetX, y: targetY };

  if (anchorToTabOnArrival && currentView === 'chapter') {
    if (!anchorButterflyToActiveTab(false)) {
      setButterflyTransform(curTgt.x, curTgt.y, endAngle, 0.78);
      butterflyEl.style.opacity = '1';
      if (perchOnArrival) butterflyEl.classList.add('is-perched');
    }
  } else {
    detachButterflyToViewport();
    setButterflyTransform(curTgt.x, curTgt.y, endAngle, 0.88);
    butterflyEl.style.opacity = '1';
    butterflyEl.classList.remove('is-shimmering');
    if (perchOnArrival) butterflyEl.classList.add('is-perched');
    if (showCloseBubble && getActiveMainButterflyBubbleText()) {
      butterflyBubbleEl.classList.add('is-visible');
    } else {
      butterflyBubbleEl.classList.remove('is-visible');
    }
  }
  if (typeof onComplete === 'function') onComplete();
}

/**
 * Computes a resting coordinate on top of a specific book slot on the shelf.
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
 * Perches the butterfly calmly on the circular Close button of the active chapter.
 * Keeps legacy name `syncButterflyToCloseButton` so all modules remain 100% compatible.
 */
function syncButterflyToCloseButton() {
  if (currentView !== 'chapter') return;
  if (typeof wsIsFullscreen !== 'undefined' && wsIsFullscreen) return;
  if (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen) return;

  cancelButterflyAnimation();
  if (!anchorButterflyToActiveTab()) {
    const target = getActiveTabPerchCoords();
    setButterflyTransform(target.x, target.y, -14, 0.78);
    butterflyEl.style.opacity = '1';
    butterflyEl.classList.add('is-perched', 'can-close');
    syncButterflyBubbleUi();
    butterflyBubbleEl.classList.toggle('is-visible', Boolean(getActiveMainButterflyBubbleText()));
  }
}

function playButterflyGracefulTwirl() {
  syncButterflyToCloseButton();
}

function handleButterflyClick() {
  // Intentionally passive so tapping near the close button stays distraction-free
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
          class="font-serif-editorial italic text-lg sm:text-xl transition-all duration-300 cursor-pointer pb-1 whitespace-nowrap ${
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

  // 2. Unified Interactive Sliding Apple iOS Segmented Pill Navigation (Profile · Moments · Art · Note)
  if (chapterTabsEl) {
    const cleanLabels = {
      profile: 'Profile',
      moment: 'Moments',
      art: 'Art',
      work: 'Note'
    };
    const existingTabs = chapterTabsEl.querySelectorAll('[data-chapter-tab]');
    const hasSameOrder = existingTabs.length === BOOKS_DATA.length &&
      BOOKS_DATA.every((b, i) => existingTabs[i].getAttribute('data-chapter-tab') === b.id);

    if (!hasSameOrder || !chapterTabsEl.querySelector('#ios-seg-slider')) {
      chapterTabsEl.innerHTML = `
        <span id="ios-seg-slider" class="ios-seg-slider" aria-hidden="true"></span>
        ${BOOKS_DATA.map((book) => {
          const isSelected = activeBookId === book.id;
          const label = cleanLabels[book.id] || book.shortLabel;
          return `
            <button
              type="button"
              data-chapter-tab="${book.id}"
              onclick="handleSegmentedTabClick('${book.id}')"
              class="ios-seg-tab ${isSelected ? 'is-active' : ''}"
            >
              ${label}
            </button>
          `;
        }).join('')}
      `;
    } else {
      existingTabs.forEach((tab) => {
        const bid = tab.getAttribute('data-chapter-tab');
        tab.classList.toggle('is-active', activeBookId === bid);
        tab.classList.remove('is-drag-target');
      });
    }
    bindSegmentedNavGestures(chapterTabsEl);
    requestAnimationFrame(() => syncSegmentedNavSlider(true));
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
              ? 'w-6 bg-[#0a84ff]'
              : 'w-2 bg-white/25 hover:bg-white/55'
          }"
        ></button>
      `;
    }).join('');
  }
}

let isSegNavDragging = false;
let suppressSegNavClickUntil = 0;

function handleSegmentedTabClick(bookId) {
  if (Date.now() < suppressSegNavClickUntil) return;
  switchChapterDirectly(bookId);
}

function syncSegmentedNavSlider(animate = true, previewBookId = null) {
  const navEl = document.getElementById('chapter-tabs');
  if (!navEl) return;
  const sliderEl = document.getElementById('ios-seg-slider');
  const targetId = previewBookId || activeBookId;
  const targetBtn = targetId ? navEl.querySelector(`[data-chapter-tab="${targetId}"]`) : null;
  if (!sliderEl || !targetBtn) {
    if (sliderEl) sliderEl.style.opacity = '0';
    return;
  }
  const left = targetBtn.offsetLeft;
  const width = targetBtn.offsetWidth;
  if (!width) return;

  sliderEl.style.transition = animate
    ? 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), width 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease'
    : 'none';
  sliderEl.style.width = `${width}px`;
  sliderEl.style.transform = `translate3d(${left}px, 0, 0)`;
  sliderEl.style.opacity = '1';
}

function bindSegmentedNavGestures(tabsEl) {
  if (!tabsEl || tabsEl.dataset.segBound === '1') return;
  tabsEl.dataset.segBound = '1';

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (!isSegNavDragging && currentView === 'chapter') {
        syncSegmentedNavSlider(false);
      }
    });
    ro.observe(tabsEl);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (!isSegNavDragging && currentView === 'chapter') {
        syncSegmentedNavSlider(false);
      }
    }).catch(() => {});
  }
  window.addEventListener('load', () => {
    if (!isSegNavDragging && currentView === 'chapter') {
      syncSegmentedNavSlider(false);
    }
  });

  tabsEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const sliderEl = document.getElementById('ios-seg-slider');
    const buttons = Array.from(tabsEl.querySelectorAll('[data-chapter-tab]'));
    if (!sliderEl || buttons.length === 0) return;

    const startX = e.clientX;
    let moved = false;
    let hoveredBookId = activeBookId;

    const initialBtn = e.target && e.target.closest ? e.target.closest('[data-chapter-tab]') : null;
    if (initialBtn) {
      hoveredBookId = initialBtn.getAttribute('data-chapter-tab') || activeBookId;
    }

    const computeTabAtClientX = (clientX) => {
      const rect = tabsEl.getBoundingClientRect();
      const relX = clientX - rect.left + tabsEl.scrollLeft;
      let bestBtn = buttons[0];
      let bestDist = Infinity;
      for (const btn of buttons) {
        const cx = btn.offsetLeft + btn.offsetWidth / 2;
        const d = Math.abs(relX - cx);
        if (d < bestDist) {
          bestDist = d;
          bestBtn = btn;
        }
      }
      return { bestBtn, relX };
    };

    const onMove = (ev) => {
      const dx = Math.abs(ev.clientX - startX);
      if (dx > 4) {
        moved = true;
        isSegNavDragging = true;
        tabsEl.classList.add('is-dragging');
      }
      if (!moved) return;

      const { bestBtn, relX } = computeTabAtClientX(ev.clientX);
      hoveredBookId = bestBtn ? (bestBtn.getAttribute('data-chapter-tab') || activeBookId) : activeBookId;

      buttons.forEach(btn => btn.classList.toggle('is-drag-target', btn === bestBtn));

      const minX = 4;
      const w = bestBtn ? bestBtn.offsetWidth : sliderEl.offsetWidth || 72;
      const maxX = Math.max(minX, tabsEl.scrollWidth - w - 4);
      const freeLeft = Math.max(minX, Math.min(maxX, relX - w / 2));

      sliderEl.style.transition = 'none';
      sliderEl.style.width = `${w}px`;
      sliderEl.style.transform = `translate3d(${freeLeft}px, 0, 0)`;
      sliderEl.style.opacity = '1';
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      tabsEl.classList.remove('is-dragging');
      isSegNavDragging = false;
      buttons.forEach(btn => btn.classList.remove('is-drag-target'));
    };

    const onUp = (ev) => {
      const wasDrag = moved;
      const { bestBtn } = computeTabAtClientX(ev.clientX);
      const releaseId = bestBtn ? bestBtn.getAttribute('data-chapter-tab') : hoveredBookId;
      cleanup();

      if (wasDrag) {
        suppressSegNavClickUntil = Date.now() + 260;
        if (releaseId && releaseId !== activeBookId) {
          switchChapterDirectly(releaseId);
        } else {
          syncSegmentedNavSlider(true);
        }
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
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
  const folioEl = document.getElementById('reader-folio');
  if (folioEl && bookId !== 'art') {
    folioEl.classList.remove('is-art-playing-aura');
  }

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
  if (bookId === 'moment' && typeof restoreMomentTransientPreviews === 'function') {
    restoreMomentTransientPreviews();
  }

  syncTopVinylDockForRoute();
  if (bookId === 'art') {
    syncArtShelfPlayingState();
  }
  syncFolioDockRail();
  syncBackToTopVisibility();
}

/* ========================================================================
   MACBOOK DOCK SIDEBAR FOR MOMENTS & ART (MAGNIFY + HOLD-SLIDE-JUMP)
   ======================================================================== */
let dockHighlightTimer = null;

function getFolioDockItemsForChapter(bookId) {
  const maxItems = Math.max(6, Math.min(13, Math.floor((window.innerHeight * 0.54) / 36)));

  if (bookId === 'moment' && typeof getAllMomentsPosts === 'function') {
    const all = getAllMomentsPosts();
    const activeTagLower = typeof activeMomentTagFilter === 'string' && activeMomentTagFilter !== 'ALL'
      ? activeMomentTagFilter.toLowerCase()
      : '';
    const filtered = all.filter((p) => {
      if (typeof activeMomentPendingOnly !== 'undefined' && activeMomentPendingOnly) {
        if (typeof getPendingCommentCountForPost === 'function' && getPendingCommentCountForPost(p) <= 0) {
          return false;
        }
      }
      if (!activeTagLower) return true;
      const tokens = typeof parseMomentTags === 'function' ? parseMomentTags(p.tag) : [];
      return tokens.some(t => t.toLowerCase() === activeTagLower);
    });
    const list = filtered.length > 0 ? filtered : all;
    return list.slice(0, maxItems).map((p, idx) => {
      const thumbUrl = Array.isArray(p.images)
        ? (p.images.find(src => typeof isVideoMediaUrl !== 'function' || !isVideoMediaUrl(src)) || '')
        : '';
      const rawText = String(p.text || '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/==/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const shortDate = String(p.date || '').replace(/\s*·.*$/, '').trim() || `#${idx + 1}`;
      const glyph = p.isPinned ? '★' : (shortDate.slice(-2) || String(idx + 1));
      const label = rawText ? rawText.slice(0, 20) : (p.tag || 'Moment');
      return {
        id: String(p.dbId || idx),
        kind: 'moment',
        glyph,
        title: label,
        sub: p.isPinned ? `PIN · ${shortDate}` : shortDate,
        thumbUrl,
        isPinned: Boolean(p.isPinned),
        isPlaying: false
      };
    });
  }

  if (bookId === 'art' && typeof artVinylTracks !== 'undefined' && Array.isArray(artVinylTracks)) {
    const activeMood = typeof selectedArtMood === 'string' ? selectedArtMood : 'ALL';
    const filtered = activeMood !== 'ALL'
      ? artVinylTracks.filter(t => String(t.mood || '').trim().toLowerCase() === activeMood.toLowerCase())
      : artVinylTracks;
    const list = filtered.length > 0 ? filtered : artVinylTracks;
    return list.slice(0, maxItems).map((t, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const isPlaying = typeof isVinylPlaying !== 'undefined' && isVinylPlaying && typeof extractedVinylId !== 'undefined' && extractedVinylId === t.id;
      return {
        id: String(t.id),
        kind: 'art',
        glyph: num,
        title: String(t.title || 'Untitled'),
        sub: String(t.artist || t.mood || 'Vinyl'),
        thumbUrl: t.coverUrl || '',
        isPinned: false,
        isPlaying
      };
    });
  }
  return [];
}

function scrollToArtVinylCard(trackId) {
  if (!trackId || currentView !== 'chapter' || activeBookId !== 'art') return;
  const sel = `[data-vinyl-card="${CSS.escape ? CSS.escape(String(trackId)) : String(trackId)}"]`;
  const card = document.querySelector(sel);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.remove('is-moment-highlighted');
  void card.offsetWidth;
  card.classList.add('is-moment-highlighted');
  if (dockHighlightTimer) clearTimeout(dockHighlightTimer);
  dockHighlightTimer = setTimeout(() => {
    card.classList.remove('is-moment-highlighted');
  }, 2200);
}

function jumpToFolioDockTarget(kind, id) {
  if (!id) return;
  if (kind === 'moment' && typeof focusMomentCardById === 'function') {
    focusMomentCardById(id);
  } else if (kind === 'art') {
    scrollToArtVinylCard(id);
  }
}

function syncFolioDockRail() {
  const rail = document.getElementById('folio-dock-rail');
  if (!rail) return;

  const isTargetChapter = currentView === 'chapter' && (activeBookId === 'moment' || activeBookId === 'art');
  const items = isTargetChapter ? getFolioDockItemsForChapter(activeBookId) : [];

  if (!isTargetChapter || items.length === 0) {
    rail.classList.add('hidden');
    rail.innerHTML = '';
    document.body.classList.remove('has-folio-dock');
    return;
  }

  rail.innerHTML = items.map((item, idx) => {
    const safeId = escapeHtmlSafely(item.id);
    const safeTitle = escapeHtmlSafely(item.title);
    const safeSub = escapeHtmlSafely(item.sub);
    const thumbHtml = item.thumbUrl
      ? `<img src="${escapeHtmlSafely(item.thumbUrl)}" alt="" loading="lazy" class="dock-item-img" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" /><span class="dock-item-glyph" style="display:none">${escapeHtmlSafely(item.glyph)}</span>`
      : `<span class="dock-item-glyph">${escapeHtmlSafely(item.glyph)}</span>`;

    return `
      <button
        type="button"
        data-dock-kind="${item.kind}"
        data-dock-id="${safeId}"
        data-dock-index="${idx}"
        aria-label="${safeTitle}"
        class="folio-dock-item ${item.isPlaying ? 'is-dock-playing' : ''} ${item.isPinned ? 'is-dock-pinned' : ''}"
      >
        <span class="dock-item-thumb">
          ${thumbHtml}
        </span>
        <span class="dock-item-tooltip">
          <span class="dock-tip-title">${safeTitle}</span>
          <span class="dock-tip-sub">${safeSub}</span>
        </span>
      </button>
    `;
  }).join('');

  rail.classList.remove('hidden');
  document.body.classList.add('has-folio-dock');
  bindFolioDockGestures(rail);
}

function bindFolioDockGestures(rail) {
  if (!rail || rail.dataset.dockBound === '1') return;
  rail.dataset.dockBound = '1';

  let resetTimer = null;
  let suppressDockClickUntil = 0;

  const resetMagnification = () => {
    rail.querySelectorAll('.folio-dock-item').forEach((item) => {
      item.style.transform = '';
      item.style.zIndex = '';
      item.classList.remove('is-dock-focused');
    });
    rail.classList.remove('is-scrubbing');
  };

  const applyMagnificationAtY = (clientY) => {
    const items = Array.from(rail.querySelectorAll('.folio-dock-item'));
    if (items.length === 0) return null;

    let closestItem = null;
    let closestDist = Infinity;

    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const cy = rect.top + rect.height / 2;
      const d = Math.abs(clientY - cy);
      if (d < closestDist) {
        closestDist = d;
        closestItem = item;
      }
      const distNorm = Math.min(1, d / 92);
      const boost = Math.pow(Math.cos(distNorm * Math.PI * 0.5), 1.35);
      const scale = 1 + 0.78 * boost;
      const shiftX = -15 * boost;
      const pushY = d < 3 ? 0 : (cy < clientY ? -1 : 1) * (8 * Math.sin(distNorm * Math.PI));
      item.style.transform = `translate3d(${shiftX.toFixed(1)}px, ${pushY.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      item.style.zIndex = String(Math.round(10 + boost * 30));

      const tip = item.querySelector('.dock-item-tooltip');
      if (tip) {
        tip.style.top = `${Math.round(cy)}px`;
      }
    }

    items.forEach(item => item.classList.toggle('is-dock-focused', item === closestItem));
    return closestItem;
  };

  rail.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || rail.classList.contains('is-scrubbing')) return;
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
    applyMagnificationAtY(e.clientY);
  });

  rail.addEventListener('pointerleave', () => {
    if (rail.classList.contains('is-scrubbing')) return;
    resetMagnification();
  });

  rail.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
    rail.classList.add('is-scrubbing');
    let activeTarget = applyMagnificationAtY(e.clientY);

    const onMove = (ev) => {
      activeTarget = applyMagnificationAtY(ev.clientY);
    };

    const finishScrub = (ev, shouldJump) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);

      const finalTarget = (ev && typeof ev.clientY === 'number')
        ? applyMagnificationAtY(ev.clientY)
        : activeTarget;

      if (shouldJump && finalTarget) {
        const kind = finalTarget.getAttribute('data-dock-kind');
        const id = finalTarget.getAttribute('data-dock-id');
        suppressDockClickUntil = Date.now() + 260;
        jumpToFolioDockTarget(kind, id);
      }

      resetTimer = setTimeout(() => {
        resetMagnification();
      }, 220);
    };

    const onUp = (ev) => finishScrub(ev, true);
    const onCancel = () => finishScrub(null, false);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });

  rail.addEventListener('click', (e) => {
    if (Date.now() < suppressDockClickUntil) return;
    const item = e.target && e.target.closest ? e.target.closest('.folio-dock-item') : null;
    if (!item) return;
    jumpToFolioDockTarget(item.getAttribute('data-dock-kind'), item.getAttribute('data-dock-id'));
  });
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
 * Unfolds the chosen book naturally on the 3D bookshelf, then enters
 * its dedicated full reading page quickly without jarring cut-in effects.
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
      duration: 420,
      endAngle: -12,
      perchOnArrival: true,
      showCloseBubble: false
    });
  }

  openTransitionTimer = setTimeout(() => {
    enterChapterPage(bookId, {
      skipHashWrite: Boolean(isAutoLanding)
    });
  }, isAutoLanding ? 0 : 260);
}

/**
 * Transitions from the 3D Bookshelf into the dedicated Chapter Page.
 */
function enterChapterPage(bookId, transitionOpts = {}) {
  const { skipHashWrite = false } = transitionOpts;
  activeBookId = bookId;
  currentView = 'chapter';
  renderNavigationIndicators();
  renderChapterContent(bookId);

  const revealChapterFolio = () => {
    bookshelfViewEl.classList.add('hidden');
    bookshelfViewEl.style.transform = 'scale(1)';
    chapterPageViewEl.classList.remove('hidden', 'breeze-page-enter');
    window.scrollTo({ top: 0, behavior: 'instant' });

    void chapterPageViewEl.offsetWidth;
    chapterPageViewEl.style.opacity = '1';
    chapterPageViewEl.style.transform = '';

    isTransitioning = false;
    syncTopVinylDockForRoute();
    syncFolioDockRail();
    syncSegmentedNavSlider(false);
    if (!skipHashWrite) syncRouteHash();
    updateDocumentTitle();

    requestAnimationFrame(() => {
      setTimeout(() => {
        syncButterflyToCloseButton(false);
        syncSegmentedNavSlider(true);
      }, 45);
    });

    if (bookId === 'moment' && typeof pendingDeepLinkMomentId !== 'undefined' && pendingDeepLinkMomentId && typeof focusMomentCardById === 'function') {
      setTimeout(() => focusMomentCardById(pendingDeepLinkMomentId), 80);
    }
  };

  bookshelfViewEl.style.opacity = '0';
  bookshelfViewEl.style.transform = 'scale(0.985)';
  setTimeout(revealChapterFolio, 170);
}

/**
 * Switches directly between chapters while already inside the Chapter Page view.
 */
function switchChapterDirectly(bookId) {
  if (currentView !== 'chapter') {
    selectBookFromShelf(bookId);
    return;
  }
  const prevBookId = activeBookId;
  const isDifferentBook = prevBookId !== bookId;
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
    syncSegmentedNavSlider(true);
    setTimeout(() => {
      syncButterflyToCloseButton(false);
    }, 40);
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
    syncFolioDockRail();
    syncRouteHash();
    updateDocumentTitle();
    return;
  }

  isTransitioning = true;
  detachButterflyToViewport();
  currentView = 'shelf';
  applyWorkWideLayout(false);
  syncFolioDockRail();
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
        duration: 850,
        endAngle: 8,
        perchOnArrival: true,
        showCloseBubble: false
      });
    });
  }, 240);
}

/* ========================================================================
   OPENING BUTTERFLY LANDING ON BOOKSHELF (WHEN ADMIN CHOOSES SHELF MODE)
   ======================================================================== */
function runOpeningButterflySequence() {
  setButterflyTransform(-40, 110, 15, 1);
  butterflyEl.style.opacity = '1';

  const target = getBookPerchCoords('profile');
  flyButterflyTo(target.x, Math.max(85, target.y - 34), {
    duration: 750,
    endAngle: 8,
    perchOnArrival: true,
    showCloseBubble: false
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

  // Keep perched butterfly & sliding segmented pill aligned on resize
  window.addEventListener('resize', () => {
    if (currentView === 'chapter') {
      syncButterflyToCloseButton(false);
      syncSegmentedNavSlider(false);
    }
  });

  window.addEventListener('scroll', () => {
    syncBackToTopVisibility();
  }, { passive: true });

  // Discreet keyboard shortcuts: Ctrl/Cmd+Shift+L (Author Login), Ctrl/Cmd+K (Search), Lightbox Arrows & Escape
  window.addEventListener('keydown', (e) => {
    const lightboxModal = document.getElementById('image-lightbox-modal');
    if (lightboxModal && !lightboxModal.classList.contains('hidden')) {
      if (e.key === 'ArrowLeft' && typeof stepImageLightbox === 'function') {
        e.preventDefault();
        stepImageLightbox(-1);
        return;
      }
      if (e.key === 'ArrowRight' && typeof stepImageLightbox === 'function') {
        e.preventDefault();
        stepImageLightbox(1);
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      openAuthorLoginModal();
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const gsModal = document.getElementById('global-search-modal');
      if (gsModal && !gsModal.classList.contains('hidden')) {
        closeGlobalSearchModal();
      } else {
        openGlobalSearchModal();
      }
    } else if (e.key === 'Escape') {
      const gsModal = document.getElementById('global-search-modal');
      if (gsModal && !gsModal.classList.contains('hidden')) {
        closeGlobalSearchModal();
        return;
      }
      if (lightboxModal && !lightboxModal.classList.contains('hidden')) {
        closeImageLightbox();
        return;
      }
      if (typeof activeFriendModalId !== 'undefined' && activeFriendModalId && typeof closeFriendDetailModal === 'function') {
        closeFriendDetailModal();
        return;
      }
      if (typeof isFriendsSkyOpen !== 'undefined' && isFriendsSkyOpen && typeof closeFriendsSky === 'function') {
        closeFriendsSky();
        return;
      }
      closeButterflyBubbleEditor();
      closeAuthorLoginModal();
      toggleTurntableSheet(false);
      if (isDirectMessageModalOpen) {
        minimizeDirectMessageModal();
      }
    }
  });

  // First real touch/pointer gesture inside a Chapter seeds an in-site #shelf backstop
  // so mobile edge swipe-back never quits the whole site unexpectedly on first swipe.
  const seedMobileBackstopOnce = (e) => {
    if (typeof currentView !== 'undefined' && currentView === 'chapter') {
      const target = e && e.target && e.target.closest
        ? e.target.closest('#btn-close-book, [data-chapter-tab], .site-brand-btn')
        : null;
      if (!target && typeof ensureChapterHistoryBackstop === 'function') {
        ensureChapterHistoryBackstop();
      }
    }
  };
  window.addEventListener('touchstart', seedMobileBackstopOnce, { passive: true });
  window.addEventListener('pointerdown', seedMobileBackstopOnce, { passive: true });

  const handleBrowserRouteNav = () => {
    if (typeof consumeOverlayPopOnBack === 'function' && consumeOverlayPopOnBack()) {
      return;
    }
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
    // 1. Instantly hydrate cached Moments, Comments & Appearance Config (0ms on repeat visits)
    hydrateLocalCaches();
    if (typeof applySiteAppearanceFromConfig === 'function') applySiteAppearanceFromConfig();
    if (typeof syncThemeToggleUi === 'function') syncThemeToggleUi();
    syncButterflyBubbleUi();
    renderNavigationIndicators();
    bindBookShelfEvents();
    bindVinylAudioEngineEvents();
    ensureSupabaseClient();

    // 2. Fire all data requests in parallel immediately (do not wait for fonts or opening animations)
    fetchSiteConfig();
    if (typeof fetchFriendsList === 'function') fetchFriendsList();
    fetchLiveMoments();
    fetchMomentComments();
    if (typeof hasFetchedArtCatalog !== 'undefined' && !hasFetchedArtCatalog && typeof fetchArtVinylCatalog === 'function') {
      fetchArtVinylCatalog();
    }
    if (typeof wsHasFetchedCloudVault !== 'undefined' && !wsHasFetchedCloudVault && typeof wsFetchVaultFromR2 === 'function') {
      wsFetchVaultFromR2();
    }
    initSupabaseSession();

    // 3. Respect direct URL hash route (#profile, #moment, #art, #work, #work/<id>, #shelf) or Admin's default auto-open book
    const initialRoute = parseRouteFromHash();
    if (initialRoute) {
      applyRouteFromHash(initialRoute, true);
    } else {
      const configuredDefault = (typeof siteConfig !== 'undefined' && siteConfig && typeof sanitizeDefaultBookId === 'function')
        ? sanitizeDefaultBookId(siteConfig.defaultBookId, 'profile')
        : 'profile';
      if (configuredDefault === 'shelf') {
        setTimeout(() => {
          runOpeningButterflySequence();
        }, 80);
      } else {
        applyRouteFromHash({ view: 'chapter', bookId: configuredDefault }, true);
      }
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}

/* ========================================================================
   BUTTERFLY GLOBAL SEARCH MODAL (NOTES · MOMENTS · VINYL)
   ======================================================================== */
function openGlobalSearchModal() {
  const modal = document.getElementById('global-search-modal');
  const input = document.getElementById('global-search-input');
  if (!modal) return;
  if (typeof hasFetchedArtCatalog !== 'undefined' && !hasFetchedArtCatalog && typeof fetchArtVinylCatalog === 'function') {
    fetchArtVinylCatalog();
  }
  if (typeof wsHasFetchedCloudVault !== 'undefined' && !wsHasFetchedCloudVault && typeof wsFetchVaultFromR2 === 'function') {
    wsFetchVaultFromR2();
  }
  if (modal.classList.contains('hidden') && typeof pushOverlayHistoryMarker === 'function') {
    pushOverlayHistoryMarker('global-search');
  }
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.remove('opacity-0'));
  if (input) {
    handleGlobalSearchInput(input.value || '');
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  }
}

function closeGlobalSearchModal(fromPopstate = false, skipHistoryPop = false) {
  const modal = document.getElementById('global-search-modal');
  if (!modal || modal.classList.contains('hidden')) {
    if (typeof discardOverlayHistoryMarker === 'function') discardOverlayHistoryMarker('global-search');
    return;
  }
  if (fromPopstate || skipHistoryPop) {
    if (typeof discardOverlayHistoryMarker === 'function') discardOverlayHistoryMarker('global-search');
  } else if (typeof popOverlayHistoryMarker === 'function') {
    popOverlayHistoryMarker('global-search');
  }
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

function handleGlobalSearchInput(rawQuery) {
  const container = document.getElementById('global-search-results');
  if (!container) return;
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) {
    container.innerHTML = `<p class="px-3 py-6 text-center font-mono-code text-xs text-white/40">Type a keyword to search Notes, Moments, and Vinyl tracks...</p>`;
    return;
  }

  const hits = [];

  if (typeof wsLoadVault === 'function') {
    const vault = wsLoadVault();
    for (const n of (vault && Array.isArray(vault.notes) ? vault.notes : [])) {
      const title = String(n.title || '');
      const content = String(n.content || '');
      if (title.toLowerCase().includes(q) || content.toLowerCase().includes(q)) {
        hits.push({
          kind: 'work',
          badge: 'N · NOTE',
          badgeClass: 'text-[#0a84ff] border-[#0a84ff]/35 bg-[#0a84ff]/12',
          id: n.id,
          title,
          snippet: content.replace(/[#*`>\[\]@]/g, '').trim().slice(0, 90)
        });
      }
      if (hits.length >= 6) break;
    }
  }

  if (typeof getAllMomentsPosts === 'function') {
    const decodeEntities = (str) => String(str || '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    const posts = getAllMomentsPosts();
    let mCount = 0;
    for (const p of posts) {
      const text = decodeEntities(p.text);
      const tag = decodeEntities(p.tag);
      if (text.toLowerCase().includes(q) || tag.toLowerCase().includes(q)) {
        hits.push({
          kind: 'moment',
          badge: 'D · MOMENT',
          badgeClass: 'text-[#5ac8fa] border-[#5ac8fa]/35 bg-[#5ac8fa]/12',
          id: String(p.dbId || ''),
          title: `${p.date || 'Moment'} · ${tag}`,
          snippet: text.slice(0, 90)
        });
        mCount += 1;
        if (mCount >= 4) break;
      }
    }
  }

  if (typeof artVinylTracks !== 'undefined' && Array.isArray(artVinylTracks)) {
    let aCount = 0;
    for (const t of artVinylTracks) {
      const hay = `${t.title || ''} ${t.artist || ''} ${t.mood || ''} ${t.review || ''}`.toLowerCase();
      if (hay.includes(q)) {
        hits.push({
          kind: 'art',
          badge: 'Y · VINYL',
          badgeClass: 'text-[#ff375f] border-[#ff375f]/35 bg-[#ff375f]/12',
          id: t.id,
          title: `${t.title || 'Untitled'} — ${t.artist || 'Rudy'}`,
          snippet: String(t.review || t.mood || '').slice(0, 90)
        });
        aCount += 1;
        if (aCount >= 4) break;
      }
    }
  }

  if (hits.length === 0) {
    container.innerHTML = `<p class="px-3 py-6 text-center font-mono-code text-xs text-white/40">No matching notes, moments, or records found.</p>`;
    return;
  }

  container.innerHTML = hits.map(item => `
    <button
      type="button"
      onclick="openGlobalSearchResult('${item.kind}', '${escapeHtmlSafely(item.id)}')"
      class="w-full text-left px-3.5 py-2.5 rounded-xl border border-white/8 hover:border-[#0a84ff]/45 bg-white/[0.02] hover:bg-white/[0.05] transition cursor-pointer flex items-start justify-between gap-3"
    >
      <div class="min-w-0 space-y-0.5">
        <div class="text-sm text-[#f3f1ec] font-medium truncate">${escapeHtmlSafely(item.title)}</div>
        ${item.snippet ? `<div class="text-xs text-white/50 truncate">${escapeHtmlSafely(item.snippet)}</div>` : ''}
      </div>
      <span class="px-2 py-0.5 rounded border font-mono-code text-[9px] shrink-0 ${item.badgeClass}">${item.badge}</span>
    </button>
  `).join('');
}

function openGlobalSearchResult(kind, id) {
  closeGlobalSearchModal(false, true);
  if (kind === 'work') {
    if (typeof wsLoadVault === 'function' && id) {
      const vault = wsLoadVault();
      const target = vault.notes.find(n => n.id === id);
      if (target) {
        vault.activeNoteId = target.id;
        if (!vault.openTabIds.includes(target.id)) vault.openTabIds.push(target.id);
      }
    }
    switchChapterDirectly('work');
    return;
  }
  if (kind === 'moment') {
    const wasInChapter = currentView === 'chapter';
    if (id && typeof pendingDeepLinkMomentId !== 'undefined') {
      pendingDeepLinkMomentId = id;
    }
    switchChapterDirectly('moment');
    if (wasInChapter && id && typeof focusMomentCardById === 'function') {
      setTimeout(() => focusMomentCardById(id), 140);
    }
    return;
  }
  if (kind === 'art') {
    if (typeof selectedArtMood !== 'undefined') selectedArtMood = 'ALL';
    switchChapterDirectly('art');
    if (id && typeof selectVinylTrack === 'function') {
      setTimeout(() => {
        const card = document.querySelector(`[data-vinyl-card="${id}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 260);
    }
  }
}
