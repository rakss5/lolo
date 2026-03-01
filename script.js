// script.js
document.addEventListener('DOMContentLoaded', function() {
    // Your exact Supabase configuration
    const SUPABASE_URL = 'https://hhbbwkeazqnyhdcfyqfg.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_7kplsmCA9Bnjo8gQ68Ki0Q_uTZ1bp6D';
    
    // Initialize Supabase
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // USERS & COLORS
    const colors = {
        eesti: "#22c55e",
        ralii: "#619efa"
    };
    
    let currentUser = null;
    let showingStatus = false;
    let lastSeenStatusTime = null;
    let newStatusAvailable = false;
    
    // DOM Elements
    const userDropdown = document.getElementById("userDropdown");
    const msgInput = document.getElementById("msg");
    const chatWrap = document.getElementById("chatWrap");
    const chatContainer = document.getElementById("chatContainer");
    const statusArea = document.getElementById("statusArea");
    const statusContainer = document.getElementById("statusContainer");
    const fullClearBtn = document.getElementById("fullClearBtn");
    const statusViewBtn = document.getElementById("statusViewBtn");
    const statusDot = document.getElementById("statusDot");
    const onlineUsersEl = document.getElementById("onlineUsers");
    const onlineList = document.getElementById("onlineList");
    const imageInput = document.getElementById("imageInput");
    const statusInput = document.getElementById("statusInput");
    const sendBtn = document.getElementById("sendBtn");
    const imageBtn = document.getElementById("imageBtn");
    const statusUploadBtn = document.getElementById("statusUploadBtn");
    
    // ========== স্ট্যাটাস চেক ফাংশন ==========
    
    async function checkAnyStatus() {
        if(!currentUser) return;
        
        const oneDayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
        const { data } = await supabase
            .from('statuses')
            .select('username, time')
            .gt('time', oneDayAgo)
            .order('time', { ascending: false });
        
        if(data && data.length > 0) {
            statusViewBtn.style.display = 'inline-block';
            
            if(lastSeenStatusTime) {
                const newStatuses = data.filter(s => new Date(s.time) > new Date(lastSeenStatusTime));
                if(newStatuses.length > 0 && !showingStatus) {
                    newStatusAvailable = true;
                    statusDot.style.display = 'block';
                    statusViewBtn.classList.add('new-status-animation');
                } else {
                    newStatusAvailable = false;
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
    
    // ========== অনলাইন ইউজার ==========
    
    async function updateMyOnlineStatus() {
        if(!currentUser) return;
        await supabase.from('online_users').upsert({ 
            username: currentUser, 
            last_seen: new Date().toISOString() 
        });
    }
    
    async function displayOnlineUsers() {
        if(!currentUser) return;
        
        const { data } = await supabase
            .from('online_users')
            .select('username')
            .gt('last_seen', new Date(Date.now() - 10000).toISOString());
        
        if(data) {
            const otherUsers = data
                .filter(u => u.username !== currentUser)
                .filter(u => u.username === 'eesti' || u.username === 'ralii')
                .map(u => u.username);
            
            onlineUsersEl.style.display = "block";
            onlineList.innerText = otherUsers.length > 0 ? otherUsers.join(', ') : 'none';
        }
    }
    
    // ========== ইউজার সিলেক্ট ==========
    
    userDropdown.addEventListener("change", async (e) => {
        if(e.target.value) {
            if(currentUser) {
                await supabase.from('online_users').delete().eq('username', currentUser);
            }
            
            currentUser = e.target.value;
            console.log('User selected:', currentUser);
            
            await updateMyOnlineStatus();
            
            chatContainer.innerHTML = '';
            loadMessages();
            await displayOnlineUsers();
            await checkAnyStatus();
        }
    });
    
    // ========== মেসেজ ফাংশন ==========
    
    async function send() {
        if(!currentUser) {
            alert('Please select a user first');
            return;
        }
        if(!msgInput.value.trim()) return;
        
        const message = {
            username: currentUser,
            text: msgInput.value.trim(),
            time: new Date().toISOString(),
            edited: false
        };
        
        const { error } = await supabase.from('messages').insert([message]);
        
        if(!error) {
            msgInput.value = '';
            await updateMyOnlineStatus();
        }
    }
    
    // ADD MESSAGE TO UI - লং প্রেস সহ
    function addMessage(msg, isOwn) {
        const div = document.createElement('div');
        div.className = `msg ${isOwn ? 'own' : ''}`;
        div.dataset.id = msg.id;
        div.dataset.time = msg.time;
        div.dataset.username = msg.username;
        div.dataset.text = msg.text || '';
        
        // লং প্রেস টাইমার
        let pressTimer;
        const longPressDuration = 500;
        
        div.addEventListener('mousedown', startPress);
        div.addEventListener('touchstart', startPress, { passive: true });
        div.addEventListener('mouseup', cancelPress);
        div.addEventListener('touchend', cancelPress);
        div.addEventListener('mouseleave', cancelPress);
        div.addEventListener('touchcancel', cancelPress);
        
        function startPress(e) {
            if (isOwn && isWithin20Minutes(msg.time)) {
                pressTimer = setTimeout(() => {
                    showEditMenu(div, msg);
                }, longPressDuration);
            }
        }
        
        function cancelPress() {
            if (pressTimer) {
                clearTimeout(pressTimer);
            }
        }
        
        function isWithin20Minutes(messageTime) {
            const messageDate = new Date(messageTime);
            const now = new Date();
            const diffMinutes = (now - messageDate) / (1000 * 60);
            return diffMinutes <= 20;
        }
        
        function showEditMenu(element, message) {
            removeExistingMenu();
            
            const menu = document.createElement('div');
            menu.className = 'message-menu';
            menu.innerHTML = `
                <div class="menu-item edit-item">
                    <span>✏️ Edit Message</span>
                </div>
                <div class="menu-item delete-item">
                    <span>🗑️ Delete Message</span>
                </div>
            `;
            
            const rect = element.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.left = `${rect.left + (rect.width / 2)}px`;
            menu.style.top = `${rect.top - 10}px`;
            menu.style.transform = 'translate(-50%, -100%)';
            
            menu.querySelector('.edit-item').addEventListener('click', () => {
                editMessage(message);
                menu.remove();
            });
            
            menu.querySelector('.delete-item').addEventListener('click', () => {
                deleteMessage(message.id);
                menu.remove();
            });
            
            document.body.appendChild(menu);
            
            setTimeout(() => {
                document.addEventListener('click', function closeMenu(e) {
                    if (!menu.contains(e.target) && e.target !== element) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                });
            }, 100);
        }
        
        function removeExistingMenu() {
            const oldMenu = document.querySelector('.message-menu');
            if (oldMenu) oldMenu.remove();
        }
        
        async function editMessage(message) {
            const newText = prompt('Edit your message:', message.text);
            if (newText && newText !== message.text) {
                await supabase
                    .from('messages')
                    .update({ 
                        text: newText, 
                        edited: true, 
                        edited_at: new Date().toISOString() 
                    })
                    .eq('id', message.id);
            }
        }
        
        async function deleteMessage(messageId) {
            if (confirm('Delete this message?')) {
                await supabase
                    .from('messages')
                    .delete()
                    .eq('id', messageId);
            }
        }
        
        // মেসেজ কন্টেন্ট বিল্ড
        let content = `<strong style="color:${colors[msg.username] || '#fff'};">${msg.username}</strong><br>`;
        
        if (msg.image_url) {
            content += `<div style="margin:5px 0;">`;
            content += `<img src="${msg.image_url}" style="width:100%; max-width:320px; max-height:400px; border-radius:15px; box-shadow:0 4px 12px rgba(0,0,0,0.3); cursor:pointer; display:block;" onclick="window.open(this.src)">`;
            content += `</div>`;
            if (msg.text) {
                content += `<div style="margin-top:5px; background-color:${isOwn ? '#2563eb' : colors[msg.username] || '#334155'}; color:white; padding:8px 12px; border-radius:14px; display:inline-block;">${msg.text}</div>`;
            }
        } else {
            content += msg.text;
        }
        
        if (msg.edited) {
            content += ` <span class="edited-tag">(edited)</span>`;
        }
        
        content += `<div class="time">${new Date(msg.time).toLocaleTimeString()}</div>`;
        
        div.innerHTML = content;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    async function loadMessages() {
        if(!currentUser) return;
        
        const { data } = await supabase
            .from('messages')
            .select('*')
            .order('time', { ascending: true });
        
        chatContainer.innerHTML = '';
        if(data) {
            data.forEach(msg => addMessage(msg, msg.username === currentUser));
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    // ========== ইমেজ আপলোড ==========
    
    async function handleImageUpload(e) {
        if(!currentUser) {
            alert('Please select a user first');
            imageInput.value = '';
            return;
        }
        
        const file = e.target.files[0];
        if(!file || !file.type.startsWith('image/')) {
            alert('Please select an image file only');
            imageInput.value = '';
            return;
        }
        
        const fileExt = file.name.split('.').pop();
        const fileName = `chat_${Date.now()}.${fileExt}`;
        const filePath = `${currentUser}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(filePath, file);
            
        if(uploadError) {
            alert('Upload failed: ' + uploadError.message);
            imageInput.value = '';
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
        imageInput.value = '';
        await updateMyOnlineStatus();
    }
    
    // ========== স্ট্যাটাস ফাংশন ==========
    
    async function handleStatusUpload(e) {
        if(!currentUser) {
            alert('Please select a user first');
            statusInput.value = '';
            return;
        }
        
        const file = e.target.files[0];
        if(!file) return;
        
        const fileExt = file.name.split('.').pop();
        const fileName = `status_${Date.now()}.${fileExt}`;
        const filePath = `${currentUser}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(filePath, file);
            
        if(uploadError) {
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
        statusInput.value = '';
        alert('Status uploaded!');
        await updateMyOnlineStatus();
        setTimeout(checkAnyStatus, 1000);
    }
    
    function addStatus(status) {
        const div = document.createElement('div');
        div.className = 'status-item';
        div.style.borderColor = colors[status.username] || '#334155';
        
        let content = `<strong style="color:${colors[status.username] || '#fff'};">${status.username}</strong><br>`;
        
        if(status.caption) {
            content += `<div style="color:white; margin:8px 0;">${status.caption}</div>`;
        }
        
        if(status.media_type === 'image') {
            content += `<img src="${status.media_url}" class="status-media" style="cursor:pointer;" onclick="window.open(this.src)">`;
        } else {
            content += `<video src="${status.media_url}" class="status-media" controls></video>`;
        }
        
        content += `<div class="time">${new Date(status.time).toLocaleTimeString()}</div>`;
        
        div.innerHTML = content;
        statusContainer.appendChild(div);
        statusContainer.scrollTop = statusContainer.scrollHeight;
    }
    
    async function loadStatuses() {
        if(!currentUser) return;
        
        const oneDayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
        const { data } = await supabase
            .from('statuses')
            .select('*')
            .gt('time', oneDayAgo)
            .order('time', { ascending: false });
        
        statusContainer.innerHTML = '';
        if(data) data.forEach(addStatus);
        
        lastSeenStatusTime = new Date().toISOString();
        newStatusAvailable = false;
        statusDot.style.display = 'none';
        statusViewBtn.classList.remove('new-status-animation');
    }
    
    // ========== রিয়েলটাইম লিসেনার ==========
    
    function listenToMessages() {
        supabase
            .channel('messages-channel')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages' 
            }, payload => {
                if(currentUser) {
                    addMessage(payload.new, payload.new.username === currentUser);
                }
            })
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'messages' 
            }, payload => {
                if(currentUser) {
                    // পুরো চ্যাট রিলোড না করে শুধু ঐ মেসেজ আপডেট করা ভালো
                    // তবে সহজ উপায় হল পুরো চ্যাট রিলোড
                    loadMessages();
                }
            })
            .on('postgres_changes', { 
                event: 'DELETE', 
                schema: 'public', 
                table: 'messages' 
            }, () => {
                if(currentUser) {
                    loadMessages();
                }
            })
            .subscribe();
    }
    
    function listenToStatuses() {
        supabase
            .channel('statuses-channel')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'statuses' 
            }, payload => {
                console.log('New status:', payload.new);
                
                if(currentUser) {
                    statusViewBtn.style.display = 'inline-block';
                    
                    if(showingStatus) {
                        addStatus(payload.new);
                    } 
                    else if(payload.new.username !== currentUser) {
                        newStatusAvailable = true;
                        statusDot.style.display = 'block';
                        statusViewBtn.classList.add('new-status-animation');
                    }
                }
            })
            .on('postgres_changes', { 
                event: 'DELETE', 
                schema: 'public', 
                table: 'statuses' 
            }, () => {
                if(currentUser && showingStatus) {
                    loadStatuses();
                }
                setTimeout(checkAnyStatus, 1000);
            })
            .subscribe();
    }
    
    function listenToOnlineUsers() {
        supabase
            .channel('online-users-channel')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'online_users' 
            }, async () => {
                if(currentUser) {
                    await displayOnlineUsers();
                }
            })
            .subscribe();
    }
    
    // ========== টগল ফাংশন ==========
    
    function toggleStatusView() {
        if(!currentUser) {
            alert('Please select a user first');
            return;
        }
        
        showingStatus = !showingStatus;
        if(showingStatus) {
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
    
    // ========== ক্লিয়ার ==========
    
    async function fullClear() {
        if(!currentUser) {
            alert('Please select a user first');
            return;
        }
        
        if(confirm('Delete ALL data?')) {
            await supabase.from('messages').delete().gte('id', 0);
            await supabase.from('statuses').delete().gte('id', 0);
            chatContainer.innerHTML = '';
            statusContainer.innerHTML = '';
            checkAnyStatus();
        }
    }
    
    // ========== ইনিশিয়ালাইজ ==========
    
    function init() {
        console.log('App initializing...');
        
        listenToMessages();
        listenToStatuses();
        listenToOnlineUsers();
        
        imageInput.addEventListener("change", handleImageUpload);
        statusInput.addEventListener("change", handleStatusUpload);
        
        setInterval(async () => {
            if(currentUser) {
                await updateMyOnlineStatus();
                await displayOnlineUsers();
            }
        }, 10000);
        
        setInterval(() => {
            if(currentUser) {
                checkAnyStatus();
            }
        }, 60000);
        
        window.addEventListener('beforeunload', function() {
            if(currentUser) {
                supabase.from('online_users').delete().eq('username', currentUser);
            }
        });
        
        console.log('App initialized!');
    }
    
    // Event Listeners
    sendBtn.addEventListener("click", send);
    imageBtn.addEventListener("click", () => imageInput.click());
    statusUploadBtn.addEventListener("click", () => statusInput.click());
    statusViewBtn.addEventListener("click", toggleStatusView);
    fullClearBtn.addEventListener("click", fullClear);
    msgInput.addEventListener("keydown", e => e.key === "Enter" && send());
    
    init();
});
