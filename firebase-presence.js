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
  goOnline,
  set,
  update,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAk9fMAWy6AS4o2s5n5zSJj0M0GlJoyIWE",
  authDomain: "new-tab-2-d6042.firebaseapp.com",
  databaseURL: "https://new-tab-2-d6042-default-rtdb.firebaseio.com",
  projectId: "new-tab-2-d6042",
  storageBucket: "new-tab-2-d6042.firebasestorage.app",
  messagingSenderId: "347559506222",
  appId: "1:347559506222:web:e854997d9048686b988abf"
};

// Change these names whenever you want different random usernames.
const RANDOM_USERNAMES = [
  "PixelPilot",
  "StudySpark",
  "NovaNote",
  "QuizRunner",
  "EchoByte"
];

const CHAT_ROOMS = {
  elementary: "Elementary School",
  middle: "Middle School",
  high: "High School"
};

const SESSION_ID_KEY = "game_hoster_session_id";
const CHAT_USER_ID_KEY = "site_chat_user_id";
const CHAT_NAME_KEY = "site_chat_random_name";
const CHAT_ROOM_KEY = "site_chat_room";
const CHAT_MESSAGE_LIMIT = 40;
const MAX_MESSAGE_LENGTH = 180;
const MAX_NAME_LENGTH = 24;
const PRESENCE_HEARTBEAT_MS = 30 * 1000;
const PRESENCE_STALE_MS = 2 * 60 * 1000;
const PRESENCE_CLEANUP_INTERVAL_MS = 60 * 1000;

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const SESSION_ID = getSessionId();
const CHAT_USER_ID = getPersistentId();
const CHAT_NAME = getSavedChatName();

let activeGameId = null;
let activePresenceRef = null;
let activeDisconnectRef = null;
let unsubscribeCounts = null;
let unsubscribeChat = null;
let isOnline = false;
let isChatOpen = false;
let hasLoadedChat = false;
let activeChatRoomId = getSavedRoomId();
let presenceHeartbeatTimer = null;
let presenceCleanupTimer = null;
let lastPresenceCleanupAt = 0;
const seenChatMessages = new Set();

const chatToggle = document.getElementById("chatToggle");
const chatActiveUsers = document.getElementById("chatActiveUsers");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

function getRandomId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Date.now() + "-" + Math.random().toString(16).slice(2);
}

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = getRandomId();
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

function getPersistentId() {
  let id = localStorage.getItem(CHAT_USER_ID_KEY);
  if (!id) {
    id = getRandomId();
    localStorage.setItem(CHAT_USER_ID_KEY, id);
  }
  return id;
}

function getSavedChatName() {
  let name = cleanName(localStorage.getItem(CHAT_NAME_KEY));
  if (!name) {
    name = RANDOM_USERNAMES[Math.floor(Math.random() * RANDOM_USERNAMES.length)] || "Guest";
    localStorage.setItem(CHAT_NAME_KEY, name);
  }
  return name;
}

function getSavedRoomId() {
  const roomId = localStorage.getItem(CHAT_ROOM_KEY);
  return CHAT_ROOMS[roomId] ? roomId : "elementary";
}

function gameIdFromName(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "game";
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
  if (gameId === activeGameId) return;
  clearActivePresence({ cancelDisconnect: true });
  connectDatabase();
  activeGameId = gameId;
  activePresenceRef = ref(database, `gamePresence/${gameId}/players/${SESSION_ID}`);
  activeDisconnectRef = onDisconnect(activePresenceRef);
  activeDisconnectRef.remove().catch(console.error);
  const now = Date.now();
  set(activePresenceRef, { game: name, joinedAt: now, lastSeenAt: now })
    .then(() => startPresenceHeartbeat())
    .catch(console.error);
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  presenceHeartbeatTimer = setInterval(() => {
    if (!activePresenceRef) return;
    update(activePresenceRef, { lastSeenAt: Date.now() }).catch(console.error);
  }, PRESENCE_HEARTBEAT_MS);
}

function stopPresenceHeartbeat() {
  if (!presenceHeartbeatTimer) return;
  clearInterval(presenceHeartbeatTimer);
  presenceHeartbeatTimer = null;
}

function clearActivePresence({ cancelDisconnect = false } = {}) {
  stopPresenceHeartbeat();
  if (activeDisconnectRef && cancelDisconnect) activeDisconnectRef.cancel().catch(console.error);
  if (activePresenceRef) {
    remove(activePresenceRef).catch(console.error);
    activePresenceRef = null;
  }
  activeDisconnectRef = null;
  activeGameId = null;
}

function cleanupStalePresence() {
  const now = Date.now();
  if (now - lastPresenceCleanupAt < PRESENCE_CLEANUP_INTERVAL_MS) return;
  lastPresenceCleanupAt = now;
  get(ref(database, "gamePresence")).then((snapshot) => {
    if (!snapshot.exists()) return;
    const cutoff = Date.now() - PRESENCE_STALE_MS;
    const removals = [];
    snapshot.forEach((gameSnapshot) => {
      gameSnapshot.child("players").forEach((playerSnapshot) => {
        const player = playerSnapshot.val();
        if (player && Number(player.lastSeenAt || 0) < cutoff) {
          removals.push(remove(playerSnapshot.ref).catch(console.error));
        }
      });
    });
    return Promise.all(removals);
  }).catch(console.error);
}

function watchGameCounts() {
  if (unsubscribeCounts) return;
  connectDatabase();
  startPresenceCleanupTimer();
  unsubscribeCounts = onValue(ref(database, "gamePresence"), (snapshot) => {
    const counts = {};
    let totalPlayers = 0;
    cleanupStalePresence();
    snapshot.forEach((gameSnapshot) => {
      let playerCount = 0;
      gameSnapshot.child("players").forEach((playerSnapshot) => {
        const data = playerSnapshot.val();
        const cutoff = Date.now() - PRESENCE_STALE_MS;
        if (data && Number(data.lastSeenAt || 0) >= cutoff) playerCount++;
      });
      counts[gameSnapshot.key] = playerCount;
      totalPlayers += playerCount;
    });
    updateActiveUsers(totalPlayers);
    document.querySelectorAll("[data-player-count-for]").forEach((badge) => {
      const gameId = gameIdFromName(badge.dataset.playerCountFor);
      const playerCount = counts[gameId] || 0;
      badge.textContent = playerCount > 0 ? playerCount : "";
      badge.classList.toggle("has-players", playerCount > 0);
      badge.title = playerCount > 0 ? `${playerCount} player${playerCount === 1 ? "" : "s"} online` : "No players online";
    });
  }, (error) => {
    console.warn("Firebase player counts failed:", error);
    updateActiveUsers(0);
  });
}

function startPresenceCleanupTimer() {
  if (presenceCleanupTimer) return;
  presenceCleanupTimer = setInterval(cleanupStalePresence, PRESENCE_CLEANUP_INTERVAL_MS);
}

function updateActiveUsers(totalPlayers) {
  if (!chatActiveUsers) return;
  chatActiveUsers.textContent = `${totalPlayers} active`;
  chatActiveUsers.title = `${totalPlayers} active user${totalPlayers === 1 ? "" : "s"} across games`;
  document.dispatchEvent(new CustomEvent("siteActiveUsersChanged", { detail: { total: totalPlayers } }));
}

function setupChat() {
  if (!chatForm || !chatInput) return;
  announceIdentity();
  watchChatMessages(activeChatRoomId);

  document.addEventListener("siteChatToggled", (event) => {
    isChatOpen = Boolean(event.detail?.open);
    if (isChatOpen) chatToggle?.classList.remove("has-unread");
  });

  document.addEventListener("siteChatRoomChanged", (event) => {
    const roomId = cleanRoomId(event.detail?.roomId);
    if (!roomId || roomId === activeChatRoomId) return;
    activeChatRoomId = roomId;
    localStorage.setItem(CHAT_ROOM_KEY, roomId);
    document.dispatchEvent(new CustomEvent("siteChatRoomSynced", { detail: { roomId, room: roomLabel(roomId) } }));
    watchChatMessages(roomId);
  });

  document.addEventListener("siteChatSubmit", () => sendChatMessage());

  chatForm.addEventListener("submit", (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    sendChatMessage();
  });
}

function announceIdentity() {
  document.dispatchEvent(new CustomEvent("siteChatIdentityChanged", {
    detail: { uid: CHAT_USER_ID, name: CHAT_NAME, roomId: activeChatRoomId, room: roomLabel(activeChatRoomId) }
  }));
}

function watchChatMessages(roomId) {
  clearChatSubscription();
  const safeRoomId = cleanRoomId(roomId);
  if (!safeRoomId || !chatMessages) return;
  activeChatRoomId = safeRoomId;
  seenChatMessages.clear();
  hasLoadedChat = false;
  chatMessages.innerHTML = '<div class="chat-empty">Loading ' + roomLabel(safeRoomId) + '...</div>';

  const messagesRef = query(
    ref(database, `siteChat/rooms/${safeRoomId}/messages`),
    orderByChild("createdAt"),
    limitToLast(CHAT_MESSAGE_LIMIT)
  );

  unsubscribeChat = onValue(messagesRef, (snapshot) => {
    chatMessages.innerHTML = "";
    if (!snapshot.exists()) {
      chatMessages.innerHTML = '<div class="chat-empty">No messages in this room yet.</div>';
      hasLoadedChat = true;
      return;
    }
    snapshot.forEach((messageSnapshot) => {
      const key = messageSnapshot.key;
      const message = messageSnapshot.val();
      renderMessage(key, message);
      maybeNotifyChatMessage(key, message, safeRoomId);
    });
    hasLoadedChat = true;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, (error) => {
    console.warn("Firebase chat read failed:", error);
    showChatStatus("Chat could not load. Check the Firebase database rules for this room.");
  });
}

function clearChatSubscription() {
  if (!unsubscribeChat) return;
  unsubscribeChat();
  unsubscribeChat = null;
}

function renderMessage(key, message) {
  if (!chatMessages || !message) return;
  const item = document.createElement("div");
  item.className = "chat-message";
  if (message.uid === CHAT_USER_ID || message.sid === SESSION_ID) item.classList.add("own");

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const author = document.createElement("div");
  author.className = "message-author";
  const name = document.createElement("span");
  name.className = "message-name";
  name.textContent = cleanName(message.name) || "Guest";
  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = formatMessageTime(message.createdAt);
  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = cleanMessageText(message.text);

  author.append(name);
  meta.append(author, time);
  item.append(meta, text);
  chatMessages.appendChild(item);
}

function sendChatMessage() {
  const rawText = chatInput.value.trim();
  if (!rawText) return;
  const roomId = cleanRoomId(activeChatRoomId);
  if (!roomId) return;
  const text = cleanMessageText(rawText);
  if (!text) return;
  chatInput.value = "";

  push(ref(database, `siteChat/rooms/${roomId}/messages`), {
    uid: CHAT_USER_ID,
    sid: SESSION_ID,
    name: CHAT_NAME,
    text,
    room: roomId,
    createdAt: Date.now()
  }).catch((error) => {
    console.warn("Firebase chat write failed:", error);
    showChatStatus("Message was not sent. Check the Firebase database rules for this room.");
  });
}

function maybeNotifyChatMessage(key, message, roomId) {
  if (!key || seenChatMessages.has(key)) return;
  seenChatMessages.add(key);
  if (!hasLoadedChat || isChatOpen || message?.uid === CHAT_USER_ID) return;
  document.dispatchEvent(new CustomEvent("siteChatNewMessage"));
  document.dispatchEvent(new CustomEvent("siteChatNotify", {
    detail: { name: cleanName(message.name) || "Guest", text: cleanMessageText(message.text), room: roomLabel(roomId), roomId }
  }));
}

function showChatStatus(message) {
  if (!chatMessages) return;
  chatMessages.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "chat-empty";
  empty.textContent = message;
  chatMessages.appendChild(empty);
}

function cleanRoomId(value) {
  const roomId = String(value || "").trim();
  return CHAT_ROOMS[roomId] ? roomId : "";
}

function roomLabel(roomId) {
  return CHAT_ROOMS[roomId] || "Chat";
}

function cleanMessageText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

function formatMessageTime(timestamp) {
  if (!timestamp) return "now";
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

window.addEventListener("beforeunload", () => clearActivePresence());

window.gamePresence = { setActiveGame, disconnect: disconnectDatabase };

watchGameCounts();
setupChat();
