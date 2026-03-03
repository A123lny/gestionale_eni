-- ============================================================
-- Migration 006: Reset Password Admin per Clienti Portale
-- Permette all'operatore di resettare la password senza conoscere quella vecchia
-- ============================================================

CREATE OR REPLACE FUNCTION reset_password_cliente_admin(
    p_cliente_portale_id UUID,
    p_nuova_password TEXT
)
RETURNS JSON AS $$
BEGIN
    IF LENGTH(TRIM(p_nuova_password)) < 6 THEN
        RETURN json_build_object('success', false, 'error', 'Password deve essere almeno 6 caratteri');
    END IF;

    UPDATE clienti_portale
    SET password_hash = crypt(p_nuova_password, gen_salt('bf', 10))
    WHERE id = p_cliente_portale_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Account non trovato');
    END IF;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
