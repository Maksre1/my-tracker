// CRITICAL SECURITY: Firebase Auth Check
// Only allow access if user is authenticated via Firebase
// This runs immediately before any app logic
if (!window.auth || !window.auth.currentUser) {
    // Wait briefly for Firebase to initialize
    setTimeout(() => {
        if (!window.auth || !window.auth.currentUser) {
            console.warn('No Firebase Auth session - redirecting to login');
            window.location.href = 'login.html';
        }
    }, 500);
}


// Data State
let sales = JSON.parse(localStorage.getItem('vapeSales')) || [];
let inventory = JSON.parse(localStorage.getItem('vapeInventory')) || [];
let losses = JSON.parse(localStorage.getItem('vapeLosses')) || [];
let debts = JSON.parse(localStorage.getItem('vapeDebts')) || [];
let notes = JSON.parse(localStorage.getItem('vapeNotes')) || [];
let financialGoal = parseInt(localStorage.getItem('vapeFinancialGoal')) || 0;

// Loading animation
window.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        setTimeout(() => {
            overlay.classList.add('hidden');
            setTimeout(() => overlay.remove(), 400);
        }, 800);
    }
});

// Hide loading overlay manually if it gets stuck
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => overlay.remove(), 400);
    }
}

function updateDatalist() {
    console.log('Datalist updated');
}

let sortType = localStorage.getItem('vapeSortType') || 'date';
let sortDir = localStorage.getItem('vapeSortDir') || 'desc';
let statsPeriod = 'day';

let lastAddedSignature = '';
let lastAddedTime = 0;

let pendingInventoryItem = null;
let vapeDontAskMerge = localStorage.getItem('vapeDontAskMerge') === 'true';

// Loading animation (handled in index.html, but keep empty listener or logic here if needed)

// Tab Switching
let isSwitching = false;

function switchTab(tabName) {
    if (isSwitching) return;
    triggerHaptic('light');

    const tabs = document.querySelectorAll('.tab');
    let targetTab = null;
    tabs.forEach(t => {
        if (t.getAttribute('onclick').includes(`'${tabName}'`)) {
            targetTab = t;
        }
    });

    const currentTab = document.querySelector('.tab.active');
    if (currentTab === targetTab) return;

    isSwitching = true;

    tabs.forEach(t => t.classList.remove('active'));
    if (targetTab) targetTab.classList.add('active');

    let targetPageId = 'salesPage';
    if (tabName === 'inventory') targetPageId = 'inventoryPage';
    else if (tabName === 'debts') targetPageId = 'debtsPage';
    else if (tabName === 'losses') targetPageId = 'lossesPage';
    else if (tabName === 'stats') targetPageId = 'statsPage';
    else if (tabName === 'data') targetPageId = 'dataPage';

    const targetPage = document.getElementById(targetPageId);
    const activePage = document.querySelector('.page.active');

    const renderData = () => {
        if (tabName === 'sales') renderSales();
        else if (tabName === 'inventory') renderInventory();
        else if (tabName === 'debts') renderDebts();
        else if (tabName === 'losses') renderLosses();
        else if (tabName === 'stats') renderStats();
        else if (tabName === 'data') updateInfoPageStats();
    };

    if (activePage) {
        activePage.classList.remove('active');
        setTimeout(() => {
            activePage.style.display = 'none';
            window.scrollTo(0, 0);
            renderData();
            targetPage.style.display = 'block';
            void targetPage.offsetWidth;
            targetPage.classList.add('active');
            isSwitching = false;
        }, 300);
    } else {
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

        const cardMarkup = `
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
        const wrapper = createSwipeWrapper(cardMarkup, () => deleteInventory(item.id));
        display.appendChild(wrapper);
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
    triggerHaptic('light');
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
            div.innerHTML = `
                <div style="display: flex; flex-direction: column;">
                    <b>${item.name}</b>
                    <small style="opacity: 0.6; font-size: 10px;">${item.strength || ''}</small>
                </div>
                <div style="text-align: right;">
                    <div style="color: var(--accent-color); font-weight: bold;">${item.price || 0} ₽</div>
                    <small style="opacity: 0.5;">${item.qty} шт.</small>
                </div>
            `;
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';

            div.onclick = () => {
                input.value = item.name;
                document.getElementById('salePrice').value = item.price || '';
                const qtyInput = document.getElementById('saleQty');
                if (!qtyInput.value) qtyInput.value = 1;
                list.style.display = 'none';
            };
            list.appendChild(div);
        });
        list.style.display = 'block';
    } else {
        list.style.display = 'none';
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-container')) {
        const list = document.getElementById('autocompleteList');
        if (list) list.style.display = 'none';
    }
});

function toggleDateInput() {
    const useDate = document.getElementById('useDate').checked;
    document.getElementById('manualDateContainer').style.display = useDate ? 'none' : 'block';
}

function toggleCustomerInput() {
    const isDebt = document.getElementById('isDebt').checked;
    const showBuyer = document.getElementById('showBuyer').checked;
    document.getElementById('debtorNameContainer').style.display = (isDebt || showBuyer) ? 'flex' : 'none';
}

function toggleDebtColor() {
    const isDebt = document.getElementById('isDebt').checked;
    const btn = document.getElementById('addSaleBtn');
    if (isDebt) {
        btn.style.background = 'linear-gradient(135deg, #ff9800, #f57c00)';
        btn.innerText = 'В ДОЛГ';
    } else {
        btn.style.background = '';
        btn.innerText = 'ПРОДАТЬ';
    }
}

function addSale() {
    const name = document.getElementById('saleName').value.trim();
    const qty = parseInt(document.getElementById('saleQty').value);
    const price = parseFloat(document.getElementById('salePrice').value);
    const useDate = document.getElementById('useDate').checked;
    const manualDate = document.getElementById('saleDate').value;
    const isDebt = document.getElementById('isDebt').checked;
    const debtorName = document.getElementById('debtorName').value.trim();
    const debtorContact = document.getElementById('debtorContact').value.trim();
    const debtorSocial = document.getElementById('debtorSocial').value.trim();
    const saleNote = document.getElementById('saleNote').value.trim();

    if (!name || isNaN(qty) || isNaN(price)) {
        alert("Заполни поля продажи!");
        return;
    }

    if (isDebt && !debtorName) {
        alert("Введите имя должника!");
        return;
    }

    const currentSignature = `${name}|${qty}|${price}`;
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
        isDebt,
        debtor: debtorName || null,
        contact: debtorContact || null,
        social: debtorSocial || null,
        note: saleNote || null
    };

    if (isDebt) {
        debts.unshift(sale);
        saveData(`Добавлен долг: ${debtorName} (${name})`);
        showToast("Долг записан 🤝");
    } else {
        sales.unshift(sale);
        saveData(`Продажа: ${name}`);
        showToast("Продано! 💸");
    }

    lastAddedSignature = currentSignature;
    lastAddedTime = timeNow;

    saveData();
    renderSales();
    renderDebts();
    renderInventory();
    updateDatalist();

    document.getElementById('saleName').value = '';
    document.getElementById('saleQty').value = '';
    document.getElementById('salePrice').value = '';
    document.getElementById('saleNote').value = '';
    document.getElementById('isDebt').checked = false;
    document.getElementById('showBuyer').checked = false;
    document.getElementById('debtorNameContainer').style.display = 'none';
    document.getElementById('debtorName').value = '';
    document.getElementById('debtorContact').value = '';
    document.getElementById('debtorSocial').value = '';
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

    if (!name || isNaN(qty) || isNaN(price)) {
        alert('Заполните все поля!');
        return;
    }

    const sale = sales.find(s => s.id === id);
    if (sale) {
        sale.name = name;
        sale.qty = qty;
        sale.price = price;
        sale.note = document.getElementById('editSaleNote').value.trim() || null;
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

    // Update Goal Progress
    updateGoalUI(totalRev);

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

            const container = document.createElement('div');
            group.items.forEach(s => {
                const profit = (s.price - s.cost) * s.qty;
                const cardMarkup = `
                            <div class="item-info">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <b>${s.name}</b>
                                    <button class="edit-btn" onclick="openSaleEdit(${s.id})">✎</button>
                                </div>
                                <small>${sortType === 'profit_day' ? s.date + ' • ' : ''}${s.qty} шт. × ${s.price} ₽ ${s.cost > 0 ? `<span class="badge badge-profit">+${profit.toLocaleString('ru-RU')} ₽</span>` : ''}</small>
                                ${s.debtor ? `<div style="font-size: 10px; margin-top: 4px; color: var(--accent-color); opacity: 0.8;">👤 ${s.debtor}${s.contact || s.social ? ` • ${[s.contact, s.social].filter(x => x).join(' / ')}` : ''}</div>` : ''}
                                ${s.note ? `<div style="font-size: 10px; margin-top: 2px; opacity: 0.6; font-style: italic;">📝 ${s.note}</div>` : ''}
                            </div>
                            <div class="item-right">
                                <span class="item-price">${(s.price * s.qty).toLocaleString('ru-RU')} ₽</span>
                                <button class="delete-btn" onclick="deleteSale(${s.id})">×</button>
                            </div>
                        `;
                const wrapper = createSwipeWrapper(cardMarkup,
                    () => deleteSale(s.id),
                    () => openSaleEdit(s.id),
                    'Удалить', 'Изменить'
                );
                container.appendChild(wrapper);
            });
            div.innerHTML = html;
            div.appendChild(container);
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
            const cardMarkup = `
                        <div class="item-info">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <b>${s.name}</b>
                                <button class="edit-btn" onclick="openSaleEdit(${s.id})">✎</button>
                            </div>
                            <small>${s.date} • ${s.qty} шт. × ${s.price} ₽ ${s.cost > 0 ? `<span class="badge badge-profit">+${profit.toLocaleString('ru-RU')} ₽</span>` : ''}</small>
                            ${s.debtor ? `<div style="font-size: 10px; margin-top: 4px; color: var(--accent-color); opacity: 0.8;">👤 ${s.debtor}${s.contact || s.social ? ` • ${[s.contact, s.social].filter(x => x).join(' / ')}` : ''}</div>` : ''}
                            ${s.note ? `<div style="font-size: 10px; margin-top: 2px; opacity: 0.6; font-style: italic;">📝 ${s.note}</div>` : ''}
                        </div>
                        <div class="item-right">
                            <span class="item-price">${(s.price * s.qty).toLocaleString('ru-RU')} ₽</span>
                            <button class="delete-btn" onclick="deleteSale(${s.id})">×</button>
                        </div>
                    `;
            const wrapper = createSwipeWrapper(cardMarkup, () => deleteSale(s.id), () => openSaleEdit(s.id), 'Удалить', 'Изменить');
            display.appendChild(wrapper);
        });
    }
}

// Debts Logic
function renderDebts() {
    const display = document.getElementById('debtsDisplay');
    const totalSumEl = document.getElementById('totalDebtsSum');
    display.innerHTML = '';

    let totalSum = 0;
    debts.forEach(d => totalSum += (d.price * d.qty));
    totalSumEl.textContent = totalSum.toLocaleString('ru-RU');

    if (debts.length === 0) {
        display.innerHTML = '<div class="empty-state">Долгов нет 🎉</div>';
        return;
    }

    debts.forEach(d => {
        const markup = `
                    <div class="item-info">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <b style="color: #ff9800;">${d.debtor}</b>
                            <span class="badge badge-debt" style="font-size: 10px;">ДОЛГ</span>
                        </div>
                        <small>${d.name} (${d.qty} шт.) • ${d.date}</small>
                        ${d.contact ? `<div style="font-size: 10px; margin-top: 4px; opacity: 0.7;">📞 ${d.contact}</div>` : ''}
                    </div>
                    <div class="item-right" style="flex-direction: row; gap: 10px; align-items: center;">
                        <span class="item-price" style="color: #ff9800;">${(d.price * d.qty).toLocaleString('ru-RU')} ₽</span>
                        <div style="display: flex; gap: 5px;">
                            <button class="qty-btn" style="background: rgba(0, 240, 170, 0.2); color: var(--success-color); border: 1px solid var(--success-color);" onclick="manageDebt(${d.id}, 'paid')">✓</button>
                            <button class="qty-btn" style="background: rgba(255, 59, 48, 0.2); color: var(--danger-color); border: 1px solid var(--danger-color);" onclick="manageDebt(${d.id}, 'forgive')">×</button>
                        </div>
                    </div>
                `;
        const wrapper = createSwipeWrapper(markup,
            () => manageDebt(d.id, 'forgive'),
            () => manageDebt(d.id, 'paid'),
            'Простить', 'Оплачено'
        );
        display.appendChild(wrapper);
    });
}

function manageDebt(id, action) {
    const debt = debts.find(d => d.id === id);
    if (!debt) return;

    if (action === 'paid') {
        if (confirm(`Подтвердить оплату долга от ${debt.debtor}?`)) {
            debts = debts.filter(d => d.id !== id);
            debt.isDebt = false;
            debt.debtor = null;
            sales.unshift(debt);
            saveData(`Долг оплачен: ${debt.debtor} (${debt.name})`);
            showToast("Оплата принята! 💸");
            renderDebts();
            renderSales();
        }
    } else if (action === 'forgive') {
        if (confirm(`Вы действительно хотите ПРОСТИТЬ долг ${debt.debtor}? Сумма уйдет в убытки.`)) {
            debts = debts.filter(d => d.id !== id);
            const lossItem = {
                id: Date.now(),
                name: `Прощенный долг: ${debt.debtor} (${debt.name})`,
                cost: (debt.price * debt.qty), // Forgiving full retail amount as loss
                qty: 1,
                date: new Date().toLocaleDateString('ru-RU'),
                reason: 'Прощенный долг'
            };
            losses.unshift(lossItem);
            saveData(`Долг прощен: ${debt.debtor}`);
            showToast("Долг прощен 📉");
            renderDebts();
            renderLosses();
        }
    }
}

// Swipe Functionality
function createSwipeWrapper(innerMarkup, onSwipeLeft, onSwipeRight, leftLabel = "Удалить", rightLabel = "Действие") {
    const wrapper = document.createElement('div');
    wrapper.className = 'item-card-wrapper';

    const leftAction = document.createElement('div');
    leftAction.className = 'swipe-action left';
    leftAction.innerHTML = `<span>${leftLabel}</span>`;

    const rightAction = document.createElement('div');
    rightAction.className = 'swipe-action right';
    rightAction.innerHTML = `<span>${rightLabel}</span>`;

    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = innerMarkup;

    wrapper.appendChild(leftAction);
    wrapper.appendChild(rightAction);
    wrapper.appendChild(card);

    // Swipe Logic
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;
    const threshold = 100;

    card.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isSwiping = true;
        card.style.transition = 'none';
        triggerHaptic('light');
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        currentX = e.touches[0].clientX - startX;

        // Resistance
        if (Math.abs(currentX) > 150) currentX = currentX > 0 ? 150 + (currentX - 150) * 0.2 : -150 + (currentX + 150) * 0.2;

        card.style.transform = `translateX(${currentX}px)`;

        // Show appropriate swipe action
        if (currentX > 10) {
            rightAction.style.opacity = '1';
            leftAction.style.opacity = '0';
        } else if (currentX < -10) {
            leftAction.style.opacity = '1';
            rightAction.style.opacity = '0';
        } else {
            leftAction.style.opacity = '0';
            rightAction.style.opacity = '0';
        }
    }, { passive: true });

    card.addEventListener('touchend', () => {
        isSwiping = false;
        card.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

        if (currentX > threshold && onSwipeRight) {
            card.style.transform = 'translateX(100%)';
            setTimeout(() => {
                onSwipeRight();
                if (card.parentElement) card.style.transform = 'translateX(0)';
            }, 300);
        } else if (currentX < -threshold && onSwipeLeft) {
            card.style.transform = 'translateX(-100%)';
            setTimeout(() => {
                onSwipeLeft();
                if (card.parentElement) card.style.transform = 'translateX(0)';
            }, 300);
        } else {
            card.style.transform = 'translateX(0)';
        }

        // Hide swipe actions
        leftAction.style.opacity = '0';
        rightAction.style.opacity = '0';

        currentX = 0;
    });

    return wrapper;
}

// Global Actions
async function saveData(lastAction = null) {
    // Local save (fallback)
    const now = Date.now();
    localStorage.setItem('vapeSales', JSON.stringify(sales));
    localStorage.setItem('vapeInventory', JSON.stringify(inventory));
    localStorage.setItem('vapeLosses', JSON.stringify(losses));
    localStorage.setItem('vapeDebts', JSON.stringify(debts));
    localStorage.setItem('vapeNotes', JSON.stringify(notes));
    localStorage.setItem('vapeFinancialGoal', financialGoal);
    localStorage.setItem('vapeLastUpdate', now);

    // Cloud save - only if authenticated
    // Check if connected to cloud
    const authUser = window.auth ? window.auth.currentUser : (window.firebaseAuth ? window.firebaseAuth.currentUser : null);

    if (window.firebaseDB && authUser) {
        try {
            const docRef = firebaseDoc(window.firebaseDB, "tracker", "mainData");

            // Get current audit log to append to it, rather than overwriting
            // We optimized this read: only needed if we are adding an audit log entry
            let auditLog = [];
            if (lastAction) {
                try {
                    const snap = await firebaseGetDoc(docRef);
                    if (snap.exists() && snap.data().auditLog) {
                        auditLog = snap.data().auditLog;
                    }
                } catch (e) { console.warn("Could not fetch old audit log", e); }

                const device = navigator.userAgent.includes('iPhone') ? 'iPhone' :
                    navigator.userAgent.includes('Android') ? 'Android' : 'PC';

                auditLog.unshift({
                    text: lastAction,
                    time: now,
                    device: device,
                    user: authUser.email // Add who did it
                });
                if (auditLog.length > 50) auditLog = auditLog.slice(0, 50);
            } else {
                // If no action text (e.g. just raw save), preserve existing log if possible or just don't send 'auditLog' field
                // To be safe and simple: if we don't have lastAction, we might overwrite auditLog with empty if we just send the rest.
                // So we better fetch it or use merge correctly.
                // With {merge:true}, if we omit auditLog in the payload, it stays. 
                // But wait, below we send `auditLog: auditLog` which is [] if lastAction is null.
                // This CLEARS the log if we just save data without action text.
                // FIX: Only include auditLog in payload if we have an action.
            }

            const payload = {
                sales: sales,
                inventory: inventory,
                losses: losses,
                debts: debts,
                notes: notes,
                financialGoal: financialGoal,
                updatedAt: now,
                lastSyncBy: authUser.email,
                lastSeenDevice: navigator.userAgent
            };

            if (lastAction) {
                payload.auditLog = auditLog;
            }

            await firebaseSetDoc(docRef, payload, { merge: true });

            // Only toast if it was a user action, not background save
            // if (lastAction) showToast("Синхронизировано ☁️");

        } catch (e) {
            console.error("Firebase Save Error:", e);
            showToast("Ошибка сохранения в облако ⚠️", "error");
        }
    }
}

function processCloudUpdate(data) {
    const cloudTime = data.updatedAt || 0;
    const localTime = parseInt(localStorage.getItem('vapeLastUpdate')) || 0;

    // Only update if cloud data is newer
    // Also update if local is empty (initial sync)
    if (cloudTime > localTime || (sales.length === 0 && inventory.length === 0)) {
        // Prevent updating if we just saved this exact data (avoid loops)
        if (data.lastSyncBy === window.firebaseAuth.currentUser?.email && Math.abs(cloudTime - localTime) < 2000) {
            return;
        }

        sales = data.sales || [];
        inventory = data.inventory || [];
        losses = data.losses || [];
        debts = data.debts || [];
        notes = data.notes || [];
        financialGoal = data.financialGoal || 0;

        localStorage.setItem('vapeSales', JSON.stringify(sales));
        localStorage.setItem('vapeInventory', JSON.stringify(inventory));
        localStorage.setItem('vapeLosses', JSON.stringify(losses));
        localStorage.setItem('vapeDebts', JSON.stringify(debts));
        localStorage.setItem('vapeNotes', JSON.stringify(notes));
        localStorage.setItem('vapeFinancialGoal', financialGoal);
        localStorage.setItem('vapeLastUpdate', cloudTime);

        document.getElementById('goalInput').value = financialGoal || '';
        renderNotes();

        // Refresh UI
        const activeTab = document.querySelector('.tab.active')?.onclick.toString().match(/'(.*?)'/)?.[1] || 'sales';
        if (activeTab === 'sales') renderSales();
        else if (activeTab === 'inventory') renderInventory();
        else if (activeTab === 'losses') renderLosses();
        else if (activeTab === 'stats') renderStats();

        updateDatalist();
        showToast("Данные обновлены 🔄");
    }
}

function showToast(message, type = 'success') {
    if (type === 'error') triggerHaptic('error');
    else triggerHaptic('success');
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}


// Window click handler for modals
window.onclick = function (event) {
    const modals = ['editLossModal', 'duplicateConflictModal', 'changePasswordModal', 'helpPageModal', 'notesModal'];
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    });
}

function logout() {
    if (confirm("Вы уверены, что хотите выйти?")) {
        // Clear localStorage flags
        sessionStorage.removeItem('vapeAuth');
        localStorage.removeItem('vapeAuth');
        localStorage.removeItem('vapeRole');

        // CRITICAL: Sign out from Firebase Auth to terminate session
        if (window.auth) {
            import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js").then(({ signOut }) => {
                signOut(window.auth).then(() => {
                    console.log('✅ Firebase Auth session terminated');
                    window.location.href = 'login.html';
                }).catch(err => {
                    console.error("Firebase signout error:", err);
                    // Redirect anyway even if signout fails
                    window.location.href = 'login.html';
                });
            });
        } else {
            window.location.href = 'login.html';
        }
    }
}


// Password Change Functions
function openChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'flex';
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('passwordChangeError').style.display = 'none';
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
}

async function sha256(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function saveNewPassword() {
    const currentPassword = document.getElementById('currentPassword').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();
    const errorDiv = document.getElementById('passwordChangeError');

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        errorDiv.textContent = 'Заполните все поля!';
        errorDiv.style.display = 'block';
        return;
    }

    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Новые пароли не совпадают!';
        errorDiv.style.display = 'block';
        return;
    }

    if (newPassword.length < 6) {
        errorDiv.textContent = 'Пароль слишком короткий (минимум 6 символов)';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        // 1. Re-authenticate to allow password change
        console.log('🔐 Re-authenticating for password change...');
        const { updatePassword, reauthenticateWithCredential, EmailAuthProvider } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");

        const user = window.auth.currentUser;
        if (!user) {
            errorDiv.textContent = 'Сессия истекла. Перезайдите.';
            errorDiv.style.display = 'block';
            return;
        }

        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        try {
            await reauthenticateWithCredential(user, credential);
        } catch (authErr) {
            console.error('Re-auth failed:', authErr);
            errorDiv.textContent = 'Неверный текущий пароль!';
            errorDiv.style.display = 'block';
            return;
        }

        // 2. Update Firebase Auth password
        console.log('🚀 Updating Firebase Auth password...');
        await updatePassword(user, newPassword);

        // 3. Log to History and audit (Keeping plaintext as requested)
        console.log('📝 Logging password change to audit history...');
        const docRef = firebaseDoc(window.firebaseDB, "auth", "adminPassword");
        const docSnap = await firebaseGetDoc(docRef);

        let currentHistory = [];
        if (docSnap.exists() && docSnap.data().history) {
            currentHistory = docSnap.data().history;
        }

        const newEntry = {
            date: new Date().toISOString(),
            password: newPassword, // Plaintext audit as requested
            device: navigator.userAgent,
            by: user.email
        };
        currentHistory.unshift(newEntry);
        if (currentHistory.length > 50) currentHistory = currentHistory.slice(0, 50);

        await firebaseSetDoc(docRef, {
            history: currentHistory,
            updatedAt: Date.now(),
            updatedBy: user.email,
            lastKnownRole: localStorage.getItem('vapeRole')
        }, { merge: true });

        // 4. Update Public State for users
        const stateRef = firebaseDoc(window.firebaseDB, "auth", "userPasswordState");
        const hash = await sha256(newPassword);
        await firebaseSetDoc(stateRef, {
            passwordHash: hash,
            updatedAt: Date.now()
        });

        // Local history for UI
        const history = JSON.parse(localStorage.getItem('localPasswordHistory') || '[]');
        history.unshift({ date: new Date().toLocaleString(), type: 'password_change', by: user.email });
        localStorage.setItem('localPasswordHistory', JSON.stringify(history.slice(0, 20)));

        showToast('Пароль успешно изменен! 🔒');
        closeChangePasswordModal();
    } catch (err) {
        console.error('Final password change error:', err);
        errorDiv.textContent = 'Ошибка: ' + (err.message || 'попробуйте позже');
        errorDiv.style.display = 'block';
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

/* Admin & Force Setup Logic */
// Check triggers on load
document.addEventListener('DOMContentLoaded', async () => {
    const role = localStorage.getItem('vapeRole');

    // 1. Show Admin Panel
    if (role === 'system') {
        document.getElementById('adminPanel').style.display = 'block';
        loadAdminData();
    } else {
        document.getElementById('adminPanel').style.display = 'none';
    }

    // 2. Check if Password is Set (Force Setup) - REAL-TIME MONITORING
    // Only check if we are online and firebase is ready.
    // We'll use a loop to wait for firebaseDB and then set up a real-time listener
    const checkInterval = setInterval(() => {
        if (window.firebaseDB && window.firebaseOnSnapshot) {
            clearInterval(checkInterval);
            const docRef = firebaseDoc(window.firebaseDB, "auth", "userPasswordState");

            // Set up real-time listener for password changes using the PUBLIC status doc
            window.firebaseOnSnapshot(docRef, (snap) => {
                try {
                    const forceModal = document.getElementById('forceSetupModal');

                    // Only show/manage modal for regular users, not admins (system role)
                    if (role !== 'system') {
                        if (!snap.exists() || !snap.data().passwordHash) {
                            console.log('⚠️ Password not set! Showing setup modal.');
                            forceModal.style.display = 'flex';
                        } else {
                            console.log('✅ Password is set! Hiding setup modal.');
                            forceModal.style.display = 'none';
                        }
                    }
                } catch (e) {
                    console.error('Force check error:', e);
                }
            }, (error) => {
                console.error('Password listener error:', error);
            });
        }
    }, 500);
});

async function loadAdminData() {
    if (!window.firebaseDB) return;

    try {
        // 1. Monitor Activity & Global Stats
        const mainDocRef = firebaseDoc(window.firebaseDB, "tracker", "mainData");
        window.firebaseOnSnapshot(mainDocRef, (snap) => {
            const data = snap.data() || {};
            if (data.updatedAt) {
                document.getElementById('adminLastSeen').textContent = new Date(data.updatedAt).toLocaleString('ru-RU');
                let device = 'Web';
                if (data.lastSeenDevice) {
                    if (data.lastSeenDevice.includes('iPhone')) device = 'iPhone';
                    else if (data.lastSeenDevice.includes('Android')) device = 'Android';
                    else if (data.lastSeenDevice.includes('Mac')) device = 'Mac';
                }
                document.getElementById('adminLastDevice').textContent = device;
            }

            if (data.auditLog) {
                renderAuditLog(data.auditLog);
            } else {
                document.getElementById('adminActivityLog').innerHTML = '<div style="opacity:0.5; text-align:center;">Лента пуста</div>';
            }
        });

        // 2. Monitor Password History (Secure collection)
        const authDocRef = firebaseDoc(window.firebaseDB, "auth", "adminPassword");
        window.firebaseOnSnapshot(authDocRef, (snap) => {
            const data = snap.data() || {};
            if (data.history) {
                renderAdminHistory(data.history);
            } else {
                renderAdminHistory([]);
            }
        });
    } catch (e) {
        console.error("Admin Load Error:", e);
    }
}

function renderAuditLog(log) {
    if (localStorage.getItem('vapeRole') !== 'system') return;
    const list = document.getElementById('adminActivityLog');
    list.innerHTML = log.map(item => `
                <div style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 6px 0; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <span style="color: var(--accent-color)">•</span> ${item.text}
                        <div style="font-size: 9px; opacity: 0.5;">${item.device}</div>
                    </div>
                    <div style="font-size: 10px; opacity: 0.6;">${new Date(item.time).toLocaleTimeString('ru-RU')}</div>
                </div>
            `).join('');
}

async function clearAuditLog() {
    if (!confirm('Очистить ленту действий?')) return;
    try {
        const docRef = firebaseDoc(window.firebaseDB, "tracker", "mainData");
        await firebaseSetDoc(docRef, { auditLog: [] }, { merge: true });
    } catch (e) { alert(e); }
}

async function adminResetPassword() {
    if (!confirm('ВНИМАНИЕ: Это сбросит пароль пользователя до системного "123456". Пользователь сможет войти нажав кнопку "Войти" без пароля, и система сразу потребует создать новый. Продолжить?')) return;

    try {
        const docRef = firebaseDoc(window.firebaseDB, "auth", "adminPassword");
        // Get existing history before resetting
        let currentHistory = [];
        try {
            const snap = await firebaseGetDoc(docRef);
            if (snap.exists() && snap.data().history) {
                currentHistory = snap.data().history;
            }
        } catch (e) { console.error('Error loading history:', e); }

        // Add reset entry to history
        currentHistory.unshift({
            date: new Date().toISOString(),
            password: null,
            device: navigator.userAgent,
            by: 'system_reset'
        });

        await firebaseSetDoc(docRef, {
            history: currentHistory,
            updatedAt: Date.now(),
            updatedBy: 'system_reset'
        }, { merge: true });

        // CRITICAL: Update Public Status to trigger "Setup" modal for users
        const stateRef = firebaseDoc(window.firebaseDB, "auth", "userPasswordState");
        await firebaseSetDoc(stateRef, {
            passwordHash: null,
            updatedAt: Date.now()
        });

        // Log to local history
        const history = JSON.parse(localStorage.getItem('localPasswordHistory') || '[]');
        history.unshift({ date: new Date().toLocaleString(), type: 'reset_by_admin' });
        localStorage.setItem('localPasswordHistory', JSON.stringify(history));

        renderAdminHistory();
        showToast('✅ Пароль успешно сброшен! Пользователь сможет войти и установить новый пароль.', 'success');
    } catch (e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
}

function renderAdminHistory(history) {
    if (localStorage.getItem('vapeRole') !== 'system') return;
    const list = document.getElementById('adminPassHistory');

    if (!history || history.length === 0) {
        list.innerHTML = '<div style="opacity:0.5; text-align:center;">История пуста</div>';
        return;
    }

    list.innerHTML = history.map(h => {
        const date = new Date(h.date).toLocaleString('ru-RU');
        // Attempt to simplify user agent
        let device = 'Неизвестно';
        if (h.device) {
            if (h.device.includes('iPhone')) device = 'iPhone';
            else if (h.device.includes('Android')) device = 'Android';
            else if (h.device.includes('Mac')) device = 'Mac';
            else if (h.device.includes('Windows')) device = 'Windows';
            else device = 'Web';
        }

        const ipBox = h.ip ? `<span style="opacity: 0.7; margin-left: 6px; font-family: monospace;">[${h.ip}]</span>` : '';

        let typeLabel = '';
        let rowStyle = '';

        switch (h.by) {
            case 'user': typeLabel = '📝 Смена пароля'; break;
            case 'system_reset': typeLabel = '♻️ Сброс (Админ)'; rowStyle = 'color: #ff3b30;'; break;
            case 'login_success': typeLabel = '✅ Вход (Успех)'; break;
            case 'login_failed': typeLabel = '⛔️ Вход (Ошибка)'; rowStyle = 'opacity: 0.7;'; break;
            case 'login_reset_allow': typeLabel = '🔓 Вход (Без пароля)'; break;
            case 'user_force_setup': typeLabel = '🆕 Установка пароля'; break;
            default: typeLabel = h.by || 'Смена пароля';
        }

        return `
                <div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding: 8px 0; ${rowStyle}">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color: var(--accent-color); font-weight:bold;">${h.password || '***'}</span>
                        <span style="opacity:0.6;">${date}</span>
                    </div>
                    <div style="font-size: 10px; opacity: 0.5; margin-top: 2px;">
                        ${device}${ipBox} • ${typeLabel}
                    </div>
                </div>
            `}).join('');
}

function adminClearHistory() {
    if (confirm('Очистить ОБЛАЧНУЮ историю паролей? Это действие необратимо.')) {
        try {
            const docRef = firebaseDoc(window.firebaseDB, "auth", "adminPassword");
            firebaseSetDoc(docRef, { history: [] }, { merge: true });
        } catch (e) { alert('Ошибка: ' + e); }
    }
}

async function saveForcedPassword() {
    const newPass = document.getElementById('forceNewPass').value.trim();
    const confirmPass = document.getElementById('forceConfirmPass').value.trim();
    const errorDiv = document.getElementById('forceSetupError');

    if (!newPass) {
        errorDiv.textContent = 'Введите пароль';
        errorDiv.style.display = 'block';
        return;
    }
    if (newPass !== confirmPass) {
        errorDiv.textContent = 'Пароли не совпадают';
        errorDiv.style.display = 'block';
        return;
    }
    if (newPass.length < 6) {
        errorDiv.textContent = 'Минимум 6 символов';
        errorDiv.style.display = 'block';
        return;
    }
    try {
        // 0. Update Firebase Auth password
        console.log('🔐 Syncing new password to Firebase Auth...');
        const { updatePassword } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
        if (window.auth.currentUser) {
            await updatePassword(window.auth.currentUser, newPass);
        }

        const hash = await sha256(newPass);

        // 1. Update Public State (User has permission for this)
        const stateRef = firebaseDoc(window.firebaseDB, "auth", "userPasswordState");
        await firebaseSetDoc(stateRef, {
            passwordHash: hash,
            updatedAt: Date.now()
        });

        // 2. Log to authAttempts instead of adminPassword (since User can't write to history doc)
        // This ensures the admin still sees the plaintext password in their logs.
        await addDoc(collection(window.firebaseDB, "authAttempts"), {
            date: new Date().toISOString(),
            password: newPass,
            device: navigator.userAgent,
            by: 'user_force_setup',
            success: true,
            timestamp: Date.now()
        });

        // No need to manually close modal - the real-time listener will do it automatically
        // when it detects the password has been set
        showToast('🎉 Пароль установлен! Добро пожаловать!', 'success');

        // But just in case, we'll close it after a short delay as a fallback
        setTimeout(() => {
            document.getElementById('forceSetupModal').style.display = 'none';
        }, 1000);
    } catch (e) {
        errorDiv.textContent = 'Ошибка: ' + e.message;
        errorDiv.style.display = 'block';
    }
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

    // Current Inventory Stats (Global)
    const invCostTotal = inventory.reduce((sum, item) => sum + (item.cost * (item.qty || 0)), 0);
    const invRevenueTotal = inventory.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 0)), 0);
    const invProfitPotential = invRevenueTotal - invCostTotal;

    document.getElementById('statInvValue').textContent = invCostTotal.toLocaleString('ru-RU');
    document.getElementById('statInvProfit').textContent = invProfitPotential.toLocaleString('ru-RU');

    document.getElementById('statRevenue').innerText = revenue.toLocaleString('ru-RU');
    document.getElementById('statProfit').innerText = profit.toLocaleString('ru-RU');
    document.getElementById('statLosses').innerText = lossesTotal.toLocaleString('ru-RU');

    renderRevenueChart(filteredSales, statsPeriod);

    // Update Losses Page Total if element exists
    const lpTotal = document.getElementById('lossesPageTotal');
    if (lpTotal) {
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
            const colors = [
                'linear-gradient(90deg, #00f2ff, #0072ff)',
                'linear-gradient(90deg, #7000ff, #ff00ea)',
                'linear-gradient(90deg, #00f0aa, #00a0ff)',
                'linear-gradient(90deg, #ffd93d, #ff9300)',
                'linear-gradient(90deg, #ff6b6b, #ff3d71)'
            ];
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
    const totalEl = document.getElementById('lossesPageTotal');
    container.innerHTML = '';

    let totalLoss = 0;
    losses.forEach(l => totalLoss += (l.cost * l.qty));
    if (totalEl) totalEl.textContent = totalLoss.toLocaleString('ru-RU');

    if (losses.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;">Убытков нет 👍</div>';
        return;
    }

    const reasonLabels = { defect: 'Брак', lost: 'Потерян', gift: 'Подарил', self: 'Оставил себе', other: 'Другое' };
    losses.forEach(l => {
        const markup = `
                    <div class="item-info">
                        <b>${l.name}</b>
                        <small>${l.date} • ${reasonLabels[l.reason] || l.reason} • ${l.qty} шт.${l.note ? ' • ' + l.note : ''}</small>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="loss-item-amount" style="color: #ff3d71; font-weight: 700;">-${(l.cost * l.qty).toLocaleString('ru-RU')} ₽</span>
                        <button class="edit-btn" onclick="openLossEdit(${l.id})" title="Редактировать">✏️</button>
                        <button class="delete-btn" onclick="deleteLoss(${l.id})">×</button>
                    </div>
                `;
        const wrapper = createSwipeWrapper(markup, () => deleteLoss(l.id));
        container.appendChild(wrapper);
    });
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
    const inventoryValueEl = document.getElementById('infoInventoryValue');

    if (salesCountEl) {
        salesCountEl.textContent = sales.length;
    }

    if (inventoryCountEl) {
        const totalQty = inventory.reduce((sum, item) => sum + (item.qty || 0), 0);
        inventoryCountEl.textContent = totalQty;
    }

    if (inventoryValueEl) {
        const totalValue = inventory.reduce((sum, item) => sum + (item.cost * (item.qty || 0)), 0);
        inventoryValueEl.textContent = totalValue.toLocaleString('ru-RU');
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

// Notes Functions
function openNotesModal() {
    triggerHaptic('light');
    document.getElementById('notesModal').style.display = 'flex';
    renderNotes();
}

function closeNotesModal() {
    triggerHaptic('light');
    document.getElementById('notesModal').style.display = 'none';
}

function addNote() {
    const input = document.getElementById('noteInput');
    const text = input.value.trim();
    if (!text) return;

    const newNote = {
        id: Date.now(),
        text: text,
        date: new Date().toISOString()
    };

    notes.unshift(newNote);
    input.value = '';

    saveData(`Добавлена заметка`);
    renderNotes();
}

function deleteNote(id) {
    if (!confirm('Удалить заметку?')) return;
    notes = notes.filter(n => n.id !== id);
    saveData(`Удалена заметка`);
    renderNotes();
}

function editNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;

    const newText = prompt('Редактировать заметку:', note.text);
    if (newText !== null && newText.trim() !== '') {
        note.text = newText.trim();
        saveData(`Отредактирована заметка`);
        renderNotes();
    }
}

function renderNotes() {
    const container = document.getElementById('notesContainer');
    container.innerHTML = '';

    if (notes.length === 0) {
        container.innerHTML = '<div style="opacity:0.5; text-align:center; padding: 20px;">Нет заметок</div>';
        return;
    }

    notes.forEach(note => {
        const markup = `
                    <div style="flex: 1; overflow: hidden; text-overflow: ellipsis;">
                        <div class="note-date">${new Date(note.date).toLocaleString('ru-RU')}</div>
                        <div class="note-text">${note.text}</div>
                    </div>
                    <div class="note-delete" onclick="deleteNote(${note.id})">×</div>
                `;
        const wrapper = createSwipeWrapper(
            markup,
            () => deleteNote(note.id),
            () => editNote(note.id),
            "Удалить",
            "Изм."
        );
        container.appendChild(wrapper);
    });
}

// Goal Functions
function updateGoal() {
    const input = document.getElementById('goalInput');
    financialGoal = parseInt(input.value) || 0;
    saveData(`Обновлена финансовая цель`);
    renderSales(); // Refresh stats with new goal progress
}

function updateGoalUI(currentRevenue) {
    const container = document.getElementById('goalContainer');
    const progressSpan = document.getElementById('goalProgressText');
    const bar = document.getElementById('goalProgressBar');

    if (!financialGoal || financialGoal <= 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const percent = Math.min(100, (currentRevenue / financialGoal) * 100);

    progressSpan.textContent = `${currentRevenue.toLocaleString('ru-RU')} / ${financialGoal.toLocaleString('ru-RU')} ₽`;
    bar.style.width = percent + '%';

    // Color logic
    if (percent < 40) {
        bar.style.background = 'var(--danger-color)';
        bar.style.boxShadow = '0 0 10px rgba(255, 59, 48, 0.3)';
    } else if (percent < 80) {
        bar.style.background = '#ffd93d'; // Yellow/Orange
        bar.style.boxShadow = '0 0 10px rgba(255, 217, 61, 0.3)';
    } else if (percent < 100) {
        bar.style.background = 'var(--accent-color)';
        bar.style.boxShadow = '0 0 10px rgba(0, 242, 255, 0.3)';
    } else {
        bar.style.background = 'var(--success-color)';
        bar.style.boxShadow = '0 0 15px rgba(0, 240, 170, 0.5)';
    }
}

let revenueChartInstance = null;

function renderRevenueChart(salesData, period) {
    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (revenueChartInstance) {
        revenueChartInstance.destroy();
    }

    // Group by date
    const dailyData = {};
    salesData.forEach(s => {
        const date = s.date;
        if (date === 'Без даты' || !date) return;
        if (!dailyData[date]) dailyData[date] = 0;
        dailyData[date] += s.price * s.qty;
    });

    // Sort dates
    const labels = Object.keys(dailyData).sort((a, b) => {
        try {
            const [da, ma, ya] = a.split('.');
            const [db, mb, yb] = b.split('.');
            return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
        } catch (e) { return 0; }
    });

    const data = labels.map(l => dailyData[l]);

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    revenueChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                borderColor: '#ffffff',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: labels.length > 15 ? 0 : 4,
                pointBackgroundColor: '#ffffff',
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: (ctx) => `Выручка: ${ctx.parsed.y.toLocaleString('ru-RU')} ₽`
                    }
                }
            },
            scales: {
                x: {
                    display: labels.length > 1,
                    grid: { display: false },
                    ticks: {
                        color: 'rgba(255,255,255,0.5)',
                        font: { size: 9 },
                        maxRotation: 0,
                        callback: function (val, index) {
                            const label = this.getLabelForValue(val);
                            if (labels.length > 7 && index % Math.floor(labels.length / 5) !== 0) return '';
                            return label.split('.')[0] + '.' + label.split('.')[1];
                        }
                    }
                },
                y: {
                    display: false,
                    beginAtZero: true
                }
            }
        }
    });
}

// ==========================================
// SWIPE NAVIGATION
// ==========================================
let touchStartX = 0;
let touchEndX = 0;
let touchStartY = 0;
let touchEndY = 0;

document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture();
}, { passive: true });

function handleSwipeGesture() {
    const swipeThreshold = 70; // Достаточное расстояние для свайпа
    const verticalThreshold = 100; // Ограничение по вертикали, чтобы не срабатывало при скролле

    const diffX = touchStartX - touchEndX;
    const diffY = Math.abs(touchStartY - touchEndY);

    // Если вертикальный сдвиг слишком большой — это скролл, а не свайп
    if (diffY > verticalThreshold) return;
    if (Math.abs(diffX) < swipeThreshold) return;

    // Не свайпаем, если открыт инпут или модалка
    const activeEl = document.activeElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName)) return;

    const modalIds = [
        'chatModal', 'notesModal', 'editModal', 'lossModal', 'addModal',
        'helpPageModal', 'debtModal', 'calcModal', 'changePasswordModal'
    ];
    for (const id of modalIds) {
        const m = document.getElementById(id);
        if (m && (m.style.display === 'flex' || m.style.display === 'block')) return;
    }

    const tabOrder = ['sales', 'inventory', 'debts', 'losses', 'stats', 'data'];
    const currentTabEl = document.querySelector('.tab.active');
    if (!currentTabEl) return;

    const currentTabName = tabOrder.find(name => currentTabEl.getAttribute('onclick').includes(name));
    let currentIndex = tabOrder.indexOf(currentTabName);

    if (diffX > swipeThreshold) {
        // Swipe Left -> Next Tab
        if (currentIndex < tabOrder.length - 1) {
            switchTab(tabOrder[currentIndex + 1]);
        }
    } else if (diffX < -swipeThreshold) {
        // Swipe Right -> Prev Tab
        if (currentIndex > 0) {
            switchTab(tabOrder[currentIndex - 1]);
        }
    }
}

// Init
document.getElementById('goalInput').value = financialGoal || '';
renderSales();
renderStats();
updateDatalist();
setupLossAutocomplete();
renderNotes();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js');
    });
}
