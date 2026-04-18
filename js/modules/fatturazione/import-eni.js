// ============================================================
// FATTURAZIONE - Tab Import mensile ENI (wizard 4 step)
// Placeholder Fase 5-6: implementazione completa nei prossimi step
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.ImportEni = (function() {
    'use strict';

    async function render(container) {
        container.innerHTML =
            '<div class="empty-state">' +
                '<div class="empty-state-icon">\u{1F4E5}</div>' +
                '<p class="empty-state-text">Wizard import Excel ENI in arrivo (Fase 5-6)</p>' +
                '<button class="btn btn-secondary mt-2" id="btn-back-el2">Torna all\'elenco</button>' +
            '</div>';
        var b = document.getElementById('btn-back-el2');
        if (b) b.addEventListener('click', function() { ENI.Fatturazione.Index.vaiA('elenco'); });
    }

    return { render: render };
})();
