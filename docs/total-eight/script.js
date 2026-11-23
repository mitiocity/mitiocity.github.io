"use strict";

/* ==================================================
   とーたるえいと❣️
   ver1.1
================================================== */

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
  clearTitle: $("#clear-title-button")
};

let state = null;

let moveTimer = null;
let clockTimer = null;

let pieceId = 0;
let tutorialIndex = 0;

let audioContext = null;

let currentBgm = null;
let currentAnalyser = null;
let analyserData = null;

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

/* ==================================================
   共通
================================================== */

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

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
      const boardRow = Array(CONFIG.cols).fill(null);

      boardRow[0] = makePiece(
        "orb",
        randomNumber(),
        row
      );

      return boardRow;
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

    /*
      オーバーゲージは回復もリセットもしない。
    */
    over: 0,

    feverUntil: 0,

    isBusy: true,
    isPaused: false,
    isEnded: false,

    /*
      BGMがカウントダウン中に開始済みか。
    */
    bgmPrimed: false,

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

function isFever() {
  return state && Date.now() < state.feverUntil;
}

function isGameRunning() {
  return Boolean(
    state &&
    !state.isBusy &&
    !state.isPaused &&
    !state.isEnded
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

/* ==================================================
   ダブルタップズームを抑止
   ゲーム内のタップ操作は止めない
================================================== */

document.addEventListener(
  "dblclick",
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);

/* ==================================================
   効果音
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

  const path =
    `assets/audio/bgm/${fileName}`;

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
    /* 接続済みでない場合 */
  }

  try {
    bgm.analyser?.disconnect();
  } catch (error) {
    /* 接続済みでない場合 */
  }
}

function setElectricValue(name, value) {
  document.documentElement.style.setProperty(
    name,
    String(value)
  );
}

function stopElectricAnimation() {
  window.cancelAnimationFrame(electricAnimationId);

  electricAnimationId = null;

  visualEnergy.bass = 0;
  visualEnergy.middle = 0;
  visualEnergy.high = 0;

  setElectricValue("--electric-bass", 0);
  setElectricValue("--electric-middle", 0);
  setElectricValue("--electric-high", 0);
}

function stopBgm() {
  if (!currentBgm) {
    stopElectricAnimation();
    return;
  }

  try {
    currentBgm.audio.pause();
    currentBgm.audio.currentTime = 0;
  } catch (error) {
    /* 停止失敗時も続行 */
  }

  disconnectBgm(currentBgm);

  currentBgm = null;
  currentAnalyser = null;
  analyserData = null;

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
    /* 停止失敗時も続行 */
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

  endMusic.play().catch(() => {
    /* 端末が止めた場合は無理に続行しない */
  });
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

  /*
    スタートを押した時点で無音再生する。
    カウントダウン後の自動再生拒否を防ぐ。
  */
  audio.volume = 0;
  audio.muted = true;

  if (audioContext) {
    const analyser =
      audioContext.createAnalyser();

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

/*
  最重要：
  スタートボタンを押した瞬間に実行する。
  Safari／Chromeが「ユーザー操作で開始した音声」と判断する。
*/
function primeBgmFromUserTap() {
  if (!currentBgm?.audio || !state) {
    return;
  }

  const { audio } = currentBgm;

  audio.volume = 0;
  audio.muted = true;
  audio.currentTime = 0;

  audio.play()
    .then(() => {
      state.bgmPrimed = true;
      hideSoundEnableButton();
      startElectricAnimation();
    })
    .catch(() => {
      state.bgmPrimed = false;
      showSoundEnableButton();
    });
}

/*
  GO! の瞬間に呼ぶ。
  カウントダウン中に確保した無音再生を、
  通常のBGM音量までフェードインする。
*/
function revealBgmAtGo() {
  if (
    !currentBgm?.audio ||
    !state ||
    state.isEnded
  ) {
    return;
  }

  const { audio } = currentBgm;

  audio.muted = false;

  if (!state.bgmPrimed) {
    audio.play()
      .then(() => {
        state.bgmPrimed = true;
        hideSoundEnableButton();

        fadeAudio(
          audio,
          0,
          CONFIG.bgmVolume,
          CONFIG.bgmFadeMs
        );

        startElectricAnimation();
      })
      .catch(() => {
        showSoundEnableButton();
      });

    return;
  }

  fadeAudio(
    audio,
    0,
    CONFIG.bgmVolume,
    CONFIG.bgmFadeMs
  );

  startElectricAnimation();
}

/*
  「音を有効化」ボタンを押した時。
  これも必ずユーザー操作中に実行されるため、
  音声ブロックから復旧できる。
*/
function enableSoundFromUserTap() {
  unlockAudio();

  if (!currentBgm?.audio || !state) {
    hideSoundEnableButton();
    return;
  }

  const { audio } = currentBgm;

  audio.muted = false;

  audio.play()
    .then(() => {
      state.bgmPrimed = true;

      fadeAudio(
        audio,
        audio.volume || 0,
        CONFIG.bgmVolume,
        CONFIG.bgmFadeMs
      );

      hideSoundEnableButton();
      startElectricAnimation();
    })
    .catch(() => {
      showSoundEnableButton();
      setStatus("SOUND TAP REQUIRED");
    });
}

function changeBgmForLevel() {
  stopBgm();

  createBgmForCurrentLevel();

  /*
    LEVEL UPはプレイ中なので、
    いったん再生を試行してフェードイン。
  */
  if (currentBgm?.audio) {
    currentBgm.audio.muted = false;
    currentBgm.audio.volume = 0;

    currentBgm.audio.play()
      .then(() => {
        state.bgmPrimed = true;

        fadeAudio(
          currentBgm.audio,
          0,
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
}

function pauseBgm() {
  if (!currentBgm?.audio) {
    return;
  }

  currentBgm.audio.pause();

  window.cancelAnimationFrame(
    electricAnimationId
  );
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
      startElectricAnimation();
      hideSoundEnableButton();
    })
    .catch(() => {
      showSoundEnableButton();
    });
}

/* ==================================================
   BGM周波数 → レーン枠・控え枠の電流
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

    const bassTarget =
      getBandEnergy(35, 170);

    const middleTarget =
      getBandEnergy(170, 1100);

    const highTarget =
      getBandEnergy(1800, 9000);

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

    /*
      CSS変数へ値を渡す。
      CSS側がレーン枠と控え枠を脈動させる。
    */
    setElectricValue(
      "--electric-bass",
      visualEnergy.bass * strength
    );

    setElectricValue(
      "--electric-middle",
      visualEnergy.middle * strength
    );

    setElectricValue(
      "--electric-high",
      visualEnergy.high * strength
    );

    electricAnimationId =
      window.requestAnimationFrame(animate);
  }

  electricAnimationId =
    window.requestAnimationFrame(animate);
}

/* ==================================================
   盤面計算
================================================== */

function getRowPieces(row) {
  return state.board[row]
    .map((piece, col) => ({
      piece,
      col
    }))
    .filter(({ piece }) => piece);
}

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

      if (
        first.type !== "orb" &&
        first.type !== "ring"
      ) {
        col += 1;
        continue;
      }

      const cells = [];
      const hasOrb = first.type === "orb";

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

        cells.push({
          row,
          col: scan,
          piece: current
        });

        scan += 1;
      }

      if (cells.length > 0) {
        const total = cells.reduce(
          (sum, item) =>
            sum + (item.piece.number || 0),
          0
        );

        groups.push({
          row,
          hasOrb,
          total,
          cells
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

function getInheritedColor(row, col) {
  for (
    let scan = col - 1;
    scan >= 0;
    scan -= 1
  ) {
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
   経験値・LEVEL・フィーバー
================================================== */

function addExperience(amount) {
  if (!state || amount <= 0) {
    return;
  }

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
  if (!state || state.isEnded) {
    return;
  }

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
    完全に空のレーンだけへオーブ再出現。
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
   消去
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

    if (orbGroups.length > 0) {
      const base =
        orbGroups.length *
        CONFIG.clearScore *
        chain;

      const simultaneous =
        Math.max(0, orbGroups.length - 1) *
        CONFIG.simultaneousBonus;

      addExperience(base + simultaneous);

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

async function evaluatePlacedRing(row, col) {
  const group = getGroupAt(row, col);

  if (!group) {
    return;
  }

  if (group.total > 8) {
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
   リング移動
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
    1回目：狙うレーンを変更。
  */
  if (state.selectedRow !== row) {
    state.selectedRow = row;
    state.activeRing.row = row;

    setStatus("TARGET LOCK");

    renderGame();

    return;
  }

  /*
    同じレーン2回目：先頭へ即固定。
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

  const prep =
    getPreparationClasses(row, col, piece);

  prep
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

      const piece = state.board[row][col];

      if (piece) {
        const prep =
          getPreparationClasses(row, col, piece);

        prep
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
    el.level.textContent =
      String(state.level);
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
   開始・終了
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
  /*
    この関数は必ずボタンを押したタイミングで始まる。
    ここで音声を準備することが重要。
  */
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
  setStatus("READY");

  renderGame();

  /*
    カウントダウンより先に、
    無音BGMをユーザー操作中に開始する。
  */
  createBgmForCurrentLevel();
  primeBgmFromUserTap();

  await runCountdown();

  if (!state || state.isEnded) {
    return;
  }

  revealBgmAtGo();

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

  hideSoundEnableButton();

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

  hideSoundEnableButton();
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

el.soundEnable?.addEventListener("click", () => {
  enableSoundFromUserTap();
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
  タブ切替やLINE内ブラウザから別画面へ移動した時、
  時間だけ進行することを防ぐ。
*/
document.addEventListener("visibilitychange", () => {
  if (
    document.hidden &&
    isGameRunning()
  ) {
    pauseGame();
  }
});

reducedMotionQuery.addEventListener?.(
  "change",
  () => {
    if (
      currentBgm?.audio &&
      !currentBgm.audio.paused
    ) {
      startElectricAnimation();
    }
  }
);

showScreen(el.title);
