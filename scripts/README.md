# ArangoDB Import/Export Scripts

Scripts utilitaires pour exporter et importer les données de la base de données ArangoDB de Nodius.

## 📋 Vue d'ensemble

- **`export.ts`** : Exporte toutes les collections et documents dans un fichier JSON
- **`import.ts`** : Remplace les documents existants depuis un fichier JSON (mode mise à jour uniquement)

## 🚀 Utilisation

### Méthode rapide (scripts npm)

```bash
# Export de la base de données
npm run db:export

# Import dans la base de données
npm run db:import

# Avec options personnalisées
npm run db:export -- output=./backup/my-export.json
npm run db:import -- input=./backup/my-export.json arangodb_name=nodius_dev
```

### Méthode directe (scripts TypeScript)

### Export de la base de données

Exporte toutes les collections et leurs documents dans un fichier JSON.

```bash
# Export avec configuration par défaut
tsx scripts/export.ts

# Export avec configuration personnalisée
tsx scripts/export.ts arangodb=http://localhost:8529 arangodb_user=root arangodb_pass=azerty arangodb_name=nodius output=./backup/my-export.json
```

**Options disponibles :**

| Option | Défaut | Description |
|--------|---------|-------------|
| `arangodb` | `http://127.0.0.1:8529` | URL de connexion ArangoDB |
| `arangodb_user` | `root` | Nom d'utilisateur |
| `arangodb_pass` | `azerty` | Mot de passe |
| `arangodb_name` | `nodius` | Nom de la base de données |
| `output` | `./backup/nodius-export.json` | Chemin du fichier de sortie |

**Exemple de sortie :**

```
🚀 Starting ArangoDB export...

📋 Configuration:
   Database: nodius
   URL: http://127.0.0.1:8529
   User: root
   Output: ./backup/nodius-export.json

✅ Connected to ArangoDB

📦 Found 8 collections to export:

   📂 Exporting collection: workflows...
      ✅ Exported 15 documents
   📂 Exporting collection: nodes...
      ✅ Exported 120 documents
   ...

✅ Export completed successfully!
📁 File saved to: C:\path\to\backup\nodius-export.json
📊 Total collections: 8
📄 Total documents: 250
```

### Import dans la base de données

Importe les données depuis un fichier JSON et **remplace uniquement** les documents existants.

```bash
# Import avec configuration par défaut
tsx scripts/import.ts

# Import avec configuration personnalisée
tsx scripts/import.ts arangodb=http://localhost:8529 arangodb_user=root arangodb_pass=azerty arangodb_name=nodius input=./backup/my-export.json
```

**Options disponibles :**

| Option | Défaut | Description |
|--------|---------|-------------|
| `arangodb` | `http://127.0.0.1:8529` | URL de connexion ArangoDB |
| `arangodb_user` | `root` | Nom d'utilisateur |
| `arangodb_pass` | `azerty` | Mot de passe |
| `arangodb_name` | `nodius` | Nom de la base de données |
| `input` | `./backup/nodius-export.json` | Chemin du fichier d'import |

**Exemple de sortie :**

```
🚀 Starting ArangoDB import (replace mode)...

📋 Configuration:
   Database: nodius
   URL: http://127.0.0.1:8529
   User: root
   Input: ./backup/nodius-export.json

✅ Loaded import file: C:\path\to\backup\nodius-export.json
   Export date: 2025-11-17T10:30:45.123Z
   Collections: 8

✅ Connected to ArangoDB

📂 Processing collection: workflows
   Documents to process: 15
   ✅ Replaced: 12 | ⏭️  Skipped: 3 | ❌ Errors: 0

📂 Processing collection: nodes
   Documents to process: 120
   ✅ Replaced: 120 | ⏭️  Skipped: 0 | ❌ Errors: 0

...

✅ Import completed!
📊 Summary:
   ✅ Documents replaced: 200
   ⏭️  Documents skipped (not existing): 50
   ❌ Errors: 0

💡 Note: 50 documents were skipped because they don't exist in the database.
   This script only REPLACES existing documents, it does not INSERT new ones.
```

## ⚠️ Comportement Important

### Script d'import en mode "replace"

Le script d'import a un comportement spécifique :

- ✅ **Remplace** les documents existants (basé sur `_key`)
- ⏭️ **Ignore** les documents du fichier qui n'existent pas dans la base
- 🔒 **Préserve** les documents de la base qui ne sont pas dans le fichier
- ❌ **Ne supprime jamais** de documents
- ❌ **N'insère jamais** de nouveaux documents

**Exemple :**

Base de données actuelle :
```
Collection "users":
  - _key: "user1" (données: v1)
  - _key: "user2" (données: v1)
  - _key: "user3" (données: v1)
```

Fichier d'import :
```
Collection "users":
  - _key: "user1" (données: v2)
  - _key: "user2" (données: v2)
  - _key: "user4" (données: v2)
```

Résultat après import :
```
Collection "users":
  - _key: "user1" (données: v2) ← remplacé
  - _key: "user2" (données: v2) ← remplacé
  - _key: "user3" (données: v1) ← préservé (non présent dans le fichier)
  - (user4 ignoré car n'existe pas dans la base)
```

## 📁 Structure du fichier d'export

Le fichier JSON exporté a la structure suivante :

```json
{
  "metadata": {
    "exportDate": "2025-11-17T10:30:45.123Z",
    "databaseName": "nodius",
    "version": "1.0.0"
  },
  "collections": {
    "workflows": {
      "name": "workflows",
      "type": 2,
      "documents": [
        {
          "_key": "workflow1",
          "_id": "workflows/workflow1",
          "_rev": "_abc123",
          "name": "My Workflow",
          ...
        }
      ]
    },
    "nodes": {
      "name": "nodes",
      "type": 2,
      "documents": [...]
    }
  }
}
```

## 🔧 Cas d'usage

### 1. Backup régulier

```bash
# Créer un backup quotidien
tsx scripts/export.ts output=./backup/nodius-backup-$(date +%Y%m%d).json
```

### 2. Synchronisation de données entre environnements

```bash
# Export depuis production
tsx scripts/export.ts arangodb=http://prod-server:8529 output=./prod-data.json

# Import vers développement
tsx scripts/import.ts arangodb=http://localhost:8529 input=./prod-data.json
```

### 3. Migration de données

```bash
# Export depuis ancienne base
tsx scripts/export.ts arangodb_name=nodius_old output=./migration.json

# Import vers nouvelle base (remplace uniquement les documents existants)
tsx scripts/import.ts arangodb_name=nodius_new input=./migration.json
```

## 🛡️ Sécurité

- Ne commitez **jamais** les fichiers d'export dans Git (ils peuvent contenir des données sensibles)
- Ajoutez `backup/` à votre `.gitignore`
- Utilisez des mots de passe forts pour ArangoDB
- Limitez les accès réseau à ArangoDB

## 🐛 Dépannage

### Erreur de connexion

```
❌ Export failed: connect ECONNREFUSED 127.0.0.1:8529
```

**Solution :** Vérifiez qu'ArangoDB est démarré et accessible à l'URL spécifiée.

### Erreur d'authentification

```
❌ Export failed: unauthorized
```

**Solution :** Vérifiez vos identifiants (arangodb_user et arangodb_pass).

### Fichier non trouvé

```
❌ Failed to read import file: ./backup/nodius-export.json
```

**Solution :** Vérifiez que le fichier existe et que le chemin est correct.

### Collection inexistante

```
⚠️  Collection does not exist, skipping...
```

**Solution :** C'est un comportement normal. Le script ignore les collections qui n'existent pas dans la base cible.

## 📝 Notes

- Les scripts exportent uniquement les collections utilisateur (pas les collections système commençant par `_`)
- Le dossier `backup/` est créé automatiquement s'il n'existe pas
- Les scripts utilisent la même configuration par défaut que le serveur Nodius
- Les documents conservent leurs `_key`, `_id` et `_rev` lors de l'export

## 🔗 Voir aussi

- [Documentation ArangoDB](https://www.arangodb.com/docs/)
- [Documentation arangojs](https://arangodb.github.io/arangojs/)
- [CLAUDE.md](../CLAUDE.md) - Documentation du projet Nodius
