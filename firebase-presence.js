import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
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
  goOnline,
  set,
  update,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAk9fMAWy6AS4o2s5n5zSJj0M0GlJoyIWE", //hardcoded on some tuff shi
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

const ADMIN_EMAILS = [
  "sagaasg29@rsu71.org"
];

window.SITE_CHAT_ADMIN_EMAILS = ADMIN_EMAILS;

const SESSION_ID_KEY =
  "game_hoster_session_id";

const SESSION_ID = getSessionId();

const CHAT_NAME_KEY = "site_chat_name";

const CHAT_SCHOOL_KEY = "site_chat_school";

const CHAT_PENDING_NAME_KEY = "site_chat_pending_name";

const CHAT_PENDING_SCHOOL_KEY = "site_chat_pending_school";

const ACCOUNT_REQUEST_STATUS = {
  pending: "pending",
  approved: "approved",
  denied: "denied"
};

const CHAT_MESSAGE_LIMIT = 25;

const MAX_MESSAGE_LENGTH = 180;

const MAX_NAME_LENGTH = 24;

const CHAT_ROOMS = {
  "High School": {
    id: "high",
    label: "High School"
  },
  "Middle School": {
    id: "middle",
    label: "Middle School"
  },
  "Elementary School": {
    id: "elementary",
    label: "Elementary School"
  }
};

const ROOM_ORDER = [
  CHAT_ROOMS["High School"],
  CHAT_ROOMS["Middle School"],
  CHAT_ROOMS["Elementary School"]
];

const PRESENCE_HEARTBEAT_MS =
  30 * 1000;

const PRESENCE_STALE_MS =
  2 * 60 * 1000;

const PRESENCE_CLEANUP_INTERVAL_MS =
  60 * 1000;

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const database = getDatabase(app);

let activeGameId = null;

let activePresenceRef = null;

let activeDisconnectRef = null;

let unsubscribeCounts = null;

let chatUnsubscribes = [];

let unsubscribeUserProfile = null;

let unsubscribeAccountRequest = null;

let unsubscribeAdminRequests = null;

let isOnline = false;

let isChatOpen = false;

let hasLoadedChat = false;

let activeChatRoomId = null;

let currentUser = null;

let currentProfile = null;

let currentRequest = null;

let currentIsAdmin = false;

let adminRequestsContainer = null;

let latestAdminRequests = [];

const seenChatMessages = new Set();

let presenceHeartbeatTimer = null;

let presenceCleanupTimer = null;

let lastPresenceCleanupAt = 0;

const chatToggle =
  document.getElementById("chatToggle");

const chatActiveUsers =
  document.getElementById("chatActiveUsers");

const chatMessages =
  document.getElementById("chatMessages");

const chatForm =
  document.getElementById("chatForm");

const chatInput =
  document.getElementById("chatInput");

const adminRoomSelect =
  document.getElementById("chatRoomSelect");

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
  startPresenceCleanupTimer();

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

function startPresenceCleanupTimer() {
  if (presenceCleanupTimer) return;

  presenceCleanupTimer = setInterval(
    cleanupStalePresence,
    PRESENCE_CLEANUP_INTERVAL_MS
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

function setupAuth() {
  document.addEventListener(
    "siteChatAuthAction",
    (event) => {
      handleAuthAction(event.detail)
        .catch((error) => {
          console.warn(
            "Firebase auth failed:",
            error
          );

          dispatchAuthStatus(
            friendlyAuthError(error),
            true
          );
        });
    }
  );

  onAuthStateChanged(
    auth,
    async (user) => {
      currentUser = user;
      currentIsAdmin =
        isAdminEmail(user?.email);
      currentProfile = null;
      currentRequest = null;

      stopUserProfileWatch();
      stopAccountRequestWatch();
      stopAdminRequestsWatch();
      clearChatSubscriptions();

      if (!user) {
        dispatchAuthChanged();
        showChatStatus(
          "Choose Sign up or Log in to use chat."
        );
        return;
      }

      connectDatabase();

      if (currentIsAdmin) {
        await ensureAdminProfile(user);
        watchAdminAccountRequests();
      }

      watchAccountRequest(user);
      watchUserProfile(user);
    }
  );
}

async function handleAuthAction(detail = {}) {
  const action = detail.action;

  if (action === "signout") {
    await signOut(auth);
    dispatchAuthStatus("Signed out.", false);
    return;
  }

  if (action === "request-approval") {
    if (!auth.currentUser) {
      throw new Error("Sign in first.");
    }

    const requestName = cleanName(detail.name);
    const requestSchool = cleanSchool(detail.school);

    if (!requestName || !requestSchool) {
      throw new Error(
        "Enter your name and pick your school."
      );
    }

    await submitAccountRequest(
      auth.currentUser,
      requestName,
      requestSchool
    );
    return;
  }

  if (action === "approve-request") {
    requireAdmin();
    await approveAccountRequest(detail.uid);
    return;
  }

  if (action === "deny-request") {
    requireAdmin();
    const note = String(
      detail.note || ""
    ).trim();

    if (!note) {
      throw new Error(
        "Write a note before declining."
      );
    }

    await denyAccountRequest(
      detail.uid,
      note
    );
    return;
  }

  if (action === "clear-denied-request") {
    if (!auth.currentUser) return;

    await remove(
      ref(
        database,
        `siteChat/accountRequests/${auth.currentUser.uid}`
      )
    );
    return;
  }

  const email = cleanEmail(detail.email);
  const password = String(
    detail.password || ""
  );
  const name = cleanName(detail.name);
  const school = cleanSchool(detail.school);

  if (!email || !password) {
    throw new Error(
      "Enter your email and password."
    );
  }

  if (
    action === "signup" &&
    (!name || !school)
  ) {
    throw new Error(
      "Choose a name and school."
    );
  }

  dispatchAuthStatus(
    action === "signup"
      ? "Creating account..."
      : "Signing in...",
    false
  );

  if (action === "signup") {
    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    savePendingSignup(name, school);

    dispatchAuthChanged();
    dispatchAuthStatus(
      "Account created. Request account verification to unlock chat.",
      false
    );
    return;
  }

  const credential =
    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

  dispatchAuthStatus("Signed in.", false);
}

function savePendingSignup(name, school) {
  localStorage.setItem(
    CHAT_PENDING_NAME_KEY,
    name
  );
  localStorage.setItem(
    CHAT_PENDING_SCHOOL_KEY,
    school
  );
}

function clearPendingSignup() {
  localStorage.removeItem(
    CHAT_PENDING_NAME_KEY
  );
  localStorage.removeItem(
    CHAT_PENDING_SCHOOL_KEY
  );
}

async function submitAccountRequest(
  user,
  name,
  school
) {
  if (!user) return;

  const now = Date.now();
  const requestRef = ref(
    database,
    `siteChat/accountRequests/${user.uid}`
  );

  await set(requestRef, {
    uid: user.uid,
    email: cleanEmail(user.email),
    name,
    school,
    status: ACCOUNT_REQUEST_STATUS.pending,
    requestedAt: now,
    updatedAt: now
  });

  localStorage.setItem(CHAT_NAME_KEY, name);
  localStorage.setItem(
    CHAT_SCHOOL_KEY,
    school
  );
  clearPendingSignup();

  dispatchAuthStatus(
    "Request sent to New Tab. It may take a few hours to get accepted.",
    false
  );
}

function watchAccountRequest(user) {
  if (!user) return;

  const requestRef = ref(
    database,
    `siteChat/accountRequests/${user.uid}`
  );

  unsubscribeAccountRequest = onValue(
    requestRef,
    (snapshot) => {
      currentRequest =
        snapshot.val() || null;
      dispatchAuthChanged();
    },
    (error) => {
      console.warn(
        "Account request read failed:",
        error
      );
    }
  );
}

function stopAccountRequestWatch() {
  if (!unsubscribeAccountRequest) return;

  unsubscribeAccountRequest();
  unsubscribeAccountRequest = null;
}

function watchAdminAccountRequests() {
  if (unsubscribeAdminRequests) return;

  const requestsRef = ref(
    database,
    "siteChat/accountRequests"
  );

  unsubscribeAdminRequests = onValue(
    requestsRef,
    (snapshot) => {
      const requests = [];

      snapshot.forEach((child) => {
        const value = child.val();
        if (!value) return;
        requests.push({
          ...value,
          uid: value.uid || child.key
        });
      });

      requests.sort((a, b) => {
        const statusScore = {
          pending: 0,
          denied: 1,
          approved: 2
        };

        return (
          (statusScore[a.status] ?? 9) -
            (statusScore[b.status] ?? 9) ||
          Number(b.requestedAt || 0) -
            Number(a.requestedAt || 0)
        );
      });

      latestAdminRequests = requests;
      renderAccountRequests();

      document.dispatchEvent(
        new CustomEvent(
          "siteChatAccountRequestsChanged",
          {
            detail: { requests }
          }
        )
      );
    },
    (error) => {
      console.warn(
        "Admin request queue failed:",
        error
      );
    }
  );
}

function stopAdminRequestsWatch() {
  if (!unsubscribeAdminRequests) return;

  unsubscribeAdminRequests();
  unsubscribeAdminRequests = null;
}

function requireAdmin() {
  if (!currentIsAdmin) {
    throw new Error("Admin only.");
  }
}

async function approveAccountRequest(uid) {
  if (!uid) return;

  const requestRef = ref(
    database,
    `siteChat/accountRequests/${uid}`
  );
  const snapshot = await get(requestRef);
  const request = snapshot.val();

  if (!request) {
    throw new Error("That request no longer exists.");
  }

  const now = Date.now();

  await saveApprovedUserProfile({
    uid,
    email: cleanEmail(request.email),
    name: cleanName(request.name),
    school: cleanSchool(request.school),
    approvedAt: now,
    approvedBy: currentUser.uid
  });

  await update(requestRef, {
    status: ACCOUNT_REQUEST_STATUS.approved,
    decidedAt: now,
    decidedBy: currentUser.uid,
    declineNote: null,
    updatedAt: now
  });
}

async function denyAccountRequest(uid, note) {
  if (!uid) return;

  const now = Date.now();

  await update(
    ref(
      database,
      `siteChat/accountRequests/${uid}`
    ),
    {
      status: ACCOUNT_REQUEST_STATUS.denied,
      declineNote: note,
      decidedAt: now,
      decidedBy: currentUser.uid,
      updatedAt: now
    }
  );
}

async function ensureAdminProfile(user) {
  if (!user) return;

  const userRef = ref(
    database,
    `siteChat/users/${user.uid}`
  );
  const snapshot = await get(userRef);

  if (snapshot.exists()) return;

  await saveApprovedUserProfile({
    uid: user.uid,
    email: cleanEmail(user.email),
    name: "Admin",
    school: "High School",
    approvedAt: Date.now(),
    approvedBy: user.uid
  });
}

function watchUserProfile(user) {
  const userRef = ref(
    database,
    `siteChat/users/${user.uid}`
  );

  unsubscribeUserProfile = onValue(
    userRef,
    async (snapshot) => {
      if (!currentUser) return;

      const value = snapshot.val();

      if (!value) {
        currentProfile = null;
        dispatchAuthChanged();
        return;
      }

      currentProfile =
        normalizeProfile(user, value);

      if (
        !currentIsAdmin &&
        currentProfile.approved !== true
      ) {
        currentProfile = null;
        dispatchAuthChanged();
        return;
      }

      currentIsAdmin =
        isAdminEmail(user.email);

      localStorage.setItem(
        CHAT_NAME_KEY,
        currentProfile.name
      );
      localStorage.setItem(
        CHAT_SCHOOL_KEY,
        currentProfile.school
      );

      dispatchAuthChanged();
      watchChatMessages();
    },
    (error) => {
      console.warn(
        "Firebase profile read failed:",
        error
      );

      dispatchAuthStatus(
        "Your profile could not load. Check the Firebase database rules.",
        true
      );
    }
  );
}

function stopUserProfileWatch() {
  if (!unsubscribeUserProfile) return;

  unsubscribeUserProfile();
  unsubscribeUserProfile = null;
}

async function saveApprovedUserProfile({
  uid,
  email,
  name,
  school,
  approvedAt = Date.now(),
  approvedBy = ""
}) {
  if (!uid) return;

  const userRef = ref(
    database,
    `siteChat/users/${uid}`
  );
  const snapshot = await get(userRef);
  const now = Date.now();

  const profile = {
    uid,
    email: cleanEmail(email),
    name,
    school,
    approved: true,
    approvedAt,
    approvedBy,
    updatedAt: now
  };

  if (!snapshot.exists()) {
    profile.createdAt = now;
  }

  await update(userRef, profile);
}

function normalizeProfile(user, value) {
  return {
    uid: user.uid,
    email: cleanEmail(
      value.email || user.email
    ),
    name:
      cleanName(value.name) ||
      "Guest",
    school:
      cleanSchool(value.school) ||
      "High School",
    approved:
      value.approved === true ||
      isAdminEmail(user.email),
    banned: value.banned === true,
    timeoutUntil:
      Number(value.timeoutUntil) || 0
  };
}

function dispatchAuthChanged() {
  document.dispatchEvent(
    new CustomEvent(
      "siteChatAuthChanged",
      {
        detail: {
          user: currentUser
            ? {
                uid: currentUser.uid,
                email: cleanEmail(
                  currentUser.email
                )
              }
            : null,
          profile: currentProfile,
          request: currentRequest,
          isAdmin: currentIsAdmin
        }
      }
    )
  );
}

function dispatchAuthStatus(
  message,
  isError
) {
  document.dispatchEvent(
    new CustomEvent(
      "siteChatAuthStatus",
      {
        detail: {
          message,
          isError
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

  document.addEventListener(
    "siteChatIdentityChanged",
    () => {
      watchChatMessages();
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

  showChatStatus(
    "Choose Sign up or Log in to use chat."
  );
}

function clearChatSubscriptions() {
  chatUnsubscribes.forEach(
    (unsubscribe) => unsubscribe()
  );
  chatUnsubscribes = [];
  activeChatRoomId = null;
  hasLoadedChat = false;
  seenChatMessages.clear();
}

function watchChatMessages() {
  if (
    !currentUser ||
    (!currentIsAdmin && !currentProfile)
  ) {
    clearChatSubscriptions();
    showChatStatus(
      currentUser
        ? "Request account verification to unlock chat."
        : "Choose Sign up or Log in to use chat."
    );
    return;
  }

  if (currentIsAdmin) {
    watchAdminRooms();
    return;
  }

  const roomId =
    chatRoomIdFromSchool(
      currentProfile.school
    );

  if (!roomId) return;

  if (
    chatUnsubscribes.length &&
    activeChatRoomId === roomId
  ) {
    return;
  }

  clearChatSubscriptions();
  activeChatRoomId = roomId;

  if (chatMessages) {
    chatMessages.classList.remove(
      "admin-grid"
    );
    chatMessages.innerHTML =
      '<div class="chat-empty">Loading room messages...</div>';
  }

  subscribeRoom(roomId, chatMessages);
}

function watchAdminRooms() {
  if (
    chatUnsubscribes.length &&
    activeChatRoomId === "admin"
  ) {
    return;
  }

  clearChatSubscriptions();
  activeChatRoomId = "admin";

  if (!chatMessages) return;

  chatMessages.classList.add(
    "admin-grid"
  );
  chatMessages.innerHTML = "";

  const requestPanel =
    document.createElement("section");
  requestPanel.className =
    "admin-room-panel account-requests-panel";

  const requestTitle =
    document.createElement("div");
  requestTitle.className =
    "admin-room-title";
  requestTitle.textContent =
    "Account Requests";

  adminRequestsContainer =
    document.createElement("div");
  adminRequestsContainer.className =
    "admin-request-list";
  adminRequestsContainer.innerHTML =
    '<div class="chat-empty">Loading requests...</div>';

  requestPanel.append(
    requestTitle,
    adminRequestsContainer
  );
  chatMessages.appendChild(requestPanel);
  renderAccountRequests();

  ROOM_ORDER.forEach((room) => {
    const panel =
      document.createElement("section");
    panel.className =
      "admin-room-panel";

    const title =
      document.createElement("div");
    title.className =
      "admin-room-title";
    title.textContent =
      `${room.label} Chat`;

    const body =
      document.createElement("div");
    body.className =
      "admin-room-messages";
    body.innerHTML =
      '<div class="chat-empty">Loading messages...</div>';

    panel.append(title, body);
    chatMessages.appendChild(panel);

    subscribeRoom(room.id, body);
  });
}

function renderAccountRequests() {
  if (!adminRequestsContainer) return;

  adminRequestsContainer.innerHTML = "";

  const requests = latestAdminRequests.filter(
    (request) =>
      request.status !==
      ACCOUNT_REQUEST_STATUS.approved
  );

  if (!requests.length) {
    adminRequestsContainer.innerHTML =
      '<div class="chat-empty">No account requests right now.</div>';
    return;
  }

  requests.forEach((request) => {
    const card =
      document.createElement("article");
    card.className =
      `admin-request-card ${request.status || "pending"}`;

    const heading =
      document.createElement("div");
    heading.className =
      "admin-request-heading";

    const name =
      document.createElement("div");
    name.className =
      "admin-request-name";
    name.textContent =
      cleanName(request.name) ||
      "Unnamed";

    const status =
      document.createElement("span");
    status.className =
      "admin-request-status";
    status.textContent =
      request.status || "pending";

    heading.append(name, status);

    const meta =
      document.createElement("div");
    meta.className =
      "admin-request-meta";
    meta.textContent =
      `${cleanEmail(request.email)} - ${cleanSchool(request.school) || "No school"} - ${formatFullTime(request.requestedAt)}`;

    const note =
      document.createElement("textarea");
    note.className =
      "admin-request-note";
    note.placeholder =
      "Decline note required";
    note.maxLength = 180;

    const actions =
      document.createElement("div");
    actions.className =
      "admin-request-actions";

    const approve =
      document.createElement("button");
    approve.type = "button";
    approve.textContent = "Approve";
    approve.addEventListener("click", () => {
      document.dispatchEvent(
        new CustomEvent(
          "siteChatAuthAction",
          {
            detail: {
              action: "approve-request",
              uid: request.uid
            }
          }
        )
      );
    });

    const deny =
      document.createElement("button");
    deny.type = "button";
    deny.textContent = "Decline";
    deny.className = "danger";
    deny.addEventListener("click", () => {
      const declineNote =
        note.value.trim();

      if (!declineNote) {
        note.focus();
        note.classList.add("needs-note");
        return;
      }

      document.dispatchEvent(
        new CustomEvent(
          "siteChatAuthAction",
          {
            detail: {
              action: "deny-request",
              uid: request.uid,
              note: declineNote
            }
          }
        )
      );
    });

    note.addEventListener("input", () => {
      note.classList.remove("needs-note");
    });

    actions.append(approve, deny);
    card.append(
      heading,
      meta,
      note,
      actions
    );

    if (request.declineNote) {
      const decline =
        document.createElement("div");
      decline.className =
        "admin-request-decline";
      decline.textContent =
        `Last note: ${String(request.declineNote).slice(0, 180)}`;
      card.appendChild(decline);
    }

    adminRequestsContainer.appendChild(card);
  });
}

function subscribeRoom(roomId, container) {
  if (!container) return;

  const messagesRef = query(
    ref(
      database,
      `siteChat/rooms/${roomId}/messages`
    ),
    orderByChild("createdAt"),
    limitToLast(CHAT_MESSAGE_LIMIT)
  );

  const unsubscribe = onValue(
    messagesRef,
    (snapshot) => {
      container.innerHTML = "";

      if (!snapshot.exists()) {
        container.innerHTML =
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
            message,
            roomId,
            container
          );

          maybeNotifyChatMessage(
            key,
            message,
            roomId
          );
        }
      );

      hasLoadedChat = true;
      container.scrollTop =
        container.scrollHeight;
    },
    (error) => {
      console.warn(
        "Firebase chat read failed:",
        error
      );

      showChatStatus(
        "Chat could not load. Check the Firebase database rules for this room."
      );
    }
  );

  chatUnsubscribes.push(unsubscribe);
}

function renderMessage(
  key,
  message,
  roomId,
  container = chatMessages
) {
  if (!container) return;

  const item =
    document.createElement("div");

  item.className =
    "chat-message";

  if (
    message.uid === currentUser?.uid ||
    message.sid === SESSION_ID
  ) {
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

  if (
    currentIsAdmin &&
    message.email
  ) {
    const email =
      document.createElement("span");
    email.className =
      "message-email";
    email.textContent =
      cleanEmail(message.email);
    author.append(email);
  }

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

  if (message.editedAt) {
    const edited =
      document.createElement("div");
    edited.className =
      "message-edited";
    edited.textContent = "edited";
    item.appendChild(edited);
  }

  if (currentIsAdmin) {
    item.appendChild(
      createAdminControls(
        key,
        message,
        roomId
      )
    );
  }

  container.appendChild(item);
}

function createAdminControls(
  key,
  message,
  roomId
) {
  const controls =
    document.createElement("div");
  controls.className =
    "message-admin-controls";

  const actions = [
    ["Timeout", () =>
      timeoutUser(message)],
    ["Ban", () =>
      banUser(message)],
    ["Delete", () =>
      deleteMessage(key, roomId)],
    ["Edit", () =>
      editMessage(key, message, roomId)],
    ["Name", () =>
      renameUser(message)]
  ];

  actions.forEach(
    ([label, handler]) => {
      const button =
        document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener(
        "click",
        handler
      );
      controls.appendChild(button);
    }
  );

  return controls;
}

function sendChatMessage() {
  const rawText =
    chatInput.value.trim();

  if (!rawText) return;

  if (
    !currentUser ||
    (!currentIsAdmin && !currentProfile)
  ) {
    document.dispatchEvent(
      new CustomEvent(
        "siteChatNeedsIdentity"
      )
    );
    return;
  }

  if (currentProfile.banned) {
    showChatStatus(
      "This account is banned from chat."
    );
    return;
  }

  if (
    currentProfile.timeoutUntil &&
    currentProfile.timeoutUntil > Date.now()
  ) {
    showChatStatus(
      `Timed out until ${formatMessageTime(currentProfile.timeoutUntil)}.`
    );
    return;
  }

  const roomId =
    currentIsAdmin &&
    adminRoomSelect?.value
      ? adminRoomSelect.value
      : chatRoomIdFromSchool(
          currentProfile.school
        );

  if (!roomId) {
    document.dispatchEvent(
      new CustomEvent(
        "siteChatNeedsIdentity"
      )
    );

    return;
  }

  const text =
    cleanMessageText(rawText);

  chatInput.value = "";

  push(
    ref(
      database,
      `siteChat/rooms/${roomId}/messages`
    ),
    {
      uid: currentUser.uid,
    email: cleanEmail(
      currentUser.email
    ),
      name: currentProfile?.name || "Admin",
      text,
      sid: SESSION_ID,
      school: currentProfile?.school || "High School",
      room: roomId,
      createdAt: Date.now()
    }
  )
    .then(() => {
      if (currentIsAdmin) {
        cleanupOldChatMessages(
          roomId
        );
      }
    })
    .catch((error) => {
      console.warn(
        "Firebase chat write failed:",
        error
      );

      showChatStatus(
        "Message was not sent. Check the Firebase database rules for this room."
      );
    });
}

function cleanupOldChatMessages(roomId = activeChatRoomId) {
  if (!roomId || !currentIsAdmin) return;

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

      messages.sort(
        (a, b) =>
          a.createdAt -
          b.createdAt
      );

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

function timeoutUser(message) {
  if (!message.uid) return;

  const minutes = Number.parseInt(
    prompt(
      `Timeout ${message.email || message.name} for how many minutes?`,
      "10"
    ),
    10
  );

  if (
    !Number.isFinite(minutes) ||
    minutes <= 0
  ) {
    return;
  }

  update(
    ref(
      database,
      `siteChat/users/${message.uid}`
    ),
    {
      timeoutUntil:
        Date.now() +
        minutes * 60 * 1000,
      updatedAt: Date.now()
    }
  ).catch(console.error);
}

function banUser(message) {
  if (!message.uid) return;

  if (
    !confirm(
      `Ban ${message.email || message.name} from chat?`
    )
  ) {
    return;
  }

  update(
    ref(
      database,
      `siteChat/users/${message.uid}`
    ),
    {
      banned: true,
      timeoutUntil: 0,
      updatedAt: Date.now()
    }
  ).catch(console.error);
}

function deleteMessage(key, roomId) {
  if (
    !confirm(
      "Delete this message?"
    )
  ) {
    return;
  }

  remove(
    ref(
      database,
      `siteChat/rooms/${roomId}/messages/${key}`
    )
  ).catch(console.error);
}

function editMessage(
  key,
  message,
  roomId
) {
  const nextText =
    cleanMessageText(
      prompt(
        "Edit message",
        cleanMessageText(message.text)
      )
    );

  if (!nextText) return;

  update(
    ref(
      database,
      `siteChat/rooms/${roomId}/messages/${key}`
    ),
    {
      text: nextText,
      editedAt: Date.now(),
      editedBy: currentUser.uid
    }
  ).catch(console.error);
}

async function renameUser(message) {
  if (!message.uid) return;

  const nextName =
    cleanName(
      prompt(
        "Change display name",
        cleanName(message.name)
      )
    );

  if (!nextName) return;

  await update(
    ref(
      database,
      `siteChat/users/${message.uid}`
    ),
    {
      name: nextName,
      updatedAt: Date.now()
    }
  );

  await updateExistingMessageNames(
    message.uid,
    nextName
  );
}

async function updateExistingMessageNames(
  uid,
  name
) {
  const updates = [];

  for (const room of ROOM_ORDER) {
    const snapshot = await get(
      ref(
        database,
        `siteChat/rooms/${room.id}/messages`
      )
    );

    snapshot.forEach(
      (messageSnapshot) => {
        const value =
          messageSnapshot.val();

        if (value?.uid === uid) {
          updates.push(
            update(
              messageSnapshot.ref,
              {
                name,
                editedAt: Date.now(),
                editedBy: currentUser.uid
              }
            )
          );
        }
      }
    );
  }

  await Promise.all(updates);
}

function getChatIdentity() {
  if (currentProfile) {
    return {
      name: currentProfile.name,
      school: currentProfile.school
    };
  }

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

  return Object.hasOwn(CHAT_ROOMS, school)
    ? school
    : "";
}

function chatRoomIdFromSchool(value) {
  const school =
    cleanSchool(value);

  return CHAT_ROOMS[school]?.id || "";
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
    message.uid === currentUser?.uid ||
    (!currentIsAdmin && roomId !== activeChatRoomId)
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
        room: roomLabelFromId(roomId),
        roomId
      }
    })
  );
}

function roomLabelFromId(roomId) {
  const room =
    ROOM_ORDER.find(
      (entry) => entry.id === roomId
    );

  return room?.label || "Chat";
}

function showChatStatus(message) {
  if (!chatMessages) return;

  chatMessages.classList.remove(
    "admin-grid"
  );
  chatMessages.innerHTML = "";

  const empty =
    document.createElement("div");

  empty.className = "chat-empty";
  empty.textContent = message;

  chatMessages.appendChild(empty);
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

function cleanEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(
    cleanEmail(email)
  );
}

function friendlyAuthError(error) {
  if (!error?.code) {
    return error?.message ||
      "Something went wrong.";
  }

  const messages = {
    "auth/email-already-in-use":
      "That email already has an account. Sign in instead.",
    "auth/invalid-email":
      "Enter a valid email address.",
    "auth/invalid-credential":
      "Email or password is incorrect.",
    "auth/weak-password":
      "Use a password with at least 6 characters.",
    "auth/network-request-failed":
      "Could not reach Firebase. Try again in a moment."
  };

  return messages[error.code] ||
    "Firebase rejected that request. Check the email and password.";
}

function formatFullTime(timestamp) {
  if (!timestamp) return "unknown time";

  return new Intl.DateTimeFormat(
    [],
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }
  ).format(new Date(timestamp));
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
