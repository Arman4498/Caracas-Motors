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
  normalizePerformance,
  isReservedIdentifiant
} = require("./db");

const app = express();
const PORT = process.env.PORT || 3002;
const ERROR = "Erreur";

function sendError(res, status) {
  return res.status(status).json({ error: ERROR });
}

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
    return sendError(res, 401);
  }
  if (user.role !== "admin") {
    return sendError(res, 403);
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
    return sendError(res, 401);
  }

  const id = Number(req.params.id);
  const vehicle = getVehicleById(id);
  if (!vehicle) {
    return sendError(res, 404);
  }

  const isOwner = vehicle.vendeurId === user.id;
  if (user.role !== "admin" && !isOwner) {
    return sendError(res, 403);
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
    return sendError(res, 401);
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
      return sendError(res, 400);
    }

    if (Number.isNaN(priceNum) || priceNum < 0) {
      return sendError(res, 400);
    }

    const vehicle = createVehicle({
      vendeurId: req.session.sellerId,
      brand: String(brand).trim(),
      model: String(model || "").trim(),
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
    sendError(res, 500);
  }
});

app.patch("/api/vehicles/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = getVehicleById(id);
  if (!existing) {
    return sendError(res, 404);
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
      return sendError(res, 400);
    }

    if (Number.isNaN(priceNum) || priceNum < 0) {
      return sendError(res, 400);
    }

    const updated = updateVehicle(id, {
      brand: String(brand).trim(),
      model: String(model || "").trim(),
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
      return sendError(res, 500);
    }

    res.json(updated);
  } catch (error) {
    console.error(error);
    sendError(res, 500);
  }
});

app.delete("/api/vehicles/:id", (req, res) => {
  const user = syncSessionUser(req);
  if (!user) {
    return sendError(res, 401);
  }

  const id = Number(req.params.id);
  const vehicle = getVehicleById(id);
  if (!vehicle) {
    return sendError(res, 404);
  }

  const deleted =
    user.role === "admin"
      ? deleteVehicleAsAdmin(id)
      : deleteVehicle(id, user.id);

  if (!deleted) {
    return sendError(res, 403);
  }

  res.json({ success: true });
});

app.post("/api/auth/login", (req, res) => {
  const { identifiant, password } = req.body;

  if (!identifiant || !password) {
    return sendError(res, 400);
  }

  const user = findSellerByIdentifiant(identifiant.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return sendError(res, 401);
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
    return sendError(res, 400);
  }

  if (!isValidSellerGrade(grade)) {
    return sendError(res, 400);
  }

  if (isReservedIdentifiant(identifiant)) {
    return sendError(res, 400);
  }

  const existing = findSellerByIdentifiant(identifiant.trim());
  if (existing) {
    return sendError(res, 409);
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
    sendError(res, 500);
  }
});

app.patch("/api/admin/sellers/:id/grade", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { grade } = req.body;

  if (!grade) {
    return sendError(res, 400);
  }

  if (!isValidSellerGrade(grade)) {
    return sendError(res, 400);
  }

  const updated = updateSellerGrade(id, grade);
  if (!updated) {
    return sendError(res, 404);
  }

  res.json(updated);
});

app.patch("/api/admin/sellers/:id/password", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body;

  if (!password || String(password).length < 3) {
    return sendError(res, 400);
  }

  const updated = updateSellerPassword(id, password);
  if (!updated) {
    return sendError(res, 404);
  }

  res.json({ success: true });
});

app.delete("/api/admin/sellers/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const deleted = deleteSeller(id);

  if (!deleted) {
    return sendError(res, 404);
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
