/**
 * scripts/migrate-nodes-data.mjs
 *
 * Script d'audit / migration pour ArangoDB (port 8529).
 * Utilise l'API HTTP REST native d'ArangoDB — aucun driver externe requis.
 *
 * Usage :
 *   node scripts/migrate-nodes-data.mjs [--dry-run]
 *
 * Variables d'environnement (optionnelles) :
 *   ARANGO_URL        ex: http://localhost:8529   (défaut)
 *   ARANGO_DB         ex: nodius_graph            (défaut)
 *   ARANGO_USER       ex: root                    (défaut)
 *   ARANGO_PASSWORD   ex: (vide par défaut)
 *   ARANGO_COLLECTION ex: graphs                  (défaut)
 */

// ─── Config ──────────────────────────────────────────────────────────────────
const ARANGO_URL        = process.env.ARANGO_URL        ?? 'http://localhost:8529';
const ARANGO_DB         = process.env.ARANGO_DB         ?? 'nodius';
const ARANGO_USER       = process.env.ARANGO_USER       ?? 'root';
const ARANGO_PASSWORD   = process.env.ARANGO_PASSWORD   ?? 'azerty';
const COLLECTION_NAME   = process.env.ARANGO_COLLECTION ?? 'nodius_graphs';

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Auth header ─────────────────────────────────────────────────────────────
const AUTH = 'Basic ' + Buffer.from(`${ARANGO_USER}:${ARANGO_PASSWORD}`).toString('base64');
const BASE  = `${ARANGO_URL}/_db/${ARANGO_DB}`;

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function arangoGet(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function arangoPost(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function arangoPatch(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────
function looksLikeHtml(str) {
  return typeof str === 'string' && /<[a-z][\s\S]*>/i.test(str);
}

/**
 * Normalisation légère du HTML CKEditor → compatible @nodius/editor :
 *   <b> → <strong>   |   <i> → <em>
 * Round-trip complet possible une fois @nodius/editor buildé.
 */
function normaliseHtml(html) {
  return html
    .replace(/<b(\s|>)/g, '<strong$1')
    .replace(/<\/b>/g, '</strong>')
    .replace(/<i(\s|>)/g, '<em$1')
    .replace(/<\/i>/g, '</em>');
}

function findHtmlFields(obj, prefix = '') {
  const results = [];
  if (!obj || typeof obj !== 'object') return results;
  for (const [key, value] of Object.entries(obj)) {
    if (key === '_id' || key === '_key' || key === '_rev') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (looksLikeHtml(value)) {
      results.push({ path, value });
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      results.push(...findHtmlFields(value, path));
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === 'object') {
          results.push(...findHtmlFields(item, `${path}[${i}]`));
        }
      });
    }
  }
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍  ArangoDB : ${ARANGO_URL} / db: ${ARANGO_DB} / collection: ${COLLECTION_NAME}`);
  if (DRY_RUN) console.log('🟡  Mode DRY-RUN — aucune écriture.\n');

  // Vérifier la connexion
  await arangoGet('/_api/version').catch(() => {
    throw new Error(
      `Impossible de joindre ArangoDB sur ${ARANGO_URL}.\n` +
      `Vérifiez ARANGO_URL, ARANGO_USER, ARANGO_PASSWORD.`
    );
  });
  console.log('✅  Connexion ArangoDB OK');

  // Compter les documents
  const info = await arangoGet(`/_api/collection/${COLLECTION_NAME}/count`);
  console.log(`📄  ${info.count} document(s) dans "${COLLECTION_NAME}".\n`);

  // Curseur AQL — récupère tous les documents
  const aql = `FOR doc IN ${COLLECTION_NAME} RETURN doc`;
  let cursor = await arangoPost('/_api/cursor', { query: aql, batchSize: 100 });

  let audited = 0, patched = 0, errors = 0;
  const errorLog = [];

  const processBatch = async (docs) => {
    for (const doc of docs) {
      const htmlFields = findHtmlFields(doc);
      if (htmlFields.length === 0) continue;
      audited++;

      const updates = {};
      for (const { path, value } of htmlFields) {
        try {
          const normalised = normaliseHtml(value);
          if (normalised !== value) updates[path] = normalised;
        } catch (err) {
          errors++;
          errorLog.push({ _key: doc._key, path, error: err.message });
          console.warn(`  ⚠️  [${doc._key}] ${path} — erreur: ${err.message}`);
        }
      }

      if (Object.keys(updates).length === 0) continue;
      patched++;

      if (DRY_RUN) {
        console.log(`  🔵  [${doc._key}] ${Object.keys(updates).length} champ(s) à normaliser :`);
        for (const [p, v] of Object.entries(updates)) {
          console.log(`      ${p}: ${String(v).slice(0, 100)}`);
        }
      } else {
        // Construit le patch en dotpath → objet imbriqué
        const patch = {};
        for (const [dotPath, val] of Object.entries(updates)) {
          const parts = dotPath.replace(/\[(\d+)\]/g, '.$1').split('.');
          let cur = patch;
          for (let i = 0; i < parts.length - 1; i++) {
            cur[parts[i]] = cur[parts[i]] ?? {};
            cur = cur[parts[i]];
          }
          cur[parts[parts.length - 1]] = val;
        }
        await arangoPatch(`/_api/document/${COLLECTION_NAME}/${doc._key}`, patch);
        console.log(`  ✅  [${doc._key}] patché (${Object.keys(updates).length} champ(s)).`);
      }
    }
  };

  await processBatch(cursor.result);

  // Paginer si le curseur a d'autres batches
  while (cursor.hasMore) {
    cursor = await arangoPost(`/_api/cursor/${cursor.id}`, {});
    await processBatch(cursor.result);
  }

  console.log(`\n────────────────────────────────────────────────`);
  console.log(`📊  Résumé :`);
  console.log(`    Documents avec HTML  : ${audited}`);
  console.log(`    Documents à patcher  : ${patched}`);
  console.log(`    Erreurs              : ${errors}`);
  if (errorLog.length > 0) {
    console.log(`\n❌  Erreurs détaillées :`);
    for (const e of errorLog) console.log(`    _key=${e._key}  path=${e.path}  → ${e.error}`);
  }
  console.log('\n✔️   Terminé.');
}

main().catch(err => {
  console.error('\n❌  Erreur fatale :', err.message);
  process.exit(1);
});
