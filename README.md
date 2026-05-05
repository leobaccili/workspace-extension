# Workspace Manager para Chrome

Extensão Chrome (Manifest V3) para salvar e restaurar conjuntos de abas como **workspaces**, com cores temáticas, agrupamento visual e sincronização automática — inspirada nos Workspaces do Microsoft Edge.

---

## Funcionalidades

| Recurso | Descrição |
|---|---|
| 💾 Salvar janela atual | Cria um workspace com todas as abas HTTP/HTTPS abertas |
| 📄 Criar workspace vazio | Cria um workspace em branco (somente `google.com`) |
| 🗔 Abrir em nova janela | Abre todas as abas do workspace numa janela separada |
| 📥 Adicionar à janela atual | Injeta as abas do workspace na janela em uso |
| ➕ Adicionar aba atual | Insere a aba ativa em um workspace existente |
| ↻ Atualizar workspace | Substitui as abas salvas pelas da janela atual |
| ✎ Renomear | Altera o nome do workspace |
| 🎨 Cor temática | Define uma das 15 cores; aplicada como grupo de abas no Chrome |
| 🗑 Excluir | Remove o workspace permanentemente |
| Remoção automática | Ao fechar uma aba, ela é removida do workspace automaticamente |
| Adição automática | Nova aba aberta em janela de workspace entra no grupo colorido |
| Importar / Exportar | Backup e restauração completa em JSON |

---

## Cor temática e grupos de abas

Ao abrir um workspace, todas as abas são automaticamente agrupadas no Chrome com o **nome** e a **cor** do workspace. Isso cria uma faixa colorida visível na barra de abas — próximo ao comportamento do Edge Workspaces.

As 15 cores da paleta são mapeadas para as cores oficiais da API `chrome.tabGroups` (`cyan`, `blue`, `green`, `purple`, `orange`, `red`, `yellow`, `grey`).

> O Chrome não permite colorir a barra de título da janela via extensão MV3; o agrupamento de abas é a alternativa mais próxima disponível.

---

## Estrutura do projeto

```
workspace-extension/
├── manifest.json          # Manifesto MV3
└── src/
    ├── background.js      # Service worker — toda a lógica de negócio e persistência
    ├── popup/
    │   ├── popup.html     # Interface rápida do popup
    │   ├── popup.css      # Estilos do popup
    │   └── popup.js       # Lógica do popup
    └── options/
        ├── options.html   # Painel completo de gerenciamento
        ├── options.css    # Estilos da página de opções
        └── options.js     # Lógica da página de opções
```

---

## Instalação (modo desenvolvedor)

1. Acesse `chrome://extensions` no Chrome.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** (*Load unpacked*).
4. Selecione a pasta `workspace-extension`.
5. O ícone da extensão aparecerá na barra de ferramentas.

Para recarregar após alterações no código, clique no botão de atualização (⟳) na página `chrome://extensions`.

---

## Como usar

### Criar um workspace

1. Abra as abas que deseja salvar.
2. Clique no ícone da extensão.
3. Digite um nome (opcional) e escolha uma cor clicando no círculo colorido.
4. Clique em **💾** para salvar as abas atuais, ou em **📄** para criar um workspace vazio.

### Abrir um workspace

- **🗔** abre numa nova janela, com as abas agrupadas pela cor do workspace.
- **📥** adiciona as abas na janela atual.

### Gerenciar workspaces

Clique em **Gerenciar** no popup para abrir a página de opções completa, onde é possível buscar, reordenar, importar e exportar.

---

## Permissões utilizadas

| Permissão | Motivo |
|---|---|
| `storage` | Salvar workspaces e mapeamento de abas |
| `tabs` | Ler, criar e monitorar abas |
| `tabGroups` | Criar e colorir grupos de abas |
| `windows` | Criar novas janelas ao abrir workspaces |
| `<all_urls>` | Necessário para acessar URLs das abas |

---

## Limitações

- Apenas abas com URLs `http://` e `https://` são salvas (abas internas do Chrome como `chrome://newtab` são ignoradas).
- O Chrome não permite colorir a janela inteira via extensão MV3 — apenas grupos de abas.
- A sincronização automática de abas depende de `chrome.tabs.onCreated` e `chrome.tabs.onUpdated`, que exigem que o service worker esteja ativo.

---

## Possíveis melhorias futuras

- Sincronização entre dispositivos via `chrome.storage.sync`.
- Atalhos de teclado para abrir workspaces favoritos.
- Tags e filtros por categoria.
- Reordenação de workspaces por arrastar e soltar.
- Ícone personalizado por workspace.
