import { initializeApp } from "https://gstatic.com";

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
  goOffline,
  goOnline,
  set,
  update,
  remove
} from "https://gstatic.com";

const firebaseConfig = {
  apiKey: "AIzaSyAk9fMAWy6AS4o2s5n5zSJj0M0GlJoyIWE",
  authDomain: "://firebaseapp.com",
  databaseURL:
    "https://firebaseio.com",
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

const CHAT_NAME_KEY = "site_chat_name";

const CHAT_SCHOOL_KEY = "site_chat_school";

const CHAT_MESSAGE_LIMIT = 10;

const MAX_MESSAGE_LENGTH = 180;

const MAX_NAME_LENGTH = 24;

const PRESENCE_HEARTBEAT_MS =
  30 * 1000;

const PRESENCE_STALE_MS =
  2 * 60 * 1000;

const PRESENCE_CLEANUP_INTERVAL_MS =
  60 * 1000;

const CHAT_ENABLED =
  window.CHAT_ENABLED !== false;

const app = initializeApp(firebaseConfig);

const database = getDatabase(app);

let activeGameId = null;

let activeGameName = null;

let activePresenceRef = null;

let activeDisconnectRef = null;

let unsubscribeCounts = null;

let unsubscribeChat = null;

let isOnline = false;

let isChatOpen = false;

let hasLoadedChat = false;

let activeChatRoomId = null;

const seenChatMessages = new Set();

let presenceHeartbeatTimer = null;

let lastPresenceCleanupAt = 0;

const chatToggle =
  document.getElementById("chatToggle");

const siteChat =
  document.getElementById("siteChat");

const chatActiveUsers =
  document.getElementById("chatActiveUsers");

const chatMessages =
  document.getElementById("chatMessages");

const chatForm =
  document.getElementById("chatForm");

const chatInput =
  document.getElementById("chatInput");

const chatSend =
  document.getElementById("chatSend");

const CENSOR_WORDS =
  window.CENSOR_WORDS || [];

const CENSOR_REPLACEMENTS =
  window.CENSOR_REPLACEMENTS || [
    "Keep it friendly."
  ];

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

      updateActiveUsers(totalPlayers);

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

      updateActiveUsers(0);
    }
  );
}

function updateActiveUsers(
  totalPlayers
) {
  if (!chatActiveUsers) return;

  chatActiveUsers.textContent =
    `${totalPlayers} active`;

  chatActiveUsers.title =
    `${totalPlayers} active user${
      totalPlayers === 1 ? "" : "s"
    } across games`;

  document.dispatchEvent(
    new CustomEvent(
      "siteActiveUsersChanged",
      {
        detail: {
          total: totalPlayers
        }
      }
    )
  );
}

function setupChat() {
  if (
    !chatForm ||
    !chatInput
  ) {
    return;
  }

  syncChatRoom();

  document.addEventListener(
    "siteChatIdentityChanged",
    () => {
      syncChatRoom();
    }
  );

  document.addEventListener(
    "siteChatToggled",
    (event) => {
      isChatOpen =
        Boolean(event.detail?.open);

      if (isChatOpen) {
        chatToggle?.classList.remove(
          "has-unread"
        );
      }
    }
  );

  document.addEventListener(
    "siteChatSubmit",
    () => {
      sendChatMessage();
    }
  );

  chatForm.addEventListener(
    "submit",
    (event) => {
      if (event.defaultPrevented) {
        return;
      }

      event.preventDefault();

      sendChatMessage();
    }
  );

  watchChatMessages();
}

function watchChatMessages() {
  if (!CHAT_ENABLED) return;

  const identity =
    getChatIdentity();

  const roomId =
    chatRoomIdFromSchool(
      identity.school
    );

  if (!roomId) return;

  if (
    unsubscribeChat &&
    activeChatRoomId !== roomId
  ) {
    unsubscribeChat();
    unsubscribeChat = null;
  }

  if (unsubscribeChat) return;

  activeChatRoomId = roomId;
  hasLoadedChat = false;
  seenChatMessages.clear();
  chatMessages.innerHTML =
    '<div class="chat-empty">Loading room messages...</div>';

  cleanupOldChatMessages(roomId);

  const messagesRef = query(
    ref(
      database,
      `siteChat/rooms/${roomId}/messages`
    ),
    orderByChild("createdAt"),
    limitToLast(CHAT_MESSAGE_LIMIT)
  );

  unsubscribeChat = onValue(
    messagesRef,
    (snapshot) => {
      if (!chatMessages) return;

      chatMessages.innerHTML = "";

      if (!snapshot.exists()) {
        chatMessages.innerHTML =
          '<div class="chat-empty">No messages in this room yet.</div>';

        hasLoadedChat = true;

        return;
      }

      snapshot.forEach(
        (messageSnapshot) => {
          const key =
            messageSnapshot.key;

          const message =
            messageSnapshot.val();

          renderMessage(
            key,
            message
          );

          maybeNotifyChatMessage(
            key,
            message,
            roomId
          );
        }
      );

      hasLoadedChat = true;

      chatMessages.scrollTop =
        chatMessages.scrollHeight;

      cleanupOldChatMessages(roomId);
    }
  );
}

function renderMessage(key, message) {
  if (!chatMessages) return;

  const item =
    document.createElement("div");

  item.className =
    "chat-message";

  if (message.sid === SESSION_ID) {
    item.classList.add("own");
  }

  const meta =
    document.createElement("div");

  meta.className = "message-meta";

  const author =
    document.createElement("span");

  author.className =
    "message-author";

  const name =
    document.createElement("span");

  name.className =
    "message-name";

  name.textContent =
    cleanName(message.name) ||
    "Guest";

  author.append(name);

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

  meta.append(author, time);

  item.append(meta, text);

  chatMessages.appendChild(item);
}

function sendChatMessage() {
  const rawText =
    chatInput.value.trim();

  if (!rawText) return;

  const identity =
    getChatIdentity();

  if (!identity.name || !identity.school) {
    document.dispatchEvent(
      new CustomEvent(
        "siteChatNeedsIdentity"
      )
    );

    return;
  }

  const text =
    applyCensor(rawText);

  chatInput.value = "";

  push(
    ref(
      database,
      `siteChat/rooms/${chatRoomIdFromSchool(
        identity.school
      )}/messages`
    ),
    {
      name: identity.name,
      text,
      sid: SESSION_ID,
      createdAt: Date.now()
    }
  )
    .then(() => {
      cleanupOldChatMessages(
        chatRoomIdFromSchool(
          identity.school
        )
      );
    })
    .catch(console.error);
}

function cleanupOldChatMessages(roomId = activeChatRoomId) {
  if (!roomId) return;

  get(
    ref(
      database,
      `siteChat/rooms/${roomId}/messages`
    )
  )
    .then((snapshot) => {
      if (!snapshot.exists()) return;

      const messages = [];

      snapshot.forEach((messageSnapshot) => {
        const data =
          messageSnapshot.val() || {};

        messages.push({
          key: messageSnapshot.key,
          createdAt:
            Number(data.createdAt) || 0
        });
      });

      // oldest -> newest
      messages.sort(
        (a, b) =>
          a.createdAt -
          b.createdAt
      );

      // delete old messages
      const deleteCount = Math.max(
        0,
        messages.length -
          CHAT_MESSAGE_LIMIT
      );

      if (deleteCount <= 0) return;

      const messagesToDelete =
        messages.slice(0, deleteCount);

      const removals =
        messagesToDelete.map((msg) =>
          remove(
            ref(
              database,
              `siteChat/rooms/${roomId}/messages/${msg.key}`
            )
          )
        );

      return Promise.all(removals);
    })
    .catch((error) => {
      console.error(
        "Chat cleanup failed:",
        error
      );
    });
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

function syncChatRoom() {
  const identity =
    getChatIdentity();

  const nextRoomId =
    chatRoomIdFromSchool(
      identity.school
    );

  if (!nextRoomId) return;

  if (activeChatRoomId !== nextRoomId) {
    if (unsubscribeChat) {
      unsubscribeChat();
      unsubscribeChat = null;
    }

    activeChatRoomId = null;
    watchChatMessages();
  }
}

function getChatIdentity() {
  return {
    name: cleanName(
      localStorage.getItem(
        CHAT_NAME_KEY
      ) || ""
    ),
    school: cleanSchool(
      localStorage.getItem(
        CHAT_SCHOOL_KEY
      ) || ""
    )
  };
}

function cleanSchool(value) {
  const school =
    String(value || "").trim();

  const allowed = [
    "High School",
    "Middle School",
    "Elementary School"
  ];

  return allowed.includes(school)
    ? school
    : "";
}

function chatRoomIdFromSchool(value) {
  const school =
    cleanSchool(value);

  if (school === "High School") {
    return "high";
  }

  if (school === "Middle School") {
    return "middle";
  }

  if (school === "Elementary School") {
    return "elementary";
  }

  return "";
}

function maybeNotifyChatMessage(
  key,
  message,
  roomId
) {
  if (!key || seenChatMessages.has(key)) {
    return;
  }

  seenChatMessages.add(key);

  if (
    !hasLoadedChat ||
    isChatOpen ||
    message.sid === SESSION_ID
  ) {
    return;
  }

  document.dispatchEvent(
    new CustomEvent("siteChatNotify", {
      detail: {
        name:
          cleanName(message.name) ||
          "Guest",
        text: cleanMessageText(
          message.text
        ),
        room: roomLabelFromId(roomId)
      }
    })
  );
}

function roomLabelFromId(roomId) {
  if (roomId === "high") {
    return "High School";
  }

  if (roomId === "middle") {
    return "Middle School";
  }

  if (roomId === "elementary") {
    return "Elementary School";
  }

  return "Chat";
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
    .slice(0, MAX_NAME_LENGTH);
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

setupChat();
