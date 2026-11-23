"use strict";

/* ==================================================
   とーたるえいと❣️
================================================== */

const CONFIG = {
  rows: 4,
  cols: 8,

  startTime: 300,
  maxLevel: 5,
  levelScoreStep: 900,

  ringStepMs: 950,

  clearScore: 100,
  simultaneousBonus: 80,

  feverDuration: 8000,
  feverMultiplier: 2,

  starRate: 0.05,

  bgmVolume: 0.38,
  bgmFadeMs: 900
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

/* 音関連 */
let audioContext = null;
let currentBgm = null;
let currentAnalyser = null;
let analyserData = null;
let stageAnimationId = null;

/* ==================================================
   基本処理
================================================== */

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
    level: 1,
    time: CONFIG.startTime,
    over: 0,

    feverUntil: 0,

    isBusy: true,
    isPaused: false,
    isEnded: false,

    bgmPaths: {}
  };
}

function showScreen(screen) {
  [el.title, el.game, el.tutorial].forEach((item) => {
    if (item) {
      item.classList.remove("is-active");
    }
  });

  if (screen) {
    screen.classList.add("is-active");
  }
}

function closeAllModals() {
  [
    el.tutorialModal,
    el.abortModal,
    el.gameOver
  ].forEach((modal) => {
    if (modal) {
      modal.classList.remove("open");
    }
  });
}

function clearGameTimers() {
  clearInterval(moveTimer);
  clearInterval(clockTimer);

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

/* ==================================================
   効果音
================================================== */

function unlockAudio() {
  if (!audioContext) {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    audioContext = new AudioContextClass();
  }

  audioContext.resume().catch(() => {});
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

  const notes = [0, 2, 4, 5, 7, 9, 11, 12];
  const root = 261.63 * (2 ** (((state.level - 1) * 2) / 12));
  const now = audioContext.currentTime;
  const interval = 0.078 / chainSpeed;

  notes.forEach((note, index) => {
    const frequency = root * (2 ** (note / 12));

    playTone(
      frequency,
      now + index * interval,
      0.11,
      0.13
    );
  });
}

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

  const notes = [
    523.25,
    659.25,
    783.99,
    1046.5
  ];

  const now = audioContext.currentTime;

  notes.forEach((frequency, index) => {
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

  /*
    実際にアップロードされているファイル名は
    LEVEL-1.mp3 のように LEVEL が大文字。
  */
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
    bgm.source.disconnect();
  } catch (error) {
    /* 接続解除済みなら何もしない */
  }

  try {
    bgm.analyser.disconnect();
  } catch (error) {
    /* 接続解除済みなら何もしない */
  }
}

function createBgmForCurrentLevel() {
  if (
    !audioContext ||
    !state ||
    state.isEnded
  ) {
    return;
  }

  const path = getBgmPath(state.level);

  if (!path) {
    return;
  }

  const audio = new Audio(path);

  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;

  const analyser = audioContext.createAnalyser();

  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.78;

  const source = audioContext.createMediaElementSource(audio);

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
}

/*
  STARTを押した直後に、一度だけ音声再生を許可する。
  ChromeやSafariの自動再生制限を確実に越えるための処理。
  READY?中は音量0・停止状態なので、実際に聞こえるのはGO!から。
*/
function prepareBgmForStart() {
  if (
    !currentBgm ||
    !currentBgm.audio
  ) {
    return;
  }

  const audio = currentBgm.audio;

  audio.volume = 0;

  audio.play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
    })
    .catch(() => {
      /* 失敗してもGO!時に再試行する */
    });
}

function startBgm() {
  if (
    !currentBgm ||
    !currentBgm.audio ||
    !state ||
    state.isEnded
  ) {
    return;
  }

  const audio = currentBgm.audio;

  audio.play().catch(() => {});

  let step = 0;
  const steps = 18;
  const interval = CONFIG.bgmFadeMs / steps;

  const fadeTimer = setInterval(() => {
    step += 1;

    audio.volume = Math.min(
      CONFIG.bgmVolume,
      CONFIG.bgmVolume * (step / steps)
    );

    if (step >= steps) {
      clearInterval(fadeTimer);
    }
  }, interval);

  startStageLights();
}

function changeBgmForLevel() {
  if (
    !state ||
    !audioContext ||
    state.isEnded
  ) {
    return;
  }

  const previous = currentBgm;

  createBgmForCurrentLevel();

  if (!currentBgm) {
    return;
  }

  const next = currentBgm;

  next.audio.play().catch(() => {});

  let step = 0;
  const steps = 18;
  const interval = CONFIG.bgmFadeMs / steps;

  const fadeTimer = setInterval(() => {
    step += 1;

    const progress = step / steps;

    next.audio.volume = Math.min(
      CONFIG.bgmVolume,
      CONFIG.bgmVolume * progress
    );

    if (previous) {
      previous.audio.volume = Math.max(
        0,
        CONFIG.bgmVolume * (1 - progress)
      );
    }

    if (step >= steps) {
      clearInterval(fadeTimer);

      if (previous) {
        previous.audio.pause();
        previous.audio.currentTime = 0;
        disconnectBgm(previous);
      }
    }
  }, interval);
}

function pauseBgm() {
  if (currentBgm) {
    currentBgm.audio.pause();
  }
}

function resumeBgm() {
  if (
    currentBgm &&
    state &&
    !state.isEnded
  ) {
    currentBgm.audio.play().catch(() => {});
  }
}

function stopBgm() {
  if (currentBgm) {
    currentBgm.audio.pause();
    currentBgm.audio.currentTime = 0;

    disconnectBgm(currentBgm);
  }

  currentBgm = null;
  currentAnalyser = null;
  analyserData = null;

  stopStageLights();
}

/* ==================================================
   周波数反応ステージライト
================================================== */

function getFrequencyAverage(fromHz, toHz) {
  if (
    !audioContext ||
    !currentAnalyser ||
    !analyserData
  ) {
    return 0;
  }

  currentAnalyser.getByteFrequencyData(analyserData);

  const nyquist = audioContext.sampleRate / 2;

  const fromIndex = Math.max(
    0,
    Math.floor(
      (fromHz / nyquist) * analyserData.length
    )
  );

  const toIndex = Math.min(
    analyserData.length - 1,
    Math.ceil(
      (toHz / nyquist) * analyserData.length
    )
  );

  let total = 0;
  let count = 0;

  for (let index = fromIndex; index <= toIndex; index += 1) {
    total += analyserData[index];
    count += 1;
  }

  return count ? total / count / 255 : 0;
}

function updateStageLights() {
  const bass = getFrequencyAverage(40, 160);
  const middle = getFrequencyAverage(160, 800);
  const high = getFrequencyAverage(2000, 8000);

  const feverBoost = isFever() ? 0.15 : 0;

  if (el.stageLeft) {
    el.stageLeft.style.opacity = String(
      0.08 + middle * 0.28 + feverBoost
    );

    el.stageLeft.style.transform =
      `rotate(${-24 + middle * 11}deg) scale(${1 + bass * 0.28})`;
  }

  if (el.stageRight) {
    el.stageRight.style.opacity = String(
      0.08 + middle * 0.28 + feverBoost
    );

    el.stageRight.style.transform =
      `rotate(${24 - middle * 11}deg) scale(${1 + bass * 0.28})`;
  }

  if (el.stageCenter) {
    el.stageCenter.style.opacity = String(
      0.06 + bass * 0.35 + feverBoost
    );

    el.stageCenter.style.transform =
      `translateX(-50%) scale(${1 + bass * 0.34})`;
  }

  if (el.laserLeft) {
    el.laserLeft.style.opacity = String(
      0.05 + high * 0.4
    );

    el.laserLeft.style.transform =
      `rotate(${25 + high * 18}deg)`;
  }

  if (el.laserRight) {
    el.laserRight.style.opacity = String(
      0.05 + high * 0.4
    );

    el.laserRight.style.transform =
      `rotate(${-25 - high * 18}deg)`;
  }

  stageAnimationId = requestAnimationFrame(
    updateStageLights
  );
}

function startStageLights() {
  if (stageAnimationId) {
    return;
  }

  updateStageLights();
}

function stopStageLights() {
  if (stageAnimationId) {
    cancelAnimationFrame(stageAnimationId);
  }

  stageAnimationId = null;
}

/* ==================================================
   ゲーム開始
================================================== */

function startGame() {
  clearGameTimers();
  stopBgm();
  unlockAudio();

  state = createGameState();

  closeAllModals();

  if (el.app) {
    el.app.classList.remove("is-fever");
    el.app.classList.remove("is-over-flash");
  }

  if (el.overPopup) {
    el.overPopup.classList.add("hidden");
    el.overPopup.classList.remove("show");
  }

  showScreen(el.game);

  createBgmForCurrentLevel();
  prepareBgmForStart();

  renderGame();
  runCountdown();
}

function runCountdown() {
  if (!state) {
    return;
  }

  const words = [
    "READY?",
    "3",
    "2",
    "1",
    "GO!"
  ];

  let index = 0;

  if (el.countdown) {
    el.countdown.classList.remove("hidden");
  }

  function showWord() {
    if (!state || state.isEnded) {
      return;
    }

    if (el.countdownText) {
      el.countdownText.textContent = words[index];
    }

    index += 1;

    if (index < words.length) {
      const delay = index === 1 ? 850 : 720;

      setTimeout(showWord, delay);
      return;
    }

    setTimeout(() => {
      if (!state || state.isEnded) {
        return;
      }

      if (el.countdown) {
        el.countdown.classList.add("hidden");
      }

      state.isBusy = false;

      startClock();
      startBgm();
      spawnRing();
    }, 620);
  }

  showWord();
}

function startClock() {
  clearInterval(clockTimer);

  clockTimer = setInterval(() => {
    if (
      !state ||
      state.isBusy ||
      state.isPaused ||
      state.isEnded
    ) {
      return;
    }

    state.time -= 1;

    renderGame();

    if (state.time <= 0) {
      endGame("TIME UP");
    }
  }, 1000);
}

/* ==================================================
   リング
================================================== */

function spawnRing() {
  if (
    !state ||
    state.isEnded ||
    state.isPaused
  ) {
    return;
  }

  const nextRing = state.queue.shift();

  state.queue.push(createRingData());

  state.activeRing = {
    type: nextRing.type,
    number: nextRing.number,
    row: Math.floor(Math.random() * CONFIG.rows),
    col: CONFIG.cols - 1
  };

  state.selectedRow = null;

  renderGame();

  clearInterval(moveTimer);

  moveTimer = setInterval(
    moveActiveRing,
    CONFIG.ringStepMs
  );
}

function moveActiveRing() {
  if (
    !state ||
    !state.activeRing ||
    state.isBusy ||
    state.isPaused ||
    state.isEnded
  ) {
    return;
  }

  const active = state.activeRing;
  const nextCol = active.col - 1;

  if (
    nextCol < 0 ||
    state.board[active.row][nextCol]
  ) {
    landActiveRing(active.col);
    return;
  }

  active.col = nextCol;

  renderGame();
}

function chooseRow(row) {
  if (
    !state ||
    !state.activeRing ||
    state.isBusy ||
    state.isPaused ||
    state.isEnded
  ) {
    return;
  }

  if (state.selectedRow !== row) {
    state.selectedRow = row;
    state.activeRing.row = row;

    setStatus("TARGET LOCK");
    renderGame();

    return;
  }

  let landingCol = state.activeRing.col;

  while (
    landingCol > 0 &&
    !state.board[row][landingCol - 1]
  ) {
    landingCol -= 1;
  }

  landActiveRing(landingCol);
}

function landActiveRing(col) {
  clearInterval(moveTimer);

  if (
    !state ||
    !state.activeRing ||
    col >= CONFIG.cols
  ) {
    return;
  }

  state.isBusy = true;

  const active = state.activeRing;
  const row = active.row;

  const newPiece = makePiece(
    active.type,
    active.number
  );

  state.activeRing = null;

  if (newPiece.type === "star") {
    resolveStar(row);
    return;
  }

  state.board[row][col] = newPiece;

  const group = getGroup(row);

  if (group.total > 8) {
    state.board[row][col] = null;

    compactBoard();

    if (group.orb) {
      addOver(group.total);
    } else {
      setStatus("WHITE OVER");
      showOverNumber(group.total);
    }

    renderGame();

    setTimeout(finishTurn, 280);

    return;
  }

  compactBoard();
  resolveClears(1);
}

/* ==================================================
   盤面・合計
================================================== */

function compactRow(row) {
  const source = state.board[row];

  const orb = source.find((piece) => {
    return piece && piece.type === "orb";
  });

  const rings = source.filter((piece) => {
    return piece && piece.type === "ring";
  });

  const nextRow = Array(CONFIG.cols).fill(null);

  let writeCol = 0;

  if (orb) {
    nextRow[0] = orb;
    writeCol = 1;
  }

  rings.forEach((ring) => {
    if (writeCol < CONFIG.cols) {
      nextRow[writeCol] = ring;
      writeCol += 1;
    }
  });

  if (orb) {
    for (let col = 1; col < CONFIG.cols; col += 1) {
      const ring = nextRow[col];

      if (!ring) {
        break;
      }

      ring.color = orb.color;
    }
  } else {
    nextRow.forEach((ring) => {
      if (ring && ring.type === "ring") {
        ring.color = null;
      }
    });
  }

  state.board[row] = nextRow;
}

function compactBoard() {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    compactRow(row);
  }
}

function getGroup(row) {
  const cells = state.board[row];

  const orb =
    cells[0] && cells[0].type === "orb"
      ? cells[0]
      : null;

  const ringColumns = [];
  const pieceColumns = [];

  let total = 0;
  let startCol = 0;

  if (orb) {
    total += orb.number;
    pieceColumns.push(0);
    startCol = 1;
  }

  for (let col = startCol; col < CONFIG.cols; col += 1) {
    const piece = cells[col];

    if (!piece || piece.type !== "ring") {
      break;
    }

    total += piece.number;
    ringColumns.push(col);
    pieceColumns.push(col);
  }

  return {
    row,
    orb,
    ringColumns,
    pieceColumns,
    total
  };
}

/* ==================================================
   通常消去
================================================== */

function resolveClears(chainCount) {
  if (!state || state.isEnded) {
    return;
  }

  const groups = state.board.map((_, row) => {
    return getGroup(row);
  });

  const clearGroups = groups.filter((group) => {
    return (
      group.total === 8 &&
      group.ringColumns.length > 0
    );
  });

  if (clearGroups.length === 0) {
    setStatus("READY");
    finishTurn();
    return;
  }

  const orbGroups = clearGroups.filter((group) => {
    return Boolean(group.orb);
  });

  let gainedScore = 0;

  orbGroups.forEach(() => {
    gainedScore += CONFIG.clearScore;
  });

  if (orbGroups.length >= 2) {
    gainedScore +=
      CONFIG.simultaneousBonus *
      (orbGroups.length - 1);
  }

  const chainMultiplier =
    chainCount >= 3
      ? 1.5
      : chainCount === 2
        ? 1.25
        : 1;

  const feverMultiplier = isFever()
    ? CONFIG.feverMultiplier
    : 1;

  gainedScore = Math.floor(
    gainedScore *
    chainMultiplier *
    feverMultiplier
  );

  clearGroups.forEach((group) => {
    group.pieceColumns.forEach((col) => {
      state.board[group.row][col] = null;
    });
  });

  if (orbGroups.length > 0) {
    state.score += gainedScore;

    state.over = Math.max(
      0,
      state.over - orbGroups.length
    );

    if (orbGroups.length >= 2) {
      setStatus("SIMULTANEOUS!");
    } else if (chainCount >= 2) {
      setStatus(`${chainCount} CHAIN!`);
    } else {
      setStatus("CLEAR!");
    }

    const soundSpeed =
      chainCount >= 3
        ? 1.45
        : chainCount === 2
          ? 1.2
          : 1;

    playClearSound(soundSpeed);
  } else {
    setStatus("WHITE CLEAR");
  }

  compactBoard();
  checkLevelUp();
  renderGame();

  setTimeout(() => {
    if (!state || state.isEnded) {
      return;
    }

    if (!hasAnyOrb()) {
      startFeverAndRespawn();
      return;
    }

    const hasChain = state.board.some((_, row) => {
      const group = getGroup(row);

      return (
        group.total === 8 &&
        group.ringColumns.length > 0
      );
    });

    if (hasChain) {
      resolveClears(chainCount + 1);
      return;
    }

    finishTurn();
  }, 280);
}

/* ==================================================
   ★リング
================================================== */

function resolveStar(row) {
  if (!state || state.isEnded) {
    return;
  }

  const pieces = state.board[row].filter(Boolean);

  const clearCount = Math.max(1, pieces.length);

  const feverMultiplier = isFever()
    ? CONFIG.feverMultiplier
    : 1;

  const gainedScore =
    clearCount *
    CONFIG.clearScore *
    feverMultiplier;

  const hadOrb = pieces.some((piece) => {
    return piece.type === "orb";
  });

  state.board[row] = Array(CONFIG.cols).fill(null);

  if (hadOrb) {
    state.over = Math.max(0, state.over - 1);
  }

  state.score += gainedScore;

  setStatus(
    clearCount >= 2
      ? `★ × ${clearCount} CLEAR!`
      : "★ CLEAR!"
  );

  playStarSound();

  compactBoard();
  checkLevelUp();
  renderGame();

  setTimeout(() => {
    if (!state || state.isEnded) {
      return;
    }

    if (!hasAnyOrb()) {
      startFeverAndRespawn();
      return;
    }

    finishTurn();
  }, 420);
}

/* ==================================================
   オーバー
================================================== */

function addOver(total) {
  if (!state) {
    return;
  }

  state.over += 1;

  setStatus("OVER");

  playOverSound();
  showOverNumber(total);

  if (el.app) {
    el.app.classList.remove("is-over-flash");

    requestAnimationFrame(() => {
      el.app.classList.add("is-over-flash");
    });
  }

  renderGame();

  if (state.over >= 5) {
    setTimeout(() => {
      endGame("OVER LIMIT");
    }, 800);
  }
}

function showOverNumber(total) {
  if (!el.overPopup) {
    return;
  }

  el.overPopup.textContent = String(total);

  /*
    hiddenを外さないと、CSSのdisplay:none !importantが
    showより強く残ってしまう。そのため必ずここで外す。
  */
  el.overPopup.classList.remove("hidden");
  el.overPopup.classList.remove("show");

  requestAnimationFrame(() => {
    if (el.overPopup) {
      el.overPopup.classList.add("show");
    }
  });

  setTimeout(() => {
    if (!el.overPopup) {
      return;
    }

    el.overPopup.classList.remove("show");
    el.overPopup.classList.add("hidden");
  }, 1000);
}

/* ==================================================
   フィーバー
================================================== */

function hasAnyOrb() {
  if (!state) {
    return false;
  }

  return state.board.some((row) => {
    return row.some((piece) => {
      return piece && piece.type === "orb";
    });
  });
}

function startFeverAndRespawn() {
  if (!state || state.isEnded) {
    return;
  }

  state.feverUntil =
    Date.now() + CONFIG.feverDuration;

  setStatus("ALL CLEAR! FEVER!");

  if (el.app) {
    el.app.classList.add("is-fever");
  }

  renderGame();

  setTimeout(() => {
    if (!state || state.isEnded) {
      return;
    }

    for (let row = 0; row < CONFIG.rows; row += 1) {
      const rings = state.board[row]
        .filter((piece) => {
          return piece && piece.type === "ring";
        })
        .slice(0, CONFIG.cols - 1);

      state.board[row] = [
        makePiece("orb", randomNumber(), row),
        ...rings,
        ...Array(
          CONFIG.cols - 1 - rings.length
        ).fill(null)
      ];
    }

    compactBoard();
    renderGame();
    finishTurn();
  }, 520);

  setTimeout(() => {
    if (el.app) {
      el.app.classList.remove("is-fever");
    }

    if (state && !state.isEnded) {
      renderGame();
    }
  }, CONFIG.feverDuration);
}

/* ==================================================
   レベルアップ
================================================== */

function checkLevelUp() {
  if (
    !state ||
    state.level >= CONFIG.maxLevel
  ) {
    return;
  }

  const targetLevel = Math.min(
    CONFIG.maxLevel,
    Math.floor(
      state.score / CONFIG.levelScoreStep
    ) + 1
  );

  if (targetLevel <= state.level) {
    return;
  }

  state.level = targetLevel;

  /*
    レベルアップするごとに300秒へ完全回復
  */
  state.time = CONFIG.startTime;

  setStatus("LEVEL UP! TIME RESET");

  changeBgmForLevel();
}

/* ==================================================
   ターン完了
================================================== */

function finishTurn() {
  renderGame();

  setTimeout(() => {
    if (
      !state ||
      state.isEnded ||
      state.isPaused
    ) {
      return;
    }

    state.isBusy = false;
    spawnRing();
  }, 280);
}

/* ==================================================
   中断・終了
================================================== */

function pauseGame() {
  if (
    !state ||
    state.isEnded ||
    state.isPaused
  ) {
    return;
  }

  state.isPaused = true;

  clearGameTimers();
  pauseBgm();

  if (el.abortModal) {
    el.abortModal.classList.add("open");
  }
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

  if (el.abortModal) {
    el.abortModal.classList.remove("open");
  }

  resumeBgm();
  startClock();

  if (state.activeRing) {
    moveTimer = setInterval(
      moveActiveRing,
      CONFIG.ringStepMs
    );
  }
}

function endGame(reason) {
  if (!state || state.isEnded) {
    return;
  }

  state.isEnded = true;
  state.isBusy = true;

  clearGameTimers();
  stopBgm();

  if (el.app) {
    el.app.classList.remove("is-fever");
  }

  if (el.gameOverReason) {
    el.gameOverReason.textContent = reason;
  }

  if (el.finalScore) {
    el.finalScore.textContent = String(state.score);
  }

  if (el.gameOver) {
    el.gameOver.classList.add("open");
  }
}

function returnTitle() {
  clearGameTimers();
  stopBgm();

  state = null;

  if (el.app) {
    el.app.classList.remove("is-fever");
    el.app.classList.remove("is-over-flash");
  }

  closeAllModals();

  if (el.countdown) {
    el.countdown.classList.add("hidden");
  }

  if (el.overPopup) {
    el.overPopup.classList.add("hidden");
    el.overPopup.classList.remove("show");
  }

  showScreen(el.title);
}

/* ==================================================
   描画
================================================== */

function createPieceElement(piece, active, total) {
  const node = document.createElement("div");

  let typeClass = "ring";

  if (piece.type === "orb") {
    typeClass = "orb";
  }

  if (piece.type === "star") {
    typeClass = "ring star-ring";
  }

  node.className = `piece ${typeClass}`;

  if (active) {
    node.classList.add("active");
  }

  if (
    piece.color !== null &&
    piece.color !== undefined
  ) {
    node.classList.add(`c${piece.color}`);
  }

  if (total >= 5 && total <= 7) {
    node.classList.add(`t${total}`);
  }

  node.textContent =
    piece.type === "star"
      ? "★"
      : String(piece.number);

  return node;
}

function getPreparedClass(group, col) {
  if (
    group.total < 5 ||
    group.total > 7 ||
    !group.pieceColumns.includes(col)
  ) {
    return "";
  }

  return `prep-${group.total}`;
}

function renderGame() {
  if (!state || !el.board) {
    return;
  }

  el.board.innerHTML = "";

  for (let row = 0; row < CONFIG.rows; row += 1) {
    const group = getGroup(row);

    for (let col = 0; col < CONFIG.cols; col += 1) {
      const cell = document.createElement("button");

      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);

      const preparedClass = getPreparedClass(
        group,
        col
      );

      if (preparedClass) {
        cell.classList.add(preparedClass);
      }

      if (state.selectedRow === row) {
        cell.classList.add("target");
      }

      const piece = state.board[row][col];

      if (piece) {
        cell.append(
          createPieceElement(
            piece,
            false,
            group.total
          )
        );
      }

      if (
        state.activeRing &&
        state.activeRing.row === row &&
        state.activeRing.col === col
      ) {
        cell.append(
          createPieceElement(
            {
              type: state.activeRing.type,
              number: state.activeRing.number,
              color: null
            },
            true,
            0
          )
        );
      }

      el.board.append(cell);
    }
  }

  renderQueue();
  renderHud();
}

function renderQueue() {
  if (!state || !el.queueList) {
    return;
  }

  /*
    ここには控えリングだけを描画する。
    中断ボタンはHTMLに元から1つあるものを使う。
    これで中断ボタンが2つ出ない。
  */
  el.queueList.innerHTML = "";

  state.queue.forEach((ringData) => {
    const ring = document.createElement("div");

    ring.className = "queue-ring";

    if (ringData.type === "star") {
      ring.classList.add("star-ring");
      ring.textContent = "★";
    } else {
      ring.textContent = String(ringData.number);
    }

    el.queueList.append(ring);
  });
}

function renderHud() {
  if (!state) {
    return;
  }

  if (el.score) {
    el.score.textContent = String(state.score);
  }

  if (el.level) {
    el.level.textContent = String(state.level);
  }

  if (el.time) {
    el.time.textContent = String(
      Math.max(0, state.time)
    );
  }

  if (el.over) {
    el.over.classList.remove(
      "over-1",
      "over-2",
      "over-3",
      "over-4",
      "over-5"
    );

    if (state.over > 0) {
      el.over.classList.add(
        `over-${state.over}`
      );
    }

    el.over.querySelectorAll("i").forEach(
      (bar, index) => {
        bar.classList.toggle(
          "on",
          index < state.over
        );
      }
    );
  }
}

/* ==================================================
   チュートリアル
================================================== */

function startTutorial() {
  tutorialIndex = 0;

  if (el.tutorialModal) {
    el.tutorialModal.classList.remove("open");
  }

  showScreen(el.tutorial);
  renderTutorial();
}

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
    const label =
      tutorialIndex === TUTORIAL_TEXTS.length - 1
        ? "完了"
        : "つぎへ";

    const labelElement =
      el.tutorialNext.querySelector("strong");

    if (labelElement) {
      labelElement.textContent = label;
    } else {
      el.tutorialNext.textContent = label;
    }
  }
}

function nextTutorial() {
  tutorialIndex += 1;

  if (tutorialIndex >= TUTORIAL_TEXTS.length) {
    if (el.tutorialModal) {
      el.tutorialModal.classList.add("open");
    }

    return;
  }

  renderTutorial();
}

/* ==================================================
   イベント
================================================== */

el.start?.addEventListener("click", startGame);

el.tutorialButton?.addEventListener(
  "click",
  startTutorial
);

el.board?.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");

  if (!cell) {
    return;
  }

  chooseRow(Number(cell.dataset.row));
});

el.abort?.addEventListener("click", pauseGame);

el.tutorialExit?.addEventListener(
  "click",
  returnTitle
);

el.tutorialNext?.addEventListener(
  "click",
  nextTutorial
);

el.tutorialStart?.addEventListener(
  "click",
  startGame
);

el.tutorialRestart?.addEventListener(
  "click",
  startTutorial
);

el.tutorialTitle?.addEventListener(
  "click",
  returnTitle
);

el.abortResume?.addEventListener(
  "click",
  resumeGame
);

el.abortRetry?.addEventListener(
  "click",
  startGame
);

el.abortTitle?.addEventListener(
  "click",
  returnTitle
);

el.retry?.addEventListener(
  "click",
  startGame
);

el.titleButton?.addEventListener(
  "click",
  returnTitle
);

/*
  別タブ・別アプリへ移動した場合は自動中断。
*/
document.addEventListener("visibilitychange", () => {
  if (
    document.hidden &&
    state &&
    !state.isPaused &&
    !state.isEnded &&
    el.game?.classList.contains("is-active")
  ) {
    pauseGame();
  }
});

showScreen(el.title);
