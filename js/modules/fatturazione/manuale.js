// ============================================================
// FATTURAZIONE - Tab Nuova Fattura Manuale
// Placeholder Fase 3: implementazione completa nel prossimo step
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.Manuale = (function() {
    'use strict';

    async function render(container) {
        container.innerHTML =
            '<div class="empty-state">' +
                '<div class="empty-state-icon">\u{1F527}</div>' +
                '<p class="empty-state-text">Form fattura manuale in arrivo (Fase 3)</p>' +
                '<button class="btn btn-secondary mt-2" id="btn-back-el">Torna all\'elenco</button>' +
            '</div>';
        var b = document.getElementById('btn-back-el');
        if (b) b.addEventListener('click', function() { ENI.Fatturazione.Index.vaiA('elenco'); });
    }

    return { render: render };
})();
