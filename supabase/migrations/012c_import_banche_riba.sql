-- Import banca appoggio dai file esempio RIBA
-- Totale clienti RIBA: 4

UPDATE clienti SET banca_appoggio = 'CARISP' WHERE LOWER(TRIM(nome_ragione_sociale)) = LOWER(TRIM('La Pitagora  Macrelli'));
UPDATE clienti SET banca_appoggio = 'BSM' WHERE LOWER(TRIM(nome_ragione_sociale)) = LOWER(TRIM('Passion Car Srl'));
UPDATE clienti SET banca_appoggio = 'CARISP' WHERE LOWER(TRIM(nome_ragione_sociale)) = LOWER(TRIM('Zonzini srl'));
UPDATE clienti SET banca_appoggio = 'BSM BORGO MAGGIORE' WHERE LOWER(TRIM(nome_ragione_sociale)) = LOWER(TRIM('Krea di Agarici Gianfranco e Sandro'));
