const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const html = readFileSync(require('node:path').join(__dirname, '../timeit/index.html'), 'utf8');
const context = vm.createContext({ Intl, Date });
vm.runInContext(html.match(/const prayerFields=.*?;/)[0] + html.slice(html.indexOf('    const londonParts='), html.indexOf('    function updateSalahCountdown')), context);
const instant = (date, time) => context.londonInstant(date, time);
const day = date => ({ d_date: date, fajr_begins: '04:27:00', fajr_jamah: '05:30:00', sunrise: '06:27:00', zuhr_begins: '13:02:00', zuhr_jamah: '13:30:00', asr_mithl_2: '17:24:00', asr_jamah: '17:45:00', maghrib_begins: '19:31:00', maghrib_jamah: '19:31:00', isha_begins: '21:03:00', isha_jamah: '21:30:00' });
const next = (days, now, mode = 'begins') => context.findNextSalah(days, Date.parse(now), mode);
vm.runInContext(html.slice(html.indexOf('    function dueAdhans('), html.indexOf('    function updateAdhanControls(')), context);
const due = (now, enabled = '2026-09-10T00:00:00Z', played = new Set()) => context.dueAdhans([day('2026-09-10')], Date.parse(now), Date.parse(enabled), played);

test('London winter and summer offsets are independent of the device timezone', () => {
  assert.equal(instant('2026-01-10', '13:02:00'), Date.parse('2026-01-10T13:02:00Z'));
  assert.equal(instant('2026-09-10', '13:02:00'), Date.parse('2026-09-10T12:02:00Z'));
});
test('Fajr after both DST transitions uses the new offset', () => {
  assert.equal(instant('2026-03-29', '04:27:00'), Date.parse('2026-03-29T03:27:00Z'));
  assert.equal(instant('2026-10-25', '04:27:00'), Date.parse('2026-10-25T04:27:00Z'));
});
test('sunrise is excluded and an elapsed salah advances immediately', () => {
  assert.equal(next([day('2026-09-10')], '2026-09-10T03:27:00Z').name, 'Zuhr');
});
test('Iqamah mode can target the current prayer congregation', () => {
  assert.equal(next([day('2026-09-10')], '2026-09-10T03:27:00Z', 'iqamah').name, 'Fajr');
});
test('after Isha the countdown uses tomorrow Fajr, including after midnight', () => {
  const days = [day('2026-09-10'), day('2026-09-11')];
  for (const now of ['2026-09-10T21:00:00Z', '2026-09-10T23:30:00Z']) {
    const event = next(days, now);
    assert.equal(event.name, 'Fajr');
    assert.equal(event.date, '2026-09-11');
  }
});
test('missing, stale or invalid data cannot create a countdown', () => {
  assert.equal(next([], '2026-09-10T12:00:00Z'), null);
  assert.equal(next([day('2026-09-09')], '2026-09-10T12:00:00Z'), null);
  assert.equal(next([{ d_date: '2026-09-10', fajr_begins: '99:00:00' }], '2026-09-10T00:00:00Z'), null);
});

test('adhan triggers at Begins for all five prayers', () => {
  for (const [name, time] of [['Fajr','03:27'],['Zuhr','12:02'],['Asr','16:24'],['Maghrib','18:31'],['Isha','20:03']]) {
    const events = due(`2026-09-10T${time}:00Z`);
    assert.equal(events.length, 1);
    assert.equal(events[0].name, name);
  }
});
test('adhan does not trigger before Begins, at sunrise, or at a later Iqamah', () => {
  for (const time of ['03:26:59','05:27:00','04:30:00','12:30:00','16:45:00','20:30:00']) {
    assert.equal(due(`2026-09-10T${time}Z`).length, 0);
  }
});
test('adhan tolerates a delayed tick but skips old prayers after sleep', () => {
  assert.equal(due('2026-09-10T12:03:00Z').length, 1);
  assert.equal(due('2026-09-10T12:03:30Z').length, 0);
  assert.equal(due('2026-09-10T15:00:00Z').length, 0);
});
test('enabling after Begins does not replay the missed adhan', () => {
  assert.equal(due('2026-09-10T12:02:10Z', '2026-09-10T12:02:05Z').length, 0);
});
test('a played prayer stays deduplicated even if its timetable is refreshed', () => {
  assert.equal(due('2026-09-10T12:02:01Z', undefined, new Set(['2026-09-10:Zuhr'])).length, 0);
});

function audioHarness() {
  const elements = {};
  const get = id => elements[id] ??= { hidden: true, handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; }, setAttribute(name, value) { this[name] = value; } };
  const audio = get('#adhan-audio');
  audio.playCount = 0; audio.pauseCount = 0;
  audio.play = async () => { audio.playCount++; if (audio.fail) throw new Error('Playback blocked'); };
  audio.pause = () => { audio.pauseCount++; };
  const sandbox = vm.createContext({ Intl, Date, Set, document: { querySelector: get, addEventListener() {} }, sessionStorage: { getItem() { return null; }, setItem() {} }, setInterval() {}, prayerFields: [], prayerDays: [], londonInstant: context.londonInstant });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  vm.runInContext(scripts.at(-1)[1], sandbox);
  return { elements, audio, sandbox };
}
test('enable tests audio, stop leaves scheduling enabled, disable disarms it', async () => {
  const { elements, audio } = audioHarness();
  elements['#adhan-toggle'].handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(audio.playCount, 1);
  assert.equal(elements['#adhan-toggle']['aria-pressed'], 'true');
  elements['#adhan-stop'].handlers.click();
  assert.equal(elements['#adhan-toggle']['aria-pressed'], 'true');
  assert.equal(elements['#adhan-stop'].hidden, true);
  elements['#adhan-toggle'].handlers.click();
  assert.equal(elements['#adhan-toggle']['aria-pressed'], 'false');
  assert.equal(elements['#adhan-test'].hidden, true);
});
test('browser playback rejection disarms adhan and shows a recovery action', async () => {
  const { elements, audio } = audioHarness();
  audio.fail = true;
  elements['#adhan-toggle'].handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements['#adhan-toggle']['aria-pressed'], 'false');
  assert.match(elements['#adhan-status'].textContent, /could not play/);
});

