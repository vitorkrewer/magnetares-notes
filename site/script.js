const REPO_OWNER = "vitorkrewer";
const REPO_NAME = "magnetares-notes";
const RELEASE_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const LATEST_RELEASE_PAGE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

// Configurações padrão com fallback para a página de releases
const DOWNLOADS = {
  windows: {
    label: "Baixar para Windows (x64)",
    heroLabel: "Baixar para Windows",
    note: "Windows 10 ou superior · Instalador nativo (.exe)",
    meta: "Versão mais recente · 64-bit",
    url: LATEST_RELEASE_PAGE
  },
  macos: {
    label: "Baixar para macOS (Universal)",
    heroLabel: "Baixar para macOS",
    note: "macOS 12 Monterey ou superior · Apple Silicon e Intel (.zip)",
    meta: "Versão mais recente · Binário Universal",
    url: LATEST_RELEASE_PAGE
  },
  linux: {
    label: "Baixar para Linux (x64)",
    heroLabel: "Baixar para Linux",
    note: "Distribuições Linux modernas (glibc 2.31+) · Pacote portátil (.tar.gz)",
    meta: "Versão mais recente · 64-bit",
    url: LATEST_RELEASE_PAGE
  }
};

// Detecção inteligente de sistema operacional do visitante
function detectUserOS() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = (window.navigator.platform || "").toLowerCase();

  if (platform.includes("mac") || userAgent.includes("macintosh") || userAgent.includes("mac os")) {
    return "macos";
  }
  if (platform.includes("linux") || userAgent.includes("linux") || userAgent.includes("x11")) {
    return "linux";
  }
  return "windows";
}

const buttons = document.querySelectorAll(".platform");
const downloadLink = document.querySelector("#download-link");
const downloadLabel = document.querySelector("#download-label");
const platformNote = document.querySelector("#platform-note");
const downloadMeta = document.querySelector("#download-meta");
const heroDownloadBtn = document.querySelector("#hero-download-btn");
const heroDownloadText = document.querySelector("#hero-download-text");
const headerVersionBadge = document.querySelector("#header-version-badge");

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

  if (heroDownloadBtn) heroDownloadBtn.href = data.url;
  if (heroDownloadText) heroDownloadText.textContent = data.heroLabel;
}

if (buttons.length > 0) {
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const platform = button.dataset.platform;
      updateDownloadUI(platform);
    });
  });
}

// Inicializa com o SO detectado
const initialOS = detectUserOS();
updateDownloadUI(initialOS);

// Busca dinamicamente os links diretos de download da última Release do GitHub
async function fetchLatestRelease() {
  try {
    const res = await fetch(RELEASE_API);
    if (!res.ok) return;
    const data = await res.json();
    const version = data.tag_name || "v1.1.0";
    const assets = data.assets || [];

    if (headerVersionBadge) {
      headerVersionBadge.textContent = version;
    }

    const versionPill = document.querySelector("#hero-version-text");
    if (versionPill) {
      versionPill.textContent = `Magnetares Notes ${version} · 100% Local-First`;
    }

    assets.forEach((asset) => {
      const name = asset.name.toLowerCase();
      const downloadUrl = asset.browser_download_url;

      if (name.includes("windows") || name.endsWith(".exe")) {
        DOWNLOADS.windows.url = downloadUrl;
        DOWNLOADS.windows.meta = `Versão ${version} · x64 (.exe)`;
      } else if (name.includes("macos") || name.includes("darwin") || name.endsWith(".zip")) {
        DOWNLOADS.macos.url = downloadUrl;
        DOWNLOADS.macos.meta = `Versão ${version} · Universal (.zip)`;
      } else if (name.includes("linux") || name.endsWith(".tar.gz")) {
        DOWNLOADS.linux.url = downloadUrl;
        DOWNLOADS.linux.meta = `Versão ${version} · x64 (.tar.gz)`;
      }
    });

    const activeBtn = document.querySelector(".platform.selected");
    const activePlatform = activeBtn ? activeBtn.dataset.platform : initialOS;
    updateDownloadUI(activePlatform);
  } catch (err) {
    console.warn("Usando fallback de release estática.", err);
  }
}

fetchLatestRelease();

// Ano dinâmico no rodapé
const yearEl = document.querySelector("#year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

// Modal Lightbox para visualização de screenshots
const galleryCards = document.querySelectorAll(".screenshot-card, .preview-thumb");
const modal = document.querySelector("#screenshot-modal");
const modalImg = document.querySelector("#modal-img");
const modalTitle = document.querySelector("#modal-title");
const modalDesc = document.querySelector("#modal-desc");
const modalClose = document.querySelector("#modal-close");

if (galleryCards.length > 0 && modal) {
  galleryCards.forEach((card) => {
    card.addEventListener("click", () => {
      const img = card.querySelector("img");
      const title = card.querySelector("h3, h4") ? card.querySelector("h3, h4").textContent : "Screenshot";
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

// Botão flutuante para voltar ao topo com animação suave
const scrollTopBtn = document.querySelector("#scroll-top-btn");
if (scrollTopBtn) {
  let isTicking = false;

  window.addEventListener("scroll", () => {
    if (!isTicking) {
      window.requestAnimationFrame(() => {
        if (window.scrollY > 350) {
          scrollTopBtn.classList.add("visible");
        } else {
          scrollTopBtn.classList.remove("visible");
        }
        isTicking = false;
      });
      isTicking = true;
    }
  }, { passive: true });

  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });
}