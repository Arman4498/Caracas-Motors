-- Données initiales — Caracas Motors

INSERT OR IGNORE INTO vehicules (
  vendeur_id, brand, model, year, price, mileage,
  fuel, transmission, condition, image, description, is_custom
) VALUES (NULL, 'Benefactor', 'Streiter', 2026, 24900, 0, 'essence', 'manuelle', 'neuf', 'https://exemple.com/voiture.jpg', 'Informations complémentaires', 0);

