const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const {
  ADMIN_ACCOUNTS,
  SELLER_GRADES,
  PERFORMANCE_LEVELS,
  isReservedIdentifiant,
  isValidSellerGrade,
  isValidPerformance,
  normalizePerformance,
  mapSeller,
  mapVehicle,
  hashPassword
} = require("./db-shared");

const SQL_DIR = path.join(__dirname, "database");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
});

function readSqlFile(filename) {
  return fs.readFileSync(path.join(SQL_DIR, filename), "utf8").trim();
}

function toPgSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function query(sql, params = []) {
  return pool.query(toPgSql(sql), params);
}

async function columnExists(table, column) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return result.rowCount > 0;
}

async function ensureRoleColumn() {
  if (!(await columnExists("vendeurs", "role"))) {
    await pool.query(
      "ALTER TABLE vendeurs ADD COLUMN role TEXT NOT NULL DEFAULT 'vendeur'"
    );
  }
}

async function ensureGradeColumn() {
  if (!(await columnExists("vendeurs", "grade"))) {
    await pool.query("ALTER TABLE vendeurs ADD COLUMN grade TEXT DEFAULT 'employe'");
  }
}

async function ensureFeaturedColumn() {
  if (!(await columnExists("vehicules", "is_featured"))) {
    await pool.query("ALTER TABLE vehicules ADD COLUMN is_featured INTEGER DEFAULT 0");
  }
}

async function ensurePerformanceColumn() {
  if (!(await columnExists("vehicules", "performance"))) {
    await pool.query("ALTER TABLE vehicules ADD COLUMN performance TEXT DEFAULT 'pas_perf'");
  }

  await query(
    "UPDATE vehicules SET performance = 'pas_perf' WHERE performance IS NULL OR TRIM(performance) = '' OR performance NOT IN ('pas_perf', 'peu_perf', 'full_perf')"
  );
}

async function normalizeGrades() {
  await query(
    "UPDATE vendeurs SET grade = 'employe' WHERE role = 'vendeur' AND (grade IS NULL OR TRIM(grade) = '')"
  );
}

async function normalizeRoles() {
  await query(
    "UPDATE vendeurs SET role = 'vendeur' WHERE role IS NULL OR TRIM(role) = ''"
  );
  for (const account of ADMIN_ACCOUNTS) {
    await query("UPDATE vendeurs SET role = 'admin' WHERE identifiant = ?", [account.identifiant]);
  }
}

async function removeTestAccount() {
  await query("DELETE FROM vendeurs WHERE identifiant = ?", ["test"]);
}

async function findSellerByIdentifiant(identifiant) {
  const result = await query(readSqlFile("queries/get-vendeur-by-identifiant.sql"), [identifiant]);
  return result.rows[0] || null;
}

async function findSellerById(id) {
  const result = await query(readSqlFile("queries/get-vendeur-by-id.sql"), [id]);
  return mapSeller(result.rows[0]);
}

async function createSellerAccount({ identifiant, password, nom, role = "vendeur", grade = "employe" }) {
  const passwordHash = hashPassword(password);
  const sellerGrade = role === "admin" ? null : grade;
  const result = await query(
    `${readSqlFile("queries/insert-vendeur.sql")} RETURNING id`,
    [identifiant.trim(), passwordHash, nom.trim(), role, sellerGrade]
  );
  return findSellerById(result.rows[0].id);
}

async function ensureAdminAccounts() {
  for (const account of ADMIN_ACCOUNTS) {
    const existing = await findSellerByIdentifiant(account.identifiant);
    const passwordHash = hashPassword(account.password);

    if (existing) {
      await query(
        "UPDATE vendeurs SET password_hash = ?, role = 'admin', nom = ?, grade = NULL WHERE id = ?",
        [passwordHash, account.nom, existing.id]
      );
      continue;
    }

    await createSellerAccount({
      identifiant: account.identifiant,
      password: account.password,
      nom: account.nom,
      role: "admin"
    });
  }

  const legacyAdmin = await findSellerByIdentifiant("admin");
  if (legacyAdmin && legacyAdmin.identifiant === "admin") {
    await query("DELETE FROM vendeurs WHERE id = ?", [legacyAdmin.id]);
  }
}

async function initDatabase() {
  await pool.query(readSqlFile("schema.postgres.sql"));
  await ensureRoleColumn();
  await ensureGradeColumn();
  await ensureFeaturedColumn();
  await ensurePerformanceColumn();
  await normalizeRoles();
  await normalizeGrades();
  await removeTestAccount();
  await ensureAdminAccounts();

  const vehicleCount = (await query("SELECT COUNT(*)::int AS count FROM vehicules")).rows[0].count;
  const sellerCount = (await query("SELECT COUNT(*)::int AS count FROM vendeurs")).rows[0].count;
  console.log("Stockage : PostgreSQL Render (persistant)");
  console.log(`Données chargées : ${vehicleCount} véhicule(s), ${sellerCount} compte(s)`);
}

async function getAllVehicles() {
  const result = await query(readSqlFile("queries/get-vehicles.sql"));
  return result.rows.map(mapVehicle);
}

async function getVehicleById(id) {
  const result = await query(readSqlFile("queries/get-vehicle-by-id.sql"), [id]);
  return mapVehicle(result.rows[0]);
}

async function createVehicle(data) {
  const result = await query(
    `${readSqlFile("queries/insert-vehicle.sql")} RETURNING id`,
    [
      data.vendeurId,
      data.brand,
      data.model,
      data.year,
      data.price,
      data.mileage,
      data.fuel,
      data.transmission,
      data.condition,
      normalizePerformance(data.performance),
      data.image,
      data.description
    ]
  );
  return getVehicleById(result.rows[0].id);
}

async function updateVehicle(id, data) {
  const vehicle = await getVehicleById(id);
  if (!vehicle) {
    return null;
  }

  const result = await query(readSqlFile("queries/update-vehicle.sql"), [
    data.brand,
    data.model,
    data.year,
    data.price,
    data.mileage,
    data.fuel,
    data.transmission,
    data.condition,
    normalizePerformance(data.performance),
    data.image,
    data.description,
    id
  ]);

  if (result.rowCount === 0) {
    return null;
  }

  return getVehicleById(id);
}

async function deleteVehicle(id, vendeurId) {
  const vehicle = await getVehicleById(id);
  if (!vehicle || !vehicle.isCustom || vehicle.vendeurId !== vendeurId) {
    return false;
  }

  const result = await query(readSqlFile("queries/delete-vehicle.sql"), [id, vendeurId]);
  return result.rowCount > 0;
}

async function deleteVehicleAsAdmin(id) {
  const vehicle = await getVehicleById(id);
  if (!vehicle) {
    return false;
  }

  const result = await query(readSqlFile("queries/delete-vehicle-by-id.sql"), [id]);
  return result.rowCount > 0;
}

async function getFeaturedVehicle() {
  const result = await query(readSqlFile("queries/get-featured-vehicle.sql"));
  return mapVehicle(result.rows[0]);
}

async function setVehicleFeatured(id, featured) {
  const vehicle = await getVehicleById(id);
  if (!vehicle) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (featured) {
      await client.query("UPDATE vehicules SET is_featured = 0");
      await client.query("UPDATE vehicules SET is_featured = 1 WHERE id = $1", [id]);
    } else {
      await client.query("UPDATE vehicules SET is_featured = 0 WHERE id = $1", [id]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getVehicleById(id);
}

async function getAllSellers() {
  const result = await query(readSqlFile("queries/get-vendeurs.sql"));
  return result.rows.map(mapSeller);
}

async function updateSellerGrade(id, grade) {
  const seller = await findSellerById(id);
  if (!seller || seller.role !== "vendeur") {
    return null;
  }

  if (!isValidSellerGrade(grade)) {
    return null;
  }

  const result = await query(readSqlFile("queries/update-vendeur-grade.sql"), [grade, id]);
  if (result.rowCount === 0) {
    return null;
  }

  return findSellerById(id);
}

async function deleteSeller(id) {
  const seller = await findSellerById(id);
  if (!seller || seller.role !== "vendeur") {
    return false;
  }

  const result = await query(readSqlFile("queries/delete-vendeur.sql"), [id]);
  return result.rowCount > 0;
}

async function updateSellerPassword(id, password) {
  const seller = await findSellerById(id);
  if (!seller || seller.role !== "vendeur") {
    return null;
  }

  if (!password || String(password).length < 3) {
    return null;
  }

  const passwordHash = hashPassword(String(password));
  const result = await query(readSqlFile("queries/update-vendeur-password.sql"), [passwordHash, id]);
  if (result.rowCount === 0) {
    return null;
  }

  return findSellerById(id);
}

module.exports = {
  db: pool,
  DB_PATH: "PostgreSQL (DATABASE_URL)",
  initDatabase,
  getAllVehicles,
  getVehicleById,
  getFeaturedVehicle,
  setVehicleFeatured,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  deleteVehicleAsAdmin,
  findSellerByIdentifiant,
  findSellerById,
  createSellerAccount,
  getAllSellers,
  updateSellerGrade,
  updateSellerPassword,
  deleteSeller,
  mapSeller,
  SELLER_GRADES,
  isValidSellerGrade,
  PERFORMANCE_LEVELS,
  isValidPerformance,
  normalizePerformance,
  ADMIN_ACCOUNTS,
  isReservedIdentifiant
};
