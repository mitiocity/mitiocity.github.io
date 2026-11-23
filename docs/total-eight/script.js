"use strict";

const CONFIG = {
  rows: 4,
  cols: 8,
  startTime: 400,
  ringStepMs: 950,
  clearScore: 100,
  levelScoreStep: 900,
  feverDuration: 8000
};

const TUTORIAL_TEXTS = [
  "リングは右から左へ流れてくる。オーブとリングの数字を足して、合計8を作ろう。",
  "オーブを1回タップすると、流れているリングがそのレーンへ移動する。",
  "同じレーンをもう一度タップすると、リングは列の先頭へ即固定される。",
  "オーブがない空白レーンも、同じ操作で使える。",
  "合計8で消去。全オーブ消去でフィーバーに入る。"
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

  abort: $("#abort-button"),
  abortModal: $("#abort-modal"),
  abortResume: $("#abort-resume-button"),
  abortTitle: $("#abort-title-button"),

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
let moveTimer = null;
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

  return {
    id: `piece-${pieceId}`,
    type,
    number,
    color
  };
}

function makeBoard() {
  return Array.from({ length: CONFIG.rows }, (_, row) => {
    const cells = Array(CONFIG.cols).fill(null);
    cells[0] = makePiece("orb", randomNumber(), row);
    return cells;
  });
}

function createGameState() {
  return {
    board: makeBoard(),
    queue: [randomNumber(), randomNumber(), randomNumber()],
    activeRing: null,
    selectedRow: null,
    score: 0,
    level: 1,
    time: CONFIG.startTime,
    over: 0,
    feverUntil: 0,
    isBusy: true,
    isPaused: false,
    isEnded: false
  };
}

function showScreen(target) {
  [el.title, el.game, el.tutorial].forEach((screen) => {
    screen.classList.remove("is-active");
  });

  target.classList.add("is-active");
}

function stopTimers() {
  clearInterval(moveTimer);
  clearInterval(clockTimer);

  moveTimer = null;
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

  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.13, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function playClearSound() {
  if (!audioContext) return;

  const scale = [0, 2, 4, 5, 7, 9, 11, 12];
  const shift = (state.level - 1) * 2;
  const root = 261.63 * (2 ** (shift / 12));
  const now = audioContext.currentTime;

  scale.forEach((note, index) => {
    playTone(
      root * (2 ** (note / 12)),
      now + index * 0.075,
      0.11
    );
  });
}

function startBgm() {
  const next = new Audio(`assets/audio/bgm/level-${state.level}.mp3`);
  const previous = currentBgm;

  next.loop = true;
  next.volume = 0;
  currentBgm = next;

  next.play().catch(() => {});

  let step = 0;

  const fadeTimer = setInterval(() => {
    step += 1;
    next.volume = Math.min(0.38, 0.38 * (step / 20));

    if (previous) {
      previous.volume = Math.max(0, 0.38 * (1 - step / 20));
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

  state = createGameState();

  el.gameOver.classList.remove("open");
  el.abortModal.classList.remove("open");
  el.tutorialModal.classList.remove("open");

  showScreen(el.game);
  renderGame();
  runCountdown();
}

function runCountdown() {
  const words = ["READY?", "3", "2", "1", "GO!"];
  let index = 0;

  el.countdown.classList.remove("hidden");

  function nextWord() {
    el.countdownText.textContent = words[index];
    index += 1;

    if (index < words.length) {
      setTimeout(nextWord, index === 1 ? 850 : 720);
      return;
    }

    setTimeout(() => {
      el.countdown.classList.add("hidden");
      state.isBusy = false;
      spawnRing();
      startClock();
      startBgm();
    }, 620);
  }

  nextWord();
}

function startClock() {
  clockTimer = setInterval(() => {
    if (!state || state.isBusy || state.isPaused || state.isEnded) return;

    state.time -= 1;
    renderGame();

    if (state.time <= 0) {
      endGame();
    }
  }, 1000);
}

function spawnRing() {
  if (!state || state.isEnded || state.isPaused) return;

  state.activeRing = {
    number: state.queue.shift(),
    row: Math.floor(Math.random() * CONFIG.rows),
    col: CONFIG.cols - 1
  };

  state.queue.push(randomNumber());
  state.selectedRow = null;

  renderGame();

  clearInterval(moveTimer);
  moveTimer = setInterval(moveRing, CONFIG.ringStepMs);
}

function moveRing() {
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

  if (nextCol < 0 || state.board[active.row][nextCol]) {
    landRing(active.col);
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
    el.status.textContent = "TARGET LOCK";
    renderGame();
    return;
  }

  let landingCol = state.activeRing.col;

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
  let writeCol = 0;

  if (orb) {
    result[writeCol] = orb;
    writeCol += 1;
  }

  rings.forEach((ring) => {
    if (writeCol < CONFIG.cols) {
      result[writeCol] = ring;
      writeCol += 1;
    }
  });

  state.board[row] = result;

  if (orb) {
    for (let col = 1; col < CONFIG.cols; col += 1) {
      const ring = result[col];

      if (!ring || ring.type !== "ring") break;

      ring.color = orb.color;
    }
  }
}

function compactBoard() {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    compactRow(row);
  }
}

function getGroup(row) {
  const cells = state.board[row];
  const orb = cells[0]?.type === "orb" ? cells[0] : null;
  const rings = [];

  let total = orb ? orb.number : 0;
  const startCol = orb ? 1 : 0;

  for (let col = startCol; col < CONFIG.cols; col += 1) {
    const ring = cells[col];

    if (!ring || ring.type !== "ring") break;

    rings.push(col);
    total += ring.number;
  }

  return {
    row,
    orb,
    rings,
    total
  };
}

function landRing(col) {
  clearInterval(moveTimer);

  if (!state?.activeRing || col >= CONFIG.cols) return;

  state.isBusy = true;

  const active = state.activeRing;
  const addedRing = makePiece("ring", active.number);

  state.board[active.row][col] = addedRing;
  state.activeRing = null;

  const placedGroup = getGroup(active.row);

  /*
    合計9以上：
    新しいリングだけ消す。
    オーブ・既存リング・色・合計状態は維持する。
  */
  if (placedGroup.total > 8) {
    state.board[active.row][col] = null;

    if (placedGroup.orb) {
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

    finishTurn();
    return;
  }

  compactBoard();
  resolveClears();
}

function resolveClears() {
  const groups = state.board.map((_, row) => getGroup(row));

  const clearGroups = groups.filter((group) => {
    return group.total === 8 && group.rings.length > 0;
  });

  if (clearGroups.length === 0) {
    el.status.textContent = "READY";
    finishTurn();
    return;
  }

  let orbClearCount = 0;

  clearGroups.forEach((group) => {
    if (group.orb) {
      state.board[group.row][0] = null;
      orbClearCount += 1;
    }

    group.rings.forEach((col) => {
      state.board[group.row][col] = null;
    });
  });

  if (orbClearCount > 0) {
    const feverMultiplier =
      Date.now() < state.feverUntil ? 2 : 1;

    state.score +=
      orbClearCount *
      CONFIG.clearScore *
      feverMultiplier;

    state.over = Math.max(0, state.over - orbClearCount);

    el.status.textContent =
      orbClearCount >= 2
        ? "SIMULTANEOUS!"
        : "CLEAR!";

    playClearSound();
  } else {
    el.status.textContent = "WHITE CLEAR";
  }

  compactBoard();
  checkLevel();
  renderGame();

  setTimeout(() => {
    const noOrbExists = !state.board.some((row) => {
      return row.some((item) => item?.type === "orb");
    });

    if (noOrbExists) {
      startFeverAndRespawn();
      return;
    }

    const chainExists = state.board.some((_, row) => {
      const group = getGroup(row);

      return group.total === 8 && group.rings.length > 0;
    });

    if (chainExists) {
      resolveClears();
      return;
    }

    finishTurn();
  }, 230);
}

function startFeverAndRespawn() {
  state.feverUntil = Date.now() + CONFIG.feverDuration;
  el.status.textContent = "ALL CLEAR! FEVER!";
  renderGame();

  setTimeout(() => {
    for (let row = 0; row < CONFIG.rows; row += 1) {
      const rings = state.board[row]
        .filter((item) => item?.type === "ring")
        .slice(0, CONFIG.cols - 1);

      state.board[row] = [
        makePiece("orb", randomNumber(), row),
        ...rings,
        ...Array(CONFIG.cols - 1 - rings.length).fill(null)
      ];
    }

    compactBoard();
    finishTurn();
  }, 500);
}

function checkLevel() {
  const nextLevel =
    Math.floor(state.score / CONFIG.levelScoreStep) + 1;

  if (nextLevel > state.level) {
    state.level = nextLevel;
    el.status.textContent = `LEVEL ${state.level}`;
    startBgm();
  }
}

function finishTurn() {
  renderGame();

  setTimeout(() => {
    if (!state || state.isEnded || state.isPaused) return;

    state.isBusy = false;
    spawnRing();
  }, 260);
}

function pauseGame() {
  if (!state || state.isEnded) return;

  state.isPaused = true;
  clearInterval(moveTimer);
  clearInterval(clockTimer);

  el.abortModal.classList.add("open");
}

function resumeGame() {
  if (!state || state.isEnded) return;

  state.isPaused = false;
  el.abortModal.classList.remove("open");

  if (!state.isBusy) {
    startClock();

    if (state.activeRing) {
      moveTimer = setInterval(moveRing, CONFIG.ringStepMs);
    }
  }
}

function endGame() {
  state.isEnded = true;

  stopTimers();
  stopBgm();

  el.finalScore.textContent = String(state.score);
  el.gameOver.classList.add("open");
}

function createPieceElement(item, active = false, total = 0) {
  const node = document.createElement("div");

  node.className =
    `piece ${item.type === "orb" ? "orb" : "ring"}`;

  if (active) node.classList.add("active");

  if (item.color !== null && item.color !== undefined) {
    node.classList.add(`c${item.color}`);
  }

  if (total >= 5 && total <= 7) {
    node.classList.add(`t${total}`);
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
      cell.className = "cell";
      cell.dataset.row = String(row);

      if (state.selectedRow === row) {
        cell.classList.add("target");
      }

      const item = state.board[row][col];

      if (item) {
        cell.append(
          createPieceElement(item, false, group.total)
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
              type: "ring",
              number: state.activeRing.number,
              color: null
            },
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
    bar.classList.toggle("on", index < state.over);
  });
}

function startTutorial() {
  tutorialIndex = 0;

  el.tutorialModal.classList.remove("open");
  showScreen(el.tutorial);
  renderTutorial();
}

function renderTutorial() {
  el.tutorialStep.textContent =
    `${tutorialIndex + 1} / ${TUTORIAL_TEXTS.length}`;

  el.tutorialText.textContent =
    TUTORIAL_TEXTS[tutorialIndex];

  el.tutorialNext.querySelector("strong").textContent =
    tutorialIndex === TUTORIAL_TEXTS.length - 1
      ? "完了"
      : "つぎへ";
}

function nextTutorial() {
  tutorialIndex += 1;

  if (tutorialIndex >= TUTORIAL_TEXTS.length) {
    el.tutorialModal.classList.add("open");
    return;
  }

  renderTutorial();
}

function returnTitle() {
  stopTimers();
  stopBgm();

  state = null;

  el.abortModal.classList.remove("open");
  el.gameOver.classList.remove("open");
  el.tutorialModal.classList.remove("open");

  showScreen(el.title);
}

el.start.addEventListener("click", startGame);
el.tutorialButton.addEventListener("click", startTutorial);

el.abort.addEventListener("click", pauseGame);
el.abortResume.addEventListener("click", resumeGame);
el.abortTitle.addEventListener("click", returnTitle);

el.board.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");

  if (!cell) return;

  chooseRow(Number(cell.dataset.row));
});

el.tutorialExit.addEventListener("click", returnTitle);
el.tutorialNext.addEventListener("click", nextTutorial);
el.tutorialStart.addEventListener("click", startGame);
el.tutorialRestart.addEventListener("click", startTutorial);
el.tutorialTitle.addEventListener("click", returnTitle);

el.retry.addEventListener("click", startGame);
el.titleButton.addEventListener("click", returnTitle);

showScreen(el.title);
