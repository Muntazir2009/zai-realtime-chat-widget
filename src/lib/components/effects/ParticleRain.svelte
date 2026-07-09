<script lang="ts">
  interface Props {
    type: 'heart' | 'kiss';
    trigger: boolean;
  }

  let { type, trigger }: Props = $props();

  // ── Particle types ──
  interface FloatParticle {
    id: number;
    x: number;
    delay: number;
    duration: number;
    size: number;
    swayAmp: number;
    swayFreq: number;
    opacity: number;
    rotation: number;
    rotSpeed: number;
    variant: number; // which SVG shape
    color: string;
  }

  interface BurstParticle {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    delay: number;
    duration: number;
    rotation: number;
    rotSpeed: number;
    variant: number;
    color: string;
    gravity: number;
  }

  interface SparkleParticle {
    id: number;
    x: number;
    y: number;
    size: number;
    delay: number;
    duration: number;
    rotation: number;
  }

  let floaters = $state<FloatParticle[]>([]);
  let bursters = $state<BurstParticle[]>([]);
  let sparkles = $state<SparkleParticle[]>([]);
  let active = $state(false);
  let _id = 0;

  $effect(() => { if (trigger) spawn(); });

  // ── SVG heart path (crisp, scalable) ──
  const HEART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

  const HEART_OUTLINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

  const KISS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-1.41-1.41L6 14.17V17H4v-5h3v2h.17l2.59-2.59L11 13l3.59-3.59L17 11V9h-2.17l-2.59 2.59L11 9.17V7h2v3l-2 2 2 2v3h-1z"/></svg>`;

  // 4-point star sparkle SVG
  const SPARKLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l2.47 6.34L21 8.18l-5 4.32L17.18 21 12 17.27 6.82 21 8 12.5 3 8.18l6.53-1.84z"/></svg>`;

  // Diamond SVG
  const DIAMOND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12l10 10 10-10L12 2zm0 3.41L18.59 12 12 18.59 5.41 12 12 5.41z"/></svg>`;

  // Tiny circle dot
  const DOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>`;

  // Mini heart
  const MINI_HEART_SVG = HEART_SVG;

  function getSvgSet(): string[] {
    return type === 'heart'
      ? [HEART_SVG, HEART_OUTLINE_SVG, SPARKLE_SVG, MINI_HEART_SVG, DOT_SVG, DIAMOND_SVG]
      : [KISS_SVG, SPARKLE_SVG, DIAMOND_SVG, DOT_SVG, HEART_SVG, MINI_HEART_SVG];
  }

  function getColorSet(): string[] {
    return type === 'heart'
      ? ['#ef4444', '#dc2626', '#f87171', '#fb923c', '#fbbf24', '#fecdd3', '#fca5a5', '#ff6b6b', '#ee5a24', '#ff4757']
      : ['#ec4899', '#f472b6', '#a855f7', '#c084fc', '#f9a8d4', '#fb7185', '#e879f9', '#f0abfc', '#ff6b9d', '#c471ed'];
  }

  function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  function spawn() {
    const svgs = getSvgSet();
    const colors = getColorSet();
    const floats: FloatParticle[] = [];
    const bursts: BurstParticle[] = [];
    const sparks: SparkleParticle[] = [];

    // ── Floating particles (rise from bottom) ──
    const floatCount = 32;
    for (let i = 0; i < floatCount; i++) {
      floats.push({
        id: _id++,
        x: rand(2, 98),
        delay: rand(0, 700),
        duration: rand(2800, 4500),
        size: rand(14, 30),
        swayAmp: rand(15, 50),
        swayFreq: rand(1.2, 3),
        opacity: rand(0.6, 1),
        rotation: rand(-30, 30),
        rotSpeed: rand(-120, 120),
        variant: Math.floor(rand(0, svgs.length)),
        color: pick(colors),
      });
    }

    // ── Burst particles (explode from center) ──
    const burstCount = 18;
    for (let i = 0; i < burstCount; i++) {
      const angle = (i / burstCount) * Math.PI * 2 + rand(-0.3, 0.3);
      const speed = rand(80, 220);
      bursts.push({
        id: _id++,
        x: 50,
        y: 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(40, 120),
        size: rand(8, 18),
        delay: rand(0, 200),
        duration: rand(600, 1200),
        rotation: rand(0, 360),
        rotSpeed: rand(-360, 360),
        variant: Math.floor(rand(0, svgs.length)),
        color: pick(colors),
        gravity: 280,
      });
    }

    // ── Sparkle glitter ──
    const sparkCount = 20;
    for (let i = 0; i < sparkCount; i++) {
      sparks.push({
        id: _id++,
        x: rand(5, 95),
        y: rand(5, 80),
        size: rand(4, 10),
        delay: rand(50, 1000),
        duration: rand(500, 1000),
        rotation: rand(0, 45),
      });
    }

    floaters = floats;
    bursters = bursts;
    sparkles = sparks;
    active = true;
    setTimeout(() => { active = false; floaters = []; bursters = []; sparkles = []; }, 5500);
  }
</script>

{#if active}
  <div class="particle-overlay">
    <!-- Sparkle glitter layer -->
    {#each sparkles as sp (sp.id)}
      <div
        class="sparkle"
        style="
          left: {sp.x}%;
          top: {sp.y}%;
          width: {sp.size}px;
          height: {sp.size}px;
          transform: rotate({sp.rotation}deg);
          animation-delay: {sp.delay}ms;
          animation-duration: {sp.duration}ms;
        "
      >
        {@html SPARKLE_SVG}
      </div>
    {/each}

    <!-- Burst particles (explode outward) -->
    {#each bursters as b (b.id)}
      <div
        class="burst-particle"
        style="
          left: {b.x}%;
          top: {b.y}%;
          width: {b.size}px;
          height: {b.size}px;
          color: {b.color};
          --vx: {b.vx}px;
          --vy: {b.vy}px;
          --grav: {b.gravity}px;
          --rot-end: {b.rotation + b.rotSpeed}deg;
          animation-delay: {b.delay}ms;
          animation-duration: {b.duration}ms;
        "
      >
        {@html getSvgSet()[b.variant]}
      </div>
    {/each}

    <!-- Floating particles (rise upward with sway) -->
    {#each floaters as f (f.id)}
      <div
        class="float-particle"
        style="
          left: {f.x}%;
          width: {f.size}px;
          height: {f.size}px;
          color: {f.color};
          --sway: {f.swayAmp}px;
          --sway-freq: {f.swayFreq};
          --rot: {f.rotation}deg;
          --rot-speed: {f.rotSpeed}deg;
          animation-delay: {f.delay}ms;
          animation-duration: {f.duration}ms;
        "
      >
        {@html getSvgSet()[f.variant]}
      </div>
    {/each}
  </div>
{/if}

<style>
  .particle-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    pointer-events: none;
    overflow: hidden;
  }

  /* ── Floating particles: rise from bottom with sinusoidal sway ── */
  .float-particle {
    position: absolute;
    top: -40px;
    opacity: 0;
    animation-name: floatUp;
    animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
    animation-fill-mode: forwards;
    animation-iteration-count: 1;
    will-change: transform, opacity;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15));
  }

  @keyframes floatUp {
    0% {
      transform:
        translateY(0)
        translateX(0)
        rotate(var(--rot))
        scale(0.3);
      opacity: 0;
    }
    4% {
      transform:
        translateY(3vh)
        translateX(calc(var(--sway) * 0.1))
        rotate(calc(var(--rot) + 5deg))
        scale(1);
      opacity: 1;
    }
    12% {
      transform:
        translateY(12vh)
        translateX(calc(var(--sway) * -0.3))
        rotate(calc(var(--rot) - 8deg))
        scale(1.05);
    }
    25% {
      transform:
        translateY(28vh)
        translateX(calc(var(--sway) * 0.25))
        rotate(calc(var(--rot) + 12deg))
        scale(1);
      opacity: 0.9;
    }
    40% {
      transform:
        translateY(42vh)
        translateX(calc(var(--sway) * -0.18))
        rotate(calc(var(--rot) - 6deg))
        scale(0.95);
      opacity: 0.75;
    }
    60% {
      transform:
        translateY(62vh)
        translateX(calc(var(--sway) * 0.12))
        rotate(calc(var(--rot) + 4deg))
        scale(0.85);
      opacity: 0.5;
    }
    80% {
      opacity: 0.2;
    }
    100% {
      transform:
        translateY(115vh)
        translateX(0)
        rotate(var(--rot))
        scale(0.6);
      opacity: 0;
    }
  }

  /* ── Burst particles: explode outward from center ── */
  .burst-particle {
    position: absolute;
    opacity: 0;
    animation-name: burstOut;
    animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
    animation-fill-mode: forwards;
    animation-iteration-count: 1;
    will-change: transform, opacity;
    filter: drop-shadow(0 1px 4px rgba(0, 0, 0, 0.2));
  }

  @keyframes burstOut {
    0% {
      transform:
        translate(0, 0)
        scale(0.2)
        rotate(0deg);
      opacity: 0;
    }
    15% {
      opacity: 1;
      transform:
        translate(calc(var(--vx) * 0.4), calc(var(--vy) * 0.3))
        scale(1.1)
        rotate(45deg);
    }
    40% {
      opacity: 0.85;
      transform:
        translate(calc(var(--vx) * 0.7), calc(var(--vy) * 0.6 + var(--grav) * 0.04))
        scale(1)
        rotate(90deg);
    }
    100% {
      opacity: 0;
      transform:
        translate(var(--vx), calc(var(--vy) + var(--grav) * 0.12))
        scale(0.3)
        rotate(var(--rot-end));
    }
  }

  /* ── Sparkle glitter ── */
  .sparkle {
    position: absolute;
    opacity: 0;
    color: rgba(255, 255, 255, 0.9);
    animation-name: glitterPop;
    animation-timing-function: ease-out;
    animation-fill-mode: forwards;
    animation-iteration-count: 1;
    will-change: transform, opacity;
    pointer-events: none;
  }

  @keyframes glitterPop {
    0% {
      transform: scale(0) rotate(0deg);
      opacity: 0;
    }
    20% {
      transform: scale(1.6) rotate(45deg);
      opacity: 1;
    }
    50% {
      transform: scale(0.9) rotate(90deg);
      opacity: 0.7;
    }
    100% {
      transform: scale(0) rotate(135deg);
      opacity: 0;
    }
  }
</style>