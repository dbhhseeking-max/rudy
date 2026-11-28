/* ==========================================================================
   VOLUME D: DAILY MOMENTS, CLOUDFLARE R2 MEDIA & COMMENT MODERATION
   ========================================================================== */

const MOMENT_PAGE_SIZE = 12;
const MOMENT_COMPOSER_DRAFT_KEY = 'rudy_moment_composer_draft_v1';

let liveMomentsPosts = [];
let momentCommentsMap = {};
let selectedMomentFiles = [];
let hasFetchedLiveMoments = false;
let composerPreviewUrls = [];
let selectedMomentStorage = 'r2'; // 'r2' | 'github'
let selectedMomentGhFolder = 'moments';
let momentGhFolders = ['moments', 'work-media', 'work-vault'];
let hasLoadedMomentGhFolders = false;
let compressMomentVideoDesktop = false;

// Filter, Pagination, Draft, Note Embed & Deep-Link State
let activeMomentTagFilter = 'ALL';
let activeMomentPendingOnly = false;
let momentVisibleLimit = MOMENT_PAGE_SIZE;
let momentTagsExpanded = false;
let composerLinkedNoteId = '';
let composerNotePickerOpen = false;
let composerNoteSearch = '';
let expandedMomentNotesSet = new Set();
let pendingDeepLinkMomentId = null;
let momentHighlightTimer = null;

// Inline Edit State
let editingMomentId = null;
let editMomentDraftText = '';
let editMomentDraftTag = '';
let editMomentKeepMedia = [];
let editMomentRemovedMedia = [];
let editMomentNewFiles = [];
let editMomentPreviewUrls = [];
let editMomentLinkedNoteId = '';
let editMomentNotePickerOpen = false;
let editMomentNoteSearch = '';
let editMomentStorage = 'r2';
let editMomentGhFolder = 'moments';
let editMomentVideoCompress = false;
let momentMenuDocListenerBound = false;

function toggleMomentCardMenu(dbId, evt) {
  if (evt) evt.stopPropagation();
  const targetMenu = document.getElementById(`moment-card-menu-${dbId}`);
  const wasHidden = !targetMenu || targetMenu.classList.contains('hidden');
  document.querySelectorAll('.js-moment-card-menu').forEach(el => el.classList.add('hidden'));
  if (targetMenu && wasHidden) {
    targetMenu.classList.remove('hidden');
  }
  if (!momentMenuDocListenerBound) {
    momentMenuDocListenerBound = true;
    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('.js-moment-menu-wrap')) return;
      document.querySelectorAll('.js-moment-card-menu').forEach(el => el.classList.add('hidden'));
    });
  }
}

function syncEditMomentDraftInputs() {
  if (!editingMomentId) return;
  const textEl = document.getElementById(`edit-moment-text-${editingMomentId}`);
  const tagEl = document.getElementById(`edit-moment-tag-${editingMomentId}`);
  if (textEl) editMomentDraftText = textEl.value;
  if (tagEl) editMomentDraftTag = tagEl.value;
}

function restoreMomentTransientPreviews() {
  if (selectedMomentFiles.length > 0) {
    renderSelectedComposerMedia();
  }
  if (editingMomentId && editMomentNewFiles.length > 0) {
    renderSelectedEditMedia();
  }
}

function isDesktopDeviceForVideoCompress() {
  const ua = navigator.userAgent || '';
  return !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

function shouldDeferMomentAutoRerender() {
  if (currentView !== 'chapter' || activeBookId !== 'moment') return false;
  if (editingMomentId) return true;
  const activeEl = document.activeElement;
  if (!activeEl) return false;
  const id = activeEl.id || '';
  return (
    id === 'new-moment-text' ||
    id === 'new-moment-tag' ||
    id === 'composer-note-search' ||
    id.startsWith('edit-moment-') ||
    id.startsWith('comment-name-') ||
    id.startsWith('comment-input-')
  );
}

function refreshMomentsViewSafely() {
  if (currentView !== 'chapter' || activeBookId !== 'moment') return;
  if (shouldDeferMomentAutoRerender()) return;
  renderChapterContent('moment');
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

/* ========================================================================
   COMPOSER DRAFT AUTOSAVE (PREVENT ACCIDENTAL TEXT LOSS)
   ======================================================================== */
function loadMomentComposerDraft() {
  try {
    const raw = localStorage.getItem(MOMENT_COMPOSER_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_e) {
    return null;
  }
}

function saveMomentComposerDraft(partial = null) {
  try {
    const textEl = document.getElementById('new-moment-text');
    const tagEl = document.getElementById('new-moment-tag');
    const prev = loadMomentComposerDraft() || {};
    const next = {
      text: textEl ? textEl.value : (partial && typeof partial.text === 'string' ? partial.text : (prev.text || '')),
      tag: tagEl ? tagEl.value : (partial && typeof partial.tag === 'string' ? partial.tag : (prev.tag ?? '#StudyEnglishWithMe')),
      linkedNoteId: composerLinkedNoteId || '',
      storage: selectedMomentStorage,
      ghFolder: selectedMomentGhFolder
    };
    if (!next.text.trim() && !next.linkedNoteId && (next.tag || '#StudyEnglishWithMe') === '#StudyEnglishWithMe') {
      localStorage.removeItem(MOMENT_COMPOSER_DRAFT_KEY);
    } else {
      localStorage.setItem(MOMENT_COMPOSER_DRAFT_KEY, JSON.stringify(next));
    }
  } catch (_e) {}
}

function clearMomentComposerDraft() {
  try {
    localStorage.removeItem(MOMENT_COMPOSER_DRAFT_KEY);
  } catch (_e) {}
}

function resetMomentComposerDraftUi() {
  clearMomentComposerDraft();
  composerLinkedNoteId = '';
  composerNotePickerOpen = false;
  composerNoteSearch = '';
  const textEl = document.getElementById('new-moment-text');
  const tagEl = document.getElementById('new-moment-tag');
  if (textEl) textEl.value = '';
  if (tagEl) tagEl.value = '#StudyEnglishWithMe';
  refreshMomentsViewSafely();
}

function applyComposerDraftIfNeeded() {
  const draft = loadMomentComposerDraft();
  if (!draft) return;
  if (!composerLinkedNoteId && draft.linkedNoteId) {
    composerLinkedNoteId = String(draft.linkedNoteId);
  }
  if (draft.storage === 'github' || draft.storage === 'r2') {
    selectedMomentStorage = draft.storage;
  }
  if (draft.ghFolder) {
    selectedMomentGhFolder = String(draft.ghFolder);
  }
}

async function ensureMomentGhFoldersLoaded() {
  if (!isAuthorAuthenticated || hasLoadedMomentGhFolders) return;
  hasLoadedMomentGhFolders = true;
  const folders = await fetchGitHubFolders();
  if (Array.isArray(folders) && folders.length > 0) {
    momentGhFolders = Array.from(new Set(['moments', ...folders]));
    refreshMomentsViewSafely();
  }
}

function setMomentStorageTarget(target, mode = 'composer') {
  const cleanTarget = target === 'github' ? 'github' : 'r2';
  if (mode === 'edit') {
    syncEditMomentDraftInputs();
    editMomentStorage = cleanTarget;
  } else {
    selectedMomentStorage = cleanTarget;
    saveMomentComposerDraft();
  }
  if (cleanTarget === 'github') {
    ensureMomentGhFoldersLoaded();
  }
  if (currentView === 'chapter' && activeBookId === 'moment') {
    if (mode === 'composer') saveMomentComposerDraft();
    renderChapterContent('moment');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  }
}

function setMomentGhFolder(folderName, mode = 'composer') {
  const clean = String(folderName || 'moments').trim() || 'moments';
  if (mode === 'edit') {
    syncEditMomentDraftInputs();
    editMomentGhFolder = clean;
  } else {
    selectedMomentGhFolder = clean;
    saveMomentComposerDraft();
  }
}

function toggleMomentVideoCompress(checked, mode = 'composer') {
  if (mode === 'edit') {
    syncEditMomentDraftInputs();
    editMomentVideoCompress = Boolean(checked);
  } else {
    compressMomentVideoDesktop = Boolean(checked);
  }
}

async function handleCreateMomentGhFolder(mode = 'composer') {
  if (!isAuthorAuthenticated) return;
  const currentFolder = mode === 'edit' ? editMomentGhFolder : selectedMomentGhFolder;
  const raw = window.prompt('输入要在 GitHub 仓库 (rudy-vault) 创建的文件夹路径（例如 moments/2026-11）：', currentFolder || 'moments');
  if (!raw) return;
  const clean = raw.trim().replace(/^\/+|\/+$/g, '');
  if (!clean) return;
  const statusEl = document.getElementById(mode === 'edit' ? `edit-moment-status-${editingMomentId}` : 'composer-status');
  if (statusEl) {
    statusEl.textContent = `Creating folder "${clean}" in rudy-vault...`;
    statusEl.className = 'font-mono-code text-[11px] text-[#e4d4a7]';
    statusEl.classList.remove('hidden');
  }
  try {
    await createGitHubFolder(clean);
    if (!momentGhFolders.includes(clean)) {
      momentGhFolders.push(clean);
    }
    if (mode === 'edit') {
      editMomentGhFolder = clean;
      editMomentStorage = 'github';
    } else {
      selectedMomentGhFolder = clean;
      selectedMomentStorage = 'github';
      saveMomentComposerDraft();
    }
    renderChapterContent('moment');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Folder error: ${err.message || 'Check GITHUB_TOKEN in Worker'}`;
      statusEl.className = 'font-mono-code text-[11px] text-rose-400';
      statusEl.classList.remove('hidden');
    }
  }
}

/**
 * Built-in fallback moments removed per user request (displays only Rudy's live moments).
 */
const MOMENTS_POSTS = [];

/**
 * Sorts posts with all Pinned moments first (newest pinned/created first),
 * followed by regular moments in reverse chronological order.
 */
function sortMomentsPosts(posts) {
  return [...posts].sort((a, b) => {
    const aPinned = Boolean(a.isPinned);
    const bPinned = Boolean(b.isPinned);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned) {
      const aPinTime = a.pinnedAtTs || a.createdAtTs || 0;
      const bPinTime = b.pinnedAtTs || b.createdAtTs || 0;
      if (aPinTime !== bPinTime) return bPinTime - aPinTime;
    }
    return (b.createdAtTs || 0) - (a.createdAtTs || 0);
  });
}

/**
 * Returns cloud-synced Supabase moments (pinned first, then newest first).
 */
function getAllMomentsPosts() {
  return sortMomentsPosts([...liveMomentsPosts, ...MOMENTS_POSTS]);
}

/**
 * Extracts up to 3 latest images from all Moments posts for the Profile preview row.
 */
function getLatestMomentThumbnails(limit = 3) {
  const thumbs = [];
  const allPosts = [...liveMomentsPosts, ...MOMENTS_POSTS].sort(
    (a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0)
  );
  for (const post of allPosts) {
    if (Array.isArray(post.images)) {
      for (const imgPath of post.images) {
        if (!isVideoMediaUrl(imgPath)) {
          thumbs.push(imgPath);
          if (thumbs.length >= limit) return thumbs;
        }
      }
    }
  }
  return thumbs;
}

/* ========================================================================
   TAGS, LIGHTWEIGHT MARKDOWN RENDERING & LINKED NOTE CARD HELPERS
   ======================================================================== */
function normalizeMomentTagToken(rawToken) {
  const clean = String(rawToken || '').trim().replace(/^#+/, '');
  if (!clean) return '';
  return `#${clean}`;
}

function extractMomentTags(post) {
  const tagSet = new Set();
  const rawTagField = String((post && (post.rawTag || post.tag)) || '').trim();
  if (rawTagField) {
    const parts = rawTagField.split(/[\s,，]+/).filter(Boolean);
    for (const part of parts) {
      const normalized = normalizeMomentTagToken(part);
      if (normalized && normalized.length > 1) {
        tagSet.add(normalized);
      }
    }
  }
  const rawContent = String((post && post.rawContent) || '');
  if (rawContent) {
    const regex = /(?:^|[\s(>])#([A-Za-z0-9_\-\u4e00-\u9fa5]{1,40})/g;
    let m;
    while ((m = regex.exec(rawContent)) !== null) {
      if (m[1]) tagSet.add(`#${m[1]}`);
    }
  }
  if (tagSet.size === 0) {
    tagSet.add('#StudyEnglishWithMe');
  }
  return Array.from(tagSet);
}

function buildMomentTagStats(posts = getAllMomentsPosts()) {
  const buckets = new Map();
  for (const post of posts) {
    const tags = extractMomentTags(post);
    const seenLower = new Set();
    tags.forEach((rawTag) => {
      const lower = rawTag.toLowerCase();
      if (seenLower.has(lower)) return;
      seenLower.add(lower);
      let entry = buckets.get(lower);
      if (!entry) {
        entry = { key: lower, total: 0, variants: new Map() };
        buckets.set(lower, entry);
      }
      entry.total += 1;
      entry.variants.set(rawTag, (entry.variants.get(rawTag) || 0) + 1);
    });
  }
  return Array.from(buckets.values())
    .map((entry) => {
      let bestLabel = '';
      let bestCount = -1;
      entry.variants.forEach((cnt, variant) => {
        if (cnt > bestCount) {
          bestCount = cnt;
          bestLabel = variant;
        }
      });
      return { key: entry.key, label: bestLabel, count: entry.total };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * Reuses canonical casing from existing Moments tags so "#idiom" / "#Idiom"
 * never split or create duplicate casing variants when saving.
 */
function resolveCanonicalMomentTagsInput(rawInput) {
  const stats = buildMomentTagStats();
  const canonicalByLower = new Map(stats.map(item => [item.key, item.label]));
  const parts = String(rawInput || '').trim().split(/[\s,，]+/).filter(Boolean);
  if (parts.length === 0) {
    return canonicalByLower.get('#studyenglishwithme') || '#StudyEnglishWithMe';
  }
  const seen = new Set();
  const resolved = [];
  for (const part of parts) {
    const token = normalizeMomentTagToken(part);
    if (!token || token.length <= 1) continue;
    const lower = token.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    resolved.push(canonicalByLower.get(lower) || token);
  }
  return resolved.length > 0
    ? resolved.join(' ')
    : (canonicalByLower.get('#studyenglishwithme') || '#StudyEnglishWithMe');
}

function buildMomentTagQuickPickHtml(inputId, currentValue, tagStats, mode = 'composer') {
  if (!Array.isArray(tagStats) || tagStats.length === 0) return '';
  const activeTokens = new Set(
    String(currentValue || '')
      .trim()
      .split(/[\s,，]+/)
      .filter(Boolean)
      .map(t => normalizeMomentTagToken(t).toLowerCase())
  );
  return `
    <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
      <span class="font-mono-code text-[10px] text-white/40 uppercase mr-0.5">Reuse Tag:</span>
      ${tagStats.map((item) => {
        const isSelected = activeTokens.has(item.key);
        return `
          <button
            type="button"
            onclick="applyMomentTagPreset('${escapeHtmlSafely(inputId)}', '${escapeHtmlSafely(item.label)}', '${mode}', this)"
            data-moment-tag-chip="${escapeHtmlSafely(item.key)}"
            class="js-moment-tag-chip px-2 py-0.5 rounded-full border font-mono-code text-[10px] transition cursor-pointer ${
              isSelected
                ? 'border-[#0a84ff]/70 bg-[#0a84ff]/20 text-[#0a84ff]'
                : 'border-white/12 bg-white/[0.03] text-white/60 hover:text-[#0a84ff] hover:border-[#0a84ff]/45'
            }"
          >${escapeHtmlSafely(item.label)}</button>
        `;
      }).join('')}
    </div>
  `;
}

function applyMomentTagPreset(inputId, tagLabel, mode, btnEl) {
  const input = document.getElementById(inputId);
  if (input) {
    input.value = tagLabel;
  }
  if (mode === 'edit') {
    syncEditMomentDraftInputs();
  } else {
    saveMomentComposerDraft();
  }
  const container = btnEl ? btnEl.parentElement : null;
  if (container) {
    const targetLower = String(tagLabel || '').toLowerCase();
    container.querySelectorAll('.js-moment-tag-chip').forEach((chip) => {
      const isMatch = chip.getAttribute('data-moment-tag-chip') === targetLower;
      chip.className = `js-moment-tag-chip px-2 py-0.5 rounded-full border font-mono-code text-[10px] transition cursor-pointer ${
        isMatch
          ? 'border-[#0a84ff]/70 bg-[#0a84ff]/20 text-[#0a84ff]'
          : 'border-white/12 bg-white/[0.03] text-white/60 hover:text-[#0a84ff] hover:border-[#0a84ff]/45'
      }`;
    });
  }
}

function setMomentTagFilter(tagLabel) {
  const next = (!tagLabel || tagLabel === 'ALL')
    ? 'ALL'
    : (activeMomentTagFilter.toLowerCase() === String(tagLabel).toLowerCase() ? 'ALL' : String(tagLabel));
  activeMomentTagFilter = next;
  activeMomentPendingOnly = false;
  momentVisibleLimit = MOMENT_PAGE_SIZE;
  renderChapterContent('moment');
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

function toggleMomentPendingFilter() {
  activeMomentPendingOnly = !activeMomentPendingOnly;
  if (activeMomentPendingOnly) {
    activeMomentTagFilter = 'ALL';
  }
  momentVisibleLimit = MOMENT_PAGE_SIZE;
  renderChapterContent('moment');
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

function loadMoreMoments() {
  momentVisibleLimit += MOMENT_PAGE_SIZE;
  renderChapterContent('moment');
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

function toggleMomentTagBarExpand() {
  momentTagsExpanded = !momentTagsExpanded;
  renderChapterContent('moment');
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

/**
 * Safely renders Moment body text with inline code, bold, italic, ==highlight==,
 * strikethrough, markdown/bare links, and clickable #tags (XSS-safe).
 */
function renderMomentRichText(rawText) {
  const source = String(rawText || '');
  if (!source) return '';

  const codeTokens = [];
  const linkTokens = [];

  // Escape raw HTML before applying controlled inline markdown
  let s = escapeHtmlSafely(source);

  // Protect inline code spans first
  s = s.replace(/`([^`\n]+)`/g, (_m, codeBody) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code class="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 font-mono-code text-[12px] text-[#e4d4a7]">${codeBody}</code>`);
    return `@@MOMENT_CODE_${idx}@@`;
  });

  // Markdown links [label](https://...)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_m, label, url) => {
    const safeUrl = sanitizeSafeMediaUrl(url.replace(/&amp;/g, '&'));
    if (!safeUrl) return label;
    const idx = linkTokens.length;
    linkTokens.push(
      `<a href="${escapeHtmlSafely(safeUrl)}" target="_blank" rel="noopener noreferrer" class="text-[#e4d4a7] underline decoration-[#e4d4a7]/45 hover:decoration-[#e4d4a7] transition">${label}</a>`
    );
    return `@@MOMENT_LINK_${idx}@@`;
  });

  // Bare URLs (https://... or http://...)
  s = s.replace(/(^|[\s(])((https?:\/\/)[^\s<)"']+)/gi, (_m, prefix, rawUrl) => {
    let cleanUrl = rawUrl;
    let trailing = '';
    while (/[.,;:!?)]$/.test(cleanUrl)) {
      trailing = cleanUrl.slice(-1) + trailing;
      cleanUrl = cleanUrl.slice(0, -1);
    }
    const safeUrl = sanitizeSafeMediaUrl(cleanUrl.replace(/&amp;/g, '&'));
    if (!safeUrl) return `${prefix}${rawUrl}`;
    const idx = linkTokens.length;
    linkTokens.push(
      `<a href="${escapeHtmlSafely(safeUrl)}" target="_blank" rel="noopener noreferrer" class="text-[#e4d4a7] underline decoration-[#e4d4a7]/45 hover:decoration-[#e4d4a7] break-all transition">${cleanUrl}</a>`
    );
    return `${prefix}@@MOMENT_LINK_${idx}@@${trailing}`;
  });

  // ==Highlight==, **Bold**, *Italic*, ~~Strike~~
  s = s.replace(/==([^=\n]+)==/g, '<mark class="moment-highlight">$1</mark>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong class="font-semibold text-[#f7f4ec]">$1</strong>');
  s = s.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, '$1<em class="italic text-white/90">$2</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del class="opacity-55">$1</del>');

  // Clickable inline #hashtags (prefix excludes '&' so HTML entities like &#39; are never matched)
  s = s.replace(/(^|[\s(>])#([A-Za-z0-9_\-\u4e00-\u9fa5]{1,40})/g, (_m, prefix, tagWord) => {
    const fullTag = `#${tagWord}`;
    return `${prefix}<button type="button" onclick="setMomentTagFilter('${escapeHtmlSafely(fullTag)}')" class="moment-inline-tag">${escapeHtmlSafely(fullTag)}</button>`;
  });

  s = s.replace(/@@MOMENT_LINK_(\d+)@@/g, (_m, idx) => linkTokens[Number(idx)] || '');
  s = s.replace(/@@MOMENT_CODE_(\d+)@@/g, (_m, idx) => codeTokens[Number(idx)] || '');
  return s;
}

function getMomentVaultNoteById(noteId) {
  if (!noteId || typeof wsLoadVault !== 'function') return null;
  const vault = wsLoadVault();
  if (!vault || !Array.isArray(vault.notes)) return null;
  const note = vault.notes.find(n => String(n.id) === String(noteId));
  if (!note) return null;
  const folder = Array.isArray(vault.folders) && note.folderId
    ? vault.folders.find(f => String(f.id) === String(note.folderId))
    : null;
  return { note, folderName: folder ? folder.name : '' };
}

function getMomentNoteExcerptMarkdown(mdContent, isExpanded) {
  const normalized = String(mdContent || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '*Empty note*';
  if (isExpanded) return normalized;
  const lines = normalized.split('\n');
  const sliced = lines.slice(0, 10).join('\n');
  return sliced.length > 520 ? `${sliced.slice(0, 520)}...` : sliced;
}

function buildMomentLinkedNoteCardHtml(noteId, momentKey) {
  if (!noteId) return '';
  const match = getMomentVaultNoteById(noteId);
  const safeNoteId = escapeHtmlSafely(noteId);

  if (!match) {
    const stillLoading = typeof wsHasFetchedCloudVault !== 'undefined' && !wsHasFetchedCloudVault;
    return `
      <div
        data-moment-note-slot="${safeNoteId}"
        data-moment-key="${escapeHtmlSafely(momentKey)}"
        class="moment-note-card rounded-xl border border-white/15 bg-[#16181d]/90 p-3.5 max-w-lg"
      >
        <div class="flex items-center justify-between gap-2 text-xs font-mono-code text-white/50">
          <span>📒 ${stillLoading ? 'Loading linked Note...' : 'Linked note is no longer in Note archive.'}</span>
        </div>
      </div>
    `;
  }

  const { note, folderName } = match;
  const expandKey = `${momentKey}::${note.id}`;
  const isExpanded = expandedMomentNotesSet.has(expandKey);
  const excerptMd = getMomentNoteExcerptMarkdown(note.content, isExpanded);
  const renderedMd = typeof wsRenderMarkdown === 'function'
    ? wsRenderMarkdown(excerptMd)
    : `<p>${renderMomentRichText(excerptMd)}</p>`;
  const needsExpand = String(note.content || '').length > 300 || String(note.content || '').split('\n').length > 8;

  return `
    <div
      data-moment-note-slot="${safeNoteId}"
      data-moment-key="${escapeHtmlSafely(momentKey)}"
      class="moment-note-card rounded-xl border border-white/15 bg-gradient-to-br from-[#191b20]/95 to-[#121418]/95 p-3.5 sm:p-4 max-w-lg space-y-2.5 shadow-lg"
    >
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-2">
        <div class="min-w-0 flex items-center gap-2">
          <span class="text-[#0a84ff] text-xs shrink-0" aria-hidden="true">📒</span>
          <span class="font-serif-editorial text-base text-[#f3f1ec] truncate">${escapeHtmlSafely(note.title || 'Untitled Note')}</span>
        </div>
        ${folderName ? `<span class="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/12 font-mono-code text-[10px] text-white/75 shrink-0">📁 ${escapeHtmlSafely(folderName)}</span>` : ''}
      </div>

      <div class="ws-md-preview moment-note-md ${isExpanded ? 'is-expanded' : 'is-collapsed'}">
        ${renderedMd}
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/8 font-mono-code text-[11px]">
        ${needsExpand ? `
          <button
            type="button"
            onclick="toggleMomentNoteExpand('${escapeHtmlSafely(expandKey)}')"
            class="text-[#0a84ff] hover:text-[#5ac8fa] transition cursor-pointer"
          >${isExpanded ? '▲ Collapse Note' : '▼ Read Full Note'}</button>
        ` : '<span></span>'}
        <button
          type="button"
          onclick="openWorkNoteFromMoment('${escapeHtmlSafely(note.id)}')"
          class="text-white/65 hover:text-[#0a84ff] transition cursor-pointer ml-auto"
        >Open in Note ↗</button>
      </div>
    </div>
  `;
}

function refreshMomentLinkedNoteSlots() {
  if (currentView !== 'chapter' || activeBookId !== 'moment') return;
  const slots = document.querySelectorAll('[data-moment-note-slot]');
  if (!slots.length) return;
  slots.forEach((slot) => {
    const noteId = slot.getAttribute('data-moment-note-slot') || '';
    const momentKey = slot.getAttribute('data-moment-key') || noteId;
    if (!noteId) return;
    slot.outerHTML = buildMomentLinkedNoteCardHtml(noteId, momentKey);
  });
}

function toggleMomentNoteExpand(expandKey) {
  if (!expandKey) return;
  if (expandedMomentNotesSet.has(expandKey)) {
    expandedMomentNotesSet.delete(expandKey);
  } else {
    expandedMomentNotesSet.add(expandKey);
  }
  renderChapterContent('moment');
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

function openWorkNoteFromMoment(noteId) {
  if (!noteId) return;
  if (typeof wsLoadVault === 'function') {
    const vault = wsLoadVault();
    const target = vault.notes.find(n => String(n.id) === String(noteId));
    if (target) {
      vault.activeNoteId = target.id;
      if (!vault.openTabIds.includes(target.id)) {
        vault.openTabIds.push(target.id);
      }
    }
  }
  switchChapterDirectly('work');
}

/* ========================================================================
   SHARED NOTE PICKER FOR COMPOSER & INLINE EDITOR
   ======================================================================== */
function toggleMomentNotePicker(mode = 'composer') {
  if (mode === 'edit') {
    syncEditMomentDraftInputs();
    editMomentNotePickerOpen = !editMomentNotePickerOpen;
  } else {
    saveMomentComposerDraft();
    composerNotePickerOpen = !composerNotePickerOpen;
  }
  if (typeof wsHasFetchedCloudVault !== 'undefined' && !wsHasFetchedCloudVault && typeof wsFetchVaultFromR2 === 'function') {
    wsFetchVaultFromR2();
  }
  renderChapterContent('moment');
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

function selectMomentLinkedNote(mode, noteId) {
  if (mode === 'edit') {
    syncEditMomentDraftInputs();
    editMomentLinkedNoteId = String(noteId || '');
    editMomentNotePickerOpen = false;
  } else {
    saveMomentComposerDraft();
    composerLinkedNoteId = String(noteId || '');
    composerNotePickerOpen = false;
    saveMomentComposerDraft();
  }
  renderChapterContent('moment');
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

function handleMomentNoteSearchInput(mode, query) {
  const clean = String(query || '');
  if (mode === 'edit') {
    editMomentNoteSearch = clean;
  } else {
    composerNoteSearch = clean;
  }
  const listEl = document.getElementById(`${mode}-moment-note-options`);
  if (listEl) {
    listEl.innerHTML = buildMomentNotePickerOptionsHtml(mode, clean);
  }
}

function buildMomentNotePickerOptionsHtml(mode, searchQuery) {
  const vault = typeof wsLoadVault === 'function' ? wsLoadVault() : { notes: [], folders: [] };
  const q = String(searchQuery || '').trim().toLowerCase();
  const folderMap = new Map((vault.folders || []).map(f => [f.id, f.name]));
  const notes = (vault.notes || []).filter((n) => {
    if (!q) return true;
    return String(n.title || '').toLowerCase().includes(q) || String(n.content || '').toLowerCase().includes(q);
  }).slice(0, 20);

  if (notes.length === 0) {
    return `<p class="px-2.5 py-2 text-[11px] font-mono-code text-white/40">No matching notes found.</p>`;
  }

  return notes.map((n) => {
    const fName = n.folderId ? (folderMap.get(n.folderId) || '') : '';
    return `
      <button
        type="button"
        onclick="selectMomentLinkedNote('${mode}', '${escapeHtmlSafely(n.id)}')"
        class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] flex items-center justify-between gap-2 text-xs transition cursor-pointer"
      >
        <span class="truncate text-[#f3f1ec]">📒 ${escapeHtmlSafely(n.title || 'Untitled')}</span>
        ${fName ? `<span class="font-mono-code text-[10px] text-white/40 shrink-0">${escapeHtmlSafely(fName)}</span>` : ''}
      </button>
    `;
  }).join('');
}

function buildMomentNotePickerUi(mode, selectedNoteId, isOpen, searchQuery) {
  const selectedMatch = selectedNoteId ? getMomentVaultNoteById(selectedNoteId) : null;
  const chipHtml = selectedNoteId
    ? `
      <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#0a84ff]/40 bg-[#0a84ff]/12 text-[11px] font-mono-code text-[#0a84ff]">
        <span class="truncate max-w-[200px]">📒 ${escapeHtmlSafely(selectedMatch ? selectedMatch.note.title : selectedNoteId)}</span>
        <button
          type="button"
          onclick="selectMomentLinkedNote('${mode}', '')"
          title="Remove linked note"
          class="text-white/60 hover:text-rose-300 cursor-pointer pl-1"
        >✕</button>
      </div>
    `
    : '';

  const drawerHtml = isOpen
    ? `
      <div class="rounded-xl border border-white/15 bg-black/55 p-2.5 space-y-2">
        <div class="flex items-center gap-2">
          <input
            id="${mode}-note-search"
            type="text"
            value="${escapeHtmlSafely(searchQuery)}"
            oninput="handleMomentNoteSearchInput('${mode}', this.value)"
            placeholder="Search Notes by title..."
            class="flex-1 min-w-0 rounded-lg bg-black/50 border border-white/15 px-2.5 py-1.5 text-xs text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#0a84ff]"
          />
          <button
            type="button"
            onclick="toggleMomentNotePicker('${mode}')"
            class="px-2 py-1 rounded border border-white/15 font-mono-code text-[10px] text-white/55 hover:text-white cursor-pointer"
          >Close</button>
        </div>
        <div id="${mode}-moment-note-options" class="max-h-44 overflow-y-auto divide-y divide-white/5">
          ${buildMomentNotePickerOptionsHtml(mode, searchQuery)}
        </div>
      </div>
    `
    : '';

  return { chipHtml, drawerHtml };
}

/* ========================================================================
   SHARE & DEEP-LINK HIGHLIGHT FOCUS
   ======================================================================== */
async function shareMomentPost(momentId, btnEl) {
  if (!momentId) return;
  const shareUrl = `${window.location.origin}${window.location.pathname}#moment/${encodeURIComponent(momentId)}`;
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
    }
  } catch (_e) {}

  if (!copied) {
    try {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_e) {}
  }

  if (btnEl) {
    const prev = btnEl.dataset.origText || btnEl.textContent;
    btnEl.dataset.origText = prev;
    btnEl.textContent = copied ? '✓ Copied!' : 'Link Ready';
    btnEl.classList.add('text-emerald-300');
    setTimeout(() => {
      if (btnEl) {
        btnEl.textContent = prev;
        btnEl.classList.remove('text-emerald-300');
      }
    }, 2000);
  }
}

function focusMomentCardById(momentId) {
  if (!momentId) return false;
  const targetId = String(momentId);
  pendingDeepLinkMomentId = targetId;

  const allPosts = getAllMomentsPosts();
  const targetIdx = allPosts.findIndex(p => String(p.dbId) === targetId);
  if (targetIdx === -1) return false;

  const escapedId = CSS.escape ? CSS.escape(targetId) : targetId;
  const pulseAndScrollCard = (card) => {
    if (!card) return;
    pendingDeepLinkMomentId = null;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('is-moment-highlighted');
    void card.offsetWidth;
    card.classList.add('is-moment-highlighted');
    if (momentHighlightTimer) clearTimeout(momentHighlightTimer);
    momentHighlightTimer = setTimeout(() => {
      card.classList.remove('is-moment-highlighted');
    }, 2600);
  };

  if (currentView === 'chapter' && activeBookId === 'moment') {
    const existingCard = document.querySelector(`[data-moment-id="${escapedId}"]`);
    if (existingCard) {
      pulseAndScrollCard(existingCard);
      return true;
    }

    // Card not currently visible: reset active filters & expand pagination, then render & jump
    activeMomentTagFilter = 'ALL';
    activeMomentPendingOnly = false;
    const pinnedCount = allPosts.filter(p => p.isPinned).length;
    const unpinnedPos = allPosts.slice(pinnedCount).findIndex(p => String(p.dbId) === targetId);
    if (unpinnedPos >= 0 && unpinnedPos + 1 > momentVisibleLimit) {
      momentVisibleLimit = Math.ceil((unpinnedPos + 1) / MOMENT_PAGE_SIZE) * MOMENT_PAGE_SIZE;
    }

    renderChapterContent('moment');
    setTimeout(() => {
      pulseAndScrollCard(document.querySelector(`[data-moment-id="${escapedId}"]`));
      syncButterflyToCloseButton(false);
    }, 80);
  }
  return true;
}

/* ========================================================================
   SHARED MEDIA UPLOAD & REMOTE CLEANUP HELPERS
   ======================================================================== */
async function uploadMomentMediaFiles(files, storageTarget, ghFolder, useDesktopCompress, onStatus) {
  const client = ensureSupabaseClient();
  const uploadedUrls = [];
  let detectedMediaType = 'image';
  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : '';

  for (let i = 0; i < files.length; i++) {
    let file = files[i];
    if (file.type.startsWith('video/')) {
      detectedMediaType = 'video';
      if (useDesktopCompress && isDesktopDeviceForVideoCompress()) {
        if (typeof onStatus === 'function') {
          onStatus(`Compressing video ${i + 1}/${files.length} (first load downloads ~25MB encoder)...`);
        }
        file = await compressVideoFileWithFfmpeg(file, (ratio) => {
          if (typeof onStatus === 'function') {
            onStatus(`Compressing video ${i + 1}: ${Math.round(ratio * 100)}%...`);
          }
        });
      }
    } else if (file.type.startsWith('image/')) {
      file = await compressImageFileForSpeed(file, 1600, 0.84);
    }

    if (typeof onStatus === 'function') {
      onStatus(`Uploading ${i + 1}/${files.length} to ${storageTarget === 'github' ? 'GitHub' : 'Cloudflare R2'}...`);
    }

    let finalPublicUrl = '';
    if (storageTarget === 'github') {
      const ghRes = await uploadSingleFileToGitHub(file, ghFolder);
      finalPublicUrl = ghRes.url;
    } else {
      try {
        const uploadRes = await fetch(R2_UPLOAD_ENDPOINT, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name || `media-${i}.bin`)
          },
          body: file
        });
        const uploadJson = await uploadRes.json().catch(() => ({}));
        if (uploadRes.ok && uploadJson.url) {
          finalPublicUrl = uploadJson.url;
        } else {
          console.warn('R2 upload returned error, falling back to Supabase Storage:', uploadJson.error || uploadRes.status);
        }
      } catch (r2Err) {
        console.warn('R2 upload unreachable, falling back to Supabase Storage:', r2Err);
      }

      if (!finalPublicUrl) {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const filePath = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await client.storage
          .from('media')
          .upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = client.storage.from('media').getPublicUrl(filePath);
        if (publicUrlData && publicUrlData.publicUrl) {
          finalPublicUrl = publicUrlData.publicUrl;
        }
      }
    }

    if (finalPublicUrl) {
      uploadedUrls.push(finalPublicUrl);
    }
  }

  return { uploadedUrls, detectedMediaType };
}

async function cleanupMomentRemoteMedia(mediaUrls) {
  if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) return;
  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated) return;
  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : '';

  for (const mUrl of mediaUrls) {
    const r2Key = extractR2KeyFromMediaUrl(mUrl);
    if (r2Key) {
      fetch(`${R2_UPLOAD_ENDPOINT}/art-music-file?key=${encodeURIComponent(r2Key)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).catch(() => {});
    } else {
      const ghPath = extractGitHubPathFromMediaUrl(mUrl);
      if (ghPath) {
        deleteGitHubVaultFile(ghPath);
      }
    }
  }
}

function formatSupabaseMomentMutationError(err) {
  const msg = String((err && (err.message || err.details || err.hint)) || 'Please check network.');
  if (/is_pinned|pinned_at|linked_note_id|column .* does not exist/i.test(msg)) {
    return '数据库缺少新字段，请先在 Supabase SQL Editor 运行我发你的升级 SQL。';
  }
  if (/row-level security|permission denied|42501/i.test(msg)) {
    return '没有修改权限：请在 Supabase 为 moments 表启用作者 UPDATE 策略（RLS）。';
  }
  return msg;
}

/* ========================================================================
   MAIN FEED RENDERER
   ======================================================================== */
function buildMomentsFeedHtml() {
  if (isAuthorAuthenticated) {
    applyComposerDraftIfNeeded();
  }

  const allPosts = getAllMomentsPosts();
  const tagStats = buildMomentTagStats(allPosts);
  const canonicalTagMap = new Map(tagStats.map(item => [item.key, item.label]));
  const momentTagDatalistHtml = tagStats.length > 0
    ? `<datalist id="moment-tag-suggestions">${tagStats.map(item => `<option value="${escapeHtmlSafely(item.label)}"></option>`).join('')}</datalist>`
    : '';
  const totalPendingCount = Object.values(momentCommentsMap).reduce((sum, list) => {
    return sum + list.filter(c => c.status === 'pending').length;
  }, 0);

  const pendingBadgeHtml = totalPendingCount > 0
    ? `<button
         type="button"
         onclick="toggleMomentPendingFilter()"
         title="Click to filter moments with pending comments"
         class="px-2.5 py-0.5 rounded-full border font-mono-code text-[10px] transition cursor-pointer ${
           activeMomentPendingOnly
             ? 'bg-amber-400 text-[#0c0d0f] border-amber-300 font-semibold'
             : 'bg-amber-400/15 border-amber-400/40 text-amber-300 hover:bg-amber-400/25'
         }"
       >
         ${activeMomentPendingOnly ? `● ${totalPendingCount} PENDING (SHOW ALL)` : `${totalPendingCount} PENDING REVIEW ↗`}
       </button>`
    : '';

  const draft = isAuthorAuthenticated ? (loadMomentComposerDraft() || {}) : {};
  const draftText = typeof draft.text === 'string' ? draft.text : '';
  const draftTag = typeof draft.tag === 'string' && draft.tag.trim() ? draft.tag : '#StudyEnglishWithMe';
  const composerPicker = isAuthorAuthenticated
    ? buildMomentNotePickerUi('composer', composerLinkedNoteId, composerNotePickerOpen, composerNoteSearch)
    : { chipHtml: '', drawerHtml: '' };

  const authorComposerHtml = isAuthorAuthenticated
    ? `
      <div class="ios-glass-card rounded-2xl border border-white/15 p-4 sm:p-5 space-y-3.5 shadow-xl">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span class="font-mono-code text-[11px] tracking-widest uppercase text-[#0a84ff]">
              AUTHOR MODE · NEW MOMENT
            </span>
            ${pendingBadgeHtml}
            ${draftText.trim() ? `
              <button
                type="button"
                onclick="resetMomentComposerDraftUi()"
                class="font-mono-code text-[10px] text-white/45 hover:text-rose-300 transition cursor-pointer"
                title="Clear saved draft"
              >[ Clear Draft ]</button>
            ` : ''}
          </div>
          <button
            type="button"
            onclick="handleAuthorLogout()"
            class="font-mono-code text-[11px] text-white/45 hover:text-rose-300 transition cursor-pointer"
          >
            [ SIGN OUT ]
          </button>
        </div>

        <textarea
          id="new-moment-text"
          rows="3"
          oninput="saveMomentComposerDraft()"
          placeholder="Write today's English reflection, idiom, or mood... (supports **bold**, ==highlight==, \`code\`, links)"
          class="w-full rounded-xl bg-black/45 border border-white/15 p-3 text-sm text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#0a84ff]"
        >${escapeHtmlSafely(draftText)}</textarea>

        <!-- Selected Photos / Videos Preview Row -->
        <div id="composer-media-preview" class="hidden flex-wrap gap-2.5 pt-1"></div>

        ${composerPicker.chipHtml ? `<div class="flex flex-wrap items-center gap-2">${composerPicker.chipHtml}</div>` : ''}
        ${composerPicker.drawerHtml}

        <div class="flex flex-wrap items-center justify-between gap-2.5 pt-1">
          <div class="flex flex-wrap items-center gap-2">
            <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono-code text-white/80 cursor-pointer transition">
              <span>+ PHOTO / VIDEO</span>
              <input
                id="new-moment-files"
                type="file"
                accept="image/*,video/*"
                multiple
                onchange="handleMomentFileSelection(event)"
                class="hidden"
              />
            </label>

            <button
              type="button"
              onclick="toggleMomentNotePicker('composer')"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono-code transition cursor-pointer ${
                composerNotePickerOpen || composerLinkedNoteId
                  ? 'border-[#0a84ff]/55 bg-[#0a84ff]/15 text-[#0a84ff]'
                  : 'border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-white/80'
              }"
            >
              <span>+ ATTACH NOTE</span>
            </button>

            <input
              id="new-moment-tag"
              type="text"
              list="moment-tag-suggestions"
              value="${escapeHtmlSafely(draftTag)}"
              oninput="saveMomentComposerDraft()"
              placeholder="#Tag"
              class="w-40 rounded-lg bg-black/35 border border-white/10 px-2.5 py-1.5 font-mono-code text-xs text-[#0a84ff] placeholder-white/30 focus:outline-none focus:border-[#0a84ff]"
            />
          </div>

          <button
            id="btn-publish-moment"
            type="button"
            onclick="publishNewMoment()"
            class="ios-primary-btn px-4 py-2 rounded-xl font-mono-code text-xs font-medium tracking-wide transition cursor-pointer shadow"
          >
            POST MOMENT ↵
          </button>
        </div>
        ${buildMomentTagQuickPickHtml('new-moment-tag', draftTag, tagStats, 'composer')}

        <!-- Storage Destination (R2 vs GitHub rudy-vault) & Compression Options -->
        <div class="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-code">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-white/45">SAVE MEDIA TO:</span>
            <button
              type="button"
              onclick="setMomentStorageTarget('r2', 'composer')"
              class="px-2.5 py-1 rounded-md border transition cursor-pointer ${selectedMomentStorage === 'r2' ? 'border-[#0a84ff]/60 bg-[#0a84ff]/15 text-[#0a84ff]' : 'border-white/12 text-white/55 hover:text-white'}"
            >Cloudflare R2</button>
            <button
              type="button"
              onclick="setMomentStorageTarget('github', 'composer')"
              class="px-2.5 py-1 rounded-md border transition cursor-pointer ${selectedMomentStorage === 'github' ? 'border-[#0a84ff]/60 bg-[#0a84ff]/15 text-[#0a84ff]' : 'border-white/12 text-white/55 hover:text-white'}"
            >GitHub (rudy-vault)</button>

            ${selectedMomentStorage === 'github' ? `
              <select
                aria-label="GitHub Target Folder"
                onchange="setMomentGhFolder(this.value, 'composer')"
                class="rounded-md bg-black/45 border border-white/15 px-2 py-1 text-[11px] text-[#f3f1ec] focus:outline-none focus:border-[#0a84ff]"
              >
                ${momentGhFolders.map(f => `<option value="${escapeHtmlSafely(f)}" ${f === selectedMomentGhFolder ? 'selected' : ''}>📁 ${escapeHtmlSafely(f)}</option>`).join('')}
              </select>
              <button
                type="button"
                onclick="handleCreateMomentGhFolder('composer')"
                class="px-2 py-1 rounded-md border border-white/15 hover:border-[#0a84ff]/55 text-white/70 hover:text-[#0a84ff] cursor-pointer transition"
                title="Create folder in rudy-vault"
              >+ Folder</button>
            ` : ''}
          </div>

          <div class="flex flex-wrap items-center gap-3 text-[10px] text-white/50">
            <span>✓ 图片自动压缩</span>
            ${isDesktopDeviceForVideoCompress() ? `
              <label class="inline-flex items-center gap-1.5 cursor-pointer text-white/70 hover:text-[#0a84ff]">
                <input
                  type="checkbox"
                  ${compressMomentVideoDesktop ? 'checked' : ''}
                  onchange="toggleMomentVideoCompress(this.checked, 'composer')"
                  class="accent-[#0a84ff]"
                />
                <span>压缩视频 (桌面端按需加载 ~25MB)</span>
              </label>
            ` : ''}
          </div>
        </div>

        <p id="composer-status" class="font-mono-code text-[11px] text-amber-300 hidden"></p>
      </div>
    `
    : '';

  // Optional Tag Filter Bar (Collapsed by default so feed opens cleanly)
  let tagBarHtml = '';
  if (allPosts.length > 0 && tagStats.length > 0) {
    if (!momentTagsExpanded) {
      const hasActiveTag = activeMomentTagFilter !== 'ALL' && !activeMomentPendingOnly;
      tagBarHtml = `
        <div class="moment-tag-bar">
          ${hasActiveTag ? `
            <button
              type="button"
              onclick="setMomentTagFilter('ALL')"
              class="ios-glass-pill px-3 py-1 rounded-full border border-[#0a84ff]/65 bg-[#0a84ff]/18 font-mono-code text-[11px] text-[#0a84ff] transition cursor-pointer shrink-0"
              title="Clear tag filter"
            >🏷 ${escapeHtmlSafely(activeMomentTagFilter)} ✕</button>
          ` : ''}
          <button
            type="button"
            onclick="toggleMomentTagBarExpand()"
            class="ios-glass-pill px-3 py-1 rounded-full border border-white/15 font-mono-code text-[11px] text-white/70 hover:text-[#0a84ff] transition cursor-pointer shrink-0"
          >${hasActiveTag ? `All Tags (${tagStats.length}) ▾` : `🏷 Filter Tags (${tagStats.length}) ▾`}</button>
        </div>
      `;
    } else {
      tagBarHtml = `
        <div class="moment-tag-bar">
          <button
            type="button"
            onclick="toggleMomentTagBarExpand()"
            class="ios-glass-pill px-3 py-1 rounded-full border border-[#0a84ff]/45 font-mono-code text-[11px] text-[#0a84ff] transition cursor-pointer shrink-0"
          >🏷 Hide Tags ▲</button>
          <button
            type="button"
            onclick="setMomentTagFilter('ALL')"
            class="px-2.5 py-1 rounded-full border font-mono-code text-[11px] transition cursor-pointer shrink-0 ${
              activeMomentTagFilter === 'ALL' && !activeMomentPendingOnly
                ? 'border-[#0a84ff]/65 bg-[#0a84ff]/18 text-[#0a84ff]'
                : 'border-white/10 bg-white/[0.02] text-white/55 hover:text-white hover:border-white/25'
            }"
          >All · ${allPosts.length}</button>
          ${tagStats.map((t) => {
            const isActive = !activeMomentPendingOnly && activeMomentTagFilter.toLowerCase() === t.label.toLowerCase();
            return `
              <button
                type="button"
                onclick="setMomentTagFilter('${escapeHtmlSafely(t.label)}')"
                class="px-2.5 py-1 rounded-full border font-mono-code text-[11px] transition cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-[#e2c458]/65 bg-[#e2c458]/18 text-[#e2c458]'
                    : 'border-white/10 bg-white/[0.02] text-white/55 hover:text-[#e2c458] hover:border-[#e2c458]/35'
                }"
              >${escapeHtmlSafely(t.label)} · ${t.count}</button>
            `;
          }).join('')}
        </div>
      `;
    }
  }

  // Apply optional Tag or Pending filter
  let filteredPosts = allPosts;
  if (activeMomentPendingOnly && isAuthorAuthenticated) {
    filteredPosts = filteredPosts.filter((post, idx) => {
      const mKey = post.dbId ? String(post.dbId) : `static-${idx}`;
      return (momentCommentsMap[mKey] || []).some(c => c.status === 'pending');
    });
  } else if (activeMomentTagFilter !== 'ALL') {
    const targetLower = activeMomentTagFilter.toLowerCase();
    filteredPosts = filteredPosts.filter(post =>
      extractMomentTags(post).some(t => t.toLowerCase() === targetLower)
    );
  }

  // Pagination: always show all pinned posts in filtered set + up to momentVisibleLimit unpinned posts
  let visiblePosts = filteredPosts;
  let hasMorePosts = false;
  let remainingCount = 0;
  if (!activeMomentPendingOnly) {
    const pinnedInFiltered = filteredPosts.filter(p => p.isPinned);
    const unpinnedInFiltered = filteredPosts.filter(p => !p.isPinned);
    const slicedUnpinned = unpinnedInFiltered.slice(0, momentVisibleLimit);
    visiblePosts = [...pinnedInFiltered, ...slicedUnpinned];
    remainingCount = Math.max(0, unpinnedInFiltered.length - slicedUnpinned.length);
    hasMorePosts = remainingCount > 0;
  }

  const postsHtml = visiblePosts.length > 0
    ? visiblePosts.map((post, postIdx) => {
        const momentKey = post.dbId ? String(post.dbId) : `static-${postIdx}`;
        const isEditingThis = Boolean(isAuthorAuthenticated && post.dbId && String(editingMomentId) === String(post.dbId));
        const rawComments = momentCommentsMap[momentKey] || [];
        const approvedComments = rawComments.filter(c => c.status === 'approved').slice(0, 8);
        const pendingComments = isAuthorAuthenticated
          ? rawComments.filter(c => c.status === 'pending')
          : [];
        const isCommentsFull = approvedComments.length >= 8;

        const mediaList = Array.isArray(post.images) ? post.images : [];
        let mediaBlock = '';

        if (!isEditingThis && mediaList.length > 0) {
          const videos = mediaList.filter(url => isVideoMediaUrl(url, post.mediaType));
          const images = mediaList.filter(url => !isVideoMediaUrl(url, post.mediaType));

          const videoHtml = videos.map(vUrl => `
            <div class="pt-1 max-w-md">
              <video
                src="${escapeHtmlSafely(vUrl)}"
                controls
                playsinline
                preload="metadata"
                class="w-full rounded-xl border border-white/15 bg-black/70 max-h-80"
              ></video>
            </div>
          `).join('');

          let photosGrid = '';
          if (images.length === 1) {
            const singleSrc = images[0];
            photosGrid = `
              <div data-lightbox-gallery="Daily Moments · ${escapeHtmlSafely(post.date)}" class="pt-1 max-w-sm sm:max-w-md">
                <img
                  src="${escapeHtmlSafely(singleSrc)}"
                  data-lightbox-src="${escapeHtmlSafely(singleSrc)}"
                  alt="Moment photo ${postIdx + 1}"
                  loading="lazy"
                  decoding="async"
                  onclick="openImageLightboxFromEl(this)"
                  onerror="this.onerror=null; this.src=getInlineSvgFallbackDataUri('${postIdx + 1}.1');"
                  class="moment-single-img w-auto max-w-full rounded-xl object-contain border border-white/12 bg-[#14161a] cursor-zoom-in transition shadow-md"
                />
              </div>
            `;
          } else if (images.length === 2 || images.length === 4) {
            photosGrid = `
              <div data-lightbox-gallery="Daily Moments · ${escapeHtmlSafely(post.date)}" class="grid grid-cols-2 gap-2 pt-1 max-w-lg">
                ${images.map((imgSrc, imgIdx) => `
                  <img
                    src="${escapeHtmlSafely(imgSrc)}"
                    data-lightbox-src="${escapeHtmlSafely(imgSrc)}"
                    alt="Moment photo ${postIdx + 1}-${imgIdx + 1}"
                    loading="lazy"
                    decoding="async"
                    onclick="openImageLightboxFromEl(this)"
                    onerror="this.onerror=null; this.src=getInlineSvgFallbackDataUri('${postIdx + 1}.${imgIdx + 1}');"
                    class="moment-collage-tile rounded-xl border border-white/10 bg-[#1a1c20] cursor-zoom-in transition"
                  />
                `).join('')}
              </div>
            `;
          } else if (images.length === 3) {
            photosGrid = `
              <div data-lightbox-gallery="Daily Moments · ${escapeHtmlSafely(post.date)}" class="moment-collage-3 pt-1 max-w-lg">
                ${images.map((imgSrc, imgIdx) => `
                  <img
                    src="${escapeHtmlSafely(imgSrc)}"
                    data-lightbox-src="${escapeHtmlSafely(imgSrc)}"
                    alt="Moment photo ${postIdx + 1}-${imgIdx + 1}"
                    loading="lazy"
                    decoding="async"
                    onclick="openImageLightboxFromEl(this)"
                    onerror="this.onerror=null; this.src=getInlineSvgFallbackDataUri('${postIdx + 1}.${imgIdx + 1}');"
                    class="rounded-xl border border-white/10 bg-[#1a1c20] cursor-zoom-in hover:opacity-90 transition"
                  />
                `).join('')}
              </div>
            `;
          } else if (images.length > 4) {
            photosGrid = `
              <div data-lightbox-gallery="Daily Moments · ${escapeHtmlSafely(post.date)}" class="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 max-w-lg">
                ${images.map((imgSrc, imgIdx) => `
                  <img
                    src="${escapeHtmlSafely(imgSrc)}"
                    data-lightbox-src="${escapeHtmlSafely(imgSrc)}"
                    alt="Moment photo ${postIdx + 1}-${imgIdx + 1}"
                    loading="lazy"
                    decoding="async"
                    onclick="openImageLightboxFromEl(this)"
                    onerror="this.onerror=null; this.src=getInlineSvgFallbackDataUri('${postIdx + 1}.${imgIdx + 1}');"
                    class="w-full aspect-square rounded-lg object-cover border border-white/10 bg-[#1a1c20] cursor-zoom-in hover:opacity-90 transition"
                  />
                `).join('')}
              </div>
            `;
          }

          mediaBlock = `${videoHtml}${photosGrid}`;
        }

        const linkedNoteBlock = (!isEditingThis && post.linkedNoteId)
          ? buildMomentLinkedNoteCardHtml(post.linkedNoteId, momentKey)
          : '';

        // Inline Edit Form (only when editing this post)
        let inlineEditHtml = '';
        if (isEditingThis) {
          const editPicker = buildMomentNotePickerUi('edit', editMomentLinkedNoteId, editMomentNotePickerOpen, editMomentNoteSearch);
          const existingKeepHtml = editMomentKeepMedia.length > 0
            ? `
              <div class="space-y-1.5">
                <span class="font-mono-code text-[10px] text-white/45 uppercase">Existing Media (click ✕ to remove)</span>
                <div class="flex flex-wrap gap-2">
                  ${editMomentKeepMedia.map((mUrl, mIdx) => `
                    <div class="relative">
                      ${isVideoMediaUrl(mUrl)
                        ? `<video src="${escapeHtmlSafely(mUrl)}" class="w-16 h-16 rounded-lg object-cover border border-white/15 bg-black"></video>`
                        : `<img src="${escapeHtmlSafely(mUrl)}" alt="Attached" class="w-16 h-16 rounded-lg object-cover border border-white/15" />`
                      }
                      <button
                        type="button"
                        onclick="removeExistingMediaFromEdit(${mIdx})"
                        class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/90 border border-white/25 text-[10px] text-white flex items-center justify-center cursor-pointer hover:text-rose-300"
                      >✕</button>
                    </div>
                  `).join('')}
                </div>
              </div>
            `
            : '';

          inlineEditHtml = `
            <div class="rounded-xl border border-[#e4d4a7]/35 bg-black/35 p-3.5 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono-code text-[10px] tracking-widest uppercase text-[#e4d4a7]">EDITING MOMENT</span>
                <button
                  type="button"
                  onclick="cancelEditMoment()"
                  class="font-mono-code text-[10px] text-white/45 hover:text-white cursor-pointer"
                >Cancel</button>
              </div>
              <textarea
                id="edit-moment-text-${escapeHtmlSafely(post.dbId)}"
                rows="4"
                oninput="syncEditMomentDraftInputs()"
                class="w-full rounded-xl bg-black/55 border border-white/15 p-3 text-sm text-[#f3f1ec] focus:outline-none focus:border-[#e4d4a7]"
              >${escapeHtmlSafely(editMomentDraftText)}</textarea>

              ${existingKeepHtml}
              <div id="edit-moment-new-preview-${escapeHtmlSafely(post.dbId)}" class="hidden flex-wrap gap-2"></div>

              ${editPicker.chipHtml ? `<div class="flex flex-wrap items-center gap-2">${editPicker.chipHtml}</div>` : ''}
              ${editPicker.drawerHtml}

              <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div class="flex flex-wrap items-center gap-2">
                  <label class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-mono-code text-white/80 cursor-pointer transition">
                    <span>+ ADD MEDIA</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      onchange="handleEditMomentFileSelection(event)"
                      class="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onclick="toggleMomentNotePicker('edit')"
                    class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono-code transition cursor-pointer ${
                      editMomentNotePickerOpen || editMomentLinkedNoteId
                        ? 'border-[#e4d4a7]/55 bg-[#e4d4a7]/15 text-[#e4d4a7]'
                        : 'border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-white/80'
                    }"
                  >+ NOTE</button>
                  <input
                    id="edit-moment-tag-${escapeHtmlSafely(post.dbId)}"
                    type="text"
                    list="moment-tag-suggestions"
                    value="${escapeHtmlSafely(editMomentDraftTag)}"
                    oninput="syncEditMomentDraftInputs()"
                    placeholder="#Tag"
                    class="w-36 rounded-lg bg-black/45 border border-white/15 px-2.5 py-1 font-mono-code text-xs text-[#e2c458] focus:outline-none focus:border-[#e4d4a7]"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    onclick="cancelEditMoment()"
                    class="px-3 py-1.5 rounded-lg border border-white/15 font-mono-code text-[11px] text-white/65 hover:text-white cursor-pointer"
                  >Cancel</button>
                  <button
                    id="btn-save-edit-moment-${escapeHtmlSafely(post.dbId)}"
                    type="button"
                    onclick="saveEditedMoment('${escapeHtmlSafely(post.dbId)}')"
                    class="px-3.5 py-1.5 rounded-lg bg-[#e4d4a7] hover:bg-[#efe2be] text-[#0c0d0f] font-mono-code text-[11px] font-medium cursor-pointer"
                  >Save ↵</button>
                </div>
              </div>
              ${buildMomentTagQuickPickHtml(`edit-moment-tag-${post.dbId}`, editMomentDraftTag, tagStats, 'edit')}

              ${editMomentNewFiles.length > 0 ? `
                <div class="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-code">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-white/45">NEW MEDIA TO:</span>
                    <button
                      type="button"
                      onclick="setMomentStorageTarget('r2', 'edit')"
                      class="px-2 py-0.5 rounded border cursor-pointer ${editMomentStorage === 'r2' ? 'border-[#e4d4a7]/60 bg-[#e4d4a7]/15 text-[#e4d4a7]' : 'border-white/12 text-white/55'}"
                    >R2</button>
                    <button
                      type="button"
                      onclick="setMomentStorageTarget('github', 'edit')"
                      class="px-2 py-0.5 rounded border cursor-pointer ${editMomentStorage === 'github' ? 'border-[#7cc4fa]/60 bg-[#569cd6]/18 text-[#7cc4fa]' : 'border-white/12 text-white/55'}"
                    >GitHub</button>
                    ${editMomentStorage === 'github' ? `
                      <select
                        onchange="setMomentGhFolder(this.value, 'edit')"
                        class="rounded bg-black/50 border border-white/15 px-1.5 py-0.5 text-[10px] text-[#f3f1ec]"
                      >
                        ${momentGhFolders.map(f => `<option value="${escapeHtmlSafely(f)}" ${f === editMomentGhFolder ? 'selected' : ''}>📁 ${escapeHtmlSafely(f)}</option>`).join('')}
                      </select>
                    ` : ''}
                  </div>
                  ${isDesktopDeviceForVideoCompress() ? `
                    <label class="inline-flex items-center gap-1 cursor-pointer text-white/65">
                      <input type="checkbox" ${editMomentVideoCompress ? 'checked' : ''} onchange="toggleMomentVideoCompress(this.checked, 'edit')" class="accent-[#e4d4a7]" />
                      <span>压缩视频</span>
                    </label>
                  ` : ''}
                </div>
              ` : ''}

              <p id="edit-moment-status-${escapeHtmlSafely(post.dbId)}" class="font-mono-code text-[11px] text-amber-300 hidden"></p>
            </div>
          `;
        }

        const commentTriggerHtml = isCommentsFull
          ? `<span class="font-mono-code text-xs text-white/35">
               💬 Comments (8/8)
             </span>`
          : `<button
               type="button"
               onclick="toggleCommentDrawer('${momentKey}')"
               class="font-mono-code text-xs text-white/50 hover:text-[#e4d4a7] transition cursor-pointer"
             >
               💬 Comment (${approvedComments.length}/8)
             </button>`;

        const shareBtnHtml = post.dbId
          ? `<button
               type="button"
               onclick="shareMomentPost('${escapeHtmlSafely(post.dbId)}', this)"
               class="font-mono-code text-xs text-white/50 hover:text-[#e4d4a7] transition cursor-pointer"
               title="Copy direct link to this moment"
             >↗ Share</button>`
          : '';

        const authorMenuHtml = (isAuthorAuthenticated && post.dbId)
          ? `<div class="js-moment-menu-wrap relative shrink-0">
               <button
                 type="button"
                 onclick="toggleMomentCardMenu('${escapeHtmlSafely(post.dbId)}', event)"
                 aria-label="Moment actions"
                 title="Pin, Edit, or Delete"
                 class="w-7 h-7 rounded-full border border-white/10 hover:border-[#0a84ff]/55 bg-white/[0.03] text-white/55 hover:text-[#0a84ff] font-mono-code text-xs flex items-center justify-center transition cursor-pointer"
               >···</button>
               <div
                 id="moment-card-menu-${escapeHtmlSafely(post.dbId)}"
                 class="js-moment-card-menu moment-card-menu ios-glass hidden absolute right-0 top-8 z-20 rounded-xl border border-white/15 p-1.5 shadow-2xl space-y-0.5"
               >
                 <button
                   type="button"
                   onclick="togglePinMoment('${escapeHtmlSafely(post.dbId)}', this)"
                   class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/[0.07] font-mono-code text-[11px] text-[#0a84ff] transition cursor-pointer"
                 >${post.isPinned ? '📌 Unpin' : '📌 Pin to Top'}</button>
                 <button
                   type="button"
                   onclick="startEditMoment('${escapeHtmlSafely(post.dbId)}')"
                   class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/[0.07] font-mono-code text-[11px] text-white/85 transition cursor-pointer"
                 >✎ Edit Moment</button>
                 <button
                   type="button"
                   data-confirm="false"
                   onclick="deleteLiveMoment('${escapeHtmlSafely(post.dbId)}', this)"
                   class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 font-mono-code text-[11px] text-rose-300 transition cursor-pointer"
                 >✕ Delete</button>
               </div>
             </div>`
          : '';

        const approvedListHtml = approvedComments.map((c) => {
          const safeName = escapeHtmlSafely(c.author_name || 'Guest');
          const safeBody = escapeHtmlSafely(c.content || '');
          const authorDeleteAction = isAuthorAuthenticated
            ? `<button
                 type="button"
                 onclick="deleteMomentComment('${c.id}')"
                 title="Remove comment"
                 class="font-mono-code text-[10px] text-white/30 hover:text-rose-400 transition cursor-pointer ml-2 shrink-0"
               >✕</button>`
            : '';

          return `
            <div class="py-2 flex items-start justify-between gap-2 text-xs leading-relaxed">
              <div class="break-words min-w-0">
                <span class="font-medium text-[#0a84ff]">${safeName}:</span>
                <span class="text-white/80 ml-1">${safeBody}</span>
              </div>
              ${authorDeleteAction}
            </div>
          `;
        }).join('');

        const pendingListHtml = pendingComments.map((c) => {
          const safeName = escapeHtmlSafely(c.author_name || 'Guest');
          const safeBody = escapeHtmlSafely(c.content || '');
          return `
            <div class="py-2.5 px-3 my-1.5 rounded-lg border border-amber-400/35 bg-amber-400/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div class="break-words min-w-0 flex-1">
                <span class="inline-block px-1.5 py-0.5 mr-1.5 rounded bg-amber-400/20 font-mono-code text-[9px] uppercase tracking-wider text-amber-300">
                  Pending
                </span>
                <span class="font-medium text-[#e4d4a7]">${safeName}:</span>
                <span class="text-white/85 ml-1">${safeBody}</span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onclick="approvePendingComment('${c.id}', '${momentKey}')"
                  class="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 font-mono-code text-[10px] text-emerald-300 transition cursor-pointer"
                >✓ Approve</button>
                <button
                  type="button"
                  onclick="deleteMomentComment('${c.id}')"
                  class="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 font-mono-code text-[10px] text-rose-300 transition cursor-pointer"
                >✕ Filter</button>
              </div>
            </div>
          `;
        }).join('');

        const hasVisibleComments = approvedComments.length > 0 || pendingComments.length > 0;
        const commentsBoxHtml = hasVisibleComments
          ? `<div class="mt-2.5 rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-1 divide-y divide-white/5 max-w-lg">
               ${pendingListHtml}
               ${approvedListHtml}
             </div>`
          : '';

        const commentDrawerHtml = !isCommentsFull
          ? `<form
               id="comment-drawer-${momentKey}"
               onsubmit="event.preventDefault(); submitVisitorComment('${momentKey}');"
               class="hidden mt-2.5 rounded-xl border border-white/12 bg-[#18191d] p-3 sm:p-3.5 space-y-2.5 max-w-lg w-full overflow-hidden"
             >
               <div class="flex items-center justify-between gap-2 min-w-0">
                 <input
                   id="comment-name-${momentKey}"
                   type="text"
                   maxlength="24"
                   placeholder="Your name (optional)"
                   class="flex-1 min-w-0 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 text-base sm:text-xs text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#0a84ff]"
                 />
                 <span class="font-mono-code text-[10px] text-white/40 shrink-0">${approvedComments.length}/8</span>
               </div>
               <div class="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                 <input
                   id="comment-input-${momentKey}"
                   type="text"
                   maxlength="240"
                   placeholder="Leave a comment (shown after approval)..."
                   class="flex-1 min-w-0 w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-base sm:text-xs text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#0a84ff]"
                 />
                 <button
                   id="btn-submit-comment-${momentKey}"
                   type="submit"
                   class="ios-accent-pill-btn w-full sm:w-auto px-4 py-2 rounded-lg font-mono-code text-xs sm:text-[11px] transition cursor-pointer shrink-0 touch-manipulation"
                 >SEND ↵</button>
               </div>
               <p id="comment-status-${momentKey}" class="font-mono-code text-[11px] hidden"></p>
             </form>`
          : '';

        const postTags = extractMomentTags(post);
        const postTagsHtml = postTags.map((t) => {
          const displayTag = canonicalTagMap.get(t.toLowerCase()) || t;
          return `
            <button
              type="button"
              onclick="setMomentTagFilter('${escapeHtmlSafely(displayTag)}')"
              class="font-mono-code text-[11px] text-white/38 hover:text-[#0a84ff] transition cursor-pointer"
            >${escapeHtmlSafely(displayTag)}</button>
          `;
        }).join('');

        return `
          <article
            data-moment-id="${escapeHtmlSafely(post.dbId || momentKey)}"
            class="moment-editorial-card ${post.isPinned ? 'is-pinned-card' : ''} space-y-3"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="moment-date-stamp">
                  <span class="moment-date-dot" aria-hidden="true"></span>
                  <span>${post.date}</span>
                </span>
                ${post.isPinned ? `<span class="px-2 py-0.5 rounded-full bg-[#0a84ff]/15 border border-[#0a84ff]/40 font-mono-code text-[9px] tracking-wider uppercase text-[#0a84ff]">📌 Pinned</span>` : ''}
              </div>
              ${authorMenuHtml}
            </div>

            ${isEditingThis
              ? inlineEditHtml
              : `
                ${post.rawContent ? `<div class="moment-body-text text-white/85 whitespace-pre-line break-words">${renderMomentRichText(post.rawContent)}</div>` : ''}
                ${mediaBlock}
                ${linkedNoteBlock}
              `
            }

            <div class="moment-action-bar pt-2 border-t border-white/8">
              ${(() => {
                const likeCount = Math.min(8, Math.max(0, Number(post.likes) || 0));
                const likedHere = post.dbId && hasLikedMomentLocally(post.dbId);
                const isCapped = likeCount >= 8;
                const label = isCapped
                  ? `♥ Liked (${likeCount}/8 · Max)`
                  : (likedHere ? `♥ Liked (${likeCount}/8)` : `♡ Like (${likeCount}/8)`);
                return `<button
                  type="button"
                  data-liked="${likedHere ? 'true' : 'false'}"
                  data-likes="${likeCount}"
                  onclick="toggleMomentLike(this, '${post.dbId || ''}')"
                  class="font-mono-code text-xs ${(likedHere || isCapped) ? 'text-[#e2c458]' : 'text-white/50 hover:text-[#e2c458]'} transition cursor-pointer"
                >${label}</button>`;
              })()}
              <div class="moment-tags-row">${postTagsHtml}</div>
              ${commentTriggerHtml}
              ${shareBtnHtml}
            </div>
            ${commentsBoxHtml}
            ${commentDrawerHtml}
          </article>
        `;
      }).join('')
    : `
      <div class="py-10 text-center font-mono-code text-xs text-white/40">
        ${activeMomentPendingOnly
          ? 'No pending comments right now.'
          : (activeMomentTagFilter !== 'ALL'
            ? `No moments tagged ${escapeHtmlSafely(activeMomentTagFilter)} yet.`
            : (hasFetchedLiveMoments ? 'No moments posted yet.' : 'Loading moments...'))}
      </div>
    `;

  const loadMoreHtml = hasMorePosts
    ? `
      <div class="pt-2 text-center">
        <button
          type="button"
          onclick="loadMoreMoments()"
          class="px-5 py-2 rounded-full border border-[#e4d4a7]/35 bg-[#e4d4a7]/10 hover:bg-[#e4d4a7]/20 font-mono-code text-xs text-[#e4d4a7] transition cursor-pointer"
        >
          Load More (${remainingCount} older) ↓
        </button>
      </div>
    `
    : '';

  return `
    <div class="space-y-5">
      ${momentTagDatalistHtml}
      <p class="text-sm text-white/65">
        Short reflections, overheard idioms, and quiet snapshots from everyday life—written in English.
      </p>
      ${authorComposerHtml}
      ${tagBarHtml}
      <div class="moment-timeline-list">
        ${postsHtml}
      </div>
      ${loadMoreHtml}
    </div>
  `;
}

async function toggleMomentLike(btn, momentId) {
  if (!btn || !momentId) return;
  const currentLikes = Math.min(8, Math.max(0, parseInt(btn.dataset.likes || '0', 10) || 0));
  if (currentLikes >= 8 || btn.dataset.liked === 'true' || hasLikedMomentLocally(momentId) || btn.dataset.busy === '1') {
    return;
  }

  btn.dataset.busy = '1';
  const prevText = btn.textContent;
  btn.textContent = `♥ Sending...`;

  try {
    const res = await incrementMomentLikeOnServer(momentId);
    const nextCount = Math.min(8, Math.max(currentLikes, Number(res.likesCount ?? currentLikes + 1)));
    markMomentLikedLocal(momentId);
    btn.dataset.liked = 'true';
    btn.dataset.likes = String(nextCount);
    btn.classList.remove('text-white/50');
    btn.classList.add('text-[#e2c458]');
    btn.textContent = nextCount >= 8 ? `♥ Liked (${nextCount}/8 · Max)` : `♥ Liked (${nextCount}/8)`;

    const targetPost = liveMomentsPosts.find(p => String(p.dbId) === String(momentId));
    if (targetPost) targetPost.likes = nextCount;
  } catch (err) {
    console.warn('Moment like skipped:', err);
    btn.textContent = prevText;
  } finally {
    delete btn.dataset.busy;
  }
}

function formatMomentTimestamp(isoString) {
  if (!isoString) return 'JUST NOW';
  const dateObj = new Date(isoString);
  if (Number.isNaN(dateObj.getTime())) return 'RECENT';
  const month = dateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const mins = String(dateObj.getMinutes()).padStart(2, '0');
  return `${month} ${day} · ${hours}:${mins}`;
}

function mapMomentRows(rows) {
  return rows.map((row) => ({
    dbId: row.id,
    createdAtTs: row.created_at ? new Date(row.created_at).getTime() : 0,
    date: formatMomentTimestamp(row.created_at),
    rawContent: String(row.content || ''),
    text: escapeHtmlSafely(row.content),
    images: Array.isArray(row.media_urls)
      ? row.media_urls.map(optimizeMediaUrl).map(u => sanitizeSafeMediaUrl(u)).filter(Boolean)
      : [],
    mediaType: row.media_type || 'image',
    rawTag: String(row.location || '#StudyEnglishWithMe'),
    tag: escapeHtmlSafely(row.location || '#StudyEnglishWithMe'),
    likes: Math.min(8, Math.max(0, Number(row.likes_count) || 0)),
    isPinned: Boolean(row.is_pinned),
    pinnedAt: row.pinned_at || null,
    pinnedAtTs: row.pinned_at ? new Date(row.pinned_at).getTime() : 0,
    linkedNoteId: row.linked_note_id ? String(row.linked_note_id).trim() : ''
  }));
}

function hydrateLocalCaches() {
  try {
    const cachedMoments = localStorage.getItem(MOMENTS_CACHE_KEY);
    if (cachedMoments) {
      const parsed = JSON.parse(cachedMoments);
      if (Array.isArray(parsed) && parsed.length > 0) {
        liveMomentsPosts = mapMomentRows(parsed);
      }
    }
    const cachedComments = localStorage.getItem(COMMENTS_CACHE_KEY);
    if (cachedComments) {
      const parsedComments = JSON.parse(cachedComments);
      if (parsedComments && typeof parsedComments === 'object') {
        momentCommentsMap = parsedComments;
      }
    }
  } catch (_err) {
    // Ignore storage errors in private browsing mode
  }
}

async function fetchLiveMoments() {
  try {
    const data = await fetchSupabaseRestFast('moments?select=*&order=created_at.desc');

    if (Array.isArray(data)) {
      liveMomentsPosts = mapMomentRows(data);
      try {
        // Cache pinned posts + newest posts so repeat visits paint pinned posts immediately
        const pinnedRows = data.filter(r => Boolean(r.is_pinned));
        const unpinnedRows = data.filter(r => !r.is_pinned).slice(0, 30);
        localStorage.setItem(MOMENTS_CACHE_KEY, JSON.stringify([...pinnedRows, ...unpinnedRows]));
      } catch (_e) {}
    }
  } catch (err) {
    console.warn('Live moments sync skipped:', err);
  } finally {
    hasFetchedLiveMoments = true;
    if (currentView === 'chapter' && activeBookId === 'moment') {
      if (pendingDeepLinkMomentId) {
        focusMomentCardById(pendingDeepLinkMomentId);
      } else {
        refreshMomentsViewSafely();
      }
      if (typeof syncFolioDockRail === 'function') syncFolioDockRail();
    } else if (currentView === 'chapter' && activeBookId === 'profile') {
      renderChapterContent('profile');
      setTimeout(() => syncButterflyToCloseButton(false), 60);
    }
  }
}

/* ========================================================================
   COMPOSER MEDIA PREVIEW & PUBLISH
   ======================================================================== */
function handleMomentFileSelection(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  selectedMomentFiles = selectedMomentFiles.concat(files).slice(0, 9);
  renderSelectedComposerMedia();
  event.target.value = '';
}

function removeSelectedComposerFile(index) {
  selectedMomentFiles.splice(index, 1);
  renderSelectedComposerMedia();
}

function revokeComposerPreviewUrls() {
  if (!composerPreviewUrls.length) return;
  composerPreviewUrls.forEach(u => {
    try { URL.revokeObjectURL(u); } catch (_e) {}
  });
  composerPreviewUrls = [];
}

function renderSelectedComposerMedia() {
  const previewEl = document.getElementById('composer-media-preview');
  revokeComposerPreviewUrls();
  if (!previewEl) return;

  if (selectedMomentFiles.length === 0) {
    previewEl.innerHTML = '';
    previewEl.classList.add('hidden');
    previewEl.classList.remove('flex');
    return;
  }

  previewEl.classList.remove('hidden');
  previewEl.classList.add('flex');
  previewEl.innerHTML = selectedMomentFiles.map((file, idx) => {
    const objUrl = URL.createObjectURL(file);
    composerPreviewUrls.push(objUrl);
    const isVid = file.type.startsWith('video/');
    const mediaTag = isVid
      ? `<video src="${objUrl}" class="w-16 h-16 rounded-lg object-cover border border-white/15 bg-black"></video>`
      : `<img src="${objUrl}" alt="Preview" class="w-16 h-16 rounded-lg object-cover border border-white/15" />`;

    return `
      <div class="relative group">
        ${mediaTag}
        <button
          type="button"
          onclick="removeSelectedComposerFile(${idx})"
          class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/85 border border-white/25 text-[10px] text-white flex items-center justify-center cursor-pointer"
        >✕</button>
      </div>
    `;
  }).join('');
}

async function publishNewMoment() {
  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated) return;

  const textEl = document.getElementById('new-moment-text');
  const tagEl = document.getElementById('new-moment-tag');
  const statusEl = document.getElementById('composer-status');
  const publishBtn = document.getElementById('btn-publish-moment');

  const content = textEl ? textEl.value.trim() : '';
  const tag = resolveCanonicalMomentTagsInput(tagEl ? tagEl.value : '');

  if (!content && selectedMomentFiles.length === 0 && !composerLinkedNoteId) {
    if (statusEl) {
      statusEl.textContent = 'Write a short thought, attach media, or link a note first.';
      statusEl.classList.remove('hidden');
    }
    return;
  }

  publishBtn.disabled = true;
  publishBtn.textContent = 'UPLOADING...';
  if (statusEl) {
    statusEl.textContent = selectedMomentFiles.length > 0
      ? (selectedMomentStorage === 'github'
        ? `Compressing & uploading media to GitHub (${selectedMomentGhFolder})...`
        : 'Compressing & uploading media to Cloudflare R2...')
      : 'Publishing moment...';
    statusEl.className = 'font-mono-code text-[11px] text-[#e4d4a7]';
    statusEl.classList.remove('hidden');
  }

  try {
    const { uploadedUrls, detectedMediaType } = await uploadMomentMediaFiles(
      selectedMomentFiles,
      selectedMomentStorage,
      selectedMomentGhFolder,
      compressMomentVideoDesktop,
      (msg) => {
        if (statusEl) statusEl.textContent = msg;
      }
    );

    const rowPayload = {
      content,
      media_urls: uploadedUrls,
      media_type: detectedMediaType,
      location: tag
    };
    if (composerLinkedNoteId) {
      rowPayload.linked_note_id = composerLinkedNoteId;
    }

    const { error: insertError } = await client.from('moments').insert([rowPayload]);
    if (insertError) throw insertError;

    selectedMomentFiles = [];
    composerLinkedNoteId = '';
    composerNotePickerOpen = false;
    composerNoteSearch = '';
    revokeComposerPreviewUrls();
    clearMomentComposerDraft();
    await fetchLiveMoments();
    renderChapterContent('moment');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Publish failed: ${formatSupabaseMomentMutationError(err)}`;
      statusEl.className = 'font-mono-code text-[11px] text-rose-400';
      statusEl.classList.remove('hidden');
    }
    publishBtn.disabled = false;
    publishBtn.textContent = 'POST MOMENT ↵';
  }
}

/* ========================================================================
   INLINE EDIT, UNLIMITED PIN & DELETE
   ======================================================================== */
function revokeEditMomentPreviewUrls() {
  if (!editMomentPreviewUrls.length) return;
  editMomentPreviewUrls.forEach(u => {
    try { URL.revokeObjectURL(u); } catch (_e) {}
  });
  editMomentPreviewUrls = [];
}

function startEditMoment(dbId) {
  if (!isAuthorAuthenticated || !dbId) return;
  const post = liveMomentsPosts.find(p => String(p.dbId) === String(dbId));
  if (!post) return;

  editingMomentId = String(post.dbId);
  editMomentDraftText = post.rawContent || '';
  editMomentDraftTag = post.rawTag || '#StudyEnglishWithMe';
  editMomentKeepMedia = Array.isArray(post.images) ? [...post.images] : [];
  editMomentRemovedMedia = [];
  editMomentNewFiles = [];
  editMomentLinkedNoteId = post.linkedNoteId || '';
  editMomentNotePickerOpen = false;
  editMomentNoteSearch = '';
  editMomentStorage = selectedMomentStorage;
  editMomentGhFolder = selectedMomentGhFolder;
  editMomentVideoCompress = compressMomentVideoDesktop;
  revokeEditMomentPreviewUrls();

  renderChapterContent('moment');
  setTimeout(() => {
    const ta = document.getElementById(`edit-moment-text-${editingMomentId}`);
    if (ta) ta.focus();
    syncButterflyToCloseButton(false);
  }, 60);
}

function cancelEditMoment() {
  editingMomentId = null;
  editMomentDraftText = '';
  editMomentDraftTag = '';
  editMomentKeepMedia = [];
  editMomentRemovedMedia = [];
  editMomentNewFiles = [];
  editMomentLinkedNoteId = '';
  editMomentNotePickerOpen = false;
  editMomentNoteSearch = '';
  revokeEditMomentPreviewUrls();
  renderChapterContent('moment');
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

function removeExistingMediaFromEdit(idx) {
  syncEditMomentDraftInputs();
  const removed = editMomentKeepMedia.splice(idx, 1);
  if (removed[0]) {
    editMomentRemovedMedia.push(removed[0]);
  }
  renderChapterContent('moment');
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

function handleEditMomentFileSelection(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  syncEditMomentDraftInputs();
  const remainSlots = Math.max(0, 9 - editMomentKeepMedia.length - editMomentNewFiles.length);
  if (remainSlots > 0) {
    editMomentNewFiles = editMomentNewFiles.concat(files.slice(0, remainSlots));
  }
  event.target.value = '';
  renderChapterContent('moment');
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

function removeNewEditMediaFile(idx) {
  syncEditMomentDraftInputs();
  editMomentNewFiles.splice(idx, 1);
  if (editMomentNewFiles.length === 0) {
    renderChapterContent('moment');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  } else {
    renderSelectedEditMedia();
  }
}

function renderSelectedEditMedia() {
  if (!editingMomentId) return;
  const previewEl = document.getElementById(`edit-moment-new-preview-${editingMomentId}`);
  revokeEditMomentPreviewUrls();
  if (!previewEl) return;

  if (editMomentNewFiles.length === 0) {
    previewEl.innerHTML = '';
    previewEl.classList.add('hidden');
    previewEl.classList.remove('flex');
    return;
  }

  previewEl.classList.remove('hidden');
  previewEl.classList.add('flex');
  previewEl.innerHTML = editMomentNewFiles.map((file, idx) => {
    const objUrl = URL.createObjectURL(file);
    editMomentPreviewUrls.push(objUrl);
    const isVid = file.type.startsWith('video/');
    const mediaTag = isVid
      ? `<video src="${objUrl}" class="w-16 h-16 rounded-lg object-cover border border-[#e4d4a7]/40 bg-black"></video>`
      : `<img src="${objUrl}" alt="New attachment" class="w-16 h-16 rounded-lg object-cover border border-[#e4d4a7]/40" />`;

    return `
      <div class="relative">
        ${mediaTag}
        <button
          type="button"
          onclick="removeNewEditMediaFile(${idx})"
          class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/90 border border-white/25 text-[10px] text-white flex items-center justify-center cursor-pointer"
        >✕</button>
      </div>
    `;
  }).join('');
}

async function saveEditedMoment(dbId) {
  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated || !dbId) return;

  const textEl = document.getElementById(`edit-moment-text-${dbId}`);
  const tagEl = document.getElementById(`edit-moment-tag-${dbId}`);
  const statusEl = document.getElementById(`edit-moment-status-${dbId}`);
  const saveBtn = document.getElementById(`btn-save-edit-moment-${dbId}`);

  const content = textEl ? textEl.value.trim() : '';
  const tag = resolveCanonicalMomentTagsInput(tagEl ? tagEl.value : '');

  if (!content && editMomentKeepMedia.length === 0 && editMomentNewFiles.length === 0 && !editMomentLinkedNoteId) {
    if (statusEl) {
      statusEl.textContent = 'Moment cannot be completely empty.';
      statusEl.classList.remove('hidden');
    }
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }
  if (statusEl) {
    statusEl.textContent = editMomentNewFiles.length > 0 ? 'Uploading new media...' : 'Saving changes...';
    statusEl.className = 'font-mono-code text-[11px] text-[#e4d4a7]';
    statusEl.classList.remove('hidden');
  }

  try {
    let newlyUploaded = [];
    if (editMomentNewFiles.length > 0) {
      const upRes = await uploadMomentMediaFiles(
        editMomentNewFiles,
        editMomentStorage,
        editMomentGhFolder,
        editMomentVideoCompress,
        (msg) => {
          if (statusEl) statusEl.textContent = msg;
        }
      );
      newlyUploaded = upRes.uploadedUrls;
    }

    const finalUrls = [...editMomentKeepMedia, ...newlyUploaded];
    const hasVideo = finalUrls.some(u => isVideoMediaUrl(u));
    const updatePayload = {
      content,
      location: tag,
      media_urls: finalUrls,
      media_type: hasVideo ? 'video' : 'image'
    };
    const origPost = liveMomentsPosts.find(p => String(p.dbId) === String(dbId));
    if (editMomentLinkedNoteId || (origPost && origPost.linkedNoteId)) {
      updatePayload.linked_note_id = editMomentLinkedNoteId || null;
    }

    const { error } = await client.from('moments').update(updatePayload).eq('id', dbId);
    if (error) throw error;

    const toDelete = [...editMomentRemovedMedia];
    editingMomentId = null;
    editMomentKeepMedia = [];
    editMomentRemovedMedia = [];
    editMomentNewFiles = [];
    editMomentLinkedNoteId = '';
    editMomentNotePickerOpen = false;
    revokeEditMomentPreviewUrls();

    cleanupMomentRemoteMedia(toDelete);
    await fetchLiveMoments();
    renderChapterContent('moment');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Save failed: ${formatSupabaseMomentMutationError(err)}`;
      statusEl.className = 'font-mono-code text-[11px] text-rose-400';
      statusEl.classList.remove('hidden');
    }
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save ↵';
    }
  }
}

async function togglePinMoment(dbId, btnEl) {
  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated || !dbId) return;
  const targetPost = liveMomentsPosts.find(p => String(p.dbId) === String(dbId));
  if (!targetPost) return;

  const nextPinned = !targetPost.isPinned;
  const nextPinnedAt = nextPinned ? new Date().toISOString() : null;
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = nextPinned ? 'Pinning...' : 'Unpinning...';
  }

  try {
    const { error } = await client
      .from('moments')
      .update({ is_pinned: nextPinned, pinned_at: nextPinnedAt })
      .eq('id', dbId);

    if (error) throw error;
    await fetchLiveMoments();
    renderChapterContent('moment');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  } catch (err) {
    const statusEl = document.getElementById('composer-status');
    if (statusEl) {
      statusEl.textContent = `Pin failed: ${formatSupabaseMomentMutationError(err)}`;
      statusEl.className = 'font-mono-code text-[11px] text-rose-400';
      statusEl.classList.remove('hidden');
    }
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = targetPost.isPinned ? 'Unpin' : 'Pin';
    }
  }
}

async function deleteLiveMoment(dbId, btnEl) {
  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated || !dbId) return;

  if (btnEl.dataset.confirm !== 'true') {
    btnEl.dataset.confirm = 'true';
    btnEl.textContent = 'Confirm delete?';
    btnEl.classList.add('text-rose-400');
    setTimeout(() => {
      if (btnEl && btnEl.dataset.confirm === 'true') {
        btnEl.dataset.confirm = 'false';
        btnEl.textContent = 'Delete';
        btnEl.classList.remove('text-rose-400');
      }
    }, 3000);
    return;
  }

  const targetPost = liveMomentsPosts.find(p => String(p.dbId) === String(dbId));
  const mediaUrlsToClean = targetPost && Array.isArray(targetPost.images) ? [...targetPost.images] : [];

  btnEl.textContent = 'Deleting...';
  const { error } = await client.from('moments').delete().eq('id', dbId);
  if (!error) {
    if (String(editingMomentId) === String(dbId)) {
      editingMomentId = null;
    }
    cleanupMomentRemoteMedia(mediaUrlsToClean);
    await fetchLiveMoments();
    renderChapterContent('moment');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  }
}

/* ========================================================================
   VISITOR COMMENTS (MAX 8 PER MOMENT) & AUTHOR MODERATION WORKFLOW
   ======================================================================== */
async function fetchMomentComments() {
  try {
    let accessToken = '';
    const client = ensureSupabaseClient();
    if (isAuthorAuthenticated && client) {
      const { data: sData } = await client.auth.getSession();
      accessToken = (sData && sData.session) ? sData.session.access_token : '';
    }

    const data = await fetchSupabaseRestFast('moment_comments?select=*&order=created_at.asc', accessToken);

    const grouped = {};
    if (Array.isArray(data)) {
      for (const row of data) {
        const key = String(row.moment_key || '');
        if (!key) continue;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
      }
    }
    momentCommentsMap = grouped;
    try {
      if (!isAuthorAuthenticated) {
        localStorage.setItem(COMMENTS_CACHE_KEY, JSON.stringify(grouped));
      }
    } catch (_e) {}

    refreshMomentsViewSafely();
  } catch (err) {
    console.warn('Moment comments sync skipped:', err);
  }
}

function toggleCommentDrawer(momentKey) {
  const drawer = document.getElementById(`comment-drawer-${momentKey}`);
  if (!drawer) return;
  drawer.classList.toggle('hidden');
  if (!drawer.classList.contains('hidden')) {
    const input = document.getElementById(`comment-input-${momentKey}`);
    if (input) input.focus();
  }
  setTimeout(() => syncButterflyToCloseButton(false), 60);
}

async function submitVisitorComment(momentKey) {
  const existingApproved = (momentCommentsMap[momentKey] || []).filter(c => c.status === 'approved');
  const statusEl = document.getElementById(`comment-status-${momentKey}`);
  const nameInput = document.getElementById(`comment-name-${momentKey}`);
  const textInput = document.getElementById(`comment-input-${momentKey}`);
  const submitBtn = document.getElementById(`btn-submit-comment-${momentKey}`);

  if (!textInput || !statusEl) return;

  if (existingApproved.length >= 8) {
    statusEl.textContent = 'This moment has reached the maximum of 8 comments.';
    statusEl.className = 'font-mono-code text-[11px] text-amber-300';
    statusEl.classList.remove('hidden');
    return;
  }

  const content = textInput.value.trim();
  const authorName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'Guest';

  if (!content) {
    statusEl.textContent = 'Please write a short comment first.';
    statusEl.className = 'font-mono-code text-[11px] text-amber-300';
    statusEl.classList.remove('hidden');
    return;
  }

  if (submitBtn) {
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'SENDING...';
  }
  statusEl.textContent = 'Sending comment...';
  statusEl.className = 'font-mono-code text-[11px] text-[#e4d4a7]';
  statusEl.classList.remove('hidden');

  try {
    let accessToken = '';
    const client = ensureSupabaseClient();
    if (isAuthorAuthenticated && client) {
      const { data: sData } = await client.auth.getSession().catch(() => ({ data: null }));
      accessToken = (sData && sData.session) ? sData.session.access_token : '';
    }

    await postSupabaseRestFast('moment_comments', [{
      moment_key: momentKey,
      author_name: authorName,
      content,
      status: 'pending'
    }], accessToken);

    textInput.value = '';
    statusEl.textContent = '✓ Submitted! Your comment will appear once Rudy approves it.';
    statusEl.className = 'font-mono-code text-[11px] text-emerald-400';
    statusEl.classList.remove('hidden');

    if (isAuthorAuthenticated) {
      await fetchMomentComments();
    }
  } catch (err) {
    statusEl.textContent = 'Could not submit comment (limit of 8 reached or network busy).';
    statusEl.className = 'font-mono-code text-[11px] text-rose-400';
    statusEl.classList.remove('hidden');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'SEND ↵';
    }
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  }
}

async function approvePendingComment(commentId, momentKey) {
  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated || !commentId) return;

  const approvedCount = (momentCommentsMap[momentKey] || []).filter(c => c.status === 'approved').length;
  if (approvedCount >= 8) {
    const statusEl = document.getElementById('composer-status');
    if (statusEl) {
      statusEl.textContent = 'Max 8 approved comments reached for this Moment. Remove one first to approve another.';
      statusEl.className = 'font-mono-code text-[11px] text-amber-300';
      statusEl.classList.remove('hidden');
    }
    return;
  }

  const { error } = await client
    .from('moment_comments')
    .update({ status: 'approved' })
    .eq('id', commentId);

  if (!error) {
    await fetchMomentComments();
  }
}

async function deleteMomentComment(commentId) {
  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated || !commentId) return;

  const { error } = await client
    .from('moment_comments')
    .delete()
    .eq('id', commentId);

  if (!error) {
    await fetchMomentComments();
  }
}
