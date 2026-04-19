/* ==========================================
   HEO ĐẤT — Server (Express + Supabase + Telegram Bot)
   Chạy: node server.js
   Tất cả thao tác tài chính đi qua đây
   ========================================== */

require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const path = require('path');

// ── Config ──
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.error('❌ Thiếu biến môi trường BOT_TOKEN hoặc ADMIN_CHAT_ID');
    process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.error('❌ Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SECRET_KEY');
    process.exit(1);
}

// Supabase admin client (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const PIGS = {
    3:  { label: 'Heo con', days: 90,  reward: 103 },
    6:  { label: 'Heo lứa', days: 180, reward: 107 },
    12: { label: 'Heo nái', days: 365, reward: 118 }
};
const PIG_PRICE_KC = 100;
const KC_RATE = 1000;
const PIG_NAMES = [
    'Heo Bông','Heo Mập','Heo Xinh','Heo Cute','Heo Hồng','Heo Vui','Heo Yêu',
    'Heo Béo','Heo Phúc','Heo Lộc','Heo Tài','Heo Đẹp','Heo Mochi','Heo Bánh',
    'Heo Sữa','Heo Đậu','Heo Bí','Heo Cam','Heo Cherry','Heo Mint','Heo Kẹo',
    'Heo Nắng','Heo Mưa','Heo Gió','Heo Trăng','Heo Sao','Heo Hoa','Heo Lá'
];

// ── Helpers ──
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

// ── Express ──
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth Middleware (Supabase JWT) ──
async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Chưa đăng nhập' });
    }
    try {
        const token = authHeader.split('Bearer ')[1];
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) throw new Error('Token không hợp lệ');
        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token không hợp lệ' });
    }
}

// ═══════════════════════════════════════════
//  API ENDPOINTS
// ═══════════════════════════════════════════

// ── POST /api/register — Tạo profile sau khi signUp ──
app.post('/api/register', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.id;
        const { name, phone } = req.body;
        if (!name || !phone) return res.status(400).json({ error: 'Thiếu tên hoặc SĐT' });

        // Check if profile already exists
        const { data: existing } = await supabase.from('users').select('id').eq('id', uid).single();
        if (existing) return res.json({ ok: true, message: 'Profile đã tồn tại' });

        const { error } = await supabase.from('users').insert({
            id: uid,
            email: req.user.email,
            name: name.trim(),
            phone: phone.trim(),
            diamond: 0,
            total_kc_earned: 0,
            total_cares: 0,
            last_login: today(),
            achievements: []
        });
        if (error) throw error;
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Lỗi tạo profile' });
    }
});

// ── POST /api/purchase — Mua heo ──
app.post('/api/purchase', verifyAuth, async (req, res) => {
    let { term, qty } = req.body;
    term = parseInt(term);
    qty = parseInt(qty);

    if (![3, 6, 12].includes(term)) return res.status(400).json({ error: 'Kỳ hạn không hợp lệ' });
    if (!qty || qty < 1 || qty > 100) return res.status(400).json({ error: 'Số lượng phải từ 1-100' });

    const totalCost = qty * PIG_PRICE_KC;
    const uid = req.user.id;

    try {
        // Get user
        const { data: user, error: userErr } = await supabase
            .from('users').select('diamond').eq('id', uid).single();
        if (userErr || !user) throw new Error('Tài khoản không tồn tại');
        if (user.diamond < totalCost) throw new Error(`Không đủ KC! Cần ${totalCost} KC, bạn có ${user.diamond} KC`);

        // Deduct diamond
        const { error: updateErr } = await supabase
            .from('users').update({ diamond: user.diamond - totalCost }).eq('id', uid);
        if (updateErr) throw new Error('Lỗi cập nhật số dư');

        // Create pigs
        const todayStr = today();
        const newPigs = [];
        for (let i = 0; i < qty; i++) {
            newPigs.push({
                user_id: uid,
                name: randomName(),
                term,
                start_date: new Date().toISOString(),
                health: 100,
                happiness: 100,
                last_fed: todayStr,
                last_cleaned: todayStr,
                sold: false
            });
        }

        const { data: insertedPigs, error: pigErr } = await supabase
            .from('pigs').insert(newPigs).select();
        if (pigErr) throw new Error('Lỗi tạo heo');

        res.json({ success: true, pigs: insertedPigs, diamond: user.diamond - totalCost });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── POST /api/sell — Bán heo nhận KC ──
app.post('/api/sell', verifyAuth, async (req, res) => {
    const { pigId } = req.body;
    if (!pigId) return res.status(400).json({ error: 'Thiếu mã heo' });
    const uid = req.user.id;

    try {
        // Get pig
        const { data: pig, error: pigErr } = await supabase
            .from('pigs').select('*').eq('id', pigId).eq('user_id', uid).single();
        if (pigErr || !pig) throw new Error('Không tìm thấy heo');
        if (pig.sold) throw new Error('Heo đã được bán rồi');

        const pigInfo = PIGS[pig.term];
        if (!pigInfo) throw new Error('Loại heo không hợp lệ');

        // Maturity check
        const start = new Date(pig.start_date);
        const now = new Date();
        const elapsed = Math.floor((now - start) / 86400000);
        const progress = Math.min(100, Math.round((elapsed / pigInfo.days) * 100));
        if (progress < 100) throw new Error(`Heo chưa đáo hạn! (${progress}%)`);

        const reward = pigInfo.reward;

        // Mark pig as sold
        await supabase.from('pigs').update({ sold: true, sold_date: new Date().toISOString() }).eq('id', pigId);

        // Update user diamond
        const { data: user } = await supabase.from('users').select('diamond, total_kc_earned').eq('id', uid).single();
        const newDiamond = (user.diamond || 0) + reward;
        const newTotalKC = (user.total_kc_earned || 0) + reward;
        await supabase.from('users').update({ diamond: newDiamond, total_kc_earned: newTotalKC }).eq('id', uid);

        res.json({ success: true, reward, pigName: pig.name, diamond: newDiamond, totalKCEarned: newTotalKC });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── POST /api/care — Cho ăn / Tắm heo ──
app.post('/api/care', verifyAuth, async (req, res) => {
    const uid = req.user.id;
    const { pigId, action } = req.body;

    if (!pigId || !['feed', 'clean'].includes(action)) {
        return res.status(400).json({ error: 'Thiếu thông tin chăm sóc' });
    }

    try {
        const { data: pig, error: pigErr } = await supabase
            .from('pigs').select('*').eq('id', pigId).eq('user_id', uid).single();
        if (pigErr || !pig) throw new Error('Không tìm thấy heo');
        if (pig.sold) throw new Error('Heo đã được bán rồi');

        const updates = {};
        if (action === 'feed') {
            updates.last_fed = today();
            updates.health = Math.min(100, (pig.health || 50) + 20);
        } else {
            updates.last_cleaned = today();
            updates.happiness = Math.min(100, (pig.happiness || 50) + 20);
        }

        const { data: updatedPig, error: updateErr } = await supabase
            .from('pigs').update(updates).eq('id', pigId).select().single();
        if (updateErr) throw new Error('Lỗi cập nhật heo');

        // Update total cares
        const { data: user } = await supabase.from('users').select('total_cares').eq('id', uid).single();
        const totalCares = (user.total_cares || 0) + 1;
        await supabase.from('users').update({ total_cares: totalCares }).eq('id', uid);

        res.json({ success: true, pig: updatedPig, totalCares });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── POST /api/transfer — Chuyển KC ──
app.post('/api/transfer', verifyAuth, async (req, res) => {
    const uid = req.user.id;
    let { recipientEmail, amount, note } = req.body;

    amount = parseInt(amount);
    recipientEmail = (recipientEmail || '').trim().toLowerCase();
    note = (note || '').trim().substring(0, 100);

    if (!recipientEmail) return res.status(400).json({ error: 'Vui lòng nhập email người nhận' });
    if (!amount || amount < 1) return res.status(400).json({ error: 'Số KC phải lớn hơn 0' });
    if (amount > 10000) return res.status(400).json({ error: 'Tối đa chuyển 10,000 KC mỗi lần' });

    try {
        // Rate limit: max 5 per hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count } = await supabase
            .from('transfers').select('*', { count: 'exact', head: true })
            .eq('sender_id', uid).gte('created_at', oneHourAgo);
        if (count >= 5) {
            return res.status(429).json({ error: 'Chỉ được chuyển tối đa 5 lần/giờ. Vui lòng đợi.' });
        }

        // Find recipient
        const { data: recipients } = await supabase
            .from('users').select('id, name, email').eq('email', recipientEmail);
        if (!recipients || recipients.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy tài khoản với email này' });
        }
        const recipient = recipients[0];
        if (recipient.id === uid) return res.status(400).json({ error: 'Không thể chuyển cho chính mình' });

        // Get sender
        const { data: sender } = await supabase
            .from('users').select('diamond, email, name').eq('id', uid).single();
        if (sender.diamond < amount) throw new Error(`Không đủ KC! Bạn có ${sender.diamond} KC`);

        // Execute transfer
        await supabase.from('users').update({ diamond: sender.diamond - amount }).eq('id', uid);

        const { data: recipFull } = await supabase.from('users').select('diamond').eq('id', recipient.id).single();
        await supabase.from('users').update({ diamond: (recipFull.diamond || 0) + amount }).eq('id', recipient.id);

        // Record transfer
        const { data: transfer } = await supabase.from('transfers').insert({
            sender_id: uid,
            recipient_id: recipient.id,
            amount,
            note
        }).select().single();

        res.json({
            success: true,
            recipientName: recipient.name,
            transfer: {
                id: transfer.id,
                type: 'sent',
                to: recipientEmail,
                toName: recipient.name,
                amount,
                note,
                date: transfer.created_at
            },
            diamond: sender.diamond - amount
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── POST /api/topup — Yêu cầu nạp tiền ──
app.post('/api/topup', verifyAuth, async (req, res) => {
    const uid = req.user.id;
    let { amount, note } = req.body;
    amount = parseInt(amount);

    if (!amount || amount < 100000) return res.status(400).json({ error: 'Tối thiểu 100,000 VNĐ' });
    if (amount > 100000000) return res.status(400).json({ error: 'Tối đa 100,000,000 VNĐ' });

    if (!note || !/^HD\d{6}$/.test(note)) {
        note = 'HD' + Math.floor(100000 + Math.random() * 900000);
    }

    try {
        const { data: user } = await supabase.from('users').select('name, email').eq('id', uid).single();
        if (!user) return res.status(404).json({ error: 'Tài khoản không tồn tại' });

        // Rate limit: max 3 pending
        const { count: pendingCount } = await supabase
            .from('topup_history').select('*', { count: 'exact', head: true })
            .eq('user_id', uid).eq('status', 'pending');
        if (pendingCount >= 3) {
            return res.status(429).json({ error: 'Đã có 3 yêu cầu đang chờ. Vui lòng đợi duyệt.' });
        }

        // Rate limit: 5 min cooldown
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count: recentCount } = await supabase
            .from('topup_history').select('*', { count: 'exact', head: true })
            .eq('user_id', uid).gte('created_at', fiveMinAgo);
        if (recentCount > 0) {
            return res.status(429).json({ error: 'Vui lòng đợi 5 phút giữa mỗi lần nạp.' });
        }

        const kcAmount = Math.floor(amount / KC_RATE);

        const { data: topup, error: insertErr } = await supabase.from('topup_history').insert({
            user_id: uid,
            amount,
            kc_amount: kcAmount,
            note,
            status: 'pending'
        }).select().single();
        if (insertErr) throw new Error('Lỗi tạo yêu cầu');

        // Send Telegram
        const text = `💰 *YÊU CẦU NẠP TIỀN*\n\n` +
            `👤 Tên: ${user.name}\n` +
            `📧 Email: ${user.email}\n` +
            `💵 Số tiền: ${formatMoney(amount)} → 💎 ${kcAmount} KC\n` +
            `📝 Nội dung CK: \`${note}\`\n` +
            `🆔 Mã: \`${topup.id}\`\n` +
            `⏰ ${new Date().toLocaleString('vi-VN')}`;

        await callTelegram('sendMessage', {
            chat_id: ADMIN_CHAT_ID,
            text,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Duyệt nạp tiền', callback_data: `approve:${uid}:${topup.id}:${amount}` },
                    { text: '❌ Từ chối', callback_data: `reject:${uid}:${topup.id}:${amount}` }
                ]]
            }
        });

        res.json({ success: true, requestId: topup.id, note, amount });
    } catch (err) {
        console.error('Topup error:', err);
        res.status(500).json({ error: 'Lỗi server, vui lòng thử lại' });
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
        const { data: pending } = await supabase
            .from('topup_history')
            .select('*, users!inner(name, email)')
            .eq('status', 'pending');

        if (!pending || pending.length === 0) {
            return sendTgMessage(chatId, '✅ Không có yêu cầu nào đang chờ.');
        }

        for (const h of pending) {
            const date = new Date(h.created_at).toLocaleString('vi-VN');
            await callTelegram('sendMessage', {
                chat_id: chatId,
                text: `💰 *YÊU CẦU CHỜ DUYỆT*\n\n👤 ${h.users.name} (${h.users.email})\n💵 ${formatMoney(h.amount)}\n📝 ${h.note}\n⏰ ${date}`,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Duyệt', callback_data: `approve:${h.user_id}:${h.id}:${h.amount}` },
                        { text: '❌ Từ chối', callback_data: `reject:${h.user_id}:${h.id}:${h.amount}` }
                    ]]
                }
            });
        }
        return;
    }

    return sendTgMessage(chatId, '❓ Gõ /start để xem hướng dẫn.');
}

// ── Bot Callback Handler ──
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
        // Get topup request
        const { data: topup } = await supabase
            .from('topup_history').select('*').eq('id', reqId).single();
        if (!topup) {
            return callTelegram('answerCallbackQuery', { callback_query_id: callback.id, text: '❌ Yêu cầu không tồn tại' });
        }

        if (topup.status !== 'pending') {
            await callTelegram('answerCallbackQuery', { callback_query_id: callback.id, text: `⚠️ Đã xử lý (${topup.status})` });
            await editTgMessage(chatId, msgId, callback.message.text + `\n\n⚠️ _Đã xử lý trước đó_`);
            return;
        }

        if (action === 'approve') {
            const kcAmount = Math.floor(amount / KC_RATE);

            // Update topup status
            await supabase.from('topup_history').update({
                status: 'approved',
                processed_at: new Date().toISOString()
            }).eq('id', reqId);

            // Add diamond to user
            const { data: user } = await supabase.from('users').select('diamond, name').eq('id', uid).single();
            await supabase.from('users').update({ diamond: (user.diamond || 0) + kcAmount }).eq('id', uid);

            await editTgMessage(chatId, msgId,
                callback.message.text + `\n\n✅ *ĐÃ DUYỆT*\n💎 Đã cộng ${kcAmount} KC vào ví ${user.name}`
            );
            await callTelegram('answerCallbackQuery', { callback_query_id: callback.id, text: '✅ Đã duyệt!' });
        } else {
            await supabase.from('topup_history').update({
                status: 'rejected',
                reject_reason: 'Admin từ chối',
                processed_at: new Date().toISOString()
            }).eq('id', reqId);

            await editTgMessage(chatId, msgId, callback.message.text + `\n\n❌ *ĐÃ TỪ CHỐI*`);
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
    console.log('🔒 Supabase + API bảo mật đã sẵn sàng');
    poll();
});
