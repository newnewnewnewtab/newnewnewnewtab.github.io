import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  onDisconnect,
  set,
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

const CHAT_USER_ID_KEY = "site_chat_user_id";

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

function getRandomId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Date.now() + "-" + Math.random().toString(16).slice(2);
}

function getPersistentId() {
  let id = localStorage.getItem(CHAT_USER_ID_KEY);
  if (!id) {
    id = getRandomId();
    localStorage.setItem(CHAT_USER_ID_KEY, id);
  }
  return id;
}

const PRESENCE_ID = getPersistentId();

let isOnline = false;

function connectDatabase() {
  if (isOnline) return;
  goOnline(database);
  isOnline = true;
}

function setupPresence() {
  const myPresenceRef = ref(database, `presence/${PRESENCE_ID}`);
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

connectDatabase();
setupPresence();
