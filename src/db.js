const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "database", "caracas.db");
const SQL_DIR = path.join(__dirname, "database");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function readSqlFile(filename) {
  return fs.readFileSync(path.join(SQL_DIR, filename), "utf8");
}

function runSqlFile(filename, vars = {}) {
  let sql = readSqlFile(filename);
  for (const [key, value] of Object.entries(vars)) {
    sql = sql.replaceAll(`{{${key}}}`, value);
  }
  db.exec(sql);
}

function ensureRoleColumn() {
  const columns = db.prepare("PRAGMA table_info(vendeurs)").all();
  if (!columns.some((col) => col.name === "role")) {
    db.exec("ALTER TABLE vendeurs ADD COLUMN role TEXT NOT NULL DEFAULT 'vendeur'");
  }
}

function ensureFeaturedColumn() {
  const columns = db.prepare("PRAGMA table_info(vehicules)").all();
  if (!columns.some((col) => col.name === "is_featured")) {
    db.exec("ALTER TABLE vehicules ADD COLUMN is_featured INTEGER DEFAULT 0");
  }
}

const PERFORMANCE_LEVELS = ["pas_perf", "peu_perf", "full_perf"];

function isValidPerformance(performance) {
  return PERFORMANCE_LEVELS.includes(performance);
}

function normalizePerformance(performance) {
  return isValidPerformance(performance) ? performance : "pas_perf";
}

function ensurePerformanceColumn() {
  const columns = db.prepare("PRAGMA table_info(vehicules)").all();
  if (!columns.some((col) => col.name === "performance")) {
    db.exec("ALTER TABLE vehicules ADD COLUMN performance TEXT DEFAULT 'pas_perf'");
  }

  db.prepare(
    "UPDATE vehicules SET performance = 'pas_perf' WHERE performance IS NULL OR TRIM(performance) = '' OR performance NOT IN ('pas_perf', 'peu_perf', 'full_perf')"
  ).run();
}

const ADMIN_ACCOUNTS = [
  { identifiant: "Raheem", password: "Enutrof", nom: "Administrateur" },
  { identifiant: "Arman", password: "Armanlebg", nom: "Arman" }
];

function isReservedIdentifiant(identifiant) {
  const normalized = String(identifiant || "").trim().toLowerCase();
  return ADMIN_ACCOUNTS.some((account) => account.identifiant.toLowerCase() === normalized);
}

const SELLER_GRADES = [
  "patron",
  "co-patron",
  "manager",
  "employe",
  "apprenti",
  "stagiaire"
];

function isValidSellerGrade(grade) {
  return SELLER_GRADES.includes(grade);
}

function ensureGradeColumn() {
  const columns = db.prepare("PRAGMA table_info(vendeurs)").all();
  if (!columns.some((col) => col.name === "grade")) {
    db.exec("ALTER TABLE vendeurs ADD COLUMN grade TEXT DEFAULT 'employe'");
  }
}

function normalizeGrades() {
  db.prepare(
    "UPDATE vendeurs SET grade = 'employe' WHERE role = 'vendeur' AND (grade IS NULL OR TRIM(grade) = '')"
  ).run();
}

function normalizeRoles() {
  db.prepare(
    "UPDATE vendeurs SET role = 'vendeur' WHERE role IS NULL OR TRIM(role) = ''"
  ).run();
  for (const account of ADMIN_ACCOUNTS) {
    db.prepare("UPDATE vendeurs SET role = 'admin' WHERE identifiant = ?").run(account.identifiant);
  }
}

function mapSeller(row) {
  if (!row) return null;
  return {
    id: row.id,
    identifiant: row.identifiant,
    nom: row.nom,
    role: row.role || "vendeur",
    grade: row.grade || null,
    createdAt: row.created_at
  };
}

function initDatabase() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  runSqlFile("schema.sql");
  ensureRoleColumn();
  ensureGradeColumn();
  ensureFeaturedColumn();
  ensurePerformanceColumn();
  normalizeRoles();
  normalizeGrades();

  removeTestAccount();
  ensureAdminAccounts();

  const vehicleCount = db.prepare("SELECT COUNT(*) AS count FROM vehicules").get().count;
  const sellerCount = db.prepare("SELECT COUNT(*) AS count FROM vendeurs").get().count;
  console.log(`Base de données : ${DB_PATH}`);
  console.log(`Données chargées : ${vehicleCount} véhicule(s), ${sellerCount} compte(s)`);
}

function removeTestAccount() {
  db.prepare("DELETE FROM vendeurs WHERE identifiant = 'test'").run();
}

function ensureAdminAccounts() {
  for (const account of ADMIN_ACCOUNTS) {
    const existing = findSellerByIdentifiant(account.identifiant);
    const passwordHash = bcrypt.hashSync(account.password, 10);

    if (existing) {
      db.prepare(
        "UPDATE vendeurs SET password_hash = ?, role = 'admin', nom = ?, grade = NULL WHERE id = ?"
      ).run(passwordHash, account.nom, existing.id);
      continue;
    }

    createSellerAccount({
      identifiant: account.identifiant,
      password: account.password,
      nom: account.nom,
      role: "admin"
    });
  }

  const legacyAdmin = findSellerByIdentifiant("admin");
  if (legacyAdmin && legacyAdmin.identifiant === "admin") {
    db.prepare("DELETE FROM vendeurs WHERE id = ?").run(legacyAdmin.id);
  }
}

function createSellerAccount({ identifiant, password, nom, role = "vendeur", grade = "employe" }) {
  const passwordHash = bcrypt.hashSync(password, 10);
  const sellerGrade = role === "admin" ? null : grade;
  const result = db.prepare(readSqlFile("queries/insert-vendeur.sql")).run(
    identifiant.trim(),
    passwordHash,
    nom.trim(),
    role,
    sellerGrade
  );
  return findSellerById(result.lastInsertRowid);
}

function mapVehicle(row) {
  if (!row) return null;
  return {
    id: row.id,
    vendeurId: row.vendeur_id,
    brand: row.brand,
    model: row.model,
    year: row.year,
    price: row.price,
    mileage: row.mileage,
    fuel: row.fuel,
    transmission: row.transmission,
    condition: row.condition,
    performance: normalizePerformance(row.performance),
    image: row.image,
    description: row.description,
    isCustom: Boolean(row.is_custom),
    isFeatured: Boolean(row.is_featured),
    createdAt: row.created_at
  };
}

function getAllVehicles() {
  const rows = db.prepare(readSqlFile("queries/get-vehicles.sql")).all();
  return rows.map(mapVehicle);
}

function getVehicleById(id) {
  const row = db.prepare(readSqlFile("queries/get-vehicle-by-id.sql")).get(id);
  return mapVehicle(row);
}

function createVehicle(data) {
  ensurePerformanceColumn();

  const result = db.prepare(readSqlFile("queries/insert-vehicle.sql")).run(
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
  );

  return getVehicleById(result.lastInsertRowid);
}

function updateVehicle(id, data) {
  ensurePerformanceColumn();

  const vehicle = getVehicleById(id);
  if (!vehicle) {
    return null;
  }

  const result = db.prepare(readSqlFile("queries/update-vehicle.sql")).run(
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
  );

  if (result.changes === 0) {
    return null;
  }

  return getVehicleById(id);
}

function deleteVehicle(id, vendeurId) {
  const vehicle = getVehicleById(id);
  if (!vehicle || !vehicle.isCustom || vehicle.vendeurId !== vendeurId) {
    return false;
  }

  const result = db
    .prepare(readSqlFile("queries/delete-vehicle.sql"))
    .run(id, vendeurId);
  return result.changes > 0;
}

function deleteVehicleAsAdmin(id) {
  const vehicle = getVehicleById(id);
  if (!vehicle) {
    return false;
  }

  const result = db
    .prepare(readSqlFile("queries/delete-vehicle-by-id.sql"))
    .run(id);
  return result.changes > 0;
}

function findSellerByIdentifiant(identifiant) {
  return db.prepare(readSqlFile("queries/get-vendeur-by-identifiant.sql")).get(identifiant);
}

function findSellerById(id) {
  const row = db.prepare(readSqlFile("queries/get-vendeur-by-id.sql")).get(id);
  return mapSeller(row);
}

function getFeaturedVehicle() {
  const row = db.prepare(readSqlFile("queries/get-featured-vehicle.sql")).get();
  return mapVehicle(row);
}

function setVehicleFeatured(id, featured) {
  const vehicle = getVehicleById(id);
  if (!vehicle) {
    return null;
  }

  const setFeatured = db.prepare("UPDATE vehicules SET is_featured = 1 WHERE id = ?");
  const unsetAll = db.prepare("UPDATE vehicules SET is_featured = 0");
  const unsetOne = db.prepare("UPDATE vehicules SET is_featured = 0 WHERE id = ?");

  if (featured) {
    const apply = db.transaction(() => {
      unsetAll.run();
      setFeatured.run(id);
    });
    apply();
  } else {
    unsetOne.run(id);
  }

  return getVehicleById(id);
}

function getAllSellers() {
  const rows = db.prepare(readSqlFile("queries/get-vendeurs.sql")).all();
  return rows.map(mapSeller);
}

function updateSellerGrade(id, grade) {
  const seller = findSellerById(id);
  if (!seller || seller.role !== "vendeur") {
    return null;
  }

  if (!isValidSellerGrade(grade)) {
    return null;
  }

  const result = db.prepare(readSqlFile("queries/update-vendeur-grade.sql")).run(grade, id);
  if (result.changes === 0) {
    return null;
  }

  return findSellerById(id);
}

function deleteSeller(id) {
  const seller = findSellerById(id);
  if (!seller || seller.role !== "vendeur") {
    return false;
  }

  const result = db.prepare(readSqlFile("queries/delete-vendeur.sql")).run(id);
  return result.changes > 0;
}

function updateSellerPassword(id, password) {
  const seller = findSellerById(id);
  if (!seller || seller.role !== "vendeur") {
    return null;
  }

  if (!password || String(password).length < 3) {
    return null;
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const result = db
    .prepare(readSqlFile("queries/update-vendeur-password.sql"))
    .run(passwordHash, id);

  if (result.changes === 0) {
    return null;
  }

  return findSellerById(id);
}

module.exports = {
  db,
  DB_PATH,
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
