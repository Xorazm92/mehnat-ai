"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  ExternalLink,
  Download,
  Maximize2,
  Minimize2,
  RefreshCw,
  Move,
} from "lucide-react";

interface ImageZoomModalProps {
  src: string;
  alt?: string;
  title?: string;
  subtitle?: string;
  proofId?: string;
  onClose: () => void;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({
  src,
  alt = "Skrinshot",
  title = "Skrinshotni ko'rish va kattalashtirish",
  subtitle,
  proofId,
  onClose,
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullScreen, setIsFullScreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset viewport state
  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  // Zoom helpers
  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev * 1.3, 8));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const next = Math.max(prev / 1.3, 0.5);
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const rotateRight = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "+" || e.key === "=") {
        zoomIn();
      } else if (e.key === "-") {
        zoomOut();
      } else if (e.key === "0" || e.key === "r" || e.key === "R") {
        resetZoom();
      } else if (e.key === "ArrowLeft") {
        setPosition((p) => ({ ...p, x: p.x + 60 }));
      } else if (e.key === "ArrowRight") {
        setPosition((p) => ({ ...p, x: p.x - 60 }));
      } else if (e.key === "ArrowUp") {
        setPosition((p) => ({ ...p, y: p.y + 60 }));
      } else if (e.key === "ArrowDown") {
        setPosition((p) => ({ ...p, y: p.y - 60 }));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, zoomIn, zoomOut, resetZoom]);

  // Mouse wheel zoom inside viewport
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setScale((prevScale) => {
        const newScale = Math.min(Math.max(prevScale * zoomFactor, 0.5), 8);
        if (newScale <= 1) {
          setPosition({ x: 0, y: 0 });
        }
        return newScale;
      });
    },
    []
  );

  // Mouse drag to pan image
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // left click only
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Double click toggles fit vs 2.5x zoom
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (scale > 1.2) {
      resetZoom();
    } else {
      setScale(2.5);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left - rect.width / 2;
        const clickY = e.clientY - rect.top - rect.height / 2;
        setPosition({ x: -clickX * 1.5, y: -clickY * 1.5 });
      }
    }
  };

  // Direct image URL for downloading or opening in new window
  const rawImageUrl = proofId ? `/api/proofs/${proofId}/image` : src;

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = proofId ? `/api/proofs/${proofId}/image?download=1` : src;
    link.download = `skrinshot_${proofId || "mehnat-ai"}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenNewTab = () => {
    if (proofId) {
      window.open(`/api/proofs/${proofId}/image`, "_blank");
    } else if (src.startsWith("data:")) {
      // Create blob URL for safe top-level tab opening (prevents about:blank#blocked)
      fetch(src)
        .then((res) => res.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, "_blank");
        })
        .catch(() => window.open(src, "_blank"));
    } else {
      window.open(src, "_blank");
    }
  };

  const toggleFullScreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullScreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullScreen(false)).catch(() => {});
    }
  };

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[300] flex flex-col justify-between bg-black/90 backdrop-blur-md select-none animate-in fade-in duration-200"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── Top Header Toolbar ── */}
      <div className="flex items-center justify-between px-6 py-4 z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex flex-col min-w-0 pr-4">
          <h3 className="text-sm font-semibold text-white tracking-wider truncate flex items-center gap-2">
            <span>{title}</span>
            <span className="text-micro px-2 py-0.5 rounded-full font-mono bg-white/10 text-white/80">
              {Math.round(scale * 100)}%
            </span>
          </h3>
          {subtitle && (
            <p className="text-meta font-bold text-white/60 truncate mt-0.5">{subtitle}</p>
          )}
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleOpenNewTab}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/20 transition-all border border-white/10"
            title="Yangi tabda to'liq ochish"
          >
            <ExternalLink size={14} />
            <span className="hidden sm:inline">Yangi tabda ochish</span>
          </button>
          <button
            onClick={handleDownload}
            className="p-2 rounded-xl text-white bg-white/10 hover:bg-white/20 transition-all border border-white/10"
            title="Yuklab olish"
          >
            <Download size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white bg-white/20 hover:bg-red-600 transition-all border border-white/10 ml-2"
            title="Yopish (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ── Main Viewport ── */}
      <div
        className={`flex-1 relative overflow-hidden flex items-center justify-center cursor-${
          isDragging ? "grabbing" : scale > 1 ? "grab" : "zoom-in"
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onDoubleClick={handleDoubleClick}
      >
        <div
          className="transition-transform duration-75 ease-out flex items-center justify-center max-w-full max-h-full p-4"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transformOrigin: "center center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            draggable={false}
            className="max-w-[90vw] max-h-[80vh] rounded-lg shadow-2xl object-contain border border-white/10 bg-black/40"
          />
        </div>
      </div>

      {/* ── Bottom Controls Bar ── */}
      <div className="flex items-center justify-center p-4 z-10 bg-gradient-to-t from-black/90 to-transparent">
        <div className="flex items-center gap-1 sm:gap-3 px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-lg border border-white/15 shadow-2xl text-white">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="p-2 rounded-xl hover:bg-white/15 disabled:opacity-30 transition-all"
            title="Kichiklashtirish (-)"
          >
            <ZoomOut size={18} />
          </button>

          {/* Scale Slider */}
          <div className="flex items-center gap-2 px-2">
            <input
              type="range"
              min="50"
              max="500"
              step="10"
              value={Math.round(scale * 100)}
              onChange={(e) => {
                const val = Number(e.target.value) / 100;
                setScale(val);
                if (val <= 1) setPosition({ x: 0, y: 0 });
              }}
              className="w-24 sm:w-36 h-1.5 accent-blue-500 rounded-lg cursor-pointer bg-white/20"
            />
            <span className="text-micro font-mono font-bold w-12 text-center text-white/90">
              {Math.round(scale * 100)}%
            </span>
          </div>

          <button
            onClick={zoomIn}
            disabled={scale >= 8}
            className="p-2 rounded-xl hover:bg-white/15 disabled:opacity-30 transition-all"
            title="Kattalashtirish (+)"
          >
            <ZoomIn size={18} />
          </button>

          <div className="w-px h-5 bg-white/20 mx-1" />

          <button
            onClick={resetZoom}
            className="p-2 rounded-xl hover:bg-white/15 transition-all text-xs font-bold flex items-center gap-1"
            title="Tiklash (1:1 / R)"
          >
            <RotateCcw size={16} />
            <span className="hidden md:inline">Tiklash</span>
          </button>

          <button
            onClick={rotateRight}
            className="p-2 rounded-xl hover:bg-white/15 transition-all"
            title="90° Burish"
          >
            <RotateCw size={16} />
          </button>

          <div className="w-px h-5 bg-white/20 mx-1" />

          <button
            onClick={toggleFullScreen}
            className="p-2 rounded-xl hover:bg-white/15 transition-all"
            title={isFullScreen ? "Kichik rejim" : "To'liq ekran"}
          >
            {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
