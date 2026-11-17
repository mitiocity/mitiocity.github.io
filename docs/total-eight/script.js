"use strict";

/* =========================================================
   とーたるえいと❣️
   script.js 完成版：ゲーム処理
========================================================= */

const CONFIG = {
  rows: 4,
  cols: 8,

  baseClearScore: 100,
  simultaneousBonus: 80,
  levelScoreStep: 900,

  feverDuration: 8000,
  feverMultiplier: 2,

  clearDelay: 260,
  levelPreviewDelay: 900,

  rankingKey: "total-eight-local-ranking-v1",

  // 後からBGMを置く場所
  // assets/audio/bgm/level-1.mp3
  // assets/audio/bgm/level-2.mp3
  bgmPath(level) {
    return `assets/audio/bgm/level-${level}.mp3`;
  },

  // 後からチュートリアル音声を置く場所
  // assets/audio/tutorial/tutorial-01.mp3
  // assets/audio/tutorial/tutorial-02.mp3
  tutorialVoicePath(step) {
    return `assets/audio/tutorial/tutorial-${String(step).padStart(2, "0")}.mp3`;
  }
};

const TUTORIAL_STEPS = [
  "ようこそ、とーたるえいと❣️へ。オーブとリングの数字を足して、合計8を作ろう。",
  "左にある球体がオーブ。オーブ自身の数字も、合計に入るぞ。",
  "右から来る輪っかがリング。置きたいレーンをタップして、オーブへつなげよう。",
  "オーブにつながったリングは、オーブと同じ色になる。",
  "合計が5になると緑色に変化する。6、7と近づくほど点滅が強くなるぞ。",
  "合計がちょうど8になると、オーブとつながったリングが消える。",
  "8を超えると、新しいリングだけが消えて、オーバーゲージがたまる。",
  "複数のオーブを7まで育てて、まとめて8にしよう。連鎖と同時消去で高得点を狙え！"
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
   音：消去音、チュートリアル音声、BGM
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
    // 音が出せない端末でもゲームは継続する。
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

  // レベルごとに全音上へ転調。
  const levelTranspose = 2 ** (((state.level - 1) * 2) / 12);

  // 連鎖が続くほど高速化。
  const interval =
    chain === 1 ? 0.1 :
    chain === 2 ? 0.075 :
    0.052;

  notes.forEach((note, index) => {
    playTone(note * levelTranspose, index * interval, interval * 1.12, 0.055);
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
    // MP3をまだ入れていない間は無音で進行。
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
    const steps = 18;
    let count = 0;

    const fadeTimer = window.setInterval(() => {
      count += 1;

      const ratio = count / steps;
      nextBgm.volume = Math.min(0.42, ratio * 0.42);

      if (currentBgm) {
        currentBgm.volume = Math.max(0, 0.42 * (1 - ratio));
      }

      if (count >= steps) {
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

    nextRing: randomNumber(),

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
  closeAllModals();
  stopTutorialVoice();

  state = createGameState();
  placeInitialOrbs();

  showScreen("game");
  changeBgm(state.level);
  renderGame();
}

function returnToTitle() {
  closeAllModals();
  stopTutorialVoice();
  stopBgm();
  showScreen("title");
}

/* =========================================================
   接続グループの取得
========================================================= */

/*
  各オーブから右方向へ、連続して接続しているリングを取得。
  オーブ自身の数字も合計に含める。
*/
function getGroups() {
  const groups = [];

  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      const orb = state.board[row][col];

      if (!orb || orb.type !== "orb") continue;

      const rings = [];
      let cursor = col + 1;

      while (
        cursor < CONFIG.cols &&
        state.board[row][cursor] &&
        state.board[row][cursor].type === "ring"
      ) {
        rings.push({
          piece: state.board[row][cursor],
          row,
          col: cursor
        });

        cursor += 1;
      }

      groups.push({
        orb,
        orbRow: row,
        orbCol: col,
        rings,
        total: orb.number + rings.reduce(
          (sum, ring) => sum + ring.piece.number,
          0
        )
      });
    }
  }

  return groups;
}

function findGroupByRingId(ringId) {
  return getGroups().find((group) => {
    return group.rings.some((ring) => ring.piece.id === ringId);
  });
}

function removeRingById(ringId) {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      if (state.board[row][col]?.id === ringId) {
        state.board[row][col] = null;
        return;
      }
    }
  }
}

function removeGroup(group) {
  state.board[group.orbRow][group.orbCol] = null;

  group.rings.forEach((ring) => {
    state.board[ring.row][ring.col] = null;
  });
}

function countOrbs() {
  let total = 0;

  state.board.forEach((row) => {
    row.forEach((piece) => {
      if (piece?.type === "orb") {
        total += 1;
      }
    });
  });

  return total;
}

/*
  リングだけを左へ詰める。
  オーブは固定され、リングはオーブを通り抜けない。
*/
function settleBoard() {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    const previousRow = state.board[row];
    const nextRow = Array(CONFIG.cols).fill(null);

    previousRow.forEach((piece, col) => {
      if (piece?.type === "orb") {
        nextRow[col] = piece;
      }
    });

    let segmentStart = 0;

    for (let col = 0; col <= CONFIG.cols; col += 1) {
      const isBoundary =
        col === CONFIG.cols ||
        previousRow[col]?.type === "orb";

      if (!isBoundary) continue;

      const rings = [];

      for (let sourceCol = segmentStart; sourceCol < col; sourceCol += 1) {
        const piece = previousRow[sourceCol];

        if (piece?.type === "ring") {
          rings.push(piece);
        }
      }

      let targetCol = segmentStart;

      rings.forEach((ring) => {
        while (nextRow[targetCol]) {
          targetCol += 1;
        }

        if (targetCol < col) {
          nextRow[targetCol] = ring;
          targetCol += 1;
        }
      });

      segmentStart = col + 1;
    }

    state.board[row] = nextRow;
  }
}

/* =========================================================
   リング投入・オーバー判定・消去
========================================================= */

async function placeRing(row) {
  if (!state || state.isBusy || state.isGameOver) return;

  // 右端が埋まっているレーンにはリングを投入できない。
  if (state.board[row][CONFIG.cols - 1]) {
    elements.combo.textContent = "LANE BLOCKED";
    return;
  }

  state.isBusy = true;

  const ring = createPiece("ring", state.nextRing);

  // リングは右端から入る。
  state.board[row][CONFIG.cols - 1] = ring;

  // 入ったリングを含め、すべてのリングを左へ詰める。
  settleBoard();
  renderGame();

  const group = findGroupByRingId(ring.id);

  /*
    9以上：
    新しいリングだけが消える。
    オーブ・既存リング・合計状態は維持する。
  */
  if (group && group.total >= 9) {
    elements.combo.textContent = "OVER!";

    await wait(180);

    removeRingById(ring.id);
    state.overGauge += 1;

    if (state.overGauge >= 3) {
      state.overGauge = 0;
      state.chainPower = Math.max(1, state.chainPower - 1);
      elements.combo.textContent = "CHAIN DOWN";
    }

    settleBoard();
    state.nextRing = randomNumber();
    state.isBusy = false;

    renderGame();
    return;
  }

  await resolveClearChains();

  state.nextRing = randomNumber();
  state.isBusy = false;

  renderGame();
}

async function resolveClearChains() {
  let chain = 1;

  while (true) {
    const clearingGroups = getGroups().filter((group) => group.total === 8);

    if (clearingGroups.length === 0) break;

    const simultaneousCount = clearingGroups.length;
    const feverMultiplier = isFeverActive() ? CONFIG.feverMultiplier : 1;
    const chainMultiplier = state.chainPower + chain - 1;
    const simultaneousMultiplier = Math.max(1, simultaneousCount);

    const clearScore =
      (CONFIG.baseClearScore * simultaneousCount +
        CONFIG.simultaneousBonus * Math.max(0, simultaneousCount - 1)) *
      chainMultiplier *
      simultaneousMultiplier *
      feverMultiplier;

    state.score += clearScore;

    // 8で消したオーブの数だけオーバーゲージを減らす。
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

  /*
    全オーブ消去後に、新しいオーブ群を置く。
    フィーバー中は得点2倍。
  */
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
   レベルアップ・オーブ領域の拡張
========================================================= */

function checkLevelUp() {
  if (state.score < state.nextLevelScore) return;
  if (state.isExpanding) return;

  state.level += 1;
  state.nextLevelScore += CONFIG.levelScoreStep;
  state.isExpanding = true;

  elements.combo.textContent = `LEVEL ${state.level}`;

  // 次の列を半透明で予告。
  renderGame(true);

  // ゲームを止めずにBGMをクロスフェード。
  changeBgm(state.level);

  window.setTimeout(() => {
    extendOrbArea();
  }, CONFIG.levelPreviewDelay);
}

function extendOrbArea() {
  const newOrbColumn = state.orbAreaCols;

  /*
    オーブ領域が右端に届く段階でゲームオーバー。
  */
  if (newOrbColumn >= CONFIG.cols - 1) {
    state.isExpanding = false;
    renderGame();
    gameOver();
    return;
  }

  /*
    新オーブを置く列の右側にあるリングを右へ逃がす。
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

  settleBoard();
  renderGame();

  // 拡張後に8ができていれば自動消去。
  resolveClearChains();
}

/* =========================================================
   盤面描画
========================================================= */

function makePieceElement(piece, visual) {
  const pieceElement = document.createElement("span");

  pieceElement.className = `piece piece--${piece.type}`;
  pieceElement.textContent = piece.number;

  if (visual.color !== null && visual.color !== undefined) {
    pieceElement.classList.add(`piece--color-${visual.color}`);
  }

  if (visual.total === 5) {
    pieceElement.classList.add("is-total-5");
  }

  if (visual.total === 6) {
    pieceElement.classList.add("is-total-6");
  }

  if (visual.total === 7) {
    pieceElement.classList.add("is-total-7");
  }

  return pieceElement;
}

function createVisualMap() {
  const map = new Map();

  getGroups().forEach((group) => {
    map.set(group.orb.id, {
      color: group.orb.color,
      total: group.total
    });

    group.rings.forEach((ring) => {
      map.set(ring.piece.id, {
        color: group.orb.color,
        total: group.total
      });
    });
  });

  return map;
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
      cell.setAttribute("aria-label", `${row + 1}番レーンにリングを置く`);

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
        placeRing(row);
      });

      if (piece) {
        const visual = visualMap.get(piece.id) || {
          color: piece.color,
          total: piece.number
        };

        cell.appendChild(makePieceElement(piece, visual));
      }

      elements.gameBoard.appendChild(cell);
    }
  }

  elements.score.textContent = state.score.toLocaleString("ja-JP");
  elements.level.textContent = state.level;
  elements.nextRingNumber.textContent = state.nextRing;

  elements.nextRing.classList.toggle("is-disabled", state.isBusy);

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

      const isExampleRow = row === 1;

      if (isExampleRow && col === 0) {
        const orb = createPiece("orb", 3, 0);

        cell.appendChild(
          makePieceElement(orb, {
            color: 0,
            total: step >= 4 ? 7 : 3
          })
        );
      }

      if (isExampleRow && col === 1 && step >= 2) {
        const ring = createPiece("ring", 2);

        cell.appendChild(
          makePieceElement(ring, {
            color: step >= 3 ? 0 : null,
            total: step >= 4 ? 7 : 5
          })
        );
      }

      if (isExampleRow && col === 2 && step >= 4) {
        const ring = createPiece("ring", step >= 5 ? 3 : 2);

        cell.appendChild(
          makePieceElement(ring, {
            color: 0,
            total: step >= 5 ? 8 : 7
          })
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
    const saved = JSON.parse(
      localStorage.getItem(CONFIG.rankingKey)
    );

    if (Array.isArray(saved)) {
      return saved;
    }
  } catch (error) {
    // 保存データ異常時は初期ランキングへ戻す。
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

/* 最初はタイトル画面 */
showScreen("title");
