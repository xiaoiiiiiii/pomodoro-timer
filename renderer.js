// ===== DOM Elements =====
const $timerDisplay = document.getElementById('timerDisplay');
const $modeIndicator = document.getElementById('modeIndicator');
const $cycleInfo = document.getElementById('cycleInfo');
const $progressFill = document.getElementById('progressFill');
const $btnStart = document.getElementById('btnStart');
const $btnPause = document.getElementById('btnPause');
const $btnReset = document.getElementById('btnReset');
const $btnSkip = document.getElementById('btnSkip');
const $workDuration = document.getElementById('workDuration');
const $shortBreakDuration = document.getElementById('shortBreakDuration');
const $longBreakDuration = document.getElementById('longBreakDuration');
const $longBreakInterval = document.getElementById('longBreakInterval');
const $alwaysOnTop = document.getElementById('alwaysOnTop');
const $soundEnabled = document.getElementById('soundEnabled');
const $notificationEnabled = document.getElementById('notificationEnabled');
const $alarmSound = document.getElementById('alarmSound');
const $taskInput = document.getElementById('taskInput');
const $btnAddTask = document.getElementById('btnAddTask');
const $taskList = document.getElementById('taskList');
const $taskActions = document.getElementById('taskActions');
const $btnClearDone = document.getElementById('btnClearDone');
const $historyStats = document.getElementById('historyStats');
const $historyList = document.getElementById('historyList');
const $btnClearHistory = document.getElementById('btnClearHistory');

// ===== State =====
const MODES = { WORK: 'work', SHORT_BREAK: 'short-break', LONG_BREAK: 'long-break' };

let state = {
  currentMode: MODES.WORK,
  timeLeft: 25 * 60,
  totalTime: 25 * 60,
  cycle: 0,
  isRunning: false,
  intervalId: null,
  tasks: [],
  history: [],
  taskFilter: 'all'
};

function updateDisplay() {
  const m = Math.floor(state.timeLeft / 60);
  const s = state.timeLeft % 60;
  $timerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const pct =
    state.totalTime > 0 ? ((state.totalTime - state.timeLeft) / state.totalTime) * 100 : 0;
  $progressFill.style.width = `${pct}%`;
  document.title = `${$timerDisplay.textContent} - 番茄钟`;

  const modeLabel =
    state.currentMode === MODES.WORK
      ? '工作中'
      : state.currentMode === MODES.LONG_BREAK
        ? '长休息'
        : '短休息';
  window.electronAPI?.updateTrayTooltip(`番茄钟 - ${modeLabel} ${$timerDisplay.textContent}`);
}

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

function saveState() {
  window.electronAPI?.saveData({
    tasks: state.tasks,
    history: state.history
  });
}

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

function playAlarm() {
  if ($soundEnabled.checked) {
    $alarmSound.currentTime = 0;
    $alarmSound.play().catch(() => {});
  }
}

function notify(title, body) {
  if ($notificationEnabled.checked) {
    window.electronAPI?.sendNotification({ title, body });
  }
}

// ===== Timer Logic =====
function getDuration(mode) {
  switch (mode) {
    case MODES.WORK:
      return parseInt($workDuration.value) * 60;
    case MODES.SHORT_BREAK:
      return parseInt($shortBreakDuration.value) * 60;
    case MODES.LONG_BREAK:
      return parseInt($longBreakDuration.value) * 60;
    default:
      return 25 * 60;
  }
}

function switchMode(mode) {
  state.currentMode = mode;
  state.timeLeft = getDuration(mode);
  state.totalTime = state.timeLeft;
  updateModeUI();
  updateDisplay();
}

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

function onTimerTick() {
  if (state.timeLeft > 0) {
    state.timeLeft--;
    updateDisplay();
    return;
  }

  stopTimer();
  playAlarm();

  if (state.currentMode === MODES.WORK) {
    const completedTask = state.tasks.find((t) => !t.done);
    const historyEntry = {
      type: 'work',
      duration: state.totalTime,
      date: new Date().toISOString(),
      task: completedTask ? completedTask.text : null
    };
    state.history.unshift(historyEntry);
    state.cycle++;
    updateCycleInfo();
    saveState();

    if (completedTask) {
      completedTask.pomos = (completedTask.pomos || 0) + 1;
      saveState();
    }

    notify('工作完成！', '该休息一下了。');
    renderHistory();

    const interval = parseInt($longBreakInterval.value);
    if (state.cycle > 0 && state.cycle % interval === 0) {
      switchMode(MODES.LONG_BREAK);
      notify('长休息', `休息 ${$longBreakDuration.value} 分钟吧。`);
    } else {
      switchMode(MODES.SHORT_BREAK);
    }
  } else {
    const breakType = state.currentMode === MODES.LONG_BREAK ? 'long-break' : 'short-break';
    const historyEntry = {
      type: breakType,
      duration: state.totalTime,
      date: new Date().toISOString()
    };
    state.history.unshift(historyEntry);
    saveState();
    renderHistory();

    notify('休息结束！', '继续工作吧。');
    switchMode(MODES.WORK);
  }

  updateCycleInfo();
  updateDisplay();
}

function updateCycleInfo() {
  $cycleInfo.textContent = `第 ${state.cycle} / ${$longBreakInterval.value} 轮`;
}

function startTimer() {
  if (state.isRunning) return;
  state.isRunning = true;
  state.totalTime = state.timeLeft > 0 ? state.timeLeft : getDuration(state.currentMode);
  if (state.timeLeft === 0) state.timeLeft = state.totalTime;
  state.intervalId = setInterval(onTimerTick, 1000);
  $btnStart.disabled = true;
  $btnPause.disabled = false;
  $btnStart.textContent = '运行中...';
}

function pauseTimer() {
  stopTimer();
}

function resetTimer() {
  stopTimer();
  state.timeLeft = getDuration(state.currentMode);
  state.totalTime = state.timeLeft;
  updateDisplay();
}

function skipTimer() {
  stopTimer();
  if (state.currentMode === MODES.WORK) {
    state.timeLeft = getDuration(state.currentMode);
    state.totalTime = state.timeLeft;
    const interval = parseInt($longBreakInterval.value);
    if (state.cycle > 0 && state.cycle % interval === 0) {
      switchMode(MODES.LONG_BREAK);
    } else {
      switchMode(MODES.SHORT_BREAK);
    }
  } else {
    switchMode(MODES.WORK);
  }
  updateDisplay();
}

function applySettings() {
  if (!state.isRunning) {
    state.timeLeft = getDuration(state.currentMode);
    state.totalTime = state.timeLeft;
    updateDisplay();
  }
  updateCycleInfo();
}

// ===== Tasks =====
function renderTasks() {
  const filtered = state.tasks.filter((t) => {
    if (state.taskFilter === 'active') return !t.done;
    if (state.taskFilter === 'done') return t.done;
    return true;
  });

  if (filtered.length === 0) {
    $taskList.innerHTML = '<div class="empty-state">暂无任务，在上方添加一个吧！</div>';
  } else {
    $taskList.innerHTML = filtered
      .map((t) => {
        const realIdx = state.tasks.indexOf(t);
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

  const hasDone = state.tasks.some((t) => t.done);
  $taskActions.style.display = hasDone ? 'block' : 'none';
}

function addTask() {
  const text = $taskInput.value.trim();
  if (!text) return;
  state.tasks.unshift({ text, done: false, pomos: 0, createdAt: new Date().toISOString() });
  $taskInput.value = '';
  saveState();
  renderTasks();
}

function toggleTask(idx) {
  state.tasks[idx].done = !state.tasks[idx].done;
  saveState();
  renderTasks();
}

function deleteTask(idx) {
  state.tasks.splice(idx, 1);
  saveState();
  renderTasks();
}

function clearDoneTasks() {
  state.tasks = state.tasks.filter((t) => !t.done);
  saveState();
  renderTasks();
}

// ===== History =====
function renderHistory() {
  const today = new Date().toDateString();
  const todayEntries = state.history.filter((h) => new Date(h.date).toDateString() === today);
  const totalWorkToday = todayEntries
    .filter((h) => h.type === 'work')
    .reduce((sum, h) => sum + h.duration, 0);
  const workMinutes = Math.floor(totalWorkToday / 60);
  const totalPomosToday = todayEntries.filter((h) => h.type === 'work').length;

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
        const icon = h.type === 'work' ? '🍅' : h.type === 'long-break' ? '☕' : '🫗';
        const typeLabel =
          h.type === 'work' ? '工作' : h.type === 'long-break' ? '长休息' : '短休息';
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

function clearHistory() {
  state.history = [];
  saveState();
  renderHistory();
}

// ===== Event Listeners =====
$btnStart.addEventListener('click', startTimer);
$btnPause.addEventListener('click', pauseTimer);
$btnReset.addEventListener('click', resetTimer);
$btnSkip.addEventListener('click', skipTimer);

[$workDuration, $shortBreakDuration, $longBreakDuration, $longBreakInterval].forEach((el) => {
  el.addEventListener('change', applySettings);
});

$alwaysOnTop.addEventListener('change', () => {
  window.electronAPI?.setAlwaysOnTop($alwaysOnTop.checked);
});

// Task events
$btnAddTask.addEventListener('click', addTask);
$taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});
$taskList.addEventListener('click', (e) => {
  const cb = e.target.closest('.task-checkbox');
  if (cb) {
    toggleTask(parseInt(cb.dataset.idx));
    return;
  }
  const del = e.target.closest('.task-delete');
  if (del) {
    deleteTask(parseInt(del.dataset.idx));
    return;
  }
});
$btnClearDone.addEventListener('click', clearDoneTasks);

// Task filters
document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.taskFilter = btn.dataset.filter;
    renderTasks();
  });
});

// History
$btnClearHistory.addEventListener('click', clearHistory);

// Tab switching
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'history') renderHistory();
    if (tab.dataset.tab === 'tasks') renderTasks();
  });
});

// Tray toggle
window.electronAPI?.onTrayToggle(() => {
  if (state.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  switch (e.code) {
    case 'Space':
      e.preventDefault();
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

// ===== Close Behavior =====
const $closeActionSelect = document.getElementById('closeActionSelect');
const $btnResetCloseAction = document.getElementById('btnResetCloseAction');
const $closeHint = document.getElementById('closeHint');

async function loadCloseActionConfig() {
  if (!window.electronAPI) return;
  const config = await window.electronAPI.getConfig();
  const action = config.closeAction || '';
  $closeActionSelect.value = action;
  updateCloseHint(action);
}

function updateCloseHint(action) {
  if (action === 'tray') {
    $closeHint.textContent = '当前：点击关闭按钮将最小化到系统托盘';
  } else if (action === 'quit') {
    $closeHint.textContent = '当前：点击关闭按钮将直接退出程序';
  } else {
    $closeHint.textContent = '当前：每次关闭时询问';
  }
}

$closeActionSelect.addEventListener('change', async () => {
  const value = $closeActionSelect.value;
  await window.electronAPI?.saveConfig({ closeAction: value || undefined });
  updateCloseHint(value);
});

$btnResetCloseAction.addEventListener('click', async () => {
  await window.electronAPI?.resetCloseAction();
  $closeActionSelect.value = '';
  $closeHint.textContent = '已恢复：每次关闭时询问';
});

// ===== Helpers =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Init =====
updateModeUI();
updateDisplay();
loadState();
loadCloseActionConfig();
