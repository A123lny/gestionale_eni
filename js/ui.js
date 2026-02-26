// ============================================================
// GESTIONALE ENI - UI Helpers
// Toast, modal, confirm, loading, formattazione valuta/date
// ============================================================

var ENI = ENI || {};

ENI.UI = (function() {
    'use strict';

    // --- Toast Notifications ---

    function toast(message, type) {
        type = type || 'info';
        var container = document.getElementById('toast-container');
        if (!container) return;

        var icons = {
            success: '\u2705',
            error: '\u274C',
            warning: '\u26A0\uFE0F',
            info: '\u2139\uFE0F'
        };

        var toastEl = document.createElement('div');
        toastEl.className = 'toast toast-' + type;
        toastEl.innerHTML = '<span>' + (icons[type] || '') + '</span><span>' + _escapeHtml(message) + '</span>';
        container.appendChild(toastEl);

        setTimeout(function() {
            toastEl.classList.add('removing');
            setTimeout(function() {
                if (toastEl.parentNode) {
                    toastEl.parentNode.removeChild(toastEl);
                }
            }, 300);
        }, 3500);
    }

    function success(msg) { toast(msg, 'success'); }
    function error(msg) { toast(msg, 'error'); }
    function warning(msg) { toast(msg, 'warning'); }
    function info(msg) { toast(msg, 'info'); }

    // --- Loading ---

    function showLoading() {
        var el = document.getElementById('loading-overlay');
        if (el) el.classList.remove('hidden');
    }

    function hideLoading() {
        var el = document.getElementById('loading-overlay');
        if (el) el.classList.add('hidden');
    }

    // --- Modal ---

    function showModal(options) {
        var backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML =
            '<div class="modal">' +
                '<div class="modal-header">' +
                    '<h3 class="modal-title">' + _escapeHtml(options.title || '') + '</h3>' +
                    '<button class="modal-close" data-modal-close>&times;</button>' +
                '</div>' +
                '<div class="modal-body">' + (options.body || '') + '</div>' +
                (options.footer !== false ?
                    '<div class="modal-footer">' + (options.footer || '') + '</div>'
                : '') +
            '</div>';

        document.body.appendChild(backdrop);

        // Anima entrata
        requestAnimationFrame(function() {
            backdrop.classList.add('active');
        });

        // Chiudi con X e bottoni data-modal-close
        backdrop.querySelectorAll('[data-modal-close]').forEach(function(el) {
            el.addEventListener('click', function() {
                closeModal(backdrop);
            });
        });

        // Chiudi cliccando fuori
        backdrop.addEventListener('click', function(e) {
            if (e.target === backdrop) {
                closeModal(backdrop);
            }
        });

        // Chiudi con Escape
        var escHandler = function(e) {
            if (e.key === 'Escape') {
                closeModal(backdrop);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        return backdrop;
    }

    function closeModal(backdrop) {
        if (!backdrop) return;
        backdrop.classList.remove('active');
        setTimeout(function() {
            if (backdrop.parentNode) {
                backdrop.parentNode.removeChild(backdrop);
            }
        }, 300);
    }

    // --- Confirm Dialog ---

    function confirm(options) {
        return new Promise(function(resolve) {
            var message = typeof options === 'string' ? options : options.message;
            var title = (typeof options === 'object' && options.title) ? options.title : 'Conferma';
            var confirmText = (typeof options === 'object' && options.confirmText) ? options.confirmText : 'Conferma';
            var cancelText = (typeof options === 'object' && options.cancelText) ? options.cancelText : 'Annulla';
            var danger = (typeof options === 'object' && options.danger) ? true : false;

            var backdrop = showModal({
                title: title,
                body: '<p>' + _escapeHtml(message) + '</p>',
                footer:
                    '<button class="btn btn-outline" data-action="cancel">' + _escapeHtml(cancelText) + '</button>' +
                    '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-action="confirm">' + _escapeHtml(confirmText) + '</button>'
            });

            backdrop.querySelector('[data-action="confirm"]').addEventListener('click', function() {
                closeModal(backdrop);
                resolve(true);
            });

            backdrop.querySelector('[data-action="cancel"]').addEventListener('click', function() {
                closeModal(backdrop);
                resolve(false);
            });
        });
    }

    // --- Formattazione ---

    function formatValuta(numero) {
        if (numero === null || numero === undefined) return '\u20AC 0,00';
        return '\u20AC ' + Number(numero).toLocaleString('it-IT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatNumero(numero, decimali) {
        decimali = decimali !== undefined ? decimali : 0;
        if (numero === null || numero === undefined) return '0';
        return Number(numero).toLocaleString('it-IT', {
            minimumFractionDigits: decimali,
            maximumFractionDigits: decimali
        });
    }

    function formatData(dateStr) {
        if (!dateStr) return '-';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        var dd = String(d.getDate()).padStart(2, '0');
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var yy = String(d.getFullYear()).slice(2);
        return dd + '/' + mm + '/' + yy;
    }

    function formatDataCompleta(dateStr) {
        if (!dateStr) return '-';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        var dd = String(d.getDate()).padStart(2, '0');
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var yyyy = d.getFullYear();
        return dd + '/' + mm + '/' + yyyy;
    }

    function formatDataOra(dateStr) {
        if (!dateStr) return '-';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        var dd = String(d.getDate()).padStart(2, '0');
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var hh = String(d.getHours()).padStart(2, '0');
        var min = String(d.getMinutes()).padStart(2, '0');
        return dd + '/' + mm + ' ' + hh + ':' + min;
    }

    function formatOra(timeStr) {
        if (!timeStr) return '-';
        return timeStr.substring(0, 5);
    }

    function oggiISO() {
        var d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function oraCorrente() {
        var d = new Date();
        return String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0');
    }

    // --- Badge HTML ---

    function badge(text, type) {
        return '<span class="badge badge-' + (type || '').toLowerCase() + '">' + _escapeHtml(text) + '</span>';
    }

    function badgeStato(stato) {
        var map = {
            'Aperto': 'aperto',
            'Incassato': 'incassato',
            'Scaduto': 'scaduto',
            'Annullato': 'annullato',
            'Prenotato': 'prenotato',
            'Completato': 'completato',
            'Corporate': 'corporate',
            'Privato': 'privato',
            'ASPETTA': 'aspetta',
            'LASCIA': 'lascia'
        };
        return badge(stato, map[stato] || '');
    }

    // --- Helpers HTML ---

    function _escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeHtml(str) {
        return _escapeHtml(str);
    }

    // Render di un elemento nella pagina
    function render(containerId, html) {
        var el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (el) el.innerHTML = html;
    }

    // Delegate events (con protezione duplicati)
    function delegate(container, event, selector, handler) {
        var el = typeof container === 'string' ? document.getElementById(container) : container;
        if (!el) return;

        // Previeni listener duplicati sullo stesso container+evento+selettore
        var key = '_dlg_' + event + '_' + selector.replace(/[^a-zA-Z0-9]/g, '_');
        if (el[key]) return;
        el[key] = true;

        el.addEventListener(event, function(e) {
            var target = e.target.closest(selector);
            if (target && el.contains(target)) {
                handler.call(target, e, target);
            }
        });
    }

    // API pubblica
    return {
        toast: toast,
        success: success,
        error: error,
        warning: warning,
        info: info,
        showLoading: showLoading,
        hideLoading: hideLoading,
        showModal: showModal,
        closeModal: closeModal,
        confirm: confirm,
        formatValuta: formatValuta,
        formatNumero: formatNumero,
        formatData: formatData,
        formatDataCompleta: formatDataCompleta,
        formatDataOra: formatDataOra,
        formatOra: formatOra,
        oggiISO: oggiISO,
        oraCorrente: oraCorrente,
        badge: badge,
        badgeStato: badgeStato,
        escapeHtml: escapeHtml,
        render: render,
        delegate: delegate
    };
})();
