// script.js
document.addEventListener('DOMContentLoaded', function() {
    // Your exact Supabase configuration
    const SUPABASE_URL = 'https://hhbbwkeazqnyhdcfyqfg.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_7kplsmCA9Bnjo8gQ68Ki0Q_uTZ1bp6D';
    
    // Initialize Supabase
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // ইউজার ক্রেডেনশিয়াল - সিম্পল পাসওয়ার্ড
    const users = {
        eesti: "aa",
        ralii: "bb"
    };
    
    // ইউজার কালার
    const colors = {
        eesti: "#22c55e",
        ralii: "#619efa"
    };
    
    let currentUser = null;
    let showingStatus = false;
    
    // DOM Elements
    const loginForm = document.getElementById("loginForm");
    const loginUsername = document.getElementById("loginUsername");
    const loginPassword = document.getElementById("loginPassword");
    const loginBtn = document.getElementById("loginBtn");
    const loginError = document.getElementById("loginError");
    const logoutBtn = document.getElementById("logoutBtn");
    const userInfo = document.getElementById("userInfo");
    const currentUsername = document.getElementById("currentUsername");
    
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
    
    // লগইন ফাংশন
    loginBtn.addEventListener("click", login);
    loginPassword.addEventListener("keydown", (e) => e.key === "Enter" && login());
    loginUsername.addEventListener("keydown", (e) => e.key === "Enter" && login());
    
    function login() {
        const username = loginUsername.value.trim();
        const password = loginPassword.value.trim();
        
        // চেক করা ইউজার আছে কিনা
        if(users[username] && users[username] === password) {
            currentUser = username;
            
            // লগইন ফর্ম লুকাও
            loginForm.style.display = "none";
            
            // চ্যাট দেখাও
            chatWrap.style.display = "flex";
            document.getElementById("input-area").style.display = "flex";
            userInfo.style.display = "flex";
            onlineUsersEl.style.display = "block";
            logoutBtn.style.display = "inline-block";
            
            // ইউজার নাম দেখাও
            currentUsername.textContent = currentUser;
            currentUsername.style.color = colors[currentUser];
            
            // FULLCL বাটন সবার জন্য দেখাও
            fullClearBtn.style.display = "inline-block";
            
            // ইনিশিয়ালাইজ
            init();
        } else {
            loginError.textContent = "Invalid username or password";
        }
    }
    
    // লগআউট ফাংশন
    logoutBtn.addEventListener("click", logout);
    
    function logout() {
        currentUser = null;
        
        // চ্যাট লুকাও
        chatWrap.style.display = "none";
        statusArea.style.display = "none";
        document.getElementById("input-area").style.display = "none";
        userInfo.style.display = "none";
        onlineUsersEl.style.display = "none";
        
        // লগইন ফর্ম দেখাও
        loginForm.style.display = "flex";
        loginUsername.value = "";
        loginPassword.value = "";
        loginError.textContent = "";
    }
    
    // ... বাকি কোড আগের মতোই থাকবে ...
    
    // NOTE: বাকি ফাংশনগুলো (send, addMessage, loadMessages, listenRealtimeMessages, 
    // handleImageUpload, handleStatusUpload, addStatus, loadStatuses, toggleStatusView, 
    // updateOnline, fullClear, testConnection, init) আগের মতোই থাকবে
});
