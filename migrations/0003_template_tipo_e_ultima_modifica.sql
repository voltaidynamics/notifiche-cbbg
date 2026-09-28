-- Tipo del template scollegato dal tipo evento, più la tracciatura delle
-- modifiche (issue #18, risposta del tester).
--
-- 1. notification_templates.event_type -> tipo_template
--    Non è un rinominare per gusto: `event_type` è lo stesso nome del campo che
--    sull'invio e in Impostazioni decide i canali per tipo evento, e il tipo del
--    template non vincola niente di tutto ciò — serve solo a filtrare la lista.
--    I cinque tipi evento restano dove sono; il template ne accetta tre.
--    I tre valori che spariscono (manutenzione, riduzione_portata,
--    straordinario) diventano "altro", che è esattamente ciò che sono per
--    l'utente: né apertura né chiusura.
--
-- 2. updated_by / updated_at
--    Nullable e senza default: null significa "mai modificato", e il dettaglio
--    del template mostra "—". Riempirli con l'autore alla creazione direbbe il
--    falso, cioè che qualcuno ha modificato un template appena scritto.
--
-- Idempotente: si può rieseguire senza danni. Va applicata PRIMA di db:push,
-- così drizzle-kit trova la colonna già col nome giusto e non propone
-- un drop/create che butterebbe via i template.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'event_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'tipo_template'
  ) THEN
    ALTER TABLE notification_templates RENAME COLUMN event_type TO tipo_template;
  END IF;
END $$;

UPDATE notification_templates
   SET tipo_template = 'altro'
 WHERE tipo_template NOT IN ('apertura', 'chiusura');

ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp;
