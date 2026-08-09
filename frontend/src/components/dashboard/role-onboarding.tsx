"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { tourStepsByRole } from "@/lib/auth";

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function RoleOnboarding() {
  const { session } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(
      `medivanta-tour:${session.user.role}:${session.user.id}`,
    ) !== "complete";
  });
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0, scrollX: 0, scrollY: 0 });
  const storageKey = useMemo(
    () => `medivanta-tour:${session.user.role}:${session.user.id}`,
    [session.user.id, session.user.role],
  );
  const steps = tourStepsByRole[session.user.role];

  useEffect(() => {
    const restartTour = () => {
      window.localStorage.removeItem(storageKey);
      setStepIndex(0);
      setOpen(true);
    };

    window.addEventListener("medivanta-tour:restart", restartTour);
    return () => window.removeEventListener("medivanta-tour:restart", restartTour);
  }, [storageKey]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateRect = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-tour="${steps[stepIndex]?.targetId}"]`,
      );

      if (!target) {
        setRect(null);
        return;
      }

      const bounds = target.getBoundingClientRect();
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      });
      setRect({
        top: bounds.top + window.scrollY,
        left: bounds.left + window.scrollX,
        width: bounds.width,
        height: bounds.height,
      });
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, stepIndex, steps]);

  if (!open || !rect) {
    return null;
  }

  const currentStep = steps[stepIndex];
  const tooltipWidth = Math.min(viewport.width - 32, 320);
  const spaceBelow = viewport.scrollY + viewport.height - (rect.top + rect.height);
  const shouldPlaceBelow = spaceBelow > 220;
  const tooltipTop = shouldPlaceBelow
    ? rect.top + rect.height + 16
    : Math.max(viewport.scrollY + 16, rect.top - 196);
  const tooltipLeft = clamp(
    rect.left,
    viewport.scrollX + 16,
    viewport.scrollX + viewport.width - tooltipWidth - 16,
  );

  const closeTour = () => {
    window.localStorage.setItem(storageKey, "complete");
    setOpen(false);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-950/55" />
      <div
        className="absolute rounded-2xl border-2 border-[color:var(--accent)] shadow-[0_0_0_9999px_rgba(15,23,42,0.55)] transition-all duration-200"
        style={{
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
        }}
      />
      <Card
        className="pointer-events-auto absolute w-full max-w-[20rem] p-5 shadow-2xl"
        style={{
          top: tooltipTop,
          left: tooltipLeft,
          width: tooltipWidth,
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--accent)]">
          Guided tour
        </p>
        <h2 className="mt-3 text-lg font-semibold">{currentStep.title}</h2>
        <p className="mt-3 text-sm leading-6 text-[color:var(--muted-foreground)]">
          {currentStep.description}
        </p>
        <p className="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={closeTour}>
            Skip
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={stepIndex === 0}
            >
              Back
            </Button>
            {stepIndex < steps.length - 1 ? (
              <Button onClick={() => setStepIndex((current) => current + 1)}>Next</Button>
            ) : (
              <Button onClick={closeTour}>Finish</Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
