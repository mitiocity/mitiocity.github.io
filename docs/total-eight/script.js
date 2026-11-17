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
