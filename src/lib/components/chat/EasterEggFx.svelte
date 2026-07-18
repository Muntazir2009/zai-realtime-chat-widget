<script lang="ts">
  import confetti from 'canvas-confetti';

  type EffectType =
    | 'heart'
    | 'kiss'
    | 'laugh'
    | 'fire'
    | 'celebration'
    | 'sparkle'
    | 'thumbsup'
    | 'applause'
    | 'tears'
    | 'hearteyes'
    | 'hundred';

  interface Props {
    trigger: number;
    effectType?: EffectType;
  }

  let { trigger, effectType = 'heart' }: Props = $props();

  interface Particle {
    id: number;
    x: number;
    y: number;
    size: number;
    color: string;
    delay: number;
    duration: number;
    rotation: number;
    swayAmp: number;
    swayFreq: number;
    type: 'heart' | 'sparkle' | 'glow' | 'mini-heart' | 'trail' | 'droplet' | 'flame' | 'burst' | 'hundred-text';
    opacity: number;
    text?: string;
  }

  let particles = $state<Particle[]>([]);
  let nextId = 0;

  /* ─── Color Palettes ─── */
  const palettes = {
    heart:     ['#ef4444', '#f87171', '#fb923c', '#ec4899', '#f472b6', '#f43f5e', '#e11d48', '#be123c', '#ff6b9d', '#c084fc'],
    kiss:      ['#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#ef4444', '#e11d48', '#be185d', '#db2777'],
    laugh:     ['#facc15', '#fde047', '#fef08a', '#f59e0b', '#fbbf24', '#eab308', '#fff7ed', '#fef3c7'],
    fire:      ['#ef4444', '#f97316', '#fb923c', '#fbbf24', '#dc2626', '#ea580c', '#f59e0b', '#b91c1c'],
    celebration: ['#8b5cf6', '#6366f1', '#3b82f6', '#ec4899', '#f43f5e', '#f97316', '#facc15', '#10b981'],
    sparkle:   ['#fbbf24', '#f59e0b', '#fde68a', '#fef3c7', '#ffffff', '#e2e8f0'],
    thumbsup:  ['#22c55e', '#4ade80', '#86efac', '#16a34a', '#15803d', '#bbf7d0'],
    applause:  ['#f59e0b', '#fbbf24', '#fde68a', '#d97706', '#b45309', '#fef3c7', '#ffffff', '#e2e8f0'],
    tears:     ['#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1d4ed8', '#bfdbfe', '#dbeafe'],
    hearteyes: ['#ec4899', '#f472b6', '#fda4af', '#ef4444', '#f43f5e', '#fb7185', '#f87171', '#fca5a5'],
    hundred:   ['#8b5cf6', '#a78bfa', '#c4b5fd', '#6366f1', '#4f46e5', '#ddd6fe', '#fbbf24', '#f59e0b'],
  } as const;

  /* ─── Particle Factory Functions ─── */

  function createHeart(x: number, y: number, type: 'heart' | 'mini-heart' | 'trail' = 'heart', palette: readonly string[] = palettes.heart): Particle {
    const colors = palette as unknown as string[];
    return {
      id: nextId++, x, y,
      size: type === 'heart' ? 16 + Math.random() * 24
          : type === 'mini-heart' ? 8 + Math.random() * 12
          : 6 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 350,
      duration: type === 'heart' ? 1400 + Math.random() * 900
               : type === 'mini-heart' ? 1000 + Math.random() * 700
               : 800 + Math.random() * 500,
      rotation: -40 + Math.random() * 80,
      swayAmp: 15 + Math.random() * 35,
      swayFreq: 1.5 + Math.random() * 2.5,
      type,
      opacity: type === 'trail' ? 0.4 + Math.random() * 0.3 : 1,
    };
  }

  function createSparkle(x: number, y: number, palette: readonly string[] = palettes.sparkle): Particle {
    const colors = palette as unknown as string[];
    return {
      id: nextId++, x, y,
      size: 4 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 600,
      duration: 600 + Math.random() * 600,
      rotation: Math.random() * 360,
      swayAmp: 5 + Math.random() * 15,
      swayFreq: 2 + Math.random() * 3,
      type: 'sparkle',
      opacity: 1,
    };
  }

  function createGlow(x: number, y: number, palette: readonly string[] = palettes.heart): Particle {
    const colors = palette as unknown as string[];
    return {
      id: nextId++, x, y,
      size: 40 + Math.random() * 60,
      color: colors[Math.floor(Math.random() * Math.min(4, colors.length))],
      delay: Math.random() * 200,
      duration: 1000 + Math.random() * 600,
      rotation: 0,
      swayAmp: 0,
      swayFreq: 0,
      type: 'glow',
      opacity: 0.5,
    };
  }

  function createDroplet(x: number, y: number): Particle {
    const colors = palettes.tears as unknown as string[];
    return {
      id: nextId++, x, y: 5 + Math.random() * 15,
      size: 4 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 500,
      duration: 1200 + Math.random() * 800,
      rotation: Math.random() * 20 - 10,
      swayAmp: 3 + Math.random() * 8,
      swayFreq: 1 + Math.random() * 2,
      type: 'droplet',
      opacity: 0.6 + Math.random() * 0.4,
    };
  }

  function createFlame(x: number, y: number): Particle {
    const colors = palettes.fire as unknown as string[];
    return {
      id: nextId++, x, y: 50 + Math.random() * 30,
      size: 8 + Math.random() * 16,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 400,
      duration: 900 + Math.random() * 700,
      rotation: -15 + Math.random() * 30,
      swayAmp: 5 + Math.random() * 10,
      swayFreq: 3 + Math.random() * 3,
      type: 'flame',
      opacity: 0.8 + Math.random() * 0.2,
    };
  }

  function createBurst(x: number, y: number, palette: readonly string[]): Particle {
    const colors = palette as unknown as string[];
    return {
      id: nextId++, x: 30 + Math.random() * 40, y: 30 + Math.random() * 40,
      size: 3 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 200,
      duration: 500 + Math.random() * 400,
      rotation: Math.random() * 360,
      swayAmp: 20 + Math.random() * 40,
      swayFreq: 2 + Math.random() * 2,
      type: 'burst',
      opacity: 1,
    };
  }

  function createHundredText(x: number, y: number): Particle {
    return {
      id: nextId++, x, y: 50 + Math.random() * 30,
      size: 18 + Math.random() * 14,
      color: (palettes.hundred as unknown as string[])[Math.floor(Math.random() * (palettes.hundred as unknown as string[]).length)],
      delay: Math.random() * 600,
      duration: 1500 + Math.random() * 800,
      rotation: -10 + Math.random() * 20,
      swayAmp: 10 + Math.random() * 20,
      swayFreq: 1 + Math.random() * 2,
      type: 'hundred-text',
      opacity: 0.9 + Math.random() * 0.1,
      text: '💯',
    };
  }

  /* ─── Canvas-Confetti Presets ─── */

  // Check for reduced-motion preference
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fireConfetti(type: EffectType) {
    if (prefersReducedMotion) return; // Respect accessibility

    switch (type) {
      case 'heart':
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.7 },
          colors: ['#ef4444', '#f87171', '#ec4899', '#f43f5e', '#e11d48', '#ff6b9d'],
          shapes: ['circle'],
          gravity: 0.8,
          scalar: 1.3,
          ticks: 120,
          startVelocity: 30,
        });
        // Second heart burst slightly delayed for richness
        setTimeout(() => confetti({
          particleCount: 30,
          spread: 55,
          origin: { y: 0.65, x: 0.5 },
          colors: ['#f472b6', '#fb923c', '#fca5a5', '#fda4af'],
          shapes: ['circle'],
          gravity: 0.9,
          scalar: 0.8,
          ticks: 90,
          startVelocity: 25,
        }), 150);
        break;

      case 'kiss':
        // Kiss: hearts + pink burst
        confetti({
          particleCount: 35,
          spread: 60,
          origin: { y: 0.65, x: 0.5 },
          colors: ['#ec4899', '#f472b6', '#f9a8d4', '#ef4444', '#be185d'],
          shapes: ['circle'],
          gravity: 0.7,
          scalar: 1.3,
          ticks: 130,
          startVelocity: 30,
        });
        setTimeout(() => confetti({
          particleCount: 20,
          spread: 50,
          origin: { y: 0.7 },
          colors: ['#ef4444', '#f87171', '#ec4899', '#ff6b9d'],
          shapes: ['circle'],
          gravity: 0.9,
          scalar: 1.0,
          ticks: 100,
          startVelocity: 25,
        }), 100);
        break;

      case 'laugh':
        confetti({
          particleCount: 80,
          spread: 100,
          origin: { y: 0.6 },
          colors: ['#facc15', '#fde047', '#fef08a', '#f59e0b', '#fff7ed'],
          shapes: ['circle'],
          gravity: 1.0,
          scalar: 0.9,
          ticks: 100,
          startVelocity: 40,
        });
        // Star burst from left
        confetti({
          particleCount: 30,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.65 },
          colors: ['#facc15', '#fde047', '#fff'],
          shapes: ['circle'],
          gravity: 0.8,
          scalar: 1.0,
          ticks: 90,
          startVelocity: 45,
        });
        break;

      case 'fire': {
        // Upward fire burst
        const duration = 1200;
        const end = Date.now() + duration;
        const frame = () => {
          confetti({
            particleCount: 4,
            angle: 270,
            spread: 40,
            startVelocity: 25 + Math.random() * 20,
            origin: { x: 0.3 + Math.random() * 0.4, y: 0.85 },
            colors: ['#ef4444', '#f97316', '#fb923c', '#fbbf24', '#dc2626'],
            shapes: ['circle'],
            gravity: -0.3,
            scalar: 1.0 + Math.random() * 0.5,
            ticks: 60,
            drift: (Math.random() - 0.5) * 2,
          });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
        break;
      }

      case 'celebration':
        // Left cannon
        confetti({
          particleCount: 70,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.65 },
          colors: ['#8b5cf6', '#6366f1', '#ec4899', '#f43f5e', '#f97316', '#facc15'],
          gravity: 0.9,
          scalar: 1.0,
          ticks: 150,
          startVelocity: 55,
        });
        // Right cannon (staggered)
        setTimeout(() => {
          confetti({
            particleCount: 70,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.65 },
            colors: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'],
            gravity: 0.9,
            scalar: 1.0,
            ticks: 150,
            startVelocity: 55,
          });
        }, 200);
        break;

      case 'sparkle':
        // Central sparkle burst
        confetti({
          particleCount: 50,
          spread: 90,
          origin: { y: 0.6 },
          colors: ['#fbbf24', '#fde68a', '#ffffff', '#fef3c7', '#e2e8f0'],
          shapes: ['circle'],
          gravity: 0.6,
          scalar: 0.8,
          ticks: 100,
          startVelocity: 30,
        });
        break;

      case 'thumbsup':
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#22c55e', '#4ade80', '#86efac', '#16a34a', '#bbf7d0'],
          shapes: ['circle'],
          gravity: 1.2,
          scalar: 0.7,
          ticks: 80,
          startVelocity: 25,
        });
        break;

      case 'applause':
        // Multi-directional gold
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 75,
          origin: { x: 0.1, y: 0.6 },
          colors: ['#f59e0b', '#fbbf24', '#fde68a', '#d97706', '#ffffff'],
          gravity: 0.7,
          scalar: 1.1,
          ticks: 120,
          startVelocity: 40,
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 75,
          origin: { x: 0.9, y: 0.6 },
          colors: ['#f59e0b', '#fbbf24', '#fde68a', '#b45309', '#fef3c7'],
          gravity: 0.7,
          scalar: 1.1,
          ticks: 120,
          startVelocity: 40,
        });
        confetti({
          particleCount: 30,
          spread: 80,
          origin: { y: 0.5 },
          colors: ['#fbbf24', '#ffffff', '#fef3c7'],
          shapes: ['circle'],
          gravity: 0.5,
          scalar: 0.8,
          ticks: 100,
          startVelocity: 30,
        });
        break;

      case 'tears':
        // Rain from top
        confetti({
          particleCount: 80,
          angle: 270,
          spread: 120,
          origin: { y: -0.1 },
          colors: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'],
          shapes: ['circle'],
          gravity: 1.5,
          scalar: 0.6,
          ticks: 150,
          startVelocity: 10,
          drift: 0,
        });
        break;

      case 'hearteyes':
        // Pink/red heart shower from both sides
        confetti({
          particleCount: 60,
          angle: 60,
          spread: 50,
          origin: { x: 0, y: 0.5 },
          colors: ['#ec4899', '#f472b6', '#fda4af', '#ef4444', '#f43f5e'],
          shapes: ['circle'],
          gravity: 0.8,
          scalar: 1.2,
          ticks: 140,
          startVelocity: 45,
        });
        confetti({
          particleCount: 60,
          angle: 120,
          spread: 50,
          origin: { x: 1, y: 0.5 },
          colors: ['#ec4899', '#fb7185', '#f87171', '#fca5a5', '#be123c'],
          shapes: ['circle'],
          gravity: 0.8,
          scalar: 1.2,
          ticks: 140,
          startVelocity: 45,
        });
        break;

      case 'hundred':
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.65 },
          colors: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#6366f1', '#fbbf24'],
          shapes: ['circle'],
          gravity: 0.6,
          scalar: 1.0,
          ticks: 130,
          startVelocity: 35,
        });
        // Second wave slightly delayed
        setTimeout(() => {
          confetti({
            particleCount: 30,
            spread: 50,
            origin: { y: 0.5 },
            colors: ['#fbbf24', '#f59e0b', '#fde68a', '#8b5cf6', '#a78bfa'],
            shapes: ['circle'],
            gravity: 0.5,
            scalar: 0.9,
            ticks: 120,
            startVelocity: 30,
          });
        }, 300);
        break;
    }

    // Reset canvas-confetti after all animations complete
    setTimeout(() => {
      confetti.reset();
    }, 3000);
  }

  /* ─── SVG Particle Generators per Effect ─── */

  function generateSVGParticles(type: EffectType): Particle[] {
    const p: Particle[] = [];

    switch (type) {
      case 'heart':
      case 'kiss': {
        const pal = type === 'kiss' ? palettes.kiss : palettes.heart;
        for (let i = 0; i < 18; i++) p.push(createHeart(10 + Math.random() * 80, 45 + Math.random() * 35, 'heart', pal));
        for (let i = 0; i < 5; i++) p.push(createGlow(15 + Math.random() * 70, 50 + Math.random() * 30, pal));
        for (let i = 0; i < 14; i++) p.push(createSparkle(5 + Math.random() * 90, 30 + Math.random() * 50, pal));
        return p;
      }

      case 'laugh':
        for (let i = 0; i < 20; i++) p.push(createSparkle(5 + Math.random() * 90, 30 + Math.random() * 50, palettes.laugh));
        for (let i = 0; i < 8; i++) p.push(createBurst(0, 0, palettes.laugh));
        for (let i = 0; i < 4; i++) p.push(createGlow(20 + Math.random() * 60, 40 + Math.random() * 30, palettes.laugh));
        return p;

      case 'fire':
        for (let i = 0; i < 22; i++) p.push(createFlame(10 + Math.random() * 80, 0));
        for (let i = 0; i < 8; i++) p.push(createSparkle(10 + Math.random() * 80, 60 + Math.random() * 25, palettes.fire));
        for (let i = 0; i < 5; i++) p.push(createGlow(20 + Math.random() * 60, 55 + Math.random() * 25, palettes.fire));
        return p;

      case 'celebration':
        for (let i = 0; i < 15; i++) p.push(createSparkle(5 + Math.random() * 90, 20 + Math.random() * 60, palettes.celebration));
        for (let i = 0; i < 10; i++) p.push(createBurst(0, 0, palettes.celebration));
        for (let i = 0; i < 4; i++) p.push(createGlow(25 + Math.random() * 50, 40 + Math.random() * 30, palettes.celebration));
        return p;

      case 'sparkle':
        for (let i = 0; i < 30; i++) p.push(createSparkle(5 + Math.random() * 90, 20 + Math.random() * 60, palettes.sparkle));
        for (let i = 0; i < 6; i++) p.push(createGlow(15 + Math.random() * 70, 35 + Math.random() * 30, palettes.sparkle));
        return p;

      case 'thumbsup':
        for (let i = 0; i < 12; i++) p.push(createBurst(0, 0, palettes.thumbsup));
        for (let i = 0; i < 10; i++) p.push(createSparkle(10 + Math.random() * 80, 40 + Math.random() * 40, palettes.thumbsup));
        for (let i = 0; i < 3; i++) p.push(createGlow(30 + Math.random() * 40, 45 + Math.random() * 25, palettes.thumbsup));
        return p;

      case 'applause':
        for (let i = 0; i < 18; i++) p.push(createSparkle(5 + Math.random() * 90, 25 + Math.random() * 50, palettes.applause));
        for (let i = 0; i < 12; i++) p.push(createBurst(0, 0, palettes.applause));
        for (let i = 0; i < 5; i++) p.push(createGlow(20 + Math.random() * 60, 40 + Math.random() * 30, palettes.applause));
        return p;

      case 'tears':
        for (let i = 0; i < 25; i++) p.push(createDroplet(5 + Math.random() * 90, 0));
        for (let i = 0; i < 6; i++) p.push(createGlow(15 + Math.random() * 70, 10 + Math.random() * 30, palettes.tears));
        return p;

      case 'hearteyes':
        for (let i = 0; i < 22; i++) p.push(createHeart(8 + Math.random() * 84, 45 + Math.random() * 35, 'heart', palettes.hearteyes));
        for (let i = 0; i < 8; i++) p.push(createHeart(10 + Math.random() * 80, 55 + Math.random() * 25, 'mini-heart', palettes.hearteyes));
        for (let i = 0; i < 12; i++) p.push(createSparkle(5 + Math.random() * 90, 30 + Math.random() * 50, palettes.hearteyes));
        for (let i = 0; i < 6; i++) p.push(createGlow(20 + Math.random() * 60, 50 + Math.random() * 30, palettes.hearteyes));
        return p;

      case 'hundred':
        for (let i = 0; i < 10; i++) p.push(createHundredText(10 + Math.random() * 80, 50 + Math.random() * 30));
        for (let i = 0; i < 12; i++) p.push(createSparkle(5 + Math.random() * 90, 30 + Math.random() * 50, palettes.hundred));
        for (let i = 0; i < 6; i++) p.push(createGlow(20 + Math.random() * 60, 45 + Math.random() * 30, palettes.hundred));
        return p;
    }
  }

  /* ─── Main Effect Trigger ─── */

  $effect(() => {
    if (trigger <= 0) return;

    const type: EffectType = effectType;

    // Wave 1: Fire canvas-confetti immediately
    fireConfetti(type);

    // Wave 1: SVG particles
    const wave1 = generateSVGParticles(type);
    particles = wave1;

    // Wave 2: Staggered second wave
    setTimeout(() => {
      const wave2: Particle[] = [];
      switch (type) {
        case 'heart':
        case 'kiss': {
          const pal = type === 'kiss' ? palettes.kiss : palettes.heart;
          for (let i = 0; i < 10; i++) wave2.push(createHeart(8 + Math.random() * 84, 50 + Math.random() * 30, 'heart', pal));
          for (let i = 0; i < 12; i++) wave2.push(createHeart(5 + Math.random() * 90, 40 + Math.random() * 45, 'mini-heart', pal));
          for (let i = 0; i < 8; i++) wave2.push(createHeart(10 + Math.random() * 80, 55 + Math.random() * 25, 'trail', pal));
          for (let i = 0; i < 8; i++) wave2.push(createSparkle(5 + Math.random() * 90, 25 + Math.random() * 55, pal));
          break;
        }
        case 'laugh':
          for (let i = 0; i < 12; i++) wave2.push(createSparkle(10 + Math.random() * 80, 25 + Math.random() * 55, palettes.laugh));
          for (let i = 0; i < 8; i++) wave2.push(createBurst(0, 0, palettes.laugh));
          break;
        case 'fire':
          for (let i = 0; i < 14; i++) wave2.push(createFlame(10 + Math.random() * 80, 0));
          for (let i = 0; i < 6; i++) wave2.push(createSparkle(10 + Math.random() * 80, 55 + Math.random() * 30, palettes.fire));
          break;
        case 'celebration':
          for (let i = 0; i < 10; i++) wave2.push(createSparkle(5 + Math.random() * 90, 20 + Math.random() * 60, palettes.celebration));
          for (let i = 0; i < 8; i++) wave2.push(createBurst(0, 0, palettes.celebration));
          break;
        case 'sparkle':
          for (let i = 0; i < 15; i++) wave2.push(createSparkle(10 + Math.random() * 80, 20 + Math.random() * 60, palettes.sparkle));
          break;
        case 'thumbsup':
          for (let i = 0; i < 8; i++) wave2.push(createBurst(0, 0, palettes.thumbsup));
          for (let i = 0; i < 6; i++) wave2.push(createSparkle(10 + Math.random() * 80, 40 + Math.random() * 40, palettes.thumbsup));
          break;
        case 'applause':
          for (let i = 0; i < 10; i++) wave2.push(createSparkle(5 + Math.random() * 90, 25 + Math.random() * 50, palettes.applause));
          for (let i = 0; i < 8; i++) wave2.push(createBurst(0, 0, palettes.applause));
          break;
        case 'tears':
          for (let i = 0; i < 18; i++) wave2.push(createDroplet(5 + Math.random() * 90, 0));
          break;
        case 'hearteyes':
          for (let i = 0; i < 12; i++) wave2.push(createHeart(8 + Math.random() * 84, 50 + Math.random() * 30, 'heart', palettes.hearteyes));
          for (let i = 0; i < 10; i++) wave2.push(createHeart(5 + Math.random() * 90, 40 + Math.random() * 45, 'mini-heart', palettes.hearteyes));
          for (let i = 0; i < 8; i++) wave2.push(createSparkle(5 + Math.random() * 90, 25 + Math.random() * 55, palettes.hearteyes));
          break;
        case 'hundred':
          for (let i = 0; i < 6; i++) wave2.push(createHundredText(15 + Math.random() * 70, 50 + Math.random() * 30));
          for (let i = 0; i < 8; i++) wave2.push(createSparkle(10 + Math.random() * 80, 30 + Math.random() * 50, palettes.hundred));
          break;
      }
      particles = [...particles, ...wave2];
    }, 250);

    // Wave 3: Final burst
    setTimeout(() => {
      const wave3: Particle[] = [];
      switch (type) {
        case 'heart':
        case 'kiss': {
          const pal = type === 'kiss' ? palettes.kiss : palettes.heart;
          for (let i = 0; i < 8; i++) wave3.push(createSparkle(10 + Math.random() * 80, 20 + Math.random() * 60, pal));
          for (let i = 0; i < 4; i++) wave3.push(createHeart(20 + Math.random() * 60, 55 + Math.random() * 20, 'mini-heart', pal));
          break;
        }
        case 'laugh':
          for (let i = 0; i < 6; i++) wave3.push(createSparkle(15 + Math.random() * 70, 25 + Math.random() * 50, palettes.laugh));
          break;
        case 'fire':
          for (let i = 0; i < 8; i++) wave3.push(createFlame(15 + Math.random() * 70, 0));
          break;
        case 'sparkle':
          for (let i = 0; i < 10; i++) wave3.push(createSparkle(10 + Math.random() * 80, 20 + Math.random() * 60, palettes.sparkle));
          break;
        case 'celebration':
          for (let i = 0; i < 8; i++) wave3.push(createSparkle(10 + Math.random() * 80, 20 + Math.random() * 60, palettes.celebration));
          break;
        case 'hundred':
          for (let i = 0; i < 4; i++) wave3.push(createHundredText(20 + Math.random() * 60, 55 + Math.random() * 20));
          for (let i = 0; i < 5; i++) wave3.push(createSparkle(15 + Math.random() * 70, 30 + Math.random() * 50, palettes.hundred));
          break;
      }
      particles = [...particles, ...wave3];
    }, 600);

    // Cleanup all particles after animation completes
    setTimeout(() => {
      particles = [];
    }, 3200);
  });
</script>

{#if particles.length > 0}
  <div class="fx-container" aria-hidden="true">
    {#each particles as p (p.id)}
      {#if p.type === 'glow'}
        <div
          class="glow-orb"
          style="
            left: {p.x}%;
            bottom: {100 - p.y}%;
            width: {p.size}px;
            height: {p.size}px;
            --glow-color: {p.color};
            --glow-delay: {p.delay}ms;
            --glow-duration: {p.duration}ms;
          "
        ></div>
      {:else if p.type === 'sparkle'}
        <div
          class="sparkle-particle"
          style="
            left: {p.x}%;
            bottom: {100 - p.y}%;
            --sp-size: {p.size}px;
            --sp-color: {p.color};
            --sp-delay: {p.delay}ms;
            --sp-duration: {p.duration}ms;
            --sp-rotation: {p.rotation}deg;
            --sp-sway-amp: {p.swayAmp}px;
            --sp-sway-freq: {p.swayFreq};
          "
        >
          <svg viewBox="0 0 24 24" width="100%" height="100%">
            <path
              d="M12 0 L14 9 L24 12 L14 15 L12 24 L10 15 L0 12 L10 9 Z"
              fill="var(--sp-color)"
            />
          </svg>
        </div>
      {:else if p.type === 'droplet'}
        <div
          class="droplet-particle"
          style="
            left: {p.x}%;
            top: {p.y}%;
            --drop-size: {p.size}px;
            --drop-color: {p.color};
            --drop-delay: {p.delay}ms;
            --drop-duration: {p.duration}ms;
            --drop-sway-amp: {p.swayAmp}px;
            --drop-sway-freq: {p.swayFreq};
            --drop-opacity: {p.opacity};
          "
        >
          <svg viewBox="0 0 16 24" width="100%" height="100%">
            <path
              d="M8 0 C8 0 0 12 0 16 C0 20.4 3.6 24 8 24 C12.4 24 16 20.4 16 16 C16 12 8 0 8 0Z"
              fill="var(--drop-color)"
            />
          </svg>
        </div>
      {:else if p.type === 'flame'}
        <div
          class="flame-particle"
          style="
            left: {p.x}%;
            bottom: {100 - p.y}%;
            --fl-size: {p.size}px;
            --fl-color: {p.color};
            --fl-delay: {p.delay}ms;
            --fl-duration: {p.duration}ms;
            --fl-sway-amp: {p.swayAmp}px;
            --fl-sway-freq: {p.swayFreq};
            --fl-opacity: {p.opacity};
          "
        >
          <svg viewBox="0 0 24 32" width="100%" height="100%">
            <path
              d="M12 0 C12 0 2 14 2 22 C2 27.5 6.5 32 12 32 C17.5 32 22 27.5 22 22 C22 14 12 0 12 0Z"
              fill="var(--fl-color)"
            />
          </svg>
        </div>
      {:else if p.type === 'burst'}
        <div
          class="burst-particle"
          style="
            left: {p.x}%;
            bottom: {100 - p.y}%;
            --burst-size: {p.size}px;
            --burst-color: {p.color};
            --burst-delay: {p.delay}ms;
            --burst-duration: {p.duration}ms;
            --burst-rotation: {p.rotation}deg;
            --burst-sway-amp: {p.swayAmp}px;
          "
        >
          <svg viewBox="0 0 24 24" width="100%" height="100%">
            <path
              d="M12 0 L14 9 L24 12 L14 15 L12 24 L10 15 L0 12 L10 9 Z"
              fill="var(--burst-color)"
            />
          </svg>
        </div>
      {:else if p.type === 'hundred-text'}
        <div
          class="hundred-particle"
          style="
            left: {p.x}%;
            bottom: {100 - p.y}%;
            --ht-size: {p.size}px;
            --ht-delay: {p.delay}ms;
            --ht-duration: {p.duration}ms;
            --ht-sway-amp: {p.swayAmp}px;
            --ht-sway-freq: {p.swayFreq};
            --ht-opacity: {p.opacity};
          "
        >
          {p.text}
        </div>
      {:else}
        <!-- heart / mini-heart / trail -->
        <div
          class="heart-float heart-{p.type}"
          style="
            left: {p.x}%;
            bottom: {100 - p.y}%;
            --heart-size: {p.size}px;
            --heart-color: {p.color};
            --heart-delay: {p.delay}ms;
            --heart-duration: {p.duration}ms;
            --heart-rotation: {p.rotation}deg;
            --heart-sway-amp: {p.swayAmp}px;
            --heart-sway-freq: {p.swayFreq};
            --heart-opacity: {p.opacity};
          "
        >
          <svg viewBox="0 0 24 24" width="100%" height="100%">
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5
                 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09
                 C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5
                 c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill="var(--heart-color)"
            />
          </svg>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .fx-container {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 200;
    overflow: hidden;
  }

  /* ─── GLOW ORB ─── */
  .glow-orb {
    position: absolute;
    border-radius: 50%;
    opacity: 0;
    animation: glowPulse var(--glow-duration) var(--glow-delay) ease-out forwards;
    filter: blur(20px);
    z-index: 0;
    will-change: opacity, transform;
  }

  @keyframes glowPulse {
    0% {
      opacity: 0;
      transform: scale(0.3);
    }
    20% {
      opacity: 0.5;
      transform: scale(1);
    }
    60% {
      opacity: 0.25;
      transform: scale(1.4);
    }
    100% {
      opacity: 0;
      transform: scale(1.8) translateY(-60px);
    }
  }

  /* ─── SPARKLE PARTICLE ─── */
  .sparkle-particle {
    position: absolute;
    width: var(--sp-size);
    height: var(--sp-size);
    opacity: 0;
    animation: sparkleRise var(--sp-duration) var(--sp-delay) cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    filter: drop-shadow(0 0 3px var(--sp-color));
    z-index: 2;
    will-change: opacity, transform;
  }

  @keyframes sparkleRise {
    0% {
      opacity: 0;
      transform: rotate(var(--sp-rotation)) scale(0) translateY(0) translateX(0);
    }
    15% {
      opacity: 1;
      transform: rotate(var(--sp-rotation)) scale(1.2) translateY(-15px) translateX(calc(var(--sp-sway-amp) * 0.3));
    }
    40% {
      opacity: 0.9;
      transform: rotate(calc(var(--sp-rotation) + 90deg)) scale(1) translateY(-60px) translateX(var(--sp-sway-amp));
    }
    70% {
      opacity: 0.4;
      transform: rotate(calc(var(--sp-rotation) + 180deg)) scale(0.7) translateY(-140px) translateX(calc(var(--sp-sway-amp) * -0.5));
    }
    100% {
      opacity: 0;
      transform: rotate(calc(var(--sp-rotation) + 270deg)) scale(0) translateY(-240px) translateX(0);
    }
  }

  /* ─── HEART FLOAT (main + mini + trail) ─── */
  .heart-float {
    position: absolute;
    width: var(--heart-size);
    height: var(--heart-size);
    opacity: 0;
    animation: heartRise var(--heart-duration) var(--heart-delay) cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.15));
    transform: rotate(var(--heart-rotation));
    z-index: 1;
    will-change: opacity, transform;
  }

  .heart-mini-heart {
    filter: drop-shadow(0 1px 4px rgba(0, 0, 0, 0.1));
    z-index: 3;
  }

  .heart-trail {
    filter: drop-shadow(0 0 6px var(--heart-color));
    z-index: 1;
  }

  @keyframes heartRise {
    0% {
      opacity: 0;
      transform: rotate(var(--heart-rotation)) scale(0.2) translateY(0) translateX(0);
    }
    10% {
      opacity: var(--heart-opacity, 1);
      transform: rotate(var(--heart-rotation)) scale(1.15) translateY(-15px) translateX(calc(var(--heart-sway-amp) * 0.15));
    }
    25% {
      transform: rotate(var(--heart-rotation)) scale(1) translateY(-35px) translateX(var(--heart-sway-amp));
    }
    50% {
      opacity: calc(var(--heart-opacity, 1) * 0.8);
      transform: rotate(calc(var(--heart-rotation) + 8deg)) scale(0.95) translateY(-100px) translateX(calc(var(--heart-sway-amp) * -0.7));
    }
    75% {
      opacity: calc(var(--heart-opacity, 1) * 0.4);
      transform: rotate(calc(var(--heart-rotation) + 12deg)) scale(0.75) translateY(-180px) translateX(var(--heart-sway-amp));
    }
    100% {
      opacity: 0;
      transform: rotate(calc(var(--heart-rotation) + 15deg)) scale(0.5) translateY(-320px) translateX(calc(var(--heart-sway-amp) * -0.3));
    }
  }

  /* ─── DROPLET (tears) ─── */
  .droplet-particle {
    position: absolute;
    width: var(--drop-size);
    height: calc(var(--drop-size) * 1.5);
    opacity: 0;
    animation: dropletFall var(--drop-duration) var(--drop-delay) ease-in forwards;
    filter: drop-shadow(0 1px 4px rgba(59, 130, 246, 0.4));
    z-index: 1;
    will-change: opacity, transform;
  }

  @keyframes dropletFall {
    0% {
      opacity: 0;
      transform: translateY(0) translateX(0);
    }
    8% {
      opacity: var(--drop-opacity, 0.8);
      transform: translateY(30px) translateX(calc(var(--drop-sway-amp) * 0.2));
    }
    30% {
      opacity: var(--drop-opacity, 0.8);
      transform: translateY(120px) translateX(calc(var(--drop-sway-amp) * 0.6));
    }
    60% {
      opacity: calc(var(--drop-opacity, 0.8) * 0.6);
      transform: translateY(280px) translateX(calc(var(--drop-sway-amp) * -0.3));
    }
    85% {
      opacity: calc(var(--drop-opacity, 0.8) * 0.3);
      transform: translateY(420px) translateX(calc(var(--drop-sway-amp) * 0.4));
    }
    100% {
      opacity: 0;
      transform: translateY(520px) translateX(0);
    }
  }

  /* ─── FLAME ─── */
  .flame-particle {
    position: absolute;
    width: var(--fl-size);
    height: calc(var(--fl-size) * 1.3);
    opacity: 0;
    animation: flameRise var(--fl-duration) var(--fl-delay) ease-out forwards;
    filter: drop-shadow(0 0 6px var(--fl-color));
    z-index: 2;
    will-change: opacity, transform;
  }

  @keyframes flameRise {
    0% {
      opacity: 0;
      transform: translateY(0) translateX(0) scale(0.3);
    }
    15% {
      opacity: var(--fl-opacity, 0.9);
      transform: translateY(-40px) translateX(calc(var(--fl-sway-amp) * 0.3)) scale(1.1);
    }
    35% {
      opacity: calc(var(--fl-opacity, 0.9) * 0.8);
      transform: translateY(-120px) translateX(calc(var(--fl-sway-amp) * 0.7)) scale(0.9);
    }
    60% {
      opacity: calc(var(--fl-opacity, 0.9) * 0.4);
      transform: translateY(-220px) translateX(calc(var(--fl-sway-amp) * -0.4)) scale(0.6);
    }
    100% {
      opacity: 0;
      transform: translateY(-350px) translateX(calc(var(--fl-sway-amp) * -0.2)) scale(0.2);
    }
  }

  /* ─── BURST PARTICLE ─── */
  .burst-particle {
    position: absolute;
    width: var(--burst-size);
    height: var(--burst-size);
    opacity: 0;
    animation: burstOut var(--burst-duration) var(--burst-delay) ease-out forwards;
    z-index: 3;
    will-change: opacity, transform;
  }

  @keyframes burstOut {
    0% {
      opacity: 0;
      transform: rotate(var(--burst-rotation)) scale(0) translateY(0) translateX(0);
    }
    20% {
      opacity: 1;
      transform: rotate(calc(var(--burst-rotation) + 60deg)) scale(1.3) translateY(-20px) translateX(calc(var(--burst-sway-amp) * 0.5));
    }
    50% {
      opacity: 0.7;
      transform: rotate(calc(var(--burst-rotation) + 150deg)) scale(0.9) translateY(-80px) translateX(var(--burst-sway-amp));
    }
    100% {
      opacity: 0;
      transform: rotate(calc(var(--burst-rotation) + 360deg)) scale(0) translateY(-200px) translateX(calc(var(--burst-sway-amp) * -0.3));
    }
  }

  /* ─── HUNDRED TEXT ─── */
  .hundred-particle {
    position: absolute;
    font-size: var(--ht-size);
    line-height: 1;
    opacity: 0;
    animation: hundredFloat var(--ht-duration) var(--ht-delay) ease-out forwards;
    filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.5));
    z-index: 4;
    will-change: opacity, transform;
  }

  @keyframes hundredFloat {
    0% {
      opacity: 0;
      transform: translateY(0) translateX(0) scale(0.3);
    }
    15% {
      opacity: var(--ht-opacity, 1);
      transform: translateY(-30px) translateX(calc(var(--ht-sway-amp) * 0.2)) scale(1.1);
    }
    40% {
      opacity: calc(var(--ht-opacity, 1) * 0.85);
      transform: translateY(-100px) translateX(calc(var(--ht-sway-amp) * 0.6)) scale(1);
    }
    65% {
      opacity: calc(var(--ht-opacity, 1) * 0.5);
      transform: translateY(-200px) translateX(calc(var(--ht-sway-amp) * -0.3)) scale(0.9);
    }
    100% {
      opacity: 0;
      transform: translateY(-350px) translateX(calc(var(--ht-sway-amp) * 0.1)) scale(0.7);
    }
  }
</style>