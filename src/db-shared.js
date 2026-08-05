const bcrypt = require("bcryptjs");

const ADMIN_ACCOUNTS = [
  { identifiant: "Raheem", password: "Enutrof", nom: "Administrateur" },
  { identifiant: "Arman", password: "Armanlebg", nom: "Arman" }
];

const SELLER_GRADES = [
  "patron",
  "co-patron",
  "manager",
  "employe",
  "apprenti",
  "stagiaire"
];

const PERFORMANCE_LEVELS = ["pas_perf", "peu_perf", "full_perf"];

function isReservedIdentifiant(identifiant) {
  const normalized = String(identifiant || "").trim().toLowerCase();
  return ADMIN_ACCOUNTS.some((account) => account.identifiant.toLowerCase() === normalized);
}

function isValidSellerGrade(grade) {
  return SELLER_GRADES.includes(grade);
}

function isValidPerformance(performance) {
  return PERFORMANCE_LEVELS.includes(performance);
}

function normalizePerformance(performance) {
  return isValidPerformance(performance) ? performance : "pas_perf";
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

function mapVehicle(row) {
  if (!row) return null;
  return {
    id: row.id,
    vendeurId: row.vendeur_id,
    brand: row.brand,
    model: row.model,
    year: row.year,
    price: Number(row.price),
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

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

module.exports = {
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
};
