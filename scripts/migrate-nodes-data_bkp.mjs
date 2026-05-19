/**
 * scripts/migrate-nodes-data.mjs
 *
 * ÉTAPE 2 — Script d'extraction / audit / migration MongoDB
 *
 * Ce script :
 *   1. Se connecte à la base MongoDB (RongoDB / MongoDB compatible).
 *   2. Liste toutes les configurations de nœuds ("nodes config") qui
 *      contiennent du HTML généré par CKEditor.
 *   3. Valide que ce HTML est compatible avec fromHTML() de @nodius/editor.
 *   4. (Optionnel) Patch les champs si une normalisation est nécessaire.
 *
 * Usage :
 *   node scripts/migrate-nodes-data.mjs [--dry-run] [--collection graphs]
 *
 * Variables d'environnement requises :
 *   MONGO_URI         ex: mongodb://localhost:27017
 *   MONGO_DB          ex: nodius_graph
 *   MONGO_COLLECTION  ex: graphs  (peut être surchargé par --collection)
 */

import { MongoClient } from 'mongodb';
import { fromHTML, toHTML } from '@nodius/editor';

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const collectionFlag = args.indexOf('--collection');
const COLLECTION_NAME =
  collectionFlag !== -1
    ? args[collectionFlag + 1]
    : process.env.MONGO_COLLECTION ?? 'graphs';

// ─── Config ──────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:8529';
const MONGO_DB  = process.env.MONGO_DB  ?? 'nodius_graph';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Retourne true si la chaîne ressemble à du HTML (contient au moins une balise).
 * @param {string} str
 */
function looksLikeHtml(str) {
  return typeof str === 'string' && /<[a-z][\s\S]*>/i.test(str);
}

/**
 * Tente de parser le HTML avec fromHTML() et de le re-sérialiser.
 * Retourne { ok, normalised, error }.
 * @param {string} html
 */
function roundtrip(html) {
  try {
    const doc        = fromHTML(html || '<p></p>');
    const normalised = toHTML(doc);
    return { ok: true, normalised, error: null };
  } catch (error) {
    return { ok: false, normalised: null, error: error.message };
  }
}

/**
 * Parcourt récursivement un objet pour trouver tous les chemins
 * dont la valeur ressemble à du HTML.
 *
 * @param {object} obj    Objet à inspecter
 * @param {string} prefix Préfixe de chemin (usage interne)
 * @returns {{ path: string, value: string }[]}
 */
function findHtmlFields(obj, prefix = '') {
  const results = [];
  if (!obj || typeof obj !== 'object') return results;
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (looksLikeHtml(value)) {
      results.push({ path, value });
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      results.push(...findHtmlFields(value, path));
    }
  }
  return results;
}

/**
 * Applique une valeur à un chemin pointé dans un objet (mutation en place).
 * ex: setAtPath(obj, 'data.fr', '<p>…</p>')
 *
 * @param {object} obj
 * @param {string} dotPath
 * @param {*}      value
 */
function setAtPath(obj, dotPath, value) {
  const parts = dotPath.split('.');
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍  Connexion à ${MONGO_URI} / db: ${MONGO_DB} / collection: ${COLLECTION_NAME}`);
  if (DRY_RUN) console.log('🟡  Mode DRY-RUN — aucune écriture ne sera effectuée.\n');

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db         = client.db(MONGO_DB);
  const collection = db.collection(COLLECTION_NAME);

  const totalDocs = await collection.countDocuments();
  console.log(`📄  ${totalDocs} document(s) dans la collection "${COLLECTION_NAME}".`);

  const cursor = collection.find({});
  let audited   = 0;
  let patched   = 0;
  let errors    = 0;
  const errorLog = [];

  while (await cursor.hasNext()) {
    const doc        = await cursor.next();
    const htmlFields = findHtmlFields(doc);

    if (htmlFields.length === 0) continue;

    audited++;
    let docNeedsUpdate = false;
    const updates      = {};

    for (const { path, value } of htmlFields) {
      const { ok, normalised, error } = roundtrip(value);

      if (!ok) {
        errors++;
        errorLog.push({ _id: doc._id, path, error });
        console.warn(`  ⚠️  [${doc._id}] ${path} — parse error: ${error}`);
        continue;
      }

      // Si le HTML normalisé diffère de l'original, on peut le patcher
      if (normalised !== value) {
        updates[path] = normalised;
        docNeedsUpdate = true;
      }
    }

    if (docNeedsUpdate && !DRY_RUN) {
      // Construit le $set MongoDB à partir des chemins à patcher
      const $set = {};
      for (const [dotPath, normHtml] of Object.entries(updates)) {
        $set[dotPath] = normHtml;
      }
      await collection.updateOne({ _id: doc._id }, { $set });
      patched++;
      console.log(`  ✅  [${doc._id}] ${Object.keys($set).length} champ(s) normalisé(s).`);
    } else if (docNeedsUpdate && DRY_RUN) {
      patched++;
      console.log(`  🔵  [${doc._id}] (dry-run) ${Object.keys(updates).length} champ(s) à normaliser.`);
      for (const [path, html] of Object.entries(updates)) {
        console.log(`      ${path}: ${html.slice(0, 80)}…`);
      }
    }
  }

  console.log(`\n────────────────────────────────────────────────`);
  console.log(`📊  Résumé de la migration :`);
  console.log(`    Documents inspectés  : ${audited}`);
  console.log(`    Documents patchés    : ${patched}`);
  console.log(`    Erreurs de parse     : ${errors}`);

  if (errorLog.length > 0) {
    console.log(`\n❌  Détail des erreurs :`);
    for (const e of errorLog) {
      console.log(`    _id=${e._id}  path=${e.path}  → ${e.error}`);
    }
  }

  await client.close();
  console.log(`\n✔️   Connexion MongoDB fermée.`);
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
