// ============================================================
// Test unitari del motore Previsione Autonomia Serbatoi
// Esegui:  node scripts/test-previsione-carburante.js
// Nessuna dipendenza esterna.
// ============================================================

var assert = require('assert');
var P = require('../js/lib/previsione-carburante.js');

var passed = 0, failed = 0;
function test(nome, fn) {
    try { fn(); passed++; console.log('  ✓ ' + nome); }
    catch (e) { failed++; console.log('  ✗ ' + nome + '\n      ' + e.message); }
}

console.log('\n=== Previsione Carburante — test ===\n');

// 1) Cascata concatenata su più settimane: apertura(g) = chiusura(g-1)
test('cascata concatenata su 21 giorni (apertura = chiusura precedente)', function() {
    var c = P.costruisciCascata({ giacenzaIniziale: 10000, dataInizio: '2026-08-24', orizzonte: 21, media: 1000, fattori: {}, scortaMinima: 3000, carichiPrevisti: [] });
    assert.strictEqual(c.length, 21);
    assert.strictEqual(c[0].apertura, 10000);
    for (var i = 1; i < c.length; i++) {
        assert.strictEqual(c[i].apertura, c[i - 1].chiusura, 'giorno ' + i);
    }
    // chiusura(i) = 10000 - 1000*(i+1)
    assert.strictEqual(c[0].chiusura, 9000);
    assert.strictEqual(c[6].chiusura, 3000);
});

// 2) Carico infrasettimanale: aumenta la chiusura del giorno, non la media
test('carico infrasettimanale entra solo nella riga carichi', function() {
    var start = '2026-08-24';
    var giornoCarico = P._addGiorni(start, 3);
    var c = P.costruisciCascata({ giacenzaIniziale: 10000, dataInizio: start, orizzonte: 10, media: 1000, fattori: {}, scortaMinima: 3000, carichiPrevisti: [{ data: giornoCarico, litri: 5000 }] });
    // apertura(3) = chiusura(2) = 7000 ; chiusura(3) = 7000 + 5000 - 1000 = 11000
    assert.strictEqual(c[3].apertura, 7000);
    assert.strictEqual(c[3].carichi, 5000);
    assert.strictEqual(c[3].chiusura, 11000);
    assert.strictEqual(c[2].carichi, 0);
});

// 3) Orizzonte senza alcun carico: decrescita monotona
test('orizzonte senza carichi: chiusura sempre decrescente', function() {
    var c = P.costruisciCascata({ giacenzaIniziale: 8000, dataInizio: '2026-08-24', orizzonte: 14, media: 500, fattori: {}, scortaMinima: 1000, carichiPrevisti: [] });
    for (var i = 1; i < c.length; i++) assert.ok(c[i].chiusura < c[i - 1].chiusura, 'non decresce al giorno ' + i);
});

// 4) Raggiungimento scorta minima
test('indicatore sotto-scorta corretto', function() {
    var c = P.costruisciCascata({ giacenzaIniziale: 10000, dataInizio: '2026-08-24', orizzonte: 21, media: 1000, fattori: {}, scortaMinima: 3000, carichiPrevisti: [] });
    var ind = P.indicatori(c, 3000);
    assert.strictEqual(ind.dataSottoScorta, P._addGiorni('2026-08-24', 6)); // chiusura(6)=3000
    assert.strictEqual(ind.giorniAutonomia, 6);
});

// 5) Esaurimento
test('indicatore esaurimento corretto', function() {
    var c = P.costruisciCascata({ giacenzaIniziale: 10000, dataInizio: '2026-08-24', orizzonte: 21, media: 1000, fattori: {}, scortaMinima: 3000, carichiPrevisti: [] });
    var ind = P.indicatori(c, 3000);
    assert.strictEqual(ind.dataEsaurimento, P._addGiorni('2026-08-24', 9)); // chiusura(9)=0
    assert.strictEqual(c[9].stato, 'esaurito');
});

// 6) Fattori giornalieri diversi da 1
test('fattore giorno riduce il consumo solo quel giorno', function() {
    var fattori = { 6: 0.8, 0: 0.5 }; // sabato 0.8, domenica 0.5
    var c = P.costruisciCascata({ giacenzaIniziale: 100000, dataInizio: '2026-08-24', orizzonte: 14, media: 1000, fattori: fattori, scortaMinima: 0, carichiPrevisti: [] });
    var sab = c.filter(function(g) { return g.dow === 6; });
    var dom = c.filter(function(g) { return g.dow === 0; });
    var feriali = c.filter(function(g) { return g.dow !== 6 && g.dow !== 0; });
    sab.forEach(function(g) { assert.strictEqual(g.consumo, 800); });
    dom.forEach(function(g) { assert.strictEqual(g.consumo, 500); });
    feriali.forEach(function(g) { assert.strictEqual(g.consumo, 1000); });
});

// 7) Modalità media manuale vs automatica
test('media manuale e automatica', function() {
    var auto = P.mediaGiornaliera({ modalita: 'auto', erogatoFinestra: 12000, giorniFinestra: 12 });
    assert.strictEqual(auto.media, 1000);
    assert.strictEqual(auto.modalita, 'auto');
    var man = P.mediaGiornaliera({ modalita: 'manuale', manualeTotale: 14000, manualeGiorni: 7 });
    assert.strictEqual(man.media, 2000);
    assert.strictEqual(man.modalita, 'manuale');
    // divisione per zero non esplode
    assert.strictEqual(P.mediaGiornaliera({ modalita: 'auto', erogatoFinestra: 5000, giorniFinestra: 0 }).media, 0);
});

// 8) Arrotondamento al lotto minimo + consegna/ordine in giorni feriali
test('proposta ordine: arrotondata al lotto, consegna e ordine feriali', function() {
    var c = P.costruisciCascata({ giacenzaIniziale: 10000, dataInizio: '2026-08-24', orizzonte: 21, media: 1000, fattori: {}, scortaMinima: 3000, carichiPrevisti: [] });
    var prop = P.propostaOrdine({ cascata: c, scortaMinima: 3000, capacitaUtile: 30000, lottoMinimo: 1000, giorniConsegna: [1, 2, 3, 4, 5] });
    assert.strictEqual(prop.serve, true);
    assert.strictEqual(prop.quantita % 1000, 0, 'non multiplo del lotto');
    assert.ok([1, 2, 3, 4, 5].indexOf(P._dow(prop.dataConsegna)) !== -1, 'consegna non feriale');
    assert.ok([1, 2, 3, 4, 5].indexOf(P._dow(prop.dataOrdine)) !== -1, 'ordine non feriale');
    assert.ok(prop.dataOrdine < prop.dataConsegna, 'ordine non precede la consegna');
});

// 9) Tetto capacità utile (nessun overfill)
test('proposta ordine non supera la capacità utile', function() {
    var c = P.costruisciCascata({ giacenzaIniziale: 10000, dataInizio: '2026-08-24', orizzonte: 21, media: 1000, fattori: {}, scortaMinima: 3000, carichiPrevisti: [] });
    var prop = P.propostaOrdine({ cascata: c, scortaMinima: 3000, capacitaUtile: 30000, lottoMinimo: 1000 });
    assert.ok(prop.aperturaCritica + prop.quantita <= 30000, 'overfill: ' + (prop.aperturaCritica + prop.quantita));
});

// 10) Nessun ordine se autonomia sufficiente
test('nessun ordine se resta sempre sopra scorta', function() {
    var c = P.costruisciCascata({ giacenzaIniziale: 30000, dataInizio: '2026-08-24', orizzonte: 21, media: 100, fattori: {}, scortaMinima: 3000, carichiPrevisti: [] });
    var prop = P.propostaOrdine({ cascata: c, scortaMinima: 3000, capacitaUtile: 30000, lottoMinimo: 1000 });
    assert.strictEqual(prop.serve, false);
});

// 11) Wrapper calcola() integra tutto
test('calcola() restituisce media, cascata, indicatori, proposta', function() {
    var r = P.calcola({
        giacenzaIniziale: 10000, dataInizio: '2026-08-24', orizzonte: 21,
        mediaParams: { modalita: 'auto', erogatoFinestra: 12000, giorniFinestra: 12 },
        fattori: {}, scortaMinima: 3000, capacitaUtile: 30000, lottoMinimo: 1000, carichiPrevisti: []
    });
    assert.strictEqual(r.media.media, 1000);
    assert.strictEqual(r.cascata.length, 21);
    assert.ok(r.indicatori.dataSottoScorta);
    assert.strictEqual(r.proposta.serve, true);
});

// 12) Sotto-scorta di sabato → consegna spostata a venerdì, ordine giovedì
test('consegna weekend spostata a venerdì e ordine il giovedì', function() {
    var cascata = [
        { data: '2026-08-19', apertura: 6000, chiusura: 5000 }, // mer
        { data: '2026-08-20', apertura: 5000, chiusura: 4000 }, // gio
        { data: '2026-08-21', apertura: 4000, chiusura: 3500 }, // ven
        { data: '2026-08-22', apertura: 3500, chiusura: 2500 }, // sab ← primo sotto scorta
        { data: '2026-08-23', apertura: 2500, chiusura: 1500 }  // dom
    ];
    var prop = P.propostaOrdine({ cascata: cascata, scortaMinima: 3000, capacitaUtile: 15000, lottoMinimo: 1000, giorniConsegna: [1, 2, 3, 4, 5] });
    assert.strictEqual(prop.serve, true);
    assert.strictEqual(prop.dataConsegna, '2026-08-21'); // venerdì
    assert.strictEqual(prop.dataOrdine, '2026-08-20');   // giovedì
    assert.strictEqual(prop.quantita, 11000);            // 15000 − apertura venerdì (4000)
    assert.ok(prop.aperturaConsegna + prop.quantita <= 15000);
});

// 13) Consegna di lunedì → ordine spostato al venerdì precedente (salta sab/dom)
test('consegna lunedì: ordine entro il venerdì precedente', function() {
    var cascata = [
        { data: '2026-08-21', apertura: 5000, chiusura: 4000 }, // ven
        { data: '2026-08-22', apertura: 4000, chiusura: 3500 }, // sab
        { data: '2026-08-23', apertura: 3500, chiusura: 3200 }, // dom
        { data: '2026-08-24', apertura: 3200, chiusura: 2500 }  // lun ← primo sotto scorta
    ];
    var prop = P.propostaOrdine({ cascata: cascata, scortaMinima: 3000, capacitaUtile: 15000, lottoMinimo: 1000, giorniConsegna: [1, 2, 3, 4, 5] });
    assert.strictEqual(prop.dataConsegna, '2026-08-24'); // lunedì (valido)
    assert.strictEqual(prop.dataOrdine, '2026-08-21');   // venerdì
});

console.log('\n=== Risultato: ' + passed + ' passati, ' + failed + ' falliti ===\n');
process.exit(failed > 0 ? 1 : 0);
