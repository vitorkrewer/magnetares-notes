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

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const platform = button.dataset.platform;
    const data = DOWNLOADS[platform];
    if (!data) return;

    buttons.forEach((item) => {
      item.classList.toggle("selected", item === button);
      item.setAttribute("aria-selected", String(item === button));
    });

    downloadLink.href = data.url;
    downloadLabel.textContent = data.label;
    platformNote.textContent = data.note;
    downloadMeta.textContent = data.meta;
  });
});

document.querySelector("#year").textContent = new Date().getFullYear();