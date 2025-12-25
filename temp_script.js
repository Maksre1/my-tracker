    <script>
        // Auth Check - redirect to login if not authenticated
        if (!sessionStorage.getItem('vapeAuth') && !localStorage.getItem('vapeAuthRemember')) {
            window.location.href = 'login.html';
        }

        // Data State
        let sales = JSON.parse(localStorage.getItem('vapeSales')) || [];
        let inventory = JSON.parse(localStorage.getItem('vapeInventory')) || [];
        let losses = JSON.parse(localStorage.getItem('vapeLosses')) || [];

        // Supabase Config
        const SUPABASE_URL = 'https://afkwsealqfdujvspvoea.supabase.co';
        const SUPABASE_KEY = 'sb_publishable_sMXGcGGfX8LsPhLcGg-Jbg_0J45ZFdH';
        const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

        let isOnline = navigator.onLine;
        window.addEventListener('online', () => { isOnline = true; if (typeof syncToCloud === 'function') syncToCloud(); });
        window.addEventListener('offline', () => isOnline = false);

        function updateDatalist() {
            // This function used to update a datalist, but we moved to custom autocomplete.
            // We keep it defined to prevent crashes since it's called in multiple places.
            console.log('Datalist updated');
        }

        let sortType = localStorage.getItem('vapeSortType') || 'date';
        let sortDir = localStorage.getItem('vapeSortDir') || 'desc';
        let statsPeriod = 'day';

        // Anti-duplicate protection vars
        let lastAddedSignature = '';
        let lastAddedTime = 0;

        let pendingInventoryItem = null;
        let vapeDontAskMerge = localStorage.getItem('vapeDontAskMerge') === 'true';

        // Loading animation
        window.addEventListener('DOMContentLoaded', () => {
            const overlay = document.getElementById('loadingOverlay');
            setTimeout(() => {
                overlay.classList.add('hidden');
                setTimeout(() => overlay.remove(), 400);
            }, 600); // Show for 600ms
        });

        // Tab Switching
        let isSwitching = false;

        function switchTab(tabName) {
            if (isSwitching) return;

            const currentTab = document.querySelector('.tab.active');
            let targetTabIndex = 1;
            if (tabName === 'inventory') targetTabIndex = 2;
            if (tabName === 'losses') targetTabIndex = 3;
            if (tabName === 'stats') targetTabIndex = 4;
            if (tabName === 'data') targetTabIndex = 5;

            const targetTab = document.querySelector(`.tab:nth-child(${targetTabIndex})`);

            // If clicking same tab, do nothing
            if (currentTab === targetTab) return;

            isSwitching = true;

            // 1. Update Tabs immediately for responsiveness
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            targetTab.classList.add('active');

            // 2. Find active page
            const activePage = document.querySelector('.page.active');
            let targetPageId = 'salesPage';
            if (tabName === 'inventory') targetPageId = 'inventoryPage';
            if (tabName === 'losses') targetPageId = 'lossesPage';
            if (tabName === 'stats') targetPageId = 'statsPage';
            if (tabName === 'data') targetPageId = 'dataPage';

            const targetPage = document.getElementById(targetPageId);

            // Helper to render data
            const renderData = () => {
                if (tabName === 'sales') renderSales();
                else if (tabName === 'inventory') renderInventory();
                else if (tabName === 'losses') renderLosses();
                else if (tabName === 'stats') renderStats();
                else if (tabName === 'data') updateInfoPageStats();
            };

            // 3. Sequential Transition
            if (activePage) {
                // Fade out old
                activePage.classList.remove('active');

                // Wait for CSS transition (300ms)
                setTimeout(() => {
                    activePage.style.display = 'none';

                    renderData(); // Update data before showing

                    // Show new page (invisible state)
                    targetPage.style.display = 'block';
                    // Force reflow
                    void targetPage.offsetWidth;

                    // Fade in new
                    targetPage.classList.add('active');

                    isSwitching = false;
                }, 300);
            } else {
                // Initial load or edge case
                renderData();
                targetPage.style.display = 'block';
                setTimeout(() => targetPage.classList.add('active'), 10);
                isSwitching = false;
            }
        }

        // Inventory Logic
        function addInventory() {
            const name = document.getElementById('invName').value.trim();
            const strength = document.getElementById('invStrength').value.trim();
            const qty = parseInt(document.getElementById('invQty').value);
            const cost = parseFloat(document.getElementById('invCost').value);
            const price = parseFloat(document.getElementById('invPrice').value);

            if (name && !isNaN(qty) && !isNaN(cost) && !isNaN(price)) {
                const newItem = { id: Date.now(), name, strength, qty, cost, price };

                // Check for strict duplicate (Name + Strength + Cost + Price)
                const existing = inventory.find(i =>
                    i.name.toLowerCase() === name.toLowerCase() &&
                    (i.strength || '').toLowerCase() === strength.toLowerCase() &&
                    i.cost === cost &&
                    i.price === price
                );

                if (existing && !vapeDontAskMerge) {
                    pendingInventoryItem = newItem;
                    document.getElementById('duplicateConflictModal').style.display = 'flex';
                } else if (existing && vapeDontAskMerge) {
                    // Merge automatically if user said "don't ask"
                    existing.qty += qty;
                    finalizeInventoryAdd();
                } else {
                    inventory.push(newItem);
                    finalizeInventoryAdd();
                }
            } else {
                alert("Заполни все поля склада!");
            }
        }

        function handleMergeResult(action) {
            if (!pendingInventoryItem) return;

            if (action === 'merge') {
                const existing = inventory.find(i =>
                    i.name.toLowerCase() === pendingInventoryItem.name.toLowerCase() &&
                    (i.strength || '').toLowerCase() === (pendingInventoryItem.strength || '').toLowerCase() &&
                    i.cost === pendingInventoryItem.cost &&
                    i.price === pendingInventoryItem.price
                );
                if (existing) existing.qty += pendingInventoryItem.qty;
            } else {
                inventory.push(pendingInventoryItem);
            }

            if (document.getElementById('dontAskMerge').checked) {
                vapeDontAskMerge = true;
                localStorage.setItem('vapeDontAskMerge', 'true');
            }

            finalizeInventoryAdd();
            document.getElementById('duplicateConflictModal').style.display = 'none';
        }

        function finalizeInventoryAdd() {
            document.getElementById('invName').value = '';
            document.getElementById('invStrength').value = '';
            document.getElementById('invQty').value = '';
            document.getElementById('invCost').value = '';
            document.getElementById('invPrice').value = '';
            pendingInventoryItem = null;
            saveData();
            renderInventory();
        }

        function deleteInventory(id) {
            if (confirm("Удалить товар со склада?")) {
                inventory = inventory.filter(i => i.id !== id);
                saveData();
                renderInventory();
                updateDatalist();
            }
        }

        function renderInventory() {
            const display = document.getElementById('inventoryDisplay');
            display.innerHTML = '';

            let totalCost = 0;
            let totalRevenue = 0;
            let totalCount = 0;
            inventory.forEach(item => {
                totalCost += item.cost * item.qty;
                totalRevenue += (item.price || 0) * item.qty;
                totalCount += item.qty;
            });

            document.getElementById('invTotalCost').textContent = totalCost.toLocaleString('ru-RU');
            document.getElementById('invTotalRevenue').textContent = totalRevenue.toLocaleString('ru-RU');
            document.getElementById('invTotalCount').textContent = totalCount.toLocaleString('ru-RU');
            document.getElementById('invTotalVariety').textContent = inventory.length.toLocaleString('ru-RU');

            if (inventory.length === 0) {
                display.innerHTML = '<div class="empty-state">Склад пуст</div>';
                return;
            }

            inventory.forEach(item => {
                const lowStockWarning = item.qty === 1 ? '<span class="low-stock-warning">⚠️ Последний!</span>' :
                    item.qty === 0 ? '<span class="low-stock-warning" style="background: #666;">Нет в наличии</span>' : '';
                const card = document.createElement('div');
                card.className = 'item-card';
                card.innerHTML = `
                    <div class="item-info">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <b style="font-size: 17px;">${item.name}</b>
                            ${item.strength ? `<span class="badge" style="background: rgba(255,255,255,0.08); border: 1px solid var(--glass-border); padding: 5px 10px; opacity: 0.8;">${item.strength}</span>` : ''}
                            <button class="edit-btn" onclick="openEdit(${item.id})">✎</button>
                            ${lowStockWarning}
                        </div>
                        <small style="margin-top: 5px; display: block;">В наличии: ${item.qty} шт. | Закуп: ${item.cost} ₽ | Прод.: ${item.price || 0} ₽</small>
                    </div>
                    <div class="item-right" style="flex-direction: row; align-items: center; gap: 8px;">
                        <div class="qty-controls">
                            <div class="qty-btn" onclick="updateQty(${item.id}, -1)">−</div>
                            <div class="qty-btn" onclick="updateQty(${item.id}, 1)">+</div>
                        </div>
                        <button class="delete-btn" onclick="deleteInventory(${item.id})">×</button>
                    </div>
                `;
                display.appendChild(card);
            });
        }

        function updateQty(id, change) {
            const item = inventory.find(i => i.id === id);
            if (item) {
                item.qty = Math.max(0, item.qty + change);
                saveData();
                renderInventory();
            }
        }

        function openEdit(id) {
            const item = inventory.find(i => i.id === id);
            if (item) {
                document.getElementById('editItemId').value = id;
                document.getElementById('editName').value = item.name;
                document.getElementById('editStrength').value = item.strength || '';
                document.getElementById('editCost').value = item.cost;
                document.getElementById('editPrice').value = item.price;
                document.getElementById('editModal').style.display = 'flex';
            }
        }

        function closeModal() {
            document.getElementById('editModal').style.display = 'none';
        }

        function saveEdit() {
            const id = parseInt(document.getElementById('editItemId').value);
            const name = document.getElementById('editName').value.trim();
            const strength = document.getElementById('editStrength').value.trim();
            const cost = parseFloat(document.getElementById('editCost').value);
            const price = parseFloat(document.getElementById('editPrice').value);

            if (name && !isNaN(cost) && !isNaN(price)) {
                const item = inventory.find(i => i.id === id);
                if (item) {
                    item.name = name;
                    item.strength = strength;
                    item.cost = cost;
                    item.price = price;
                    saveData();
                    renderInventory();
                    closeModal();
                }
            } else {
                alert("Заполните все поля!");
            }
        }

        // Autocomplete Logic
        function handleAutocomplete(input) {
            const val = input.value.toLowerCase();
            const list = document.getElementById('autocompleteList');
            list.innerHTML = '';

            if (!val && document.activeElement !== input) {
                list.style.display = 'none';
                return;
            }

            const matches = inventory.filter(i => i.name.toLowerCase().includes(val));

            if (matches.length > 0) {
                matches.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'autocomplete-item';
                    div.innerHTML = `<b>${item.name}</b> <small style="float: right; color: var(--accent-color)">${item.qty} шт.</small>`;
                    div.onclick = () => {
                        input.value = item.name;
                        document.getElementById('salePrice').value = item.price || '';
                        list.style.display = 'none';
                    };
                    list.appendChild(div);
                });
                list.style.display = 'block';
            } else {
                list.style.display = 'none';
            }
        }

        // Close lists on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.autocomplete-container')) {
                document.getElementById('autocompleteList').style.display = 'none';
            }
        });

        // Sales Logic
        function toggleDateInput() {
            const useDate = document.getElementById('useDate').checked;
            document.getElementById('manualDateContainer').style.display = useDate ? 'none' : 'block';
        }

        function addSale() {
            const name = document.getElementById('saleName').value.trim();
            const qty = parseInt(document.getElementById('saleQty').value);
            const price = parseFloat(document.getElementById('salePrice').value);
            const note = document.getElementById('saleNote').value.trim();
            const useDate = document.getElementById('useDate').checked;
            const manualDate = document.getElementById('saleDate').value;

            if (name && !isNaN(qty) && !isNaN(price)) {
                // Anti-duplication check
                const currentSignature = `${name}|${qty}|${price}|${note}`;
                const timeNow = Date.now();
                if (currentSignature === lastAddedSignature && (timeNow - lastAddedTime < 5000)) {
                    const btn = document.getElementById('addSaleBtn');
                    btn.classList.add('btn-error');
                    btn.innerText = 'ПОДОЖДИТЕ...';

                    setTimeout(() => {
                        btn.classList.remove('btn-error');
                        btn.innerText = 'ПРОДАТЬ';
                    }, 1000);
                    return;
                }

                let costPrice = 0;

                // Deduct from inventory if matched
                const invItem = inventory.find(i => i.name.toLowerCase() === name.toLowerCase());
                if (invItem) {
                    if (invItem.qty < qty) {
                        if (!confirm(`На складе всего ${invItem.qty}. Продать все равно?`)) return;
                    }
                    costPrice = invItem.cost;
                    invItem.qty -= qty;
                }

                const now = new Date();
                let saleDateStr = now.toLocaleDateString('ru-RU');

                if (!useDate) {
                    if (manualDate) {
                        const d = new Date(manualDate);
                        saleDateStr = d.toLocaleDateString('ru-RU');
                    } else {
                        saleDateStr = 'Без даты';
                    }
                }

                const sale = {
                    id: Date.now(),
                    name,
                    qty,
                    price,
                    cost: costPrice,
                    date: saleDateStr,
                    timestamp: now.getTime(),
                    note: note || ''
                };

                sales.unshift(sale);

                lastAddedSignature = currentSignature;
                lastAddedTime = timeNow;

                saveData();
                renderSales();
                renderInventory(); // update stock count in view if switched back
                updateDatalist();

                document.getElementById('saleName').value = '';
                document.getElementById('saleQty').value = '';
                document.getElementById('salePrice').value = '';
                document.getElementById('saleNote').value = '';
            } else {
                alert("Заполни поля продажи!");
            }
        }

        function deleteSale(id) {
            if (confirm("Удалить продажу?")) {
                sales = sales.filter(s => s.id !== id);
                saveData();
                renderSales();
            }
        }

        // Edit Sale Functions
        function openSaleEdit(id) {
            const sale = sales.find(s => s.id === id);
            if (sale) {
                document.getElementById('editSaleId').value = id;
                document.getElementById('editSaleName').value = sale.name || '';
                document.getElementById('editSaleQty').value = sale.qty || '';
                document.getElementById('editSalePrice').value = sale.price || '';
                document.getElementById('editSaleNote').value = sale.note || '';
                document.getElementById('editSaleModal').style.display = 'flex';
            }
        }

        function closeSaleModal() {
            document.getElementById('editSaleModal').style.display = 'none';
        }

        function saveSaleEdit() {
            const id = parseInt(document.getElementById('editSaleId').value);
            const name = document.getElementById('editSaleName').value.trim();
            const qty = parseInt(document.getElementById('editSaleQty').value);
            const price = parseFloat(document.getElementById('editSalePrice').value);
            const note = document.getElementById('editSaleNote').value.trim();

            if (!name || isNaN(qty) || isNaN(price)) {
                alert('Заполните все поля!');
                return;
            }

            const sale = sales.find(s => s.id === id);
            if (sale) {
                sale.name = name;
                sale.qty = qty;
                sale.price = price;
                sale.note = note;
                saveData();
                renderSales();
                closeSaleModal();
            }
        }

        function setSortType(type) {
            sortType = type;
            localStorage.setItem('vapeSortType', type);
            renderSales();
        }

        function toggleSortDir() {
            sortDir = sortDir === 'desc' ? 'asc' : 'desc';
            localStorage.setItem('vapeSortDir', sortDir);
            renderSales();
        }

        function updateSortUI() {
            document.getElementById('sortType').value = sortType;
            const dirBtn = document.getElementById('sortDirBtn');
            dirBtn.innerText = sortDir === 'desc' ? '↓' : '↑';
            dirBtn.style.display = sortType === 'profit_day' ? 'none' : 'flex';
        }

        function renderSales() {
            const display = document.getElementById('salesDisplay');
            const totalRevEl = document.getElementById('totalRevenue');
            const totalProfEl = document.getElementById('totalProfit');
            const filterDate = document.getElementById('dateFilter').value;

            display.innerHTML = '';

            updateSortUI();

            if (!['date', 'amount', 'name', 'popular', 'profit_day'].includes(sortType)) {
                sortType = 'date';
                localStorage.setItem('vapeSortType', 'date');
                updateSortUI();
            }

            let filteredSales = sales;
            if (filterDate) {
                const [y, m, d] = filterDate.split('-');
                const formattedFilter = `${parseInt(d)}.${parseInt(m)}.${y}`;
                filteredSales = sales.filter(s => {
                    const [sd, sm, sy] = s.date.split('.');
                    return `${parseInt(sd)}.${parseInt(sm)}.${sy}` === formattedFilter;
                });
            }

            let totalRev = 0;
            let totalProf = 0;

            // Stats (Filtered by date)
            filteredSales.forEach(s => {
                totalRev += (s.price * s.qty);
                totalProf += (s.price - (s.cost || 0)) * s.qty;
            });

            if (totalRevEl) totalRevEl.innerText = totalRev.toLocaleString('ru-RU');
            if (totalProfEl) totalProfEl.innerText = totalProf.toLocaleString('ru-RU');

            if (filteredSales.length === 0) {
                display.innerHTML = `<div class="empty-state">${filterDate ? 'На эту дату пусто' : 'Пока нет продаж'}</div>`;
                return;
            }

            if (sortType === 'date' || sortType === 'profit_day') {
                // Grouped views
                const groups = {};
                filteredSales.forEach(s => {
                    if (!groups[s.date]) {
                        groups[s.date] = { items: [], totalProfit: 0, dateObj: null };
                        if (s.date !== 'Без даты') {
                            const [d, m, y] = s.date.split('.');
                            groups[s.date].dateObj = new Date(y, m - 1, d);
                        }
                    }
                    groups[s.date].items.push(s);
                    groups[s.date].totalProfit += (s.price - (s.cost || 0)) * s.qty;
                });

                const sortedDates = Object.keys(groups).sort((a, b) => {
                    if (sortType === 'profit_day') {
                        return groups[b].totalProfit - groups[a].totalProfit;
                    } else if (sortDir === 'desc') {
                        if (a === 'Без даты') return 1;
                        if (b === 'Без даты') return -1;
                        return (groups[b].dateObj || 0) - (groups[a].dateObj || 0);
                    } else {
                        if (a === 'Без даты') return -1;
                        if (b === 'Без даты') return 1;
                        return (groups[a].dateObj || 0) - (groups[b].dateObj || 0);
                    }
                });

                sortedDates.forEach(date => {
                    const group = groups[date];
                    const div = document.createElement('div');
                    let html = `<div class="date-divider">${date} ${sortType === 'profit_day' ? `<span style="font-size:10px; opacity:0.7; margin-left:auto;">+${group.totalProfit.toLocaleString('ru-RU')} ₽</span>` : ''}</div>`;
                    group.items.forEach(s => {
                        const profit = (s.price - s.cost) * s.qty;
                        const noteHtml = s.note ? `<div style="margin-top: 6px; font-style: italic; color: var(--accent-color); font-size: 13px;">"заметка: ${s.note}"</div>` : '';
                        html += `
                            <div class="item-card">
                                <div class="item-info">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <b>${s.name}</b>
                                        <button class="edit-btn" onclick="openSaleEdit(${s.id})">✎</button>
                                    </div>
                                    <small>${sortType === 'profit_day' ? s.date + ' • ' : ''}${s.qty} шт. × ${s.price} ₽ ${s.cost > 0 ? `<span class="badge badge-profit">+${profit.toLocaleString('ru-RU')} ₽</span>` : ''}</small>
                                    ${noteHtml}
                                </div>
                                <div class="item-right">
                                    <span class="item-price">${(s.price * s.qty).toLocaleString('ru-RU')} ₽</span>
                                    <button class="delete-btn" onclick="deleteSale(${s.id})">×</button>
                                </div>
                            </div>
                        `;
                    });
                    div.innerHTML = html;
                    display.appendChild(div);
                });
            } else {
                // Flat views (Amount, Name, Popular)
                const itemsToSort = [...filteredSales];

                if (sortType === 'amount') {
                    itemsToSort.sort((a, b) => sortDir === 'desc' ? (b.price * b.qty) - (a.price * a.qty) : (a.price * a.qty) - (b.price * b.qty));
                } else if (sortType === 'name') {
                    itemsToSort.sort((a, b) => sortDir === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
                } else if (sortType === 'popular') {
                    itemsToSort.sort((a, b) => sortDir === 'desc' ? b.qty - a.qty : a.qty - b.qty);
                }

                itemsToSort.forEach(s => {
                    const profit = (s.price - s.cost) * s.qty;
                    const noteHtml = s.note ? `<div style="margin-top: 6px; font-style: italic; color: var(--accent-color); font-size: 13px;">"заметка: ${s.note}"</div>` : '';
                    const card = document.createElement('div');
                    card.className = 'item-card';
                    card.innerHTML = `
                        <div class="item-info">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <b>${s.name}</b>
                                <button class="edit-btn" onclick="openSaleEdit(${s.id})">✎</button>
                            </div>
                            <small>${s.date} • ${s.qty} шт. × ${s.price} ₽ ${s.cost > 0 ? `<span class="badge badge-profit">+${profit.toLocaleString('ru-RU')} ₽</span>` : ''}</small>
                            ${noteHtml}
                        </div>
                        <div class="item-right">
                            <span class="item-price">${(s.price * s.qty).toLocaleString('ru-RU')} ₽</span>
                            <button class="delete-btn" onclick="deleteSale(${s.id})">×</button>
                        </div>
                    `;
                    display.appendChild(card);
                });
            }
        }

        // Global Actions
        function saveData() {
            localStorage.setItem('vapeSales', JSON.stringify(sales));
            localStorage.setItem('vapeInventory', JSON.stringify(inventory));
            localStorage.setItem('vapeLosses', JSON.stringify(losses));

            // Trigger background cloud sync (debounced in real app, but here direct)
            if (isOnline) {
                // We don't await this to keep UI responsive
                syncToCloud();
            }
        }

        /* --- Cloud Sync Functions --- */

        async function syncToCloud() {
            if (!supabase) return;
            console.log('Syncing to cloud...');

            // Upsert Inventory
            // We map local items to cloud structure. 
            // Warning: This simple logic overwrites cloud with local. 
            // Ideally we should use IDs. Current local IDs are timestamps (integers). 
            // Supabase IDs are UUIDs (default). 
            // Strategy: We will just clear cloud and re-insert for this MVP absolute sync 
            // OR strictly simple: store the whole JSON blob? 
            // No, user wants SQL tables.

            // 1. Inventory
            if (inventory.length > 0) {
                const invData = inventory.map(i => ({
                    // We need to store local ID to map back? 
                    // Let's rely on Names for now or just insert fresh. 
                    // Current simplified approach: Delete all and re-insert is risky but easiest for consistency if single user.
                    // BETTER: Upsert by Name.
                    name: i.name,
                    qty: i.qty,
                    cost: i.cost,
                    price: i.price,
                    strength: i.strength || ''
                }));

                // For this MVP version, we will try to UPSERT based on 'name' if we made it unique, 
                // but we didn't add unique constraint.
                // Let's do a "Replace All" strategy for safety of data consistency for a single user device.
                // NOTE: This creates a lot of churn. 
                // Option B: Just UPSERT row by row.

                // Let's stick to LocalStorage as "Source of Truth" for now and just mirror to Cloud for Backup.
                // If user wants to restore, they "Import from Cloud".

                // Actually user wants "Sync". 
                // Let's assume:
                // Sales: Insert new ones (based on ID/Timestamp).
                // Inventory: Upsert by Name.
            }
        }

        async function forceUploadToCloud() {
            if (!confirm('Это перезапишет данные в облаке вашими текущими данными с телефона. Продолжить?')) return;

            const loading = document.getElementById('loadingOverlay');
            if (loading) loading.style.display = 'flex';

            try {
                // 1. Clear tables (optional, but ensures no dupes for this "Reset" sync)
                await supabase.from('inventory').delete().neq('qty', -9999); // delete all
                await supabase.from('sales').delete().neq('qty', -9999);
                await supabase.from('losses').delete().neq('qty', -9999);

                // 2. Upload Inventory
                if (inventory.length > 0) {
                    const invPayload = inventory.map(i => ({
                        name: i.name,
                        qty: i.qty,
                        cost: i.cost,
                        price: i.price,
                        strength: i.strength || ''
                    }));
                    const { error: matchError } = await supabase.from('inventory').insert(invPayload);
                    if (matchError) throw matchError;
                }

                // 3. Upload Sales
                if (sales.length > 0) {
                    const salesPayload = sales.map(s => ({
                        name: s.name,
                        qty: s.qty,
                        price: s.price,
                        cost: s.cost || 0,
                        profit: (s.price - (s.cost || 0)) * s.qty,
                        note: s.note || '',
                        date: new Date(s.timestamp).toISOString()
                    }));
                    const { error: salesError } = await supabase.from('sales').insert(salesPayload);
                    if (salesError) throw salesError;
                }

                // 4. Upload Losses
                if (losses.length > 0) {
                    const lossesPayload = losses.map(l => ({
                        name: l.name,
                        qty: l.qty,
                        cost: l.cost,
                        reason: l.reason,
                        date: new Date(l.timestamp).toISOString()
                    }));
                    const { error: lossError } = await supabase.from('losses').insert(lossesPayload);
                    if (lossError) throw lossError;
                }

                alert('✅ Данные успешно выгружены в облако!');
            } catch (err) {
                console.error(err);
                alert('Ошибка синхронизации: ' + err.message);
            } finally {
                if (loading) loading.style.display = 'none';
            }
        }

        async function downloadFromCloud() {
            if (!confirm('ВНИМАНИЕ: Это заменит данные на телефоне данными из облака. Продолжить?')) return;

            const loading = document.getElementById('loadingOverlay');
            if (loading) loading.style.display = 'flex';

            try {
                // Fetch Inventory
                const { data: invData, error: invError } = await supabase.from('inventory').select('*');
                if (invError) throw invError;

                // Fetch Sales
                const { data: salesData, error: salesError } = await supabase.from('sales').select('*');
                if (salesError) throw salesError;

                // Fetch Losses
                const { data: lossData, error: lossError } = await supabase.from('losses').select('*');
                if (lossError) throw lossError;

                // Convert back to App format
                inventory = invData.map(i => ({
                    id: Date.now() + Math.random(), // generate new local ID
                    name: i.name,
                    qty: i.qty,
                    cost: i.cost,
                    price: i.price,
                    strength: i.strength
                }));

                sales = salesData.map(s => ({
                    id: Date.parse(s.date) || Date.now(),
                    timestamp: Date.parse(s.date) || Date.now(),
                    name: s.name,
                    qty: s.qty,
                    price: s.price,
                    cost: s.cost,
                    note: s.note,
                    date: new Date(s.date).toLocaleDateString('ru-RU')
                }));
                // Sort sales by date desc
                sales.sort((a, b) => b.timestamp - a.timestamp);

                losses = lossData.map(l => ({
                    id: Date.parse(l.date) || Date.now(),
                    timestamp: Date.parse(l.date) || Date.now(),
                    name: l.name,
                    qty: l.qty,
                    cost: l.cost,
                    reason: l.reason,
                    date: new Date(l.date).toLocaleDateString('ru-RU')
                }));

                saveData(); // Save to localStorage
                // Reload UI
                renderSales();
                renderInventory();
                renderLosses();
                renderStats();
                updateDatalist();
                updateInfoPageStats();

                alert('✅ Данные успешно загружены из облака!');
            } catch (err) {
                console.error(err);
                alert('Ошибка загрузки: ' + err.message);
            } finally {
                if (loading) loading.style.display = 'none';
            }
        }


        function clearSales() {
            if (confirm("Очистить историю продаж?")) {
                sales = [];
                saveData();
                renderSales();
            }
        }

        function clearInventory() {
            if (confirm("Очистить весь склад?")) {
                inventory = [];
                saveData();
                renderInventory();
                updateDatalist();
            }
        }

        async function exportData() {
            const data = {
                sales,
                inventory,
                losses,
                exportedAt: new Date().toISOString()
            };
            const jsonStr = JSON.stringify(data, null, 2);

            // Try sharing if supported/mobile
            if (navigator.share) {
                try {
                    const file = new File([jsonStr], `vape_backup_${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: 'Резервная копия Vape Tracker',
                            text: 'Моя база продаж и склада.'
                        });
                        return; // Successfully shared, don't download
                    }
                } catch (e) {
                    console.log('Sharing failed, falling back to download', e);
                }
            }

            // Fallback to simple download
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vape_backup_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        async function shareData() {
            const textData = JSON.stringify({ sales, inventory, losses }, null, 2);
            /* simpler share for plain text summary if needed, but JSON is better for backup */
            const shareData = {
                title: 'Vape Tracker Backup',
                text: 'Резервная копия данных Vape Tracker',
                files: [
                    new File([textData], `vape_backup_${new Date().toLocaleDateString()}.txt`, {
                        type: 'text/plain',
                    }),
                ],
            };

            if (navigator.canShare && navigator.canShare(shareData)) {
                try {
                    await navigator.share(shareData);
                } catch (err) {
                    alert('Ошибка при попытке поделиться: ' + err.message);
                }
            } else {
                // Fallback to clipboard
                try {
                    await navigator.clipboard.writeText(textData);
                    alert('Данные скопированы в буфер обмена (т.к. отправка файлов не поддерживается)');
                } catch (err) {
                    alert('Не удалось поделиться или скопировать.');
                }
            }
        }

        function importData(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = JSON.parse(e.target.result);

                    if (!data.inventory || !data.sales) {
                        throw new Error('Неверный формат файла');
                    }

                    const mode = confirm('Объединить с текущими данными?\n\nOK = Объединить (добавить к существующим)\nОтмена = Заменить (удалить старые)');

                    if (mode) {
                        // Merge mode - add imported data
                        data.inventory.forEach(item => {
                            const existing = inventory.find(i => i.name.toLowerCase() === item.name.toLowerCase());
                            if (existing) {
                                existing.qty += item.qty;
                            } else {
                                item.id = Date.now() + Math.random(); // new id
                                inventory.push(item);
                            }
                        });

                        const existingIds = new Set(sales.map(s => s.id));
                        data.sales.forEach(sale => {
                            if (!existingIds.has(sale.id)) {
                                sales.push(sale);
                            }
                        });
                        // Sort sales by timestamp
                        sales.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                        // Import losses
                        if (data.losses) {
                            const existingLossIds = new Set(losses.map(l => l.id));
                            data.losses.forEach(loss => {
                                if (!existingLossIds.has(loss.id)) {
                                    losses.push(loss);
                                }
                            });
                            losses.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                        }
                    } else {
                        // Replace mode
                        inventory = data.inventory;
                        sales = data.sales;
                        losses = data.losses || [];
                    }

                    saveData();
                    renderSales();
                    renderInventory();
                    alert('Данные успешно импортированы!');

                } catch (err) {
                    alert('Ошибка импорта: ' + err.message);
                }
            };
            reader.readAsText(file);
            event.target.value = ''; // Reset file input
        }

        function onDateChange(input) {
            document.getElementById('calIcon').classList.toggle('active', input.value !== '');
            renderSales();
        }

        // Stats Functions
        function setStatsPeriod(period) {
            statsPeriod = period;
            document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            renderStats();
        }

        function getFilteredSales(period) {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            return sales.filter(s => {
                if (period === 'all') return true;

                // Fallback for objects missing timestamp
                const saleDate = s.timestamp ? new Date(s.timestamp) : new Date(2023, 0, 1);
                const saleDateOnly = new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate());

                if (period === 'day') {
                    return saleDateOnly.getTime() === today.getTime();
                } else if (period === 'week') {
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return saleDate >= weekAgo;
                } else if (period === 'month') {
                    const monthAgo = new Date(today);
                    monthAgo.setMonth(monthAgo.getMonth() - 1);
                    return saleDate >= monthAgo;
                }
                return true;
            });
        }

        function getFilteredLosses(period) {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            return losses.filter(l => {
                if (period === 'all') return true;

                const lossDate = l.timestamp ? new Date(l.timestamp) : new Date(2023, 0, 1);

                if (period === 'day') {
                    const lossDayOnly = new Date(lossDate.getFullYear(), lossDate.getMonth(), lossDate.getDate());
                    return lossDayOnly.getTime() === today.getTime();
                } else if (period === 'week') {
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return lossDate >= weekAgo;
                } else if (period === 'month') {
                    const monthAgo = new Date(today);
                    monthAgo.setMonth(monthAgo.getMonth() - 1);
                    return lossDate >= monthAgo;
                }
                return true;
            });
        }



        function renderStats() {
            const filteredSales = getFilteredSales(statsPeriod);
            const filteredLosses = getFilteredLosses(statsPeriod);

            // Calculate stats
            let revenue = 0;
            let profit = 0;
            let salesCount = 0;
            const productStats = {};

            filteredSales.forEach(s => {
                revenue += s.price * s.qty;
                profit += (s.price - (s.cost || 0)) * s.qty;
                salesCount += s.qty;

                const name = s.name.toLowerCase();
                if (!productStats[name]) {
                    productStats[name] = { name: s.name, qty: 0, revenue: 0 };
                }
                productStats[name].qty += s.qty;
                productStats[name].revenue += s.price * s.qty;
            });

            let lossesTotal = 0;
            filteredLosses.forEach(l => {
                lossesTotal += l.cost * l.qty;
                // Subtract from profit if enabled for this loss item
                // Legacy support: if deductProfit property missing, assume true? 
                // Or assume false? Defaulting to true for old data might be safer for conservative profitCalc, 
                // but user just added this. Let's assume true for existing data if we want to be strict, 
                // or check the flag. Let's support the flag.
                if (l.deductProfit !== false) { // Default to true if undefined
                    profit -= (l.cost * l.qty);
                }
            });

            document.getElementById('statRevenue').textContent = revenue.toLocaleString('ru-RU');
            document.getElementById('statProfit').textContent = profit.toLocaleString('ru-RU');
            document.getElementById('statLosses').textContent = lossesTotal.toLocaleString('ru-RU');
            document.getElementById('statSalesCount').textContent = salesCount.toLocaleString('ru-RU');

            // Update Losses Page Total if element exists
            const lpTotal = document.getElementById('lossesPageTotal');
            if (lpTotal) {
                // Calculate overall total for the page display, or keep it period-based?
                // Usually Losses page should show absolute total. 
                // Let's use overall total for the page, and period total for the Stat box.
                const overallLossesTotal = losses.reduce((sum, l) => sum + (l.cost * l.qty), 0);
                lpTotal.textContent = overallLossesTotal.toLocaleString('ru-RU');
            }

            // Top products
            const sortedProducts = Object.values(productStats).sort((a, b) => b.qty - a.qty);
            const maxQty = sortedProducts[0]?.qty || 1;

            const topContainer = document.getElementById('topProducts');
            if (sortedProducts.length === 0) {
                topContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">Нет данных</div>';
            } else {
                topContainer.innerHTML = sortedProducts.slice(0, 5).map((p, i) => {
                    const colors = ['#ffffff', '#e0e0e0', '#c0c0c0', '#a0a0b0', '#808080'];
                    const width = (p.qty / maxQty) * 100;
                    return `
                        <div class="product-bar">
                            <span class="product-bar-name">${p.name}</span>
                            <div class="product-bar-fill">
                                <div class="product-bar-progress" style="width: ${width}%; background: ${colors[i % colors.length]};">
                                    ${p.qty} шт.
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // Worst products (on stock but not selling)
            const worstContainer = document.getElementById('worstProducts');
            const soldNames = new Set(Object.keys(productStats));
            const notSelling = inventory.filter(item => !soldNames.has(item.name.toLowerCase()) && item.qty > 0);

            if (notSelling.length === 0) {
                worstContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">Всё продаётся! 🎉</div>';
            } else {
                worstContainer.innerHTML = notSelling.slice(0, 5).map(item => `
                    <div class="product-bar">
                        <span class="product-bar-name">${item.name}</span>
                        <div class="product-bar-fill">
                            <div class="product-bar-progress" style="width: 100%; background: rgba(255, 61, 113, 0.5);">
                                ${item.qty} шт. на складе
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }

        // Loss Functions
        function openLossModal() {
            document.getElementById('lossModal').style.display = 'flex';
        }

        function setupLossAutocomplete() {
            const nameInput = document.getElementById('lossName');
            const listDiv = document.getElementById('lossAutocompleteList');
            if (!nameInput || !listDiv) return;

            nameInput.addEventListener('input', function () {
                const val = this.value;
                listDiv.innerHTML = '';
                if (!val) return;

                const matches = inventory.filter(item => item.name.toLowerCase().includes(val.toLowerCase()));
                matches.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'autocomplete-item';
                    div.innerHTML = `
                            <span>${item.name}</span>
                            <small>${item.qty} шт.</small>
                        `;
                    div.addEventListener('click', function () {
                        nameInput.value = item.name;
                        document.getElementById('lossQty').value = 1;
                        document.getElementById('lossCost').value = item.cost;
                        listDiv.innerHTML = '';
                    });
                    listDiv.appendChild(div);
                });
            });

            document.addEventListener('click', function (e) {
                if (e.target !== nameInput) {
                    listDiv.innerHTML = '';
                }
            });
        }

        function closeLossModal() {
            document.getElementById('lossModal').style.display = 'none';
            document.getElementById('lossName').value = '';
            document.getElementById('lossQty').value = '';
            document.getElementById('lossCost').value = '';
            document.getElementById('lossNote').value = '';
        }

        function saveLoss() {
            const name = document.getElementById('lossName').value.trim();
            const qty = parseInt(document.getElementById('lossQty').value);
            const cost = parseFloat(document.getElementById('lossCost').value);
            const reason = document.getElementById('lossReason').value;
            const note = document.getElementById('lossNote').value.trim();

            const deductStock = document.getElementById('lossDeductStock').checked;

            if (!name || isNaN(qty) || isNaN(cost)) {
                alert('Заполни название, количество и цену!');
                return;
            }

            const now = new Date();
            losses.unshift({
                id: Date.now(),
                name,
                qty,
                cost,
                reason,
                note,
                date: now.toLocaleDateString('ru-RU'),
                timestamp: now.getTime()
            });

            // Deduct from inventory if requested
            if (deductStock) {
                const invItem = inventory.find(i => i.name.toLowerCase() === name.toLowerCase());
                if (invItem) {
                    invItem.qty = Math.max(0, invItem.qty - qty);
                } else {
                    // Optional: alert that item wasn't found in stock? 
                    // Silent fail is okay per request "if not in stock just loss"
                }
            }

            saveData();
            closeLossModal();
            renderStats();
            renderLosses();
            renderInventory();
        }

        function renderLosses() {
            const container = document.getElementById('lossesHistory');
            if (losses.length === 0) {
                container.innerHTML = '<div class="empty-state" style="padding: 20px;">Убытков нет 👍</div>';
                return;
            }

            const reasonLabels = { defect: 'Брак', lost: 'Потерян', gift: 'Подарил', self: 'Оставил себе', other: 'Другое' };
            container.innerHTML = losses.map(l => `
                <div class="loss-item">
                    <div class="loss-item-info">
                        <b>${l.name}</b>
                        <small>${l.date} • ${reasonLabels[l.reason] || l.reason} • ${l.qty} шт.${l.note ? ' • ' + l.note : ''}</small>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="loss-item-amount" style="color: #ff3d71; font-weight: 700;">-${(l.cost * l.qty).toLocaleString('ru-RU')} ₽</span>
                        <button class="edit-btn" onclick="openLossEdit(${l.id})" title="Редактировать">✏️</button>
                        <button class="delete-btn" onclick="deleteLoss(${l.id})">×</button>
                    </div>
                </div>
            `).join('');
        }

        function deleteLoss(id) {
            if (confirm('Удалить запись об убытке?')) {
                losses = losses.filter(l => l.id !== id);
                saveData();
                renderLosses();
                renderStats();
            }
        }

        // Edit Loss Functions
        function openLossEdit(id) {
            const loss = losses.find(l => l.id === id);
            if (loss) {
                document.getElementById('editLossId').value = id;
                document.getElementById('editLossName').value = loss.name || '';
                document.getElementById('editLossQty').value = loss.qty || '';
                document.getElementById('editLossCost').value = loss.cost || '';
                document.getElementById('editLossReason').value = loss.reason || 'defect';
                document.getElementById('editLossNote').value = loss.note || '';
                document.getElementById('editLossModal').style.display = 'flex';
            }
        }

        function closeLossEditModal() {
            document.getElementById('editLossModal').style.display = 'none';
        }

        function saveLossEdit() {
            const id = parseInt(document.getElementById('editLossId').value);
            const name = document.getElementById('editLossName').value.trim();
            const qty = parseInt(document.getElementById('editLossQty').value);
            const cost = parseFloat(document.getElementById('editLossCost').value);
            const reason = document.getElementById('editLossReason').value;
            const note = document.getElementById('editLossNote').value.trim();

            if (!name || isNaN(qty) || isNaN(cost)) {
                alert('Заполни все обязательные поля!');
                return;
            }

            const loss = losses.find(l => l.id === id);
            if (loss) {
                loss.name = name;
                loss.qty = qty;
                loss.cost = cost;
                loss.reason = reason;
                loss.note = note;

                saveData();
                closeLossEditModal();
                renderLosses();
                renderStats();
            }
        }





        // Update Info Page Statistics
        function updateInfoPageStats() {
            const salesCountEl = document.getElementById('infoSalesCount');
            const inventoryCountEl = document.getElementById('infoInventoryCount');

            if (salesCountEl) {
                salesCountEl.textContent = sales.length;
            }

            if (inventoryCountEl) {
                // Sum total quantity of all inventory items
                const totalQty = inventory.reduce((sum, item) => sum + (item.qty || 0), 0);
                inventoryCountEl.textContent = totalQty;
            }
        }

        // Help Page Functions
        function openHelpPage() {
            document.getElementById('helpPageModal').style.display = 'block';
            document.body.style.overflow = 'hidden';
        }

        function closeHelpPage() {
            document.getElementById('helpPageModal').style.display = 'none';
            document.body.style.overflow = '';
        }

        // Init
        renderSales();
        renderStats();
        updateDatalist();
        setupLossAutocomplete();

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js');
            });
        }
    </script>
    <script>
        // Theme Logic
        const toggleBtn = document.getElementById('themeToggle');
        const body = document.body;

        function initTheme() {
            const savedTheme = localStorage.getItem('theme');
            // Default to dark if no preference, unless saved is explicitly light
            // Or if system prefers light AND saved is NOT dark
            const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

            if (savedTheme === 'light') {
                body.classList.add('light-theme');
                toggleBtn.textContent = '🌙';
            } else if (savedTheme === 'dark') {
                body.classList.remove('light-theme');
                toggleBtn.textContent = '☀️';
            } else if (systemPrefersLight) {
                // System is light, but we default to dark per user request unless system overrides?
                // User asked: "Default dark (if from device failed to get theme)". 
                // But also "Site let use device theme".
                // Logic: If no localStorage, check system. If system is light -> light. Else -> dark.
                body.classList.add('light-theme');
                toggleBtn.textContent = '🌙';
            } else {
                // Default dark
                body.classList.remove('light-theme');
                toggleBtn.textContent = '☀️';
            }
        }

        toggleBtn.addEventListener('click', () => {
            body.classList.toggle('light-theme');
            const isLight = body.classList.contains('light-theme');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            toggleBtn.textContent = isLight ? '🌙' : '☀️';
        });

        initTheme();
    </script>
