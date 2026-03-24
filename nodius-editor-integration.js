/**
 * nodius-editor-integration.js
 *
 * Remplacement 1-pour-1 du bloc CKEditor dans l'outil de création de graphes.
 *
 * Stratégie de chargement (pas de CDN pour @nodius/editor) :
 *   - Le bundle IIFE est buildé une fois via build-nodius-bundle.mjs
 *   - Il est servi en statique depuis /vendor/nodius-editor.iife.js
 *   - window.NodiusEditor expose toute l'API publique après le chargement
 *
 * Compatibilité des données :
 *   - CKEditor produisait du HTML brut (string).
 *   - @nodius/editor lit/écrit du HTML via fromHTML() / toHTML().
 *   - Les données existantes en base sont donc directement compatibles.
 */

// ─── 1. Loader ──────────────────────────────────────────────────────────────

/**
 * Charge le bundle Nodius Editor depuis les assets statiques.
 * Remplace loadCKEditor() — même signature (callback).
 *
 * @param {() => void} callback  Appelé une fois l'éditeur prêt
 */
function loadNodiusEditor(callback) {
  if (window.NodiusEditor) {
    callback();
    return;
  }
  const script = document.createElement('script');
  // Chemin vers le bundle IIFE produit par build-nodius-bundle.mjs
  script.src = '/vendor/nodius-editor.iife.js';
  script.onload = () => {
    if (!window.NodiusEditor) {
      console.error('[NodiusEditor] Le bundle est chargé mais window.NodiusEditor est indéfini.');
      return;
    }
    callback();
  };
  script.onerror = () =>
    console.error('[NodiusEditor] Impossible de charger /vendor/nodius-editor.iife.js');
  document.head.appendChild(script);
}

// ─── 2. Ouverture de la modale d'édition ────────────────────────────────────

/**
 * Ouvre la modale "Edit Sentence" avec Nodius Editor à la place de CKEditor.
 *
 * @param {string|number} nodeId          ID du nœud à éditer
 * @param {object}        currentEntryDataType  Objet contenant language_id
 */
function openSentenceEditor(nodeId, currentEntryDataType) {
  // language_id === 2 → anglais, sinon français (même logique qu'avant)
  let lang = (currentEntryDataType?.language_id ?? 2) ? 'en' : 'fr';

  loadNodiusEditor(async () => {
    const {
      createEditor,
      createHistoryPlugin,
      baseStylesPlugin,
      boldPlugin,
      italicPlugin,
      underlinePlugin,
      strikethroughPlugin,
      headingPlugin,
      listsPlugin,
      blockquotePlugin,
      alignmentPlugin,
      createLinkPlugin,
      createFloatingToolbarPlugin,
      toolbarPlugin,
      fromHTML,
      toHTML,
    } = window.NodiusEditor;

    // ── Instance d'éditeur (sera créée après le mount) ──────────────────────
    let editorInstance = null;

    /** Détruit proprement l'éditeur quand la modale se ferme */
    function disposeEditor() {
      if (editorInstance) {
        editorInstance.destroy();
        console.log('[NodiusEditor] Instance détruite.');
        editorInstance = null;
      }
    }

    // ── Sélecteur de langue ──────────────────────────────────────────────────
    const div = document.createElement('div');
    div.innerHTML = `
      <div id="lang-selector" style="margin-bottom:8px;">
        <label style="margin-right:12px;">
          <input type="radio" name="lang" value="fr" ${lang === 'fr' ? 'checked' : ''}> FR
        </label>
        <label>
          <input type="radio" name="lang" value="en" ${lang === 'en' ? 'checked' : ''}> EN
        </label>
      </div>
    `;

    // Changement de langue → rechargement du contenu dans l'éditeur
    div.querySelectorAll('input[name="lang"]').forEach(radio => {
      radio.onclick = () => {
        const node = getNode(nodeId);
        lang = radio.value;
        const htmlContent = node.data?.[lang] ?? '';
        _loadHtmlIntoEditor(editorInstance, htmlContent);
      };
    });

    // ── Zone de montage de l'éditeur ─────────────────────────────────────────
    const editorContainer = document.createElement('div');
    editorContainer.id = 'nodius-editor-mount';
    div.appendChild(editorContainer);

    // ── Ouverture de la modale ────────────────────────────────────────────────
    await modalManager.open({
      id: 'node-sentence',
      title: 'Edit Sentence',
      content: div,
      width: '600px',
      height: '500px',
      nodeId,
      onClose: () => {
        disposeEditor();
      },
    });

    // ── Création de l'éditeur ─────────────────────────────────────────────────
    const { plugin: historyPlugin } = createHistoryPlugin();
    const floatingToolbar = createFloatingToolbarPlugin();
    const linkPlugin = createLinkPlugin();

    editorInstance = createEditor({
      plugins: [
        baseStylesPlugin,
        boldPlugin,
        italicPlugin,
        underlinePlugin,
        strikethroughPlugin,
        headingPlugin,
        listsPlugin,
        blockquotePlugin,
        alignmentPlugin,
        linkPlugin,
        floatingToolbar,
        toolbarPlugin,
        historyPlugin,
      ],
      toolbar: [
        'bold', 'italic', 'underline', 'strikethrough',
        '|',
        'heading-1', 'heading-2', 'heading-3',
        '|',
        'ordered-list', 'unordered-list',
        '|',
        'blockquote',
        '|',
        'align-left', 'align-center', 'align-right', 'align-justify',
        '|',
        'link',
      ],
      placeholder: 'Start typing…',
    });

    // Montage sur le conteneur DOM
    editorInstance.mount(editorContainer);

    // ── Chargement du contenu initial depuis la BDD ───────────────────────────
    const initNode = getNode(nodeId);
    const initialHtml = initNode?.data?.[lang] ?? '';
    _loadHtmlIntoEditor(editorInstance, initialHtml);

    // ── Écoute des changements → updateNode() ────────────────────────────────
    editorInstance.on('state:change', ({ nextState }) => {
      const html = toHTML(
        nextState.doc,
        // nodeTypes et markTypes sont exposés par le kernel interne ;
        // toHTML() sans arguments supplémentaires utilise les types enregistrés.
      );
      const newNode = deepCopy(getNode(nodeId));
      if (!newNode.data) newNode.data = {};
      newNode.data[lang] = html;
      updateNode(newNode);
    });
  });
}

// ─── 3. Helpers internes ─────────────────────────────────────────────────────

/**
 * Charge du HTML dans une instance Nodius Editor.
 * Équivalent de editor.setData() de CKEditor.
 *
 * @param {object} editor      Instance Nodius Editor
 * @param {string} htmlString  HTML à charger (peut être vide)
 */
function _loadHtmlIntoEditor(editor, htmlString) {
  if (!editor) return;
  const { fromHTML } = window.NodiusEditor;
  try {
    // fromHTML parse le HTML CKEditor (balises standard) → Document Nodius
    const doc = fromHTML(htmlString || '<p></p>');
    editor.dispatch({
      operations: [{ type: 'replace_doc', doc }],
    });
  } catch (err) {
    console.warn('[NodiusEditor] Impossible de parser le HTML :', err);
  }
}
