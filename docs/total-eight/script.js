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
  "同じレーンをもう一度タップすると、リングは列の先頭へ即固定される。",
  "オーブがない空白レーンも、同じ操作で使える。",
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
let pieceId = 0;

function randomNumber() {
  return Math.floor(Math.random() * 4) + 1;
}

function makePiece(type, number, color = null) {
  pieceId += 1;
  return { id: `piece-${pieceId}`, type, number, color };
}

function makeBoard() {
  return Array.from({ length: CONFIG.rows }, (_, row) => {
    const cells = Array(CONFIG.cols).fill(null);
    cells[0] = makePiece("orb", randomNumber(), row);
    return cells;
  });
}

function newGameState() {
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

function showScreen(target) {
  [el.title, el.game, el.tutorial].forEach((screen) => {
    screen.classList.remove("is-active");
  });

  target.classList.add("is-active");
}

function clearTimers() {
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

function playTone(frequency, startTime, duration) {
  if (!audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.15, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function playClearSound() {
  if (!audioContext) return;

  const notes = [0, 2, 4, 5, 7, 9, 11, 12];
  const levelShift = (state.level - 1) * 2;
  const root = 261.63 * (2 ** (levelShift / 12));
  const now = audioContext.currentTime;

  notes.forEach((note, index) => {
    playTone(
      root * (2 ** (note / 12)),
      now + index * 0.075,
      0.11
    );
  });
}

function stopBgm() {
  if (!currentBgm) return;

  currentBgm.pause();
  currentBgm.currentTime = 0;
  currentBgm = null;
}

function changeBgm() {
  const next = new Audio(`assets/audio/bgm/level-${state.level}.mp3`);
  const previous = currentBgm;

  next.loop = true;
  next.volume = 0;
  currentBgm = next;

  next.play().catch(() => {});

  let step = 0;

  const fadeTimer = setInterval(() => {
    step += 1;
    next.volume = Math.min(
      CONFIG.bgmVolume,
      CONFIG.bgmVolume * (step / 20)
    );

    if (previous) {
      previous.volume = Math.max(
        0,
        CONFIG.bgmVolume * (1 - step / 20)
      );
    }

    if (step >= 20) {
      clearInterval(fadeTimer);

      if (previous) {
        previous.pause();
        previous.currentTime = 0;
      }
    }
  }, 45);
}

function startGame() {
  clearTimers();
  stopBgm();
  unlockAudio();

  el.gameOver.classList.remove("is-open");
  el.tutorialModal.classList.remove("is-open");

  state = newGameState();
  showScreen(el.game);
  renderGame();
  runCountdown();
}

function runCountdown() {
  const words = ["READY?", "3", "2", "1", "GO!"];
  let index = 0;

  el.countdown.classList.remove("is-hidden");

  function showNext() {
    el.countdownText.textContent = words[index];
    index += 1;

    if (index < words.length) {
      setTimeout(showNext, index === 1 ? 850 : 720);
      return;
    }

    setTimeout(() => {
      el.countdown.classList.add("is-hidden");
      state.busy = false;
      spawnRing();
      startClock();
      changeBgm();
    }, 620);
  }

  showNext();
}

function startClock() {
  clockTimer = setInterval(() => {
    if (!state || state.busy || state.ended) return;

    state.time -= 1;
    renderGame();

    if (state.time <= 0) {
      endGame();
    }
  }, 1000);
}

function spawnRing() {
  if (!state || state.ended) return;

  state.active = {
    number: state.queue.shift(),
    row: Math.floor(Math.random() * CONFIG.rows),
    col: CONFIG.cols - 1
  };

  state.queue.push(randomNumber());
  state.selectedRow = null;
  renderGame();

  clearInterval(ringTimer);
  ringTimer = setInterval(moveRing, CONFIG.ringStepMs);
}

function moveRing() {
  if (!state || !state.active || state.busy || state.ended) return;

  const active = state.active;
  const nextCol = active.col - 1;

  if (nextCol < 0 || state.board[active.row][nextCol]) {
    landRing(active.col);
    return;
  }

  active.col = nextCol;
  renderGame();
}

function chooseRow(row) {
  if (!state || !state.active || state.busy || state.ended) return;

  if (state.selectedRow !== row) {
    state.selectedRow = row;
    state.active.row = row;
    el.status.textContent = "TARGET LOCK";
    renderGame();
    return;
  }

  let landingCol = state.active.col;

  while (
    landingCol > 0 &&
    state.board[row][landingCol - 1] === null
  ) {
    landingCol -= 1;
  }

  landRing(landingCol);
}

function compactRow(row) {
  const cells = state.board[row];
  const orb = cells.find((item) => item?.type === "orb");
  const rings = cells.filter((item) => item?.type === "ring");
  const result = Array(CONFIG.cols).fill(null);
  let col = 0;

  if (orb) {
    result[0] = orb;
    col = 1;
  }

  rings.forEach((ring) => {
    if (col < CONFIG.cols) {
      result[col] = ring;
      col += 1;
    }
  });

  state.board[row] = result;
}

function compactBoard() {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    compactRow(row);

    const orb = state.board[row][0];

    if (orb?.type !== "orb") continue;

    for (let col = 1; col < CONFIG.cols; col += 1) {
      const ring = state.board[row][col];

      if (!ring || ring.type !== "ring") break;

      ring.color = orb.color;
    }
  }
}

function getGroup(row) {
  const cells = state.board[row];
  const orb = cells[0]?.type === "orb" ? cells[0] : null;
  const rings = [];
  let total = orb ? orb.number : 0;
  let startCol = orb ? 1 : 0;

  for (let col = startCol; col < CONFIG.cols; col += 1) {
    const ring = cells[col];

    if (!ring || ring.type !== "ring") break;

    rings.push(col);
    total += ring.number;
  }

  return { row, orb, rings, total };
}

function landRing(col) {
  clearInterval(ringTimer);

  if (!state?.active || col >= CONFIG.cols) return;

  state.busy = true;

  const active = state.active;
  const added = makePiece("ring", active.number);

  state.board[active.row][col] = added;
  state.active = null;
  compactBoard();

  const group = getGroup(active.row);

  if (group.total > 8) {
    const addedCol = state.board[active.row].findIndex(
      (item) => item?.id === added.id
    );

    if (addedCol >= 0) {
      state.board[active.row][addedCol] = null;
    }

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

    compactBoard();
    finishTurn();
    return;
  }

  resolveClears();
}

function resolveClears() {
  const groups = state.board.map((_, row) => getGroup(row));
  const clears = groups.filter(
    (group) => group.total === 8 && group.rings.length > 0
  );

  if (clears.length === 0) {
    el.status.textContent = "READY";
    finishTurn();
    return;
  }

  let orbClears = 0;

  clears.forEach((group) => {
    if (group.orb) {
      state.board[group.row][0] = null;
      orbClears += 1;
    }

    group.rings.forEach((col) => {
      state.board[group.row][col] = null;
    });
  });

  if (orbClears > 0) {
    state.score += orbClears * CONFIG.clearScore;
    state.over = Math.max(0, state.over - orbClears);
    el.status.textContent =
      orbClears >= 2 ? "SIMULTANEOUS!" : "CLEAR!";
    playClearSound();
  } else {
    el.status.textContent = "WHITE CLEAR";
  }

  compactBoard();
  checkLevel();
  renderGame();

  setTimeout(() => {
    const chain = state.board
      .map((_, row) => getGroup(row))
      .some((group) => group.total === 8 && group.rings.length > 0);

    if (chain) {
      resolveClears();
      return;
    }

    finishTurn();
  }, 230);
}

function checkLevel() {
  const nextLevel = Math.floor(
    state.score / CONFIG.levelScoreStep
  ) + 1;

  if (nextLevel > state.level) {
    state.level = nextLevel;
    el.status.textContent = `LEVEL ${state.level}`;
    changeBgm();
  }
}

function finishTurn() {
  renderGame();

  setTimeout(() => {
    if (!state || state.ended) return;

    state.busy = false;
    spawnRing();
  }, 260);
}

function endGame() {
  if (!state || state.ended) return;

  state.ended = true;
  clearTimers();
  stopBgm();

  el.finalScore.textContent = String(state.score);
  el.gameOver.classList.add("is-open");
}

function createPieceElement(item, active = false, total = 0) {
  const node = document.createElement("div");

  node.className = `piece ${item.type === "orb" ? "orb" : "ring"}`;

  if (active) node.classList.add("active-ring");
  if (item.color !== null && item.color !== undefined) {
    node.classList.add(`color-${item.color}`);
  }
  if (total >= 5 && total <= 7) {
    node.classList.add(`total-${total}`);
  }

  node.textContent = item.number;
  return node;
}

function renderGame() {
  if (!state) return;

  el.board.innerHTML = "";

  for (let row = 0; row < CONFIG.rows; row += 1) {
    const group = getGroup(row);

    for (let col = 0; col < CONFIG.cols; col += 1) {
      const cell = document.createElement("button");

      cell.type = "button";
      cell.className = "board-cell";
      cell.dataset.row = String(row);

      if (state.selectedRow === row) {
        cell.classList.add("is-target");
      }

      const item = state.board[row][col];

      if (item) {
        cell.append(
          createPieceElement(item, false, group.total)
        );
      }

      if (
        state.active &&
        state.active.row === row &&
        state.active.col === col
      ) {
        cell.append(
          createPieceElement(
            { type: "ring", number: state.active.number, color: null },
            true
          )
        );
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
  el.tutorialStep.textContent =
    `${tutorialIndex + 1} / ${TUTORIAL.length}`;

  el.tutorialText.textContent = TUTORIAL[tutorialIndex];

  el.tutorialNext.querySelector("strong").textContent =
    tutorialIndex === TUTORIAL.length - 1
      ? "完了"
      : "つぎへ";
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
  clearTimers();
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
