// ============================================================
// TITANWASH - Print Server ESC/POS
// Server locale per stampa su stampante termica Epson 80mm
// ============================================================

require('dotenv').config();

var express = require('express');
var cors = require('cors');
var net = require('net');
var fs = require('fs');
var path = require('path');

var app = express();
var PORT = 3333;

// Configurazione stampante (modificare con IP reale)
var PRINTER_IP = process.env.PRINTER_IP || '192.168.1.130';
var PRINTER_PORT = parseInt(process.env.PRINTER_PORT) || 9100;

// File configurazione layout
var LAYOUT_FILE = path.join(__dirname, 'layout.json');

// ============================================================
// Supabase - per coda stampa remota (smartphone)
// Le credenziali vengono lette da variabili d'ambiente (.env)
// ============================================================
var SUPABASE_URL = process.env.SUPABASE_URL || '';
var SUPABASE_KEY = process.env.SUPABASE_KEY || '';
var _supabase = null;

function getSupabase() {
    if (_supabase) return _supabase;
    try {
        var createClient = require('@supabase/supabase-js').createClient;
        _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        return _supabase;
    } catch (e) {
        console.log('[QUEUE] @supabase/supabase-js non installato. Coda stampa remota disabilitata.');
        return null;
    }
}

// Layout default
var DEFAULT_LAYOUT = {
    nome_negozio: 'TITANWASH',
    indirizzo: 'Borgo Maggiore - San Marino',
    footer: 'Grazie e arrivederci!',
    mostra_operatore: true,
    mostra_data_ora: true,
    tipo_taglio: 'parziale',
    righe_prima_taglio: 3,
    printer_ip: PRINTER_IP,
    printer_port: PRINTER_PORT
};

function loadLayout() {
    try {
        if (fs.existsSync(LAYOUT_FILE)) {
            var data = JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf8'));
            return Object.assign({}, DEFAULT_LAYOUT, data);
        }
    } catch (e) {
        console.error('[CONFIG] Errore lettura layout.json:', e.message);
    }
    return Object.assign({}, DEFAULT_LAYOUT);
}

function saveLayout(layout) {
    fs.writeFileSync(LAYOUT_FILE, JSON.stringify(layout, null, 2), 'utf8');
}

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
// Logo: converte base64 PNG/JPG in comandi ESC/POS raster
// Usa il comando GS v 0 (raster bit image)
// ============================================================
function buildLogoBuffer(base64Data) {
    try {
        // Rimuovi header data:image/...;base64,
        var raw = base64Data.replace(/^data:image\/\w+;base64,/, '');
        var imgBuffer = Buffer.from(raw, 'base64');

        // Decodifica PNG/JPG in pixel raw usando canvas-less approach
        // Per semplicita, usiamo il modulo 'sharp' se disponibile, altrimenti skip
        // Ma possiamo usare un approccio puro: decodifichiamo il PNG manualmente
        // Usiamo un approccio alternativo: stampiamo il logo come bitmap ESC/POS

        // Prova a caricare sharp per image processing
        var sharp;
        try {
            sharp = require('sharp');
        } catch (e) {
            // sharp non disponibile, prova con jimp
            try {
                var Jimp = require('jimp');
                return _buildLogoWithJimp(imgBuffer);
            } catch (e2) {
                console.log('[LOGO] Nessuna libreria immagini disponibile (sharp/jimp). Logo non stampato.');
                return null;
            }
        }

        return _buildLogoWithSharp(sharp, imgBuffer);
    } catch (e) {
        console.error('[LOGO] Errore conversione logo:', e.message);
        return null;
    }
}

function _buildLogoWithSharp(sharp, imgBuffer) {
    // Ritorna una Promise che risolve con il buffer ESC/POS
    return sharp(imgBuffer)
        .resize({ width: 384, fit: 'inside' }) // 384px = larghezza stampa 80mm a 203dpi
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then(function(result) {
            var pixels = result.data;
            var width = result.info.width;
            var height = result.info.height;
            return _pixelsToEscPos(pixels, width, height);
        });
}

function _buildLogoWithJimp(imgBuffer) {
    var Jimp = require('jimp');
    return Jimp.read(imgBuffer).then(function(image) {
        image.resize(384, Jimp.AUTO).greyscale();
        var width = image.bitmap.width;
        var height = image.bitmap.height;
        // Estrai pixel come array di grigi
        var pixels = Buffer.alloc(width * height);
        for (var y = 0; y < height; y++) {
            for (var x = 0; x < width; x++) {
                var idx = (y * width + x) * 4;
                pixels[y * width + x] = image.bitmap.data[idx]; // R channel (greyscale)
            }
        }
        return _pixelsToEscPos(pixels, width, height);
    });
}

function _pixelsToEscPos(pixels, width, height) {
    // GS v 0 - Print raster bit image
    // Format: GS v 0 m xL xH yL yH d1...dk
    // m = 0 (normal), 1 (double width), 2 (double height), 3 (double both)
    var bytesPerRow = Math.ceil(width / 8);
    var xL = bytesPerRow & 0xFF;
    var xH = (bytesPerRow >> 8) & 0xFF;
    var yL = height & 0xFF;
    var yH = (height >> 8) & 0xFF;

    // Header: GS v 0 0 xL xH yL yH
    var header = Buffer.from([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH]);

    // Converti pixel in bit (1 = nero, 0 = bianco)
    var imgData = Buffer.alloc(bytesPerRow * height);
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var pixelIdx = y * width + x;
            var gray = pixels[pixelIdx];
            // Soglia: < 128 = nero (bit 1)
            if (gray < 128) {
                var byteIdx = y * bytesPerRow + Math.floor(x / 8);
                var bitIdx = 7 - (x % 8);
                imgData[byteIdx] |= (1 << bitIdx);
            }
        }
    }

    return Buffer.concat([header, imgData]);
}

// ============================================================
// Genera buffer ESC/POS dallo scontrino
// ============================================================
function buildReceipt(data) {
    var layout = loadLayout();
    // Sovrascrivi con layout dal frontend se fornito
    if (data.layout) {
        Object.assign(layout, data.layout);
    }

    var buf = '';

    // Init
    buf += CMD.INIT;

    // === LOGO (se presente, va stampato come bitmap) ===
    // Il logo viene gestito separatamente come Buffer binario
    var _logoBuf = null;
    if (layout.logo_base64 && layout.logo_base64.length > 100) {
        try {
            var logoResult = buildLogoBuffer(layout.logo_base64);
            if (logoResult && logoResult.then) {
                // E' una Promise, verra' risolta nel caller
                data._logoPromise = logoResult;
            } else if (logoResult) {
                _logoBuf = logoResult;
            }
        } catch (e) {
            console.log('[LOGO] Skip logo:', e.message);
        }
    }
    data._logoBuf = _logoBuf;

    // === INTESTAZIONE (centrata) ===
    buf += CMD.ALIGN_CENTER;
    buf += CMD.BOLD_ON + CMD.DOUBLE_HEIGHT_ON;
    buf += (layout.nome_negozio || 'TITANWASH') + CMD.FEED;
    buf += CMD.DOUBLE_HEIGHT_OFF + CMD.BOLD_OFF;
    if (layout.sottotitolo) {
        buf += layout.sottotitolo + CMD.FEED;
    }
    if (layout.indirizzo) {
        buf += layout.indirizzo + CMD.FEED;
    }
    if (layout.telefono) {
        buf += 'Tel: ' + layout.telefono + CMD.FEED;
    }
    if (layout.partita_iva) {
        buf += 'P.IVA: ' + layout.partita_iva + CMD.FEED;
    }
    if (layout.email) {
        buf += layout.email + CMD.FEED;
    }
    if (layout.sito_web) {
        buf += layout.sito_web + CMD.FEED;
    }
    if (layout.mostra_data_ora !== false) {
        buf += data.data + ' ' + data.ora + CMD.FEED;
    }
    if (layout.mostra_operatore !== false) {
        buf += 'Op: ' + (data.operatore || '-') + CMD.FEED;
    }

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
    buf += (layout.footer_riga1 || layout.footer || 'Grazie e arrivederci!') + CMD.FEED;
    if (layout.footer_riga2) {
        buf += layout.footer_riga2 + CMD.FEED;
    }
    if (layout.footer_riga3) {
        buf += layout.footer_riga3 + CMD.FEED;
    }
    if (layout.mostra_codice !== false) {
        buf += CMD.FONT_SMALL;
        buf += (data.codice || '') + CMD.FEED;
        buf += CMD.FONT_NORMAL;
    }

    // Feed + Cut
    var feedLines = layout.righe_prima_taglio || 3;
    for (var i = 0; i < feedLines; i++) {
        buf += CMD.FEED;
    }
    if (layout.tipo_taglio === 'completo') {
        buf += GS + '\x56\x00'; // Taglio completo
    } else {
        buf += CMD.CUT; // Taglio parziale (default)
    }

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
            // Supporta sia stringhe che Buffer
            var buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary');
            client.write(buf, function() {
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
app.post('/print', async function(req, res) {
    var data = req.body;

    if (!data || !data.totale) {
        return res.status(400).json({ success: false, message: 'Dati scontrino mancanti' });
    }

    var receiptText = buildReceipt(data);

    // Usa IP/porta dal body se forniti, altrimenti default
    var ip = data.printer_ip || PRINTER_IP;
    var port = data.printer_port || PRINTER_PORT;

    try {
        // Costruisci buffer finale: INIT + LOGO (se presente) + TESTO
        var parts = [];

        // Logo bitmap (se presente)
        var logoPromise = data._logoPromise;
        var logoBuf = data._logoBuf;

        if (logoPromise) {
            try {
                logoBuf = await logoPromise;
            } catch (e) {
                console.log('[LOGO] Errore rendering logo:', e.message);
            }
        }

        if (logoBuf && Buffer.isBuffer(logoBuf)) {
            // INIT + ALIGN_CENTER + logo bitmap + newline
            parts.push(Buffer.from(CMD.INIT + CMD.ALIGN_CENTER, 'binary'));
            parts.push(logoBuf);
            parts.push(Buffer.from(CMD.FEED, 'binary'));
            // Il resto del receipt (senza il CMD.INIT iniziale che e' gia' nel logo)
            var textWithoutInit = receiptText.replace(CMD.INIT, '');
            parts.push(Buffer.from(textWithoutInit, 'binary'));
        } else {
            parts.push(Buffer.from(receiptText, 'binary'));
        }

        var finalBuffer = Buffer.concat(parts);
        var result = await sendToPrinter(finalBuffer, ip, port);
        console.log('[PRINT] Scontrino inviato:', data.codice || 'N/A');
        res.json(result);
    } catch (err) {
        console.error('[PRINT] Errore:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Leggi configurazione layout
app.get('/config', function(req, res) {
    res.json(loadLayout());
});

// Salva configurazione layout
app.post('/config', function(req, res) {
    var newLayout = req.body;
    if (!newLayout) {
        return res.status(400).json({ success: false, message: 'Dati mancanti' });
    }

    // Aggiorna IP/porta stampante se cambiati
    if (newLayout.printer_ip) PRINTER_IP = newLayout.printer_ip;
    if (newLayout.printer_port) PRINTER_PORT = parseInt(newLayout.printer_port);

    saveLayout(newLayout);
    console.log('[CONFIG] Layout aggiornato');
    res.json({ success: true, message: 'Configurazione salvata' });
});

// ============================================================
// CODA STAMPA REMOTA - Polling Supabase
// ============================================================
var POLL_INTERVAL = 5000; // 5 secondi
var _polling = false;

async function pollPrintQueue() {
    if (_polling) return;
    _polling = true;

    try {
        var sb = getSupabase();
        if (!sb) { _polling = false; return; }

        var res = await sb
            .from('print_queue')
            .select('*')
            .eq('stato', 'pending')
            .order('created_at', { ascending: true })
            .limit(5);

        if (res.error) {
            if (res.error.message && res.error.message.indexOf('does not exist') > -1) {
                console.log('[QUEUE] Tabella print_queue non trovata. Crea la tabella su Supabase.');
            }
            _polling = false;
            return;
        }

        var jobs = res.data || [];
        for (var i = 0; i < jobs.length; i++) {
            var job = jobs[i];
            console.log('[QUEUE] Stampa job:', job.vendita_codice);

            try {
                var printData = job.print_data;
                var receiptText = buildReceipt(printData);
                var ip = printData.printer_ip || PRINTER_IP;
                var port = printData.printer_port || PRINTER_PORT;

                // Gestione logo async
                var parts = [];
                var logoPromise = printData._logoPromise;
                var logoBuf = printData._logoBuf;

                if (logoPromise) {
                    try { logoBuf = await logoPromise; } catch (e) {}
                }

                if (logoBuf && Buffer.isBuffer(logoBuf)) {
                    parts.push(Buffer.from(CMD.INIT + CMD.ALIGN_CENTER, 'binary'));
                    parts.push(logoBuf);
                    parts.push(Buffer.from(CMD.FEED, 'binary'));
                    parts.push(Buffer.from(receiptText.replace(CMD.INIT, ''), 'binary'));
                } else {
                    parts.push(Buffer.from(receiptText, 'binary'));
                }

                var finalBuffer = Buffer.concat(parts);
                await sendToPrinter(finalBuffer, ip, port);

                // Marca come stampato
                await sb
                    .from('print_queue')
                    .update({ stato: 'printed', printed_at: new Date().toISOString() })
                    .eq('id', job.id);

                console.log('[QUEUE] Stampato:', job.vendita_codice);
            } catch (printErr) {
                console.error('[QUEUE] Errore stampa job', job.id, ':', printErr.message);
                // Marca come errore dopo 3 tentativi? Per ora lo lascia pending
            }
        }
    } catch (e) {
        // Silenzioso - potrebbe essere un errore di rete temporaneo
    }

    _polling = false;
}

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

    // Avvia polling coda stampa remota
    var sb = getSupabase();
    if (sb) {
        console.log('Coda stampa remota: ATTIVA (polling ogni ' + (POLL_INTERVAL / 1000) + 's)');
        setInterval(pollPrintQueue, POLL_INTERVAL);
    } else {
        console.log('Coda stampa remota: DISABILITATA');
        console.log('  Per attivarla: npm install @supabase/supabase-js');
    }
    console.log('');
});
