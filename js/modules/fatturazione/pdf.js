// ============================================================
// FATTURAZIONE - Generazione PDF (fattura manuale + riepilogativa)
// Placeholder Fase 1: funzioni stub, implementazione in Fase 3 e 7
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.Pdf = (function() {
    'use strict';

    function _fmt(n) {
        if (n == null) return '0,00';
        return Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function _fmtData(d) {
        if (!d) return '';
        var dt = typeof d === 'string' ? new Date(d) : d;
        if (isNaN(dt.getTime())) return '';
        return String(dt.getDate()).padStart(2,'0') + '/' + String(dt.getMonth()+1).padStart(2,'0') + '/' + dt.getFullYear();
    }

    // Genera il PDF di una fattura (manuale o riepilogativa) e apre il blob in nuova tab
    async function generaPdf(fatturaCompleta, impostazioni) {
        var fattura = fatturaCompleta.fattura;
        var cliente = fattura.cliente;
        var righe = fatturaCompleta.righe || [];
        var movimenti = fatturaCompleta.movimenti || [];

        var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        var W = 210, margin = 15;
        var y = margin;

        // --- Logo (se presente) ---
        if (impostazioni && impostazioni.logo_base64) {
            try { doc.addImage(impostazioni.logo_base64, 'PNG', margin, y, 35, 18); y += 20; } catch(e) {}
        }

        // --- Header emittente ---
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        doc.text(impostazioni ? (impostazioni.ragione_sociale_emittente || '') : '', margin, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        y += 5;
        if (impostazioni) {
            var righeEm = [
                (impostazioni.indirizzo || ''),
                [impostazioni.cap, impostazioni.comune, impostazioni.provincia].filter(Boolean).join(' '),
                'COE/P.IVA: ' + (impostazioni.coe_piva || '')
            ];
            righeEm.forEach(function(r) { if (r.trim()) { doc.text(r, margin, y); y += 4; } });
        }

        // --- Numero fattura ---
        y += 4;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
        doc.text('Fattura N. ' + fattura.numero_formattato, margin, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        y += 6;
        doc.text('Data emissione: ' + _fmtData(fattura.data_emissione), margin, y);
        if (fattura.data_scadenza) doc.text('Scadenza: ' + _fmtData(fattura.data_scadenza), margin + 80, y);
        y += 6;

        // --- Cliente ---
        doc.setDrawColor(180); doc.rect(margin, y, W - 2*margin, 28);
        doc.setFont('helvetica','bold'); doc.text('Spettabile', margin + 2, y + 5);
        doc.setFont('helvetica','normal');
        doc.text(cliente ? cliente.nome_ragione_sociale : '', margin + 2, y + 10);
        if (cliente) {
            var ind = [cliente.sede_legale_indirizzo, cliente.sede_legale_cap, cliente.sede_legale_comune, cliente.sede_legale_provincia].filter(Boolean).join(' ');
            doc.text(ind, margin + 2, y + 15);
            var fisc = cliente.p_iva_coe ? 'COE/P.IVA: ' + cliente.p_iva_coe : '';
            if (fisc.trim()) doc.text(fisc, margin + 2, y + 20);
            if (fattura.rif_amministrazione) doc.text('Rif. Amministrazione: ' + fattura.rif_amministrazione, margin + 2, y + 25);
        }
        y += 34;

        // --- Righe ---
        doc.setFont('helvetica','bold'); doc.setFontSize(9);
        doc.setFillColor(235,235,235); doc.rect(margin, y, W - 2*margin, 7, 'F');
        doc.text('Descrizione', margin + 2, y + 5);
        doc.text('Qta', margin + 100, y + 5);
        doc.text('U.M.', margin + 115, y + 5);
        doc.text('Prezzo', margin + 130, y + 5);
        doc.text('Importo', W - margin - 2, y + 5, { align: 'right' });
        y += 7;

        doc.setFont('helvetica','normal');
        righe.forEach(function(r) {
            doc.text(String(r.descrizione || ''), margin + 2, y + 5, { maxWidth: 95 });
            doc.text(_fmt(r.quantita), margin + 100, y + 5);
            doc.text(String(r.unita_misura || ''), margin + 115, y + 5);
            doc.text(_fmt(r.prezzo_unitario), margin + 130, y + 5);
            doc.text(_fmt(r.importo) + ' €', W - margin - 2, y + 5, { align: 'right' });
            y += 7;
        });

        // --- Monofase (se presente) ---
        if (fattura.monofase_coefficiente) {
            y += 3;
            doc.setFont('helvetica','italic'); doc.setFontSize(8);
            doc.text('Coefficiente monofase ' + fattura.monofase_mese + '/' + fattura.monofase_anno +
                ': ' + _fmt(fattura.monofase_coefficiente) +
                (fattura.monofase_importo ? ' - Importo: € ' + _fmt(fattura.monofase_importo) : ''),
                margin, y);
            y += 5;
        }

        // --- Totale ---
        y += 4;
        doc.setFont('helvetica','bold'); doc.setFontSize(12);
        doc.text('Totale: € ' + _fmt(fattura.totale), W - margin, y, { align: 'right' });
        y += 8;

        // --- Pagamento ---
        doc.setFont('helvetica','normal'); doc.setFontSize(9);
        if (fattura.modalita_pagamento) doc.text('Modalità pagamento: ' + fattura.modalita_pagamento, margin, y);
        if (fattura.iban_beneficiario) { y += 4; doc.text('IBAN: ' + fattura.iban_beneficiario, margin, y); }

        // --- Nota regime monofase ---
        y += 8;
        doc.setFont('helvetica','italic'); doc.setFontSize(7);
        var nota = 'Operazione in regime di imposta monofase - D.D. 26 luglio 2010 n. 124. Le vendite sono già assoggettate ad imposta monofase nella registrazione dei corrispettivi.';
        var linee = doc.splitTextToSize(nota, W - 2*margin);
        doc.text(linee, margin, y);

        // --- Timbro/firma ---
        var _imgY = y + 5;
        if (impostazioni && impostazioni.timbro_base64) {
            try { doc.addImage(impostazioni.timbro_base64, 'PNG', W - margin - 55, _imgY, 25, 25); } catch(e) {}
        }
        if (impostazioni && impostazioni.firma_base64) {
            try { doc.addImage(impostazioni.firma_base64, 'PNG', W - margin - 28, _imgY, 25, 25); } catch(e) {}
        }

        // --- Pagine dettaglio movimenti (solo riepilogativa) ---
        if (fattura.tipo === 'RIEPILOGATIVA_ENI' && movimenti.length) {
            _renderDettaglioMovimenti(doc, movimenti, fattura, impostazioni);
        }

        // Output
        var blob = doc.output('blob');
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        return blob;
    }

    function _renderDettaglioMovimenti(doc, movimenti, fattura, imp) {
        doc.addPage();
        var W = 210, margin = 15, y = margin;
        doc.setFont('helvetica','bold'); doc.setFontSize(12);
        doc.text('Dettaglio movimenti - Fattura ' + fattura.numero_formattato, margin, y);
        y += 8;

        // Raggruppa per categoria
        var cats = ['CARBURANTE','LAVAGGIO','ACCESSORIO','ALTRO'];
        cats.forEach(function(cat) {
            var righe = movimenti.filter(function(m) { return m.categoria === cat; });
            if (!righe.length) return;
            doc.setFont('helvetica','bold'); doc.setFontSize(10);
            doc.text(cat, margin, y); y += 5;

            // Header
            doc.setFont('helvetica','bold'); doc.setFontSize(8);
            doc.setFillColor(240,240,240); doc.rect(margin, y, W - 2*margin, 6, 'F');
            doc.text('Data', margin + 2, y + 4);
            doc.text('Targa/Autista', margin + 28, y + 4);
            doc.text('Prodotto', margin + 70, y + 4);
            doc.text('Tipo', margin + 105, y + 4);
            doc.text('Qta/L', margin + 125, y + 4);
            doc.text('Prezzo', margin + 145, y + 4);
            doc.text('Importo', W - margin - 2, y + 4, { align: 'right' });
            y += 6;

            doc.setFont('helvetica','normal');
            var subtot = 0;
            righe.forEach(function(m) {
                if (y > 280) { doc.addPage(); y = margin; }
                doc.text(_fmtData(m.data_movimento), margin + 2, y + 4);
                doc.text(String(m.targa || m.autista || ''), margin + 28, y + 4, { maxWidth: 40 });
                doc.text(String(m.prodotto || ''), margin + 70, y + 4, { maxWidth: 32 });
                doc.text(String(m.tipo_servizio || ''), margin + 105, y + 4);
                doc.text(_fmt(m.volume), margin + 125, y + 4);
                doc.text(_fmt(m.prezzo_unitario), margin + 145, y + 4);
                doc.text(_fmt(m.importo), W - margin - 2, y + 4, { align: 'right' });
                subtot += Number(m.importo) || 0;
                y += 5;
            });
            doc.setFont('helvetica','bold');
            doc.text('Subtotale ' + cat + ': € ' + _fmt(subtot), W - margin, y + 4, { align: 'right' });
            y += 10;
        });

        // Totale globale
        doc.setFont('helvetica','bold'); doc.setFontSize(11);
        doc.text('TOTALE GENERALE: € ' + _fmt(fattura.totale), W - margin, y + 6, { align: 'right' });
    }

    return { generaPdf: generaPdf };
})();
