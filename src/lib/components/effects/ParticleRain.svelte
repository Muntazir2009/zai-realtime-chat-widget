<script lang="ts">
  interface Props {
    type: 'heart' | 'kiss';
    trigger: boolean;  // When true, spawn a burst of particles
  }

  let { type, trigger }: Props = $props();

  interface Particle {
    id: number;
    x: number;         // percentage 0-100
    delay: number;     // ms
    duration: number;  // ms
    size: number;      // px
    rotation: number;  // degrees
    opacity: number;
  }

  let particles = $state<Particle[]>([]);
  let particleId = 0;
  let animating = $state(false);

  $effect(() => {
    if (trigger) {
      spawnBurst();
    }
  });

  function spawnBurst() {
    const count = type === 'heart' ? 25 : 20;
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: particleId++,
        x: Math.random() * 100,
        delay: Math.random() * 800,
        duration: 2000 + Math.random() * 2000,
        size: 14 + Math.random() * 20,
        rotation: -30 + Math.random() * 60,
        opacity: 0.6 + Math.random() * 0.4,
      });
    }
    particles = newParticles;
    animating = true;

    // Clean up after animation
    setTimeout(() => {
      animating = false;
      particles = [];
    }, 4500);
  }

  const symbol = $derived(type === 'heart' ? '❤️' : '💋');
</script>

{#if animating}
  <div class="fixed inset-0 pointer-events-none" style="z-index: 100; overflow: hidden;">
    {#each particles as p (p.id)}
      <div
        class="absolute animate-particle-fall"
        style="
          left: {p.x}%;
          top: -{p.size}px;
          font-size: {p.size}px;
          opacity: {p.opacity};
          transform: rotate({p.rotation}deg);
          animation-delay: {p.delay}ms;
          animation-duration: {p.duration}ms;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
        "
      >
        {symbol}
      </div>
    {/each}
  </div>
{/if}

<style>
  @keyframes particleFall {
    0% {
      transform: translateY(0) rotate(var(--start-rotation, 0deg)) scale(0.5);
      opacity: 0;
    }
    10% {
      opacity: var(--particle-opacity, 0.8);
      transform: translateY(10vh) rotate(15deg) scale(1);
    }
    50% {
      transform: translateY(50vh) rotate(-10deg) scale(1.05);
    }
    100% {
      transform: translateY(105vh) rotate(20deg) scale(0.8);
      opacity: 0;
    }
  }

  .animate-particle-fall {
    animation-name: particleFall;
    animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
    animation-fill-mode: forwards;
    animation-iteration-count: 1;
    will-change: transform, opacity;
  }
</style>