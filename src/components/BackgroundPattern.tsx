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

  // Forest silhouette animation
  useEffect(() => {
    if (pattern !== "forest") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Tree layers: back to front with increasing opacity/size
    interface TreeLayer {
      y: number; // baseline Y ratio (0-1)
      opacity: number;
      color: string;
      trees: { x: number; width: number; height: number; trunkH: number; layers: number }[];
      sway: number; // sway amount
      speed: number; // sway speed
    }

    const generateTrees = (count: number, minW: number, maxW: number, minH: number, maxH: number) => {
      const trees = [];
      for (let i = 0; i < count; i++) {
        const width = Math.random() * (maxW - minW) + minW;
        trees.push({
          x: (i / count) * 1.1 - 0.05 + (Math.random() - 0.5) * (0.8 / count),
          width,
          height: Math.random() * (maxH - minH) + minH,
          trunkH: Math.random() * 8 + 4,
          layers: Math.floor(Math.random() * 3) + 3,
        });
      }
      return trees;
    };

    const layers: TreeLayer[] = [
      { y: 0.92, opacity: 0.04, color: "120, 60%, 20%", trees: generateTrees(18, 30, 60, 80, 160), sway: 0.3, speed: 0.0004 },
      { y: 0.94, opacity: 0.07, color: "130, 50%, 18%", trees: generateTrees(14, 35, 70, 90, 180), sway: 0.5, speed: 0.0006 },
      { y: 0.96, opacity: 0.12, color: "140, 45%, 14%", trees: generateTrees(10, 40, 80, 100, 200), sway: 0.8, speed: 0.0008 },
      { y: 0.98, opacity: 0.18, color: "145, 40%, 10%", trees: generateTrees(8, 50, 90, 110, 220), sway: 1.2, speed: 0.001 },
    ];

    const drawTree = (
      x: number, baseY: number, width: number, height: number,
      layerCount: number, trunkH: number, color: string, alpha: number, swayX: number
    ) => {
      // Trunk
      ctx.fillStyle = `hsla(30, 30%, 15%, ${alpha * 0.8})`;
      ctx.fillRect(x - 3 + swayX * 0.3, baseY - trunkH, 6, trunkH);

      // Layered triangular canopy
      for (let i = 0; i < layerCount; i++) {
        const ratio = i / layerCount;
        const layerW = width * (1 - ratio * 0.5);
        const layerH = height / layerCount * 1.3;
        const layerY = baseY - trunkH - (height * ratio * 0.7);
        const tipY = layerY - layerH;
        const sx = swayX * (1 + ratio * 0.5); // more sway at top

        ctx.beginPath();
        ctx.moveTo(x + sx, tipY);
        ctx.lineTo(x - layerW / 2 + sx * 0.5, layerY);
        ctx.lineTo(x + layerW / 2 + sx * 0.5, layerY);
        ctx.closePath();
        ctx.fillStyle = `hsla(${color}, ${alpha})`;
        ctx.fill();
      }
    };

    const animate = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Subtle fog gradient at bottom
      const fogGrad = ctx.createLinearGradient(0, canvas.height * 0.7, 0, canvas.height);
      fogGrad.addColorStop(0, "hsla(140, 30%, 15%, 0)");
      fogGrad.addColorStop(1, "hsla(140, 30%, 15%, 0.06)");
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, canvas.height * 0.7, canvas.width, canvas.height * 0.3);

      for (const layer of layers) {
        const baseY = canvas.height * layer.y;
        const swayOffset = Math.sin(t * layer.speed) * layer.sway;

        for (const tree of layer.trees) {
          const tx = tree.x * canvas.width;
          const individualSway = swayOffset + Math.sin(t * layer.speed * 1.3 + tree.x * 10) * layer.sway * 0.4;
          drawTree(tx, baseY, tree.width, tree.height, tree.layers, tree.trunkH, layer.color, layer.opacity, individualSway);
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

  // Snowfall animation
  useEffect(() => {
    if (pattern !== "snow") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    interface Snowflake {
      x: number; y: number; r: number;
      speed: number; wobbleSpeed: number; wobblePhase: number;
      opacity: number;
    }

    const flakes: Snowflake[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const count = Math.floor((canvas.width * canvas.height) / 12000) + 40;
    for (let i = 0; i < count; i++) {
      flakes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2.5 + 0.8,
        speed: Math.random() * 0.6 + 0.2,
        wobbleSpeed: Math.random() * 0.002 + 0.001,
        wobblePhase: Math.random() * Math.PI * 2,
        opacity: Math.random() * 0.4 + 0.3,
      });
    }

    const animate = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const f of flakes) {
        const wobble = Math.sin(t * f.wobbleSpeed + f.wobblePhase) * 0.6;
        f.y += f.speed;
        f.x += wobble;

        if (f.y > canvas.height + 10) {
          f.y = -10;
          f.x = Math.random() * canvas.width;
        }
        if (f.x < -10) f.x = canvas.width + 10;
        if (f.x > canvas.width + 10) f.x = -10;

        // Soft glow for larger flakes
        if (f.r > 2) {
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200, 220, 255, ${f.opacity * 0.08})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 235, 255, ${f.opacity})`;
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

  // Falling Leaves animation
  useEffect(() => {
    if (pattern !== "leaves") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    interface Leaf {
      x: number; y: number; size: number;
      speed: number; rotSpeed: number; rot: number;
      wobblePhase: number; wobbleAmp: number;
      hue: number; sat: number; light: number; opacity: number;
      shape: number; // 0-2 for variety
    }

    const leaves: Leaf[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const count = Math.floor((canvas.width * canvas.height) / 20000) + 25;
    for (let i = 0; i < count; i++) {
      // Autumn palette: reds, oranges, yellows, browns
      const palette = [
        { hue: 15, sat: 70, light: 45 },   // burnt orange
        { hue: 30, sat: 80, light: 50 },   // orange
        { hue: 45, sat: 75, light: 48 },   // gold
        { hue: 8, sat: 65, light: 40 },    // rust
        { hue: 25, sat: 55, light: 35 },   // brown
        { hue: 55, sat: 60, light: 42 },   // olive gold
      ];
      const col = palette[Math.floor(Math.random() * palette.length)];
      leaves.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height * 0.1,
        size: Math.random() * 8 + 4,
        speed: Math.random() * 0.5 + 0.2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        rot: Math.random() * Math.PI * 2,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleAmp: Math.random() * 1.2 + 0.4,
        hue: col.hue + (Math.random() - 0.5) * 10,
        sat: col.sat,
        light: col.light,
        opacity: Math.random() * 0.35 + 0.15,
        shape: Math.floor(Math.random() * 3),
      });
    }

    const drawLeaf = (l: Leaf) => {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.globalAlpha = l.opacity;
      ctx.fillStyle = `hsl(${l.hue}, ${l.sat}%, ${l.light}%)`;

      const s = l.size;
      ctx.beginPath();
      if (l.shape === 0) {
        // Oval leaf
        ctx.ellipse(0, 0, s * 0.5, s, 0, 0, Math.PI * 2);
      } else if (l.shape === 1) {
        // Pointed leaf
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(s * 0.6, -s * 0.3, s * 0.3, s * 0.5);
        ctx.quadraticCurveTo(0, s * 0.8, -s * 0.3, s * 0.5);
        ctx.quadraticCurveTo(-s * 0.6, -s * 0.3, 0, -s);
      } else {
        // Maple-ish (simple 3-lobed)
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.4, -s * 0.3);
        ctx.lineTo(s * 0.8, -s * 0.5);
        ctx.lineTo(s * 0.5, 0);
        ctx.lineTo(s * 0.3, s * 0.6);
        ctx.lineTo(0, s * 0.3);
        ctx.lineTo(-s * 0.3, s * 0.6);
        ctx.lineTo(-s * 0.5, 0);
        ctx.lineTo(-s * 0.8, -s * 0.5);
        ctx.lineTo(-s * 0.4, -s * 0.3);
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    };

    const animate = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const l of leaves) {
        const wobble = Math.sin(t * 0.001 + l.wobblePhase) * l.wobbleAmp;
        l.y += l.speed;
        l.x += wobble * 0.3;
        l.rot += l.rotSpeed;

        if (l.y > canvas.height + 20) {
          l.y = -20;
          l.x = Math.random() * canvas.width;
        }
        if (l.x < -20) l.x = canvas.width + 20;
        if (l.x > canvas.width + 20) l.x = -20;

        drawLeaf(l);
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

  if (pattern === "leaves") {
    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" style={{ opacity: 0.5 }} />;
  }

  if (pattern === "snow") {
    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" style={{ opacity: 0.6 }} />;
  }

  if (pattern === "forest") {
    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
  }

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
