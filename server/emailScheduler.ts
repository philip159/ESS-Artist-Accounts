import { storage } from './storage';
import type { FormSubmission, FormDefinition } from '@shared/schema';

const ADMIN_EMAIL = process.env.RESEND_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@example.com';
const ABANDONED_CHECK_INTERVAL = 5 * 60 * 1000;
const SEND_CHECK_INTERVAL = 60 * 1000;
const ABANDONED_THRESHOLD_MINUTES = 30;

let isSchedulerRunning = false;

type EmailAssociation = {
  triggerStatus: string;
  templateKey: string;
  recipient: string;
  description?: string;
  delayMinutes?: number;
};

async function getRecipientEmail(submission: FormSubmission, recipient: string): Promise<string | null> {
  if (recipient === 'admin') {
    return ADMIN_EMAIL;
  }
  if (recipient === 'artist') {
    const data = submission.data as Record<string, unknown>;
    return (data.email as string) || (data.artistEmail as string) || submission.actorEmail || null;
  }
  return null;
}

export async function scheduleFormEmails(
  submission: FormSubmission,
  form: FormDefinition,
  newStatus: string,
  oldStatus?: string
): Promise<void> {
  const associations = (form.emailAssociations as EmailAssociation[]) || [];
  
  const matchingAssociations = associations.filter(a => a.triggerStatus === newStatus);
  
  const existingEmails = await storage.getScheduledEmailsBySubmission(submission.id);
  
  for (const association of matchingAssociations) {
    const alreadySent = existingEmails.some(e => 
      e.templateKey === association.templateKey && 
      (e.status === 'sent' || e.status === 'pending')
    );
    
    if (alreadySent) {
      console.log(`[EmailScheduler] Email "${association.templateKey}" already sent/pending for submission ${submission.id}, skipping`);
      continue;
    }
    
    const recipientEmail = await getRecipientEmail(submission, association.recipient);
    if (!recipientEmail) {
      console.log(`[EmailScheduler] No recipient email found for ${association.recipient}`);
      continue;
    }
    
    const delayMinutes = association.delayMinutes || 0;
    const scheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000);
    
    if (delayMinutes > 0) {
      try {
        await storage.createScheduledEmail({
          formSubmissionId: submission.id,
          templateKey: association.templateKey,
          recipientEmail,
          recipientType: association.recipient,
          scheduledFor,
          status: 'pending',
        });
        console.log(`[EmailScheduler] Scheduled email "${association.templateKey}" to ${recipientEmail} for ${scheduledFor.toISOString()}`);
      } catch (error) {
        console.error('[EmailScheduler] Failed to schedule email:', error);
      }
    } else {
      try {
        await storage.createScheduledEmail({
          formSubmissionId: submission.id,
          templateKey: association.templateKey,
          recipientEmail,
          recipientType: association.recipient,
          scheduledFor: new Date(),
          status: 'sent',
        });
        await sendEmailNow(association.templateKey, recipientEmail, submission);
      } catch (error) {
        console.error('[EmailScheduler] Failed to send immediate email:', error);
      }
    }
  }
  
  if (oldStatus === 'in_progress' && (newStatus === 'completed' || newStatus === 'abandoned')) {
    try {
      await storage.cancelScheduledEmailsBySubmission(submission.id);
      console.log(`[EmailScheduler] Cancelled pending emails for submission ${submission.id}`);
    } catch (error) {
      console.error('[EmailScheduler] Failed to cancel scheduled emails:', error);
    }
  }
}

async function sendEmailNow(templateKey: string, recipientEmail: string, submission: FormSubmission): Promise<void> {
  try {
    const { sendTemplatedFormEmail } = await import('./emailService');
    await sendTemplatedFormEmail(templateKey, recipientEmail, submission);
  } catch (error) {
    console.error(`[EmailScheduler] Failed to send email "${templateKey}":`, error);
  }
}

async function processPendingEmails(): Promise<void> {
  try {
    const pendingEmails = await storage.getPendingScheduledEmails();
    
    for (const email of pendingEmails) {
      try {
        const submission = await storage.getFormSubmission(email.formSubmissionId);
        if (!submission) {
          await storage.updateScheduledEmail(email.id, { status: 'cancelled', error: 'Submission not found' });
          continue;
        }
        
        await sendEmailNow(email.templateKey, email.recipientEmail, submission);
        await storage.updateScheduledEmail(email.id, { status: 'sent', sentAt: new Date() });
        console.log(`[EmailScheduler] Sent scheduled email ${email.id}`);
      } catch (error) {
        await storage.updateScheduledEmail(email.id, { 
          status: 'failed', 
          error: String(error) 
        });
        console.error(`[EmailScheduler] Failed to process scheduled email ${email.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[EmailScheduler] Error processing pending emails:', error);
  }
}

async function checkAbandonedForms(): Promise<void> {
  try {
    const forms = await storage.getAllFormDefinitions();
    
    for (const form of forms) {
      const associations = (form.emailAssociations as EmailAssociation[]) || [];
      const abandonedAssociations = associations.filter(a => a.triggerStatus === 'abandoned');
      
      if (abandonedAssociations.length === 0) continue;
      
      const submissions = await storage.getFormSubmissions(form.id, 'in_progress');
      
      for (const submission of submissions) {
        const lastUpdated = new Date(submission.lastUpdatedAt);
        const threshold = new Date(Date.now() - ABANDONED_THRESHOLD_MINUTES * 60 * 1000);
        
        if (lastUpdated < threshold) {
          const existingScheduled = await storage.getScheduledEmailsBySubmission(submission.id);
          const hasAbandonedEmail = existingScheduled.some(e => 
            abandonedAssociations.some(a => a.templateKey === e.templateKey)
          );
          
          if (!hasAbandonedEmail) {
            console.log(`[EmailScheduler] Form submission ${submission.id} is abandoned, scheduling emails`);
            await storage.updateFormSubmission(submission.id, { status: 'abandoned' });
            await scheduleFormEmails(submission, form, 'abandoned', 'in_progress');
          }
        }
      }
    }
  } catch (error) {
    console.error('[EmailScheduler] Error checking abandoned forms:', error);
  }
}

export function startEmailScheduler(): void {
  if (isSchedulerRunning) {
    console.log('[EmailScheduler] Scheduler already running');
    return;
  }
  
  isSchedulerRunning = true;
  console.log('[EmailScheduler] Starting email scheduler...');
  
  setInterval(processPendingEmails, SEND_CHECK_INTERVAL);
  setInterval(checkAbandonedForms, ABANDONED_CHECK_INTERVAL);
  
  setTimeout(() => {
    processPendingEmails();
    checkAbandonedForms();
  }, 10000);
  
  console.log('[EmailScheduler] Email scheduler started');
}
