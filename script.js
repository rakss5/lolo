// script.js
document.addEventListener('DOMContentLoaded', function() {
    // Your exact Supabase configuration
    const SUPABASE_URL = 'https://hhbbwkeazqnyhdcfyqfg.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_7kplsmCA9Bnjo8gQ68Ki0Q_uTZ1bp6D';
    
    // Initialize Supabase
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // USERS & COLORS - শুধু eesti এবং ralii
    const colors = {
        eesti: "#22c55e",
        ralii: "#619efa"
    };
    
    let currentUser = null; // শুরুতে null
    let showingStatus = false;
    
    // DOM Elements
    const userDropdown = document.getElementById("userDropdown");
    const msgInput = document.getElementById("msg");
    const chatWrap = document.getElementById("chatWrap");
    const chatContainer = document.getElementById("chatContainer");
    const statusArea = document.getElementById("statusArea");
    const statusContainer = document.getElementById("statusContainer");
    const fullClearBtn = document.getElementById("fullClearBtn");
    const statusViewBtn = document.getElementById("statusViewBtn");
    const onlineUsersEl = document.getElementById("onlineUsers");
    const onlineList = document.getElementById("onlineList");
    const imageInput = document.getElementById("imageInput");
    const statusInput = document.getElementById("statusInput");
    const sendBtn = document.getElementById("sendBtn");
    const imageBtn = document.getElementById("imageBtn");
    const statusUploadBtn = document.getElementById("statusUploadBtn");
    
    // Event Listeners
    sendBtn.addEventListener("click", send);
    imageBtn.addEventListener("click", () => imageInput.click());
    statusUploadBtn.addEventListener("click", () => statusInput.click());
    statusViewBtn.addEventListener("click", toggleStatusView);
    fullClearBtn.addEventListener("click", fullClear);
    msgInput.addEventListener("keydown", e => e.key === "Enter" && send());
    
    // ইউজার সিলেক্ট করার পর
    userDropdown.addEventListener("change", (e) => {
        if(e.target.value) {
            currentUser = e.target.value;
            console.log('User selected:', currentUser);
            
            // মেসেজ লোড এবং অনলাইন আপডেট
            loadMessages();
            updateOnline();
            
            // স্ট্যাটাস লোড
            loadStatuses();
        }
    });
    
    // SEND MESSAGE (টেক্সট মেসেজ)
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
        
        console.log('Sending message:', message);
        
        const { data, error } = await supabase.from('messages').insert([message]);
        
        if(error) {
            console.error('Error sending message:', error);
            alert('Error: ' + error.message);
        } else {
            console.log('Message sent successfully:', data);
            msgInput.value = '';
        }
    }
    
    // ADD MESSAGE TO UI (ইমেজ সহ)
    function addMessage(msg, isOwn) {
        const div = document.createElement('div');
        div.className = `msg ${isOwn ? 'own' : ''}`;
        
        let content = '';
        
        // ইউজারনেম দেখান (ইমেজ থাকলেও দেখাবে)
        content += `<strong style="color:${colors[msg.username] || '#fff'};">${msg.username}</strong><br>`;
        
        // যদি ইমেজ থাকে
        if(msg.image_url) {
            // শুধু ইমেজ - কোন ব্যাকগ্রাউন্ড নেই
            content += `<div style="margin:5px 0;">`;
            content += `<img src="${msg.image_url}" style="width:100%; max-width:320px; max-height:400px; border-radius:15px; box-shadow:0 4px 12px rgba(0,0,0,0.3); cursor:pointer; display:block;" onclick="window.open(this.src)">`;
            content += `</div>`;
            
            // ক্যাপশন থাকলে আলাদা ব্যাকগ্রাউন্ডে দেখান
            if(msg.text) {
                content += `<div style="margin-top:5px; background-color:${isOwn ? '#2563eb' : colors[msg.username] || '#334155'}; color:white; padding:8px 12px; border-radius:14px; display:inline-block; max-width:100%;">${msg.text}</div>`;
            }
        } else {
            // সাধারণ টেক্সট মেসেজ
            content += msg.text;
        }
        
        content += `<div class="time">${new Date(msg.time).toLocaleTimeString()}</div>`;
        
        div.innerHTML = content;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    // LOAD MESSAGES
    async function loadMessages() {
        if(!currentUser) return;
        
        console.log('Loading messages...');
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('time', { ascending: true });
        
        if(error) {
            console.error('Error loading messages:', error);
            alert('Error loading messages: ' + error.message);
            return;
        }
        
        console.log('Messages loaded:', data);
        chatContainer.innerHTML = '';
        if(data) {
            data.forEach(msg => addMessage(msg, msg.username === currentUser));
        }
    }
    
    // LISTEN REALTIME MESSAGES
    function listenRealtimeMessages() {
        console.log('Setting up realtime messages listener...');
        supabase
            .channel('messages-channel')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages' 
            }, payload => {
                console.log('New message received:', payload.new);
                if(currentUser) { // শুধু ইউজার সিলেক্ট করলে
                    addMessage(payload.new, payload.new.username === currentUser);
                }
            })
            .subscribe((status) => {
                console.log('Realtime subscription status:', status);
            });
    }
    
    // LISTEN REALTIME STORIES
    function listenRealtimeStories() {
        console.log('Setting up realtime statuses listener...');
        supabase
            .channel('statuses-channel')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'statuses' 
            }, payload => {
                console.log('New status received:', payload.new);
                if(currentUser && showingStatus) { // শুধু ইউজার সিলেক্ট করলে এবং স্ট্যাটাস ভিউ ওপেন থাকলে
                    addStatus(payload.new);
                }
            })
            .subscribe((status) => {
                console.log('Realtime status subscription:', status);
            });
    }
    
    // HANDLE IMAGE UPLOAD FOR CHAT
    async function handleImageUpload(e) {
        if(!currentUser) {
            alert('Please select a user first');
            imageInput.value = '';
            return;
        }
        
        const file = e.target.files[0];
        if(!file) return;
        
        // শুধু ইমেজ ফাইল অনুমোদিত
        if(!file.type.startsWith('image/')) {
            alert('Please select an image file only');
            imageInput.value = '';
            return;
        }
        
        console.log('Uploading image for chat:', file.name);
        
        const fileExt = file.name.split('.').pop();
        const fileName = `chat_${Date.now()}.${fileExt}`;
        const filePath = `${currentUser}/${fileName}`;
        
        // ইমেজ আপলোড
        const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(filePath, file);
            
        if(uploadError) {
            console.error('Upload error:', uploadError);
            alert('Upload failed: ' + uploadError.message);
            imageInput.value = '';
            return;
        }
        
        // পাবলিক URL পাওয়া
        const { data: { publicUrl } } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);
        
        console.log('Image uploaded, URL:', publicUrl);
        
        // ক্যাপশন নেওয়া
        const caption = msgInput.value.trim() || '';
        
        // মেসেজ হিসেবে ইমেজ পাঠানো
        const message = {
            username: currentUser,
            text: caption,
            image_url: publicUrl,
            time: new Date().toISOString()
        };
        
        console.log('Sending image message:', message);
        
        const { error } = await supabase.from('messages').insert([message]);
        
        if(error) {
            console.error('Error sending image message:', error);
            alert('Error: ' + error.message);
        } else {
            console.log('Image message sent successfully');
            msgInput.value = '';
            imageInput.value = '';
        }
    }
    
    // HANDLE STATUS UPLOAD
    async function handleStatusUpload(e) {
        if(!currentUser) {
            alert('Please select a user first');
            statusInput.value = '';
            return;
        }
        
        const file = e.target.files[0];
        if(!file) return;
        
        console.log('Uploading status:', file.name);
        
        const fileExt = file.name.split('.').pop();
        const fileName = `status_${Date.now()}.${fileExt}`;
        const filePath = `${currentUser}/${fileName}`;
        
        // ফাইল আপলোড
        const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(filePath, file);
            
        if(uploadError) {
            console.error('Upload error:', uploadError);
            alert('Upload failed: ' + uploadError.message);
            statusInput.value = '';
            return;
        }
        
        // পাবলিক URL পাওয়া
        const { data: { publicUrl } } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);
        
        console.log('Status uploaded, URL:', publicUrl);
        
        const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
        
        // ক্যাপশন নেওয়া
        const caption = msgInput.value.trim() || '';
        
        const status = {
            username: currentUser,
            media_url: publicUrl,
            media_type: mediaType,
            caption: caption,
            time: new Date().toISOString()
        };
        
        console.log('Adding status:', status);
        
        const { error } = await supabase.from('statuses').insert([status]);
        
        if(error) {
            console.error('Error adding status:', error);
            alert('Error adding status: ' + error.message);
        } else {
            msgInput.value = '';
            statusInput.value = '';
            alert('Status uploaded successfully!');
            
            // যদি স্ট্যাটাস ভিউ ওপেন থাকে, তাহলে দেখাবে
            if(showingStatus) {
                addStatus(status);
            }
        }
    }
    
    // ADD STATUS TO UI
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
    
    // LOAD STATUSES
    async function loadStatuses() {
        if(!currentUser) return;
        
        console.log('Loading statuses...');
        const oneDayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
        const { data, error } = await supabase
            .from('statuses')
            .select('*')
            .gt('time', oneDayAgo)
            .order('time', { ascending: false });
        
        if(error) {
            console.error('Error loading statuses:', error);
            alert('Error loading statuses: ' + error.message);
            return;
        }
        
        console.log('Statuses loaded:', data);
        statusContainer.innerHTML = '';
        if(data) data.forEach(addStatus);
    }
    
    // TOGGLE STATUS VIEW
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
        }
    }
    
    // UPDATE ONLINE USERS - ৩০ সেকেন্ড টাইমিং
    async function updateOnline() {
        if(!currentUser) return;
        
        // নিজের অনলাইন স্ট্যাটাস আপডেট
        await supabase.from('online_users').upsert({ 
            username: currentUser, 
            last_seen: new Date().toISOString() 
        });
        
        // ৩০ সেকেন্ডের মধ্যে যারা active ছিল তাদের দেখা
        const thirtySecAgo = new Date(Date.now() - 30*1000).toISOString();
        const { data } = await supabase
            .from('online_users')
            .select('username')
            .gt('last_seen', thirtySecAgo);
        
        if(data) {
            // অন্য ইউজার খুঁজি (নিজেকে বাদ দিয়ে)
            const otherUsers = data
                .filter(u => u.username !== currentUser)
                .filter(u => u.username === 'eesti' || u.username === 'ralii')
                .map(u => u.username);
            
            // অনলাইন ইউজার দেখাও (শুধু অন্য ইউজার)
            onlineUsersEl.style.display = "block";
            onlineList.innerText = otherUsers.length > 0 ? otherUsers.join(', ') : 'none';
            
            console.log('Other online users:', otherUsers);
        }
    }
    
    // FULL CLEAR (BOTH USERS)
    async function fullClear() {
        if(!currentUser) {
            alert('Please select a user first');
            return;
        }
        
        if(confirm('Delete ALL data including statuses?')) {
            await supabase.from('messages').delete().gte('id', 0);
            await supabase.from('statuses').delete().gte('id', 0);
            chatContainer.innerHTML = '';
            statusContainer.innerHTML = '';
            alert('All data cleared!');
        }
    }
    
    // TEST FUNCTION
    async function testConnection() {
        console.log('Testing Supabase connection...');
        const { data, error } = await supabase
            .from('messages')
            .select('count')
            .limit(1);
            
        if(error) {
            console.error('Connection test failed:', error);
            alert('Connection failed: ' + error.message);
        } else {
            console.log('Connection successful!');
        }
    }
    
    // Initialize - শুধু রিয়েলটাইম লিসেনার এবং কানেকশন টেস্ট
    async function init() {
        console.log('Initializing app...');
        
        // Test connection first
        await testConnection();
        
        // রিয়েলটাইম লিসেনার সেটআপ (এখনই মেসেজ শোনা শুরু করবে)
        listenRealtimeMessages();
        listenRealtimeStories();
        
        // পিরিওডিক ফাংশন
        setInterval(() => {
            if(currentUser) updateOnline();
        }, 30000);
        
        setInterval(async () => {
            const oneDayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
            await supabase.from('statuses').delete().lt('time', oneDayAgo);
        }, 60*60*1000);
        
        // Event listeners for file inputs
        imageInput.addEventListener("change", handleImageUpload);
        statusInput.addEventListener("change", handleStatusUpload);
        
        console.log('App initialized! Select a user to start');
    }
    
    init();
});
