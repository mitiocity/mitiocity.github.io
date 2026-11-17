"use strict";

const CONFIG = {
  rows: 4,
  cols: 8,

  ringStepMs: 950,

  baseClearScore: 100,
  simultaneousBonus: 80,
  levelScoreStep: 900,

  feverDuration: 8000,
  feverMultiplier: 2,

  clearDelay: 280,
  levelPreviewDelay: 900,

  rankingKey: "total-eight-local-ranking-v2",

  bgmPath(level) {
    return `assets/audio/bgm/level-${level}.mp3`;
  },

  tutorialVoicePath(step) {
    return `assets/audio/tutorial/tutorial-${String(step).padStart(2, "0")}.mp3`;
  }
};

const TUTORIAL_STEPS = [
  "ようこそ、とーたるえいと❣️へ。数字を足して、合計8を作ろう。",
  "左側の球体がオーブ。オーブ自身の数字も合計に入るぞ。",
  "リングは右から左へ流れてくる。盤面をタップして、流れるリングのレーンを変えよう。",
  "リングがオーブ、または既存リングの右隣へ到達すると接続される。",
  "オーブと接続したリングは、オーブと同じ色になる。合計5で緑、6と7で点滅する。",
  "合計がちょうど8になると、オーブと接続済みリングが消える。",
  "オーブのないレーンでも、白いリングだけで8を作れば消せる。ただし得点は入らない。",
  "オーブを複数7まで育てて、一手でまとめて8にしよう。連鎖と同時消去で高得点を狙え！"
];

const $ = (selector) => document.querySelector(selector);

const screens = {
  title: $("#title-screen"),
  game: $("#game-screen"),
  tutorial: $("#tutorial-screen"),
  ranking: $("#ranking-screen")
};

const elements = {
  gameBoard: $("#game-board"),
  tutorialBoard: $("#tutorial-board"),

  score: $("#score-value"),
  level: $("#level-value"),
  overGauge: $("#over-gauge"),
  combo: $("#combo-label"),
  fever: $("#fever-label"),

  nextRing: $("#next-ring"),
  nextRingNumber: $("#next-ring-number"),

  tutorialStepLabel: $("#tutorial-step-label"),
  tutorialText: $("#tutorial-text"),
  tutorialNextButton: $("#tutorial-next-button"),

  rankingList: $("#ranking-list"),

  tutorialExitModal: $("#tutorial-exit-modal"),
  tutorialCompleteModal: $("#tutorial-complete-modal"),
  gameOverModal: $("#game-over-modal"),
  finalScore: $("#final-score-value")
};

let state = null;
let pieceId = 0;
let movementTimer = null;

let tutorialStep = 0;
let tutorialVoice = null;

let audioContext = null;
let currentBgm = null;

/* =========================================================
   画面切替
========================================================= */

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen.classList.remove("is-active");
  });

  screens[name].classList.add("is-active");
}

function openModal(modal) {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function closeAllModals() {
  closeModal(elements.tutorialExitModal);
  closeModal(elements.tutorialCompleteModal);
  closeModal(elements.gameOverModal);
}

/* =========================================================
   基本処理
========================================================= */

function randomNumber() {
  return Math.floor(Math.random() * 4) + 1;
}

function randomColor() {
  return Math.floor(Math.random() * 4);
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function createPiece(type, number, color = null) {
  pieceId += 1;

  return {
    id: pieceId,
    type,
    number,
    color
  };
}

function createBoard() {
  return Array.from(
    { length: CONFIG.rows },
    () => Array(CONFIG.cols).fill(null)
  );
}

/* =========================================================
   音
========================================================= */

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playTone(frequency, delay, duration, volume) {
  try {
    const context = getAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(
      volume,
      context.currentTime + delay + 0.01
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + delay + duration
    );

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + duration + 0.03);
  } catch (error) {
    // 音声非対応でもゲームは停止しない。
  }
}

function playClearSound(chain) {
  const notes = [
    261.63,
    293.66,
    329.63,
    349.23,
    392.0,
    440.0,
    493.88,
    523.25
  ];

  const transpose = 2 ** (((state.level - 1) * 2) / 12);

  const interval =
    chain === 1 ? 0.1 :
    chain === 2 ? 0.075 :
    0.052;

  notes.forEach((note, index) => {
    playTone(note * transpose, index * interval, interval * 1.1, 0.055);
  });
}

function stopTutorialVoice() {
  if (!tutorialVoice) return;

  tutorialVoice.pause();
  tutorialVoice.currentTime = 0;
  tutorialVoice = null;
}

function playTutorialVoice(step) {
  stopTutorialVoice();

  tutorialVoice = new Audio(CONFIG.tutorialVoicePath(step));
  tutorialVoice.volume = 0.9;

  tutorialVoice.play().catch(() => {
    // MP3未配置時は無音で進む。
  });
}

function stopBgm() {
  if (!currentBgm) return;

  currentBgm.pause();
  currentBgm.currentTime = 0;
  currentBgm = null;
}

function changeBgm(level) {
  const nextBgm = new Audio(CONFIG.bgmPath(level));

  nextBgm.loop = true;
  nextBgm.volume = 0;

  nextBgm.play().then(() => {
    let count = 0;

    const fadeTimer = window.setInterval(() => {
      count += 1;

      const ratio = count / 18;
      nextBgm.volume = Math.min(0.42, ratio * 0.42);

      if (currentBgm) {
        currentBgm.volume = Math.max(0, 0.42 * (1 - ratio));
      }

      if (count >= 18) {
        window.clearInterval(fadeTimer);

        if (currentBgm) {
          currentBgm.pause();
          currentBgm.currentTime = 0;
        }

        currentBgm = nextBgm;
      }
    }, 50);
  }).catch(() => {
    // BGM未配置時は何もしない。
  });
}

/* =========================================================
   ゲーム開始
========================================================= */

function createGameState() {
  return {
    board: createBoard(),

    score: 0,
    level: 1,
    nextLevelScore: CONFIG.levelScoreStep,

    overGauge: 0,
    chainPower: 1,

    feverUntil: 0,
    orbAreaCols: 1,

    activeRing: null,

    isBusy: false,
    isGameOver: false,
    isExpanding: false
  };
}

function placeInitialOrbs() {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    state.board[row][0] = createPiece(
      "orb",
      randomNumber(),
      randomColor()
    );
  }
}

function startGame() {
  stopRingMovement();
  closeAllModals();
  stopTutorialVoice();

  state = createGameState();
  placeInitialOrbs();

  showScreen("game");
  changeBgm(state.level);

  spawnActiveRing();
  renderGame();
}

function returnToTitle() {
  stopRingMovement();
  closeAllModals();
  stopTutorialVoice();
  stopBgm();

  state = null;
  showScreen("title");
}

/* =========================================================
   流れてくるリング
========================================================= */

/*
  activeRing は盤面に固定される前の、流れているリング。
  col が8なら盤面右外。最初の移動で7列目へ入る。
*/
function spawnActiveRing() {
  if (!state || state.isGameOver) return;

  state.activeRing = {
    id: `active-${Date.now()}-${Math.random()}`,
    number: randomNumber(),
    row: Math.floor(Math.random() * CONFIG.rows),
    col: CONFIG.cols
  };

  startRingMovement();
  renderGame();
}

function startRingMovement() {
  stopRingMovement();

  movementTimer = window.setInterval(() => {
    moveActiveRingLeft();
  }, CONFIG.ringStepMs);
}

function stopRingMovement() {
  if (movementTimer) {
    window.clearInterval(movementTimer);
    movementTimer = null;
  }
}

function moveActiveRingToRow(row) {
  if (!state || !state.activeRing || state.isBusy || state.isGameOver) return;

  const active = state.activeRing;

  /*
    移動先レーンの同じ位置が埋まっている場合はレーン変更しない。
  */
  if (
    active.col < CONFIG.cols &&
    state.board[row][active.col]
  ) {
    elements.combo.textContent = "LANE BLOCKED";
    return;
  }

  active.row = row;
  elements.combo.textContent = "AIM";

  renderGame();
}

async function moveActiveRingLeft() {
  if (!state || !state.activeRing || state.isBusy || state.isGameOver) return;

  const active = state.activeRing;
  const nextCol = active.col - 1;

  /*
    左へ進む先が盤面外なら、左端で停止・固定。
  */
  if (nextCol < 0) {
    await landActiveRing();
    return;
  }

  /*
    次のマスが埋まっていれば、その右隣で停止・固定。
  */
  if (state.board[active.row][nextCol]) {
    await landActiveRing();
    return;
  }

  active.col = nextCol;
  renderGame();
}

async function landActiveRing() {
  if (!state || !state.activeRing || state.isBusy || state.isGameOver) return;

  const active = state.activeRing;

  /*
    右端が詰まっており、盤面へ入れない場合。
    プレイヤーは別レーンをタップして回避できる。
  */
  if (active.col >= CONFIG.cols) {
    elements.combo.textContent = "CHANGE LANE";
    return;
  }

  state.isBusy = true;
  stopRingMovement();

  const landedRing = createPiece("ring", active.number);

  state.board[active.row][active.col] = landedRing;
  state.activeRing = null;

  renderGame();

  const group = findGroupByPieceId(landedRing.id);

  /*
    新しく接続した先が9以上の場合。

    オーブ起点：
    新リングのみ消える＋オーバーゲージ増加。

    白リングのみ：
    新リングのみ消える＋ゲージ増加なし。
  */
  if (group && group.total >= 9) {
    await wait(150);

    removePieceById(landedRing.id);

    if (group.kind === "orb") {
      state.overGauge += 1;
      elements.combo.textContent = "OVER!";

      if (state.overGauge >= 3) {
        state.overGauge = 0;
        state.chainPower = Math.max(1, state.chainPower - 1);
        elements.combo.textContent = "CHAIN DOWN";
      }
    } else {
      elements.combo.textContent = "RING OVER";
    }

    state.isBusy = false;
    spawnActiveRing();
    renderGame();
    return;
  }

  await resolveClearChains();

  state.isBusy = false;
  spawnActiveRing();
  renderGame();
}

/* =========================================================
   接続グループ
========================================================= */

/*
  orb：
  オーブ＋その右の連続リング。

  neutral：
  オーブに接続していない、白いリングだけの連続列。
*/
function getGroups() {
  const groups = [];

  for (let row = 0; row < CONFIG.rows; row += 1) {
    let col = 0;

    while (col < CONFIG.cols) {
      const piece = state.board[row][col];

      if (!piece) {
        col += 1;
        continue;
      }

      if (piece.type === "orb") {
        const rings = [];
        let cursor = col + 1;

        while (
          cursor < CONFIG.cols &&
          state.board[row][cursor]?.type === "ring"
        ) {
          rings.push({
            piece: state.board[row][cursor],
            row,
            col: cursor
          });

          cursor += 1;
        }

        groups.push({
          kind: "orb",
          orb: piece,
          orbRow: row,
          orbCol: col,
          rings,
          total: piece.number + rings.reduce(
            (sum, ring) => sum + ring.piece.number,
            0
          )
        });

        col = cursor;
        continue;
      }

      if (piece.type === "ring") {
        const rings = [];
        let cursor = col;

        while (
          cursor < CONFIG.cols &&
          state.board[row][cursor]?.type === "ring"
        ) {
          rings.push({
            piece: state.board[row][cursor],
            row,
            col: cursor
          });

          cursor += 1;
        }

        groups.push({
          kind: "neutral",
          orb: null,
          orbRow: null,
          orbCol: null,
          rings,
          total: rings.reduce(
            (sum, ring) => sum + ring.piece.number,
            0
          )
        });

        col = cursor;
        continue;
      }

      col += 1;
    }
  }

  return groups;
}

function findGroupByPieceId(pieceId) {
  return getGroups().find((group) => {
    if (group.orb?.id === pieceId) return true;

    return group.rings.some((ring) => ring.piece.id === pieceId);
  });
}

function removePieceById(pieceId) {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      if (state.board[row][col]?.id === pieceId) {
        state.board[row][col] = null;
        return;
      }
    }
  }
}

function removeGroup(group) {
  if (group.kind === "orb") {
    state.board[group.orbRow][group.orbCol] = null;
  }

  group.rings.forEach((ring) => {
    state.board[ring.row][ring.col] = null;
  });
}

function countOrbs() {
  let count = 0;

  state.board.forEach((row) => {
    row.forEach((piece) => {
      if (piece?.type === "orb") {
        count += 1;
      }
    });
  });

  return count;
}

/*
  消去後だけ、空いた場所へリングを左詰めする。
  オーブは固定される。
*/
function settleBoard() {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    const oldRow = state.board[row];
    const nextRow = Array(CONFIG.cols).fill(null);

    oldRow.forEach((piece, col) => {
      if (piece?.type === "orb") {
        nextRow[col] = piece;
      }
    });

    let start = 0;

    for (let col = 0; col <= CONFIG.cols; col += 1) {
      const boundary =
        col === CONFIG.cols ||
        oldRow[col]?.type === "orb";

      if (!boundary) continue;

      const rings = [];

      for (let source = start; source < col; source += 1) {
        if (oldRow[source]?.type === "ring") {
          rings.push(oldRow[source]);
        }
      }

      let target = start;

      rings.forEach((ring) => {
        while (nextRow[target]) {
          target += 1;
        }

        if (target < col) {
          nextRow[target] = ring;
          target += 1;
        }
      });

      start = col + 1;
    }

    state.board[row] = nextRow;
  }
}

/* =========================================================
   消去・連鎖
========================================================= */

async function resolveClearChains() {
  let chain = 1;

  while (true) {
    const clearingGroups = getGroups().filter((group) => group.total === 8);

    if (clearingGroups.length === 0) break;

    const orbGroups = clearingGroups.filter(
      (group) => group.kind === "orb"
    );

    const neutralGroups = clearingGroups.filter(
      (group) => group.kind === "neutral"
    );

    /*
      得点と消去音はオーブを含む消去だけ。
      白リングだけの8消去は0点。
    */
    if (orbGroups.length > 0) {
      const simultaneousCount = orbGroups.length;
      const feverMultiplier = isFeverActive()
        ? CONFIG.feverMultiplier
        : 1;

      const chainMultiplier = state.chainPower + chain - 1;
      const simultaneousMultiplier = Math.max(1, simultaneousCount);

      const gainedScore =
        (CONFIG.baseClearScore * simultaneousCount +
          CONFIG.simultaneousBonus * Math.max(0, simultaneousCount - 1)) *
        chainMultiplier *
        simultaneousMultiplier *
        feverMultiplier;

      state.score += gainedScore;

      // オーブ消去数だけオーバーゲージを減らす。
      state.overGauge = Math.max(
        0,
        state.overGauge - simultaneousCount
      );

      if (simultaneousCount >= 2) {
        elements.combo.textContent = `${simultaneousCount} SIMULTANEOUS!`;
      } else if (chain >= 2) {
        elements.combo.textContent = `${chain} CHAIN!`;
      } else {
        elements.combo.textContent = "CLEAR!";
      }

      playClearSound(chain);
    } else if (neutralGroups.length > 0) {
      elements.combo.textContent = "RING CLEAR";
    }

    clearingGroups.forEach(removeGroup);
    renderGame();

    await wait(CONFIG.clearDelay);

    settleBoard();
    renderGame();

    chain += 1;
  }

  checkFever();
  checkLevelUp();
}

/* =========================================================
   フィーバー
========================================================= */

function isFeverActive() {
  return Date.now() < state.feverUntil;
}

function checkFever() {
  if (countOrbs() !== 0) return;

  state.feverUntil = Date.now() + CONFIG.feverDuration;

  elements.combo.textContent = "ALL CLEAR!";
  elements.fever.classList.remove("is-hidden");

  window.setTimeout(() => {
    if (!state || state.isGameOver) return;

    const orbCol = Math.max(0, state.orbAreaCols - 1);

    for (let row = 0; row < CONFIG.rows; row += 1) {
      if (!state.board[row][orbCol]) {
        state.board[row][orbCol] = createPiece(
          "orb",
          randomNumber(),
          randomColor()
        );
      }
    }

    renderGame();
  }, 520);

  window.setTimeout(() => {
    if (!state || state.isGameOver) return;

    elements.fever.classList.add("is-hidden");
    renderGame();
  }, CONFIG.feverDuration);
}

/* =========================================================
   レベルアップ・オーブ領域拡張
========================================================= */

function checkLevelUp() {
  if (state.score < state.nextLevelScore) return;
  if (state.isExpanding) return;

  state.level += 1;
  state.nextLevelScore += CONFIG.levelScoreStep;
  state.isExpanding = true;

  elements.combo.textContent = `LEVEL ${state.level}`;

  renderGame(true);
  changeBgm(state.level);

  window.setTimeout(() => {
    extendOrbArea();
  }, CONFIG.levelPreviewDelay);
}

function extendOrbArea() {
  const newOrbColumn = state.orbAreaCols;

  if (newOrbColumn >= CONFIG.cols - 1) {
    state.isExpanding = false;
    renderGame();
    gameOver();
    return;
  }

  /*
    新しいオーブ列を作るため、
    その列以降のリングを右へ逃がす。
  */
  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = CONFIG.cols - 1; col > newOrbColumn; col -= 1) {
      if (
        !state.board[row][col] &&
        state.board[row][col - 1]?.type === "ring"
      ) {
        state.board[row][col] = state.board[row][col - 1];
        state.board[row][col - 1] = null;
      }
    }
  }

  state.orbAreaCols += 1;
  state.isExpanding = false;

  const targetRow = Math.floor(Math.random() * CONFIG.rows);

  if (!state.board[targetRow][newOrbColumn]) {
    state.board[targetRow][newOrbColumn] = createPiece(
      "orb",
      randomNumber(),
      randomColor()
    );
  }

  renderGame();
  resolveClearChains();
}

/* =========================================================
   盤面描画
========================================================= */

function createVisualMap() {
  const visualMap = new Map();

  getGroups().forEach((group) => {
    if (group.kind === "orb") {
      visualMap.set(group.orb.id, {
        color: group.orb.color,
        total: group.total,
        kind: "orb"
      });

      group.rings.forEach((ring) => {
        visualMap.set(ring.piece.id, {
          color: group.orb.color,
          total: group.total,
          kind: "orb"
        });
      });
    } else {
      group.rings.forEach((ring) => {
        visualMap.set(ring.piece.id, {
          color: null,
          total: group.total,
          kind: "neutral"
        });
      });
    }
  });

  return visualMap;
}

function makePieceElement(piece, visual, isActive = false) {
  const element = document.createElement("span");

  element.className = `piece piece--${piece.type}`;
  element.textContent = piece.number;

  if (isActive) {
    element.classList.add("is-total-6");
  }

  if (visual?.color !== null && visual?.color !== undefined) {
    element.classList.add(`piece--color-${visual.color}`);
  }

  if (visual?.kind === "orb") {
    if (visual.total === 5) {
      element.classList.add("is-total-5");
    }

    if (visual.total === 6) {
      element.classList.add("is-total-6");
    }

    if (visual.total === 7) {
      element.classList.add("is-total-7");
    }
  }

  return element;
}

function renderGame(showExpansionPreview = false) {
  if (!state) return;

  const visualMap = createVisualMap();

  elements.gameBoard.innerHTML = "";
  elements.gameBoard.style.setProperty("--rows", CONFIG.rows);
  elements.gameBoard.style.setProperty("--cols", CONFIG.cols);

  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      const cell = document.createElement("button");
      const piece = state.board[row][col];

      cell.type = "button";
      cell.className = "board-cell";
      cell.setAttribute(
        "aria-label",
        `${row + 1}番レーンを選ぶ`
      );

      if (col < state.orbAreaCols) {
        cell.classList.add("is-orb-zone");
      }

      if (
        showExpansionPreview &&
        col === state.orbAreaCols &&
        col < CONFIG.cols
      ) {
        cell.classList.add("is-expansion-preview");
      }

      if (!state.isBusy && !state.isGameOver) {
        cell.classList.add("is-tappable");
      }

      cell.addEventListener("click", () => {
        moveActiveRingToRow(row);
      });

      if (piece) {
        const visual = visualMap.get(piece.id) || {
          color: piece.color,
          total: piece.number,
          kind: piece.type
        };

        cell.appendChild(makePieceElement(piece, visual));
      }

      /*
        流れているリングは、固定盤面とは別に描画する。
      */
      if (
        state.activeRing &&
        state.activeRing.row === row &&
        state.activeRing.col === col
      ) {
        cell.appendChild(
          makePieceElement(
            {
              type: "ring",
              number: state.activeRing.number
            },
            null,
            true
          )
        );
      }

      elements.gameBoard.appendChild(cell);
    }
  }

  elements.score.textContent = state.score.toLocaleString("ja-JP");
  elements.level.textContent = state.level;

  if (state.activeRing) {
    elements.nextRingNumber.textContent = state.activeRing.number;
  }

  elements.nextRing.classList.toggle(
    "is-disabled",
    state.isBusy || !state.activeRing
  );

  [...elements.overGauge.children].forEach((gauge, index) => {
    gauge.classList.toggle("is-filled", index < state.overGauge);
  });

  if (isFeverActive()) {
    elements.fever.classList.remove("is-hidden");
  }
}

/* =========================================================
   チュートリアル
========================================================= */

function startTutorial() {
  stopRingMovement();
  closeAllModals();
  stopBgm();

  tutorialStep = 0;
  showScreen("tutorial");
  renderTutorial();
}

function renderTutorial() {
  elements.tutorialStepLabel.textContent =
    `STEP ${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;

  elements.tutorialText.textContent = TUTORIAL_STEPS[tutorialStep];

  elements.tutorialNextButton.textContent =
    tutorialStep === TUTORIAL_STEPS.length - 1
      ? "完了"
      : "次へ";

  renderTutorialBoard(tutorialStep);
  playTutorialVoice(tutorialStep + 1);
}

function renderTutorialBoard(step) {
  elements.tutorialBoard.innerHTML = "";

  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const cell = document.createElement("div");
      cell.className = "board-cell";

      if (row === 1 && col === 0) {
        cell.appendChild(
          makePieceElement(
            createPiece("orb", 3, 0),
            {
              color: 0,
              total: step >= 4 ? 7 : 3,
              kind: "orb"
            }
          )
        );
      }

      if (row === 1 && col === 1 && step >= 2) {
        cell.appendChild(
          makePieceElement(
            createPiece("ring", 2),
            {
              color: step >= 3 ? 0 : null,
              total: step >= 4 ? 7 : 5,
              kind: step >= 3 ? "orb" : "neutral"
            }
          )
        );
      }

      if (row === 1 && col === 2 && step >= 4) {
        cell.appendChild(
          makePieceElement(
            createPiece("ring", step >= 5 ? 3 : 2),
            {
              color: 0,
              total: step >= 5 ? 8 : 7,
              kind: "orb"
            }
          )
        );
      }

      elements.tutorialBoard.appendChild(cell);
    }
  }
}

function nextTutorialStep() {
  if (tutorialStep >= TUTORIAL_STEPS.length - 1) {
    stopTutorialVoice();
    openModal(elements.tutorialCompleteModal);
    return;
  }

  tutorialStep += 1;
  renderTutorial();
}

/* =========================================================
   ローカルランキング
========================================================= */

function getRanking() {
  try {
    const ranking = JSON.parse(
      localStorage.getItem(CONFIG.rankingKey)
    );

    if (Array.isArray(ranking)) {
      return ranking;
    }
  } catch (error) {
    // 保存データが壊れていた場合は初期値。
  }

  return [
    { name: "みかん", score: 25480 },
    { name: "ねこ〜", score: 18920 },
    { name: "ゆーき", score: 12840 },
    { name: "あ－る", score: 11300 }
  ];
}

function saveRanking(ranking) {
  localStorage.setItem(
    CONFIG.rankingKey,
    JSON.stringify(ranking)
  );
}

function renderRanking() {
  const ranking = getRanking()
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  elements.rankingList.innerHTML = "";

  ranking.forEach((entry, index) => {
    const item = document.createElement("li");

    const rank = document.createElement("span");
    rank.className = "ranking-list__rank";
    rank.textContent = index + 1;

    const name = document.createElement("span");
    name.className = "ranking-list__name";
    name.textContent = entry.name;

    const score = document.createElement("span");
    score.className = "ranking-list__score";
    score.textContent = entry.score.toLocaleString("ja-JP");

    item.append(rank, name, score);
    elements.rankingList.appendChild(item);
  });
}

function openRanking() {
  renderRanking();
  showScreen("ranking");
}

function trySaveScore(score) {
  const ranking = getRanking()
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const qualifies =
    score > 0 &&
    (
      ranking.length < 10 ||
      score > ranking[ranking.length - 1].score
    );

  if (!qualifies) return;

  let name = "";

  while (true) {
    const input = window.prompt(
      "ランキング入り！\n名前を1〜6文字で入力してください。\n使える文字：ひらがな、〜、ー、－",
      ""
    );

    if (input === null) return;

    name = input.trim();

    if (/^[ぁ-ゖ〜ー－]{1,6}$/u.test(name)) {
      break;
    }

    window.alert(
      "名前は1〜6文字のひらがな、〜、ー、－だけで入力してください。"
    );
  }

  ranking.push({ name, score });
  ranking.sort((a, b) => b.score - a.score);

  saveRanking(ranking.slice(0, 10));
}

/* =========================================================
   ゲームオーバー
========================================================= */

function gameOver() {
  stopRingMovement();

  state.isGameOver = true;
  state.isBusy = true;

  stopBgm();

  elements.finalScore.textContent =
    state.score.toLocaleString("ja-JP");

  trySaveScore(state.score);
  openModal(elements.gameOverModal);
}

/* =========================================================
   ボタン
========================================================= */

$("#start-button").addEventListener("click", startGame);
$("#tutorial-button").addEventListener("click", startTutorial);
$("#ranking-button").addEventListener("click", openRanking);

$("#game-menu-button").addEventListener("click", returnToTitle);

$("#tutorial-next-button").addEventListener("click", nextTutorialStep);

$("#tutorial-exit-button").addEventListener("click", () => {
  openModal(elements.tutorialExitModal);
});

$("#tutorial-resume-button").addEventListener("click", () => {
  closeModal(elements.tutorialExitModal);
});

$("#tutorial-quit-button").addEventListener("click", () => {
  closeModal(elements.tutorialExitModal);
  returnToTitle();
});

$("#tutorial-start-game-button").addEventListener("click", () => {
  closeModal(elements.tutorialCompleteModal);
  startGame();
});

$("#tutorial-restart-button").addEventListener("click", () => {
  closeModal(elements.tutorialCompleteModal);
  tutorialStep = 0;
  renderTutorial();
});

$("#retry-button").addEventListener("click", () => {
  closeModal(elements.gameOverModal);
  startGame();
});

$("#return-title-button").addEventListener("click", () => {
  closeModal(elements.gameOverModal);
  returnToTitle();
});

document.querySelectorAll("[data-return-to-title]").forEach((button) => {
  button.addEventListener("click", returnToTitle);
});

showScreen("title");
/* =========================================================
   NEXT RING表示：次に流れてくるリングを表示する
========================================================= */

spawnActiveRing = function () {
  if (!state || state.isGameOver) return;

  if (state.nextRing === undefined) {
    state.nextRing = randomNumber();
  }

  const currentNumber = state.nextRing;

  state.nextRing = randomNumber();

  state.activeRing = {
    id: `active-${Date.now()}-${Math.random()}`,
    number: currentNumber,
    row: Math.floor(Math.random() * CONFIG.rows),
    col: CONFIG.cols
  };

  startRingMovement();
  renderGame();
};

const originalRenderGame = renderGame;

renderGame = function (showExpansionPreview = false) {
  originalRenderGame(showExpansionPreview);

  if (state && state.nextRing !== undefined) {
    elements.nextRingNumber.textContent = state.nextRing;
  }
};
