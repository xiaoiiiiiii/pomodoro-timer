const {
  escapeHtml,
  formatTime,
  getDurationSeconds,
  computeNextMode,
  computeProgressPercent
} = require('../timer-logic');

describe('escapeHtml', () => {
  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('escapes < and >', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes &', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('formatTime', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('formats 65 seconds as 01:05', () => {
    expect(formatTime(65)).toBe('01:05');
  });

  it('formats 25 minutes', () => {
    expect(formatTime(25 * 60)).toBe('25:00');
  });

  it('formats 59 seconds as 00:59', () => {
    expect(formatTime(59)).toBe('00:59');
  });
});

describe('getDurationSeconds', () => {
  const settings = { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 };

  it('returns work duration', () => {
    expect(getDurationSeconds('work', settings)).toBe(1500);
  });

  it('returns short break duration', () => {
    expect(getDurationSeconds('short-break', settings)).toBe(300);
  });

  it('returns long break duration', () => {
    expect(getDurationSeconds('long-break', settings)).toBe(900);
  });

  it('defaults to 25 min for unknown mode', () => {
    expect(getDurationSeconds('unknown', settings)).toBe(1500);
  });
});

describe('computeNextMode', () => {
  it('work -> short-break (cycle 1, interval 4)', () => {
    expect(computeNextMode('work', 1, 4)).toBe('short-break');
  });

  it('work -> long-break at interval boundary (cycle 4, interval 4)', () => {
    expect(computeNextMode('work', 4, 4)).toBe('long-break');
  });

  it('short-break -> work', () => {
    expect(computeNextMode('short-break', 1, 4)).toBe('work');
  });

  it('long-break -> work', () => {
    expect(computeNextMode('long-break', 4, 4)).toBe('work');
  });
});

describe('computeProgressPercent', () => {
  it('returns 0 at start', () => {
    expect(computeProgressPercent(1500, 1500)).toBe(0);
  });

  it('returns 50 at halfway', () => {
    expect(computeProgressPercent(750, 1500)).toBe(50);
  });

  it('returns 100 when finished', () => {
    expect(computeProgressPercent(0, 1500)).toBe(100);
  });

  it('returns 0 when totalTime is 0', () => {
    expect(computeProgressPercent(0, 0)).toBe(0);
  });
});
