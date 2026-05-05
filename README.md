# Workspace Manager for Chrome

Extensao Chrome para gerenciar espacos de trabalho de abas, inspirada no Workspaces do Microsoft Edge.

## Recursos

- Salvar a janela atual como workspace.
- Abrir workspace em nova janela ou adicionar abas na janela atual.
- Atualizar, renomear e excluir workspace.
- Painel de gerenciamento completo em pagina de opcoes.
- Importar e exportar workspaces em JSON.

## Estrutura

- `manifest.json`: manifesto da extensao (MV3)
- `src/background.js`: logica principal e persistencia
- `src/popup/*`: interface rapida no popup da extensao
- `src/options/*`: painel completo de gerenciamento

## Como instalar no Chrome (modo desenvolvedor)

1. Abra `chrome://extensions`.
2. Ative o modo **Developer mode**.
3. Clique em **Load unpacked**.
4. Selecione esta pasta: `workspace-extension`.

## Como usar

1. Abra as abas que deseja agrupar em um workspace.
2. Clique no icone da extensao.
3. Digite um nome e clique em **Salvar atual**.
4. Para gerenciar, clique em **Gerenciar** no popup.

## Limitacoes atuais

- Apenas abas com URL `http` e `https` sao salvas.
- O agrupamento visual de abas do Chrome (tab groups) e salvo como metadado, mas a recriacao automatica dos grupos ao abrir workspace pode variar por versao do navegador.

## Ideias para evolucao

- Sincronizacao com `chrome.storage.sync`.
- Tags e categorias por workspace.
- Atalhos de teclado para abrir workspaces favoritos.
- Recriacao completa de grupos de abas na restauracao.
