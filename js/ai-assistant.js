// AI ASSISTANT LOGIC (GROQ + GEMINI + FIREBASE)
// ==========================================
// (Config moved to top)

// Init: Load Settings from Firebase/Local
async function initAI() {
    // Try Local First
    const localConfig = localStorage.getItem('vapeAIConfig');
    if (localConfig) {
        aiConfig = JSON.parse(localConfig);
        updateAdminUI();
    }

    // Sync with Firebase
    if (navigator.onLine) {
        if (window.auth?.currentUser) {
            console.log("initAI: Current User:", window.auth.currentUser.email, window.auth.currentUser.uid);
        } else {
            console.warn("initAI: No auth user found despite onLine");
        }

        try {
            if (!window.db || !window.getDoc || !window.doc) return; // Wait for firebase init
            const docSnap = await window.getDoc(window.doc(window.db, "settings", "ai_config"));
            if (docSnap.exists()) {
                const cloudData = docSnap.data();

                // Compare with current config to see if we should notify
                const isDiff = JSON.stringify(aiConfig) !== JSON.stringify({ ...aiConfig, ...cloudData });

                aiConfig = { ...aiConfig, ...cloudData };
                localStorage.setItem('vapeAIConfig', JSON.stringify(aiConfig));

                updateAdminUI();
                if (typeof refreshAIVisibility === 'function') refreshAIVisibility();

                if (isDiff && localStorage.getItem('vapeRole') === 'system') {
                    showToast("Настройки AI синхронизированы ☁️");
                }
            }
        } catch (e) {
            console.error("AI Config Sync Error:", e);
        }
    }

    // Check usage limit
    updateAdminAIStatus();
}

function updateAdminUI() {
    const enabledCheck = document.getElementById('aiEnabledCheck');
    const modelSel = document.getElementById('aiModelSelect');
    const customInp = document.getElementById('aiCustomModel');
    const groqInp = document.getElementById('aiGroqKey');
    const geminiInp = document.getElementById('aiGeminiKey');
    const promptInp = document.getElementById('aiSystemPrompt');
    const backupsInp = document.getElementById('aiBackupKeys');

    if (enabledCheck) enabledCheck.checked = aiConfig.enabled !== false;
    // Show/Hide AI Button based on config
    const aiBtn = document.getElementById('aiFab');
    if (aiBtn) aiBtn.style.display = (aiConfig.enabled !== false) ? 'flex' : 'none';

    if (modelSel) modelSel.value = aiConfig.model || 'llama-3.3-70b-versatile';
    if (customInp) {
        customInp.value = aiConfig.customModel || '';
        customInp.style.display = aiConfig.model === 'custom' ? 'block' : 'none';
    }
    if (groqInp) groqInp.value = aiConfig.groqKey || '';
    if (geminiInp) geminiInp.value = aiConfig.geminiKey || '';
    if (promptInp) promptInp.value = aiConfig.systemPrompt || 'Ты — дружелюбный помощник администратора вейп-шопа.';
    if (backupsInp) backupsInp.value = (aiConfig.backupKeys || []).join('\n');

    // Toggle custom input visibility
    if (modelSel) {
        modelSel.onchange = () => {
            const val = modelSel.value;
            customInp.style.display = val === 'custom' ? 'block' : 'none';
            saveAISettings(); // Auto save
        };
    }
}

async function saveAISettings() {
    const enabled = document.getElementById('aiEnabledCheck').checked;
    const model = document.getElementById('aiModelSelect').value;
    const custom = document.getElementById('aiCustomModel').value;
    const groqKey = document.getElementById('aiGroqKey').value.trim();
    const geminiKey = document.getElementById('aiGeminiKey').value.trim();
    const systemPrompt = document.getElementById('aiSystemPrompt').value.trim();
    const backups = document.getElementById('aiBackupKeys').value.split('\n').map(k => k.trim()).filter(k => k);

    aiConfig = {
        enabled,
        model,
        customModel: custom,
        groqKey,
        geminiKey,
        systemPrompt,
        backupKeys: backups
    };

    // Save Local
    localStorage.setItem('vapeAIConfig', JSON.stringify(aiConfig));

    // Save Firebase
    try {
        if (!window.db || !window.setDoc || !window.doc) {
            throw new Error("Firebase not initialized");
        }
        await window.setDoc(window.doc(window.db, "settings", "ai_config"), aiConfig);
        showToast("Настройки обновлены ☁️");
    } catch (e) {
        console.error("AI Save Error:", e);
        if (e.code === 'permission-denied') {
            const email = window.auth?.currentUser?.email || 'неизвестно';
            if (email !== 'system@vape.com') {
                showToast(`Ошибка: Вы вошли как ${email}. Нужен system@vape.com`, "error");
            } else {
                showToast("Ошибка доступа к облаку (вы не админ?)", "error");
            }
        } else {
            showToast("Сохранено локально (ошибка облака)", "error");
        }
    }
}

// --- Chat Logic ---

function openChatModal() {
    triggerHaptic('light');
    document.getElementById('chatModal').style.display = 'flex';
    scrollToBottomChat();
}

function closeChatModal() {
    triggerHaptic('light');
    document.getElementById('chatModal').style.display = 'none';
}

function handleChatEnter(e) {
    if (e.key === 'Enter') sendChatMessage();
}

function scrollToBottomChat() {
    const container = document.getElementById('chatMessages');
    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    // 1. Check Limits
    const today = new Date().toISOString().split('T')[0];
    const usage = JSON.parse(localStorage.getItem('vapeAIUsage') || '{}');
    const currentCount = usage[today] || 0;

    if (currentCount >= DAILY_MSG_LIMIT) {
        addMessageToChat("ai", "Бро, лимит на сегодня всё. Спишемся завтра! 🌙");
        input.value = '';
        return;
    }

    // 2. UI Update
    triggerHaptic('light');
    addMessageToChat("user", message);
    input.value = '';
    const typingId = showTypingIndicator();

    // 3. System Prompt
    const revenue = document.getElementById('totalRevenue').innerText;
    const profit = document.getElementById('totalProfit').innerText;
    const products = JSON.parse(localStorage.getItem('inventory') || '[]').length;

    const basePrompt = aiConfig.systemPrompt || 'Ты — дружелюбный помощник владельца вейп-шопа.';

    // ИНСТРУКЦИИ ПО УПРАВЛЕНИЮ (ДЛЯ AI)
    // ИНСТРУКЦИИ ПО УПРАВЛЕНИЮ (ДЛЯ AI)
    const toolInstructions = `
            РОЛЬ: Ты — экспертный помощник владельца вейп-шопа. Ты "шаришь" в бизнесе, вейпах (жижи, поды, испары) и умеешь анализировать цифры.
            
            ТВОЙ СТИЛЬ:
            - Краткий, по делу, можно использовать легкий сленг (жижа, кэш, сток), но без фанатизма.
            - Профессиональный и уверенный.
            
            ПРАВИЛА АНАЛИЗА (КРИТИЧНО ВАЖНО):
            1. Внимательно изучи "ТЕКУЩИЙ СКЛАД" в конце сообщения.
            2. Если у товара кол-во (qty) равно 0 — ОН ЗАКОНЧИЛСЯ. Никаких акций на нулевой сток! Предлагай закуп.
            3. Если товара много (>10) и его нет в "ПОСЛЕДНИЕ ПРОДАЖИ" — это неликвид, предлагай скидку.
            4. Если просят продать товар, которого нет (0 шт) — предупреди, что это уведет склад в минус, но выполни, если настаивают.

            ПРАВИЛА ОТВЕТОВ:
            1. На вопросы "Как дела?", "Сколько денег?" отвечай ТЕКСТОМ, опираясь на "СОСТОЯНИЕ МАГАЗИНА".
            2. JSON-команды добавляй СТРОГО в конце ответа, только если нужно изменить данные.
            3. Если пользователь пишет "Продал Х", найди Х на складе, узнай цену и верни JSON продажи.

            ФОРМАТ КОМАНД (JSON):
            - Приход: {"action":"add_inventory","name":"Название","qty":10,"cost":500,"price":1000}
            - Продажа: {"action":"add_sale","name":"Название","qty":1,"price":1000}
            - Убыток: {"action":"add_loss","name":"Название","qty":1,"cost":300,"reason":"defect"}
            - Долг: {"action":"add_debt","name":"Имя","amount":500}
            - Заметка: {"action":"add_note","text":"Текст"}
            - Заказ/Бронь: {"action":"add_order","client":"Имя","item":"Товар","qty":1,"price":1000,"type":"reserve/preorder"}
            - Удалить товар полностью: {"action":"delete_inventory","name":"Название"}
            `;

    // 4. Подготовка данных для контекста
    // Use global window variables ensuring we see the latest in-memory state
    const invData = (window.inventory && window.inventory.length > 0) ? window.inventory : JSON.parse(localStorage.getItem('vapeInventory') || '[]');
    const salesData = (window.sales && window.sales.length > 0) ? window.sales : JSON.parse(localStorage.getItem('vapeSales') || '[]');
    const ordersData = (window.orders && window.orders.length > 0) ? window.orders : JSON.parse(localStorage.getItem('vapeOrders') || '[]');

    let inventoryList = "ПУСТО";
    if (invData.length > 0) {
        // Limit context to prevent token overflow
        inventoryList = invData.map(i => `${i.name} (${i.qty}шт, ${i.price}₽)`).join(", ");
    }

    let salesList = "НЕТ ПРОДАЖ";
    if (salesData.length > 0) {
        // Берем последние 50 продаж для контекста
        salesList = salesData.slice(0, 50).map(s => `[${s.date}] ${s.name} (${s.qty}шт)`).join("; ");
    }

    const dynamicContext = `
    СОСТОЯНИЕ МАГАЗИНА:
    - Выручка (все время): ${revenue}
    - Прибыль (все время): ${profit}
    - Всего позиций: ${products}
    - Активных заказов: ${ordersData.length}
    
    ТЕКУЩИЙ СКЛАД:
    ${inventoryList}

    ПОСЛЕДНИЕ ПРОДАЖИ:
    ${salesList}

    СПИСОК ЗАКАЗОВ:
    ${ordersData.length > 0 ? ordersData.map(o => `${o.client}: ${o.item} (${o.type})`).join("; ") : "НЕТ ЗАКАЗОВ"}
    `;

    const contextSystem = basePrompt + "\n" + toolInstructions + "\n" + dynamicContext;

    try {
        let success = false;
        let aiReply = "";

        // Determine Provider based on Model ID
        let modelID = aiConfig.model === 'custom' ? aiConfig.customModel : aiConfig.model;
        if (!modelID) modelID = 'llama-3.3-70b-versatile';

        const isGemini = modelID.startsWith('gemini');

        // Select Keys Config
        let primaryKey = isGemini ? aiConfig.geminiKey : aiConfig.groqKey;
        let keysToTry = [];
        if (primaryKey) keysToTry.push(primaryKey);
        if (aiConfig.backupKeys && aiConfig.backupKeys.length > 0) keysToTry.push(...aiConfig.backupKeys);

        // Ensure at least one key exists (or empty string to trigger provider error)
        if (keysToTry.length === 0) throw new Error(isGemini ? "Нет ключа Gemini" : "Нет ключа Groq");

        // Loop through keys
        for (const apiKey of keysToTry) {
            try {
                let text = "";
                if (isGemini) {
                    text = await callGeminiAPI(apiKey, modelID, contextSystem, message);
                } else {
                    text = await callGroqAPI(apiKey, modelID, contextSystem, message);
                }
                if (text) {
                    aiReply = text;
                    success = true;
                    break;
                }
            } catch (e) {
                console.warn("Key failure:", e);
                continue;
            }
        }

        if (!success) throw new Error("Все ключи недействительны или ошибка сети.");

        removeTypingIndicator(typingId);

        // Очищаем ответ от JSON для пользователя
        const cleanReply = aiReply.replace(/\{"action":.*\}/g, '').trim();

        addMessageToChat("ai", cleanReply || "Выполнено.");
        processAIAction(aiReply, message); // Передаем оригинальное сообщение пользователя (message) для логов
        triggerHaptic('success');

        // Update Usage
        usage[today] = currentCount + 1;
        localStorage.setItem('vapeAIUsage', JSON.stringify(usage));
        updateAdminAIStatus();

        // Log to Firebase
        addDoc(collection(db, "ai_chat_logs"), {
            timestamp: new Date(),
            userMessage: message,
            aiReply: aiReply,
            model: modelID
        }).catch(e => console.error(e));

        // Local History
        saveToChatHistory(message, aiReply);

    } catch (error) {
        removeTypingIndicator(typingId);
        addMessageToChat("ai", `Ошибка: ${error.message || "Сбой системы"}`);
        triggerHaptic('error');
    }
}

async function callGroqAPI(key, model, system, userMsg) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: userMsg }
            ],
            temperature: 0.7,
            max_tokens: 1024
        })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Groq Error");
    }
    const data = await response.json();
    return data.choices[0].message.content;
}

async function callGeminiAPI(key, modelId, system, userMsg) {
    let model = modelId;
    // Gemini endpoint
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const body = {
        contents: [{
            parts: [{ text: system + "\n\nUser Question: " + userMsg }]
        }]
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Gemini Error");
    }
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// Исполнитель действий AI (ПОЛНЫЙ КОНТРОЛЬ)
function processAIAction(text) {
    try {
        const jsonMatch = text.match(/\{"action":.*\}/);
        if (!jsonMatch) return;

        const data = JSON.parse(jsonMatch[0]);
        console.log("AI Command:", data);

        switch (data.action) {
            case 'add_inventory':
                if (!data.name) return;
                const existing = inventory.find(i => i.name.toLowerCase() === data.name.toLowerCase());
                if (existing) {
                    existing.qty += parseInt(data.qty || 1);
                    saveData(`AI: Пополнение ${data.name}`);
                } else {
                    inventory.unshift({
                        id: Date.now(),
                        name: data.name,
                        qty: parseInt(data.qty || 1),
                        cost: parseFloat(data.price || 0),
                        price: parseFloat(data.price || 0) * 1.5,
                        date: new Date().toLocaleDateString('ru-RU')
                    });
                    saveData(`AI: Новый товар ${data.name}`);
                }
                renderInventory();
                showToast(`📦 Склад: ${data.name}`);
                break;

            case 'clear_inventory':
                inventory = [];
                saveData(`AI: Полная очистка склада`);
                renderInventory();
                showToast(`🗑️ Склад полностью очищен`);
                break;

            case 'delete_inventory':
                if (!data.name) return;
                inventory = inventory.filter(i => i.name.toLowerCase() !== data.name.toLowerCase());
                saveData(`AI: Удаление товара`);
                renderInventory();
                showToast(`🗑️ Склад: удален ${data.name}`);
                break;

            case 'add_sale':
                if (!data.name) return;
                const invItem = inventory.find(i => i.name.toLowerCase() === data.name.toLowerCase());
                sales.unshift({
                    id: Date.now(),
                    name: data.name,
                    qty: parseInt(data.qty || 1),
                    price: parseFloat(data.price || 0),
                    cost: invItem ? invItem.cost : 0,
                    date: new Date().toLocaleDateString('ru-RU'),
                    timestamp: Date.now()
                });
                if (invItem) invItem.qty = Math.max(0, invItem.qty - (data.qty || 1));
                saveData(`AI: Продажа ${data.name}`);
                renderSales();
                renderInventory();
                showToast(`💰 Продажа записана`);
                break;

            case 'add_loss':
                if (!data.name) return;
                losses.unshift({
                    id: Date.now(),
                    name: data.name,
                    qty: parseInt(data.qty || 1),
                    cost: parseFloat(data.cost || 0),
                    reason: data.reason || 'other',
                    date: new Date().toLocaleDateString('ru-RU'),
                    timestamp: Date.now()
                });
                saveData(`AI: Брак/Убыток`);
                renderLosses();
                showToast(`📉 Убыток записан`);
                break;

            case 'add_debt':
                if (!data.name) return;
                debts.unshift({
                    id: Date.now(),
                    name: data.name,
                    amount: parseFloat(data.amount || 0),
                    date: new Date().toLocaleDateString('ru-RU')
                });
                saveData(`AI: Новый долг`);
                renderDebts();
                showToast(`🤝 Долг: ${data.name}`);
                break;

            case 'clear_debts':
                debts = [];
                saveData(`AI: Долги очищены`);
                renderDebts();
                showToast(`✅ Все долги списаны`);
                break;

            case 'add_note':
                if (!data.text) return;
                notes.unshift({ id: Date.now(), text: data.text, date: new Date().toISOString() });
                saveData(`AI: Заметка`);
                renderNotes();
                showToast(`📝 Заметка добавлена`);
                break;

            case 'delete_note':
                if (data.id === 'all') notes = [];
                saveData(`AI: Заметки удалены`);
                renderNotes();
                showToast(`🗑️ Заметки очищены`);
                break;

            case 'add_order':
                if (!data.client || !data.item) return;
                orders.unshift({
                    id: Date.now().toString(),
                    client: data.client,
                    item: data.item,
                    qty: parseInt(data.qty || 1),
                    price: parseFloat(data.price || 0),
                    type: data.type || 'reserve',
                    date: new Date().toISOString()
                });
                saveData(`AI: Новый заказ от ${data.client}`);
                if (typeof renderOrders === 'function') renderOrders();
                else if (window.renderOrders) window.renderOrders();
                showToast(`🛒 Заказ создан: ${data.client}`);
                break;
        }
        triggerHaptic('success');
    } catch (e) {
        console.error("AI Action Error:", e);
    }
}

function addMessageToChat(role, text) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    container.appendChild(div);
    scrollToBottomChat();
}

function showTypingIndicator() {
    const container = document.getElementById('chatMessages');
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.className = 'typing';
    div.id = id;
    div.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(div);
    scrollToBottomChat();
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function saveToChatHistory(user, ai) {
    const hist = JSON.parse(localStorage.getItem('vapeChatHistory') || '[]');
    hist.unshift({
        time: new Date().toLocaleTimeString(),
        user: user,
        ai: ai
    });
    if (hist.length > 50) hist.pop();
    localStorage.setItem('vapeChatHistory', JSON.stringify(hist));
    renderAdminChatHistory();
}

async function renderAdminChatHistory() {
    const container = document.getElementById('adminChatHistory');
    if (!container) return;

    // Если Firebase не готов - показываем локальную историю как fallback
    if (!window.firebaseDB || !window.getDocs || !window.query) {
        const hist = JSON.parse(localStorage.getItem('vapeChatHistory') || '[]');
        let html = '';
        if (hist.length === 0) {
            html = '<div style="text-align: center; opacity: 0.4;">История пуста</div>';
        } else {
            hist.slice(0, 10).forEach(h => {
                html += `<div><b>L:</b> ${h.user}</div>`;
            });
            html += '<div style="text-align:center; opacity:0.5; font-size:10px;">(Локальный кеш)</div>';
        }
        container.innerHTML = html;
        return;
    }

    container.innerHTML = '<div style="text-align:center; opacity:0.5; font-size:12px; padding:10px;">Загрузка облачной истории... ☁️</div>';

    try {
        const q = window.query(
            window.collection(window.firebaseDB, "ai_chat_logs"),
            window.orderBy("timestamp", "desc"),
            window.limit(20)
        );

        const querySnapshot = await window.getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = '<div style="text-align: center; opacity: 0.4; padding:10px;">История в облаке пуста</div>';
            return;
        }

        let html = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            let aiText = data.aiReply ? data.aiReply.replace(/\{"action":.*\}/g, '').trim() : '';
            if (!aiText && data.aiReply) aiText = "✔️ Выполнено действие";

            // Format Time safely
            let timeStr = '??:??';
            if (data.timestamp && data.timestamp.seconds) {
                timeStr = new Date(data.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            html += `
                        <div style="margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                             <div style="font-size: 10px; opacity: 0.4; margin-bottom: 4px; display:flex; justify-content:space-between;">
                                <span>${timeStr}</span>
                                <span>${data.model || 'AI'}</span>
                             </div>
                             <div style="margin-bottom: 4px; font-size: 13px;"><b>User:</b> <span style="opacity:0.9">${data.userMessage}</span></div>
                             <div style="color: var(--accent-color); font-size: 12px; line-height: 1.4;">🤖 ${aiText}</div>
                        </div>
                    `;
        });
        container.innerHTML = html;

        // See next step for exposing these functions. For now, writing logic placeholder:
        /*
        const q = query(collection(db, "ai_chat_logs"), orderBy("timestamp", "desc"), limit(20));
        const querySnapshot = await getDocs(q);
        let html = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            html += `...`;
        });
        container.innerHTML = html;
        */
    } catch (e) {
        container.innerHTML = 'Ошибка загрузки истории';
    }
}

function updateAdminAIStatus() {
    const countEl = document.getElementById('adminDailyCount');
    const today = new Date().toISOString().split('T')[0];
    const usage = JSON.parse(localStorage.getItem('vapeAIUsage') || '{}');
    const count = usage[today] || 0;
    if (countEl) countEl.innerText = `${count} / ${DAILY_MSG_LIMIT}`;
    renderAdminChatHistory();
}

// --- NEW FEATURES ---

// Restore active chat from local history
function loadChatHistory() {
    const hist = JSON.parse(localStorage.getItem('vapeChatHistory') || '[]');
    const container = document.getElementById('chatMessages');
    if (hist.length > 0 && (!container.children.length || container.innerHTML.includes('Пусто'))) {
        container.innerHTML = ''; // Clean placeholder
        // Show last 10 messages
        hist.slice(0, 10).reverse().forEach(h => {
            addMessageToChat('user', h.user);

            // Clean AI message from JSON before showing in history
            const cleanAi = h.ai.replace(/\{"action":.*\}/g, '').trim();
            if (cleanAi) addMessageToChat('ai', cleanAi);
        });
        addMessageToChat('ai', '<i>История восстановлена...</i>');
        scrollToBottomChat();
    }
}

// Real-Time Data Sync
function initRealTimeSync() {
    if (!window.firebaseOnSnapshot || !window.firebaseDoc || !window.firebaseDB) return;

    console.log("🔌 Connecting Real-Time Sync...");
    const docRef = window.firebaseDoc(window.firebaseDB, "tracker", "data");

    window.firebaseOnSnapshot(docRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        // Basic diff check to avoid loop (if timestamps match)
        // We'll just overwrite local for now as "Cloud is Truth"

        inventory = data.inventory || [];
        sales = data.sales || [];
        debts = data.debts || [];
        losses = data.losses || [];
        notes = data.notes || [];

        // Save to localStorage so it persists on reload
        // BUT do NOT call saveData() which pushes back to cloud!
        localStorage.setItem('inventory', JSON.stringify(inventory));
        localStorage.setItem('sales', JSON.stringify(sales));
        localStorage.setItem('debts', JSON.stringify(debts));
        localStorage.setItem('losses', JSON.stringify(losses));
        localStorage.setItem('notes', JSON.stringify(notes));
        localStorage.setItem('financialGoal', data.financialGoal || 0);

        if (data.financialGoal) financialGoal = data.financialGoal;

        renderAll();
        // showToast("☁️ Данные обновлены");
    });
}

// Start
setTimeout(() => {
    initAI();
    loadChatHistory();
    initRealTimeSync();
}, 1000);

// КЛИК ВНЕ ЧАТА ДЛЯ ЗАКРЫТИЯ
window.addEventListener('mousedown', (e) => {
    const modal = document.getElementById('chatModal');
    const aiBtn = document.querySelector('.ai-btn') || document.querySelector('.btn-float[onclick*="openChatModal"]');

    // Если чат открыт и клик не по нему и не по кнопке открытия
    if (modal && modal.style.display === 'flex') {
        if (!modal.contains(e.target) && (!aiBtn || !aiBtn.contains(e.target))) {
            closeChatModal();
        }
    }
});

async function clearChatHistory() {
    if (!confirm("Удалить ВСЮ историю переписки из ОБЛАКА? Это действие необратимо.")) return;

    try {
        if (typeof showToast === 'function') showToast("Удаление...", "info");

        // Delete from Firebase (last 50 items)
        // Need to ensure globals are available or imported. Assuming db/query/etc are in scope from closure or global window if module setup 
        // Based on file structure, likely relies on closure variables 'db', 'collection', etc.
        // If not, we use window.firebaseDB conventions

        let logsColl;
        try {
            logsColl = collection(db, "ai_chat_logs");
        } catch (e) {
            // Fallback to window globals if local variables unavailable
            logsColl = window.collection(window.firebaseDB, "ai_chat_logs");
        }

        const q = window.query ? window.query(logsColl, window.orderBy("timestamp", "desc"), window.limit(50))
            : query(logsColl, orderBy("timestamp", "desc"), limit(50));

        const getDocsFn = window.getDocs || getDocs;
        const deleteDocFn = window.deleteDoc || deleteDoc;
        const docFn = window.doc || doc;
        const dbRef = window.firebaseDB || db;

        const snapshot = await getDocsFn(q);

        const deletePromises = [];
        snapshot.forEach((docSnap) => {
            deletePromises.push(deleteDocFn(docFn(dbRef, "ai_chat_logs", docSnap.id)));
        });

        await Promise.all(deletePromises);

        // Clear Local Storage
        localStorage.removeItem('vapeChatHistory');

        // Clear UI
        const chatContainer = document.getElementById('chatMessages');
        if (chatContainer) chatContainer.innerHTML = '';

        const adminContainer = document.getElementById('adminChatHistory');
        if (adminContainer) adminContainer.innerHTML = '<div style="text-align: center; opacity: 0.4;">История очищена</div>';

        if (typeof showToast === 'function') showToast("История удалена из облака ☁️");

        setTimeout(() => {
            if (typeof renderAdminChatHistory === 'function') renderAdminChatHistory();
        }, 1000);

    } catch (e) {
        console.error("Clear History Error:", e);
        if (typeof showToast === 'function') showToast("Ошибка: " + e.message, "error");
        else alert("Error: " + e.message);
    }
}

// Export functions to window for HTML access
window.sendChatMessage = sendChatMessage;
window.handleChatEnter = handleChatEnter;
window.closeChatModal = closeChatModal;
window.openChatModal = openChatModal;
window.saveAISettings = saveAISettings;
window.clearChatHistory = clearChatHistory;
window.toggleUserAI = toggleUserAI;
window.initAI = initAI;

