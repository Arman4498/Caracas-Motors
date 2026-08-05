const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
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

app.set("trust proxy", 1);

function sendError(res, status) {
  return res.status(status).json({ error: ERROR });
}

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
    secret: process.env.SESSION_SECRET || "caracas-motors-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    }
  })
);

async function syncSessionUser(req) {
  if (!req.session.sellerId) {
    return null;
  }

  const user = await findSellerById(req.session.sellerId);
  if (!user) {
    return null;
  }

  req.session.role = user.role || "vendeur";
  req.session.sellerIdentifiant = user.identifiant;
  return user;
}

function requireAdmin(req, res, next) {
  syncSessionUser(req)
    .then((user) => {
      if (!user) {
        return sendError(res, 401);
      }
      if (user.role !== "admin") {
        return sendError(res, 403);
      }
      next();
    })
    .catch((error) => {
      console.error(error);
      sendError(res, 500);
    });
}

app.get("/api/vehicles", async (req, res) => {
  try {
    res.json(await getAllVehicles());
  } catch (error) {
    console.error(error);
    sendError(res, 500);
  }
});

app.get("/api/vehicles/featured", async (req, res) => {
  try {
    res.json(await getFeaturedVehicle());
  } catch (error) {
    console.error(error);
    sendError(res, 500);
  }
});

app.put("/api/vehicles/:id/featured", async (req, res) => {
  try {
    const user = await syncSessionUser(req);
    if (!user) {
      return sendError(res, 401);
    }

    const id = Number(req.params.id);
    const vehicle = await getVehicleById(id);
    if (!vehicle) {
      return sendError(res, 404);
    }

    const isOwner = vehicle.vendeurId === user.id;
    if (user.role !== "admin" && !isOwner) {
      return sendError(res, 403);
    }

    const featured = Boolean(req.body.featured);
    const updated = await setVehicleFeatured(id, featured);
    res.json(updated);
  } catch (error) {
    console.error(error);
    sendError(res, 500);
  }
});

function parsePrice(value) {
  if (value === undefined || value === null || value === "") {
    return NaN;
  }
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  return Number(normalized);
}

app.post("/api/vehicles", async (req, res) => {
  const user = await syncSessionUser(req);
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

    const vehicle = await createVehicle({
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

app.patch("/api/vehicles/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getVehicleById(id);
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

    const updated = await updateVehicle(id, {
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

app.delete("/api/vehicles/:id", async (req, res) => {
  try {
    const user = await syncSessionUser(req);
    if (!user) {
      return sendError(res, 401);
    }

    const id = Number(req.params.id);
    const vehicle = await getVehicleById(id);
    if (!vehicle) {
      return sendError(res, 404);
    }

    const deleted =
      user.role === "admin"
        ? await deleteVehicleAsAdmin(id)
        : await deleteVehicle(id, user.id);

    if (!deleted) {
      return sendError(res, 403);
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    sendError(res, 500);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifiant, password } = req.body;

    if (!identifiant || !password) {
      return sendError(res, 400);
    }

    const user = await findSellerByIdentifiant(identifiant.trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      console.warn("Connexion refusée pour:", identifiant.trim());
      return sendError(res, 401);
    }

    req.session.sellerId = user.id;
    req.session.sellerIdentifiant = user.identifiant;
    req.session.role = user.role || "vendeur";

    req.session.save(async (error) => {
      if (error) {
        console.error("Session save:", error);
        return sendError(res, 500);
      }

      try {
        res.json(await findSellerById(user.id));
      } catch (saveError) {
        console.error(saveError);
        sendError(res, 500);
      }
    });
  } catch (error) {
    console.error("POST /api/auth/login:", error);
    sendError(res, 500);
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const user = await syncSessionUser(req);
    if (!user) {
      return res.json({ authenticated: false });
    }

    res.json({
      authenticated: true,
      seller: user
    });
  } catch (error) {
    console.error(error);
    sendError(res, 500);
  }
});

app.get("/api/admin/sellers", requireAdmin, async (req, res) => {
  try {
    res.json(await getAllSellers());
  } catch (error) {
    console.error(error);
    sendError(res, 500);
  }
});

app.post("/api/admin/sellers", requireAdmin, async (req, res) => {
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

  const existing = await findSellerByIdentifiant(identifiant.trim());
  if (existing) {
    return sendError(res, 409);
  }

  try {
    const seller = await createSellerAccount({
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

app.patch("/api/admin/sellers/:id/grade", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { grade } = req.body;

    if (!grade) {
      return sendError(res, 400);
    }

    if (!isValidSellerGrade(grade)) {
      return sendError(res, 400);
    }

    const updated = await updateSellerGrade(id, grade);
    if (!updated) {
      return sendError(res, 404);
    }

    res.json(updated);
  } catch (error) {
    console.error(error);
    sendError(res, 500);
  }
});

app.patch("/api/admin/sellers/:id/password", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { password } = req.body;

    if (!password || String(password).length < 3) {
      return sendError(res, 400);
    }

    const updated = await updateSellerPassword(id, password);
    if (!updated) {
      return sendError(res, 404);
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    sendError(res, 500);
  }
});

app.delete("/api/admin/sellers/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const deleted = await deleteSeller(id);

    if (!deleted) {
      return sendError(res, 404);
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    sendError(res, 500);
  }
});

const SENSITIVE_PATHS = /^\/(db|db-sqlite|db-postgres|db-shared|server)(\.js)?$/;

app.use((req, res, next) => {
  if (SENSITIVE_PATHS.test(req.path) || req.path.startsWith("/database/")) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(__dirname));

async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Caracas Motors → http://localhost:${PORT}`);
    }).on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Le port ${PORT} est déjà utilisé. Arrêtez l'autre processus ou utilisez : set PORT=3001&& npm start`);
        process.exit(1);
      }
      throw error;
    });
  } catch (error) {
    console.error("Impossible de démarrer la base de données:", error);
    process.exit(1);
  }
}

start();
