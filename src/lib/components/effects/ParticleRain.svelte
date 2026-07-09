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
  }

  let particles = $state<Particle[]>([]);
  let particleId = 0;
  let animating = $state(false);

  $effect(() => { if (trigger) spawnBurst(); });

  function spawnBurst() {
    const count = type === 'heart' ? 20 : 16;
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: particleId++,
        x: 10 + Math.random() * 80,
        delay: Math.random() * 600,
        duration: 2500 + Math.random() * 1500,
        size: 16 + Math.random() * 16,
        sway: 20 + Math.random() * 30,
        swayDuration: 2 + Math.random() * 2,
        opacity: 0.7 + Math.random() * 0.3,
      });
    }
    particles = newParticles;
    animating = true;
    setTimeout(() => { animating = false; particles = []; }, 4500);
  }

  const symbol = $derived(type === 'heart' ? '❤️' : '💋');
</script>

{#if animating}
  <div class="particle-overlay" style="z-index: 100; overflow: hidden;">
    {#each particles as p (p.id)}
      <div
        class="particle"
        style="
          left: {p.x}%;
          --sway: {p.sway}px;
          --sway-dur: {p.swayDuration}s;
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
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.12));
  }

  @keyframes particleDrift {
    0% {
      transform: translateY(0) translateX(0) rotate(0deg) scale(0.6);
      opacity: 0;
    }
    8% {
      opacity: var(--particle-opacity, 0.85);
      transform: translateY(8vh) translateX(calc(var(--sway) * 0.3)) rotate(10deg) scale(1);
    }
    25% {
      transform: translateY(25vh) translateX(calc(var(--sway) * -0.2)) rotate(-8deg) scale(1.05);
    }
    50% {
      transform: translateY(50vh) translateX(calc(var(--sway) * 0.15)) rotate(5deg) scale(1);
      opacity: 0.7;
    }
    75% {
      transform: translateY(75vh) translateX(calc(var(--sway) * -0.1)) rotate(-3deg) scale(0.9);
    }
    100% {
      transform: translateY(105vh) translateX(0) rotate(8deg) scale(0.75);
      opacity: 0;
    }
  }
</style>