const usePostgres = Boolean(process.env.DATABASE_URL?.trim());

if (process.env.RENDER && !usePostgres) {
  console.error(`
ERREUR : DATABASE_URL absent sur Render.

Étapes à suivre dans le dashboard Render :
  1. New + → PostgreSQL (même région que votre site web)
  2. Ouvrez votre service web → Environment → Add Environment Variable
  3. Key : DATABASE_URL
  4. Value : cliquez "Add from database" → choisissez votre PostgreSQL → Internal Database URL
  5. Save, rebuild & deploy

Sans DATABASE_URL, les données et la connexion ne fonctionnent pas correctement.
`);
  process.exit(1);
}

module.exports = usePostgres ? require("./db-postgres") : require("./db-sqlite");
