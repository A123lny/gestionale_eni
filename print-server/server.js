// ============================================================
// TITANWASH - Print Server ESC/POS
// Server locale per stampa su stampante termica Epson 80mm
// ============================================================

var express = require('express');
var cors = require('cors');
var net = require('net');

var app = express();
var PORT = 3333;

// Configurazione stampante (modificare con IP reale)
var PRINTER_IP = process.env.PRINTER_IP || '192.168.1.100';
var PRINTER_PORT = parseInt(process.env.PRINTER_PORT) || 9100;

app.use(cors());
app.use(express.json());

// ============================================================
// ESC/POS Commands
// ============================================================
var ESC = '\x1B';
var GS = '\x1D';

var CMD = {
    INIT: ESC + '\x40',                    // Inizializza stampante
    ALIGN_CENTER: ESC + '\x61\x01',        // Centra testo
    ALIGN_LEFT: ESC + '\x61\x00',          // Allinea a sinistra
    ALIGN_RIGHT: ESC + '\x61\x02',         // Allinea a destra
    BOLD_ON: ESC + '\x45\x01',             // Grassetto ON
    BOLD_OFF: ESC + '\x45\x00',            // Grassetto OFF
    DOUBLE_HEIGHT_ON: ESC + '\x21\x10',    // Doppia altezza ON
    DOUBLE_HEIGHT_OFF: ESC + '\x21\x00',   // Doppia altezza OFF
    FONT_SMALL: ESC + '\x4D\x01',         // Font piccolo (Font B)
    FONT_NORMAL: ESC + '\x4D\x00',        // Font normale (Font A)
    CUT: GS + '\x56\x41\x03',             // Taglio parziale (3 punti di feed)
    FEED: '\n'
};

// Larghezza massima caratteri per 80mm (Font A = 48 chars, Font B = 64 chars)
var LINE_WIDTH = 48;

// ============================================================
// Helper: formatta riga con prezzo allineato a destra
// ============================================================
function formatLine(left, right) {
    right = right || '';
    var spaces = LINE_WIDTH - left.length - right.length;
    if (spaces < 1) spaces = 1;
    return left + ' '.repeat(spaces) + right;
}

function separator() {
    return '-'.repeat(LINE_WIDTH);
}

function centerText(text) {
    var padding = Math.max(0, Math.floor((LINE_WIDTH - text.length) / 2));
    return ' '.repeat(padding) + text;
}

// ============================================================
// Genera buffer ESC/POS dallo scontrino
// ============================================================
function buildReceipt(data) {
    var buf = '';

    // Init
    buf += CMD.INIT;

    // === INTESTAZIONE (centrata) ===
    buf += CMD.ALIGN_CENTER;
    buf += CMD.BOLD_ON + CMD.DOUBLE_HEIGHT_ON;
    buf += (data.nome_negozio || 'TITANWASH') + CMD.FEED;
    buf += CMD.DOUBLE_HEIGHT_OFF + CMD.BOLD_OFF;
    buf += (data.indirizzo || 'Borgo Maggiore - San Marino') + CMD.FEED;
    buf += data.data + ' ' + data.ora + CMD.FEED;
    buf += 'Op: ' + (data.operatore || '-') + CMD.FEED;

    // Separatore
    buf += CMD.ALIGN_LEFT;
    buf += separator() + CMD.FEED;

    // === RIGHE ARTICOLI ===
    if (data.righe && data.righe.length > 0) {
        data.righe.forEach(function(riga) {
            buf += riga.nome + CMD.FEED;

            var dettaglio = '  ' + riga.quantita + ' x ' + Number(riga.prezzo_unitario).toFixed(2);
            if (riga.sconto && riga.sconto > 0) {
                dettaglio += ' sc.' + (riga.sconto_tipo === 'percentuale' ? riga.sconto + '%' : Number(riga.sconto).toFixed(2));
            }
            var totRiga = Number(riga.totale_riga).toFixed(2);
            buf += formatLine(dettaglio, totRiga) + CMD.FEED;
        });
    }

    // Separatore
    buf += separator() + CMD.FEED;

    // === TOTALI ===
    if (data.sconto_globale && data.sconto_globale > 0) {
        buf += formatLine('Subtotale:', Number(data.subtotale).toFixed(2)) + CMD.FEED;
        var scontoStr = '-' + Number(data.sconto_globale).toFixed(2);
        if (data.sconto_globale_tipo === 'percentuale') scontoStr += '%';
        buf += formatLine('Sconto:', scontoStr) + CMD.FEED;
    }

    buf += CMD.BOLD_ON + CMD.DOUBLE_HEIGHT_ON;
    buf += formatLine('TOTALE EUR', Number(data.totale).toFixed(2)) + CMD.FEED;
    buf += CMD.DOUBLE_HEIGHT_OFF + CMD.BOLD_OFF;

    // Pagamento
    var metodoLabel = { contanti: 'Contanti', pos: 'POS/Carta', misto: 'Misto' };
    buf += formatLine('Pagamento:', metodoLabel[data.metodo_pagamento] || data.metodo_pagamento) + CMD.FEED;

    if (data.metodo_pagamento === 'contanti' || data.metodo_pagamento === 'misto') {
        if (data.importo_contanti && data.importo_contanti > 0) {
            buf += formatLine('  Contanti:', Number(data.importo_contanti).toFixed(2)) + CMD.FEED;
        }
        if (data.importo_pos && data.importo_pos > 0) {
            buf += formatLine('  POS:', Number(data.importo_pos).toFixed(2)) + CMD.FEED;
        }
        if (data.resto && data.resto > 0) {
            buf += formatLine('  Resto:', Number(data.resto).toFixed(2)) + CMD.FEED;
        }
    }

    // Separatore
    buf += separator() + CMD.FEED;

    // === FOOTER (centrato) ===
    buf += CMD.ALIGN_CENTER;
    buf += CMD.FEED;
    buf += 'Grazie e arrivederci!' + CMD.FEED;
    buf += CMD.FONT_SMALL;
    buf += (data.codice || '') + CMD.FEED;
    buf += CMD.FONT_NORMAL;

    // Feed + Cut
    buf += CMD.FEED + CMD.FEED + CMD.FEED;
    buf += CMD.CUT;

    return buf;
}

// ============================================================
// Invia dati alla stampante via TCP
// ============================================================
function sendToPrinter(data, printerIp, printerPort) {
    return new Promise(function(resolve, reject) {
        var ip = printerIp || PRINTER_IP;
        var port = printerPort || PRINTER_PORT;

        var client = new net.Socket();
        var timeout = setTimeout(function() {
            client.destroy();
            reject(new Error('Timeout connessione stampante (' + ip + ':' + port + ')'));
        }, 5000);

        client.connect(port, ip, function() {
            clearTimeout(timeout);
            client.write(Buffer.from(data, 'binary'), function() {
                client.end();
                resolve({ success: true, message: 'Scontrino inviato a ' + ip + ':' + port });
            });
        });

        client.on('error', function(err) {
            clearTimeout(timeout);
            reject(new Error('Errore stampante: ' + err.message));
        });
    });
}

// ============================================================
// ROUTES
// ============================================================

// Status check
app.get('/status', function(req, res) {
    res.json({
        status: 'online',
        printer: PRINTER_IP + ':' + PRINTER_PORT,
        version: '1.0.0'
    });
});

// Test connessione stampante
app.get('/test', function(req, res) {
    var testData = CMD.INIT +
        CMD.ALIGN_CENTER +
        CMD.BOLD_ON + CMD.DOUBLE_HEIGHT_ON +
        'TITANWASH' + CMD.FEED +
        CMD.DOUBLE_HEIGHT_OFF + CMD.BOLD_OFF +
        'Test stampa OK!' + CMD.FEED +
        CMD.FEED + CMD.FEED + CMD.FEED +
        CMD.CUT;

    sendToPrinter(testData)
        .then(function(result) {
            res.json(result);
        })
        .catch(function(err) {
            res.status(500).json({ success: false, message: err.message });
        });
});

// Stampa scontrino
app.post('/print', function(req, res) {
    var data = req.body;

    if (!data || !data.totale) {
        return res.status(400).json({ success: false, message: 'Dati scontrino mancanti' });
    }

    var receiptBuffer = buildReceipt(data);

    // Usa IP/porta dal body se forniti, altrimenti default
    var ip = data.printer_ip || PRINTER_IP;
    var port = data.printer_port || PRINTER_PORT;

    sendToPrinter(receiptBuffer, ip, port)
        .then(function(result) {
            console.log('[PRINT] Scontrino inviato:', data.codice || 'N/A');
            res.json(result);
        })
        .catch(function(err) {
            console.error('[PRINT] Errore:', err.message);
            res.status(500).json({ success: false, message: err.message });
        });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, function() {
    console.log('========================================');
    console.log('  TITANWASH Print Server');
    console.log('  http://localhost:' + PORT);
    console.log('  Stampante: ' + PRINTER_IP + ':' + PRINTER_PORT);
    console.log('========================================');
    console.log('');
    console.log('Endpoints:');
    console.log('  GET  /status  - Stato server');
    console.log('  GET  /test    - Stampa test');
    console.log('  POST /print   - Stampa scontrino');
    console.log('');
    console.log('Per cambiare IP stampante:');
    console.log('  set PRINTER_IP=192.168.1.XXX');
    console.log('');
});
