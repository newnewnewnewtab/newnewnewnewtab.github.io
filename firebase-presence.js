import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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

const CHAT_CLEANUP_INTERVAL_MS =
  10 * 60 * 1000;

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

const app = initializeApp(firebaseConfig);

const database = getDatabase(app);

const auth = getAuth(app);

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

let currentUser = null;

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

const authStatus =
  document.getElementById("authStatus");

const authFields =
  document.getElementById("authFields");

const authEmail =
  document.getElementById("authEmail");

const authPassword =
  document.getElementById("authPassword");

const authSignIn =
  document.getElementById("authSignIn");

const authCreate =
  document.getElementById("authCreate");

const authVerify =
  document.getElementById("authVerify");

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
}

function setupAuth() {
  if (
    !authEmail ||
    !authPassword ||
    !authSignIn ||
    !authCreate ||
    !authVerify ||
    !authSignOut
  ) {
    updateChatAuthState(null);
    return;
  }

  authSignIn.addEventListener(
    "click",
    () => {
      const email = authEmail.value.trim();
      const password = authPassword.value;

      if (!email || !password) {
        setAuthStatus(
          "Enter your email and password first."
        );
        return;
      }

      signInWithEmailAndPassword(
        auth,
        email,
        password
      ).catch((error) => {
        setAuthStatus(
          getAuthErrorMessage(error)
        );
      });
    }
  );

  authCreate.addEventListener(
    "click",
    () => {
      const email = authEmail.value.trim();
      const password = authPassword.value;

      if (!email || !password) {
        setAuthStatus(
          "Enter an email and password to create an account."
        );
        return;
      }

      createUserWithEmailAndPassword(
        auth,
        email,
        password
      )
        .then(({ user }) =>
          sendEmailVerification(user)
        )
        .then(() => {
          setAuthStatus(
            "Account created. Check your email, verify it, then sign in again."
          );
        })
        .catch((error) => {
          setAuthStatus(
            getAuthErrorMessage(error)
          );
        });
    }
  );

  authVerify.addEventListener(
    "click",
    () => {
      if (!auth.currentUser) {
        setAuthStatus(
          "Sign in before sending a verification email."
        );
        return;
      }

      sendEmailVerification(
        auth.currentUser
      )
        .then(() => {
          setAuthStatus(
            "Verification email sent. Refresh after verifying."
          );
        })
        .catch((error) => {
          setAuthStatus(
            getAuthErrorMessage(error)
          );
        });
    }
  );

  authSignOut.addEventListener(
    "click",
    () => {
      signOut(auth).catch((error) => {
        setAuthStatus(
          getAuthErrorMessage(error)
        );
      });
    }
  );

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateChatAuthState(user);
  });
}

function updateChatAuthState(user) {
  const canChat = Boolean(
    user?.email && user.emailVerified
  );

  window.chatAuthState = {
    canChat,
    email: user?.email || ""
  };

  if (!CHAT_ENABLED) {
    return;
  }

  if (!user) {
    setAuthStatus(
      "Sign in with Firebase to chat."
    );
  } else if (!user.emailVerified) {
    setAuthStatus(
      `${user.email} is signed in, but the email is not verified yet.`
    );
  } else {
    setAuthStatus(
      `Chatting as ${user.email}`
    );
  }

  if (authFields) {
    authFields.style.display = user
      ? "none"
      : "grid";
  }

  if (authSignIn) authSignIn.hidden = Boolean(user);
  if (authCreate) authCreate.hidden = Boolean(user);
  if (authVerify) {
    authVerify.hidden = !user?.email ||
      user.emailVerified;
  }
  if (authSignOut) {
    authSignOut.hidden = !user;
  }

  if (chatInput) {
    chatInput.disabled = !canChat;
    chatInput.placeholder = canChat
      ? "Message everyone... "
      : "Sign in with a verified email to chat";
  }

  if (chatSend) {
    chatSend.disabled = !canChat;
  }
}

function setAuthStatus(message) {
  if (!authStatus) return;

  authStatus.textContent = message;
}

function getAuthErrorMessage(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "That email already has an account. Try signing in.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "The email or password was not accepted.";
    case "auth/weak-password":
      return "Use a password with at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a bit and try again.";
    default:
      return error?.message ||
        "Firebase authentication failed.";
  }
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

  watchChatMessages();
}

function watchChatMessages() {
  if (!CHAT_ENABLED) return;

  if (unsubscribeChat) return;

  cleanupOldChatMessages();

  const messagesRef = query(
    ref(database, "siteChat/messages"),
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

  const meta =
    document.createElement("div");

  meta.className = "message-meta";

  const name =
    document.createElement("span");

  name.className =
    "message-name";

  name.textContent =
    cleanEmail(message.email || message.name) ||
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
    !currentUser?.email ||
    !currentUser.emailVerified
  ) {
    updateChatAuthState(currentUser);
    return;
  }

  const email =
    cleanEmail(currentUser.email);

  const text =
    applyCensor(rawText);

  chatInput.value = "";

  push(
    ref(database, "siteChat/messages"),
    {
      email,
      text,
      uid: currentUser.uid,
      sid: SESSION_ID,
      createdAt: Date.now()
    }
  )
    .then(() => {
      cleanupOldChatMessages();
    })
    .catch(console.error);
}

function cleanupOldChatMessages() {
  const now = Date.now();

  if (
    now - lastChatCleanupAt <
    CHAT_CLEANUP_INTERVAL_MS
  ) {
    return;
  }

  lastChatCleanupAt = now;

  const cutoff =
    now - CHAT_MESSAGE_TTL_MS;

  const oldMessagesRef = query(
    ref(database, "siteChat/messages"),
    orderByChild("createdAt"),
    endAt(cutoff)
  );

  get(oldMessagesRef)
    .then((snapshot) => {
      if (!snapshot.exists()) return;

      const removals = [];

      snapshot.forEach(
        (messageSnapshot) => {
          removals.push(
            remove(
              messageSnapshot.ref
            ).catch(console.error)
          );
        }
      );

      return Promise.all(removals);
    })
    .catch(console.error);
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

function cleanEmail(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
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
