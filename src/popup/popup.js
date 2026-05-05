const $ = (selector) => document.querySelector(selector);

const workspaceListEl = $("#workspaceList");
const workspaceNameEl = $("#workspaceName");
const selectThemeColorButtonEl = $("#selectThemeColorButton");
const saveButtonEl = $("#saveWorkspaceButton");
const saveEmptyButtonEl = $("#saveEmptyWorkspaceButton");
const statusEl = $("#status");
const openOptionsEl = $("#openOptions");

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

let selectedNewWorkspaceColor = COLOR_PALETTE[0];
let disposePalette = null;

function formatDate(dateIso) {
  try {
    return new Date(dateIso).toLocaleString();
  } catch (_error) {
    return "-";
  }
}

function setStatus(message, type = "ok") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

async function send(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...payload });

  if (!response?.ok) {
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
      swatch.style.outline = "2px solid #2d2117";
    }

    swatch.addEventListener("click", async (event) => {
      event.stopPropagation();
      closePalette();
      await onPick(color);
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

function createWorkspaceItem(workspace) {
  const item = document.createElement("article");
  item.className = "workspace-item";
  item.style.borderLeftColor = workspace.themeColor || "#0f7f79";

  const titleRow = document.createElement("div");
  titleRow.className = "workspace-title-row";

  const themeDot = document.createElement("span");
  themeDot.className = "theme-dot";
  themeDot.style.backgroundColor = workspace.themeColor || "#0f7f79";

  const title = document.createElement("h3");
  title.textContent = workspace.name;

  const meta = document.createElement("p");
  meta.className = "workspace-meta";
  meta.textContent = `${workspace.tabs.length} abas • Atualizado em ${formatDate(workspace.updatedAt)}`;

  const actions = document.createElement("div");
  actions.className = "workspace-actions";

  const openNewWindowButton = document.createElement("button");
  setIconButton(openNewWindowButton, "🗔", "Abrir em nova janela");
  openNewWindowButton.addEventListener("click", async () => {
    await send("openWorkspace", { workspaceId: workspace.id, openInNewWindow: true });
    setStatus("Workspace aberto em nova janela.");
  });

  const openCurrentWindowButton = document.createElement("button");
  setIconButton(openCurrentWindowButton, "📥", "Adicionar abas na janela atual", "alt");
  openCurrentWindowButton.addEventListener("click", async () => {
    await send("openWorkspace", { workspaceId: workspace.id, openInNewWindow: false });
    setStatus("Abas adicionadas na janela atual.");
  });

  const updateButton = document.createElement("button");
  setIconButton(updateButton, "↻", "Atualizar com janela atual", "alt");
  updateButton.addEventListener("click", async () => {
    await send("updateWorkspaceFromCurrentWindow", { workspaceId: workspace.id });
    setStatus("Workspace atualizado a partir da janela atual.");
    await renderWorkspaces();
  });

  const addCurrentTabButton = document.createElement("button");
  setIconButton(addCurrentTabButton, "➕", "Adicionar aba atual", "alt");
  addCurrentTabButton.addEventListener("click", async () => {
    await send("addActiveTabToWorkspace", { workspaceId: workspace.id });
    setStatus("Aba atual adicionada ao workspace.");
    await renderWorkspaces();
  });

  const renameButton = document.createElement("button");
  setIconButton(renameButton, "✎", "Renomear workspace", "alt");
  renameButton.addEventListener("click", async () => {
    const nextName = prompt("Novo nome do workspace:", workspace.name);

    if (!nextName) {
      return;
    }

    await send("renameWorkspace", { workspaceId: workspace.id, newName: nextName });
    setStatus("Workspace renomeado.");
    await renderWorkspaces();
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
    await renderWorkspaces();
  });

  const colorButton = document.createElement("button");
  setIconButton(colorButton, "🎨", "Alterar cor do tema", "alt");
  colorButton.addEventListener("click", async () => {
    openPalette(colorButton, workspace.themeColor || COLOR_PALETTE[0], async (nextColor) => {
      await send("setWorkspaceThemeColor", {
        workspaceId: workspace.id,
        themeColor: nextColor
      });
      setStatus("Cor do workspace atualizada.");
      await renderWorkspaces();
    });
  });

  actions.append(
    openNewWindowButton,
    openCurrentWindowButton,
    addCurrentTabButton,
    updateButton,
    renameButton,
    colorButton,
    deleteButton
  );

  titleRow.append(themeDot, title);
  item.append(titleRow, meta, actions);

  return item;
}

async function renderWorkspaces() {
  workspaceListEl.innerHTML = "";

  const workspaces = await send("getWorkspaces");

  if (!workspaces.length) {
    const empty = document.createElement("p");
    empty.className = "workspace-meta";
    empty.textContent = "Nenhum workspace salvo por enquanto.";
    workspaceListEl.append(empty);
    return;
  }

  for (const workspace of workspaces) {
    workspaceListEl.append(createWorkspaceItem(workspace));
  }
}

saveButtonEl.addEventListener("click", async () => {
  try {
    const name = workspaceNameEl.value;
    const themeColor = selectedNewWorkspaceColor;
    await send("saveCurrentWindowAsWorkspace", { name, themeColor });
    workspaceNameEl.value = "";
    setStatus("Workspace salvo com sucesso.");
    await renderWorkspaces();
  } catch (error) {
    setStatus(error.message || "Falha ao salvar workspace.", "error");
  }
});

saveEmptyButtonEl.addEventListener("click", async () => {
  try {
    const name = workspaceNameEl.value;
    const themeColor = selectedNewWorkspaceColor;
    await send("createEmptyWorkspace", { name, themeColor });
    workspaceNameEl.value = "";
    setStatus("Workspace vazio criado.");
    await renderWorkspaces();
  } catch (error) {
    setStatus(error.message || "Falha ao criar workspace vazio.", "error");
  }
});

openOptionsEl.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

selectThemeColorButtonEl.style.backgroundColor = selectedNewWorkspaceColor;
selectThemeColorButtonEl.addEventListener("click", () => {
  openPalette(selectThemeColorButtonEl, selectedNewWorkspaceColor, async (nextColor) => {
    selectedNewWorkspaceColor = nextColor;
    selectThemeColorButtonEl.style.backgroundColor = nextColor;
  });
});

(async function init() {
  try {
    await renderWorkspaces();
  } catch (error) {
    setStatus(error.message || "Erro ao carregar workspaces.", "error");
  }
})();
