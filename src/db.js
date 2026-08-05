const usePostgres = Boolean(process.env.DATABASE_URL?.trim());

if (process.env.RENDER && !usePostgres) {
  console.warn("Render : DATABASE_URL absent — vérifiez la liaison PostgreSQL dans le dashboard.");
}

module.exports = usePostgres ? require("./db-postgres") : require("./db-sqlite");
