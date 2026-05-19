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

const CHAT_CLEANUP_INTERVAL_MS = 0; // always run on first call; throttled after

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

let authMode = "sign-in";

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

const chatAuthGate =
  document.getElementById("chatAuthGate");

const authGateTitle =
  document.getElementById("authGateTitle");

const authGateCopy =
  document.getElementById("authGateCopy");

const authGateActions =
  document.getElementById("authGateActions");

const authGateFeedback =
  document.getElementById("authGateFeedback");

const authOpenSignIn =
  document.getElementById("authOpenSignIn");

const authOpenCreate =
  document.getElementById("authOpenCreate");

const authForm =
  document.getElementById("authForm");

const authEmail =
  document.getElementById("authEmail");

const authPassword =
  document.getElementById("authPassword");

const authSubmit =
  document.getElementById("authSubmit");

const authBack =
  document.getElementById("authBack");

const authVerify =
  document.getElementById("authVerify");

const authRefresh =
  document.getElementById("authRefresh");

const authSignOut =
  document.getElementById("authSignOut");

const authFeedback =
  document.getElementById("authFeedback");

const chatUserStatus =
  document.getElementById("chatUserStatus");

const chatUserEmail =
  document.getElementById("chatUserEmail");

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
    !authSubmit ||
    !authForm ||
    !authOpenSignIn ||
    !authOpenCreate ||
    !authVerify ||
    !authRefresh ||
    !authSignOut
  ) {
    updateChatAuthState(null);
    return;
  }

  authOpenSignIn.addEventListener(
    "click",
    () => {
      openAuthForm("sign-in");
    }
  );

  authOpenCreate.addEventListener(
    "click",
    () => {
      openAuthForm("create");
    }
  );

  authForm.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      submitAuthForm();
    }
  );

  authBack?.addEventListener(
    "click",
    closeAuthForm
  );

  authVerify.addEventListener(
    "click",
    async () => {
      if (!auth.currentUser) {
        setGateFeedback(
          "Sign in before sending a verification email.",
          "error"
        );
        return;
      }

      setGateFeedback(
        "Sending verification email...",
        "loading"
      );

      try {
        await sendEmailVerification(
          auth.currentUser
        );

        setGateFeedback(
          "Verification sent. Click the link in your email, then press the unlock button here.",
          "success"
        );
      } catch (error) {
        setGateFeedback(
          getAuthErrorMessage(error),
          "error"
        );
      }
    }
  );

  authRefresh.addEventListener(
    "click",
    checkVerificationStatus
  );

  authSignOut.addEventListener(
    "click",
    () => {
      setGateFeedback(
        "Signing out...",
        "loading"
      );

      signOut(auth).catch((error) => {
        setGateFeedback(
          getAuthErrorMessage(error),
          "error"
        );
      });
    }
  );

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateChatAuthState(user);
  });

  window.firebaseChatAuthReady = true;
}

function openAuthForm(mode) {
  authMode = mode;

  if (authGateTitle) {
    authGateTitle.textContent =
      mode === "create"
        ? "Create account"
        : "Sign in";
  }

  if (authGateCopy) {
    authGateCopy.textContent =
      mode === "create"
        ? "Make an account, then verify your email before chatting."
        : "Sign in with your verified Firebase email.";
  }

  if (authSubmit) {
    authSubmit.textContent =
      mode === "create"
        ? "Create account"
        : "Sign in";
    authSubmit.disabled = false;
  }

  if (authPassword) {
    authPassword.autocomplete =
      mode === "create"
        ? "new-password"
        : "current-password";
  }

  setAuthFeedback(
    mode === "create"
      ? "Use at least 6 characters for your password."
      : "Enter your email and password.",
    ""
  );

  if (authGateActions) {
    authGateActions.hidden = true;
  }

  if (authForm) {
    authForm.hidden = false;
    authForm.dataset.mode = mode;
  }

  setGateFeedback("");

  setTimeout(() => authEmail?.focus(), 80);
}

function closeAuthForm() {
  if (authForm) {
    authForm.hidden = true;
  }

  if (!currentUser) {
    setGateContent({
      title: "Sign in to chat",
      copy: "Use a verified Firebase email so everyone knows who is talking.",
      showChoices: true,
      showVerify: false,
      showRefresh: false,
      showForm: false,
      feedback: ""
    });
  } else {
    updateChatAuthState(currentUser);
  }

  if (authSubmit) {
    authSubmit.disabled = false;
  }
}

async function checkVerificationStatus() {
  if (!auth.currentUser) {
    updateChatAuthState(null);
    return;
  }

  setGateFeedback(
    "Checking your verification status...",
    "loading"
  );

  try {
    await auth.currentUser.reload();

    currentUser = auth.currentUser;

    updateChatAuthState(currentUser);

    if (currentUser.emailVerified) {
      setGateFeedback(
        "Email verified. Chat unlocked.",
        "success"
      );
    } else {
      setGateFeedback(
        "Still not verified. Open the email link, then try again.",
        "error"
      );
    }
  } catch (error) {
    setGateFeedback(
      getAuthErrorMessage(error),
      "error"
    );
  }
}

function submitAuthForm() {
  authMode = authForm?.dataset.mode || authMode;

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    setAuthFeedback(
      "Enter your email and password first.",
      "error"
    );
    return;
  }

  setAuthFeedback(
    authMode === "create"
      ? "Creating your account..."
      : "Signing you in...",
    "loading"
  );

  if (authSubmit) {
    authSubmit.disabled = true;
  }

  const authAction =
    authMode === "create"
      ? createUserWithEmailAndPassword(
          auth,
          email,
          password
        ).then(({ user }) =>
          sendEmailVerification(user).then(
            () => user
          )
        )
      : signInWithEmailAndPassword(
          auth,
          email,
          password
        ).then(({ user }) => user);

  authAction
    .then((user) => {
      currentUser = user;

      if (authMode === "create") {
        setAuthFeedback(
          "Account created. Check your email for the verification link.",
          "success"
        );
        setGateFeedback(
          "Account created. Verify your email, then press the unlock button.",
          "success"
        );
        closeAuthForm();
        updateChatAuthState(user);
      } else if (user.emailVerified) {
        setAuthFeedback(
          "Signed in. Opening chat...",
          "success"
        );
        updateChatAuthState(user);
      } else {
        setAuthFeedback(
          "Signed in, but your email is not verified yet.",
          "error"
        );
        setGateFeedback(
          "Your email still needs verification before chat unlocks.",
          "error"
        );
        closeAuthForm();
        updateChatAuthState(user);
      }
    })
    .catch((error) => {
      setAuthFeedback(
        getAuthErrorMessage(error),
        "error"
      );
    })
    .finally(() => {
      if (authSubmit) {
        authSubmit.disabled = false;
      }
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
    setGateContent({
      title: "Sign in to chat",
      copy: "Use a verified Firebase email so everyone knows who is talking.",
      showChoices: true,
      showVerify: false,
      showRefresh: false,
      showForm: false,
      feedback: ""
    });
  } else if (!user.emailVerified) {
    setGateContent({
      title: "Verify your email",
      copy: `${user.email} is signed in, but chat stays locked until the email is verified.`,
      showChoices: false,
      showVerify: true,
      showRefresh: true,
      showForm: false,
      feedback: "Click the verification link in your email, then press the unlock button."
    });
  } else {
    setGateContent({
      title: "Chat unlocked",
      copy: `Chatting as ${user.email}`,
      showChoices: false,
      showVerify: false,
      showRefresh: false,
      showForm: false,
      feedback: ""
    });
  }

  chatAuthGate?.classList.toggle(
    "hidden",
    canChat
  );

  if (chatUserStatus) {
    chatUserStatus.hidden = !user;
  }

  if (chatUserEmail) {
    chatUserEmail.textContent = user?.email
      ? user.emailVerified
        ? user.email
        : `${user.email} (unverified)`
      : "";
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

  if (chatMessages) {
    chatMessages.hidden = !canChat;
  }

  if (chatForm) {
    chatForm.hidden = !canChat;
  }
}

function setGateContent({
  title,
  copy,
  showChoices,
  showVerify,
  showRefresh,
  showForm,
  feedback
}) {
  if (authGateTitle) authGateTitle.textContent = title;
  if (authGateCopy) authGateCopy.textContent = copy;
  if (authGateActions) {
    authGateActions.hidden = !showChoices;
  }
  if (authVerify) {
    authVerify.hidden = !showVerify;
  }
  if (authRefresh) {
    authRefresh.hidden = !showRefresh;
  }
  if (authForm) {
    authForm.hidden = !showForm;
  }
  setGateFeedback(feedback || "");
}

function setGateFeedback(message, state = "") {
  if (!authGateFeedback) return;

  authGateFeedback.textContent = message;
  authGateFeedback.className =
    `auth-gate-feedback ${state}`.trim();
}

function setAuthFeedback(message, state = "") {
  if (!authFeedback) return;

  authFeedback.textContent = message;
  authFeedback.className =
    `auth-feedback ${state}`.trim();
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

  // Reset so cleanup always fires on first load
  lastChatCleanupAt = 0;
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
      // Allow cleanup to run again 60s after each send
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
  const now = Date.now();

  if (now - lastChatCleanupAt < CHAT_CLEANUP_INTERVAL_MS) return;

  lastChatCleanupAt = now;

  const messagesRoot = ref(database, "siteChat/messages");

  // Step 1: delete messages older than 6 hours
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

  // Step 2: delete everything beyond the newest CHAT_MESSAGE_LIMIT records
  const allSnap = await get(messagesRoot).catch(() => null);

  if (!allSnap?.exists()) return;

  const keys = [];

  allSnap.forEach((s) => keys.push(s.key));

  // Firebase returns push keys in insertion order (oldest first)
  const toDelete = keys.slice(
    0,
    Math.max(0, keys.length - CHAT_MESSAGE_LIMIT)
  );

  await Promise.all(
    toDelete.map((k) =>
      remove(ref(database, `siteChat/messages/${k}`)).catch(console.error)
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
