const iframe = document.getElementById("viewer");
const urlBox = document.getElementById("urlBox");
const goBtn = document.getElementById("goBtn");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const bookmarkBtn = document.getElementById("bookmarkBtn");
const showHistoryBtn = document.getElementById("showHistory");
const showBookmarksBtn = document.getElementById("showBookmarks");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalList = document.getElementById("modalList");
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const darkModeToggle = document.getElementById("darkModeToggle");
const fontSizeSelect = document.getElementById("fontSizeSelect");

let historyStack = [];
let currentIndex = -1;

function navigateTo(url) {
  if (!/^https?:\/\//.test(url)) {
    url = "https://www.google.com/search?q=" + encodeURIComponent(url);
  }
  iframe.src = url;
  urlBox.value = url;
  if (currentIndex === -1 || historyStack[currentIndex] !== url) {
    historyStack = historyStack.slice(0, currentIndex + 1);
    historyStack.push(url);
    currentIndex++;
    saveHistory(url);
  }
}

function goBack() {
  if (currentIndex > 0) {
    currentIndex--;
    iframe.src = historyStack[currentIndex];
    urlBox.value = historyStack[currentIndex];
  }
}

function goForward() {
  if (currentIndex < historyStack.length - 1) {
    currentIndex++;
    iframe.src = historyStack[currentIndex];
    urlBox.value = historyStack[currentIndex];
  }
}

function saveHistory(url) {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  // 重複防止(直前のURLと同じなら追加しない)
  if(history.length === 0 || history[0].url !== url){
    history.unshift({ url, time: new Date().toISOString() });
    localStorage.setItem("history", JSON.stringify(history.slice(0, 100)));
  }
}

function addBookmark() {
  const bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");
  if (!bookmarks.find(b => b.url === iframe.src)) {
    bookmarks.unshift({ url: iframe.src });
    localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
  }
}

function openModal(type) {
  modal.classList.remove("hidden");
  modalTitle.textContent