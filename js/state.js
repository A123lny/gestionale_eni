// ============================================================
// GESTIONALE ENI - State Manager
// Gestione stato globale applicazione e cache dati
// ============================================================

var ENI = ENI || {};

ENI.State = (function() {
    'use strict';

    // Stato utente corrente
    var _currentUser = null;

    // Cache dati con TTL
    var _cache = {};

    // Listeners per cambiamenti di stato
    var _listeners = {};

    // --- Utente ---

    function setUser(user) {
        _currentUser = user;
        if (user) {
            sessionStorage.setItem('eni_user', JSON.stringify(user));
        } else {
            sessionStorage.removeItem('eni_user');
        }
        _emit('userChanged', user);
    }

    function getUser() {
        if (!_currentUser) {
            var stored = sessionStorage.getItem('eni_user');
            if (stored) {
                try {
                    _currentUser = JSON.parse(stored);
                } catch(e) {
                    sessionStorage.removeItem('eni_user');
                }
            }
        }
        return _currentUser;
    }

    function isLoggedIn() {
        return getUser() !== null;
    }

    function getUserRole() {
        var user = getUser();
        return user ? user.ruolo : null;
    }

    function getUserId() {
        var user = getUser();
        return user ? user.id : null;
    }

    function getUserName() {
        var user = getUser();
        return user ? user.nome_completo : null;
    }

    function canAccess(moduloId) {
        var ruolo = getUserRole();
        if (!ruolo) return false;
        var config = ENI.Config.RUOLI[ruolo];
        return config && config.moduli.indexOf(moduloId) !== -1;
    }

    function canWrite(moduloId) {
        var ruolo = getUserRole();
        if (!ruolo) return false;
        var config = ENI.Config.RUOLI[ruolo];
        return config && config.scrivere.indexOf(moduloId) !== -1;
    }

    // --- Cache ---

    function cacheSet(key, data) {
        _cache[key] = {
            data: data,
            timestamp: Date.now()
        };
    }

    function cacheGet(key) {
        var entry = _cache[key];
        if (!entry) return null;
        if (Date.now() - entry.timestamp > ENI.Config.CACHE_TTL) {
            delete _cache[key];
            return null;
        }
        return entry.data;
    }

    function cacheClear(key) {
        if (key) {
            delete _cache[key];
        } else {
            _cache = {};
        }
    }

    // --- Events ---

    function on(event, callback) {
        if (!_listeners[event]) {
            _listeners[event] = [];
        }
        _listeners[event].push(callback);
    }

    function off(event, callback) {
        if (!_listeners[event]) return;
        _listeners[event] = _listeners[event].filter(function(cb) {
            return cb !== callback;
        });
    }

    function _emit(event, data) {
        if (!_listeners[event]) return;
        _listeners[event].forEach(function(cb) {
            try { cb(data); } catch(e) { console.error('State listener error:', e); }
        });
    }

    // --- Logout ---

    function logout() {
        _currentUser = null;
        _cache = {};
        sessionStorage.removeItem('eni_user');
        _emit('userChanged', null);
    }

    // API pubblica
    return {
        setUser: setUser,
        getUser: getUser,
        isLoggedIn: isLoggedIn,
        getUserRole: getUserRole,
        getUserId: getUserId,
        getUserName: getUserName,
        canAccess: canAccess,
        canWrite: canWrite,
        cacheSet: cacheSet,
        cacheGet: cacheGet,
        cacheClear: cacheClear,
        on: on,
        off: off,
        logout: logout
    };
})();
