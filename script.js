document.addEventListener('DOMContentLoaded', function() {
    const SUPABASE_URL = 'https://zphufvybtpkwcjioyycw.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_IHRCG6lycDBGowoDwRfXaQ_HSJvwVST';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    const colors = {
        sam: "#22c55e",
        kimi: "#619efa"
    };
    
    let currentUser = null;
    let showingStatus = false;
    let lastSeenStatusTime = null;
    let lastMessageDate = null;
    let pendingPasteFile = null;
    let currentChannel = null;
    let messageCache = new Map();
    let isLoading = false;
    
    // Online status tracking
    let onlineStatusCache = {
        sam: { isOnline: false, lastChecked: null },
        kimi: { isOnline: false, lastChecked: null }
    };
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    const userDropdown = document.getElementById("userDropdown");
    const msgInput = document.getElementById("msg");
    const chatContainer = document.getElementById("chatContainer");
    const statusContainer = document.getElementById("statusContainer");
    const chatWrap = document.getElementById("chatWrap");
    const statusArea = document.getElementById("statusArea");
    const fullClearBtn = document.getElementById("fullClearBtn");
    const refreshTopBtn = document.getElementById("refreshTopBtn");
    const statusViewBtn = document.getElementById("statusViewBtn");
    const statusDot = document.getElementById("statusDot");
    const onlineUsersEl = document.getElementById("onlineUsers");
    const onlineList = document.getElementById("onlineList");
    const lastSeenContainer = document.getElementById("lastSeenContainer");
    
    // Inputs
    const imageInput = document.getElementById("imageInput");
    const statusInput = document.getElementById("statusInput");
    
    const sendBtn = document.getElementById("sendBtn");
    const imageBtn = document.getElementById("imageBtn");
    const statusUploadBtn = document.getElementById("statusUploadBtn");
    const pastePreview = document.getElementById('pastePreview');
    const previewImage = document.getElementById('previewImage');
    const sendPastedBtn = document.getElementById('sendPastedBtn');

    // Camera Modal Elements (status video recorder - unchanged)
    const cameraModal = document.getElementById('cameraModal');
    const cameraPreview = document.getElementById('cameraPreview');
    const closeCameraBtn = document.getElementById('closeCameraBtn');
    const startRecordBtn = document.getElementById('startRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    
    // ============================================================
    // Gallery button new elements
    // ============================================================
    const galleryChoiceOverlay = document.getElementById('galleryChoiceOverlay');
    const galleryChoiceOK = document.getElementById('galleryChoiceOK');
    const galleryChoiceCancel = document.getElementById('galleryChoiceCancel');

    const photoCaptureModal = document.getElementById('photoCaptureModal');
    const photoCaptureVideo = document.getElementById('photoCaptureVideo');
    const photoCaptureFlash = document.getElementById('photoCaptureFlash');
    const photoCaptureCounter = document.getElementById('photoCaptureCounter');
    const photoCaptureCloseBtn = document.getElementById('photoCaptureCloseBtn');
    const photoCaptureThumbs = document.getElementById('photoCaptureThumbs');
    const photoCaptureMsg = document.getElementById('photoCaptureMsg');
    const photoShutterBtn = document.getElementById('photoShutterBtn');
    const photoFlipBtn = document.getElementById('photoFlipBtn');
    const photoCaptureDoneBtn = document.getElementById('photoCaptureDoneBtn');

    // Photo capture session state
    let photoStream = null;
    let photoFacingMode = 'environment';
    let photoCapturedFiles = []; // Array of File objects
    let photoCapturedUrls = [];  // ObjectURLs for thumbnails
    
    let mediaRecorder = null;
    let recordedChunks = [];
    let stream = null;
    let currentFacingMode = 'environment';
    let timerInterval = null;
    let secondsElapsed = 0;

    // Save user selection
    function saveUserSelection(user) {
        if (user) {
            localStorage.setItem('selectedUser', user);
        } else {
            localStorage.removeItem('selectedUser');
        }
    }

    // Load user selection
    function loadUserSelection() {
        const savedUser = localStorage.getItem('selectedUser');
        if (savedUser && (savedUser === 'sam' || savedUser === 'kimi')) {
            userDropdown.value = savedUser;
            userDropdown.dispatchEvent(new Event('change'));
        }
    }

    // Auto-resize textarea
    msgInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    msgInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
            if (isMobile) {
                return;
            } else {
                if (e.shiftKey) {
                    return;
                } else {
                    e.preventDefault();
                    send();
                }
            }
        }
    });

    function formatMessageTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        if (messageDate.getTime() === today.getTime()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (messageDate.getTime() === yesterday.getTime()) {
            return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            return date.toLocaleDateString([], { 
                day: 'numeric', 
                month: 'short',
                year: now.getFullYear() !== date.getFullYear() ? 'numeric' : undefined
            }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }

    function formatLastSeen(timestamp) {
        if (!timestamp) return 'Offline';
        
        const lastSeen = new Date(timestamp);
        const now = new Date();
        const diffSeconds = Math.floor((now - lastSeen) / 1000);
        
        if (diffSeconds <= 30) return 'Online';
        
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const lastSeenDate = new Date(lastSeen.getFullYear(), lastSeen.getMonth(), lastSeen.getDate());
        const timeString = lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        
        if (lastSeenDate.getTime() === today.getTime()) {
            return `Last seen today at ${timeString}`;
        } else if (lastSeenDate.getTime() === yesterday.getTime()) {
            return `Last seen yesterday at ${timeString}`;
        } else {
            const dateString = lastSeen.toLocaleDateString([], { 
                day: 'numeric', 
                month: 'short',
                year: lastSeen.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
            return `Last seen ${dateString} at ${timeString}`;
        }
    }

    function addDateSeparatorIfNeeded(messageTime) {
        const messageDate = new Date(messageTime);
        const messageDateStr = messageDate.toDateString();
        
        if (lastMessageDate !== messageDateStr) {
            const separator = document.createElement('div');
            separator.className = 'date-separator';
            
            const today = new Date().toDateString();
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            
            let dateText;
            if (messageDateStr === today) {
                dateText = 'Today';
            } else if (messageDateStr === yesterday) {
                dateText = 'Yesterday';
            } else {
                dateText = messageDate.toLocaleDateString([], { 
                    day: 'numeric', 
                    month: 'long',
                    year: messageDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                });
            }
            
            separator.innerHTML = `<span>${dateText}</span>`;
            chatContainer.appendChild(separator);
            lastMessageDate = messageDateStr;
        }
    }

    function isYouTubeLink(text) {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
        return youtubeRegex.test(text.trim());
    }

    function formatMessageText(text) {
        if (!text) return '';
        const lines = text.split('\n');
        let formattedHtml = '';
        
        lines.forEach((line, index) => {
            const words = line.split(' ');
            words.forEach(word => {
                if (isYouTubeLink(word)) {
                    formattedHtml += `<span class="message-link" onclick="window.open('${word}', '_blank')">${word}</span> `;
                } else {
                    formattedHtml += word + ' ';
                }
            });
            if (index < lines.length - 1) {
                formattedHtml += '<br>';
            }
        });
        
        return formattedHtml;
    }

    document.addEventListener("paste", async function(e) {
        if (showingStatus) return;
        
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) await handlePastedImage(file);
                break;
            }
        }
    });

    async function handlePastedImage(file) {
        if (!currentUser) {
            alert('Please select a user first');
            return;
        }
        
        if (!file.type.startsWith('image/')) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;
            pastePreview.style.display = 'flex';
            pendingPasteFile = file;
        };
        reader.readAsDataURL(file);
        
        setTimeout(() => {
            if (pendingPasteFile === file) {
                pastePreview.style.display = 'none';
                pendingPasteFile = null;
            }
        }, 10000);
    }

    sendPastedBtn.addEventListener('click', async function() {
        if (!pendingPasteFile) {
            pastePreview.style.display = 'none';
            return;
        }
        
        pastePreview.style.display = 'none';
        await uploadImage(pendingPasteFile);
        pendingPasteFile = null;
    });

    document.addEventListener('click', function(e) {
        if (pastePreview && !pastePreview.contains(e.target) && e.target !== msgInput) {
            pastePreview.style.display = 'none';
            pendingPasteFile = null;
        }
    });

    async function uploadImage(file) {
        if (!currentUser) return;
        
        const fileExt = file.name ? file.name.split('.').pop() : 'png';
        const fileName = `chat_${Date.now()}.${fileExt}`;
        const filePath = `${currentUser}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(filePath, file);
            
        if (uploadError) {
            alert('Upload failed: ' + uploadError.message);
            return;
        }
        
        const { data: { publicUrl } } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);
            
        const message = {
            username: currentUser,
            text: msgInput.value.trim() || '',
            image_url: publicUrl,
            time: new Date().toISOString(),
            edited: false
        };
        
        const { error } = await supabase.from('messages').insert([message]);
        if (!error) {
            msgInput.value = '';
            msgInput.style.height = 'auto';
            await updateMyOnlineStatus();
        } else {
            alert('Failed to send message: ' + error.message);
        }
    }

    async function checkAnyStatus() {
        if (!currentUser) return;
        const oneDayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
        const { data } = await supabase
            .from('statuses')
            .select('username, time')
            .gt('time', oneDayAgo)
            .order('time', { ascending: false });
            
        if (data && data.length > 0) {
            statusViewBtn.style.display = 'inline-block';
            if (lastSeenStatusTime) {
                const newStatuses = data.filter(s => new Date(s.time) > new Date(lastSeenStatusTime));
                if (newStatuses.length > 0 && !showingStatus) {
                    statusDot.style.display = 'block';
                    statusViewBtn.classList.add('new-status-animation');
                } else {
                    statusDot.style.display = 'none';
                    statusViewBtn.classList.remove('new-status-animation');
                }
            }
        } else {
            statusViewBtn.style.display = 'none';
            statusDot.style.display = 'none';
            statusViewBtn.classList.remove('new-status-animation');
        }
    }

    async function updateMyOnlineStatus() {
        if (!currentUser) return;
        await supabase.from('online_users').upsert({
            username: currentUser,
            last_seen: new Date().toISOString()
        });
    }

    // Flicker-free online status display
    async function displayOnlineUsers() {
        if (!currentUser) {
            onlineUsersEl.style.display = "none";
            lastSeenContainer.style.display = "none";
            return;
        }
        
        const ONLINE_THRESHOLD = 30000;
        
        const { data: allUsers } = await supabase
            .from('online_users')
            .select('username, last_seen')
            .in('username', ['sam', 'kimi']);
        
        if (!allUsers) return;
        
        const now = new Date();
        let onlineListArray = [];
        let lastSeenHtml = '';
        
        for (const user of ['sam', 'kimi']) {
            if (user === currentUser) continue;
            
            const userData = allUsers.find(u => u.username === user);
            const lastSeen = userData?.last_seen;
            
            if (!lastSeen) {
                if (onlineStatusCache[user].isOnline !== false) {
                    onlineStatusCache[user].isOnline = false;
                    onlineStatusCache[user].lastChecked = now;
                }
                lastSeenHtml += `<span style="color:${colors[user]};">${user}</span>: Offline `;
                continue;
            }
            
            const timeDiff = now - new Date(lastSeen);
            let isActuallyOnline = timeDiff <= ONLINE_THRESHOLD;
            
            if (onlineStatusCache[user].isOnline !== isActuallyOnline) {
                const lastChange = onlineStatusCache[user].lastChecked;
                const timeSinceLastChange = lastChange ? now - lastChange : Infinity;
                
                if (timeSinceLastChange >= 5000 || !lastChange) {
                    onlineStatusCache[user].isOnline = isActuallyOnline;
                    onlineStatusCache[user].lastChecked = now;
                } else {
                    isActuallyOnline = onlineStatusCache[user].isOnline;
                }
            }
            
            if (onlineStatusCache[user].isOnline) {
                onlineListArray.push(user);
            } else {
                lastSeenHtml += `<span style="color:${colors[user]};">${user}</span>: ${formatLastSeen(lastSeen)} `;
            }
        }
        
        onlineUsersEl.style.display = "block";
        if (onlineListArray.length > 0) {
            onlineList.innerText = onlineListArray.join(', ');
        } else {
            onlineList.innerText = 'none';
        }
        
        if (lastSeenHtml) {
            lastSeenContainer.style.display = "block";
            lastSeenContainer.innerHTML = lastSeenHtml;
        } else {
            lastSeenContainer.style.display = "none";
        }
    }

    userDropdown.addEventListener("change", async (e) => {
        if (e.target.value) {
            if (currentUser) {
                if (currentChannel) {
                    await supabase.removeChannel(currentChannel);
                }
                await supabase.from('online_users').delete().eq('username', currentUser);
            }
            currentUser = e.target.value;
            saveUserSelection(currentUser);
            await updateMyOnlineStatus();
            chatContainer.innerHTML = '';
            lastMessageDate = null;
            messageCache.clear();
            await loadMessages();
            await displayOnlineUsers();
            await checkAnyStatus();
            listenToMessages();
        } else {
            currentUser = null;
            saveUserSelection(null);
            onlineUsersEl.style.display = "none";
            lastSeenContainer.style.display = "none";
            if (currentChannel) {
                supabase.removeChannel(currentChannel);
            }
        }
    });

    async function send() {
        if (!currentUser) {
            alert('Please select a user first');
            return;
        }
        
        const text = msgInput.value.trim();
        if (!text) return;
        
        const message = {
            username: currentUser,
            text: text,
            time: new Date().toISOString(),
            edited: false
        };
        
        const tempId = Date.now();
        const tempDiv = document.createElement('div');
        tempDiv.className = 'msg own';
        tempDiv.id = `temp-${tempId}`;
        tempDiv.innerHTML = `<strong style="color:${colors[currentUser]};">${currentUser}</strong><br>${text.replace(/\n/g, '<br>')}<div class="time">Sending...</div>`;
        chatContainer.appendChild(tempDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        const { error } = await supabase.from('messages').insert([message]);
        
        if (!error) {
            msgInput.value = '';
            msgInput.style.height = 'auto';
            await updateMyOnlineStatus();
            tempDiv.remove();
        } else {
            tempDiv.innerHTML = `<strong style="color:${colors[currentUser]};">${currentUser}</strong><br>${text.replace(/\n/g, '<br>')}<div class="time">Failed to send ❌</div>`;
            setTimeout(() => tempDiv.remove(), 3000);
        }
    }

    function addMessage(msg, isOwn) {
        if (messageCache.has(msg.id)) return;
        messageCache.set(msg.id, true);
        
        const div = document.createElement('div');
        div.className = `msg ${isOwn ? 'own' : ''}`;
        div.dataset.id = msg.id;
        
        let pressTimer;
        if (isOwn) {
            div.addEventListener('touchstart', startPress, { passive: true });
            div.addEventListener('touchend', cancelPress);
            div.addEventListener('mousedown', startPress);
            div.addEventListener('mouseup', cancelPress);
            div.addEventListener('mouseleave', cancelPress);
        }
        
        function startPress(e) {
            if (isWithin20Minutes(msg.time)) {
                pressTimer = setTimeout(() => showEditMenu(div, msg), 500);
            }
        }
        
        function cancelPress() {
            if (pressTimer) clearTimeout(pressTimer);
        }
        
        function isWithin20Minutes(messageTime) {
            return (new Date() - new Date(messageTime)) / (1000 * 60) <= 20;
        }
        
        function showEditMenu(element, message) {
            const existing = document.querySelector('.message-menu');
            if (existing) existing.remove();
            
            const menu = document.createElement('div');
            menu.className = 'message-menu';
            menu.innerHTML = `
                <div class="menu-item edit-item"><span>✏️ Edit</span></div>
                <div class="menu-item delete-item"><span>🗑️ Delete</span></div>
            `;
            
            const rect = element.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.left = `${rect.left + (rect.width / 2)}px`;
            menu.style.top = `${rect.top - 10}px`;
            menu.style.transform = 'translate(-50%, -100%)';
            
            menu.querySelector('.edit-item').onclick = () => {
                editMessage(message);
                menu.remove();
            };
            
            menu.querySelector('.delete-item').onclick = () => {
                deleteMessage(message.id);
                menu.remove();
            };
            
            document.body.appendChild(menu);
            
            setTimeout(() => {
                const closeMenu = (e) => {
                    if (!menu.contains(e.target) && e.target !== element) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                };
                document.addEventListener('click', closeMenu);
            }, 100);
        }
        
        async function editMessage(message) {
            const newText = prompt('Edit message:', message.text);
            if (newText && newText !== message.text) {
                const { error } = await supabase.from('messages').update({
                    text: newText,
                    edited: true,
                    edited_at: new Date().toISOString()
                }).eq('id', message.id);
                
                if (error) {
                    alert('Failed to edit message: ' + error.message);
                }
            }
        }
        
        async function deleteMessage(messageId) {
            if (confirm('Delete message?')) {
                const { error } = await supabase.from('messages').delete().eq('id', messageId);
                if (error) {
                    alert('Failed to delete message: ' + error.message);
                }
            }
        }
        
        let content = `<strong style="color:${colors[msg.username] || '#fff'};">${msg.username}</strong><br>`;
        
        if (msg.image_url) {
            content += `<div><img src="${msg.image_url}" style="width:100%; max-width:320px; border-radius:15px; cursor:pointer;" onclick="window.open(this.src)"></div>`;
            if (msg.text) content += `<div style="margin-top:5px;">${formatMessageText(msg.text)}</div>`;
        } else {
            content += formatMessageText(msg.text);
        }
        
        if (msg.edited) content += ` <span class="edited-tag">(edited)</span>`;
        content += `<div class="time">${formatMessageTime(msg.time)}</div>`;
        
        div.innerHTML = content;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function showLoadingIndicator() {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'refreshLoadingIndicator';
        loadingDiv.className = 'loading-indicator';
        loadingDiv.innerHTML = '<span class="refresh-loading"></span> Refreshing messages...';
        chatContainer.appendChild(loadingDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function hideLoadingIndicator() {
        const loadingDiv = document.getElementById('refreshLoadingIndicator');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    async function loadMessages(showLoading = true) {
        if (!currentUser || isLoading) return;
        
        isLoading = true;
        
        if (showLoading) {
            showLoadingIndicator();
        }
        
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .order('time', { ascending: true });
                
            if (error) throw error;
            
            chatContainer.innerHTML = '';
            lastMessageDate = null;
            messageCache.clear();
            
            if (data && data.length > 0) {
                data.forEach(msg => {
                    addDateSeparatorIfNeeded(msg.time);
                    addMessage(msg, msg.username === currentUser);
                });
            } else {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'loading-indicator';
                emptyDiv.innerText = 'No messages yet. Send a message!';
                chatContainer.appendChild(emptyDiv);
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'loading-indicator';
            errorDiv.innerText = 'Failed to load messages. Click RF to refresh.';
            chatContainer.appendChild(errorDiv);
        } finally {
            isLoading = false;
            if (showLoading) {
                hideLoadingIndicator();
            }
        }
    }

    async function refreshMessages() {
        if (!currentUser) {
            alert('Please select a user first');
            return;
        }
        
        refreshTopBtn.classList.add('spin-animation');
        await loadMessages();
        setTimeout(() => {
            refreshTopBtn.classList.remove('spin-animation');
        }, 500);
    }

    // ========== SMART CAMERA & GALLERY HANDLERS ==========
    
    // ============================================================
    // CHANGED: Gallery button now opens a choice popup first.
    //   OK     -> in-app photo camera (getUserMedia + canvas)
    //   Cancel -> real gallery/file picker (multi-select)
    // The rest of the image pipeline (uploadImage / handleImageUpload)
    // is untouched except multi-file loop support.
    // ============================================================
    function handleChatImageClick() {
        if (!currentUser) {
            alert('Please select a user first');
            return;
        }
        showGalleryChoicePopup();
    }

    function showGalleryChoicePopup() {
        galleryChoiceOverlay.classList.add('show');
    }

    function hideGalleryChoicePopup() {
        galleryChoiceOverlay.classList.remove('show');
    }

    galleryChoiceOK.addEventListener('click', async function() {
        hideGalleryChoicePopup();
        await openPhotoCaptureModal();
    });

    galleryChoiceCancel.addEventListener('click', function() {
        hideGalleryChoicePopup();
        // Open the real gallery/file picker (multi-select).
        // imageInput has `multiple` now; on Android this opens the
        // system gallery picker (or Documents app) reliably.
        try {
            imageInput.value = '';
            imageInput.click();
        } catch (err) {
            console.error('Gallery open failed:', err);
        }
    });

    // ---------- In-app photo capture (OK path) ----------

    async function openPhotoCaptureModal() {
        // Reset session state
        photoCapturedFiles.forEach(f => { /* no revoke needed for File */ });
        photoCapturedUrls.forEach(url => URL.revokeObjectURL(url));
        photoCapturedFiles = [];
        photoCapturedUrls = [];
        photoCaptureThumbs.innerHTML = '';
        photoCaptureMsg.textContent = '';
        photoFacingMode = 'environment';
        updatePhotoCounter();
        updatePhotoDoneState();

        photoCaptureModal.classList.add('show');
        await startPhotoStream();
    }

    async function startPhotoStream() {
        stopPhotoStream();

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            photoCaptureMsg.textContent = 'Camera not supported on this browser.';
            // Fallback: offer file picker with capture hint
            showPhotoFallback();
            return;
        }

        try {
            photoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: photoFacingMode },
                    width: { ideal: 1280 },
                    height: { ideal: 1280 }
                },
                audio: false
            });
            photoCaptureVideo.srcObject = photoStream;
            if (photoFacingMode === 'user') {
                photoCaptureVideo.classList.add('mirrored');
            } else {
                photoCaptureVideo.classList.remove('mirrored');
            }
            photoCaptureMsg.textContent = '';
            photoShutterBtn.disabled = false;
        } catch (err) {
            console.error('Camera error:', err);
            let msg = 'Camera unavailable.';
            if (err && err.name === 'NotAllowedError') {
                msg = 'Camera permission denied. Allow camera access in browser settings.';
            } else if (err && err.name === 'NotFoundError') {
                msg = 'No camera found on this device.';
            } else if (err && err.name === 'NotReadableError') {
                msg = 'Camera is busy (used by another app). Close other apps and retry.';
            } else if (err && err.name === 'OverconstrainedError') {
                // Try again with a simpler constraint
                try {
                    photoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                    photoCaptureVideo.srcObject = photoStream;
                    photoCaptureMsg.textContent = '';
                    photoShutterBtn.disabled = false;
                    return;
                } catch (e2) {
                    msg = 'Camera could not start.';
                }
            } else if (err && err.message) {
                msg = 'Camera error: ' + err.message;
            }
            photoCaptureMsg.textContent = msg;
            photoShutterBtn.disabled = true;
            showPhotoFallback();
        }
    }

    function showPhotoFallback() {
        // Provide a way to still capture via native UI if getUserMedia fails.
        // Uses a temporary input with `capture` (best-effort; not guaranteed).
        const fallbackInput = document.createElement('input');
        fallbackInput.type = 'file';
        fallbackInput.accept = 'image/*';
        fallbackInput.capture = 'environment';
        fallbackInput.style.display = 'none';
        fallbackInput.addEventListener('change', function() {
            const f = fallbackInput.files && fallbackInput.files[0];
            if (f && f.type.startsWith('image/')) {
                addCapturedFile(f);
            }
            document.body.removeChild(fallbackInput);
        });
        document.body.appendChild(fallbackInput);
        try { fallbackInput.click(); } catch (e) { /* ignore */ }
    }

    function stopPhotoStream() {
        if (photoStream) {
            photoStream.getTracks().forEach(t => t.stop());
            photoStream = null;
        }
        photoCaptureVideo.srcObject = null;
    }

    function closePhotoCaptureModal(returnToInput) {
        stopPhotoStream();
        photoCaptureModal.classList.remove('show');
        photoCapturedUrls.forEach(url => URL.revokeObjectURL(url));
        photoCapturedUrls = [];
        photoCaptureThumbs.innerHTML = '';
        if (returnToInput) {
            // Keep files? No - closing discards unless Done was pressed.
            // This matches "cancel the camera session without crashing".
            photoCapturedFiles = [];
        }
        updatePhotoCounter();
        updatePhotoDoneState();
    }

    photoCaptureCloseBtn.addEventListener('click', function() {
        if (photoCapturedFiles.length > 0) {
            if (!confirm('Discard captured photos and close camera?')) return;
        }
        closePhotoCaptureModal(true);
    });

    // Escape key closes camera modal safely
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && photoCaptureModal.classList.contains('show')) {
            if (photoCapturedFiles.length > 0 && !confirm('Discard captured photos and close camera?')) return;
            closePhotoCaptureModal(true);
        }
    });

    photoFlipBtn.addEventListener('click', async function() {
        photoFacingMode = photoFacingMode === 'environment' ? 'user' : 'environment';
        await startPhotoStream();
    });

    photoShutterBtn.addEventListener('click', function() {
        capturePhoto();
    });

    function capturePhoto() {
        if (!photoStream || !photoCaptureVideo.videoWidth || !photoCaptureVideo.videoHeight) {
            return;
        }
        const vw = photoCaptureVideo.videoWidth;
        const vh = photoCaptureVideo.videoHeight;
        const canvas = document.createElement('canvas');
        canvas.width = vw;
        canvas.height = vh;
        const ctx = canvas.getContext('2d');

        // Mirror selfie output to match the previewed orientation
        if (photoFacingMode === 'user') {
            ctx.translate(vw, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(photoCaptureVideo, 0, 0, vw, vh);

        // Flash effect
        photoCaptureFlash.classList.add('flash');
        setTimeout(() => photoCaptureFlash.classList.remove('flash'), 120);

        canvas.toBlob(function(blob) {
            if (!blob) return;
            const fileName = `photo_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
            const file = new File([blob], fileName, { type: 'image/jpeg' });
            addCapturedFile(file);
        }, 'image/jpeg', 0.92);
    }

    function addCapturedFile(file) {
        photoCapturedFiles.push(file);
        const url = URL.createObjectURL(file);
        photoCapturedUrls.push(url);

        const wrap = document.createElement('div');
        wrap.className = 'thumb-wrap';
        const img = document.createElement('img');
        img.src = url;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'thumb-remove';
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', function() {
            const idx = photoCapturedFiles.indexOf(file);
            if (idx >= 0) {
                photoCapturedFiles.splice(idx, 1);
                URL.revokeObjectURL(url);
                const urlIdx = photoCapturedUrls.indexOf(url);
                if (urlIdx >= 0) photoCapturedUrls.splice(urlIdx, 1);
            }
            wrap.remove();
            updatePhotoCounter();
            updatePhotoDoneState();
        });

        wrap.appendChild(img);
        wrap.appendChild(removeBtn);
        photoCaptureThumbs.appendChild(wrap);

        updatePhotoCounter();
        updatePhotoDoneState();
    }

    function updatePhotoCounter() {
        photoCaptureCounter.textContent = `${photoCapturedFiles.length} captured`;
    }

    function updatePhotoDoneState() {
        photoCaptureDoneBtn.disabled = photoCapturedFiles.length === 0;
        if (photoCapturedFiles.length > 0) {
            photoCaptureDoneBtn.textContent = `Done (${photoCapturedFiles.length})`;
        } else {
            photoCaptureDoneBtn.textContent = 'Done';
        }
    }

    photoCaptureDoneBtn.addEventListener('click', async function() {
        if (photoCapturedFiles.length === 0) return;
        if (!currentUser) {
            alert('Please select a user first');
            closePhotoCaptureModal(true);
            return;
        }

        // Copy files then close modal (so stream stops immediately)
        const filesToSend = photoCapturedFiles.slice();
        stopPhotoStream();
        photoCaptureModal.classList.remove('show');
        photoCapturedUrls.forEach(url => URL.revokeObjectURL(url));
        photoCapturedUrls = [];
        photoCapturedFiles = [];
        photoCaptureThumbs.innerHTML = '';
        updatePhotoCounter();
        updatePhotoDoneState();

        // Sequentially upload using the existing single-file pipeline.
        // This preserves the existing send flow, caption usage, and
        // realtime message delivery.
        const caption = msgInput.value.trim();
        for (let i = 0; i < filesToSend.length; i++) {
            if (i > 0) {
                // Only the first message should carry the typed caption.
                msgInput.value = '';
            }
            await uploadImage(filesToSend[i]);
        }
        // If caption was present, it was consumed by first upload.
        // Ensure textarea cleared even if uploadImage didn't clear (it does clear on success).
        msgInput.value = '';
        msgInput.style.height = 'auto';
    });

    // ============================================================
    // STATUS handlers (unchanged)
    // ============================================================
    function handleStatusClick() {
        if (!currentUser) {
            alert('Please select a user first');
            return;
        }
        
        if (isMobile) {
            const choice = confirm("📸 Camera তে ভিডিও রেকর্ড করতে OK চাপুন।\n📁 Gallery থেকে নিতে Cancel চাপুন।");
            if (choice) {
                openCameraModal();
            } else {
                statusInput.click();
            }
        } else {
            statusInput.click();
        }
    }

    // Custom Camera Modal Logic (status video - unchanged)
    async function openCameraModal() {
        cameraModal.style.display = 'flex';
        startRecordBtn.style.display = 'block';
        stopRecordBtn.style.display = 'none';
        closeCameraBtn.style.display = 'block';
        recordedChunks = [];
        currentFacingMode = 'environment';
        secondsElapsed = 0;
        
        let flipBtn = document.getElementById('flipCameraBtn');
        let timerDisplay = document.getElementById('cameraTimer');
        
        if (!flipBtn) {
            flipBtn = document.createElement('button');
            flipBtn.id = 'flipCameraBtn';
            flipBtn.innerText = '🔄';
            flipBtn.style.cssText = 'position:absolute; top:20px; right:20px; z-index:10000; background:rgba(0,0,0,0.5); border-radius:50%; width:50px; height:50px; font-size:24px; padding:0; display:flex; align-items:center; justify-content:center; border: none; color: white;';
            cameraModal.appendChild(flipBtn);
            
            flipBtn.addEventListener('click', async () => {
                currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
                await startCameraStream();
            });
        }
        flipBtn.style.display = 'flex';
        
        if (!timerDisplay) {
            timerDisplay = document.createElement('div');
            timerDisplay.id = 'cameraTimer';
            timerDisplay.innerText = '00:00';
            timerDisplay.style.cssText = 'position:absolute; top:20px; left:50%; transform:translateX(-50%); z-index:10000; background:rgba(0,0,0,0.6); color:#ef4444; padding:5px 15px; border-radius:20px; font-size:18px; font-weight:bold; font-family:monospace; display:none;';
            cameraModal.appendChild(timerDisplay);
        }
        timerDisplay.style.display = 'none';
        timerDisplay.innerText = '00:00';

        await startCameraStream();
    }

    async function startCameraStream() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: currentFacingMode }, 
                audio: true 
            });
            cameraPreview.srcObject = stream;
            if (currentFacingMode === 'user') {
                cameraPreview.style.transform = 'scaleX(-1)';
            } else {
                cameraPreview.style.transform = 'scaleX(1)';
            }
        } catch (err) {
            alert('Camera access denied or not available: ' + err.message);
            closeCameraModal();
        }
    }

    function startTimer() {
        secondsElapsed = 0;
        const timerDisplay = document.getElementById('cameraTimer');
        timerDisplay.style.display = 'block';
        timerDisplay.innerText = '00:00';
        
        timerInterval = setInterval(() => {
            secondsElapsed++;
            const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
            const secs = (secondsElapsed % 60).toString().padStart(2, '0');
            timerDisplay.innerText = `${mins}:${secs}`;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        const timerDisplay = document.getElementById('cameraTimer');
        if (timerDisplay) {
            timerDisplay.style.display = 'none';
            timerDisplay.innerText = '00:00';
        }
    }

    function closeCameraModal() {
        cameraModal.style.display = 'none';
        const flipBtn = document.getElementById('flipCameraBtn');
        if (flipBtn) flipBtn.style.display = 'none';
        
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        cameraPreview.srcObject = null;
        cameraPreview.style.transform = 'scaleX(1)';
        stopTimer();
    }

    startRecordBtn.addEventListener('click', () => {
        if (!stream) return;
        
        let options = { mimeType: 'video/webm;codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm' };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/mp4' };
        }

        try {
            mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
            alert('MediaRecorder not supported on this browser: ' + e.message);
            return;
        }

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
            const file = new File([blob], `story_${Date.now()}.webm`, { type: mediaRecorder.mimeType });
            
            closeCameraModal();
            await uploadStatusVideo(file);
        };

        mediaRecorder.start();
        startRecordBtn.style.display = 'none';
        stopRecordBtn.style.display = 'block';
        closeCameraBtn.style.display = 'none';
        
        const flipBtn = document.getElementById('flipCameraBtn');
        if (flipBtn) flipBtn.style.display = 'none';
        
        startTimer();
    });

    stopRecordBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            stopRecordBtn.style.display = 'none';
            stopTimer();
        }
    });

    closeCameraBtn.addEventListener('click', closeCameraModal);

    async function uploadStatusVideo(file) {
        if (!currentUser) return;
        
        const fileExt = file.name.split('.').pop();
        const fileName = `status_${Date.now()}.${fileExt}`;
        const filePath = `${currentUser}/${fileName}`;
        
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-indicator';
        loadingDiv.innerText = 'Uploading Story...';
        statusContainer.prepend(loadingDiv);

        const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(filePath, file);
            
        if (uploadError) {
            alert('Upload failed: ' + uploadError.message);
            loadingDiv.remove();
            return;
        }
        
        const { data: { publicUrl } } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);
            
        const status = {
            username: currentUser,
            media_url: publicUrl,
            media_type: 'video',
            caption: msgInput.value.trim() || '',
            time: new Date().toISOString()
        };
        
        const { error } = await supabase.from('statuses').insert([status]);
        
        if (!error) {
            msgInput.value = '';
            msgInput.style.height = 'auto';
            alert('Story uploaded successfully!');
            await updateMyOnlineStatus();
            setTimeout(checkAnyStatus, 1000);
        } else {
            alert('Failed to upload status: ' + error.message);
        }
        loadingDiv.remove();
    }

    // ============================================================
    // CHANGED: handleImageUpload now loops through multiple files
    // (imageInput now has `multiple`). Single-file behavior remains
    // identical because it just calls uploadImage(file) per file.
    // ============================================================
    async function handleImageUpload(e) {
        if (!currentUser) {
            alert('Please select a user first');
            imageInput.value = '';
            return;
        }
        
        const files = Array.from(e.target.files || []);
        if (files.length === 0) {
            imageInput.value = '';
            return;
        }
        
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            alert('Please select image files only');
            imageInput.value = '';
            return;
        }
        
        // Preserve existing behavior: attach caption to first image only.
        // (uploadImage clears msgInput after success, so subsequent images
        //  are sent without caption — matches user's "send pipeline".)
        for (let i = 0; i < imageFiles.length; i++) {
            await uploadImage(imageFiles[i]);
        }
        
        imageInput.value = '';
    }

    async function handleStatusUpload(e) {
        if (!currentUser) {
            alert('Please select a user first');
            statusInput.value = '';
            return;
        }
        
        const file = e.target.files[0];
        if (!file) {
            statusInput.value = '';
            return;
        }
        
        const fileExt = file.name.split('.').pop();
        const fileName = `status_${Date.now()}.${fileExt}`;
        const filePath = `${currentUser}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(filePath, file);
            
        if (uploadError) {
            alert('Upload failed: ' + uploadError.message);
            statusInput.value = '';
            return;
        }
        
        const { data: { publicUrl } } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);
            
        const status = {
            username: currentUser,
            media_url: publicUrl,
            media_type: file.type.startsWith('image/') ? 'image' : 'video',
            caption: msgInput.value.trim() || '',
            time: new Date().toISOString()
        };
        
        const { error } = await supabase.from('statuses').insert([status]);
        
        if (!error) {
            msgInput.value = '';
            msgInput.style.height = 'auto';
            statusInput.value = '';
            alert('Status uploaded!');
            await updateMyOnlineStatus();
            setTimeout(checkAnyStatus, 1000);
        } else {
            alert('Failed to upload status: ' + error.message);
        }
    }

    function addStatus(status) {
        const div = document.createElement('div');
        div.className = 'status-item';
        div.style.borderColor = colors[status.username] || '#334155';
        
        let content = `<strong style="color:${colors[status.username] || '#fff'};">${status.username}</strong><br>`;
        
        if (status.caption) {
            content += `<div style="color:white; margin:8px 0;">${status.caption.replace(/\n/g, '<br>')}</div>`;
        }
        
        if (status.media_type === 'image') {
            content += `<img src="${status.media_url}" class="status-media" onclick="window.open(this.src)">`;
        } else {
            content += `<video src="${status.media_url}" class="status-media" controls></video>`;
        }
        
        content += `<div class="time">${formatMessageTime(status.time)}</div>`;
        div.innerHTML = content;
        statusContainer.prepend(div);
    }

    async function loadStatuses() {
        if (!currentUser) return;
        
        const oneDayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
        const { data, error } = await supabase
            .from('statuses')
            .select('*')
            .gt('time', oneDayAgo)
            .order('time', { ascending: false });
            
        if (error) {
            console.error('Error loading statuses:', error);
            return;
        }
        
        statusContainer.innerHTML = '';
        if (data && data.length > 0) {
            data.forEach(addStatus);
        } else {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'loading-indicator';
            emptyDiv.innerText = 'No status updates';
            statusContainer.appendChild(emptyDiv);
        }
        
        lastSeenStatusTime = new Date().toISOString();
        statusDot.style.display = 'none';
        statusViewBtn.classList.remove('new-status-animation');
    }

    function toggleStatusView() {
        if (!currentUser) {
            alert('Please select a user first');
            return;
        }
        
        showingStatus = !showingStatus;
        
        if (showingStatus) {
            chatWrap.style.display = "none";
            statusArea.style.display = "flex";
            statusViewBtn.style.background = "#f97316";
            loadStatuses();
        } else {
            chatWrap.style.display = "flex";
            statusArea.style.display = "none";
            statusViewBtn.style.background = "#8b5cf6";
            loadMessages();
            checkAnyStatus();
        }
    }

    async function fullClear() {
        if (!currentUser) {
            alert('Please select a user first');
            return;
        }
        
        if (confirm('⚠️ WARNING: This will delete ALL messages, statuses AND all media files from Storage! Are you sure?')) {
            
            const { error: messagesError } = await supabase.from('messages').delete().neq('id', 0);
            const { error: statusesError } = await supabase.from('statuses').delete().neq('id', 0);
            
            try {
                const { data: folders, error: listError } = await supabase.storage
                    .from('media')
                    .list('', { limit: 100 });
                
                if (listError) {
                    console.error('Error listing folders:', listError);
                } else if (folders && folders.length > 0) {
                    for (const folder of folders) {
                        const { data: files } = await supabase.storage
                            .from('media')
                            .list(folder.name, { limit: 1000 });
                        
                        if (files && files.length > 0) {
                            const filePaths = files.map(file => `${folder.name}/${file.name}`);
                            await supabase.storage.from('media').remove(filePaths);
                        }
                    }
                }
                
                const { data: rootFiles } = await supabase.storage
                    .from('media')
                    .list('', { limit: 1000 });
                    
                if (rootFiles && rootFiles.length > 0) {
                    const rootFilePaths = rootFiles
                        .filter(f => f.id)
                        .map(f => f.name);
                        
                    if (rootFilePaths.length > 0) {
                        await supabase.storage.from('media').remove(rootFilePaths);
                    }
                }
                
            } catch (storageError) {
                console.error('Storage clear error:', storageError);
            }
            
            if (!messagesError && !statusesError) {
                chatContainer.innerHTML = '';
                statusContainer.innerHTML = '';
                lastMessageDate = null;
                messageCache.clear();
                checkAnyStatus();
                alert('All messages, statuses and media files cleared!');
            } else {
                alert('Error clearing data');
            }
        }
    }

    function listenToMessages() {
        if (currentChannel) {
            supabase.removeChannel(currentChannel);
        }
        
        currentChannel = supabase
            .channel('messages-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
                payload => {
                    if (currentUser && !showingStatus) {
                        addDateSeparatorIfNeeded(payload.new.time);
                        addMessage(payload.new, payload.new.username === currentUser);
                    }
                })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' },
                () => { 
                    if (currentUser && !showingStatus) {
                        loadMessages(); 
                    }
                })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
                () => { 
                    if (currentUser && !showingStatus) {
                        loadMessages(); 
                    }
                })
            .subscribe();
    }

    function listenToStatuses() {
        supabase
            .channel('statuses-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'statuses' },
                payload => {
                    if (currentUser) {
                        statusViewBtn.style.display = 'inline-block';
                        if (showingStatus) {
                            addStatus(payload.new);
                        } else if (payload.new.username !== currentUser) {
                            statusDot.style.display = 'block';
                            statusViewBtn.classList.add('new-status-animation');
                        }
                    }
                })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'statuses' },
                () => {
                    if (currentUser && showingStatus) loadStatuses();
                    setTimeout(checkAnyStatus, 1000);
                })
            .subscribe();
    }

    function listenToOnlineUsers() {
        supabase
            .channel('online-users-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'online_users' },
                async () => {
                    if (currentUser) await displayOnlineUsers();
                })
            .subscribe();
    }

    function init() {
        listenToMessages();
        listenToStatuses();
        listenToOnlineUsers();
        
        imageInput.addEventListener("change", handleImageUpload);
        statusInput.addEventListener("change", handleStatusUpload);
        
        refreshTopBtn.addEventListener("click", refreshMessages);
        
        setInterval(async () => {
            if (currentUser) {
                await updateMyOnlineStatus();
                await displayOnlineUsers();
            }
        }, 15000);
        
        setInterval(() => {
            if (currentUser) checkAnyStatus();
        }, 60000);
        
        window.addEventListener('beforeunload', () => {
            if (currentUser) {
                supabase.from('online_users').delete().eq('username', currentUser);
            }
        });
        
        loadUserSelection();
    }

    sendBtn.addEventListener("click", send);
    imageBtn.addEventListener("click", handleChatImageClick); 
    statusUploadBtn.addEventListener("click", handleStatusClick);
    statusViewBtn.addEventListener("click", toggleStatusView);
    fullClearBtn.addEventListener("click", fullClear);

    // ==================== TYPING INDICATOR ====================
    let typingChannel = null;
    let typingTimeout = null;

    function setupTyping() {
        if (typingChannel) {
            supabase.removeChannel(typingChannel);
        }

        typingChannel = supabase.channel('typing')
            .on('broadcast', { event: 'typing' }, ({ payload }) => {
                if (payload.user === currentUser) return;

                const indicator = document.getElementById('typingIndicator');
                indicator.style.display = 'block';

                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    indicator.style.display = 'none';
                }, 2500);
            })
            .subscribe();
    }

    msgInput.addEventListener('input', () => {
        if (!currentUser) return;

        if (typingChannel) {
            typingChannel.send({
                type: 'broadcast',
                event: 'typing',
                payload: { user: currentUser }
            });
        }
    });

    userDropdown.addEventListener('change', () => {
        if (userDropdown.value) {
            setupTyping();
        }
    });
        
    init();
});
