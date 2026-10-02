import type { ReactNode } from "react"
import { CircleAlert } from "lucide-react"

import { TOAST_DURATION, useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { messaggioErrore } from "@/lib/messaggio-errore"

// I testi di un errore passano tutti da messaggioErrore (issue #100): chi
// chiama toast() con `description: e.message` non deve ripulire niente, e un
// `400: {"message":"…"}` non arriva mai a schermo. Un nodo React passa com'è.
// Un errore non porta `action`: un ToastAction fuori da un Toast di Radix non
// ha il suo contesto, quindi il popup ha solo il bottone «Ho capito».
const pulito = (v: ReactNode) => (typeof v === "string" ? messaggioErrore(v) : v)

export function Toaster() {
  const { toasts, errori, dismiss } = useToast()
  // Uno alla volta: il prossimo compare quando il primo è stato chiuso.
  const errore = errori[0]

  return (
    <ToastProvider duration={TOAST_DURATION}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />

      <AlertDialog
        open={!!errore}
        onOpenChange={(aperto) => {
          if (!aperto && errore) dismiss(errore.id)
        }}
      >
        {errore && (
          <AlertDialogContent key={errore.id}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-700">
                <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
                {pulito(errore.title) || "Errore"}
              </AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-line break-words">
                {errore.description
                  ? pulito(errore.description)
                  : !errore.title
                    ? messaggioErrore(undefined)
                    : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction>Ho capito</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ToastProvider>
  )
}
