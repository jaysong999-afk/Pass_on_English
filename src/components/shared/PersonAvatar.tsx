"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { displayInitials, isDisplayableAvatarUrl } from "@/lib/avatar-display";
import { cn } from "@/lib/utils";

export interface PersonAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  imageClassName?: string;
}

export function PersonAvatar({
  name,
  avatarUrl,
  className,
  fallbackClassName,
  imageClassName,
}: PersonAvatarProps) {
  const initials = displayInitials(name);
  const src = isDisplayableAvatarUrl(avatarUrl) ? avatarUrl : undefined;

  return (
    <Avatar className={className}>
      {src ? (
        <AvatarImage src={src} alt={name} className={cn("object-cover", imageClassName)} />
      ) : null}
      <AvatarFallback className={fallbackClassName}>{initials}</AvatarFallback>
    </Avatar>
  );
}
