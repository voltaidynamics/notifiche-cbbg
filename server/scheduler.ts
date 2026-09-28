import cron from "node-cron";
import { storage } from "./storage";
import nodemailer from "nodemailer";
import { sendSMS, isSMSConfigured } from "./sms";
import { eseguiSyncNotturno } from "./avviso-sync";
import { snapshotConduttore } from "@shared/destinatari";

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
}

async function dispatchNotification(notificationId: number): Promise<void> {
  const notification = await storage.getNotificationById(notificationId);
  if (!notification || notification.status !== "scheduled") return;

  await storage.updateNotificationStatus(notificationId, "sending");

  try {
    const segment = notification.segmentId
      ? await storage.getSegmentById(notification.segmentId)
      : undefined;

    const users = notification.segmentId
      ? await storage.getUsersBySegmentId(notification.segmentId)
      : [];

    if (users.length === 0) {
      await storage.updateNotificationStatus(notificationId, "failed");
      return;
    }

    const subject = notification.subject;
    const emailBody = notification.message;
    const smsBody = notification.message;

    let emailsSent = 0;
    let smsSent = 0;

    // I destinatari si registrano PRIMA di spedire, e una volta sola.
    //
    // Prima nascevano dentro il ramo dell'email: senza credenziali email non ne
    // veniva creato nessuno, nemmeno con gli SMS attivi, e la notifica finiva
    // nello Storico senza destinatari. Portavano inoltre solo indirizzo e
    // telefono, senza la fotografia dell'anagrafica: i filtri Roggia e
    // Destinatario cercano lì dentro, quindi non trovavano nulla (issue #12).
    const idDestinatario = new Map<number, number>();
    for (const u of users) {
      const creato = await storage.createNotificationRecipient({
        notificationId,
        userId: u.id,
        ...snapshotConduttore(u),
        keyroggia: segment?.code ?? null,
        roggiaDescrizione: segment?.name ?? null,
        email: u.email,
        phone: u.phone || null,
        emailStatus: "pending",
        smsStatus: "pending",
      });
      idDestinatario.set(u.id, creato.id);
    }

    const emailUser = process.env.EMAIL_USER || "";
    const emailPassword = process.env.EMAIL_PASSWORD || "";

    if (emailUser && emailPassword) {
      const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || "gmail",
        auth: { user: emailUser, pass: emailPassword },
      });

      for (const recipient of users) {
        const idRec = idDestinatario.get(recipient.id);
        if (idRec === undefined) continue;
        const trackingToken = `${notificationId}-${recipient.id}`;
        const trackingPixel = `<img src="${process.env.APP_URL || ""}/api/track/open/${trackingToken}" width="1" height="1" style="display:none;" />`;

        try {
          await transporter.sendMail({
            from: emailUser,
            to: recipient.email,
            subject,
            html: emailBody + trackingPixel,
          });
          await storage.updateRecipientEmailStatus(idRec, "sent");
          emailsSent++;
        } catch {
          await storage.updateRecipientEmailStatus(idRec, "failed");
        }
      }
    }

    if (isSMSConfigured()) {
      for (const recipient of users) {
        if (!recipient.phone) continue;
        const idRec = idDestinatario.get(recipient.id);
        if (idRec === undefined) continue;
        try {
          const result = await sendSMS(recipient.phone, smsBody);
          await storage.updateRecipientSmsStatus(idRec, result.success ? "sent" : "failed");
          if (result.success) smsSent++;
        } catch {
          // continue
        }
      }
    }

    await storage.updateNotificationStatus(notificationId, "sent", new Date());
    console.log(`[scheduler] Notification ${notificationId} dispatched: ${emailsSent} emails, ${smsSent} SMS`);
  } catch (err) {
    console.error(`[scheduler] Error dispatching notification ${notificationId}:`, err);
    await storage.updateNotificationStatus(notificationId, "failed");
  }
}

export function startScheduler(): void {
  cron.schedule("* * * * *", async () => {
    try {
      const pending = await storage.getPendingScheduledNotifications();
      for (const notification of pending) {
        await dispatchNotification(notification.id);
      }
    } catch (err) {
      console.error("[scheduler] Error checking scheduled notifications:", err);
    }
  });

  // Sync notturno delle anagrafiche del consorzio, seguito dall'avviso di
  // riepilogo agli indirizzi configurati (issue #6). Registro e invio stanno in
  // avviso-sync.ts: qui resta solo la pianificazione.
  cron.schedule("0 3 * * *", () => {
    void eseguiSyncNotturno();
  });

  console.log("[scheduler] Started — checking every minute for scheduled notifications");
}
