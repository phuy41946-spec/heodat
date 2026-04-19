/* ==========================================
   HEO ĐẤT — App.js Complete
   Game nuôi heo, chăm sóc, bán nhận KC
   ========================================== */

// ── Config ──
const CONFIG = {
    PIG_PRICE_KC: 100,      // 100 KC / con heo
    KC_RATE: 1000,           // 1 KC = 1,000 VNĐ
    PIGS: {
        3:  { label: 'Heo con',  emoji: '🐷', days: 90,  rate: 5.5, reward: 101 },
        6:  { label: 'Heo lứa',  emoji: '🐖', days: 180, rate: 6.5, reward: 103 },
        12: { label: 'Heo nái',  emoji: '🐗', days: 365, rate: 7.5, reward: 108 }
    },
    DAILY_REWARD: 1,
    PIG_NAMES: [
        'Heo Bông','Heo Mập','Heo Xinh','Heo Cute','Heo Hồng','Heo Vui','Heo Yêu',
        'Heo Béo','Heo Phúc','Heo Lộc','Heo Tài','Heo Đẹp','Heo Mochi','Heo Bánh',
        'Heo Sữa','Heo Đậu','Heo Bí','Heo Cam','Heo Cherry','Heo Mint','Heo Kẹo',
        'Heo Nắng','Heo Mưa','Heo Gió','Heo Trăng','Heo Sao','Heo Hoa','Heo Lá'
    ],
    ACHIEVEMENTS: [
        { id: 'first_pig',   icon: '🐷', title: 'Chủ trại mới',     desc: 'Mua con heo đầu tiên', check: d => d.pigs.length > 0 },
        { id: 'five_pigs',   icon: '🐖', title: '5 con heo',        desc: 'Nuôi 5 con heo cùng lúc', check: d => d.pigs.filter(p=>!p.sold).length >= 5 },
        { id: 'ten_pigs',    icon: '🐗', title: '10 con heo',       desc: 'Nuôi 10 con heo cùng lúc', check: d => d.pigs.filter(p=>!p.sold).length >= 10 },
        { id: 'first_sell',  icon: '💎', title: 'Thu hoạch đầu tiên', desc: 'Bán con heo đầu tiên', check: d => d.pigs.some(p=>p.sold) },
        { id: 'ten_sell',    icon: '🏆', title: 'Bán 10 heo',       desc: 'Bán tổng cộng 10 con heo', check: d => d.pigs.filter(p=>p.sold).length >= 10 },
        { id: 'kc_100',      icon: '💰', title: '100 KC',           desc: 'Tích lũy 100 kim cương', check: d => d.totalKCEarned >= 100 },
        { id: 'kc_1000',     icon: '🤑', title: '1,000 KC',         desc: 'Tích lũy 1,000 kim cương', check: d => d.totalKCEarned >= 1000 },
        { id: 'daily_7',     icon: '📅', title: '7 ngày liên tiếp',  desc: 'Đăng nhập 7 ngày liên tiếp', check: d => d.loginStreak >= 7 },
        { id: 'care_master', icon: '❤️', title: 'Chăm sóc tốt',     desc: 'Chăm sóc 50 lần', check: d => d.totalCares >= 50 }
    ],
    LEVEL_THRESHOLDS: [0, 5, 15, 30, 60, 100, 200, 500, 1000]
};

// ── State ──
let currentUser = null;
let currentPigId = null;

// ── Helpers ──
function $(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }

function formatMoney(n) {
    return new Intl.NumberFormat('vi-VN').format(n) + ' VNĐ';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ── Server API helper ──
async function callApi(endpoint, body) {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body)
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) {
        throw new Error('Server không phản hồi. Hãy mở web từ http://localhost:3000');
    }
    if (!res.ok) throw new Error(data.error || 'Lỗi server');
    return data;
}

function getStage(progress) {
    if (progress >= 100) return { emoji: '💎', label: 'Xuất chuồng' };
    if (progress >= 67) return { emoji: '🐗', label: 'Adult' };
    if (progress >= 34) return { emoji: '🐖', label: 'Teen' };
    return { emoji: '🐷', label: 'Baby' };
}

function getMood(health, happiness) {
    const avg = (health + happiness) / 2;
    if (avg >= 80) return '😍';
    if (avg >= 60) return '😊';
    if (avg >= 40) return '😐';
    if (avg >= 20) return '😟';
    return '😢';
}

function daysBetween(d1, d2) {
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

function randomName() {
    return CONFIG.PIG_NAMES[Math.floor(Math.random() * CONFIG.PIG_NAMES.length)] + ' #' + Math.floor(Math.random() * 900 + 100);
}

function genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ── Firebase ──
const auth = firebase.auth();
const db = firebase.firestore();

// ── Storage (Firestore) ──
function saveUser(data) {
    currentUser = data;
    if (auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({
            totalCares: data.totalCares || 0,
            lastLogin: data.lastLogin,
            achievements: data.achievements || []
        }).catch(err => {
            console.error('Lỗi lưu:', err);
            showToast('⚠️', 'Không thể lưu dữ liệu. Kiểm tra kết nối mạng!');
        });
    }
}

async function loadUserFromDb() {
    if (!auth.currentUser) return null;
    try {
        const doc = await db.collection('users').doc(auth.currentUser.uid).get();
        return doc.exists ? doc.data() : null;
    } catch (err) {
        console.error('Lỗi tải:', err);
        return null;
    }
}

// ── Toast ──
function showToast(icon, message) {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('out'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ── Modal ──
function openModal(id) { $(id).classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { $(id).classList.remove('active'); document.body.style.overflow = ''; }
function switchModal(from, to) { closeModal(from); setTimeout(() => openModal(to), 200); }

// click outside modal to close
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// ── Mobile Menu ──
function toggleMobileMenu() {
    $('mobileMenu').classList.toggle('active');
}

// ── Auth ──
async function handleRegister(e) {
    e.preventDefault();
    const name = $('regName').value.trim();
    const email = $('regEmail').value.trim().toLowerCase();
    const phone = $('regPhone').value.trim();
    const password = $('regPassword').value;

    if (!name || !email || !phone || !password) return showToast('⚠️', 'Vui lòng điền đầy đủ thông tin');
    if (!/^(0[1-9]\d{8,9})$/.test(phone.replace(/\s/g, ''))) return showToast('⚠️', 'Số điện thoại không hợp lệ (VD: 0912345678)');
    if (password.length < 6) return showToast('⚠️', 'Mật khẩu tối thiểu 6 ký tự');

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang đăng ký...'; }

    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        cred.user.sendEmailVerification().catch(() => {});
        const data = {
            name, email, phone,
            diamond: 0,
            pigs: [],
            totalKCEarned: 0,
            totalCares: 0,
            loginStreak: 1,
            lastLogin: today(),
            lastDailyReward: null,
            achievements: [],
            createdAt: new Date().toISOString()
        };
        await db.collection('users').doc(cred.user.uid).set(data);
        currentUser = data;
        closeModal('registerModal');
        showToast('🎉', `Chào mừng ${name}! Trại heo đã sẵn sàng!`);
        updateUI();
        e.target.reset();
    } catch (err) {
        const msg = {
            'auth/email-already-in-use': 'Email đã được sử dụng',
            'auth/weak-password': 'Mật khẩu quá yếu',
            'auth/invalid-email': 'Email không hợp lệ'
        }[err.code] || ('Lỗi: ' + err.message);
        showToast('⚠️', msg);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Đăng ký 🐷'; }
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = $('loginEmail').value.trim().toLowerCase();
    const password = $('loginPassword').value;

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang đăng nhập...'; }

    try {
        await auth.signInWithEmailAndPassword(email, password);
        const user = await loadUserFromDb();
        if (user) {
            const lastLogin = user.lastLogin;
            const todayStr = today();
            if (lastLogin !== todayStr) {
                const lastDate = new Date(lastLogin);
                const todayDate = new Date(todayStr);
                const diff = daysBetween(lastDate, todayDate);
                user.loginStreak = diff === 1 ? user.loginStreak + 1 : 1;
                user.lastLogin = todayStr;
            }
            saveUser(user);
        }
        closeModal('loginModal');
        showToast('🐷', `Chào mừng trở lại, ${user ? user.name : ''}!`);
        updateUI();
        e.target.reset();
    } catch (err) {
        const msg = {
            'auth/wrong-password': 'Email hoặc mật khẩu không đúng',
            'auth/user-not-found': 'Email hoặc mật khẩu không đúng',
            'auth/invalid-credential': 'Email hoặc mật khẩu không đúng',
            'auth/invalid-email': 'Email không hợp lệ',
            'auth/too-many-requests': 'Quá nhiều lần thử, vui lòng đợi'
        }[err.code] || ('Lỗi: ' + err.message);
        showToast('❌', msg);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Đăng nhập 🐷'; }
    }
}

// ── Forgot Password ──
async function handleForgotPassword() {
    const email = $('loginEmail').value.trim().toLowerCase();
    if (!email) return showToast('⚠️', 'Vui lòng nhập email trước!');
    try {
        await auth.sendPasswordResetEmail(email);
        showToast('📧', 'Đã gửi email đặt lại mật khẩu! Kiểm tra hộp thư.');
    } catch (err) {
        const msg = { 'auth/user-not-found': 'Email không tồn tại', 'auth/invalid-email': 'Email không hợp lệ' }[err.code] || 'Lỗi: ' + err.message;
        showToast('❌', msg);
    }
}

async function handleLogout() {
    try {
        await auth.signOut();
        currentUser = null;
        showToast('👋', 'Đã đăng xuất');
        closeModal('farmModal');
        updateUI();
    } catch (err) {
        showToast('❌', 'Lỗi đăng xuất');
    }
}

// ── UI Updates ──
function updateUI() {
    // Update header (desktop)
    const actions = $('headerActions');
    // Update mobile menu
    const mobileActions = $('mobileMenuActions');
    if (currentUser) {
        actions.innerHTML = `
            <button class="btn btn-primary" onclick="openFarm()">🐷 Trại heo</button>
            <button class="btn btn-outline" onclick="handleLogout()">Đăng xuất</button>
        `;
        if (mobileActions) mobileActions.innerHTML = `
            <button class="btn btn-primary btn-block" onclick="openFarm();toggleMobileMenu()">🐷 Trại heo</button>
            <button class="btn btn-outline btn-block" onclick="handleLogout();toggleMobileMenu()">Đăng xuất</button>
        `;
    } else {
        actions.innerHTML = `
            <button class="btn btn-outline" onclick="openModal('loginModal')">Đăng nhập</button>
            <button class="btn btn-primary" onclick="openModal('registerModal')">Đăng ký</button>
        `;
        if (mobileActions) mobileActions.innerHTML = `
            <button class="btn btn-outline btn-block" onclick="openModal('loginModal');toggleMobileMenu()">Đăng nhập</button>
            <button class="btn btn-primary btn-block" onclick="openModal('registerModal');toggleMobileMenu()">Đăng ký</button>
        `;
    }

    // Update pig progress
    if (currentUser) {
        updatePigProgress();
    }
}

function updatePigProgress() {
    if (!currentUser) return;
    const now = new Date();
    let changed = false;

    currentUser.pigs.forEach(pig => {
        if (pig.sold) return;
        const start = new Date(pig.startDate);
        const elapsed = daysBetween(start, now);
        const totalDays = CONFIG.PIGS[pig.term].days;
        pig.progress = Math.min(100, Math.round((elapsed / totalDays) * 100));

        // Decrease health/happiness for each missed day
        const todayStr = today();
        const lastDecay = pig._lastDecayDate || pig.lastFed || todayStr;
        const missedDays = Math.max(0, daysBetween(new Date(lastDecay), new Date(todayStr)));
        if (missedDays > 0) {
            for (let d = 0; d < missedDays; d++) {
                if (pig.lastFed !== todayStr) pig.health = Math.max(0, pig.health - 5);
                if (pig.lastCleaned !== todayStr) pig.happiness = Math.max(0, pig.happiness - 5);
            }
            pig._lastDecayDate = todayStr;
            changed = true;
        }
    });
    if (changed) saveUser(currentUser);
}

// ── Farm ──
function openFarm() {
    if (!currentUser) return openModal('loginModal');
    updatePigProgress();
    renderFarm();
    openModal('farmModal');
}

function renderFarm() {
    if (!currentUser) return;
    const d = currentUser;

    // Topbar
    $('farmOwner').textContent = d.name;
    const lvl = getLevel(d);
    $('farmLevel').textContent = `Lv.${lvl.level} — ${lvl.title}`;
    $('walletBalance').textContent = d.diamond;

    // Daily reward
    const todayStr = today();
    if (d.lastDailyReward !== todayStr) {
        $('dailyReward').style.display = 'flex';
    } else {
        $('dailyReward').style.display = 'none';
    }

    // Stats
    const activePigs = d.pigs.filter(p => !p.sold);
    const readyPigs = activePigs.filter(p => p.progress >= 100);
    const soldPigs = d.pigs.filter(p => p.sold);
    $('statActive').textContent = activePigs.length;
    $('statReady').textContent = readyPigs.length;
    $('statSold').textContent = soldPigs.length;
    $('statTotalKC').textContent = d.totalKCEarned;

    // Achievements
    const unlocked = checkAchievements(d);
    $('statAchievements').textContent = `${unlocked.length}/9`;

    // Notifications
    const notifArea = $('farmNotifications');
    notifArea.innerHTML = '';
    readyPigs.forEach(pig => {
        const notif = document.createElement('div');
        notif.className = 'farm-notif';
        notif.innerHTML = `<span>🎉</span><span><strong>${escapeHtml(pig.name)}</strong> đã đáo hạn! Bán ngay nhận 💎 ${CONFIG.PIGS[pig.term].reward} KC</span>`;
        notifArea.appendChild(notif);
    });

    // Date
    $('todayDate').textContent = new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Market balance
    $('marketBalance').textContent = d.diamond + ' KC';

    // Panels
    renderPigpen();
    renderAchievements();
}

function getLevel(data) {
    const totalPigs = data.pigs.length;
    const levels = CONFIG.LEVEL_THRESHOLDS;
    let level = 1;
    for (let i = 1; i < levels.length; i++) {
        if (totalPigs >= levels[i]) level = i + 1;
    }
    const titles = ['Người mới', 'Tập sự', 'Nông dân', 'Chủ trại', 'Đại gia', 'Tỷ phú', 'Huyền thoại', 'Thần heo', 'Bậc thầy'];
    return { level, title: titles[level - 1] || 'Bậc thầy' };
}

function switchTab(tabName) {
    qsa('.farm-tab').forEach(t => t.classList.remove('active'));
    qsa('.farm-panel').forEach(p => p.classList.remove('active'));
    const idx = ['pigpen','market','transfer','achievements'].indexOf(tabName);
    if (idx >= 0) {
        qsa('.farm-tab')[idx].classList.add('active');
        $('panel-' + tabName).classList.add('active');
    }
    if (tabName === 'transfer') renderTransferPanel();
}

// ── Pigpen ──
function renderPigpen(filter = 'all') {
    if (!currentUser) return;
    const grid = $('pigpenGrid');
    const activePigs = currentUser.pigs.filter(p => !p.sold);

    let pigs = activePigs;
    if (filter === 'needs-care') {
        const todayStr = today();
        pigs = activePigs.filter(p => p.lastFed !== todayStr || p.lastCleaned !== todayStr);
    } else if (filter === 'matured') {
        pigs = activePigs.filter(p => p.progress >= 100);
    }

    // Render 2D farm scene pigs
    renderFarmScene(pigs);

    if (pigs.length === 0) {
        grid.innerHTML = `
            <div class="empty-farm">
                <span class="empty-icon">${filter === 'all' ? '🏠' : '🔍'}</span>
                <h3>${filter === 'all' ? 'Trại heo trống!' : 'Không tìm thấy heo nào!'}</h3>
                <p>${filter === 'all' ? 'Mua heo giống để bắt đầu nuôi nào!' : 'Thử chọn bộ lọc khác.'}</p>
                ${filter === 'all' ? '<button class="btn btn-primary" onclick="switchTab(\'market\')">🛒 Mua heo giống</button>' : ''}
            </div>
        `;
        return;
    }

    grid.innerHTML = pigs.map(pig => {
        const stage = getStage(pig.progress);
        const todayStr = today();
        const needsFeed = pig.lastFed !== todayStr;
        const needsClean = pig.lastCleaned !== todayStr;
        const needsCare = needsFeed || needsClean;
        const isMatured = pig.progress >= 100;
        const cardClass = isMatured ? 'pig-card matured' : (needsCare ? 'pig-card needs-care' : 'pig-card');

        return `
            <div class="${cardClass}" onclick="openCare('${pig.id}')">
                <span class="pig-card-stage">${stage.label}</span>
                <span class="pig-card-emoji">${stage.emoji}</span>
                <div class="pig-card-name" title="${escapeHtml(pig.name)}">${escapeHtml(pig.name)}</div>
                <div class="pig-card-term">${CONFIG.PIGS[pig.term].label} — ${CONFIG.PIGS[pig.term].days} ngày</div>
                <div class="pig-card-bars">
                    <div class="pig-mini-bar">
                        <span class="pig-mini-bar-label">❤️</span>
                        <div class="pig-mini-bar-track"><div class="pig-mini-bar-fill health" style="width:${pig.health}%"></div></div>
                    </div>
                    <div class="pig-mini-bar">
                        <span class="pig-mini-bar-label">😊</span>
                        <div class="pig-mini-bar-track"><div class="pig-mini-bar-fill happiness" style="width:${pig.happiness}%"></div></div>
                    </div>
                    <div class="pig-mini-bar">
                        <span class="pig-mini-bar-label">📈</span>
                        <div class="pig-mini-bar-track"><div class="pig-mini-bar-fill ${pig.progress>=100?'complete':'progress'}" style="width:${pig.progress}%"></div></div>
                    </div>
                </div>
                <div class="pig-card-status ${isMatured ? 'ready' : 'growing'}">
                    ${isMatured ? '💎 Sẵn sàng bán!' : pig.progress + '% trưởng thành'}
                </div>
                <div class="pig-card-care">
                    ${needsFeed ? '🍽️' : '✅'} ${needsClean ? '🧹' : '✅'}
                </div>
            </div>
        `;
    }).join('');
}

// ── 2D Farm Scene ──
function renderFarmScene(pigs) {
    const container = $('gfPigs');
    if (!container) return;

    if (pigs.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Position pigs naturally across the ground area
    const positions = generatePigPositions(pigs.length);

    container.innerHTML = pigs.map((pig, i) => {
        const stage = getStage(pig.progress);
        const todayStr = today();
        const needsFeed = pig.lastFed !== todayStr;
        const needsClean = pig.lastCleaned !== todayStr;
        const needsCare = needsFeed || needsClean;
        const isMatured = pig.progress >= 100;
        const mood = getMood(pig.health, pig.happiness);
        const pos = positions[i];

        // Random animation type
        const anims = ['walk', 'idle', 'eat'];
        const anim = anims[Math.floor(Math.random() * 3)];
        const delay = (Math.random() * 2).toFixed(1);
        const flip = Math.random() > 0.5 ? 'scaleX(-1)' : '';

        // HP bar color
        const hpPct = Math.round((pig.health + pig.happiness) / 2);
        const hpColor = hpPct >= 70 ? '#4caf50' : hpPct >= 40 ? '#ff9800' : '#f44336';

        // Bubble text
        const safeName = escapeHtml(pig.name);
        let bubbleText = `${safeName} · ${pig.progress}%`;
        if (isMatured) bubbleText = `💎 ${safeName} — Sẵn sàng bán!`;
        else if (needsCare) bubbleText = `⚠️ ${safeName} cần chăm sóc!`;

        return `
            <div class="gf-pig ${isMatured ? 'gfp-matured' : ''}"
                 style="left:${pos.x}%;bottom:${pos.y}%;transform:${flip}"
                 onclick="openCare('${pig.id}')">
                <div class="gfp-bubble">${bubbleText}</div>
                <span class="gfp-name">${escapeHtml(pig.name.split(' ').slice(0,2).join(' '))}</span>
                <span class="gfp-mood">${mood}</span>
                ${needsCare ? '<span class="gfp-care-icon">❗</span>' : ''}
                <span class="gf-pig-body ${anim}" style="animation-delay:${delay}s">${stage.emoji}</span>
                <span class="gf-pig-shadow"></span>
                <div class="gfp-hp-bar"><div class="gfp-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
            </div>
        `;
    }).join('');
}

function generatePigPositions(count) {
    const positions = [];
    const zones = [
        { xMin: 5, xMax: 35, yMin: 15, yMax: 65 },
        { xMin: 35, xMax: 65, yMin: 10, yMax: 60 },
        { xMin: 60, xMax: 90, yMin: 15, yMax: 65 }
    ];

    for (let i = 0; i < count; i++) {
        let x, y, valid;
        let attempts = 0;
        do {
            const zone = zones[i % zones.length];
            x = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
            y = zone.yMin + Math.random() * (zone.yMax - zone.yMin);
            valid = true;
            for (const p of positions) {
                if (Math.abs(p.x - x) < 8 && Math.abs(p.y - y) < 12) {
                    valid = false;
                    break;
                }
            }
            attempts++;
        } while (!valid && attempts < 20);
        positions.push({ x: Math.round(x), y: Math.round(y) });
    }
    return positions;
}

function filterPigs(filter, btnEl) {
    qsa('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderPigpen(filter);
}

// ── Transfer KC ──
function renderTransferPanel() {
    if (!currentUser) return;
    $('transferBalance').textContent = currentUser.diamond;
    renderTransferHistory();
}

async function handleTransfer(e) {
    e.preventDefault();
    if (!currentUser || !auth.currentUser) return;

    const recipientEmail = $('transferEmail').value.trim().toLowerCase();
    const amount = parseInt($('transferAmount').value);
    const note = $('transferNote').value.trim();

    if (!recipientEmail || !amount) return showToast('⚠️', 'Vui lòng điền đầy đủ thông tin');
    if (amount < 1) return showToast('⚠️', 'Số KC phải lớn hơn 0');
    if (recipientEmail === currentUser.email) return showToast('⚠️', 'Không thể chuyển cho chính mình!');
    if (currentUser.diamond < amount) return showToast('❌', `Không đủ KC! Bạn có ${currentUser.diamond} KC`);

    if (!confirm(`Bạn có chắc muốn chuyển ${amount} KC cho ${recipientEmail}?`)) return;

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang chuyển...'; }

    try {
        const result = await callApi('/api/transfer', { recipientEmail, amount, note });

        // Update local state from server response
        currentUser.diamond = result.diamond;
        if (!currentUser.transfers) currentUser.transfers = [];
        currentUser.transfers.push(result.transfer);

        showToast('💎', `Đã chuyển ${amount} KC cho ${result.recipientName}!`);
        e.target.reset();
        renderTransferPanel();
        renderFarm();
    } catch (err) {
        showToast('❌', err.message || 'Lỗi chuyển KC');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '💎 Chuyển kim cương'; }
    }
}

function renderTransferHistory() {
    if (!currentUser) return;
    const list = $('transferHistoryList');
    const transfers = (currentUser.transfers || []).slice().reverse();

    if (transfers.length === 0) {
        list.innerHTML = '<p class="transfer-empty">Chưa có giao dịch nào</p>';
        return;
    }

    list.innerHTML = transfers.slice(0, 20).map(t => {
        const isSent = t.type === 'sent';
        const date = new Date(t.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const contactName = escapeHtml(isSent ? (t.toName || t.to) : (t.fromName || t.from));
        const safeNote = t.note ? escapeHtml(t.note) : '';
        return `
            <div class="transfer-item ${t.type}">
                <div class="transfer-item-icon">${isSent ? '📤' : '📥'}</div>
                <div class="transfer-item-info">
                    <strong>${isSent ? 'Gửi cho ' + contactName : 'Nhận từ ' + contactName}</strong>
                    ${safeNote ? '<span class="transfer-note">💬 ' + safeNote + '</span>' : ''}
                    <span class="transfer-date">${date}</span>
                </div>
                <div class="transfer-item-amount ${t.type}">
                    ${isSent ? '-' : '+'}${t.amount} KC
                </div>
            </div>
        `;
    }).join('');
}

// ── Market ──
function changeQty(inputId, delta) {
    const input = $(inputId);
    let val = parseInt(input.value) || 1;
    val = Math.max(1, val + delta);
    input.value = val;
    updateMarketTotals();
}

function updateMarketTotals() {
    [3, 6, 12].forEach(term => {
        const qty = parseInt($('qty' + term).value) || 1;
        $('total' + term).textContent = (qty * CONFIG.PIG_PRICE_KC) + ' KC';
    });
}

// Listen for qty input changes
document.addEventListener('input', e => {
    if (['qty3','qty6','qty12'].includes(e.target.id)) updateMarketTotals();
});

async function purchasePig(term) {
    if (!currentUser || !auth.currentUser) return openModal('loginModal');
    const qty = parseInt($('qty' + term).value) || 1;
    if (qty < 1) return showToast('⚠️', 'Số lượng phải ít nhất 1');

    const totalCost = qty * CONFIG.PIG_PRICE_KC;
    if (currentUser.diamond < totalCost) {
        return showToast('❌', `Không đủ KC! Cần ${totalCost} KC, bạn có ${currentUser.diamond} KC`);
    }

    const btnEl = document.querySelector(`[onclick="purchasePig(${term})"]`);
    if (btnEl) btnEl.disabled = true;

    try {
        const result = await callApi('/api/purchase', { term, qty });
        // Update local state from server
        currentUser.diamond = result.diamond;
        currentUser.pigs.push(...result.pigs);
        const pigInfo = CONFIG.PIGS[term];
        showToast('🐷', `Mua thành công ${qty} ${pigInfo.label}!`);
        renderFarm();
    } catch (err) {
        showToast('❌', err.message || 'Lỗi mua heo');
    } finally {
        if (btnEl) btnEl.disabled = false;
    }
}

function buyPig(term) {
    if (!currentUser) return openModal('registerModal');
    openFarm();
    switchTab('market');
    // Scroll to the relevant market card
    setTimeout(() => {
        const cards = qsa('.market-card');
        const idx = { 3: 0, 6: 1, 12: 2 }[term];
        if (cards[idx]) cards[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
}

// ── Care ──
function openCare(pigId) {
    if (!currentUser) return;
    const pig = currentUser.pigs.find(p => p.id === pigId);
    if (!pig) return;
    currentPigId = pigId;

    const stage = getStage(pig.progress);
    const pigInfo = CONFIG.PIGS[pig.term];
    const todayStr = today();

    $('carePigEmoji').textContent = stage.emoji;
    $('carePigMood').textContent = getMood(pig.health, pig.happiness);
    $('carePigName').textContent = pig.name;
    $('carePigType').textContent = `${pigInfo.label} — ${pigInfo.days} ngày`;

    // Bars
    $('barHealth').style.width = pig.health + '%';
    $('valHealth').textContent = pig.health + '%';
    $('barHappiness').style.width = pig.happiness + '%';
    $('valHappiness').textContent = pig.happiness + '%';
    $('barProgress').style.width = pig.progress + '%';
    $('valProgress').textContent = pig.progress + '%';

    // Info grid
    const start = new Date(pig.startDate);
    const endDate = new Date(start.getTime() + pigInfo.days * 24 * 60 * 60 * 1000);
    const daysLeft = Math.max(0, daysBetween(new Date(), endDate));

    $('careInfoGrid').innerHTML = `
        <div class="care-info-item"><span>📅 Ngày mua</span><span>${start.toLocaleDateString('vi-VN')}</span></div>
        <div class="care-info-item"><span>🏁 Ngày đáo hạn</span><span>${endDate.toLocaleDateString('vi-VN')}</span></div>
        <div class="care-info-item"><span>⏳ Còn lại</span><span>${daysLeft} ngày</span></div>
        <div class="care-info-item"><span>💎 KC khi bán</span><span>${pigInfo.reward} KC</span></div>
        <div class="care-info-item"><span>📈 Giai đoạn</span><span>${stage.label}</span></div>
        <div class="care-info-item"><span>${getMood(pig.health, pig.happiness)} Tâm trạng</span><span>${pig.health >= 80 && pig.happiness >= 80 ? 'Rất vui' : pig.health >= 50 ? 'Bình thường' : 'Buồn'}</span></div>
    `;

    // Feed/Clean buttons
    const fed = pig.lastFed === todayStr;
    const cleaned = pig.lastCleaned === todayStr;
    $('btnFeed').disabled = fed;
    $('feedStatus').textContent = fed ? '✅ Đã cho ăn' : '⏳ Chưa cho ăn';
    $('btnClean').disabled = cleaned;
    $('cleanStatus').textContent = cleaned ? '✅ Đã dọn' : '⏳ Chưa dọn';

    // Sell button
    const isMatured = pig.progress >= 100;
    $('careSellArea').style.display = isMatured && !pig.sold ? 'block' : 'none';
    $('btnSell').textContent = `💎 Bán heo nhận ${pigInfo.reward} KC`;

    openModal('careModal');
}

function feedPig() {
    if (!currentUser || !currentPigId) return;
    const pig = currentUser.pigs.find(p => p.id === currentPigId);
    if (!pig || pig.lastFed === today()) return;

    pig.lastFed = today();
    pig.health = Math.min(100, pig.health + 20);
    currentUser.totalCares = (currentUser.totalCares || 0) + 1;
    saveUser(currentUser);
    showToast('🍽️', `Đã cho ${pig.name} ăn!`);
    openCare(currentPigId);
    renderFarm();
}

function cleanPig() {
    if (!currentUser || !currentPigId) return;
    const pig = currentUser.pigs.find(p => p.id === currentPigId);
    if (!pig || pig.lastCleaned === today()) return;

    pig.lastCleaned = today();
    pig.happiness = Math.min(100, pig.happiness + 20);
    currentUser.totalCares = (currentUser.totalCares || 0) + 1;
    saveUser(currentUser);
    showToast('🧹', `Đã dọn chuồng cho ${pig.name}!`);
    openCare(currentPigId);
    renderFarm();
}

async function sellCurrentPig() {
    if (!currentUser || !currentPigId || !auth.currentUser) return;
    const pig = currentUser.pigs.find(p => p.id === currentPigId);
    if (!pig || pig.progress < 100 || pig.sold) return;

    const reward = CONFIG.PIGS[pig.term].reward;
    if (!confirm(`Bán ${pig.name} để nhận ${reward} KC? Hành động này không thể hoàn tác!`)) return;

    const btn = $('btnSell');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang bán...'; }

    try {
        const result = await callApi('/api/sell', { pigId: currentPigId });
        // Update local state from server
        pig.sold = true;
        pig.soldDate = new Date().toISOString();
        currentUser.diamond = result.diamond;
        currentUser.totalKCEarned = result.totalKCEarned;

        closeModal('careModal');
        showToast('💎', `Đã bán ${pig.name}! Nhận ${result.reward} KC!`);
        renderFarm();
    } catch (err) {
        showToast('❌', err.message || 'Lỗi bán heo');
        if (btn) { btn.disabled = false; btn.textContent = `💎 Bán heo nhận ${reward} KC`; }
    }
}

// ── Daily Reward ──
async function claimDailyReward() {
    if (!currentUser || !auth.currentUser) return;
    const todayStr = today();
    if (currentUser.lastDailyReward === todayStr) return;

    try {
        const result = await callApi('/api/daily-reward', {});
        currentUser.diamond = result.diamond;
        currentUser.totalKCEarned = result.totalKCEarned;
        currentUser.lastDailyReward = todayStr;
        showToast('🎁', `Nhận thưởng ngày ${currentUser.loginStreak}: +${result.bonus} KC!`);
        renderFarm();
    } catch (err) {
        showToast('❌', err.message || 'Lỗi nhận thưởng');
    }
}

// ── Topup (chuyển khoản + xác nhận qua Server) ──
let topupAmountValue = 0;
let topupNoteValue = '';

function topupNext() {
    const raw = $('topupAmount').value.replace(/[^\d]/g, '');
    const amount = parseInt(raw);
    if (!amount || amount < 100000) return showToast('⚠️', 'Tối thiểu nạp 100,000 VNĐ');

    topupAmountValue = amount;
    topupNoteValue = 'HD' + Math.floor(100000 + Math.random() * 900000);

    const kcAmount = Math.floor(amount / CONFIG.KC_RATE);
    $('topupDisplayAmount').textContent = formatMoney(amount) + ' → 💎 ' + kcAmount + ' KC';
    $('topupTransferNote').textContent = topupNoteValue;

    $('topupStep1').style.display = 'none';
    $('topupStep2').style.display = 'block';
}

function topupBack() {
    $('topupStep2').style.display = 'none';
    $('topupStep1').style.display = 'block';
}

function copyTransferNote() {
    const note = $('topupTransferNote').textContent;
    navigator.clipboard.writeText(note).then(() => {
        showToast('📋', 'Đã sao chép nội dung chuyển khoản!');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = note;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('📋', 'Đã sao chép nội dung chuyển khoản!');
    });
}

function topupReset() {
    $('topupStep1').style.display = 'block';
    $('topupStep2').style.display = 'none';
    $('topupStep3').style.display = 'none';
    $('topupAmount').value = '';
    topupAmountValue = 0;
    topupNoteValue = '';
}

async function topupConfirm() {
    if (!currentUser || !auth.currentUser || !topupAmountValue) return;

    const btn = document.querySelector('#topupStep2 .btn-gold');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang gửi yêu cầu...'; }

    try {
        const result = await callApi('/api/topup', {
            amount: topupAmountValue,
            note: topupNoteValue
        });

        // Update local state
        if (!currentUser.topupHistory) currentUser.topupHistory = [];
        currentUser.topupHistory.push({
            id: result.requestId,
            amount: result.amount,
            note: result.note,
            status: 'pending',
            date: new Date().toISOString()
        });

        // Show step 3
        $('topupStep2').style.display = 'none';
        $('topupStep3').style.display = 'block';
        $('topupResultDetail').innerHTML = `
            <div>💵 Số tiền: <strong>${formatMoney(result.amount)}</strong></div>
            <div>� Nhận được: <strong>${Math.floor(result.amount / CONFIG.KC_RATE)} KC</strong></div>
            <div>�📝 Nội dung CK: <strong>${escapeHtml(result.note)}</strong></div>
            <div>🆔 Mã yêu cầu: <strong>${escapeHtml(result.requestId)}</strong></div>
            <div>📌 Trạng thái: <span class="topup-h-status pending">Chờ duyệt</span></div>
        `;

        showToast('📨', 'Yêu cầu nạp tiền đã được gửi!');
        renderTopupHistory();
    } catch (err) {
        showToast('❌', err.message || 'Lỗi gửi yêu cầu');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '✅ Tôi đã chuyển khoản đúng thông tin'; }
    }
}

function renderTopupHistory() {
    if (!currentUser) return;
    const container = $('topupHistory');
    const history = (currentUser.topupHistory || []).slice().reverse();
    if (history.length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = `
        <div class="topup-history-title">📋 Lịch sử nạp tiền</div>
        ${history.slice(0, 10).map(h => {
            const date = new Date(h.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const statusLabel = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' }[h.status] || h.status;
            return `
                <div class="topup-history-item">
                    <div><strong>${formatMoney(h.amount)}</strong><br><small>${date}</small></div>
                    <span class="topup-h-status ${h.status}">${statusLabel}</span>
                </div>
            `;
        }).join('')}
    `;
}

function setTopup(amount) {
    $('topupAmount').value = new Intl.NumberFormat('vi-VN').format(amount);
}

function formatAmount(input) {
    const raw = input.value.replace(/[^\d]/g, '');
    if (raw) input.value = new Intl.NumberFormat('vi-VN').format(parseInt(raw));
}

// Khi mở modal topup, reset và render history
const origOpenModal = openModal;
openModal = function(id) {
    origOpenModal(id);
    if (id === 'topupModal') {
        topupReset();
        renderTopupHistory();
    }
};

// ── Achievements ──
function checkAchievements(data) {
    const unlocked = [];
    CONFIG.ACHIEVEMENTS.forEach(ach => {
        if (ach.check(data)) {
            unlocked.push(ach.id);
            if (!data.achievements.includes(ach.id)) {
                data.achievements.push(ach.id);
                showToast('🏆', `Mở khóa thành tích: ${ach.title}!`);
            }
        }
    });
    return unlocked;
}

function renderAchievements() {
    if (!currentUser) return;
    const grid = $('achievementsGrid');
    grid.innerHTML = CONFIG.ACHIEVEMENTS.map(ach => {
        const unlocked = currentUser.achievements.includes(ach.id);
        return `
            <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
                <div class="ach-icon">${ach.icon}</div>
                <div class="ach-info">
                    <h4>${ach.title}</h4>
                    <p>${ach.desc}</p>
                </div>
            </div>
        `;
    }).join('');
}

// ── Hero Animated Counters ──
function animateCounters() {
    qsa('.stat-number[data-count]').forEach(el => {
        const target = parseInt(el.dataset.count);
        const duration = 2000;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.floor(target * eased).toLocaleString('vi-VN');
            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
    });
}

// ── FAQ ──
function toggleFaq(el) {
    const wasActive = el.classList.contains('active');
    qsa('.faq-item').forEach(item => item.classList.remove('active'));
    if (!wasActive) el.classList.add('active');
}

// ── Header scroll ──
window.addEventListener('scroll', () => {
    $('header').classList.toggle('scrolled', window.scrollY > 20);
});

// ── Smooth scroll (only for section links, not # alone) ──
document.querySelectorAll('a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href');
    if (href === '#' || href.length < 2) return; // skip placeholder links
    a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

// ── Intersection Observer for animations ──
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('[data-aos]').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity .6s ease, transform .6s ease';
    observer.observe(el);
});

// ── Particles ──
function createParticles() {
    const container = $('heroParticles');
    if (!container) return;
    for (let i = 0; i < 15; i++) {
        const p = document.createElement('span');
        p.textContent = ['✨','💫','⭐','💎','🌸','💝','🪙'][Math.floor(Math.random() * 7)];
        p.style.cssText = `
            position:absolute;
            font-size:${12 + Math.random() * 16}px;
            left:${Math.random() * 100}%;
            top:${Math.random() * 100}%;
            opacity:${0.2 + Math.random() * 0.4};
            animation:coinFloat ${3 + Math.random() * 4}s ease-in-out infinite;
            animation-delay:${Math.random() * 5}s;
            pointer-events:none;
        `;
        container.appendChild(p);
    }
}

// ── Auth State Listener + Real-time Sync ──
let _userUnsubscribe = null;

auth.onAuthStateChanged(async (user) => {
    // Clean up previous listener
    if (_userUnsubscribe) { _userUnsubscribe(); _userUnsubscribe = null; }

    if (user) {
        if (!currentUser) {
            const data = await loadUserFromDb();
            if (data) currentUser = data;
        }

        // Real-time listener: auto-sync financial fields (diamond, topup status)
        _userUnsubscribe = db.collection('users').doc(user.uid).onSnapshot((doc) => {
            if (doc.exists && currentUser) {
                const serverData = doc.data();
                currentUser.diamond = serverData.diamond;
                currentUser.topupHistory = serverData.topupHistory;
                currentUser.transfers = serverData.transfers;
                currentUser.totalKCEarned = serverData.totalKCEarned;
                currentUser.lastDailyReward = serverData.lastDailyReward;
                // Re-render if farm modal is open
                if ($('farmModal') && $('farmModal').classList.contains('active')) renderFarm();
            }
        }, err => console.error('Sync error:', err));
    } else {
        currentUser = null;
    }
    updateUI();
});

// ── Mobile Menu: close on outside click ──
document.addEventListener('click', e => {
    const menu = $('mobileMenu');
    const btn = document.querySelector('.mobile-menu-btn');
    if (menu && btn && menu.classList.contains('active') && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.remove('active');
    }
});

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    updateMarketTotals();
});
