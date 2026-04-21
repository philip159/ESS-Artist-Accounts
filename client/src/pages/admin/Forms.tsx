import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Mail, Eye, RefreshCw, ExternalLink, Pencil, Plus, Trash2, Send, Loader2, Clock, FileSignature } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import type { FormDefinition, EmailTemplate, CreatorContract, Creator } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type EmailAssociation = {
  triggerStatus: string;
  templateKey: string;
  recipient: string;
  description?: string;
  delayMinutes?: number;
};

export default function AdminForms() {
  const { toast } = useToast();
  const [editingForm, setEditingForm] = useState<FormDefinition | null>(null);
  const [editingAssociations, setEditingAssociations] = useState<EmailAssociation[]>([]);
  const [sendingTestIndex, setSendingTestIndex] = useState<number | null>(null);
  
  const { data: forms, isLoading } = useQuery<FormDefinition[]>({
    queryKey: ["/api/admin/forms"],
  });

  const { data: templates } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
  });

  // Query for creator contracts
  const { data: creatorContracts = [] } = useQuery<CreatorContract[]>({
    queryKey: ["/api/admin/creator-contracts"],
  });

  const { data: creators = [] } = useQuery<Creator[]>({
    queryKey: ["/api/admin/creators"],
  });

  const getCreatorName = (creatorId: string) => {
    const creator = creators.find(c => c.id === creatorId);
    return creator?.name || "Unknown";
  };

  const getContractStatusBadge = (status: string) => {
    switch (status) {
      case "signed":
        return <Badge variant="default" className="bg-green-600">Signed</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
      case "cancelled":
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const updateFormMutation = useMutation({
    mutationFn: async ({ key, emailAssociations }: { key: string; emailAssociations: EmailAssociation[] }) => {
      const res = await apiRequest("PATCH", `/api/admin/forms/${key}`, { emailAssociations });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/forms"] });
      toast({
        title: "Email Automations Updated",
        description: "The email associations have been saved.",
      });
      setEditingForm(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update email automations",
        variant: "destructive",
      });
    },
  });

  const handleSeedForms = async () => {
    try {
      const result = await apiRequest("POST", "/api/admin/forms/seed");
      const data = await result.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/forms"] });
      toast({
        title: "Forms Seeded",
        description: data.message,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to seed forms",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (form: FormDefinition) => {
    setEditingForm(form);
    setEditingAssociations([...((form.emailAssociations as EmailAssociation[]) || [])]);
  };

  const addAssociation = () => {
    setEditingAssociations([
      ...editingAssociations,
      { triggerStatus: "completed", templateKey: "", recipient: "artist", description: "", delayMinutes: 0 },
    ]);
  };

  const removeAssociation = (index: number) => {
    setEditingAssociations(editingAssociations.filter((_, i) => i !== index));
  };

  const updateAssociation = (index: number, field: keyof EmailAssociation, value: string) => {
    const updated = [...editingAssociations];
    updated[index] = { ...updated[index], [field]: value };
    setEditingAssociations(updated);
  };

  const saveAssociations = () => {
    if (!editingForm) return;
    const validAssociations = editingAssociations.filter(a => a.templateKey);
    updateFormMutation.mutate({ key: editingForm.key, emailAssociations: validAssociations });
  };

  const sendTestEmail = async (index: number, templateKey: string, recipient: string) => {
    if (!editingForm || !templateKey) {
      toast({
        title: "Cannot Send Test",
        description: "Please select an email template first",
        variant: "destructive",
      });
      return;
    }
    
    setSendingTestIndex(index);
    try {
      const res = await apiRequest("POST", `/api/admin/forms/${editingForm.key}/test-email`, {
        templateKey,
        recipient,
      });
      const data = await res.json();
      toast({
        title: "Test Email Sent",
        description: `Sent "${templateKey}" to ${data.sentTo}`,
      });
    } catch (error) {
      toast({
        title: "Failed to Send Test Email",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setSendingTestIndex(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-forms">Forms</h1>
          <p className="text-muted-foreground">Track submission progress across all forms</p>
        </div>
        {(!forms || forms.length === 0) && !isLoading && (
          <Button onClick={handleSeedForms} data-testid="button-seed-forms">
            <RefreshCw className="h-4 w-4 mr-2" />
            Initialize Forms
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-total-forms">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Forms</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{forms?.length || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-email-associations">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email Automations</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {forms?.reduce((acc, form) => acc + ((form.emailAssociations as unknown[])?.length || 0), 0) || 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-forms-list">
        <CardHeader>
          <CardTitle>All Forms</CardTitle>
          <CardDescription>
            Click on a form to view submissions and track progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : forms && forms.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form Name</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Email Automations</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((form) => (
                  <TableRow key={form.id} data-testid={`row-form-${form.key}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{form.name}</div>
                        {form.description && (
                          <div className="text-sm text-muted-foreground">{form.description}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{form.route}</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-wrap gap-1">
                          {((form.emailAssociations as EmailAssociation[]) || []).map((assoc, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {assoc.templateKey} → {assoc.recipient}
                              {assoc.delayMinutes && assoc.delayMinutes > 0 && (
                                <span className="ml-1 text-muted-foreground">
                                  ({assoc.delayMinutes >= 60 
                                    ? `${Math.floor(assoc.delayMinutes / 60)}h${assoc.delayMinutes % 60 > 0 ? ` ${assoc.delayMinutes % 60}m` : ''}` 
                                    : `${assoc.delayMinutes}m`} delay)
                                </span>
                              )}
                            </Badge>
                          ))}
                          {(!form.emailAssociations || (form.emailAssociations as []).length === 0) && (
                            <span className="text-sm text-muted-foreground">No automations</span>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0"
                          onClick={() => openEditDialog(form)}
                          data-testid={`button-edit-automations-${form.key}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a href={form.route} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" data-testid={`button-preview-form-${form.key}`}>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Preview
                          </Button>
                        </a>
                        <Link href={`/admin/forms/${form.key}`}>
                          <Button size="sm" variant="outline" data-testid={`button-view-form-${form.key}`}>
                            <Eye className="h-4 w-4 mr-1" />
                            View Submissions
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No forms configured yet</p>
              <p className="text-sm">Click "Initialize Forms" to set up Artist Upload and Onboarding forms</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Creator Contract Form Section */}
      <Card data-testid="card-creator-contracts">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Creator Contract
          </CardTitle>
          <CardDescription>
            Track influencer contract submissions and signing status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form Name</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Submissions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow data-testid="row-form-creator-contract">
                <TableCell>
                  <div>
                    <div className="font-medium">Creator Contract</div>
                    <div className="text-sm text-muted-foreground">Influencer partnership agreement signing</div>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">/creator-contract/:token</code>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {creatorContracts.filter(c => c.status === "pending").length} Pending
                    </Badge>
                    <Badge variant="default" className="bg-green-600">
                      {creatorContracts.filter(c => c.status === "signed").length} Signed
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href="/admin/creators">
                      <Button size="sm" variant="ghost" data-testid="button-preview-creator-contract">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                    </Link>
                    <Link href="/admin/creators">
                      <Button size="sm" variant="outline" data-testid="button-view-creator-submissions">
                        <Eye className="h-4 w-4 mr-1" />
                        View Submissions
                      </Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {creatorContracts.length > 0 && (
            <div className="mt-6 space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Recent Submissions</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Creator</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creatorContracts.slice(0, 5).map((contract) => (
                    <TableRow key={contract.id} data-testid={`row-contract-submission-${contract.id}`}>
                      <TableCell className="font-medium">
                        {getCreatorName(contract.creatorId)}
                      </TableCell>
                      <TableCell>{contract.title}</TableCell>
                      <TableCell>
                        {getContractStatusBadge(contract.status)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(contract.createdAt), "dd/MM/yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {creatorContracts.length > 5 && (
                <div className="text-center">
                  <Link href="/admin/creators">
                    <Button variant="link" size="sm" data-testid="button-view-all-contracts">
                      View all {creatorContracts.length} contracts
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingForm} onOpenChange={(open) => !open && setEditingForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Email Automations</DialogTitle>
            <DialogDescription>
              Configure which emails are sent when form submissions change status
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {editingAssociations.map((assoc, index) => (
              <div key={index} className="space-y-3 p-3 border rounded-md">
                <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Trigger Status</Label>
                    <Select
                      value={assoc.triggerStatus}
                      onValueChange={(value) => updateAssociation(index, "triggerStatus", value)}
                    >
                      <SelectTrigger data-testid={`select-trigger-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="abandoned">Abandoned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Email Template</Label>
                    <Select
                      value={assoc.templateKey}
                      onValueChange={(value) => updateAssociation(index, "templateKey", value)}
                    >
                      <SelectTrigger data-testid={`select-template-${index}`}>
                        <SelectValue placeholder="Select template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates?.map((t) => (
                          <SelectItem key={t.templateKey} value={t.templateKey}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Recipient</Label>
                    <Select
                      value={assoc.recipient}
                      onValueChange={(value) => updateAssociation(index, "recipient", value)}
                    >
                      <SelectTrigger data-testid={`select-recipient-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="artist">Artist</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Delay
                    </Label>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          className="w-16"
                          placeholder="0"
                          value={Math.floor((assoc.delayMinutes || 0) / 60) || ""}
                          onChange={(e) => {
                            const hours = parseInt(e.target.value) || 0;
                            const currentMinutes = (assoc.delayMinutes || 0) % 60;
                            const totalMinutes = hours * 60 + currentMinutes;
                            const updated = [...editingAssociations];
                            updated[index] = { ...updated[index], delayMinutes: totalMinutes };
                            setEditingAssociations(updated);
                          }}
                          data-testid={`input-delay-hours-${index}`}
                        />
                        <span className="text-xs text-muted-foreground">hrs</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={59}
                          className="w-16"
                          placeholder="0"
                          value={(assoc.delayMinutes || 0) % 60 || ""}
                          onChange={(e) => {
                            const minutes = Math.min(59, parseInt(e.target.value) || 0);
                            const currentHours = Math.floor((assoc.delayMinutes || 0) / 60);
                            const totalMinutes = currentHours * 60 + minutes;
                            const updated = [...editingAssociations];
                            updated[index] = { ...updated[index], delayMinutes: totalMinutes };
                            setEditingAssociations(updated);
                          }}
                          data-testid={`input-delay-mins-${index}`}
                        />
                        <span className="text-xs text-muted-foreground">mins</span>
                      </div>
                    </div>
                    {assoc.triggerStatus === "abandoned" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Tip: For abandoned forms, set a delay (e.g., 30 mins) to wait before sending
                      </p>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendTestEmail(index, assoc.templateKey, assoc.recipient)}
                    disabled={!assoc.templateKey || sendingTestIndex === index}
                    data-testid={`button-test-email-${index}`}
                  >
                    {sendingTestIndex === index ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-3 w-3 mr-1" />
                        Test
                      </>
                    )}
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeAssociation(index)}
                    data-testid={`button-remove-association-${index}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={addAssociation}
              data-testid="button-add-association"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Email Automation
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingForm(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveAssociations}
              disabled={updateFormMutation.isPending}
              data-testid="button-save-automations"
            >
              {updateFormMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
