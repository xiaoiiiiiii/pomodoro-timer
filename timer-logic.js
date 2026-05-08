// Pure logic functions shared between renderer and tests
const TimerLogic = (() => {
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function getDurationSeconds(mode, settings) {
    switch (mode) {
      case 'work':
        return settings.workMinutes * 60;
      case 'short-break':
        return settings.shortBreakMinutes * 60;
      case 'long-break':
        return settings.longBreakMinutes * 60;
      default:
        return 25 * 60;
    }
  }

  function computeNextMode(currentMode, cycle, longBreakInterval) {
    if (currentMode === 'work') {
      if (cycle > 0 && cycle % longBreakInterval === 0) {
        return 'long-break';
      }
      return 'short-break';
    }
    return 'work';
  }

  function computeProgressPercent(timeLeft, totalTime) {
    if (totalTime <= 0) return 0;
    return ((totalTime - timeLeft) / totalTime) * 100;
  }

  return { escapeHtml, formatTime, getDurationSeconds, computeNextMode, computeProgressPercent };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TimerLogic;
}
