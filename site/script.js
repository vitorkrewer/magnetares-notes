const REPO_OWNER = "vitorkrewer";
const REPO_NAME = "magnetares-notes";
const RELEASE_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const LATEST_RELEASE_PAGE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

// Configuração padrão com fallback para a página de releases do GitHub
const DOWNLOADS = {
  windows: {
    label: "Baixar para Windows",
    note: "Windows 10 ou superior · Instalador nativo",
    meta: "Versão mais recente · x64",
    url: LATEST_RELEASE_PAGE
  },
  macos: {
    label: "Baixar para macOS",
    note: "macOS 12 ou superior · Apple Silicon e Intel",
    meta: "Versão mais recente · Universal",
    url: LATEST_RELEASE_PAGE
  },
  linux: {
    label: "Baixar para Linux",
    note: "Linux moderno · Pacote portátil",
    meta: "Versão mais recente · x64",
    url: LATEST_RELEASE_PAGE
  }
};

const buttons = document.querySelectorAll(".platform");
const downloadLink = document.querySelector("#download-link");
const downloadLabel = document.querySelector("#download-label");
const platformNote = document.querySelector("#platform-note");
const downloadMeta = document.querySelector("#download-meta");

function updateDownloadUI(platform) {
  const data = DOWNLOADS[platform];
  if (!data) return;

  buttons.forEach((item) => {
    const isSelected = item.dataset.platform === platform;
    item.classList.toggle("selected", isSelected);
    item.setAttribute("aria-selected", String(isSelected));
  });

  if (downloadLink) downloadLink.href = data.url;
  if (downloadLabel) downloadLabel.textContent = data.label;
  if (platformNote) platformNote.textContent = data.note;
  if (downloadMeta) downloadMeta.textContent = data.meta;
}

if (buttons.length > 0 && downloadLink) {
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const platform = button.dataset.platform;
      updateDownloadUI(platform);
    });
  });
}

// Busca dinamicamente os links diretos de download da última Release do GitHub
async function fetchLatestRelease() {
  try {
    const res = await fetch(RELEASE_API);
    if (!res.ok) return;
    const data = await res.json();
    const version = data.tag_name || "v1.1.0";
    const assets = data.assets || [];

    assets.forEach((asset) => {
      const name = asset.name.toLowerCase();
      const downloadUrl = asset.browser_download_url;

      if (name.includes("windows") || name.endsWith(".exe")) {
        DOWNLOADS.windows.url = downloadUrl;
        DOWNLOADS.windows.meta = `Versão ${version} · x64`;
      } else if (name.includes("macos") || name.includes("darwin") || name.endsWith(".zip")) {
        DOWNLOADS.macos.url = downloadUrl;
        DOWNLOADS.macos.meta = `Versão ${version} · Universal`;
      } else if (name.includes("linux") || name.endsWith(".tar.gz")) {
        DOWNLOADS.linux.url = downloadUrl;
        DOWNLOADS.linux.meta = `Versão ${version} · x64`;
      }
    });

    const activeBtn = document.querySelector(".platform.selected");
    const activePlatform = activeBtn ? activeBtn.dataset.platform : "windows";
    updateDownloadUI(activePlatform);
  } catch (err) {
    console.warn("Usando fallback de release estática.", err);
  }
}

fetchLatestRelease();

const yearEl = document.querySelector("#year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

// Modal Lightbox para visualização de screenshots
const galleryCards = document.querySelectorAll(".screenshot-card");
const modal = document.querySelector("#screenshot-modal");
const modalImg = document.querySelector("#modal-img");
const modalTitle = document.querySelector("#modal-title");
const modalDesc = document.querySelector("#modal-desc");
const modalClose = document.querySelector("#modal-close");

if (galleryCards.length > 0 && modal) {
  galleryCards.forEach((card) => {
    card.addEventListener("click", () => {
      const img = card.querySelector("img");
      const title = card.querySelector("h3") ? card.querySelector("h3").textContent : "";
      const desc = card.querySelector("p") ? card.querySelector("p").textContent : "";
      
      if (img && img.src) {
        modalImg.src = img.src;
        modalImg.alt = title;
      }
      if (modalTitle) modalTitle.textContent = title;
      if (modalDesc) modalDesc.textContent = desc;

      modal.classList.add("active");
      modal.setAttribute("aria-hidden", "false");
    });
  });

  const closeModal = () => {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  };

  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      closeModal();
    }
  });
}