"use strict";

const CONFIG = {
  rows: 4,
  cols: 8,
  ringStepMs: 950,
  baseClearScore: 100,
  simultaneousBonus: 80,
  levelScoreStep: 900,
  rankingKey: "total-eight-ranking-v3"
};

const TUTORIAL_STEPS = [
  "ようこそ、とーたるえいと❣️へ。数字を足して、合計8を作ろう。",
  "左にある球体がオーブ。オーブ自身の数字も、合計に入るぞ。",
  "リングは右から左へ流れてくる。オーブをタップすると、そのレーンへ移動する。",
  "同じオーブをもう一度タップすると、リングは列の先頭へ即接続する。",
  "オーブがない空白レーンも、1回タップで移動、同じレーンを2回目タップで即固定できる。",
  "合計8で消去。オーブなしの白リング列も8なら消えるが、得点は入らない。"
];

const $ = (selector) => document.querySelector(selector);

const elements = {
  titleScreen: $("#title-screen"),
  gameScreen: $("#game-screen"),
  tutorialScreen: $("#tutorial-screen"),
  rankingScreen: $("#ranking-screen"),

  startButton: $("#start-button"),
  tutorialButton: $("#tutorial-button"),
  rankingButton: $("#ranking-button"),

  gameBoard: $("#game-board"),
  score: $("#score-value"),
  level: $("#level-value"),
  overGauge: $("#over-gauge"),
  combo: $("#combo-label"),
  fever: $("#fever-label"),
  nextRingNumber: $("#next-ring-number"),
  gameMenuButton: $("#game-menu-button"),

  tutorialBoard: $("#tutorial-board"),
  tutorialStepLabel: $("#tutorial-step-label"),
  tutorialText: $("#tutorial-text"),
  tutorialNextButton: $("#tutorial-next-button"),
  tutorialExitButton: $("#tutorial-exit-button"),

  rankingList: $("#ranking-list"),
  returnTitleButtons: document.querySelectorAll(".return-title-button"),

  gameOverModal: $("#game-over-modal"),
  finalScore: $("#final-score-value"),
  retryButton: $("#retry-button"),
  returnTitleButton: $("#return-title-button"),

  tutorialCompleteModal: $("#tutorial-complete-modal"),
  tutorialStartGameButton: $("#tutorial-start-game-button"),
  tutorialRestartButton: $("#tutorial-restart-button")
};

let state = null;
let ringTimer = null;
let tutorialStep = 0;
let serial = 0;

function randomNumber() {
  return Math.floor(Math.random() * 4) + 1;
}

function randomColor() {
  return Math.floor(Math.random() * 4);
}

function piece(type, number, color = null) {
  serial += 1;

  return {
    id: `piece-${serial}`,
    type,
    number,
    color
  };
}

function emptyBoard() {
  return Array.from(
    { length: CONFIG.rows },
    () => Array(CONFIG.cols).fill(null)
  );
}

function createGame() {
  const board = emptyBoard();

  for (let row = 0; row < CONFIG.rows; row += 1) {
    board[row][0] = piece("orb", randomNumber(), randomColor());
  }

  return {
    board,
    score: 0,
    level: 1,
    nextLevelScore: CONFIG.levelScoreStep,
    overGauge: 0,
    nextRing: randomNumber(),
    activeRing: null,
    selectedOrbId: null,
    selectedEmptyRow: null,
    busy: false,
    gameOver: false
  };
}

function showScreen(name) {
  const map = {
    title: elements.titleScreen,
    game: elements.gameScreen,
    tutorial: elements.tutorialScreen,
    ranking: elements.rankingScreen
  };

  Object.values(map).forEach((screen) => screen.classList.remove("is-active"));
  map[name].classList.add("is-active");
}

function openModal(modal) {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function clearTimers() {
  if (ringTimer) {
    window.clearInterval(ringTimer);
    ringTimer = null;
  }
}

function startGame() {
  clearTimers();
  closeModal(elements.gameOverModal);
  closeModal(elements.tutorialCompleteModal);

  state = createGame();
  showScreen("game");
  spawnRing();
  renderGame();
}

function returnToTitle() {
  clearTimers();
  closeModal(elements.gameOverModal);
  closeModal(elements.tutorialCompleteModal);
  state = null;
  showScreen("title");
}

function spawnRing() {
  if (!state || state.gameOver) return;

  const currentNumber = state.nextRing;
  state.nextRing = randomNumber();

  state.activeRing = {
    id: `active-${Date.now()}`,
    number: currentNumber,
    row: Math.floor(Math.random() * CONFIG.rows),
    col: CONFIG.cols
  };

  state.selectedOrbId = null;
  state.selectedEmptyRow = null;

  renderGame();

  ringTimer = window.setInterval(moveRingLeft, CONFIG.ringStepMs);
}

function moveRingLeft() {
  if (!state || !state.activeRing || state.busy || state.gameOver) return;

  const active = state.activeRing;
  const nextCol = active.col - 1;

  if (nextCol < 0) {
    landActiveRing(0);
    return;
  }

  if (state.board[active.row][nextCol]) {
    landActiveRing(nextCol + 1);
    return;
  }

  active.col = nextCol;
  renderGame();
}

function moveActiveToRow(row) {
  if (!state || !state.activeRing || state.busy || state.gameOver) return;

  state.activeRing.row = row;
  renderGame();
}

function getOrbGroup(row, orbCol) {
  const orb = state.board[row][orbCol];
  const rings = [];
  let total = orb.number;

  for (let col = orbCol + 1; col < CONFIG.cols; col += 1) {
    const current = state.board[row][col];

    if (!current || current.type !== "ring") break;

    rings.push({ row, col, piece: current });
    total += current.number;
  }

  return {
    type: "orb",
    row,
    orbCol,
    orb,
    rings,
    total
  };
}

function getWhiteGroup(row) {
  const rings = [];
  let total = 0;

  for (let col = 0; col < CONFIG.cols; col += 1) {
    const current = state.board[row][col];

    if (!current || current.type !== "ring") break;

    rings.push({ row, col, piece: current });
    total += current.number;
  }

  return {
    type: "white",
    row,
    rings,
    total
  };
}

function getGroups() {
  const groups = [];

  for (let row = 0; row < CONFIG.rows; row += 1) {
    const orbCol = state.board[row].findIndex((item) => item?.type === "orb");

    if (orbCol >= 0) {
      groups.push(getOrbGroup(row, orbCol));
    } else {
      const white = getWhiteGroup(row);

      if (white.rings.length > 0) {
        groups.push(white);
      }
    }
  }

  return groups;
}

function recolorConnectedRings() {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    const orbCol = state.board[row].findIndex((item) => item?.type === "orb");

    if (orbCol < 0) continue;

    const orb = state.board[row][orbCol];

    for (let col = orbCol + 1; col < CONFIG.cols; col += 1) {
      const current = state.board[row][col];

      if (!current || current.type !== "ring") break;

      current.color = orb.color;
    }
  }
}

function compactRow(row) {
  const currentRow = state.board[row];
  const orb = currentRow.find((item) => item?.type === "orb") || null;
  const rings = currentRow.filter((item) => item?.type === "ring");

  state.board[row] = Array(CONFIG.cols).fill(null);

  let writeCol = 0;

  if (orb) {
    state.board[row][0] = orb;
    writeCol = 1;
  }

  rings.forEach((ring) => {
    if (writeCol < CONFIG.cols) {
      state.board[row][writeCol] = ring;
      writeCol += 1;
    }
  });
}

function compactBoard() {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    compactRow(row);
  }

  recolorConnectedRings();
}

function landActiveRing(landingCol) {
  if (!state || !state.activeRing || state.busy || state.gameOver) return;

  if (landingCol >= CONFIG.cols) {
    elements.combo.textContent = "ROW FULL";
    return;
  }

  state.busy = true;
  clearTimers();

  const active = state.activeRing;
  const landed = piece("ring", active.number);

  state.board[active.row][landingCol] = landed;
  state.activeRing = null;

  compactBoard();
  resolveBoard(landed.id);
}

function removePieceById(id) {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      if (state.board[row][col]?.id === id) {
        state.board[row][col] = null;
        return;
      }
    }
  }
}

function addOverGauge() {
  state.overGauge += 1;

  if (state.overGauge >= 3) {
    state.overGauge = 0;
    elements.combo.textContent = "CHAIN DOWN";
  }
}

function resolveBoard(landedId) {
  const groups = getGroups();
  const overGroup = groups.find((group) => group.total > 8);

  if (overGroup) {
    removePieceById(landedId);

    if (overGroup.type === "orb") {
      addOverGauge();
      elements.combo.textContent = "OVER";
    } else {
      elements.combo.textContent = "WHITE OVER";
    }

    compactBoard();
    finishTurn();
    return;
  }

  const clearGroups = groups.filter((group) => group.total === 8);

  if (clearGroups.length === 0) {
    elements.combo.textContent = "READY";
    finishTurn();
    return;
  }

  const orbClearCount = clearGroups.filter((group) => group.type === "orb").length;
  let gainedScore = orbClearCount * CONFIG.baseClearScore;

  if (orbClearCount >= 2) {
    gainedScore += (orbClearCount - 1) * CONFIG.simultaneousBonus;
  }

  clearGroups.forEach((group) => {
    if (group.type === "orb") {
      state.board[group.row][group.orbCol] = null;
    }

    group.rings.forEach(({ row, col }) => {
      state.board[row][col] = null;
    });
  });

  if (orbClearCount > 0) {
    state.score += gainedScore;
    state.overGauge = Math.max(0, state.overGauge - orbClearCount);
    elements.combo.textContent = orbClearCount >= 2 ? "SIMULTANEOUS!" : "CLEAR!";
  } else {
    elements.combo.textContent = "WHITE CLEAR";
  }

  compactBoard();

  window.setTimeout(() => {
    const chainGroups = getGroups().filter((group) => group.total === 8);

    if (chainGroups.length > 0) {
      resolveBoard(null);
      return;
    }

    checkLevelUp();
    checkAllOrbsCleared();
    finishTurn();
  }, 230);
}

function checkLevelUp() {
  if (state.score < state.nextLevelScore) return;

  state.level += 1;
  state.nextLevelScore += CONFIG.levelScoreStep;
  elements.combo.textContent = `LEVEL ${state.level}`;

  const emptyRow = state.board.findIndex((row) => {
    return !row.some((item) => item?.type === "orb");
  });

  if (emptyRow >= 0) {
    state.board[emptyRow][0] = piece("orb", randomNumber(), randomColor());
  }
}

function checkAllOrbsCleared() {
  const hasOrb = state.board.some((row) => row.some((item) => item?.type === "orb"));

  if (hasOrb) return;

  elements.combo.textContent = "ALL CLEAR!";

  window.setTimeout(() => {
    if (!state || state.gameOver) return;

    for (let row = 0; row < CONFIG.rows; row += 1) {
      if (!state.board[row][0]) {
        state.board[row][0] = piece("orb", randomNumber(), randomColor());
      }
    }

    compactBoard();
    renderGame();
  }, 350);
}

function finishTurn() {
  renderGame();

  window.setTimeout(() => {
    if (!state || state.gameOver) return;

    state.busy = false;
    spawnRing();
  }, 270);
}

function chooseLane(row, col) {
  if (!state || !state.activeRing || state.busy || state.gameOver) return;

  const tapped = state.board[row][col];
  const rowOrb = state.board[row].find((item) => item?.type === "orb");

  if (tapped?.type === "orb") {
    if (state.selectedOrbId !== tapped.id) {
      state.selectedOrbId = tapped.id;
      state.selectedEmptyRow = null;
      moveActiveToRow(row);
      elements.combo.textContent = "TARGET LOCK";
      return;
    }

    const group = getOrbGroup(row, col);
    const lastRing = group.rings[group.rings.length - 1];
    const landingCol = lastRing ? lastRing.col + 1 : col + 1;

    state.selectedOrbId = null;
    state.selectedEmptyRow = null;
    state.activeRing.row = row;
    landActiveRing(landingCol);
    return;
  }

  if (rowOrb) {
    state.selectedOrbId = null;
    state.selectedEmptyRow = null;
    moveActiveToRow(row);
    elements.combo.textContent = "TARGET CHANGE";
    return;
  }

  if (state.selectedEmptyRow !== row) {
    state.selectedOrbId = null;
    state.selectedEmptyRow = row;
    moveActiveToRow(row);
    elements.combo.textContent = "EMPTY LANE LOCK";
    return;
  }

  let rightmostRing = -1;

  for (let scanCol = CONFIG.cols - 1; scanCol >= 0; scanCol -= 1) {
    if (state.board[row][scanCol]?.type === "ring") {
      rightmostRing = scanCol;
      break;
    }
  }

  state.selectedOrbId = null;
  state.selectedEmptyRow = null;
  state.activeRing.row = row;
  landActiveRing(rightmostRing + 1);
}

function pieceElement(item, type, total = 0) {
  const element = document.createElement("div");
  element.className = `piece piece--${type}`;

  if (item.color !== null && item.color !== undefined) {
    element.classList.add(`color-${item.color}`);
  }

  if (total >= 5 && total <= 7) {
    element.classList.add(`total-${total}`);
  }

  element.textContent = item.number;
  return element;
}

function renderGame() {
  if (!state) return;

  elements.gameBoard.innerHTML = "";

  const groups = getGroups();
  const totals = new Map();

  groups.forEach((group) => {
    if (group.type === "orb") {
      totals.set(`${group.row}-${group.orbCol}`, group.total);

      group.rings.forEach(({ row, col }) => {
        totals.set(`${row}-${col}`, group.total);
      });
    }
  });

  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "board-cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);

      const item = state.board[row][col];
      const total = totals.get(`${row}-${col}`) || 0;

      if (item) {
        cell.append(pieceElement(item, item.type, total));
      }

      if (
        state.activeRing &&
        state.activeRing.row === row &&
        state.activeRing.col === col
      ) {
        const activePiece = pieceElement(
          { number: state.activeRing.number, color: null },
          "ring"
        );

        activePiece.classList.add("piece--active");
        cell.append(activePiece);
      }

      if (
        state.activeRing &&
        state.activeRing.row === row &&
        (
          state.selectedEmptyRow === row ||
          state.selectedOrbId === item?.id
        )
      ) {
        cell.classList.add("is-target");
      }

      elements.gameBoard.append(cell);
    }
  }

  elements.score.textContent = String(state.score);
  elements.level.textContent = String(state.level);
  elements.nextRingNumber.textContent = String(state.nextRing);

  elements.overGauge.querySelectorAll("i").forEach((bar, index) => {
    bar.classList.toggle("is-on", index < state.overGauge);
  });
}

function renderTutorial() {
  elements.tutorialBoard.innerHTML = "";

  for (let index = 0; index < 12; index += 1) {
    const dot = document.createElement("div");
    dot.style.cssText = `
      display:inline-block;
      width:25%;
      height:33.333%;
      border-right:1px solid rgba(158,203,255,.08);
      border-bottom:1px solid rgba(158,203,255,.08);
    `;
    elements.tutorialBoard.append(dot);
  }

  elements.tutorialStepLabel.textContent = `STEP ${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;
  elements.tutorialText.textContent = TUTORIAL_STEPS[tutorialStep];
  elements.tutorialNextButton.querySelector("strong").textContent =
    tutorialStep === TUTORIAL_STEPS.length - 1 ? "完了" : "次へ";
}

function startTutorial() {
  tutorialStep = 0;
  closeModal(elements.tutorialCompleteModal);
  showScreen("tutorial");
  renderTutorial();
}

function nextTutorial() {
  tutorialStep += 1;

  if (tutorialStep >= TUTORIAL_STEPS.length) {
    openModal(elements.tutorialCompleteModal);
    return;
  }

  renderTutorial();
}

function getRanking() {
  const saved = localStorage.getItem(CONFIG.rankingKey);

  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(CONFIG.rankingKey);
    }
  }

  return [
    { name: "みかん", score: 25480 },
    { name: "ねこ〜", score: 18920 },
    { name: "ゆーき", score: 12840 },
    { name: "あーる", score: 11300 }
  ];
}

function renderRanking() {
  const ranking = getRanking()
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  elements.rankingList.innerHTML = "";

  ranking.forEach((entry, index) => {
    const item = document.createElement("li");
    item.innerHTML = `<span>${index + 1}. ${entry.name}</span><strong>${entry.score}</strong>`;
    elements.rankingList.append(item);
  });
}

function endGame() {
  if (!state) return;

  state.gameOver = true;
  clearTimers();
  elements.finalScore.textContent = String(state.score);
  openModal(elements.gameOverModal);
}

elements.startButton.addEventListener("click", startGame);
elements.tutorialButton.addEventListener("click", startTutorial);

elements.rankingButton.addEventListener("click", () => {
  renderRanking();
  showScreen("ranking");
});

elements.gameMenuButton.addEventListener("click", returnToTitle);
elements.tutorialExitButton.addEventListener("click", returnToTitle);
elements.tutorialNextButton.addEventListener("click", nextTutorial);

elements.tutorialStartGameButton.addEventListener("click", startGame);
elements.tutorialRestartButton.addEventListener("click", startTutorial);

elements.retryButton.addEventListener("click", startGame);
elements.returnTitleButton.addEventListener("click", returnToTitle);

elements.returnTitleButtons.forEach((button) => {
  button.addEventListener("click", returnToTitle);
});

elements.gameBoard.addEventListener("click", (event) => {
  const cell = event.target.closest(".board-cell");

  if (!cell) return;

  chooseLane(
    Number(cell.dataset.row),
    Number(cell.dataset.col)
  );
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimers();
  if (!document.hidden && state?.activeRing && !state.busy && !state.gameOver) {
    clearTimers();
    ringTimer = window.setInterval(moveRingLeft, CONFIG.ringStepMs);
  }
});

showScreen("title");
"use strict";

const CONFIG = {
  rows: 4,
  cols: 8,
  startTime: 400,
  ringStepMs: 950,
  clearScore: 100,
  levelScoreStep: 900,
  bgmVolume: 0.38
};

const TUTORIAL = [
  "リングは右から左へ流れてくる。オーブとリングの数字を足して、合計8を作ろう。",
  "オーブを1回タップすると、流れているリングがそのレーンへ移動する。",
  "同じオーブをもう一度タップすると、リングはオーブ列の先頭へ即固定される。",
  "オーブがない空白レーンも、1回タップで移動、同じレーンを2回目タップで即固定できる。",
  "合計8で消去。合計7は、あと1で消去できる重要な状態だ。"
];

const $ = (selector) => document.querySelector(selector);

const el = {
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
  menu: $("#menu-button"),
  countdown: $("#countdown-overlay"),
  countdownText: $("#countdown-text"),
  tutorialStep: $("#tutorial-step"),
  tutorialText: $("#tutorial-text"),
  tutorialNext: $("#tutorial-next-button"),
  tutorialExit: $("#tutorial-exit-button"),
  tutorialModal: $("#tutorial-complete-modal"),
  tutorialStart: $("#tutorial-start-button"),
  tutorialRestart: $("#tutorial-restart-button"),
  tutorialTitle: $("#tutorial-title-button"),
  gameOver: $("#game-over-modal"),
  finalScore: $("#final-score-value"),
  retry: $("#retry-button"),
  titleButton: $("#title-button")
};

let state = null;
let ringTimer = null;
let clockTimer = null;
let audioContext = null;
let currentBgm = null;
let tutorialIndex = 0;
let id = 0;

function randomNumber() {
  return Math.floor(Math.random() * 4) + 1;
}

function randomColor() {
  return Math.floor(Math.random() * 4);
}

function newPiece(type, number, color = null) {
  id += 1;
  return { id: `p-${id}`, type, number, color };
}

function makeBoard() {
  return Array.from({ length: CONFIG.rows }, (_, row) => {
    const cells = Array(CONFIG.cols).fill(null);
    cells[0] = newPiece("orb", randomNumber(), row % 4);
    return cells;
  });
}

function createState() {
  return {
    board: makeBoard(),
    queue: [randomNumber(), randomNumber(), randomNumber()],
    active: null,
    selectedRow: null,
    score: 0,
    level: 1,
    time: CONFIG.startTime,
    over: 0,
    busy: true,
    ended: false
  };
}

function showScreen(screen) {
  [el.title, el.game, el.tutorial].forEach((item) => item.classList.remove("is-active"));
  screen.classList.add("is-active");
}

function stopTimers() {
  clearInterval(ringTimer);
  clearInterval(clockTimer);
  ringTimer = null;
  clockTimer = null;
}

function unlockAudio() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  audioContext.resume().catch(() => {});
}

function tone(frequency, start, duration) {
  if (!audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.16, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playClearSound() {
  if (!audioContext) return;

  const semitone = (state.level - 1) * 2;
  const notes = [0, 2, 4, 5, 7, 9, 11, 12];
  const root = 261.63 * (2 ** (semitone / 12));
  const now = audioContext.currentTime;

  notes.forEach((note, index) => {
    tone(root * (2 ** (note / 12)), now + index * 0.075, 0.11);
  });
}

function changeBgm() {
  const path = `assets/audio/bgm/level-${state.level}.mp3`;
  const next = new Audio(path);

  next.loop = true;
  next.volume = 0;
  next.play().catch(() => {});

  const previous = currentBgm;
  currentBgm = next;

  let step = 0;
  const fade = setInterval(() => {
    step += 1;
    next.volume = Math.min(CONFIG.bgmVolume, CONFIG.bgmVolume * (step / 20));

    if (previous) {
      previous.volume = Math.max(0, CONFIG.bgmVolume * (1 - step / 20));
    }

    if (step >= 20) {
      clearInterval(fade);
      if (previous) {
        previous.pause();
        previous.currentTime = 0;
      }
    }
  }, 45);
}

function stopBgm() {
  if (!currentBgm) return;
  currentBgm.pause();
  currentBgm.currentTime = 0;
  currentBgm = null;
}

function startGame() {
  stopTimers();
  stopBgm();
  unlockAudio();

  el.gameOver.classList.remove("is-open");
  el.tutorialModal.classList.remove("is-open");

  state = createState();
  showScreen(el.game);
  render();
  runCountdown();
}

function runCountdown() {
  const words = ["READY?", "3", "2", "1", "GO!"];
  let index = 0;

  el.countdown.classList.remove("is-hidden");

  const next = () => {
    el.countdownText.textContent = words[index];
    el.countdownText.style.animation = "none";
    requestAnimationFrame(() => {
      el.countdownText.style.animation = "";
    });

    index += 1;

    if (index < words.length) {
      setTimeout(next, index === 1 ? 850 : 720);
      return;
    }

    setTimeout(() => {
      el.countdown.classList.add("is-hidden");
      state.busy = false;
      spawnRing();
      startClock();
      changeBgm();
    }, 620);
  };

  next();
}

function startClock() {
  clockTimer = setInterval(() => {
    if (!state || state.ended || state.busy) return;

    state.time -= 1;
    render();

    if (state.time <= 0) {
      endGame();
    }
  }, 1000);
}

function spawnRing() {
  if (!state || state.ended) return;

  state.active = {
    id: `a-${Date.now()}`,
    number: state.queue.shift(),
    row: Math.floor(Math.random() * CONFIG.rows),
    col: CONFIG.cols - 1
  };

  state.queue.push(randomNumber());
  state.selectedRow = null;
  render();

  clearInterval(ringTimer);
  ringTimer = setInterval(moveRing, CONFIG.ringStepMs);
}

function moveRing() {
  if (!state || !state.active || state.busy || state.ended) return;

  const nextCol = state.active.col - 1;

  if (nextCol < 0 || state.board[state.active.row][nextCol]) {
    landRing(state.active.col);
    return;
  }

  state.active.col = nextCol;
  render();
}

function chooseRow(row) {
  if (!state || !state.active || state.busy || state.ended) return;

  if (state.selectedRow !== row) {
    state.selectedRow = row;
    state.active.row = row;
    el.status.textContent = "TARGET LOCK";
    render();
    return;
  }

  let landing = state.active.col;

  while (landing > 0 && state.board[row][landing - 1] === null) {
    landing -= 1;
  }

  landRing(landing);
}

function compactRow(row) {
  const orb = state.board[row].find((item) => item?.type === "orb");
  const rings = state.board[row].filter((item) => item?.type === "ring");
  const result = Array(CONFIG.cols).fill(null);
  let col = 0;

  if (orb) {
    result[col] = orb;
    col += 1;
  }

  rings.forEach((ring) => {
    if (col < CONFIG.cols) {
      result[col] = ring;
      col += 1;
    }
  });

  state.board[row] = result;
}

function compactAll() {
  state.board.forEach((_, row) => compactRow(row));

  state.board.forEach((cells) => {
    const orb = cells.find((item) => item?.type === "orb");
    if (!orb) return;

    cells.forEach((item) => {
      if (item?.type === "ring") item.color = orb.color;
    });
  });
}

function groupForRow(row) {
  const cells = state.board[row];
  const orb = cells.find((item) => item?.type === "orb");
  const rings = [];
  let total = 0;

  if (orb) {
    total = orb.number;
    for (let col = 1; col < CONFIG.cols; col += 1) {
      if (!cells[col] || cells[col].type !== "ring") break;
      rings.push(col);
      total += cells[col].number;
    }
    return { row, orbCol: 0, orb, rings, total };
  }

  for (let col = 0; col < CONFIG.cols; col += 1) {
    if (!cells[col] || cells[col].type !== "ring") break;
    rings.push(col);
    total += cells[col].number;
  }

  return { row, orbCol: -1, orb: null, rings, total };
}

function landRing(col) {
  clearInterval(ringTimer);

  const active = state.active;
  if (!active || col >= CONFIG.cols) return;

  state.busy = true;
  const ring = newPiece("ring", active.number);
  state.board[active.row][col] = ring;
  state.active = null;
  compactAll();

  const group = groupForRow(active.row);

  if (group.total > 8) {
    const row = state.board[active.row];
    const removeCol = row.findIndex((item) => item?.id === ring.id);

    if (removeCol >= 0) row[removeCol] = null;

    if (group.orb) {
      state.over += 1;
      if (state.over >= 3) {
        state.over = 0;
        el.status.textContent = "CHAIN DOWN";
      } else {
        el.status.textContent = "OVER";
      }
    } else {
      el.status.textContent = "WHITE OVER";
    }

    compactAll();
    finishTurn();
    return;
  }

  const groups = state.board.map((_, row) => groupForRow(row));
  const clears = groups.filter((item) => item.total === 8 && item.rings.length > 0);

  if (clears.length > 0) {
    let orbClearCount = 0;

    clears.forEach((groupItem) => {
      if (groupItem.orb) {
        state.board[groupItem.row][groupItem.orbCol] = null;
        orbClearCount += 1;
      }

      groupItem.rings.forEach((ringCol) => {
        state.board[groupItem.row][ringCol] = null;
      });
    });

    if (orbClearCount > 0) {
      state.score += orbClearCount * CONFIG.clearScore;
      state.over = Math.max(0, state.over - orbClearCount);
      el.status.textContent = orbClearCount >= 2 ? "SIMULTANEOUS!" : "CLEAR!";
      playClearSound();
    } else {
      el.status.textContent = "WHITE CLEAR";
    }

    compactAll();
    checkLevel();
  } else {
    el.status.textContent = "READY";
  }

  finishTurn();
}

function checkLevel() {
  const nextLevel = Math.floor(state.score / CONFIG.levelScoreStep) + 1;

  if (nextLevel > state.level) {
    state.level = nextLevel;
    el.status.textContent = `LEVEL ${state.level}`;
    changeBgm();
  }
}

function finishTurn() {
  render();

  setTimeout(() => {
    if (!state || state.ended) return;
    state.busy = false;
    spawnRing();
  }, 250);
}

function endGame() {
  if (!state || state.ended) return;

  state.ended = true;
  stopTimers();
  stopBgm();
  el.finalScore.textContent = String(state.score);
  el.gameOver.classList.add("is-open");
}

function pieceElement(item, active = false, total = 0) {
  const node = document.createElement("div");
  node.className = `piece ${item.type === "orb" ? "orb" : "ring"}`;

  if (active) node.classList.add("active-ring");
  if (item.color !== null && item.color !== undefined) node.classList.add(`color-${item.color}`);
  if (total >= 5 && total <= 7) node.classList.add(`total-${total}`);

  node.textContent = item.number;
  return node;
}

function render() {
  if (!state) return;

  el.board.innerHTML = "";
  const totals = state.board.map((_, row) => groupForRow(row));

  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "board-cell";
      cell.dataset.row = String(row);

      if (state.selectedRow === row) cell.classList.add("is-target");

      const item = state.board[row][col];
      const total = totals[row].total;

      if (item) {
        cell.append(pieceElement(item, false, total));
      }

      if (state.active?.row === row && state.active?.col === col) {
        cell.append(pieceElement({ number: state.active.number, color: null, type: "ring" }, true));
      }

      el.board.append(cell);
    }
  }

  el.queue.innerHTML = "";
  state.queue.forEach((number) => {
    const ring = document.createElement("div");
    ring.className = "queue-ring";
    ring.textContent = number;
    el.queue.append(ring);
  });

  el.score.textContent = String(state.score);
  el.level.textContent = String(state.level);
  el.time.textContent = String(Math.max(0, state.time));

  el.over.querySelectorAll("i").forEach((bar, index) => {
    bar.classList.toggle("is-on", index < state.over);
  });
}

function startTutorial() {
  tutorialIndex = 0;
  el.tutorialModal.classList.remove("is-open");
  showScreen(el.tutorial);
  renderTutorial();
}

function renderTutorial() {
  el.tutorialStep.textContent = `${tutorialIndex + 1} / ${TUTORIAL.length}`;
  el.tutorialText.textContent = TUTORIAL[tutorialIndex];
  el.tutorialNext.querySelector("strong").textContent =
    tutorialIndex === TUTORIAL.length - 1 ? "完了" : "つぎへ";
}

function nextTutorial() {
  tutorialIndex += 1;

  if (tutorialIndex >= TUTORIAL.length) {
    el.tutorialModal.classList.add("is-open");
    return;
  }

  renderTutorial();
}

function returnTitle() {
  stopTimers();
  stopBgm();
  state = null;
  el.gameOver.classList.remove("is-open");
  el.tutorialModal.classList.remove("is-open");
  showScreen(el.title);
}

el.start.addEventListener("click", startGame);
el.tutorialButton.addEventListener("click", startTutorial);
el.menu.addEventListener("click", returnTitle);
el.tutorialExit.addEventListener("click", returnTitle);
el.tutorialNext.addEventListener("click", nextTutorial);
el.tutorialStart.addEventListener("click", startGame);
el.tutorialRestart.addEventListener("click", startTutorial);
el.tutorialTitle.addEventListener("click", returnTitle);
el.retry.addEventListener("click", startGame);
el.titleButton.addEventListener("click", returnTitle);

el.board.addEventListener("click", (event) => {
  const cell = event.target.closest(".board-cell");
  if (!cell) return;
  chooseRow(Number(cell.dataset.row));
});

showScreen(el.title);
