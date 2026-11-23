"use strict";

/* ==================================================
   とーたるえいと❣️ / ver1.1
================================================== */

const CONFIG = {
  rows: 4,
  cols: 8,

  startTime: 300,
  maxLevel: 5,

  stageTargets: [
    4500,
    4500,
    5500,
    6500,
    7500
  ],

  ringStepMs: 1800,

  clearScore: 100,
  simultaneousBonus: 80,

  feverDuration: 8000,
  feverMultiplier: 2,

  starRate: 0.05,

  bgmVolume: 0.38,
  bgmFadeMs: 900,
  endMusicVolume: 0.48,

  visualSmoothing: 0.055,
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

  soundEnable: $("#sound-enable-button"),
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

  landscapeButton: $("#landscape-button")
};

let state = null;
let moveTimer = null;
let clockTimer = null;
let pieceId = 0;
let tutorialIndex = 0;

let audioContext = null;
let currentBgm = null;
let endMusic = null;
let electricAnimationId = null;

const visualEnergy = {
  bass: 0,
  middle: 0,
  high: 0
};

const reducedMotionQuery = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

const landscapeQuery = window.matchMedia(
  "(orientation: landscape)"
);

/* ==================================================
   共通
================================================== */

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function isLandscape() {
  return landscapeQuery.matches;
}

function isFever() {
  return Boolean(
    state &&
    Date.now() < state.feverUntil
  );
}

function isGameRunning() {
  return Boolean(
    state &&
    !state.isBusy &&
    !state.isPaused &&
    !state.isEnded &&
    !state.isWaitingForLandscape
  );
}

function setStatus(text) {
  if (el.status) {
    el.status.textContent = text;
  }
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

function showSoundEnableButton() {
  el.soundEnable?.classList.remove("hidden");
}

function hideSoundEnableButton() {
  el.soundEnable?.classList.add("hidden");
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

/* ==================================================
   盤面データ
================================================== */

function randomNumber() {
  return Math.floor(Math.random() * 4) + 1;
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

function createInitialBoard() {
  return Array.from(
    { length: CONFIG.rows },
    (_, row) => {
      const line = Array(CONFIG.cols).fill(null);

      line[0] = makePiece(
        "orb",
        randomNumber(),
        row
      );

      return line;
    }
  );
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

    over: 0,
    feverUntil: 0,

    isBusy: true,
    isPaused: false,
    isEnded: false,
    isWaitingForLandscape: false,
    pausedByOrientation: false,

    bgmPaths: {}
  };
}

/* ==================================================
   音
================================================== */

function unlockAudio() {
  if (!audioContext) {
    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }

  audioContext?.resume().catch(() => {});
}

function playTone(
  frequency,
  startTime,
  duration,
  volume
) {
  if (!audioContext) {
    return;
  }

  const oscillator =
    audioContext.createOscillator();

  const gain =
    audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(
    0.001,
    startTime
  );

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

function playOverSound() {
  if (!audioContext) {
    return;
  }

  const notes = [
    261.63,
    196,
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

  let fileName = "LEVEL-1.mp3";

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

  const path =
    `assets/audio/bgm/${fileName}`;

  state.bgmPaths[level] = path;

  return path;
}

function resetElectricValues() {
  document.documentElement.style.setProperty(
    "--electric-bass",
    "0"
  );

  document.documentElement.style.setProperty(
    "--electric-middle",
    "0"
  );

  document.documentElement.style.setProperty(
    "--electric-high",
    "0"
  );
}

function stopElectricAnimation() {
  window.cancelAnimationFrame(
    electricAnimationId
  );

  resetElectricValues();
}

function stopBgm() {
  if (!currentBgm) {
    stopElectricAnimation();
    return;
  }

  try {
    currentBgm.audio.pause();
    currentBgm.audio.currentTime = 0;
    currentBgm.source?.disconnect();
    currentBgm.analyser?.disconnect();
  } catch (error) {
    /* 停止済みでも続行 */
  }

  currentBgm = null;

  stopElectricAnimation();
}

function stopEndMusic() {
  if (!endMusic) {
    return;
  }

  try {
    endMusic.pause();
    endMusic.currentTime = 0;
  } catch (error) {
    /* 停止済みでも続行 */
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

function createBgm() {
  if (!state || state.isEnded) {
    return;
  }

  const audio = new Audio(
    getBgmPath(state.level)
  );

  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  audio.muted = true;

  let source = null;
  let analyser = null;
  let analyserData = null;

  if (audioContext) {
    try {
      analyser =
        audioContext.createAnalyser();

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.84;

      source =
        audioContext.createMediaElementSource(audio);

      source.connect(analyser);
      analyser.connect(audioContext.destination);

      analyserData = new Uint8Array(
        analyser.frequencyBinCount
      );
    } catch (error) {
      source = null;
      analyser = null;
      analyserData = null;
    }
  }

  currentBgm = {
    audio,
    source,
    analyser,
    analyserData
  };
}

function fadeAudio(audio, from, to, duration) {
  const startedAt = performance.now();

  function update(now) {
    const progress = Math.min(
      1,
      (now - startedAt) / duration
    );

    audio.volume =
      from + (to - from) * progress;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function getBandEnergy(from, to) {
  if (
    !audioContext ||
    !currentBgm?.analyser ||
    !currentBgm.analyserData
  ) {
    return 0;
  }

  currentBgm.analyser.getByteFrequencyData(
    currentBgm.analyserData
  );

  const nyquist =
    audioContext.sampleRate / 2;

  const start = Math.max(
    0,
    Math.floor(
      (from / nyquist) *
      currentBgm.analyserData.length
    )
  );

  const end = Math.min(
    currentBgm.analyserData.length - 1,
    Math.ceil(
      (to / nyquist) *
      currentBgm.analyserData.length
    )
  );

  let sum = 0;
  let count = 0;

  for (let index = start; index <= end; index += 1) {
    sum += currentBgm.analyserData[index];
    count += 1;
  }

  return count > 0
    ? sum / count / 255
    : 0;
}

function startElectricAnimation() {
  window.cancelAnimationFrame(
    electricAnimationId
  );

  function animate() {
    if (
      !currentBgm?.audio ||
      currentBgm.audio.paused ||
      !state ||
      state.isEnded
    ) {
      return;
    }

    const strength =
      reducedMotionQuery.matches
        ? CONFIG.reducedMotionStrength
        : 1;

    visualEnergy.bass +=
      (getBandEnergy(35, 170) - visualEnergy.bass) *
      CONFIG.visualSmoothing;

    visualEnergy.middle +=
      (getBandEnergy(170, 1100) - visualEnergy.middle) *
      CONFIG.visualSmoothing;

    visualEnergy.high +=
      (getBandEnergy(1800, 9000) - visualEnergy.high) *
      CONFIG.visualSmoothing;

    document.documentElement.style.setProperty(
      "--electric-bass",
      String(visualEnergy.bass * strength)
    );

    document.documentElement.style.setProperty(
      "--electric-middle",
      String(visualEnergy.middle * strength)
    );

    document.documentElement.style.setProperty(
      "--electric-high",
      String(visualEnergy.high * strength)
    );

    electricAnimationId =
      requestAnimationFrame(animate);
  }

  electricAnimationId =
    requestAnimationFrame(animate);
}

function prepareBgmFromTap() {
  if (!currentBgm?.audio) {
    return;
  }

  const { audio } = currentBgm;

  audio.volume = 0;
  audio.muted = true;
  audio.currentTime = 0;

  audio.play()
    .then(() => {
      hideSoundEnableButton();
      startElectricAnimation();
    })
    .catch(() => {
      showSoundEnableButton();
    });
}

function revealBgm() {
  if (!currentBgm?.audio) {
    return;
  }

  const { audio } = currentBgm;

  audio.muted = false;

  audio.play()
    .then(() => {
      fadeAudio(
        audio,
        audio.volume,
        CONFIG.bgmVolume,
        CONFIG.bgmFadeMs
      );

      hideSoundEnableButton();
      startElectricAnimation();
    })
    .catch(() => {
      showSoundEnableButton();
    });
}

function enableSoundFromTap() {
  unlockAudio();

  if (!currentBgm?.audio) {
    return;
  }

  currentBgm.audio.muted = false;

  currentBgm.audio.play()
    .then(() => {
      fadeAudio(
        currentBgm.audio,
        currentBgm.audio.volume,
        CONFIG.bgmVolume,
        CONFIG.bgmFadeMs
      );

      hideSoundEnableButton();
      startElectricAnimation();
    })
    .catch(() => {
      showSoundEnableButton();
    });
}

function changeBgmForLevel() {
  stopBgm();
  createBgm();

  if (!currentBgm?.audio) {
    return;
  }

  currentBgm.audio.muted = false;

  currentBgm.audio.play()
    .then(() => {
      fadeAudio(
        currentBgm.audio,
        0,
        CONFIG.bgmVolume,
        CONFIG.bgmFadeMs
      );

      startElectricAnimation();
    })
    .catch(() => {
      showSoundEnableButton();
    });
}

/* ==================================================
   盤面計算
================================================== */

function getGroups() {
  const groups = [];

  for (let row = 0; row < CONFIG.rows; row += 1) {
    let col = 0;

    while (col < CONFIG.cols) {
      const first = state.board[row][col];

      if (
        !first ||
        (
          first.type !== "orb" &&
          first.type !== "ring"
        )
      ) {
        col += 1;
        continue;
      }

      const cells = [];
      const hasOrb = first.type === "orb";
      let scan = col;

      while (scan < CONFIG.cols) {
        const piece = state.board[row][scan];

        if (
          !piece ||
          piece.type === "star" ||
          (
            scan !== col &&
            piece.type === "orb"
          )
        ) {
          break;
        }

        cells.push({
          row,
          col: scan,
          piece
        });

        scan += 1;
      }

      groups.push({
        row,
        hasOrb,
        total: cells.reduce(
          (sum, item) =>
            sum + (item.piece.number || 0),
          0
        ),
        cells
      });

      col = Math.max(scan, col + 1);
    }
  }

  return groups;
}

function getConnectionFromNewRing(row, col) {
  const cells = [];
  let scan = col;

  while (scan >= 0) {
    const piece = state.board[row][scan];

    if (
      !piece ||
      piece.type === "star"
    ) {
      break;
    }

    cells.unshift({
      row,
      col: scan,
      piece
    });

    if (piece.type === "orb") {
      break;
    }

    scan -= 1;
  }

  return {
    total: cells.reduce(
      (sum, item) =>
        sum + (item.piece.number || 0),
      0
    ),
    cells
  };
}

function getInheritedColor(row, col) {
  for (let scan = col - 1; scan >= 0; scan -= 1) {
    const piece = state.board[row][scan];

    if (!piece) {
      break;
    }

    if (piece.type === "orb") {
      return piece.color;
    }

    if (piece.color !== null) {
      return piece.color;
    }
  }

  return null;
}

function settleBoard() {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    const oldLine = state.board[row];
    const nextLine = Array(CONFIG.cols).fill(null);
    const orbColumns = [];

    oldLine.forEach((piece, col) => {
      if (piece?.type === "orb") {
        orbColumns.push(col);
        nextLine[col] = piece;
      }
    });

    const boundaries = [
      -1,
      ...orbColumns,
      CONFIG.cols
    ];

    for (
      let index = 0;
      index < boundaries.length - 1;
      index += 1
    ) {
      const start = boundaries[index] + 1;
      const end = boundaries[index + 1];

      const rings = oldLine
        .slice(start, end)
        .filter((piece) =>
          piece &&
          piece.type !== "orb"
        );

      rings.forEach((ring, ringIndex) => {
        nextLine[start + ringIndex] = ring;
      });
    }

    state.board[row] = nextLine;
  }
}

function getLandingColumn(row) {
  let rightmost = -1;

  state.board[row].forEach((piece, col) => {
    if (piece) {
      rightmost = col;
    }
  });

  return rightmost + 1;
}

function hasAnyOrb() {
  return state.board.some((line) =>
    line.some((piece) => piece?.type === "orb")
  );
}

function respawnOrbsInEmptyRows() {
  state.board.forEach((line, row) => {
    if (line.every((piece) => !piece)) {
      state.board[row][0] = makePiece(
        "orb",
        randomNumber(),
        row
      );
    }
  });
}

/* ==================================================
   得点・オーバー・消去
================================================== */

function addExperience(amount) {
  const multiplier =
    isFever()
      ? CONFIG.feverMultiplier
      : 1;

  const earned = Math.floor(
    amount * multiplier
  );

  state.score += earned;
  state.stageScore += earned;

  checkLevelProgress();
}

function checkLevelProgress() {
  if (state.stageScore < getStageTarget()) {
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
}

function showOverNumber(total) {
  if (!el.overPopup) {
    return;
  }

  el.overPopup.textContent = String(total);

  el.overPopup.classList.remove("hidden");
  el.overPopup.classList.remove("show");

  requestAnimationFrame(() => {
    el.overPopup.classList.add("show");
  });

  window.setTimeout(() => {
    el.overPopup.classList.remove("show");
    el.overPopup.classList.add("hidden");
  }, 980);
}

function increaseOverGauge(total) {
  state.over += 1;

  showOverNumber(total);
  playOverSound();

  el.app?.classList.add("is-over-flash");

  window.setTimeout(() => {
    el.app?.classList.remove("is-over-flash");
  }, 800);

  renderGame();

  if (state.over >= 5) {
    gameOver("OVER LIMIT");
    return;
  }

  setStatus("OVER");
}

async function startFeverAndRespawn() {
  state.feverUntil =
    Date.now() + CONFIG.feverDuration;

  el.app?.classList.add("is-fever");

  setStatus("ALL CLEAR! FEVER!");

  await wait(520);

  if (!state || state.isEnded) {
    return;
  }

  respawnOrbsInEmptyRows();

  renderGame();

  window.setTimeout(() => {
    el.app?.classList.remove("is-fever");

    if (
      state &&
      !state.isEnded &&
      !state.isPaused
    ) {
      setStatus("READY");
    }
  }, CONFIG.feverDuration);
}

async function resolveClearChains() {
  let chain = 0;

  while (
    state &&
    !state.isEnded
  ) {
    const clears = getGroups()
      .filter((group) => group.total === 8);

    if (clears.length === 0) {
      break;
    }

    chain += 1;

    const orbGroups = clears.filter(
      (group) => group.hasOrb
    );

    clears.forEach((group) => {
      group.cells.forEach(({ row, col }) => {
        state.board[row][col] = null;
      });
    });

    settleBoard();

    if (orbGroups.length > 0) {
      addExperience(
        orbGroups.length *
        CONFIG.clearScore *
        chain +
        Math.max(0, orbGroups.length - 1) *
        CONFIG.simultaneousBonus
      );

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
    startFeverAndRespawn();
  }
}

async function resolveStar(row) {
  const count = Math.max(
    1,
    state.board[row].filter(
      (piece) =>
        piece &&
        piece.type !== "star"
    ).length
  );

  state.board[row] =
    Array(CONFIG.cols).fill(null);

  addExperience(
    CONFIG.clearScore * count
  );

  playStarSound();
  settleBoard();
  renderGame();

  await wait(240);

  if (!hasAnyOrb()) {
    startFeverAndRespawn();
  }
}

async function evaluatePlacedRing(row, col) {
  const connection =
    getConnectionFromNewRing(row, col);

  /*
    合計が9以上なら必ずオーバー。
    オーブが接続に含まれるかどうかは問わない。
    同一レーンでの連続オーバーも毎回カウントする。
  */
  if (connection.total >= 9) {
    state.board[row][col] = null;

    increaseOverGauge(connection.total);

    settleBoard();
    renderGame();

    return;
  }

  await resolveClearChains();
}

/* ==================================================
   リング操作
================================================== */

function spawnActiveRing() {
  if (
    !state ||
    state.isEnded ||
    state.isPaused ||
    state.isWaitingForLandscape
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
      state.isBusy = false;
      spawnActiveRing();
    }

    return;
  }

  state.board[row][col] = makePiece(
    "ring",
    active.number,
    getInheritedColor(row, col)
  );

  state.activeRing = null;

  renderGame();

  await evaluatePlacedRing(row, col);

  if (
    state &&
    !state.isEnded &&
    !state.isPaused
  ) {
    state.isBusy = false;
    spawnActiveRing();
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

  if (nextCol < 0) {
    lockActiveRing(active.row, 0);
    return;
  }

  if (state.board[active.row][nextCol]) {
    lockActiveRing(
      active.row,
      active.col
    );

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

  if (state.selectedRow !== row) {
    state.selectedRow = row;
    state.activeRing.row = row;

    setStatus("TARGET LOCK");

    renderGame();

    return;
  }

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
  if (!piece || piece.type === "star") {
    return [];
  }

  const group = getGroups().find((item) =>
    item.cells.some(
      (cell) =>
        cell.row === row &&
        cell.col === col
    )
  );

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

  getPreparationClasses(row, col, piece)
    .filter((className) =>
      className.startsWith("t")
    )
    .forEach((className) => {
      classes.push(className);
    });

  node.className = classes.join(" ");

  node.textContent =
    piece.type === "star"
      ? "★"
      : String(piece.number);

  return node;
}

function renderBoard() {
  if (!state || !el.board) {
    return;
  }

  el.board.innerHTML = "";

  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      const cell = document.createElement("button");

      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);

      const piece = state.board[row][col];

      if (piece) {
        getPreparationClasses(row, col, piece)
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
        cell.appendChild(
          makePieceElement(
            {
              type: state.activeRing.type,
              number: state.activeRing.number,
              color: null
            },
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
  if (!state || !el.queueList) {
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

  el.score.textContent =
    state.score.toLocaleString("ja-JP");

  el.level.textContent =
    String(state.level);

  el.stageScore.textContent =
    state.stageScore.toLocaleString("ja-JP");

  el.stageTarget.textContent =
    getStageTarget().toLocaleString("ja-JP");

  el.time.textContent =
    String(Math.max(0, state.time));

  renderOverGauge();
  renderBoard();
  renderQueue();
}

/* ==================================================
   縦横画面
================================================== */

function pauseForPortrait() {
  if (
    !state ||
    state.isEnded ||
    state.isPaused ||
    state.isWaitingForLandscape
  ) {
    return;
  }

  state.isPaused = true;
  state.pausedByOrientation = true;

  currentBgm?.audio?.pause();

  setStatus("ROTATE DEVICE");
}

function handleOrientationChange() {
  if (!state || state.isEnded) {
    return;
  }

  if (!isLandscape()) {
    pauseForPortrait();
    return;
  }

  if (state.isWaitingForLandscape) {
    state.isWaitingForLandscape = false;
    state.isPaused = false;

    beginCountdownAndGame();

    return;
  }

  if (state.pausedByOrientation) {
    state.pausedByOrientation = false;

    setStatus("PAUSED");

    el.abortModal?.classList.add("open");
  }
}

async function requestLandscapeLock() {
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }

    if (screen.orientation?.lock) {
      await screen.orientation.lock("landscape");
    }
  } catch (error) {
    /* iPhone Safariなどは端末を手動で横向きにする */
  }
}

/* ==================================================
   ゲーム開始・終了
================================================== */

async function runCountdown() {
  const messages = [
    ["READY?", 850],
    ["3", 720],
    ["2", 720],
    ["1", 720],
    ["GO!", 620]
  ];

  el.countdown?.classList.remove("hidden");

  for (const [message, duration] of messages) {
    el.countdownText.textContent = message;
    el.countdownText.style.animation = "none";

    void el.countdownText.offsetWidth;

    el.countdownText.style.animation = "";

    await wait(duration);

    if (
      !state ||
      state.isEnded ||
      state.isPaused ||
      !isLandscape()
    ) {
      el.countdown?.classList.add("hidden");
      return false;
    }
  }

  el.countdown?.classList.add("hidden");

  return true;
}

async function beginCountdownAndGame() {
  if (
    !state ||
    state.isEnded ||
    !isLandscape()
  ) {
    return;
  }

  state.isBusy = true;
  state.isPaused = false;

  createBgm();
  prepareBgmFromTap();

  const completed = await runCountdown();

  if (
    !completed ||
    !state ||
    state.isEnded ||
    state.isPaused ||
    !isLandscape()
  ) {
    return;
  }

  revealBgm();

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

function startClock() {
  window.clearInterval(clockTimer);

  clockTimer = window.setInterval(() => {
    if (!isGameRunning()) {
      return;
    }

    state.time -= 1;

    renderGame();

    if (state.time <= 0) {
      gameOver("TIME UP");
    }
  }, 1000);
}

function startNewGame() {
  unlockAudio();

  stopEndMusic();
  stopBgm();
  clearGameTimers();
  closeAllModals();
  hideSoundEnableButton();

  el.app?.classList.remove(
    "is-fever",
    "is-over-flash"
  );

  state = createGameState();

  showScreen(el.game);
  renderGame();

  if (!isLandscape()) {
    state.isWaitingForLandscape = true;
    state.isPaused = true;

    setStatus("TURN DEVICE");

    return;
  }

  beginCountdownAndGame();
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

  currentBgm?.audio?.pause();

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

  if (!isLandscape()) {
    setStatus("TURN DEVICE");
    return;
  }

  state.isPaused = false;

  el.abortModal?.classList.remove("open");

  currentBgm?.audio?.play()
    .then(() => {
      startElectricAnimation();
    })
    .catch(() => {
      showSoundEnableButton();
    });

  setStatus("READY");

  renderGame();
}

function returnToTitle() {
  clearGameTimers();
  stopBgm();
  stopEndMusic();
  hideSoundEnableButton();

  state = null;

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

  el.gameOverReason.textContent = reason;

  el.finalScore.textContent =
    state.score.toLocaleString("ja-JP");

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

  el.clearScore.textContent =
    state.score.toLocaleString("ja-JP");

  el.gameClear?.classList.add("open");

  playEndMusic("OvercameHardships.mp3");
}

/* ==================================================
   チュートリアル
================================================== */

function renderTutorial() {
  el.tutorialStep.textContent =
    `${tutorialIndex + 1} / ${TUTORIAL_TEXTS.length}`;

  el.tutorialText.textContent =
    TUTORIAL_TEXTS[tutorialIndex];

  const isLast =
    tutorialIndex ===
    TUTORIAL_TEXTS.length - 1;

  el.tutorialNext.innerHTML = isLast
    ? "<strong>完了</strong><small>FINISH</small>"
    : "<strong>つぎへ</strong><small>NEXT</small>";
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

document.addEventListener(
  "dblclick",
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);

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

  if (!Number.isNaN(row)) {
    handleBoardTap(row);
  }
});

el.soundEnable?.addEventListener("click", () => {
  enableSoundFromTap();
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

el.landscapeButton?.addEventListener("click", () => {
  requestLandscapeLock();
});

document.addEventListener("visibilitychange", () => {
  if (
    document.hidden &&
    isGameRunning()
  ) {
    pauseGame();
  }
});

window.addEventListener(
  "orientationchange",
  () => {
    window.setTimeout(
      handleOrientationChange,
      180
    );
  }
);

window.addEventListener(
  "resize",
  () => {
    window.setTimeout(
      handleOrientationChange,
      120
    );
  }
);

showScreen(el.title);
