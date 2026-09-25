"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { ORGANIZATION_ROLES, type OrganizationRole } from "@yoyo/permissions";
import { useChangeMemberRole, useInviteMember, useMembers, useRemoveMember } from "@/lib/members-hooks";
import { ApiRequestError } from "@/lib/api-client";

export default function MembersSettingsPage() {
  const { t: translateText } = useI18n();
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { data, isLoading } = useMembers(organizationId);
  const invite = useInviteMember(organizationId);
  const changeRole = useChangeMemberRole(organizationId);
  const remove = useRemoveMember(organizationId);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("AGENT");
  const [error, setError] = useState<string | null>(null);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await invite.mutateAsync({ email, role });
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : "Could not send invite.");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">{translateText("Members")}</h1>

      <form onSubmit={onInvite} className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded border border-slate-300 p-2"
          type="email"
          placeholder={translateText("Email to invite")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <select className="rounded border border-slate-300 p-2" value={role} onChange={(e) => setRole(e.target.value as OrganizationRole)}>
          {ORGANIZATION_ROLES.filter((r) => r !== "OWNER").map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50" type="submit" disabled={invite.isPending}>
           {translateText("Invite")} </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{translateText(error)}</p>}

      {isLoading ? (
        <p className="mt-6 text-slate-500">{translateText("Loading members...")}</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">{translateText("Name")}</th>
              <th>{translateText("Email")}</th>
              <th>{translateText("Role")}</th>
              <th>{translateText("Status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((member) => (
              <tr key={member.id} className="border-b border-slate-100">
                <td className="py-2">{member.name}</td>
                <td>{member.email}</td>
                <td>
                  {member.role === "OWNER" ? (
                    "OWNER"
                  ) : (
                    <select
                      className="rounded border border-slate-300 p-1"
                      value={member.role}
                      onChange={(e) => changeRole.mutate({ memberId: member.id, role: e.target.value })}
                    >
                      {ORGANIZATION_ROLES.filter((r) => r !== "OWNER").map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td>{member.status}</td>
                <td>
                  {member.role !== "OWNER" && (
                    <button className="text-red-600 underline" onClick={() => remove.mutate(member.id)}>
                       {translateText("Remove")} </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
