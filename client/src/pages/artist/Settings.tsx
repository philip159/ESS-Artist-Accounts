import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { artistApiRequest, artistQueryFn } from "@/lib/artistApiRequest";
import { supabase } from "@/lib/supabase";
import {
  Save, Loader2, ShieldCheck, Shield, ScanLine, Trash2, X,
  User, CreditCard, Lock, CheckCircle2, Info,
} from "lucide-react";
import type { ArtistAccount } from "@shared/schema";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useArtistAuth } from "@/contexts/ArtistAuthContext";

async function impersonationFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json() as Promise<T>;
}

interface MfaFactor {
  id: string;
  status: string;
  friendly_name?: string;
}

/** Two-column settings row: label+description left, content right */
function SettingsRow({
  label,
  description,
  children,
  last = false,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-4 md:gap-8 py-5">
        <div>
          <p className="text-sm font-medium text-neutral-900">{label}</p>
          {description && (
            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
      {!last && <Separator />}
    </>
  );
}

/** Read-only display field */
function ReadField({ value }: { value: string }) {
  return (
    <div className="flex items-center h-9 px-3 rounded-lg bg-neutral-50 border border-neutral-200 text-sm text-neutral-700 font-medium">
      {value || "—"}
    </div>
  );
}

export default function ArtistSettings() {
  const { toast } = useToast();
  const { apiPrefix, isImpersonating, artistProfile, isLoading: impersonationLoading } = useImpersonation();
  const { user } = useArtistAuth();

  const [paypalEmail, setPaypalEmail] = useState("");
  const [paypalRecipientName, setPaypalRecipientName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isEditingPaypal, setIsEditingPaypal] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const [mfaFactors, setMfaFactors] = useState<MfaFactor[]>([]);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollData, setEnrollData] = useState<{ id: string; qrCode: string; secret: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery<ArtistAccount>({
    queryKey: [apiPrefix, "profile"],
    queryFn: () =>
      isImpersonating
        ? impersonationFetch<ArtistAccount>(`${apiPrefix}/profile`)
        : artistQueryFn<ArtistAccount>("/api/artist/profile"),
  });

  const activeProfile = isImpersonating ? artistProfile : profile;
  const isProfileLoading = isImpersonating ? impersonationLoading : profileLoading;

  useEffect(() => {
    if (activeProfile) {
      setPaypalEmail(activeProfile.paypalEmail || "");
      setPaypalRecipientName(activeProfile.paypalRecipientName || "");
      setDisplayName(activeProfile.displayName || activeProfile.vendorName || "");
    }
  }, [activeProfile]);

  useEffect(() => {
    if (!isImpersonating) loadMfaFactors();
  }, [isImpersonating]);

  const loadMfaFactors = async () => {
    setMfaLoading(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      setMfaFactors((data?.totp || []) as MfaFactor[]);
    } catch (err) {
      console.error("Failed to load MFA factors:", err);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "East Side Studio",
        friendlyName: "Authenticator",
      });
      if (error) {
        toast({ variant: "destructive", title: "Failed to start 2FA setup", description: error.message });
        return;
      }
      setEnrollData({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setVerifyCode("");
    } finally {
      setEnrolling(false);
    }
  };

  const handleVerify = async () => {
    if (!enrollData) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollData.id,
        code: verifyCode.replace(/\s/g, ""),
      });
      if (error) {
        toast({ variant: "destructive", title: "Invalid code", description: "Check your authenticator app and try again." });
        setVerifyCode("");
        return;
      }
      toast({ title: "Two-factor authentication enabled" });
      setEnrollData(null);
      setVerifyCode("");
      await loadMfaFactors();
    } finally {
      setVerifying(false);
    }
  };

  const handleRemoveMfa = async (factorId: string) => {
    setRemoving(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        toast({ variant: "destructive", title: "Failed to remove 2FA", description: error.message });
        return;
      }
      toast({ title: "Two-factor authentication removed" });
      await loadMfaFactors();
    } finally {
      setRemoving(false);
    }
  };

  const handleCancelEnroll = async () => {
    if (enrollData) await supabase.auth.mfa.unenroll({ factorId: enrollData.id }).catch(() => {});
    setEnrollData(null);
    setVerifyCode("");
  };

  const updatePaypalMutation = useMutation({
    mutationFn: async (data: { paypalEmail: string; paypalRecipientName: string }) => {
      const response = await artistApiRequest("PATCH", "/api/artist/profile", data);
      if (!response.ok) throw new Error("Failed to save PayPal settings");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Payout settings saved" });
      queryClient.invalidateQueries({ queryKey: [apiPrefix, "profile"] });
      setIsEditingPaypal(false);
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { displayName: string }) => {
      const response = await artistApiRequest("PATCH", "/api/artist/profile", data);
      if (!response.ok) throw new Error("Failed to save profile");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Profile updated" });
      queryClient.invalidateQueries({ queryKey: [apiPrefix, "profile"] });
      setIsEditingProfile(false);
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const isEnrolled = mfaFactors.some((f) => f.status === "verified");

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900" data-testid="text-page-title">
          Settings
        </h1>
        <p className="text-sm text-neutral-500 mt-1">Manage your artist profile and account preferences.</p>
      </div>

      {isImpersonating && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6">
          <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">You are in view-only mode. Settings cannot be changed while viewing as an artist.</p>
        </div>
      )}

      <Tabs defaultValue="profile">
        <TabsList className="mb-6 h-9 bg-neutral-100 rounded-lg p-0.5">
          <TabsTrigger value="profile" className="rounded-md text-xs font-medium px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <User className="h-3.5 w-3.5 mr-1.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="payout" className="rounded-md text-xs font-medium px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Payout
          </TabsTrigger>
          <TabsTrigger value="security" className="rounded-md text-xs font-medium px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Lock className="h-3.5 w-3.5 mr-1.5" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* ── Profile tab ── */}
        <TabsContent value="profile" className="mt-0">
          <div className="rounded-xl border border-neutral-200 bg-white px-6 divide-y divide-neutral-100" data-testid="card-account-info">
            <SettingsRow
              label="Artist name"
              description="Your name as it appears on the East Side Studio shop."
            >
              {isProfileLoading ? <Skeleton className="h-9 w-full" /> : <ReadField value={activeProfile?.vendorName || "—"} />}
            </SettingsRow>

            <SettingsRow
              label="Display name"
              description="A custom name shown in your portal. Defaults to your artist name."
            >
              {isProfileLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => { setDisplayName(e.target.value); setIsEditingProfile(true); }}
                    placeholder="Your display name"
                    disabled={isImpersonating}
                    className="h-9 text-sm"
                    data-testid="input-display-name"
                  />
                  {!isImpersonating && (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => updateProfileMutation.mutate({ displayName })}
                        disabled={!isEditingProfile || updateProfileMutation.isPending}
                        className="h-8 text-xs"
                        data-testid="button-save-profile"
                      >
                        {updateProfileMutation.isPending
                          ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          : <Save className="h-3.5 w-3.5 mr-1.5" />}
                        Save
                      </Button>
                    </div>
                  )}
                </>
              )}
            </SettingsRow>

            <SettingsRow
              label="Account email"
              description="The email address associated with your artist login."
            >
              {isProfileLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <ReadField value={user?.email || activeProfile?.primaryEmail || "—"} />
              )}
            </SettingsRow>

            <SettingsRow
              label="Account status"
              description="Your current onboarding and account status."
              last
            >
              {isProfileLoading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <div>
                  <Badge
                    className={`text-xs font-medium border-0 shadow-none capitalize ${
                      activeProfile?.onboardingStatus === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {activeProfile?.onboardingStatus === "active" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {activeProfile?.onboardingStatus || "—"}
                  </Badge>
                </div>
              )}
            </SettingsRow>
          </div>
        </TabsContent>

        {/* ── Payout tab ── */}
        <TabsContent value="payout" className="mt-0">
          <div className="rounded-xl border border-neutral-200 bg-white px-6 divide-y divide-neutral-100" data-testid="card-paypal-settings">
            <SettingsRow
              label="PayPal email"
              description="The email address of your PayPal account. Payments will be sent here."
            >
              {isProfileLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Input
                  id="paypalEmail"
                  type="email"
                  placeholder="your@paypal.com"
                  value={paypalEmail}
                  onChange={(e) => { setPaypalEmail(e.target.value); setIsEditingPaypal(true); }}
                  disabled={isImpersonating}
                  className="h-9 text-sm"
                  data-testid="input-paypal-email"
                />
              )}
            </SettingsRow>

            <SettingsRow
              label="Recipient name"
              description="The full name on your PayPal account — must match exactly to avoid delays."
              last
            >
              {isProfileLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <>
                  <Input
                    id="paypalRecipientName"
                    placeholder="Name as shown on PayPal"
                    value={paypalRecipientName}
                    onChange={(e) => { setPaypalRecipientName(e.target.value); setIsEditingPaypal(true); }}
                    disabled={isImpersonating}
                    className="h-9 text-sm"
                    data-testid="input-paypal-name"
                  />
                  {!isImpersonating && (
                    <div className="flex justify-end pt-1">
                      <Button
                        onClick={() => updatePaypalMutation.mutate({ paypalEmail, paypalRecipientName })}
                        disabled={!isEditingPaypal || updatePaypalMutation.isPending}
                        className="h-8 text-xs"
                        data-testid="button-save-paypal"
                      >
                        {updatePaypalMutation.isPending
                          ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          : <Save className="h-3.5 w-3.5 mr-1.5" />}
                        Save payout settings
                      </Button>
                    </div>
                  )}
                </>
              )}
            </SettingsRow>
          </div>

          <p className="text-xs text-neutral-400 mt-3 px-1">
            Payments are issued monthly for balances over £10. Contact{" "}
            <a href="mailto:artists@eastsidestudiolondon.co.uk" className="underline hover:text-neutral-600">
              artists@eastsidestudiolondon.co.uk
            </a>{" "}
            if you have payment queries.
          </p>
        </TabsContent>

        {/* ── Security tab ── */}
        <TabsContent value="security" className="mt-0">
          <div className="rounded-xl border border-neutral-200 bg-white px-6 divide-y divide-neutral-100" data-testid="card-security">

            {/* Email */}
            <SettingsRow
              label="Email address"
              description="Your sign-in email. Contact us to change it."
            >
              <ReadField value={user?.email || activeProfile?.primaryEmail || "—"} />
            </SettingsRow>

            {/* Password */}
            <SettingsRow
              label="Password"
              description="To change your password, contact our team directly."
            >
              <p className="text-sm text-neutral-500">
                <a
                  href="mailto:artists@eastsidestudiolondon.co.uk"
                  className="text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
                >
                  artists@eastsidestudiolondon.co.uk
                </a>
              </p>
            </SettingsRow>

            {/* 2FA */}
            <SettingsRow
              label="Two-factor authentication"
              description="Add an extra layer of security. You'll need an authenticator app like Google Authenticator or Authy."
              last={!enrollData}
            >
              {isImpersonating ? (
                <p className="text-sm text-neutral-400">Not available in view-only mode.</p>
              ) : mfaLoading ? (
                <Skeleton className="h-8 w-28" />
              ) : isEnrolled ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Enabled
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveMfa(mfaFactors[0].id)}
                    disabled={removing}
                    className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  >
                    {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                    Remove 2FA
                  </Button>
                </div>
              ) : !enrollData ? (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEnroll}
                    disabled={enrolling}
                    className="h-8 text-xs"
                  >
                    {enrolling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Shield className="h-3.5 w-3.5 mr-1.5" />}
                    Enable 2FA
                  </Button>
                </div>
              ) : null}
            </SettingsRow>

            {/* 2FA enrollment flow — own row when active */}
            {enrollData && !isImpersonating && (
              <SettingsRow label="Scan QR code" description="Use your authenticator app to scan this code, then enter the 6-digit confirmation." last>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="shrink-0 rounded-xl border border-neutral-200 bg-white p-2 shadow-sm">
                      <img src={enrollData.qrCode} alt="2FA QR Code" className="h-28 w-28 rounded-lg" />
                    </div>
                    <div className="space-y-2 min-w-0">
                      <p className="text-xs text-neutral-500 leading-relaxed">
                        Open <strong className="text-neutral-700">Google Authenticator</strong>,{" "}
                        <strong className="text-neutral-700">Authy</strong>, or any TOTP app and scan the code. Or enter this key manually:
                      </p>
                      <code className="block rounded-lg bg-neutral-100 px-2.5 py-2 text-[10px] font-mono text-neutral-600 break-all select-all">
                        {enrollData.secret}
                      </code>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-neutral-700">Confirmation code</Label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="000 000"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                        maxLength={6}
                        autoFocus
                        className="flex-1 h-10 rounded-lg border border-neutral-200 bg-white px-3 text-[15px] font-mono tracking-[0.3em] outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 placeholder:text-neutral-300 placeholder:tracking-normal transition"
                        onKeyDown={(e) => { if (e.key === "Enter" && verifyCode.length === 6) handleVerify(); }}
                      />
                      <Button
                        onClick={handleVerify}
                        disabled={verifyCode.length < 6 || verifying}
                        className="h-10 text-sm"
                      >
                        {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4 mr-1.5" />}
                        Activate
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleCancelEnroll}
                        className="h-10 w-10 text-neutral-400 hover:text-neutral-600"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </SettingsRow>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
