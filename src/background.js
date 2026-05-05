const STORAGE_KEY = "workspaces";
const TAB_WORKSPACE_MAP_KEY = "tabWorkspaceMap";
const DEFAULT_THEME_COLOR = "#0f7f79";

async function getWorkspaces() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] ?? [];
}

async function saveWorkspaces(workspaces) {
  await chrome.storage.local.set({ [STORAGE_KEY]: workspaces });
}

async function getTabWorkspaceMap() {
  const data = await chrome.storage.local.get(TAB_WORKSPACE_MAP_KEY);
  return data[TAB_WORKSPACE_MAP_KEY] ?? {};
}

async function saveTabWorkspaceMap(map) {
  await chrome.storage.local.set({ [TAB_WORKSPACE_MAP_KEY]: map });
}

// Chrome tab-group colors accepted by the tabGroups API.
const HEX_TO_TAB_GROUP_COLOR = {
  "#0f7f79": "cyan",
  "#1e6aa8": "blue",
  "#2e8b57": "green",
  "#8a5cf6": "purple",
  "#e67e22": "orange",
  "#d35454": "red",
  "#f4c542": "yellow",
  "#5d6d7e": "grey",
  "#16a085": "cyan",
  "#2980b9": "blue",
  "#27ae60": "green",
  "#7f8c8d": "grey",
  "#c0392b": "red",
  "#8e44ad": "purple",
  "#34495e": "grey"
};

function hexToTabGroupColor(hexColor) {
  return HEX_TO_TAB_GROUP_COLOR[String(hexColor).toLowerCase()] ?? "blue";
}

function normalizeThemeColor(color) {
  if (typeof color !== "string") {
    return DEFAULT_THEME_COLOR;
  }

  const clean = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
    return clean.toLowerCase();
  }

  return DEFAULT_THEME_COLOR;
}

function generateId() {
  return crypto.randomUUID();
}

async function collectCurrentWindowTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const serializedTabs = [];

  for (const tab of tabs) {
    let group = null;

    if (typeof tab.groupId === "number" && tab.groupId >= 0) {
      try {
        group = await chrome.tabGroups.get(tab.groupId);
      } catch (_error) {
        group = null;
      }
    }

    serializedTabs.push({
      url: tab.url,
      title: tab.title,
      pinned: tab.pinned,
      muted: tab.mutedInfo?.muted ?? false,
      group: group
        ? {
            title: group.title,
            color: group.color,
            collapsed: group.collapsed
          }
        : null
    });
  }

  return serializedTabs.filter((tab) => /^https?:/i.test(tab.url));
}

async function serializeTab(tab) {
  if (!tab || typeof tab.url !== "string" || !/^https?:/i.test(tab.url)) {
    throw new Error("Aba ativa invalida para salvar no workspace.");
  }

  let group = null;

  if (typeof tab.groupId === "number" && tab.groupId >= 0) {
    try {
      group = await chrome.tabGroups.get(tab.groupId);
    } catch (_error) {
      group = null;
    }
  }

  return {
    url: tab.url,
    title: tab.title,
    pinned: tab.pinned,
    muted: tab.mutedInfo?.muted ?? false,
    group: group
      ? {
          title: group.title,
          color: group.color,
          collapsed: group.collapsed
        }
      : null
  };
}

async function addActiveTabToWorkspace(workspaceId) {
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    throw new Error("Workspace nao encontrado.");
  }

  const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
  const activeTab = currentWindowTabs
    .filter((tab) => typeof tab.url === "string" && /^https?:/i.test(tab.url))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  const serialized = await serializeTab(activeTab);

  if (!Array.isArray(workspace.tabs)) {
    workspace.tabs = [];
  }

  const alreadyExists = workspace.tabs.some((tab) => tab.url === serialized.url);

  if (alreadyExists) {
    throw new Error("Essa aba ja existe neste workspace.");
  }

  workspace.tabs.push(serialized);
  workspace.updatedAt = new Date().toISOString();
  await saveWorkspaces(workspaces);

  if (typeof activeTab?.id === "number") {
    const tabWorkspaceMap = await getTabWorkspaceMap();
    tabWorkspaceMap[String(activeTab.id)] = {
      workspaceId,
      url: serialized.url
    };
    await saveTabWorkspaceMap(tabWorkspaceMap);
  }

  return workspace;
}

async function saveCurrentWindowAsWorkspace(name, themeColor) {
  const tabs = await collectCurrentWindowTabs();

  if (!tabs.length) {
    throw new Error("Nenhuma aba HTTP/HTTPS para salvar neste workspace.");
  }

  const now = new Date().toISOString();
  const workspace = {
    id: generateId(),
    name: name?.trim() || `Workspace ${new Date().toLocaleString()}`,
    themeColor: normalizeThemeColor(themeColor),
    createdAt: now,
    updatedAt: now,
    tabs
  };

  const workspaces = await getWorkspaces();
  workspaces.unshift(workspace);
  await saveWorkspaces(workspaces);

  return workspace;
}

async function openWorkspace(workspaceId, openInNewWindow = true) {
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    throw new Error("Workspace nao encontrado.");
  }

  const urls = workspace.tabs.map((tab) => tab.url).filter(Boolean);

  if (!urls.length) {
    throw new Error("Workspace sem abas validas para abrir.");
  }

  const openedTabs = [];
  let targetWindowId;

  if (openInNewWindow) {
    const createdWindow = await chrome.windows.create({ url: urls });
    targetWindowId = createdWindow.id;
    const createdTabs = createdWindow.tabs ?? [];

    // Tabs from a newly created window may still be loading, so tab.url can be
    // empty. Match them by position against the requested urls array instead.
    for (let i = 0; i < createdTabs.length; i++) {
      const tab = createdTabs[i];
      if (typeof tab.id === "number") {
        openedTabs.push({ id: tab.id, url: urls[i] ?? tab.url ?? "" });
      }
    }
  } else {
    const currentWindow = await chrome.windows.getCurrent();
    targetWindowId = currentWindow.id;

    for (const url of urls) {
      const createdTab = await chrome.tabs.create({ url });

      if (typeof createdTab.id === "number") {
        // pendingUrl holds the target URL while the tab is still loading.
        openedTabs.push({ id: createdTab.id, url: createdTab.pendingUrl || createdTab.url || url });
      }
    }
  }

  if (openedTabs.length) {
    const tabWorkspaceMap = await getTabWorkspaceMap();

    for (const tab of openedTabs) {
      tabWorkspaceMap[String(tab.id)] = {
        workspaceId,
        url: tab.url
      };
    }

    await saveTabWorkspaceMap(tabWorkspaceMap);

    // Group all opened tabs visually with the workspace name and theme color.
    try {
      const tabIds = openedTabs.map((tab) => tab.id);
      const groupId = await chrome.tabs.group({
        tabIds,
        createProperties: { windowId: targetWindowId }
      });
      await chrome.tabGroups.update(groupId, {
        title: workspace.name,
        color: hexToTabGroupColor(workspace.themeColor),
        collapsed: false
      });
    } catch (_groupError) {
      // Tab grouping is a best-effort enhancement; do not fail the open action.
    }
  }

  return { ok: true };
}

async function deleteWorkspace(workspaceId) {
  const workspaces = await getWorkspaces();
  const filtered = workspaces.filter((item) => item.id !== workspaceId);
  await saveWorkspaces(filtered);
  return { ok: true };
}

async function renameWorkspace(workspaceId, newName) {
  const cleanName = newName?.trim();

  if (!cleanName) {
    throw new Error("Nome do workspace nao pode ser vazio.");
  }

  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    throw new Error("Workspace nao encontrado.");
  }

  workspace.name = cleanName;
  workspace.updatedAt = new Date().toISOString();
  await saveWorkspaces(workspaces);

  return workspace;
}

async function updateWorkspaceFromCurrentWindow(workspaceId) {
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    throw new Error("Workspace nao encontrado.");
  }

  const tabs = await collectCurrentWindowTabs();

  if (!tabs.length) {
    throw new Error("Nenhuma aba HTTP/HTTPS para atualizar neste workspace.");
  }

  workspace.tabs = tabs;
  workspace.updatedAt = new Date().toISOString();
  await saveWorkspaces(workspaces);

  return workspace;
}

async function setWorkspaceThemeColor(workspaceId, themeColor) {
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    throw new Error("Workspace nao encontrado.");
  }

  workspace.themeColor = normalizeThemeColor(themeColor);
  workspace.updatedAt = new Date().toISOString();
  await saveWorkspaces(workspaces);

  return workspace;
}

async function removeClosedTabFromWorkspace(tabId) {
  const tabWorkspaceMap = await getTabWorkspaceMap();
  const mapping = tabWorkspaceMap[String(tabId)];

  if (!mapping) {
    return;
  }

  delete tabWorkspaceMap[String(tabId)];
  await saveTabWorkspaceMap(tabWorkspaceMap);

  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((item) => item.id === mapping.workspaceId);

  if (!workspace || !Array.isArray(workspace.tabs) || !workspace.tabs.length) {
    return;
  }

  const index = workspace.tabs.findIndex((tab) => tab.url === mapping.url);

  if (index < 0) {
    return;
  }

  workspace.tabs.splice(index, 1);
  workspace.updatedAt = new Date().toISOString();
  await saveWorkspaces(workspaces);
}

async function importWorkspaces(raw) {
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    throw new Error("JSON invalido.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Formato invalido: esperado um array.");
  }

  const normalized = parsed
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const tabs = Array.isArray(item.tabs)
        ? item.tabs.filter((tab) => tab && typeof tab.url === "string")
        : [];

      return {
        id: typeof item.id === "string" ? item.id : generateId(),
        name: typeof item.name === "string" ? item.name : "Workspace importado",
        themeColor: normalizeThemeColor(item.themeColor),
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tabs
      };
    })
    .filter((item) => item.tabs.length > 0);

  const current = await getWorkspaces();
  await saveWorkspaces([...normalized, ...current]);

  return { imported: normalized.length };
}

async function createEmptyWorkspace(name, themeColor) {
  const now = new Date().toISOString();
  const workspace = {
    id: generateId(),
    name: name?.trim() || `Workspace ${new Date().toLocaleString()}`,
    themeColor: normalizeThemeColor(themeColor),
    createdAt: now,
    updatedAt: now,
    tabs: [{ url: "https://www.google.com", title: "Google", pinned: false, muted: false, group: null }]
  };

  const workspaces = await getWorkspaces();
  workspaces.unshift(workspace);
  await saveWorkspaces(workspaces);

  return workspace;
}

async function exportWorkspaces() {
  const workspaces = await getWorkspaces();
  return JSON.stringify(workspaces, null, 2);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = {
    getWorkspaces,
    saveCurrentWindowAsWorkspace: () => saveCurrentWindowAsWorkspace(message.name, message.themeColor),
    openWorkspace: () => openWorkspace(message.workspaceId, message.openInNewWindow),
    deleteWorkspace: () => deleteWorkspace(message.workspaceId),
    renameWorkspace: () => renameWorkspace(message.workspaceId, message.newName),
    updateWorkspaceFromCurrentWindow: () => updateWorkspaceFromCurrentWindow(message.workspaceId),
    addActiveTabToWorkspace: () => addActiveTabToWorkspace(message.workspaceId),
    setWorkspaceThemeColor: () => setWorkspaceThemeColor(message.workspaceId, message.themeColor),
    importWorkspaces: () => importWorkspaces(message.raw),
    exportWorkspaces,
    createEmptyWorkspace: () => createEmptyWorkspace(message.name, message.themeColor)
  };

  const handler = handlers[message?.action];

  if (!handler) {
    sendResponse({ ok: false, error: "Acao nao suportada." });
    return;
  }

  handler()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

// When a new tab is created in a window that belongs to a workspace, add it to
// the tab group automatically so the visual grouping stays consistent.
async function autoAddTabToWorkspace(tab) {
  const windowId = tab.windowId;
  if (!windowId) return;

  const tabWorkspaceMap = await getTabWorkspaceMap();

  // Find the workspaceId by looking at sibling tabs already in the map.
  const windowTabs = await chrome.tabs.query({ windowId });
  let workspaceId = null;
  let existingGroupId = null;

  for (const sibling of windowTabs) {
    if (sibling.id === tab.id) continue;
    const entry = tabWorkspaceMap[String(sibling.id)];
    if (entry) {
      workspaceId = entry.workspaceId;
      if (typeof sibling.groupId === "number" && sibling.groupId >= 0) {
        existingGroupId = sibling.groupId;
      }
      break;
    }
  }

  if (!workspaceId) return;

  // Track the new tab in the map with whatever URL is available now.
  const initialUrl = tab.pendingUrl || tab.url || "";
  tabWorkspaceMap[String(tab.id)] = { workspaceId, url: initialUrl };
  await saveTabWorkspaceMap(tabWorkspaceMap);

  // If the tab already has a real HTTP URL, add it to the workspace tab list now.
  if (/^https?:\/\//i.test(initialUrl)) {
    const workspaces = await getWorkspaces();
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (workspace && !workspace.tabs.some((t) => t.url === initialUrl)) {
      workspace.tabs.push({ url: initialUrl, title: tab.title || initialUrl, pinned: tab.pinned || false, muted: false, group: null });
      workspace.updatedAt = new Date().toISOString();
      await saveWorkspaces(workspaces);
    }
  }

  // Join the existing tab group so the visual color is applied.
  if (existingGroupId !== null) {
    try {
      await chrome.tabs.group({ tabIds: [tab.id], groupId: existingGroupId });
    } catch (_e) {
      // Best-effort.
    }
  }
}

// When a tracked tab navigates to an HTTP URL (e.g. a new tab page that the
// user directed to a real site), add or update its entry in the workspace.
async function syncTabUrlInWorkspace(tabId, changeInfo) {
  const newUrl = changeInfo.url;
  if (!newUrl || !/^https?:\/\//i.test(newUrl)) return;

  const tabWorkspaceMap = await getTabWorkspaceMap();
  const entry = tabWorkspaceMap[String(tabId)];
  if (!entry) return;

  const { workspaceId, url: oldUrl } = entry;

  // Update the URL stored in the map.
  tabWorkspaceMap[String(tabId)].url = newUrl;
  await saveTabWorkspaceMap(tabWorkspaceMap);

  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return;

  const existing = workspace.tabs.find((t) => t.url === oldUrl);
  if (existing) {
    // Update the existing entry (tab navigated to a new URL).
    existing.url = newUrl;
  } else if (!workspace.tabs.some((t) => t.url === newUrl)) {
    // Tab was tracked but had no real URL yet (was new-tab page).
    workspace.tabs.push({ url: newUrl, title: newUrl, pinned: false, muted: false, group: null });
  }

  workspace.updatedAt = new Date().toISOString();
  await saveWorkspaces(workspaces);
}

chrome.tabs.onCreated.addListener((tab) => {
  autoAddTabToWorkspace(tab).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  syncTabUrlInWorkspace(tabId, changeInfo).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeClosedTabFromWorkspace(tabId).catch(() => {
    // Ignore silent sync failures for close events.
  });
});
