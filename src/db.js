const usePostgres = Boolean(process.env.DATABASE_URL?.trim());

module.exports = usePostgres ? require("./db-postgres") : require("./db-sqlite");
