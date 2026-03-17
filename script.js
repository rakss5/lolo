document.addEventListener('DOMContentLoaded', function() {
    const SUPABASE_URL = 'https://hhbbwkeazqnyhdcfyqfg.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_7kplsmCA9Bnjo8gQ68Ki0Q_uTZ1bp6D';
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
    
    // Detect if mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    const userDropdown = document.getElementById("userDropdown");
    const msgInput = document.getElementById("msg");
    const chatContainer = document.getElementById("chatContainer");
    const statusContainer = document.getElementById("statusContainer");
    const chatWrap = document.getElementById("chatWrap");
    const statusArea = document.getElementById("statusArea");
    const fullClearBtn = document.getElementById("fullClearBtn");
    const statusViewBtn = document.getElementById("statusViewBtn");
    const statusDot = document.getElementById("statusDot");
    const onlineUsersEl = document.getElementById("onlineUsers");
    const onlineList = document.getElementById("onlineList");
    const lastSeenContainer = document.getElementById("lastSeenContainer");
    const imageInput = document.getElementById("imageInput");
    const statusInput = document.getElementById("statusInput");
    const sendBtn = document.getElementById("sendBtn");
    const imageBtn = document.getElementById("imageBtn");
    const statusUploadBtn = document.getElementById("statusUploadBtn");
    const pastePreview = document.getElementById('pastePreview');
    const previewImage = document.getElementById('previewImage');
    const sendPastedBtn = document.getElementById('sendPastedBtn');

    // Auto-resize textarea
    msgInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // WhatsApp style Enter handling for both mobile and desktop
    msgInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
            if (isMobile) {
                // Mobile: Enter creates new line (default behavior)
                // Only send button sends message
                return;
            } else {
                // Desktop: 
                if (e.shiftKey) {
                    // Shift+Enter: new line (let textarea handle it)
                    return;
                } else {
                    // Enter: send message
                    e.preventDefault();
                    send();
                }
            }
        }
    });

    // Mobile keyboard handling - when keyboard has "Go" or "Send" button
    msgInput.addEventListener("keypress", function(e) {
        if (isMobile && e.key === "Enter" && !e.shiftKey) {
            // On some mobile keyboards, Enter might trigger send
            // We'll prevent it and let the textarea handle new lines
            e.preventDefault();
            // Insert new line manually
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.substring(0, start) + '\n' + this.value.substring(end);
            this.selectionStart = this.selectionEnd = start + 1;
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        }
    });

    // Format time
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

    // Format last seen
    function formatLastSeen(timestamp) {
        if (!timestamp) return 'Offline';
        
        const lastSeen = new Date(timestamp);
        const now = new Date();
        const diffSeconds = Math.floor((now - lastSeen) / 1000);
        
        if (diffSeconds <= 10) return 'Online';
        
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const lastSeenDate = new Date(lastSeen.getFullYear(), lastSeen.getMonth(), lastSeen.getDate());
        const timeString = lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        
        if (lastSeenDate.getTime() === today.getTime()) {
            return `Today at ${timeString}`;
        } else if (lastSeenDate.getTime() === yesterday.getTime()) {
            return `Yesterday at ${timeString}`;
        } else {
            const dateString = lastSeen.toLocaleDateString([], { 
                day: 'numeric', 
                month: 'short',
                year: lastSeen.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
            return `${dateString} at ${timeString}`;
        }
    }

    // Add date separator
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

    // Check YouTube links
    function isYouTubeLink(text) {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
        return youtubeRegex.test(text.trim());
    }

    // Format message with line breaks
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

    // Handle image paste
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
        if (!pastePreview.contains(e.target) && e.target !== msgInput) {
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
        
        await supabase.from('messages').insert([message]);
        msgInput.value = '';
        msgInput.style.height = 'auto';
        await updateMyOnlineStatus();
    }

    // Check status
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

    // Update online status
    async function updateMyOnlineStatus() {
        if (!currentUser) return;
        await supabase.from('online_users').upsert({
            username: currentUser,
            last_seen: new Date().toISOString()
        });
    }

    // Display online users
    async function displayOnlineUsers() {
        if (!currentUser) {
            onlineUsersEl.style.display = "none";
            lastSeenContainer.style.display = "none";
            return;
        }
        
        const { data } = await supabase
            .from('online_users')
            .select('username')
            .gt('last_seen', new Date(Date.now() - 10000).toISOString());
            
        if (data) {
            const otherUsers = data
                .filter(u => u.username !== currentUser)
                .filter(u => u.username === 'sam' || u.username === 'kimi')
                .map(u => u.username);
            onlineUsersEl.style.display = "block";
            onlineList.innerText = otherUsers.length > 0 ? otherUsers.join(', ') : 'none';
        }

        const { data: allUsers } = await supabase
            .from('online_users')
            .select('username, last_seen')
            .in('username', ['sam', 'kimi']);
            
        if (allUsers && allUsers.length > 0) {
            let lastSeenHtml = '';
            const now = new Date();
            
            for (const user of ['sam', 'kimi']) {
                if (user === currentUser) continue;
                
                const userData = allUsers.find(u => u.username === user);
                const lastSeen = userData?.last_seen;
                const isOnline = lastSeen && (now - new Date(lastSeen)) <= 10000;
                
                if (!isOnline && lastSeen) {
                    lastSeenHtml += `<span style="color:${colors[user]};">${user}</span>: ${formatLastSeen(lastSeen)} `;
                }
            }
            
            if (lastSeenHtml) {
                lastSeenContainer.style.display = "block";
                lastSeenContainer.innerHTML = lastSeenHtml;
            } else {
                lastSeenContainer.style.display = "none";
            }
        }
    }

    // User selection
    userDropdown.addEventListener("change", async (e) => {
        if (e.target.value) {
            if (currentUser) {
                await supabase.from('online_users').delete().eq('username', currentUser);
            }
            currentUser = e.target.value;
            await updateMyOnlineStatus();
            chatContainer.innerHTML = '';
            lastMessageDate = null;
            loadMessages();
            await displayOnlineUsers();
            await checkAnyStatus();
        } else {
            currentUser = null;
            onlineUsersEl.style.display = "none";
            lastSeenContainer.style.display = "none";
        }
    });

    // Send message
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
        
        const { error } = await supabase.from('messages').insert([message]);
        if (!error) {
            msgInput.value = '';
            msgInput.style.height = 'auto';
            await updateMyOnlineStatus();
        }
    }

    // Add message to chat
    function addMessage(msg, isOwn) {
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
                await supabase.from('messages').update({
                    text: newText,
                    edited: true,
                    edited_at: new Date().toISOString()
                }).eq('id', message.id);
            }
        }
        
        async function deleteMessage(messageId) {
            if (confirm('Delete message?')) {
                await supabase.from('messages').delete().eq('id', messageId);
            }
        }
        
        let content = `<strong style="color:${colors[msg.username] || '#fff'};">${msg.username}</strong><br>`;
        
        if (msg.image_url) {
            content += `<div><img src="${msg.image_url}" style="width:100%; max-width:320px; border-radius:15px; cursor:pointer;" onclick="window.open(this.src)"></div>`;
            if (msg.text) content += `<div style="margin-top:5px;">${msg.text.replace(/\n/g, '<br>')}</div>`;
        } else {
            content += msg.text.replace(/\n/g, '<br>');
        }
        
        if (msg.edited) content += ` <span class="edited-tag">(edited)</span>`;
        content += `<div class="time">${formatMessageTime(msg.time)}</div>`;
        
        div.innerHTML = content;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Load messages
    async function loadMessages() {
        if (!currentUser) return;
        
        const { data } = await supabase
            .from('messages')
            .select('*')
            .order('time', { ascending: true });
            
        chatContainer.innerHTML = '';
        lastMessageDate = null;
        
        if (data) {
            data.forEach(msg => {
                addDateSeparatorIfNeeded(msg.time);
                addMessage(msg, msg.username === currentUser);
            });
        }
    }

    // Handle image upload
    async function handleImageUpload(e) {
        if (!currentUser) {
            alert('Please select a user first');
            imageInput.value = '';
            return;
        }
        
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) {
            alert('Please select an image file only');
            imageInput.value = '';
            return;
        }
        
        await uploadImage(file);
        imageInput.value = '';
    }

    // Handle status upload
    async function handleStatusUpload(e) {
        if (!currentUser) {
            alert('Please select a user first');
            statusInput.value = '';
            return;
        }
        
        const file = e.target.files[0];
        if (!file) return;
        
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
        
        await supabase.from('statuses').insert([status]);
        msgInput.value = '';
        msgInput.style.height = 'auto';
        statusInput.value = '';
        alert('Status uploaded!');
        await updateMyOnlineStatus();
        setTimeout(checkAnyStatus, 1000);
    }

    // Add status
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

    // Load statuses
    async function loadStatuses() {
        if (!currentUser) return;
        
        const oneDayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
        const { data } = await supabase
            .from('statuses')
            .select('*')
            .gt('time', oneDayAgo)
            .order('time', { ascending: false });
            
        statusContainer.innerHTML = '';
        if (data) data.forEach(addStatus);
        
        lastSeenStatusTime = new Date().toISOString();
        statusDot.style.display = 'none';
        statusViewBtn.classList.remove('new-status-animation');
    }

    // Toggle status view
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

    // Full clear
    async function fullClear() {
        if (!currentUser) {
            alert('Please select a user first');
            return;
        }
        
        if (confirm('Delete ALL data?')) {
            await supabase.from('messages').delete().neq('id', 0);
            await supabase.from('statuses').delete().neq('id', 0);
            chatContainer.innerHTML = '';
            statusContainer.innerHTML = '';
            lastMessageDate = null;
            checkAnyStatus();
        }
    }

    // Listen to realtime updates
    function listenToMessages() {
        supabase
            .channel('messages-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
                payload => {
                    if (currentUser) {
                        addDateSeparatorIfNeeded(payload.new.time);
                        addMessage(payload.new, payload.new.username === currentUser);
                    }
                })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' },
                () => { if (currentUser) loadMessages(); })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
                () => { if (currentUser) loadMessages(); })
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

    // Initialize
    function init() {
        listenToMessages();
        listenToStatuses();
        listenToOnlineUsers();
        
        imageInput.addEventListener("change", handleImageUpload);
        statusInput.addEventListener("change", handleStatusUpload);
        
        setInterval(async () => {
            if (currentUser) {
                await updateMyOnlineStatus();
                await displayOnlineUsers();
            }
        }, 5000);
        
        setInterval(() => {
            if (currentUser) checkAnyStatus();
        }, 60000);
        
        window.addEventListener('beforeunload', () => {
            if (currentUser) {
                supabase.from('online_users').delete().eq('username', currentUser);
            }
        });
    }

    // Event listeners
    sendBtn.addEventListener("click", send);
    imageBtn.addEventListener("click", () => imageInput.click());
    statusUploadBtn.addEventListener("click", () => statusInput.click());
    statusViewBtn.addEventListener("click", toggleStatusView);
    fullClearBtn.addEventListener("click", fullClear);

    init();
});
