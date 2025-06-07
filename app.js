const body = document.body;
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const settingsContent = document.getElementById("settingsContent");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");

const darkModeCheckbox = document.getElementById("darkModeCheckbox");
const fontSizeSelect = document.getElementById("fontSizeSelect");

settingsBtn.onclick = () => {
  settingsModal.classList.remove("hidden");
  darkModeCheckbox.checked = body.classList.contains("dark-mode");
  fontSizeSelect.value = getFontSizeClass();
};

closeSettingsBtn.onclick = () => {
  settingsModal.classList.add("hidden");
};

darkModeCheckbox.onchange = () => {
  if (darkModeCheckbox.checked) {
    body.classList.add("dark-mode");
    localStorage.setItem("darkMode", "true");
  } else {
    body.classList.remove("dark-mode");
    localStorage.setItem("darkMode", "false");
  }
};

fontSizeSelect.onchange = () => {
  const size = fontSizeSelect.value;
  body.classList.remove("font-small", "font-medium", "font-large");
  body.classList.add(size);
  localStorage.setItem("fontSize", size);
};

function loadSettings() {
  if (localStorage.getItem("darkMode") === "true") {
    body.classList.add("dark-mode");
  }
  const size = localStorage.getItem("fontSize") || "font-medium";
  body.classList.add(size);
}

function getFontSizeClass() {
  if (body.classList.contains("font-small")) return "font-small";
  if (body.classList.contains("font-large")) return "font-large";
  return "font-medium";
}

loadSettings();