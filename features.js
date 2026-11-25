/*
 * features.js: additive layer for the chat app.
 * - DA (SAM only): Kimi activity dashboard, toggles open/close.
 * - CA (SAM and Kimi): opens the phone's default camera (photo or video).
 *   The captured file is uploaded right away with a progress animation and
 *   posted as a normal message in the main chat (realtime via script.js).
 * Does NOT modify script.js. Uses the same Supabase project.
 */
(function () {
  'use strict';

  // ---- Config (same Supabase project as script.js) ----
  const SUPABASE_URL = 'https://zphufvybtpkwcjioyycw.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_IHRCG6lycDBGowoDwRfXaQ_HSJvwVST';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const HEARTBEAT_MS = 15000;
  const DASH_REFRESH_MS = 15000;
  const COLORS = { sam: '#22c55e', kimi: '#619efa' };
  const DEVICE_LABEL = { Mobile: '📱 Mobile', Tablet: '📲 Tablet', PC: '💻 PC' };
  // Matches a public media video URL inside a chat message's text
  const VIDEO_URL_RE = /https?:\/\/\S+\/storage\/v1\/object\/public\/media\/\S+\.(?:mp4|webm|mov)/i;

  const MARKUP = `
    <div id="featTopBar">
      <button id="featDaBtn" class="feat-btn" hidden>DA</button>
      <button id="featCaBtn" class="feat-btn" hidden>CA</button>
    </div>

    <div id="featDash" class="feat-panel" hidden>
      <div class="feat-panel-head">
        <span>📊 Dashboard · Kimi</span>
        <button class="feat-close" id="featDashClose">✕</button>
      </div>
      <div class="feat-dash-body" id="featDashBody"><div class="feat-sub">Loading…</div></div>
    </div>

    <div id="featUploads"></div>
  `;

  const userDropdown = document.getElementById('userDropdown');
  const sessionId = getSessionId();

  let els = {};
  let dashOpen = false;
  let heartbeatTimer = null;
  let dashTimer = null;
  let fileInput = null;

  // ---------- Utilities ----------
  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // Fallback for non-secure contexts where randomUUID is unavailable
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }

  function getSessionId() {
    let id = sessionStorage.getItem('featSessionId');
    if (!id) {
      id = makeId();
      sessionStorage.setItem('featSessionId', id);
    }
    return id;
  }

  function currentUser() {
    const v = userDropdown.value;
    return v === 'sam' || v === 'kimi' ? v : null;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleString([], {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  function mount(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    document.body.appendChild(t.content);
  }

  function build() {
    mount(MARKUP);
    const $ = (id) => document.getElementById(id);
    els = {
      da: $('featDaBtn'),
      ca: $('featCaBtn'),
      dash: $('featDash'),
      dashBody: $('featDashBody'),
      uploads: $('featUploads'),
    };

    els.da.addEventListener('click', toggleDash);
    els.ca.addEventListener('click', openCamera);
    $('featDashClose').addEventListener('click', closeDash);
    userDropdown.addEventListener('change', onUserChange);
  }

  // ---------- Role-based button visibility ----------
  function onUserChange() {
    const u = currentUser();
    els.da.hidden = u !== 'sam';                    // DA: SAM only
    els.ca.hidden = !(u === 'sam' || u === 'kimi'); // CA: SAM and Kimi
    if (dashOpen) closeDash();
    stopHeartbeat();
    if (u) startHeartbeat();
  }

  // ---------- Heartbeat (feeds the dashboard) ----------
  function startHeartbeat() {
    beat();
    heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function beat() {
    const u = currentUser();
    if (!u) return;
    fetch('/api/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, sessionId }),
    }).catch(() => { /* server offline: fail silently */ });
  }

  // ---------- Dashboard (DA toggles open/close) ----------
  function toggleDash() {
    if (dashOpen) closeDash();
    else openDash();
  }

  function openDash() {
    dashOpen = true;
    els.dash.hidden = false;
    els.da.classList.add('active');
    loadDashboard();
    dashTimer = setInterval(loadDashboard, DASH_REFRESH_MS);
  }

  function closeDash() {
    dashOpen = false;
    els.dash.hidden = true;
    els.da.classList.remove('active');
    clearInterval(dashTimer);
    dashTimer = null;
  }

  async function loadDashboard() {
    const viewer = currentUser();
    if (viewer !== 'sam') return;
    try {
      const res = await fetch(`/api/dashboard?user=kimi&viewer=${encodeURIComponent(viewer)}`, {
        cache: 'no-store',
      });
      const type = res.headers.get('content-type') || '';
      if (!type.includes('application/json')) {
        throw new Error('Server is not running. Deploy server.js on a Node.js host and open the app from that server URL.');
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      renderDashboard(data);
    } catch (err) {
      els.dashBody.innerHTML = `<div class="feat-error">Could not load dashboard: ${esc(err.message)}</div>`;
    }
  }

  function renderDashboard(d) {
    const online = d.devicesConnected > 0;
    const device = DEVICE_LABEL[d.deviceType] || '—';
    const list = d.onlineTimestamps.length
      ? d.onlineTimestamps.slice(0, 200).map((t) => `<li>${fmtTime(t)}</li>`).join('')
      : '<li>No online activity in the last 24 hours</li>';

    els.dashBody.innerHTML = `
      <div class="feat-grid">
        <div class="feat-card">
          <div class="feat-label">Status</div>
          <div class="feat-value"><span class="feat-dot ${online ? 'on' : ''}"></span>${online ? 'Online' : 'Offline'}</div>
          <div class="feat-sub">Last seen: ${d.lastSeen ? fmtTime(d.lastSeen) : 'never'}</div>
        </div>
        <div class="feat-card">
          <div class="feat-label">Devices connected</div>
          <div class="feat-value big">${d.devicesConnected}</div>
        </div>
        <div class="feat-card">
          <div class="feat-label">IP address</div>
          <div class="feat-value mono">${esc(d.ip || '—')}</div>
        </div>
        <div class="feat-card">
          <div class="feat-label">Device type</div>
          <div class="feat-value">${device}</div>
        </div>
        <div class="feat-card wide">
          <div class="feat-label">Online count (last 24h)</div>
          <div class="feat-value big">${d.onlineCount24h}</div>
        </div>
      </div>
      <div class="feat-section">
        <div class="feat-label">Online timestamps (last 24h)</div>
        <ul class="feat-list">${list}</ul>
      </div>
      <div class="feat-foot">Updated ${fmtTime(d.generatedAt)} · auto-refresh every 15s</div>
    `;
  }

  // ---------- Camera (phone default camera, photo or video) ----------
  function ensureFileInput() {
    if (fileInput) return fileInput;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,video/*';
    fileInput.setAttribute('capture', 'environment'); // opens the default camera app on phones
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', onFilePicked);
    document.body.appendChild(fileInput);
    return fileInput;
  }

  function openCamera() {
    if (!currentUser()) return;
    ensureFileInput().click();
  }

  function onFilePicked(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';          // allow picking the same item again later
    const me = currentUser();
    if (!file || !me) return;
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
    startUpload(file, mediaType, me);
  }

  // ---------- Upload + post to the main chat ----------
  function startUpload(file, mediaType, me) {
    const row = addUploadRow(mediaType);
    const rawExt = file.name && file.name.includes('.') ? file.name.split('.').pop() : '';
    const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '')
      || (mediaType === 'image' ? 'jpg' : 'mp4');
    const path = `${me}/cam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const contentType = file.type || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');

    uploadWithProgress(path, file, contentType, (pct) => row.setProgress(pct))
      .then(async (publicUrl) => {
        row.setLabel('Sending to chat…');
        // Same row shape that script.js uses: photos use image_url, videos are posted as a link
        // in text, which features.js turns into a playable video (see watchChat).
        const message = mediaType === 'image'
          ? { username: me, text: '', image_url: publicUrl, time: new Date().toISOString(), edited: false }
          : { username: me, text: publicUrl, time: new Date().toISOString(), edited: false };
        const { error } = await sb.from('messages').insert([message]);
        if (error) throw new Error('File saved, but message failed: ' + error.message);
        row.done();
      })
      .catch((err) => row.fail(err.message));
  }

  function uploadWithProgress(path, blob, contentType, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();   // XHR gives real upload progress events
      xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/media/${encodeURI(path)}`);
      xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`);
      xhr.setRequestHeader('apikey', SUPABASE_KEY);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('Content-Type', contentType);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(`${SUPABASE_URL}/storage/v1/object/public/media/${encodeURI(path)}`);
        } else {
          reject(new Error(`Upload failed (HTTP ${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(blob);
    });
  }

  function addUploadRow(mediaType) {
    const kind = mediaType === 'image' ? 'photo' : 'video';
    const row = document.createElement('div');
    row.className = 'feat-up-row';
    row.innerHTML = `
      <div class="feat-up-top">
        <span class="feat-spin"></span>
        <span class="feat-up-label">Uploading ${kind}… 0%</span>
      </div>
      <div class="feat-up-bar"><div class="feat-up-fill"></div></div>`;
    els.uploads.appendChild(row);

    const label = row.querySelector('.feat-up-label');
    const fill = row.querySelector('.feat-up-fill');

    return {
      setProgress(pct) {
        fill.style.width = pct + '%';
        label.textContent = `Uploading ${kind}… ${pct}%`;
      },
      setLabel(text) {
        fill.style.width = '100%';
        label.textContent = text;
      },
      done() {
        row.querySelector('.feat-spin')?.remove();
        row.classList.add('ok');
        label.textContent = '✓ Sent to chat';
        setTimeout(() => row.remove(), 1500);
      },
      fail(msg) {
        row.querySelector('.feat-spin')?.remove();
        row.classList.add('fail');
        label.textContent = '❌ ' + msg + ' (tap to dismiss)';
        row.addEventListener('click', () => row.remove());
      },
    };
  }

  // ---------- Show videos posted in the main chat ----------
  function upgradeVideos(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);

    texts.forEach((t) => {
      const m = t.nodeValue.match(VIDEO_URL_RE);
      if (!m) return;
      const url = m[0];
      const before = t.nodeValue.slice(0, m.index);
      const after = t.nodeValue.slice(m.index + url.length);

      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.style.cssText = 'display:block;width:100%;max-width:300px;border-radius:12px;margin:5px 0;';

      const parent = t.parentNode;
      parent.insertBefore(document.createTextNode(before), t);
      parent.insertBefore(video, t);
      parent.insertBefore(document.createTextNode(after), t);
      parent.removeChild(t);
    });
  }

  function watchChat() {
    const chat = document.getElementById('chatContainer');
    if (!chat) return;
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) upgradeVideos(n);
      }));
    });
    observer.observe(chat, { childList: true });
  }

  // ---------- Init ----------
  function init() {
    build();
    watchChat();
    onUserChange();      // apply visibility for a user restored by script.js
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
