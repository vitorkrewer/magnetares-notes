// Substitua os valores abaixo pelos links reais dos releases no GitHub.
const DOWNLOADS = {
  windows: {
    label: "Baixar para Windows",
    note: "Windows 10 ou superior · Instalador nativo",
    meta: "Versão 1.0.0 · x64",
    url: "#"
  },
  macos: {
    label: "Baixar para macOS",
    note: "macOS 12 ou superior · Apple Silicon e Intel",
    meta: "Versão 1.0.0 · Universal",
    url: "#"
  },
  linux: {
    label: "Baixar para Linux",
    note: "Linux moderno · Pacote portátil",
    meta: "Versão 1.0.0 · x64",
    url: "#"
  }
};

const buttons = document.querySelectorAll(".platform");
const downloadLink = document.querySelector("#download-link");
const downloadLabel = document.querySelector("#download-label");
const platformNote = document.querySelector("#platform-note");
const downloadMeta = document.querySelector("#download-meta");

if (buttons.length > 0 && downloadLink) {
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const platform = button.dataset.platform;
      const data = DOWNLOADS[platform];
      if (!data) return;

      buttons.forEach((item) => {
        item.classList.toggle("selected", item === button);
        item.setAttribute("aria-selected", String(item === button));
      });

      if (downloadLink) downloadLink.href = data.url;
      if (downloadLabel) downloadLabel.textContent = data.label;
      if (platformNote) platformNote.textContent = data.note;
      if (downloadMeta) downloadMeta.textContent = data.meta;
    });
  });
}

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