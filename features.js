/*
 * features.js: additive layer for the chat app.
 * Adds: fixed top bar (DA / CA), dashboard overlay (SAM only), camera overlay.
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

    <div id="featCam" class="feat-panel" hidden>
      <div class="feat-panel-head">
        <span>📷 Camera</span>
        <button class="feat-close" id="featCamClose">✕</button>
      </div>
      <div class="feat-cam-stage">
        <video id="featVideo" playsinline muted autoplay></video>
        <div class="feat-flash" id="featFlash"></div>
        <div class="feat-rec" id="featRec" hidden>● REC <span id="featRecTime">00:00</span></div>
        <div class="feat-error" id="featCamErr" hidden></div>
      </div>
      <div class="feat-cam-controls">
        <button class="feat-action" id="featShotBtn" disabled>📸 Photo</button>
        <button class="feat-action rec" id="featRecBtn" disabled>⏺ Record</button>
      </div>
      <div class="feat-cam-status" id="featCamStatus"></div>
      <div class="feat-thread-title">Camera messages</div>
      <div class="feat-thread" id="featThread"></div>
    </div>
  `;

  const userDropdown = document.getElementById('userDropdown');
  const sessionId = getSessionId();

  let els = {};
  let activeView = null;     // null | 'dash' | 'cam'
  let heartbeatTimer = null;
  let dashTimer = null;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let recTimer = null;
  let recStart = 0;

  // ---------- Utilities ----------
  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // Fallback for non-secure contexts (e.g. http://LAN-IP) where randomUUID is unavailable
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

  const pad = (n) => String(n).padStart(2, '0');

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
      cam: $('featCam'),
      video: $('featVideo'),
      flash: $('featFlash'),
      rec: $('featRec'),
      recTime: $('featRecTime'),
      err: $('featCamErr'),
      shot: $('featShotBtn'),
      recBtn: $('featRecBtn'),
      status: $('featCamStatus'),
      thread: $('featThread'),
    };

    els.da.addEventListener('click', () => toggleView('dash'));
    els.ca.addEventListener('click', () => toggleView('cam'));
    $('featDashClose').addEventListener('click', closeView);
    $('featCamClose').addEventListener('click', closeView);
    els.shot.addEventListener('click', takePhoto);
    els.recBtn.addEventListener('click', toggleRecord);
    userDropdown.addEventListener('change', onUserChange);
  }

  // ---------- Role-based button visibility ----------
  function onUserChange() {
    const u = currentUser();
    els.da.hidden = u !== 'sam';                    // DA: SAM only
    els.ca.hidden = !(u === 'sam' || u === 'kimi'); // CA: SAM and Kimi
    if (activeView) closeView();                    // leave overlays when switching user
    stopHeartbeat();
    if (u) startHeartbeat();
  }

  // ---------- Overlay toggling (DA / CA act as open/close toggles) ----------
  function toggleView(name) {
    if (activeView === name) closeView();
    else openView(name);
  }

  function openView(name) {
    if (activeView) closeView();
    activeView = name;
    if (name === 'dash') {
      els.dash.hidden = false;
      loadDashboard();
      dashTimer = setInterval(loadDashboard, DASH_REFRESH_MS);
    } else {
      els.cam.hidden = false;
      loadThread();
      startCamera();
    }
    refreshButtons();
  }

  function closeView() {
    if (activeView === 'dash') {
      els.dash.hidden = true;
      clearInterval(dashTimer);
      dashTimer = null;
    } else if (activeView === 'cam') {
      els.cam.hidden = true;
      stopCamera();
    }
    activeView = null;
    refreshButtons();
  }

  function refreshButtons() {
    els.da.classList.toggle('active', activeView === 'dash');
    els.ca.classList.toggle('active', activeView === 'cam');
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

  // ---------- Dashboard ----------
  async function loadDashboard() {
    const viewer = currentUser();
    if (viewer !== 'sam') return;
    try {
      const res = await fetch(`/api/dashboard?user=kimi&viewer=${encodeURIComponent(viewer)}`, {
        cache: 'no-store',
      });
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

  // ---------- Camera ----------
  function isRecording() {
    return !!recorder && recorder.state !== 'inactive';
  }

  function setError(msg) {
    els.err.innerHTML = '';
    els.err.hidden = !msg;
    if (!msg) return;
    const p = document.createElement('div');
    p.textContent = msg;
    const retry = document.createElement('button');
    retry.className = 'feat-action';
    retry.style.marginTop = '10px';
    retry.textContent = 'Try again';
    retry.onclick = () => { setError(null); startCamera(); };
    els.err.append(p, retry);
  }

  function setStatus(text, tone = '') {
    els.status.textContent = text;
    els.status.style.color = tone === 'ok' ? '#22c55e' : tone === 'err' ? '#f87171' : '#94a3b8';
  }

  function updateControls() {
    const rec = isRecording();
    els.shot.disabled = !stream || rec;
    els.recBtn.disabled = !stream;
    els.recBtn.textContent = rec ? '⏹ Stop' : '⏺ Record';
    els.recBtn.classList.toggle('recording', rec);
    els.rec.hidden = !rec;
  }

  async function startCamera() {
    if (stream) return;
    setError(null);
    setStatus('Requesting camera permission…');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Camera is not available here. Open the app over HTTPS or http://localhost in a modern browser.');
      setStatus('');
      return;
    }

    const videoOnly = { video: { facingMode: 'environment' } };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ ...videoOnly, audio: true });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        setError('Camera permission was denied. Allow camera access for this site in your browser settings, then try again.');
        setStatus('');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia(videoOnly); // e.g. no microphone
      } catch (err2) {
        setError(err2.name === 'NotFoundError'
          ? 'No camera was found on this device.'
          : 'Could not open the camera: ' + err2.message);
        setStatus('');
        return;
      }
    }

    els.video.srcObject = stream;
    await els.video.play().catch(() => {});
    setStatus('');
    updateControls();
  }

  function stopCamera() {
    if (isRecording()) recorder.stop();   // onstop will auto-upload what was captured
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    els.video.srcObject = null;
    clearInterval(recTimer);
    recTimer = null;
    setError(null);
    setStatus('');
    updateControls();
  }

  function takePhoto() {
    const v = els.video;
    if (!stream || !v.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);

    els.flash.classList.add('go');
    setTimeout(() => els.flash.classList.remove('go'), 150);

    canvas.toBlob((blob) => {
      if (blob) queueUpload(blob, 'image');
    }, 'image/jpeg', 0.92);
  }

  function pickMime() {
    if (!window.MediaRecorder) return '';
    const list = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',               // Safari / iOS
    ];
    return list.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }

  function toggleRecord() {
    if (isRecording()) {
      recorder.stop();
      return;
    }
    if (!stream) return;

    const mimeType = pickMime();
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (err) {
      setError('Video recording is not supported in this browser.');
      return;
    }

    chunks = [];
    const rec = recorder;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      clearInterval(recTimer);
      recTimer = null;
      const type = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type });
      chunks = [];
      recorder = null;
      updateControls();
      if (blob.size) queueUpload(blob, 'video');   // AUTO-UPLOAD when recording finishes
    };

    rec.start(1000);
    recStart = Date.now();
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      els.recTime.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    }, 500);
    updateControls();
  }

  // ---------- Upload + thread ----------
  function queueUpload(blob, mediaType) {
    const me = currentUser();
    if (!me) return;

    const p = addPending(blob, mediaType, me);
    setStatus(`Uploading ${mediaType}…`);

    uploadBlob(blob, mediaType, me, (pct) => {
      p.bar.style.width = pct + '%';
      p.status.textContent = `Uploading ${pct}%`;
    })
      .then(async (publicUrl) => {
        const { data, error } = await sb
          .from('camera_posts')
          .insert([{ username: me, media_url: publicUrl, media_type: mediaType }])
          .select()
          .single();
        if (error) throw new Error('File saved but message failed: ' + error.message);
        p.el.remove();
        URL.revokeObjectURL(p.url);
        renderPost(data);
        setStatus('✓ Uploaded and posted', 'ok');
      })
      .catch((err) => {
        p.el.classList.add('failed');
        p.status.textContent = '❌ ' + err.message;
        setStatus(err.message, 'err');
      });
  }

  function uploadBlob(blob, mediaType, me, onProgress) {
    return new Promise((resolve, reject) => {
      const ext = mediaType === 'image' ? 'jpg' : blob.type.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `cam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const path = `${me}/${fileName}`;
      const contentType = blob.type || (mediaType === 'image' ? 'image/jpeg' : 'video/webm');

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

  function addPending(blob, mediaType, me) {
    const url = URL.createObjectURL(blob);
    const div = document.createElement('div');
    div.className = 'feat-bubble own pending';
    const media = mediaType === 'image'
      ? `<img src="${url}" alt="">`
      : `<video src="${url}" muted playsinline></video>`;
    div.innerHTML = `
      <div class="feat-sender" style="color:${COLORS[me] || '#fff'}">${esc(me)}</div>
      ${media}
      <div class="feat-progress"><div class="feat-progress-bar"></div></div>
      <div class="feat-meta"><span class="feat-status">Uploading 0%</span><span>${fmtTime(Date.now())}</span></div>`;
    els.thread.appendChild(div);
    scrollThread();
    return {
      el: div,
      url,
      bar: div.querySelector('.feat-progress-bar'),
      status: div.querySelector('.feat-status'),
    };
  }

  function renderPost(post) {
    if (!post || !post.id) return;
    if (els.thread.querySelector(`[data-id="${post.id}"]`)) return; // dedupe insert vs realtime
    const me = currentUser();
    const div = document.createElement('div');
    div.className = 'feat-bubble' + (post.username === me ? ' own' : '');
    div.dataset.id = post.id;
    const media = post.media_type === 'image'
      ? `<img src="${esc(post.media_url)}" alt="photo">`
      : `<video src="${esc(post.media_url)}" controls playsinline preload="metadata"></video>`;
    div.innerHTML = `
      <div class="feat-sender" style="color:${COLORS[post.username] || '#fff'}">${esc(post.username)}</div>
      ${media}
      <div class="feat-meta"><span>${fmtTime(post.time)}</span></div>`;
    els.thread.appendChild(div);
    scrollThread();
  }

  function scrollThread() {
    els.thread.scrollTop = els.thread.scrollHeight;
  }

  async function loadThread() {
    const { data, error } = await sb
      .from('camera_posts')
      .select('*')
      .order('time', { ascending: true })
      .limit(100);
    if (error) {
      setStatus('Could not load messages: ' + error.message, 'err');
      return;
    }
    (data || []).forEach(renderPost);
    scrollThread();
  }

  function startRealtime() {
    sb.channel('feat-camera-posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'camera_posts' },
        (payload) => renderPost(payload.new))
      .subscribe();
  }

  // ---------- Init ----------
  function init() {
    build();
    startRealtime();
    onUserChange();      // apply visibility for a user restored by script.js
    refreshButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
