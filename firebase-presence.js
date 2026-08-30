import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  push,
  query,
  limitToLast,
  orderByChild,
  goOnline
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

const RANDOM_USERNAMES = [
  "PixelPilot", "StudySpark", "NovaNote", "QuizRunner", "EchoByte", "ShadowVortex", "LunarQuest", "CrimsonFox", "SilentStorm", "FrostNova",
  "BlazeHunter", "CyberRaven", "IronFalcon", "MysticWolf", "RapidBolt", "NeonKnight", "SolarStrike", "CosmicDrift", "GhostArrow", "ThunderPulse",
  "NightGlider", "CrystalEdge", "WildComet", "SkyBreaker", "QuantumLeaf", "AquaPhantom", "StealthFlame", "PixelWizard", "RocketBloom", "StormCrafter",
  "IceRanger", "TurboFalcon", "NovaBlitz", "ShadowPixel", "LavaDrifter", "CloudSeeker", "BrightComet", "FireNimbus", "SteelVoyager", "GoldenFrost",
  "EchoRider", "StarPhantom", "SwiftJaguar", "VoltCrusher", "TurboViper", "FrostTiger", "NightSpark", "CrystalRogue", "SkyVortex", "RapidNova",
  "BlazeDrift", "CyberStorm", "SolarRunner", "IronShadow", "PixelStorm", "StormRaven", "FlameVortex", "NeonDrifter", "EchoKnight", "ShadowRider",
  "QuantumWolf", "SilverPhoenix", "BlueMeteor", "GhostFalcon", "BrightTiger", "WildNova", "SwiftOrbit", "SkyHunter", "MysticBlade", "CrystalFox",
  "LunarBolt", "ThunderWolf", "NovaSpark", "FrozenEcho", "TurboBlaze", "PixelOrbit", "RapidFox", "GoldenStorm", "AquaKnight", "SilentNova",
  "RocketWolf", "SteelArrow", "CosmicTiger", "FireRogue", "ShadowOrbit", "StormBlade", "CyberGlider", "EchoStorm", "VoltRider", "LavaHunter",
  "NightWolf", "CrystalBolt", "IronComet", "SolarTiger", "SwiftBlaze", "NovaFalcon", "GhostRunner", "BlueVortex", "NeonFox", "WildArrow",
  "QuantumSpark", "BrightKnight", "PixelTiger", "FrostVoyager", "ShadowComet", "RapidKnight", "EchoGlider", "SteelVortex", "ThunderRogue", "NightFalcon",
  "MysticSpark", "LunarTiger", "RocketStorm", "GoldenWolf", "BlazeRider", "StormOrbit", "IcePhoenix", "SwiftPhantom", "CyberKnight", "CrystalMeteor",
  "VoltNova", "SkyFox", "SilentArrow", "PixelCrusher", "SolarWolf", "GhostSpark", "WildBlade", "NovaGlider", "RapidMeteor", "EchoFalcon",
  "SteelBlaze", "QuantumRider", "BrightOrbit", "ShadowPhoenix", "FrostComet", "NightBolt", "TurboTiger", "BlueKnight", "StormHunter", "LavaWolf",
  "IronNova", "CrystalRunner", "NeonStorm", "GhostBlade", "SwiftFox", "RocketKnight", "MysticOrbit", "ThunderTiger", "GoldenArrow", "CyberMeteor",
  "SolarRider", "PixelNova", "RapidVortex", "EchoWolf", "NightRogue", "FrostRunner", "ShadowBlaze", "VoltFalcon", "SkyNova", "WildPhantom",
  "SteelSpark", "CrystalHunter", "TurboOrbit", "BlueFox", "NovaPhoenix", "GhostTiger", "IronStorm", "LunarRider", "BrightBlade", "SilentFalcon",
  "RocketSpark", "QuantumKnight", "StormMeteor", "BlazeOrbit", "CyberWolf", "EchoPhoenix", "RapidArrow", "PixelFalcon", "NightMeteor", "SolarComet",
  "ShadowTiger", "VoltOrbit", "WildKnight", "FrozenBlade", "GoldenNova", "SteelFox", "MysticRunner", "ThunderFalcon", "CrystalStorm", "NeonPhoenix",
  "SwiftSpark", "GhostOrbit", "LavaKnight", "SkyTiger", "RocketNova", "EchoBlade", "QuantumFalcon", "RapidStorm", "BlueWolf", "PixelMeteor",
  "NightPhoenix", "ShadowRunner", "FrostKnight", "VoltTiger", "IronOrbit", "CrystalPhoenix", "SolarFox", "TurboStorm", "WildSpark", "GoldenFalcon",
  "CyberNova", "BlazeMeteor", "SilentTiger", "RocketFalcon", "BrightWolf", "EchoComet", "MysticNova", "ThunderOrbit", "PixelPhoenix", "RapidSpark",
  "StormFox", "GhostNova", "QuantumMeteor", "CrystalKnight", "SkyPhoenix", "LunarStorm", "FrozenFalcon", "SteelNova", "NightOrbit", "NeonMeteor",
  "SwiftWolf", "GoldenSpark", "ShadowMeteor", "TurboKnight", "BlueStorm", "SolarPhoenix", "WildFalcon", "EchoNova", "IronTiger", "VoltPhoenix",
  "RocketMeteor", "PixelWolf", "GhostStorm", "BrightNova", "CyberFalcon", "CrystalOrbit", "NightSparkle", "QuantumPhoenix", "StormNova", "FrozenWolf",
  "SkyMeteor", "RapidFalcon", "MysticStorm", "LunarPhoenix", "SteelTiger", "ThunderNova", "ShadowWolf", "GoldenMeteor", "NeonOrbit", "SwiftNova",
  "PixelComet", "EchoTiger", "GhostPhoenix", "BlueNova", "RocketOrbit"
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

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const SESSION_ID = getSessionId();
const CHAT_USER_ID = getPersistentId();
const CHAT_NAME = getSavedChatName();

let currentGameName = null;
let unsubscribeChat = null;
let isOnline = false;
let isChatOpen = false;
let hasLoadedChat = false;
let activeChatRoomId = getSavedRoomId();
const seenChatMessages = new Set();

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

function connectDatabase() {
  if (isOnline) return;
  goOnline(database);
  isOnline = true;
}

// Tracks which game the player currently has open so outgoing chat messages
// can be tagged with it. This is purely local state now -- it no longer
// writes anything to Firebase (the old live player-count/presence system
// has been removed).
function setActiveGame(name) {
  currentGameName = name || null;
}

function setupChat() {
  if (!chatForm || !chatInput) return;
  connectDatabase();
  announceIdentity();
  watchChatMessages(activeChatRoomId);

  document.addEventListener("siteChatToggled", (event) => {
    isChatOpen = Boolean(event.detail?.open);
    if (isChatOpen) document.getElementById("chatToggle")?.classList.remove("has-unread");
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
  time.title = formatMessageTimeFull(message.createdAt);
  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = cleanMessageText(message.text);

  author.append(name);
  const gameName = cleanName(message.game);
  if (gameName) {
    const gameTag = document.createElement("button");
    gameTag.type = "button";
    gameTag.className = "message-game-tag";
    gameTag.textContent = gameName;
    gameTag.title = "Switch to " + gameName;
    gameTag.addEventListener("click", () => {
      if (typeof window.switchToGame === "function") window.switchToGame(gameName);
    });
    author.append(gameTag);
  }
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
    createdAt: Date.now(),
    ...(currentGameName ? { game: currentGameName } : {})
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
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(date);
  if (isToday) return time;
  if (isYesterday) return "Yesterday " + time;
  const sameYear = date.getFullYear() === now.getFullYear();
  const day = new Intl.DateTimeFormat([], sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(date);
  return day + ", " + time;
}

function formatMessageTimeFull(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat([], { dateStyle: "full", timeStyle: "short" }).format(new Date(timestamp));
}

window.gamePresence = { setActiveGame };

setupChat();
