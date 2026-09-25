"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { ConnectedAccount } from "@yoyo/contracts";
import { useOrganization } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { connectAccountHref, useConnectedAccounts, useDisconnectAccount } from "@/lib/integrations-hooks";
import { ProviderBadge } from "@/components/provider-badge";
import { StatusBadge } from "@/components/status-badge";
import { RelativeTime } from "@/components/relative-time";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";

function capabilitySummary(account: ConnectedAccount): string {
  const parts: string[] = [];
  if (account.capabilities.inboundMessaging || account.capabilities.outboundMessaging) parts.push("messaging");
  if (account.capabilities.photoPublishing) parts.push("photos");
  if (account.capabilities.videoPublishing) parts.push("videos");
  if (account.capabilities.carouselPublishing) parts.push("carousels");
  return parts.length > 0 ? `Can publish/send: ${parts.join(", ")}` : "No messaging or publishing permissions granted";
}

function DisconnectButton({ account, organizationId }: { account: ConnectedAccount; organizationId: string }) {
  const { t: translateText, locale, intlLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const disconnect = useDisconnectAccount(organizationId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>{translateText("Disconnect")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translateText("Disconnect")} {account.username ?? account.displayName ?? "this account"}?</DialogTitle>
          <DialogDescription>
             {translateText("Messages and publishing for this account will stop working until it's reconnected.")} </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
             {translateText("Cancel")} </Button>
          <Button
            variant="destructive"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate(account.id, { onSuccess: () => setOpen(false) })}
          >
             {translateText("Disconnect")} </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function IntegrationsSettingsPage() {
  const { t: translateText, locale, intlLocale } = useI18n();
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { data: organization } = useOrganization(organizationId);
  const { data: accounts, isLoading } = useConnectedAccounts(organizationId);
  const canManage = useCan(organization?.myRole, "manageIntegrations");

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translateText("Integrations")}</h1>
        {canManage && (
          <div className="flex gap-2">
            <Button nativeButton={false} render={<a href={connectAccountHref(organizationId, "instagram")} />}>
               {translateText("Connect Instagram")} </Button>
            <Button variant="outline" nativeButton={false} render={<a href={connectAccountHref(organizationId, "tiktok")} />}>
               {translateText("Connect TikTok")} </Button>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {isLoading && (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        )}

        {!isLoading && accounts?.length === 0 && (
          <p className="text-sm text-muted-foreground">{translateText("No accounts connected yet.")}</p>
        )}

        {accounts?.map((account) => (
          <Card key={account.id}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={account.avatarUrl ?? undefined} />
                  <AvatarFallback>{(account.username ?? account.displayName ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-base">{account.displayName ?? account.username ?? "Unnamed account"}</CardTitle>
                  <div className="mt-1 flex items-center gap-2">
                    <ProviderBadge provider={account.provider} />
                    <StatusBadge status={account.status} />
                  </div>
                </div>
              </div>
              {canManage && (
                <CardAction>
                  <DisconnectButton account={account} organizationId={organizationId} />
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{capabilitySummary(account)}</span>
              <span>
                 {translateText("Last webhook:")} <RelativeTime date={account.lastWebhookAt} />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
