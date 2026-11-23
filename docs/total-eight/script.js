"use strict";

/* ==================================================
   とーたるえいと❣️
   ゲーム本体
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
  queue: $("#ring-queue-list"),

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

  stageLeft: $(".stage-light.left"),
  stageRight: $(".stage-light.right"),
  stageCenter: $(".stage-light.center"),
  laserA: $(".stage-laser.laser-a"),
  laserB: $(".stage-laser.laser-b")
};

let state = null;

let moveTimer = null;
let clockTimer = null;
let tutorialIndex = 0;
let pieceId = 0;

/* Web Audio */
let audioContext = null;
let currentBgm = null;
let currentAnalyser = null;
let analyserData = null;
let stageAnimationId = null;

/* ==================================================
   基本データ
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

function makeInitialBoard() {
  return Array.from({ length: CONFIG.rows }, (_, row) => {
    const cells = Array(CONFIG.cols).fill(null);

    cells[0] = makePiece("orb", randomNumber(), row);

    return cells;
  });
}

function createGameState() {
  return {
    board: makeInitialBoard(),
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

    selectedBgmByLevel: {}
  };
}

/* ==================================================
   画面・タイマー
================================================== */

function showScreen(target) {
  [el.title, el.game, el.tutorial].forEach((screen) => {
    if (screen) {
      screen.classList.remove("is-active");
    }
  });

  if (target) {
    target.classList.add("is-active");
  }
}

function clearGameTimers() {
  clearInterval(moveTimer);
  clearInterval(clockTimer);

  moveTimer = null;
  clockTimer = null;
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

function isFever() {
  return state && Date.now() < state.feverUntil;
}

function setStatus(text) {
  if (el.status) {
    el.status.textContent = text;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/* ==================================================
   音
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

function playTone(frequency, startTime, duration, volume = 0.12) {
  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(
    volume,
    startTime + 0.012
  );
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    startTime + duration
  );

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
}

function playClearSound(chainSpeed = 1) {
  if (!audioContext || !state) {
    return;
  }

  const scale = [0, 2, 4, 5, 7, 9, 11, 12];

  const keyShift = (state.level - 1) * 2;
  const root = 261.63 * (2 ** (keyShift / 12));

  const now = audioContext.currentTime;
  const interval = 0.078 / chainSpeed;

  scale.forEach((note, index) => {
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

  /*
    ド → ソ → レ → ド
    最後ほど低い音へ落ちる警告音
  */
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
    return null;
  }

  if (state.selectedBgmByLevel[level]) {
    return state.selectedBgmByLevel[level];
  }

  let fileName = "";

  if (level === 1) {
    fileName = "level-1.mp3";
  }

  if (level === 2) {
    fileName = "level-2.mp3";
  }

  if (level === 3) {
    fileName = "level-3.mp3";
  }

  if (level === 4) {
    fileName =
      Math.random() < 0.5
        ? "level-4-a.mp3"
        : "level-4-b.mp3";
  }

  if (level >= 5) {
    fileName =
      Math.random() < 0.5
        ? "level-5-a.mp3"
        : "level-5-b.mp3";
  }

  const path = `assets/audio/bgm/${fileName}`;

  state.selectedBgmByLevel[level] = path;

  return path;
}

function disconnectBgm(bgmData) {
  if (!bgmData) {
    return;
  }

  try {
    bgmData.source.disconnect();
  } catch (error) {
    /* 接続解除済みなら何もしない */
  }

  try {
    bgmData.analyser.disconnect();
  } catch (error) {
    /* 接続解除済みなら何もしない */
  }
}

function startBgm() {
  if (!audioContext || !state || state.isEnded) {
    return;
  }

  const path = getBgmPath(state.level);

  if (!path) {
    return;
  }

  const previous = currentBgm;

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
  analyserData = new Uint8Array(analyser.frequencyBinCount);

  audio.play().catch(() => {
    /* MP3がまだ未配置でもゲーム自体は継続 */
  });

  let step = 0;
  const fadeSteps = 18;
  const fadeInterval = CONFIG.bgmFadeMs / fadeSteps;

  const fadeTimer = setInterval(() => {
    step += 1;

    const progress = step / fadeSteps;

    audio.volume = Math.min(
      CONFIG.bgmVolume,
      CONFIG.bgmVolume * progress
    );

    if (previous) {
      previous.audio.volume = Math.max(
        0,
        CONFIG.bgmVolume * (1 - progress)
      );
    }

    if (step >= fadeSteps) {
      clearInterval(fadeTimer);

      if (previous) {
        previous.audio.pause();
        previous.audio.currentTime = 0;
        disconnectBgm(previous);
      }
    }
  }, fadeInterval);

  startStageLights();
}

function pauseBgm() {
  if (!currentBgm) {
    return;
  }

  currentBgm.audio.pause();
}

function resumeBgm() {
  if (!currentBgm || !state || state.isEnded) {
    return;
  }

  currentBgm.audio.play().catch(() => {});
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

function averageFrequency(fromHz, toHz) {
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
    Math.floor((fromHz / nyquist) * analyserData.length)
  );

  const toIndex = Math.min(
    analyserData.length - 1,
    Math.ceil((toHz / nyquist) * analyserData.length)
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
  if (!el.app) {
    return;
  }

  const bass = averageFrequency(40, 160);
  const middle = averageFrequency(160, 800);
  const high = averageFrequency(2000, 8000);

  const feverBoost = isFever() ? 0.15 : 0;

  const leftOpacity = 0.08 + middle * 0.28 + feverBoost;
  const rightOpacity = 0.08 + middle * 0.27 + feverBoost;
  const centerOpacity = 0.06 + bass * 0.35 + feverBoost;

  if (el.stageLeft) {
    el.stageLeft.style.opacity = String(leftOpacity);
    el.stageLeft.style.transform =
      `rotate(${-24 + middle * 11}deg) scale(${1 + bass * 0.28})`;
  }

  if (el.stageRight) {
    el.stageRight.style.opacity = String(rightOpacity);
    el.stageRight.style.transform =
      `rotate(${24 - middle * 11}deg) scale(${1 + bass * 0.28})`;
  }

  if (el.stageCenter) {
    el.stageCenter.style.opacity = String(centerOpacity);
    el.stageCenter.style.transform =
      `translateX(-50%) scale(${1 + bass * 0.34})`;
  }

  if (el.laserA) {
    el.laserA.style.opacity = String(0.05 + high * 0.4);
    el.laserA.style.transform =
      `rotate(${25 + high * 18}deg)`;
  }

  if (el.laserB) {
    el.laserB.style.opacity = String(0.05 + high * 0.4);
    el.laserB.style.transform =
      `rotate(${-25 - high * 18}deg)`;
  }

  stageAnimationId = requestAnimationFrame(updateStageLights);
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

  [
    el.stageLeft,
    el.stageRight,
    el.stageCenter,
    el.laserA,
    el.laserB
  ].forEach((light) => {
    if (light) {
      light.style.removeProperty("opacity");
      light.style.removeProperty("transform");
    }
  });
}

/* ==================================================
   ゲーム開始・カウントダウン
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

  showScreen(el.game);

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

  let wordIndex = 0;

  if (el.countdown) {
    el.countdown.classList.remove("hidden");
  }

  function showNextWord() {
    if (!state || state.isEnded) {
      return;
    }

    if (el.countdownText) {
      el.countdownText.textContent = words[wordIndex];
    }

    wordIndex += 1;

    if (wordIndex < words.length) {
      const delay = wordIndex === 1 ? 850 : 720;

      setTimeout(showNextWord, delay);
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

  showNextWord();
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
   リング出現・移動・固定
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

  /*
    1回目：
    流れているリングを選択したレーンへ移動。
  */
  if (state.selectedRow !== row) {
    state.selectedRow = row;
    state.activeRing.row = row;

    setStatus("TARGET LOCK");

    renderGame();
    return;
  }

  /*
    同じレーンをもう1回：
    そのレーンの一番左側へ即固定。
  */
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

  /*
    ★リング：
    盤面へ通常配置せず、即座にレーン一列を消す。
  */
  if (newPiece.type === "star") {
    state.activeRing = null;

    resolveStar(row);
    return;
  }

  state.board[row][col] = newPiece;
  state.activeRing = null;

  const group = getGroup(row);

  /*
    合計9以上：
    直前に置いたリングだけ消える。
    オーブ列だけオーバーゲージが増える。
    白リング列のオーバーはゲージ増加なし。
  */
  if (group.total > 8) {
    state.board[row][col] = null;

    compactBoard();

    if (group.orb) {
      addOver(group.total);
    } else {
      setStatus("WHITE OVER");
    }

    renderGame();

    setTimeout(() => {
      finishTurn();
    }, 250);

    return;
  }

  compactBoard();
  resolveClears(1);
}

/* ==================================================
   盤面整理・計算
================================================== */

function compactRow(row) {
  const source = state.board[row];

  const orb = source.find((piece) => {
    return piece && piece.type === "orb";
  });

  const rings = source.filter((piece) => {
    return piece && piece.type === "ring";
  });

  const compacted = Array(CONFIG.cols).fill(null);

  let writeCol = 0;

  if (orb) {
    compacted[0] = orb;
    writeCol = 1;
  }

  rings.forEach((ring) => {
    if (writeCol < CONFIG.cols) {
      compacted[writeCol] = ring;
      writeCol += 1;
    }
  });

  /*
    オーブに接続しているリングは、オーブ色へ伝播。
    オーブがない白リング列は白のまま。
  */
  if (orb) {
    for (let col = 1; col < CONFIG.cols; col += 1) {
      const ring = compacted[col];

      if (!ring) {
        break;
      }

      ring.color = orb.color;
    }
  } else {
    compacted.forEach((ring) => {
      if (ring && ring.type === "ring") {
        ring.color = null;
      }
    });
  }

  state.board[row] = compacted;
}

function compactBoard() {
  if (!state) {
    return;
  }

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
    const ring = cells[col];

    if (!ring || ring.type !== "ring") {
      break;
    }

    total += ring.number;
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
   通常消去・連鎖
================================================== */

function resolveClears(chainCount = 1) {
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

  const orbClearGroups = clearGroups.filter((group) => {
    return Boolean(group.orb);
  });

  const whiteClearGroups = clearGroups.filter((group) => {
    return !group.orb;
  });

  const feverMultiplier = isFever()
    ? CONFIG.feverMultiplier
    : 1;

  let gainedScore = 0;

  /*
    オーブ列の消去だけが通常得点。
    白リング列の合計8消去は得点なし。
  */
  orbClearGroups.forEach(() => {
    gainedScore += CONFIG.clearScore;
  });

  /*
    同時消去ボーナス
  */
  if (orbClearGroups.length >= 2) {
    gainedScore +=
      CONFIG.simultaneousBonus *
      (orbClearGroups.length - 1);
  }

  /*
    連鎖2回目以降は倍率を少し上げる。
  */
  const chainMultiplier =
    chainCount >= 3
      ? 1.5
      : chainCount === 2
        ? 1.25
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

  if (orbClearGroups.length > 0) {
    state.score += gainedScore;

    /*
      オーブ列を8で消すごとに、
      オーバーゲージを1つ戻す。
    */
    state.over = Math.max(
      0,
      state.over - orbClearGroups.length
    );

    if (orbClearGroups.length >= 2) {
      setStatus("SIMULTANEOUS!");
    } else if (chainCount >= 2) {
      setStatus(`${chainCount} CHAIN!`);
    } else {
      setStatus("CLEAR!");
    }

    const speed =
      chainCount >= 3
        ? 1.45
        : chainCount === 2
          ? 1.2
          : 1;

    playClearSound(speed);
  } else if (whiteClearGroups.length > 0) {
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
  }, 260);
}

/* ==================================================
   ★リング
================================================== */

function resolveStar(row) {
  if (!state || state.isEnded) {
    return;
  }

  const piecesInRow = state.board[row].filter((piece) => {
    return Boolean(piece);
  });

  /*
    空白レーンに★を置いた時も、
    「8を1個作った」として得点。
  */
  const clearCount = Math.max(1, piecesInRow.length);

  const feverMultiplier = isFever()
    ? CONFIG.feverMultiplier
    : 1;

  const gainedScore =
    clearCount *
    CONFIG.clearScore *
    feverMultiplier;

  const hadOrb = piecesInRow.some((piece) => {
    return piece.type === "orb";
  });

  state.board[row] = Array(CONFIG.cols).fill(null);

  /*
    ★でオーブ列を消した場合も、
    オーバーゲージを1つ戻す。
  */
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
      if (el.app) {
        el.app.classList.add("is-over-flash");
      }
    });
  }

  renderGame();

  if (state.over >= 5) {
    setTimeout(() => {
      endGame("OVER LIMIT");
    }, 680);
  }
}

function showOverNumber(total) {
  if (!el.overPopup) {
    return;
  }

  el.overPopup.textContent = String(total);

  el.overPopup.classList.remove("show");

  requestAnimationFrame(() => {
    if (el.overPopup) {
      el.overPopup.classList.add("show");
    }
  });

  setTimeout(() => {
    if (el.overPopup) {
      el.overPopup.classList.remove("show");
    }
  }, 780);
}

/* ==================================================
   フィーバー・再出現
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

    /*
      残っている白リングはそのまま。
      その左側に新しいオーブを出す。
    */
    for (let row = 0; row < CONFIG.rows; row += 1) {
      const remainingRings = state.board[row]
        .filter((piece) => {
          return piece && piece.type === "ring";
        })
        .slice(0, CONFIG.cols - 1);

      state.board[row] = [
        makePiece("orb", randomNumber(), row),
        ...remainingRings,
        ...Array(
          CONFIG.cols - 1 - remainingRings.length
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
  if (!state || state.level >= CONFIG.maxLevel) {
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
    レベルアップ時は残り時間を300秒に完全回復
  */
  state.time = CONFIG.startTime;

  setStatus("LEVEL UP! TIME RESET");

  startBgm();
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
   中断・再開・終了
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

  clearInterval(moveTimer);
  clearInterval(clockTimer);

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

  if (!state.isBusy) {
    startClock();

    if (state.activeRing) {
      moveTimer = setInterval(
        moveActiveRing,
        CONFIG.ringStepMs
      );
    }
  }
}

function endGame(reason = "TIME UP") {
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

  showScreen(el.title);
}

/* ==================================================
   描画
================================================== */

function createPieceElement(piece, isActive = false, total = 0) {
  const node = document.createElement("div");

  const typeClass =
    piece.type === "orb"
      ? "orb"
      : piece.type === "star"
        ? "ring star-ring"
        : "ring";

  node.className = `piece ${typeClass}`;

  if (isActive) {
    node.classList.add("active");
  }

  if (
    piece.color !== null &&
    piece.color !== undefined
  ) {
    node.classList.add(`c${piece.color}`);
  }

  /*
    合計値そのものは表示しない。
    合計5/6/7だけ、ピースの発光や点滅で知らせる。
  */
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
  if (!state) {
    return;
  }

  if (!el.board) {
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

      const preparedClass = getPreparedClass(group, col);

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

  renderOverGauge();
}

function renderQueue() {
  if (!el.queue || !state) {
    return;
  }

  el.queue.innerHTML = "";

  state.queue.forEach((ringData) => {
    const ring = document.createElement("div");

    ring.className = "queue-ring";

    if (ringData.type === "star") {
      ring.classList.add("star-ring");
      ring.textContent = "★";
    } else {
      ring.textContent = String(ringData.number);
    }

    el.queue.append(ring);
  });

  /*
    中断ボタンを、
    控えリングが縦に並ぶ列の最下部へ置く。
  */
  const abortButton = document.createElement("button");

  abortButton.type = "button";
  abortButton.className = "queue-abort";
  abortButton.id = "abort-button";
  abortButton.textContent = "中断";

  abortButton.addEventListener("click", pauseGame);

  el.queue.append(abortButton);

  /*
    最初にHTMLから取ったボタン参照も最新のものへ更新。
  */
  el.abort = abortButton;
}

function renderOverGauge() {
  if (!el.over || !state) {
    return;
  }

  el.over.classList.remove(
    "over-1",
    "over-2",
    "over-3",
    "over-4",
    "over-5"
  );

  if (state.over > 0) {
    el.over.classList.add(`over-${state.over}`);
  }

  el.over.querySelectorAll("i").forEach((bar, index) => {
    bar.classList.toggle("on", index < state.over);
  });
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

    const strong = el.tutorialNext.querySelector("strong");

    if (strong) {
      strong.textContent = label;
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

if (el.start) {
  el.start.addEventListener("click", startGame);
}

if (el.tutorialButton) {
  el.tutorialButton.addEventListener(
    "click",
    startTutorial
  );
}

if (el.board) {
  el.board.addEventListener("click", (event) => {
    const cell = event.target.closest(".cell");

    if (!cell) {
      return;
    }

    chooseRow(Number(cell.dataset.row));
  });
}

if (el.tutorialExit) {
  el.tutorialExit.addEventListener(
    "click",
    returnTitle
  );
}

if (el.tutorialNext) {
  el.tutorialNext.addEventListener(
    "click",
    nextTutorial
  );
}

if (el.tutorialStart) {
  el.tutorialStart.addEventListener(
    "click",
    startGame
  );
}

if (el.tutorialRestart) {
  el.tutorialRestart.addEventListener(
    "click",
    startTutorial
  );
}

if (el.tutorialTitle) {
  el.tutorialTitle.addEventListener(
    "click",
    returnTitle
  );
}

if (el.abortResume) {
  el.abortResume.addEventListener(
    "click",
    resumeGame
  );
}

if (el.abortRetry) {
  el.abortRetry.addEventListener(
    "click",
    startGame
  );
}

if (el.abortTitle) {
  el.abortTitle.addEventListener(
    "click",
    returnTitle
  );
}

if (el.retry) {
  el.retry.addEventListener(
    "click",
    startGame
  );
}

if (el.titleButton) {
  el.titleButton.addEventListener(
    "click",
    returnTitle
  );
}

/*
  タブ切り替え時は音だけ止める。
  戻った時はゲームが中断されている状態なので、
  ユーザーが「つづける」を押してから音を再開する。
*/
document.addEventListener("visibilitychange", () => {
  if (
    document.hidden &&
    state &&
    !state.isPaused &&
    !state.isEnded &&
    el.game &&
    el.game.classList.contains("is-active")
  ) {
    pauseGame();
  }
});

showScreen(el.title);
