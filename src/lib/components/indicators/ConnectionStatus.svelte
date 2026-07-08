<script lang="ts">
  import { networkManager } from '$lib/managers/NetworkManager.svelte';
  import { Wifi, WifiOff, Moon } from 'lucide-svelte';

  let state = $derived(networkManager.connectionState);

  let barColor = $derived(
    state === 'dormant'
      ? 'var(--color-warning)'
      : state === 'disconnected'
        ? 'var(--color-danger)'
        : 'transparent'
  );

  let label = $derived(
    state === 'dormant'
      ? 'Syncing...'
      : state === 'disconnected'
        ? 'Reconnecting...'
        : ''
  );

  let iconComponent = $derived(
    state === 'dormant'
      ? Moon
      : state === 'disconnected'
        ? WifiOff
        : null
  );
</script>

{#if state !== 'active' && iconComponent}
  <div class="conn-bar animate-fade-in safe-top" style="--bar-color: {barColor};">
    <div class="conn-bar__accent"></div>
    <span class="conn-bar__text">
      {@const Icon = iconComponent}
      <Icon size={12} />
      {label}
    </span>
  </div>
{/if}

<style>
  .conn-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
  }

  .conn-bar__accent {
    width: 100%;
    height: 3px;
    background: var(--bar-color);
  }

  .conn-bar__text {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--bar-color);
    padding: 3px 0 0;
  }
</style>