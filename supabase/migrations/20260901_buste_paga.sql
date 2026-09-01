-- ============================================================
-- Buste Paga: archivio cedolini PDF per dipendente
-- Il super admin carica/gestisce tutto; ogni dipendente vede/scarica
-- SOLO i propri (garantito da RLS su tabella e su Storage).
-- ============================================================

-- 1) Tabella metadati cedolini
CREATE TABLE IF NOT EXISTS public.buste_paga (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    personale_id uuid NOT NULL REFERENCES public.personale(id) ON DELETE CASCADE,
    anno int NOT NULL,
    mese int NOT NULL CHECK (mese BETWEEN 1 AND 12),
    descrizione text,                 -- opzionale (es. "Tredicesima")
    file_path text NOT NULL,          -- percorso nel bucket Storage
    file_nome text,                   -- nome file originale
    caricato_da uuid,
    caricato_nome text,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buste_paga_personale
    ON public.buste_paga(personale_id, anno DESC, mese DESC);

ALTER TABLE public.buste_paga ENABLE ROW LEVEL SECURITY;

-- Lettura: super admin tutto, dipendente solo i propri
CREATE POLICY buste_paga_select ON public.buste_paga FOR SELECT TO authenticated
    USING (public.is_super_admin() OR personale_id = public.current_personale_id());
-- Scrittura: solo super admin
CREATE POLICY buste_paga_insert ON public.buste_paga FOR INSERT TO authenticated
    WITH CHECK (public.is_super_admin());
CREATE POLICY buste_paga_update ON public.buste_paga FOR UPDATE TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY buste_paga_delete ON public.buste_paga FOR DELETE TO authenticated
    USING (public.is_super_admin());

-- 2) Bucket privato per i PDF
INSERT INTO storage.buckets (id, name, public)
VALUES ('buste-paga', 'buste-paga', false)
ON CONFLICT (id) DO NOTHING;

-- 3) Permessi sui file (storage.objects) per il bucket 'buste-paga'
-- Percorso file = "<personale_id>/<uuid>.pdf" → il dipendente legge solo la sua cartella.
CREATE POLICY buste_paga_files_select ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'buste-paga' AND (
            public.is_super_admin()
            OR (storage.foldername(name))[1] = public.current_personale_id()::text
        )
    );
CREATE POLICY buste_paga_files_insert ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'buste-paga' AND public.is_super_admin());
CREATE POLICY buste_paga_files_update ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'buste-paga' AND public.is_super_admin())
    WITH CHECK (bucket_id = 'buste-paga' AND public.is_super_admin());
CREATE POLICY buste_paga_files_delete ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'buste-paga' AND public.is_super_admin());
