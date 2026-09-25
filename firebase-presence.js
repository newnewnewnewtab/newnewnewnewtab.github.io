import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  onDisconnect,
  set,
  push,
  get,
  remove,
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

// ---------- Username generation ----------
// Names are built on the fly as Verb(+separator+)Noun(+number 1-99), e.g.
// "BlazeFalcon42", "Drift-Comet7", "Surge_Wolf88". With 100 verbs, 200 nouns,
// 3 separator styles and 99 numbers, that's nearly 6 million combinations,
// so collisions between two people online at once are effectively a
// non-issue (the old fixed list of ~250 names collided constantly).
const USERNAME_VERBS = [
  "Dashing","Sprinting","Blazing","Storming","Drifting","Surging","Charging","Striking","Flashing","Gliding",
  "Vaulting","Blitzing","Rushing","Soaring","Diving","Climbing","Roaming","Wandering","Chasing","Hunting",
  "Stalking","Prowling","Lurking","Creeping","Sneaking","Dodging","Ducking","Leaping","Jumping","Bounding",
  "Springing","Flipping","Spinning","Twisting","Rolling","Tumbling","Sliding","Skidding","Coasting","Cruising",
  "Zooming","Racing","Bolting","Darting","Fleeing","Breaking","Crashing","Smashing","Slamming","Crushing",
  "Shattering","Blasting","Booming","Igniting","Sparking","Flaring","Glowing","Shining","Gleaming","Shimmering",
  "Sparkling","Flickering","Pulsing","Throbbing","Echoing","Whispering","Shouting","Roaring","Growling","Snarling",
  "Howling","Wailing","Chanting","Humming","Buzzing","Hovering","Floating","Flying","Riding","Steering",
  "Piloting","Guiding","Leading","Tracking","Tracing","Scanning","Seeking","Probing","Exploring","Discovering",
  "Unlocking","Forging","Crafting","Building","Shaping","Carving","Weaving","Binding","Summoning","Conjuring"
];

const USERNAME_NOUNS = [
  // Animals
  "Wolf","Fox","Hawk","Falcon","Eagle","Tiger","Lion","Panther","Jaguar","Cobra",
  "Viper","Raven","Owl","Bear","Lynx","Puma","Cheetah","Leopard","Bison","Stallion",
  "Mustang","Shark","Orca","Dolphin","Heron","Osprey","Kestrel","Badger","Wolverine","Otter",
  "Scorpion","Mantis","Hornet","Wasp","Spider","Serpent","Python","Condor","Vulture","Stingray",
  // Nature & elements
  "Storm","Thunder","Lightning","Blaze","Flame","Ember","Frost","Ice","Glacier","Blizzard",
  "Cyclone","Tornado","Hurricane","Tempest","Monsoon","Tide","Wave","Current","River","Cascade",
  "Waterfall","Canyon","Cliff","Summit","Peak","Ridge","Valley","Meadow","Forest","Jungle",
  "Desert","Dune","Oasis","Mist","Fog","Cloud","Horizon","Aurora","Eclipse","Sunrise",
  // Space & cosmic
  "Comet","Meteor","Nebula","Galaxy","Nova","Supernova","Quasar","Pulsar","Asteroid","Orbit",
  "Satellite","Cosmos","Star","Starlight","Moonlight","Meteorite","Vortex","Void","Portal","Dimension",
  "Photon","Quantum","Plasma","Ion","Gravity","Singularity","Blackhole","Constellation","Zenith","Solstice",
  // Fantasy & mythical
  "Phoenix","Dragon","Griffin","Wraith","Specter","Phantom","Shadow","Spirit","Ghost","Demon",
  "Titan","Golem","Sphinx","Hydra","Chimera","Kraken","Basilisk","Wyvern","Behemoth","Leviathan",
  "Oracle","Sorcerer","Wizard","Warlock","Paladin","Knight","Templar","Ranger","Rogue","Assassin",
  // Objects & weapons
  "Blade","Sword","Dagger","Arrow","Bow","Spear","Shield","Hammer","Axe","Katana",
  "Saber","Lance","Cannon","Rifle","Pistol","Bullet","Rocket","Missile","Bomb","Grenade",
  "Armor","Helmet","Gauntlet","Talisman","Amulet","Relic","Rune","Compass","Anchor","Beacon",
  // Abstract & misc
  "Legend","Legacy","Destiny","Fate","Fortune","Glory","Honor","Valor","Victory","Triumph",
  "Champion","Warrior","Hero","Outlaw","Renegade","Maverick","Nomad","Drifter","Wanderer","Voyager",
  "Pioneer","Pathfinder","Vanguard","Sentinel","Guardian","Watcher","Hunter","Stalker","Reaper","Nightfall"
];

const USERNAME_SEPARATORS = ["", "-", "_"];

const GENERATED_USERNAME_PATTERN = /^[A-Z][a-z]+[-_]?[A-Z][a-z]+[1-9][0-9]?$/;

function isGeneratedUsername(name) {
  return GENERATED_USERNAME_PATTERN.test(name);
}

function capitalizeWord(word) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function generateUsername() {
  const verb = capitalizeWord(pickRandom(USERNAME_VERBS));
  const noun = capitalizeWord(pickRandom(USERNAME_NOUNS));
  const separator = pickRandom(USERNAME_SEPARATORS);
  const number = 1 + Math.floor(Math.random() * 99);
  return `${verb}${separator}${noun}${number}`;
}

const CHAT_ROOM_ID = "general";
const CHAT_ROOM_LABEL = "General Chat";

const SESSION_ID_KEY = "game_hoster_session_id";
const CHAT_USER_ID_KEY = "site_chat_user_id";
const CHAT_NAME_KEY = "site_chat_name_v2";
const CHAT_MESSAGE_LIMIT = 150;
const MAX_MESSAGE_LENGTH = 180;
const MAX_NAME_LENGTH = 24;
const CHAT_SEND_COOLDOWN_MS = 4000;
const MAX_STORED_MESSAGES = 200;

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const SESSION_ID = getSessionId();
const CHAT_USER_ID = getPersistentId();
const CHAT_NAME = getSavedChatName();

let currentGameName = null;
let isOnline = false;
let isChatOpen = false;
let hasLoadedChat = false;
let lastChatSendAt = 0;
const seenChatMessages = new Set();

const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatCooldownNotice = document.getElementById("chatCooldownNotice");

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
  const saved = cleanName(localStorage.getItem(CHAT_NAME_KEY));
  if (!saved || !isGeneratedUsername(saved)) {
    const name = generateUsername();
    localStorage.setItem(CHAT_NAME_KEY, name);
    return name;
  }
  return saved;
}

function connectDatabase() {
  if (isOnline) return;
  goOnline(database);
  isOnline = true;
}

function setActiveGame(name) {
  currentGameName = name || null;
}

function setupPresence() {
  const myPresenceRef = ref(database, `presence/${CHAT_USER_ID}`);
  const connectedRef = ref(database, ".info/connected");

  onValue(connectedRef, (snapshot) => {
    if (snapshot.val() !== true) return;
    onDisconnect(myPresenceRef).remove();
    set(myPresenceRef, Date.now());
  });

  onValue(ref(database, "presence"), (snapshot) => {
    const count = snapshot.exists() ? Object.keys(snapshot.val() || {}).length : 0;
    document.dispatchEvent(new CustomEvent("sitePlayersOnline", { detail: { count } }));
  }, (error) => {
    console.warn("Firebase presence read failed:", error);
  });
}

function setupChat() {
  if (!chatForm || !chatInput) return;
  announceIdentity();
  watchChatMessages();

  document.addEventListener("siteChatToggled", (event) => {
    isChatOpen = Boolean(event.detail?.open);
    if (isChatOpen) document.getElementById("chatToggle")?.classList.remove("has-unread");
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
    detail: { uid: CHAT_USER_ID, name: CHAT_NAME, roomId: CHAT_ROOM_ID, room: CHAT_ROOM_LABEL }
  }));
}

function watchChatMessages() {
  if (!chatMessages) return;
  seenChatMessages.clear();
  hasLoadedChat = false;
  chatMessages.innerHTML = '<div class="chat-empty">Loading chat...</div>';

  const messagesRef = query(
    ref(database, `siteChat/rooms/${CHAT_ROOM_ID}/messages`),
    orderByChild("createdAt"),
    limitToLast(CHAT_MESSAGE_LIMIT)
  );

  onValue(messagesRef, (snapshot) => {
    chatMessages.innerHTML = "";
    if (!snapshot.exists()) {
      chatMessages.innerHTML = '<div class="chat-empty">No messages yet. Say hi!</div>';
      hasLoadedChat = true;
      return;
    }
    snapshot.forEach((messageSnapshot) => {
      const key = messageSnapshot.key;
      const message = messageSnapshot.val();
      renderMessage(key, message);
      maybeNotifyChatMessage(key, message);
    });
    hasLoadedChat = true;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, (error) => {
    console.warn("Firebase chat read failed:", error);
    showChatStatus("Chat could not load. Check the Firebase database rules.");
  });
}

function renderMessage(key, message) {
  if (!chatMessages || !message) return;
  const item = document.createElement("div");
  item.className = "chat-message";
  if (message.uid === CHAT_USER_ID || message.sid === SESSION_ID) item.classList.add("own");

  const displayName = cleanName(message.name) || "Guest";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const author = document.createElement("div");
  author.className = "message-author";
  const name = document.createElement("span");
  name.className = "message-name";
  name.textContent = displayName;
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
  bubble.append(meta, text);
  item.append(bubble);
  chatMessages.appendChild(item);
}

function sendChatMessage() {
  const rawText = chatInput.value.trim();
  if (!rawText) return;
  const text = cleanMessageText(rawText);
  if (!text) return;

  const now = Date.now();
  const elapsed = now - lastChatSendAt;
  if (elapsed < CHAT_SEND_COOLDOWN_MS) {
    const secondsLeft = Math.ceil((CHAT_SEND_COOLDOWN_MS - elapsed) / 1000);
    flashChatCooldown(secondsLeft);
    return;
  }
  lastChatSendAt = now;

  chatInput.value = "";

  push(ref(database, `siteChat/rooms/${CHAT_ROOM_ID}/messages`), {
    uid: CHAT_USER_ID,
    sid: SESSION_ID,
    name: CHAT_NAME,
    text,
    room: CHAT_ROOM_ID,
    createdAt: Date.now(),
    ...(currentGameName ? { game: currentGameName } : {})
  }).then(() => {
    trimOldMessages();
  }).catch((error) => {
    console.warn("Firebase chat write failed:", error);
    lastChatSendAt = 0;
    showChatStatus("Message was not sent. Check the Firebase database rules.");
  });
}

// ---------- Storage retention ----------
// Keeps only the newest MAX_STORED_MESSAGES messages in the database. Older
// messages aren't just hidden client-side -- they're actually removed from
// Firebase so the room doesn't grow forever. Every client that sends a
// message triggers this check, so cleanup happens naturally without needing
// a server function. Deleting the same already-gone message twice is
// harmless, so overlapping cleanups from multiple tabs are not a problem.
async function trimOldMessages() {
  try {
    const messagesRef = ref(database, `siteChat/rooms/${CHAT_ROOM_ID}/messages`);
    const snapshot = await get(query(messagesRef, orderByChild("createdAt")));
    if (!snapshot.exists()) return;

    const keysOldestFirst = [];
    snapshot.forEach((child) => {
      keysOldestFirst.push(child.key);
    });

    const excess = keysOldestFirst.length - MAX_STORED_MESSAGES;
    if (excess <= 0) return;

    const keysToDelete = keysOldestFirst.slice(0, excess);
    await Promise.all(
      keysToDelete.map((key) =>
        remove(ref(database, `siteChat/rooms/${CHAT_ROOM_ID}/messages/${key}`)).catch(() => {})
      )
    );
  } catch (error) {
    console.warn("Firebase chat trim failed:", error);
  }
}

// Shows a visible "slow down" notice under the input with a live countdown,
// then clears itself once the cooldown window passes.
function flashChatCooldown(secondsLeft) {
  if (!chatCooldownNotice) return;

  clearInterval(flashChatCooldown._tickTimer);

  let remainingSeconds = secondsLeft;
  const render = () => {
    chatCooldownNotice.textContent = `Slow down — wait ${remainingSeconds}s before sending again`;
  };
  render();
  chatCooldownNotice.classList.add("visible");

  flashChatCooldown._tickTimer = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      clearInterval(flashChatCooldown._tickTimer);
      chatCooldownNotice.classList.remove("visible");
      return;
    }
    render();
  }, 1000);
}

function maybeNotifyChatMessage(key, message) {
  if (!key || seenChatMessages.has(key)) return;
  seenChatMessages.add(key);
  if (!hasLoadedChat || isChatOpen || message?.uid === CHAT_USER_ID) return;
  document.dispatchEvent(new CustomEvent("siteChatNewMessage"));
  document.dispatchEvent(new CustomEvent("siteChatNotify", {
    detail: { name: cleanName(message.name) || "Guest", text: cleanMessageText(message.text), room: CHAT_ROOM_LABEL, roomId: CHAT_ROOM_ID }
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

connectDatabase();
setupPresence();
setupChat();
