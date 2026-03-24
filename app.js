let map;
let trajectoryData = {};
let markers = [];
let polylines = [];
let currentEmployee = '';
let currentDate = 'all';
let availableMonths = [];  // v3.5.4 新增：存储可用月份列表 ["2026-03", "2026-02", "2026-01"]
let colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8B739', '#52B788', '#EF476F', '#118AB2', '#06D6A0',
    '#FFD166', '#073B4C', '#8D99AE', '#EF233C', '#7209B7'
];
let dateColors = {};

async function initMap() {
    try {
        // 检查Leaflet是否加载
        if (typeof L === 'undefined') {
            throw new Error('Leaflet库未加载，请检查网络连接');
        }

        map = L.map('map', { zoomControl: false }).setView([35.5715, 115.5559], 10);

        // 高德地图普通地图（透明度0.5，突出轨迹）
        const tileLayer = L.tileLayer('http://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}', {
            attribution: '© 高德地图',
            maxZoom: 18,
            subdomains: ['1', '2', '3', '4'],
            opacity: 0.5,
            errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', // 透明像素
            tileloaderror: function(error) {
                console.warn('瓦片加载失败:', error);
            }
        });

        // 添加备用地图源
        tileLayer.addTo(map);

        // 备用方案：如果高德瓦片加载失败，尝试使用OpenStreetMap
        setTimeout(() => {
            if (!map || !map._loaded || map._loaded === 0) {
                console.warn('高德地图瓦片加载异常，尝试备用地图源');
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap',
                    maxZoom: 19
                }).addTo(map);
            }
        }, 3000);

        // 先初始化事件监听
        initEmployeeSelectListener();
        initMonthSelectListener();

        // 等待月份列表加载完成
        await populateMonthSelect();

        // 自动选择最近月份并加载数据
        const monthSelect = document.getElementById('monthSelect');

        if (monthSelect && monthSelect.options.length > 1) {
            // 选择第一个选项（最近月份）
            monthSelect.selectedIndex = 1;

            // 加载该月份的数据
            await loadMonthData();
        } else {
            // 如果没有月份列表，则加载默认数据
            await loadMonthData();
        }
    } catch (error) {
        console.error('Error initializing map:', error);
        alert('地图初始化失败：' + error.message + '\n\n请检查：\n1. 网络连接是否正常\n2. 打开浏览器控制台查看详细错误（F12）');
        document.getElementById('loading').style.display = 'none';
    }
}

// 加载月度数据
async function loadMonthData() {
    console.log('[loadMonthData] 开始加载月份数据');
    
    const monthSelect = document.getElementById('monthSelect');

    // 获取选中的月份
    const selectedMonth = monthSelect ? monthSelect.value : '';

    console.log('[loadMonthData] 选中月份:', selectedMonth);

    // 更新当前月历显示的月份（v3.4.1 修复：切换月份时更新日历月份）
    if (selectedMonth) {
        const [year, month] = selectedMonth.split('-').map(Number);
        currentCalendarYear = year;
        currentCalendarMonth = month;
        console.log('[loadMonthData] 更新当前月份变量为:', year + '-' + String(month).padStart(2, '0'));
    }

    // 获取当前选中的员工
    const employeeSelect = document.getElementById('employeeSelect');
    const currentEmployeeValue = employeeSelect ? employeeSelect.value : '';

    console.log('[loadMonthData] 当前选中员工:', currentEmployeeValue);

    document.getElementById('loading').style.display = 'block';

    try {
        let url = 'trajectory_data.json';
        if (selectedMonth) {
            url += `?month=${selectedMonth}`;
        }

        console.log('[loadMonthData] 获取数据URL:', url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
        }

        const data = await response.json();
        trajectoryData = data;
        
        console.log('[loadMonthData] 数据加载完成，包含员工:', Object.keys(data));

        // 清除当前地图上的标记和轨迹
        clearTrajectories();

        // 重新填充员工选择器（同时更新桌面端和手机端）
        populateEmployeeSelect();

        // v3.5.3 修复：尝试恢复之前选中的员工，但不调用 updateTrajectory()
        // （updateTrajectory() 会在选择框的 change 事件中自动触发）
        if (currentEmployeeValue && trajectoryData[currentEmployeeValue]) {
            console.log('[loadMonthData] 恢复员工选择:', currentEmployeeValue);
            if (employeeSelect) employeeSelect.value = currentEmployeeValue;
            currentEmployee = currentEmployeeValue;
            // 手动触发 updateTrajectory()
            console.log('[loadMonthData] 调用 updateTrajectory()');
            updateTrajectory();
        } else {
            // 如果该月份没有这个员工，则清空选择
            console.log('[loadMonthData] 该月份没有该员工或未选择，清空选择');
            if (employeeSelect) employeeSelect.value = '';
            currentEmployee = '';
            clearTrajectories();
        }

        currentDate = 'all';

        // 更新标题下方的数据更新时间和来源
        updateDataUpdateTime();

        document.getElementById('loading').style.display = 'none';
        console.log('[loadMonthData] 完成\n');
    } catch (error) {
        console.error('[loadMonthData] 错误:', error);
        alert('数据加载失败：' + error.message);
        document.getElementById('loading').style.display = 'none';
    }
}

function populateEmployeeSelect() {
    const select = document.getElementById('employeeSelect');

    const employees = Object.keys(trajectoryData).sort();

    const optionHtml = employees.map(name =>
        `<option value="${name}">${name}</option>`
    ).join('');

    const fullHtml = '<option value="">选择员工</option>' + optionHtml;

    if (select) select.innerHTML = fullHtml;
}

// 加载月度列表
async function populateMonthSelect() {
    const monthSelect = document.getElementById('monthSelect');

    if (monthSelect) monthSelect.innerHTML = '<option value="">选择月份</option>';

    try {
        // 注意：服务器路由是 /data/monthly.json，但实际读取的是 data/index.json
        const response = await fetch('data/monthly.json');
        if (response.ok) {
            const indexData = await response.json();
            if (indexData.files && indexData.files.length > 0) {
                // 按月份倒序排列，最新的月份在前面
                indexData.files.sort((a, b) => {
                    if (a.year !== b.year) return b.year - a.year;
                    return b.month - a.month;
                });

                // v3.5.4 新增：更新全局 availableMonths 数组
                availableMonths = indexData.files.map(file => 
                    file.year + '-' + String(file.month).padStart(2, '0')
                );
                console.log('[populateMonthSelect] 更新 availableMonths:', availableMonths);

                const optionHtml = indexData.files.map(file =>
                    '<option value="' + file.year + '-' + String(file.month).padStart(2, '0') + '">' + file.label + '</option>'
                ).join('');

                const fullHtml = '<option value="">选择月份</option>' + optionHtml;

                if (monthSelect) monthSelect.innerHTML = fullHtml;
            }
        }
    } catch (error) {
        console.error('Error loading month list:', error);
    }
}

// 添加员工选择器的事件监听 - 在initMap中初始化
function initEmployeeSelectListener() {
    const employeeSelect = document.getElementById('employeeSelect');
    const dateSelect = document.getElementById('dateSelect');

    if (employeeSelect) {
        employeeSelect.addEventListener('change', function() {
            console.log('[员工选择] 用户选择了员工:', this.value);
            
            // 清空日期选择器
            if (dateSelect) dateSelect.value = 'all';

            // 直接调用updateTrajectory，无论是否选择了月份
            // 只要选择了员工，就显示该员工的轨迹
            updateTrajectory();
        });
    }
}

// 添加月份选择器的事件监听
function initMonthSelectListener() {
    const monthSelect = document.getElementById('monthSelect');

    if (monthSelect) {
        monthSelect.addEventListener('change', function() {
            // 选择月份后先加载数据，再显示轨迹
            loadMonthData().then(() => {
                // v3.5.3 修复：确保重新渲染日历，然后显示当月轨迹
                renderCalendar(currentCalendarYear, currentCalendarMonth);
                
                // 只有当员工被选中时才显示轨迹
                if (currentEmployee) {
                    showAllTrajectories();
                }
                
                // 更新打卡统计
                updateStatsPanel();
                
                // 自动打开侧边栏
                const sidebar = document.getElementById('sidebar');
                const overlay = document.getElementById('sidebarOverlay');
                if (!sidebar.classList.contains('open')) {
                    sidebar.classList.add('open');
                    if (overlay) {
                        overlay.classList.add('active');
                    }
                }
            });
        });
    }
}

function updateTrajectory() {
    console.log('[updateTrajectory] 开始执行');
    
    const employeeSelect = document.getElementById('employeeSelect');
    currentEmployee = employeeSelect ? employeeSelect.value : '';

    console.log('[updateTrajectory] 当前员工:', currentEmployee);
    console.log('[updateTrajectory] 切换前月份:', currentCalendarYear + '-' + String(currentCalendarMonth).padStart(2, '0'));
    console.log('[updateTrajectory] 已加载的员工数据:', Object.keys(trajectoryData));

    // 如果没有选择员工，清空轨迹
    if (!currentEmployee) {
        console.log('[updateTrajectory] 未选择员工，清空轨迹');
        clearTrajectories();
        return;
    }

    // ★ v3.5.4 关键修复：切换员工时，重置月份到最新月份 ★
    // 改进：使用 availableMonths 全局变量而不是 HTML 的 monthSelect 元素
    if (availableMonths && availableMonths.length > 0) {
        var latestMonthValue = availableMonths[0];
        console.log('[updateTrajectory] 重置到最新月份:', latestMonthValue);
        
        // 同时更新 HTML 的 monthSelect（如果存在）
        var monthSelectElem = document.getElementById('monthSelect');
        if (monthSelectElem) {
            monthSelectElem.value = latestMonthValue;
        }
        
        // 解析月份
        var parts = latestMonthValue.split('-');
        var year = parseInt(parts[0]);
        var month = parseInt(parts[1]);
        currentCalendarYear = year;
        currentCalendarMonth = month;
        console.log('[updateTrajectory] 切换后月份:', year + '-' + String(month).padStart(2, '0'));
    } else {
        console.log('[updateTrajectory] 警告：availableMonths 为空，无法重置月份');
    }

    // 员工选中后，清空轨迹并重新显示
    clearTrajectories();

    // 仅更新 UI，不加载数据
    // 数据应该已经通过 loadMonthData() 或 initMap() 加载了
    console.log('[updateTrajectory] 更新UI...');
    updateSidebar();
    updateStatsPanel();
    updateScheduleTitle();

    // 检查是否有今天的数据
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    console.log('[updateTrajectory] 检查今天数据:', todayStr);
    console.log('[updateTrajectory] 该员工的数据:', trajectoryData[currentEmployee]);

    if (currentEmployee && trajectoryData[currentEmployee] && trajectoryData[currentEmployee][todayStr]) {
        console.log('[updateTrajectory] 找到今天数据，显示单日轨迹');
        currentDate = todayStr;
        selectDateWithoutFilter(todayStr);
    } else {
        console.log('[updateTrajectory] 没有今天数据，显示整月轨迹');
        currentDate = 'all';
        // v3.5.3 修复：如果没有今天的数据，显示整个月份的轨迹
        showAllTrajectories();
    }

    // 使用当前的月份变量重新渲染日历
    console.log('[updateTrajectory] 重新渲染日历');
    renderCalendar(currentCalendarYear, currentCalendarMonth);
    
    console.log('[updateTrajectory] 执行完成\n');
}

// ============================================================
// v3.4.0 之前的功能
// ============================================================

function showDayTrajectory(employeeName, date, color, index) {
    const points = trajectoryData[employeeName][date];
    if (!points || points.length === 0) return;

    const latlngs = points.map(p => [p.latitude, p.longitude]);

    if (latlngs.length > 1) {
        const polyline = L.polyline(latlngs, {
            color: color,
            weight: 4,
            opacity: 0.7
        }).addTo(map);

        polylines.push({ polyline: polyline, date: date });
    }

    points.forEach((point, pointIndex) => {
        const isFirst = pointIndex === 0;
        const isLast = pointIndex === points.length - 1;

        let markerColor = color;
        if (isFirst) markerColor = '#00FF00'; // 起点：绿色
        if (isLast) markerColor = '#FF0000'; // 终点：红色

        const marker = L.circleMarker([point.latitude, point.longitude], {
            radius: 8,
            fillColor: markerColor,
            color: '#FFF',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);

        const iconHtml = isFirst ? '🏁' : (isLast ? '🏠' : '📍');

        const remark = point.remark || "";
        // 过滤掉打卡类型，只显示用户手动填写的备注
        const displayRemark = (remark && remark !== "OnDuty" && remark !== "OffDuty") ? remark : "";
        const popupContent = `
            <div class="info-popup">
                <div class="popup-time">${iconHtml} ${point.time}</div>
                <div class="popup-address">${point.address}</div>
                ${displayRemark ? `<div class="popup-reason">🎯 ${displayRemark}</div>` : ''}
                <div class="popup-coords">${point.latitude}, ${point.longitude}</div>
            </div>
        `;

        marker.bindPopup(popupContent);
        markers.push({ marker: marker, date: date });
    });
}

function clearTrajectories() {
    markers.forEach(m => map.removeLayer(m.marker));
    polylines.forEach(p => map.removeLayer(p.polyline));
    markers = [];
    polylines = [];
    dateColors = {};
}

function updateSidebar() {
    // 渲染月历
    if (currentEmployee && trajectoryData[currentEmployee]) {
        renderCalendar(currentCalendarYear, currentCalendarMonth);
    }
}

function filterByDate(date) {
    // 更新当前选择的日期
    currentDate = date;

    // 清除当前地图上的标记和轨迹
    clearTrajectories();

    // 只显示选中日期的轨迹
    if (currentEmployee && trajectoryData[currentEmployee]) {
        const data = trajectoryData[currentEmployee];
        if (data && data[date]) {
            showDayTrajectory(currentEmployee, date, dateColors[date] || colors[0], 0);

            // 缩放到该日期的轨迹
            if (markers.length > 0) {
                const group = L.featureGroup(markers.map(m => m.marker));
                setTimeout(() => {
                    map.fitBounds(group.getBounds().pad(0.2));
                }, 100);
            }
        }
    }

    // 高亮选中的日期
    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
    const dayElements = document.querySelectorAll('.calendar-day');
    dayElements.forEach(el => {
        if (el.dataset.date === date) {
            el.classList.add('selected');
        }
    });

    // 显示打卡明细
    showAttendanceDetail(date);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

// 等待页面完全加载后再初始化
window.addEventListener('DOMContentLoaded', function() {
    initMap();

    // 默认打开侧边栏
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.add('open');
    }
});

// ============================================================
// v3.4.0 新增功能
// ============================================================

// ---------- 月历功能 ----------
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth() + 1;

function renderCalendar(year, month) {
    const calendarDays = document.getElementById('calendarDays');
    const calendarTitle = document.getElementById('calendarTitle');

    if (!calendarDays || !calendarTitle) return;

    calendarTitle.textContent = `${year}年${String(month).padStart(2, '0')}月`;
    calendarDays.innerHTML = '';

    // 获取当月第一天是星期几
    const firstDay = new Date(year, month - 1, 1).getDay();

    // 获取当月有多少天
    const daysInMonth = new Date(year, month, 0).getDate();

    // 获取当前员工的数据
    const employeeData = currentEmployee && trajectoryData[currentEmployee] ? trajectoryData[currentEmployee] : {};

    // 获取今天的日期
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    // 填充空白日期
    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day';
        emptyDay.style.visibility = 'hidden';
        calendarDays.appendChild(emptyDay);
    }

    // 填充日期
    for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.dataset.date = dayStr; // 添加 data-date 属性

        // 检查是否有数据
        const hasData = employeeData[dayStr] && employeeData[dayStr].length > 0;
        const recordCount = hasData ? employeeData[dayStr].length : 0;

        // 检查是否是今天或之前的日期（如果是之后的日期，不显示缺卡）
        const isPastOrToday = (year < todayYear) ||
                              (year === todayYear && month < todayMonth) ||
                              (year === todayYear && month === todayMonth && day <= todayDay);

        if (hasData) {
            dayElement.classList.add('has-data');
            dayElement.innerHTML = `
                <span class="day-number">${day}</span>
                <span class="record-count">${recordCount}次</span>
            `;
            dayElement.onclick = () => selectDate(dayStr);
        } else if (isPastOrToday) {
            // 只有过去或今天的日期才显示缺卡
            dayElement.classList.add('missing');
            dayElement.innerHTML = `
                <span class="day-number">${day}</span>
                <span class="record-count">缺卡</span>
            `;
            dayElement.onclick = () => selectDate(dayStr);
        } else {
            // 未来的日期，正常显示但不标记缺卡
            dayElement.innerHTML = `
                <span class="day-number">${day}</span>
            `;
        }

        // 标记今天
        if (dayStr === `${todayYear}-${String(todayMonth).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`) {
            dayElement.classList.add('today');
        }

        calendarDays.appendChild(dayElement);
    }
}

function changeMonth(delta) {
    currentCalendarMonth += delta;

    if (currentCalendarMonth > 12) {
        currentCalendarMonth = 1;
        currentCalendarYear++;
    } else if (currentCalendarMonth < 1) {
        currentCalendarMonth = 12;
        currentCalendarYear--;
    }

    // 关闭打卡明细
    closeAttendanceDetail();

    // 渲染新月份
    renderCalendar(currentCalendarYear, currentCalendarMonth);

    // 更新统计信息
    updateStatsPanel();

    // 显示当前选择月份的全部轨迹
    if (currentEmployee) {
        showAllTrajectories();
    }
}

function selectDate(date) {
    // 高亮选中的日期
    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
    const dayElements = document.querySelectorAll('.calendar-day');
    dayElements.forEach(el => {
        // 通过 data-date 属性匹配（在 renderCalendar 中设置）
        if (el.dataset.date === date) {
            el.classList.add('selected');
        }
    });

    // 显示当天的轨迹
    filterByDate(date);

    // 显示打卡明细
    showAttendanceDetail(date);
}

// 不通过 filterByDate 的版本，用于初始加载时选择今天
function selectDateWithoutFilter(date) {
    // 高亮选中的日期
    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
    const dayElements = document.querySelectorAll('.calendar-day');
    dayElements.forEach(el => {
        // 通过 data-date 属性匹配
        if (el.dataset.date === date) {
            el.classList.add('selected');
        }
    });

    // 过滤并显示指定日期的轨迹
    currentDate = date;

    // 清除当前地图上的标记和轨迹
    clearTrajectories();

    if (currentEmployee) {
        const data = trajectoryData[currentEmployee];
        if (data && data[date]) {
            showDayTrajectory(currentEmployee, date, dateColors[date] || colors[0], 0);

            // 缩放到该日期的轨迹
            if (markers.length > 0) {
                const group = L.featureGroup(markers.map(m => m.marker));
                setTimeout(() => {
                    map.fitBounds(group.getBounds().pad(0.2));
                }, 100);
            }
        }
    }

    // 显示打卡明细
    showAttendanceDetail(date);
}

function showAttendanceDetail(date) {
    const detailPanel = document.getElementById('attendanceDetailPanel');
    const detailTitle = document.getElementById('detailPanelTitle');
    const detailContent = document.getElementById('detailPanelContent');

    if (!detailPanel || !detailTitle || !detailContent) return;

    detailTitle.textContent = `${date} 打卡明细`;
    detailPanel.style.display = 'block';

    // 检查是否有数据
    const hasData = currentEmployee && trajectoryData[currentEmployee] && trajectoryData[currentEmployee][date];
    const records = hasData ? trajectoryData[currentEmployee][date] : [];

    if (records.length === 0) {
        detailContent.innerHTML = '<div class="no-data-message">当天无打卡记录</div>';
        return;
    }

    let html = '';
    records.forEach((record, index) => {
        const iconHtml = index === 0 ? '🏁' : (index === records.length - 1 ? '🏠' : '📍');

        // 获取备注（优先使用 outsideRemark，然后是 remark）
        const remark = record.remark || "";

        // 过滤掉打卡类型，只显示用户手动填写的备注
        const displayRemark = (remark && remark !== "OnDuty" && remark !== "OffDuty" && remark !== "上班打卡" && remark !== "下班打卡") ? remark : "";

        html += `
            <div class="attendance-record">
                <div class="record-time">${iconHtml} ${record.time}</div>
                <div class="record-address">${record.address}</div>
                ${displayRemark ? `<div class="record-remark">🎯 ${displayRemark}</div>` : ''}
            </div>
        `;
    });

    detailContent.innerHTML = html;
}

function closeAttendanceDetail() {
    const detailPanel = document.getElementById('attendanceDetailPanel');
    if (detailPanel) {
        detailPanel.style.display = 'none';
    }
    // 移除日期选中状态
    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
}

// 显示全部轨迹
function showAllTrajectories() {
    console.log('[showAllTrajectories] 开始显示轨迹');
    
    if (!currentEmployee) {
        console.log('[showAllTrajectories] 未选择员工，返回');
        alert('请先选择员工');
        return;
    }

    clearTrajectories();

    // v3.5.3 修复：只显示当前月份的轨迹
    const data = trajectoryData[currentEmployee];
    console.log('[showAllTrajectories] 员工数据:', data);
    
    if (!data) {
        console.log('[showAllTrajectories] 员工数据为空，返回');
        return;
    }
    
    const monthPrefix = `${currentCalendarYear}-${String(currentCalendarMonth).padStart(2, '0')}`;
    console.log('[showAllTrajectories] 月份前缀:', monthPrefix);
    
    const dates = Object.keys(data)
        .filter(date => date.startsWith(monthPrefix))
        .sort();

    console.log('[showAllTrajectories] 该月份的日期列表:', dates);

    if (dates.length === 0) {
        console.log('[showAllTrajectories] 该月份没有数据');
        updateSidebar();
        return;
    }

    console.log('[showAllTrajectories] 开始绘制轨迹，共 ' + dates.length + ' 天');

    dates.forEach((date, index) => {
        const color = colors[index % colors.length];
        dateColors[date] = color;

        const points = data[date];
        if (!points || points.length === 0) return;

        const latlngs = points.map(p => [p.latitude, p.longitude]);

        if (latlngs.length > 1) {
            const polyline = L.polyline(latlngs, {
                color: color,
                weight: 4,
                opacity: 0.7
            }).addTo(map);

            polylines.push({ polyline: polyline, date: date });
        }

        // 添加标记
        points.forEach((point, pointIndex) => {
            const isFirst = pointIndex === 0;
            const isLast = pointIndex === points.length - 1;

            let markerColor = color;
            if (isFirst) markerColor = '#00FF00';
            if (isLast) markerColor = '#FF0000';

            const marker = L.circleMarker([point.latitude, point.longitude], {
                radius: 8,
                fillColor: markerColor,
                color: '#FFF',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);

            const iconHtml = isFirst ? '🏁' : (isLast ? '🏠' : '📍');
            const timeStr = new Date(point.time).toLocaleString('zh-CN');
            const remark = point.remark || "";
            // 过滤掉打卡类型，只显示用户手动填写的备注
            const displayRemark = (remark && remark !== "OnDuty" && remark !== "OffDuty") ? remark : "";
            const popupContent = `
                <div class="info-popup">
                    <div class="popup-time">${iconHtml} ${timeStr}</div>
                    <div class="popup-address">${point.address}</div>
                    ${displayRemark ? `<div class="popup-reason">🎯 ${displayRemark}</div>` : ''}
                </div>
            `;
            marker.bindPopup(popupContent);
            markers.push({ marker: marker, date: date });
        });
    });

    // 更新右侧日程列表
    updateSidebar();

    if (markers.length > 0) {
        const group = L.featureGroup(markers.map(m => m.marker));
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// 修改 updateTrajectory 函数，在更新轨迹后渲染月历
// ---------- 1. 统计数据面板 ----------
function updateStatsPanel() {
    if (!currentEmployee || !trajectoryData[currentEmployee]) {
        const statsPanel = document.getElementById('statsPanel');
        if (statsPanel) statsPanel.style.display = 'none';
        return;
    }

    const data = trajectoryData[currentEmployee];

    // 获取当前月历框显示的月份
    const currentMonthPrefix = `${currentCalendarYear}-${String(currentCalendarMonth).padStart(2, '0')}`;

    // 过滤出当前月份的日期
    const dates = Object.keys(data).sort().filter(date => date.startsWith(currentMonthPrefix));

    const totalDays = dates.length;
    let totalRecords = 0;

    dates.forEach(date => {
        totalRecords += data[date].length;
    });

    const avgRecords = totalDays > 0 ? (totalRecords / totalDays).toFixed(1) : '0.0';

    const statsHtml = `
        <div class="stats-item">
            <span class="stats-label">打卡天数</span>
            <span class="stats-value">${totalDays} 天</span>
        </div>
        <div class="stats-item">
            <span class="stats-label">打卡次数</span>
            <span class="stats-value">${totalRecords} 次</span>
        </div>
        <div class="stats-item">
            <span class="stats-label">平均每日</span>
            <span class="stats-value">${avgRecords} 次/天</span>
        </div>
    `;

    const statsPanel = document.getElementById('statsPanel');
    if (statsPanel) {
        statsPanel.innerHTML = statsHtml;
        statsPanel.style.display = 'flex';
    }
}


// ---------- 2. 数据更新时间显示 ----------
function updateDataUpdateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const updateTime = `数据更新时间：${year}-${month}-${day} ${hours}:${minutes}`;
    const dataSource = `数据来源：钉钉考勤系统`;

    // 更新标题后面的数据信息
    const headerDataInfo = document.getElementById('headerDataInfo');
    if (headerDataInfo) {
        headerDataInfo.textContent = `${updateTime} | ${dataSource}`;
    }
}

// 注意：updateDataUpdateTime 和 updateScheduleTitle 已经在各个版本的 loadMonthData 中调用

// 更新轨迹日程标题
function updateScheduleTitle() {
    const scheduleTitle = document.getElementById('scheduleTitle');
    const monthSelect = document.getElementById('monthSelect');

    if (scheduleTitle && monthSelect && monthSelect.value && currentEmployee) {
        // 查找选中的月份的 label
        const selectedOption = Array.from(monthSelect.options).find(option => option.value === monthSelect.value);
        const monthLabel = selectedOption ? selectedOption.text : '未指定';
        scheduleTitle.textContent = `${currentEmployee}的市场开发轨迹 - ${monthLabel}`;
    } else if (scheduleTitle && currentEmployee) {
        scheduleTitle.textContent = `${currentEmployee}的市场开发轨迹`;
    } else if (scheduleTitle) {
        scheduleTitle.textContent = '员工的市场开发轨迹';
    }
}

// ---------- 导出轨迹数据 ----------
function exportTrajectoryData() {
    if (!currentEmployee || !trajectoryData[currentEmployee]) {
        showErrorModal('请先选择员工');
        return;
    }

    // 使用月历框显示的月份来过滤数据
    const selectedMonth = `${currentCalendarYear}-${String(currentCalendarMonth).padStart(2, '0')}`;
    const monthLabel = `${currentCalendarYear}年${String(currentCalendarMonth).padStart(2, '0')}月`;

    const data = trajectoryData[currentEmployee];

    // 根据当前月历框显示的月份过滤日期
    const datesToExport = Object.keys(data).filter(date => date.startsWith(selectedMonth));

    if (datesToExport.length === 0) {
        showErrorModal('该月份没有数据');
        return;
    }

    let csvContent = '\uFEFF'; // BOM for UTF-8

    // CSV 头部
    csvContent += '日期,时间,地址,经度,纬度,打卡类型,备注\n';

    datesToExport.sort().forEach(date => {
        data[date].forEach(record => {
            const time = new Date(record.time).toLocaleTimeString('zh-CN');
            const type = record.checkType === 'OnDuty' ? '上班打卡' : '下班打卡';
            const address = record.address.replace(/,/g, ' '); // 处理地址中的逗号

            // 过滤掉打卡类型，只显示用户手动填写的备注
            const remark = record.remark || "";
            const displayRemark = (remark && remark !== "OnDuty" && remark !== "OffDuty") ? remark : "";

            csvContent += `${date},${time},${address},${record.longitude},${record.latitude},${type},${displayRemark}\n`;
        });
    });

    // 创建 Blob 对象
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // 文件名包含月份标签（例如：杨庆昌_2026年03月_轨迹数据.csv）
    const fileName = `${currentEmployee}_${monthLabel}_轨迹数据.csv`;

    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

// ---------- 5. 地图控制按钮 ----------
function zoomIn() {
    if (map) {
        map.zoomIn();
    }
}

function zoomOut() {
    if (map) {
        map.zoomOut();
    }
}

function resetMapView() {
    if (map) {
        map.setView([35.5715, 115.5559], 10);
    }
}

// ---------- 错误提示弹窗 ----------
let lastLoadError = null;
let lastLoadUrl = null;

function showErrorModal(message) {
    const modal = document.getElementById('errorModal');
    const errorMessage = document.getElementById('errorMessage');

    if (modal && errorMessage) {
        errorMessage.textContent = message;
        modal.style.display = 'flex';
    }
}

function closeErrorModal() {
    const modal = document.getElementById('errorModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function retryLoad() {
    closeErrorModal();
    loadMonthData();
}

