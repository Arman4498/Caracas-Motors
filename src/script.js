const API_PORT = "3002";
const DEFAULT_VEHICLE_IMAGE =
  "https://us.123rf.com/450wm/surfupvector/surfupvector1908/surfupvector190802662/129243509-denied-art-line-icon-censorship-no-photo-no-image-available-reject-or-cancel-concept-vector.jpg";

const API_BASE = (() => {
  const { protocol, hostname, port } = window.location;
  if (protocol === "file:") {
    return `http://localhost:${API_PORT}`;
  }
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  if (isLocal && port && port !== API_PORT) {
    return `http://localhost:${API_PORT}`;
  }
  return "";
})();

const vehicleGrid = document.getElementById("vehicleGrid");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const conditionFilter = document.getElementById("conditionFilter");
const sortFilter = document.getElementById("sortFilter");
const vehicleForm = document.getElementById("vehicleForm");
const formMessage = document.getElementById("formMessage");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginPanel = document.getElementById("loginPanel");
const sellerPanel = document.getElementById("sellerPanel");
const adminPanel = document.getElementById("adminPanel");
const logoutBtn = document.getElementById("logoutBtn");
const sellerNavLink = document.getElementById("sellerNavLink");
const createSellerForm = document.getElementById("createSellerForm");
const createSellerMessage = document.getElementById("createSellerMessage");
const sellersList = document.getElementById("sellersList");
const vehicleModal = document.getElementById("vehicleModal");
const heroCard = document.getElementById("heroCard");
const heroImage = document.getElementById("heroImage");
const heroImagePlaceholder = document.getElementById("heroImagePlaceholder");
const heroTitle = document.getElementById("heroTitle");
const heroPrice = document.getElementById("heroPrice");
const heroViewBtn = document.getElementById("heroViewBtn");
const modalFeaturedBtn = document.getElementById("modalFeaturedBtn");
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");

let vehicles = [];
let currentSeller = null;
let sellers = [];
let featuredVehicleId = null;
let modalVehicle = null;

const GRADE_LABELS = {
  patron: "Patron",
  "co-patron": "Co-patron",
  manager: "Manager",
  employe: "Employé",
  apprenti: "Apprenti",
  stagiaire: "Stagiaire"
};

const GRADE_OPTIONS = Object.entries(GRADE_LABELS)
  .map(([value, label]) => ({ value, label }));

function getGradeLabel(grade) {
  return GRADE_LABELS[grade] || "Employé";
}

function buildGradeOptions(selectedGrade) {
  return GRADE_OPTIONS.map(
    ({ value, label }) =>
      `<option value="${value}"${value === selectedGrade ? " selected" : ""}>${label}</option>`
  ).join("");
}

function isAdmin() {
  return currentSeller?.role === "admin";
}

function isVendeur() {
  return isSellerLoggedIn() && !isAdmin();
}

function normalizeSeller(seller) {
  if (!seller) {
    return null;
  }

  return {
    ...seller,
    role: seller.role === "admin" ? "admin" : "vendeur"
  };
}

async function apiFetch(url, options = {}) {
  const { headers = {}, ...rest } = options;
  let response;

  try {
    response = await fetch(`${API_BASE}${url}`, {
      credentials: "include",
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...headers
      }
    });
  } catch {
    throw new Error(
      "Impossible de contacter le serveur. Lancez npm start puis ouvrez http://localhost:3002"
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data.error ||
      (response.status === 404
        ? "Route API introuvable. Redémarrez le serveur avec npm start."
        : `Erreur ${response.status}`);
    throw new Error(message);
  }

  return data;
}

function isSellerLoggedIn() {
  return Boolean(currentSeller);
}

function formatPrice(price) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(price);
}

function getConditionLabel(condition) {
  return condition === "neuf" ? "Neuf" : "Occasion";
}

function getConditionBadgeClass(condition) {
  return condition === "neuf" ? "badge-neuf" : "badge-occasion";
}

function getVehicleImage(vehicle) {
  const image = vehicle.image?.trim();
  return image || DEFAULT_VEHICLE_IMAGE;
}

function handleVehicleImageError(event) {
  event.target.onerror = null;
  event.target.src = DEFAULT_VEHICLE_IMAGE;
}

function canSetFeatured(vehicle) {
  if (!isSellerLoggedIn()) {
    return false;
  }
  if (isAdmin()) {
    return true;
  }
  return isVendeur() && vehicle.vendeurId === currentSeller.id;
}

function canDeleteVehicle(vehicle) {
  if (isAdmin()) {
    return true;
  }
  return (
    isVendeur() &&
    vehicle.isCustom &&
    vehicle.vendeurId === currentSeller.id
  );
}

function applyFilters() {
  const search = searchInput.value.trim().toLowerCase();
  const condition = conditionFilter.value;
  const sort = sortFilter.value;

  let filtered = vehicles.filter((vehicle) => {
    const matchesSearch =
      !search ||
      vehicle.brand.toLowerCase().includes(search) ||
      vehicle.model.toLowerCase().includes(search);
    const matchesCondition = !condition || vehicle.condition === condition;
    return matchesSearch && matchesCondition;
  });

  switch (sort) {
    case "price-asc":
      filtered.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      filtered.sort((a, b) => b.price - a.price);
      break;
    case "year-desc":
      filtered.sort((a, b) => b.year - a.year);
      break;
    case "mileage-asc":
      filtered.sort((a, b) => a.mileage - b.mileage);
      break;
    default:
      break;
  }

  return filtered;
}

function renderVehicles(list) {
  vehicleGrid.innerHTML = "";

  if (list.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  list.forEach((vehicle) => {
    const imageUrl = getVehicleImage(vehicle);
    const card = document.createElement("article");
    const badge = `<span class="vehicle-tag ${getConditionBadgeClass(vehicle.condition)}">${getConditionLabel(vehicle.condition)}</span>`;

    card.className = ["vehicle-card", vehicle.isFeatured ? "is-featured" : ""]
      .filter(Boolean)
      .join(" ");

    card.innerHTML = `
      <div class="vehicle-image">
        <img src="${imageUrl}" alt="${vehicle.brand} ${vehicle.model}" onerror="handleVehicleImageError(event)">
        ${badge}
        ${vehicle.isFeatured ? `<span class="vehicle-featured-tag">Offre du moment</span>` : ""}
      </div>
      <div class="vehicle-body">
        <h3 class="vehicle-title">${vehicle.brand} ${vehicle.model}</h3>
        <p class="vehicle-price">${formatPrice(vehicle.price)}</p>
        <div class="vehicle-actions">
          <button type="button" class="btn btn-primary view-btn" data-id="${vehicle.id}">Voir détails</button>
          ${
            canSetFeatured(vehicle)
              ? `<button type="button" class="featured-btn${vehicle.isFeatured ? " is-active" : ""}" data-id="${vehicle.id}" aria-label="${vehicle.isFeatured ? "Retirer l'offre du moment" : "Mettre en offre du moment"}">${vehicle.isFeatured ? "★" : "☆"}</button>`
              : ""
          }
          ${canDeleteVehicle(vehicle) ? `<button type="button" class="delete-btn" data-id="${vehicle.id}" aria-label="Supprimer">×</button>` : ""}
        </div>
      </div>
    `;
    vehicleGrid.appendChild(card);
  });
}

function renderHeroFeatured() {
  const featured = vehicles.find((vehicle) => vehicle.isFeatured);

  if (!featured) {
    featuredVehicleId = null;
    heroCard.classList.add("hero-card--empty");
    heroImage.classList.add("hidden");
    heroImagePlaceholder.classList.add("hidden");
    heroImage.removeAttribute("src");
    heroTitle.textContent = "Aucune offre sélectionnée";
    heroPrice.classList.add("hidden");
    heroPrice.textContent = "";
    heroViewBtn.classList.add("hidden");
    return;
  }

  featuredVehicleId = featured.id;
  heroCard.classList.remove("hero-card--empty");
  heroTitle.textContent = `${featured.brand} ${featured.model}`;
  heroPrice.textContent = formatPrice(featured.price);
  heroPrice.classList.remove("hidden");
  heroViewBtn.classList.remove("hidden");

  const imageUrl = getVehicleImage(featured);
  heroImage.src = imageUrl;
  heroImage.alt = `${featured.brand} ${featured.model}`;
  heroImage.onerror = handleVehicleImageError;
  heroImage.classList.remove("hidden");
  heroImagePlaceholder.classList.add("hidden");
}

function updateModalFeaturedBtn(vehicle) {
  if (!vehicle || !canSetFeatured(vehicle)) {
    modalFeaturedBtn.classList.add("hidden");
    return;
  }

  modalFeaturedBtn.classList.remove("hidden");
  modalFeaturedBtn.textContent = vehicle.isFeatured
    ? "Retirer l'offre du moment"
    : "Mettre en offre du moment";
  modalFeaturedBtn.classList.toggle("is-active", vehicle.isFeatured);
}

function openModal(vehicle) {
  modalVehicle = vehicle;
  const modalImage = document.getElementById("modalImage");
  const modalContent = document.querySelector(".modal-content");
  const imageUrl = getVehicleImage(vehicle);

  modalImage.src = imageUrl;
  modalImage.alt = `${vehicle.brand} ${vehicle.model}`;
  modalImage.onerror = handleVehicleImageError;
  modalImage.classList.remove("hidden");
  modalContent.classList.remove("modal-content--no-image");

  document.getElementById("modalCondition").textContent = getConditionLabel(vehicle.condition);
  document.getElementById("modalCondition").className = `vehicle-tag ${getConditionBadgeClass(vehicle.condition)}`;
  document.getElementById("modalFuel").textContent = vehicle.fuel;
  document.getElementById("modalTitle").textContent = `${vehicle.brand} ${vehicle.model}`;
  document.getElementById("modalPrice").textContent = formatPrice(vehicle.price);
  document.getElementById("modalDescription").textContent =
    vehicle.description || "Aucune description disponible.";

  updateModalFeaturedBtn(vehicle);

  vehicleModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeModal() {
  modalVehicle = null;
  vehicleModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function refreshCatalog() {
  renderVehicles(applyFilters());
  renderHeroFeatured();
}

async function handleSetFeatured(id, featured) {
  try {
    await apiFetch(`/api/vehicles/${id}/featured`, {
      method: "PUT",
      body: JSON.stringify({ featured })
    });

    await loadVehicles();
    refreshCatalog();

    if (modalVehicle?.id === id) {
      modalVehicle = vehicles.find((vehicle) => vehicle.id === id) || null;
      if (modalVehicle) {
        updateModalFeaturedBtn(modalVehicle);
      }
    }
  } catch (error) {
    alert(error.message);
  }
}

function updateSellerModeUI() {
  const loggedIn = isSellerLoggedIn();
  const admin = isAdmin();
  document.body.classList.toggle("seller-mode", loggedIn && isVendeur());
  document.body.classList.toggle("admin-mode", loggedIn && admin);

  loginPanel.classList.toggle("hidden", loggedIn);
  sellerPanel.classList.toggle("hidden", !loggedIn);
  adminPanel.classList.toggle("hidden", !loggedIn || !admin);
  logoutBtn.classList.toggle("hidden", !loggedIn);

  if (admin) {
    sellerNavLink.textContent = "Administration";
  } else if (loggedIn) {
    sellerNavLink.textContent = "Mon espace";
  } else {
    sellerNavLink.textContent = "Espace vendeur";
  }

  if (admin) {
    loadSellers();
  }

  const sellerIntro = sellerPanel.querySelector(".form-intro");
  if (sellerIntro) {
    sellerIntro.querySelector(".eyebrow").textContent = admin
      ? "Espace administrateur"
      : "Espace vendeur";
    sellerIntro.querySelector("h2").textContent = admin
      ? "Ajouter un véhicule au catalogue"
      : "Ajouter un véhicule à vendre";
  }

  refreshCatalog();
}

function goToAdminSpace() {
  window.location.hash = "ajouter";
  document.getElementById("ajouter")?.scrollIntoView({ behavior: "smooth" });
  if (isAdmin()) {
    loadSellers();
  }
}

function renderSellersList() {
  sellersList.innerHTML = "";

  if (sellers.length === 0) {
    sellersList.innerHTML = "<li class='sellers-list-empty'>Aucun compte vendeur pour le moment.</li>";
    return;
  }

  sellers.forEach((seller) => {
    const item = document.createElement("li");
    item.className = "sellers-list-item";
    item.innerHTML = `
      <div class="sellers-list-info">
        <strong>${seller.nom}</strong>
        <span>${seller.identifiant}</span>
      </div>
      <div class="sellers-list-actions">
        <div class="sellers-list-grade">
          <label class="sr-only" for="grade-${seller.id}">Grade de ${seller.nom}</label>
          <select id="grade-${seller.id}" class="seller-grade-select" data-id="${seller.id}" data-previous-grade="${seller.grade || "employe"}" aria-label="Modifier le grade de ${seller.nom}">
            ${buildGradeOptions(seller.grade || "employe")}
          </select>
        </div>
        <button type="button" class="seller-password-btn" data-id="${seller.id}" aria-label="Changer le mot de passe de ${seller.nom}">MDP</button>
        <button type="button" class="seller-delete-btn" data-id="${seller.id}" aria-label="Supprimer ${seller.nom}">×</button>
      </div>
    `;
    sellersList.appendChild(item);
  });
}

async function handleUpdateSellerGrade(id, grade, selectEl) {
  const previousValue = selectEl.dataset.previousGrade || "employe";

  try {
    const updated = await apiFetch(`/api/admin/sellers/${id}/grade`, {
      method: "PATCH",
      body: JSON.stringify({ grade })
    });

    selectEl.dataset.previousGrade = grade;
    const seller = sellers.find((item) => item.id === id);
    if (seller) {
      seller.grade = updated.grade;
    }

    createSellerMessage.textContent = "Grade mis à jour.";
    createSellerMessage.classList.remove("form-message-error");

    setTimeout(() => {
      createSellerMessage.textContent = "";
    }, 2500);
  } catch (error) {
    selectEl.value = previousValue;
    createSellerMessage.textContent = error.message;
    createSellerMessage.classList.add("form-message-error");
  }
}

async function handleDeleteSeller(id) {
  const seller = sellers.find((item) => item.id === id);
  if (!seller) return;

  const confirmed = confirm(`Supprimer le compte vendeur ${seller.nom} (${seller.identifiant}) ?`);
  if (!confirmed) return;

  try {
    await apiFetch(`/api/admin/sellers/${id}`, { method: "DELETE" });
    sellers = sellers.filter((item) => item.id !== id);
    renderSellersList();

    createSellerMessage.textContent = "Compte vendeur supprimé.";
    createSellerMessage.classList.remove("form-message-error");

    setTimeout(() => {
      createSellerMessage.textContent = "";
    }, 2500);
  } catch (error) {
    createSellerMessage.textContent = error.message;
    createSellerMessage.classList.add("form-message-error");
  }
}

async function handleUpdateSellerPassword(id) {
  const seller = sellers.find((item) => item.id === id);
  if (!seller) return;

  const password = prompt(
    `Nouveau mot de passe pour ${seller.nom} (${seller.identifiant}) :`
  );
  if (password === null) return;

  if (!password.trim() || password.trim().length < 3) {
    createSellerMessage.textContent = "Le mot de passe doit contenir au moins 3 caractères.";
    createSellerMessage.classList.add("form-message-error");
    return;
  }

  try {
    await apiFetch(`/api/admin/sellers/${id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password: password.trim() })
    });

    createSellerMessage.textContent = "Mot de passe mis à jour.";
    createSellerMessage.classList.remove("form-message-error");

    setTimeout(() => {
      createSellerMessage.textContent = "";
    }, 2500);
  } catch (error) {
    createSellerMessage.textContent = error.message;
    createSellerMessage.classList.add("form-message-error");
  }
}

async function loadSellers() {
  if (!isAdmin()) return;

  try {
    sellers = await apiFetch("/api/admin/sellers");
    renderSellersList();
    createSellerMessage.classList.remove("form-message-error");
  } catch (error) {
    sellersList.innerHTML = `<li class="sellers-list-empty">${error.message}</li>`;
  }
}

async function handleCreateSeller(event) {
  event.preventDefault();
  createSellerMessage.textContent = "";

  try {
    await apiFetch("/api/admin/sellers", {
      method: "POST",
      body: JSON.stringify({
        identifiant: document.getElementById("sellerIdentifiant").value.trim(),
        password: document.getElementById("sellerPassword").value,
        nom: document.getElementById("sellerNom").value.trim(),
        grade: document.getElementById("sellerGrade").value
      })
    });

    createSellerForm.reset();
    createSellerMessage.textContent = "Compte vendeur créé avec succès !";
    createSellerMessage.classList.remove("form-message-error");

    await loadSellers();

    setTimeout(() => {
      createSellerMessage.textContent = "";
    }, 3000);
  } catch (error) {
    createSellerMessage.textContent = error.message;
    createSellerMessage.classList.add("form-message-error");
  }
}

async function loadVehicles() {
  vehicles = await apiFetch("/api/vehicles");
}

async function checkSession() {
  const data = await apiFetch("/api/auth/me");
  currentSeller = data.authenticated ? normalizeSeller(data.seller) : null;
}

async function handleLogin(event) {
  event.preventDefault();
  loginMessage.textContent = "";

  try {
    const identifiant = document.getElementById("loginIdentifiant").value.trim();
    const password = document.getElementById("loginPassword").value;

    await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifiant, password })
    });

    await checkSession();

    loginForm.reset();
    updateSellerModeUI();
    refreshCatalog();

    if (isAdmin()) {
      goToAdminSpace();
    }
  } catch (error) {
    loginMessage.textContent = error.message;
  }
}

async function handleLogout() {
  await apiFetch("/api/auth/logout", { method: "POST" });
  currentSeller = null;
  updateSellerModeUI();
  refreshCatalog();
}

async function handleAddVehicle(event) {
  event.preventDefault();
  formMessage.textContent = "";

  const brand = document.getElementById("brand").value.trim();
  const priceValue = document.getElementById("price").value.trim();
  const price = Number(priceValue);

  if (!brand) {
    formMessage.textContent = "La marque est obligatoire.";
    formMessage.classList.add("form-message-error");
    return;
  }

  if (!priceValue || Number.isNaN(price) || price < 0) {
    formMessage.textContent = "Le prix est obligatoire.";
    formMessage.classList.add("form-message-error");
    return;
  }

  if (!isSellerLoggedIn()) {
    formMessage.textContent = "Connectez-vous pour publier un véhicule.";
    formMessage.classList.add("form-message-error");
    return;
  }

  try {
    const imageValue = document.getElementById("image").value.trim();
    const payload = {
      brand,
      model: document.getElementById("model").value.trim() || "Non renseigné",
      price,
      year: new Date().getFullYear(),
      mileage: 0,
      condition: document.getElementById("condition").value,
      fuel: "Non renseigné",
      transmission: "Non renseigné",
      image: imageValue || null,
      description: document.getElementById("description").value.trim()
    };

    await apiFetch("/api/vehicles", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    vehicleForm.reset();
    formMessage.textContent = "Véhicule publié avec succès !";
    formMessage.classList.remove("form-message-error");

    await loadVehicles();
    refreshCatalog();

    setTimeout(() => {
      formMessage.textContent = "";
    }, 3000);
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.classList.add("form-message-error");
  }
}

async function handleDeleteVehicle(id) {
  const vehicle = vehicles.find((v) => v.id === id);
  if (!vehicle || !canDeleteVehicle(vehicle)) return;

  const confirmed = confirm(`Supprimer ${vehicle.brand} ${vehicle.model} du catalogue ?`);
  if (!confirmed) return;

  try {
    await apiFetch(`/api/vehicles/${id}`, { method: "DELETE" });
    await loadVehicles();
    refreshCatalog();
  } catch (error) {
    alert(error.message);
  }
}

function initEventListeners() {
  searchInput.addEventListener("input", refreshCatalog);
  conditionFilter.addEventListener("change", refreshCatalog);
  sortFilter.addEventListener("change", refreshCatalog);

  vehicleGrid.addEventListener("click", (event) => {
    const viewBtn = event.target.closest(".view-btn");
    const deleteBtn = event.target.closest(".delete-btn");
    const featuredBtn = event.target.closest(".featured-btn");

    if (viewBtn) {
      const vehicle = vehicles.find((v) => String(v.id) === viewBtn.dataset.id);
      if (vehicle) openModal(vehicle);
    }

    if (featuredBtn) {
      const vehicle = vehicles.find((v) => String(v.id) === featuredBtn.dataset.id);
      if (vehicle && canSetFeatured(vehicle)) {
        handleSetFeatured(Number(featuredBtn.dataset.id), !vehicle.isFeatured);
      }
    }

    if (deleteBtn && isSellerLoggedIn()) {
      handleDeleteVehicle(Number(deleteBtn.dataset.id));
    }
  });

  heroViewBtn.addEventListener("click", () => {
    const featured = vehicles.find((vehicle) => vehicle.id === featuredVehicleId);
    if (featured) {
      openModal(featured);
    }
  });

  modalFeaturedBtn.addEventListener("click", () => {
    if (modalVehicle && canSetFeatured(modalVehicle)) {
      handleSetFeatured(modalVehicle.id, !modalVehicle.isFeatured);
    }
  });

  vehicleForm.addEventListener("submit", handleAddVehicle);
  loginForm.addEventListener("submit", handleLogin);
  createSellerForm.addEventListener("submit", handleCreateSeller);

  sellersList.addEventListener("change", (event) => {
    const select = event.target.closest(".seller-grade-select");
    if (!select || !isAdmin()) return;

    handleUpdateSellerGrade(Number(select.dataset.id), select.value, select);
  });

  sellersList.addEventListener("click", (event) => {
    if (!isAdmin()) return;

    const passwordBtn = event.target.closest(".seller-password-btn");
    if (passwordBtn) {
      handleUpdateSellerPassword(Number(passwordBtn.dataset.id));
      return;
    }

    const deleteBtn = event.target.closest(".seller-delete-btn");
    if (deleteBtn) {
      handleDeleteSeller(Number(deleteBtn.dataset.id));
    }
  });

  logoutBtn.addEventListener("click", handleLogout);

  vehicleModal.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  menuToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

async function init() {
  initEventListeners();

  try {
    await checkSession();
    await loadVehicles();
    updateSellerModeUI();
  } catch (error) {
    emptyState.classList.remove("hidden");
    emptyState.querySelector("p").textContent =
      error?.message ||
      "Impossible de charger le catalogue. Lancez npm start puis ouvrez http://localhost:3002";
  }
}

init();
