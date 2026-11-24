/* ==========================================================================
   VOLUME D: DAILY MOMENTS, CLOUDFLARE R2 MEDIA & COMMENT MODERATION
   ========================================================================== */

let liveMomentsPosts = [];
let momentCommentsMap = {};
let selectedMomentFiles = [];

/**
 * Built-in fallback moments removed per user request (displays only Rudy's live moments).
 */
const MOMENTS_POSTS = [];

/**
 * Returns cloud-synced Supabase moments (newest first).
 */
function getAllMomentsPosts() {
  return [...liveMomentsPosts, ...MOMENTS_POSTS];
}

/**
 * Extracts up to 3 latest images from all Moments posts for the Profile preview row.
 */
function getLatestMomentThumbnails(limit = 3) {
  const thumbs = [];
  const allPosts = getAllMomentsPosts();
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

/**
 * Builds the Daily Moments timeline feed from live Supabase posts
 * including visitor text comments (max 8 per moment) and Author moderation controls.
 */
function buildMomentsFeedHtml() {
  const allPosts = getAllMomentsPosts();
  const totalPendingCount = Object.values(momentCommentsMap).reduce((sum, list) => {
    return sum + list.filter(c => c.status === 'pending').length;
  }, 0);

  const pendingBadgeHtml = totalPendingCount > 0
    ? `<span class="px-2.5 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/40 font-mono-code text-[10px] text-amber-300">
         ${totalPendingCount} PENDING REVIEW
       </span>`
    : '';

  const authorComposerHtml = isAuthorAuthenticated
    ? `
      <div class="rounded-2xl border border-[#e4d4a7]/35 bg-[#18191c] p-4 sm:p-5 space-y-3.5 shadow-xl">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span class="font-mono-code text-[11px] tracking-widest uppercase text-[#e4d4a7]">
              AUTHOR MODE · NEW MOMENT
            </span>
            ${pendingBadgeHtml}
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
          placeholder="Write today's English reflection, idiom, or mood..."
          class="w-full rounded-xl bg-black/45 border border-white/15 p-3 text-sm text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#e4d4a7]"
        ></textarea>

        <!-- Selected Photos / Videos Preview Row -->
        <div id="composer-media-preview" class="hidden flex-wrap gap-2.5 pt-1"></div>

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

            <input
              id="new-moment-tag"
              type="text"
              value="#StudyEnglishWithMe"
              placeholder="#Tag"
              class="w-40 rounded-lg bg-black/35 border border-white/10 px-2.5 py-1.5 font-mono-code text-xs text-[#e2c458] placeholder-white/30 focus:outline-none focus:border-[#e4d4a7]"
            />
          </div>

          <button
            id="btn-publish-moment"
            type="button"
            onclick="publishNewMoment()"
            class="px-4 py-2 rounded-xl bg-[#e4d4a7] hover:bg-[#efe2be] text-[#0c0d0f] font-mono-code text-xs font-medium tracking-wide transition cursor-pointer shadow"
          >
            POST MOMENT ↵
          </button>
        </div>

        <p id="composer-status" class="font-mono-code text-[11px] text-amber-300 hidden"></p>
      </div>
    `
    : '';

  const postsHtml = allPosts.length > 0
    ? allPosts.map((post, postIdx) => {
        const momentKey = post.dbId ? String(post.dbId) : `static-${postIdx}`;
        const rawComments = momentCommentsMap[momentKey] || [];
        const approvedComments = rawComments.filter(c => c.status === 'approved').slice(0, 8);
        const pendingComments = isAuthorAuthenticated
          ? rawComments.filter(c => c.status === 'pending')
          : [];
        const isCommentsFull = approvedComments.length >= 8;

        const mediaList = Array.isArray(post.images) ? post.images : [];
        let mediaBlock = '';

        if (mediaList.length > 0) {
          const videos = mediaList.filter(url => isVideoMediaUrl(url, post.mediaType));
          const images = mediaList.filter(url => !isVideoMediaUrl(url, post.mediaType));

          const videoHtml = videos.map(vUrl => `
            <div class="pt-1 max-w-md">
              <video
                src="${vUrl}"
                controls
                playsinline
                preload="metadata"
                class="w-full rounded-xl border border-white/15 bg-black/70 max-h-80"
              ></video>
            </div>
          `).join('');

          const photosGrid = images.length > 0
            ? `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 max-w-md">
                ${images.map((imgSrc, imgIdx) => `
                  <img
                    src="${imgSrc}"
                    alt="Moment photo ${postIdx + 1}-${imgIdx + 1}"
                    loading="lazy"
                    decoding="async"
                    onclick="openImageLightbox(this.src, 'Daily Moments · ${post.date}')"
                    onerror="this.onerror=null; this.src='https://placehold.co/320x320/1d2025/e4d4a7?text=Photo+${postIdx + 1}.${imgIdx + 1}';"
                    class="w-full aspect-square rounded-lg object-cover border border-white/10 bg-[#1a1c20] cursor-zoom-in hover:opacity-90 transition"
                  />
                `).join('')}
              </div>`
            : '';

          mediaBlock = `${videoHtml}${photosGrid}`;
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

        const deleteBtnHtml = (isAuthorAuthenticated && post.dbId)
          ? `<button
              type="button"
              data-confirm="false"
              onclick="deleteLiveMoment('${post.dbId}', this)"
              class="font-mono-code text-[11px] text-white/35 hover:text-rose-400 transition cursor-pointer ml-auto"
            >
              Delete
            </button>`
          : '';

        // Approved public comments list (max 8)
        const approvedListHtml = approvedComments.map((c) => {
          const safeName = escapeHtmlSafely(c.author_name || 'Guest');
          const safeBody = escapeHtmlSafely(c.content || '');
          const authorDeleteAction = isAuthorAuthenticated
            ? `<button
                 type="button"
                 onclick="deleteMomentComment('${c.id}')"
                 title="Remove comment"
                 class="font-mono-code text-[10px] text-white/30 hover:text-rose-400 transition cursor-pointer ml-2 shrink-0"
               >
                 ✕
               </button>`
            : '';

          return `
            <div class="py-2 flex items-start justify-between gap-2 text-xs leading-relaxed">
              <div class="break-words min-w-0">
                <span class="font-medium text-[#e4d4a7]">${safeName}:</span>
                <span class="text-white/80 ml-1">${safeBody}</span>
              </div>
              ${authorDeleteAction}
            </div>
          `;
        }).join('');

        // Pending comments queue (visible ONLY to logged-in Rudy for filtering/approval)
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
                >
                  ✓ Approve
                </button>
                <button
                  type="button"
                  onclick="deleteMomentComment('${c.id}')"
                  class="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 font-mono-code text-[10px] text-rose-300 transition cursor-pointer"
                >
                  ✕ Filter
                </button>
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
          ? `<div id="comment-drawer-${momentKey}" class="hidden mt-2.5 rounded-xl border border-white/12 bg-[#18191d] p-3.5 space-y-2.5 max-w-lg">
               <div class="flex items-center justify-between gap-2">
                 <input
                   id="comment-name-${momentKey}"
                   type="text"
                   maxlength="24"
                   placeholder="Your name (optional, defaults to Guest)"
                   class="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 text-xs text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#e4d4a7]"
                 />
                 <span class="font-mono-code text-[10px] text-white/40 shrink-0">${approvedComments.length}/8</span>
               </div>
               <div class="flex items-center gap-2">
                 <input
                   id="comment-input-${momentKey}"
                   type="text"
                   maxlength="240"
                   placeholder="Leave a comment (shown after Rudy's approval)..."
                   onkeydown="if (event.key === 'Enter') { event.preventDefault(); submitVisitorComment('${momentKey}'); }"
                   class="flex-1 rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-xs text-[#f3f1ec] placeholder-white/35 focus:outline-none focus:border-[#e4d4a7]"
                 />
                 <button
                   id="btn-submit-comment-${momentKey}"
                   type="button"
                   onclick="submitVisitorComment('${momentKey}')"
                   class="px-3.5 py-2 rounded-lg bg-[#e4d4a7]/20 hover:bg-[#e4d4a7]/30 border border-[#e4d4a7]/45 font-mono-code text-[11px] text-[#e4d4a7] transition cursor-pointer shrink-0"
                 >
                   SEND ↵
                 </button>
               </div>
               <p id="comment-status-${momentKey}" class="font-mono-code text-[11px] hidden"></p>
             </div>`
          : '';

        return `
          <div class="py-5 flex items-start gap-3.5">
            <img
              src="${escapeHtmlSafely(getRudyAvatarUrl())}"
              alt="Rudy"
              loading="lazy"
              decoding="async"
              onerror="this.onerror=null; this.src='https://placehold.co/100x100/1c1f1a/e4d4a7?text=R';"
              class="w-10 h-10 rounded-full object-cover border border-[#e4d4a7]/35 bg-[#1a1c19] shrink-0"
            />
            <div class="flex-1 space-y-2.5 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-sm text-[#e4d4a7]">Rudy</span>
                <span class="font-mono-code text-[11px] text-white/40">${post.date}</span>
              </div>
              <p class="text-sm leading-relaxed text-white/85 whitespace-pre-line break-words">${post.text}</p>
              ${mediaBlock}
              <div class="pt-1 flex flex-wrap items-center gap-4">
                <button type="button" onclick="toggleMomentLike(this)" class="font-mono-code text-xs text-white/50 hover:text-[#e2c458] transition cursor-pointer">
                  ♡ Like (${post.likes || 0})
                </button>
                <span class="font-mono-code text-[11px] text-white/35">${post.tag || '#StudyEnglishWithMe'}</span>
                ${commentTriggerHtml}
                ${deleteBtnHtml}
              </div>
              ${commentsBoxHtml}
              ${commentDrawerHtml}
            </div>
          </div>
        `;
      }).join('')
    : `
      <div class="py-10 text-center font-mono-code text-xs text-white/40">
        Loading moments...
      </div>
    `;

  return `
    <div class="space-y-6">
      <p class="text-sm text-white/65">
        Short reflections, overheard idioms, and quiet snapshots from everyday life—written in English.
      </p>
      ${authorComposerHtml}
      <div class="divide-y divide-white/10 border-t border-b border-white/10">
        ${postsHtml}
      </div>
    </div>
  `;
}

function toggleMomentLike(btn) {
  if (!btn) return;
  const isLiked = btn.dataset.liked === 'true';
  const match = btn.textContent.match(/\((\d+)\)/);
  let count = match ? parseInt(match[1], 10) : 0;

  if (isLiked) {
    count = Math.max(0, count - 1);
    btn.dataset.liked = 'false';
    btn.textContent = `♡ Like (${count})`;
    btn.classList.remove('text-[#e2c458]');
  } else {
    count += 1;
    btn.dataset.liked = 'true';
    btn.textContent = `♥ Liked (${count})`;
    btn.classList.add('text-[#e2c458]');
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
    date: formatMomentTimestamp(row.created_at),
    text: escapeHtmlSafely(row.content),
    images: Array.isArray(row.media_urls) ? row.media_urls.map(optimizeMediaUrl) : [],
    mediaType: row.media_type || 'image',
    tag: row.location || '#StudyEnglishWithMe',
    likes: 1
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
        localStorage.setItem(MOMENTS_CACHE_KEY, JSON.stringify(data.slice(0, 30)));
      } catch (_e) {}

      // Refresh currently open Profile or Moments view so thumbnails & feed stay up to date
      if (currentView === 'chapter' && (activeBookId === 'moment' || activeBookId === 'profile')) {
        renderChapterContent(activeBookId);
        setTimeout(() => syncButterflyToCloseButton(false), 60);
      }
    }
  } catch (err) {
    console.warn('Live moments sync skipped:', err);
  }
}

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

function renderSelectedComposerMedia() {
  const previewEl = document.getElementById('composer-media-preview');
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
        >
          ✕
        </button>
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
  const tag = tagEl ? tagEl.value.trim() : '#StudyEnglishWithMe';

  if (!content && selectedMomentFiles.length === 0) {
    if (statusEl) {
      statusEl.textContent = 'Write a short thought or attach a photo/video first.';
      statusEl.classList.remove('hidden');
    }
    return;
  }

  publishBtn.disabled = true;
  publishBtn.textContent = 'UPLOADING...';
  if (statusEl) {
    statusEl.textContent = 'Uploading media to Cloudflare R2 & publishing...';
    statusEl.className = 'font-mono-code text-[11px] text-[#e4d4a7]';
    statusEl.classList.remove('hidden');
  }

  try {
    const uploadedUrls = [];
    let detectedMediaType = 'image';
    const { data: sessionData } = await client.auth.getSession();
    const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : '';

    for (let i = 0; i < selectedMomentFiles.length; i++) {
      const file = selectedMomentFiles[i];
      if (file.type.startsWith('video/')) detectedMediaType = 'video';

      let finalPublicUrl = '';

      // Primary: stream file into Cloudflare R2 (10GB free storage)
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

      // Fallback: preserve original Supabase Storage upload if R2 is unavailable
      if (!finalPublicUrl) {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const filePath = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: uploadError } = await client.storage
          .from('media')
          .upload(filePath, file, { cacheControl: '3600', upsert: false });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = client.storage
          .from('media')
          .getPublicUrl(filePath);

        if (publicUrlData && publicUrlData.publicUrl) {
          finalPublicUrl = publicUrlData.publicUrl;
        }
      }

      if (finalPublicUrl) {
        uploadedUrls.push(finalPublicUrl);
      }
    }

    const { error: insertError } = await client
      .from('moments')
      .insert([{
        content,
        media_urls: uploadedUrls,
        media_type: detectedMediaType,
        location: tag
      }]);

    if (insertError) throw insertError;

    selectedMomentFiles = [];
    await fetchLiveMoments();
    renderChapterContent('moment');
    setTimeout(() => syncButterflyToCloseButton(false), 60);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Publish failed: ${err.message || 'Please check network.'}`;
      statusEl.className = 'font-mono-code text-[11px] text-rose-400';
      statusEl.classList.remove('hidden');
    }
    publishBtn.disabled = false;
    publishBtn.textContent = 'POST MOMENT ↵';
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
    // Also clean up any R2-hosted images/videos belonging to this Moment so storage stays lean
    if (mediaUrlsToClean.length > 0) {
      const { data: sessionData } = await client.auth.getSession();
      const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : '';
      for (const mUrl of mediaUrlsToClean) {
        const r2Key = extractR2KeyFromMediaUrl(mUrl);
        if (r2Key) {
          fetch(`${R2_UPLOAD_ENDPOINT}/art-music-file?key=${encodeURIComponent(r2Key)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).catch(() => {});
        }
      }
    }

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

    if (currentView === 'chapter' && activeBookId === 'moment') {
      renderChapterContent('moment');
      setTimeout(() => syncButterflyToCloseButton(false), 60);
    }
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
  const client = ensureSupabaseClient();
  if (!client) return;

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
    submitBtn.disabled = true;
    submitBtn.textContent = 'SENDING...';
  }

  try {
    const { error } = await client
      .from('moment_comments')
      .insert([{
        moment_key: momentKey,
        author_name: authorName,
        content,
        status: 'pending'
      }]);

    if (error) throw error;

    textInput.value = '';
    statusEl.textContent = '✓ Submitted! Your comment will appear once Rudy approves it.';
    statusEl.className = 'font-mono-code text-[11px] text-emerald-400';
    statusEl.classList.remove('hidden');

    // If Rudy himself posted while logged in, refresh immediately so he sees it in Pending
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
