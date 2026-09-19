"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { VERTICAL_IDS } from "@yoyo/verticals";
import { useOrganization, useUpdateVertical } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const VERTICAL_LABELS: Record<(typeof VERTICAL_IDS)[number], string> = {
  core: "General / Core",
  real_estate: "Real Estate"
};

export default function VerticalSettingsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { data: organization } = useOrganization(organizationId);
  const canManage = useCan(organization?.myRole, "manageBilling");
  const updateVertical = useUpdateVertical(organizationId);

  const [pending, setPending] = useState<(typeof VERTICAL_IDS)[number] | null>(null);

  if (!organization) return null;

  const currentVertical = (organization.vertical as (typeof VERTICAL_IDS)[number] | undefined) ?? "core";

  function confirmSwitch() {
    if (!pending) return;
    updateVertical.mutate({ vertical: pending }, { onSuccess: () => setPending(null) });
  }

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-semibold">Vertical</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Changes which product modules and navigation this organization sees. Switching is structural - existing data (properties, leads,
        pipeline) is kept, not deleted.
      </p>

      <div className="mt-6">
        <span className="text-sm font-medium">Current: {VERTICAL_LABELS[currentVertical]}</span>
      </div>

      {canManage && (
        <div className="mt-4 flex items-center gap-2">
          <Select value={currentVertical} onValueChange={(v) => v && v !== currentVertical && setPending(v as (typeof VERTICAL_IDS)[number])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VERTICAL_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {VERTICAL_LABELS[id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch to {pending ? VERTICAL_LABELS[pending] : ""}?</DialogTitle>
            <DialogDescription>The dashboard navigation will change immediately for everyone in this organization.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button disabled={updateVertical.isPending} onClick={confirmSwitch}>
              Switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
