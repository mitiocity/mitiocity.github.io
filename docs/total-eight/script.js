"use strict";

const CONFIG = {
  rows: 4,
  cols: 8,

  startTime: 300,
  maxLevel: 5,

  stageTargets: [
    4500,
    6000,
    7500,
    9000,
    10500
  ],

  ringStepMs: 950,

  clearScore: 100,
  simultaneousBonus: 80,

  feverDuration: 8000,
  feverMultiplier: 2,

  starRate: 0.05,

  bgmVolume: 0.38,
  bgmFadeMs: 900,
  endMusicVolume: 0.48,

  /*
    音の変化をどれだけ滑らかにするか。
    小さいほど、急な音量変化を抑える。
  */
  visualSmoothing: 0.055,

  /*
    iPhone等で「視差効果を減らす」がONの場合、
    背景演出の動きを弱める。
  */
  reducedMotionStrength: 0.32
};

const TUTORIAL_TEXTS = [
  "リングは右から左へ流れてくる。オーブとリングの数字を足して、合計8を作ろう。",
  "オーブがあるレーンを1回タップすると、流れているリングがそのレーンへ移動する。",
  "同じレーンをもう一度タップすると、リングは列の先頭へ即固定される。",
  "オーブがない空白レーンも使える。白いリングだけで合計8になれば消える。",
  "★リングは特別なリング。そのレーンのオーブやリングを、全部「8を作った」扱いで消してくれる。"
];

const $ = (selector) => document.querySelector(selector);

const el = {
  app: $(".app"),

  title: $("#title-screen"),
  game: $("#game-screen"),
  tutorial: $("#tutorial-screen"),

  start: $("#start-button"),
  tutorialButton: $("#tutorial-button"),

  board: $("#game-board"),
  queueList: $("#ring-queue-list"),

  score: $("#score-value"),
  level: $("#level-value"),
  stageScore: $("#stage-score-value"),
  stageTarget: $("#stage-target-value"),
  time: $("#time-value"),
  over: $("#over-gauge"),
  status: $("#status-label"),

  abort: $("#abort-button"),

  countdown: $("#countdown-overlay"),
  countdownText: $("#countdown-text"),

  overPopup: $("#over-popup"),

  tutorialStep: $("#tutorial-step"),
  tutorialText: $("#tutorial-text"),
  tutorialNext: $("#tutorial-next-button"),
  tutorialExit: $("#tutorial-exit-button"),

  tutorialModal: $("#tutorial-complete-modal"),
  tutorialStart: $("#tutorial-start-button"),
  tutorialRestart: $("#tutorial-restart-button"),
  tutorialTitle: $("#tutorial-title-button"),

  abortModal: $("#abort-modal"),
  abortResume: $("#abort-resume-button"),
  abortRetry: $("#abort-retry-button"),
  abortTitle: $("#abort-title-button"),

  gameOver: $("#game-over-modal"),
  gameOverReason: $("#game-over-reason"),
  finalScore: $("#final-score-value"),
  retry: $("#retry-button"),
  titleButton: $("#title-button"),

  gameClear: $("#game-clear-modal"),
  clearScore: $("#clear-score-value"),
  clearRetry: $("#clear-retry-button"),
  clearTitle: $("#clear-title-button"),

  stageLeft: $(".stage-light--left"),
  stageRight: $(".stage-light--right"),
  stageCenter: $(".stage-light--center"),
  laserLeft: $(".stage-laser--left"),
  laserRight: $(".stage-laser--right")
};

let state = null;

let moveTimer = null;
let clockTimer = null;

let tutorialIndex = 0;
let pieceId = 0;

let audioContext = null;
let currentBgm = null;
let currentAnalyser = null;
let analyserData = null;
let stageAnimationId = null;
let endMusic = null;

/*
  BGM解析の生データをそのまま使わず、
  滑らかにした値を背景演出へ使う。
*/
const visualEnergy = {
  bass: 0,
  middle: 0,
  high: 0
};

const reducedMotionQuery = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

/* ==================================================
   基本処理
================================================== */

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function randomNumber() {
  return Math.floor(Math.random() * 4) + 1;
}

function createRingData() {
  if (Math.random() < CONFIG.starRate) {
    return {
      type: "star",
      number: null
    };
  }

  return {
    type: "ring",
    number: randomNumber()
  };
}

function makePiece(type, number = null, color = null) {
  pieceId += 1;

  return {
    id: `piece-${pieceId}`,
    type,
    number,
    color
  };
}

function createInitialBoard() {
  return Array.from({ length: CONFIG.rows }, (_, row) => {
    const boardRow = Array(CONFIG.cols).fill(null);

    boardRow[0] = makePiece(
      "orb",
      randomNumber(),
      row
    );

    return boardRow;
  });
}

function createGameState() {
  return {
    board: createInitialBoard(),

    queue: [
      createRingData(),
      createRingData(),
      createRingData()
    ],

    activeRing: null,
    selectedRow: null,

    score: 0,
    stageScore: 0,

    level: 1,
    time: CONFIG.startTime,

    /*
      オーバーゲージは回復・リセットしない。
    */
    over: 0,

    feverUntil: 0,

    isBusy: true,
    isPaused: false,
    isEnded: false,

    bgmPaths: {}
  };
}

function getStageTarget() {
  if (!state) {
    return CONFIG.stageTargets[0];
  }

  return CONFIG.stageTargets[
    Math.min(
      state.level - 1,
      CONFIG.stageTargets.length - 1
    )
  ];
}

function showScreen(screen) {
  [
    el.title,
    el.game,
    el.tutorial
  ].forEach((item) => {
    item?.classList.remove("is-active");
  });

  screen?.classList.add("is-active");
}

function closeAllModals() {
  [
    el.tutorialModal,
    el.abortModal,
    el.gameOver,
    el.gameClear
  ].forEach((modal) => {
    modal?.classList.remove("open");
  });
}

function clearGameTimers() {
  window.clearInterval(moveTimer);
  window.clearInterval(clockTimer);

  moveTimer = null;
  clockTimer = null;
}

function setStatus(text) {
  if (el.status) {
    el.status.textContent = text;
  }
}

function isFever() {
  return state && Date.now() < state.feverUntil;
}

function isGameRunning() {
  return Boolean(
    state &&
    !state.isEnded &&
    !state.isBusy &&
    !state.isPaused
  );
}

/* ==================================================
   効果音
================================================== */

function unlockAudio() {
  if (!audioContext) {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }

  audioContext?.resume().catch(() => {});
}

function playTone(frequency, time, duration, volume) {
  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0.001, time);

  gain.gain.exponentialRampToValueAtTime(
    volume,
    time + 0.012
  );

  gain.gain.exponentialRampToValueAtTime(
    0.001,
    time + duration
  );

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start(time);
  oscillator.stop(time + duration + 0.03);
}

function playClearSound(chainSpeed = 1) {
  if (!audioContext || !state) {
    return;
  }

  const notes = [
    0, 2, 4, 5,
    7, 9, 11, 12
  ];

  const root =
    261.63 *
    (2 ** (((state.level - 1) * 2) / 12));

  const now = audioContext.currentTime;
  const interval = 0.078 / chainSpeed;

  notes.forEach((note, index) => {
    playTone(
      root * (2 ** (note / 12)),
      now + index * interval,
      0.11,
      0.13
    );
  });
}

/*
  オーバーゲージが増える時の
  ド → ソ → レ → ド の低い効果音。
*/
function playOverSound() {
  if (!audioContext) {
    return;
  }

  const notes = [
    261.63,
    196.0,
    146.83,
    130.81
  ];

  const now = audioContext.currentTime;

  notes.forEach((frequency, index) => {
    playTone(
      frequency,
      now + index * 0.085,
      0.12,
      0.16
    );
  });
}

function playStarSound() {
  if (!audioContext) {
    return;
  }

  const now = audioContext.currentTime;

  [
    523.25,
    659.25,
    783.99,
    1046.5
  ].forEach((frequency, index) => {
    playTone(
      frequency,
      now + index * 0.075,
      0.14,
      0.12
    );
  });
}

/* ==================================================
   BGM
================================================== */

function getBgmPath(level) {
  if (!state) {
    return "";
  }

  if (state.bgmPaths[level]) {
    return state.bgmPaths[level];
  }

  let fileName = "";

  if (level === 1) {
    fileName = "LEVEL-1.mp3";
  }

  if (level === 2) {
    fileName = "LEVEL-2.mp3";
  }

  if (level === 3) {
    fileName = "LEVEL-3.mp3";
  }

  if (level === 4) {
    fileName =
      Math.random() < 0.5
        ? "LEVEL-4-a.mp3"
        : "LEVEL-4-b.mp3";
  }

  if (level >= 5) {
    fileName =
      Math.random() < 0.5
        ? "LEVEL-5-a.mp3"
        : "LEVEL-5-b.mp3";
  }

  const path = `assets/audio/bgm/${fileName}`;

  state.bgmPaths[level] = path;

  return path;
}

function disconnectBgm(bgm) {
  if (!bgm) {
    return;
  }

  try {
    bgm.source?.disconnect();
  } catch (error) {
    /* すでに接続解除済み */
  }

  try {
    bgm.analyser?.disconnect();
  } catch (error) {
    /* すでに接続解除済み */
  }
}

function stopStageLights() {
  window.cancelAnimationFrame(stageAnimationId);
  stageAnimationId = null;

  visualEnergy.bass = 0;
  visualEnergy.middle = 0;
  visualEnergy.high = 0;

  if (el.stageCenter) {
    el.stageCenter.style.transform =
      "translate(-50%, -50%) scale(0.82)";
    el.stageCenter.style.opacity = "0.16";
  }

  if (el.stageLeft) {
    el.stageLeft.style.transform =
      "translate(0, -50%) scale(1)";
    el.stageLeft.style.opacity = "0.13";
  }

  if (el.stageRight) {
    el.stageRight.style.transform =
      "translate(0, -50%) scale(1)";
    el.stageRight.style.opacity = "0.13";
  }

  if (el.laserLeft) {
    el.laserLeft.style.transform = "scale(1)";
    el.laserLeft.style.opacity = "0.10";
  }

  if (el.laserRight) {
    el.laserRight.style.transform = "scale(1)";
    el.laserRight.style.opacity = "0.10";
  }
}

function stopBgm() {
  if (!currentBgm) {
    stopStageLights();
    return;
  }

  const { audio } = currentBgm;

  try {
    audio.pause();
    audio.currentTime = 0;
  } catch (error) {
    /* 音声停止失敗時もゲームは継続 */
  }

  disconnectBgm(currentBgm);

  currentBgm = null;
  currentAnalyser = null;
  analyserData = null;

  stopStageLights();
}

function stopEndMusic() {
  if (!endMusic) {
    return;
  }

  try {
    endMusic.pause();
    endMusic.currentTime = 0;
  } catch (error) {
    /* 停止失敗時も継続 */
  }

  endMusic = null;
}

function playEndMusic(fileName) {
  stopEndMusic();

  endMusic = new Audio(
    `assets/audio/bgm/${fileName}`
  );

  endMusic.loop = false;
  endMusic.volume = CONFIG.endMusicVolume;
  endMusic.play().catch(() => {});
}

function createBgmForCurrentLevel() {
  if (!state || state.isEnded) {
    return;
  }

  const audio = new Audio(
    getBgmPath(state.level)
  );

  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;

  if (audioContext) {
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.84;

    const source =
      audioContext.createMediaElementSource(audio);

    source.connect(analyser);
    analyser.connect(audioContext.destination);

    currentBgm = {
      audio,
      source,
      analyser
    };

    currentAnalyser = analyser;

    analyserData = new Uint8Array(
      analyser.frequencyBinCount
    );

    return;
  }

  currentBgm = {
    audio,
    source: null,
    analyser: null
  };

  currentAnalyser = null;
  analyserData = null;
}

function fadeAudio(audio, from, to, duration) {
  if (!audio) {
    return;
  }

  const start = performance.now();

  function update(now) {
    const progress = Math.min(
      1,
      (now - start) / duration
    );

    audio.volume =
      from + (to - from) * progress;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function startBgm() {
  if (
    !currentBgm?.audio ||
    !state ||
    state.isEnded
  ) {
    return;
  }

  const { audio } = currentBgm;

  audio.currentTime = 0;
  audio.volume = 0;

  audio.play()
    .then(() => {
      fadeAudio(
        audio,
        0,
        CONFIG.bgmVolume,
        CONFIG.bgmFadeMs
      );

      startStageLights();
    })
    .catch(() => {
      /*
        端末側の音声制限などで失敗しても、
        ゲーム自体は止めない。
      */
    });
}

function changeBgmForLevel() {
  stopBgm();
  createBgmForCurrentLevel();
  startBgm();
}

function pauseBgm() {
  if (!currentBgm?.audio) {
    return;
  }

  currentBgm.audio.pause();
  window.cancelAnimationFrame(stageAnimationId);
}

function resumeBgm() {
  if (
    !currentBgm?.audio ||
    !state ||
    state.isEnded
  ) {
    return;
  }

  currentBgm.audio.play()
    .then(() => {
      startStageLights();
    })
    .catch(() => {});
}

/* ==================================================
   BGM周波数 → 円・楕円の背景演出
================================================== */

function getBandEnergy(
  startFrequency,
  endFrequency
) {
  if (
    !currentAnalyser ||
    !analyserData ||
    !audioContext
  ) {
    return 0;
  }

  currentAnalyser.getByteFrequencyData(
    analyserData
  );

  const nyquist = audioContext.sampleRate / 2;

  const startIndex = Math.max(
    0,
    Math.floor(
      (startFrequency / nyquist) *
      analyserData.length
    )
  );

  const endIndex = Math.min(
    analyserData.length - 1,
    Math.ceil(
      (endFrequency / nyquist) *
      analyserData.length
    )
  );

  let total = 0;
  let count = 0;

  for (
    let index = startIndex;
    index <= endIndex;
    index += 1
  ) {
    total += analyserData[index];
    count += 1;
  }

  return count > 0
    ? total / count / 255
    : 0;
}

function smoothEnergy(current, target) {
  return current +
    (target - current) *
    CONFIG.visualSmoothing;
}

function startStageLights() {
  window.cancelAnimationFrame(stageAnimationId);

  function animate() {
    if (
      !currentBgm?.audio ||
      currentBgm.audio.paused ||
      !state ||
      state.isEnded
    ) {
      return;
    }

    const motionStrength =
      reducedMotionQuery.matches
        ? CONFIG.reducedMotionStrength
        : 1;

    const bassTarget = getBandEnergy(35, 170);
    const middleTarget = getBandEnergy(170, 1100);
    const highTarget = getBandEnergy(1800, 9000);

    visualEnergy.bass = smoothEnergy(
      visualEnergy.bass,
      bassTarget
    );

    visualEnergy.middle = smoothEnergy(
      visualEnergy.middle,
      middleTarget
    );

    visualEnergy.high = smoothEnergy(
      visualEnergy.high,
      highTarget
    );

    const bass = visualEnergy.bass * motionStrength;
    const middle =
      visualEnergy.middle * motionStrength;
    const high = visualEnergy.high * motionStrength;

    /*
      低音：
      中央の巨大な円・楕円がゆっくり膨らむ。
    */
    if (el.stageCenter) {
      const scale = 0.82 + bass * 0.48;
      const opacity = 0.16 + bass * 0.24;

      el.stageCenter.style.transform =
        `translate(-50%, -50%) scale(${scale})`;

      el.stageCenter.style.opacity = String(opacity);
    }

    /*
      中音：
      左右の大きな楕円が寄ったり離れたりする。
    */
    if (el.stageLeft) {
      const scale = 1 + middle * 0.3;
      const shift = middle * 9;
      const opacity = 0.13 + middle * 0.22;

      el.stageLeft.style.transform =
        `translate(${shift}px, -50%) scale(${scale})`;

      el.stageLeft.style.opacity = String(opacity);
    }

    if (el.stageRight) {
      const scale = 1 + middle * 0.3;
      const shift = middle * -9;
      const opacity = 0.13 + middle * 0.22;

      el.stageRight.style.transform =
        `translate(${shift}px, -50%) scale(${scale})`;

      el.stageRight.style.opacity = String(opacity);
    }

    /*
      高音：
      小さなカラー楕円を少し濃く、大きくする。
      線・レーザー・フラッシュは使わない。
    */
    if (el.laserLeft) {
      const scale = 1 + high * 0.36;
      const shiftX = high * 12;
      const shiftY = high * -5;
      const opacity = 0.1 + high * 0.29;

      el.laserLeft.style.transform =
        `translate(${shiftX}px, ${shiftY}px) scale(${scale})`;

      el.laserLeft.style.opacity = String(opacity);
    }

    if (el.laserRight) {
      const scale = 1 + high * 0.36;
      const shiftX = high * -12;
      const shiftY = high * 5;
      const opacity = 0.1 + high * 0.29;

      el.laserRight.style.transform =
        `translate(${shiftX}px, ${shiftY}px) scale(${scale})`;

      el.laserRight.style.opacity = String(opacity);
    }

    stageAnimationId =
      window.requestAnimationFrame(animate);
  }

  stageAnimationId =
    window.requestAnimationFrame(animate);
}

/* ==================================================
   盤面の計算
================================================== */

function getRowPieces(row) {
  return state.board[row]
    .map((piece, col) => ({
      piece,
      col
    }))
    .filter(({ piece }) => piece);
}

/*
  オーブを含む列、または白リングだけの列を
  まとまりごとに取得する。
*/
function getGroups() {
  const groups = [];

  for (
    let row = 0;
    row < CONFIG.rows;
    row += 1
  ) {
    let col = 0;

    while (col < CONFIG.cols) {
      const first = state.board[row][col];

      if (!first) {
        col += 1;
        continue;
      }

      const pieces = [];
      const hasOrb = first.type === "orb";

      if (
        first.type !== "orb" &&
        first.type !== "ring"
      ) {
        col += 1;
        continue;
      }

      let scan = col;

      while (scan < CONFIG.cols) {
        const current = state.board[row][scan];

        if (!current) {
          break;
        }

        if (
          scan !== col &&
          current.type === "orb"
        ) {
          break;
        }

        if (current.type === "star") {
          break;
        }

        pieces.push({
          row,
          col: scan,
          piece: current
        });

        scan += 1;
      }

      if (pieces.length > 0) {
        const total = pieces.reduce(
          (sum, item) =>
            sum + (item.piece.number || 0),
          0
        );

        groups.push({
          row,
          hasOrb,
          total,
          cells: pieces
        });
      }

      col = Math.max(scan, col + 1);
    }
  }

  return groups;
}

function getGroupAt(row, col) {
  return getGroups().find((group) =>
    group.cells.some(
      (cell) =>
        cell.row === row &&
        cell.col === col
    )
  );
}

/*
  リングだけを左側へ詰める。
  オーブの位置は動かない。
*/
function settleBoard() {
  for (
    let row = 0;
    row < CONFIG.rows;
    row += 1
  ) {
    const oldRow = state.board[row];
    const nextRow = Array(CONFIG.cols).fill(null);

    const orbColumns = [];

    oldRow.forEach((piece, col) => {
      if (piece?.type === "orb") {
        orbColumns.push(col);
        nextRow[col] = piece;
      }
    });

    const boundaries = [
      -1,
      ...orbColumns,
      CONFIG.cols
    ];

    for (
      let section = 0;
      section < boundaries.length - 1;
      section += 1
    ) {
      const start = boundaries[section] + 1;
      const end = boundaries[section + 1];

      const rings = [];

      for (
        let col = start;
        col < end;
        col += 1
      ) {
        const piece = oldRow[col];

        if (
          piece &&
          piece.type !== "orb"
        ) {
          rings.push(piece);
        }
      }

      rings.forEach((ring, index) => {
        nextRow[start + index] = ring;
      });
    }

    state.board[row] = nextRow;
  }
}

function getLandingColumn(row) {
  let rightmost = -1;

  for (
    let col = 0;
    col < CONFIG.cols;
    col += 1
  ) {
    if (state.board[row][col]) {
      rightmost = col;
    }
  }

  return rightmost + 1;
}

function hasAnyOrb() {
  return state.board.some((row) =>
    row.some((piece) => piece?.type === "orb")
  );
}

function isRowCompletelyEmpty(row) {
  return state.board[row].every((piece) => !piece);
}

function respawnOrbsInEmptyRows() {
  for (
    let row = 0;
    row < CONFIG.rows;
    row += 1
  ) {
    /*
      オーブもリングもない完全な空白レーンにだけ
      新しいオーブを追加する。
    */
    if (isRowCompletelyEmpty(row)) {
      state.board[row][0] = makePiece(
        "orb",
        randomNumber(),
        row
      );
    }
  }
}

/* ==================================================
   得点・レベル・フィーバー
================================================== */

function addExperience(amount) {
  if (!state || amount <= 0) {
    return;
  }

  const feverMultiplier =
    isFever()
      ? CONFIG.feverMultiplier
      : 1;

  const earned = Math.floor(
    amount * feverMultiplier
  );

  state.score += earned;
  state.stageScore += earned;

  checkLevelProgress();
}

function checkLevelProgress() {
  if (!state || state.isEnded) {
    return;
  }

  const target = getStageTarget();

  if (state.stageScore < target) {
    return;
  }

  if (state.level >= CONFIG.maxLevel) {
    gameClear();
    return;
  }

  state.level += 1;
  state.stageScore = 0;
  state.time = CONFIG.startTime;

  setStatus("LEVEL UP! TIME RESET");

  changeBgmForLevel();
  renderGame();

  window.setTimeout(() => {
    if (
      state &&
      !state.isEnded &&
      !state.isPaused
    ) {
      setStatus("READY");
    }
  }, 1500);
}

async function startFeverAndRespawn() {
  if (!state || state.isEnded) {
    return;
  }

  state.feverUntil =
    Date.now() + CONFIG.feverDuration;

  el.app?.classList.add("is-fever");

  setStatus("ALL CLEAR! FEVER!");

  await wait(520);

  if (!state || state.isEnded) {
    return;
  }

  /*
    白リングが残っているレーンへは追加しない。
    完全な空白レーンだけへオーブを追加。
  */
  respawnOrbsInEmptyRows();

  renderGame();

  window.setTimeout(() => {
    if (!state || state.isEnded) {
      return;
    }

    el.app?.classList.remove("is-fever");

    if (!state.isPaused) {
      setStatus("READY");
    }
  }, CONFIG.feverDuration);
}

function showOverNumber(total) {
  if (!el.overPopup) {
    return;
  }

  el.overPopup.textContent = String(total);

  el.overPopup.classList.remove("hidden");
  el.overPopup.classList.remove("show");

  window.requestAnimationFrame(() => {
    el.overPopup?.classList.add("show");
  });

  window.setTimeout(() => {
    el.overPopup?.classList.remove("show");
    el.overPopup?.classList.add("hidden");
  }, 980);
}

function increaseOverGauge(total) {
  if (!state || state.isEnded) {
    return;
  }

  state.over += 1;

  showOverNumber(total);
  playOverSound();

  el.app?.classList.add("is-over-flash");

  window.setTimeout(() => {
    el.app?.classList.remove("is-over-flash");
  }, 800);

  if (state.over >= 5) {
    renderGame();
    gameOver("OVER LIMIT");
    return;
  }

  setStatus("OVER");
}

/* ==================================================
   消去処理
================================================== */

function removeCells(cells) {
  cells.forEach(({ row, col }) => {
    state.board[row][col] = null;
  });
}

async function resolveClearChains() {
  let chain = 0;

  while (
    state &&
    !state.isEnded
  ) {
    const clearGroups = getGroups()
      .filter((group) => group.total === 8);

    if (clearGroups.length === 0) {
      break;
    }

    chain += 1;

    const orbGroups = clearGroups.filter(
      (group) => group.hasOrb
    );

    clearGroups.forEach((group) => {
      removeCells(group.cells);
    });

    settleBoard();

    /*
      オーブ起点の8だけが経験値になる。
      白リングだけの8は消えるが得点なし。
    */
    if (orbGroups.length > 0) {
      const base =
        orbGroups.length *
        CONFIG.clearScore *
        chain;

      const simultaneousBonus =
        Math.max(0, orbGroups.length - 1) *
        CONFIG.simultaneousBonus;

      addExperience(base + simultaneousBonus);
      playClearSound(
        chain === 1
          ? 1
          : chain === 2
            ? 1.25
            : 1.55
      );
    }

    renderGame();

    await wait(260);
  }

  if (
    state &&
    !state.isEnded &&
    !hasAnyOrb()
  ) {
    await startFeverAndRespawn();
  }
}

async function resolveStar(row) {
  if (!state || state.isEnded) {
    return;
  }

  const existingPieces = getRowPieces(row)
    .filter(({ piece }) => piece.type !== "star");

  /*
    空白レーンの★も「8を1つ作った」扱い。
    既存ピースがある場合は、既存ピース1個ごとに
    8を作った扱いで得点。
  */
  const clearCount = Math.max(
    1,
    existingPieces.length
  );

  state.board[row] = Array(CONFIG.cols).fill(null);

  addExperience(
    CONFIG.clearScore * clearCount
  );

  playStarSound();

  settleBoard();
  renderGame();

  await wait(240);

  if (
    state &&
    !state.isEnded &&
    !hasAnyOrb()
  ) {
    await startFeverAndRespawn();
  }
}

/*
  新しく固定した通常リングの合計を判定する。
*/
async function evaluatePlacedRing(row, col) {
  const group = getGroupAt(row, col);

  if (!group) {
    return;
  }

  if (group.total > 8) {
    /*
      9以上：
      新しく置いたリングだけ消える。
      オーブ列ならオーバーゲージ+1。
      白リング列ならゲージは増えない。
    */
    state.board[row][col] = null;

    if (group.hasOrb) {
      increaseOverGauge(group.total);
    } else {
      showOverNumber(group.total);
      setStatus("TOO HIGH");
    }

    settleBoard();
    renderGame();

    return;
  }

  await resolveClearChains();
}

/* ==================================================
   リング出現・移動・固定
================================================== */

function spawnActiveRing() {
  if (
    !state ||
    state.isEnded ||
    state.isPaused
  ) {
    return;
  }

  const next = state.queue.shift();

  state.queue.push(createRingData());

  state.activeRing = {
    ...next,
    row: Math.floor(
      Math.random() * CONFIG.rows
    ),
    col: CONFIG.cols - 1
  };

  state.selectedRow = null;

  renderGame();
}

async function lockActiveRing(row, col) {
  if (
    !state ||
    !state.activeRing ||
    state.isBusy ||
    state.isEnded
  ) {
    return;
  }

  const active = state.activeRing;

  state.isBusy = true;

  if (active.type === "star") {
    state.activeRing = null;

    await resolveStar(row);

    if (
      state &&
      !state.isEnded &&
      !state.isPaused
    ) {
      spawnActiveRing();
      state.isBusy = false;
      renderGame();
    }

    return;
  }

  state.board[row][col] = makePiece(
    "ring",
    active.number,
    null
  );

  state.activeRing = null;

  renderGame();

  await evaluatePlacedRing(row, col);

  if (
    state &&
    !state.isEnded &&
    !state.isPaused
  ) {
    spawnActiveRing();
    state.isBusy = false;
    renderGame();
  }
}

function moveActiveRing() {
  if (
    !isGameRunning() ||
    !state.activeRing
  ) {
    return;
  }

  const active = state.activeRing;
  const nextCol = active.col - 1;

  /*
    左端まで到達した場合、
    または次のマスが埋まっている場合は固定。
  */
  if (nextCol < 0) {
    lockActiveRing(active.row, 0);
    return;
  }

  if (state.board[active.row][nextCol]) {
    lockActiveRing(active.row, active.col);
    return;
  }

  active.col = nextCol;

  renderGame();
}

function startRingMovement() {
  window.clearInterval(moveTimer);

  moveTimer = window.setInterval(
    moveActiveRing,
    CONFIG.ringStepMs
  );
}

function handleBoardTap(row) {
  if (
    !isGameRunning() ||
    !state.activeRing
  ) {
    return;
  }

  /*
    1回目：流れているリングをそのレーンへ移動。
  */
  if (state.selectedRow !== row) {
    state.selectedRow = row;
    state.activeRing.row = row;

    setStatus("TARGET LOCK");

    renderGame();
    return;
  }

  /*
    同じレーンを2回目：
    そのレーンの先頭へ即固定。
  */
  const landingCol = getLandingColumn(row);

  if (landingCol >= CONFIG.cols) {
    setStatus("ROW FULL");
    return;
  }

  lockActiveRing(row, landingCol);
}

/* ==================================================
   描画
================================================== */

function getPreparationClasses(row, col, piece) {
  if (
    !piece ||
    piece.type === "star"
  ) {
    return [];
  }

  const group = getGroupAt(row, col);

  if (!group) {
    return [];
  }

  if (group.total === 5) {
    return ["prep-5", "t5"];
  }

  if (group.total === 6) {
    return ["prep-6", "t6"];
  }

  if (group.total === 7) {
    return ["prep-7", "t7"];
  }

  return [];
}

function makePieceElement(
  piece,
  row,
  col,
  isActive = false
) {
  const node = document.createElement("div");

  const classes = ["piece"];

  if (piece.type === "orb") {
    classes.push("orb");
  }

  if (piece.type === "ring") {
    classes.push("ring");
  }

  if (piece.type === "star") {
    classes.push("star-ring");
  }

  if (piece.color !== null) {
    classes.push(`c${piece.color}`);
  }

  if (isActive) {
    classes.push("active");
  }

  const prepClasses =
    getPreparationClasses(row, col, piece);

  prepClasses
    .filter((className) =>
      className.startsWith("t")
    )
    .forEach((className) => {
      classes.push(className);
    });

  node.className = classes.join(" ");

  if (piece.type === "star") {
    node.textContent = "★";
  } else {
    node.textContent = String(piece.number);
  }

  return node;
}

function renderBoard() {
  if (!el.board || !state) {
    return;
  }

  el.board.innerHTML = "";

  for (
    let row = 0;
    row < CONFIG.rows;
    row += 1
  ) {
    for (
      let col = 0;
      col < CONFIG.cols;
      col += 1
    ) {
      const cell = document.createElement("button");

      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);

      const piece = state.board[row][col];

      if (piece) {
        const prepClasses =
          getPreparationClasses(row, col, piece);

        prepClasses
          .filter((className) =>
            className.startsWith("prep")
          )
          .forEach((className) => {
            cell.classList.add(className);
          });

        cell.appendChild(
          makePieceElement(piece, row, col)
        );
      }

      if (
        state.activeRing &&
        state.activeRing.row === row &&
        state.activeRing.col === col
      ) {
        const activePiece = {
          type: state.activeRing.type,
          number: state.activeRing.number,
          color: null
        };

        cell.appendChild(
          makePieceElement(
            activePiece,
            row,
            col,
            true
          )
        );
      }

      if (
        state.selectedRow === row &&
        state.activeRing
      ) {
        cell.classList.add("target");
      }

      el.board.appendChild(cell);
    }
  }
}

function renderQueue() {
  if (!el.queueList || !state) {
    return;
  }

  el.queueList.innerHTML = "";

  state.queue.forEach((ring) => {
    const item = document.createElement("div");

    item.className = "queue-ring";

    if (ring.type === "star") {
      item.classList.add("star");
      item.textContent = "★";
    } else {
      item.textContent = String(ring.number);
    }

    el.queueList.appendChild(item);
  });
}

function renderOverGauge() {
  if (!el.over || !state) {
    return;
  }

  el.over.className = "";

  if (state.over > 0) {
    el.over.classList.add(
      `over-${Math.min(state.over, 4)}`
    );
  }

  [...el.over.querySelectorAll("i")]
    .forEach((item, index) => {
      item.classList.toggle(
        "on",
        index < state.over
      );
    });
}

function renderGame() {
  if (!state) {
    return;
  }

  if (el.score) {
    el.score.textContent =
      state.score.toLocaleString("ja-JP");
  }

  if (el.level) {
    el.level.textContent = String(state.level);
  }

  if (el.stageScore) {
    el.stageScore.textContent =
      state.stageScore.toLocaleString("ja-JP");
  }

  if (el.stageTarget) {
    el.stageTarget.textContent =
      getStageTarget().toLocaleString("ja-JP");
  }

  if (el.time) {
    el.time.textContent = String(
      Math.max(0, state.time)
    );
  }

  renderOverGauge();
  renderBoard();
  renderQueue();
}

/* ==================================================
   ゲーム開始・終了
================================================== */

async function runCountdown() {
  if (!el.countdown || !el.countdownText) {
    return;
  }

  const messages = [
    ["READY?", 850],
    ["3", 720],
    ["2", 720],
    ["1", 720],
    ["GO!", 620]
  ];

  el.countdown.classList.remove("hidden");

  for (const [message, duration] of messages) {
    el.countdownText.textContent = message;

    el.countdownText.style.animation = "none";

    void el.countdownText.offsetWidth;

    el.countdownText.style.animation = "";

    await wait(duration);
  }

  el.countdown.classList.add("hidden");
}

function startClock() {
  window.clearInterval(clockTimer);

  clockTimer = window.setInterval(() => {
    if (
      !state ||
      state.isEnded ||
      state.isPaused ||
      state.isBusy
    ) {
      return;
    }

    state.time -= 1;

    renderGame();

    if (state.time <= 0) {
      gameOver("TIME UP");
    }
  }, 1000);
}

async function startNewGame() {
  unlockAudio();
  stopEndMusic();
  stopBgm();
  clearGameTimers();
  closeAllModals();

  el.app?.classList.remove(
    "is-fever",
    "is-over-flash"
  );

  state = createGameState();

  showScreen(el.game);
  setStatus("READY");

  renderGame();

  await runCountdown();

  if (!state || state.isEnded) {
    return;
  }

  createBgmForCurrentLevel();
  startBgm();

  state.isBusy = false;

  setStatus("GO!");

  spawnActiveRing();
  startRingMovement();
  startClock();

  window.setTimeout(() => {
    if (
      state &&
      !state.isEnded &&
      !state.isPaused
    ) {
      setStatus("READY");
    }
  }, 900);
}

function pauseGame() {
  if (
    !state ||
    state.isEnded ||
    state.isPaused
  ) {
    return;
  }

  state.isPaused = true;

  pauseBgm();
  el.abortModal?.classList.add("open");

  setStatus("PAUSED");
}

function resumeGame() {
  if (
    !state ||
    state.isEnded ||
    !state.isPaused
  ) {
    return;
  }

  state.isPaused = false;

  el.abortModal?.classList.remove("open");

  resumeBgm();
  setStatus("READY");

  renderGame();
}

function returnToTitle() {
  clearGameTimers();
  stopBgm();
  stopEndMusic();

  state = null;

  el.app?.classList.remove(
    "is-fever",
    "is-over-flash"
  );

  closeAllModals();
  showScreen(el.title);
}

function gameOver(reason) {
  if (!state || state.isEnded) {
    return;
  }

  state.isEnded = true;

  clearGameTimers();
  stopBgm();

  el.app?.classList.remove("is-fever");

  if (el.gameOverReason) {
    el.gameOverReason.textContent = reason;
  }

  if (el.finalScore) {
    el.finalScore.textContent =
      state.score.toLocaleString("ja-JP");
  }

  el.gameOver?.classList.add("open");

  playEndMusic("GAMEOVER.mp3");
}

function gameClear() {
  if (!state || state.isEnded) {
    return;
  }

  state.isEnded = true;

  clearGameTimers();
  stopBgm();

  el.app?.classList.remove("is-fever");

  if (el.clearScore) {
    el.clearScore.textContent =
      state.score.toLocaleString("ja-JP");
  }

  el.gameClear?.classList.add("open");

  playEndMusic("OvercameHardships.mp3");
}

/* ==================================================
   チュートリアル
================================================== */

function renderTutorial() {
  if (el.tutorialStep) {
    el.tutorialStep.textContent =
      `${tutorialIndex + 1} / ${TUTORIAL_TEXTS.length}`;
  }

  if (el.tutorialText) {
    el.tutorialText.textContent =
      TUTORIAL_TEXTS[tutorialIndex];
  }

  if (el.tutorialNext) {
    const isLast =
      tutorialIndex ===
      TUTORIAL_TEXTS.length - 1;

    el.tutorialNext.innerHTML = isLast
      ? "<strong>完了</strong><small>FINISH</small>"
      : "<strong>つぎへ</strong><small>NEXT</small>";
  }
}

function openTutorial() {
  clearGameTimers();
  stopBgm();
  stopEndMusic();
  closeAllModals();

  tutorialIndex = 0;

  showScreen(el.tutorial);
  renderTutorial();
}

/* ==================================================
   イベント
================================================== */

el.start?.addEventListener("click", () => {
  startNewGame();
});

el.tutorialButton?.addEventListener("click", () => {
  openTutorial();
});

el.board?.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");

  if (!cell) {
    return;
  }

  const row = Number(cell.dataset.row);

  if (Number.isNaN(row)) {
    return;
  }

  handleBoardTap(row);
});

el.abort?.addEventListener("click", () => {
  pauseGame();
});

el.abortResume?.addEventListener("click", () => {
  resumeGame();
});

el.abortRetry?.addEventListener("click", () => {
  startNewGame();
});

el.abortTitle?.addEventListener("click", () => {
  returnToTitle();
});

el.retry?.addEventListener("click", () => {
  startNewGame();
});

el.titleButton?.addEventListener("click", () => {
  returnToTitle();
});

el.clearRetry?.addEventListener("click", () => {
  startNewGame();
});

el.clearTitle?.addEventListener("click", () => {
  returnToTitle();
});

el.tutorialNext?.addEventListener("click", () => {
  const isLast =
    tutorialIndex ===
    TUTORIAL_TEXTS.length - 1;

  if (isLast) {
    el.tutorialModal?.classList.add("open");
    return;
  }

  tutorialIndex += 1;
  renderTutorial();
});

el.tutorialExit?.addEventListener("click", () => {
  returnToTitle();
});

el.tutorialStart?.addEventListener("click", () => {
  startNewGame();
});

el.tutorialRestart?.addEventListener("click", () => {
  tutorialIndex = 0;
  el.tutorialModal?.classList.remove("open");
  renderTutorial();
});

el.tutorialTitle?.addEventListener("click", () => {
  returnToTitle();
});

/*
  タブ切替・着信などでゲーム画面が裏に回った場合、
  意図せず時間だけ進むことを防ぐ。
*/
document.addEventListener("visibilitychange", () => {
  if (
    document.hidden &&
    isGameRunning()
  ) {
    pauseGame();
  }
});

/*
  端末設定で動きを減らす設定を途中で切り替えた場合も、
  次のフレームから背景演出の強さへ反映される。
*/
reducedMotionQuery.addEventListener?.(
  "change",
  () => {
    if (
      currentBgm?.audio &&
      !currentBgm.audio.paused
    ) {
      startStageLights();
    }
  }
);

showScreen(el.title);
