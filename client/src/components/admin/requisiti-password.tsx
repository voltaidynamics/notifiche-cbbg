import { Check, X } from "lucide-react";
import { REQUISITI_PASSWORD } from "@shared/password";

/**
 * Checklist dei requisiti della password locale (issue #99), che si spunta
 * mentre si scrive. I requisiti vengono da `shared/password.ts`, la stessa
 * regola che il server applica: qui non si ridefinisce niente.
 */
export function RequisitiPassword({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1" aria-label="Requisiti della password">
      {REQUISITI_PASSWORD.map((r) => {
        const ok = r.rispettato(password);
        return (
          <li
            key={r.id}
            className={`flex items-center gap-1.5 text-xs ${ok ? "text-green-600" : "text-gray-400"}`}
          >
            {ok ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}
            <span>{r.etichetta}</span>
            <span className="sr-only">{ok ? "(rispettato)" : "(mancante)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
