import { InstagramLogo, TiktokLogo } from "@phosphor-icons/react";
import { InitialsAvatar } from "@/components/initials-avatar";

export function ChannelAvatar({ name, provider, size = "default" }: { name: string; provider: "INSTAGRAM" | "TIKTOK"; size?: "sm" | "default" | "lg" }) {
  return (
    <div className="relative shrink-0">
      <InitialsAvatar name={name} size={size} />
      <span
        className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-[5px] text-white ring-2 ring-card"
        style={{ background: provider === "INSTAGRAM" ? "#df3e93" : "#111423" }}
      >
        {provider === "INSTAGRAM" ? <InstagramLogo size={10} weight="fill" /> : <TiktokLogo size={10} weight="fill" />}
      </span>
    </div>
  );
}
