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
const flightStatusEl = document.getElementById('flight-status');
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

function syncRouteHash() {
  if (isApplyingHashRoute) return;
  let targetHash = '';
  if (currentView === 'chapter' && activeBookId) {
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
      history.replaceState(null, '', targetHash);
    } catch (_e) {
      window.location.hash = targetHash;
    }
  }
}

function applyRouteFromHash(route, isInitialLoad = false) {
  if (!route) return false;
  isApplyingHashRoute = true;
  try {
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
        chapterPageViewEl.classList.remove('hidden');
        chapterPageViewEl.style.opacity = '1';
        chapterPageViewEl.style.transform = 'translateY(0)';
        syncTopVinylDockForRoute();
        updateDocumentTitle();
        requestAnimationFrame(() => {
          setTimeout(() => syncButterflyToCloseButton(false), 60);
        });
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
  document.body.classList.toggle('is-work-wide', Boolean(isWork));
  if (chapterPageViewEl) {
    chapterPageViewEl.classList.toggle('max-w-6xl', Boolean(isWork));
    chapterPageViewEl.classList.toggle('max-w-3xl', !isWork);
  }
  if (currentView === 'chapter') {
    requestAnimationFrame(() => syncButterflyToCloseButton(false));
  }
}

/* ========================================================================
   BUTTERFLY FLIGHT ENGINE (SMOOTH CUBIC BEZIER CURVES)
   ======================================================================== */
function setButterflyTransform(x, y, angleDeg = 0, scale = 1) {
  butterflyPos.x = x;
  butterflyPos.y = y;
  butterflyPos.angle = angleDeg;
  butterflyEl.style.transform = `translate3d(${x - 25}px, ${y - 25}px, 0) rotate(${angleDeg}deg) scale(${scale})`;
}

function cancelButterflyAnimation() {
  if (butterflyAnimFrame) {
    cancelAnimationFrame(butterflyAnimFrame);
    butterflyAnimFrame = null;
  }
}

/**
 * Smoothly flies the butterfly from its current position to (targetX, targetY)
 * along a graceful curved arc with natural banking tilt.
 */
function flyButterflyTo(targetX, targetY, options = {}) {
  const {
    duration = 1400,
    endAngle = -8,
    perchOnArrival = true,
    showCloseBubble = false,
    onComplete = null
  } = options;

  cancelButterflyAnimation();

  const startX = butterflyPos.x;
  const startY = butterflyPos.y;
  const dx = targetX - startX;
  const dy = targetY - startY;

  // Control points for an organic undulating flight path
  const cp1x = startX + dx * 0.35 + (dy > 0 ? -45 : 45);
  const cp1y = Math.min(startY, targetY) - 65;
  const cp2x = startX + dx * 0.72 + (dx > 0 ? 25 : -25);
  const cp2y = targetY - 40;

  butterflyEl.style.opacity = '1';
  butterflyEl.classList.remove('is-perched', 'can-close');
  butterflyBubbleEl.classList.remove('is-visible');

  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const rawT = Math.min(elapsed / duration, 1);
    // Smooth ease-in-out cubic
    const t = rawT < 0.5
      ? 4 * rawT * rawT * rawT
      : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

    const inv = 1 - t;
    // Cubic Bezier coordinates
    const x =
      inv * inv * inv * startX +
      3 * inv * inv * t * cp1x +
      3 * inv * t * t * cp2x +
      t * t * t * targetX;
    const y =
      inv * inv * inv * startY +
      3 * inv * inv * t * cp1y +
      3 * inv * t * t * cp2y +
      t * t * t * targetY +
      Math.sin(rawT * Math.PI * 3) * (1 - rawT) * 10;

    // Tangent for slight heading angle during flight
    const tx = x - butterflyPos.x;
    const ty = y - butterflyPos.y;
    let angle = endAngle;
    if (rawT < 0.92 && (Math.abs(tx) > 0.05 || Math.abs(ty) > 0.05)) {
      angle = Math.max(-28, Math.min(28, (Math.atan2(ty, tx) * 180) / Math.PI * 0.25));
    }

    setButterflyTransform(x, y, angle, 1);

    if (rawT < 1) {
      butterflyAnimFrame = requestAnimationFrame(step);
    } else {
      butterflyAnimFrame = null;
      setButterflyTransform(targetX, targetY, endAngle, 1);
      if (perchOnArrival) {
        butterflyEl.classList.add('is-perched');
      }
      if (showCloseBubble) {
        butterflyEl.classList.add('can-close');
        butterflyBubbleEl.classList.add('is-visible');
      }
      if (typeof onComplete === 'function') {
        onComplete();
      }
    }
  }

  butterflyAnimFrame = requestAnimationFrame(step);
}

/**
 * Computes the exact coordinates right on top of the Chapter Page's top-right CLOSE button.
 */
function getCloseButtonPerchCoords() {
  if (!closeBtnEl) return { x: window.innerWidth - 70, y: 120 };
  const rect = closeBtnEl.getBoundingClientRect();
  return {
    x: rect.left + rect.width * 0.5,
    y: rect.top - 10
  };
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
 * Repositions the butterfly cleanly onto the CLOSE button whenever window resizes or scrolls.
 */
function syncButterflyToCloseButton(animate = false) {
  if (currentView !== 'chapter' || !closeBtnEl) return;
  const target = getCloseButtonPerchCoords();
  if (animate) {
    flyButterflyTo(target.x, target.y, {
      duration: 900,
      endAngle: -10,
      perchOnArrival: true,
      showCloseBubble: true
    });
  } else if (!butterflyAnimFrame) {
    setButterflyTransform(target.x, target.y, -10, 1);
    butterflyEl.style.opacity = '1';
    butterflyEl.classList.add('is-perched', 'can-close');
    butterflyBubbleEl.classList.add('is-visible');
  }
}

/**
 * Clicking the perched butterfly or its "Close this page?" bubble closes the chapter.
 */
function handleButterflyClick() {
  if (currentView === 'chapter') {
    returnToBookshelf();
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
    <header class="border-b border-white/10 pb-5 pr-20">
      <div class="flex items-center gap-2.5 font-mono-code text-xs tracking-[0.18em] uppercase" style="color: ${book.accent}">
        <span>${book.subtitle}</span>
        <span class="text-white/25">·</span>
        <span class="text-white/45">${book.index}</span>
      </div>
      <h1 onclick="registerSecretTap()" class="font-serif-editorial text-3xl sm:text-4xl text-[#f3f1ec] mt-2 tracking-tight select-none">
        ${book.title}
      </h1>
    </header>
    <div class="pt-1">
      ${bodyHtml}
    </div>
  `;

  if (bookId === 'work' && typeof initWorkStudyWorkspace === 'function') {
    initWorkStudyWorkspace();
  }

  // Sync audio button label if opening Art volume while audio is playing
  updateAudioButtonLabel();
  syncTopVinylDockForRoute();
  if (bookId === 'art') {
    syncArtShelfPlayingState();
  }
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
function selectBookFromShelf(bookId, skipButterflyFlight = false) {
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

  if (flightStatusEl) {
    const chosen = BOOKS_DATA.find(b => b.id === bookId);
    flightStatusEl.textContent = chosen ? `Opening "${chosen.title}"...` : 'Opening volume...';
  }

  if (!skipButterflyFlight) {
    const perch = getBookPerchCoords(bookId);
    flyButterflyTo(perch.x, perch.y, {
      duration: 620,
      endAngle: -12,
      perchOnArrival: true,
      showCloseBubble: false
    });
  }

  // Wait for the 3D cover unfold animation to complete, then enter the Chapter Page
  openTransitionTimer = setTimeout(() => {
    enterChapterPage(bookId);
  }, 780);
}

/**
 * Transitions from the 3D Bookshelf into the dedicated Chapter Page.
 */
function enterChapterPage(bookId) {
  activeBookId = bookId;
  currentView = 'chapter';
  renderNavigationIndicators();
  renderChapterContent(bookId);

  // Fade out bookshelf
  bookshelfViewEl.style.opacity = '0';
  bookshelfViewEl.style.transform = 'scale(0.97)';

  setTimeout(() => {
    bookshelfViewEl.classList.add('hidden');
    chapterPageViewEl.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Force reflow for smooth fade-in
    void chapterPageViewEl.offsetWidth;
    chapterPageViewEl.style.opacity = '1';
    chapterPageViewEl.style.transform = 'translateY(0)';

    isTransitioning = false;
    syncTopVinylDockForRoute();
    syncRouteHash();
    updateDocumentTitle();
    syncRouteHash();
    updateDocumentTitle();

    // Fly the butterfly smoothly to perch right on top of the CLOSE button with "Close this page?"
    requestAnimationFrame(() => {
      setTimeout(() => {
        syncButterflyToCloseButton(true);
      }, 120);
    });
  }, 360);
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
  activeBookId = bookId;
  renderNavigationIndicators();
  renderChapterContent(bookId);
  syncRouteHash();
  updateDocumentTitle();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  setTimeout(() => {
    syncButterflyToCloseButton(false);
  }, 80);
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
    if (flightStatusEl) {
      flightStatusEl.textContent = 'Select any book from R · U · D · Y to open.';
    }
    return;
  }

  isTransitioning = true;
  currentView = 'shelf';
  applyWorkWideLayout(false);

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

    if (flightStatusEl) {
      flightStatusEl.textContent = 'Select any book from R · U · D · Y to open.';
    }

    bookshelfViewEl.classList.remove('hidden');
    void bookshelfViewEl.offsetWidth;
    bookshelfViewEl.style.opacity = '1';
    bookshelfViewEl.style.transform = 'scale(1)';

    isTransitioning = false;
    syncTopVinylDockForRoute();

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

  if (flightStatusEl) {
    flightStatusEl.textContent = 'A butterfly is flying toward Rudy\'s Profile...';
  }

  const target = getBookPerchCoords('profile');

  // Gentle entrance flight to Rudy's Profile spine
  flyButterflyTo(target.x, target.y, {
    duration: 1950,
    endAngle: -10,
    perchOnArrival: true,
    showCloseBubble: false,
    onComplete: () => {
      if (flightStatusEl) {
        flightStatusEl.textContent = 'Landed on Rudy\'s Profile — unfolding cover...';
      }
      // Pause briefly on the spine, then unfold Rudy's Profile automatically
      setTimeout(() => {
        if (currentView === 'shelf' && !activeBookId && !isTransitioning) {
          selectBookFromShelf('profile', true);
        }
      }, 420);
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
    if (currentView === 'chapter') {
      syncButterflyToCloseButton(false);
    }
  }, { passive: true });

  // Discreet keyboard shortcut (Ctrl+Shift+L or Cmd+Shift+L) to open Author Login Modal
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      openAuthorLoginModal();
    } else if (e.key === 'Escape') {
      closeImageLightbox();
      closeAuthorLoginModal();
      toggleTurntableSheet(false);
      if (isDirectMessageModalOpen) {
        minimizeDirectMessageModal();
      }
    }

  window.addEventListener('hashchange', () => {
    const route = parseRouteFromHash();
    if (route) {
      applyRouteFromHash(route, false);
    }
  });
}

let hasBootstrappedApp = false;
function bootstrapApp() {
  if (hasBootstrappedApp) return;
  hasBootstrappedApp = true;
  try {
    // 1. Instantly hydrate cached Moments & Comments (0ms on repeat visits)
    hydrateLocalCaches();
    renderNavigationIndicators();
    bindBookShelfEvents();
    bindVinylAudioEngineEvents();
    ensureSupabaseClient();

    // 2. Fire all data requests in parallel immediately (do not wait for fonts or auth)
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
      }, 350);
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
