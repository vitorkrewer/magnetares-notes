const REPO_OWNER = "vitorkrewer";
const REPO_NAME = "magnetares-notes";
const RELEASE_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const LATEST_RELEASE_PAGE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
let releaseFetched = false;
let latestVersionTag = "";

// Configurações padrão com fallback para a página de releases
const DOWNLOADS = {
  windows: {
    label: "Baixar Instalador Windows (x64)",
    heroLabel: "Baixar para Windows",
    note: "Windows 10 ou superior · Instalador oficial NSIS (.exe)",
    meta: "Versão mais recente · 64-bit",
    url: LATEST_RELEASE_PAGE,
    selectedFormat: "setup",
    formats: {
      setup: {
        shortLabel: "Setup (.exe)",
        label: "Baixar Instalador Windows (Setup .exe)",
        heroLabel: "Baixar para Windows",
        note: "Instalador NSIS completo com atalhos no Menu Iniciar, Área de Trabalho e desinstalador oficial",
        meta: "Versão mais recente · 64-bit (Setup .exe)",
        url: LATEST_RELEASE_PAGE,
        available: false
      },
      msi: {
        shortLabel: "MSI (.msi)",
        label: "Baixar Instalador Corporativo (.msi)",
        heroLabel: "Baixar MSI (.msi)",
        note: "Pacote Windows Installer (.msi) ideal para implantação corporativa, GPO ou instalação padrão",
        meta: "Versão mais recente · 64-bit (.msi)",
        url: LATEST_RELEASE_PAGE,
        available: false
      },
      exe: {
        shortLabel: "Executável (.exe)",
        label: "Baixar Executável Direto (.exe)",
        heroLabel: "Baixar Executável (.exe)",
        note: "Executável standalone direto, sem instalador · Dados salvos no perfil do usuário",
        meta: "Versão mais recente · 64-bit (.exe)",
        url: LATEST_RELEASE_PAGE,
        available: false
      },
      portable: {
        shortLabel: "Portátil (.zip)",
        label: "Baixar Versão Portátil (Pendrive .zip)",
        heroLabel: "Baixar Portátil (.zip)",
        note: "Ideal para pendrives · Mantém banco e configurações na própria pasta (100% isolado)",
        meta: "Versão mais recente · 64-bit (.zip)",
        url: LATEST_RELEASE_PAGE,
        available: false
      }
    }
  },
  macos: {
    label: "Baixar para macOS (Universal)",
    heroLabel: "Baixar para macOS",
    note: "macOS 12 Monterey ou superior · Apple Silicon e Intel (.zip)",
    meta: "Versão mais recente · Binário Universal",
    url: LATEST_RELEASE_PAGE,
    available: false
  },
  linux: {
    label: "Baixar para Linux (AppImage)",
    heroLabel: "Baixar para Linux",
    note: "Distribuições Linux modernas (glibc 2.31+) · Pacote universal AppImage",
    meta: "Versão mais recente · 64-bit (.AppImage)",
    url: LATEST_RELEASE_PAGE,
    selectedFormat: "appimage",
    formats: {
      appimage: {
        shortLabel: "AppImage",
        label: "Baixar AppImage (x64)",
        heroLabel: "Baixar AppImage",
        note: "Universal para Ubuntu, Fedora, Arch, Debian · Executável sem instalação (.AppImage)",
        meta: "Versão mais recente · 64-bit (.AppImage)",
        url: LATEST_RELEASE_PAGE,
        available: false
      },
      flatpak: {
        shortLabel: "Flatpak",
        label: "Baixar Pacote Flatpak (.flatpak)",
        heroLabel: "Baixar Flatpak",
        note: "Pacote universal Linux (.flatpak)",
        meta: "Versão mais recente · 64-bit (.flatpak)",
        url: LATEST_RELEASE_PAGE,
        available: false
      },
      snap: {
        shortLabel: "Snap",
        label: "Baixar Pacote Snap (.snap)",
        heroLabel: "Baixar Snap",
        note: "Pacote Snap Linux (.snap)",
        meta: "Versão mais recente · 64-bit (.snap)",
        url: LATEST_RELEASE_PAGE,
        available: false
      },
      deb: {
        shortLabel: "Pacote .deb",
        label: "Baixar Pacote Debian (.deb)",
        heroLabel: "Baixar .deb",
        note: "Para Ubuntu, Debian, Linux Mint, Pop!_OS e derivados (.deb)",
        meta: "Versão mais recente · 64-bit (.deb)",
        url: LATEST_RELEASE_PAGE,
        available: false
      },
      targz: {
        shortLabel: "Arquivo .tar.gz",
        label: "Baixar Arquivo Tarball (.tar.gz)",
        heroLabel: "Baixar .tar.gz",
        note: "Binário puro compactado para execução manual (.tar.gz)",
        meta: "Versão mais recente · 64-bit (.tar.gz)",
        url: LATEST_RELEASE_PAGE,
        available: false
      }
    }
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
const windowsFormatsContainer = document.querySelector("#windows-formats");
const linuxFormatsContainer = document.querySelector("#linux-formats");
const downloadAltLinks = document.querySelector("#download-alt-links");
const formatPills = document.querySelectorAll(".format-pill");

function updateDownloadUI(platform) {
  const data = DOWNLOADS[platform];
  if (!data) return;

  buttons.forEach((item) => {
    const isSelected = item.dataset.platform === platform;
    item.classList.toggle("selected", isSelected);
    item.setAttribute("aria-selected", String(isSelected));
  });

  if (platform === "windows" || platform === "linux") {
    const isWindows = platform === "windows";
    if (windowsFormatsContainer) windowsFormatsContainer.style.display = isWindows ? "flex" : "none";
    if (linuxFormatsContainer) linuxFormatsContainer.style.display = isWindows ? "none" : "flex";

    const defaultKey = isWindows ? "setup" : "appimage";
    const fmtKey = data.selectedFormat || defaultKey;
    const fmt = data.formats[fmtKey] || data.formats[defaultKey];

    formatPills.forEach((pill) => {
      if (pill.dataset.platformTarget === platform) {
        pill.classList.toggle("active", pill.dataset.format === fmtKey);
      }
    });

    const isUnavailable = releaseFetched && !fmt.available;
    if (downloadLink) downloadLink.href = fmt.url;
    if (downloadLabel) {
      downloadLabel.textContent = isUnavailable
        ? `Ver ${fmt.shortLabel} no GitHub Releases`
        : fmt.label;
    }
    if (platformNote) platformNote.textContent = fmt.note;
    if (downloadMeta) {
      downloadMeta.textContent = isUnavailable
        ? `Arquivo ainda não anexado à release ${latestVersionTag || "atual"} — selecione outro formato abaixo ou acesse o GitHub`
        : fmt.meta;
    }

    if (heroDownloadBtn) heroDownloadBtn.href = fmt.url;
    if (heroDownloadText) heroDownloadText.textContent = fmt.heroLabel;

    if (downloadAltLinks) {
      const altKeys = Object.keys(data.formats).filter((key) => {
        if (key === fmtKey) return false;
        const item = data.formats[key];
        return releaseFetched ? item.available : true;
      });
      if (altKeys.length > 0) {
        const linksHtml = altKeys.map((key) => {
          const item = data.formats[key];
          return `<a href="${item.url}">${item.shortLabel}</a>`;
        });
        downloadAltLinks.innerHTML = `<span>Também disponível em: ${linksHtml.join(" · ")}</span>`;
      } else {
        downloadAltLinks.innerHTML = "";
      }
    }
  } else {
    if (windowsFormatsContainer) windowsFormatsContainer.style.display = "none";
    if (linuxFormatsContainer) linuxFormatsContainer.style.display = "none";
    if (downloadAltLinks) downloadAltLinks.innerHTML = "";

    if (downloadLink) downloadLink.href = data.url;
    if (downloadLabel) downloadLabel.textContent = data.label;
    if (platformNote) platformNote.textContent = data.note;
    if (downloadMeta) downloadMeta.textContent = data.meta;

    if (heroDownloadBtn) heroDownloadBtn.href = data.url;
    if (heroDownloadText) heroDownloadText.textContent = data.heroLabel;
  }
}

if (buttons.length > 0) {
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const platform = button.dataset.platform;
      updateDownloadUI(platform);
    });
  });
}

if (formatPills.length > 0) {
  formatPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const targetPlatform = pill.dataset.platformTarget || "linux";
      if (DOWNLOADS[targetPlatform] && DOWNLOADS[targetPlatform].formats) {
        DOWNLOADS[targetPlatform].selectedFormat = pill.dataset.format;
        updateDownloadUI(targetPlatform);
      }
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
    const version = data.tag_name || "v2.0.0";
    const assets = data.assets || [];
    latestVersionTag = version;
    releaseFetched = true;

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

      if (name.includes("portable") && name.endsWith(".zip") && name.includes("windows")) {
        DOWNLOADS.windows.formats.portable.url = downloadUrl;
        DOWNLOADS.windows.formats.portable.meta = `Versão ${version} · Portátil (.zip)`;
        DOWNLOADS.windows.formats.portable.available = true;
      } else if (name.includes("setup") && name.endsWith(".exe")) {
        DOWNLOADS.windows.formats.setup.url = downloadUrl;
        DOWNLOADS.windows.formats.setup.meta = `Versão ${version} · Setup NSIS (.exe)`;
        DOWNLOADS.windows.formats.setup.available = true;
        DOWNLOADS.windows.url = downloadUrl;
      } else if (name.endsWith(".msi")) {
        DOWNLOADS.windows.formats.msi.url = downloadUrl;
        DOWNLOADS.windows.formats.msi.meta = `Versão ${version} · Windows Installer (.msi)`;
        DOWNLOADS.windows.formats.msi.available = true;
      } else if (name.includes("windows") && name.endsWith(".exe")) {
        DOWNLOADS.windows.formats.exe.url = downloadUrl;
        DOWNLOADS.windows.formats.exe.meta = `Versão ${version} · x64 (.exe)`;
        DOWNLOADS.windows.formats.exe.available = true;
      } else if (name.includes("macos") || name.includes("darwin") || (name.endsWith(".zip") && !name.includes("portable"))) {
        DOWNLOADS.macos.url = downloadUrl;
        DOWNLOADS.macos.meta = `Versão ${version} · Universal (.zip)`;
        DOWNLOADS.macos.available = true;
      } else if (name.endsWith(".appimage")) {
        DOWNLOADS.linux.formats.appimage.url = downloadUrl;
        DOWNLOADS.linux.formats.appimage.meta = `Versão ${version} · x64 (.AppImage)`;
        DOWNLOADS.linux.formats.appimage.available = true;
      } else if (name.endsWith(".flatpak")) {
        DOWNLOADS.linux.formats.flatpak.url = downloadUrl;
        DOWNLOADS.linux.formats.flatpak.meta = `Versão ${version} · x64 (.flatpak)`;
        DOWNLOADS.linux.formats.flatpak.available = true;
      } else if (name.endsWith(".snap")) {
        DOWNLOADS.linux.formats.snap.url = downloadUrl;
        DOWNLOADS.linux.formats.snap.meta = `Versão ${version} · x64 (.snap)`;
        DOWNLOADS.linux.formats.snap.available = true;
      } else if (name.endsWith(".deb")) {
        DOWNLOADS.linux.formats.deb.url = downloadUrl;
        DOWNLOADS.linux.formats.deb.meta = `Versão ${version} · x64 (.deb)`;
        DOWNLOADS.linux.formats.deb.available = true;
      } else if (name.endsWith(".tar.gz")) {
        DOWNLOADS.linux.formats.targz.url = downloadUrl;
        DOWNLOADS.linux.formats.targz.meta = `Versão ${version} · x64 (.tar.gz)`;
        DOWNLOADS.linux.formats.targz.available = true;
      }
    });

    // Fallback automático caso o formato padrão (ex: Setup .exe ou .msi) não exista na release publicada
    const winFmt = DOWNLOADS.windows.formats[DOWNLOADS.windows.selectedFormat];
    if (!winFmt || !winFmt.available) {
      const firstWin = ["setup", "msi", "exe", "portable"].find((k) => DOWNLOADS.windows.formats[k].available);
      if (firstWin) {
        DOWNLOADS.windows.selectedFormat = firstWin;
      }
    }

    const linFmt = DOWNLOADS.linux.formats[DOWNLOADS.linux.selectedFormat];
    if (!linFmt || !linFmt.available) {
      const firstLin = ["appimage", "deb", "targz", "flatpak", "snap"].find((k) => DOWNLOADS.linux.formats[k].available);
      if (firstLin) {
        DOWNLOADS.linux.selectedFormat = firstLin;
      }
    }

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

// Menu Hambúrguer e Drawer Mobile Dinâmico
function initMobileMenu() {
  const toggleBtn = document.querySelector("#mobile-menu-toggle");
  const drawer = document.querySelector("#mobile-nav-drawer");
  const overlay = document.querySelector("#mobile-drawer-overlay");

  if (!toggleBtn || !drawer) return;

  function openMenu() {
    toggleBtn.classList.add("active");
    toggleBtn.setAttribute("aria-expanded", "true");
    drawer.classList.add("active");
    drawer.setAttribute("aria-hidden", "false");
    if (overlay) overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeMenu() {
    toggleBtn.classList.remove("active");
    toggleBtn.setAttribute("aria-expanded", "false");
    drawer.classList.remove("active");
    drawer.setAttribute("aria-hidden", "true");
    if (overlay) overlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  toggleBtn.addEventListener("click", () => {
    const isOpen = drawer.classList.contains("active");
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  if (overlay) {
    overlay.addEventListener("click", closeMenu);
  }

  // Fecha o drawer ao clicar em qualquer link de navegação
  const drawerLinks = drawer.querySelectorAll("a");
  drawerLinks.forEach((link) => {
    link.addEventListener("click", () => {
      closeMenu();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("active")) {
      closeMenu();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMobileMenu);
} else {
  initMobileMenu();
}