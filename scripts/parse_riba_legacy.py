"""
Parser CBI .car per estrarre ABI/CAB dei debitori dal file RIBA legacy.
Cerca specifici clienti e stampa i loro dati bancari.
"""

with open('RIBA_FEB_MAR_26.car', 'r', encoding='latin-1') as f:
    content = f.read()

# Il file CBI .car ha record di 120 char, header IB e footer EF
# Cerco tutti i record 14 (disposizione) + record 30 (debitore) successivi.
# Strategia: scorro la stringa e suddivido in chunk di 120

# Skip header (parte da " IB" all'inizio)
# Trovo l'inizio del primo record disposizione: cerco "14" preceduto da fine intestazione
# Header e' lungo 120 ma il file inizia con " IB", quindi pos 120 e' il primo record

records = []
# Header e' 121 char (con leading space). Records subseguenti sono 120 char.
pos = 121
while pos + 120 <= len(content):
    rec = content[pos:pos+120]
    if rec.startswith(' EF') or rec.startswith('EF'):
        break
    records.append(rec)
    pos += 120

print(f'Record dati totali: {len(records)}')

# DEBUG: stampa primo gruppo intero
print('\n=== PRIMI 7 RECORD (debug) ===')
for r in records[:7]:
    print(f'[{r[0:2]}] [{r[2:9]}] {repr(r[9:50])}...')
print()

# Raggruppo per numero progressivo. Ogni disposizione ha 7 record (14, 20, 30, 40, 50, 51, 70)
# Il numero progressivo e' nei char 2-9 di ogni record
gruppi = {}
for r in records:
    tipo = r[1:2] + r[1:1]  # primo char
    n = r[2:9].strip()
    if n not in gruppi:
        gruppi[n] = {}
    code = r[0:2]
    gruppi[n][code] = r

# Cerco i 3 clienti
target_keywords = ['ZONZINI SRL', 'PITAGORA', 'PASSION CAR']

for n, dispo in sorted(gruppi.items()):
    rec30 = dispo.get('30', '')
    if not rec30:
        continue
    nome_debitore = rec30[9:69].strip()
    upper = nome_debitore.upper()
    if not any(k in upper for k in target_keywords):
        continue

    print(f'\n=== Disposizione {n} ===')
    print(f'Nome debitore: "{nome_debitore}"')
    if rec30:
        p_iva = rec30[69:85].strip()
        print(f'P.IVA/COE:     "{p_iva}"')

    # Mostra il record 14 intero con marker, cosi capisco offset esatti
    rec14 = dispo.get('14', '')
    if rec14:
        print(f'REC14 raw:     "{rec14}"')
        # Scompongo cercando il "-" come separatore segno
        idx_minus = rec14.find('-')
        if idx_minus > 0:
            pre_minus = rec14[:idx_minus]
            post_minus = rec14[idx_minus+1:]
            # Importo cents = ultimi 13 char prima di '-'
            importo = pre_minus[-13:].lstrip('0') or '0'
            # Dopo '-' ci sono ABI cred(5) + CAB cred(5) + ... + ABI deb(5) + CAB deb(5)
            abi_cred = post_minus[0:5]
            cab_cred = post_minus[5:10]
            print(f'  Importo cents: {importo}  (= {int(importo)/100:.2f} EUR)')
            print(f'  ABI cred / CAB cred: {abi_cred} / {cab_cred}')
            # Cerco l'ultimo gruppo di 10 cifre prima del trailing space
            stripped = post_minus.rstrip()
            # gli ultimi 10 char della parte non-blank potrebbero essere abi+cab debitore
            print(f'  Post-minus stripped: "{stripped}"')
            print(f'  Ultimi 10 char post-minus: "{stripped[-10:] if len(stripped) >= 10 else stripped}"')

    rec40 = dispo.get('40', '')
    if rec40:
        indirizzo = rec40[9:39].strip()
        cap = rec40[39:44].strip()
        comune = rec40[44:67].strip()
        banca = rec40[67:117].strip()
        print(f'Indirizzo:     "{indirizzo}"')
        print(f'CAP:           "{cap}"')
        print(f'Comune:        "{comune}"')
        print(f'Banca app.:    "{banca}"')
