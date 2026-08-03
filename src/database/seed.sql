-- Données initiales — Caracas Motors
-- Compte vendeur : identifiant test / mot de passe test

INSERT OR IGNORE INTO vendeurs (identifiant, password_hash, nom, role, grade)
VALUES ('test', '{{PASSWORD_HASH}}', 'Vendeur Test', 'vendeur', 'employe');

INSERT OR IGNORE INTO vehicules (
  vendeur_id, brand, model, year, price, mileage,
  fuel, transmission, condition, image, description, is_custom
) VALUES(1, 'Benefactor', 'Streiter', 2026, 24900, 0, 'essence', 'manuelle', 'neuf', 'https://exemple.com/voiture.jpg', 'Informations complémentaires', 0);
