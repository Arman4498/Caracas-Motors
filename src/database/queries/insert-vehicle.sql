INSERT INTO vehicules (
  vendeur_id, brand, model, year, price, mileage,
  fuel, transmission, condition, image, description, is_custom
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);
