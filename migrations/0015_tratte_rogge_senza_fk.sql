-- Le figlie della gerarchia R possono non avere la madre in elenco (richiesta
-- del consorzio del 24/09/2026): Anagrafiche le mostra con la madre ricavata
-- dalle prime 3 cifre e la descrizione «-». La FK della 0013 lo impediva, e
-- con lei un'orfana faceva fallire l'intera scrittura della gerarchia.
--
-- La madre non si inventa: resta assente da madri_rogge, quindi Invia notifica,
-- che elenca le madri da lì, non offre quella figlia.
--
-- Si applica PRIMA del riavvio sul codice nuovo: senza, alla prima orfana il
-- sync lascia la gerarchia di ieri e registra l'errore. Idempotente.

ALTER TABLE tratte_rogge DROP CONSTRAINT IF EXISTS tratte_rogge_codice_madre_fkey;
