"use client";

import { Bot } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTeacherAssistant } from "./teacher-assistant-provider";

export function TeacherAssistantTrigger() {
  const { open, setOpen } = useTeacherAssistant();

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-expanded={open}
              aria-label="打开 ECHO AI 助手"
              className={open ? "bg-primary/10 text-primary" : undefined}
              onClick={() => setOpen(!open)}
              size="icon"
              type="button"
              variant="ghost"
            />
          }
        >
          <Bot />
        </TooltipTrigger>
        <TooltipContent>ECHO AI 助手</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
