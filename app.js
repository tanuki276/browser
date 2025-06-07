const iframe = document.getElementById("viewer"); const urlBox = document.getElementById("urlBox"); const goBtn = document.getElementById("goBtn"); const backBtn = document.getElementById("backBtn"); const forwardBtn = document.getElementById("forwardBtn"); const bookmarkBtn = document.getElementById("bookmarkBtn"); const showHistoryBtn = document.getElementById("showHistory"); const showBookmarksBtn = document.getElementById("showBookmarks"); const settingsBtn = document.getElementById("settingsBtn"); const modal = document.getElementById("modal"); const modalTitle = document.getElementById("modalTitle"); const modalList = document.getElementById("modalList");

let historyStack = []; let currentIndex = -1;

function navigateTo(url) { if (!/^https?:///.test(url)) { url = "https://www.google.com/search?q=" + encodeURIComponent(url); } iframe.src = url; urlBox.value = url; if (currentIndex === -1 || historyStack[currentIndex] !== url) { historyStack = historyStack.slice(0, currentIndex + 1); historyStack.push(url); currentIndex++; saveHistory(url); } updateNavButtons(); }

function goBack() { if (currentIndex > 0) { currentIndex--; iframe.src = historyStack[currentIndex]; urlBox.value = historyStack[currentIndex]; } updateNavButtons(); }

function goForward() { if (currentIndex < historyStack.length - 1) { currentIndex++; iframe.src = historyStack[currentIndex]; urlBox.value = historyStack[currentIndex]; } updateNavButtons(); }

function updateNavButtons() { backBtn.disabled = currentIndex <= 0; forwardBtn.disabled = currentIndex >= historyStack.length - 1; }

function saveHistory(url) { const history = JSON.parse(localStorage.getItem("history") || "[]"); history.unshift({ url, time: new Date().toISOString() }); localStorage.setItem("history", JSON.stringify(history.slice(0, 100))); }

function addBookmark() { const bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]"); if (!bookmarks.find(b => b.url === iframe.src)) { bookmarks.unshift({ url: iframe.src }); localStorage.setItem("bookmarks", JSON.stringify(bookmarks)); } }

function openModal(type) { modal.classList.remove("hidden"); modalTitle.textContent = type === "history" ? "履歴" : type === "bookmarks" ? "ブックマーク" : "設定"; modalList.innerHTML = "";

if (type === "settings") { const darkModeToggle = document.createElement("button"); darkModeToggle.textContent = "🌙 ダークモード切替"; darkModeToggle.onclick = () => { document.body.classList.toggle("dark"); localStorage.setItem("darkMode", document.body.classList.contains("dark") ? "1" : "0"); };

const fontSizeSelect = document.createElement("select");
["small", "medium", "large"].forEach(size => {
  const option = document.createElement("option");
  option.value = size;
  option.textContent = size;
  fontSizeSelect.appendChild(option);
});
fontSizeSelect.onchange = () => {
  document.body.style.fontSize = fontSizeSelect.value;
  localStorage.setItem("fontSize", fontSizeSelect.value);
};

modalList.appendChild(darkModeToggle);
modalList.appendChild(fontSizeSelect);
return;

}

const data = JSON.parse(localStorage.getItem(type) || "[]"); data.forEach(entry => { const li = document.createElement("li"); li.textContent = entry.url; li.onclick = () => { navigateTo(entry.url); closeModal(); }; modalList.appendChild(li); }); }

function closeModal() { modal.classList.add("hidden"); }

goBtn.onclick = () => navigateTo(urlBox.value); urlBox.onkeydown = e => { if (e.key === "Enter") navigateTo(urlBox.value); }; backBtn.onclick = goBack; forwardBtn.onclick = goForward; bookmarkBtn.onclick = addBookmark; showHistoryBtn.onclick = () => openModal("history"); showBookmarksBtn.onclick = () => openModal("bookmarks"); settingsBtn.onclick = () => openModal("settings");

 if 
(localStorage.getItem("darkMode") === "1") { document.body.classList.add("dark"); }

if (localStorage.getItem("fontSize")) { document.body.style.fontSize = localStorage.getItem("fontSize"); }

