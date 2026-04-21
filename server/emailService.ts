// Email service using Resend for transactional emails
import { Resend } from 'resend';
import type { Artwork, EmailTemplate } from '@shared/schema';
import { storage } from './storage';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}
const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    return (getResend() as any)[prop];
  }
});

// Configuration - set via environment variable
// RESEND_ADMIN_EMAIL takes precedence over ADMIN_EMAIL (useful for testing)
const ADMIN_EMAIL = process.env.RESEND_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@example.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'notifications@yourdomain.com';

// Helper function to substitute variables in template strings
function substituteVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

// Get template from database or return undefined
async function getEmailTemplate(templateKey: string): Promise<EmailTemplate | undefined> {
  try {
    const template = await storage.getEmailTemplateByKey(templateKey);
    if (template && template.isActive) {
      return template;
    }
    return undefined;
  } catch (error) {
    console.error(`[Email] Error fetching template ${templateKey}:`, error);
    return undefined;
  }
}

export interface ArtistConfirmationEmailData {
  artistName: string;
  artworkTitle: string;
  artworkCount: number;
  submissionDate: string;
}

export interface AdminNotificationEmailData {
  artistName: string;
  artworkTitle: string;
  artworkDimensions: string;
  artworkDpi: number;
  availableSizes: string[];
  submissionDate: string;
  adminDashboardUrl: string;
}

export interface BatchArtworkSummary {
  title: string;
  dimensions: string;
  dpi: number;
  aspectRatio: string;
  availableSizes: string[];
}

export interface BatchSubmissionEmailData {
  artistName: string;
  artworks: BatchArtworkSummary[];
  submissionDate: string;
}

export async function sendArtistConfirmationEmail(
  artistEmail: string,
  data: ArtistConfirmationEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Try to get template from database
    const template = await getEmailTemplate('artist_confirmation');
    const variables = {
      artistName: data.artistName,
      artworkTitle: data.artworkTitle,
      artworkCount: String(data.artworkCount),
      submissionDate: data.submissionDate,
    };

    let subject: string;
    let html: string;

    if (template) {
      subject = substituteVariables(template.subject, variables);
      html = substituteVariables(template.htmlBody, variables);
    } else {
      // Fallback to hardcoded template
      subject = `Artwork Submission Confirmed - ${data.artworkTitle}`;
      html = generateArtistConfirmationHTML(data);
    }

    const { data: emailData, error } = await resend.emails.send({
      from: `East Side Studio <${FROM_EMAIL}>`,
      to: artistEmail,
      subject,
      html,
      headers: {
        'X-Entity-Ref-ID': `single-${Date.now()}`,
      },
    });

    if (error) {
      console.error('[Email] Failed to send artist confirmation:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] ✅ Artist confirmation sent to ${artistEmail}${template ? ' (using custom template)' : ''}`);
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    console.error('[Email] Error sending artist confirmation:', error);
    return { success: false, error: String(error) };
  }
}

export async function sendAdminNotificationEmail(
  data: AdminNotificationEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Try to get template from database
    const template = await getEmailTemplate('admin_notification');
    const variables = {
      artistName: data.artistName,
      artworkTitle: data.artworkTitle,
      artworkDimensions: data.artworkDimensions,
      artworkDpi: String(data.artworkDpi),
      availableSizes: data.availableSizes.join(', '),
      submissionDate: data.submissionDate,
      adminDashboardUrl: data.adminDashboardUrl,
    };

    let subject: string;
    let html: string;

    if (template) {
      subject = substituteVariables(template.subject, variables);
      html = substituteVariables(template.htmlBody, variables);
    } else {
      // Fallback to hardcoded template
      subject = `New Artwork Submission: ${data.artworkTitle} by ${data.artistName}`;
      html = generateAdminNotificationHTML(data);
    }

    const { data: emailData, error } = await resend.emails.send({
      from: `East Side Studio <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject,
      html,
      headers: {
        'X-Entity-Ref-ID': `admin-single-${Date.now()}`,
        'X-Priority': '1',
        'Importance': 'high',
      },
    });

    if (error) {
      console.error('[Email] Failed to send admin notification:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] ✅ Admin notification sent to ${ADMIN_EMAIL}${template ? ' (using custom template)' : ''}`);
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    console.error('[Email] Error sending admin notification:', error);
    return { success: false, error: String(error) };
  }
}

function generateArtistConfirmationHTML(data: ArtistConfirmationEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artwork Submission Confirmed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Content Card -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Hi ${data.artistName},
              </p>
              
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Thank you for submitting your artwork! We've successfully received your submission and it's now being reviewed.
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Details Block -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">SUBMISSION DETAILS</p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Title:</strong> ${data.artworkTitle}
              </p>
              <p style="margin: 0; color: #333333; font-size: 16px;">
                <strong>Submitted:</strong> ${data.submissionDate}
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          This is an automated confirmation email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function sendBatchSubmissionEmails(
  artistEmail: string,
  data: BatchSubmissionEmailData,
  adminDashboardUrl: string
): Promise<{ artistEmailSent: boolean; adminEmailSent: boolean }> {
  const results = {
    artistEmailSent: false,
    adminEmailSent: false,
  };

  try {
    // Generate artworks lists for substitution
    const artworksListHtml = data.artworks.map(artwork => `
      <div style="padding: 15px 0; border-bottom: 1px solid #e9ecef;">
        <p style="margin: 0 0 5px 0; color: #333333; font-size: 16px; font-weight: 600;">
          ${artwork.title}
        </p>
        <p style="margin: 0; color: #666666; font-size: 14px;">
          ${artwork.dimensions} - ${artwork.dpi} DPI - ${artwork.aspectRatio}
        </p>
        <p style="margin: 5px 0 0 0; color: #666666; font-size: 14px;">
          ${artwork.availableSizes.length} sizes available
        </p>
      </div>
    `).join('');

    // Try batch_artist template
    const batchArtistTemplate = await getEmailTemplate('batch_artist');
    
    // Send artist confirmation email
    if (artistEmail) {
      let artistSubject: string;
      let artistHtml: string;

      if (batchArtistTemplate) {
        const artistVariables = {
          artistName: data.artistName,
          artworkCount: String(data.artworks.length),
          artworksList: artworksListHtml,
          submissionDate: data.submissionDate,
        };
        artistSubject = substituteVariables(batchArtistTemplate.subject, artistVariables);
        artistHtml = substituteVariables(batchArtistTemplate.htmlBody, artistVariables);
      } else {
        artistSubject = `Artwork Submission Confirmed - ${data.artworks.length} artwork${data.artworks.length > 1 ? 's' : ''}`;
        artistHtml = generateBatchArtistConfirmationHTML(data);
      }

      const artistResult = await resend.emails.send({
        from: `East Side Studio <${FROM_EMAIL}>`,
        to: artistEmail,
        subject: artistSubject,
        html: artistHtml,
        headers: {
          'X-Entity-Ref-ID': `batch-${Date.now()}`,
        },
      });

      if (!artistResult.error) {
        console.log(`[Email] ✅ Batch artist confirmation sent to ${artistEmail}${batchArtistTemplate ? ' (using custom template)' : ''}`);
        results.artistEmailSent = true;
      } else {
        console.error('[Email] Failed to send batch artist confirmation:', artistResult.error);
      }
    }

    // Try batch_admin template
    const batchAdminTemplate = await getEmailTemplate('batch_admin');
    let adminSubject: string;
    let adminHtml: string;

    if (batchAdminTemplate) {
      const adminVariables = {
        artistName: data.artistName,
        artworkCount: String(data.artworks.length),
        artworksList: artworksListHtml,
        submissionDate: data.submissionDate,
        adminDashboardUrl,
      };
      adminSubject = substituteVariables(batchAdminTemplate.subject, adminVariables);
      adminHtml = substituteVariables(batchAdminTemplate.htmlBody, adminVariables);
    } else {
      adminSubject = `New Batch Submission: ${data.artworks.length} artworks by ${data.artistName}`;
      adminHtml = generateBatchAdminNotificationHTML({ ...data, adminDashboardUrl });
    }

    // Send admin notification email
    const adminResult = await resend.emails.send({
      from: `East Side Studio <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: adminSubject,
      html: adminHtml,
      headers: {
        'X-Entity-Ref-ID': `admin-batch-${Date.now()}`,
        'X-Priority': '1',
        'Importance': 'high',
      },
    });

    if (!adminResult.error) {
      console.log(`[Email] ✅ Batch admin notification sent to ${ADMIN_EMAIL}${batchAdminTemplate ? ' (using custom template)' : ''}`);
      results.adminEmailSent = true;
    } else {
      console.error('[Email] Failed to send batch admin notification:', adminResult.error);
    }
  } catch (error) {
    console.error('[Email] Error sending batch emails:', error);
  }

  return results;
}

function generateBatchArtistConfirmationHTML(data: BatchSubmissionEmailData): string {
  const artworksList = data.artworks.map(artwork => `
    <div style="padding: 15px 0; border-bottom: 1px solid #e9ecef;">
      <p style="margin: 0 0 5px 0; color: #333333; font-size: 16px; font-weight: 600;">
        ${artwork.title}
      </p>
      <p style="margin: 0; color: #666666; font-size: 14px;">
        ${artwork.dimensions} • ${artwork.dpi} DPI • ${artwork.aspectRatio}
      </p>
      <p style="margin: 5px 0 0 0; color: #666666; font-size: 14px;">
        ${artwork.availableSizes.length} sizes available
      </p>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artwork Submission Confirmed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Content Card -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Hi ${data.artistName},
              </p>
              
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Thank you for submitting your artworks! We've successfully received ${data.artworks.length} artwork${data.artworks.length > 1 ? 's' : ''} and ${data.artworks.length > 1 ? 'they are' : 'it is'} now being reviewed.
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Artworks Block -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">SUBMITTED ARTWORKS</p>
              ${artworksList}
            </td>
          </tr>
        </table>
        
        <!-- Submission Date Block -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0; color: #333333; font-size: 16px;">
                <strong>Submitted:</strong> ${data.submissionDate}
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          This is an automated confirmation email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generateBatchAdminNotificationHTML(data: BatchSubmissionEmailData & { adminDashboardUrl: string }): string {
  const artworksList = data.artworks.map(artwork => `
    <div style="padding: 15px 0; border-bottom: 1px solid #e9ecef;">
      <p style="margin: 0 0 5px 0; color: #333333; font-size: 16px; font-weight: 600;">
        ${artwork.title}
      </p>
      <p style="margin: 0; color: #666666; font-size: 14px;">
        <strong>Dimensions:</strong> ${artwork.dimensions} • <strong>DPI:</strong> ${artwork.dpi}
      </p>
      <p style="margin: 5px 0 0 0; color: #666666; font-size: 14px;">
        <strong>Aspect Ratio:</strong> ${artwork.aspectRatio}
      </p>
      <p style="margin: 5px 0 0 0; color: #666666; font-size: 14px;">
        <strong>Sizes:</strong> ${artwork.availableSizes.join(', ')}
      </p>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Batch Artwork Submission</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Content Card -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                ${data.artistName} has submitted ${data.artworks.length} artwork${data.artworks.length > 1 ? 's' : ''} for review.
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Artworks Block -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">SUBMITTED ARTWORKS</p>
              ${artworksList}
            </td>
          </tr>
        </table>
        
        <!-- Submission Date Block -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0; color: #333333; font-size: 16px;">
                <strong>Submitted:</strong> ${data.submissionDate}
              </p>
            </td>
          </tr>
        </table>
        
        <!-- CTA Button Block -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;" align="center">
              <a href="${data.adminDashboardUrl}" style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Review in Dashboard
              </a>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          Admin notification from East Side Studio London
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generateAdminNotificationHTML(data: AdminNotificationEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Artwork Submission</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Content Card -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                A new artwork has been submitted and is ready for review.
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Artwork Details Block -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">ARTWORK DETAILS</p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Artist:</strong> ${data.artistName}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Title:</strong> ${data.artworkTitle}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Dimensions:</strong> ${data.artworkDimensions}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>DPI:</strong> ${data.artworkDpi}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Available Sizes:</strong> ${data.availableSizes.join(', ')}
              </p>
              <p style="margin: 0; color: #333333; font-size: 16px;">
                <strong>Submitted:</strong> ${data.submissionDate}
              </p>
            </td>
          </tr>
        </table>
        
        <!-- CTA Button Block -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;" align="center">
              <a href="${data.adminDashboardUrl}" style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Review in Dashboard
              </a>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          Admin notification from East Side Studio London
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Send artist invitation email with magic link
export async function sendArtistInvitation(
  artistEmail: string,
  artistName: string,
  inviteUrl: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const subject = `You're Invited to Join East Side Studio`;
    const html = generateArtistInvitationHTML(artistName, inviteUrl);

    const { data: emailData, error } = await resend.emails.send({
      from: `East Side Studio <${FROM_EMAIL}>`,
      to: artistEmail,
      subject,
      html,
      headers: {
        'X-Entity-Ref-ID': `invite-${Date.now()}`,
      },
    });

    if (error) {
      console.error('[Email] Failed to send artist invitation:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Artist invitation sent to ${artistEmail}, ID: ${emailData?.id}`);
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    console.error('[Email] Error sending artist invitation:', error);
    return { success: false, error: String(error) };
  }
}

function generateArtistInvitationHTML(artistName: string, inviteUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: 'Montserrat', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <h1 style="margin: 0; font-size: 24px; color: #000000; font-weight: 700;">EAST SIDE STUDIO</h1>
      </td>
    </tr>
    <tr>
      <td>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; font-size: 22px; color: #000000;">Welcome, \${artistName}!</h2>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                You've been invited to join the East Side Studio artist portal. Set up your password to access your personal dashboard where you can:
              </p>
              <ul style="margin: 0 0 30px 0; color: #333333; font-size: 16px; line-height: 1.8; padding-left: 20px;">
                <li>View your artwork submissions and their status</li>
                <li>Track your sales data</li>
                <li>Set up your PayPal for payouts</li>
              </ul>
              <div style="text-align: center; margin: 30px 0;">
                <a href="\${inviteUrl}" style="display: inline-block; padding: 16px 40px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                  Set Up Your Password
                </a>
              </div>
              <p style="margin: 30px 0 0 0; color: #666666; font-size: 14px; text-align: center;">
                This link will expire in 7 days.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ========== Onboarding Completion Emails ==========

export interface OnboardingSubmissionData {
  artistName: string;
  artworkCount: number;
  submissionDate: string;
}

export async function sendOnboardingApplicationSubmittedEmail(
  artistEmail: string,
  data: OnboardingSubmissionData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const template = await getEmailTemplate('onboarding_application_submitted');
    const variables = {
      artistName: data.artistName,
      artworkCount: String(data.artworkCount),
      submissionDate: data.submissionDate,
    };

    let subject: string;
    let html: string;

    if (template) {
      subject = substituteVariables(template.subject, variables);
      html = substituteVariables(template.htmlBody, variables);
    } else {
      subject = `Application Submitted - East Side Studio`;
      html = generateOnboardingApplicationHTML(data);
    }

    const { data: emailData, error } = await resend.emails.send({
      from: `East Side Studio <${FROM_EMAIL}>`,
      to: artistEmail,
      subject,
      html,
      headers: {
        'X-Entity-Ref-ID': `onboarding-artist-${Date.now()}`,
      },
    });

    if (error) {
      console.error('[Email] Failed to send onboarding application email:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Onboarding application email sent to ${artistEmail}`);
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    console.error('[Email] Error sending onboarding application email:', error);
    return { success: false, error: String(error) };
  }
}

export async function sendOnboardingAdminNotificationEmail(
  data: OnboardingSubmissionData & { artistEmail: string; adminDashboardUrl: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const template = await getEmailTemplate('onboarding_admin_notification');
    const variables = {
      artistName: data.artistName,
      artistEmail: data.artistEmail,
      artworkCount: String(data.artworkCount),
      submissionDate: data.submissionDate,
      adminDashboardUrl: data.adminDashboardUrl,
    };

    let subject: string;
    let html: string;

    if (template) {
      subject = substituteVariables(template.subject, variables);
      html = substituteVariables(template.htmlBody, variables);
    } else {
      subject = `New Artist Onboarded: ${data.artistName}`;
      html = generateOnboardingAdminHTML(data);
    }

    const { data: emailData, error } = await resend.emails.send({
      from: `East Side Studio <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject,
      html,
      headers: {
        'X-Entity-Ref-ID': `onboarding-admin-${Date.now()}`,
        'X-Priority': '1',
        'Importance': 'high',
      },
    });

    if (error) {
      console.error('[Email] Failed to send onboarding admin notification:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Onboarding admin notification sent to ${ADMIN_EMAIL}`);
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    console.error('[Email] Error sending onboarding admin notification:', error);
    return { success: false, error: String(error) };
  }
}

function generateOnboardingApplicationHTML(data: OnboardingSubmissionData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: 'Montserrat', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <h1 style="margin: 0; font-size: 24px; color: #000000; font-weight: 700;">EAST SIDE STUDIO</h1>
      </td>
    </tr>
    <tr>
      <td>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; font-size: 22px; color: #000000;">Application Submitted</h2>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi ${data.artistName},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Thank you for completing your artist application! We've received your profile and ${data.artworkCount} artwork${data.artworkCount > 1 ? 's' : ''}.
              </p>
              <div style="background-color: #f8f8f8; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #666666; font-size: 14px; font-weight: 600;">WHAT HAPPENS NEXT</p>
                <ul style="margin: 0; color: #333333; font-size: 14px; line-height: 1.8; padding-left: 20px;">
                  <li>Our team will review your application</li>
                  <li>We'll set up your artist page and collection in our store</li>
                  <li>You'll receive a notification once everything is live</li>
                </ul>
              </div>
              <p style="margin: 20px 0 0 0; color: #333333; font-size: 16px; line-height: 1.6;">
                If you have any questions, feel free to reach out.
              </p>
              <p style="margin: 20px 0 0 0; color: #333333; font-size: 16px;">
                Best regards,<br>East Side Studio Team
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generateOnboardingAdminHTML(data: OnboardingSubmissionData & { artistEmail: string; adminDashboardUrl: string }): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
    <tr>
      <td style="padding: 20px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
          <tr>
            <td style="padding: 16px 20px;">
              <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 600;">NEW ARTIST ONBOARDED</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb;">
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #111827;">${data.artistName}</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="color: #6b7280; font-size: 14px;">Email</span>
                    <span style="float: right; color: #111827; font-size: 14px;">${data.artistEmail}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                    <span style="color: #6b7280; font-size: 14px;">Artworks</span>
                    <span style="float: right; color: #111827; font-size: 14px;">${data.artworkCount}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">
                    <span style="color: #6b7280; font-size: 14px;">Submitted</span>
                    <span style="float: right; color: #111827; font-size: 14px;">${data.submissionDate}</span>
                  </td>
                </tr>
              </table>
              <div style="text-align: center;">
                <a href="${data.adminDashboardUrl}" style="display: inline-block; padding: 12px 24px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                  View in Dashboard
                </a>
              </div>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
          <tr>
            <td style="padding: 16px; background-color: #f9fafb; border-radius: 6px;">
              <p style="margin: 0 0 8px 0; color: #374151; font-size: 13px; font-weight: 600;">Next Steps:</p>
              <ul style="margin: 0; padding-left: 20px; color: #6b7280; font-size: 13px; line-height: 1.6;">
                <li>Review artist profile and artworks</li>
                <li>Set up Shopify collection and metaobject</li>
                <li>Add artist to navigation menus</li>
              </ul>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ========== Collection Live Notification ==========

export interface CollectionLiveEmailData {
  artistName: string;
  artworkTitles: string[];
  rejectedTitles?: string[];
  shopUrl?: string;
}

export async function getCollectionLiveEmailPreview(
  data: CollectionLiveEmailData
): Promise<{ subject: string; html: string }> {
  // Check if ALL artworks are rejected (none accepted)
  const allRejected = data.artworkTitles.length === 0 && data.rejectedTitles && data.rejectedTitles.length > 0;
  
  const artworkList = data.artworkTitles.length <= 3 
    ? data.artworkTitles.join(', ')
    : `${data.artworkTitles.slice(0, 3).join(', ')} and ${data.artworkTitles.length - 3} more`;
  
  const rejectedList = data.rejectedTitles && data.rejectedTitles.length > 0
    ? (data.rejectedTitles.length <= 3 
        ? data.rejectedTitles.join(', ')
        : `${data.rejectedTitles.slice(0, 3).join(', ')} and ${data.rejectedTitles.length - 3} more`)
    : '';
  
  // Generate the declined section HTML only if there are rejected artworks
  const declinedSection = data.rejectedTitles && data.rejectedTitles.length > 0
    ? `<div style="background-color: #fef2f2; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ef4444;">
        <p style="margin: 0 0 10px 0; color: #991b1b; font-size: 14px; font-weight: 600;">DECLINED ARTWORKS</p>
        <p style="margin: 0 0 10px 0; color: #666666; font-size: 13px;">These pieces are not quite the right fit for us, so you are welcome to sell them elsewhere.</p>
        <p style="margin: 0; color: #333333;">${rejectedList}</p>
      </div>`
    : '';
  
  const variables = {
    artistName: data.artistName,
    artworkTitles: artworkList,
    artworkCount: String(data.artworkTitles.length),
    rejectedTitles: rejectedList,
    rejectedCount: String(data.rejectedTitles?.length || 0),
    declinedSection: declinedSection,
    shopUrl: data.shopUrl || 'https://eastsidestudiolondon.co.uk/',
  };

  let subject: string;
  let html: string;

  // Use different template if all artworks were rejected
  if (allRejected) {
    const rejectedTemplate = await getEmailTemplate('all_rejected');
    if (rejectedTemplate) {
      subject = substituteVariables(rejectedTemplate.subject, variables);
      html = substituteVariables(rejectedTemplate.htmlBody, variables);
    } else {
      subject = 'An Update On Your Submission';
      html = generateAllRejectedHTML(data);
    }
  } else {
    const template = await getEmailTemplate('collection_live');
    if (template) {
      subject = substituteVariables(template.subject, variables);
      html = substituteVariables(template.htmlBody, variables);
    } else {
      subject = `Your Collection is Now Live!`;
      html = generateCollectionLiveHTML(data);
    }
  }

  return { subject, html };
}

function generateAllRejectedHTML(data: CollectionLiveEmailData): string {
  const rejectedList = data.rejectedTitles?.join(', ') || '';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Submission Update</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi ${data.artistName},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Thank you so much for submitting your work to East Side Studio London. We really appreciate you sharing your art with us.
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                After careful consideration, we've decided that the pieces you submitted aren't quite the right fit for our collection at this time. This doesn't reflect on the quality of your work.
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                You are of course welcome to sell these pieces elsewhere, and we encourage you to keep creating.
              </p>
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #666666; font-size: 14px; font-weight: 600;">ARTWORKS SUBMITTED</p>
                <p style="margin: 0; color: #333333;">${rejectedList}</p>
              </div>
              <p style="margin: 20px 0 0 0; color: #333333; font-size: 16px; line-height: 1.6;">
                If you'd like to submit different work in the future, we'd love to see it.
              </p>
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Warm regards,<br>
                The East Side Studio London Team
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function sendCollectionLiveEmail(
  artistEmail: string,
  data: CollectionLiveEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { subject, html } = await getCollectionLiveEmailPreview(data);

    const { data: emailData, error } = await resend.emails.send({
      from: `East Side Studio <${FROM_EMAIL}>`,
      to: artistEmail,
      subject,
      html,
      headers: {
        'X-Entity-Ref-ID': `collection-live-${Date.now()}`,
      },
    });

    if (error) {
      console.error('[Email] Failed to send collection live notification:', error);
      return { success: false, error: error.message };
    }

    const template = await getEmailTemplate('collection_live');
    console.log(`[Email] Collection live notification sent to ${artistEmail}${template ? ' (using custom template)' : ''}`);
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    console.error('[Email] Error sending collection live notification:', error);
    return { success: false, error: String(error) };
  }
}

function generateCollectionLiveHTML(data: CollectionLiveEmailData): string {
  const artworkListHtml = data.artworkTitles.map(title => 
    `<li style="margin: 8px 0; color: #333333;">${title}</li>`
  ).join('');
  
  const rejectedListHtml = data.rejectedTitles && data.rejectedTitles.length > 0
    ? data.rejectedTitles.map(title => 
        `<li style="margin: 8px 0; color: #666666;">${title}</li>`
      ).join('')
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Collection is Live</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px 0; font-size: 24px; color: #000000;">Your Collection is Now Live!</h1>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi ${data.artistName},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Great news! Your artwork${data.artworkTitles.length > 1 ? 's have' : ' has'} been synced to our shop and ${data.artworkTitles.length > 1 ? 'are' : 'is'} now available for purchase.
              </p>
              
              ${data.artworkTitles.length > 0 ? `
              <div style="background-color: #f8f8f8; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #666666; font-size: 14px; font-weight: 600;">ARTWORKS NOW LIVE</p>
                <ul style="margin: 0; padding-left: 20px;">
                  ${artworkListHtml}
                </ul>
              </div>
              ` : ''}
              
              ${rejectedListHtml ? `
              <div style="background-color: #fef2f2; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ef4444;">
                <p style="margin: 0 0 10px 0; color: #991b1b; font-size: 14px; font-weight: 600;">DECLINED ARTWORKS</p>
                <p style="margin: 0 0 10px 0; color: #666666; font-size: 13px;">These pieces are not quite the right fit for us, so you are welcome to sell them elsewhere.</p>
                <ul style="margin: 0; padding-left: 20px;">
                  ${rejectedListHtml}
                </ul>
              </div>
              ` : ''}
              
              <div style="text-align: center; margin-top: 30px;">
                <a href="${data.shopUrl || 'https://eastsidestudiolondon.co.uk/'}" style="display: inline-block; padding: 14px 28px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                  View Your Collection
                </a>
              </div>
              
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 16px;">
                Best regards,<br>East Side Studio Team
              </p>
            </td>
          </tr>
        </table>
        
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          East Side Studio London
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ========== Generic Template-based Email for Form Scheduler ==========

import type { FormSubmission } from '@shared/schema';

export async function sendTemplatedFormEmail(
  templateKey: string,
  recipientEmail: string,
  submission: FormSubmission
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const template = await getEmailTemplate(templateKey);
    if (!template) {
      console.error(`[Email] Template "${templateKey}" not found`);
      return { success: false, error: `Template "${templateKey}" not found` };
    }

    const data = submission.data as Record<string, unknown>;
    const variables: Record<string, string> = {
      artistName: (data.firstName as string) || (data.artistName as string) || 'Artist',
      artistEmail: (data.email as string) || (data.artistEmail as string) || submission.actorEmail || '',
      artworkTitle: (data.artworkTitle as string) || 'Untitled',
      artworkCount: String((data.artworkCount as number) || (submission.linkedArtworkIds?.length || 0)),
      submissionDate: submission.completedAt 
        ? new Date(submission.completedAt).toLocaleDateString('en-GB')
        : new Date(submission.lastUpdatedAt).toLocaleDateString('en-GB'),
      firstName: (data.firstName as string) || '',
      lastName: (data.lastName as string) || '',
      artistAlias: (data.artistAlias as string) || '',
    };

    const subject = substituteVariables(template.subject, variables);
    const html = substituteVariables(template.htmlBody, variables);

    const { data: emailData, error } = await resend.emails.send({
      from: `East Side Studio <${FROM_EMAIL}>`,
      to: recipientEmail,
      subject,
      html,
      headers: {
        'X-Entity-Ref-ID': `form-${submission.id}-${Date.now()}`,
      },
    });

    if (error) {
      console.error(`[Email] Failed to send templated email "${templateKey}":`, error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Templated email "${templateKey}" sent to ${recipientEmail}`);
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    console.error(`[Email] Error sending templated email "${templateKey}":`, error);
    return { success: false, error: String(error) };
  }
}

// Contract signing email data interface
interface ContractSignedData {
  creatorName: string;
  creatorEmail: string;
  contractId: string;
  signedDate: string;
}

// Send confirmation email to creator after signing contract
export async function sendContractSignedCreatorEmail(
  data: ContractSignedData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const template = await getEmailTemplate('contract_signed_creator');
    const variables = {
      creatorName: data.creatorName,
    };

    let subject: string;
    let html: string;

    if (template) {
      subject = substituteVariables(template.subject, variables);
      html = substituteVariables(template.htmlBody, variables);
    } else {
      subject = "Your Contract with East Side Studio London is Complete!";
      html = `
        <p>Hi ${data.creatorName},</p>
        <p>Thank you for signing the Creative Partner Collaboration Agreement with East Side Studio London.</p>
        <p>Your contract has been successfully submitted and we're excited to have you on board as a creative partner.</p>
        <p><strong>What happens next?</strong></p>
        <p>We will let you know once your artworks have shipped. In the meantime, reach out to your partnership manager with any questions, we're here to help.</p>
        <p>Best regards,<br>The East Side Studio London Team</p>
      `;
    }

    const { data: emailData, error } = await resend.emails.send({
      from: `East Side Studio <${FROM_EMAIL}>`,
      to: data.creatorEmail,
      subject,
      html,
    });

    if (error) {
      console.error("[Email] Error sending contract signed creator email:", error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Contract signed confirmation sent to creator: ${data.creatorEmail}`);
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    console.error("[Email] Error sending contract signed creator email:", error);
    return { success: false, error: String(error) };
  }
}

// Send notification email to admin when contract is signed
export async function sendContractSignedAdminEmail(
  data: ContractSignedData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const template = await getEmailTemplate('contract_signed_admin');
    const variables = {
      creatorName: data.creatorName,
      creatorEmail: data.creatorEmail,
      contractId: data.contractId,
      signedDate: data.signedDate,
    };

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.error("[Email] ADMIN_EMAIL not configured");
      return { success: false, error: "ADMIN_EMAIL not configured" };
    }

    let subject: string;
    let html: string;

    if (template) {
      subject = substituteVariables(template.subject, variables);
      html = substituteVariables(template.htmlBody, variables);
    } else {
      subject = `Contract Signed: ${data.creatorName}`;
      html = `
        <p>A creator has signed their contract.</p>
        <p><strong>Creator:</strong> ${data.creatorName}</p>
        <p><strong>Email:</strong> ${data.creatorEmail}</p>
        <p><strong>Contract ID:</strong> ${data.contractId}</p>
        <p><strong>Signed on:</strong> ${data.signedDate}</p>
        <p>You can view the signed contract and creator details in the admin dashboard.</p>
      `;
    }

    const { data: emailData, error } = await resend.emails.send({
      from: `East Side Studio <${FROM_EMAIL}>`,
      to: adminEmail,
      subject,
      html,
    });

    if (error) {
      console.error("[Email] Error sending contract signed admin email:", error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Contract signed notification sent to admin: ${adminEmail}`);
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    console.error("[Email] Error sending contract signed admin email:", error);
    return { success: false, error: String(error) };
  }
}
