// script.js
document.addEventListener('DOMContentLoaded', function() {
    // Your exact Supabase configuration
    const SUPABASE_URL = 'https://hhbbwkeazqnyhdcfyqfg.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_7kplsmCA9Bnjo8gQ68Ki0Q_uTZ1bp6D';
    
    // Initialize Supabase
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // USERS & COLORS
    const users = ["eesti", "radu", "ali", "ralii", "bluee", "blueee"];
    const colors = {
        eesti: "#22c55e",
        radu: "#22c55e",
        ali: "#00f2ea",
        ralii: "#619efa",
        bluee: "#3b82f6",
        blueee: "#f7bad8"
    };
    
    let currentUser = "eesti";
    let showingStatus = false;
    
    // DOM Elements
    const userDropdown = document.getElementById("userDropdown");
    const msgInput = document.getElementById("msg");
    const chatWrap = document.getElementById("chatWrap");
    const chatContainer = document.getElementById("chatContainer");
    const statusArea = document.getElementById("statusArea");
    const statusContainer = document.getElementById("statusContainer");
    const clearBtn = document.getElementById("clearBtn");
    const fullClearBtn = document.getElementById("fullClearBtn");
    const statusBtn = document.getElementById("statusBtn");
    const onlineUsersEl = document.getElementById("onlineUsers");
    const onlineList = document.getElementById("onlineList");
    const mediaInput = document.getElementById("mediaInput");
    const sendBtn = document.getElementById("sendBtn");
    const mediaBtn = document.getElementById("mediaBtn");
    
    // Event Listeners
    sendBtn.addEventListener("click", send);
    mediaBtn.addEventListener("click", () => mediaInput.click());
    statusBtn.addEventListener("click", toggleStatusView);
    clearBtn.addEventListener("click", clearAll);
    fullClearBtn.addEventListener("click", fullClear);
    msgInput.addEventListener("keydown", e => e.key === "Enter" && send());
    userDropdown.addEventListener("change", (e) => {
        currentUser = e.target.value;
        loadMessages();
        updateOnline();
        
        if(currentUser === "eesti") {
            clearBtn.style.display = "inline-block";
            fullClearBtn.style.display = "inline-block";
        } else {
            clearBtn.style.display = "none";
            fullClearBtn.style.display = "none";
        }
    });
    
    // SEND MESSAGE
    async function send() {
        if(!msgInput.value.trim()) return;
        
        const message = {
            username: currentUser,
            text: msgInput.value.trim(),
            time: new Date().toISOString(),
            type: 'message'
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
    
    // ADD MESSAGE TO UI
    function addMessage(msg, isOwn) {
        const div = document.createElement('div');
        div.className = `msg ${isOwn ? 'own' : ''}`;
        div.style.backgroundColor = isOwn ? '#2563eb' : colors[msg.username] || '#334155';
        div.innerHTML = `
            <strong>${msg.username}</strong><br>
            ${msg.text}
            <div class="time">${new Date(msg.time).toLocaleTimeString()}</div>
        `;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    // LOAD MESSAGES
    async function loadMessages() {
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
                addMessage(payload.new, payload.new.username === currentUser);
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
                if(showingStatus) addStatus(payload.new);
            })
            .subscribe((status) => {
                console.log('Realtime status subscription:', status);
            });
    }
    
    // HANDLE MEDIA UPLOAD
    async function handleMediaUpload(e) {
        const file = e.target.files[0];
        if(!file) return;
        
        console.log('Uploading file:', file.name);
        
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${currentUser}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(filePath, file);
            
        if(uploadError) {
            console.error('Upload error:', uploadError);
            alert('Upload failed: ' + uploadError.message);
            return;
        }
        
        const { data: { publicUrl } } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);
        
        console.log('File uploaded, public URL:', publicUrl);
        
        const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
        
        const status = {
            username: currentUser,
            media_url: publicUrl,
            media_type: mediaType,
            caption: msgInput.value.trim() || '',
            time: new Date().toISOString()
        };
        
        console.log('Adding status:', status);
        
        const { error } = await supabase.from('statuses').insert([status]);
        
        if(error) {
            console.error('Error adding status:', error);
            alert('Error adding status: ' + error.message);
        } else {
            msgInput.value = '';
            mediaInput.value = '';
            alert('Status uploaded successfully!');
        }
    }
    
    // ADD STATUS TO UI
    function addStatus(status) {
        const div = document.createElement('div');
        div.className = 'status-item';
        div.innerHTML = `
            <strong>${status.username}</strong><br>
            ${status.caption ? status.caption + '<br>' : ''}
            ${status.media_type === 'image' 
                ? `<img src="${status.media_url}" class="status-media">` 
                : `<video src="${status.media_url}" class="status-media" controls></video>`
            }
            <div class="time">${new Date(status.time).toLocaleTimeString()}</div>
        `;
        statusContainer.appendChild(div);
        statusContainer.scrollTop = statusContainer.scrollHeight;
    }
    
    // LOAD STATUSES
    async function loadStatuses() {
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
        showingStatus = !showingStatus;
        if(showingStatus) {
            chatWrap.style.display = "none";
            statusArea.style.display = "flex";
            statusBtn.style.background = "#f97316";
            loadStatuses();
        } else {
            chatWrap.style.display = "flex";
            statusArea.style.display = "none";
            statusBtn.style.background = "#8b5cf6";
        }
    }
    
    // UPDATE ONLINE USERS
    async function updateOnline() {
        if(!currentUser) return;
        
        const { error } = await supabase.from('online_users').upsert({ 
            username: currentUser, 
            last_seen: new Date().toISOString() 
        });
        
        if(error) {
            console.error('Error updating online status:', error);
            return;
        }
        
        const fiveMinAgo = new Date(Date.now() - 5*60*1000).toISOString();
        const { data } = await supabase
            .from('online_users')
            .select('username')
            .gt('last_seen', fiveMinAgo);
        
        if(data) {
            onlineUsersEl.style.display = "block";
            onlineList.innerText = data.map(u => u.username).join(', ') || 'none';
        }
    }
    
    // CLEAR ALL MESSAGES (EESTI ONLY)
    async function clearAll() {
        if(currentUser !== 'eesti') {
            alert('Only eesti can clear messages');
            return;
        }
        if(confirm('Clear all messages?')) {
            const { error } = await supabase.from('messages').delete().gte('id', 0);
            if(!error) {
                chatContainer.innerHTML = '';
                alert('All messages cleared!');
            }
        }
    }
    
    // FULL CLEAR (EESTI ONLY)
    async function fullClear() {
        if(currentUser !== 'eesti') {
            alert('Only eesti can clear all data');
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
            alert('Supabase connected successfully!');
        }
    }
    
    // Initialize
    async function init() {
        console.log('Initializing app...');
        
        // Test connection first
        await testConnection();
        
        if(currentUser === "eesti") {
            clearBtn.style.display = "inline-block";
            fullClearBtn.style.display = "inline-block";
        }
    
        await updateOnline();
        loadMessages();
        loadStatuses();
        listenRealtimeMessages();
        listenRealtimeStories();
        mediaInput.addEventListener("change", handleMediaUpload);
        
        setInterval(updateOnline, 30000);
        setInterval(async () => {
            const oneDayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
            await supabase.from('statuses').delete().lt('time', oneDayAgo);
        }, 60*60*1000);
        
        console.log('App initialized!');
    }
    
    init();
});
