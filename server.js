/* ==========================================
   HEO ĐẤT — Server (Express + Telegram Bot)
   Chạy: node server.js
   Tất cả thao tác tài chính đi qua đây
   ========================================== */

require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const https = require('https');
const path = require('path');

// ── Config ──
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.error('❌ Thiếu biến môi trường BOT_TOKEN hoặc ADMIN_CHAT_ID');
    console.error('   Tạo file .env hoặc set biến môi trường trước khi chạy');
    process.exit(1);
}

const PIGS = {
    3:  { label: 'Heo con', days: 90,  reward: 101 },
    6:  { label: 'Heo lứa', days: 180, reward: 103 },
    12: { label: 'Heo nái', days: 365, reward: 108 }
};
const PIG_PRICE_KC = 100; // 100 KC / con heo
const KC_RATE = 1000;     // 1 KC = 1,000 VNĐ
const DAILY_REWARD = 1;
const PIG_NAMES = [
    'Heo Bông','Heo Mập','Heo Xinh','Heo Cute','Heo Hồng','Heo Vui','Heo Yêu',
    'Heo Béo','Heo Phúc','Heo Lộc','Heo Tài','Heo Đẹp','Heo Mochi','Heo Bánh',
    'Heo Sữa','Heo Đậu','Heo Bí','Heo Cam','Heo Cherry','Heo Mint','Heo Kẹo',
    'Heo Nắng','Heo Mưa','Heo Gió','Heo Trăng','Heo Sao','Heo Hoa','Heo Lá'
];

// ── Helpers ──
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function randomName() {
    return PIG_NAMES[Math.floor(Math.random() * PIG_NAMES.length)] + ' #' + Math.floor(Math.random() * 900 + 100);
}

function formatMoney(n) {
    return new Intl.NumberFormat('vi-VN').format(n) + ' VNĐ';
}

// ── Firebase Admin ──
let serviceAccount;
try {
    serviceAccount = require('./heodat-1bbef-firebase-adminsdk-fbsvc-2fc8133bea.json');
} catch (e) {
    console.error('❌ Không tìm thấy file service account key!');
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Express ──
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth Middleware ──
async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Chưa đăng nhập' });
    }
    try {
        req.user = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token không hợp lệ' });
    }
}

// ═══════════════════════════════════════════
//  API ENDPOINTS (Financial operations)
// ═══════════════════════════════════════════

// ── POST /api/purchase — Mua heo ──
app.post('/api/purchase', verifyAuth, async (req, res) => {
    let { term, qty } = req.body;
    term = parseInt(term);
    qty = parseInt(qty);

    if (![3, 6, 12].includes(term)) return res.status(400).json({ error: 'Kỳ hạn không hợp lệ' });
    if (!qty || qty < 1 || qty > 100) return res.status(400).json({ error: 'Số lượng phải từ 1-100' });

    const totalCost = qty * PIG_PRICE_KC;
    const uid = req.user.uid;

    try {
        const result = await db.runTransaction(async (t) => {
            const userRef = db.collection('users').doc(uid);
            const doc = await t.get(userRef);
            if (!doc.exists) throw new Error('Tài khoản không tồn tại');

            const data = doc.data();
            if ((data.diamond || 0) < totalCost) {
                throw new Error(`Không đủ KC! Cần ${totalCost} KC, bạn có ${data.diamond || 0} KC`);
            }

            const newPigs = [];
            const todayStr = today();
            for (let i = 0; i < qty; i++) {
                newPigs.push({
                    id: genId(),
                    name: randomName(),
                    term,
                    startDate: new Date().toISOString(),
                    health: 100,
                    happiness: 100,
                    progress: 0,
                    lastFed: todayStr,
                    lastCleaned: todayStr,
                    sold: false,
                    soldDate: null
                });
            }

            const updatedPigs = [...(data.pigs || []), ...newPigs];
            t.update(userRef, {
                diamond: admin.firestore.FieldValue.increment(-totalCost),
                pigs: updatedPigs
            });

            return { pigs: newPigs, diamond: (data.diamond || 0) - totalCost };
        });

        res.json({ success: true, pigs: result.pigs, diamond: result.diamond });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── POST /api/sell — Bán heo nhận KC ──
app.post('/api/sell', verifyAuth, async (req, res) => {
    const { pigId } = req.body;
    if (!pigId) return res.status(400).json({ error: 'Thiếu mã heo' });

    const uid = req.user.uid;

    try {
        const result = await db.runTransaction(async (t) => {
            const userRef = db.collection('users').doc(uid);
            const doc = await t.get(userRef);
            if (!doc.exists) throw new Error('Tài khoản không tồn tại');

            const data = doc.data();
            const pigs = [...(data.pigs || [])];
            const idx = pigs.findIndex(p => p.id === pigId);

            if (idx < 0) throw new Error('Không tìm thấy heo');
            if (pigs[idx].sold) throw new Error('Heo đã được bán rồi');

            const pig = pigs[idx];
            const pigInfo = PIGS[pig.term];
            if (!pigInfo) throw new Error('Loại heo không hợp lệ');

            // Server-side maturity check from original startDate
            const start = new Date(pig.startDate);
            const now = new Date();
            const elapsed = Math.floor((now - start) / 86400000);
            const progress = Math.min(100, Math.round((elapsed / pigInfo.days) * 100));

            if (progress < 100) throw new Error(`Heo chưa đáo hạn! (${progress}%)`);

            const reward = pigInfo.reward;
            pigs[idx] = { ...pig, sold: true, soldDate: new Date().toISOString(), progress: 100 };

            t.update(userRef, {
                pigs,
                diamond: admin.firestore.FieldValue.increment(reward),
                totalKCEarned: admin.firestore.FieldValue.increment(reward)
            });

            return {
                reward,
                pigName: pig.name,
                diamond: (data.diamond || 0) + reward,
                totalKCEarned: (data.totalKCEarned || 0) + reward
            };
        });

        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── POST /api/transfer — Chuyển KC ──
app.post('/api/transfer', verifyAuth, async (req, res) => {
    const uid = req.user.uid;
    let { recipientEmail, amount, note } = req.body;

    amount = parseInt(amount);
    recipientEmail = (recipientEmail || '').trim().toLowerCase();
    note = (note || '').trim().substring(0, 100);

    if (!recipientEmail) return res.status(400).json({ error: 'Vui lòng nhập email người nhận' });
    if (!amount || amount < 1) return res.status(400).json({ error: 'Số KC phải lớn hơn 0' });

    try {
        // Find recipient
        const snap = await db.collection('users').where('email', '==', recipientEmail).get();
        if (snap.empty) return res.status(404).json({ error: 'Không tìm thấy tài khoản với email này' });

        const recipDoc = snap.docs[0];
        if (recipDoc.id === uid) return res.status(400).json({ error: 'Không thể chuyển cho chính mình' });

        const result = await db.runTransaction(async (t) => {
            const senderRef = db.collection('users').doc(uid);
            const recipRef = db.collection('users').doc(recipDoc.id);

            const senderSnap = await t.get(senderRef);
            const recipSnap = await t.get(recipRef);

            if (!senderSnap.exists) throw new Error('Tài khoản gửi không tồn tại');
            if (!recipSnap.exists) throw new Error('Tài khoản nhận không tồn tại');

            const senderData = senderSnap.data();
            const recipData = recipSnap.data();

            if (senderData.diamond < amount) {
                throw new Error(`Không đủ KC! Bạn có ${senderData.diamond} KC`);
            }

            const transferId = genId();
            const now = new Date().toISOString();

            const senderTransfer = { id: transferId, type: 'sent', to: recipientEmail, toName: recipData.name, amount, note, date: now };
            const recipTransfer = { id: transferId, type: 'received', from: senderData.email, fromName: senderData.name, amount, note, date: now };

            t.update(senderRef, {
                diamond: admin.firestore.FieldValue.increment(-amount),
                transfers: admin.firestore.FieldValue.arrayUnion(senderTransfer)
            });
            t.update(recipRef, {
                diamond: admin.firestore.FieldValue.increment(amount),
                transfers: admin.firestore.FieldValue.arrayUnion(recipTransfer)
            });

            return {
                recipientName: recipData.name,
                transfer: senderTransfer,
                diamond: senderData.diamond - amount
            };
        });

        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── POST /api/topup — Yêu cầu nạp tiền ──
app.post('/api/topup', verifyAuth, async (req, res) => {
    const uid = req.user.uid;
    let { amount, note } = req.body;
    amount = parseInt(amount);

    if (!amount || amount < 100000) return res.status(400).json({ error: 'Tối thiểu 100,000 VNĐ' });
    if (amount > 100000000) return res.status(400).json({ error: 'Tối đa 100,000,000 VNĐ' });

    // Validate note format
    if (!note || !/^HD\d{6}$/.test(note)) {
        note = 'HD' + Math.floor(100000 + Math.random() * 900000);
    }

    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return res.status(404).json({ error: 'Tài khoản không tồn tại' });

        const userData = userDoc.data();
        const history = userData.topupHistory || [];

        // Rate limit: max 3 pending requests
        const pendingCount = history.filter(h => h.status === 'pending').length;
        if (pendingCount >= 3) {
            return res.status(429).json({ error: 'Đã có 3 yêu cầu đang chờ. Vui lòng đợi duyệt.' });
        }

        // Rate limit: 5 min cooldown
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const recent = history.filter(h => new Date(h.date).getTime() > fiveMinAgo);
        if (recent.length > 0) {
            return res.status(429).json({ error: 'Vui lòng đợi 5 phút giữa mỗi lần nạp.' });
        }

        const requestId = genId();
        const now = new Date().toISOString();
        const entry = { id: requestId, amount, note, status: 'pending', date: now };

        await userRef.update({
            topupHistory: admin.firestore.FieldValue.arrayUnion(entry)
        });

        // Send Telegram with inline keyboard
        const kcAmount = Math.floor(amount / KC_RATE);
        const text = `💰 *YÊU CẦU NẠP TIỀN*\n\n` +
            `👤 Tên: ${userData.name}\n` +
            `📧 Email: ${userData.email}\n` +
            `💵 Số tiền: ${formatMoney(amount)} → 💎 ${kcAmount} KC\n` +
            `📝 Nội dung CK: \`${note}\`\n` +
            `🆔 Mã: \`${requestId}\`\n` +
            `⏰ ${new Date().toLocaleString('vi-VN')}`;

        await callTelegram('sendMessage', {
            chat_id: ADMIN_CHAT_ID,
            text,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Duyệt nạp tiền', callback_data: `approve:${uid}:${requestId}:${amount}` },
                    { text: '❌ Từ chối', callback_data: `reject:${uid}:${requestId}:${amount}` }
                ]]
            }
        });

        res.json({ success: true, requestId, note, amount });
    } catch (err) {
        console.error('Topup error:', err);
        res.status(500).json({ error: 'Lỗi server, vui lòng thử lại' });
    }
});

// ── POST /api/daily-reward — Nhận thưởng hàng ngày ──
app.post('/api/daily-reward', verifyAuth, async (req, res) => {
    const uid = req.user.uid;

    try {
        const result = await db.runTransaction(async (t) => {
            const userRef = db.collection('users').doc(uid);
            const doc = await t.get(userRef);
            if (!doc.exists) throw new Error('Tài khoản không tồn tại');

            const data = doc.data();
            const todayStr = today();

            if (data.lastDailyReward === todayStr) throw new Error('Đã nhận thưởng hôm nay rồi');

            // Calculate streak server-side (not trusting client loginStreak)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            const streak = (data.lastDailyReward === yesterdayStr) ? Math.min((data.loginStreak || 0) + 1, 30) : 1;

            const bonus = DAILY_REWARD * streak;

            t.update(userRef, {
                diamond: admin.firestore.FieldValue.increment(bonus),
                totalKCEarned: admin.firestore.FieldValue.increment(bonus),
                lastDailyReward: todayStr,
                loginStreak: streak
            });

            return {
                bonus,
                diamond: (data.diamond || 0) + bonus,
                totalKCEarned: (data.totalKCEarned || 0) + bonus
            };
        });

        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════
//  TELEGRAM BOT
// ═══════════════════════════════════════════

function callTelegram(method, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/${method}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function sendTgMessage(chatId, text) {
    return callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
}

function editTgMessage(chatId, msgId, text) {
    return callTelegram('editMessageText', {
        chat_id: chatId, message_id: msgId, text,
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: [] }
    });
}

// ── Bot Message Handler ──
async function handleTgMessage(msg) {
    if (!msg.text) return;
    const chatId = msg.chat.id.toString();
    if (chatId !== ADMIN_CHAT_ID) return sendTgMessage(chatId, '⛔ Bạn không có quyền sử dụng bot này.');

    const text = msg.text.trim();

    if (text === '/start') {
        return sendTgMessage(chatId,
            '🐷 *HEO ĐẤT — Admin Bot*\n\n' +
            'Khi có yêu cầu nạp tiền, bot sẽ gửi tin nhắn kèm 2 nút:\n' +
            '✅ *Duyệt* — Cộng tiền vào ví user\n' +
            '❌ *Từ chối* — Thông báo cho user\n\n' +
            'Lệnh:\n`/pending` — Xem yêu cầu chờ duyệt'
        );
    }

    if (text === '/pending') {
        const snap = await db.collection('users').get();
        let count = 0;
        for (const doc of snap.docs) {
            const u = doc.data();
            if (u.topupHistory) {
                for (const h of u.topupHistory.filter(h => h.status === 'pending')) {
                    const date = new Date(h.date).toLocaleString('vi-VN');
                    await callTelegram('sendMessage', {
                        chat_id: chatId,
                        text: `💰 *YÊU CẦU CHỜ DUYỆT*\n\n👤 ${u.name} (${u.email})\n💵 ${formatMoney(h.amount)}\n📝 ${h.note}\n⏰ ${date}`,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '✅ Duyệt', callback_data: `approve:${doc.id}:${h.id}:${h.amount}` },
                                { text: '❌ Từ chối', callback_data: `reject:${doc.id}:${h.id}:${h.amount}` }
                            ]]
                        }
                    });
                    count++;
                }
            }
        }
        if (count === 0) return sendTgMessage(chatId, '✅ Không có yêu cầu nào đang chờ.');
        return;
    }

    return sendTgMessage(chatId, '❓ Gõ /start để xem hướng dẫn.');
}

// ── Bot Callback Handler (inline buttons) ──
async function handleTgCallback(callback) {
    const chatId = callback.message.chat.id.toString();
    const msgId = callback.message.message_id;
    const data = callback.data;

    if (chatId !== ADMIN_CHAT_ID) {
        return callTelegram('answerCallbackQuery', { callback_query_id: callback.id, text: '⛔ Không có quyền' });
    }

    const parts = data.split(':');
    if (parts.length < 4) {
        return callTelegram('answerCallbackQuery', { callback_query_id: callback.id, text: '❌ Dữ liệu không hợp lệ' });
    }

    const [action, uid, reqId, amountStr] = parts;
    const amount = parseInt(amountStr);

    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return callTelegram('answerCallbackQuery', { callback_query_id: callback.id, text: '❌ User không tồn tại' });
        }

        const userData = userDoc.data();
        const history = [...(userData.topupHistory || [])];
        const idx = history.findIndex(h => h.id === reqId);

        if (idx < 0) {
            return callTelegram('answerCallbackQuery', { callback_query_id: callback.id, text: '❌ Yêu cầu không tồn tại' });
        }

        if (history[idx].status !== 'pending') {
            await callTelegram('answerCallbackQuery', { callback_query_id: callback.id, text: `⚠️ Đã xử lý (${history[idx].status})` });
            await editTgMessage(chatId, msgId, callback.message.text + `\n\n⚠️ _Đã xử lý trước đó_`);
            return;
        }

        history[idx].status = action === 'approve' ? 'approved' : 'rejected';
        history[idx].processedAt = new Date().toISOString();

        if (action === 'approve') {
            const kcAmount = Math.floor(amount / KC_RATE);
            await userRef.update({
                diamond: admin.firestore.FieldValue.increment(kcAmount),
                topupHistory: history
            });
            await editTgMessage(chatId, msgId,
                callback.message.text + `\n\n✅ *ĐÃ DUYỆT*\n💎 Đã cộng ${kcAmount} KC vào ví ${userData.name}`
            );
            await callTelegram('answerCallbackQuery', { callback_query_id: callback.id, text: '✅ Đã duyệt!' });
        } else {
            history[idx].rejectReason = 'Admin từ chối';
            await userRef.update({ topupHistory: history });
            await editTgMessage(chatId, msgId,
                callback.message.text + `\n\n❌ *ĐÃ TỪ CHỐI*`
            );
            await callTelegram('answerCallbackQuery', { callback_query_id: callback.id, text: '❌ Đã từ chối.' });
        }
    } catch (err) {
        console.error('Callback error:', err);
        await callTelegram('answerCallbackQuery', { callback_query_id: callback.id, text: '❌ Lỗi: ' + err.message });
    }
}

// ── Telegram Polling ──
let lastUpdateId = 0;

async function poll() {
    try {
        const result = await callTelegram('getUpdates', { offset: lastUpdateId + 1, timeout: 30 });
        if (result.ok && result.result.length > 0) {
            for (const update of result.result) {
                lastUpdateId = update.update_id;
                if (update.message) await handleTgMessage(update.message);
                if (update.callback_query) await handleTgCallback(update.callback_query);
            }
        }
    } catch (err) {
        console.error('Poll error:', err.message);
    }
    setTimeout(poll, 1000);
}

// ── Start Server ──
app.listen(PORT, () => {
    console.log(`🐷 Heo Đất Server: http://localhost:${PORT}`);
    console.log('📱 Telegram Bot @Heodat3322_bot đã kết nối');
    console.log('🔒 API bảo mật đã sẵn sàng');
    poll();
});
