<script lang="ts">
  import confetti from 'canvas-confetti';

  interface Props {
    trigger: number;
  }

  let { trigger }: Props = $props();

  $effect(() => {
    if (trigger <= 0) return;
    // Trigger is incremented, so just react to the change

    // Heart burst - center of screen
    const heartColors = ['#ef4444', '#f87171', '#fb923c', '#fbbf24', '#ec4899', '#f472b6'];
    const kissColors = ['#ec4899', '#f472b6', '#a855f7', '#c084fc', '#f9a8d4', '#fb7185'];

    const colors = trigger % 2 === 1 ? heartColors : kissColors;
    const isHeart = trigger % 2 === 1;

    // Center burst
    confetti({
      particleCount: 60,
      spread: 80,
      origin: { y: 0.6, x: 0.5 },
      colors,
      startVelocity: 35,
      gravity: 0.8,
      ticks: 120,
      shapes: isHeart ? ['circle'] : ['circle'],
      scalar: 1.2,
    });

    // Side bursts with delay
    setTimeout(() => {
      confetti({
        particleCount: 30,
        angle: 60,
        spread: 55,
        origin: { x: 0.2, y: 0.65 },
        colors,
        startVelocity: 30,
        gravity: 0.9,
        ticks: 100,
        scalar: 0.9,
      });
      confetti({
        particleCount: 30,
        angle: 120,
        spread: 55,
        origin: { x: 0.8, y: 0.65 },
        colors,
        startVelocity: 30,
        gravity: 0.9,
        ticks: 100,
        scalar: 0.9,
      });
    }, 150);

    // Top shower
    setTimeout(() => {
      confetti({
        particleCount: 40,
        spread: 120,
        startVelocity: 20,
        origin: { y: 0, x: 0.5 },
        colors,
        gravity: 1.2,
        ticks: 150,
        scalar: 0.8,
      });
    }, 300);
  });
</script>

<!-- No visible markup — canvas-confetti renders to its own canvas -->
<template>
  <div aria-hidden="true"></div>
</template>