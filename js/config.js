// ============================================================
// TITANWASH - Configurazione
// Credenziali Supabase e costanti applicazione
// ============================================================

var ENI = ENI || {};

ENI.Config = {
    // Supabase - SOSTITUIRE con le proprie credenziali
    SUPABASE_URL: 'https://upwkodrmfljgikmstogy.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwd2tvZHJtZmxqZ2lrbXN0b2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzMwMTEsImV4cCI6MjA4Njg0OTAxMX0.BVhpeBdiX75TFdlAsqpLQgWR7bG6MABCMWWt2zUkXqQ',

    // App
    APP_NAME: 'Titanwash',
    APP_VERSION: '1.0.0',
    STATION_NAME: 'Titanwash - Borgo Maggiore',

    // Prefissi codici
    PREFISSI: {
        CLIENTE: 'CLI',
        LAVAGGIO: 'LAV',
        CREDITO: 'CRE',
        MANUTENZIONE: 'MAN',
        VENDITA: 'VEN',
        RESO: 'RES'
    },

    // Ruoli e permessi
    RUOLI: {
        Admin: {
            label: 'Amministratore',
            moduli: ['dashboard', 'clienti', 'cassa', 'spese', 'crediti', 'lavaggi', 'vendita', 'magazzino', 'personale', 'manutenzioni', 'log'],
            scrivere: ['clienti', 'cassa', 'spese', 'crediti', 'lavaggi', 'vendita', 'magazzino', 'personale', 'manutenzioni']
        },
        Cassiere: {
            label: 'Cassiere',
            moduli: ['dashboard', 'clienti', 'cassa', 'spese', 'crediti', 'lavaggi', 'vendita', 'magazzino'],
            scrivere: ['cassa', 'spese', 'crediti', 'lavaggi', 'vendita', 'magazzino']
        },
        Lavaggi: {
            label: 'Operatore Lavaggi',
            moduli: ['dashboard', 'clienti', 'lavaggi'],
            scrivere: ['lavaggi']
        }
    },

    // Navigazione principale
    NAV_ITEMS: [
        { id: 'dashboard', label: 'Dashboard', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>', route: '#/dashboard' },
        { id: 'clienti', label: 'Clienti', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', route: '#/clienti' },
        { id: 'cassa', label: 'Cassa', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M2 10h3M19 10h3M2 14h3M19 14h3"/></svg>', route: '#/cassa' },
        { id: 'spese', label: 'Spese', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>', route: '#/spese' },
        { id: 'crediti', label: 'Crediti', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>', route: '#/crediti' },
        { id: 'lavaggi', label: 'Lavaggi', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14"/><path d="M6 17l1-5h10l1 5"/><circle cx="8" cy="17" r="1"/><circle cx="16" cy="17" r="1"/><path d="M7 12l1-3h8l1 3"/><path d="M8 5v2M12 4v3M16 5v2"/></svg>', route: '#/lavaggi' },
        { id: 'vendita', label: 'Vendita', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>', route: '#/vendita' },
        { id: 'magazzino', label: 'Magazzino', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>', route: '#/magazzino' },
        { id: 'personale', label: 'Personale', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>', route: '#/personale' },
        { id: 'manutenzioni', label: 'Manutenzioni', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>', route: '#/manutenzioni' },
        { id: 'log', label: 'Log', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>', route: '#/log' }
    ],

    // Bottom nav mobile (max 5 items, il resto in "Altro")
    BOTTOM_NAV_ITEMS: ['dashboard', 'vendita', 'cassa', 'lavaggi'],

    // Modalita pagamento
    MODALITA_PAGAMENTO: [
        { value: 'Cash', label: 'Cash immediato' },
        { value: 'Addebito_Mese', label: 'Addebito fine mese' },
        { value: 'Addebito_30gg', label: 'Addebito 30 giorni' },
        { value: 'Addebito_60gg', label: 'Addebito 60 giorni' },
        { value: 'Bonifico_Anticipato', label: 'Bonifico anticipato' }
    ],

    // Modalita incasso crediti
    MODALITA_INCASSO: [
        { value: 'Contanti', label: 'Contanti' },
        { value: 'Bonifico', label: 'Bonifico' },
        { value: 'POS', label: 'POS' },
        { value: 'Assegno', label: 'Assegno' }
    ],

    // Categorie magazzino
    CATEGORIE_MAGAZZINO: ['Accessori', 'Tergicristalli', 'Catene', 'Profumatori', 'Uso interno', 'Oli e lubrificanti', 'Bar', 'Detailing', 'AdBlue', 'Altro'],

    // Metodi pagamento POS
    METODI_PAGAMENTO_POS: [
        { value: 'contanti', label: 'Contanti' },
        { value: 'pos', label: 'POS / Carta' },
        { value: 'misto', label: 'Misto (Contanti + POS)' }
    ],

    // Durata cache dati (millisecondi)
    CACHE_TTL: 5 * 60 * 1000,   // 5 minuti

    // Auto-refresh dashboard
    DASHBOARD_REFRESH: 5 * 60 * 1000,  // 5 minuti

    // Scadenza crediti default (giorni)
    CREDITO_SCADENZA_GIORNI: 30
};
