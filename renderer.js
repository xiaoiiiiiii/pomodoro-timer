// ===================================================================
// 番茄钟 - 渲染进程主逻辑
// ===================================================================
// 本文件运行在 Electron 的渲染进程（浏览器环境）中，负责：
// 1. 番茄计时器（工作/短休息/长休息循环）
// 2. 任务列表管理（添加、完成、删除、筛选）
// 3. 历史记录展示（今日统计 + 时间线）
// 4. 所有 UI 交互和事件处理
// 与主进程通信通过 window.electronAPI（preload.js 暴露的桥接对象）
// ===================================================================

// ===== 第一部分：DOM 元素引用 =====
// 使用 $ 前缀命名变量，方便区分 DOM 元素和普通变量
// 计时器相关
const $timerDisplay = document.getElementById('timerDisplay'); // 大号时间显示 25:00
const $modeIndicator = document.getElementById('modeIndicator'); // 当前模式标签（工作中/休息）
const $cycleInfo = document.getElementById('cycleInfo'); // 轮次信息（第 2/4 轮）
const $progressFill = document.getElementById('progressFill'); // 进度条填充层（靠宽度百分比驱动）
// 控制按钮
const $btnStart = document.getElementById('btnStart'); // 开始按钮
const $btnPause = document.getElementById('btnPause'); // 暂停按钮
const $btnReset = document.getElementById('btnReset'); // 重置按钮（回到当前阶段起点）
const $btnSkip = document.getElementById('btnSkip'); // 跳过按钮（直接进入下一阶段）
// 时长设置输入框
const $workDuration = document.getElementById('workDuration'); // 工作时长（分钟）
const $shortBreakDuration = document.getElementById('shortBreakDuration'); // 短休息时长
const $longBreakDuration = document.getElementById('longBreakDuration'); // 长休息时长
const $longBreakInterval = document.getElementById('longBreakInterval'); // 每隔几轮触发长休息
// 选项开关
const $alwaysOnTop = document.getElementById('alwaysOnTop'); // 窗口置顶
const $soundEnabled = document.getElementById('soundEnabled'); // 提示音开关
const $notificationEnabled = document.getElementById('notificationEnabled'); // 桌面通知开关
const $alarmSound = document.getElementById('alarmSound'); // 音频元素（base64 WAV）
// 任务面板
const $taskInput = document.getElementById('taskInput'); // 任务输入框
const $btnAddTask = document.getElementById('btnAddTask'); // 添加任务按钮
const $taskList = document.getElementById('taskList'); // 任务列表容器 <ul>
const $taskActions = document.getElementById('taskActions'); // 批量操作区域
const $btnClearDone = document.getElementById('btnClearDone'); // 清除已完成任务按钮
// 历史面板
const $historyStats = document.getElementById('historyStats'); // 统计卡片区域
const $historyList = document.getElementById('historyList'); // 历史记录列表
const $btnClearHistory = document.getElementById('btnClearHistory'); // 清除历史按钮

// ===== 第二部分：应用状态 =====
// 这是整个 renderer 的单一状态源（single source of truth）
// 模式枚举：用一个常量对象避免魔法字符串
const MODES = { WORK: 'work', SHORT_BREAK: 'short-break', LONG_BREAK: 'long-break' };

let state = {
  currentMode: MODES.WORK, // 当前模式：work | short-break | long-break
  timeLeft: 25 * 60, // 剩余秒数（初始化为 25 分钟）
  totalTime: 25 * 60, // 当前阶段总秒数（用于计算进度百分比）
  cycle: 0, // 已完成的工作轮数（0 表示尚未完成第一轮）
  isRunning: false, // 计时器是否正在运行
  intervalId: null, // setInterval 返回的 ID，用于 clearInterval
  tasks: [], // 任务数组 [{text, done, pomos, createdAt}, ...]
  history: [], // 历史记录数组 [{type, duration, date, task}, ...]
  taskFilter: 'all', // 任务筛选条件：all | active | done
  tickCount: 0 // 用于节流每秒回调中的 IPC 操作
};

// ===== 第三部分：UI 更新函数 =====

/**
 * 更新所有与时间相关的显示：
 * - 计时器数字（MM:SS 格式）
 * - 进度条宽度（0% ~ 100%）
 * - 浏览器标签页标题（切换回来时能看到时间）
 * - 系统托盘提示文字
 */
function updateDisplay() {
  // 计算并格式化 MM:SS
  const m = Math.floor(state.timeLeft / 60);
  const s = state.timeLeft % 60;
  $timerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  // 更新进度条：已过时间 / 总时间 → 百分比
  const pct =
    state.totalTime > 0 ? ((state.totalTime - state.timeLeft) / state.totalTime) * 100 : 0;
  $progressFill.style.width = `${pct}%`;

  // 标签页标题，方便在任务栏看到剩余时间
  document.title = `${$timerDisplay.textContent} - 番茄钟`;

  // 托盘 tooltip：每 30 秒更新一次，避免每秒 IPC 跨进程调用
  if (state.tickCount % 30 === 0) {
    const modeLabel =
      state.currentMode === MODES.WORK
        ? '工作中'
        : state.currentMode === MODES.LONG_BREAK
          ? '长休息'
          : '短休息';
    window.electronAPI?.updateTrayTooltip(`番茄钟 - ${modeLabel} ${$timerDisplay.textContent}`);
  }
}

/**
 * 停止计时器：
 * - 清除 setInterval
 * - 恢复按钮状态
 * 注意：此函数不修改 timeLeft，只是停止计时
 */
function stopTimer() {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.isRunning = false;
  $btnStart.disabled = false;
  $btnPause.disabled = true;
  $btnStart.textContent = '开始';
}

/**
 * 将任务和历史数据持久化到磁盘
 * 通过 IPC 调用主进程的 save-data handler → 写入 JSON 文件
 */
function saveState() {
  window.electronAPI?.saveData({
    tasks: state.tasks,
    history: state.history
  });
}

/**
 * 从磁盘加载历史数据和任务列表
 * 应用启动时调用，恢复上次使用状态
 */
async function loadState() {
  if (!window.electronAPI) return;
  const data = await window.electronAPI.getData();
  if (data) {
    state.tasks = data.tasks || [];
    state.history = data.history || [];
  }
  renderTasks();
  renderHistory();
}

/**
 * 播放提示音
 * 只有 $soundEnabled 复选框勾选时才播放
 * .catch() 吞掉浏览器自动播放策略导致的异常
 */
function playAlarm() {
  if ($soundEnabled.checked) {
    $alarmSound.currentTime = 0; // 从头开始播放（支持快速连续触发）
    $alarmSound.play().catch(() => {});
  }
}

/**
 * 发送桌面通知
 * 只有 $notificationEnabled 复选框勾选时才发送
 * 底层由主进程的 Notification API 实现
 */
function notify(title, body) {
  if ($notificationEnabled.checked) {
    window.electronAPI?.sendNotification({ title, body });
  }
}

// ===== 第四部分：计时器核心逻辑 =====

// 缓存时长值，避免每次 getDuration 都读 DOM
let durationCache = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60
};

function refreshDurationCache() {
  durationCache = {
    work: parseInt($workDuration.value) * 60,
    shortBreak: parseInt($shortBreakDuration.value) * 60,
    longBreak: parseInt($longBreakDuration.value) * 60
  };
}

/**
 * 根据模式获取对应的时长（秒）
 * 使用缓存值，仅在用户修改设置时刷新
 */
function getDuration(mode) {
  switch (mode) {
    case MODES.WORK:
      return durationCache.work;
    case MODES.SHORT_BREAK:
      return durationCache.shortBreak;
    case MODES.LONG_BREAK:
      return durationCache.longBreak;
    default:
      return 25 * 60; // 兜底值
  }
}

/**
 * 切换到指定模式并重置倒计时
 * 用于：休息结束 → 工作、工作结束 → 休息、跳过等场景
 */
function switchMode(mode) {
  state.currentMode = mode;
  state.timeLeft = getDuration(mode); // 按新模式取时长
  state.totalTime = state.timeLeft; // 总时间同步更新
  updateModeUI();
  updateDisplay();
}

/**
 * 更新模式相关 UI：
 * - 模式指示器（背景色 + 文字）
 * - 轮次信息
 * 三种模式用不同的 CSS class 区分颜色：
 *   work → 红色、short-break → 绿色、long-break → 蓝色
 */
function updateModeUI() {
  $modeIndicator.className = 'mode-indicator ' + state.currentMode;
  if (state.currentMode === MODES.WORK) {
    $modeIndicator.textContent = '工作中';
  } else if (state.currentMode === MODES.SHORT_BREAK) {
    $modeIndicator.textContent = '短休息';
  } else {
    $modeIndicator.textContent = '长休息';
  }
  $cycleInfo.textContent = `第 ${state.cycle} / ${$longBreakInterval.value} 轮`;
}

/**
 * 计时器每秒回调 —— 整个应用最核心的函数
 * 每秒执行一次（由 setInterval 驱动）
 *
 * 逻辑分两条路径：
 * 1. 秒数未到 0：timeLeft--，更新显示
 * 2. 秒数到 0（当前阶段结束）：
 *    a. 停止计时、播放提示音
 *    b. 工作阶段结束 → cycle++、记录历史、判断该进入短休息还是长休息
 *    c. 休息阶段结束 → 记录历史、切换回工作模式
 *    d. 关联当前未完成任务，增加其番茄计数
 */
function onTimerTick() {
  // --- 路径 1：倒计时尚未结束，只减秒 ---
  if (state.timeLeft > 0) {
    state.timeLeft--;
    state.tickCount++;
    updateDisplay();
    return;
  }

  // --- 路径 2：倒计时到 0，阶段切换 ---
  stopTimer();
  playAlarm();

  if (state.currentMode === MODES.WORK) {
    // ---- 工作阶段结束 ----
    // 找到第一个未完成的任务（用于关联到历史记录和增加番茄数）
    const completedTask = state.tasks.find((t) => !t.done);

    // 记录工作完成事件到历史
    const historyEntry = {
      type: 'work',
      duration: state.totalTime,
      date: new Date().toISOString(),
      task: completedTask ? completedTask.text : null
    };
    state.history.unshift(historyEntry); // unshift → 最新在前
    if (state.history.length > 1000) state.history.length = 1000; // 防止无限增长
    state.cycle++; // 完成一轮工作，轮数 +1
    updateCycleInfo();
    saveState();

    // 给关联任务增加番茄计数
    if (completedTask) {
      completedTask.pomos = (completedTask.pomos || 0) + 1;
      saveState();
    }

    notify('工作完成！', '该休息一下了。');
    renderHistory();

    // 判断进入长休息还是短休息
    // 条件：cycle > 0（防止第 0 轮触发）且 cycle 是 interval 的整数倍
    const interval = parseInt($longBreakInterval.value);
    if (state.cycle > 0 && state.cycle % interval === 0) {
      switchMode(MODES.LONG_BREAK);
      notify('长休息', `休息 ${$longBreakDuration.value} 分钟吧。`);
    } else {
      switchMode(MODES.SHORT_BREAK);
    }
  } else {
    // ---- 休息阶段结束（短休息或长休息） ----
    const breakType = state.currentMode === MODES.LONG_BREAK ? 'long-break' : 'short-break';
    const historyEntry = {
      type: breakType,
      duration: state.totalTime,
      date: new Date().toISOString()
    };
    state.history.unshift(historyEntry);
    if (state.history.length > 1000) state.history.length = 1000;
    saveState();
    renderHistory();

    notify('休息结束！', '继续工作吧。');
    switchMode(MODES.WORK);
  }

  updateCycleInfo();
  updateDisplay();
}

/** 更新轮次显示 */
function updateCycleInfo() {
  $cycleInfo.textContent = `第 ${state.cycle} / ${$longBreakInterval.value} 轮`;
}

/**
 * 开始计时
 * - 如果已经运行中则忽略（防止重复 setInterval）
 * - 如果 timeLeft 为 0，说明阶段刚切换，取满时长
 */
function startTimer() {
  if (state.isRunning) return;
  state.isRunning = true;
  // 修正 totalTime：初次启动或重置后 timeLeft = totalTime
  state.totalTime = state.timeLeft > 0 ? state.timeLeft : getDuration(state.currentMode);
  if (state.timeLeft === 0) state.timeLeft = state.totalTime;
  state.intervalId = setInterval(onTimerTick, 1000);
  $btnStart.disabled = true;
  $btnPause.disabled = false;
  $btnStart.textContent = '运行中...';
}

/** 暂停计时 —— 直接调用 stopTimer */
function pauseTimer() {
  stopTimer();
}

/**
 * 重置当前阶段
 * 回到当前模式的初始时长，但保持计时器停止状态
 */
function resetTimer() {
  stopTimer();
  state.timeLeft = getDuration(state.currentMode);
  state.totalTime = state.timeLeft;
  updateDisplay();
}

/**
 * 跳过当前阶段
 * 工作阶段 → 直接进入休息（不记录历史、不增加 cycle、不增加番茄数）
 * 休息阶段 → 直接回到工作
 * 这个设计符合番茄工作法的"跳过休息"场景
 */
function skipTimer() {
  stopTimer();
  if (state.currentMode === MODES.WORK) {
    // 如果是工作模式被跳过，也需要检查长休息条件
    const interval = parseInt($longBreakInterval.value);
    if (state.cycle > 0 && state.cycle % interval === 0) {
      switchMode(MODES.LONG_BREAK);
    } else {
      switchMode(MODES.SHORT_BREAK);
    }
  } else {
    switchMode(MODES.WORK);
  }
}

/**
 * 设置变更回调
 * 用户在时长/轮次输入框修改值时触发
 * 计时器未运行时立即更新显示，运行中则不影响当前倒计时
 */
function applySettings() {
  refreshDurationCache();
  if (!state.isRunning) {
    state.timeLeft = getDuration(state.currentMode);
    state.totalTime = state.timeLeft;
    updateDisplay();
  }
  updateCycleInfo();
}

// ===== 第五部分：任务管理 =====

/**
 * 渲染任务列表
 * 根据 state.taskFilter 筛选全部/进行中/已完成
 * 使用 innerHTML 直接渲染（简单场景，不引入虚拟 DOM）
 */
function renderTasks() {
  // 筛选
  const filtered = state.tasks.filter((t) => {
    if (state.taskFilter === 'active') return !t.done;
    if (state.taskFilter === 'done') return t.done;
    return true; // 'all'
  });

  // 空状态
  if (filtered.length === 0) {
    $taskList.innerHTML = '<div class="empty-state">暂无任务，在上方添加一个吧！</div>';
  } else {
    // 每个任务渲染为 checkbox + 文字 + 番茄数 + 删除按钮
    // 用 Map 预建索引，避免 .map 内 O(N) 的 indexOf
    const indexMap = new Map(state.tasks.map((t, i) => [t, i]));
    $taskList.innerHTML = filtered
      .map((t) => {
        const realIdx = indexMap.get(t);
        return `
        <li class="task-item ${t.done ? 'done' : ''}">
          <input type="checkbox" class="task-checkbox" data-idx="${realIdx}" ${t.done ? 'checked' : ''}>
          <span class="task-text">${escapeHtml(t.text)}</span>
          ${t.pomos ? `<span class="task-pomos">${t.pomos} 个番茄</span>` : ''}
          <button class="task-delete" data-idx="${realIdx}" title="删除">✕</button>
        </li>`;
      })
      .join('');
  }

  // 有已完成任务时才显示"清除已完成"按钮
  const hasDone = state.tasks.some((t) => t.done);
  $taskActions.style.display = hasDone ? 'block' : 'none';
}

/**
 * 添加任务
 * 新任务插入到列表头部（最新在前），包含创建时间戳
 */
function addTask() {
  const text = $taskInput.value.trim();
  if (!text) return;
  state.tasks.unshift({ text, done: false, pomos: 0, createdAt: new Date().toISOString() });
  $taskInput.value = '';
  saveState();
  renderTasks();
}

/**
 * 切换任务完成状态
 * @param {number} idx - 任务在 state.tasks 中的原始索引
 */
function toggleTask(idx) {
  state.tasks[idx].done = !state.tasks[idx].done;
  saveState();
  renderTasks();
}

/**
 * 删除单个任务
 * @param {number} idx - 任务在 state.tasks 中的原始索引
 */
function deleteTask(idx) {
  state.tasks.splice(idx, 1);
  saveState();
  renderTasks();
}

/** 批量清除所有已完成任务 */
function clearDoneTasks() {
  state.tasks = state.tasks.filter((t) => !t.done);
  saveState();
  renderTasks();
}

// ===== 第六部分：历史记录 =====

/**
 * 渲染历史记录面板
 * 统计区：今日番茄数、今日工时（分钟）、累计番茄总数
 * 列表区：最近 50 条记录，按时间倒序
 */
function renderHistory() {
  // --- 计算今日数据 ---
  // 一次遍历同时统计：今日番茄数 + 今日工时
  const today = new Date().toDateString();
  let totalWorkToday = 0;
  let totalPomosToday = 0;
  for (const h of state.history) {
    if (new Date(h.date).toDateString() !== today) continue;
    if (h.type !== 'work') continue;
    totalWorkToday += h.duration;
    totalPomosToday++;
  }
  const workMinutes = Math.floor(totalWorkToday / 60);

  // 统计卡片
  $historyStats.innerHTML = `
    <div class="stat-card">
      <div class="stat-number">${totalPomosToday}</div>
      <div class="stat-label">今日番茄数</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${workMinutes}分钟</div>
      <div class="stat-label">今日工时</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${state.history.filter((h) => h.type === 'work').length}</div>
      <div class="stat-label">累计番茄</div>
    </div>
  `;

  // --- 历史时间线（最近 50 条）---
  const recent = state.history.slice(0, 50);
  if (recent.length === 0) {
    $historyList.innerHTML = '<div class="empty-state">暂无记录，开始你的第一个番茄吧！</div>';
  } else {
    $historyList.innerHTML = recent
      .map((h) => {
        const d = new Date(h.date);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = d.toLocaleDateString();
        const mins = Math.floor(h.duration / 60);
        // 用 emoji 区分类型
        const icon = h.type === 'work' ? '🍅' : h.type === 'long-break' ? '☕' : '🫗';
        const typeLabel =
          h.type === 'work' ? '工作' : h.type === 'long-break' ? '长休息' : '短休息';
        // 仅工作记录显示关联的任务名
        const taskInfo = h.task
          ? `<div style="font-size:11px;color:#888;">${escapeHtml(h.task)}</div>`
          : '';
        return `
        <div class="history-item">
          <div class="history-icon">${icon}</div>
          <div class="history-detail">
            <div class="time">${mins} 分钟</div>
            <div class="date">${dateStr} ${timeStr}</div>
            ${taskInfo}
          </div>
          <span class="history-type ${h.type}">${typeLabel}</span>
        </div>`;
      })
      .join('');
  }
}

/** 清空全部历史记录 */
function clearHistory() {
  state.history = [];
  saveState();
  renderHistory();
}

// ===== 第七部分：事件监听 =====

// --- 计时器控制按钮 ---
$btnStart.addEventListener('click', startTimer);
$btnPause.addEventListener('click', pauseTimer);
$btnReset.addEventListener('click', resetTimer);
$btnSkip.addEventListener('click', skipTimer);

// --- 时长设置：任何输入框值变更时触发 ---
[$workDuration, $shortBreakDuration, $longBreakDuration, $longBreakInterval].forEach((el) => {
  el.addEventListener('change', applySettings);
});

// --- 窗口置顶：复选框变更时通知主进程 ---
$alwaysOnTop.addEventListener('change', () => {
  window.electronAPI?.setAlwaysOnTop($alwaysOnTop.checked);
});

// --- 任务面板事件 ---
$btnAddTask.addEventListener('click', addTask);
// 回车也能添加任务
$taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});
// 使用事件委托处理列表内的点击——避免给每个 checkbox/删除按钮绑定事件
// 通过 data-idx 属性定位被点击的任务在数组中的位置
$taskList.addEventListener('click', (e) => {
  // 点击了 checkbox → 切换完成状态
  const cb = e.target.closest('.task-checkbox');
  if (cb) {
    toggleTask(parseInt(cb.dataset.idx));
    return;
  }
  // 点击了删除按钮 → 删除该任务
  const del = e.target.closest('.task-delete');
  if (del) {
    deleteTask(parseInt(del.dataset.idx));
    return;
  }
});
$btnClearDone.addEventListener('click', clearDoneTasks);

// --- 任务筛选器（全部 / 进行中 / 已完成）---
document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    // 切换 active 样式
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    // 更新筛选条件并重渲染
    state.taskFilter = btn.dataset.filter;
    renderTasks();
  });
});

// --- 清除历史 ---
$btnClearHistory.addEventListener('click', clearHistory);

// --- 标签页切换（计时 / 任务 / 历史）---
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    // 移除所有 active 状态
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    // 为当前标签和内容添加 active
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    // 切换时刷新数据（因为可能在计时页操作了任务/历史）
    if (tab.dataset.tab === 'history') renderHistory();
    if (tab.dataset.tab === 'tasks') renderTasks();
  });
});

// --- 系统托盘"开始/暂停"菜单项 ---
window.electronAPI?.onTrayToggle(() => {
  if (state.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
});

// --- 键盘快捷键（仅在非输入框状态下生效）---
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return; // 正在输入文字时不拦截
  switch (e.code) {
    case 'Space':
      e.preventDefault(); // 阻止空格默认的页面滚动行为
      state.isRunning ? pauseTimer() : startTimer();
      break;
    case 'KeyR':
      resetTimer();
      break;
    case 'KeyS':
      skipTimer();
      break;
  }
});

// ===== 第八部分：关闭按钮行为 =====

const $closeActionSelect = document.getElementById('closeActionSelect');
const $btnResetCloseAction = document.getElementById('btnResetCloseAction');
const $closeHint = document.getElementById('closeHint');

/**
 * 加载用户保存的关闭行为偏好
 * 选项：询问 / 托盘 / 退出（空字符串 = 每次询问）
 */
async function loadCloseActionConfig() {
  if (!window.electronAPI) return;
  const config = await window.electronAPI.getConfig();
  const action = config.closeAction || '';
  $closeActionSelect.value = action;
  updateCloseHint(action);
}

/** 在 UI 上显示当前选择对应的提示文字 */
function updateCloseHint(action) {
  if (action === 'tray') {
    $closeHint.textContent = '当前：点击关闭按钮将最小化到系统托盘';
  } else if (action === 'quit') {
    $closeHint.textContent = '当前：点击关闭按钮将直接退出程序';
  } else {
    $closeHint.textContent = '当前：每次关闭时询问';
  }
}

// 关闭行为下拉框变更 → 立即保存到主进程
$closeActionSelect.addEventListener('change', async () => {
  const value = $closeActionSelect.value;
  await window.electronAPI?.saveConfig({ closeAction: value || undefined });
  updateCloseHint(value);
});

// "恢复询问"按钮 → 清除保存的选择，回到每次询问模式
$btnResetCloseAction.addEventListener('click', async () => {
  await window.electronAPI?.resetCloseAction();
  $closeActionSelect.value = '';
  $closeHint.textContent = '已恢复：每次关闭时询问';
});

// ===== 第九部分：工具函数 =====

/**
 * HTML 转义：防止用户输入中的 < > & " ' 被浏览器解析为 HTML
 * 使用浏览器的 DOM API 是最安全的方式（比正则覆盖所有边界情况更可靠）
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str; // textContent 会自动转义所有 HTML 特殊字符
  return div.innerHTML; // 取回转义后的字符串
}

// ===== 第十部分：初始化 =====
// 页面加载完成后立即执行
updateModeUI(); // 显示初始模式（工作中）和轮次
updateDisplay(); // 显示初始时间 25:00
loadState(); // 异步加载历史数据和任务列表
loadCloseActionConfig(); // 异步加载关闭行为偏好
