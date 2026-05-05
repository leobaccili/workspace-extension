const $ = (selector) => document.querySelector(selector);

const listEl = $("#workspaceList");
const statusEl = $("#status");
const searchInputEl = $("#searchInput");
const exportButtonEl = $("#exportButton");
const importInputEl = $("#importInput");

const COLOR_PALETTE = [
  "#0f7f79",
  "#1e6aa8",
  "#2e8b57",
  "#8a5cf6",
  "#e67e22",
  "#d35454",
  "#f4c542",
  "#5d6d7e",
  "#16a085",
  "#2980b9",
  "#27ae60",
  "#7f8c8d",
  "#c0392b",
  "#8e44ad",
  "#34495e"
];

let allWorkspaces = [];
let disposePalette = null;

function setStatus(message, type = "ok") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function formatDate(dateIso) {
  try {
    return new Date(dateIso).toLocaleString();
  } catch (_error) {
    return "-";
  }
}

async function send(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...payload });

  if (!response?.ok) {
    if (response?.error === "Acao nao suportada.") {
      throw new Error(
        `Acao "${action}" nao suportada no service worker. Recarregue a extensao em chrome://extensions e tente novamente.`
      );
    }

    throw new Error(response?.error || "Falha na comunicacao com a extensao.");
  }

  return response.data;
}

function setIconButton(button, icon, title, className = "") {
  button.textContent = icon;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.className = `icon-btn ${className}`.trim();
}

function closePalette() {
  if (disposePalette) {
    disposePalette();
    disposePalette = null;
  }
}

function openPalette(anchorButton, currentColor, onPick) {
  closePalette();

  const popover = document.createElement("div");
  popover.className = "color-popover";

  for (const color of COLOR_PALETTE) {
    const swatch = document.createElement("button");
    swatch.className = "swatch-btn";
    swatch.style.backgroundColor = color;
    swatch.title = color;
    swatch.setAttribute("aria-label", `Selecionar cor ${color}`);

    if (color.toLowerCase() === String(currentColor || "").toLowerCase()) {
      swatch.style.outline = "2px solid #2e221a";
    }

    swatch.addEventListener("click", async (event) => {
      event.stopPropagation();
      closePalette();

      try {
        await onPick(color);
      } catch (error) {
        setStatus(error.message || "Falha ao atualizar cor do workspace.", "error");
      }
    });

    popover.append(swatch);
  }

  document.body.append(popover);

  const rect = anchorButton.getBoundingClientRect();
  const maxLeft = window.innerWidth - popover.offsetWidth - 8;
  const left = Math.max(8, Math.min(rect.left, maxLeft));
  const top = Math.max(8, rect.bottom + 6);

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  const onDocumentClick = (event) => {
    const target = event.target;
    if (target === anchorButton || anchorButton.contains(target) || popover.contains(target)) {
      return;
    }
    closePalette();
  };

  const onEscape = (event) => {
    if (event.key === "Escape") {
      closePalette();
    }
  };

  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onEscape, true);

  disposePalette = () => {
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onEscape, true);
    popover.remove();
  };
}

function downloadTextAsFile(fileName, content) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createCard(workspace) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.borderLeftColor = workspace.themeColor || "#0f7f79";

  const titleRow = document.createElement("div");
  titleRow.className = "title-row";

  const themeDot = document.createElement("span");
  themeDot.className = "theme-dot";
  themeDot.style.backgroundColor = workspace.themeColor || "#0f7f79";

  const title = document.createElement("h3");
  title.textContent = workspace.name;

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `${workspace.tabs.length} abas • Atualizado em ${formatDate(workspace.updatedAt)}`;

  const actions = document.createElement("div");
  actions.className = "actions";

  const openButton = document.createElement("button");
  setIconButton(openButton, "🗔", "Abrir em nova janela");
  openButton.addEventListener("click", async () => {
    await send("openWorkspace", { workspaceId: workspace.id, openInNewWindow: true });
    setStatus("Workspace aberto em nova janela.");
  });

  const addCurrentTabButton = document.createElement("button");
  setIconButton(addCurrentTabButton, "➕", "Adicionar aba atual");
  addCurrentTabButton.addEventListener("click", async () => {
    await send("addActiveTabToWorkspace", { workspaceId: workspace.id });
    setStatus("Aba atual adicionada ao workspace.");
    await loadWorkspaces();
  });

  const renameButton = document.createElement("button");
  setIconButton(renameButton, "✎", "Renomear workspace");
  renameButton.addEventListener("click", async () => {
    const nextName = prompt("Novo nome:", workspace.name);

    if (!nextName) {
      return;
    }

    await send("renameWorkspace", { workspaceId: workspace.id, newName: nextName });
    setStatus("Workspace renomeado.");
    await loadWorkspaces();
  });

  const colorButton = document.createElement("button");
  setIconButton(colorButton, "🎨", "Alterar cor do tema");
  colorButton.addEventListener("click", () => {
    openPalette(colorButton, workspace.themeColor || COLOR_PALETTE[0], async (nextColor) => {
      await send("setWorkspaceThemeColor", {
        workspaceId: workspace.id,
        themeColor: nextColor
      });
      setStatus("Cor do workspace atualizada.");
      await loadWorkspaces();
    });
  });

  const updateButton = document.createElement("button");
  setIconButton(updateButton, "↻", "Atualizar com janela atual");
  updateButton.addEventListener("click", async () => {
    await send("updateWorkspaceFromCurrentWindow", { workspaceId: workspace.id });
    setStatus("Workspace atualizado.");
    await loadWorkspaces();
  });

  const deleteButton = document.createElement("button");
  setIconButton(deleteButton, "🗑", "Excluir workspace", "warn");
  deleteButton.addEventListener("click", async () => {
    const accepted = confirm(`Excluir workspace "${workspace.name}"?`);

    if (!accepted) {
      return;
    }

    await send("deleteWorkspace", { workspaceId: workspace.id });
    setStatus("Workspace excluido.");
    await loadWorkspaces();
  });

  actions.append(openButton, addCurrentTabButton, renameButton, colorButton, updateButton, deleteButton);
  titleRow.append(themeDot, title);
  card.append(titleRow, meta, actions);

  return card;
}

function renderList() {
  listEl.innerHTML = "";

  const query = searchInputEl.value.trim().toLowerCase();
  const filtered = query
    ? allWorkspaces.filter((workspace) => workspace.name.toLowerCase().includes(query))
    : allWorkspaces;

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = query
      ? "Nenhum workspace encontrado para a busca."
      : "Nenhum workspace salvo.";
    listEl.append(empty);
    return;
  }

  for (const workspace of filtered) {
    listEl.append(createCard(workspace));
  }
}

async function loadWorkspaces() {
  allWorkspaces = await send("getWorkspaces");
  renderList();
}

exportButtonEl.addEventListener("click", async () => {
  try {
    const content = await send("exportWorkspaces");
    const fileName = `workspaces-${new Date().toISOString().slice(0, 10)}.json`;
    downloadTextAsFile(fileName, content);
    setStatus("Exportacao concluida.");
  } catch (error) {
    setStatus(error.message || "Falha ao exportar.", "error");
  }
});

importInputEl.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const result = await send("importWorkspaces", { raw: text });
    setStatus(`${result.imported} workspaces importados.`);
    await loadWorkspaces();
  } catch (error) {
    setStatus(error.message || "Falha ao importar.", "error");
  } finally {
    importInputEl.value = "";
  }
});

searchInputEl.addEventListener("input", () => {
  renderList();
});

(async function init() {
  try {
    await loadWorkspaces();
  } catch (error) {
    setStatus(error.message || "Erro ao carregar workspaces.", "error");
  }
})();
