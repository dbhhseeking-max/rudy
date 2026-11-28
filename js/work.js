/* ========================================================================
   WORK & STUDY — OBSIDIAN MARKDOWN WORKSPACE & BUTTERFLY GRAPH ENGINE
   ======================================================================== */
const WS_VAULT_STORAGE_KEY = 'rudy_obsidian_vault_v2';
const WS_UI_PREFS_KEY = 'rudy_obsidian_ui_v1';
const WS_THEME_STORAGE_KEY = 'rudy_ws_theme_v1';

function wsGetThemeMode() {
  try {
    const saved = localStorage.getItem(WS_THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'beige' || saved === 'dark') {
      return saved;
    }
  } catch (_e) {}
  return (typeof getSiteTheme === 'function' && getSiteTheme() === 'light') ? 'beige' : 'dark';
}

function wsSyncThemeOnShell() {
  const root = document.getElementById('ws-obsidian-root');
  if (root) {
    root.setAttribute('data-ws-theme', wsGetThemeMode());
  }
}

function wsSetThemeMode(mode) {
  const clean = (mode === 'light' || mode === 'beige' || mode === 'dark') ? mode : 'dark';
  try {
    localStorage.setItem(WS_THEME_STORAGE_KEY, clean);
  } catch (_e) {}
  wsRenderWorkspace();
}

let wsVault = null;
let wsHasFetchedCloudVault = false;
let wsLocalSaveTimer = null;
let wsCloudSyncTimer = null;
let wsVaultDirtyForCloud = false;
let wsPendingDeepLinkNoteId = null;
let wsCloudSyncState = ''; // '' | 'SAVING...' | 'SYNCED' | 'LOCAL ONLY'
let wsRenameTarget = null; // { type: 'note'|'folder', id }
let wsNewFolderDraft = false;
let wsContextTarget = null; // { type: 'note'|'folder', id }
let wsMoveNoteId = null;
let wsWikilinkState = { open: false, startIdx: -1, query: '', activeIndex: 0, candidates: [] };
let wsDragItem = null; // { type: 'note'|'folder', id }
let wsReorderMode = false;
let wsEmbedInsertType = null; // null | 'image' | 'video' | 'audio' | 'web'
let wsIsFullscreen = false;
let wsMobileSidebarInitialized = false;
let wsMediaStorageTarget = 'r2'; // 'r2' | 'github'
let wsMediaGhFolder = 'work-media';
let wsGhFolders = ['work-media', 'moments', 'work-vault'];
let wsHasLoadedGhFolders = false;

// Graph View & Butterfly Swarm State
let wsGraphOpen = false;
let wsGraphAnimFrame = null;
let wsSwarmAnimFrame = null;
let wsGraphNodes = [];
let wsGraphEdges = [];
let wsGraphCam = { x: 0, y: 0, scale: 1 };
let wsGraphHoverId = null;
let wsGraphSelectedId = null;
let wsGraphDragNode = null;
let wsGraphPanning = false;
let wsGraphPanStart = { x: 0, y: 0, camX: 0, camY: 0 };
let wsGraphLinkMode = false;
let wsGraphLinkSourceId = null;
let wsGraphMovedDuringDrag = false;
let wsGraphEventsBound = false;
let wsGlobalEventsBound = false;

function wsCreateDefaultVault() {
  const now = Date.now();
  const fRough = 'ws-f-rough';
  const fSource = 'ws-f-source';
  const fPerm = 'ws-f-perm';
  return {
    folders: [
      { id: fRough, name: '00_Rough Idea', collapsed: false },
      { id: fSource, name: '10_Source Note', collapsed: false },
      { id: fPerm, name: '20_Permanent Note', collapsed: false }
    ],
    notes: [
      {
        id: 'ws-n-welcome',
        title: 'Welcome to Notes',
        folderId: null,
        bookmarked: true,
        updatedAt: now,
        content: `# Welcome to Rudy's Markdown Vault\n\nThis is an **Obsidian-inspired** Markdown workspace for English learning, thinking models, and math notes.\n\n## Highlights\n- Type \`[[\` to link connected notes, such as [[English Learning Hub]] or [[Active Recall]].\n- Embed external **images**, **videos** (MP4, YouTube, Vimeo, Bilibili), **audio**, and **webpages** directly inside Markdown.\n- Click the **Graph** button in the left ribbon to watch every note turn into a golden butterfly and form the knowledge constellation.\n\n> [!tip] Quick Embed Syntax\n> - Image: \`![Caption](https://example.com/photo.jpg)\`\n> - Video: \`@[video](https://youtu.be/VIDEO_ID)\` or \`![Clip](https://example.com/clip.mp4)\`\n> - Audio: \`@[audio|Track Title](https://example.com/audio.mp3)\`\n> - Webpage: \`@[web|460](https://example.com)\`\n\n- [x] Organize notes with folders and bookmarks\n- [x] Connect ideas with [[Sentence Rhythm]]\n- [ ] Explore the Butterfly Graph View\n`
      },
      {
        id: 'ws-n-hub',
        title: 'English Learning Hub',
        folderId: fPerm,
        bookmarked: true,
        updatedAt: now - 60000,
        content: `# English Learning Hub\n\nFluency grows when expressions are connected into a living network rather than memorized as isolated word lists.\n\n## Core Pillars\n1. Use [[Sentence Rhythm]] to master natural chunks and cadence.\n2. Practice [[Active Recall]] instead of passive re-reading.\n3. Return to [[Welcome to Notes]] for workspace tips.\n\n#english #moc`
      },
      {
        id: 'ws-n-rhythm',
        title: 'Sentence Rhythm',
        folderId: fSource,
        bookmarked: false,
        updatedAt: now - 120000,
        content: `# Sentence Rhythm\n\n> "To cut a long story short, consistency beats intensity every single time."\n\n## Key Patterns\n- **Discourse markers**: \`To cut a long story short\`, \`That being said\`\n- **Parallel structure**: ==consistency beats intensity==\n\nRelated: [[English Learning Hub]] · [[Active Recall]]\n\n#chunking #speaking`
      },
      {
        id: 'ws-n-recall',
        title: 'Active Recall',
        folderId: fRough,
        bookmarked: false,
        updatedAt: now - 180000,
        content: `# Active Recall\n\nClose the book and explain the concept in your own words before checking the source.\n\n- Pair with [[English Learning Hub]]: write 3 original sentences using today's chunks.\n- Review patterns inside [[Sentence Rhythm]].\n\n#learning #memory`
      }
    ],
    openTabIds: ['ws-n-welcome'],
    activeNoteId: 'ws-n-welcome',
    mode: 'preview',
    sidebarTab: 'files',
    sidebarOpen: true,
    sortOrder: 'manual',
    searchQuery: ''
  };
}

function wsLoadUiPrefs() {
  try {
    const raw = localStorage.getItem(WS_UI_PREFS_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch (_e) {}
  return {};
}

function wsSaveUiPrefs() {
  if (!wsVault) return;
  try {
    localStorage.setItem(WS_UI_PREFS_KEY, JSON.stringify({
      sortPrefsVersion: 2,
      sidebarOpen: wsVault.sidebarOpen,
      sidebarTab: wsVault.sidebarTab,
      sortOrder: wsVault.sortOrder || 'manual',
      mode: isAuthorAuthenticated ? wsVault.mode : 'preview'
    }));
  } catch (_e) {}
}

function wsLoadVault() {
  if (wsVault) return wsVault;
  const prefs = wsLoadUiPrefs();
  const validSortOrders = ['manual', 'asc', 'desc', 'recent'];
  const preferredSort = (prefs && prefs.sortPrefsVersion === 2 && validSortOrders.includes(prefs.sortOrder))
    ? prefs.sortOrder
    : 'manual';
  try {
    const raw = localStorage.getItem(WS_VAULT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.notes) && Array.isArray(parsed.folders)) {
        wsVault = parsed;
        if (!Array.isArray(wsVault.openTabIds)) wsVault.openTabIds = [];
        wsVault.mode = isAuthorAuthenticated ? (prefs.mode || wsVault.mode || 'edit') : 'preview';
        wsVault.sidebarTab = prefs.sidebarTab || wsVault.sidebarTab || 'files';
        wsVault.sidebarOpen = typeof prefs.sidebarOpen === 'boolean' ? prefs.sidebarOpen : true;
        wsVault.sortOrder = validSortOrders.includes(wsVault.sortOrder) ? wsVault.sortOrder : preferredSort;
        if (prefs && prefs.sortPrefsVersion === 2 && validSortOrders.includes(prefs.sortOrder)) {
          wsVault.sortOrder = prefs.sortOrder;
        }
        if (typeof wsVault.searchQuery !== 'string') wsVault.searchQuery = '';
        return wsVault;
      }
    }
  } catch (_err) {}
  wsVault = wsCreateDefaultVault();
  wsVault.sidebarOpen = typeof prefs.sidebarOpen === 'boolean' ? prefs.sidebarOpen : true;
  wsVault.sortOrder = preferredSort;
  wsVault.mode = isAuthorAuthenticated ? (prefs.mode || 'edit') : 'preview';
  return wsVault;
}

function wsSaveLocalCacheOnly() {
  if (!wsVault) return;
  wsSaveUiPrefs();
  try {
    localStorage.setItem(WS_VAULT_STORAGE_KEY, JSON.stringify({
      folders: wsVault.folders,
      notes: wsVault.notes,
      openTabIds: wsVault.openTabIds,
      activeNoteId: wsVault.activeNoteId,
      sortOrder: wsVault.sortOrder || 'manual'
    }));
  } catch (_err) {}
}

/**
 * Persists content mutations. Strict guard: visitors can NEVER save or mutate vault content.
 * Logged-in Admin changes are cached locally and synced to Cloudflare R2 (/work-notes).
 */
function wsSaveVault(immediateCloudSync = false) {
  if (!wsVault || !isAuthorAuthenticated) return;
  wsVaultDirtyForCloud = true;
  wsCloudSyncState = 'SAVING...';
  wsUpdateCloudSyncBadge();

  if (wsLocalSaveTimer) {
    clearTimeout(wsLocalSaveTimer);
    wsLocalSaveTimer = null;
  }
  if (wsCloudSyncTimer) {
    clearTimeout(wsCloudSyncTimer);
    wsCloudSyncTimer = null;
  }

  if (immediateCloudSync) {
    wsSaveLocalCacheOnly();
    wsPushVaultToR2(false);
  } else {
    wsLocalSaveTimer = setTimeout(() => {
      wsLocalSaveTimer = null;
      wsSaveLocalCacheOnly();
    }, 300);
    wsCloudSyncTimer = setTimeout(() => {
      wsCloudSyncTimer = null;
      wsPushVaultToR2(false);
    }, 1500);
  }
}

function wsFlushPendingSaves(useKeepalive = false) {
  if (!wsVault || !isAuthorAuthenticated) return;
  if (wsLocalSaveTimer) {
    clearTimeout(wsLocalSaveTimer);
    wsLocalSaveTimer = null;
    wsSaveLocalCacheOnly();
  }
  if (wsCloudSyncTimer || wsVaultDirtyForCloud) {
    if (wsCloudSyncTimer) {
      clearTimeout(wsCloudSyncTimer);
      wsCloudSyncTimer = null;
    }
    wsPushVaultToR2(useKeepalive);
  }
}

function wsUpdateCloudSyncBadge() {
  const el = document.getElementById('ws-cloud-sync-badge');
  if (!el) return;
  el.textContent = wsCloudSyncState || 'R2 SYNCED';
}

function wsApplyPendingDeepLinkIfAny() {
  if (!wsPendingDeepLinkNoteId || !wsVault) return false;
  const target = wsVault.notes.find(n => n.id === wsPendingDeepLinkNoteId);
  if (!target) return false;
  wsVault.activeNoteId = target.id;
  if (!wsVault.openTabIds.includes(target.id)) {
    wsVault.openTabIds.push(target.id);
  }
  wsPendingDeepLinkNoteId = null;
  return true;
}

async function wsFetchVaultFromR2() {
  wsHasFetchedCloudVault = true;
  wsLoadVault();
  try {
    const res = await fetch(`${R2_UPLOAD_ENDPOINT}/work-notes`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (wsVaultDirtyForCloud) return;
    if (data && Array.isArray(data.notes) && Array.isArray(data.folders)) {
      // Only overwrite local default seed if R2 actually holds Rudy's saved vault
      if (data.notes.length > 0 || data.folders.length > 0) {
        wsVault.folders = data.folders.map(f => ({
          id: f.id,
          name: f.name || 'Untitled Folder',
          collapsed: Boolean(f.collapsed)
        }));
        wsVault.notes = data.notes.map(n => ({
          id: n.id,
          title: n.title || 'Untitled',
          folderId: n.folderId || null,
          bookmarked: Boolean(n.bookmarked),
          updatedAt: n.updatedAt || Date.now(),
          content: typeof n.content === 'string' ? n.content : ''
        }));
        if (typeof data.sortOrder === 'string' && ['manual', 'asc', 'desc', 'recent'].includes(data.sortOrder)) {
          wsVault.sortOrder = data.sortOrder;
        }
        wsApplyPendingDeepLinkIfAny();
        if (!wsVault.activeNoteId || !wsVault.notes.some(n => n.id === wsVault.activeNoteId)) {
          wsVault.activeNoteId = wsVault.notes[0] ? wsVault.notes[0].id : null;
        }
        wsVault.openTabIds = (wsVault.openTabIds || []).filter(id => wsVault.notes.some(n => n.id === id));
        if (wsVault.activeNoteId && !wsVault.openTabIds.includes(wsVault.activeNoteId)) {
          wsVault.openTabIds.push(wsVault.activeNoteId);
        }
        wsSaveLocalCacheOnly();
        if (currentView === 'chapter' && activeBookId === 'work') {
          wsRenderWorkspace();
          if (typeof syncRouteHash === 'function') syncRouteHash(false);
          if (typeof updateDocumentTitle === 'function') updateDocumentTitle();
        } else if (currentView === 'chapter' && activeBookId === 'moment' && typeof refreshMomentLinkedNoteSlots === 'function') {
          refreshMomentLinkedNoteSlots();
        }
      }
    }
  } catch (err) {
    console.warn('Cloud vault sync skipped:', err);
  }
}

async function wsPushVaultToR2(useKeepalive = false) {
  const client = ensureSupabaseClient();
  if (!client || !isAuthorAuthenticated || !wsVault) return;
  try {
    const { data: sData } = await client.auth.getSession();
    const token = sData && sData.session ? sData.session.access_token : '';
    const payload = {
      sortOrder: wsVault.sortOrder || 'manual',
      folders: wsVault.folders.map(f => ({ id: f.id, name: f.name, collapsed: Boolean(f.collapsed) })),
      notes: wsVault.notes.map(n => ({
        id: n.id,
        title: n.title,
        folderId: n.folderId || null,
        bookmarked: Boolean(n.bookmarked),
        updatedAt: n.updatedAt || Date.now(),
        content: n.content || ''
      }))
    };
    const bodyStr = JSON.stringify(payload);
    wsVaultDirtyForCloud = false;
    const res = await fetch(`${R2_UPLOAD_ENDPOINT}/work-notes`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: bodyStr,
      keepalive: Boolean(useKeepalive && bodyStr.length < 60000)
    });
    if (!res.ok) wsVaultDirtyForCloud = true;
    wsCloudSyncState = res.ok ? 'R2 SYNCED' : 'SYNC RETRY';
  } catch (_e) {
    wsVaultDirtyForCloud = true;
    wsCloudSyncState = 'LOCAL DRAFT';
  }
  wsUpdateCloudSyncBadge();
}

function wsGetActiveNote() {
  const vault = wsLoadVault();
  if (!vault.activeNoteId) return null;
  return vault.notes.find(n => n.id === vault.activeNoteId) || null;
}

function wsEscapeAttr(raw) {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wsDecodeHtmlEntities(htmlStr) {
  const s = String(htmlStr || '');
  if (s.indexOf('&') === -1) return s;
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  return ta.value;
}

function wsNormalizeTitleKey(str) {
  return String(str || '')
    .trim()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function wsFindNoteByTitle(title) {
  const vault = wsLoadVault();
  const rawTarget = String(title || '').trim().toLowerCase();
  if (!rawTarget) return null;
  const exact = vault.notes.find(n => (n.title || '').trim().toLowerCase() === rawTarget);
  if (exact) return exact;
  const normTarget = wsNormalizeTitleKey(title);
  return vault.notes.find(n => wsNormalizeTitleKey(n.title) === normTarget) || null;
}

function wsExtractWikilinkTitles(content) {
  const matches = [];
  const seen = new Set();
  // Ignore code fences and external URL embeds ![[https://...]] (no lookbehind for full Safari compatibility)
  const cleaned = (content || '').replace(/```[\s\S]*?```/g, '');
  const regex = /(!?)\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = regex.exec(cleaned)) !== null) {
    if (m[1] === '!') continue;
    const name = m[2].trim();
    const key = wsNormalizeTitleKey(name);
    if (name && !/^https?:\/\//i.test(name) && !seen.has(key)) {
      seen.add(key);
      matches.push(name);
    }
  }
  return matches;
}

function wsGetBacklinksForNote(note) {
  if (!note) return [];
  const vault = wsLoadVault();
  const target = wsNormalizeTitleKey(note.title);
  return vault.notes.filter(other => {
    if (other.id === note.id) return false;
    const links = wsExtractWikilinkTitles(other.content);
    return links.some(l => wsNormalizeTitleKey(l) === target);
  });
}

function wsGetUniqueNoteTitle(base = 'Untitled') {
  const vault = wsLoadVault();
  const existing = new Set(vault.notes.map(n => (n.title || '').trim().toLowerCase()));
  if (!existing.has(base.toLowerCase())) return base;
  let idx = 1;
  while (existing.has(`${base} ${idx}`.toLowerCase())) {
    idx += 1;
  }
  return `${base} ${idx}`;
}

function wsGetFolderName(folderId) {
  if (!folderId) return '';
  const vault = wsLoadVault();
  const f = vault.folders.find(x => x.id === folderId);
  return f ? f.name : '';
}

function wsSortNotes(notesList) {
  const vault = wsLoadVault();
  const list = [...notesList];
  if (vault.sortOrder === 'manual') {
    return list;
  }
  if (vault.sortOrder === 'desc') {
    list.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'en'));
  } else if (vault.sortOrder === 'recent') {
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } else {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'en'));
  }
  return list;
}

function wsSortFolders(foldersList) {
  const vault = wsLoadVault();
  const list = [...foldersList];
  if (vault.sortOrder === 'asc') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en'));
  } else if (vault.sortOrder === 'desc') {
    list.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'en'));
  }
  return list;
}

/**
 * Snapshots the currently displayed sort order into vault.folders / vault.notes
 * before applying a manual reorder so nothing unexpectedly jumps.
 */
function wsBakeCurrentSortIntoManualOrder(vault) {
  if (!vault || vault.sortOrder === 'manual') return;
  const orderedFolders = wsSortFolders(vault.folders);
  const folderIdSet = new Set(orderedFolders.map(f => f.id));
  const bakedNotes = [];
  orderedFolders.forEach(folder => {
    const fNotes = wsSortNotes(vault.notes.filter(n => n.folderId === folder.id));
    bakedNotes.push(...fNotes);
  });
  const rootNotes = wsSortNotes(vault.notes.filter(n => !n.folderId || !folderIdSet.has(n.folderId)));
  bakedNotes.push(...rootNotes);
  vault.folders = orderedFolders;
  vault.notes = bakedNotes;
  vault.sortOrder = 'manual';
  wsSaveUiPrefs();
}

/**
 * Builds the root HTML shell for the Work & Study Obsidian Workspace.
 */
function buildWorkStudyHtml() {
  wsLoadVault();
  return `<div id="ws-obsidian-root" class="ws-obsidian-shell"></div>`;
}

function initWorkStudyWorkspace() {
  wsLoadVault();
  wsApplyPendingDeepLinkIfAny();
  if (window.innerWidth < 768 && !wsMobileSidebarInitialized) {
    wsMobileSidebarInitialized = true;
    wsVault.sidebarOpen = false;
  }
  if (!wsHasFetchedCloudVault) {
    wsFetchVaultFromR2();
  }
  wsBindGlobalEventsOnce();
  wsRenderWorkspace({ resetContentScroll: true });
}

function wsBindGlobalEventsOnce() {
  if (wsGlobalEventsBound) return;
  wsGlobalEventsBound = true;

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('ws-context-menu');
    if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) {
      wsHideContextMenu();
    }
    const pop = document.getElementById('ws-wikilink-popup');
    const ta = document.getElementById('ws-editor-textarea');
    if (pop && !pop.classList.contains('hidden') && !pop.contains(e.target) && e.target !== ta) {
      wsCloseWikilinkPopup();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      wsHideContextMenu();
      wsCloseMoveModal();
      wsCloseWikilinkPopup();
      if (wsEmbedInsertType) {
        wsEmbedInsertType = null;
        wsRenderWorkspace();
      }
      if (wsGraphOpen) {
        wsCloseGraphView();
      } else if (wsIsFullscreen) {
        wsToggleFullscreen(false);
      }
    }
  });

  window.addEventListener('pagehide', () => wsFlushPendingSaves(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      wsFlushPendingSaves(true);
    }
  });
}

function wsRenderWorkspace(options = {}) {
  const root = document.getElementById('ws-obsidian-root');
  if (!root) return;
  const prevSidebarScroll = document.getElementById('ws-sidebar-scroll')?.scrollTop || 0;
  const prevPreviewScroll = options.resetContentScroll ? 0 : (document.getElementById('ws-preview-body')?.scrollTop || 0);
  const prevEditorScroll = options.resetContentScroll ? 0 : (document.getElementById('ws-editor-textarea')?.scrollTop || 0);

  root.classList.toggle('is-fullscreen', wsIsFullscreen);
  root.setAttribute('data-ws-theme', wsGetThemeMode());
  const vault = wsLoadVault();
  const canEdit = Boolean(isAuthorAuthenticated);

  // Force visitors strictly into Reading Mode & clear any admin-only drafts
  if (!canEdit) {
    wsRenameTarget = null;
    wsNewFolderDraft = false;
    wsEmbedInsertType = null;
    wsReorderMode = false;
    wsDragItem = null;
    wsHideContextMenu();
    wsCloseMoveModal();
  }

  const activeNote = wsGetActiveNote();

  // Ensure openTabIds only contains valid note IDs
  vault.openTabIds = vault.openTabIds.filter(id => vault.notes.some(n => n.id === id));
  if (activeNote && !vault.openTabIds.includes(activeNote.id)) {
    vault.openTabIds.push(activeNote.id);
  }

  const sidebarHtml = wsBuildSidebarHtml(vault, canEdit);
  const editorHtml = wsBuildEditorPaneHtml(vault, activeNote, canEdit);

  root.innerHTML = `
    <!-- Far-Left Obsidian Activity Ribbon -->
    <aside class="ws-ribbon" aria-label="Workspace Ribbon">
      <button
        id="ws-ribbon-sidebar-btn"
        type="button"
        onclick="wsToggleSidebar()"
        title="${vault.sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}"
        aria-label="${vault.sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}"
        class="ws-ribbon-btn ${vault.sidebarOpen ? 'is-active' : ''}"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
        </svg>
      </button>

      <button
        type="button"
        onclick="wsOpenGraphView()"
        title="Open Knowledge Graph"
        aria-label="Open Knowledge Graph"
        class="ws-ribbon-btn ws-graph-trigger"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="6" r="2.3"></circle>
          <circle cx="18" cy="7" r="2.3"></circle>
          <circle cx="12" cy="18" r="2.3"></circle>
          <line x1="8" y1="6.8" x2="15.7" y2="7"></line>
          <line x1="7.3" y1="8" x2="10.8" y2="15.9"></line>
          <line x1="16.6" y1="8.9" x2="13.2" y2="15.9"></line>
        </svg>
      </button>

      ${canEdit ? `
        <button
          type="button"
          onclick="wsCreateNote(null)"
          title="New Note"
          aria-label="New Note"
          class="ws-ribbon-btn"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
      ` : ''}


      <div class="mt-auto text-[9px] font-mono-code text-white/25 select-none" title="Total Notes">
        ${vault.notes.length}
      </div>
    </aside>

    <!-- Mobile Sidebar Click-Outside Backdrop -->
    <div
      id="ws-mobile-backdrop"
      onclick="wsToggleSidebar()"
      class="ws-mobile-backdrop ${vault.sidebarOpen ? 'is-open' : ''}"
    ></div>

    <!-- Left Sidebar (Smooth CSS Collapse Transition, Fixed-Width Inner Container) -->
    <aside id="ws-sidebar-pane" class="ws-sidebar ${vault.sidebarOpen ? '' : 'is-collapsed'}">
      <div class="ws-sidebar-inner">
        ${sidebarHtml}
      </div>
    </aside>

    <!-- Main Editor / Reading Pane -->
    <section class="ws-editor-main">
      ${editorHtml}
    </section>
  `;

  wsBindEditorDynamicEvents();
  if (canEdit && wsRenameTarget) {
    const inp = document.getElementById('ws-inline-rename-input');
    if (inp) {
      inp.focus();
      inp.select();
    }
  }
  if (canEdit && wsNewFolderDraft) {
    const finp = document.getElementById('ws-new-folder-input');
    if (finp) {
      finp.focus();
    }
  }
  if (canEdit && wsEmbedInsertType) {
    const uinp = document.getElementById('ws-embed-url-input');
    if (uinp) uinp.focus();
  }

  const nextSidebarScroll = document.getElementById('ws-sidebar-scroll');
  if (nextSidebarScroll) nextSidebarScroll.scrollTop = prevSidebarScroll;
  const nextPreviewBody = document.getElementById('ws-preview-body');
  if (nextPreviewBody) nextPreviewBody.scrollTop = prevPreviewScroll;
  const nextEditorTa = document.getElementById('ws-editor-textarea');
  if (nextEditorTa) nextEditorTa.scrollTop = prevEditorScroll;
}

function wsBuildSearchResultsHtml(vault) {
  const q = (vault.searchQuery || '').trim().toLowerCase();
  const matches = q
    ? vault.notes.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.content || '').toLowerCase().includes(q)
      )
    : wsSortNotes(vault.notes);

  return matches.length > 0
    ? matches.map(n => {
        const isAct = vault.activeNoteId === n.id;
        const snippet = (n.content || '').replace(/[#*`>\[\]@]/g, '').trim().slice(0, 58);
        return `
          <div
            data-ws-note-id="${n.id}"
            onclick="wsOpenNote('${n.id}')"
            class="ws-tree-item flex-col !items-start !gap-0.5 py-2 ${isAct ? 'is-active' : ''}"
          >
            <div class="w-full truncate text-[13px] font-medium">${escapeHtmlSafely(n.title)}</div>
            <div class="w-full truncate text-[11px] text-white/40">${escapeHtmlSafely(snippet || 'Empty note')}</div>
          </div>
        `;
      }).join('')
    : `<div class="px-3 py-8 text-center text-xs text-white/40">No matching notes found</div>`;
}

function wsBuildSidebarHtml(vault, canEdit) {
  const bookmarkedCount = vault.notes.filter(n => n.bookmarked).length;
  const tabsBar = `
    <div class="ws-sidebar-tabs">
      <button
        type="button"
        onclick="wsSwitchSidebarTab('files')"
        title="Files"
        class="ws-sidebar-tab ${vault.sidebarTab === 'files' ? 'is-active' : ''}"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>
      <button
        type="button"
        onclick="wsSwitchSidebarTab('search')"
        title="Search"
        class="ws-sidebar-tab ${vault.sidebarTab === 'search' ? 'is-active' : ''}"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </button>
      <button
        type="button"
        onclick="wsSwitchSidebarTab('bookmarks')"
        title="Bookmarks"
        class="ws-sidebar-tab ${vault.sidebarTab === 'bookmarks' ? 'is-active' : ''}"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        ${bookmarkedCount > 0 ? `<span class="font-mono-code text-[9px] opacity-80">${bookmarkedCount}</span>` : ''}
      </button>
    </div>
  `;

  if (vault.sidebarTab === 'bookmarks') {
    const starred = wsSortNotes(vault.notes.filter(n => n.bookmarked));
    const listHtml = starred.length > 0
      ? starred.map(n => {
          const isAct = vault.activeNoteId === n.id;
          const folderLabel = wsGetFolderName(n.folderId);
          return `
            <div
              data-ws-note-id="${n.id}"
              onclick="wsOpenNote('${n.id}')"
              ${canEdit ? `oncontextmenu="wsShowContextMenu(event, 'note', '${n.id}')"` : ''}
              class="ws-tree-item ${isAct ? 'is-active' : ''}"
            >
              <svg class="w-3.5 h-3.5 text-[#e4d4a7] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
              <div class="flex-1 min-w-0">
                <div class="truncate text-[13px]">${escapeHtmlSafely(n.title)}</div>
                ${folderLabel ? `<div class="truncate text-[10px] text-white/35 font-mono-code">${escapeHtmlSafely(folderLabel)}</div>` : ''}
              </div>
              ${canEdit ? `
                <button
                  type="button"
                  onclick="event.stopPropagation(); wsToggleBookmark('${n.id}')"
                  title="Remove Bookmark"
                  class="ws-item-menu-btn text-white/40 hover:text-rose-300 px-1 text-xs cursor-pointer"
                >✕</button>
              ` : ''}
            </div>
          `;
        }).join('')
      : `<div class="px-3 py-8 text-center text-xs text-white/40 leading-relaxed">
           No bookmarked notes yet.${canEdit ? '<br/>Click the bookmark icon on any note to pin it here.' : ''}
         </div>`;

    return `
      ${tabsBar}
      <div class="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between">
        <span class="font-mono-code text-[10px] tracking-[0.15em] uppercase text-[#e4d4a7]/80">BOOKMARKS</span>
      </div>
      <div id="ws-sidebar-scroll" class="flex-1 overflow-y-auto p-2 space-y-0.5">
        ${listHtml}
      </div>
    `;
  }

  if (vault.sidebarTab === 'search') {
    return `
      ${tabsBar}
      <div class="p-2.5 border-b border-white/[0.06]">
        <input
          id="ws-sidebar-search-input"
          type="text"
          value="${escapeHtmlSafely(vault.searchQuery || '')}"
          oninput="wsUpdateSearchQuery(this.value)"
          placeholder="Search titles or content..."
          class="w-full rounded-lg bg-black/40 border border-white/12 px-2.5 py-1.5 text-xs text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#e4d4a7]"
        />
      </div>
      <div id="ws-sidebar-scroll" class="flex-1 overflow-y-auto p-2 space-y-0.5">
        ${wsBuildSearchResultsHtml(vault)}
      </div>
    `;
  }

  // Default: Files Explorer Tab
  const allCollapsed = vault.folders.length > 0 && vault.folders.every(f => f.collapsed);
  const sortLabels = {
    manual: 'Manual (Custom)',
    asc: 'A to Z',
    desc: 'Z to A',
    recent: 'Recently Updated'
  };
  const sortLabel = sortLabels[vault.sortOrder] || 'Manual (Custom)';
  const toolbarHtml = `
    <div class="flex items-center justify-center gap-1 px-2 py-2 border-b border-white/[0.06]">
      ${canEdit ? `
        <button
          type="button"
          onclick="wsCreateNote(null)"
          title="New Note"
          class="w-7 h-7 rounded-md hover:bg-white/[0.07] text-white/65 hover:text-[#e4d4a7] flex items-center justify-center transition cursor-pointer"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button
          type="button"
          onclick="wsStartNewFolder()"
          title="New Folder"
          class="w-7 h-7 rounded-md hover:bg-white/[0.07] text-white/65 hover:text-[#e4d4a7] flex items-center justify-center transition cursor-pointer"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            <line x1="12" y1="11" x2="12" y2="17"></line>
            <line x1="9" y1="14" x2="15" y2="14"></line>
          </svg>
        </button>
        <button
          type="button"
          onclick="wsToggleReorderMode()"
          title="${wsReorderMode ? 'Finish Manual Reordering' : 'Manual Reorder Mode (Drag or Tap ↑/↓)'}"
          aria-label="${wsReorderMode ? 'Finish Manual Reordering' : 'Manual Reorder Mode'}"
          class="w-7 h-7 rounded-md hover:bg-white/[0.07] text-white/65 hover:text-[#e4d4a7] flex items-center justify-center transition cursor-pointer ${wsReorderMode ? 'ws-toolbar-btn-active' : ''}"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="7 8 12 3 17 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="21"></line>
            <polyline points="7 16 12 21 17 16"></polyline>
          </svg>
        </button>
      ` : ''}
      <button
        type="button"
        onclick="wsCycleSortOrder()"
        title="Sort: ${sortLabel}"
        class="w-7 h-7 rounded-md hover:bg-white/[0.07] text-white/65 hover:text-[#e4d4a7] flex items-center justify-center transition cursor-pointer"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="6" x2="13" y2="6"></line>
          <line x1="4" y1="12" x2="11" y2="12"></line>
          <line x1="4" y1="18" x2="9" y2="18"></line>
          <polyline points="15 15 18 18 21 15"></polyline>
          <line x1="18" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <button
        type="button"
        onclick="wsToggleAllFolders()"
        title="${allCollapsed ? 'Expand All Folders' : 'Collapse All Folders'}"
        class="w-7 h-7 rounded-md hover:bg-white/[0.07] text-white/65 hover:text-[#e4d4a7] flex items-center justify-center transition cursor-pointer"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="7 15 12 20 17 15"></polyline>
          <polyline points="7 9 12 4 17 9"></polyline>
        </svg>
      </button>
    </div>
  `;

  const reorderBannerHtml = (canEdit && wsReorderMode)
    ? `
      <div class="px-2.5 py-1.5 border-b border-[#e4d4a7]/22 bg-[#e4d4a7]/[0.04] flex items-center justify-between gap-2">
        <span class="font-mono-code text-[9px] tracking-[0.15em] uppercase text-[#e4d4a7]">DRAG OR TAP ↑↓ TO SORT</span>
        <button
          type="button"
          onclick="wsToggleReorderMode()"
          class="font-mono-code text-[9px] uppercase text-white/65 hover:text-[#e4d4a7] cursor-pointer"
        >DONE</button>
      </div>
    `
    : '';

  const newFolderInputRow = (canEdit && wsNewFolderDraft)
    ? `
      <div class="px-1.5 py-1">
        <input
          id="ws-new-folder-input"
          type="text"
          placeholder="Folder name + Enter..."
          onkeydown="wsHandleNewFolderKey(event)"
          onblur="wsCommitNewFolder(this.value)"
          class="w-full rounded-md bg-black/55 border border-[#e4d4a7]/60 px-2.5 py-1 text-xs text-[#f3f1ec] placeholder-white/35 focus:outline-none"
        />
      </div>
    `
    : '';

  const displayedFolders = wsSortFolders(vault.folders);
  const foldersHtml = displayedFolders.map((folder, fIdx) => {
    const folderNotes = wsSortNotes(vault.notes.filter(n => n.folderId === folder.id));
    const isRenamingFolder = canEdit && wsRenameTarget && wsRenameTarget.type === 'folder' && wsRenameTarget.id === folder.id;

    const childrenHtml = !folder.collapsed
      ? `<div class="pl-4 space-y-0.5 mt-0.5">
          ${folderNotes.map((n, nIdx) => wsBuildNoteTreeItemHtml(vault, n, canEdit, nIdx, folderNotes.length)).join('')}
        </div>`
      : '';

    const folderLabelHtml = isRenamingFolder
      ? `<input
           id="ws-inline-rename-input"
           type="text"
           value="${wsEscapeAttr(folder.name)}"
           onclick="event.stopPropagation()"
           onkeydown="wsHandleInlineRenameKey(event)"
           onblur="wsCommitInlineRename(this.value)"
           class="flex-1 min-w-0 rounded bg-black/60 border border-[#e4d4a7]/60 px-1.5 py-0.5 text-xs text-[#f3f1ec] focus:outline-none"
         />`
      : `<span class="flex-1 truncate text-[13px] font-medium">${escapeHtmlSafely(folder.name)}</span>`;

    const folderRightControls = canEdit
      ? (wsReorderMode
          ? `<span class="ws-reorder-controls" onclick="event.stopPropagation()">
               <button type="button" onclick="wsMoveItemStep('folder', '${folder.id}', -1)" ${fIdx === 0 ? 'disabled' : ''} title="Move Folder Up" aria-label="Move Folder Up" class="ws-reorder-btn">↑</button>
               <button type="button" onclick="wsMoveItemStep('folder', '${folder.id}', 1)" ${fIdx === displayedFolders.length - 1 ? 'disabled' : ''} title="Move Folder Down" aria-label="Move Folder Down" class="ws-reorder-btn">↓</button>
             </span>`
          : `<span class="font-mono-code text-[10px] text-white/25 mr-0.5">${folderNotes.length}</span>
             <button
               type="button"
               onclick="event.stopPropagation(); wsShowContextMenu(event, 'folder', '${folder.id}')"
               title="Folder Actions"
               class="ws-item-menu-btn w-5 h-5 rounded hover:bg-white/10 text-white/50 hover:text-[#e4d4a7] flex items-center justify-center text-xs cursor-pointer"
             >···</button>`)
      : `<span class="font-mono-code text-[10px] text-white/25 mr-0.5">${folderNotes.length}</span>`;

    return `
      <div>
        <div
          data-ws-folder-id="${folder.id}"
          ${canEdit ? `draggable="true" ondragstart="wsHandleFolderDragStart(event, '${folder.id}', this)" ondragend="wsHandleTreeDragEnd()" oncontextmenu="wsShowContextMenu(event, 'folder', '${folder.id}')" ondragover="wsHandleFolderDragOver(event, '${folder.id}', this)" ondragleave="wsClearDropHighlight(this)" ondrop="wsHandleFolderDrop(event, '${folder.id}', this)"` : 'draggable="false"'}
          onclick="wsToggleFolder('${folder.id}')"
          class="ws-tree-item"
        >
          <svg class="w-3 h-3 text-white/40 shrink-0 transition-transform ${folder.collapsed ? '' : 'rotate-90'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          ${folderLabelHtml}
          ${folderRightControls}
        </div>
        ${childrenHtml}
      </div>
    `;
  }).join('');

  const rootNotes = wsSortNotes(vault.notes.filter(n => !n.folderId));
  const rootNotesHtml = rootNotes.map((n, nIdx) => wsBuildNoteTreeItemHtml(vault, n, canEdit, nIdx, rootNotes.length)).join('');

  return `
    ${tabsBar}
    ${toolbarHtml}
    ${reorderBannerHtml}
    <div
      id="ws-sidebar-scroll"
      class="flex-1 overflow-y-auto p-2 space-y-0.5"
      ${canEdit ? `ondragover="wsHandleRootDragOver(event, this)" ondragleave="wsClearDropHighlight(this)" ondrop="wsHandleRootDrop(event, this)"` : ''}
    >
      ${newFolderInputRow}
      ${foldersHtml}
      ${rootNotesHtml}
      ${vault.notes.length === 0 ? `<div class="px-3 py-8 text-center text-xs text-white/35">${canEdit ? 'Click New Note above to start writing' : 'No notes published yet'}</div>` : ''}
    </div>
  `;
}

function wsBuildNoteTreeItemHtml(vault, note, canEdit, siblingIdx = 0, siblingCount = 1) {
  const isAct = vault.activeNoteId === note.id;
  const isRenaming = canEdit && wsRenameTarget && wsRenameTarget.type === 'note' && wsRenameTarget.id === note.id;

  const labelHtml = isRenaming
    ? `<input
         id="ws-inline-rename-input"
         type="text"
         value="${wsEscapeAttr(note.title)}"
         onclick="event.stopPropagation()"
         onkeydown="wsHandleInlineRenameKey(event)"
         onblur="wsCommitInlineRename(this.value)"
         class="flex-1 min-w-0 rounded bg-black/60 border border-[#e4d4a7]/60 px-1.5 py-0.5 text-xs text-[#f3f1ec] focus:outline-none"
       />`
    : `<span class="flex-1 truncate text-[13px]">${escapeHtmlSafely(note.title)}</span>`;

  const starDot = note.bookmarked
    ? `<span class="text-[10px] text-[#e4d4a7] shrink-0" title="Bookmarked">★</span>`
    : '';

  const noteRightControls = canEdit
    ? (wsReorderMode
        ? `<span class="ws-reorder-controls" onclick="event.stopPropagation()">
             <button type="button" onclick="wsMoveItemStep('note', '${note.id}', -1)" ${siblingIdx === 0 ? 'disabled' : ''} title="Move Note Up" aria-label="Move Note Up" class="ws-reorder-btn">↑</button>
             <button type="button" onclick="wsMoveItemStep('note', '${note.id}', 1)" ${siblingIdx >= siblingCount - 1 ? 'disabled' : ''} title="Move Note Down" aria-label="Move Note Down" class="ws-reorder-btn">↓</button>
           </span>`
        : `${starDot}
           <button
             type="button"
             onclick="event.stopPropagation(); wsShowContextMenu(event, 'note', '${note.id}')"
             title="Sort / Move / Rename / Delete"
             class="ws-item-menu-btn w-5 h-5 rounded hover:bg-white/10 text-white/50 hover:text-[#e4d4a7] flex items-center justify-center text-xs cursor-pointer"
           >···</button>`)
    : starDot;

  return `
    <div
      data-ws-note-id="${note.id}"
      ${canEdit ? `draggable="true" ondragstart="wsHandleNoteDragStart(event, '${note.id}', this)" ondragend="wsHandleTreeDragEnd()" ondragover="wsHandleNoteDragOver(event, '${note.id}', this)" ondragleave="wsClearDropHighlight(this)" ondrop="wsHandleNoteDrop(event, '${note.id}', this)" oncontextmenu="wsShowContextMenu(event, 'note', '${note.id}')"` : 'draggable="false"'}
      onclick="wsOpenNote('${note.id}')"
      class="ws-tree-item ${isAct ? 'is-active' : ''}"
    >
      <svg class="w-3.5 h-3.5 text-white/35 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
      ${labelHtml}
      ${noteRightControls}
    </div>
  `;
}

function wsBuildEditorPaneHtml(vault, activeNote, canEdit) {
  // 1. Top Tabs Strip
  const tabsHtml = vault.openTabIds.map(id => {
    const note = vault.notes.find(n => n.id === id);
    if (!note) return '';
    const isAct = vault.activeNoteId === note.id;
    return `
      <div
        onclick="wsOpenNote('${note.id}')"
        class="ws-tab ${isAct ? 'is-active' : ''}"
        title="${wsEscapeAttr(note.title)}"
      >
        <span class="truncate">${escapeHtmlSafely(note.title)}</span>
        <button
          type="button"
          onclick="event.stopPropagation(); wsCloseTab('${note.id}')"
          aria-label="Close Tab"
          class="w-4 h-4 rounded hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center text-[11px] shrink-0 cursor-pointer"
        >✕</button>
      </div>
    `;
  }).join('');

  const tabStrip = `
    <div class="ws-tab-strip">
      ${tabsHtml}
      ${canEdit ? `
        <button
          type="button"
          onclick="wsCreateNote(null)"
          title="New Note Tab"
          class="w-7 h-7 mb-1 ml-1 rounded-md hover:bg-white/[0.07] text-white/45 hover:text-[#e4d4a7] flex items-center justify-center text-base shrink-0 transition cursor-pointer"
        >+</button>
      ` : ''}
    </div>
  `;

  if (!activeNote) {
    return `
      ${tabStrip}
      <div class="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <p class="font-serif-editorial italic text-2xl text-white/75">No note is open</p>
        <div class="flex flex-wrap items-center justify-center gap-3">
          ${canEdit ? `
            <button
              type="button"
              onclick="wsCreateNote(null)"
              class="px-4 py-2 rounded-xl bg-[#e4d4a7] hover:bg-[#f2e5bf] text-[#0c0d0f] font-mono-code text-xs font-medium cursor-pointer transition"
            >+ New Note</button>
          ` : ''}
          <button
            type="button"
            onclick="wsOpenGraphView()"
            class="px-4 py-2 rounded-xl border border-[#e4d4a7]/40 bg-[#e4d4a7]/10 hover:bg-[#e4d4a7]/20 text-[#e4d4a7] font-mono-code text-xs cursor-pointer transition"
          >✦ Open Graph View</button>
        </div>
      </div>
    `;
  }

  const folderName = wsGetFolderName(activeNote.folderId);
  // Visitors are strictly locked to Preview/Reading mode
  const isPreview = !canEdit || vault.mode === 'preview';
  const outgoingTitles = wsExtractWikilinkTitles(activeNote.content);
  const backlinkNotes = wsGetBacklinksForNote(activeNote);

  const outgoingHtml = outgoingTitles.map(t => {
    const existing = wsFindNoteByTitle(t);
    const exists = Boolean(existing);
    const safeT = escapeHtmlSafely(t);
    const safeTargetAttr = wsEscapeAttr(t);
    if (!exists && !canEdit) {
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono-code bg-white/[0.03] border border-dashed border-white/15 text-white/40">[[${safeT}]]</span>`;
    }
    return `
      <button
        type="button"
        data-wikilink="${safeTargetAttr}"
        data-wikilink-id="${existing ? existing.id : ''}"
        onclick="wsFollowWikilinkEl(this)"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono-code transition cursor-pointer ${
          exists
            ? 'bg-[#e4d4a7]/12 border border-[#e4d4a7]/35 text-[#e4d4a7] hover:bg-[#e4d4a7]/22'
            : 'bg-white/[0.03] border border-dashed border-white/20 text-white/50 hover:text-[#e4d4a7]'
        }"
      >[[${safeT}]]</button>
    `;
  }).join('');

  const backlinksHtml = backlinkNotes.map(bn => `
    <button
      type="button"
      onclick="wsOpenNote('${bn.id}')"
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono-code bg-[#569cd6]/14 border border-[#569cd6]/35 text-[#7cc4fa] hover:bg-[#569cd6]/25 transition cursor-pointer"
    >← ${escapeHtmlSafely(bn.title)}</button>
  `).join('');

  const embedMeta = {
    image: { label: 'IMAGE URL', urlPh: 'https://example.com/photo.jpg', capPh: 'Caption or width (optional, e.g. Diagram|480)' },
    video: { label: 'VIDEO URL', urlPh: 'YouTube, Vimeo, Bilibili, or .mp4 URL', capPh: 'Video title (optional)' },
    audio: { label: 'AUDIO URL', urlPh: 'https://example.com/track.mp3', capPh: 'Track title (optional)' },
    web:   { label: 'WEBPAGE URL', urlPh: 'https://example.com', capPh: 'Frame height in px (optional, default 460)' }
  };

  const inlineEmbedBarHtml = (canEdit && !isPreview && wsEmbedInsertType && embedMeta[wsEmbedInsertType])
    ? `
      <div class="mx-6 sm:mx-10 mb-3 p-2.5 rounded-xl border border-[#e4d4a7]/35 bg-[#111318] flex flex-wrap items-center gap-2">
        <span class="font-mono-code text-[10px] tracking-wider uppercase text-[#e4d4a7] shrink-0">${embedMeta[wsEmbedInsertType].label}</span>
        <input
          id="ws-embed-url-input"
          type="url"
          placeholder="${embedMeta[wsEmbedInsertType].urlPh}"
          onkeydown="if (event.key === 'Enter') { event.preventDefault(); wsConfirmInsertEmbed(); }"
          class="flex-1 min-w-[160px] rounded-lg bg-black/50 border border-white/15 px-2.5 py-1.5 text-xs text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#e4d4a7]"
        />
        <input
          id="ws-embed-caption-input"
          type="text"
          placeholder="${embedMeta[wsEmbedInsertType].capPh}"
          onkeydown="if (event.key === 'Enter') { event.preventDefault(); wsConfirmInsertEmbed(); }"
          class="w-44 rounded-lg bg-black/50 border border-white/15 px-2.5 py-1.5 text-xs text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#e4d4a7]"
        />
        <button
          type="button"
          onclick="wsConfirmInsertEmbed()"
          class="px-3 py-1.5 rounded-lg bg-[#e4d4a7] hover:bg-[#f2e5bf] text-[#0c0d0f] font-mono-code text-[10px] font-medium cursor-pointer"
        >INSERT ↵</button>
        <button
          type="button"
          onclick="wsCancelEmbedInsert()"
          class="px-2 py-1.5 rounded-lg text-white/45 hover:text-white font-mono-code text-[10px] cursor-pointer"
        >CANCEL</button>
      </div>
    `
    : '';

  const contentBodyHtml = isPreview
    ? `
      <div id="ws-preview-body" class="ws-md-preview flex-1 overflow-y-auto px-6 sm:px-10 pb-8">
        <div class="ws-md-measure">
          ${wsRenderMarkdown(activeNote.content || '')}
        </div>
      </div>
    `
    : `
      ${inlineEmbedBarHtml}
      <div class="relative flex-1 flex flex-col min-h-0 px-6 sm:px-10 pb-4">
        <textarea
          id="ws-editor-textarea"
          placeholder="Write in Markdown... Type [[ to link notes, or embed images, video, audio, and webpages."
          spellcheck="false"
          class="w-full flex-1 resize-none bg-transparent text-[15px] leading-[1.78] text-[#f3f1ec]/90 placeholder-white/25 focus:outline-none font-sans"
        >${escapeHtmlSafely(activeNote.content || '')}</textarea>

        <!-- Obsidian [[Double Brackets]] Autocomplete Floating Menu -->
        <div
          id="ws-wikilink-popup"
          class="hidden absolute left-6 sm:left-10 bottom-3 z-30 w-72 max-h-56 overflow-y-auto rounded-xl border border-[#e4d4a7]/35 bg-[#12141a]/98 backdrop-blur-md p-1.5 shadow-[0_14px_38px_rgba(0,0,0,0.85)]"
        ></div>
      </div>
    `;

  const titleBlockHtml = canEdit
    ? `
      <input
        id="ws-note-title-input"
        type="text"
        value="${wsEscapeAttr(activeNote.title)}"
        title="Click title to rename"
        placeholder="Untitled"
        onkeydown="if (event.key === 'Enter') { event.preventDefault(); this.blur(); }"
        onblur="wsRenameNote('${activeNote.id}', this.value)"
        class="w-full bg-transparent font-serif-editorial text-2xl sm:text-3xl font-medium text-[#f6f1e3] placeholder-white/25 focus:outline-none border-b border-transparent focus:border-[#e4d4a7]/45 pb-1 transition"
      />
    `
    : `
      <h2 class="w-full font-serif-editorial text-2xl sm:text-3xl font-medium text-[#f6f1e3] pb-1">
        ${escapeHtmlSafely(activeNote.title)}
      </h2>
    `;

  const adminInsertToolsHtml = canEdit
    ? `
      <div class="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
        <span id="ws-cloud-sync-badge" class="font-mono-code text-[9px] uppercase tracking-wider text-emerald-400/75 mr-1">${wsCloudSyncState || 'R2 SYNCED'}</span>
        <button type="button" onclick="wsOpenEmbedInsert('image')" title="Embed External Image" class="px-2 py-0.5 rounded border border-white/12 bg-white/[0.04] hover:border-[#e4d4a7]/45 text-[10px] font-mono-code text-white/65 hover:text-[#e4d4a7] transition cursor-pointer">+ Image</button>
        <button type="button" onclick="wsOpenEmbedInsert('video')" title="Embed External Video" class="px-2 py-0.5 rounded border border-white/12 bg-white/[0.04] hover:border-[#e4d4a7]/45 text-[10px] font-mono-code text-white/65 hover:text-[#e4d4a7] transition cursor-pointer">+ Video</button>
        <button type="button" onclick="wsOpenEmbedInsert('audio')" title="Embed External Audio" class="px-2 py-0.5 rounded border border-white/12 bg-white/[0.04] hover:border-[#e4d4a7]/45 text-[10px] font-mono-code text-white/65 hover:text-[#e4d4a7] transition cursor-pointer">+ Audio</button>
        <button type="button" onclick="wsOpenEmbedInsert('web')" title="Embed External Webpage" class="px-2 py-0.5 rounded border border-white/12 bg-white/[0.04] hover:border-[#e4d4a7]/45 text-[10px] font-mono-code text-white/65 hover:text-[#e4d4a7] transition cursor-pointer">+ Web</button>
        <span class="inline-flex items-center rounded border border-white/12 overflow-hidden text-[10px] font-mono-code">
          <button type="button" onclick="wsSetMediaStorageTarget('r2')" class="px-1.5 py-0.5 cursor-pointer transition ${wsMediaStorageTarget === 'r2' ? 'bg-[#e4d4a7]/20 text-[#e4d4a7]' : 'text-white/45 hover:text-white'}" title="Upload media to Cloudflare R2">R2</button>
          <button type="button" onclick="wsSetMediaStorageTarget('github')" class="px-1.5 py-0.5 cursor-pointer transition ${wsMediaStorageTarget === 'github' ? 'bg-[#569cd6]/25 text-[#7cc4fa]' : 'text-white/45 hover:text-white'}" title="Upload media to GitHub rudy-vault">GH</button>
        </span>
        ${wsMediaStorageTarget === 'github' ? `
          <select aria-label="GitHub media folder" onchange="wsSetMediaGhFolder(this.value)" class="rounded bg-black/50 border border-white/15 px-1.5 py-0.5 text-[10px] font-mono-code text-[#f3f1ec] focus:outline-none">
            ${wsGhFolders.map(f => `<option value="${wsEscapeAttr(f)}" ${f === wsMediaGhFolder ? 'selected' : ''}>📁 ${escapeHtmlSafely(f)}</option>`).join('')}
          </select>
          <button type="button" onclick="wsCreateMediaGhFolder()" title="Create folder in rudy-vault" class="px-1.5 py-0.5 rounded border border-white/12 hover:border-[#e4d4a7]/45 text-[10px] font-mono-code text-white/65 hover:text-[#e4d4a7] cursor-pointer">+</button>
        ` : ''}
        <label title="Upload Image, Video, or Audio to ${wsMediaStorageTarget === 'github' ? 'GitHub (rudy-vault)' : 'Cloudflare R2'}" class="px-2 py-0.5 rounded border border-[#7cc4fa]/30 bg-[#569cd6]/12 hover:bg-[#569cd6]/22 text-[10px] font-mono-code text-[#7cc4fa] transition cursor-pointer">
          <span>↑ ${wsMediaStorageTarget === 'github' ? 'GitHub Media' : 'R2 Media'}</span>
          <input type="file" accept="image/*,video/*,audio/*" onchange="wsUploadMediaToR2(event)" class="hidden" />
        </label>
        <button
          type="button"
          onclick="wsInsertWikilinkTrigger()"
          title="Insert [[Wikilink]]"
          class="px-2 py-0.5 rounded border border-white/12 bg-white/[0.04] hover:border-[#e4d4a7]/45 text-[10px] font-mono-code text-white/65 hover:text-[#e4d4a7] transition cursor-pointer"
        >+ [[Link]]</button>
        <button
          type="button"
          onclick="wsArchiveVaultToGitHub()"
          title="Archive all Markdown notes & folders into GitHub (rudy-vault)"
          class="px-2 py-0.5 rounded border border-[#7cc4fa]/35 bg-[#569cd6]/12 hover:bg-[#569cd6]/22 text-[10px] font-mono-code text-[#7cc4fa] transition cursor-pointer"
        >↑ Sync .md to GH</button>
        <button
          type="button"
          onclick="wsExportVaultBackup()"
          title="Export all Markdown notes & folders as ZIP backup"
          class="px-2 py-0.5 rounded border border-[#e4d4a7]/35 bg-[#e4d4a7]/10 hover:bg-[#e4d4a7]/20 text-[10px] font-mono-code text-[#e4d4a7] transition cursor-pointer"
        >↓ Export .zip</button>
      </div>
    `
    : '';

  return `
    ${tabStrip}

    <!-- Editor Sub-Header: Breadcrumb + Graph + Admin Controls -->
    <div class="flex items-center justify-between gap-2 px-4 sm:px-6 py-2 border-b border-white/[0.06] bg-[#15171c]">
      <div class="flex items-center gap-1.5 min-w-0 text-xs text-white/45 font-mono-code">
        ${folderName ? `<span class="truncate" style="max-width: 220px;">${escapeHtmlSafely(folderName)}</span><span class="text-white/25">/</span>` : ''}
        <span class="truncate text-white/75">${escapeHtmlSafely(activeNote.title)}</span>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <!-- Work & Study Exclusive 3-Mode Theme Switcher (Light / 米纸 / Dark) -->
        ${(() => {
          const curWsTheme = wsGetThemeMode();
          return `
            <div class="ws-theme-seg" role="group" aria-label="Work and Study reading theme">
              <button type="button" onclick="wsSetThemeMode('light')" class="ws-theme-seg-btn ${curWsTheme === 'light' ? 'is-active' : ''}" title="Apple Light">Light</button>
              <button type="button" onclick="wsSetThemeMode('beige')" class="ws-theme-seg-btn ${curWsTheme === 'beige' ? 'is-active' : ''}" title="Warm Paper Beige">米纸</button>
              <button type="button" onclick="wsSetThemeMode('dark')" class="ws-theme-seg-btn ${curWsTheme === 'dark' ? 'is-active' : ''}" title="Obsidian Dark">Dark</button>
            </div>
          `;
        })()}

        ${canEdit ? `
          <button
            type="button"
            onclick="wsToggleBookmark('${activeNote.id}')"
            title="${activeNote.bookmarked ? 'Remove Bookmark' : 'Bookmark Note'}"
            class="w-7 h-7 rounded-md hover:bg-white/[0.07] flex items-center justify-center transition cursor-pointer ${activeNote.bookmarked ? 'text-[#e4d4a7]' : 'text-white/45 hover:text-[#e4d4a7]'}"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="${activeNote.bookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
        ` : ''}

        <button
          type="button"
          onclick="wsOpenGraphView()"
          title="Open Butterfly Graph View"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#e4d4a7]/30 bg-[#e4d4a7]/10 hover:bg-[#e4d4a7]/20 text-[11px] font-mono-code text-[#e4d4a7] transition cursor-pointer"
        >
          <span>✦</span>
          <span class="hidden sm:inline">Graph</span>
        </button>

        <button
          id="ws-fullscreen-btn"
          type="button"
          onclick="wsToggleFullscreen()"
          title="${wsIsFullscreen ? 'Exit Fullscreen (Esc)' : 'Expand Fullscreen'}"
          aria-label="${wsIsFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}"
          class="w-7 h-7 rounded-md border border-white/12 bg-white/[0.04] hover:border-[#e4d4a7]/45 text-white/65 hover:text-[#e4d4a7] flex items-center justify-center transition cursor-pointer"
        >
          ${wsIsFullscreen
            ? `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`
            : `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`
          }
        </button>

        ${canEdit ? `
          <!-- Top-Right Edit / Reading Mode Toggle (Admin Only) -->
          <button
            type="button"
            onclick="wsToggleEditorMode()"
            title="${isPreview ? 'Switch to Edit Mode' : 'Switch to Reading Mode'}"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition cursor-pointer text-[11px] font-mono-code ${
              isPreview
                ? 'border-[#7cc4fa]/45 bg-[#569cd6]/18 text-[#7cc4fa]'
                : 'border-white/15 bg-white/[0.05] hover:border-[#e4d4a7]/45 text-white/80 hover:text-[#e4d4a7]'
            }"
          >
            ${isPreview
              ? `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg><span>Edit</span>`
              : `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg><span>Read</span>`
            }
          </button>

          <button
            type="button"
            onclick="wsShowContextMenu(event, 'note', '${activeNote.id}')"
            title="More Actions (Move / Rename / Delete)"
            class="w-7 h-7 rounded-md hover:bg-white/[0.07] text-white/45 hover:text-white flex items-center justify-center text-sm cursor-pointer"
          >···</button>
        ` : ''}
      </div>
    </div>

    <!-- Note Title (Editable for Admin, Static for Visitors) -->
    <div class="px-6 sm:px-10 pt-5 pb-3">
      ${isPreview ? `<div class="ws-md-measure">${titleBlockHtml}</div>` : titleBlockHtml}
    </div>

    <!-- Markdown Editor OR Rendered Reading View -->
    ${contentBodyHtml}

    <!-- Bottom Outgoing [[Links]], Backlinks & Admin Media Tools Strip -->
    <div class="ws-bottom-bar px-4 sm:px-6 py-2 border-t border-white/[0.06] bg-[#121419] flex flex-wrap items-center justify-between gap-2 text-[11px]">
      <div class="flex flex-wrap items-center gap-1.5 min-w-0">
        <span class="font-mono-code text-[10px] uppercase tracking-wider text-white/35 mr-1">LINKS:</span>
        ${outgoingHtml || `<span class="text-white/30 font-mono-code text-[10px]">${canEdit ? 'Type [[ to link notes' : 'None'}</span>`}
        ${backlinksHtml}
      </div>
      ${adminInsertToolsHtml}
    </div>
  `;
}

/* ========================================================================
   EDITOR INTERACTION, MARKDOWN PARSER, RICH EMBEDS & [[WIKILINK]]
   ======================================================================== */
function wsBindEditorDynamicEvents() {
  const previewEl = document.getElementById('ws-preview-body');
  if (previewEl) {
    previewEl.querySelectorAll('img').forEach(img => {
      img.classList.add('cursor-zoom-in');
      img.title = 'Click to enlarge';
    });
    previewEl.addEventListener('click', (e) => {
      const img = e.target && e.target.closest ? e.target.closest('img') : null;
      if (img && img.src && typeof openImageLightboxFromEl === 'function') {
        openImageLightboxFromEl(img, img.alt || 'Work & Study Note');
      } else if (img && img.src && typeof openImageLightbox === 'function') {
        openImageLightbox(img.src, img.alt || 'Work & Study Note');
      }
    });
  }

  const ta = document.getElementById('ws-editor-textarea');
  if (!ta || !isAuthorAuthenticated) return;

  ta.addEventListener('input', () => {
    if (!isAuthorAuthenticated) return;
    const note = wsGetActiveNote();
    if (!note) return;
    note.content = ta.value;
    note.updatedAt = Date.now();
    wsSaveVault(false);
    wsCheckWikilinkAutocomplete(ta);
  });

  ta.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      wsCheckWikilinkAutocomplete(ta);
    }
  });

  ta.addEventListener('click', () => {
    wsCheckWikilinkAutocomplete(ta);
  });

  ta.addEventListener('keydown', (e) => {
    if (wsWikilinkState.open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (wsWikilinkState.candidates.length > 0) {
          wsWikilinkState.activeIndex = (wsWikilinkState.activeIndex + 1) % wsWikilinkState.candidates.length;
          wsRenderWikilinkPopup();
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (wsWikilinkState.candidates.length > 0) {
          wsWikilinkState.activeIndex = (wsWikilinkState.activeIndex - 1 + wsWikilinkState.candidates.length) % wsWikilinkState.candidates.length;
          wsRenderWikilinkPopup();
        }
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (wsWikilinkState.candidates.length > 0) {
          e.preventDefault();
          wsSelectWikilinkCandidate(wsWikilinkState.activeIndex);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        wsCloseWikilinkPopup();
        return;
      }
    }

    // Tab inserts 2 spaces for clean Markdown lists & code blocks
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + '  ' + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
      const note = wsGetActiveNote();
      if (note) {
        note.content = ta.value;
        note.updatedAt = Date.now();
        wsSaveVault(false);
      }
    }
  });
}

function wsCheckWikilinkAutocomplete(ta) {
  if (!isAuthorAuthenticated) return;
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos);
  const lastOpen = before.lastIndexOf('[[');
  if (lastOpen === -1) {
    wsCloseWikilinkPopup();
    return;
  }
  // Do not trigger wikilink popup for external ![[https://...]] embeds
  if (lastOpen > 0 && before[lastOpen - 1] === '!') {
    wsCloseWikilinkPopup();
    return;
  }
  const afterOpen = before.slice(lastOpen + 2);
  if (afterOpen.includes(']') || afterOpen.includes('\n')) {
    wsCloseWikilinkPopup();
    return;
  }

  const vault = wsLoadVault();
  const activeId = vault.activeNoteId;
  const q = afterOpen.trim().toLowerCase();
  const matching = vault.notes
    .filter(n => n.id !== activeId && (!q || (n.title || '').toLowerCase().includes(q)))
    .slice(0, 8)
    .map(n => ({ title: n.title, folder: wsGetFolderName(n.folderId), isNew: false }));

  const exactExists = vault.notes.some(n => (n.title || '').trim().toLowerCase() === q);
  if (afterOpen.trim() && !exactExists) {
    matching.push({ title: afterOpen.trim(), folder: 'Create & Link', isNew: true });
  }

  wsWikilinkState = {
    open: true,
    startIdx: lastOpen,
    query: afterOpen,
    activeIndex: 0,
    candidates: matching
  };
  wsRenderWikilinkPopup();
}

function wsRenderWikilinkPopup() {
  const pop = document.getElementById('ws-wikilink-popup');
  if (!pop) return;
  if (!wsWikilinkState.open || wsWikilinkState.candidates.length === 0) {
    pop.classList.add('hidden');
    return;
  }

  pop.classList.remove('hidden');
  pop.innerHTML = `
    <div class="px-2 py-1 font-mono-code text-[9px] uppercase tracking-[0.16em] text-[#e4d4a7]/70 border-b border-white/8 mb-1">
      [[ LINK TO NOTE ]]
    </div>
    ${wsWikilinkState.candidates.map((c, idx) => `
      <button
        type="button"
        onmousedown="event.preventDefault(); wsSelectWikilinkCandidate(${idx})"
        class="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
          idx === wsWikilinkState.activeIndex
            ? 'bg-[#e4d4a7]/20 text-[#fff6dc]'
            : 'text-white/75 hover:bg-white/[0.06]'
        }"
      >
        <span class="truncate">${c.isNew ? '+ ' : ''}${escapeHtmlSafely(c.title)}</span>
        ${c.folder ? `<span class="font-mono-code text-[10px] text-white/40 truncate max-w-[95px]">${escapeHtmlSafely(c.folder)}</span>` : ''}
      </button>
    `).join('')}
  `;
}

function wsSelectWikilinkCandidate(index) {
  if (!isAuthorAuthenticated) return;
  const ta = document.getElementById('ws-editor-textarea');
  const cand = wsWikilinkState.candidates[index];
  if (!ta || !cand) return;

  const start = wsWikilinkState.startIdx;
  const end = ta.selectionStart;
  const hasClosing = ta.value.slice(end, end + 2) === ']]';
  const insertText = `[[${cand.title}]]`;
  const nextPos = start + insertText.length;

  ta.value = ta.value.slice(0, start) + insertText + ta.value.slice(hasClosing ? end + 2 : end);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = nextPos;

  const note = wsGetActiveNote();
  if (note) {
    note.content = ta.value;
    note.updatedAt = Date.now();
    wsSaveVault(false);
  }
  wsCloseWikilinkPopup();
}

function wsCloseWikilinkPopup() {
  wsWikilinkState.open = false;
  const pop = document.getElementById('ws-wikilink-popup');
  if (pop) pop.classList.add('hidden');
}

function wsInsertAtCursor(snippet) {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  if (vault.mode !== 'edit') {
    vault.mode = 'edit';
    wsSaveUiPrefs();
    wsRenderWorkspace();
  }
  const ta = document.getElementById('ws-editor-textarea');
  const note = wsGetActiveNote();
  if (!ta || !note) return;
  ta.focus();
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + snippet + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + snippet.length;
  note.content = ta.value;
  note.updatedAt = Date.now();
  wsSaveVault(false);
}

function wsInsertWikilinkTrigger() {
  if (!isAuthorAuthenticated) return;
  wsInsertAtCursor('[[');
  const ta = document.getElementById('ws-editor-textarea');
  if (ta) wsCheckWikilinkAutocomplete(ta);
}

function wsOpenEmbedInsert(type) {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  vault.mode = 'edit';
  wsSaveUiPrefs();
  wsEmbedInsertType = (wsEmbedInsertType === type) ? null : type;
  wsRenderWorkspace();
}

function wsCancelEmbedInsert() {
  wsEmbedInsertType = null;
  wsRenderWorkspace();
}

function wsConfirmInsertEmbed() {
  if (!isAuthorAuthenticated || !wsEmbedInsertType) return;
  const urlEl = document.getElementById('ws-embed-url-input');
  const capEl = document.getElementById('ws-embed-caption-input');
  const url = urlEl ? urlEl.value.trim() : '';
  const cap = capEl ? capEl.value.trim() : '';
  if (!url) return;

  let snippet = '';
  if (wsEmbedInsertType === 'image') {
    snippet = `\n![${cap || 'Image'}](${url})\n`;
  } else if (wsEmbedInsertType === 'video') {
    snippet = `\n@[video${cap ? '|' + cap : ''}](${url})\n`;
  } else if (wsEmbedInsertType === 'audio') {
    snippet = `\n@[audio${cap ? '|' + cap : ''}](${url})\n`;
  } else if (wsEmbedInsertType === 'web') {
    const h = /^\d{3,4}$/.test(cap) ? `|${cap}` : '';
    snippet = `\n@[web${h}](${url})\n`;
  }

  wsEmbedInsertType = null;
  wsRenderWorkspace();
  wsInsertAtCursor(snippet);
}

async function wsEnsureGhFoldersLoaded() {
  if (!isAuthorAuthenticated || wsHasLoadedGhFolders) return;
  wsHasLoadedGhFolders = true;
  const folders = await fetchGitHubFolders();
  if (Array.isArray(folders) && folders.length > 0) {
    wsGhFolders = Array.from(new Set(['work-media', ...folders]));
    if (currentView === 'chapter' && activeBookId === 'work') {
      wsRenderWorkspace();
    }
  }
}

function wsSetMediaStorageTarget(target) {
  wsMediaStorageTarget = target === 'github' ? 'github' : 'r2';
  if (wsMediaStorageTarget === 'github') {
    wsEnsureGhFoldersLoaded();
  }
  wsRenderWorkspace();
}

function wsSetMediaGhFolder(folderName) {
  wsMediaGhFolder = String(folderName || 'work-media').trim() || 'work-media';
}

async function wsCreateMediaGhFolder() {
  if (!isAuthorAuthenticated) return;
  const raw = window.prompt('输入要在 GitHub (rudy-vault) 创建的文件夹路径（例如 work-media/english）：', wsMediaGhFolder || 'work-media');
  if (!raw) return;
  const clean = raw.trim().replace(/^\/+|\/+$/g, '');
  if (!clean) return;
  wsCloudSyncState = 'CREATING FOLDER...';
  wsUpdateCloudSyncBadge();
  try {
    await createGitHubFolder(clean);
    if (!wsGhFolders.includes(clean)) wsGhFolders.push(clean);
    wsMediaGhFolder = clean;
    wsMediaStorageTarget = 'github';
    wsCloudSyncState = 'FOLDER READY';
    wsRenderWorkspace();
  } catch (err) {
    console.error('GitHub folder create failed:', err);
    wsCloudSyncState = 'FOLDER ERROR';
    wsUpdateCloudSyncBadge();
  }
}

async function wsArchiveVaultToGitHub() {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  wsCloudSyncState = 'SYNCING TO GH...';
  wsUpdateCloudSyncBadge();
  try {
    await archiveVaultToGitHub({
      sortOrder: vault.sortOrder || 'manual',
      folders: vault.folders,
      notes: vault.notes
    });
    wsCloudSyncState = 'GH ARCHIVED ✓';
  } catch (err) {
    console.error('GitHub vault archive failed:', err);
    wsCloudSyncState = 'GH SYNC ERROR';
  }
  wsUpdateCloudSyncBadge();
}

async function wsUploadMediaToR2(event) {
  if (!isAuthorAuthenticated) return;
  const rawFile = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!rawFile) return;

  wsCloudSyncState = 'UPLOADING...';
  wsUpdateCloudSyncBadge();
  try {
    const file = (rawFile.type && rawFile.type.startsWith('image/'))
      ? await compressImageFileForSpeed(rawFile, 1600, 0.84)
      : rawFile;
    const uploaded = wsMediaStorageTarget === 'github'
      ? await uploadSingleFileToGitHub(file, wsMediaGhFolder)
      : await uploadSingleFileToR2(file);
    const cleanName = (rawFile.name || 'Media').replace(/\.[^/.]+$/, '');
    let snippet = '';
    if (file.type && file.type.startsWith('video/')) {
      snippet = `\n@[video|${cleanName}](${uploaded.url})\n`;
    } else if (file.type && file.type.startsWith('audio/')) {
      snippet = `\n@[audio|${cleanName}](${uploaded.url})\n`;
    } else {
      snippet = `\n![${cleanName}](${uploaded.url})\n`;
    }
    wsInsertAtCursor(snippet);
    wsCloudSyncState = wsMediaStorageTarget === 'github' ? 'GH UPLOADED' : 'R2 SYNCED';
  } catch (err) {
    console.error('Vault media upload failed:', err);
    wsCloudSyncState = 'UPLOAD ERROR';
  }
  wsUpdateCloudSyncBadge();
}

function wsFollowWikilinkEl(el) {
  if (!el) return;
  const noteId = el.getAttribute('data-wikilink-id');
  if (noteId) {
    const vault = wsLoadVault();
    if (vault.notes.some(n => n.id === noteId)) {
      wsOpenNote(noteId);
      return;
    }
  }
  const targetTitle = el.getAttribute('data-wikilink') || '';
  wsFollowWikilink(targetTitle);
}

function wsFollowWikilink(targetTitle) {
  const clean = (targetTitle || '').trim();
  if (!clean) return;
  const existing = wsFindNoteByTitle(clean);
  if (existing) {
    wsOpenNote(existing.id);
    return;
  }
  // Strict guard: only logged-in Admin can create a new note from an unresolved [[link]]
  if (!isAuthorAuthenticated) return;

  const vault = wsLoadVault();
  const newNote = {
    id: `ws-n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: clean,
    folderId: null,
    bookmarked: false,
    updatedAt: Date.now(),
    content: `# ${clean}\n\n`
  };
  vault.notes.unshift(newNote);
  if (!vault.openTabIds.includes(newNote.id)) {
    vault.openTabIds.push(newNote.id);
  }
  vault.activeNoteId = newNote.id;
  vault.mode = 'edit';
  wsSaveVault(true);
  wsRenderWorkspace();
}

function wsToggleTaskCheckbox(lineIndex) {
  if (!isAuthorAuthenticated) return;
  const note = wsGetActiveNote();
  if (!note) return;
  const lines = (note.content || '').split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return;
  if (/^(\s*[-*+]\s+)\[ \]/.test(lines[lineIndex])) {
    lines[lineIndex] = lines[lineIndex].replace(/^(\s*[-*+]\s+)\[ \]/, '$1[x]');
  } else if (/^(\s*[-*+]\s+)\[[xX]\]/.test(lines[lineIndex])) {
    lines[lineIndex] = lines[lineIndex].replace(/^(\s*[-*+]\s+)\[[xX]\]/, '$1[ ]');
  }
  note.content = lines.join('\n');
  note.updatedAt = Date.now();
  wsSaveVault(false);
  wsRenderWorkspace();
}

/* ========================================================================
   RICH MARKDOWN EMBED HELPERS (WEBPAGES, VIDEO, AUDIO, IMAGES)
   ======================================================================== */
function wsSanitizeEmbedUrl(rawUrl) {
  const u = String(rawUrl || '').trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(u) || /^\.\/[^\s"'<>]+$/i.test(u)) {
    return u;
  }
  return '';
}

function wsExtractHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_e) {
    return 'External Source';
  }
}

function wsGetVideoIframeSrc(url) {
  // YouTube: watch?v=, youtu.be/, shorts/, embed/
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch) {
    return { provider: 'YouTube', src: `https://www.youtube.com/embed/${ytMatch[1]}` };
  }
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    return { provider: 'Vimeo', src: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }
  // Bilibili BV
  const biliMatch = url.match(/bilibili\.com\/video\/(BV[A-Za-z0-9]+)/i);
  if (biliMatch) {
    return { provider: 'Bilibili', src: `https://player.bilibili.com/player.html?bvid=${biliMatch[1]}&high_quality=1&autoplay=0` };
  }
  return null;
}

function wsIsAudioUrl(url) {
  const clean = (url || '').split('?')[0].toLowerCase();
  return /\.(mp3|wav|m4a|ogg|aac|flac|opus)$/.test(clean);
}

function wsIsDirectVideoUrl(url) {
  const clean = (url || '').split('?')[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogv)$/.test(clean);
}

function wsRenderVideoEmbedHtml(url, caption = '') {
  const safeUrl = wsSanitizeEmbedUrl(url);
  if (!safeUrl) return '';
  const safeCap = escapeHtmlSafely(caption || wsExtractHostname(safeUrl));
  const iframeInfo = wsGetVideoIframeSrc(safeUrl);
  if (iframeInfo) {
    return `
      <div class="ws-embed-card">
        <div class="ws-embed-bar">
          <span class="truncate">▶ ${iframeInfo.provider}${caption ? ' · ' + escapeHtmlSafely(caption) : ''}</span>
          <a href="${escapeHtmlSafely(safeUrl)}" target="_blank" rel="noopener noreferrer">Open ↗</a>
        </div>
        <div class="ws-video-aspect">
          <iframe src="${escapeHtmlSafely(iframeInfo.src)}" loading="lazy" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
        </div>
      </div>
    `;
  }
  return `
    <div class="ws-embed-card">
      <div class="ws-embed-bar">
        <span class="truncate">▶ Video · ${safeCap}</span>
        <a href="${escapeHtmlSafely(safeUrl)}" target="_blank" rel="noopener noreferrer">Source ↗</a>
      </div>
      <video src="${escapeHtmlSafely(safeUrl)}" controls playsinline preload="metadata" class="w-full max-h-[460px] bg-black block"></video>
    </div>
  `;
}

function wsRenderAudioEmbedHtml(url, title = '') {
  const safeUrl = wsSanitizeEmbedUrl(url);
  if (!safeUrl) return '';
  const displayTitle = escapeHtmlSafely(title || safeUrl.split('/').pop().split('?')[0] || 'Audio Track');
  return `
    <div class="ws-audio-card">
      <div class="flex items-center justify-between gap-2 font-mono-code text-[11px]">
        <span class="text-[#e4d4a7] truncate">♪ ${displayTitle}</span>
        <a href="${escapeHtmlSafely(safeUrl)}" target="_blank" rel="noopener noreferrer" class="text-white/45 hover:text-[#e4d4a7] shrink-0">Open ↗</a>
      </div>
      <audio src="${escapeHtmlSafely(safeUrl)}" controls preload="metadata"></audio>
    </div>
  `;
}

function wsRenderWebEmbedHtml(url, heightPx = 460, label = '') {
  const safeUrl = wsSanitizeEmbedUrl(url);
  if (!safeUrl) return '';
  const videoInfo = wsGetVideoIframeSrc(safeUrl);
  if (videoInfo) {
    return wsRenderVideoEmbedHtml(safeUrl, label);
  }
  const clampedH = Math.max(220, Math.min(900, Number(heightPx) || 460));
  const host = escapeHtmlSafely(label || wsExtractHostname(safeUrl));
  return `
    <div class="ws-embed-card">
      <div class="ws-embed-bar">
        <span class="flex items-center gap-2 min-w-0">
          <span class="w-2 h-2 rounded-full bg-[#e4d4a7]/70 shrink-0"></span>
          <span class="truncate">${host}</span>
        </span>
        <a href="${escapeHtmlSafely(safeUrl)}" target="_blank" rel="noopener noreferrer">Open Webpage ↗</a>
      </div>
      <iframe
        src="${escapeHtmlSafely(safeUrl)}"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        referrerpolicy="no-referrer-when-downgrade"
        allowfullscreen
        class="w-full block border-0 bg-[#0b0c10]"
        style="height: ${clampedH}px;"
      ></iframe>
    </div>
  `;
}

function wsRenderImageEmbedHtml(url, altAndWidth = '') {
  const safeUrl = wsSanitizeEmbedUrl(url);
  if (!safeUrl) return '';
  let alt = altAndWidth;
  let widthStyle = '';
  const parts = String(altAndWidth || '').split('|');
  if (parts.length === 2 && /^\d{2,4}$/.test(parts[1].trim())) {
    alt = parts[0].trim();
    widthStyle = `style="max-width: min(100%, ${parts[1].trim()}px);"`;
  }
  const safeAlt = escapeHtmlSafely(alt);
  return `
    <figure class="ws-embed-figure">
      <img src="${escapeHtmlSafely(safeUrl)}" alt="${safeAlt}" ${widthStyle} loading="lazy" decoding="async" />
      ${safeAlt && safeAlt.toLowerCase() !== 'image' ? `<figcaption class="ws-embed-caption">${safeAlt}</figcaption>` : ''}
    </figure>
  `;
}

/**
 * Detects standalone embed lines:
 * - @[web](url), @[web|520](url), @[iframe](url), @[embed](url)
 * - @[video](url), @[video|Caption](url)
 * - @[audio](url), @[audio|Title](url)
 * - ![web](url), ![iframe](url), ![embed](url)
 * - ![caption](video_or_audio_or_youtube_or_image_url)
 * - ![[https://...]] (Obsidian external media embed)
 * - <iframe src="https://..."></iframe> (safe sanitized iframe)
 */
function wsTryRenderBlockEmbed(trimmedLine) {
  // 1. Explicit @[type|opt](url)
  const explicitMatch = trimmedLine.match(/^@\[(web|iframe|embed|video|audio|image)(?:\|([^\]]+))?\]\(([^)\s]+)\)$/i);
  if (explicitMatch) {
    const kind = explicitMatch[1].toLowerCase();
    const opt = (explicitMatch[2] || '').trim();
    const url = explicitMatch[3].trim();
    if (kind === 'video') return wsRenderVideoEmbedHtml(url, opt);
    if (kind === 'audio') return wsRenderAudioEmbedHtml(url, opt);
    if (kind === 'image') return wsRenderImageEmbedHtml(url, opt);
    const h = /^\d{3,4}$/.test(opt) ? Number(opt) : 460;
    const lbl = /^\d{3,4}$/.test(opt) ? '' : opt;
    return wsRenderWebEmbedHtml(url, h, lbl);
  }

  // 2. Standard Markdown ![alt](url) on its own line (auto-detects web/video/audio/image)
  const mdMediaMatch = trimmedLine.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
  if (mdMediaMatch) {
    const alt = mdMediaMatch[1].trim();
    const altLower = alt.toLowerCase();
    const url = mdMediaMatch[2].trim();
    if (/^(web|iframe|embed)(?:\|\d{3,4})?$/i.test(altLower)) {
      const hPart = altLower.split('|')[1];
      return wsRenderWebEmbedHtml(url, hPart ? Number(hPart) : 460);
    }
    if (altLower === 'video' || wsIsDirectVideoUrl(url) || wsGetVideoIframeSrc(url)) {
      return wsRenderVideoEmbedHtml(url, altLower === 'video' ? '' : alt);
    }
    if (altLower === 'audio' || wsIsAudioUrl(url)) {
      return wsRenderAudioEmbedHtml(url, altLower === 'audio' ? '' : alt);
    }
    return wsRenderImageEmbedHtml(url, alt);
  }

  // 3. Obsidian ![[https://...]] or ![[https://...|opt]]
  const obsEmbedMatch = trimmedLine.match(/^!\[\[(https?:\/\/[^\]|]+)(?:\|([^\]]+))?\]\]$/i);
  if (obsEmbedMatch) {
    const url = obsEmbedMatch[1].trim();
    const opt = (obsEmbedMatch[2] || '').trim();
    if (wsIsDirectVideoUrl(url) || wsGetVideoIframeSrc(url)) return wsRenderVideoEmbedHtml(url, opt);
    if (wsIsAudioUrl(url)) return wsRenderAudioEmbedHtml(url, opt);
    if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)) return wsRenderImageEmbedHtml(url, opt ? `|${opt}` : '');
    const h = /^\d{3,4}$/.test(opt) ? Number(opt) : 460;
    return wsRenderWebEmbedHtml(url, h);
  }

  // 4. Safe raw <iframe src="https://..." ...></iframe>
  const iframeTagMatch = trimmedLine.match(/^<iframe\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>(?:<\/iframe>)?$/i);
  if (iframeTagMatch) {
    const src = iframeTagMatch[1];
    const hMatch = trimmedLine.match(/\bheight=["']?(\d{3,4})["']?/i);
    return wsRenderWebEmbedHtml(src, hMatch ? Number(hMatch[1]) : 460);
  }

  return null;
}

/**
 * Self-contained Markdown + Obsidian [[Wikilink]] Renderer for Reading Mode.
 */
function wsRenderInlineMarkdown(raw) {
  let s = escapeHtmlSafely(raw || '');

  // Inline code (protect contents)
  const codeTokens = [];
  s = s.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code>${code}</code>`);
    return `@@CODE_${idx}@@`;
  });

  // Obsidian [[Wikilinks]] and [[Note|Alias]] — tokenized so special chars (', ", &, *, #) never break HTML/JS
  const wikilinkTokens = [];
  s = s.replace(/(!?)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (full, bang, target, alias) => {
    if (bang === '!') return full;
    const rawTarget = wsDecodeHtmlEntities(target).trim();
    const rawLabel = (alias ? wsDecodeHtmlEntities(alias) : rawTarget).trim();
    if (!rawTarget) return full;

    const existing = wsFindNoteByTitle(rawTarget);
    const exists = Boolean(existing);
    const safeLabelHtml = escapeHtmlSafely(rawLabel);
    const safeTargetAttr = wsEscapeAttr(rawTarget);
    const safeTitleAttr = wsEscapeAttr(exists ? `Open note: ${existing.title}` : `Create note: ${rawTarget}`);

    const idx = wikilinkTokens.length;
    if (!exists && !isAuthorAuthenticated) {
      wikilinkTokens.push(`<span class="ws-wikilink is-unresolved" title="Note not yet published">${safeLabelHtml}</span>`);
    } else {
      wikilinkTokens.push(
        `<span role="button" tabindex="0" data-wikilink="${safeTargetAttr}" data-wikilink-id="${existing ? existing.id : ''}" onclick="wsFollowWikilinkEl(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();wsFollowWikilinkEl(this);}" class="ws-wikilink ${exists ? '' : 'is-unresolved'}" title="${safeTitleAttr}">${safeLabelHtml}</span>`
      );
    }
    return `@@WIKILINK_${idx}@@`;
  });

  // Inline images ![alt](url)
  s = s.replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\.\/)[^\s)]+)\)/g, (_m, alt, url) => {
    const safeUrl = wsSanitizeEmbedUrl(wsDecodeHtmlEntities(url));
    if (!safeUrl) return '';
    const rawAlt = wsDecodeHtmlEntities(alt);
    if (wsIsAudioUrl(safeUrl)) return wsRenderAudioEmbedHtml(safeUrl, rawAlt);
    if (wsIsDirectVideoUrl(safeUrl) || wsGetVideoIframeSrc(safeUrl)) return wsRenderVideoEmbedHtml(safeUrl, rawAlt);
    return `<img src="${wsEscapeAttr(safeUrl)}" alt="${wsEscapeAttr(rawAlt)}" class="max-w-full rounded-xl border border-white/10 my-2 inline-block" loading="lazy" />`;
  });

  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
    const safeUrl = wsSanitizeEmbedUrl(wsDecodeHtmlEntities(url));
    if (!safeUrl) return label;
    return `<a href="${wsEscapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer" class="ws-ext-link">${label}</a>`;
  });

  // Highlight ==text==
  s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');

  // Bold & Italic & Strikethrough
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-[#f6f1e3] font-semibold">$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del class="opacity-55">$1</del>');

  // Tags #tag
  s = s.replace(/(^|\s)#([a-zA-Z0-9_/-]+)/g, '$1<span class="ws-tag-pill">#$2</span>');

  // Restore wikilinks & inline code tokens
  s = s.replace(/@@WIKILINK_(\d+)@@/g, (_m, idx) => wikilinkTokens[Number(idx)] || '');
  s = s.replace(/@@CODE_(\d+)@@/g, (_m, idx) => codeTokens[Number(idx)] || '');
  return s;
}

function wsRenderMarkdown(mdText) {
  const lines = (mdText || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inCode = false;
  let codeBuf = [];
  let listType = null; // 'ul' | 'ol'
  const canToggleTask = Boolean(isAuthorAuthenticated);

  function closeList() {
    if (listType) {
      out.push(listType === 'ul' ? '</ul>' : '</ol>');
      listType = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code blocks
    if (/^```/.test(trimmed)) {
      closeList();
      if (!inCode) {
        inCode = true;
        codeBuf = [];
      } else {
        inCode = false;
        out.push(`<pre><code>${escapeHtmlSafely(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // Empty line
    if (!trimmed) {
      closeList();
      continue;
    }

    // Standalone Rich Embeds (Webpage iframe, Video, Audio, Image)
    const embedHtml = wsTryRenderBlockEmbed(trimmed);
    if (embedHtml) {
      closeList();
      out.push(embedHtml);
      continue;
    }

    // Horizontal rule
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      closeList();
      out.push('<hr />');
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      closeList();
      const lvl = hMatch[1].length;
      out.push(`<h${lvl}>${wsRenderInlineMarkdown(hMatch[2])}</h${lvl}>`);
      continue;
    }

    // Markdown Tables
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
      closeList();
      const splitTableRow = (rowStr) => rowStr.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const headers = splitTableRow(line);
      i += 1;
      const rows = [];
      while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim()) {
        i += 1;
        rows.push(splitTableRow(lines[i]));
      }
      out.push(`<table><thead><tr>${headers.map(h => `<th>${wsRenderInlineMarkdown(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${wsRenderInlineMarkdown(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }

    // Blockquotes & Obsidian callouts
    if (/^>\s?/.test(line)) {
      closeList();
      const quoteLines = [];
      let j = i;
      while (j < lines.length && /^>\s?/.test(lines[j])) {
        quoteLines.push(lines[j].replace(/^>\s?/, ''));
        j += 1;
      }
      i = j - 1;
      const calloutMatch = quoteLines[0].match(/^\[!(\w+)\]\s*(.*)$/i);
      if (calloutMatch) {
        const title = calloutMatch[2] || calloutMatch[1].toUpperCase();
        const rest = quoteLines.slice(1).map(l => `<p>${wsRenderInlineMarkdown(l)}</p>`).join('');
        out.push(`<blockquote><div class="font-mono-code text-xs uppercase tracking-wider text-[#e4d4a7] not-italic mb-1">✦ ${escapeHtmlSafely(title)}</div>${rest}</blockquote>`);
      } else {
        out.push(`<blockquote>${quoteLines.map(l => `<p>${wsRenderInlineMarkdown(l)}</p>`).join('')}</blockquote>`);
      }
      continue;
    }

    // Task list item (checkbox disabled for visitors)
    const taskMatch = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        out.push('<ul>');
      }
      const checked = taskMatch[1].toLowerCase() === 'x';
      out.push(`<li class="ws-task-item"><input type="checkbox" ${checked ? 'checked' : ''} ${canToggleTask ? `onchange="wsToggleTaskCheckbox(${i})"` : 'disabled'} /><span class="${checked ? 'line-through opacity-55' : ''}">${wsRenderInlineMarkdown(taskMatch[2])}</span></li>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        out.push('<ul>');
      }
      out.push(`<li>${wsRenderInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        out.push('<ol>');
      }
      out.push(`<li>${wsRenderInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${wsRenderInlineMarkdown(line)}</p>`);
  }

  closeList();
  if (inCode && codeBuf.length > 0) {
    out.push(`<pre><code>${escapeHtmlSafely(codeBuf.join('\n'))}</code></pre>`);
  }

  return out.length > 0 ? out.join('') : '<p class="text-white/35 italic">This note is empty.</p>';
}

/* ========================================================================
   CRUD ACTIONS (SMOOTH SIDEBAR + STRICT ADMIN GUARDS FOR ALL MUTATIONS)
   ======================================================================== */
function wsToggleSidebar() {
  const vault = wsLoadVault();
  vault.sidebarOpen = !vault.sidebarOpen;
  if (window.innerWidth >= 768) {
    wsSaveUiPrefs();
  }

  const sidebarEl = document.getElementById('ws-sidebar-pane');
  const backdropEl = document.getElementById('ws-mobile-backdrop');
  const btnEl = document.getElementById('ws-ribbon-sidebar-btn');
  if (sidebarEl) {
    sidebarEl.classList.toggle('is-collapsed', !vault.sidebarOpen);
    if (backdropEl) {
      backdropEl.classList.toggle('is-open', vault.sidebarOpen);
    }
    if (btnEl) {
      btnEl.classList.toggle('is-active', vault.sidebarOpen);
      btnEl.title = vault.sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar';
      btnEl.setAttribute('aria-label', btnEl.title);
    }
    return;
  }
  wsRenderWorkspace();
}

function wsToggleFullscreen(forceState, fromPopstate = false, skipHistoryPop = false) {
  const prevState = wsIsFullscreen;
  wsIsFullscreen = typeof forceState === 'boolean' ? forceState : !wsIsFullscreen;
  if (!prevState && wsIsFullscreen && typeof pushOverlayHistoryMarker === 'function') {
    pushOverlayHistoryMarker('ws-fullscreen');
  } else if (prevState && !wsIsFullscreen) {
    if (fromPopstate || skipHistoryPop) {
      if (typeof discardOverlayHistoryMarker === 'function') discardOverlayHistoryMarker('ws-fullscreen');
    } else if (typeof popOverlayHistoryMarker === 'function') {
      popOverlayHistoryMarker('ws-fullscreen');
    }
  }
  const root = document.getElementById('ws-obsidian-root');
  if (root) {
    root.classList.toggle('is-fullscreen', wsIsFullscreen);
  }
  document.body.classList.toggle('ws-fullscreen-lock', wsIsFullscreen);

  const fsBtn = document.getElementById('ws-fullscreen-btn');
  if (fsBtn) {
    fsBtn.title = wsIsFullscreen ? 'Exit Fullscreen (Esc)' : 'Expand Fullscreen';
    fsBtn.setAttribute('aria-label', fsBtn.title);
    fsBtn.innerHTML = wsIsFullscreen
      ? `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`
      : `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
  }

  if (typeof butterflyEl !== 'undefined' && butterflyEl) {
    if (wsIsFullscreen) {
      butterflyEl.style.opacity = '0';
      if (typeof butterflyBubbleEl !== 'undefined' && butterflyBubbleEl) {
        butterflyBubbleEl.classList.remove('is-visible');
      }
    } else if (typeof currentView !== 'undefined' && currentView === 'chapter' && !wsGraphOpen) {
      setTimeout(() => syncButterflyToCloseButton(false), 60);
    }
  }
}

function wsRenderSidebarOnly() {
  const inner = document.querySelector('#ws-sidebar-pane .ws-sidebar-inner');
  if (!inner) {
    wsRenderWorkspace();
    return;
  }
  const vault = wsLoadVault();
  const canEdit = Boolean(isAuthorAuthenticated);
  const scrollEl = document.getElementById('ws-sidebar-scroll');
  const prevScroll = scrollEl ? scrollEl.scrollTop : 0;
  inner.innerHTML = wsBuildSidebarHtml(vault, canEdit);
  const nextScroll = document.getElementById('ws-sidebar-scroll');
  if (nextScroll) nextScroll.scrollTop = prevScroll;
}

function wsSwitchSidebarTab(tab, ensureOpen = false) {
  const vault = wsLoadVault();
  vault.sidebarTab = tab;
  if (ensureOpen) vault.sidebarOpen = true;
  wsSaveUiPrefs();
  if (ensureOpen) {
    wsRenderWorkspace();
  } else {
    wsRenderSidebarOnly();
  }
  if (tab === 'search') {
    const inp = document.getElementById('ws-sidebar-search-input');
    if (inp) inp.focus();
  }
}

function wsUpdateSearchQuery(val) {
  const vault = wsLoadVault();
  vault.searchQuery = val || '';
  const resultsEl = document.getElementById('ws-sidebar-scroll');
  if (vault.sidebarTab === 'search' && resultsEl) {
    resultsEl.innerHTML = wsBuildSearchResultsHtml(vault);
    resultsEl.scrollTop = 0;
  } else {
    wsRenderSidebarOnly();
  }
}

function wsCycleSortOrder() {
  const vault = wsLoadVault();
  const order = ['manual', 'asc', 'desc', 'recent'];
  const curIdx = order.indexOf(vault.sortOrder);
  vault.sortOrder = order[(curIdx + 1) % order.length];
  if (vault.sortOrder !== 'manual') {
    wsReorderMode = false;
  }
  wsSaveUiPrefs();
  if (isAuthorAuthenticated) {
    wsSaveVault(true);
  }
  wsRenderSidebarOnly();
}

function wsToggleReorderMode() {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  wsReorderMode = !wsReorderMode;
  if (wsReorderMode && vault.sortOrder !== 'manual') {
    wsBakeCurrentSortIntoManualOrder(vault);
    wsSaveVault(true);
  }
  wsRenderSidebarOnly();
}

function wsToggleAllFolders() {
  const vault = wsLoadVault();
  const allCollapsed = vault.folders.every(f => f.collapsed);
  vault.folders.forEach(f => { f.collapsed = !allCollapsed; });
  if (isAuthorAuthenticated) wsSaveVault(false);
  wsRenderSidebarOnly();
}

function wsToggleFolder(folderId) {
  const vault = wsLoadVault();
  const f = vault.folders.find(x => x.id === folderId);
  if (!f) return;
  f.collapsed = !f.collapsed;
  if (isAuthorAuthenticated) wsSaveVault(false);
  wsRenderSidebarOnly();
}

function wsCreateNote(folderId = null) {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  const title = wsGetUniqueNoteTitle('Untitled');
  const newNote = {
    id: `ws-n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    folderId: folderId || null,
    bookmarked: false,
    updatedAt: Date.now(),
    content: ''
  };
  if (folderId) {
    const f = vault.folders.find(x => x.id === folderId);
    if (f) f.collapsed = false;
  }
  vault.notes.unshift(newNote);
  if (!vault.openTabIds.includes(newNote.id)) {
    vault.openTabIds.push(newNote.id);
  }
  vault.activeNoteId = newNote.id;
  vault.mode = 'edit';
  vault.sidebarTab = 'files';
  wsSaveVault(true);
  wsRenderWorkspace();
  const titleInp = document.getElementById('ws-note-title-input');
  if (titleInp) {
    titleInp.focus();
    titleInp.select();
  }
}

function wsStartNewFolder() {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  vault.sidebarTab = 'files';
  vault.sidebarOpen = true;
  wsNewFolderDraft = true;
  wsRenderWorkspace();
}

function wsHandleNewFolderKey(event) {
  if (!isAuthorAuthenticated) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    wsCommitNewFolder(event.target.value);
  } else if (event.key === 'Escape') {
    wsNewFolderDraft = false;
    wsRenderWorkspace();
  }
}

function wsCommitNewFolder(rawName) {
  if (!isAuthorAuthenticated || !wsNewFolderDraft) return;
  wsNewFolderDraft = false;
  const name = (rawName || '').trim();
  if (name) {
    const vault = wsLoadVault();
    vault.folders.push({
      id: `ws-f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      collapsed: false
    });
    wsSaveVault(true);
  }
  wsRenderWorkspace();
}

function wsOpenNote(noteId) {
  const vault = wsLoadVault();
  const note = vault.notes.find(n => n.id === noteId);
  if (!note) return;
  const changed = vault.activeNoteId !== note.id;
  vault.activeNoteId = note.id;
  if (!vault.openTabIds.includes(note.id)) {
    vault.openTabIds.push(note.id);
  }
  if (window.innerWidth < 768 && vault.sidebarOpen) {
    vault.sidebarOpen = false;
  }
  if (typeof currentView !== 'undefined' && currentView === 'chapter' && typeof activeBookId !== 'undefined' && activeBookId !== 'work' && typeof switchChapterDirectly === 'function') {
    switchChapterDirectly('work');
    return;
  }
  wsRenderWorkspace({ resetContentScroll: changed });
  if (typeof syncRouteHash === 'function') syncRouteHash();
  if (typeof updateDocumentTitle === 'function') updateDocumentTitle();
}

function wsCloseTab(noteId) {
  const vault = wsLoadVault();
  const idx = vault.openTabIds.indexOf(noteId);
  if (idx === -1) return;
  vault.openTabIds.splice(idx, 1);
  if (vault.activeNoteId === noteId) {
    vault.activeNoteId = vault.openTabIds[idx] || vault.openTabIds[idx - 1] || null;
  }
  wsRenderWorkspace({ resetContentScroll: true });
  if (typeof syncRouteHash === 'function') syncRouteHash();
  if (typeof updateDocumentTitle === 'function') updateDocumentTitle();
}

function wsToggleEditorMode() {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  vault.mode = vault.mode === 'preview' ? 'edit' : 'preview';
  wsEmbedInsertType = null;
  wsSaveUiPrefs();
  wsRenderWorkspace();
}

function wsToggleBookmark(noteId) {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  const note = vault.notes.find(n => n.id === noteId);
  if (!note) return;
  note.bookmarked = !note.bookmarked;
  wsSaveVault(true);
  wsRenderWorkspace();
}

function wsRenameNote(noteId, rawNewTitle) {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  const note = vault.notes.find(n => n.id === noteId);
  if (!note) return;
  const newTitle = (rawNewTitle || '').trim();
  if (!newTitle || newTitle === note.title) {
    wsRenderWorkspace();
    return;
  }
  const oldTitle = note.title;
  note.title = newTitle;
  note.updatedAt = Date.now();

  // Automatically update [[Old Title]] references across all notes
  const escapedOld = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linkRe = new RegExp(`\\[\\[${escapedOld}(\\|[^\\]]+)?\\]\\]`, 'gi');
  vault.notes.forEach(n => {
    if (n.content && linkRe.test(n.content)) {
      n.content = n.content.replace(linkRe, (_m, alias) => `[[${newTitle}${alias || ''}]]`);
    }
  });

  wsSaveVault(true);
  wsRenderWorkspace();
}

function wsDeleteNote(noteId) {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  const idx = vault.notes.findIndex(n => n.id === noteId);
  if (idx === -1) return;
  vault.notes.splice(idx, 1);
  const tabIdx = vault.openTabIds.indexOf(noteId);
  if (tabIdx !== -1) vault.openTabIds.splice(tabIdx, 1);
  if (vault.activeNoteId === noteId) {
    vault.activeNoteId = vault.openTabIds[tabIdx] || vault.openTabIds[tabIdx - 1] || (vault.notes[0] ? vault.notes[0].id : null);
  }
  wsSaveVault(true);
  wsRenderWorkspace();
}

function wsDeleteFolder(folderId) {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  vault.notes.forEach(n => {
    if (n.folderId === folderId) n.folderId = null;
  });
  vault.folders = vault.folders.filter(f => f.id !== folderId);
  wsSaveVault(true);
  wsRenderWorkspace();
}

function wsStartInlineRename(type, id) {
  if (!isAuthorAuthenticated) return;
  wsHideContextMenu();
  wsRenameTarget = { type, id };
  wsRenderWorkspace();
}

function wsHandleInlineRenameKey(event) {
  if (!isAuthorAuthenticated) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    wsCommitInlineRename(event.target.value);
  } else if (event.key === 'Escape') {
    wsRenameTarget = null;
    wsRenderWorkspace();
  }
}

function wsCommitInlineRename(rawVal) {
  if (!isAuthorAuthenticated || !wsRenameTarget) return;
  const target = wsRenameTarget;
  wsRenameTarget = null;
  const val = (rawVal || '').trim();
  if (!val) {
    wsRenderWorkspace();
    return;
  }
  if (target.type === 'note') {
    wsRenameNote(target.id, val);
  } else if (target.type === 'folder') {
    const vault = wsLoadVault();
    const f = vault.folders.find(x => x.id === target.id);
    if (f) {
      f.name = val;
      wsSaveVault(true);
    }
    wsRenderWorkspace();
  }
}

function wsMoveNoteToFolder(noteId, folderId) {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  const note = vault.notes.find(n => n.id === noteId);
  if (!note) return;
  note.folderId = folderId || null;
  if (folderId) {
    const f = vault.folders.find(x => x.id === folderId);
    if (f) f.collapsed = false;
  }
  wsSaveVault(true);
  wsCloseMoveModal();
  wsRenderWorkspace();
}

function wsOpenMoveModal(noteId) {
  if (!isAuthorAuthenticated) return;
  wsHideContextMenu();
  const vault = wsLoadVault();
  const note = vault.notes.find(n => n.id === noteId);
  if (!note) return;
  wsMoveNoteId = noteId;

  const modal = document.getElementById('ws-move-modal');
  const titleEl = document.getElementById('ws-move-modal-title');
  const listEl = document.getElementById('ws-move-folder-list');
  if (!modal || !listEl) return;

  if (titleEl) titleEl.textContent = `Move "${note.title}"`;
  const options = [
    { id: null, label: '/ Root Vault' },
    ...vault.folders.map(f => ({ id: f.id, label: `📁 ${f.name}` }))
  ];

  listEl.innerHTML = options.map(opt => {
    const isCurrent = (note.folderId || null) === opt.id;
    return `
      <button
        type="button"
        onclick="wsMoveNoteToFolder('${note.id}', ${opt.id ? `'${opt.id}'` : 'null'})"
        class="w-full text-left px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between transition cursor-pointer ${
          isCurrent
            ? 'border-[#e4d4a7]/50 bg-[#e4d4a7]/15 text-[#e4d4a7]'
            : 'border-white/10 bg-white/[0.03] hover:border-[#e4d4a7]/40 text-white/80 hover:text-white'
        }"
      >
        <span class="truncate">${escapeHtmlSafely(opt.label)}</span>
        ${isCurrent ? '<span class="font-mono-code text-[10px]">Current</span>' : ''}
      </button>
    `;
  }).join('');

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function wsCloseMoveModal() {
  wsMoveNoteId = null;
  const modal = document.getElementById('ws-move-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function wsShowContextMenu(event, type, id) {
  if (!isAuthorAuthenticated) return;
  event.preventDefault();
  event.stopPropagation();
  const menu = document.getElementById('ws-context-menu');
  if (!menu) return;

  const vault = wsLoadVault();
  wsContextTarget = { type, id };

  if (type === 'note') {
    const note = vault.notes.find(n => n.id === id);
    if (!note) return;
    const siblings = wsSortNotes(vault.notes.filter(n => (n.folderId || null) === (note.folderId || null)));
    const sibIdx = siblings.findIndex(n => n.id === id);
    const canUp = sibIdx > 0;
    const canDown = sibIdx >= 0 && sibIdx < siblings.length - 1;
    menu.innerHTML = `
      <button type="button" onclick="wsHideContextMenu(); wsMoveItemStep('note', '${id}', -1)" ${canUp ? '' : 'disabled'} class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.08] text-white/85 flex items-center gap-2 cursor-pointer ${canUp ? '' : 'opacity-55'}">
        <span>↑</span><span>Move Up</span>
      </button>
      <button type="button" onclick="wsHideContextMenu(); wsMoveItemStep('note', '${id}', 1)" ${canDown ? '' : 'disabled'} class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.08] text-white/85 flex items-center gap-2 cursor-pointer ${canDown ? '' : 'opacity-55'}">
        <span>↓</span><span>Move Down</span>
      </button>
      <div class="my-1 border-t border-white/10"></div>
      <button type="button" onclick="wsOpenMoveModal('${id}')" class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.08] text-white/85 flex items-center gap-2 cursor-pointer">
        <span>↗</span><span>Move to Folder</span>
      </button>
      <button type="button" onclick="wsStartInlineRename('note', '${id}')" class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.08] text-white/85 flex items-center gap-2 cursor-pointer">
        <span>✎</span><span>Rename</span>
      </button>
      <button type="button" onclick="wsHideContextMenu(); wsToggleBookmark('${id}')" class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.08] text-[#e4d4a7] flex items-center gap-2 cursor-pointer">
        <span>${note.bookmarked ? '☆' : '★'}</span><span>${note.bookmarked ? 'Remove Bookmark' : 'Bookmark'}</span>
      </button>
      <div class="my-1 border-t border-white/10"></div>
      <button type="button" onclick="wsHideContextMenu(); wsDeleteNote('${id}')" class="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-500/20 text-rose-300 flex items-center gap-2 cursor-pointer">
        <span>🗑</span><span>Delete Note</span>
      </button>
    `;
  } else {
    const folders = wsSortFolders(vault.folders);
    const fIdx = folders.findIndex(f => f.id === id);
    const canUp = fIdx > 0;
    const canDown = fIdx >= 0 && fIdx < folders.length - 1;
    menu.innerHTML = `
      <button type="button" onclick="wsHideContextMenu(); wsMoveItemStep('folder', '${id}', -1)" ${canUp ? '' : 'disabled'} class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.08] text-white/85 flex items-center gap-2 cursor-pointer ${canUp ? '' : 'opacity-55'}">
        <span>↑</span><span>Move Up</span>
      </button>
      <button type="button" onclick="wsHideContextMenu(); wsMoveItemStep('folder', '${id}', 1)" ${canDown ? '' : 'disabled'} class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.08] text-white/85 flex items-center gap-2 cursor-pointer ${canDown ? '' : 'opacity-55'}">
        <span>↓</span><span>Move Down</span>
      </button>
      <div class="my-1 border-t border-white/10"></div>
      <button type="button" onclick="wsHideContextMenu(); wsCreateNote('${id}')" class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.08] text-[#e4d4a7] flex items-center gap-2 cursor-pointer">
        <span>＋</span><span>New Note Here</span>
      </button>
      <button type="button" onclick="wsStartInlineRename('folder', '${id}')" class="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.08] text-white/85 flex items-center gap-2 cursor-pointer">
        <span>✎</span><span>Rename Folder</span>
      </button>
      <div class="my-1 border-t border-white/10"></div>
      <button type="button" onclick="wsHideContextMenu(); wsDeleteFolder('${id}')" class="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-500/20 text-rose-300 flex items-center gap-2 cursor-pointer">
        <span>🗑</span><span>Delete Folder</span>
      </button>
    `;
  }

  menu.classList.remove('hidden');
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = 196;
  const mh = 250;
  const x = Math.min(event.clientX, vw - mw - 12);
  const y = Math.min(event.clientY, vh - mh - 12);
  menu.style.left = `${Math.max(8, x)}px`;
  menu.style.top = `${Math.max(8, y)}px`;
}

function wsHideContextMenu() {
  const menu = document.getElementById('ws-context-menu');
  if (menu) menu.classList.add('hidden');
  wsContextTarget = null;
}

function wsClearDropHighlight(el) {
  if (!el || !el.classList) return;
  el.classList.remove('is-drag-over', 'is-drop-before', 'is-drop-after');
}

function wsClearAllDragHighlights() {
  document.querySelectorAll('.ws-tree-item, #ws-sidebar-scroll').forEach(node => {
    node.classList.remove('is-dragging', 'is-drag-over', 'is-drop-before', 'is-drop-after');
  });
}

function wsHandleTreeDragEnd() {
  wsDragItem = null;
  wsClearAllDragHighlights();
}

function wsHandleNoteDragStart(event, noteId, el) {
  if (!isAuthorAuthenticated) return;
  event.stopPropagation();
  wsDragItem = { type: 'note', id: noteId };
  if (el && el.classList) el.classList.add('is-dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `note:${noteId}`);
  }
}

function wsHandleFolderDragStart(event, folderId, el) {
  if (!isAuthorAuthenticated) return;
  event.stopPropagation();
  wsDragItem = { type: 'folder', id: folderId };
  if (el && el.classList) el.classList.add('is-dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `folder:${folderId}`);
  }
}

function wsHandleNoteDragOver(event, targetNoteId, el) {
  if (!isAuthorAuthenticated || !wsDragItem || wsDragItem.type !== 'note') return;
  if (wsDragItem.id === targetNoteId) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = el.getBoundingClientRect();
  const pos = (event.clientY - rect.top) < rect.height * 0.5 ? 'before' : 'after';
  el.classList.toggle('is-drop-before', pos === 'before');
  el.classList.toggle('is-drop-after', pos === 'after');
}

function wsHandleNoteDrop(event, targetNoteId, el) {
  if (!isAuthorAuthenticated || !wsDragItem || wsDragItem.type !== 'note') return;
  event.preventDefault();
  event.stopPropagation();
  const rect = el.getBoundingClientRect();
  const pos = (event.clientY - rect.top) < rect.height * 0.5 ? 'before' : 'after';
  const draggedId = wsDragItem.id;
  wsHandleTreeDragEnd();
  if (draggedId === targetNoteId) return;
  wsReorderNoteRelative(draggedId, targetNoteId, pos);
}

function wsHandleFolderDragOver(event, targetFolderId, el) {
  if (!isAuthorAuthenticated || !wsDragItem) return;
  if (wsDragItem.type === 'folder') {
    if (wsDragItem.id === targetFolderId) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = el.getBoundingClientRect();
    const pos = (event.clientY - rect.top) < rect.height * 0.5 ? 'before' : 'after';
    el.classList.remove('is-drag-over');
    el.classList.toggle('is-drop-before', pos === 'before');
    el.classList.toggle('is-drop-after', pos === 'after');
    return;
  }
  if (wsDragItem.type === 'note') {
    event.preventDefault();
    event.stopPropagation();
    el.classList.remove('is-drop-before', 'is-drop-after');
    el.classList.add('is-drag-over');
  }
}

function wsHandleFolderDrop(event, targetFolderId, el) {
  if (!isAuthorAuthenticated || !wsDragItem) return;
  event.preventDefault();
  event.stopPropagation();
  const dragged = wsDragItem;
  const rect = el.getBoundingClientRect();
  const pos = (event.clientY - rect.top) < rect.height * 0.5 ? 'before' : 'after';
  wsHandleTreeDragEnd();

  if (dragged.type === 'folder') {
    if (dragged.id !== targetFolderId) {
      wsReorderFolderRelative(dragged.id, targetFolderId, pos);
    }
    return;
  }
  if (dragged.type === 'note') {
    const vault = wsLoadVault();
    wsBakeCurrentSortIntoManualOrder(vault);
    const noteIdx = vault.notes.findIndex(n => n.id === dragged.id);
    if (noteIdx === -1) return;
    const [note] = vault.notes.splice(noteIdx, 1);
    note.folderId = targetFolderId || null;
    if (targetFolderId) {
      const f = vault.folders.find(x => x.id === targetFolderId);
      if (f) f.collapsed = false;
    }
    // Insert at the end of the target folder's notes
    let insertAt = vault.notes.length;
    for (let i = vault.notes.length - 1; i >= 0; i--) {
      if ((vault.notes[i].folderId || null) === (targetFolderId || null)) {
        insertAt = i + 1;
        break;
      }
    }
    vault.notes.splice(insertAt, 0, note);
    vault.sortOrder = 'manual';
    wsSaveVault(true);
    wsRenderWorkspace();
  }
}

function wsHandleRootDragOver(event, el) {
  if (!isAuthorAuthenticated || !wsDragItem || wsDragItem.type !== 'note') return;
  event.preventDefault();
  if (el && el.classList) el.classList.add('is-drag-over');
}

function wsHandleRootDrop(event, el) {
  if (!isAuthorAuthenticated || !wsDragItem || wsDragItem.type !== 'note') return;
  event.preventDefault();
  const draggedId = wsDragItem.id;
  wsHandleTreeDragEnd();
  const vault = wsLoadVault();
  wsBakeCurrentSortIntoManualOrder(vault);
  const idx = vault.notes.findIndex(n => n.id === draggedId);
  if (idx === -1) return;
  const [note] = vault.notes.splice(idx, 1);
  note.folderId = null;
  vault.notes.push(note);
  vault.sortOrder = 'manual';
  wsSaveVault(true);
  wsRenderWorkspace();
}

function wsReorderFolderRelative(draggedFolderId, targetFolderId, position = 'before') {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  wsBakeCurrentSortIntoManualOrder(vault);
  const fromIdx = vault.folders.findIndex(f => f.id === draggedFolderId);
  if (fromIdx === -1) return;
  const [moved] = vault.folders.splice(fromIdx, 1);
  let targetIdx = vault.folders.findIndex(f => f.id === targetFolderId);
  if (targetIdx === -1) {
    vault.folders.push(moved);
  } else {
    if (position === 'after') targetIdx += 1;
    vault.folders.splice(targetIdx, 0, moved);
  }
  vault.sortOrder = 'manual';
  wsSaveVault(true);
  wsRenderWorkspace();
}

function wsReorderNoteRelative(draggedNoteId, targetNoteId, position = 'before') {
  if (!isAuthorAuthenticated) return;
  const vault = wsLoadVault();
  wsBakeCurrentSortIntoManualOrder(vault);
  const fromIdx = vault.notes.findIndex(n => n.id === draggedNoteId);
  const targetNote = vault.notes.find(n => n.id === targetNoteId);
  if (fromIdx === -1 || !targetNote) return;

  const [moved] = vault.notes.splice(fromIdx, 1);
  moved.folderId = targetNote.folderId || null;
  let targetIdx = vault.notes.findIndex(n => n.id === targetNoteId);
  if (targetIdx === -1) {
    vault.notes.push(moved);
  } else {
    if (position === 'after') targetIdx += 1;
    vault.notes.splice(targetIdx, 0, moved);
  }
  vault.sortOrder = 'manual';
  wsSaveVault(true);
  wsRenderWorkspace();
}

function wsMoveItemStep(type, id, direction) {
  if (!isAuthorAuthenticated || (direction !== -1 && direction !== 1)) return;
  const vault = wsLoadVault();
  wsBakeCurrentSortIntoManualOrder(vault);

  if (type === 'folder') {
    const idx = vault.folders.findIndex(f => f.id === id);
    const nextIdx = idx + direction;
    if (idx === -1 || nextIdx < 0 || nextIdx >= vault.folders.length) return;
    const tmp = vault.folders[idx];
    vault.folders[idx] = vault.folders[nextIdx];
    vault.folders[nextIdx] = tmp;
    vault.sortOrder = 'manual';
    wsSaveVault(true);
    wsRenderWorkspace();
    return;
  }

  if (type === 'note') {
    const note = vault.notes.find(n => n.id === id);
    if (!note) return;
    const folderKey = note.folderId || null;
    const siblingIndices = [];
    vault.notes.forEach((n, i) => {
      if ((n.folderId || null) === folderKey) siblingIndices.push(i);
    });
    const posInSibs = siblingIndices.findIndex(i => vault.notes[i].id === id);
    const nextPosInSibs = posInSibs + direction;
    if (posInSibs === -1 || nextPosInSibs < 0 || nextPosInSibs >= siblingIndices.length) return;
    const idxA = siblingIndices[posInSibs];
    const idxB = siblingIndices[nextPosInSibs];
    const tmp = vault.notes[idxA];
    vault.notes[idxA] = vault.notes[idxB];
    vault.notes[idxB] = tmp;
    vault.sortOrder = 'manual';
    wsSaveVault(true);
    wsRenderWorkspace();
  }
}

/* ========================================================================
   BUTTERFLY SWARM TRANSITION & INTERACTIVE KNOWLEDGE GRAPH VIEW
   ======================================================================== */
function wsCreateMiniButterflySvgMarkup(uid) {
  return `
    <div class="butterfly-3d-stage">
      <div class="butterfly-wing-pane wing-left">
        <svg viewBox="0 0 50 100" class="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="wsWingUL_${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fff8e6" stop-opacity="0.96" />
              <stop offset="55%" stop-color="#e4d4a7" stop-opacity="0.92" />
              <stop offset="100%" stop-color="#b89b5e" stop-opacity="0.95" />
            </linearGradient>
            <linearGradient id="wsWingLL_${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f3e7c6" stop-opacity="0.92" />
              <stop offset="100%" stop-color="#9e8249" stop-opacity="0.9" />
            </linearGradient>
          </defs>
          <path d="M48.5 47 C33 17, 6 15, 10 42 C13 55, 33 56, 48.5 52 Z" fill="url(#wsWingUL_${uid})" stroke="#fffdf7" stroke-width="0.85"/>
          <path d="M48.5 52 C33 56, 16 68, 24 82 C31 91, 44 76, 48.5 58 Z" fill="url(#wsWingLL_${uid})" stroke="#fffdf7" stroke-width="0.75"/>
        </svg>
      </div>
      <div class="butterfly-wing-pane wing-right">
        <svg viewBox="50 0 50 100" class="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="wsWingUR_${uid}" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#fff8e6" stop-opacity="0.96" />
              <stop offset="55%" stop-color="#e4d4a7" stop-opacity="0.92" />
              <stop offset="100%" stop-color="#b89b5e" stop-opacity="0.95" />
            </linearGradient>
            <linearGradient id="wsWingLR_${uid}" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#f3e7c6" stop-opacity="0.92" />
              <stop offset="100%" stop-color="#9e8249" stop-opacity="0.9" />
            </linearGradient>
          </defs>
          <path d="M51.5 47 C67 17, 94 15, 90 42 C87 55, 67 56, 51.5 52 Z" fill="url(#wsWingUR_${uid})" stroke="#fffdf7" stroke-width="0.85"/>
          <path d="M51.5 52 C67 56, 84 68, 76 82 C69 91, 56 76, 51.5 58 Z" fill="url(#wsWingLR_${uid})" stroke="#fffdf7" stroke-width="0.75"/>
        </svg>
      </div>
      <div class="butterfly-body-pane">
        <svg viewBox="0 0 100 100" class="w-full h-full overflow-visible">
          <ellipse cx="50" cy="52" rx="1.8" ry="12" fill="#3a2f1d" stroke="#e4d4a7" stroke-width="0.4" />
          <circle cx="50" cy="39.5" r="1.6" fill="#3a2f1d" />
          <path d="M49.2 38.5 Q44 30 40 28 M50.8 38.5 Q56 30 60 28" stroke="#e4d4a7" stroke-width="1" fill="none" stroke-linecap="round"/>
        </svg>
      </div>
    </div>
  `;
}

function wsBuildGraphDataFromVault(stageWidth, stageHeight) {
  const vault = wsLoadVault();
  const titleToId = new Map();
  vault.notes.forEach(n => {
    titleToId.set(wsNormalizeTitleKey(n.title), n.id);
  });

  const edgeSet = new Set();
  const edges = [];
  const degreeMap = new Map();

  vault.notes.forEach(n => {
    const linkedTitles = wsExtractWikilinkTitles(n.content);
    linkedTitles.forEach(lt => {
      const targetId = titleToId.get(wsNormalizeTitleKey(lt));
      if (targetId && targetId !== n.id) {
        const pairKey = [n.id, targetId].sort().join('::');
        if (!edgeSet.has(pairKey)) {
          edgeSet.add(pairKey);
          edges.push({ source: n.id, target: targetId });
          degreeMap.set(n.id, (degreeMap.get(n.id) || 0) + 1);
          degreeMap.set(targetId, (degreeMap.get(targetId) || 0) + 1);
        }
      }
    });
  });

  const cx = stageWidth / 2;
  const cy = stageHeight / 2;
  const count = Math.max(1, vault.notes.length);
  const radius = Math.min(stageWidth, stageHeight) * (count <= 5 ? 0.24 : 0.3);

  const nodes = vault.notes.map((n, idx) => {
    const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
    const deg = degreeMap.get(n.id) || 0;
    return {
      id: n.id,
      title: n.title,
      folderName: wsGetFolderName(n.folderId),
      bookmarked: Boolean(n.bookmarked),
      degree: deg,
      radius: Math.min(13, 6 + deg * 1.45),
      x: cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 30,
      y: cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 30,
      vx: 0,
      vy: 0,
      arrived: false,
      revealAlpha: 0
    };
  });

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  for (let iter = 0; iter < 90; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const distSq = dx * dx + dy * dy + 1;
        const dist = Math.sqrt(distSq);
        const repulse = 4200 / distSq;
        const fx = (dx / dist) * repulse;
        const fy = (dy / dist) * repulse;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }
    edges.forEach(e => {
      const a = nodeById.get(e.source);
      const b = nodeById.get(e.target);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ideal = 135;
      const pull = (dist - ideal) * 0.025;
      const fx = (dx / dist) * pull;
      const fy = (dy / dist) * pull;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    });
    nodes.forEach(n => {
      n.vx += (cx - n.x) * 0.008;
      n.vy += (cy - n.y) * 0.008;
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x = Math.max(70, Math.min(stageWidth - 70, n.x + n.vx));
      n.y = Math.max(70, Math.min(stageHeight - 70, n.y + n.vy));
    });
  }
  nodes.forEach(n => { n.vx = 0; n.vy = 0; });

  return { nodes, edges };
}

function wsCaptureNoteStartCoords(notes) {
  const coords = new Map();
  const fallbackRoot = document.getElementById('ws-obsidian-root');
  const fallbackRect = fallbackRoot ? fallbackRoot.getBoundingClientRect() : { left: 160, top: 240, width: 240, height: 320 };

  notes.forEach((n, idx) => {
    let el = document.querySelector(`[data-ws-note-id="${n.id}"]`);
    if (!el && n.folderId) {
      el = document.querySelector(`[data-ws-folder-id="${n.folderId}"]`);
    }
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        coords.set(n.id, { x: r.left + Math.min(r.width * 0.45, 95), y: r.top + r.height * 0.5 });
        return;
      }
    }
    coords.set(n.id, {
      x: fallbackRect.left + 80 + (idx % 3) * 28,
      y: fallbackRect.top + 90 + (idx * 26) % Math.max(120, fallbackRect.height - 120)
    });
  });
  return coords;
}

function wsOpenGraphView() {
  const overlay = document.getElementById('ws-graph-overlay');
  const stage = document.getElementById('ws-graph-stage');
  const canvas = document.getElementById('ws-graph-canvas');
  const swarmLayer = document.getElementById('ws-butterfly-swarm');
  if (!overlay || !stage || !canvas || !swarmLayer) return;

  const vault = wsLoadVault();
  const startCoords = wsCaptureNoteStartCoords(vault.notes);

  if (butterflyEl) {
    butterflyEl.style.opacity = '0';
    butterflyBubbleEl.classList.remove('is-visible');
  }

  const wasGraphOpen = wsGraphOpen;
  wsGraphOpen = true;
  if (!wasGraphOpen && typeof pushOverlayHistoryMarker === 'function') {
    pushOverlayHistoryMarker('ws-graph');
  }
  wsGraphLinkMode = false;
  wsGraphLinkSourceId = null;
  wsGraphHoverId = null;
  wsGraphSelectedId = null;
  wsGraphCam = { x: 0, y: 0, scale: 1 };
  wsSyncGraphLinkModeUi();
  wsHideGraphNodeCard();

  overlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    overlay.classList.remove('opacity-0');
  });

  const stageRect = stage.getBoundingClientRect();
  const width = stageRect.width || window.innerWidth;
  const height = stageRect.height || (window.innerHeight - 60);
  wsResizeGraphCanvas();

  const built = wsBuildGraphDataFromVault(width, height);
  wsGraphNodes = built.nodes;
  wsGraphEdges = built.edges;
  wsUpdateGraphStatsText();

  wsBindGraphCanvasEventsOnce();
  wsStartGraphRenderLoop();

  // Launch Butterfly Swarm Flight: every note becomes a golden butterfly flying to its Graph dot!
  wsRunButterflyToGraphAnimation(startCoords, stageRect);
}

function wsRunButterflyToGraphAnimation(startCoords, stageRect) {
  const swarmLayer = document.getElementById('ws-butterfly-swarm');
  if (!swarmLayer) return;

  if (wsSwarmAnimFrame) {
    cancelAnimationFrame(wsSwarmAnimFrame);
    wsSwarmAnimFrame = null;
  }

  swarmLayer.innerHTML = '';
  swarmLayer.classList.remove('hidden');

  const offsetLeft = stageRect.left || 0;
  const offsetTop = stageRect.top || 56;

  if (wsGraphNodes.length === 0) {
    swarmLayer.classList.add('hidden');
    return;
  }

  const flyers = wsGraphNodes.map((node, idx) => {
    const start = startCoords.get(node.id) || { x: 140, y: 240 };
    const endX = offsetLeft + node.x;
    const endY = offsetTop + node.y;
    const dx = endX - start.x;
    const dy = endY - start.y;

    const el = document.createElement('div');
    el.className = 'ws-swarm-butterfly';
    el.innerHTML = wsCreateMiniButterflySvgMarkup(`b${idx}_${Date.now() % 9999}`);
    el.style.transform = `translate3d(${start.x - 17}px, ${start.y - 17}px, 0) scale(0.75)`;
    swarmLayer.appendChild(el);

    const delay = Math.min(idx * 42, 320);
    const duration = 1020 + (idx % 4) * 95;
    const arcSign = idx % 2 === 0 ? -1 : 1;

    return {
      node,
      el,
      startX: start.x,
      startY: start.y,
      endX,
      endY,
      cp1x: start.x + dx * 0.3 + arcSign * (55 + (idx % 3) * 28),
      cp1y: Math.min(start.y, endY) - 70 - (idx % 3) * 24,
      cp2x: start.x + dx * 0.72 - arcSign * 38,
      cp2y: endY - 36 + arcSign * 26,
      delay,
      duration,
      prevX: start.x,
      prevY: start.y,
      lastSparkMs: 0,
      done: false
    };
  });

  const t0 = performance.now();

  function tick(now) {
    if (!wsGraphOpen) {
      swarmLayer.innerHTML = '';
      swarmLayer.classList.add('hidden');
      wsSwarmAnimFrame = null;
      return;
    }

    let allDone = true;

    flyers.forEach(f => {
      if (f.done) return;
      const elapsed = now - t0 - f.delay;
      if (elapsed < 0) {
        allDone = false;
        return;
      }

      const rawT = Math.min(elapsed / f.duration, 1);
      const t = rawT < 0.5
        ? 4 * rawT * rawT * rawT
        : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
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
        Math.sin(rawT * Math.PI * 4) * (1 - rawT) * 11;

      const vx = x - f.prevX;
      const vy = y - f.prevY;
      const angle = Math.max(-34, Math.min(34, (Math.atan2(vy, vx) * 180) / Math.PI * 0.35));
      f.prevX = x;
      f.prevY = y;

      const scale = rawT < 0.15
        ? 0.65 + (rawT / 0.15) * 0.45
        : (rawT > 0.82 ? Math.max(0.28, 1.1 - ((rawT - 0.82) / 0.18) * 0.82) : 1.05);
      const opacity = rawT > 0.84 ? Math.max(0, 1 - (rawT - 0.84) / 0.16) : 1;

      f.el.style.transform = `translate3d(${x - 17}px, ${y - 17}px, 0) rotate(${angle.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      f.el.style.opacity = opacity.toFixed(2);

      if (rawT > 0.08 && rawT < 0.88 && now - f.lastSparkMs > 95) {
        f.lastSparkMs = now;
        const spark = document.createElement('div');
        spark.className = 'ws-spark-dot';
        spark.style.left = `${x}px`;
        spark.style.top = `${y}px`;
        swarmLayer.appendChild(spark);
        setTimeout(() => spark.remove(), 660);
      }

      if (rawT >= 1) {
        f.done = true;
        f.el.remove();
        f.node.arrived = true;
        f.node.revealAlpha = 0.05;

        const ring = document.createElement('div');
        ring.className = 'ws-morph-ring';
        ring.style.left = `${f.endX}px`;
        ring.style.top = `${f.endY}px`;
        swarmLayer.appendChild(ring);
        setTimeout(() => ring.remove(), 580);
      } else {
        allDone = false;
      }
    });

    if (!allDone) {
      wsSwarmAnimFrame = requestAnimationFrame(tick);
    } else {
      wsSwarmAnimFrame = null;
      setTimeout(() => {
        if (!wsSwarmAnimFrame) {
          swarmLayer.innerHTML = '';
          swarmLayer.classList.add('hidden');
        }
      }, 620);
    }
  }

  wsSwarmAnimFrame = requestAnimationFrame(tick);
}

function wsCloseGraphView(fromPopstate = false, skipHistoryPop = false) {
  if (!wsGraphOpen) {
    if (typeof discardOverlayHistoryMarker === 'function') discardOverlayHistoryMarker('ws-graph');
    return;
  }
  wsGraphOpen = false;
  if (fromPopstate || skipHistoryPop) {
    if (typeof discardOverlayHistoryMarker === 'function') discardOverlayHistoryMarker('ws-graph');
  } else if (typeof popOverlayHistoryMarker === 'function') {
    popOverlayHistoryMarker('ws-graph');
  }
  wsGraphLinkMode = false;
  wsGraphLinkSourceId = null;

  if (wsGraphAnimFrame) {
    cancelAnimationFrame(wsGraphAnimFrame);
    wsGraphAnimFrame = null;
  }
  if (wsSwarmAnimFrame) {
    cancelAnimationFrame(wsSwarmAnimFrame);
    wsSwarmAnimFrame = null;
  }

  const swarmLayer = document.getElementById('ws-butterfly-swarm');
  if (swarmLayer) {
    swarmLayer.innerHTML = '';
    swarmLayer.classList.add('hidden');
  }

  const overlay = document.getElementById('ws-graph-overlay');
  if (overlay) {
    overlay.classList.add('opacity-0');
    setTimeout(() => {
      if (!wsGraphOpen) overlay.classList.add('hidden');
    }, 360);
  }

  if (currentView === 'chapter') {
    setTimeout(() => syncButterflyToCloseButton(false), 100);
  }
}

function cleanupWorkStudyGraph() {
  if (wsGraphOpen) {
    wsCloseGraphView(false, true);
  }
  if (wsIsFullscreen) {
    wsToggleFullscreen(false, false, true);
  }
  wsHideContextMenu();
  wsCloseMoveModal();
}

function wsUpdateGraphStatsText() {
  const statsEl = document.getElementById('ws-graph-stats');
  if (statsEl) {
    statsEl.textContent = `${wsGraphNodes.length} NOTES · ${wsGraphEdges.length} LINKS`;
  }
}

function wsResizeGraphCanvas() {
  const stage = document.getElementById('ws-graph-stage');
  const canvas = document.getElementById('ws-graph-canvas');
  if (!stage || !canvas) return;
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
}

function wsScreenToWorld(clientX, clientY) {
  const canvas = document.getElementById('ws-graph-canvas');
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return {
    x: (sx - wsGraphCam.x) / wsGraphCam.scale,
    y: (sy - wsGraphCam.y) / wsGraphCam.scale
  };
}

function wsHitTestGraphNode(wx, wy) {
  for (let i = wsGraphNodes.length - 1; i >= 0; i--) {
    const n = wsGraphNodes[i];
    if (!n.arrived) continue;
    const dx = wx - n.x;
    const dy = wy - n.y;
    const hitR = Math.max(16, n.radius + 9);
    if (dx * dx + dy * dy <= hitR * hitR) {
      return n;
    }
  }
  return null;
}

function wsToggleGraphLinkMode() {
  if (!isAuthorAuthenticated) return;
  wsGraphLinkMode = !wsGraphLinkMode;
  wsGraphLinkSourceId = null;
  wsSyncGraphLinkModeUi();
}

function wsSyncGraphLinkModeUi() {
  const btn = document.getElementById('ws-graph-link-mode-btn');
  const banner = document.getElementById('ws-graph-link-banner');
  if (btn) {
    if (!isAuthorAuthenticated) {
      btn.hidden = true;
      btn.classList.add('hidden');
    } else {
      btn.hidden = false;
      btn.classList.remove('hidden');
      btn.className = wsGraphLinkMode
        ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#e4d4a7] bg-[#e4d4a7] text-xs font-mono-code text-[#0c0d0f] font-medium transition cursor-pointer shadow-[0_0_16px_rgba(228,212,167,0.35)]'
        : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.04] hover:border-[#e4d4a7]/50 text-xs font-mono-code text-white/75 hover:text-[#e4d4a7] transition cursor-pointer';
    }
  }
  if (banner) {
    banner.classList.toggle('hidden', !isAuthorAuthenticated || !wsGraphLinkMode);
    if (isAuthorAuthenticated && wsGraphLinkMode) {
      const srcNode = wsGraphNodes.find(n => n.id === wsGraphLinkSourceId);
      banner.textContent = srcNode
        ? `Selected "${srcNode.title}" — Click another node to link`
        : 'Link Mode: Click the first note node, then click the second node to create a [[Link]]';
    }
  }
}

function wsLinkTwoNotesFromGraph(sourceId, targetId) {
  if (!isAuthorAuthenticated) return;
  if (!sourceId || !targetId || sourceId === targetId) return;
  const vault = wsLoadVault();
  const srcNote = vault.notes.find(n => n.id === sourceId);
  const tgtNote = vault.notes.find(n => n.id === targetId);
  if (!srcNote || !tgtNote) return;

  const existingLinks = wsExtractWikilinkTitles(srcNote.content).map(t => t.toLowerCase());
  if (!existingLinks.includes((tgtNote.title || '').trim().toLowerCase())) {
    const sep = srcNote.content && !srcNote.content.endsWith('\n') ? '\n\n' : '';
    srcNote.content = `${srcNote.content || ''}${sep}[[${tgtNote.title}]]`;
    srcNote.updatedAt = Date.now();
    wsSaveVault(true);
  }

  const pairKey = [sourceId, targetId].sort().join('::');
  const alreadyEdge = wsGraphEdges.some(e => [e.source, e.target].sort().join('::') === pairKey);
  if (!alreadyEdge) {
    wsGraphEdges.push({ source: sourceId, target: targetId });
    const sNode = wsGraphNodes.find(n => n.id === sourceId);
    const tNode = wsGraphNodes.find(n => n.id === targetId);
    if (sNode) { sNode.degree += 1; sNode.radius = Math.min(13, 6 + sNode.degree * 1.45); }
    if (tNode) { tNode.degree += 1; tNode.radius = Math.min(13, 6 + tNode.degree * 1.45); }
    wsUpdateGraphStatsText();
  }
  wsRenderWorkspace();
}

function wsShowGraphNodeCard(nodeId) {
  const card = document.getElementById('ws-graph-node-card');
  const folderEl = document.getElementById('ws-graph-card-folder');
  const titleEl = document.getElementById('ws-graph-card-title');
  const excerptEl = document.getElementById('ws-graph-card-excerpt');
  const linksEl = document.getElementById('ws-graph-card-links');
  const degEl = document.getElementById('ws-graph-card-degree');
  const openBtn = document.getElementById('ws-graph-card-open-btn');
  if (!card) return;

  const vault = wsLoadVault();
  const note = vault.notes.find(n => n.id === nodeId);
  if (!note) return;

  wsGraphSelectedId = nodeId;
  if (folderEl) folderEl.textContent = wsGetFolderName(note.folderId) || 'ROOT VAULT';
  if (titleEl) titleEl.textContent = note.title;
  const cleanText = (note.content || '').replace(/[#*`>@]/g, '').trim();
  if (excerptEl) excerptEl.textContent = cleanText || 'Empty note';

  const neighborIds = wsGraphEdges
    .filter(e => e.source === nodeId || e.target === nodeId)
    .map(e => (e.source === nodeId ? e.target : e.source));
  const neighbors = neighborIds
    .map(nid => vault.notes.find(n => n.id === nid))
    .filter(Boolean);

  if (linksEl) {
    linksEl.innerHTML = neighbors.slice(0, 6).map(nb => `
      <button
        type="button"
        onclick="wsShowGraphNodeCard('${nb.id}')"
        class="px-2 py-0.5 rounded bg-[#e4d4a7]/12 border border-[#e4d4a7]/30 font-mono-code text-[10px] text-[#e4d4a7] hover:bg-[#e4d4a7]/22 cursor-pointer transition"
      >[[${escapeHtmlSafely(nb.title)}]]</button>
    `).join('');
  }
  if (degEl) degEl.textContent = `${neighbors.length} CONNECTIONS`;
  if (openBtn) {
    openBtn.onclick = () => {
      wsCloseGraphView(false, true);
      wsOpenNote(note.id);
    };
  }

  card.classList.remove('hidden');
}

function wsHideGraphNodeCard() {
  wsGraphSelectedId = null;
  const card = document.getElementById('ws-graph-node-card');
  if (card) card.classList.add('hidden');
}

function wsGraphZoom(factor) {
  const stage = document.getElementById('ws-graph-stage');
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const newScale = Math.max(0.35, Math.min(2.8, wsGraphCam.scale * factor));
  const ratio = newScale / wsGraphCam.scale;
  wsGraphCam.x = cx - (cx - wsGraphCam.x) * ratio;
  wsGraphCam.y = cy - (cy - wsGraphCam.y) * ratio;
  wsGraphCam.scale = newScale;
}

function wsGraphResetView() {
  wsGraphCam = { x: 0, y: 0, scale: 1 };
}

function wsBindGraphCanvasEventsOnce() {
  if (wsGraphEventsBound) return;
  wsGraphEventsBound = true;

  window.addEventListener('resize', () => {
    if (wsGraphOpen) wsResizeGraphCanvas();
  });

  const canvas = document.getElementById('ws-graph-canvas');
  if (!canvas) return;
  canvas.style.touchAction = 'none';

  const activePointers = new Map();
  let pinchState = null;

  function getTwoPointerMetrics() {
    const pts = Array.from(activePointers.values());
    if (pts.length < 2) return null;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return {
      dist: Math.hypot(dx, dy) || 1,
      midX: (pts[0].x + pts[1].x) * 0.5,
      midY: (pts[0].y + pts[1].y) * 0.5
    };
  }

  window.addEventListener('resize', () => {
    if (wsGraphOpen) wsResizeGraphCanvas();
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (!wsGraphOpen) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch (_e) {}

    if (activePointers.size === 2) {
      // Switch smoothly into two-finger pinch-to-zoom + pan mode
      wsGraphDragNode = null;
      wsGraphPanning = false;
      wsGraphMovedDuringDrag = true;
      const m = getTwoPointerMetrics();
      if (m) {
        const rect = canvas.getBoundingClientRect();
        pinchState = {
          startDist: m.dist,
          startScale: wsGraphCam.scale,
          lastMidX: m.midX - rect.left,
          lastMidY: m.midY - rect.top
        };
      }
      return;
    }

    if (activePointers.size === 1) {
      pinchState = null;
      const w = wsScreenToWorld(e.clientX, e.clientY);
      const hit = wsHitTestGraphNode(w.x, w.y);
      wsGraphMovedDuringDrag = false;
      if (hit) {
        wsGraphDragNode = hit;
      } else {
        wsGraphPanning = true;
        wsGraphPanStart = { x: e.clientX, y: e.clientY, camX: wsGraphCam.x, camY: wsGraphCam.y };
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!wsGraphOpen) return;
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Handle two-finger pinch zoom + pan on mobile / trackpad
    if (activePointers.size >= 2 && pinchState) {
      const m = getTwoPointerMetrics();
      if (m) {
        const rect = canvas.getBoundingClientRect();
        const curMidX = m.midX - rect.left;
        const curMidY = m.midY - rect.top;
        const newScale = Math.max(0.35, Math.min(2.8, pinchState.startScale * (m.dist / pinchState.startDist)));
        const ratio = newScale / wsGraphCam.scale;
        wsGraphCam.x = curMidX - (pinchState.lastMidX - wsGraphCam.x) * ratio;
        wsGraphCam.y = curMidY - (pinchState.lastMidY - wsGraphCam.y) * ratio;
        wsGraphCam.scale = newScale;
        pinchState.lastMidX = curMidX;
        pinchState.lastMidY = curMidY;
      }
      return;
    }

    const w = wsScreenToWorld(e.clientX, e.clientY);
    if (wsGraphDragNode) {
      wsGraphDragNode.x = w.x;
      wsGraphDragNode.y = w.y;
      wsGraphDragNode.vx = 0;
      wsGraphDragNode.vy = 0;
      wsGraphMovedDuringDrag = true;
      return;
    }
    if (wsGraphPanning) {
      const dx = e.clientX - wsGraphPanStart.x;
      const dy = e.clientY - wsGraphPanStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wsGraphMovedDuringDrag = true;
      wsGraphCam.x = wsGraphPanStart.camX + dx;
      wsGraphCam.y = wsGraphPanStart.camY + dy;
      return;
    }
    const hit = wsHitTestGraphNode(w.x, w.y);
    wsGraphHoverId = hit ? hit.id : null;
    canvas.style.cursor = hit ? 'pointer' : 'grab';
  });

  function handlePointerRelease(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
      pinchState = null;
    }
    if (!wsGraphOpen) return;
    if (activePointers.size > 0) return;

    const clickedNode = (!wsGraphMovedDuringDrag && wsGraphDragNode) ? wsGraphDragNode : null;
    wsGraphDragNode = null;
    wsGraphPanning = false;

    if (clickedNode) {
      if (isAuthorAuthenticated && wsGraphLinkMode) {
        if (!wsGraphLinkSourceId) {
          wsGraphLinkSourceId = clickedNode.id;
          wsSyncGraphLinkModeUi();
        } else if (wsGraphLinkSourceId === clickedNode.id) {
          wsGraphLinkSourceId = null;
          wsSyncGraphLinkModeUi();
        } else {
          wsLinkTwoNotesFromGraph(wsGraphLinkSourceId, clickedNode.id);
          wsGraphLinkSourceId = null;
          wsSyncGraphLinkModeUi();
        }
      } else {
        wsShowGraphNodeCard(clickedNode.id);
      }
    }
  }

  canvas.addEventListener('pointerup', handlePointerRelease);
  canvas.addEventListener('pointercancel', handlePointerRelease);

  canvas.addEventListener('dblclick', (e) => {
    if (!wsGraphOpen || wsGraphLinkMode) return;
    const w = wsScreenToWorld(e.clientX, e.clientY);
    const hit = wsHitTestGraphNode(w.x, w.y);
    if (hit) {
      wsCloseGraphView(false, true);
      wsOpenNote(hit.id);
    }
  });

  canvas.addEventListener('wheel', (e) => {
    if (!wsGraphOpen) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.35, Math.min(2.8, wsGraphCam.scale * factor));
    const ratio = newScale / wsGraphCam.scale;
    wsGraphCam.x = mx - (mx - wsGraphCam.x) * ratio;
    wsGraphCam.y = my - (my - wsGraphCam.y) * ratio;
    wsGraphCam.scale = newScale;
  }, { passive: false });
}

function wsStartGraphRenderLoop() {
  if (wsGraphAnimFrame) {
    cancelAnimationFrame(wsGraphAnimFrame);
    wsGraphAnimFrame = null;
  }

  const canvas = document.getElementById('ws-graph-canvas');
  const stage = document.getElementById('ws-graph-stage');
  if (!canvas || !stage) return;
  const ctx = canvas.getContext('2d');

  function frame() {
    if (!wsGraphOpen) {
      wsGraphAnimFrame = null;
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const cx = width / 2;
    const cy = height / 2;

    const nodeById = new Map(wsGraphNodes.map(n => [n.id, n]));
    for (let i = 0; i < wsGraphNodes.length; i++) {
      const a = wsGraphNodes[i];
      if (!a.arrived) continue;
      a.revealAlpha = Math.min(1, a.revealAlpha + 0.08);
      for (let j = i + 1; j < wsGraphNodes.length; j++) {
        const b = wsGraphNodes[j];
        if (!b.arrived) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy + 25;
        const dist = Math.sqrt(distSq);
        const rep = 1400 / distSq;
        const fx = (dx / dist) * rep;
        const fy = (dy / dist) * rep;
        if (wsGraphDragNode !== a) { a.vx -= fx; a.vy -= fy; }
        if (wsGraphDragNode !== b) { b.vx += fx; b.vy += fy; }
      }
    }

    wsGraphEdges.forEach(e => {
      const a = nodeById.get(e.source);
      const b = nodeById.get(e.target);
      if (!a || !b || !a.arrived || !b.arrived) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = (dist - 140) * 0.0045;
      const fx = (dx / dist) * pull;
      const fy = (dy / dist) * pull;
      if (wsGraphDragNode !== a) { a.vx += fx; a.vy += fy; }
      if (wsGraphDragNode !== b) { b.vx -= fx; b.vy -= fy; }
    });

    wsGraphNodes.forEach(n => {
      if (!n.arrived || wsGraphDragNode === n) return;
      n.vx += (cx - n.x) * 0.0014;
      n.vy += (cy - n.y) * 0.0014;
      n.vx *= 0.86;
      n.vy *= 0.86;
      n.x += n.vx;
      n.y += n.vy;
    });

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.translate(wsGraphCam.x, wsGraphCam.y);
    ctx.scale(wsGraphCam.scale, wsGraphCam.scale);

    const focusId = wsGraphHoverId || wsGraphLinkSourceId || wsGraphSelectedId;
    const connectedToFocus = new Set();
    if (focusId) {
      connectedToFocus.add(focusId);
      wsGraphEdges.forEach(e => {
        if (e.source === focusId) connectedToFocus.add(e.target);
        if (e.target === focusId) connectedToFocus.add(e.source);
      });
    }

    wsGraphEdges.forEach(e => {
      const a = nodeById.get(e.source);
      const b = nodeById.get(e.target);
      if (!a || !b || !a.arrived || !b.arrived) return;
      const edgeAlpha = Math.min(a.revealAlpha, b.revealAlpha);
      const isHot = focusId && (e.source === focusId || e.target === focusId);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (isHot) {
        ctx.strokeStyle = `rgba(228, 212, 167, ${(0.82 * edgeAlpha).toFixed(2)})`;
        ctx.lineWidth = 1.9 / wsGraphCam.scale;
      } else if (focusId) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.07 * edgeAlpha).toFixed(2)})`;
        ctx.lineWidth = 1 / wsGraphCam.scale;
      } else {
        ctx.strokeStyle = `rgba(228, 212, 167, ${(0.28 * edgeAlpha).toFixed(2)})`;
        ctx.lineWidth = 1.15 / wsGraphCam.scale;
      }
      ctx.stroke();
    });

    wsGraphNodes.forEach(n => {
      if (!n.arrived) return;
      const isFocus = focusId === n.id;
      const isNeighbor = focusId && connectedToFocus.has(n.id);
      const dimmed = focusId && !isNeighbor;
      const alpha = (dimmed ? 0.22 : 1) * n.revealAlpha;

      const glowR = n.radius * (isFocus ? 3.2 : 2.1);
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
      const haloColor = n.bookmarked || isFocus ? '228, 212, 167' : '124, 196, 250';
      grad.addColorStop(0, `rgba(${haloColor}, ${(0.42 * alpha).toFixed(2)})`);
      grad.addColorStop(1, `rgba(${haloColor}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = isFocus
        ? `rgba(255, 248, 230, ${alpha.toFixed(2)})`
        : (n.bookmarked
          ? `rgba(228, 212, 167, ${alpha.toFixed(2)})`
          : `rgba(124, 196, 250, ${(0.9 * alpha).toFixed(2)})`);
      ctx.fill();

      ctx.lineWidth = (isFocus ? 2 : 1) / wsGraphCam.scale;
      ctx.strokeStyle = `rgba(255, 253, 247, ${(0.65 * alpha).toFixed(2)})`;
      ctx.stroke();

      if (wsGraphLinkSourceId === n.id) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(228, 212, 167, 0.9)';
        ctx.lineWidth = 1.6 / wsGraphCam.scale;
        ctx.stroke();
      }

      const fontSize = Math.max(10, 12 / Math.sqrt(wsGraphCam.scale));
      ctx.font = `${isFocus ? '500' : '400'} ${fontSize}px Inter, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isFocus
        ? `rgba(255, 248, 230, ${alpha.toFixed(2)})`
        : `rgba(243, 241, 236, ${(0.78 * alpha).toFixed(2)})`;
      ctx.fillText(n.title, n.x, n.y + n.radius + 6);
    });

    ctx.restore();
    wsGraphAnimFrame = requestAnimationFrame(frame);
  }

  wsGraphAnimFrame = requestAnimationFrame(frame);
}

/* ========================================================================
   ONE-CLICK MARKDOWN VAULT ZIP BACKUP EXPORTER (ZERO EXTERNAL LIBRARIES)
   ======================================================================== */
function wsCrc32Bytes(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function wsBuildZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const item of files) {
    const nameBytes = encoder.encode(item.path);
    const dataBytes = encoder.encode(item.content || '');
    const crc = wsCrc32Bytes(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true);      // STORE (no compression)
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x0021, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x0021, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
}

function wsSanitizePathSegment(name, fallback = 'Untitled') {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function wsExportVaultBackup() {
  const vault = wsLoadVault();
  const usedPaths = new Set();
  const entries = [];

  for (const note of vault.notes) {
    const folderName = wsGetFolderName(note.folderId);
    const safeFolder = folderName ? wsSanitizePathSegment(folderName, 'Folder') + '/' : '';
    const baseTitle = wsSanitizePathSegment(note.title, 'Untitled');
    let candidate = `${safeFolder}${baseTitle}.md`;
    let suffix = 1;
    while (usedPaths.has(candidate.toLowerCase())) {
      candidate = `${safeFolder}${baseTitle}-${suffix}.md`;
      suffix += 1;
    }
    usedPaths.add(candidate.toLowerCase());
    entries.push({
      path: candidate,
      content: note.content || ''
    });
  }

  entries.push({
    path: 'rudy-vault-backup.json',
    content: JSON.stringify({
      exportedAt: new Date().toISOString(),
      folders: vault.folders,
      notes: vault.notes
    }, null, 2)
  });

  const blob = wsBuildZipBlob(entries);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `rudy-work-study-vault-${dateTag}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
