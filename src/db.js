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

function needsMigration() {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vendeurs'")
    .get();
  if (!table) return false;

  const columns = db.prepare("PRAGMA table_info(vendeurs)").all();
  const hasIdentifiant = columns.some((col) => col.name === "identifiant");
  const hasEmail = columns.some((col) => col.name === "email");
  return hasEmail || !hasIdentifiant;
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

const ADMIN_IDENTIFIANT = "Raheem";
const ADMIN_PASSWORD = "Raheemleenutrofdemerde";

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
  db.prepare("UPDATE vendeurs SET role = 'admin' WHERE identifiant = ?").run(ADMIN_IDENTIFIANT);
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
  if (needsMigration()) {
    runSqlFile("reset.sql");
  }

  runSqlFile("schema.sql");
  ensureRoleColumn();
  ensureGradeColumn();
  ensureFeaturedColumn();
  normalizeRoles();
  normalizeGrades();

  const sellerCount = db.prepare("SELECT COUNT(*) AS count FROM vendeurs").get().count;
  if (sellerCount === 0) {
    runSqlFile("seed.sql");
  }

  removeTestAccount();
  ensureAdminAccount();
}

function removeTestAccount() {
  db.prepare("DELETE FROM vendeurs WHERE identifiant = 'test'").run();
}

function ensureAdminAccount() {
  const admin = findSellerByIdentifiant(ADMIN_IDENTIFIANT);
  const legacyAdmin = findSellerByIdentifiant("admin");

  if (admin) {
    const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    db.prepare(
      "UPDATE vendeurs SET password_hash = ?, role = 'admin', nom = 'Administrateur', grade = NULL WHERE id = ?"
    ).run(passwordHash, admin.id);

    if (legacyAdmin && legacyAdmin.id !== admin.id) {
      db.prepare("DELETE FROM vendeurs WHERE id = ?").run(legacyAdmin.id);
    }
    return;
  }

  const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

  if (legacyAdmin) {
    db.prepare(
      "UPDATE vendeurs SET identifiant = ?, password_hash = ?, role = 'admin', nom = 'Administrateur', grade = NULL WHERE id = ?"
    ).run(ADMIN_IDENTIFIANT, passwordHash, legacyAdmin.id);
    return;
  }

  createSellerAccount({
    identifiant: ADMIN_IDENTIFIANT,
    password: ADMIN_PASSWORD,
    nom: "Administrateur",
    role: "admin"
  });
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
    data.image,
    data.description
  );

  return getVehicleById(result.lastInsertRowid);
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

module.exports = {
  db,
  initDatabase,
  getAllVehicles,
  getVehicleById,
  getFeaturedVehicle,
  setVehicleFeatured,
  createVehicle,
  deleteVehicle,
  deleteVehicleAsAdmin,
  findSellerByIdentifiant,
  findSellerById,
  createSellerAccount,
  getAllSellers,
  updateSellerGrade,
  mapSeller,
  SELLER_GRADES,
  isValidSellerGrade
};
