// ============================================================
// GESTIONALE ENI - Gestione Personale (segnaposto)
// Categoria riservata al Super Admin. Le singole funzioni verranno
// sviluppate una alla volta; per ora mostrano una pagina "in sviluppo".
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

(function() {
    'use strict';

    function _placeholder(titolo, icona, descrizione) {
        return function render(container) {
            container.innerHTML =
                '<div class="page-header">' +
                    '<h1 class="page-title">' + icona + ' ' + titolo + '</h1>' +
                '</div>' +
                '<div class="empty-state" style="padding:3rem 1rem;">' +
                    '<div class="empty-state-icon">🚧</div>' +
                    '<p class="empty-state-text">Funzione in sviluppo</p>' +
                    '<p class="text-sm text-muted" style="max-width:420px;margin:0 auto;">' + descrizione + '</p>' +
                '</div>';
        };
    }

    // Ferie e Permessi ha un modulo dedicato (js/modules/ferie.js)
    // Timbrature ha un modulo dedicato (js/modules/timbrature.js)
    // Turni ha un modulo dedicato (js/modules/turni.js)
    // Buste Paga ha un modulo dedicato (js/modules/buste-paga.js): BustePaga (admin) + BustePagaMie (dipendente)
})();
