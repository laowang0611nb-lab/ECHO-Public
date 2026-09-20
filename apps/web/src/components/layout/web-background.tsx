"use client";

import { useEffect, useRef } from "react";

export function WebBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!video) return;

    const syncPlayback = () => {
      if (reduceMotion.matches || document.hidden) {
        video.pause();
      } else {
        void video.play().catch(() => undefined);
      }
    };

    const handleVisibility = () => syncPlayback();
    video.addEventListener("canplay", syncPlayback);
    document.addEventListener("visibilitychange", handleVisibility);
    reduceMotion.addEventListener("change", syncPlayback);
    syncPlayback();

    return () => {
      video.removeEventListener("canplay", syncPlayback);
      document.removeEventListener("visibilitychange", handleVisibility);
      reduceMotion.removeEventListener("change", syncPlayback);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <video
        autoPlay
        className="absolute inset-0 size-full object-cover motion-reduce:hidden"
        disablePictureInPicture
        loop
        muted
        playsInline
        poster="/web-background.png"
        preload="auto"
        ref={videoRef}
        tabIndex={-1}
      >
        <source src="/web-background.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-white/50 backdrop-blur-xl" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-2xl" />
    </div>
  );
}
