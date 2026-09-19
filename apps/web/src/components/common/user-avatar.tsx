import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  avatarUrl,
  className,
  fallbackClassName,
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const src = resolveApiUrl(avatarUrl);
  return (
    <Avatar className={cn("size-8", className)}>
      {src ? <AvatarImage alt={`${name}的头像`} src={src} /> : null}
      <AvatarFallback className={fallbackClassName}>{name.slice(0, 1) || "教"}</AvatarFallback>
    </Avatar>
  );
}
