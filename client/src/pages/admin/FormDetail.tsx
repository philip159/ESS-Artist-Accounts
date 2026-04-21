import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Clock, CheckCircle, FileSpreadsheet, User, Mail, Calendar } from "lucide-react";
import { format } from "date-fns";
import type { FormDefinition, FormField, FormSubmission } from "@shared/schema";

export default function AdminFormDetail() {
  const { key } = useParams<{ key: string }>();
  const [activeTab, setActiveTab] = useState<"in_progress" | "completed">("in_progress");

  const { data: form, isLoading: formLoading } = useQuery<FormDefinition>({
    queryKey: [`/api/admin/forms/${key}`],
  });

  const { data: fields, isLoading: fieldsLoading } = useQuery<FormField[]>({
    queryKey: [`/api/admin/forms/${key}/fields`],
    enabled: !!form,
  });

  const { data: inProgressSubmissions, isLoading: inProgressLoading } = useQuery<FormSubmission[]>({
    queryKey: [`/api/admin/forms/${key}/submissions?status=in_progress`],
    enabled: !!form,
  });

  const { data: completedSubmissions, isLoading: completedLoading } = useQuery<FormSubmission[]>({
    queryKey: [`/api/admin/forms/${key}/submissions?status=completed`],
    enabled: !!form,
  });

  const isLoading = formLoading || fieldsLoading;
  const currentSubmissions = activeTab === "in_progress" ? inProgressSubmissions : completedSubmissions;
  const currentLoading = activeTab === "in_progress" ? inProgressLoading : completedLoading;

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.length > 0 ? `${value.length} items` : "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/admin/forms">
          <Button variant="ghost" size="icon" data-testid="button-back-to-forms">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          {formLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <>
              <h1 className="text-2xl font-bold" data-testid="heading-form-name">{form?.name}</h1>
              <p className="text-muted-foreground">{form?.description}</p>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-in-progress-count">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {inProgressLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{inProgressSubmissions?.length || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-completed-count">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {completedLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{completedSubmissions?.length || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-fields-count">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tracked Fields</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {fieldsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{fields?.length || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-submissions">
        <CardHeader>
          <CardTitle>Submissions</CardTitle>
          <CardDescription>
            {activeTab === "in_progress" 
              ? "Forms that are currently being filled out" 
              : "Completed form submissions"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "in_progress" | "completed")}>
            <TabsList className="mb-4">
              <TabsTrigger value="in_progress" data-testid="tab-in-progress">
                <Clock className="h-4 w-4 mr-2" />
                In Progress ({inProgressSubmissions?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">
                <CheckCircle className="h-4 w-4 mr-2" />
                Completed ({completedSubmissions?.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {currentLoading || isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : currentSubmissions && currentSubmissions.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background">
                          <User className="h-4 w-4 inline mr-1" />
                          Actor
                        </TableHead>
                        <TableHead>
                          <Calendar className="h-4 w-4 inline mr-1" />
                          {activeTab === "in_progress" ? "Last Updated" : "Completed"}
                        </TableHead>
                        {activeTab === "in_progress" && (
                          <TableHead>Progress</TableHead>
                        )}
                        {fields?.map((field) => (
                          <TableHead key={field.id} className="whitespace-nowrap">
                            {field.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentSubmissions.map((submission) => {
                        const submissionData = (submission.data || {}) as Record<string, unknown>;
                        return (
                          <TableRow key={submission.id} data-testid={`row-submission-${submission.id}`}>
                            <TableCell className="sticky left-0 bg-background font-medium">
                              <div>
                                <div>{submission.actorName || "Anonymous"}</div>
                                {submission.actorEmail && (
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {submission.actorEmail}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {format(
                                activeTab === "in_progress" 
                                  ? new Date(submission.lastUpdatedAt) 
                                  : new Date(submission.completedAt || submission.lastUpdatedAt), 
                                "MMM d, yyyy HH:mm"
                              )}
                            </TableCell>
                            {activeTab === "in_progress" && (
                              <TableCell>
                                <Badge variant="outline">
                                  Step {submission.currentStep}/{submission.totalSteps}
                                </Badge>
                              </TableCell>
                            )}
                            {fields?.map((field) => (
                              <TableCell key={field.id} className="max-w-[200px] truncate">
                                {formatCellValue(submissionData[field.key])}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No {activeTab === "in_progress" ? "in-progress" : "completed"} submissions</p>
                  <p className="text-sm">
                    {activeTab === "in_progress" 
                      ? "Submissions will appear here when artists start filling out forms" 
                      : "Completed submissions will appear here"}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
