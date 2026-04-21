import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Edit, Trash2, Save, X, Eye, Mail, Code, Info } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EmailTemplate } from "@shared/schema";

const DEFAULT_TEMPLATES = [
  {
    templateKey: "artist_confirmation",
    name: "Artist Confirmation",
    description: "Sent to artists after they submit artwork(s)",
    subject: "Artwork Submission Confirmed - {{artworkTitle}}",
    htmlBody: `<!DOCTYPE html>
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
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Hi {{artistName}},
              </p>
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Thank you for submitting your artwork! We've successfully received your submission and it's now being reviewed.
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">SUBMISSION DETAILS</p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Title:</strong> {{artworkTitle}}
              </p>
              <p style="margin: 0; color: #333333; font-size: 16px;">
                <strong>Submitted:</strong> {{submissionDate}}
              </p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          This is an automated confirmation email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    templateKey: "admin_notification",
    name: "Admin Notification",
    description: "Sent to admins when new artwork is submitted",
    subject: "New Artwork Submission: {{artworkTitle}} by {{artistName}}",
    htmlBody: `<!DOCTYPE html>
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
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                A new artwork has been submitted and is ready for review.
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">ARTWORK DETAILS</p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Artist:</strong> {{artistName}}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Title:</strong> {{artworkTitle}}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Dimensions:</strong> {{artworkDimensions}}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>DPI:</strong> {{artworkDpi}}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Available Sizes:</strong> {{availableSizes}}
              </p>
              <p style="margin: 0; color: #333333; font-size: 16px;">
                <strong>Submitted:</strong> {{submissionDate}}
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;" align="center">
              <a href="{{adminDashboardUrl}}" style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Review in Dashboard
              </a>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          Admin notification from East Side Studio London
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    templateKey: "batch_artist",
    name: "Batch Artist Confirmation",
    description: "Sent to artists after they submit multiple artworks",
    subject: "Artwork Submission Confirmed - {{artworkCount}} artwork(s)",
    htmlBody: `<!DOCTYPE html>
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
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Hi {{artistName}},
              </p>
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Thank you for submitting your artworks! We've successfully received {{artworkCount}} artwork(s) and they are now being reviewed.
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">SUBMITTED ARTWORKS</p>
              {{artworksList}}
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0; color: #333333; font-size: 16px;">
                <strong>Submitted:</strong> {{submissionDate}}
              </p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          This is an automated confirmation email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    templateKey: "batch_admin",
    name: "Batch Admin Notification",
    description: "Sent to admins when multiple artworks are submitted",
    subject: "New Batch Submission: {{artworkCount}} artworks by {{artistName}}",
    htmlBody: `<!DOCTYPE html>
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
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                {{artistName}} has submitted {{artworkCount}} artwork(s) for review.
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">SUBMITTED ARTWORKS</p>
              {{artworksList}}
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0; color: #333333; font-size: 16px;">
                <strong>Submitted:</strong> {{submissionDate}}
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;" align="center">
              <a href="{{adminDashboardUrl}}" style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Review in Dashboard
              </a>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          Admin notification from East Side Studio London
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    templateKey: "onboarding_application_submitted",
    name: "Onboarding Application Submitted",
    description: "Sent to artist after completing the onboarding process",
    subject: "Welcome to East Side Studio London - Your Artist Profile is Complete!",
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to East Side Studio London</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Hi {{artistName}},
              </p>
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Congratulations! You've successfully completed the artist onboarding process. Your profile is now set up and ready.
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">WHAT'S NEXT</p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Our team will review your submitted artworks and you'll receive a notification once they're approved and ready for sale.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          Welcome to East Side Studio London!
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    templateKey: "onboarding_admin_notification",
    name: "Onboarding Admin Notification",
    description: "Sent to admin when a new artist completes onboarding",
    subject: "New Artist Onboarded: {{artistName}}",
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Artist Onboarded</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                A new artist has completed the onboarding process and is ready for review.
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">ARTIST DETAILS</p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Name:</strong> {{artistName}}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Email:</strong> {{artistEmail}}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Artworks Submitted:</strong> {{artworkCount}}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Completed:</strong> {{submissionDate}}
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;" align="center">
              <a href="{{adminDashboardUrl}}" style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Review in Dashboard
              </a>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          Admin notification from East Side Studio London
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    templateKey: "contract_signed_creator",
    name: "Contract Signed - Creator",
    description: "Sent to creators after they sign their contract",
    subject: "Your Contract with East Side Studio London is Complete!",
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contract Signed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Hi {{creatorName}},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Thank you for signing the Creative Partner Collaboration Agreement with East Side Studio London.
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.5;">
                Your contract has been successfully submitted and we're excited to have you on board as a creative partner.
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">WHAT HAPPENS NEXT?</p>
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                We will let you know once your artworks have shipped. In the meantime, reach out to your partnership manager with any questions, we're here to help.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          Best regards,<br>The East Side Studio London Team
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    templateKey: "contract_signed_admin",
    name: "Contract Signed - Admin Notification",
    description: "Sent to admins when a creator signs their contract",
    subject: "Contract Signed: {{creatorName}}",
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contract Signed Notification</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.5;">
                A creator has signed their contract.
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #666666; font-size: 14px; font-weight: 600;">CONTRACT DETAILS</p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Creator:</strong> {{creatorName}}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Email:</strong> {{creatorEmail}}
              </p>
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 16px;">
                <strong>Contract ID:</strong> {{contractId}}
              </p>
              <p style="margin: 0; color: #333333; font-size: 16px;">
                <strong>Signed on:</strong> {{signedDate}}
              </p>
            </td>
          </tr>
        </table>
        <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; text-align: center;">
          You can view the signed contract and creator details in the admin dashboard.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
];

const TEMPLATE_VARIABLES: Record<string, { name: string; description: string }[]> = {
  artist_confirmation: [
    { name: "{{artistName}}", description: "Name of the artist" },
    { name: "{{artworkTitle}}", description: "Title of the artwork" },
    { name: "{{artworkCount}}", description: "Number of artworks submitted" },
    { name: "{{submissionDate}}", description: "Date the artwork was submitted" },
  ],
  admin_notification: [
    { name: "{{artistName}}", description: "Name of the artist" },
    { name: "{{artworkTitle}}", description: "Title of the artwork" },
    { name: "{{artworkDimensions}}", description: "Dimensions of the artwork (e.g., 3000 x 4000px)" },
    { name: "{{artworkDpi}}", description: "DPI of the artwork" },
    { name: "{{availableSizes}}", description: "List of available print sizes" },
    { name: "{{submissionDate}}", description: "Date the artwork was submitted" },
    { name: "{{adminDashboardUrl}}", description: "URL to the admin dashboard" },
  ],
  batch_artist: [
    { name: "{{artistName}}", description: "Name of the artist" },
    { name: "{{artworkCount}}", description: "Number of artworks submitted" },
    { name: "{{artworksList}}", description: "HTML list of submitted artworks" },
    { name: "{{submissionDate}}", description: "Date the artworks were submitted" },
  ],
  batch_admin: [
    { name: "{{artistName}}", description: "Name of the artist" },
    { name: "{{artworkCount}}", description: "Number of artworks submitted" },
    { name: "{{artworksList}}", description: "HTML list of submitted artworks with details" },
    { name: "{{submissionDate}}", description: "Date the artworks were submitted" },
    { name: "{{adminDashboardUrl}}", description: "URL to the admin dashboard" },
  ],
  onboarding_application_submitted: [
    { name: "{{artistName}}", description: "Name of the artist" },
    { name: "{{artistEmail}}", description: "Email of the artist" },
    { name: "{{artworkCount}}", description: "Number of artworks submitted" },
    { name: "{{submissionDate}}", description: "Date the application was submitted" },
  ],
  onboarding_admin_notification: [
    { name: "{{artistName}}", description: "Name of the artist" },
    { name: "{{artistEmail}}", description: "Email of the artist" },
    { name: "{{artworkCount}}", description: "Number of artworks submitted" },
    { name: "{{submissionDate}}", description: "Date the onboarding was completed" },
    { name: "{{adminDashboardUrl}}", description: "URL to the admin dashboard" },
  ],
  contract_signed_creator: [
    { name: "{{creatorName}}", description: "Name of the creator" },
  ],
  contract_signed_admin: [
    { name: "{{creatorName}}", description: "Name of the creator" },
    { name: "{{creatorEmail}}", description: "Email of the creator" },
    { name: "{{contractId}}", description: "Unique contract ID" },
    { name: "{{signedDate}}", description: "Date the contract was signed" },
  ],
};

export default function EmailTemplates() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    subject: "",
    htmlBody: "",
    description: "",
    isActive: true,
  });
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

  const { data: templates = [], isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (template: typeof DEFAULT_TEMPLATES[0]) => {
      return await apiRequest("POST", "/api/email-templates", template);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      toast({ title: "Template created", description: "Email template has been created successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to create template.", variant: "destructive" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<EmailTemplate> }) => {
      return await apiRequest("PUT", `/api/email-templates/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      setIsEditing(false);
      toast({ title: "Template updated", description: "Email template has been updated successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to update template.", variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/email-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      setSelectedTemplate(null);
      toast({ title: "Template deleted", description: "Email template has been deleted." });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to delete template.", variant: "destructive" });
    },
  });

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setEditForm({
      name: template.name,
      subject: template.subject,
      htmlBody: template.htmlBody,
      description: template.description || "",
      isActive: template.isActive,
    });
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!selectedTemplate) return;
    updateTemplateMutation.mutate({
      id: selectedTemplate.id,
      updates: editForm,
    });
  };

  const handleCreateDefault = (templateKey: string) => {
    const defaultTemplate = DEFAULT_TEMPLATES.find(t => t.templateKey === templateKey);
    if (defaultTemplate) {
      createTemplateMutation.mutate(defaultTemplate);
    }
  };

  const missingTemplates = DEFAULT_TEMPLATES.filter(
    dt => !templates.some(t => t.templateKey === dt.templateKey)
  );

  const getTemplateVariables = (templateKey: string) => {
    return TEMPLATE_VARIABLES[templateKey] || [];
  };

  const getPreviewHtml = () => {
    let html = editForm.htmlBody;
    html = html.replace(/\{\{artistName\}\}/g, "John Artist");
    html = html.replace(/\{\{artworkTitle\}\}/g, "Beautiful Sunset");
    html = html.replace(/\{\{submissionDate\}\}/g, new Date().toLocaleDateString());
    html = html.replace(/\{\{artworkDimensions\}\}/g, "3000 x 4000px");
    html = html.replace(/\{\{artworkDpi\}\}/g, "300");
    html = html.replace(/\{\{availableSizes\}\}/g, "A3, A2, A1");
    html = html.replace(/\{\{artworkCount\}\}/g, "3");
    html = html.replace(/\{\{adminDashboardUrl\}\}/g, "#");
    html = html.replace(/\{\{artworksList\}\}/g, `
      <div style="padding: 15px 0; border-bottom: 1px solid #e9ecef;">
        <p style="margin: 0 0 5px 0; color: #333333; font-size: 16px; font-weight: 600;">Beautiful Sunset</p>
        <p style="margin: 0; color: #666666; font-size: 14px;">3000 x 4000px - 300 DPI - 3:4</p>
      </div>
      <div style="padding: 15px 0; border-bottom: 1px solid #e9ecef;">
        <p style="margin: 0 0 5px 0; color: #333333; font-size: 16px; font-weight: 600;">Mountain Vista</p>
        <p style="margin: 0; color: #666666; font-size: 14px;">4000 x 3000px - 300 DPI - 4:3</p>
      </div>
    `);
    return html;
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-1/3"></div>
        <div className="h-64 bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Email Templates</h1>
        <p className="text-muted-foreground">
          Manage and customise the email templates sent through ReSend
        </p>
      </div>

      {missingTemplates.length > 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Set Up Default Templates</CardTitle>
            <CardDescription>
              Create the default email templates to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {missingTemplates.map((template) => (
                <Button
                  key={template.templateKey}
                  variant="outline"
                  size="sm"
                  onClick={() => handleCreateDefault(template.templateKey)}
                  disabled={createTemplateMutation.isPending}
                  data-testid={`button-create-${template.templateKey}`}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {template.name}
                </Button>
              ))}
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  missingTemplates.forEach(t => handleCreateDefault(t.templateKey));
                }}
                disabled={createTemplateMutation.isPending}
                data-testid="button-create-all"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Templates</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {templates.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No templates yet. Create one above.
                </div>
              ) : (
                templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className={`w-full text-left p-4 hover-elevate transition-colors ${
                      selectedTemplate?.id === template.id ? "bg-accent" : ""
                    }`}
                    data-testid={`button-select-${template.templateKey}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{template.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {template.description || template.templateKey}
                        </p>
                      </div>
                      <Badge variant={template.isActive ? "default" : "secondary"}>
                        {template.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          {selectedTemplate ? (
            <>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">{selectedTemplate.name}</CardTitle>
                  <CardDescription>{selectedTemplate.description}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditing ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPreviewDialog(true)}
                        data-testid="button-preview"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        data-testid="button-edit"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsEditing(false);
                          handleSelectTemplate(selectedTemplate);
                        }}
                        data-testid="button-cancel"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={updateTemplateMutation.isPending}
                        data-testid="button-save"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Template Name</Label>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      disabled={!isEditing}
                      data-testid="input-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Subject Line</Label>
                    <Input
                      value={editForm.subject}
                      onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                      disabled={!isEditing}
                      placeholder="Email subject with {{variables}}"
                      data-testid="input-subject"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editForm.isActive}
                      onCheckedChange={(checked) => setEditForm({ ...editForm, isActive: checked })}
                      disabled={!isEditing}
                      data-testid="switch-active"
                    />
                    <Label>Template is active</Label>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Info className="w-4 h-4" />
                    <span>Available variables for this template:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {getTemplateVariables(selectedTemplate.templateKey).map((v) => (
                      <Badge
                        key={v.name}
                        variant="outline"
                        className="cursor-help"
                        title={v.description}
                      >
                        <Code className="w-3 h-3 mr-1" />
                        {v.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    HTML Body
                  </Label>
                  <Textarea
                    value={editForm.htmlBody}
                    onChange={(e) => setEditForm({ ...editForm, htmlBody: e.target.value })}
                    disabled={!isEditing}
                    className="font-mono text-sm min-h-[400px]"
                    placeholder="HTML email content..."
                    data-testid="textarea-html"
                  />
                </div>

                {isEditing && (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this template?")) {
                          deleteTemplateMutation.mutate(selectedTemplate.id);
                        }
                      }}
                      disabled={deleteTemplateMutation.isPending}
                      data-testid="button-delete"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Template
                    </Button>
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              <div className="text-center">
                <Mail className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a template to view and edit</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Preview how the email will look with sample data
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg bg-white overflow-hidden">
            <ScrollArea className="h-[500px]">
              <iframe
                srcDoc={getPreviewHtml()}
                className="w-full h-[500px] border-0"
                title="Email Preview"
              />
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
