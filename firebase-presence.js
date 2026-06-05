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
  remove,
  serverTimestamp
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

const ADMIN_EMAILS = ["newtabgmail@gmail.com"];
window.SITE_CHAT_ADMIN_EMAILS = ADMIN_EMAILS;

const SESSION_ID_KEY = "game_hoster_session_id";
const SESSION_ID = getSessionId();
const CHAT_NAME_KEY = "site_chat_name";
const CHAT_SCHOOL_KEY = "site_chat_school";
const CHAT_PENDING_NAME_KEY = "site_chat_pending_name";
const CHAT_PENDING_SCHOOL_KEY = "site_chat_pending_school";
const CHAT_MESSAGE_LIMIT = 25;
const MAX_MESSAGE_LENGTH = 180;
const MAX_NAME_LENGTH = 24;

const CHAT_ROOMS = {
  "High School": { id: "high", label: "High School" },
  "Middle School": { id: "middle", label: "Middle School" },
  "Elementary School": { id: "elementary", label: "Elementary School" }
};

const ROOM_ORDER = [
  CHAT_ROOMS["High School"],
  CHAT_ROOMS["Middle School"],
  CHAT_ROOMS["Elementary School"]
];

const PRESENCE_HEARTBEAT_MS = 30 * 1000;
const PRESENCE_STALE_MS = 2 * 60 * 1000;
const PRESENCE_CLEANUP_INTERVAL_MS = 60 * 1000;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

let activeGameId = null;
let activePresenceRef = null;
let activeDisconnectRef = null;
let unsubscribeCounts = null;
let chatUnsubscribes = [];
let unsubscribeUserProfile = null;
let unsubscribeApprovalRequests = null;
let unsubscribeOwnApprovalRequest = null;
let isOnline = false;
let isChatOpen = false;
let hasLoadedChat = false;
let activeChatRoomId = null;
let currentUser = null;
let currentProfile = null;
let currentIsAdmin = false;
const seenChatMessages = new Set();
let presenceHeartbeatTimer = null;
let presenceCleanupTimer = null;
let lastPresenceCleanupAt = 0;

const chatToggle = document.getElementById("chatToggle");
const chatActiveUsers = document.getElementById("chatActiveUsers");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const adminRoomSelect = document.getElementById("chatRoomSelect");

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto?.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
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
        if (!player) return;
        if (Number(player.lastSeenAt || 0) < cutoff) {
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
  const countsRef = ref(database, "gamePresence");
  unsubscribeCounts = onValue(countsRef, (snapshot) => {
    const counts = {};
    let totalPlayers = 0;
    cleanupStalePresence();
    snapshot.forEach((gameSnapshot) => {
      let playerCount = 0;
      gameSnapshot.child("players").forEach((playerSnapshot) => {
        const data = playerSnapshot.val();
        if (!data) return;
        const cutoff = Date.now() - PRESENCE_STALE_MS;
        if (Number(data.lastSeenAt || 0) >= cutoff) playerCount++;
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

// ─── APPROVAL SYSTEM ──────────────────────────────────────────────────────────

async function submitApprovalRequest(user, name, school) {
  const requestRef = ref(database, `siteChat/approvalRequests/${user.uid}`);
  const now = Date.now();
  await set(requestRef, {
    uid: user.uid,
    email: cleanEmail(user.email),
    name: cleanName(name),
    school: cleanSchool(school),
    status: "pending",
    submittedAt: now
  });
}

async function checkApprovalStatus(user) {
  const requestRef = ref(database, `siteChat/approvalRequests/${user.uid}`);
  const snapshot = await get(requestRef);
  if (!snapshot.exists()) return null;
  return snapshot.val();
}

function watchApprovalRequests() {
  if (!currentIsAdmin) return;
  if (unsubscribeApprovalRequests) return;

  const requestsRef = ref(database, "siteChat/approvalRequests");
  unsubscribeApprovalRequests = onValue(requestsRef, (snapshot) => {
    const requests = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        requests.push({ key: child.key, ...child.val() });
      });
    }
    document.dispatchEvent(new CustomEvent("siteApprovalRequestsChanged", { detail: { requests } }));
  }, (error) => {
    console.error("watchApprovalRequests failed — check Firebase rules for siteChat/approvalRequests:", error.code, error.message);
  });
}

function stopApprovalRequestsWatch() {
  if (!unsubscribeApprovalRequests) return;
  unsubscribeApprovalRequests();
  unsubscribeApprovalRequests = null;
}

// Live watcher for a non-admin user's own approval request — fires when admin
// approves or denies directly in the Firebase console or via the UI.
function watchApprovalRequestStatus(user) {
  stopOwnApprovalRequestWatch();
  const requestRef = ref(database, `siteChat/approvalRequests/${user.uid}`);
  unsubscribeOwnApprovalRequest = onValue(requestRef, async (snapshot) => {
    if (!snapshot.exists() || !currentUser) return;
    const data = snapshot.val();
    if (data.status === "approved") {
      stopOwnApprovalRequestWatch();
      await ensureApprovedProfile(user, data);
      watchUserProfile(user);
    } else if (data.status === "denied") {
      stopOwnApprovalRequestWatch();
      dispatchAuthChanged({ approvalStatus: "denied", denyReason: data.denyReason });
      showChatStatus("Your account request was denied.");
      // Sign them out after a short delay so they see the denied screen briefly
      setTimeout(() => signOut(auth).catch(console.warn), 3000);
    }
  }, (error) => {
    console.warn("Approval request watch failed:", error);
  });
}

function stopOwnApprovalRequestWatch() {
  if (!unsubscribeOwnApprovalRequest) return;
  unsubscribeOwnApprovalRequest();
  unsubscribeOwnApprovalRequest = null;
}

async function approveRequest(uid) {
  const requestRef = ref(database, `siteChat/approvalRequests/${uid}`);
  const snapshot = await get(requestRef);
  if (!snapshot.exists()) return;
  const data = snapshot.val();

  // Only write fields the admin role is permitted to write.
  // uid and email are owner-only per Firebase rules — including them here
  // would cause the entire update to be rejected.
  const userRef = ref(database, `siteChat/users/${uid}`);
  const userSnap = await get(userRef);
  const now = Date.now();
  const profile = {
    name: cleanName(data.name),
    school: cleanSchool(data.school),
    approved: true,
    updatedAt: now
  };
  if (!userSnap.exists()) profile.createdAt = now;
  await update(userRef, profile);

  // Mark request approved
  await update(requestRef, { status: "approved", reviewedAt: now });
}

async function denyRequest(uid, reason) {
  const requestRef = ref(database, `siteChat/approvalRequests/${uid}`);
  await update(requestRef, {
    status: "denied",
    denyReason: cleanMessageText(reason).slice(0, 300),
    reviewedAt: Date.now()
  });
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

function setupAuth() {
  document.addEventListener("siteChatAuthAction", (event) => {
    handleAuthAction(event.detail).catch((error) => {
      console.warn("Firebase auth failed:", error);
      dispatchAuthStatus(friendlyAuthError(error), true);
    });
  });

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    currentIsAdmin = isAdminEmail(user?.email);
    currentProfile = null;
    stopUserProfileWatch();
    stopApprovalRequestsWatch();
    stopOwnApprovalRequestWatch();
    clearChatSubscriptions();

    if (!user) {
      dispatchAuthChanged();
      showChatStatus("Choose Sign up or Log in to use chat.");
      return;
    }

    connectDatabase();

    try {
      // Check if admin
      if (currentIsAdmin) {
        // Admins are always approved — set their profile if missing
        await ensureAdminProfile(user);
        watchApprovalRequests();
        watchUserProfile(user);
        return;
      }

      // Check approval status
      const request = await checkApprovalStatus(user);

      if (!request) {
        // No request at all — show "request verification" state
        dispatchAuthChanged({ approvalStatus: "none" });
        showChatStatus("Your account needs approval. Request verification to chat.");
        return;
      }

      if (request.status === "pending") {
        dispatchAuthChanged({ approvalStatus: "pending" });
        showChatStatus("Your account is pending approval. Check back soon!");
        watchApprovalRequestStatus(user);
        return;
      }

      if (request.status === "denied") {
        dispatchAuthChanged({ approvalStatus: "denied", denyReason: request.denyReason });
        showChatStatus("Your account request was denied.");
        // Auto sign-out after a short delay so they see the denial reason
        setTimeout(() => signOut(auth).catch(console.warn), 3000);
        return;
      }

      if (request.status === "approved") {
        // Ensure their profile exists in siteChat/users
        await ensureApprovedProfile(user, request);
        watchUserProfile(user);
        return;
      }

      dispatchAuthChanged();
    } catch (error) {
      console.warn("Profile setup failed:", error);
      dispatchAuthStatus("Profile could not load. Check Firebase rules.", true);
    }
  });
}

async function ensureAdminProfile(user) {
  const userRef = ref(database, `siteChat/users/${user.uid}`);
  const snapshot = await get(userRef);
  const now = Date.now();
  const profile = {
    uid: user.uid,
    email: cleanEmail(user.email),
    name: "Admin",
    school: "High School",
    approved: true,
    updatedAt: now
  };
  if (!snapshot.exists()) {
    profile.createdAt = now;
    await set(userRef, profile);
  } else {
    if (!snapshot.val().approved) {
      await update(userRef, { approved: true, updatedAt: now });
    }
  }
}

async function ensureApprovedProfile(user, request) {
  const userRef = ref(database, `siteChat/users/${user.uid}`);
  const snapshot = await get(userRef);
  const now = Date.now();

  if (!snapshot.exists()) {
    await set(userRef, {
      uid: user.uid,
      email: cleanEmail(user.email || request.email),
      name: cleanName(request.name),
      school: cleanSchool(request.school),
      approved: true,
      createdAt: now,
      updatedAt: now
    });
  } else {
    const existing = snapshot.val();
    if (!existing.approved) {
      await update(userRef, { approved: true, updatedAt: now });
    }
  }
}

async function handleAuthAction(detail = {}) {
  const action = detail.action;

  if (action === "signout") {
    await signOut(auth);
    dispatchAuthStatus("Signed out.", false);
    return;
  }

  if (action === "request-approval") {
    if (!currentUser) throw new Error("Sign in first.");
    const name = cleanName(detail.name);
    const school = cleanSchool(detail.school);
    if (!name || !school) throw new Error("Enter your name and school first.");
    dispatchAuthStatus("Submitting request...", false);
    await submitApprovalRequest(currentUser, name, school);
    dispatchAuthChanged({ approvalStatus: "pending" });
    dispatchAuthStatus("Request submitted! You'll be notified when approved.", false);
    return;
  }

  if (action === "approve-request") {
    if (!currentIsAdmin) throw new Error("Admins only.");
    await approveRequest(detail.uid);
    return;
  }

  if (action === "deny-request") {
    if (!currentIsAdmin) throw new Error("Admins only.");
    await denyRequest(detail.uid, detail.reason);
    return;
  }

  if (action === "check-approval") {
    if (!currentUser) throw new Error("Sign in first.");
    const request = await checkApprovalStatus(currentUser);
    if (request?.status === "approved") {
      await ensureApprovedProfile(currentUser, request);
      watchUserProfile(currentUser);
    } else if (request?.status === "pending") {
      dispatchAuthStatus("Still pending. Admins will review soon.", false);
    } else if (request?.status === "denied") {
      dispatchAuthChanged({ approvalStatus: "denied", denyReason: request.denyReason });
      showChatStatus("Your account request was denied.");
    } else {
      dispatchAuthStatus("No request found. Submit a request first.", true);
    }
    return;
  }

  const email = cleanEmail(detail.email);
  const password = String(detail.password || "");
  const name = cleanName(detail.name);
  const school = cleanSchool(detail.school);

  if (!email || !password) throw new Error("Enter your email and password.");
  if (action === "signup" && (!name || !school)) throw new Error("Choose a name and school.");

  dispatchAuthStatus(action === "signup" ? "Creating account..." : "Signing in...", false);

  if (action === "signup") {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    savePendingSignup(name, school);
    // Immediately submit approval request
    await submitApprovalRequest(credential.user, name, school);
    dispatchAuthChanged({ approvalStatus: "pending" });
    dispatchAuthStatus("Account created! Your request has been submitted for approval.", false);
    return;
  }

  const credential = await signInWithEmailAndPassword(auth, email, password);
  // Auth state change handler takes over from here
}

function savePendingSignup(name, school) {
  localStorage.setItem(CHAT_PENDING_NAME_KEY, name);
  localStorage.setItem(CHAT_PENDING_SCHOOL_KEY, school);
}

function clearPendingSignup() {
  localStorage.removeItem(CHAT_PENDING_NAME_KEY);
  localStorage.removeItem(CHAT_PENDING_SCHOOL_KEY);
}

function watchUserProfile(user) {
  const userRef = ref(database, `siteChat/users/${user.uid}`);
  // Immediately dispatch so the admin panel / identity row shows before the
  // first snapshot arrives from Firebase.
  dispatchAuthChanged({ approvalStatus: currentIsAdmin ? "approved" : undefined });
  unsubscribeUserProfile = onValue(userRef, async (snapshot) => {
    if (!currentUser) return;
    const value = snapshot.val();
    if (!value) {
      currentProfile = null;
      dispatchAuthChanged();
      return;
    }
    currentProfile = normalizeProfile(user, value);
    currentIsAdmin = isAdminEmail(user.email);
    localStorage.setItem(CHAT_NAME_KEY, currentProfile.name);
    localStorage.setItem(CHAT_SCHOOL_KEY, currentProfile.school);
    dispatchAuthChanged({ approvalStatus: "approved" });
    watchChatMessages();
  }, (error) => {
    console.warn("Firebase profile read failed:", error);
    dispatchAuthStatus("Your profile could not load. Check the Firebase database rules.", true);
  });
}

function stopUserProfileWatch() {
  if (!unsubscribeUserProfile) return;
  unsubscribeUserProfile();
  unsubscribeUserProfile = null;
}

async function saveUserProfile(user, name, school) {
  if (!user) return;
  const userRef = ref(database, `siteChat/users/${user.uid}`);
  const snapshot = await get(userRef);
  const now = Date.now();
  const profile = { uid: user.uid, email: cleanEmail(user.email), name, school, approved: true, updatedAt: now };
  if (!snapshot.exists()) profile.createdAt = now;
  await update(userRef, profile);
}

function normalizeProfile(user, value) {
  return {
    uid: user.uid,
    email: cleanEmail(value.email || user.email),
    name: cleanName(value.name) || "Guest",
    school: cleanSchool(value.school) || "High School",
    banned: value.banned === true,
    timeoutUntil: Number(value.timeoutUntil) || 0,
    approved: value.approved === true
  };
}

function dispatchAuthChanged(extra = {}) {
  document.dispatchEvent(new CustomEvent("siteChatAuthChanged", {
    detail: {
      user: currentUser ? {
        uid: currentUser.uid,
        email: cleanEmail(currentUser.email),
        emailVerified: true // always true in new system (approval-based)
      } : null,
      profile: currentProfile,
      isAdmin: currentIsAdmin,
      ...extra
    }
  }));
}

function dispatchAuthStatus(message, isError) {
  document.dispatchEvent(new CustomEvent("siteChatAuthStatus", { detail: { message, isError } }));
}

// ─── CHAT ────────────────────────────────────────────────────────────────────

function setupChat() {
  if (!chatForm || !chatInput) return;

  document.addEventListener("siteChatIdentityChanged", () => watchChatMessages());
  document.addEventListener("siteChatToggled", (event) => {
    isChatOpen = Boolean(event.detail?.open);
    if (isChatOpen) chatToggle?.classList.remove("has-unread");
  });
  document.addEventListener("siteChatSubmit", () => sendChatMessage());
  chatForm.addEventListener("submit", (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    sendChatMessage();
  });

  showChatStatus("Choose Sign up or Log in to use chat.");
}

function clearChatSubscriptions() {
  chatUnsubscribes.forEach((unsubscribe) => unsubscribe());
  chatUnsubscribes = [];
  activeChatRoomId = null;
  hasLoadedChat = false;
  seenChatMessages.clear();
}

function watchChatMessages() {
  if (!currentUser || !currentProfile || !currentProfile.approved) {
    clearChatSubscriptions();
    showChatStatus(currentUser ? "Your account is pending approval." : "Choose Sign up or Log in to use chat.");
    return;
  }
  if (currentIsAdmin) { watchAdminRooms(); return; }
  const roomId = chatRoomIdFromSchool(currentProfile.school);
  if (!roomId) return;
  if (chatUnsubscribes.length && activeChatRoomId === roomId) return;
  clearChatSubscriptions();
  activeChatRoomId = roomId;
  if (chatMessages) {
    chatMessages.classList.remove("admin-grid");
    chatMessages.innerHTML = '<div class="chat-empty">Loading room messages...</div>';
  }
  subscribeRoom(roomId, chatMessages);
}

function watchAdminRooms() {
  if (chatUnsubscribes.length && activeChatRoomId === "admin") return;
  clearChatSubscriptions();
  activeChatRoomId = "admin";
  if (!chatMessages) return;
  chatMessages.classList.add("admin-grid");
  chatMessages.innerHTML = "";
  ROOM_ORDER.forEach((room) => {
    const panel = document.createElement("section");
    panel.className = "admin-room-panel";
    const title = document.createElement("div");
    title.className = "admin-room-title";
    title.textContent = `${room.label} Chat`;
    const body = document.createElement("div");
    body.className = "admin-room-messages";
    body.innerHTML = '<div class="chat-empty">Loading messages...</div>';
    panel.append(title, body);
    chatMessages.appendChild(panel);
    subscribeRoom(room.id, body);
  });
}

function subscribeRoom(roomId, container) {
  if (!container) return;
  const messagesRef = query(
    ref(database, `siteChat/rooms/${roomId}/messages`),
    orderByChild("createdAt"),
    limitToLast(CHAT_MESSAGE_LIMIT)
  );
  const unsubscribe = onValue(messagesRef, (snapshot) => {
    container.innerHTML = "";
    if (!snapshot.exists()) {
      container.innerHTML = '<div class="chat-empty">No messages in this room yet.</div>';
      hasLoadedChat = true;
      return;
    }
    snapshot.forEach((messageSnapshot) => {
      const key = messageSnapshot.key;
      const message = messageSnapshot.val();
      renderMessage(key, message, roomId, container);
      maybeNotifyChatMessage(key, message, roomId);
    });
    hasLoadedChat = true;
    container.scrollTop = container.scrollHeight;
  }, (error) => {
    console.warn("Firebase chat read failed:", error);
    showChatStatus("Chat could not load. Check the Firebase database rules for this room.");
  });
  chatUnsubscribes.push(unsubscribe);
}

function renderMessage(key, message, roomId, container = chatMessages) {
  if (!container) return;
  const item = document.createElement("div");
  item.className = "chat-message";
  if (message.uid === currentUser?.uid || message.sid === SESSION_ID) item.classList.add("own");
  const meta = document.createElement("div");
  meta.className = "message-meta";
  const author = document.createElement("span");
  author.className = "message-author";
  const name = document.createElement("span");
  name.className = "message-name";
  name.textContent = cleanName(message.name) || "Guest";
  author.append(name);
  if (currentIsAdmin && message.email) {
    const email = document.createElement("span");
    email.className = "message-email";
    email.textContent = cleanEmail(message.email);
    author.append(email);
  }
  const time = document.createElement("span");
  time.textContent = formatMessageTime(message.createdAt);
  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = cleanMessageText(message.text);
  meta.append(author, time);
  item.append(meta, text);
  if (message.editedAt) {
    const edited = document.createElement("div");
    edited.className = "message-edited";
    edited.textContent = "edited";
    item.appendChild(edited);
  }
  if (currentIsAdmin) item.appendChild(createAdminControls(key, message, roomId));
  container.appendChild(item);
}

function createAdminControls(key, message, roomId) {
  const controls = document.createElement("div");
  controls.className = "message-admin-controls";
  const actions = [
    ["Timeout", () => timeoutUser(message)],
    ["Ban", () => banUser(message)],
    ["Delete", () => deleteMessage(key, roomId)],
    ["Edit", () => editMessage(key, message, roomId)],
    ["Name", () => renameUser(message)]
  ];
  actions.forEach(([label, handler]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", handler);
    controls.appendChild(button);
  });
  return controls;
}

function sendChatMessage() {
  const rawText = chatInput.value.trim();
  if (!rawText) return;
  if (!currentUser || !currentProfile || !currentProfile.approved) {
    document.dispatchEvent(new CustomEvent("siteChatNeedsIdentity"));
    return;
  }
  if (currentProfile.banned) { showChatStatus("This account is banned from chat."); return; }
  if (currentProfile.timeoutUntil && currentProfile.timeoutUntil > Date.now()) {
    showChatStatus(`Timed out until ${formatMessageTime(currentProfile.timeoutUntil)}.`);
    return;
  }
  const roomId = currentIsAdmin && adminRoomSelect?.value
    ? adminRoomSelect.value
    : chatRoomIdFromSchool(currentProfile.school);
  if (!roomId) { document.dispatchEvent(new CustomEvent("siteChatNeedsIdentity")); return; }
  const text = cleanMessageText(rawText);
  chatInput.value = "";
  push(ref(database, `siteChat/rooms/${roomId}/messages`), {
    uid: currentUser.uid,
    email: cleanEmail(currentUser.email),
    name: currentProfile.name,
    text,
    sid: SESSION_ID,
    school: currentProfile.school,
    room: roomId,
    createdAt: Date.now()
  }).then(() => {
    if (currentIsAdmin) cleanupOldChatMessages(roomId);
  }).catch((error) => {
    console.warn("Firebase chat write failed:", error);
    showChatStatus("Message was not sent. Check the Firebase database rules for this room.");
  });
}

function cleanupOldChatMessages(roomId = activeChatRoomId) {
  if (!roomId || !currentIsAdmin) return;
  get(ref(database, `siteChat/rooms/${roomId}/messages`)).then((snapshot) => {
    if (!snapshot.exists()) return;
    const messages = [];
    snapshot.forEach((messageSnapshot) => {
      const data = messageSnapshot.val() || {};
      messages.push({ key: messageSnapshot.key, createdAt: Number(data.createdAt) || 0 });
    });
    messages.sort((a, b) => a.createdAt - b.createdAt);
    const deleteCount = Math.max(0, messages.length - CHAT_MESSAGE_LIMIT);
    if (deleteCount <= 0) return;
    const removals = messages.slice(0, deleteCount).map((msg) =>
      remove(ref(database, `siteChat/rooms/${roomId}/messages/${msg.key}`))
    );
    return Promise.all(removals);
  }).catch(console.error);
}

function timeoutUser(message) {
  if (!message.uid) return;
  const minutes = Number.parseInt(prompt(`Timeout ${message.email || message.name} for how many minutes?`, "10"), 10);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  update(ref(database, `siteChat/users/${message.uid}`), {
    timeoutUntil: Date.now() + minutes * 60 * 1000,
    updatedAt: Date.now()
  }).catch(console.error);
}

function banUser(message) {
  if (!message.uid) return;
  if (!confirm(`Ban ${message.email || message.name} from chat?`)) return;
  update(ref(database, `siteChat/users/${message.uid}`), {
    banned: true,
    timeoutUntil: 0,
    updatedAt: Date.now()
  }).catch(console.error);
}

function deleteMessage(key, roomId) {
  if (!confirm("Delete this message?")) return;
  remove(ref(database, `siteChat/rooms/${roomId}/messages/${key}`)).catch(console.error);
}

function editMessage(key, message, roomId) {
  const nextText = cleanMessageText(prompt("Edit message", cleanMessageText(message.text)));
  if (!nextText) return;
  update(ref(database, `siteChat/rooms/${roomId}/messages/${key}`), {
    text: nextText,
    editedAt: Date.now(),
    editedBy: currentUser.uid
  }).catch(console.error);
}

async function renameUser(message) {
  if (!message.uid) return;
  const nextName = cleanName(prompt("Change display name", cleanName(message.name)));
  if (!nextName) return;
  await update(ref(database, `siteChat/users/${message.uid}`), { name: nextName, updatedAt: Date.now() });
  await updateExistingMessageNames(message.uid, nextName);
}

async function updateExistingMessageNames(uid, name) {
  const updates = [];
  for (const room of ROOM_ORDER) {
    const snapshot = await get(ref(database, `siteChat/rooms/${room.id}/messages`));
    snapshot.forEach((messageSnapshot) => {
      const value = messageSnapshot.val();
      if (value?.uid === uid) {
        updates.push(update(messageSnapshot.ref, { name, editedAt: Date.now(), editedBy: currentUser.uid }));
      }
    });
  }
  await Promise.all(updates);
}

function getChatIdentity() {
  if (currentProfile) return { name: currentProfile.name, school: currentProfile.school };
  return {
    name: cleanName(localStorage.getItem(CHAT_NAME_KEY) || ""),
    school: cleanSchool(localStorage.getItem(CHAT_SCHOOL_KEY) || "")
  };
}

function cleanSchool(value) {
  const school = String(value || "").trim();
  return Object.hasOwn(CHAT_ROOMS, school) ? school : "";
}

function chatRoomIdFromSchool(value) {
  return CHAT_ROOMS[cleanSchool(value)]?.id || "";
}

function maybeNotifyChatMessage(key, message, roomId) {
  if (!key || seenChatMessages.has(key)) return;
  seenChatMessages.add(key);
  if (!hasLoadedChat || isChatOpen || message.uid === currentUser?.uid || (!currentIsAdmin && roomId !== activeChatRoomId)) return;
  document.dispatchEvent(new CustomEvent("siteChatNotify", {
    detail: { name: cleanName(message.name) || "Guest", text: cleanMessageText(message.text), room: roomLabelFromId(roomId), roomId }
  }));
}

function roomLabelFromId(roomId) {
  return ROOM_ORDER.find((entry) => entry.id === roomId)?.label || "Chat";
}

function showChatStatus(message) {
  if (!chatMessages) return;
  chatMessages.classList.remove("admin-grid");
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

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(cleanEmail(email));
}

function friendlyAuthError(error) {
  if (!error?.code) return error?.message || "Something went wrong.";
  const messages = {
    "auth/email-already-in-use": "That email already has an account. Sign in instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/network-request-failed": "Could not reach Firebase. Try again in a moment.",
    "auth/too-many-requests": "Too many attempts. Wait a bit, then try again."
  };
  return messages[error.code] || "Firebase rejected that request. Check the email and password.";
}

function formatMessageTime(timestamp) {
  if (!timestamp) return "now";
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

window.addEventListener("beforeunload", () => clearActivePresence());

window.gamePresence = { setActiveGame, disconnect: disconnectDatabase };

watchGameCounts();
setupAuth();
setupChat();
