import { useEffect, useRef } from "react";

export function OsClipPlayer({
    src,
    poster,
    label,
    onError,
}: {
    src: string;
    poster: string;
    label: string;
    onError: () => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        let inView = false;
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const updatePlayback = () => {
            if (!inView || document.hidden || media.matches) {
                if (!video.paused) video.pause();
                return;
            }
            video.muted = true;
            void video.play().catch(() => {
                // Keep the poster if the browser declines autoplay.
            });
        };
        const observer = new IntersectionObserver(
            ([entry]) => {
                inView = entry.isIntersecting && entry.intersectionRatio >= 0.15;
                updatePlayback();
            },
            { threshold: [0, 0.15] }
        );
        media.addEventListener("change", updatePlayback);
        document.addEventListener("visibilitychange", updatePlayback);
        observer.observe(video);
        return () => {
            media.removeEventListener("change", updatePlayback);
            document.removeEventListener("visibilitychange", updatePlayback);
            observer.disconnect();
            if (!video.paused) video.pause();
        };
    }, []);

    return (
        <video
            ref={videoRef}
            src={src}
            poster={poster}
            width={1280}
            height={720}
            aria-label={label}
            controls={false}
            muted
            playsInline
            loop
            preload="none"
            disablePictureInPicture
            disableRemotePlayback
            onError={onError}
        />
    );
}
