INSERT INTO vehicules (
  vendeur_id, brand, model, year, price, mileage,
  fuel, transmission, condition, performance, image, description, is_custom
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);
