-- Import des données historiques du 7 septembre 2025
-- Ces données proviennent des logs d'une ancienne version de l'application

-- Timestamp de référence pour toutes les actions: 2025-09-07 17:49:00

-- 1. Matis Berchemin: 2 pts - 🥈 Défaite weekend (Région/France)
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Matis Berchemin', '🥈 Défaite weekend (Région/France)', 2, '2025-09-07 17:49:00',
       (SELECT score FROM players WHERE name = 'Matis Berchemin') + 2, 'Import historique', 'sport'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Matis Berchemin');

UPDATE players SET score = score + 2 WHERE name = 'Matis Berchemin' AND EXISTS (SELECT 1 FROM players WHERE name = 'Matis Berchemin');

-- 2. Leny Kouma: 6 pts - 🏆 Victoire weekend (Région/France)
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Leny Kouma', '🏆 Victoire weekend (Région/France)', 6, '2025-09-07 17:49:01',
       (SELECT score FROM players WHERE name = 'Leny Kouma') + 6, 'Import historique', 'sport'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Leny Kouma');

UPDATE players SET score = score + 6 WHERE name = 'Leny Kouma' AND EXISTS (SELECT 1 FROM players WHERE name = 'Leny Kouma');

-- 3. Noa Bellet: 6 pts - 🏆 Victoire weekend (Région/France)
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Noa Bellet', '🏆 Victoire weekend (Région/France)', 6, '2025-09-07 17:49:02',
       (SELECT score FROM players WHERE name = 'Noa Bellet') + 6, 'Import historique', 'sport'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Noa Bellet');

UPDATE players SET score = score + 6 WHERE name = 'Noa Bellet' AND EXISTS (SELECT 1 FROM players WHERE name = 'Noa Bellet');

-- Attribution du badge Hot Streak à Noa Bellet (mentionné dans les logs)
INSERT OR IGNORE INTO player_badges (player_name, badge_id, badge_name, badge_emoji, points, rarity, date_earned)
SELECT 'Noa Bellet', 'hot_streak', 'Hot Streak', '🔥', 0, 'rare', '2025-09-07 17:49:02'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Noa Bellet');

-- 4. Djilane Sene: -2 pts - Pénalité Sport
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Djilane Sene', 'Pénalité Sport', -2, '2025-09-07 17:49:03',
       (SELECT score FROM players WHERE name = 'Djilane Sene') - 2, 'Import historique', 'sport'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Djilane Sene');

UPDATE players SET score = score - 2 WHERE name = 'Djilane Sene' AND EXISTS (SELECT 1 FROM players WHERE name = 'Djilane Sene');

-- 5. Talia Timoteo-Cruz: -2 pts - Pénalité Sport
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Talia Timoteo-Cruz', 'Pénalité Sport', -2, '2025-09-07 17:49:04',
       (SELECT score FROM players WHERE name = 'Talia Timoteo-Cruz') - 2, 'Import historique', 'sport'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Talia Timoteo-Cruz');

UPDATE players SET score = score - 2 WHERE name = 'Talia Timoteo-Cruz' AND EXISTS (SELECT 1 FROM players WHERE name = 'Talia Timoteo-Cruz');

-- 6. Milo Carpentier: -2 pts - Pénalité Sport
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Milo Carpentier', 'Pénalité Sport', -2, '2025-09-07 17:49:05',
       (SELECT score FROM players WHERE name = 'Milo Carpentier') - 2, 'Import historique', 'sport'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Milo Carpentier');

UPDATE players SET score = score - 2 WHERE name = 'Milo Carpentier' AND EXISTS (SELECT 1 FROM players WHERE name = 'Milo Carpentier');

-- 7. Talia Timoteo-Cruz: 6 pts - 🏀 Hardworker
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Talia Timoteo-Cruz', '🏀 Hardworker', 6, '2025-09-07 17:49:06',
       (SELECT score FROM players WHERE name = 'Talia Timoteo-Cruz') + 6, 'Import historique', 'sport'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Talia Timoteo-Cruz');

UPDATE players SET score = score + 6 WHERE name = 'Talia Timoteo-Cruz' AND EXISTS (SELECT 1 FROM players WHERE name = 'Talia Timoteo-Cruz');

-- 8. Djilane Sene: 6 pts - 🏀 Hardworker
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Djilane Sene', '🏀 Hardworker', 6, '2025-09-07 17:49:07',
       (SELECT score FROM players WHERE name = 'Djilane Sene') + 6, 'Import historique', 'sport'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Djilane Sene');

UPDATE players SET score = score + 6 WHERE name = 'Djilane Sene' AND EXISTS (SELECT 1 FROM players WHERE name = 'Djilane Sene');

-- Attribution du badge On Fire à Djilane Sene (mentionné dans les logs)
INSERT OR IGNORE INTO player_badges (player_name, badge_id, badge_name, badge_emoji, points, rarity, date_earned)
SELECT 'Djilane Sene', 'on_fire', 'On Fire', '🔥', 0, 'rare', '2025-09-07 17:49:07'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Djilane Sene');

-- 9. Lina Derrahi: 4 pts - 📚 Activités facultatives (ateliers devoirs)
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Lina Derrahi', '📚 Activités facultatives (ateliers devoirs)', 4, '2025-09-07 17:49:08',
       (SELECT score FROM players WHERE name = 'Lina Derrahi') + 4, 'Import historique', 'academic'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Lina Derrahi');

UPDATE players SET score = score + 4 WHERE name = 'Lina Derrahi' AND EXISTS (SELECT 1 FROM players WHERE name = 'Lina Derrahi');

-- 10. Enery Moro: 4 pts - 📚 Activités facultatives (ateliers devoirs)
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Enery Moro', '📚 Activités facultatives (ateliers devoirs)', 4, '2025-09-07 17:49:09',
       (SELECT score FROM players WHERE name = 'Enery Moro') + 4, 'Import historique', 'academic'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Enery Moro');

UPDATE players SET score = score + 4 WHERE name = 'Enery Moro' AND EXISTS (SELECT 1 FROM players WHERE name = 'Enery Moro');

-- 11. Narcisse Massamba: 4 pts - 📚 Activités facultatives (ateliers devoirs)
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Narcisse Massamba', '📚 Activités facultatives (ateliers devoirs)', 4, '2025-09-07 17:49:10',
       (SELECT score FROM players WHERE name = 'Narcisse Massamba') + 4, 'Import historique', 'academic'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Narcisse Massamba');

UPDATE players SET score = score + 4 WHERE name = 'Narcisse Massamba' AND EXISTS (SELECT 1 FROM players WHERE name = 'Narcisse Massamba');

-- 12. Daniella Kelly: 4 pts - 📚 Activités facultatives (ateliers devoirs)
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Daniella Kelly', '📚 Activités facultatives (ateliers devoirs)', 4, '2025-09-07 17:49:11',
       (SELECT score FROM players WHERE name = 'Daniella Kelly') + 4, 'Import historique', 'academic'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Daniella Kelly');

UPDATE players SET score = score + 4 WHERE name = 'Daniella Kelly' AND EXISTS (SELECT 1 FROM players WHERE name = 'Daniella Kelly');

-- 13. Allaya Cisse: 4 pts - 📚 Activités facultatives (ateliers devoirs)
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Allaya Cisse', '📚 Activités facultatives (ateliers devoirs)', 4, '2025-09-07 17:49:12',
       (SELECT score FROM players WHERE name = 'Allaya Cisse') + 4, 'Import historique', 'academic'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Allaya Cisse');

UPDATE players SET score = score + 4 WHERE name = 'Allaya Cisse' AND EXISTS (SELECT 1 FROM players WHERE name = 'Allaya Cisse');

-- 14. Leny Kouma: -3 pts - Pénalité Sport (action incomplète dans les logs)
INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
SELECT 'Leny Kouma', 'Pénalité Sport', -3, '2025-09-07 17:49:13',
       (SELECT score FROM players WHERE name = 'Leny Kouma') - 3, 'Import historique', 'sport'
WHERE EXISTS (SELECT 1 FROM players WHERE name = 'Leny Kouma');

UPDATE players SET score = score - 3 WHERE name = 'Leny Kouma' AND EXISTS (SELECT 1 FROM players WHERE name = 'Leny Kouma');

-- Note: Les mises à jour des period_stats sont gérées automatiquement par l'application
-- lors de l'ajout des points via l'interface normale. Si vous souhaitez les mettre à jour
-- manuellement, vous devrez connaître les périodes exactes (period_start, period_end)
-- qui étaient actives le 7 septembre 2025.
