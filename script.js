const EVENT_DATE = new Date('2027-03-20T21:00:00-03:00');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (min, max) => min + Math.random() * (max - min);

/* ==========================================================
   MÚSICA POR SECCIÓN
   Copiá los mp3 en assets/audio/ con estos nombres.
   - start:  segundo de la canción donde arranca el fragmento
   - length: cuántos segundos dura el fragmento (después vuelve a empezar)
   - title:  lo que se muestra en el cartel "reproduciendo"
   Podés repetir el mismo archivo en varias secciones con otro "start".
   Si un archivo no existe, esa sección sigue con la canción anterior.
   ========================================================== */
// Los mp3 ya son fragmentos de 32 s recortados de los videos bts1..bts10
// (con volumen igualado y fundido de entrada/salida), por eso start = 0.
// Cada sección tiene su propio fragmento: 01.mp3 = bts1 ... 10.mp3 = bts10.
const SONGS = {
  '00 · LOLA':           { src: 'assets/audio/01.mp3', start: 0, length: 32, title: 'BTS · ARIRANG · 01' },
  '01 · INTRO':          { src: 'assets/audio/02.mp3', start: 0, length: 32, title: 'BTS · ARIRANG · 02' },
  '02 · FALTAN':         { src: 'assets/audio/03.mp3', start: 0, length: 32, title: 'BTS · ARIRANG · 03' },
  '03 · FECHA Y HORA':   { src: 'assets/audio/04.mp3', start: 0, length: 32, title: 'BTS · ARIRANG · 04' },
  '04 · CÓMO LLEGAR':    { src: 'assets/audio/05.mp3', start: 0, length: 32, title: 'BTS · ARIRANG · 05' },
  '05 · DRESS CODE':     { src: 'assets/audio/06.mp3', start: 0, length: 32, title: 'BTS · ARIRANG · 06' },
  '06 · BLOOMKEEP':      { src: 'assets/audio/07.mp3', start: 0, length: 32, title: 'BTS · ARIRANG · 07' },
  '07 · MÚSICA':         { src: 'assets/audio/08.mp3', start: 0, length: 32, title: 'BTS · ARIRANG · 08' },
  '08 · REGALOS':        { src: 'assets/audio/09.mp3', start: 0, length: 32, title: 'BTS · ARIRANG · 09' },
  '09 · CONFIRMACIÓN':   { src: 'assets/audio/10.mp3', start: 0, length: 32, title: 'BTS · ARIRANG · 10' },
  'FIN · GRACIAS':       { src: 'assets/audio/10.mp3', start: 0, length: 32, title: 'BTS · ARIRANG · 10' }
};
const FADE_SECONDS = 1.2;
const MAX_VOLUME = 0.85;

const nowPlayingButton = document.querySelector('#nowPlaying');
const nowPlayingSong = document.querySelector('#nowPlayingSong');
const soundIcon = document.querySelector('#soundIcon');
let audioContext = null;
let decks = [];                 // dos reproductores para hacer fundido cruzado
let activeDeck = null;
let audioEnabled = false;
let muted = false;
let songTimer = null;
let pendingTrack = '00 · LOLA';

function createDeck() {
  const element = new Audio();
  element.preload = 'auto';
  element.playsInline = true;
  element.loop = true;
  const source = audioContext.createMediaElementSource(element);
  const gain = audioContext.createGain();
  gain.gain.value = 0;
  source.connect(gain).connect(analyser);
  const deck = { element, gain, song: null };
  element.addEventListener('timeupdate', () => {
    if (deck.song && element.currentTime >= deck.song.start + deck.song.length) {
      element.currentTime = deck.song.start;      // repite el fragmento
    }
  });
  return deck;
}

function fade(deck, to) {
  const now = audioContext.currentTime;
  deck.gain.gain.cancelScheduledValues(now);
  deck.gain.gain.setValueAtTime(deck.gain.gain.value, now);
  deck.gain.gain.linearRampToValueAtTime(to, now + FADE_SECONDS);
}

function playSong(track) {
  const song = SONGS[track];
  if (!audioEnabled || !song) return;
  if (activeDeck && activeDeck.song && activeDeck.song.src === song.src && activeDeck.song.start === song.start) return;

  const deck = decks.find((d) => d !== activeDeck);
  const previous = activeDeck;
  const token = (deck.token || 0) + 1;
  deck.token = token;
  deck.song = song;
  deck.element.src = song.src;

  const begin = () => {
    if (deck.token !== token) return;              // ya se pidió otra canción
    try { deck.element.currentTime = song.start; } catch {}
    deck.element.play().then(() => {
      if (deck.token !== token) return;
      fade(deck, muted ? 0 : MAX_VOLUME);
      if (previous) {
        fade(previous, 0);
        setTimeout(() => { if (activeDeck !== previous) previous.element.pause(); }, FADE_SECONDS * 1000 + 100);
      }
      activeDeck = deck;
      nowPlayingSong.textContent = song.title;
    }).catch(() => {});
  };
  deck.element.addEventListener('loadedmetadata', begin, { once: true });
  deck.element.addEventListener('error', () => { if (deck.token === token) deck.song = null; }, { once: true });   // archivo faltante: sigue la anterior
  deck.element.load();
}

// espera a que la persona se "quede" en la sección para no cambiar a cada rato
function scheduleSong(track) {
  pendingTrack = track;
  clearTimeout(songTimer);
  songTimer = setTimeout(() => playSong(pendingTrack), 450);
}

function enableAudio() {
  if (audioEnabled) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  audioContext = new AudioCtx();
  audioContext.resume();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.72;
  analyser.connect(audioContext.destination);
  decks = [createDeck(), createDeck()];
  audioEnabled = true;
  playSong(pendingTrack);
  if (!reduceMotion) requestAnimationFrame(beatLoop);
}

/* ---------- La invitación late con la música ---------- */
let analyser = null;
let beatLevel = 0;
const beatTargets = document.querySelectorAll('[data-beat]');
const eqBars = document.querySelectorAll('.now-playing__eq i');

function beatLoop() {
  requestAnimationFrame(beatLoop);
  if (!analyser || document.hidden) return;
  const bins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(bins);

  let bass = 0;
  for (let i = 1; i < 7; i += 1) bass += bins[i];
  bass = muted ? 0 : bass / (6 * 255);
  // realza los golpes: sube rápido, baja despacio
  const punch = Math.max(0, (bass - 0.45) / 0.55);
  beatLevel = punch > beatLevel ? punch : beatLevel * 0.9;
  const value = beatLevel.toFixed(3);
  beatTargets.forEach((el) => el.style.setProperty('--beat', value));

  // ecualizador real del cartel "reproduciendo"
  const bands = [3, 12, 28, 52];
  eqBars.forEach((bar, i) => {
    const level = muted ? 0.2 : Math.max(0.2, bins[bands[i]] / 255);
    bar.style.transform = `scaleY(${level.toFixed(2)})`;
  });
  nowPlayingButton.classList.toggle('is-live', !muted);
}

function setMuted(value) {
  muted = value;
  nowPlayingButton.classList.toggle('is-muted', muted);
  nowPlayingButton.setAttribute('aria-pressed', String(muted));
  nowPlayingButton.setAttribute('aria-label', muted ? 'Activar música' : 'Silenciar música');
  soundIcon.textContent = muted ? '🔇' : '🔊';
  if (!audioEnabled) { if (!muted) enableAudio(); return; }
  audioContext.resume();
  if (activeDeck) {
    if (!muted && activeDeck.element.paused) activeDeck.element.play().catch(() => {});
    fade(activeDeck, muted ? 0 : MAX_VOLUME);
  } else if (!muted) {
    playSong(pendingTrack);
  }
}
nowPlayingButton.addEventListener('click', () => setMuted(!muted));

// pausa la música si la persona cambia de app o bloquea el celular
document.addEventListener('visibilitychange', () => {
  if (!audioContext) return;
  if (document.hidden) audioContext.suspend();
  else if (!muted) audioContext.resume();
});

/* ---------- Intro ---------- */
const intro = document.querySelector('#intro');
const introCrowd = document.querySelector('#introCrowd');
const introCount = document.querySelector('#introCount');

// público con ARMY Bombs
(() => {
  const total = window.innerWidth < 600 ? 70 : 120;
  const colors = ['#b56bff', '#d68cff', '#8f4dff', '#ff7ad9', '#c77dff'];
  for (let i = 0; i < total; i += 1) {
    const light = document.createElement('i');
    const depth = Math.random();                       // más abajo = más cerca = más grande
    light.style.cssText = `--x:${rand(-2, 100)}%;--y:${(depth * 85).toFixed(1)}%;--s:${(26 - depth * 18).toFixed(1)}px;--c:${colors[i % colors.length]};--d:${rand(1.2, 3).toFixed(2)}s;--delay:${-rand(0, 3).toFixed(2)}s;--wave:${(-(i % 20) * 0.12).toFixed(2)}s`;
    introCrowd.appendChild(light);
  }
})();

let introStarted = false;
function openInvitation() {
  if (introStarted) return;
  introStarted = true;
  enableAudio();                                      // el toque habilita el sonido

  const finish = () => {
    intro.classList.add('is-flash');
    setTimeout(() => {
      document.body.classList.remove('is-locked');
      intro.classList.add('is-out');
      setTimeout(() => intro.remove(), 1000);
    }, 380);
  };

  if (reduceMotion) { finish(); return; }

  intro.classList.add('is-go');
  const steps = ['3', '2', '1', 'GO!'];
  steps.forEach((step, i) => {
    setTimeout(() => {
      introCount.innerHTML = '';
      const number = document.createElement('span');
      number.textContent = step;
      if (step === 'GO!') number.className = 'go';
      introCount.appendChild(number);
      if (navigator.vibrate) navigator.vibrate(step === 'GO!' ? 60 : 25);
    }, 450 + i * 700);
  });
  setTimeout(finish, 450 + steps.length * 700 - 250);
}
intro.addEventListener('click', openInvitation);
intro.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openInvitation(); }
});

/* ---------- Secciones visibles: activa animaciones ---------- */
const sections = document.querySelectorAll('.sheet, .footer');
const viewObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => entry.target.classList.toggle('in-view', entry.isIntersecting));
}, { threshold: 0.12 });
sections.forEach((section) => viewObserver.observe(section));

/* ---------- Now playing + barra de progreso ---------- */
const nowPlaying = document.querySelector('#nowPlaying');
const nowPlayingTrack = document.querySelector('#nowPlayingTrack');
const nowPlayingText = nowPlaying.querySelector('.now-playing__text');
const progressBar = document.querySelector('#progressBar');
let currentTrack = '';

function onScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = max > 0 ? window.scrollY / max : 0;
  progressBar.style.transform = `scaleX(${ratio})`;

  const middle = window.innerHeight * 0.55;
  let track = '';
  sections.forEach((section) => {
    const rect = section.getBoundingClientRect();
    if (rect.top <= middle && rect.bottom > middle) track = section.dataset.track || '';
  });
  if (track && track !== currentTrack) {
    currentTrack = track;
    scheduleSong(track);
    nowPlayingTrack.textContent = track;
    nowPlayingText.classList.remove('swap');
    void nowPlayingText.offsetWidth;
    nowPlayingText.classList.add('swap');
  }
  nowPlaying.classList.toggle('is-on', window.scrollY > window.innerHeight * 0.4);
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

/* ---------- Partículas por sección ---------- */
const particleMakers = {
  spark: (el) => { el.style.setProperty('--s', `${rand(4, 9)}px`); },
  confetti: (el) => {
    el.style.setProperty('--s', `${rand(10, 18)}px`);
    el.style.setProperty('--c', ['#c8102e', '#ff4d64', '#111', '#f7a1b4'][Math.floor(rand(0, 4))]);
  },
  note: (el) => { el.textContent = ['♪', '♫', '♬', '♩'][Math.floor(rand(0, 4))]; el.style.setProperty('--s', `${rand(18, 34)}px`); },
  heart: (el) => {
    el.textContent = '♥';
    el.style.setProperty('--s', `${rand(16, 32)}px`);
    el.style.setProperty('--c', ['#c8102e', '#ff4d64', '#f7a1b4'][Math.floor(rand(0, 3))]);
  },
  twinkle: (el) => { el.style.setProperty('--s', `${rand(8, 18)}px`); el.style.setProperty('--y', `${rand(2, 62)}%`); }
};

if (!reduceMotion) {
  document.querySelectorAll('[data-particles]').forEach((layer) => {
    const type = layer.dataset.particles;
    const count = Number(layer.dataset.count || 12);
    for (let i = 0; i < count; i += 1) {
      const el = document.createElement('span');
      el.className = `p p-${type}`;
      const duration = type === 'twinkle' ? rand(1.8, 3.6) : rand(6, 12);
      el.style.setProperty('--x', `${rand(0, 97)}%`);
      el.style.setProperty('--dur', `${duration}s`);
      el.style.setProperty('--delay', `${-rand(0, duration)}s`);
      el.style.setProperty('--dx', `${rand(-60, 60)}px`);
      particleMakers[type](el);
      layer.appendChild(el);
    }
  });
}

/* ---------- Track 02: cuenta regresiva ---------- */
const countdownParts = {
  days: document.querySelector('#days'),
  hours: document.querySelector('#hours'),
  minutes: document.querySelector('#minutes'),
  seconds: document.querySelector('#seconds')
};
const countdownText = document.querySelector('#countdownText');

function setPart(element, value) {
  const text = String(value).padStart(2, '0');
  if (element.textContent === text) return;
  element.textContent = text;
  element.classList.remove('tick');
  void element.offsetWidth;
  element.classList.add('tick');
}

function updateCountdown() {
  const distance = Math.max(0, EVENT_DATE.getTime() - Date.now());
  const days = Math.floor(distance / 86_400_000);
  const hours = Math.floor((distance % 86_400_000) / 3_600_000);
  const minutes = Math.floor((distance % 3_600_000) / 60_000);
  const seconds = Math.floor((distance % 60_000) / 1000);
  setPart(countdownParts.days, days);
  setPart(countdownParts.hours, hours);
  setPart(countdownParts.minutes, minutes);
  setPart(countdownParts.seconds, seconds);
  countdownText.textContent = `Faltan ${days} días, ${hours} horas y ${minutes} minutos.`;
}
updateCountdown();
setInterval(updateCountdown, 1000);

/* ---------- Explosión de confetti ---------- */
function burst() {
  if (reduceMotion) return;
  const layer = document.createElement('div');
  layer.className = 'burst';
  const colors = ['#c8102e', '#ff4d64', '#111', '#f7a1b4', '#ffffff'];
  for (let i = 0; i < 70; i += 1) {
    const piece = document.createElement('i');
    const angle = rand(0, Math.PI * 2);
    const distance = rand(120, Math.max(window.innerWidth, window.innerHeight) * 0.6);
    piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
    piece.style.setProperty('--r', `${rand(-720, 720)}deg`);
    piece.style.setProperty('--c', colors[i % colors.length]);
    piece.style.animationDelay = `${rand(0, 0.15)}s`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1800);
}

/* ---------- Track 08: tocar a los muñequitos ---------- */
const giftStage = document.querySelector('#giftStage');
const giftChars = document.querySelector('#giftChars');
const giftBubble = document.querySelector('#giftBubble');
const giftMessages = ['¡GRACIAS!', '¡YUPI!', '¡OTRA VEZ!', '¡TE QUEREMOS!', '¡SARANGHAE!', '¡WIII!'];
let giftTaps = 0;

function heartsAt(x, y, amount = 16) {
  if (reduceMotion) return;
  const colors = ['#c8102e', '#ff4d64', '#f7a1b4', '#ffd23f', '#9ad3f5'];
  for (let i = 0; i < amount; i += 1) {
    const heart = document.createElement('span');
    heart.className = 'heart-pop';
    heart.textContent = i % 4 === 0 ? '★' : '♥';
    const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
    const distance = rand(80, 200);
    heart.style.cssText = `--x:${x}px;--y:${y}px;--dx:${Math.cos(angle) * distance}px;--dy:${Math.sin(angle) * distance}px;--r:${rand(-60, 60)}deg;--s:${rand(16, 34)}px;--c:${colors[i % colors.length]}`;
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 1400);
  }
}

giftStage.addEventListener('click', (event) => {
  giftChars.classList.remove('jump');
  void giftChars.offsetWidth;
  giftChars.classList.add('jump');

  const rect = giftStage.getBoundingClientRect();
  const x = event.clientX || rect.left + rect.width / 2;
  const y = event.clientY || rect.top + rect.height * 0.4;
  heartsAt(x, y);
  if (navigator.vibrate) navigator.vibrate(30);

  giftBubble.textContent = giftMessages[giftTaps % giftMessages.length];
  giftTaps += 1;
  giftBubble.classList.remove('pop');
  void giftBubble.offsetWidth;
  giftBubble.classList.add('pop');
});
giftBubble.addEventListener('animationend', () => giftBubble.classList.remove('pop'));
giftChars.addEventListener('animationend', () => giftChars.classList.remove('jump'));

/* ---------- Modales ---------- */
document.querySelectorAll('[data-open]').forEach((button) => {
  button.addEventListener('click', () => document.querySelector(`#${button.dataset.open}`).showModal());
});
document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) dialog.close();
  });
});

/* ---------- Copiar ---------- */
async function copyText(text, statusElement) {
  try {
    await navigator.clipboard.writeText(text);
    statusElement.textContent = 'Copiado ✓';
  } catch {
    statusElement.textContent = text;
  }
}
document.querySelector('#copyAddress').addEventListener('click', () => {
  copyText('Dirección de ejemplo 1234, Buenos Aires', document.querySelector('#copyStatus'));
});
document.querySelector('#copyGift').addEventListener('click', () => {
  copyText(document.querySelector('#giftAlias').textContent, document.querySelector('#giftStatus'));
});

/* ---------- Track 03: agendar ---------- */
document.querySelector('#calendarButton').addEventListener('click', () => {
  burst();
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BloomDate//Lola//ES',
    'BEGIN:VEVENT',
    'UID:lola-20270320@bloomdate',
    'DTSTAMP:20261116T120000Z',
    'DTSTART:20270321T000000Z',
    'DTEND:20270321T060000Z',
    'SUMMARY:Fiesta de Lola',
    'LOCATION:Dirección de ejemplo 1234\\, Buenos Aires',
    'DESCRIPTION:¡Te espero! Esta noche\\, la pista es nuestra.',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Fiesta-Lola.ics';
  link.click();
  URL.revokeObjectURL(url);
});

/* ---------- Formularios (modelo: guarda en el dispositivo) ---------- */
function saveLocal(key, data) {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.push({ ...data, createdAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

document.querySelector('#musicForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  saveLocal('lolaMusicSuggestions', data);
  document.querySelector('#musicStatus').textContent = `¡Gracias, ${data.name}! Sumamos tu canción.`;
  event.currentTarget.reset();
  burst();
});

document.querySelector('#rsvpForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  saveLocal('lolaRsvp', data);
  document.querySelector('#rsvpStatus').textContent = `¡Gracias, ${data.name}! Tu respuesta quedó registrada.`;
  event.currentTarget.reset();
  burst();
});
