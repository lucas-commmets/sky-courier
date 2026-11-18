"use strict";

(() => {
  const WIDTH = 360;
  const HEIGHT = 640;
  const CARGO_CAPACITY = 5;
  const DESTINATIONS_AHEAD = 3;
  const HAZARDS_AHEAD = 3;
  const DIFFICULTIES = [
    { key: "easy", name: "Easy", speed: 1.9, gravity: 0.3, flap: -6, glide: 0.05, maxGlide: 1.5,
      wind: 0.12, windEvery: 2500, islandGap: 400, hazardGap: 390, windName: "GENTLE" },
    { key: "normal", name: "Normal", speed: 2.3, gravity: 0.34, flap: -5.8, glide: 0.08, maxGlide: 2,
      wind: 0.18, windEvery: 1800, islandGap: 480, hazardGap: 330, windName: "STEADY" },
    { key: "hard", name: "Hard", speed: 2.8, gravity: 0.39, flap: -5.6, glide: 0.12, maxGlide: 2.5,
      wind: 0.24, windEvery: 1250, islandGap: 560, hazardGap: 270, windName: "STRONG" },
  ];

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const gameShell = document.querySelector("#gameShell");
  const authPanel = document.querySelector("#authPanel");
  const authForm = document.querySelector("#authForm");
  const authEmail = document.querySelector("#authEmail");
  const authPassword = document.querySelector("#authPassword");
  const displayNameInput = document.querySelector("#displayName");
  const authStatus = document.querySelector("#authStatus");
  const accountBar = document.querySelector("#accountBar");
  const accountName = document.querySelector("#accountName");
  const logoutButton = document.querySelector("#logoutButton");
  const googleLoginButton = document.querySelector("#googleLoginButton");
  const difficultyButton = document.querySelector("#difficultyButton");
  const actionButton = document.querySelector("#actionButton");
  const leaderboardTabs = document.querySelector("#leaderboardTabs");
  const leaderboardTabButtons = [...leaderboardTabs.querySelectorAll("[data-leaderboard-level]")];
  const nameForm = document.querySelector("#nameForm");
  const nameInput = document.querySelector("#playerName");
  const historyDetails = document.querySelector("#historyDetails");
  const historyStatus = document.querySelector("#historyStatus");
  const attemptHistoryList = document.querySelector("#attemptHistory");
  const installButton = document.querySelector("#installButton");
  const supabaseConfig = window.SKY_COURIER_SUPABASE || {};
  const supabaseUrl = typeof supabaseConfig.url === "string"
    ? supabaseConfig.url.replace(/\/+$/, "") : "";
  const supabaseAnonKey = typeof supabaseConfig.anonKey === "string"
    ? supabaseConfig.anonKey.trim() : "";
  const onlineLeaderboardEnabled = Boolean(supabaseUrl && supabaseAnonKey);
  const leaderboardStatus = onlineLeaderboardEnabled
    ? "Loading online leaderboard..." : "Local scores are only on this device.";
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  ctx.scale(dpr, dpr);

  const bird = { x: 45, y: 320, width: 42, height: 32, vy: 0 };
  const clouds = [
    { x: -24, y: 100, w: 124, h: 42 },
    { x: 158, y: 184, w: 94, h: 34 },
    { x: 274, y: 294, w: 112, h: 39 },
    { x: 38, y: 397, w: 86, h: 31 },
  ];
  let islands = [];
  let parcels = [];
  let winds = [];
  let hazards = [];
  let difficultyIndex = 1;
  let difficulty = DIFFICULTIES[difficultyIndex];
  let selectedLeaderboardDifficulty = difficulty.key;
  let runDifficulty = difficulty.key;
  let state = "menu";
  let score = 0;
  let authSession = null;
  let currentUser = null;
  let currentDisplayName = "";
  let best = readNumber("skyCourierBest");
  let runNewBest = false;
  let runId = 0;
  let deliveries = 0;
  let cargo = 0;
  let leaderboardEntries = onlineLeaderboardEnabled ? [] : readLeaderboard();
  let leaderboard = getLocalLeaderboardFor(selectedLeaderboardDifficulty);
  let leaderboardMessage = leaderboardStatus;
  let failedScore = null;
  let scoreRequestInFlight = false;
  let historyLoadId = 0;
  let playerName = "";
  let message = "";
  let messageUntil = 0;
  let windDirection = 0;
  let lastFrame = 0;
  let nextWindAt = 0;
  let spaceHeld = false;
  let pointerHeld = false;
  let audioContext = null;
  let musicTimer = null;
  let musicIndex = 0;
  let installPrompt = null;

  function readNumber(key) {
    try {
      const value = Number(localStorage.getItem(key) || 0);
      return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    } catch (error) {
      console.warn("Local score storage is unavailable.", error);
      return 0;
    }
  }

  function readLeaderboard() {
    try {
      const saved = JSON.parse(localStorage.getItem("skyCourierLeaderboard") || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.filter((entry) =>
        entry && typeof entry.name === "string" && Number.isInteger(entry.score) && entry.score >= 0
      ).map((entry) => ({
        name: entry.name,
        score: entry.score,
        difficulty: DIFFICULTIES.some((level) => level.key === entry.difficulty)
          ? entry.difficulty : "normal",
      })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    } catch (error) {
      console.warn("Local leaderboard could not be loaded.", error);
      return [];
    }
  }

  function getLocalLeaderboardFor(level) {
    return leaderboardEntries.filter((entry) => entry.difficulty === level)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 10);
  }

  function localSaveLeaderboard(name) {
    const key = name.trim().slice(0, 12).toLocaleLowerCase();
    if (!key) return false;
    const previous = leaderboardEntries.find((entry) =>
      entry.difficulty === runDifficulty && entry.name.toLocaleLowerCase() === key);
    const record = Math.max(score, previous ? previous.score : 0);
    const nextLeaderboard = leaderboardEntries.filter((entry) =>
      entry.difficulty !== runDifficulty || entry.name.toLocaleLowerCase() !== key);
    nextLeaderboard.push({
      name: name.trim().slice(0, 12),
      score: record,
      difficulty: runDifficulty,
    });
    const savedLeaderboard = DIFFICULTIES.flatMap((level) =>
      nextLeaderboard.filter((entry) => entry.difficulty === level.key)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, 10));
    try {
      const attempts = readLocalAttempts();
      attempts.push({
        name: name.trim().slice(0, 12),
        score,
        difficulty: runDifficulty,
        created_at: new Date().toISOString(),
      });
      localStorage.setItem("skyCourierAttempts", JSON.stringify(attempts));
      localStorage.setItem("skyCourierLeaderboard", JSON.stringify(savedLeaderboard));
      localStorage.setItem("skyCourierBest", String(best));
    } catch (error) {
      console.error("Could not save the local leaderboard.", error);
      return "error";
    }
    leaderboardEntries = savedLeaderboard;
    leaderboard = getLocalLeaderboardFor(selectedLeaderboardDifficulty);
    return "saved";
  }

  function readLocalAttempts() {
    try {
      const saved = JSON.parse(localStorage.getItem("skyCourierAttempts") || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.filter((entry) => entry && typeof entry.name === "string"
        && Number.isInteger(entry.score) && entry.score >= 0
        && DIFFICULTIES.some((level) => level.key === entry.difficulty));
    } catch (error) {
      console.warn("Local score history could not be loaded.", error);
      return [];
    }
  }

  function setAuthStatus(text) {
    authStatus.textContent = text;
  }

  async function authRequest(path, options) {
    const request = options || {};
    const headers = { apikey: supabaseAnonKey, "Content-Type": "application/json" };
    if (request.accessToken) headers.Authorization = `Bearer ${request.accessToken}`;
    else headers.Authorization = `Bearer ${supabaseAnonKey}`;
    const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
      method: request.method || "POST",
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
    const responseText = await response.text();
    let payload = null;
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch (error) {
        if (response.ok) throw new Error("Authentication returned an unreadable response.");
        payload = { message: responseText };
      }
    }
    if (!response.ok) {
      const detail = payload && (payload.msg || payload.message || payload.error_description);
      throw new Error(detail || `Authentication request failed (${response.status}).`);
    }
    return payload;
  }

  function persistAuthSession(session) {
    try {
      localStorage.setItem("skyCourierAuthSession", JSON.stringify(session));
    } catch (error) {
      console.error("Could not save the sign-in session.", error);
      throw new Error("Could not save your sign-in on this device.");
    }
  }

  async function applyAuthSession(payload, displayNameOverride) {
    if (!payload || !payload.access_token || !payload.user || !payload.user.id) {
      throw new Error("The sign-in response did not include a valid account session.");
    }
    let user = payload.user;
    const override = displayNameOverride.trim().slice(0, 12);
    if (override && user.user_metadata?.display_name !== override) {
      user = await authRequest("user", {
        method: "PUT",
        accessToken: payload.access_token,
        body: { data: { display_name: override } },
      });
    }
    const metadata = user.user_metadata || {};
    const resolvedName = typeof metadata.display_name === "string"
      ? metadata.display_name.trim().slice(0, 12) : "";
    if (!resolvedName) {
      throw new Error("This account has no display name. Enter one and log in again.");
    }
    authSession = {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: payload.expires_at
        || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
      user,
    };
    currentUser = user;
    currentDisplayName = resolvedName;
    playerName = resolvedName;
    persistAuthSession(authSession);
    accountName.textContent = `Signed in as ${currentDisplayName}`;
    accountBar.hidden = false;
    authPanel.hidden = true;
    gameShell.hidden = false;
    leaderboardMessage = "Loading online leaderboard...";
    refreshLeaderboard();
    updateControls();
  }

  function clearAuthSession() {
    authSession = null;
    currentUser = null;
    currentDisplayName = "";
    accountBar.hidden = true;
    gameShell.hidden = true;
    authPanel.hidden = false;
    try {
      localStorage.removeItem("skyCourierAuthSession");
    } catch (error) {
      console.error("Could not clear the saved sign-in session.", error);
      setAuthStatus("Signed out, but this device could not clear the saved session.");
    }
  }

  async function restoreAuthSession() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem("skyCourierAuthSession") || "null");
    } catch (error) {
      console.error("The saved sign-in session could not be read.", error);
      setAuthStatus("The saved sign-in was damaged. Log in again.");
      return false;
    }
    if (!saved || typeof saved.access_token !== "string") return false;
    let payload;
    if (saved.expires_at && saved.expires_at < Math.floor(Date.now() / 1000) + 60) {
      if (typeof saved.refresh_token !== "string" || !saved.refresh_token) {
        setAuthStatus("Your sign-in expired. Log in again.");
        return false;
      }
      payload = await authRequest("token?grant_type=refresh_token", {
        body: { refresh_token: saved.refresh_token },
      });
    } else {
      const user = await authRequest("user", {
        method: "GET",
        accessToken: saved.access_token,
      });
      payload = { ...saved, user };
    }
    await applyAuthSession(payload, "");
    return true;
  }

  async function ensureFreshAuthSession() {
    if (!authSession) throw new Error("Please log in to continue.");
    if (authSession.expires_at > Math.floor(Date.now() / 1000) + 60) return;
    if (!authSession.refresh_token) throw new Error("Your sign-in expired. Log in again.");
    const refreshed = await authRequest("token?grant_type=refresh_token", {
      body: { refresh_token: authSession.refresh_token },
    });
    if (!refreshed || !refreshed.access_token) {
      throw new Error("Could not refresh your sign-in. Log in again.");
    }
    authSession = {
      ...authSession,
      ...refreshed,
      user: refreshed.user || currentUser,
    };
    currentUser = authSession.user;
    persistAuthSession(authSession);
  }

  function supabaseHeaders() {
    return {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${authSession ? authSession.access_token : supabaseAnonKey}`,
    };
  }

  async function refreshLeaderboard() {
    if (!onlineLeaderboardEnabled || !authSession) return false;
    const level = selectedLeaderboardDifficulty;
    try {
      await ensureFreshAuthSession();
      const response = await fetch(
        `${supabaseUrl}/rest/v1/leaderboard?select=player_name,score,user_id&difficulty=eq.${level}&order=score.desc,player_name.asc&limit=10`,
        { headers: supabaseHeaders() },
      );
      if (!response.ok) throw new Error(`Leaderboard request failed (${response.status}).`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("Leaderboard response was not a list.");
      if (selectedLeaderboardDifficulty !== level) return true;
      leaderboard = rows
        .filter((entry) => entry && typeof entry.player_name === "string"
          && Number.isInteger(entry.score) && entry.score >= 0)
        .map((entry) => ({
          name: entry.player_name,
          score: entry.score,
          userId: entry.user_id,
        }));
      leaderboardMessage = "Online leaderboard";
      return true;
    } catch (error) {
      leaderboardMessage = "Online leaderboard unavailable.";
      console.error("Could not load the online leaderboard.", error);
      return false;
    }
  }

  async function saveLeaderboard(name, scoreValue) {
    if (!name.trim()) return "error";
    if (!onlineLeaderboardEnabled) {
      return localSaveLeaderboard(name) === "saved" ? "saved" : "error";
    }
    try {
      await ensureFreshAuthSession();
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_score`, {
        method: "POST",
        headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          p_name: name.trim().slice(0, 12),
          p_score: scoreValue,
          p_difficulty: runDifficulty,
        }),
      });
      if (!response.ok) throw new Error(`Score submission failed (${response.status}).`);
      const improved = await response.json();
      if (typeof improved !== "boolean") {
        throw new Error("Score submission returned an invalid response.");
      }
      refreshLeaderboard();
      return improved ? "improved" : "saved";
    } catch (error) {
      leaderboardMessage = "Could not submit score online. Try again.";
      console.error("Could not submit the online score.", error);
      return "error";
    }
  }

  async function submitOnlineScore(completedRunId, completedScore) {
    scoreRequestInFlight = true;
    leaderboardMessage = "Saving your score...";
    updateControls();
    try {
      const result = await saveLeaderboard(currentDisplayName, completedScore);
      if (runId !== completedRunId) return;
      scoreRequestInFlight = false;
      if (result === "error") {
        failedScore = { runId: completedRunId, score: completedScore };
        leaderboardMessage = "Could not save your score. Check your connection and try again.";
        updateControls();
        return;
      }
      failedScore = null;
      leaderboardMessage = result === "improved"
        ? "New personal best saved!" : "Attempt saved to your history.";
      if (historyDetails.open) loadAttemptHistory();
      updateControls();
    } catch (error) {
      if (runId !== completedRunId) return;
      scoreRequestInFlight = false;
      failedScore = { runId: completedRunId, score: completedScore };
      leaderboardMessage = "Could not save your score. Check your connection and try again.";
      console.error("Could not submit the online score.", error);
      updateControls();
    }
  }

  function renderAttemptHistory(entries, level, loadId) {
    if (loadId !== historyLoadId || selectedLeaderboardDifficulty !== level) return;
    attemptHistoryList.replaceChildren();
    entries.forEach((entry) => {
      const item = document.createElement("li");
      const timestamp = entry.created_at ? new Date(entry.created_at).toLocaleString() : "";
      item.textContent = `${entry.player_name || entry.name} — ${entry.score}`
        + (timestamp ? ` · ${timestamp}` : "");
      const isCurrentUser = onlineLeaderboardEnabled
        ? currentUser && entry.user_id === currentUser.id
        : entry.name && entry.name.toLocaleLowerCase() === playerName.toLocaleLowerCase();
      if (isCurrentUser) item.classList.add("is-current-user");
      attemptHistoryList.append(item);
    });
    historyStatus.textContent = entries.length
      ? `${entries.length} attempt${entries.length === 1 ? "" : "s"} on ${level}.`
      : "No attempts yet for this difficulty.";
  }

  async function loadAttemptHistory() {
    const level = selectedLeaderboardDifficulty;
    const loadId = ++historyLoadId;
    attemptHistoryList.replaceChildren();
    historyStatus.textContent = "Loading attempts...";
    if (!onlineLeaderboardEnabled) {
      const entries = readLocalAttempts()
        .filter((entry) => entry.difficulty === level)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      renderAttemptHistory(entries, level, loadId);
      return;
    }
    if (!authSession) {
      historyStatus.textContent = "Log in to view score history.";
      return;
    }
    try {
      await ensureFreshAuthSession();
      const entries = [];
      let offset = 0;
      const pageSize = 500;
      while (true) {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/score_attempts?select=user_id,player_name,score,created_at,difficulty&difficulty=eq.${level}&order=created_at.desc&limit=${pageSize}&offset=${offset}`,
          { headers: supabaseHeaders() },
        );
        if (!response.ok) throw new Error(`Attempt history request failed (${response.status}).`);
        const page = await response.json();
        if (!Array.isArray(page)) throw new Error("Attempt history response was not a list.");
        entries.push(...page.filter((entry) => entry && typeof entry.player_name === "string"
          && Number.isInteger(entry.score) && entry.score >= 0));
        if (page.length < pageSize) break;
        offset += pageSize;
      }
      renderAttemptHistory(entries, level, loadId);
    } catch (error) {
      if (loadId === historyLoadId) historyStatus.textContent = "Could not load attempts.";
      console.error("Could not load score history.", error);
    }
  }

  function prepareScoreEntry(completedRunId) {
    if (runId !== completedRunId || state !== "over") return;
    if (onlineLeaderboardEnabled) {
      nameForm.hidden = true;
      state = "over";
      refreshLeaderboard();
      updateControls();
      submitOnlineScore(completedRunId, score);
      return;
    }
    state = "record";
    nameForm.hidden = false;
    nameForm.querySelector("label").textContent = "Enter your name for the leaderboard";
    nameInput.value = "";
    nameInput.focus();
    updateControls();
  }

  function applyDifficulty(index) {
    difficultyIndex = (index + DIFFICULTIES.length) % DIFFICULTIES.length;
    difficulty = DIFFICULTIES[difficultyIndex];
    difficultyButton.textContent = `Difficulty: ${difficulty.name}`;
    nextWindAt = performance.now() + difficulty.windEvery;
  }

  function updateControls() {
    actionButton.textContent = state === "menu" ? "Start flight"
      : state === "playing" ? "Flap"
        : state === "record" ? "Enter your name"
          : failedScore ? "Retry score" : "Try again";
    actionButton.disabled = state === "record" || scoreRequestInFlight;
    difficultyButton.disabled = state !== "menu";
    leaderboardTabs.hidden = state !== "record" && state !== "over";
    historyDetails.hidden = state !== "record" && state !== "over";
    leaderboardTabButtons.forEach((button) => {
      const active = button.dataset.leaderboardLevel === selectedLeaderboardDifficulty;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }

  function selectLeaderboardDifficulty(level) {
    if (!DIFFICULTIES.some((item) => item.key === level)) return;
    selectedLeaderboardDifficulty = level;
    if (onlineLeaderboardEnabled) {
      leaderboard = [];
      leaderboardMessage = "Loading online leaderboard...";
      refreshLeaderboard();
    } else {
      leaderboard = getLocalLeaderboardFor(level);
      leaderboardMessage = "Local scores are only on this device.";
    }
    if (historyDetails.open) loadAttemptHistory();
    updateControls();
  }

  function newWorld() {
    islands = [];
    parcels = [];
    winds = [];
    hazards = [];
    for (let i = 0; i < DESTINATIONS_AHEAD; i += 1) addIsland();
    for (let i = 0; i < HAZARDS_AHEAD; i += 1) addHazard();
  }

  function addIsland() {
    const rightmost = islands.length
      ? Math.max(...islands.map((island) => island.x))
      : WIDTH + 150 - difficulty.islandGap;
    const x = rightmost + difficulty.islandGap;
    const y = randomBetween(HEIGHT - 160, HEIGHT - 105);
    islands.push({ x, y, w: 108, h: 24 });
    parcels.push({ x: x - randomBetween(130, 190), y: randomBetween(260, 420), w: 22, h: 22 });
  }

  function addHazard() {
    const rightmost = hazards.length
      ? Math.max(...hazards.map((hazard) => hazard.x))
      : WIDTH + 180 - difficulty.hazardGap;
    hazards.push({
      x: rightmost + difficulty.hazardGap + randomBetween(-35, 35),
      y: randomBetween(115, HEIGHT - 210),
      w: 62,
      h: 48,
    });
  }

  function addWind() {
    if (winds.length >= 4) return;
    winds.push({
      x: WIDTH + randomBetween(0, 100),
      y: randomBetween(100, HEIGHT - 260),
      w: 100,
      h: 138,
      strength: Math.random() < 0.5 ? -difficulty.wind : difficulty.wind,
    });
  }

  function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.width > b.x &&
      a.y < b.y + b.h && a.y + a.height > b.y;
  }

  function startRun() {
    failedScore = null;
    scoreRequestInFlight = false;
    runId += 1;
    runDifficulty = difficulty.key;
    selectedLeaderboardDifficulty = runDifficulty;
    leaderboard = onlineLeaderboardEnabled ? [] : getLocalLeaderboardFor(selectedLeaderboardDifficulty);
    state = "playing";
    updateControls();
    score = 0;
    runNewBest = false;
    deliveries = 0;
    cargo = 0;
    bird.y = 320;
    bird.vy = difficulty.flap;
    spaceHeld = false;
    pointerHeld = false;
    playerName = onlineLeaderboardEnabled ? currentDisplayName : "";
    message = "";
    newWorld();
    nextWindAt = performance.now() + difficulty.windEvery;
    nameForm.hidden = true;
    activateAudio();
    chirp();
  }

  function finishRun() {
    if (state !== "playing") return;
    state = "over";
    const completedRunId = runId;
    if (score > best) {
      best = score;
      runNewBest = true;
      try {
        localStorage.setItem("skyCourierBest", String(best));
      } catch (error) {
        console.warn("Could not save the personal best.", error);
      }
    }
    updateControls();
    prepareScoreEntry(completedRunId);
  }

  function activateAudio() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext = new AudioContextClass();
      const notes = [523, 659, 784, 659, 587, 698, 880, 698];
      musicTimer = window.setInterval(() => {
        if (state !== "playing" || !audioContext) return;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = notes[musicIndex++ % notes.length];
        oscillator.type = "square";
        gain.gain.setValueAtTime(0.018, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.14);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.15);
      }, 260);
    }
    if (audioContext.state === "suspended") audioContext.resume();
    if (musicTimer === null) musicTimer = 0;
  }

  function chirp() {
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(850, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(480, audioContext.currentTime + 0.09);
    gain.gain.setValueAtTime(0.08, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.09);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
  }

  function update(delta, now) {
    if (state !== "playing") return;
    const step = Math.min(delta / (1000 / 60), 2);
    for (const cloud of clouds) {
      cloud.x -= difficulty.speed * 0.18 * step;
      if (cloud.x + cloud.w < 0) {
        cloud.x = WIDTH + randomBetween(40, 180);
        cloud.y = randomBetween(75, 430);
      }
    }

    windDirection = 0;
    if (now >= nextWindAt) {
      addWind();
      nextWindAt = now + difficulty.windEvery;
    }

    const previousBottom = bird.y + bird.height;
    if ((spaceHeld || pointerHeld) && bird.vy > 0) {
      bird.vy = Math.min(bird.vy + difficulty.glide * step, difficulty.maxGlide);
    } else {
      bird.vy += difficulty.gravity * step;
    }

    for (const wind of winds) {
      wind.x -= difficulty.speed * step;
      if (overlaps(bird, wind)) {
        bird.vy = Math.max(-8, Math.min(8, bird.vy + wind.strength * step));
        windDirection += wind.strength < 0 ? -1 : 1;
      }
    }
    for (const island of islands) island.x -= difficulty.speed * step;
    for (const parcel of parcels) parcel.x -= difficulty.speed * step;
    for (const hazard of hazards) hazard.x -= difficulty.speed * step;
    bird.y += bird.vy * step;

    for (let index = parcels.length - 1; index >= 0 && cargo < CARGO_CAPACITY; index -= 1) {
      if (overlaps(bird, parcels[index])) {
        parcels.splice(index, 1);
        cargo += 1;
        chirp();
      }
    }
    if (hazards.some((hazard) => overlaps(bird, hazard))) {
      finishRun();
      return;
    }

    for (let index = 0; index < islands.length; index += 1) {
      const island = islands[index];
      const overlapsX = bird.x + bird.width > island.x && bird.x < island.x + island.w;
      const crossedTop = previousBottom <= island.y && bird.y + bird.height >= island.y;
      if (overlapsX && crossedTop && bird.vy >= 0) {
        bird.y = island.y - bird.height;
        bird.vy = difficulty.flap * 0.65;
        islands.splice(index, 1);
        if (cargo > 0) {
          const points = cargo * (cargo + 4);
          score += points;
          deliveries += cargo;
          message = `Delivered ${cargo} parcels! +${points} points`;
          messageUntil = now + 1800;
          cargo = 0;
          if (score > best) {
            best = score;
            runNewBest = true;
            try {
              localStorage.setItem("skyCourierBest", String(best));
            } catch (error) {
              console.warn("Could not save the personal best.", error);
            }
          }
        }
        chirp();
        break;
      }
    }

    islands = islands.filter((island) => island.x + island.w > 0);
    parcels = parcels.filter((parcel) => parcel.x + parcel.w > 0);
    winds = winds.filter((wind) => wind.x + wind.w > 0);
    hazards = hazards.filter((hazard) => hazard.x + hazard.w > 0);
    while (islands.length < DESTINATIONS_AHEAD) addIsland();
    while (hazards.length < HAZARDS_AHEAD) addHazard();
    if (bird.y < 0 || bird.y + bird.height > HEIGHT) finishRun();
  }

  function roundedRect(x, y, width, height, radius, color, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, "#71c5e6");
    gradient.addColorStop(1, "#e8f7dc");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#fae599";
    ctx.beginPath();
    ctx.arc(279, 112, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff4c2";
    ctx.beginPath();
    ctx.arc(279, 112, 39, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8cccb0";
    ctx.beginPath();
    ctx.ellipse(56, 548, 98, 24, 0, 0, Math.PI * 2);
    ctx.ellipse(322, 568, 86, 21, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const cloud of clouds) {
      ctx.fillStyle = "#b9dedd";
      ctx.beginPath();
      ctx.ellipse(cloud.x + cloud.w / 2, cloud.y + cloud.h * 0.65,
        cloud.w / 2, cloud.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f6fef2";
      ctx.beginPath();
      ctx.ellipse(cloud.x + cloud.w * 0.4, cloud.y + cloud.h * 0.42,
        cloud.w * 0.28, cloud.h * 0.45, 0, 0, Math.PI * 2);
      ctx.ellipse(cloud.x + cloud.w * 0.69, cloud.y + cloud.h * 0.55,
        cloud.w * 0.28, cloud.h * 0.37, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWind(wind) {
    roundedRect(wind.x, wind.y, wind.w, wind.h, 16,
      wind.strength < 0 ? "rgba(80,175,235,.30)" : "rgba(255,164,88,.30)");
    ctx.strokeStyle = wind.strength < 0 ? "#b4e9ff" : "#ffdcaa";
    ctx.lineWidth = 4;
    for (const x of [wind.x + 25, wind.x + 50, wind.x + 75]) {
      ctx.beginPath();
      if (wind.strength < 0) {
        ctx.moveTo(x, wind.y + 84);
        ctx.lineTo(x, wind.y + 54);
        ctx.lineTo(x - 7, wind.y + 63);
        ctx.moveTo(x, wind.y + 54);
        ctx.lineTo(x + 7, wind.y + 63);
      } else {
        ctx.moveTo(x, wind.y + 54);
        ctx.lineTo(x, wind.y + 84);
        ctx.lineTo(x - 7, wind.y + 75);
        ctx.moveTo(x, wind.y + 84);
        ctx.lineTo(x + 7, wind.y + 75);
      }
      ctx.stroke();
    }
  }

  function drawHazard(hazard) {
    ctx.fillStyle = "#3f4c63";
    ctx.beginPath();
    ctx.ellipse(hazard.x + 31, hazard.y + 32, 27, 14, 0, 0, Math.PI * 2);
    ctx.arc(hazard.x + 19, hazard.y + 23, 17, 0, Math.PI * 2);
    ctx.arc(hazard.x + 37, hazard.y + 17, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffdb6f";
    ctx.beginPath();
    ctx.moveTo(hazard.x + 34, hazard.y + 25);
    ctx.lineTo(hazard.x + 25, hazard.y + 39);
    ctx.lineTo(hazard.x + 33, hazard.y + 37);
    ctx.lineTo(hazard.x + 28, hazard.y + 46);
    ctx.lineTo(hazard.x + 42, hazard.y + 31);
    ctx.lineTo(hazard.x + 34, hazard.y + 33);
    ctx.fill();
  }

  function drawIsland(island) {
    roundedRect(island.x, island.y + 8, island.w, island.h - 8, 8, "#398068");
    ctx.fillStyle = "#70cd89";
    ctx.beginPath();
    ctx.ellipse(island.x + island.w / 2, island.y + 8, island.w / 2, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c6f6ad";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(island.x + 12, island.y + 5);
    ctx.lineTo(island.x + island.w - 12, island.y + 5);
    ctx.stroke();
    ctx.strokeStyle = "#48515d";
    ctx.beginPath();
    ctx.moveTo(island.x + island.w / 2, island.y - 20);
    ctx.lineTo(island.x + island.w / 2, island.y + 2);
    ctx.stroke();
    ctx.fillStyle = "#ffbe5e";
    ctx.beginPath();
    ctx.moveTo(island.x + island.w / 2, island.y - 20);
    ctx.lineTo(island.x + island.w / 2 + 15, island.y - 15);
    ctx.lineTo(island.x + island.w / 2, island.y - 10);
    ctx.fill();
  }

  function drawBird(now) {
    const wing = Math.floor(now / 120) % 2;
    ctx.save();
    ctx.translate(bird.x + bird.width / 2, bird.y + bird.height / 2);
    ctx.rotate(-Math.max(-20, Math.min(65, bird.vy * 6)) * Math.PI / 180);
    ctx.fillStyle = "#138f89";
    ctx.beginPath();
    ctx.moveTo(-12, -1);
    ctx.lineTo(-21, -8);
    ctx.lineTo(-19, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#18bea9";
    ctx.beginPath();
    ctx.ellipse(-1, 0, 15, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffda70";
    ctx.beginPath();
    ctx.ellipse(4, 7, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5b5bbe";
    ctx.beginPath();
    ctx.moveTo(-4, 1);
    ctx.lineTo(-9, wing ? -12 : 9);
    ctx.lineTo(3, wing ? -9 : 11);
    ctx.lineTo(8, 1);
    ctx.fill();
    ctx.fillStyle = "#ff8b49";
    ctx.beginPath();
    ctx.moveTo(11, -3);
    ctx.lineTo(21, 0);
    ctx.lineTo(11, 3);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(6, -5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#232c40";
    ctx.beginPath();
    ctx.arc(7, -5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (let index = 0; index < cargo; index += 1) {
      const x = bird.x + bird.width - 5 + (index % 3) * 7;
      const y = bird.y + bird.height - 3 + Math.floor(index / 3) * 7;
      roundedRect(x, y, 8, 8, 2, "#ffbe5e");
    }
  }

  function drawHud() {
    roundedRect(12, 12, WIDTH - 24, 76, 18, "rgba(14,37,55,.90)", "#5ee0c7");
    ctx.fillStyle = "#a8dade";
    ctx.font = "bold 15px Arial";
    ctx.fillText("ROUTE SCORE", 28, 35);
    ctx.fillText("DELIVERED", 198, 35);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 34px Arial";
    ctx.fillText(String(score), 27, 71);
    ctx.fillStyle = "#ffdd82";
    ctx.font = "bold 25px Arial";
    ctx.fillText(String(deliveries), 198, 70);
    ctx.fillStyle = "#a8dade";
    ctx.font = "bold 14px Arial";
    ctx.fillText(`CARGO ${cargo}/${CARGO_CAPACITY}`, 270, 54);

    roundedRect(12, HEIGHT - 94, WIDTH - 24, 82, 16, "rgba(14,37,55,.94)", "#5ee0c7");
    const gust = windDirection < 0 ? "WIND: UP" : windDirection > 0 ? "WIND: DOWN" : "WIND: CALM";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("SPACE / UP: FLAP", WIDTH / 2, HEIGHT - 65);
    ctx.fillText("HOLD SPACE / X: GLIDE", WIDTH / 2, HEIGHT - 40);
    ctx.fillStyle = windDirection === 0 ? "#d7e9ed" : "#ffdd82";
    ctx.fillText(`${gust}   CARGO ${cargo}/${CARGO_CAPACITY}`, WIDTH / 2, HEIGHT - 16);
    ctx.textAlign = "left";
  }

  function drawBoard(x, y, limit, title) {
    ctx.fillStyle = "#a8dade";
    ctx.font = "bold 16px Arial";
    ctx.fillText(title, x, y);
    ctx.font = "15px Arial";
    if (!leaderboard.length) {
      ctx.fillStyle = "#fff";
      ctx.fillText("No scores yet - be the first!", x, y + 29);
      return;
    }
    leaderboard.slice(0, limit).forEach((entry, index) => {
      const currentEntry = onlineLeaderboardEnabled
        ? currentUser && entry.userId === currentUser.id
        : entry.name.toLocaleLowerCase() === playerName.toLocaleLowerCase();
      ctx.fillStyle = currentEntry ? "#ffdd82" : "#fff";
      ctx.fillText(`${String(index + 1).padStart(2, " ")}. ${entry.name}`, x, y + 21 + index * 19);
      ctx.textAlign = "right";
      ctx.fillText(String(entry.score), WIDTH - x, y + 21 + index * 19);
      ctx.textAlign = "left";
    });
  }

  function drawMenu() {
    roundedRect(28, 205, WIDTH - 56, 220, 24, "rgba(18,48,65,.95)", "#5ee0c7");
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffdd82";
    ctx.font = "bold 30px Arial";
    ctx.fillText("SKY COURIER", WIDTH / 2, 261);
    ctx.fillStyle = "#fff";
    ctx.font = "17px Arial";
    ctx.fillText("Collect parcels, dodge storms, and deliver.", WIDTH / 2, 302);
    ctx.fillStyle = "#ffdd82";
    ctx.fillText(`${difficulty.name}  |  WIND: ${difficulty.windName}`, WIDTH / 2, 346);
    ctx.fillStyle = "#82ebd5";
    ctx.font = "bold 19px Arial";
    ctx.fillText("PRESS ENTER OR TAP START", WIDTH / 2, 390);
    ctx.textAlign = "left";
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(9,24,39,.68)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    roundedRect(18, 78, WIDTH - 36, 484, 24, "#123041", "#5ee0c7");
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffdd82";
    ctx.font = "bold 28px Arial";
    ctx.fillText(state === "record" ? "ROUTE COMPLETE!"
      : runNewBest ? "NEW PERSONAL BEST!" : "ROUTE ENDED", WIDTH / 2, 124);
    ctx.fillStyle = "#fff";
    ctx.font = "18px Arial";
    ctx.fillText(`Score ${score}   Best ${best}   Delivered ${deliveries}`, WIDTH / 2, 158);
    ctx.textAlign = "left";
    const levelName = DIFFICULTIES.find((level) =>
      level.key === selectedLeaderboardDifficulty).name.toUpperCase();
    drawBoard(44, 220, 10, `${onlineLeaderboardEnabled ? "ONLINE " : ""}${levelName} TOP 10`);
    ctx.textAlign = "center";
    ctx.fillStyle = "#d7e9ed";
    ctx.font = "13px Arial";
    ctx.fillText(leaderboardMessage, WIDTH / 2, 450, WIDTH - 48);
    ctx.fillStyle = "#82ebd5";
    ctx.font = "bold 15px Arial";
    ctx.fillText(state === "record" ? "ENTER YOUR NAME BELOW"
      : failedScore ? "PRESS SPACE OR TAP TO RETRY SCORE"
        : scoreRequestInFlight ? "SAVING SCORE..." : "PRESS SPACE OR TAP TO TRY AGAIN", WIDTH / 2, 520);
    ctx.textAlign = "left";
  }

  function draw(now) {
    drawBackground();
    winds.forEach(drawWind);
    hazards.forEach(drawHazard);
    islands.forEach(drawIsland);
    for (const parcel of parcels) {
      roundedRect(parcel.x, parcel.y, parcel.w, parcel.h, 4, "#ffbe5e");
      ctx.strokeStyle = "#fff0bf";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(parcel.x + parcel.w / 2, parcel.y);
      ctx.lineTo(parcel.x + parcel.w / 2, parcel.y + parcel.h);
      ctx.moveTo(parcel.x, parcel.y + parcel.h / 2);
      ctx.lineTo(parcel.x + parcel.w, parcel.y + parcel.h / 2);
      ctx.stroke();
    }
    drawBird(now);
    drawHud();

    if (message && now < messageUntil && state === "playing") {
      roundedRect(15, 101, WIDTH - 30, 48, 14, "#123041", "#ffdd82");
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px Arial";
      ctx.fillText(message, WIDTH / 2, 131);
      ctx.textAlign = "left";
    }
    if (state === "menu") drawMenu();
    if (state === "record" || state === "over") drawGameOver();
  }

  function frame(now) {
    const delta = lastFrame ? now - lastFrame : 1000 / 60;
    lastFrame = now;
    update(delta, now);
    draw(now);
    requestAnimationFrame(frame);
  }

  function activateAction() {
    if (scoreRequestInFlight) return;
    if (state === "menu") {
      startRun();
    } else if (state === "playing") {
      bird.vy = difficulty.flap;
      chirp();
    } else if (state === "over") {
      if (failedScore) submitOnlineScore(failedScore.runId, failedScore.score);
      else startRun();
    }
  }

  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
    }
    if (state === "menu" && event.code === "ArrowLeft") {
      applyDifficulty(difficultyIndex - 1);
      newWorld();
    } else if (state === "menu" && event.code === "ArrowRight") {
      applyDifficulty(difficultyIndex + 1);
      newWorld();
    } else if (state === "menu" && event.code === "Enter") {
      startRun();
    } else if (state === "record") {
      if (event.code === "Escape") {
        state = "over";
        nameForm.hidden = true;
        updateControls();
      }
    } else if (state === "playing" && ["Space", "ArrowUp", "KeyX"].includes(event.code)) {
      if (!event.repeat) {
        bird.vy = difficulty.flap;
        chirp();
      }
      spaceHeld = event.code === "Space" || event.code === "KeyX";
    } else if (state === "over" && ["Space", "Enter"].includes(event.code)) {
      activateAction();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (["Space", "ArrowUp", "KeyX"].includes(event.code)) spaceHeld = false;
  });

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (state === "menu" || state === "over") {
      activateAction();
    } else if (state === "playing") {
      bird.vy = difficulty.flap;
      pointerHeld = true;
      chirp();
    }
  });
  window.addEventListener("pointerup", () => {
    pointerHeld = false;
  });

  actionButton.addEventListener("click", activateAction);
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!onlineLeaderboardEnabled) return;
    const submitter = event.submitter;
    const action = submitter ? submitter.value : "login";
    const email = authEmail.value.trim();
    const password = authPassword.value;
    const displayName = displayNameInput.value.trim().slice(0, 12);
    const submitButtons = [...authForm.querySelectorAll('button[type="submit"]')];
    submitButtons.forEach((button) => { button.disabled = true; });
    setAuthStatus(action === "signup" ? "Creating your account..." : "Logging in...");
    try {
      if (action === "signup") {
        if (!displayName) throw new Error("Choose a display name to create an account.");
        const payload = await authRequest("signup", {
          body: {
            email,
            password,
            data: { display_name: displayName },
          },
        });
        if (!payload || !payload.access_token) {
          setAuthStatus("Account created. Check your email to confirm it, then log in.");
          return;
        }
        await applyAuthSession(payload, displayName);
        setAuthStatus("");
      } else {
        const payload = await authRequest("token?grant_type=password", {
          body: { email, password },
        });
        await applyAuthSession(payload, displayName);
        setAuthStatus("");
      }
    } catch (error) {
      console.error("Could not complete the account request.", error);
      setAuthStatus(error.message || "Could not complete the account request.");
    } finally {
      submitButtons.forEach((button) => { button.disabled = false; });
    }
  });
  logoutButton.addEventListener("click", async () => {
    const accessToken = authSession && authSession.access_token;
    clearAuthSession();
    setAuthStatus("Logged out.");
    if (!accessToken) return;
    try {
      await authRequest("logout", { accessToken });
    } catch (error) {
      console.error("Could not revoke the remote sign-in session.", error);
      setAuthStatus("Logged out on this device, but the remote session could not be revoked.");
    }
  });
  historyDetails.addEventListener("toggle", () => {
    if (historyDetails.open) loadAttemptHistory();
  });
  leaderboardTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectLeaderboardDifficulty(button.dataset.leaderboardLevel);
    });
    button.addEventListener("keydown", (event) => {
      if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.code === "ArrowRight" ? 1 : -1;
      const currentIndex = leaderboardTabButtons.indexOf(button);
      const nextIndex = (currentIndex + direction + leaderboardTabButtons.length)
        % leaderboardTabButtons.length;
      const nextButton = leaderboardTabButtons[nextIndex];
      selectLeaderboardDifficulty(nextButton.dataset.leaderboardLevel);
      nextButton.focus();
    });
  });
  difficultyButton.addEventListener("click", () => {
    if (state !== "menu") return;
    applyDifficulty(difficultyIndex + 1);
    newWorld();
  });

  nameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    playerName = nameInput.value.trim().slice(0, 12);
    if (!playerName) {
      nameInput.focus();
      return;
    }
    const submitButton = nameForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const result = await saveLeaderboard(playerName);
      if (result === "saved") {
        state = "over";
        nameForm.hidden = true;
        updateControls();
      } else {
        nameInput.setCustomValidity("Could not save the score. Try again.");
        nameInput.reportValidity();
        nameInput.setCustomValidity("");
      }
    } finally {
      submitButton.disabled = false;
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Offline support could not be enabled.", error);
    });
  }

  applyDifficulty(difficultyIndex);
  updateControls();
  newWorld();
  if (onlineLeaderboardEnabled) {
    authPanel.hidden = false;
    gameShell.hidden = true;
    restoreAuthSession().catch((error) => {
      console.error("Could not restore the saved sign-in session.", error);
      clearAuthSession();
      setAuthStatus(error.message || "Your saved sign-in expired. Log in again.");
    });
  } else {
    authPanel.hidden = true;
    gameShell.hidden = false;
    accountBar.hidden = true;
  }
  actionButton.addEventListener("pointerdown", () => {
    if (state === "playing") pointerHeld = true;
  });
  actionButton.addEventListener("pointerup", () => {
    pointerHeld = false;
  });
  requestAnimationFrame(frame);
})();
