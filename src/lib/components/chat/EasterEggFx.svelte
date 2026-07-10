<script lang="ts">
  interface Props {
    trigger: number;
  }

  let { trigger }: Props = $props();
  let hearts = $state<Array<{id: number; x: number; y: number; size: number; color: string; delay: number; duration: number; rotation: number}>>([]);
  let nextId = 0;

  const heartColors = ['#ef4444', '#f87171', '#fb923c', '#ec4899', '#f472b6', '#f43f5e', '#e11d48', '#be123c'];

  $effect(() => {
    if (trigger <= 0) return;

    const newHearts: typeof hearts = [];
    const count = 25;

    for (let i = 0; i < count; i++) {
      newHearts.push({
        id: nextId++,
        x: 15 + Math.random() * 70, // % from left
        y: 50 + Math.random() * 30,  // % from top (start in lower half)
        size: 14 + Math.random() * 22,
        color: heartColors[Math.floor(Math.random() * heartColors.length)],
        delay: Math.random() * 400,
        duration: 1200 + Math.random() * 800,
        rotation: -30 + Math.random() * 60,
      });
    }

    // Staggered second wave
    setTimeout(() => {
      const wave2: typeof hearts = [];
      for (let i = 0; i < 15; i++) {
        wave2.push({
          id: nextId++,
          x: 10 + Math.random() * 80,
          y: 55 + Math.random() * 25,
          size: 10 + Math.random() * 16,
          color: heartColors[Math.floor(Math.random() * heartColors.length)],
          delay: Math.random() * 200,
          duration: 1000 + Math.random() * 600,
          rotation: -40 + Math.random() * 80,
        });
      }
      hearts = [...hearts, ...wave2];
    }, 300);

    hearts = newHearts;

    // Cleanup after animation
    setTimeout(() => {
      hearts = [];
    }, 2500);
  });
</script>

{#if hearts.length > 0}
  <div class="heart-container" aria-hidden="true">
    {#each hearts as heart (heart.id)}
      <div
        class="heart-float"
        style="
          left: {heart.x}%;
          bottom: {100 - heart.y}%;
          --heart-size: {heart.size}px;
          --heart-color: {heart.color};
          --heart-delay: {heart.delay}ms;
          --heart-duration: {heart.duration}ms;
          --heart-rotation: {heart.rotation}deg;
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
    {/each}
  </div>
{/if}

<style>
  .heart-container {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 200;
    overflow: hidden;
  }

  .heart-float {
    position: absolute;
    width: var(--heart-size);
    height: var(--heart-size);
    opacity: 0;
    animation: heartRise var(--heart-duration) var(--heart-delay) cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15));
    transform: rotate(var(--heart-rotation));
  }

  @keyframes heartRise {
    0% {
      opacity: 0;
      transform: rotate(var(--heart-rotation)) scale(0.3) translateY(0);
    }
    15% {
      opacity: 1;
      transform: rotate(var(--heart-rotation)) scale(1.1) translateY(-20px);
    }
    30% {
      transform: rotate(var(--heart-rotation)) scale(1) translateY(-40px);
    }
    100% {
      opacity: 0;
      transform: rotate(calc(var(--heart-rotation) + 15deg)) scale(0.6) translateY(-280px);
    }
  }
</style>