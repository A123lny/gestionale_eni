// ============================================================
// GESTIONALE ENI - State Manager
// Gestione stato globale applicazione e cache dati
// ============================================================

var ENI = ENI || {};

ENI.State = (function() {
    'use strict';

    // Stato utente corrente (staff)
    var _currentUser = null;

    // Stato cliente corrente (portale)
    var _currentCliente = null;

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

    // --- Cliente Portale ---

    function setCliente(cliente) {
        _currentCliente = cliente;
        if (cliente) {
            sessionStorage.setItem('eni_cliente', JSON.stringify(cliente));
        } else {
            sessionStorage.removeItem('eni_cliente');
        }
        _emit('clienteChanged', cliente);
    }

    function getCliente() {
        if (!_currentCliente) {
            var stored = sessionStorage.getItem('eni_cliente');
            if (stored) {
                try {
                    _currentCliente = JSON.parse(stored);
                } catch(e) {
                    sessionStorage.removeItem('eni_cliente');
                }
            }
        }
        return _currentCliente;
    }

    function isClienteLoggedIn() {
        return getCliente() !== null;
    }

    function getClienteId() {
        var cliente = getCliente();
        return cliente ? cliente.id : null;
    }

    function getClienteNome() {
        var cliente = getCliente();
        return cliente ? cliente.nome : null;
    }

    function logoutCliente() {
        _currentCliente = null;
        sessionStorage.removeItem('eni_cliente');
        _emit('clienteChanged', null);
    }

    // --- Logout Staff ---

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
        logout: logout,
        setCliente: setCliente,
        getCliente: getCliente,
        isClienteLoggedIn: isClienteLoggedIn,
        getClienteId: getClienteId,
        getClienteNome: getClienteNome,
        logoutCliente: logoutCliente
    };
})();
