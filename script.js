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
    let hasNewStatus = false; // নতুন স্ট্যাটাস আছে কিনা
    
    // DOM Elements
    const userDropdown = document.getElementById("userDropdown");
    const msgInput = document.getElementById("msg");
    const chatWrap = document.getElementById("chatWrap");
    const chatContainer = document.getElementById("chatContainer");
    const statusArea = document.getElementById("statusArea");
    const statusContainer = document.getElementById("statusContainer");
    const fullClearBtn = document.getElementById("fullClearBtn");
    const statusViewBtn = document.getElementById("statusViewBtn");
    const statusBadge = document.getElementById("statusBadge");
    const onlineUsersEl = document.getElementById("onlineUsers");
    const onlineList = document.getElementById("onlineList");
    const imageInput = document.getElementById("imageInput");
    const statusInput = document.getElementById("statusInput");
    const sendBtn = document.getElementById("sendBtn");
    const imageBtn = document.getElementById("imageBtn");
    const statusUploadBtn = document.getElementById("statusUploadBtn");
    
    // ========== অনলাইন ইউজার ম্যানেজমেন্ট ==========
    
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
            loadStatuses();
            await displayOnlineUsers();
            
            // নতুন ইউজার সিলেক্ট করলে নোটিফিকেশন রিসেট
            hasNewStatus = false;
            statusBadge.style.display = 'none';
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
            time: new Date().toISOString()
        };
        
        const { error } = await supabase.from('messages').insert([message]);
        
        if(!error) {
            msgInput.value = '';
            await updateMyOnlineStatus();
        }
    }
    
    function addMessage(msg, isOwn) {
        const div = document.createElement('div');
        div.className = `msg ${isOwn ? 'own' : ''}`;
        
        let content = `<strong style="color:${colors[msg.username] || '#fff'};">${msg.username}</strong><br>`;
        
        if(msg.image_url) {
            content += `<div style="margin:5px 0;">`;
            content += `<img src="${msg.image_url}" style="width:100%; max-width:320px; max-height:400px; border-radius:15px; box-shadow:0 4px 12px rgba(0,0,0,0.3); cursor:pointer; display:block;" onclick="window.open(this.src)">`;
            content += `</div>`;
            if(msg.text) {
                content += `<div style="margin-top:5px; background-color:${isOwn ? '#2563eb' : colors[msg.username] || '#334155'}; color:white; padding:8px 12px; border-radius:14px; display:inline-block;">${msg.text}</div>`;
            }
        } else {
            content += msg.text;
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
    
    function listenToMessages() {
        supabase
            .channel('messages-channel')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages' 
            }, payload => {
                console.log('New message:', payload.new);
                if(currentUser) {
                    addMessage(payload.new, payload.new.username === currentUser);
                }
            })
            .subscribe();
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
            time: new Date().toISOString()
        };
        
        await supabase.from('messages').insert([message]);
        msgInput.value = '';
        imageInput.value = '';
        await updateMyOnlineStatus();
    }
    
    // ========== স্ট্যাটাস ফাংশন (নোটিফিকেশন সহ) ==========
    
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
    }
    
    // রিয়েলটাইম স্ট্যাটাস লিসেনার (নোটিফিকেশন সহ)
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
                    // যদি স্ট্যাটাস ভিউ না দেখা হয় এবং নিজের স্ট্যাটাস না হয়
                    if(!showingStatus && payload.new.username !== currentUser) {
                        hasNewStatus = true;
                        statusBadge.style.display = 'flex';
                    }
                    
                    // স্ট্যাটাস ভিউ ওপেন থাকলে সরাসরি দেখাও
                    if(showingStatus) {
                        addStatus(payload.new);
                    }
                }
            })
            .subscribe();
    }
    
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
            
            // স্ট্যাটাস দেখলে নোটিফিকেশন সরাও
            hasNewStatus = false;
            statusBadge.style.display = 'none';
        } else {
            chatWrap.style.display = "flex";
            statusArea.style.display = "none";
            statusViewBtn.style.background = "#8b5cf6";
        }
    }
    
    // ========== ক্লিয়ার ফাংশন ==========
    
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
        }
    }
    
    // ========== ইনিশিয়ালাইজ ==========
    
    function init() {
        console.log('App initializing...');
        
        listenToMessages();
        listenToStatuses(); // আপডেটেড ভার্সন
        listenToOnlineUsers();
        
        imageInput.addEventListener("change", handleImageUpload);
        statusInput.addEventListener("change", handleStatusUpload);
        
        setInterval(async () => {
            if(currentUser) {
                await updateMyOnlineStatus();
                await displayOnlineUsers();
            }
        }, 10000);
        
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
