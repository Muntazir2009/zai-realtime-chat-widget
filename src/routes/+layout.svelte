<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import ToastContainer from '$lib/components/ui/ToastContainer.svelte';

  let { children }: { children: any } = $props();
  let mounted = $state(false);

  onMount(() => {
    mounted = true;
  });
</script>

{#if mounted || !browser}
  {@render children()}
{/if}

<ToastContainer />