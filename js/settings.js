if(document.body){ const body = document.body; }
        // Settings & Theme Logic
        const body = document.body;
        const themeSwitch = document.getElementById('themeSwitch');
        const notesSwitch = document.getElementById('notesSwitch');
        const notesBtn = document.querySelector('.notes-btn');

        // ==========================================
        // AI CONSTANTS & CONFIG (Moved up to avoid TDZ)
        // ==========================================
        const DAILY_MSG_LIMIT = 50;
        let aiConfig = {
            enabled: true, // Вкл/выкл AI
            model: 'llama-3.3-70b-versatile',
            customModel: '',
            groqKey: '',
            geminiKey: '',
            systemPrompt: 'Ты — дружелюбный помощник администратора вейп-шопа.',
            backupKeys: []
        };

        async function toggleUserAI() {
            const enabled = document.getElementById('userAISwitch').checked;
            localStorage.setItem('vapeUserAIEnabled', enabled);
            refreshAIVisibility();
            showToast(enabled ? "AI включен" : "AI скрыт");

            // Also update admin status if needed
            if (!enabled) {
                // optional: logic if user disables it
            }
        }

        async function clearChatHistory() {
            if (!confirm("Удалить историю переписки?")) return;

            // 1. Clear Local Storage
            // localStorage.removeItem('vapeAIUsage'); // Maybe keep usage stats?
            // Let's just clear the visual history if that's what is requested, 
            // but usually "Clear History" means clearing the chat logs.

            // If we want to clear the 'usage' count for today:
            // const today = new Date().toISOString().split('T')[0];
            // let usage = JSON.parse(localStorage.getItem('vapeAIUsage') || '{}');
            // delete usage[today];
            // localStorage.setItem('vapeAIUsage', JSON.stringify(usage));

            // 2. Clear visual list in Admin panel
            const historyContainer = document.getElementById('adminChatHistory');
            if (historyContainer) {
                historyContainer.innerHTML = '<div style="text-align: center; opacity: 0.4;">Пусто</div>';
            }

            showToast("История очищена");
        }

        function refreshAIVisibility() {
            const userEnabled = localStorage.getItem('vapeUserAIEnabled') !== 'false';
            const adminEnabled = aiConfig.enabled !== false;
            const btn = document.getElementById('aiFab');

            if (btn) {
                // Show if Admin allows AND User allows
                btn.style.display = (adminEnabled && userEnabled) ? 'flex' : 'none';
            }
        }

        function initSettings() {
            // ... existing theme/notes code

            // AI User Setting
            const userAI = localStorage.getItem('vapeUserAIEnabled') !== 'false';
            const aiSw = document.getElementById('userAISwitch');
            if (aiSw) aiSw.checked = userAI;
            refreshAIVisibility();
            // Theme
            const savedTheme = localStorage.getItem('theme');
            const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

            let isLight = false;
            if (savedTheme === 'light') isLight = true;
            else if (savedTheme === 'dark') isLight = false;
            else if (systemPrefersLight) isLight = true;

            if (isLight) body.classList.add('light-theme');
            else body.classList.remove('light-theme');

            if (themeSwitch) themeSwitch.checked = isLight;

            // Notes
            const notesEnabled = localStorage.getItem('vapeNotesEnabled') !== 'false';
            if (notesSwitch) notesSwitch.checked = notesEnabled;
            if (notesBtn) notesBtn.style.display = notesEnabled ? 'flex' : 'none';

            // Haptic
            const hapticEnabled = localStorage.getItem('vapeHapticEnabled') !== 'false';
            const hapticIntensity = localStorage.getItem('vapeHapticIntensity') || '2';
            const hapticSwitch = document.getElementById('hapticSwitch');
            const hapticIntensityRow = document.getElementById('hapticIntensityRow');
            const hapticIntensityInput = document.getElementById('hapticIntensity');

            if (hapticSwitch) hapticSwitch.checked = hapticEnabled;
            if (hapticIntensityRow) hapticIntensityRow.style.display = hapticEnabled ? 'flex' : 'none';
            if (hapticIntensityInput) hapticIntensityInput.value = hapticIntensity;
            updateHapticIntensityText(hapticIntensity);
        }

        function triggerHaptic(type = 'medium') {
            const enabled = localStorage.getItem('vapeHapticEnabled') === 'true';
            if (!enabled || !navigator.vibrate) return;

            const intensity = localStorage.getItem('vapeHapticIntensity') || '2';

            // Map intensity settings to millisecond patterns
            const patterns = {
                '1': [10],      // Light
                '2': [20],      // Medium
                '3': [40]       // Heavy (was 50, refined to 40 for more 'clicky' feel)
            };

            // If a specific type is requested (like 'success' or 'error'), we can override
            if (type === 'success') navigator.vibrate([10, 30, 10]);
            else if (type === 'error') navigator.vibrate([50, 50, 50]);
            else if (type === 'light') navigator.vibrate([10]);
            else navigator.vibrate(patterns[intensity] || [20]);
        }

        function toggleHapticSetting() {
            const hapticSwitch = document.getElementById('hapticSwitch');
            const hapticIntensityRow = document.getElementById('hapticIntensityRow');
            const enabled = hapticSwitch.checked;

            localStorage.setItem('vapeHapticEnabled', enabled);
            if (hapticIntensityRow) hapticIntensityRow.style.display = enabled ? 'flex' : 'none';

            if (enabled) {
                triggerHaptic();
                showToast("Вибрация включена");
            } else {
                showToast("Вибрация выключена");
            }
        }

        function updateHapticIntensity() {
            const input = document.getElementById('hapticIntensity');
            const val = input.value;
            localStorage.setItem('vapeHapticIntensity', val);
            updateHapticIntensityText(val);
            triggerHaptic();
        }

        function updateHapticIntensityText(val) {
            const textEl = document.getElementById('hapticIntensityValue');
            if (!textEl) return;

            const labels = {
                '1': 'Легкая',
                '2': 'Средняя',
                '3': 'Сильная'
            };
            textEl.innerText = labels[val] || 'Средняя';
        }

        function toggleTheme() {
            const isLight = themeSwitch.checked;
            if (isLight) body.classList.add('light-theme');
            else body.classList.remove('light-theme');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
        }

        function toggleNotesSetting() {
            const enabled = notesSwitch.checked;
            localStorage.setItem('vapeNotesEnabled', enabled);
            if (notesBtn) notesBtn.style.display = enabled ? 'flex' : 'none';
            showToast(enabled ? "Заметки включены" : "Заметки отключены");
        }

        initSettings();

        // ==========================================
    </script>
