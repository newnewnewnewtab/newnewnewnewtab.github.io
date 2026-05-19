import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getDatabase,
  ref,
  get,
  onValue,
  onDisconnect,
  push,
  query,
  limitToLast,
  orderByChild,
  endAt,
  goOffline,
  goOnline,
  set,
  update,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAk9fMAWy6AS4o2s5n5zSJj0M0GlJoyIWE",
  authDomain: "new-tab-2-d6042.firebaseapp.com",
  databaseURL:
    "https://new-tab-2-d6042-default-rtdb.firebaseio.com",
  projectId: "new-tab-2-d6042",
  storageBucket:
    "new-tab-2-d6042.firebasestorage.app",
  messagingSenderId: "347559506222",
  appId:
    "1:347559506222:web:e854997d9048686b988abf"
};

const SESSION_ID_KEY =
  "game_hoster_session_id";

const SESSION_ID = getSessionId();

const CHAT_MESSAGE_LIMIT = 10;

const MAX_MESSAGE_LENGTH = 180;

const CHAT_MESSAGE_TTL_MS =
  6 * 60 * 60 * 1000;

const CHAT_CLEANUP_INTERVAL_MS = 0;

const PRESENCE_HEARTBEAT_MS =
  30 * 1000;

const PRESENCE_STALE_MS =
  2 * 60 * 1000;

const PRESENCE_CLEANUP_INTERVAL_MS =
  60 * 1000;

const CHAT_ENABLED =
  window.CHAT_ENABLED !== false;

const CENSOR_WORDS = [
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "chink",
  "retard",
  "niggers",
  "niggas",
  "faggots",
  "fags",
  "chinks",
  "retards",
  "testcensor"
];

const CENSOR_REPLACEMENTS = [
  "I hope you have a great day! ⁽ᶜᵉⁿˢᵒʳᵉᵈ⁾",
  "I wish your family the best! ⁽ᶜᵉⁿˢᵒʳᵉᵈ⁾",
  "You're a kind and loving person! ⁽ᶜᵉⁿˢᵒʳᵉᵈ⁾",
  "I hope all your pets go unharmed. ⁽ᶜᵉⁿˢᵒʳᵉᵈ⁾",
  "Download the Dairy Queen app and use code Clinga2210! ⁽ᶜᵉⁿˢᵒʳᵉᵈ⁾"
];

const GRADE_GROUPS = {
  "elementary": { grades: ["1", "2", "3", "4", "5"], label: "1st-5th" },
  "middle": { grades: ["6", "7", "8"], label: "6-8th" },
  "high": { grades: ["9", "10", "11", "12"], label: "9-12th" }
};

const app = initializeApp(firebaseConfig);

const database = getDatabase(app);

let activeGameId = null;

let activeGameName = null;

let activePresenceRef = null;

let activeDisconnectRef = null;

let unsubscribeCounts = null;

let unsubscribeChat = null;

let isOnline = false;

let presenceHeartbeatTimer = null;

let lastPresenceCleanupAt = 0;

let lastChatCleanupAt = 0;

let currentUserName = null;

let currentUserGrade = null;

let currentUserGroup = null;

const chatToggle =
  document.getElementById("chatToggle");

const siteChat =
  document.getElementById("siteChat");

const chatMessages =
  document.getElementById("chatMessages");

const chatForm =
  document.getElementById("chatForm");

const chatInput =
  document.getElementById("chatInput");

const chatSend =
  document.getElementById("chatSend");

const chatAuthGate =
  document.getElementById("chatAuthGate");

const authGateTitle =
  document.getElementById("authGateTitle");

const authGateCopy =
  document.getElementById("authGateCopy");

const authForm =
  document.getElementById("authForm");

const authName =
  document.getElementById("authName");

const authSubmit =
  document.getElementById("authSubmit");

const authFeedback =
  document.getElementById("authFeedback");

const chatUserStatus =
  document.getElementById("chatUserStatus");

const chatUserName =
  document.getElementById("chatUserName");

const chatGradeBadge =
  document.getElementById("chatGradeBadge");

const authSignOut =
  document.getElementById("authSignOut");

function getSessionId() {
  let id = sessionStorage.getItem(
    SESSION_ID_KEY
  );

  if (!id) {
    id = createSessionId();

    sessionStorage.setItem(
      SESSION_ID_KEY,
      id
    );
  }

  return id;
}

function createSessionId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return (
    Date.now() +
    "-" +
    Math.random().toString(16).slice(2)
  );
}

function gameIdFromName(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "game"
  );
}

function getGradeGroup(grade) {
  for (const [groupId, groupData] of Object.entries(GRADE_GROUPS)) {
    if (groupData.grades.includes(grade)) {
      return groupId;
    }
  }
  return null;
}

function connectDatabase() {
  if (isOnline) return;

  goOnline(database);

  isOnline = true;
}

function disconnectDatabase() {
  clearActivePresence();
}

function setActiveGame(name) {
  if (!database) return;

  const gameId = gameIdFromName(name);

  activeGameName = name;

  if (gameId === activeGameId) return;

  clearActivePresence({
    cancelDisconnect: true
  });

  connectDatabase();

  activeGameId = gameId;

  activePresenceRef = ref(
    database,
    `gamePresence/${gameId}/players/${SESSION_ID}`
  );

  activeDisconnectRef =
    onDisconnect(activePresenceRef);

  activeDisconnectRef
    .remove()
    .catch(console.error);

  const now = Date.now();

  set(activePresenceRef, {
    game: name,
    joinedAt: now,
    lastSeenAt: now
  })
    .then(() => {
      startPresenceHeartbeat();
    })
    .catch(console.error);
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();

  presenceHeartbeatTimer =
    setInterval(() => {
      if (!activePresenceRef) return;

      update(activePresenceRef, {
        lastSeenAt: Date.now()
      }).catch(console.error);
    }, PRESENCE_HEARTBEAT_MS);
}

function stopPresenceHeartbeat() {
  if (!presenceHeartbeatTimer) return;

  clearInterval(
    presenceHeartbeatTimer
  );

  presenceHeartbeatTimer = null;
}

function clearActivePresence({
  cancelDisconnect = false
} = {}) {
  stopPresenceHeartbeat();

  if (
    activeDisconnectRef &&
    cancelDisconnect
  ) {
    activeDisconnectRef
      .cancel()
      .catch(console.error);
  }

  if (activePresenceRef) {
    remove(activePresenceRef).catch(
      console.error
    );

    activePresenceRef = null;
  }

  activeDisconnectRef = null;

  activeGameId = null;
}

function cleanupStalePresence() {
  const now = Date.now();

  if (
    now - lastPresenceCleanupAt <
    PRESENCE_CLEANUP_INTERVAL_MS
  ) {
    return;
  }

  lastPresenceCleanupAt = now;

  get(ref(database, "gamePresence"))
    .then((snapshot) => {
      if (!snapshot.exists()) return;

      const cutoff =
        Date.now() -
        PRESENCE_STALE_MS;

      const removals = [];

      snapshot.forEach(
        (gameSnapshot) => {
          gameSnapshot
            .child("players")
            .forEach(
              (playerSnapshot) => {
                const player =
                  playerSnapshot.val();

                if (!player) return;

                const lastSeenAt =
                  Number(
                    player.lastSeenAt || 0
                  );

                if (
                  lastSeenAt < cutoff
                ) {
                  removals.push(
                    remove(
                      playerSnapshot.ref
                    ).catch(
                      console.error
                    )
                  );
                }
              }
            );
        }
      );

      return Promise.all(removals);
    })
    .catch(console.error);
}

function watchGameCounts() {
  if (unsubscribeCounts) return;

  connectDatabase();

  const countsRef = ref(
    database,
    "gamePresence"
  );

  unsubscribeCounts = onValue(
    countsRef,
    (snapshot) => {
      const counts = {};

      let totalPlayers = 0;

      cleanupStalePresence();

      snapshot.forEach(
        (gameSnapshot) => {
          let playerCount = 0;

          gameSnapshot
            .child("players")
            .forEach(
              (playerSnapshot) => {
                const data =
                  playerSnapshot.val();

                if (!data) return;

                const cutoff =
                  Date.now() -
                  PRESENCE_STALE_MS;

                const lastSeenAt =
                  Number(
                    data.lastSeenAt || 0
                  );

                if (
                  lastSeenAt >= cutoff
                ) {
                  playerCount++;
                }
              }
            );

          counts[gameSnapshot.key] =
            playerCount;

          totalPlayers += playerCount;
        }
      );

      document
        .querySelectorAll(
          "[data-player-count-for]"
        )
        .forEach((badge) => {
          const gameId =
            gameIdFromName(
              badge.dataset
                .playerCountFor
            );

          const playerCount =
            counts[gameId] || 0;

          badge.textContent =
            playerCount > 0
              ? playerCount
              : "";

          badge.classList.toggle(
            "has-players",
            playerCount > 0
          );

          badge.title =
            playerCount > 0
              ? `${playerCount} player${
                  playerCount === 1
                    ? ""
                    : "s"
                } online`
              : "No players online";
        });
    },
    (error) => {
      console.warn(
        "Firebase player counts failed:",
        error
      );
    }
  );
}

function setupAuth() {
  if (
    !authName ||
    !authSubmit ||
    !authForm
  ) {
    updateChatAuthState(null);
    return;
  }

  authForm.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      submitAuthForm();
    }
  );

  authSignOut?.addEventListener(
    "click",
    () => {
      signOut();
    }
  );

  // Check for existing account in localStorage
  const savedName = localStorage.getItem("chatUserName");
  const savedGrade = localStorage.getItem("chatUserGrade");
  
  if (savedName && savedGrade) {
    loginUser(savedName, savedGrade);
  } else {
    showAuthForm();
  }

  window.firebaseChatAuthReady = true;
}

function showAuthForm() {
  if (authForm) {
    authForm.hidden = false;
  }
  if (chatAuthGate) {
    chatAuthGate.classList.remove("hidden");
  }
  if (authName) {
    authName.focus();
  }
}

function submitAuthForm() {
  const name = authName.value.trim();
  const gradeBtn = document.querySelector(".grade-option.selected");

  if (!name) {
    setAuthFeedback("Enter your name.", "error");
    return;
  }

  if (name.length < 2) {
    setAuthFeedback("Name must be at least 2 characters.", "error");
    return;
  }

  if (!gradeBtn) {
    setAuthFeedback("Select your grade.", "error");
    return;
  }

  const grade = gradeBtn.dataset.grade;

  setAuthFeedback("Creating account...", "loading");
  authSubmit.disabled = true;

  try {
    localStorage.setItem("chatUserName", name);
    localStorage.setItem("chatUserGrade", grade);
    
    loginUser(name, grade);
    
    setAuthFeedback("Account created!", "success");
  } catch (error) {
    setAuthFeedback("Failed to create account.", "error");
    authSubmit.disabled = false;
  }
}

function loginUser(name, grade) {
  currentUserName = name;
  currentUserGrade = grade;
  currentUserGroup = getGradeGroup(grade);
  
  updateChatAuthState(name, grade);
}

function signOut() {
  localStorage.removeItem("chatUserName");
  localStorage.removeItem("chatUserGrade");
  
  currentUserName = null;
  currentUserGrade = null;
  currentUserGroup = null;
  
  updateChatAuthState(null, null);
  showAuthForm();
}

function updateChatAuthState(name, grade) {
  const canChat = Boolean(name && grade);

  window.chatAuthState = {
    canChat,
    name: name || "",
    grade: grade || ""
  };

  if (!CHAT_ENABLED) {
    return;
  }

  if (!canChat) {
    if (chatAuthGate) {
      chatAuthGate.classList.remove("hidden");
    }
    if (authForm) {
      authForm.hidden = false;
    }
  } else {
    if (chatAuthGate) {
      chatAuthGate.classList.add("hidden");
    }
    if (authForm) {
      authForm.hidden = true;
    }
  }

  if (chatUserStatus) {
    chatUserStatus.hidden = !canChat;
  }

  if (chatUserName && canChat) {
    const gradeLabel = Object.values(GRADE_GROUPS).find(g => g.grades.includes(grade))?.label;
    chatUserName.textContent = `${name} (Grade ${grade})`;
  }

  if (chatGradeBadge && canChat) {
    const gradeLabel = Object.values(GRADE_GROUPS).find(g => g.grades.includes(grade))?.label;
    chatGradeBadge.textContent = `${gradeLabel}`;
  }

  if (authSignOut) {
    authSignOut.hidden = !canChat;
  }

  if (chatInput) {
    chatInput.disabled = !canChat;
    chatInput.placeholder = canChat
      ? "Message everyone... "
      : "Create an account to chat";
  }

  if (chatSend) {
    chatSend.disabled = !canChat;
  }

  if (chatMessages) {
    chatMessages.hidden = !canChat;
  }

  if (chatForm) {
    chatForm.hidden = !canChat;
  }

  if (canChat) {
    watchChatMessages();
  }
}

function setAuthFeedback(message, state = "") {
  if (!authFeedback) return;

  authFeedback.textContent = message;
  authFeedback.className =
    `auth-feedback ${state}`.trim();
}

function setupChat() {
  if (
    !chatForm ||
    !chatInput
  ) {
    return;
  }

  chatForm.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      sendChatMessage();
    }
  );
}

function watchChatMessages() {
  if (!CHAT_ENABLED) return;

  if (unsubscribeChat) return;

  if (!currentUserGroup) return;

  lastChatCleanupAt = 0;
  cleanupOldChatMessages();

  const messagesRef = query(
    ref(database, `siteChat/${currentUserGroup}/messages`),
    limitToLast(CHAT_MESSAGE_LIMIT)
  );

  unsubscribeChat = onValue(
    messagesRef,
    (snapshot) => {
      if (!chatMessages) return;

      chatMessages.innerHTML = "";

      if (!snapshot.exists()) {
        chatMessages.innerHTML =
          '<div class="chat-empty">No messages yet.</div>';

        return;
      }

      snapshot.forEach(
        (messageSnapshot) => {
          renderMessage(
            messageSnapshot.key,
            messageSnapshot.val()
          );
        }
      );

      chatMessages.scrollTop =
        chatMessages.scrollHeight;
    }
  );
}

function renderMessage(key, message) {
  if (!chatMessages) return;

  const item =
    document.createElement("div");

  item.className =
    "chat-message";

  if (message.name === currentUserName) {
    item.classList.add("own");
  }

  const meta =
    document.createElement("div");

  meta.className = "message-meta";

  const name =
    document.createElement("span");

  name.className =
    "message-name";

  name.textContent =
    cleanName(message.name) ||
    "Guest";

  const time =
    document.createElement("span");

  time.textContent =
    formatMessageTime(
      message.createdAt
    );

  const text =
    document.createElement("div");

  text.className =
    "message-text";

  text.textContent =
    cleanMessageText(
      message.text
    );

  meta.append(name, time);

  item.append(meta, text);

  chatMessages.appendChild(item);
}

function sendChatMessage() {
  const rawText =
    chatInput.value.trim();

  if (!rawText) return;

  if (
    !currentUserName ||
    !currentUserGrade ||
    !currentUserGroup
  ) {
    updateChatAuthState(null, null);
    return;
  }

  const name =
    cleanName(currentUserName);

  const text =
    applyCensor(rawText);

  chatInput.value = "";

  push(
    ref(database, `siteChat/${currentUserGroup}/messages`),
    {
      name,
      text,
      grade: currentUserGrade,
      sid: SESSION_ID,
      createdAt: Date.now()
    }
  )
    .then(() => {
      lastChatCleanupAt = Date.now() - CHAT_CLEANUP_INTERVAL_MS + 60_000;
      cleanupOldChatMessages();
    })
    .catch((error) => {
      console.error(error);
      chatInput.placeholder =
        "Message failed. Check Firebase database rules.";
      chatInput.value = rawText;
    });
}

async function cleanupOldChatMessages() {
  if (!currentUserGroup) return;

  const now = Date.now();

  if (now - lastChatCleanupAt < CHAT_CLEANUP_INTERVAL_MS) return;

  lastChatCleanupAt = now;

  const messagesRoot = ref(database, `siteChat/${currentUserGroup}/messages`);

  const cutoff = now - CHAT_MESSAGE_TTL_MS;

  const oldQ = query(
    messagesRoot,
    orderByChild("createdAt"),
    endAt(cutoff)
  );

  const oldSnap = await get(oldQ).catch(() => null);

  if (oldSnap?.exists()) {
    const removals = [];

    oldSnap.forEach((s) =>
      removals.push(remove(s.ref).catch(console.error))
    );

    await Promise.all(removals);
  }

  const allSnap = await get(messagesRoot).catch(() => null);

  if (!allSnap?.exists()) return;

  const keys = [];

  allSnap.forEach((s) => keys.push(s.key));

  const toDelete = keys.slice(
    0,
    Math.max(0, keys.length - CHAT_MESSAGE_LIMIT)
  );

  await Promise.all(
    toDelete.map((k) =>
      remove(ref(database, `siteChat/${currentUserGroup}/messages/${k}`)).catch(console.error)
    )
  );
}

function applyCensor(text) {
  const cleaned =
    cleanMessageText(text);

  const hasBlockedWord =
    CENSOR_WORDS.some((word) =>
      new RegExp(
        `\\b${escapeRegExp(
          word
        )}\\b`,
        "i"
      ).test(cleaned)
    );

  if (!hasBlockedWord) {
    return cleaned;
  }

  const randomIndex =
    Math.floor(
      Math.random() *
        CENSOR_REPLACEMENTS.length
    );

  return cleanMessageText(
    CENSOR_REPLACEMENTS[
      randomIndex
    ]
  );
}

function cleanMessageText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function cleanName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function formatMessageTime(
  timestamp
) {
  if (!timestamp) return "now";

  return new Intl.DateTimeFormat(
    [],
    {
      hour: "numeric",
      minute: "2-digit"
    }
  ).format(new Date(timestamp));
}

window.addEventListener(
  "beforeunload",
  () => {
    clearActivePresence();
  }
);

window.gamePresence = {
  setActiveGame,
  disconnect: disconnectDatabase
};

watchGameCounts();

setupAuth();

setupChat();
