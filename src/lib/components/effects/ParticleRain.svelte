<script lang="ts">
  interface Props {
    type: 'heart' | 'kiss';
    trigger: boolean;
  }

  let { type, trigger }: Props = $props();

  interface Particle {
    id: number;
    x: number;
    delay: number;
    duration: number;
    size: number;
    sway: number;
    swayDuration: number;
    opacity: number;
    rotation: number;
    scaleStart: number;
    scalePeak: number;
    scaleEnd: number;
    hue: number;
  }

  let particles = $state<Particle[]>([]);
  let particleId = 0;
  let animating = $state(false);
  let sparkleParticles = $state<Array<{id: number; x: number; y: number; size: number; delay: number; duration: number}>>([]);
  let sparkleId = 0;

  $effect(() => { if (trigger) spawnBurst(); });

  function spawnBurst() {
    const isHeart = type === 'heart';
    const count = isHeart ? 28 : 20;
    const newParticles: Particle[] = [];
    const sparkles: typeof sparkleParticles = [];

    for (let i = 0; i < count; i++) {
      const hueShift = isHeart
        ? -10 + Math.random() * 30
        : 300 + Math.random() * 60;

      newParticles.push({
        id: particleId++,
        x: 5 + Math.random() * 90,
        delay: Math.random() * 600,
        duration: 2400 + Math.random() * 2000,
        size: 16 + Math.random() * 22,
        sway: 20 + Math.random() * 40,
        swayDuration: 1.5 + Math.random() * 2.5,
        opacity: 0.7 + Math.random() * 0.3,
        rotation: -25 + Math.random() * 50,
        scaleStart: 0.2 + Math.random() * 0.2,
        scalePeak: 0.95 + Math.random() * 0.2,
        scaleEnd: 0.5 + Math.random() * 0.4,
        hue: hueShift,
      });
    }

    // Add sparkle trail particles
    for (let i = 0; i < 12; i++) {
      sparkles.push({
        id: sparkleId++,
        x: 10 + Math.random() * 80,
        y: 10 + Math.random() * 70,
        size: 3 + Math.random() * 5,
        delay: 100 + Math.random() * 800,
        duration: 800 + Math.random() * 600,
      });
    }

    particles = newParticles;
    sparkleParticles = sparkles;
    animating = true;
    setTimeout(() => { animating = false; particles = []; sparkleParticles = []; }, 5000);
  }

  const symbol = $derived(type === 'heart' ? '❤️' : '💋');
  const filterHue = $derived(type === 'heart'
    ? 'hue-rotate(0deg) saturate(1.2)'
    : 'hue-rotate(0deg) saturate(1.1)');
</script>

{#if animating}
  <div class="particle-overlay" style="z-index: 100; overflow: hidden; pointer-events: none;">
    <!-- Sparkle trail -->
    {#each sparkleParticles as sp (sp.id)}
      <div
        class="sparkle"
        style="
          left: {sp.x}%;
          top: {sp.y}%;
          width: {sp.size}px;
          height: {sp.size}px;
          animation-delay: {sp.delay}ms;
          animation-duration: {sp.duration}ms;
        "
      ></div>
    {/each}

    <!-- Main particles -->
    {#each particles as p (p.id)}
      <div
        class="particle"
        style="
          left: {p.x}%;
          --sway: {p.sway}px;
          --sway-dur: {p.swayDuration}s;
          --rot: {p.rotation}deg;
          --scale-start: {p.scaleStart};
          --scale-peak: {p.scalePeak};
          --scale-end: {p.scaleEnd};
          font-size: {p.size}px;
          opacity: {p.opacity};
          filter: {filterHue} drop-shadow(0 2px 8px rgba(0,0,0,0.2));
          animation-delay: {p.delay}ms;
          animation-duration: {p.duration}ms;
        "
      >
        {symbol}
      </div>
    {/each}
  </div>
{/if}

<style>
  .particle-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .particle {
    position: absolute;
    top: -30px;
    animation-name: particleDrift;
    animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
    animation-fill-mode: forwards;
    animation-iteration-count: 1;
    will-change: transform, opacity;
  }

  @keyframes particleDrift {
    0% {
      transform: translateY(0) translateX(0) rotate(0deg) scale(var(--scale-start));
      opacity: 0;
    }
    5% {
      opacity: 1;
      transform: translateY(4vh) translateX(calc(var(--sway) * 0.15)) rotate(calc(var(--rot) * 0.3)) scale(var(--scale-peak));
    }
    15% {
      transform: translateY(15vh) translateX(calc(var(--sway) * -0.2)) rotate(calc(var(--rot) * -0.4)) scale(var(--scale-peak));
    }
    30% {
      transform: translateY(30vh) translateX(calc(var(--sway) * 0.18)) rotate(calc(var(--rot) * 0.25)) scale(calc(var(--scale-peak) * 0.95));
      opacity: 0.85;
    }
    50% {
      transform: translateY(50vh) translateX(calc(var(--sway) * -0.12)) rotate(calc(var(--rot) * -0.15)) scale(0.9);
      opacity: 0.7;
    }
    70% {
      transform: translateY(70vh) translateX(calc(var(--sway) * 0.08)) rotate(calc(var(--rot) * 0.1)) scale(var(--scale-end));
      opacity: 0.4;
    }
    85% {
      opacity: 0.15;
    }
    100% {
      transform: translateY(110vh) translateX(0) rotate(var(--rot)) scale(var(--scale-end));
      opacity: 0;
    }
  }

  .sparkle {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.9) 0%, rgba(255, 200, 200, 0.4) 50%, transparent 100%);
    animation-name: sparklePulse;
    animation-timing-function: ease-out;
    animation-fill-mode: forwards;
    animation-iteration-count: 1;
    will-change: transform, opacity;
    pointer-events: none;
  }

  @keyframes sparklePulse {
    0% {
      transform: scale(0) rotate(0deg);
      opacity: 0;
    }
    30% {
      transform: scale(1.5) rotate(90deg);
      opacity: 1;
    }
    60% {
      transform: scale(0.8) rotate(180deg);
      opacity: 0.6;
    }
    100% {
      transform: scale(0) rotate(360deg);
      opacity: 0;
    }
  }
</style>