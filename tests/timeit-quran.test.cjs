const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../timeit/index.html'), 'utf8');
function harness() {
  const elements = {};
  const get = id => elements[id] ??= { value: '1', checked: true, paused: true, handlers: {}, children: [],
    addEventListener(event, handler) { this.handlers[event] = handler; },
    append(child) { this.children.push(child); },
    pause() { this.paused = true; },
    play() { if (this.fail) return Promise.reject(new Error('Blocked')); this.paused = false; return Promise.resolve(); }
  };
  vm.runInNewContext(html.match(/<script id="quran-player-script">([\s\S]*?)<\/script>/)[1], {
    document: { querySelector: get, createElement: () => ({}) }
  });
  return { audio: get('#quran-audio'), select: get('#quran-surah'), continuous: get('#quran-continuous'), status: get('#quran-status'), adhan: get('#adhan-audio') };
}
test('all 114 surahs are available without autoplay', () => {
  const { audio, select } = harness();
  assert.equal(select.children.length, 114);
  assert.equal(select.children[113].textContent, '114. An-Nas');
  assert.match(audio.src, /\/1\.mp3$/);
  assert.equal(audio.paused, true);
});
test('continuous playback advances and wraps; disabling stops at the end', () => {
  const { audio, select, continuous, status } = harness();
  audio.handlers.ended();
  assert.equal(select.value, '2');
  assert.equal(audio.paused, false);
  select.value = '114'; audio.handlers.ended();
  assert.equal(select.value, '1');
  continuous.checked = false; audio.handlers.ended();
  assert.equal(select.value, '1');
  assert.match(status.textContent, /Surah finished/);
});
test('surah selection preserves paused or playing state and adhan pauses Quran', () => {
  const { audio, select, adhan } = harness();
  select.value = '36'; select.handlers.change();
  assert.match(audio.src, /\/36\.mp3$/);
  assert.equal(audio.paused, true);
  audio.paused = false; select.value = '55'; select.handlers.change();
  assert.equal(audio.paused, false);
  adhan.handlers.play(); assert.equal(audio.paused, true);
});
test('playback rejection and media errors show recovery guidance', async () => {
  const { audio, status } = harness();
  audio.fail = true; audio.handlers.ended();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(status.textContent, /press play to retry/);
  audio.handlers.error();
  assert.match(status.textContent, /Recitation unavailable/);
});
