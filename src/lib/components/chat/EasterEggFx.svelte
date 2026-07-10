<script lang="ts">
  interface Props {
    trigger: number;
  }

  let { trigger }: Props = $props();

  let hearts = $state<Array<{
    id: number; x: number; y: number; size: number; color: string;
    delay: number; duration: number; rotation: number; swayAmp: number;
    swayFreq: number; type: 'heart' | 'sparkle' | 'glow' | 'mini-heart' | 'trail';
    opacity: number;
  }>>([]);
  let nextId = 0;

  const heartColors = ['#ef4444', '#f87171', '#fb923c', '#ec4899', '#f472b6', '#f43f5e', '#e11d48', '#be123c', '#ff6b9d', '#c084fc'];
  const sparkleColors = ['#fbbf24', '#f59e0b', '#fde68a', '#fef3c7', '#fff'];

  function createHeart(x: number, y: number, type: 'heart' | 'mini-heart' | 'trail' = 'heart'): typeof hearts[0] {
    return {
      id: nextId++,
      x, y,
      size: type === 'heart' ? 16 + Math.random() * 24 :
            type === 'mini-heart' ? 8 + Math.random() * 12 :
            6 + Math.random() * 10,
      color: heartColors[Math.floor(Math.random() * heartColors.length)],
      delay: Math.random() * 350,
      duration: type === 'heart' ? 1400 + Math.random() * 900 :
               type === 'mini-heart' ? 1000 + Math.random() * 700 :
               800 + Math.random() * 500,
      rotation: -40 + Math.random() * 80,
      swayAmp: 15 + Math.random() * 35,
      swayFreq: 1.5 + Math.random() * 2.5,
      type,
      opacity: type === 'trail' ? 0.4 + Math.random() * 0.3 : 1,
    };
  }

  function createSparkle(x: number, y: number): typeof hearts[0] {
    return {
      id: nextId++, x, y,
      size: 4 + Math.random() * 10,
      color: sparkleColors[Math.floor(Math.random() * sparkleColors.length)],
      delay: Math.random() * 600,
      duration: 600 + Math.random() * 600,
      rotation: Math.random() * 360,
      swayAmp: 5 + Math.random() * 15,
      swayFreq: 2 + Math.random() * 3,
      type: 'sparkle',
      opacity: 1,
    };
  }

  function createGlow(x: number, y: number): typeof hearts[0] {
    return {
      id: nextId++, x, y,
      size: 40 + Math.random() * 60,
      color: heartColors[Math.floor(Math.random() * 4)],
      delay: Math.random() * 200,
      duration: 1000 + Math.random() * 600,
      rotation: 0,
      swayAmp: 0,
      swayFreq: 0,
      type: 'glow',
      opacity: 0.5,
    };
  }

  $effect(() => {
    if (trigger <= 0) return;

    const newHearts: typeof hearts = [];

    // Wave 1: Main hearts
    for (let i = 0; i < 20; i++) {
      newHearts.push(createHeart(10 + Math.random() * 80, 45 + Math.random() * 35, 'heart'));
    }
    // Glows behind hearts
    for (let i = 0; i < 6; i++) {
      newHearts.push(createGlow(15 + Math.random() * 70, 50 + Math.random() * 30));
    }
    // Sparkles scattered around
    for (let i = 0; i < 18; i++) {
      newHearts.push(createSparkle(5 + Math.random() * 90, 30 + Math.random() * 50));
    }

    hearts = newHearts;

    // Wave 2: Staggered second wave
    setTimeout(() => {
      const wave2: typeof hearts = [];
      for (let i = 0; i < 12; i++) {
        wave2.push(createHeart(8 + Math.random() * 84, 50 + Math.random() * 30, 'heart'));
      }
      for (let i = 0; i < 15; i++) {
        wave2.push(createHeart(5 + Math.random() * 90, 40 + Math.random() * 45, 'mini-heart'));
      }
      for (let i = 0; i < 10; i++) {
        wave2.push(createSparkle(5 + Math.random() * 90, 25 + Math.random() * 55));
      }
      // Trailing hearts
      for (let i = 0; i < 8; i++) {
        wave2.push(createHeart(10 + Math.random() * 80, 55 + Math.random() * 25, 'trail'));
      }
      hearts = [...hearts, ...wave2];
    }, 250);

    // Wave 3: Final sparkle burst
    setTimeout(() => {
      const wave3: typeof hearts = [];
      for (let i = 0; i < 10; i++) {
        wave3.push(createSparkle(10 + Math.random() * 80, 20 + Math.random() * 60));
      }
      for (let i = 0; i < 5; i++) {
        wave3.push(createHeart(20 + Math.random() * 60, 55 + Math.random() * 20, 'mini-heart'));
      }
      hearts = [...hearts, ...wave3];
    }, 600);

    // Cleanup after animation
    setTimeout(() => {
      hearts = [];
    }, 3200);
  });
</script>

{#if hearts.length > 0}
  <div class="fx-container" aria-hidden="true">
    {#each hearts as heart (heart.id)}
      {#if heart.type === 'glow'}
        <div
          class="glow-orb"
          style="
            left: {heart.x}%;
            bottom: {100 - heart.y}%;
            width: {heart.size}px;
            height: {heart.size}px;
            --glow-color: {heart.color};
            --glow-delay: {heart.delay}ms;
            --glow-duration: {heart.duration}ms;
          "
        ></div>
      {:else if heart.type === 'sparkle'}
        <div
          class="sparkle-particle"
          style="
            left: {heart.x}%;
            bottom: {100 - heart.y}%;
            --sp-size: {heart.size}px;
            --sp-color: {heart.color};
            --sp-delay: {heart.delay}ms;
            --sp-duration: {heart.duration}ms;
            --sp-rotation: {heart.rotation}deg;
            --sp-sway-amp: {heart.swayAmp}px;
            --sp-sway-freq: {heart.swayFreq};
          "
        >
          <svg viewBox="0 0 24 24" width="100%" height="100%">
            <path
              d="M12 0 L14 9 L24 12 L14 15 L12 24 L10 15 L0 12 L10 9 Z"
              fill="var(--sp-color)"
            />
          </svg>
        </div>
      {:else}
        <div
          class="heart-float heart-{heart.type}"
          style="
            left: {heart.x}%;
            bottom: {100 - heart.y}%;
            --heart-size: {heart.size}px;
            --heart-color: {heart.color};
            --heart-delay: {heart.delay}ms;
            --heart-duration: {heart.duration}ms;
            --heart-rotation: {heart.rotation}deg;
            --heart-sway-amp: {heart.swayAmp}px;
            --heart-sway-freq: {heart.swayFreq};
            --heart-opacity: {heart.opacity};
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

  /* === GLOW ORB === */
  .glow-orb {
    position: absolute;
    border-radius: 50%;
    opacity: 0;
    animation: glowPulse var(--glow-duration) var(--glow-delay) ease-out forwards;
    filter: blur(20px);
    z-index: 0;
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

  /* === SPARKLE PARTICLE === */
  .sparkle-particle {
    position: absolute;
    width: var(--sp-size);
    height: var(--sp-size);
    opacity: 0;
    animation: sparkleRise var(--sp-duration) var(--sp-delay) cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    filter: drop-shadow(0 0 3px var(--sp-color));
    z-index: 2;
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

  /* === HEART FLOAT (main + mini + trail) === */
  .heart-float {
    position: absolute;
    width: var(--heart-size);
    height: var(--heart-size);
    opacity: 0;
    animation: heartRise var(--heart-duration) var(--heart-delay) cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.15));
    transform: rotate(var(--heart-rotation));
    z-index: 1;
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
      transform: rotate(var(--heart-rotation)) scale(1.15) translateY(-15px) translateX(calc(var(--heart-sway-amp) * 0.15 * sin(0.5 * var(--heart-sway-freq))));
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
</style>