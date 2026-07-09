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
  }

  let particles = $state<Particle[]>([]);
  let particleId = 0;
  let animating = $state(false);

  $effect(() => { if (trigger) spawnBurst(); });

  function spawnBurst() {
    const count = type === 'heart' ? 24 : 18;
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: particleId++,
        x: 8 + Math.random() * 84,
        delay: Math.random() * 500,
        duration: 2200 + Math.random() * 1800,
        size: 14 + Math.random() * 18,
        sway: 15 + Math.random() * 35,
        swayDuration: 1.5 + Math.random() * 2.5,
        opacity: 0.6 + Math.random() * 0.4,
        rotation: -20 + Math.random() * 40,
      });
    }
    particles = newParticles;
    animating = true;
    setTimeout(() => { animating = false; particles = []; }, 4200);
  }

  const symbol = $derived(type === 'heart' ? '❤️' : '💋');
</script>

{#if animating}
  <div class="particle-overlay" style="z-index: 100; overflow: hidden; pointer-events: none;">
    {#each particles as p (p.id)}
      <div
        class="particle"
        style="
          left: {p.x}%;
          --sway: {p.sway}px;
          --sway-dur: {p.swayDuration}s;
          --rot: {p.rotation}deg;
          font-size: {p.size}px;
          opacity: {p.opacity};
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
    filter: drop-shadow(0 2px 6px rgba(0,0,0,0.15));
  }

  @keyframes particleDrift {
    0% {
      transform: translateY(0) translateX(0) rotate(0deg) scale(0.4);
      opacity: 0;
    }
    6% {
      opacity: var(--particle-opacity, 0.9);
      transform: translateY(6vh) translateX(calc(var(--sway) * 0.2)) rotate(var(--rot)) scale(1);
    }
    20% {
      transform: translateY(20vh) translateX(calc(var(--sway) * -0.25)) rotate(calc(var(--rot) * -0.5)) scale(1.05);
    }
    40% {
      transform: translateY(40vh) translateX(calc(var(--sway) * 0.15)) rotate(calc(var(--rot) * 0.3)) scale(1);
      opacity: 0.75;
    }
    65% {
      transform: translateY(65vh) translateX(calc(var(--sway) * -0.1)) rotate(calc(var(--rot) * -0.2)) scale(0.95);
    }
    85% {
      opacity: 0.3;
    }
    100% {
      transform: translateY(105vh) translateX(0) rotate(var(--rot)) scale(0.8);
      opacity: 0;
    }
  }
</style>