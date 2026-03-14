import { useEffect, useRef } from "react";
import { BackgroundPattern as BgType } from "@/hooks/useUserSettings";

interface Props {
  pattern: BgType;
}

export default function BackgroundPattern({ pattern }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Starry night animation
  useEffect(() => {
    if (pattern !== "starry") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const stars: { x: number; y: number; r: number; speed: number; opacity: number; twinkleSpeed: number; phase: number }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Generate stars
    const count = Math.floor((canvas.width * canvas.height) / 8000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.4 + 0.3,
        speed: Math.random() * 0.15 + 0.02,
        opacity: Math.random() * 0.6 + 0.2,
        twinkleSpeed: Math.random() * 0.008 + 0.003,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const animate = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const s of stars) {
        const twinkle = Math.sin(t * s.twinkleSpeed + s.phase) * 0.3 + 0.7;
        const alpha = s.opacity * twinkle;

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 210, 255, ${alpha})`;
        ctx.fill();

        // Subtle glow for larger stars
        if (s.r > 1) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180, 200, 255, ${alpha * 0.1})`;
          ctx.fill();
        }

        // Slow drift
        s.y -= s.speed;
        s.x += Math.sin(t * 0.0003 + s.phase) * 0.03;

        if (s.y < -5) {
          s.y = canvas.height + 5;
          s.x = Math.random() * canvas.width;
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [pattern]);

  // Fireflies animation
  useEffect(() => {
    if (pattern !== "fireflies") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    interface Firefly {
      x: number; y: number; r: number;
      baseOpacity: number; opacity: number;
      pulseSpeed: number; pulsePhase: number;
      wanderAngle: number; wanderSpeed: number;
      hue: number; pauseUntil: number;
    }

    const flies: Firefly[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const count = Math.floor((canvas.width * canvas.height) / 18000) + 20;
    for (let i = 0; i < count; i++) {
      flies.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2.5 + 1.5,
        baseOpacity: Math.random() * 0.5 + 0.3,
        opacity: 0,
        pulseSpeed: Math.random() * 0.004 + 0.001,
        pulsePhase: Math.random() * Math.PI * 2,
        wanderAngle: Math.random() * Math.PI * 2,
        wanderSpeed: Math.random() * 0.3 + 0.1,
        hue: Math.random() * 30 + 40, // 40-70: gold to green-gold
        pauseUntil: 0,
      });
    }

    const animate = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const f of flies) {
        // Occasional pause/dim
        if (t < f.pauseUntil) {
          f.opacity *= 0.96;
        } else {
          // Pulse
          const pulse = (Math.sin(t * f.pulseSpeed + f.pulsePhase) + 1) / 2;
          f.opacity = f.baseOpacity * (pulse * 0.8 + 0.2);

          // Random pause trigger
          if (Math.random() < 0.0003) {
            f.pauseUntil = t + 1500 + Math.random() * 3000;
          }
        }

        // Organic wandering
        f.wanderAngle += (Math.random() - 0.5) * 0.08;
        f.x += Math.cos(f.wanderAngle) * f.wanderSpeed;
        f.y += Math.sin(f.wanderAngle) * f.wanderSpeed;

        // Wrap around
        if (f.x < -20) f.x = canvas.width + 20;
        if (f.x > canvas.width + 20) f.x = -20;
        if (f.y < -20) f.y = canvas.height + 20;
        if (f.y > canvas.height + 20) f.y = -20;

        // Draw glow halo
        const gradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 8);
        gradient.addColorStop(0, `hsla(${f.hue}, 100%, 65%, ${f.opacity * 0.4})`);
        gradient.addColorStop(0.3, `hsla(${f.hue}, 90%, 55%, ${f.opacity * 0.15})`);
        gradient.addColorStop(1, `hsla(${f.hue}, 80%, 50%, 0)`);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * 8, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw core
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${f.hue}, 100%, 75%, ${f.opacity})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [pattern]);

  if (pattern === "none") return null;

  if (pattern === "fireflies") {
    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" style={{ opacity: 0.7 }} />;
  }

  if (pattern === "starry") {
    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" style={{ opacity: 0.6 }} />;
  }

  if (pattern === "grid") {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />
    );
  }

  if (pattern === "dots") {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.06]"
        style={{
          backgroundImage: `radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />
    );
  }

  if (pattern === "noise") {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
    );
  }

  if (pattern === "mesh") {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.08]"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, hsl(var(--primary) / 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, hsl(var(--glow-pink) / 0.12) 0%, transparent 50%),
            radial-gradient(ellipse at 60% 80%, hsl(var(--primary) / 0.1) 0%, transparent 50%)
          `,
        }}
      />
    );
  }

  return null;
}
