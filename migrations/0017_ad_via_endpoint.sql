-- Issue #96: la verifica Active Directory passa dall'endpoint getuserAD del
-- consorzio, non più da un bind LDAP. Le chiavi del domain controller non le
-- legge più nessuno. In produzione non ne esiste nessuna (AD mai configurata):
-- la migrazione serve per i DB di sviluppo o ripristinati che le hanno.
DELETE FROM app_settings
WHERE key IN ('ad.host', 'ad.port', 'ad.dominio', 'ad.tls', 'ad.caPem', 'ad.rejectUnauthorized');
