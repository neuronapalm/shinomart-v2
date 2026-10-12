import { spawn } from 'node:child_process';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(resolve(tmpdir(), 'shinomart-qa-'));
const output = resolve(import.meta.dirname, 'screenshots');
await mkdir(output, { recursive: true });
const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--remote-debugging-port=9229', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let ws;
let sequence = 0;
const pending = new Map();
const errors = [];
const failures = [];

async function connected() {
  for (let i = 0; i < 50; i++) {
    try {
      const tabs = await (await fetch('http://127.0.0.1:9229/json')).json();
      const tab = tabs.find(item => item.type === 'page');
      if (tab) return tab.webSocketDebuggerUrl;
    } catch {}
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error('Chrome DevTools did not start');
}

function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

try {
  ws = new WebSocket(await connected());
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    else if (message.method === 'Network.loadingFailed' && !message.params.canceled) failures.push(message.params.errorText);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  const results = [];
  for (const width of [360, 390, 430, 768, 1440, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width <= 430 });
    await send('Page.navigate', { url: 'http://127.0.0.1:4174/' });
    await evaluate('new Promise(resolve => { if (document.readyState === "complete") resolve(); else window.addEventListener("load", resolve, {once:true}); })');
    await evaluate('document.fonts.ready');
    await evaluate('document.querySelector(".reviews-widget").scrollIntoView(); new Promise(resolve => setTimeout(resolve, 1800))');
    await evaluate('document.querySelector(".map-panel").scrollIntoView(); new Promise(resolve => setTimeout(resolve, 1800))');
    await evaluate('window.scrollTo(0, 0)');
    const pageHeight = await evaluate('document.documentElement.scrollHeight');
    await send('Emulation.setDeviceMetricsOverride', { width, height:pageHeight, deviceScaleFactor:1, mobile:width <= 430 });
    await evaluate('Promise.all([...document.images].map(i => i.decode().catch(() => {})))');
    const metrics = await evaluate(`({ width:innerWidth, scrollWidth:document.documentElement.scrollWidth, bodyWidth:document.body.scrollWidth, height:document.documentElement.scrollHeight, brokenImages:[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src), font:getComputedStyle(document.querySelector('h1')).fontFamily, loadedFonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family), links:[...document.querySelectorAll('a')].filter(a=>!a.getAttribute('href')).length, brokenAnchors:[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash), imagesWithoutAlt:[...document.images].filter(i=>!i.hasAttribute('alt')).length, h1:document.querySelectorAll('h1').length })`);
    const picture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x:0, y:0, width, height:metrics.height, scale:1 } });
    await writeFile(resolve(output, `${width}.png`), Buffer.from(picture.data, 'base64'));
    if (width === 390) {
      await evaluate('document.querySelector(".menu-toggle").click()');
      metrics.menuOpened = await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded") === "true" && !document.querySelector(".mobile-nav").hidden');
      await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
      metrics.menuClosedOnEscape = await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded") === "false" && document.querySelector(".mobile-nav").hidden');
      metrics.keyboardFocusOutline = await evaluate('getComputedStyle(document.querySelector(".menu-toggle")).outlineWidth');
    }
    results.push(metrics);
  }
  await send('Emulation.setEmulatedMedia', { features:[{ name:'prefers-reduced-motion', value:'reduce' }] });
  const reducedMotion = await evaluate(`({scroll:getComputedStyle(document.documentElement).scrollBehavior,buttonTransition:getComputedStyle(document.querySelector('.button')).transitionDuration})`);
  const report = { results, reducedMotion, errors, failures };
  await writeFile(resolve(import.meta.dirname, 'browser-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  ws?.close();
  child.kill();
  if (profile.startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive:true, force:true, maxRetries:5, retryDelay:100 });
}
