const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const {
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
  isValidSellerGrade,
  normalizePerformance
} = require("./db");

const app = express();
const PORT = process.env.PORT || 3002;

const dbDir = path.join(__dirname, "database");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

initDatabase();

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use(
  session({
    secret: "caracas-motors-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true
    }
  })
);

function syncSessionUser(req) {
  if (!req.session.sellerId) {
    return null;
  }

  const user = findSellerById(req.session.sellerId);
  if (!user) {
    return null;
  }

  req.session.role = user.role || "vendeur";
  req.session.sellerIdentifiant = user.identifiant;
  return user;
}

function requireAdmin(req, res, next) {
  const user = syncSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Non authentifié." });
  }
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Accès administrateur requis." });
  }
  next();
}

app.get("/api/vehicles", (req, res) => {
  res.json(getAllVehicles());
});

app.get("/api/vehicles/featured", (req, res) => {
  res.json(getFeaturedVehicle());
});

app.put("/api/vehicles/:id/featured", (req, res) => {
  const user = syncSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Non authentifié." });
  }

  const id = Number(req.params.id);
  const vehicle = getVehicleById(id);
  if (!vehicle) {
    return res.status(404).json({ error: "Véhicule introuvable." });
  }

  const isOwner = vehicle.vendeurId === user.id;
  if (user.role !== "admin" && !isOwner) {
    return res.status(403).json({ error: "Action non autorisée." });
  }

  const featured = Boolean(req.body.featured);
  const updated = setVehicleFeatured(id, featured);
  res.json(updated);
});

function parsePrice(value) {
  if (value === undefined || value === null || value === "") {
    return NaN;
  }
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  return Number(normalized);
}

app.post("/api/vehicles", (req, res) => {
  const user = syncSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Non authentifié." });
  }

  try {
    const {
      brand,
      model,
      price,
      year,
      mileage,
      condition,
      fuel,
      transmission,
      performance,
      image,
      description
    } = req.body;
    const priceNum = parsePrice(price);

    if (!String(brand || "").trim()) {
      return res.status(400).json({ error: "La marque est obligatoire." });
    }

    if (Number.isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: "Le prix est obligatoire." });
    }

    const vehicle = createVehicle({
      vendeurId: req.session.sellerId,
      brand: String(brand).trim(),
      model: String(model || "").trim() || "Non renseigné",
      year: year ? Number(year) : new Date().getFullYear(),
      price: priceNum,
      mileage: mileage !== undefined && mileage !== null && mileage !== "" ? Number(mileage) : 0,
      condition: condition === "neuf" ? "neuf" : "occasion",
      performance: normalizePerformance(performance),
      fuel: String(fuel || "").trim() || "Non renseigné",
      transmission: String(transmission || "").trim() || "Non renseigné",
      image: image?.trim() || null,
      description: description?.trim() || null
    });

    res.status(201).json(vehicle);
  } catch (error) {
    console.error("POST /api/vehicles:", error);
    const detail =
      error && /no column named performance/i.test(String(error.message || ""))
        ? "Colonnes à jour manquantes. Redémarrez le serveur avec npm start."
        : "Impossible d'enregistrer le véhicule.";
    res.status(500).json({ error: detail });
  }
});

app.patch("/api/vehicles/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = getVehicleById(id);
  if (!existing) {
    return res.status(404).json({ error: "Véhicule introuvable." });
  }

  try {
    const {
      brand,
      model,
      price,
      year,
      mileage,
      condition,
      fuel,
      transmission,
      performance,
      image,
      description
    } = req.body;
    const priceNum = parsePrice(price);

    if (!String(brand || "").trim()) {
      return res.status(400).json({ error: "La marque est obligatoire." });
    }

    if (Number.isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: "Le prix est obligatoire." });
    }

    const updated = updateVehicle(id, {
      brand: String(brand).trim(),
      model: String(model || "").trim() || "Non renseigné",
      year: year ? Number(year) : existing.year,
      price: priceNum,
      mileage:
        mileage !== undefined && mileage !== null && mileage !== ""
          ? Number(mileage)
          : existing.mileage,
      condition: condition === "neuf" ? "neuf" : "occasion",
      performance: normalizePerformance(performance || existing.performance),
      fuel: String(fuel || "").trim() || existing.fuel || "Non renseigné",
      transmission:
        String(transmission || "").trim() || existing.transmission || "Non renseigné",
      image: image?.trim() || null,
      description: description?.trim() || null
    });

    if (!updated) {
      return res.status(500).json({ error: "Impossible de modifier le véhicule." });
    }

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Impossible de modifier le véhicule." });
  }
});

app.delete("/api/vehicles/:id", (req, res) => {
  const user = syncSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Non authentifié." });
  }

  const id = Number(req.params.id);
  const vehicle = getVehicleById(id);
  if (!vehicle) {
    return res.status(404).json({ error: "Véhicule introuvable." });
  }

  const deleted =
    user.role === "admin"
      ? deleteVehicleAsAdmin(id)
      : deleteVehicle(id, user.id);

  if (!deleted) {
    return res.status(403).json({ error: "Suppression non autorisée." });
  }

  res.json({ success: true });
});

app.post("/api/auth/login", (req, res) => {
  const { identifiant, password } = req.body;

  if (!identifiant || !password) {
    return res.status(400).json({ error: "Identifiant et mot de passe requis." });
  }

  const user = findSellerByIdentifiant(identifiant.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
  }

  req.session.sellerId = user.id;
  req.session.sellerIdentifiant = user.identifiant;
  req.session.role = user.role || "vendeur";

  res.json(findSellerById(user.id));
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get("/api/auth/me", (req, res) => {
  const user = syncSessionUser(req);
  if (!user) {
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    seller: user
  });
});

app.get("/api/admin/sellers", requireAdmin, (req, res) => {
  res.json(getAllSellers());
});

app.post("/api/admin/sellers", requireAdmin, (req, res) => {
  const { identifiant, password, nom, grade } = req.body;

  if (!identifiant?.trim() || !password || !nom?.trim() || !grade) {
    return res.status(400).json({ error: "Identifiant, mot de passe, nom et grade sont obligatoires." });
  }

  if (!isValidSellerGrade(grade)) {
    return res.status(400).json({ error: "Grade vendeur invalide." });
  }

  if (identifiant.trim().toLowerCase() === "raheem") {
    return res.status(400).json({ error: "Cet identifiant est réservé." });
  }

  const existing = findSellerByIdentifiant(identifiant.trim());
  if (existing) {
    return res.status(409).json({ error: "Cet identifiant existe déjà." });
  }

  try {
    const seller = createSellerAccount({
      identifiant: identifiant.trim(),
      password,
      nom: nom.trim(),
      role: "vendeur",
      grade
    });
    res.status(201).json(seller);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Impossible de créer le compte vendeur." });
  }
});

app.patch("/api/admin/sellers/:id/grade", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { grade } = req.body;

  if (!grade) {
    return res.status(400).json({ error: "Le grade est obligatoire." });
  }

  if (!isValidSellerGrade(grade)) {
    return res.status(400).json({ error: "Grade vendeur invalide." });
  }

  const updated = updateSellerGrade(id, grade);
  if (!updated) {
    return res.status(404).json({ error: "Vendeur introuvable." });
  }

  res.json(updated);
});

app.patch("/api/admin/sellers/:id/password", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body;

  if (!password || String(password).length < 3) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 3 caractères." });
  }

  const updated = updateSellerPassword(id, password);
  if (!updated) {
    return res.status(404).json({ error: "Vendeur introuvable." });
  }

  res.json({ success: true });
});

app.delete("/api/admin/sellers/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const deleted = deleteSeller(id);

  if (!deleted) {
    return res.status(404).json({ error: "Vendeur introuvable ou suppression non autorisée." });
  }

  res.json({ success: true });
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Caracas Motors → http://localhost:${PORT}`);
}).on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Le port ${PORT} est déjà utilisé. Arrêtez l'autre processus ou utilisez : set PORT=3001&& npm start`);
    process.exit(1);
  }
  throw error;
});
