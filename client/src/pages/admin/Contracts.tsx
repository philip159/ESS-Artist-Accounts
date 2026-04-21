import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Eye, Download, FileSignature } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import type { SignedContract } from "@shared/schema";
import { Link } from "wouter";

export default function AdminContracts() {
  const [viewContract, setViewContract] = useState<SignedContract | null>(null);

  const { data: contracts, isLoading } = useQuery<SignedContract[]>({
    queryKey: ["/api/admin/signed-contracts"],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-contracts">Contracts</h1>
          <p className="text-muted-foreground">View all signed artist contracts</p>
        </div>
        <Link href="/admin/contract-editor">
          <Button variant="outline" data-testid="button-edit-template">
            <FileSignature className="h-4 w-4 mr-2" />
            Edit Contract Template
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-total-contracts">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contracts</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{contracts?.length || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-this-month">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {contracts?.filter(c => {
                  const signedDate = new Date(c.signedAt);
                  const now = new Date();
                  return signedDate.getMonth() === now.getMonth() && signedDate.getFullYear() === now.getFullYear();
                }).length || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-latest-contract">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Latest Contract</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : contracts && contracts.length > 0 ? (
              <div className="text-sm font-medium">
                {contracts[0].artistFirstName} {contracts[0].artistLastName}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No contracts yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-contracts-table">
        <CardHeader>
          <CardTitle>Signed Contracts</CardTitle>
          <CardDescription>
            All artist licensing agreements that have been signed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : contracts && contracts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artist Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Signed Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => (
                  <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                    <TableCell className="font-medium">
                      {contract.artistFirstName} {contract.artistLastName}
                    </TableCell>
                    <TableCell>{contract.artistEmail}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{contract.commissionRate}%</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(contract.signedAt), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewContract(contract)}
                        data-testid={`button-view-contract-${contract.id}`}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No signed contracts yet</p>
              <p className="text-sm">Contracts will appear here when artists complete onboarding</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewContract} onOpenChange={(open) => !open && setViewContract(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Contract: {viewContract?.artistFirstName} {viewContract?.artistLastName}
            </DialogTitle>
          </DialogHeader>
          {viewContract && (
            <ScrollArea className="h-[60vh]">
              <div className="space-y-6 p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Artist:</span>
                    <p className="font-medium">{viewContract.artistFirstName} {viewContract.artistLastName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p className="font-medium">{viewContract.artistEmail}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Address:</span>
                    <p className="font-medium">{viewContract.artistAddress}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Commission Rate:</span>
                    <p className="font-medium">{viewContract.commissionRate}%</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Signed On:</span>
                    <p className="font-medium">{format(new Date(viewContract.signedAt), "dd MMMM yyyy 'at' HH:mm")}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Signer:</span>
                    <p className="font-medium">{viewContract.companySignerName}</p>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Contract Content</h3>
                  <div className="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-lg">
                    {viewContract.contractContent}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Signatures</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Company Signature</p>
                      <img 
                        src={viewContract.companySignatureUrl} 
                        alt="Company signature" 
                        className="h-16 border rounded bg-white p-2"
                      />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Artist Signature</p>
                      <img 
                        src={viewContract.artistSignatureUrl} 
                        alt="Artist signature" 
                        className="h-16 border rounded bg-white p-2"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
