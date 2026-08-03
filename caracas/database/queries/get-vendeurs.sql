SELECT id, identifiant, nom, role, grade, created_at
FROM vendeurs
WHERE role = 'vendeur'
ORDER BY created_at DESC;
